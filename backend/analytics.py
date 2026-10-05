import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from sklearn.linear_model import LinearRegression


def get_descriptive_analytics(db, Sale, Order, OrderItem, Product):
    """Compute descriptive analytics: sales trends, top products, peak hours, channel breakdown."""
    now = datetime.now(timezone.utc)

    sales = Sale.query.all()
    orders = Order.query.all()
    order_items = OrderItem.query.all()
    products = Product.query.filter_by(is_active=True).all()

    # --- Sales DataFrames ---
    if sales:
        sales_df = pd.DataFrame([
            {'date': s.timestamp.date(), 'amount': s.total_amount, 'method': s.payment_method}
            for s in sales
        ])
    else:
        sales_df = pd.DataFrame(columns=['date', 'amount', 'method'])

    if orders:
        orders_df = pd.DataFrame([
            {
                'id': o.id,
                'queue_no': o.queue_no,
                'type': o.type,
                'order_type': o.order_type,
                'status': o.status,
                'total': o.total_amount,
                'date': o.created_at.date() if o.created_at else now.date(),
                'hour': o.created_at.hour if o.created_at else 12,
                'payment_method': o.payment_method
            }
            for o in orders
        ])
    else:
        orders_df = pd.DataFrame(columns=['id', 'type', 'order_type', 'status', 'total', 'date', 'hour', 'payment_method'])

    if order_items:
        items_df = pd.DataFrame([
            {'order_id': i.order_id, 'product_id': i.product_id,
             'product_name': i.product.name if i.product else 'Unknown',
             'quantity': i.quantity, 'subtotal': i.subtotal}
            for i in order_items
        ])
    else:
        items_df = pd.DataFrame(columns=['order_id', 'product_id', 'product_name', 'quantity', 'subtotal'])

    # --- Daily Sales (last 30 days) ---
    today = now.date()
    daily_labels = [(today - timedelta(days=i)).isoformat() for i in range(29, -1, -1)]
    if not sales_df.empty:
        sales_df['date'] = pd.to_datetime(sales_df['date']).dt.date
        daily_grp = sales_df.groupby('date')['amount'].sum()
        daily_sales = [float(daily_grp.get(today - timedelta(days=i), 0.0)) for i in range(29, -1, -1)]
    else:
        daily_sales = [0.0] * 30

    # --- Weekly Sales (last 8 weeks) ---
    week_labels = []
    weekly_sales = []
    if not sales_df.empty:
        sales_df['date'] = pd.to_datetime(sales_df['date']).dt.date
        for w in range(7, -1, -1):
            week_start = today - timedelta(weeks=w + 1)
            week_end = today - timedelta(weeks=w)
            mask = [(d >= week_start and d < week_end) for d in sales_df['date']]
            total = float(sales_df[mask]['amount'].sum()) if any(mask) else 0.0
            weekly_sales.append(total)
            week_labels.append(week_start.strftime('Week of %b %d'))
    else:
        weekly_sales = [0.0] * 8
        week_labels = [(today - timedelta(weeks=w)).strftime('Week of %b %d') for w in range(7, -1, -1)]

    # --- Monthly Sales (last 6 months) ---
    monthly_labels = []
    monthly_sales = []
    if not sales_df.empty:
        for m in range(5, -1, -1):
            target_month = (today.replace(day=1) - timedelta(days=1)) if m > 0 else today
            if m == 0:
                year, month = today.year, today.month
            else:
                dt = today.replace(day=1)
                for _ in range(m):
                    dt = (dt.replace(day=1) - timedelta(days=1))
                year, month = dt.year, dt.month
            mask = [(d.year == year and d.month == month) for d in sales_df['date']]
            total = float(sales_df[mask]['amount'].sum()) if any(mask) else 0.0
            monthly_sales.append(total)
            monthly_labels.append(f"{datetime(year, month, 1).strftime('%b %Y')}")
    else:
        monthly_sales = [0.0] * 6
        monthly_labels = [(today - timedelta(days=30 * m)).strftime('%b %Y') for m in range(5, -1, -1)]

    # --- Order Channel Distribution ---
    if not orders_df.empty:
        total_orders = len(orders_df)
        walkin_count = int((orders_df['type'] == 'walk-in').sum())
        online_count = int((orders_df['type'] == 'online').sum())
        pickup_count = int((orders_df['order_type'] == 'pickup').sum())
        delivery_count = int((orders_df['order_type'] == 'delivery').sum())
    else:
        total_orders = walkin_count = online_count = pickup_count = delivery_count = 0

    # --- Top Products ---
    top_products = []
    if not items_df.empty:
        top_grp = items_df.groupby('product_name').agg({'quantity': 'sum', 'subtotal': 'sum'}).reset_index()
        top_grp = top_grp.sort_values('quantity', ascending=False).head(8)
        top_products = [{'name': r['product_name'], 'quantity': int(r['quantity']), 'revenue': float(r['subtotal'])}
                        for _, r in top_grp.iterrows()]

    # --- Peak Hours ---
    peak_hours = []
    if not orders_df.empty:
        hour_grp = orders_df.groupby('hour')['id'].count()
        peak_hours = [{'hour': h, 'label': f"{h:02d}:00", 'orders': int(hour_grp.get(h, 0))} for h in range(24)]
    else:
        peak_hours = [{'hour': h, 'label': f"{h:02d}:00", 'orders': 0} for h in range(24)]

    # --- Sync any completed orders missing from sales table ---
    sale_order_ids = {s.order_id for s in sales if s.order_id is not None}
    completed_orders = [o for o in orders if o.status in ('completed', 'delivered') or o.payment_status == 'confirmed']
    synced_any = False
    for o in completed_orders:
        if o.id not in sale_order_ids:
            new_s = Sale(
                order_id=o.id,
                total_amount=float(o.total_amount or 0.0),
                payment_method=o.payment_method or 'Cash',
                timestamp=o.created_at or now
            )
            db.session.add(new_s)
            sales.append(new_s)
            sale_order_ids.add(o.id)
            synced_any = True
    if synced_any:
        try:
            db.session.commit()
            if sales:
                sales_df = pd.DataFrame([
                    {'date': s.timestamp.date() if hasattr(s.timestamp, 'date') else now.date(),
                     'amount': float(s.total_amount or 0.0),
                     'method': s.payment_method}
                    for s in sales
                ])
        except Exception:
            db.session.rollback()

    # --- Summary Stats ---
    total_sales_revenue = float(sales_df['amount'].sum()) if not sales_df.empty else 0.0
    today_sales = float(sales_df[sales_df['date'] == today]['amount'].sum()) if not sales_df.empty else 0.0
    total_completed = len([o for o in orders if o.status in ('completed', 'delivered')])
    gcash_revenue = float(sales_df[sales_df['method'] == 'GCash']['amount'].sum()) if not sales_df.empty else 0.0
    cash_revenue = float(sales_df[sales_df['method'] == 'Cash']['amount'].sum()) if not sales_df.empty else 0.0

    has_data = total_sales_revenue > 0 or len(sales) > 0 or len(orders) > 0

    return {
        "has_sales_data": has_data,
        "total_sales": total_sales_revenue,
        "total_revenue": total_sales_revenue,
        "total_orders": total_orders,
        "total_completed": total_completed,
        "average_order_value": round(total_sales_revenue / total_completed, 2) if total_completed > 0 else (round(total_sales_revenue / total_orders, 2) if total_orders > 0 else 0.0),
        "top_selling_product": top_products[0] if top_products else {"name": "No sales recorded yet", "quantity": 0, "revenue": 0.0},
        "summary": {
            "total_revenue": total_sales_revenue,
            "today_sales": today_sales,
            "total_orders": total_orders,
            "total_completed": total_completed,
            "walkin_count": walkin_count,
            "online_count": online_count,
            "pickup_count": pickup_count,
            "delivery_count": delivery_count,
            "gcash_revenue": gcash_revenue,
            "cash_revenue": cash_revenue
        },
        "daily_sales": {"labels": daily_labels, "data": daily_sales},
        "weekly_sales": {"labels": week_labels, "data": weekly_sales},
        "monthly_sales": {"labels": monthly_labels, "data": monthly_sales},
        "top_products": top_products,
        "peak_hours": peak_hours,
        "channel_breakdown": {
            "type": [{"name": "Walk-in", "value": walkin_count}, {"name": "Online", "value": online_count}],
            "order_type": [{"name": "Pickup", "value": pickup_count}, {"name": "Delivery", "value": delivery_count}],
            "payment": [{"name": "Cash", "value": cash_revenue}, {"name": "GCash", "value": gcash_revenue}]
        }
    }


