import os
import sys
import threading
import time
from flask import Flask, send_from_directory, request, Response
from flask_cors import CORS
from flask_socketio import SocketIO
from models import db
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

socketio = SocketIO()

# ──────────────────────────────────────────────────────────────
# PRODUCT CATALOGUE  (single source of truth)
# ──────────────────────────────────────────────────────────────
PRODUCT_CATALOGUE = [
    # Main item
    dict(name='HotSpot Siomai',   category='Siomai',  price=10.0,  stock=200, max_stock=500, unit='pcs',
         description='Signature HotSpot Siomai – ₱10 per piece',
         image_url='/images/hotspot_siomai.jpg'),
    # Drinks
    dict(name='Coke',             category='Drinks',  price=25.0,  stock=48,  max_stock=144, unit='cans',
         description='Ice-cold Coca-Cola',
         image_url='/images/coke.jpg'),
    dict(name='Royal',            category='Drinks',  price=25.0,  stock=48,  max_stock=144, unit='cans',
         description='Ice-cold Royal Tru-Orange',
         image_url='/images/royal.jpg'),
    dict(name='Sprite',           category='Drinks',  price=25.0,  stock=48,  max_stock=144, unit='cans',
         description='Ice-cold Sprite',
         image_url='/images/sprite.jpg'),
    # Add-ons (condiments – charged separately only if you want)
    dict(name='Chilli Garlic',    category='Add-ons', price=0.0,   stock=100, max_stock=200, unit='packs',
         description='House-made chilli garlic sauce',
         image_url='/images/chilli_garlic.jpg'),
    dict(name='Soy Sauce',        category='Add-ons', price=0.0,   stock=100, max_stock=200, unit='packs',
         description='Premium soy sauce packet',
         image_url='/images/soy_sauce.jpg'),
    dict(name='Calamansi',        category='Add-ons', price=0.0,   stock=100, max_stock=200, unit='packs',
         description='Fresh calamansi packet',
         image_url='/images/calamansi.jpg'),
]


def create_app():
    # Always serve frontend directly (the exact dashboard UI seen in the user's screenshot)
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
    app = Flask(__name__, static_folder=frontend_dir, static_url_path='')

    # ── Config ────────────────────────────────────────────────────────────────
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'kevs-siomai-secret-2024')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
        'DATABASE_URL',
        f"sqlite:///{os.path.join(os.path.dirname(__file__), 'kevs_siomai.db')}"
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # ── Extensions ────────────────────────────────────────────────────────────
    CORS(app, resources={r'/*': {'origins': '*'}})
    db.init_app(app)
    socketio.init_app(app, cors_allowed_origins='*', async_mode='threading')

    # ── Explicit CORS Handler for Mobile & Remote Devices ─────────────────────
    @app.before_request
    def handle_preflight():
        if request.method == 'OPTIONS':
            from flask import Response
            resp = Response()
            origin = request.headers.get('Origin', '*')
            resp.headers['Access-Control-Allow-Origin'] = origin if origin else '*'
            resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
            resp.headers['Access-Control-Allow-Credentials'] = 'true'
            return resp

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get('Origin', '*')
        response.headers['Access-Control-Allow-Origin'] = origin if origin else '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
        response.headers['Access-Control-Allow-Credentials'] = 'true'

        # Live Terminal Activity Logging
        p = request.path
        if not p.startswith('/socket.io'):
            is_poll = request.method == 'GET' and (p.endswith('/queue') or p.endswith('/stats') or p == '/favicon.ico')
            if not is_poll:
                status_icon = "🟢" if response.status_code < 400 else "🔴"
                print(f"  {status_icon} [{request.method}] {p} -> {response.status_code}", flush=True)

        return response

    # ── Security / WAF ────────────────────────────────────────────────────────
    from firewall import waf, firewall_api
    waf.init_app(app)
    app.register_blueprint(firewall_api)

    # ── API Routes ────────────────────────────────────────────────────────────
    from routes import api
    app.register_blueprint(api)

    # ── Product Images Server ─────────────────────────────────────────────────
    @app.route('/images/<path:filename>')
    def serve_product_images(filename):
        img_dir = os.path.join(os.path.dirname(__file__), 'static', 'images')
        resp = send_from_directory(img_dir, filename)
        resp.headers['Cache-Control'] = 'no-cache, must-revalidate, max-age=0'
        return resp

    # ── Mobile App Static File Server (/mobile) ───────────────────────────────
    mobile_build_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'mobile_app', 'build', 'web'))

    @app.route('/mobile', defaults={'path': ''})
    @app.route('/mobile/<path:path>')
    def serve_mobile_app(path):
        if os.path.isdir(mobile_build_dir):
            if path:
                fp = os.path.join(mobile_build_dir, path)
                if os.path.isfile(fp):
                    return send_from_directory(mobile_build_dir, path)
            index = os.path.join(mobile_build_dir, 'index.html')
            if os.path.isfile(index):
                return send_from_directory(mobile_build_dir, 'index.html')
        return '<h2>Mobile build not found. Please build the mobile web app first.</h2>', 404

    # ── SPA Static File Server (Admin / Cashier Dashboard) ────────────────────
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        if path.startswith('api/') or path == 'api' or path.startswith('mobile/') or path == 'mobile':
            return {'error': 'Route not found'}, 404
        sf = app.static_folder
        if sf and os.path.isdir(sf):
            if path:
                fp = os.path.join(sf, path)
                if os.path.isfile(fp):
                    return send_from_directory(sf, path)
                public_fp = os.path.join(sf, 'public', path)
                if os.path.isfile(public_fp):
                    return send_from_directory(os.path.join(sf, 'public'), path)
            index = os.path.join(sf, 'index.html')
            if os.path.isfile(index):
                return send_from_directory(sf, 'index.html')
        return '<h2>🥟 KEVS Siomai – backend running. Build the frontend first.</h2>', 200

    # ── Socket.IO Events ──────────────────────────────────────────────────────
    @socketio.on('connect')
    def _on_connect():
        try:
            from routes import _get_queue_data
            socketio.emit('queue_updated', _get_queue_data())
        except Exception as e:
            print(f'[SocketIO] connect error: {e}')

    @socketio.on('disconnect')
    def _on_disconnect():
        pass  # Silently accept disconnects

    @socketio.on('request_queue_update')
    def _on_request_update():
        try:
            from routes import _get_queue_data
            socketio.emit('queue_updated', _get_queue_data())
        except Exception as e:
            print(f'[SocketIO] update error: {e}')

    # ── DB Init & Seed ────────────────────────────────────────────────────────
    with app.app_context():
        db.create_all()
        _seed_initial_data()

    return app


