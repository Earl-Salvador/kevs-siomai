from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120), default="Kevin Bernardino")
    role = db.Column(db.String(50), default="admin") # 'admin', 'staff'
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'full_name': self.full_name,
            'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Product(db.Model):
    __tablename__ = 'products'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(80), default="Siomai") # Siomai, Dumplings, Sauces, Drinks, Rice Meals
    price = db.Column(db.Float, nullable=False)
    stock = db.Column(db.Integer, default=50, nullable=False)
    max_stock = db.Column(db.Integer, default=100, nullable=False)
    unit = db.Column(db.String(20), default="servings") # servings, pcs, bottles, packs
    description = db.Column(db.String(255), default="")
    image_url = db.Column(db.String(255), default="")
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    items = db.relationship('OrderItem', backref='product', lazy=True)

    @property
    def stock_percentage(self):
        if self.max_stock <= 0:
            return 0
        return round((self.stock / self.max_stock) * 100, 1)

    @property
    def stock_status(self):
        pct = self.stock_percentage
        if self.stock <= 0:
            return 'out_of_stock'
        elif pct <= 10.0:
            return 'critical' # <= 10%
        elif pct <= 20.0:
            return 'warning' # <= 20%
        return 'available'

    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.id,
            'name': self.name,
            'category': self.category,
            'price': self.price,
            'stock': self.stock,
            'max_stock': self.max_stock,
            'min_stock': max(10, int(self.max_stock * 0.2)),
            'unit': self.unit,
            'stock_percentage': self.stock_percentage,
            'stock_status': self.stock_status,
            'status': 'available' if self.stock > 0 else 'out_of_stock',
            'description': self.description,
            'image_url': self.image_url,
            'is_active': self.is_active
        }


class Order(db.Model):
    __tablename__ = 'orders'

    id = db.Column(db.Integer, primary_key=True)
    queue_no = db.Column(db.Integer, nullable=False, index=True)
    type = db.Column(db.String(20), nullable=False, default="walk-in") # 'walk-in', 'online'
    order_type = db.Column(db.String(20), nullable=False, default="pickup") # 'pickup', 'delivery'
    customer_id = db.Column(db.Integer, nullable=True)
    customer_name = db.Column(db.String(120), default="Walk-in Customer")
    customer_phone = db.Column(db.String(50), default="")
    delivery_address = db.Column(db.Text, default="")
    status = db.Column(db.String(30), default="pending", index=True)
    # Status progression:
    # Walk-in: pending -> accepted -> preparing -> ready_pickup -> completed
    # Online Pickup: pending -> accepted -> preparing -> ready_pickup -> completed
    # Online Delivery: pending -> accepted -> preparing -> ready_delivery -> out_for_delivery -> delivered
    payment_status = db.Column(db.String(30), default="pending", index=True) # 'pending', 'confirmed', 'failed'
    payment_method = db.Column(db.String(30), default="Cash") # 'Cash', 'GCash'
    payment_reference = db.Column(db.String(100), default="")
    total_amount = db.Column(db.Float, default=0.0)
    notes = db.Column(db.Text, default="")
    is_offline = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    items = db.relationship('OrderItem', backref='order', lazy=True, cascade="all, delete-orphan")
    sales = db.relationship('Sale', backref='order', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'order_id': self.id,
            'order_number': str(self.id),
            'queue_no': self.queue_no,
            'queue_number': self.queue_no,
            'type': self.type,
            'order_type': self.order_type,
            'customer_id': self.customer_id,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'delivery_address': self.delivery_address,
            'status': self.status,
            'payment_status': self.payment_status,
            'payment_method': self.payment_method,
            'payment_reference': self.payment_reference,
            'total': self.total_amount,
            'total_amount': self.total_amount,
            'notes': self.notes,
            'is_offline': self.is_offline,
            'items': [item.to_dict() for item in self.items],
            'timestamp': self.created_at.isoformat() if self.created_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'date_display': self.created_at.strftime('%b %d, %Y') if self.created_at else 'N/A',
            'time_display': self.created_at.strftime('%I:%M %p') if self.created_at else 'N/A',
            'formatted_date': self.created_at.strftime('%b %d, %Y · %I:%M %p') if self.created_at else 'N/A'
        }


class OrderItem(db.Model):
    __tablename__ = 'order_items'

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    unit_price = db.Column(db.Float, nullable=False, default=0.0)
    subtotal = db.Column(db.Float, nullable=False, default=0.0)

    def to_dict(self):
        return {
            'id': self.id,
            'order_id': self.order_id,
            'product_id': self.product_id,
            'product_name': self.product.name if self.product else "Unknown Product",
            'image_url': (self.product.image_url if self.product and self.product.image_url else ""),
            'quantity': self.quantity,
            'qty': self.quantity,
            'unit_price': self.unit_price,
            'subtotal': self.subtotal
        }


class Sale(db.Model):
    __tablename__ = 'sales'

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=True)
    total_amount = db.Column(db.Float, nullable=False, default=0.0)
    payment_method = db.Column(db.String(30), default="Cash") # 'Cash', 'GCash'
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'order_id': self.order_id,
            'total_amount': self.total_amount,
            'payment_method': self.payment_method,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }


class Queue(db.Model):
    __tablename__ = 'queue'

    id = db.Column(db.Integer, primary_key=True)
    current_queue_no = db.Column(db.Integer, default=0, nullable=False)
    now_serving = db.Column(db.Integer, default=0, nullable=False)
    last_updated = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'current_queue_no': self.current_queue_no,
            'current_queue': self.current_queue_no,
            'now_serving': self.now_serving,
            'now_serving_number': self.now_serving,
            'last_updated': self.last_updated.isoformat() if self.last_updated else None
        }


class OfflineSyncLog(db.Model):
    __tablename__ = 'offline_sync_logs'

    id = db.Column(db.Integer, primary_key=True)
    batch_id = db.Column(db.String(100), nullable=False)
    orders_synced = db.Column(db.Integer, default=0)
    sales_synced = db.Column(db.Integer, default=0)
    source = db.Column(db.String(50), default="admin_pwa")
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'batch_id': self.batch_id,
            'orders_synced': self.orders_synced,
            'sales_synced': self.sales_synced,
            'source': self.source,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }


class Review(db.Model):
    __tablename__ = 'reviews'

    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(120), default="Anonymous Customer")
    customer_phone = db.Column(db.String(50), default="")
    rating = db.Column(db.Integer, nullable=False) # 1 to 5
    comment = db.Column(db.Text, default="")
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=True)
    reply = db.Column(db.Text, nullable=True, default="")
    replied_at = db.Column(db.DateTime, nullable=True)
    is_disabled = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    order = db.relationship('Order', backref=db.backref('reviews', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'customer_name': self.customer_name or 'Anonymous Customer',
            'customer_phone': self.customer_phone or '',
            'rating': self.rating,
            'comment': self.comment or '',
            'order_id': self.order_id,
            'reply': self.reply or '',
            'replied_at': self.replied_at.isoformat() if self.replied_at else None,
            'is_disabled': bool(self.is_disabled),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'formatted_date': self.created_at.strftime('%b %d, %Y · %I:%M %p') if self.created_at else 'N/A'
        }

