import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/product.dart';
import '../models/order.dart';

class OfflineService {
  static const String _keyProducts = 'cached_products';
  static const String _keyPendingOrders = 'pending_offline_orders';
  static const String _keyActiveOrders = 'active_customer_orders';
  static const String _keyCustomerName = 'saved_customer_name';
  static const String _keyCustomerPhone = 'saved_customer_phone';
  static const String _keyBackendUrl = 'backend_base_url';

  // Default backend URL: 10.0.2.2 works on Android emulator, localhost on Desktop/Web
  static Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_keyBackendUrl);
    if (saved != null && saved.isNotEmpty) return saved;

    // Smart default: If opened in a browser/phone, use current host IP
    final host = Uri.base.host;
    if (host.isNotEmpty && host != '0.0.0.0' && host != 'localhost') {
      return 'http://$host:5000/api';
    }
    if (host == 'localhost') {
      return 'http://localhost:5000/api';
    }
    return 'http://192.168.123.39:5000/api';
  }

  static Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyBackendUrl, url.trim());
  }

  // ── Products Cache ──
  static Future<void> cacheProducts(List<Product> products) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonList = products.map((p) => p.toJson()).toList();
    await prefs.setString(_keyProducts, jsonEncode(jsonList));
  }

  static Future<List<Product>> getCachedProducts() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString(_keyProducts);
    if (str == null || str.isEmpty) return [];
    try {
      final List<dynamic> decoded = jsonDecode(str);
      return decoded.map((item) => Product.fromJson(item as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  // ── Pending Offline Orders ──
  static Future<void> savePendingOrder(CustomerOrder order) async {
    final prefs = await SharedPreferences.getInstance();
    final orders = await getPendingOrders();
    orders.add(order);
    final jsonList = orders.map((o) => o.toJson()).toList();
    await prefs.setString(_keyPendingOrders, jsonEncode(jsonList));
  }

  static Future<List<CustomerOrder>> getPendingOrders() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString(_keyPendingOrders);
    if (str == null || str.isEmpty) return [];
    try {
      final List<dynamic> decoded = jsonDecode(str);
      return decoded.map((item) => CustomerOrder.fromJson(item as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> clearPendingOrders() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyPendingOrders);
  }

  // ── Active Orders Placed by This Device ──
  static Future<void> saveActiveOrder(CustomerOrder order) async {
    final prefs = await SharedPreferences.getInstance();
    final orders = await getActiveOrders();
    // Replace if exists, or append
    final index = orders.indexWhere((o) => (o.id != null && o.id == order.id) || (o.queueNo == order.queueNo && o.queueNo > 0));
    if (index >= 0) {
      orders[index] = order;
    } else {
      orders.insert(0, order);
    }
    final jsonList = orders.map((o) => o.toJson()).toList();
    await prefs.setString(_keyActiveOrders, jsonEncode(jsonList));
  }

  static Future<List<CustomerOrder>> getActiveOrders() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString(_keyActiveOrders);
    if (str == null || str.isEmpty) return [];
    try {
      final List<dynamic> decoded = jsonDecode(str);
      return decoded.map((item) => CustomerOrder.fromJson(item as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  // ── Customer Profile ──
  static Future<void> saveCustomerProfile(String name, String phone) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyCustomerName, name);
    await prefs.setString(_keyCustomerPhone, phone);
  }

  static Future<Map<String, String>> getCustomerProfile() async {
    final prefs = await SharedPreferences.getInstance();
    return {
      'name': prefs.getString(_keyCustomerName) ?? '',
      'phone': prefs.getString(_keyCustomerPhone) ?? '',
    };
  }
}