def get_predictive_analytics(db, Sale, Order, OrderItem, Product):
    """Compute predictive analytics: next-day sales forecast and 7-day product demand."""
    now = datetime.now(timezone.utc)
    today = now.date()

    sales = Sale.query.all()
    order_items = OrderItem.query.all()
    products = Product.query.filter_by(is_active=True).all()

    # --- Build daily sales time-series ---
    next_day_forecast = 0.0
    trend_slope = 0.0
    confidence = 0.5
    daily_forecast_labels = []
    daily_forecast_data = []

    if sales and len(sales) >= 3:
        sales_df = pd.DataFrame([{'date': s.timestamp.date(), 'amount': s.total_amount} for s in sales])
        sales_df['date'] = pd.to_datetime(sales_df['date']).dt.date
        daily_grp = sales_df.groupby('date')['amount'].sum().reset_index()
        daily_grp = daily_grp.sort_values('date')
        daily_grp['day_idx'] = range(len(daily_grp))

        X = daily_grp[['day_idx']].values
        y = daily_grp['amount'].values

        model = LinearRegression()
        model.fit(X, y)

        next_idx = len(daily_grp)
        next_day_forecast = max(0, float(model.predict([[next_idx]])[0]))
        trend_slope = float(model.coef_[0])
        # R² score as confidence
        confidence = max(0.0, min(1.0, float(model.score(X, y))))

        # 7-day forecast
        for i in range(1, 8):
            future_date = today + timedelta(days=i)
            forecast_val = max(0, float(model.predict([[next_idx + i - 1]])[0]))
            daily_forecast_labels.append(future_date.strftime('%a %b %d'))
            daily_forecast_data.append(round(forecast_val, 2))
    else:
        # Not enough data - use moving average with fallback zeros
        daily_forecast_labels = [(today + timedelta(days=i)).strftime('%a %b %d') for i in range(1, 8)]
        daily_forecast_data = [0.0] * 7

    # --- Product demand forecasts ---
    product_forecasts = []
    if order_items and len(order_items) >= 3:
        items_df = pd.DataFrame([
            {'order_id': i.order_id, 'product_id': i.product_id,
             'product_name': i.product.name if i.product else 'Unknown',
             'quantity': i.quantity,
             'date': i.order.created_at.date() if i.order and i.order.created_at else today}
            for i in order_items
        ])
        items_df['date'] = pd.to_datetime(items_df['date']).dt.date

        for product in products[:10]:  # top 10 products
            prod_df = items_df[items_df['product_id'] == product.id].copy()
            if len(prod_df) < 2:
                weekly_demand = 0
                prod_forecast = [0] * 7
            else:
                daily_qty = prod_df.groupby('date')['quantity'].sum().reset_index().sort_values('date')
                daily_qty['day_idx'] = range(len(daily_qty))
                X = daily_qty[['day_idx']].values
                y = daily_qty['quantity'].values
                m = LinearRegression()
                m.fit(X, y)
                next_i = len(daily_qty)
                prod_forecast = [max(0, int(m.predict([[next_i + j]])[0])) for j in range(7)]
                weekly_demand = sum(prod_forecast)

            product_forecasts.append({
                'product_id': product.id,
                'product_name': product.name,
                'current_stock': product.stock,
                'weekly_forecast': prod_forecast,
                'total_weekly_demand': weekly_demand,
                'days_of_stock': round(product.stock / (weekly_demand / 7), 1) if weekly_demand > 0 else 99.9
            })

    return {
        "predicted_sales": round(next_day_forecast, 2),
        "predicted_orders": max(1, int(next_day_forecast / 75.0)) if next_day_forecast > 0 else 0,
        "next_day_forecast": round(next_day_forecast, 2),
        "trend_slope": round(trend_slope, 2),
        "confidence": round(confidence, 3),
        "trend_direction": "up" if trend_slope > 0 else ("down" if trend_slope < 0 else "flat"),
        "forecast_labels": daily_forecast_labels,
        "forecast_data": daily_forecast_data,
        "product_forecasts": product_forecasts
    }


