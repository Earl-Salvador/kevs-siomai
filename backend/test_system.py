"""
==============================================================================
  🧪 KEVS SIOMAI — FULL SYSTEM VERIFICATION SUITE
==============================================================================
Tests all endpoints, database operations, business logic, analytics,
and Web Application Firewall (WAF) intrusion prevention.
"""

import json
import pytest
from app import create_app
from models import db, User, Product, Order, Queue
from firewall import waf


@pytest.fixture
def app_instance():
    app = create_app()
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    with app.app_context():
        db.create_all()
        # Seed test queue & product
        q = Queue(current_queue_no=0, now_serving=0)
        db.session.add(q)
        p = Product(name='Hotspot Siomai', price=45.0, stock=50, max_stock=100)
        db.session.add(p)
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app_instance):
    return app_instance.test_client()


# ─────────────────────────────────────────────────────────────────────────────
# 1. AUTHENTICATION TESTS
# ─────────────────────────────────────────────────────────────────────────────
def test_login_success(client):
    res = client.post('/api/auth/login', json={'username': 'admin', 'password': 'kevs2024'})
    assert res.status_code == 200
    data = res.get_json()
    assert 'token' in data
    assert data['user']['username'] == 'admin'


def test_login_failure(client):
    res = client.post('/api/auth/login', json={'username': 'admin', 'password': 'wrongpassword'})
    assert res.status_code == 401
    assert 'error' in res.get_json()


# ─────────────────────────────────────────────────────────────────────────────
# 2. QUEUE & ORDER TESTS
# ─────────────────────────────────────────────────────────────────────────────
def test_queue_add_and_call_next(client):
    # Add order to queue
    payload = {
        'type': 'walk-in',
        'order_type': 'pickup',
        'customer_name': 'Test Juan',
        'items': [{'product_id': 1, 'quantity': 2}],
        'payment_method': 'Cash'
    }
    res = client.post('/api/queue/add', json=payload)
    assert res.status_code == 201
    data = res.get_json()
    new_q_no = data['order']['queue_no']
    assert new_q_no > 0
    assert data['order']['customer_name'] == 'Test Juan'

    # Call next customer
    call_res = client.post('/api/queue/call-next')
    assert call_res.status_code == 200
    call_data = call_res.get_json()
    assert call_data['now_serving'] > 0

    # Verify queue display
    disp = client.get('/api/queue/display')
    assert disp.status_code == 200
    assert disp.get_json()['now_serving'] == call_data['now_serving']


def test_queue_reset(client):
    res = client.post('/api/queue/reset')
    assert res.status_code == 200
    data = res.get_json()
    assert data['queue']['current_queue_no'] == 0
    assert data['queue']['now_serving'] == 0


# ─────────────────────────────────────────────────────────────────────────────
# 3. INVENTORY TESTS
# ─────────────────────────────────────────────────────────────────────────────
def test_inventory_stock_adjustment(client):
    # Check initial stock
    prod_res = client.get('/api/products')
    assert prod_res.status_code == 200
    products = prod_res.get_json()['products']
    p_id = products[0]['id']
    initial_stock = products[0]['stock']

    # Adjust stock by +10
    adj_res = client.put(f'/api/inventory/{p_id}', json={'adjustment': 10})
    assert adj_res.status_code == 200
    assert adj_res.get_json()['product']['stock'] == initial_stock + 10


def test_create_and_delete_product(client):
    res = client.post('/api/products', json={
        'name': 'Fried Wonton',
        'category': 'Dumplings',
        'price': 40.0,
        'stock': 30,
        'max_stock': 80
    })
    assert res.status_code == 201
    p = res.get_json()['product']
    assert p['name'] == 'Fried Wonton'

    # Deactivate
    del_res = client.delete(f"/api/products/{p['id']}")
    assert del_res.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# 4. ANALYTICS TESTS
# ─────────────────────────────────────────────────────────────────────────────
def test_analytics_endpoints(client):
    res_desc = client.get('/api/analytics/descriptive')
    assert res_desc.status_code == 200
    desc = res_desc.get_json()
    assert 'summary' in desc
    assert 'top_products' in desc

    res_pred = client.get('/api/analytics/predictive')
    assert res_pred.status_code == 200
    pred = res_pred.get_json()
    assert 'next_day_forecast' in pred

    res_presc = client.get('/api/analytics/prescriptive')
    assert res_presc.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# 5. OFFLINE SYNC TESTS
# ─────────────────────────────────────────────────────────────────────────────
def test_offline_sync(client):
    batch = {
        'batch_id': 'test-batch-uuid-001',
        'orders': [{
            'customer_name': 'Offline Maria',
            'type': 'walk-in',
            'order_type': 'pickup',
            'total': 90.0,
            'status': 'completed',
            'payment_status': 'confirmed',
            'created_at': '2026-09-27T10:00:00'
        }]
    }
    res = client.post('/api/offline/sync', json=batch)
    assert res.status_code == 200
    assert res.get_json()['orders_synced'] == 1


# ─────────────────────────────────────────────────────────────────────────────
# 6. WEB APPLICATION FIREWALL (WAF) TESTS
# ─────────────────────────────────────────────────────────────────────────────
def test_firewall_blocks_sqli(client):
    res = client.get("/api/products?search=' OR 1=1 --")
    assert res.status_code == 403
    data = res.get_json()
    assert data['waf_status'] == 'blocked'
    assert data['threat_type'] == 'SQL_INJECTION'


def test_firewall_blocks_xss(client):
    res = client.get("/api/products?filter=<script>alert('xss')</script>")
    assert res.status_code == 403
    data = res.get_json()
    assert data['waf_status'] == 'blocked'
    assert data['threat_type'] == 'XSS_ATTACK'


def test_firewall_blocks_path_traversal(client):
    res = client.get("/api/products?file=../../../../etc/passwd")
    assert res.status_code == 403
    data = res.get_json()
    assert data['waf_status'] == 'blocked'
    assert data['threat_type'] == 'PATH_TRAVERSAL'


def test_firewall_security_headers(client):
    res = client.get("/api/products")
    assert res.status_code == 200
    assert res.headers.get('X-Content-Type-Options') == 'nosniff'
    assert res.headers.get('X-Frame-Options') == 'SAMEORIGIN'
    assert res.headers.get('X-XSS-Protection') == '1; mode=block'
    assert 'Content-Security-Policy' in res.headers


def test_firewall_test_simulator_and_logs(client):
    res = client.post('/api/firewall/test', json={'threat_type': 'sqli'})
    assert res.status_code == 200
    assert 'result' in res.get_json()

    logs_res = client.get('/api/firewall/logs')
    assert logs_res.status_code == 200
    logs = logs_res.get_json()['logs']
    assert len(logs) > 0
