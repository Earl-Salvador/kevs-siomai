import hashlib
import json
import uuid
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from models import db, User, Product, Order, OrderItem, Sale, Queue, OfflineSyncLog, Review
from analytics import get_descriptive_analytics, get_predictive_analytics, get_prescriptive_analytics

api = Blueprint('api', __name__, url_prefix='/api')

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def _hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def _get_or_init_queue():
    q = Queue.query.first()
    if not q:
        q = Queue(current_queue_no=0, now_serving=0)
        db.session.add(q)
        db.session.commit()
    return q

def _get_queue_data():
    """Build unified queue payload including active orders and today's completed orders."""
    queue = _get_or_init_queue()
    now = datetime.now(timezone.utc)
    # Philippines local day boundary (UTC+8)
    ph_offset = timedelta(hours=8)
    now_ph = now + ph_offset
    today_start_ph = now_ph.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = (today_start_ph - ph_offset).replace(tzinfo=None)

    # Active orders (pending, accepted, preparing, ready_pickup, ready_delivery, out_for_delivery) - newest first so incoming orders display immediately
    active_orders = Order.query.filter(
        Order.status.notin_(['completed', 'delivered', 'cancelled'])
    ).order_by(Order.created_at.desc(), Order.id.desc()).all()

    # Completed and delivered orders from today
    completed_today = Order.query.filter(
        Order.status.in_(['completed', 'delivered']),
        Order.updated_at >= today_start_utc
    ).order_by(Order.updated_at.desc(), Order.id.desc()).all()

    # Also include recent completed orders for historical viewing in 'Completed' tab
    past_completed = Order.query.filter(
        Order.status.in_(['completed', 'delivered']),
        Order.updated_at < today_start_utc
    ).order_by(Order.updated_at.desc(), Order.id.desc()).limit(30).all()

    # Merge: active orders first, then completed today, then past completed
    seen_ids = set()
    all_orders = []
    for o in active_orders:
        if o.id not in seen_ids:
            all_orders.append(o)
            seen_ids.add(o.id)
    for o in completed_today:
        if o.id not in seen_ids:
            all_orders.append(o)
            seen_ids.add(o.id)
    for o in past_completed:
        if o.id not in seen_ids:
            all_orders.append(o)
            seen_ids.add(o.id)

    counts = {
        'all': len(all_orders),
        'pending': sum(1 for o in active_orders if o.status == 'pending'),
        'preparing': sum(1 for o in active_orders if o.status in ('accepted', 'preparing')),
        'ready': sum(1 for o in active_orders if o.status in ('ready_pickup', 'ready_delivery', 'out_for_delivery')),
        'completed': len(completed_today)
    }

    today_sales_q = db.session.query(db.func.sum(Sale.total_amount)).filter(
        Sale.timestamp >= today_start_utc
    ).scalar()

    low_stock = Product.query.filter(
        Product.is_active == True,
        Product.stock <= (Product.max_stock * 0.20)
    ).count()

    has_active = len(active_orders) > 0
    now_serving_ticket = queue.now_serving if has_active else 0

    stats = {
        'queue': queue.to_dict(),
        'has_active': has_active,
        'now_serving': now_serving_ticket,
        'active_orders': len(active_orders),
        'pending_orders': counts['pending'],
        'today_completed': len(completed_today),
        'today_revenue': float(today_sales_q or 0.0),
        'low_stock_alerts': low_stock
    }

    q_dict = queue.to_dict()
    q_dict['has_active'] = has_active

    return {
        'queue': q_dict,
        'orders': [o.to_dict() for o in all_orders],
        'counts': counts,
        'stats': stats,
        'total': len(all_orders),
        'timestamp': now.isoformat()
    }

def _emit_queue_update(socketio, new_order=None):
    """Broadcast updated queue state and sales updates to all connected admin clients in real time."""
    try:
        payload = _get_queue_data()
        socketio.emit('queue_updated', payload)
        if new_order:
            order_dict = new_order.to_dict() if hasattr(new_order, 'to_dict') else new_order
            socketio.emit('new_order', order_dict)
        socketio.emit('sales_updated', {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'stats': payload.get('stats', {})
        })
    except Exception as e:
        print(f"[SocketIO emit error] {e}")

def _emit_review_event(event_name, data):
    """Broadcast review events to connected clients in real time."""
    try:
        from app import socketio
        socketio.emit(event_name, data)
    except Exception as e:
        print(f"[SocketIO review emit error] {e}")

