import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/product.dart';
import '../models/order.dart';
import '../models/queue_status.dart';
import '../models/review.dart';
import 'offline_service.dart';

class ApiResult<T> {
  final bool isSuccess;
  final T? data;
  final String? errorMessage;
  final bool isOffline;

  ApiResult.success(this.data)
      : isSuccess = true,
        errorMessage = null,
        isOffline = false;

  ApiResult.failure(this.errorMessage, {this.isOffline = false})
      : isSuccess = false,
        data = null;
}

class ApiService {
  static const Duration _timeout = Duration(seconds: 6);

  // ── Fetch Products ──
  static Future<ApiResult<List<Product>>> fetchProducts() async {
    final baseUrl = await OfflineService.getBaseUrl();
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/products'),
      ).timeout(_timeout);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        final List<dynamic> list = data['products'] ?? [];
        final products = list.map((json) => Product.fromJson(json)).toList();
        // Cache products offline for subsequent runs or lost network
        await OfflineService.cacheProducts(products);
        return ApiResult.success(products);
      } else {
        return ApiResult.failure('Server error: ${response.statusCode}');
      }
    } catch (e) {
      // If network fails, attempt to read from offline cache!
      final cached = await OfflineService.getCachedProducts();
      if (cached.isNotEmpty) {
        return ApiResult.success(cached);
      }
      return ApiResult.failure(
        'Unable to connect to backend ($baseUrl). Please check server connection.',
        isOffline: true,
      );
    }
  }

  // ── Place Order ──
  static Future<ApiResult<CustomerOrder>> placeOrder({
    required String customerName,
    required String customerPhone,
    required String orderType,
    required String deliveryAddress,
    required String paymentMethod,
    required List<CartItem> items,
    required String notes,
  }) async {
    final baseUrl = await OfflineService.getBaseUrl();
    final total = items.fold<double>(0.0, (sum, it) => sum + it.subtotal);

    final payload = {
      'customer_name': customerName,
      'customer_phone': customerPhone,
      'order_type': orderType,
      'delivery_address': orderType == 'delivery' ? deliveryAddress : '',
      'payment_method': paymentMethod,
      'notes': notes,
      'items': items.map((i) => {
        'product_id': i.productId,
        'quantity': i.quantity,
      }).toList(),
    };

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/orders'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).timeout(_timeout);

      if (response.statusCode == 201 || response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        final orderJson = data['order'] ?? {};
        final order = CustomerOrder.fromJson(orderJson);
        await OfflineService.saveActiveOrder(order);
        return ApiResult.success(order);
      } else {
        return ApiResult.failure('Failed to submit order: ${response.body}');
      }
    } catch (e) {
      // Network failure: Save order locally in Offline Pending Queue
      final offlineOrder = CustomerOrder(
        queueNo: 0,
        customerName: customerName,
        customerPhone: customerPhone,
        orderType: orderType,
        deliveryAddress: deliveryAddress,
        paymentMethod: paymentMethod,
        totalAmount: total,
        notes: notes,
        createdAt: DateTime.now().toIso8601String(),
        items: items,
        isOfflinePending: true,
      );
      await OfflineService.savePendingOrder(offlineOrder);
      return ApiResult.failure(
        'Offline: Order saved locally. It will auto-sync when connection is restored.',
        isOffline: true,
      );
    }
  }

  // ── Sync Pending Offline Orders ──
  static Future<int> syncPendingOrders() async {
    final pending = await OfflineService.getPendingOrders();
    if (pending.isEmpty) return 0;

    int syncedCount = 0;
    List<CustomerOrder> remaining = [];

    for (final order in pending) {
      final res = await placeOrder(
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        orderType: order.orderType,
        deliveryAddress: order.deliveryAddress,
        paymentMethod: order.paymentMethod,
        items: order.items,
        notes: '${order.notes} [Synced from Offline Mobile]',
      );

      if (res.isSuccess) {
        syncedCount++;
      } else {
        remaining.add(order);
      }
    }

    await OfflineService.clearPendingOrders();
    for (final rem in remaining) {
      await OfflineService.savePendingOrder(rem);
    }

    return syncedCount;
  }

  // ── Fetch Queue Status ──
  static Future<ApiResult<QueueStatus>> fetchQueueStatus() async {
    final baseUrl = await OfflineService.getBaseUrl();
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/queue'),
      ).timeout(_timeout);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        final status = QueueStatus.fromJson(data);
        return ApiResult.success(status);
      } else {
        return ApiResult.failure('Failed to fetch queue info');
      }
    } catch (e) {
      return ApiResult.failure('Cannot reach queue server: $e', isOffline: true);
    }
  }

  // ── Fetch Specific Order Details ──
  static Future<ApiResult<CustomerOrder>> fetchOrderDetails(int orderId) async {
    final baseUrl = await OfflineService.getBaseUrl();
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/orders/$orderId'),
      ).timeout(_timeout);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        final order = CustomerOrder.fromJson(data['order'] ?? {});
        await OfflineService.saveActiveOrder(order);
        return ApiResult.success(order);
      }
      return ApiResult.failure('Order not found');
    } catch (e) {
      return ApiResult.failure('Error checking order status: $e');
    }
  }

  // ── Simulate GCash Payment ──
  static Future<ApiResult<Map<String, dynamic>>> initiateGCash(int orderId) async {
    final baseUrl = await OfflineService.getBaseUrl();
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/payments/gcash'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'order_id': orderId}),
      ).timeout(_timeout);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        return ApiResult.success(data);
      }
      return ApiResult.failure('GCash payment initialization failed');
    } catch (e) {
      return ApiResult.failure('Payment connection error: $e');
    }
  }

  static Future<ApiResult<bool>> confirmGCashCallback(int orderId, String reference) async {
    final baseUrl = await OfflineService.getBaseUrl();
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/payments/gcash/callback'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'order_id': orderId,
          'reference': reference,
          'status': 'paid',
        }),
      ).timeout(_timeout);

      if (response.statusCode == 200) {
        return ApiResult.success(true);
      }
      return ApiResult.failure('Payment verification failed');
    } catch (e) {
      return ApiResult.failure('Payment verification error: $e');
    }
  }

  // ── Fetch Customer Reviews ──
  static Future<ApiResult<Map<String, dynamic>>> fetchReviews() async {
    final baseUrl = await OfflineService.getBaseUrl();
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/reviews?include_disabled=false'),
      ).timeout(_timeout);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        final List<dynamic> list = data['reviews'] ?? [];
        final reviews = list.map((json) => CustomerReview.fromJson(json)).toList();
        return ApiResult.success({
          'reviews': reviews,
          'stats': data['stats'] ?? {},
        });
      }
      return ApiResult.failure('Failed to load reviews');
    } catch (e) {
      return ApiResult.failure('Reviews connection error: $e');
    }
  }

  // ── Submit Customer Review ──
  static Future<ApiResult<CustomerReview>> submitReview({
    required int rating,
    String comment = '',
    String customerName = '',
    String customerPhone = '',
    int? orderId,
  }) async {
    final baseUrl = await OfflineService.getBaseUrl();
    try {
      final payload = {
        'rating': rating,
        'comment': comment,
        'customer_name': customerName.isNotEmpty ? customerName : 'Anonymous Customer',
        'customer_phone': customerPhone,
        'order_id': ?orderId,
      };

      final response = await http.post(
        Uri.parse('$baseUrl/reviews'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).timeout(_timeout);

      if (response.statusCode == 201 || response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        final reviewJson = data['review'] ?? {};
        final review = CustomerReview.fromJson(reviewJson);
        return ApiResult.success(review);
      } else {
        final Map<String, dynamic> err = jsonDecode(response.body);
        return ApiResult.failure(err['error'] ?? 'Failed to submit review');
      }
    } catch (e) {
      return ApiResult.failure('Network error submitting review: $e');
    }
  }
}