def get_prescriptive_analytics(db, Sale, Order, OrderItem, Product):
    """Generate prescriptive recommendations: preparation, restock, promotions."""
    predictive = get_predictive_analytics(db, Sale, Order, OrderItem, Product)
    products = Product.query.filter_by(is_active=True).all()

    recommendations = []
    inventory_alerts = []
    preparation_plan = []
    reorder_suggestions = []

    # --- Inventory Alerts ---
    for p in products:
        pct = p.stock_percentage
        status = p.stock_status
        if status == 'out_of_stock':
            inventory_alerts.append({
                'type': 'critical',
                'icon': '🚫',
                'product': p.name,
                'message': f"{p.name} is OUT OF STOCK. Immediate restocking required!",
                'action': f"Order at least {p.max_stock} {p.unit} immediately.",
                'priority': 'critical'
            })
        elif status == 'critical':
            inventory_alerts.append({
                'type': 'critical',
                'icon': '🔴',
                'product': p.name,
                'message': f"{p.name} stock is critically low ({p.stock}/{p.max_stock} = {pct}%).",
                'action': f"Restock to at least {p.max_stock} {p.unit} before next service.",
                'priority': 'critical'
            })
        elif status == 'warning':
            inventory_alerts.append({
                'type': 'warning',
                'icon': '🟡',
                'product': p.name,
                'message': f"{p.name} stock is getting low ({p.stock}/{p.max_stock} = {pct}%).",
                'action': f"Plan to restock soon. Current supply may run out within 1-2 days.",
                'priority': 'warning'
            })

    # --- Preparation Recommendations from forecasts ---
    for pf in predictive.get('product_forecasts', []):
        tomorrow_demand = pf['weekly_forecast'][0] if pf['weekly_forecast'] else 0
        days_of_stock = pf['days_of_stock']

        if tomorrow_demand > 0:
            # Suggest prep buffer of 20% above forecast
            prep_qty = int(tomorrow_demand * 1.2)
            preparation_plan.append({
                'type': 'preparation',
                'icon': '🍤',
                'product': pf['product_name'],
                'message': f"Prepare approximately {prep_qty} servings of {pf['product_name']} for tomorrow.",
                'action': f"Forecast demand: {tomorrow_demand} servings (+20% buffer = {prep_qty}).",
                'priority': 'info'
            })

        # Reorder if days_of_stock < 3
        if 0 < days_of_stock < 3:
            product_obj = next((p for p in products if p.name == pf['product_name']), None)
            if product_obj:
                reorder_qty = max(product_obj.max_stock - product_obj.stock, int(pf.get('total_weekly_demand', 20)))
                reorder_suggestions.append({
                    'type': 'reorder',
                    'icon': '📦',
                    'product': pf['product_name'],
                    'message': f"Reorder {reorder_qty} {product_obj.unit} of {pf['product_name']}.",
                    'action': f"Current stock covers only {days_of_stock} days of projected demand.",
                    'priority': 'warning'
                })

    # --- Peak Hour Preparation Plan ---
    peak_schedule = [
        {'time': '07:00-09:00', 'label': 'Morning Rush', 'tip': 'Pre-steam siomai batches; have soy-calamansi sauce prepped.'},
        {'time': '11:30-13:30', 'label': 'Lunch Peak', 'tip': 'Highest demand window. Double batch preparation. Assign extra staff.'},
        {'time': '17:00-19:00', 'label': 'Afternoon/Merienda', 'tip': 'Moderate demand. Prepare fried dumplings ahead.'},
        {'time': '19:00-21:00', 'label': 'Dinner Peak', 'tip': 'Second highest demand. Ensure delivery riders are available.'}
    ]

    # --- Combine all recommendations ---
    recommendations = inventory_alerts + reorder_suggestions + preparation_plan

    return {
        "recommendations": recommendations,
        "inventory_alerts": inventory_alerts,
        "preparation_plan": preparation_plan,
        "reorder_suggestions": reorder_suggestions,
        "peak_schedule": peak_schedule,
        "summary": {
            "total_recommendations": len(recommendations),
            "critical_count": len([r for r in recommendations if r.get('priority') == 'critical']),
            "warning_count": len([r for r in recommendations if r.get('priority') == 'warning']),
            "info_count": len([r for r in recommendations if r.get('priority') == 'info'])
        }
    }