def _decrease_inventory(order):
    """Decrease product stock for each item in an order."""
    alerts = []
    for item in order.items:
        product = Product.query.get(item.product_id)
        if product:
            product.stock = max(0, product.stock - item.quantity)
            if product.stock_status in ('critical', 'out_of_stock'):
                alerts.append({
                    'product': product.name,
                    'stock': product.stock,
                    'status': product.stock_status,
                    'message': f"⚠️ {product.name} stock is critically low: {product.stock} remaining!"
                })
            elif product.stock_status == 'warning':
                alerts.append({
                    'product': product.name,
                    'stock': product.stock,
                    'status': product.stock_status,
                    'message': f"🟡 {product.name} stock is low: {product.stock} remaining."
                })
    db.session.commit()
    return alerts

def _record_sale(order):
    """Record or update a sale entry when order is completed or confirmed."""
    existing = Sale.query.filter_by(order_id=order.id).first()
    if not existing:
        sale = Sale(
            order_id=order.id,
            total_amount=float(order.total_amount or 0.0),
            payment_method=order.payment_method or 'Cash',
            timestamp=datetime.now(timezone.utc)
        )
        db.session.add(sale)
    else:
        existing.total_amount = float(order.total_amount or 0.0)
        existing.payment_method = order.payment_method or 'Cash'
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()


def _validate_delivery_coverage(order_type, delivery_address):
    """
    Ensure delivery orders are strictly restricted to Barangay Gatid, Santa Cruz, Laguna.
    Outside Gatid or outside Santa Cruz Laguna, delivery is not accepted (customer must use Store Pickup).
    """
    if str(order_type).lower() != 'delivery':
        return True, None
    if not delivery_address or not str(delivery_address).strip():
        return False, "Kailangan ng delivery address para sa delivery order."

    addr_lower = str(delivery_address).lower()
    # Accept Gatid or Batisan (sitio where Boss KEVS is located in Brgy. Gatid, Santa Cruz, Laguna)
    is_in_gatid = ('gatid' in addr_lower) or ('batisan' in addr_lower)
    if not is_in_gatid:
        return False, "Ang delivery ay para lamang sa Barangay Gatid, Santa Cruz, Laguna. Kapag wala sa Gatid, mangyaring piliin ang Store Pickup."

    return True, None


# ─────────────────────────────────────────────
# DELIVERY COVERAGE INFO
# ─────────────────────────────────────────────
@api.route('/delivery/coverage', methods=['GET'])
def get_delivery_coverage():
    """Return official store delivery coverage limits."""
    return jsonify({
        'status': 'active',
        'coverage_area': 'Barangay Gatid, Santa Cruz, Laguna',
        'hub_address': '070 Batisan, Brgy. Gatid, Santa Cruz, Laguna',
        'allowed_barangay': 'Gatid',
        'municipality': 'Santa Cruz',
        'province': 'Laguna',
        'delivery_fee': 30.0,
        'message': 'Ang delivery ay para lamang sa Barangay Gatid, Santa Cruz, Laguna. Kapag wala sa Gatid, piliin ang Store Pickup.'
    }), 200


# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────
@api.route('/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    user = User.query.filter_by(username=username).first()
    if not user or user.password_hash != _hash_password(password):
        return jsonify({'error': 'Invalid username or password.'}), 401
    return jsonify({
        'message': 'Login successful',
        'user': user.to_dict(),
        'token': f"mock-jwt-{user.id}-{uuid.uuid4().hex[:8]}"
    }), 200

@api.route('/auth/me', methods=['GET'])
def auth_me():
    user = User.query.first()
    if not user:
        return jsonify({'error': 'No admin user found'}), 404
    return jsonify({'user': user.to_dict()}), 200


# ─────────────────────────────────────────────
# QUEUE
# ─────────────────────────────────────────────
@api.route('/queue', methods=['GET'])
def get_queue():
    payload = _get_queue_data()
    return jsonify(payload), 200

@api.route('/queue/all', methods=['GET'])
def get_all_orders():
    """Get all orders including completed ones for history view."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    status_filter = request.args.get('status', '')
    query = Order.query.order_by(Order.created_at.desc())
    if status_filter:
        query = query.filter(Order.status == status_filter)
    orders = query.limit(per_page).offset((page - 1) * per_page).all()
    total = Order.query.count()
    return jsonify({'orders': [o.to_dict() for o in orders], 'total': total}), 200

@api.route('/queue/add', methods=['POST'])
def queue_add():
    """ESP32 button press or mobile app adds to queue."""
    from app import socketio
    data = request.get_json() or {}
    queue = _get_or_init_queue()
    queue.current_queue_no += 1
    queue.last_updated = datetime.now(timezone.utc)

    order_type = data.get('order_type', 'pickup')
    order_source = data.get('type', 'walk-in')
    delivery_address = data.get('delivery_address', '').strip()

    # Validate delivery coverage (Barangay Gatid, Santa Cruz, Laguna only)
    is_valid_delivery, delivery_error = _validate_delivery_coverage(order_type, delivery_address)
    if not is_valid_delivery:
        return jsonify({'error': delivery_error}), 400

    # Build order items
    items_data = data.get('items', [])
    total_amount = 0.0
    order_items_to_add = []
    for it in items_data:
        product = Product.query.get(it.get('product_id'))
        if product and product.is_active:
            qty = int(it.get('quantity', 1))
            subtotal = product.price * qty
            total_amount += subtotal
            order_items_to_add.append(OrderItem(
                product_id=product.id,
                quantity=qty,
                unit_price=product.price,
                subtotal=subtotal
            ))

    if not items_data:
        total_amount = float(data.get('total', 0.0))

    new_order = Order(
        queue_no=queue.current_queue_no,
        type=order_source,
        order_type=order_type,
        customer_name=data.get('customer_name', 'Walk-in Customer'),
        customer_phone=data.get('customer_phone', ''),
        delivery_address=data.get('delivery_address', ''),
        status='pending',
        payment_status=data.get('payment_status', 'pending'),
        payment_method=data.get('payment_method', 'Cash'),
        total_amount=total_amount,
        notes=data.get('notes', ''),
        is_offline=data.get('is_offline', False)
    )
    db.session.add(new_order)
    db.session.flush()  # get ID
    for item in order_items_to_add:
        item.order_id = new_order.id
        db.session.add(item)

    db.session.commit()
    print(f"📦 [NEW WALK-IN ORDER] Ticket #{new_order.queue_no} | {new_order.customer_name} | ₱{new_order.total_amount:.2f} ({new_order.payment_method})", flush=True)
    _emit_queue_update(socketio, new_order)

    return jsonify({
        'message': 'Order added to queue',
        'order': new_order.to_dict(),
        'queue': queue.to_dict()
    }), 201

@api.route('/queue/remove', methods=['POST'])
def queue_remove():
    """Mark order as completed and decrement now_serving."""
    from app import socketio
    data = request.get_json() or {}
    order_id = data.get('order_id')
    if not order_id:
        return jsonify({'error': 'order_id required'}), 400
    order = Order.query.get(order_id)
    if not order:
        return jsonify({'error': 'Order not found'}), 404

    order.status = 'completed'
    order.updated_at = datetime.now(timezone.utc)
    queue = _get_or_init_queue()
    if queue.now_serving < queue.current_queue_no:
        queue.now_serving += 1
    _record_sale(order)
    db.session.commit()
    print(f"✅ [ORDER COMPLETED] Order #{order.id} | Ticket #{order.queue_no} served & recorded in sales!", flush=True)
    _emit_queue_update(socketio)
    return jsonify({'message': 'Order completed and queue updated', 'order': order.to_dict()}), 200

@api.route('/queue/call-next', methods=['POST'])
def queue_call_next():
    """Advance to next order in queue, mark preparing, and notify clients."""
    from app import socketio
    queue = _get_or_init_queue()

    # Find the next order waiting in line
    next_order = Order.query.filter(
        Order.queue_no > queue.now_serving,
        Order.status.notin_(['completed', 'delivered', 'cancelled'])
    ).order_by(Order.queue_no.asc()).first()

    if not next_order:
        next_order = Order.query.filter(
            Order.status.in_(['pending', 'accepted', 'preparing'])
        ).order_by(Order.queue_no.asc()).first()

    if next_order:
        queue.now_serving = next_order.queue_no
        if next_order.status == 'pending':
            next_order.status = 'preparing'
            next_order.updated_at = datetime.now(timezone.utc)
            _decrease_inventory(next_order)
    else:
        if queue.now_serving < queue.current_queue_no:
            queue.now_serving += 1

    queue.last_updated = datetime.now(timezone.utc)
    db.session.commit()
    print(f"📢 [CALL NEXT] Now Serving Ticket #{queue.now_serving}", flush=True)
    _emit_queue_update(socketio)

    return jsonify({
        'message': f'Now calling ticket #{queue.now_serving}',
        'now_serving': queue.now_serving,
        'queue': queue.to_dict(),
        'order': next_order.to_dict() if next_order else None
    }), 200

@api.route('/queue/display', methods=['GET'])
def queue_display():
    """Endpoint for ESP32 OLED to poll current queue state."""
    queue = _get_or_init_queue()
    now_serving_order = Order.query.filter(
        Order.queue_no == queue.now_serving,
        Order.status.notin_(['completed', 'delivered', 'cancelled'])
    ).first()
    return jsonify({
        'now_serving': queue.now_serving,
        'next_queue': queue.current_queue_no,
        'now_serving_status': now_serving_order.status if now_serving_order else 'completed'
    }), 200

@api.route('/queue/reset', methods=['POST'])
def queue_reset():
    from app import socketio
    queue = _get_or_init_queue()
    queue.current_queue_no = 0
    queue.now_serving = 0
    queue.last_updated = datetime.now(timezone.utc)
    db.session.commit()
    _emit_queue_update(socketio)
    return jsonify({'message': 'Queue reset successfully', 'queue': queue.to_dict()}), 200

@api.route('/orders/clear', methods=['POST'])
def clear_all_orders():
    """Clear all orders, items, and sales from database, resetting queue to 0."""
    from app import socketio
    try:
        Sale.query.delete()
        OrderItem.query.delete()
        Order.query.delete()
        queue = _get_or_init_queue()
        queue.current_queue_no = 0
        queue.now_serving = 0
        queue.last_updated = datetime.now(timezone.utc)
        db.session.commit()
        _emit_queue_update(socketio)
        return jsonify({
            'message': 'All orders and sales database records cleared successfully.',
            'queue': queue.to_dict()
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────
# PRODUCTS / INVENTORY
# ─────────────────────────────────────────────
@api.route('/products', methods=['GET'])
def get_products():
    include_inactive = request.args.get('all', 'false').lower() == 'true'
    query = Product.query if include_inactive else Product.query.filter_by(is_active=True)
    products = query.all()

    def _cat_priority(p):
        c = (p.category or '').lower()
        if 'siomai' in c:
            return 1
        if 'drink' in c or 'beverage' in c:
            return 2
        if 'add' in c or 'sauce' in c or 'condiment' in c:
            return 3
        return 4

    products.sort(key=lambda p: (_cat_priority(p), p.id))
    return jsonify({'products': [p.to_dict() for p in products]}), 200

@api.route('/products', methods=['POST'])
def create_product():
    data = request.get_json() or {}
    is_active = data.get('is_active', True)
    if isinstance(is_active, str):
        is_active = is_active.lower() in ('true', '1', 'yes')
    else:
        is_active = bool(is_active)

    product = Product(
        name=data.get('name'),
        category=data.get('category', 'Siomai'),
        price=float(data.get('price', 0)),
        stock=int(data.get('stock', 50)),
        max_stock=int(data.get('max_stock', 100)),
        unit=data.get('unit', 'servings'),
        description=data.get('description', ''),
        image_url=data.get('image_url', ''),
        is_active=is_active
    )
    db.session.add(product)
    db.session.commit()
    return jsonify({'message': 'Product created', 'product': product.to_dict()}), 201

@api.route('/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    product = Product.query.get_or_404(product_id)
    data = request.get_json() or {}
    for field in ['name', 'category', 'price', 'stock', 'max_stock', 'unit', 'description', 'image_url', 'is_active']:
        if field in data:
            val = data[field]
            if field in ('price',): val = float(val)
            if field in ('stock', 'max_stock'): val = int(val)
            if field in ('is_active',):
                if isinstance(val, str):
                    val = val.lower() in ('true', '1', 'yes')
                else:
                    val = bool(val)
            setattr(product, field, val)
    db.session.commit()
    return jsonify({'message': 'Product updated', 'product': product.to_dict()}), 200

@api.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    product = Product.query.get_or_404(product_id)
    product.is_active = False
    db.session.commit()
    return jsonify({'message': 'Product deactivated'}), 200

@api.route('/inventory/<int:product_id>', methods=['PUT'])
def update_stock(product_id):
    product = Product.query.get_or_404(product_id)
    data = request.get_json() or {}
    if 'stock' in data:
        product.stock = max(0, int(data['stock']))
    if 'add_stock' in data:
        product.stock = max(0, product.stock + int(data['add_stock']))
    if 'adjustment' in data:
        product.stock = max(0, product.stock + int(data['adjustment']))
    if 'max_stock' in data:
        product.max_stock = max(1, int(data['max_stock']))
    db.session.commit()
    return jsonify({'message': 'Stock updated', 'product': product.to_dict()}), 200


# ─────────────────────────────────────────────
# ORDERS
# ─────────────────────────────────────────────
@api.route('/orders', methods=['GET'])
def get_orders():
    status = request.args.get('status')
    q = Order.query.order_by(Order.created_at.desc())
    if status:
        q = q.filter(Order.status == status)
    orders = q.limit(100).all()
    return jsonify({'orders': [o.to_dict() for o in orders]}), 200

@api.route('/orders', methods=['POST'])
def create_order():
    """Mobile app places order."""
    from app import socketio
    data = request.get_json() or {}
    order_type = data.get('order_type', 'pickup')
    delivery_address = data.get('delivery_address', '').strip()

    # Validate delivery coverage (Barangay Gatid, Santa Cruz, Laguna only)
    is_valid_delivery, delivery_error = _validate_delivery_coverage(order_type, delivery_address)
    if not is_valid_delivery:
        return jsonify({'error': delivery_error}), 400

    queue = _get_or_init_queue()
    queue.current_queue_no += 1
    queue.last_updated = datetime.now(timezone.utc)

    items_data = data.get('items', [])
    total_amount = 0.0
    order_items_to_add = []
    for it in items_data:
        product = Product.query.get(it.get('product_id'))
        if product and product.is_active:
            qty = int(it.get('quantity', 1))
            subtotal = product.price * qty
            total_amount += subtotal
            order_items_to_add.append(OrderItem(
                product_id=product.id,
                quantity=qty,
                unit_price=product.price,
                subtotal=subtotal
            ))

    # Add standard delivery fee for Gatid deliveries (₱30.00)
    if order_type == 'delivery':
        total_amount += 30.0

    new_order = Order(
        queue_no=queue.current_queue_no,
        type='online',
        order_type=order_type,
        customer_name=data.get('customer_name', 'Online Customer'),
        customer_phone=data.get('customer_phone', ''),
        delivery_address=delivery_address if order_type == 'delivery' else '',
        status='pending',
        payment_status='pending',
        payment_method=data.get('payment_method', 'GCash'),
        total_amount=total_amount,
        notes=data.get('notes', '')
    )
    db.session.add(new_order)
    db.session.flush()
    for item in order_items_to_add:
        item.order_id = new_order.id
        db.session.add(item)
    db.session.commit()
    print(f"📦 [NEW MOBILE ORDER] Ticket #{new_order.queue_no} | {new_order.customer_name} ({new_order.order_type}) | ₱{new_order.total_amount:.2f} ({new_order.payment_method})", flush=True)
    _emit_queue_update(socketio, new_order)
    return jsonify({'message': 'Order placed', 'order': new_order.to_dict(), 'queue': queue.to_dict()}), 201

@api.route('/orders/<int:order_id>', methods=['GET'])
def get_order(order_id):
    order = Order.query.get_or_404(order_id)
    return jsonify({'order': order.to_dict()}), 200

@api.route('/orders/<int:order_id>', methods=['PUT'])
def update_order(order_id):
    """Update order status with proper workflow transitions."""
    from app import socketio
    order = Order.query.get_or_404(order_id)
    data = request.get_json()
    new_status = data.get('status')
    stock_alerts = []

    valid_transitions = {
        'pending':          ['accepted', 'preparing', 'ready_pickup', 'completed', 'cancelled'],
        'accepted':         ['preparing', 'ready_pickup', 'completed', 'cancelled'],
        'preparing':        ['ready_pickup', 'ready_delivery', 'completed'],
        'ready_pickup':     ['completed', 'cancelled'],
        'ready_delivery':   ['out_for_delivery', 'completed'],
        'out_for_delivery': ['delivered', 'completed'],
        'delivered':        [],
        'completed':        [],
        'cancelled':        []
    }

    if new_status:
        old_status = order.status
        order.status = new_status
        order.updated_at = datetime.now(timezone.utc)

        # Decrease inventory when order moves from pending/accepted into production
        if old_status in ('pending', 'accepted') and new_status in ('preparing', 'ready_pickup', 'completed'):
            stock_alerts = _decrease_inventory(order)

        # Override payment_status if explicitly provided
        if data.get('payment_status'):
            order.payment_status = data['payment_status']

        # Mark sale & advance queue counter when order is fulfilled
        if new_status in ('completed', 'delivered'):
            queue = _get_or_init_queue()
            if queue.now_serving < order.queue_no:
                queue.now_serving = order.queue_no
            elif queue.now_serving < queue.current_queue_no:
                queue.now_serving += 1
            _record_sale(order)

    # Also update other fields
    for field in ['payment_status', 'payment_method', 'payment_reference', 'notes']:
        if field in data:
            setattr(order, field, data[field])

    if order.status in ('completed', 'delivered') or order.payment_status == 'confirmed':
        _record_sale(order)

    db.session.commit()
    print(f"🔄 [ORDER UPDATE] Order #{order.id} (Ticket #{order.queue_no}) -> Status: {order.status} | Payment: {order.payment_status}", flush=True)
    _emit_queue_update(socketio)

    return jsonify({
        'message': f'Order updated to {order.status}',
        'order': order.to_dict(),
        'stock_alerts': stock_alerts
    }), 200


# ─────────────────────────────────────────────
# PAYMENTS
# ─────────────────────────────────────────────
@api.route('/payments/gcash', methods=['POST'])
def initiate_gcash():
    """Simulate GCash payment initiation (mock PayMongo)."""
    data = request.get_json()
    order_id = data.get('order_id')
    order = Order.query.get_or_404(order_id)
    # Mock payment reference
    ref = f"GC-{uuid.uuid4().hex[:10].upper()}"
    order.payment_reference = ref
    order.payment_method = 'GCash'
    db.session.commit()
    return jsonify({
        'message': 'GCash payment initiated (mock)',
        'reference': ref,
        'checkout_url': f"http://localhost:5000/api/payments/gcash/mock-pay?ref={ref}&order_id={order_id}",
        'order_id': order_id
    }), 200

@api.route('/payments/gcash/callback', methods=['POST'])
def gcash_callback():
    """Mock GCash webhook callback from PayMongo."""
    from app import socketio
    data = request.get_json()
    reference = data.get('reference') or data.get('data', {}).get('attributes', {}).get('reference_number', '')
    order_id = data.get('order_id')
    status = data.get('status', 'paid')  # 'paid' or 'failed'

    order = None
    if order_id:
        order = Order.query.get(order_id)
    if not order and reference:
        order = Order.query.filter_by(payment_reference=reference).first()

    if not order:
        return jsonify({'error': 'Order not found'}), 404

    if status == 'paid':
        order.payment_status = 'confirmed'
        order.payment_method = 'GCash'
    else:
        order.payment_status = 'failed'

    db.session.commit()
    _emit_queue_update(socketio)
    return jsonify({'message': f'Payment {status}', 'order': order.to_dict()}), 200

@api.route('/payments/confirm/<int:order_id>', methods=['PUT'])
def confirm_payment(order_id):
    """Admin manually confirms payment (Cash or GCash)."""
    from app import socketio
    order = Order.query.get_or_404(order_id)
    data = request.get_json() or {}
    order.payment_status = 'confirmed'
    if 'payment_method' in data:
        order.payment_method = data['payment_method']
    db.session.commit()
    print(f"💰 [PAYMENT CONFIRMED] Order #{order.id} (Ticket #{order.queue_no}) payment confirmed via {order.payment_method}!", flush=True)
    _emit_queue_update(socketio)
    return jsonify({'message': 'Payment confirmed', 'order': order.to_dict()}), 200


# ─────────────────────────────────────────────
# ANALYTICS
# ─────────────────────────────────────────────
@api.route('/analytics/descriptive', methods=['GET'])
def analytics_descriptive():
    result = get_descriptive_analytics(db, Sale, Order, OrderItem, Product)
    return jsonify(result), 200

@api.route('/analytics/predictive', methods=['GET'])
def analytics_predictive():
    result = get_predictive_analytics(db, Sale, Order, OrderItem, Product)
    return jsonify(result), 200

@api.route('/analytics/prescriptive', methods=['GET'])
def analytics_prescriptive():
    result = get_prescriptive_analytics(db, Sale, Order, OrderItem, Product)
    return jsonify(result), 200


# ─────────────────────────────────────────────
# OFFLINE SYNC
# ─────────────────────────────────────────────
@api.route('/offline/sync', methods=['POST'])
def offline_sync():
    """Receive batched offline orders and sales from the Admin PWA."""
    from app import socketio
    data = request.get_json()
    batch_id = data.get('batch_id', str(uuid.uuid4()))
    orders_data = data.get('orders', [])
    source = data.get('source', 'admin_pwa')

    # Check for duplicate batch
    existing = OfflineSyncLog.query.filter_by(batch_id=batch_id).first()
    if existing:
        return jsonify({'message': 'Batch already synced', 'batch_id': batch_id, 'duplicate': True}), 200

    synced_orders = 0
    synced_sales = 0
    queue = _get_or_init_queue()

    for order_data in orders_data:
        queue.current_queue_no += 1
        raw_created_at = order_data.get('created_at')
        created_at_dt = datetime.now(timezone.utc)
        if raw_created_at:
            try:
                created_at_dt = datetime.fromisoformat(str(raw_created_at).replace('Z', '+00:00'))
            except Exception:
                created_at_dt = datetime.now(timezone.utc)

        order = Order(
            queue_no=queue.current_queue_no,
            type=order_data.get('type', 'walk-in'),
            order_type=order_data.get('order_type', 'pickup'),
            customer_name=order_data.get('customer_name', 'Offline Walk-in'),
            customer_phone=order_data.get('customer_phone', ''),
            status=order_data.get('status', 'completed'),
            payment_status=order_data.get('payment_status', 'confirmed'),
            payment_method=order_data.get('payment_method', 'Cash'),
            total_amount=float(order_data.get('total', 0)),
            notes=order_data.get('notes', '') + ' [Synced from offline]',
            is_offline=True,
            created_at=created_at_dt
        )
        db.session.add(order)
        db.session.flush()

        # Record items
        for item_data in order_data.get('items', []):
            product = Product.query.get(item_data.get('product_id'))
            if product:
                oi = OrderItem(
                    order_id=order.id,
                    product_id=product.id,
                    quantity=int(item_data.get('quantity', 1)),
                    unit_price=float(item_data.get('unit_price', product.price)),
                    subtotal=float(item_data.get('subtotal', product.price))
                )
                db.session.add(oi)

        if order_data.get('status') in ('completed', 'delivered'):
            _record_sale(order)
            synced_sales += 1

        synced_orders += 1

    queue.last_updated = datetime.now(timezone.utc)

    log = OfflineSyncLog(
        batch_id=batch_id,
        orders_synced=synced_orders,
        sales_synced=synced_sales,
        source=source
    )
    db.session.add(log)
    db.session.commit()
    _emit_queue_update(socketio)

    return jsonify({
        'message': 'Offline sync successful',
        'batch_id': batch_id,
        'orders_synced': synced_orders,
        'sales_synced': synced_sales
    }), 200


# ─────────────────────────────────────────────
# DASHBOARD / REPORTS
# ─────────────────────────────────────────────
@api.route('/dashboard/stats', methods=['GET'])
def dashboard_stats():
    """Quick stats for the dashboard header cards."""
    queue = _get_or_init_queue()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    active_orders = Order.query.filter(
        Order.status.notin_(['completed', 'delivered', 'cancelled'])
    ).count()
    pending_orders = Order.query.filter_by(status='pending').count()
    today_completed = Order.query.filter(
        Order.status.in_(['completed', 'delivered']),
        Order.updated_at >= today_start
    ).count()

    today_sales_q = db.session.query(db.func.sum(Sale.total_amount)).filter(
        Sale.timestamp >= today_start
    ).scalar()
    today_revenue = float(today_sales_q or 0.0)

    total_sales_q = db.session.query(db.func.sum(Sale.total_amount)).scalar()
    total_sales = float(total_sales_q or 0.0)

    # In case Sale has not been synced from completed orders yet
    if total_sales == 0.0:
        completed_orders_total = db.session.query(db.func.sum(Order.total_amount)).filter(
            Order.status.in_(['completed', 'delivered'])
        ).scalar()
        total_sales = float(completed_orders_total or 0.0)
        today_completed_orders_total = db.session.query(db.func.sum(Order.total_amount)).filter(
            Order.status.in_(['completed', 'delivered']),
            Order.updated_at >= today_start
        ).scalar()
        today_revenue = float(today_completed_orders_total or 0.0)

    low_stock_products = Product.query.filter(
        Product.is_active == True,
        Product.stock <= (Product.max_stock * 0.20)
    ).count()

    all_completed = Order.query.filter(Order.status.in_(['completed', 'delivered'])).count()

    return jsonify({
        'queue': queue.to_dict(),
        'active_orders': active_orders,
        'pending_orders': pending_orders,
        'today_completed': today_completed,
        'completed_orders': all_completed,
        'today_revenue': today_revenue,
        'total_sales': total_sales,
        'total_revenue': total_sales,
        'low_stock_alerts': low_stock_products
    }), 200


# ─────────────────────────────────────────────
# REVIEWS MANAGEMENT (Customer App & Admin Dashboard)
# ─────────────────────────────────────────────
@api.route('/reviews', methods=['GET'])
def get_reviews():
    """
    Get customer reviews with statistics.
    Query params:
      - include_disabled: 'true' (for admin website to view all reviews including disabled ones)
      - order_id: optional filter by order
    """
    include_disabled = request.args.get('include_disabled', 'false').lower() in ('true', '1')
    order_id = request.args.get('order_id', type=int)

    query = Review.query
    if not include_disabled:
        query = query.filter(Review.is_disabled == False)
    if order_id is not None:
        query = query.filter(Review.order_id == order_id)

    reviews = query.order_by(Review.created_at.desc()).all()

    # Calculate statistics based on available reviews
    all_active_reviews = Review.query.filter(Review.is_disabled == False).all()
    target_reviews = reviews if include_disabled else all_active_reviews
    total = len(target_reviews)
    avg_rating = round(sum(r.rating for r in target_reviews) / total, 1) if total > 0 else 0.0

    breakdown = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    for r in target_reviews:
        if r.rating in breakdown:
            breakdown[r.rating] += 1

    return jsonify({
        'reviews': [r.to_dict() for r in reviews],
        'stats': {
            'total_reviews': total,
            'average_rating': avg_rating,
            'rating_breakdown': breakdown,
            'total_all': Review.query.count(),
            'total_disabled': Review.query.filter(Review.is_disabled == True).count()
        }
    }), 200


@api.route('/reviews', methods=['POST'])
def create_review():
    """
    Create a new customer review from the mobile app.
    Rating (1-5 stars) is required.
    Comment is optional.
    """
    data = request.get_json() or {}
    rating = data.get('rating')

    if rating is None:
        return jsonify({'error': 'Rating is required (1 to 5 stars)'}), 400

    try:
        rating = int(rating)
    except (ValueError, TypeError):
        return jsonify({'error': 'Rating must be an integer between 1 and 5'}), 400

    if rating < 1 or rating > 5:
        return jsonify({'error': 'Rating must be between 1 and 5 stars'}), 400

    comment = str(data.get('comment', '')).strip()
    customer_name = str(data.get('customer_name', '')).strip() or 'Anonymous Customer'
    customer_phone = str(data.get('customer_phone', '')).strip()
    order_id = data.get('order_id')

    # Validate order_id if supplied
    if order_id:
        order = Order.query.get(order_id)
        if not order:
            order_id = None

    review = Review(
        rating=rating,
        comment=comment,
        customer_name=customer_name,
        customer_phone=customer_phone,
        order_id=order_id,
        is_disabled=False
    )

    db.session.add(review)
    db.session.commit()
    print(f"⭐ [CUSTOMER REVIEW] {customer_name} rated {rating} star(s): \"{comment}\"", flush=True)

    review_dict = review.to_dict()
    _emit_review_event('review_created', review_dict)

    return jsonify({
        'message': 'Thank you! Your review has been submitted.',
        'review': review_dict
    }), 201


@api.route('/reviews/<int:review_id>/reply', methods=['POST', 'PUT'])
def reply_to_review(review_id):
    """
    Admin replies to a customer review.
    """
    review = Review.query.get(review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    data = request.get_json() or {}
    reply_text = str(data.get('reply', '')).strip()

    review.reply = reply_text
    review.replied_at = datetime.now(timezone.utc) if reply_text else None
    db.session.commit()

    review_dict = review.to_dict()
    _emit_review_event('review_updated', review_dict)

    return jsonify({
        'message': 'Reply updated successfully',
        'review': review_dict
    }), 200


@api.route('/reviews/<int:review_id>/toggle-status', methods=['POST', 'PUT'])
def toggle_review_status(review_id):
    """
    Admin toggles or sets the disabled state of a review.
    """
    review = Review.query.get(review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    data = request.get_json() or {}
    if 'is_disabled' in data:
        review.is_disabled = bool(data['is_disabled'])
    else:
        review.is_disabled = not review.is_disabled

    db.session.commit()

    review_dict = review.to_dict()
    _emit_review_event('review_updated', review_dict)

    action_str = 'disabled' if review.is_disabled else 'enabled'
    return jsonify({
        'message': f'Review has been {action_str}',
        'review': review_dict
    }), 200


@api.route('/reviews/clear', methods=['POST', 'DELETE'])
def clear_reviews():
    """
    Clear all customer reviews from the database.
    """
    num_deleted = Review.query.delete()
    db.session.commit()

    _emit_review_event('review_updated', {'cleared': True})

    return jsonify({
        'message': f'All reviews have been cleared ({num_deleted} removed).',
        'count': num_deleted
    }), 200


@api.route('/reviews/<int:review_id>', methods=['DELETE'])
def delete_review(review_id):
    """
    Delete a single customer review.
    """
    review = Review.query.get(review_id)
    if not review:
        return jsonify({'error': 'Review not found'}), 404

    db.session.delete(review)
    db.session.commit()

    _emit_review_event('review_updated', {'deleted_id': review_id})

    return jsonify({
        'message': f'Review #{review_id} deleted successfully.',
        'review_id': review_id
    }), 200