def _seed_initial_data():
    """Seed admin, new product catalogue, and historical orders from Sep 20 to today."""
    import hashlib
    import random
    from models import User, Product, Order, OrderItem, Sale, Queue
    from datetime import datetime, timezone, timedelta

    # ── Admin user ─────────────────────────────────────────────────────────────
    if not User.query.first():
        db.session.add(User(
            username='admin',
            password_hash=hashlib.sha256('kevs2024'.encode()).hexdigest(),
            full_name='Kevin Bernardino',
            role='admin'
        ))

    # ── Queue row ──────────────────────────────────────────────────────────────
    if not Queue.query.first():
        db.session.add(Queue(current_queue_no=0, now_serving=0))

    # ── Products — wipe old catalogue and replace ──────────────────────────────
    # Delete all existing products (cascade will delete related order items via FK)
    existing_products = Product.query.all()
    if existing_products:
        # Check if product names don't match the new catalogue
        existing_names = {p.name for p in existing_products}
        new_names      = {d['name'] for d in PRODUCT_CATALOGUE}
        if existing_names != new_names:
            # Clear orders and products so we can reseed cleanly
            from models import OrderItem, Sale
            Sale.query.delete()
            OrderItem.query.delete()
            Order.query.delete()
            Product.query.delete()
            Queue.query.delete()
            db.session.flush()
            db.session.add(Queue(current_queue_no=0, now_serving=0))

    # Add products from catalogue if not already present
    for cat_item in PRODUCT_CATALOGUE:
        if not Product.query.filter_by(name=cat_item['name']).first():
            db.session.add(Product(**cat_item))
    db.session.flush()

    # Reviews start empty (submitted by users via app)
    db.session.commit()
    print('[Init] Database ready. Admin: admin / kevs2024')


app = create_app()


def _open_browser(url, delay=1.5):
    """Open browser after server starts. Only called when launched directly (not via root app.py)."""
    def _run():
        time.sleep(delay)
        try:
            import webbrowser
            webbrowser.open(url)
        except Exception:
            pass
    threading.Thread(target=_run, daemon=True).start()


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    port = int(os.getenv('PORT', 5000))
    url  = f'http://localhost:{port}'

    print('\n' + '=' * 65)
    print('  🥟  KEVS SIOMAI — INTEGRATED ORDER MANAGEMENT SYSTEM')
    print('=' * 65)
    print(f'  ➜ Website:    {url}/')
    print(f'  ➜ API Health: {url}/api/products')
    print(f'  ➜ Login:      admin  /  kevs2024')
    print('=' * 65 + '\n')

    # Only open browser when launched directly (not via root app.py launcher)
    # Root app.py sets KEVS_LAUNCHED env var to prevent duplicate tabs
    if not os.environ.get('KEVS_LAUNCHED'):
        _open_browser(url)

    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)
