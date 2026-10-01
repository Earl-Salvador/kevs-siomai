import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/product.dart';
import '../models/order.dart';
import '../models/queue_status.dart';
import '../models/review.dart';
import '../services/api_service.dart';
import '../services/offline_service.dart';

class ShopProvider extends ChangeNotifier {
  List<Product> _products = [];
  String _selectedCategory = 'All';
  bool _isLoading = false;
  bool _isOffline = false;
  String? _errorMessage;

  final Map<int, CartItem> _cart = {};
  QueueStatus? _queueStatus;
  List<CustomerOrder> _activeOrders = [];
  List<CustomerOrder> _pendingOfflineOrders = [];

  Timer? _queuePollTimer;

  // Getters
  List<Product> get products {
    final activeList = _products.where((p) => p.isActive).toList();
    if (_selectedCategory == 'All') return activeList;
    return activeList.where((p) => p.category.toLowerCase() == _selectedCategory.toLowerCase()).toList();
  }

  List<String> get categories {
    final Set<String> cats = {'All'};
    for (var p in _products.where((p) => p.isActive)) {
      if (p.category.isNotEmpty) cats.add(p.category);
    }
    return cats.toList();
  }

  String get selectedCategory => _selectedCategory;
  bool get isLoading => _isLoading;
  bool get isOffline => _isOffline;
  String? get errorMessage => _errorMessage;

  Map<int, CartItem> get cart => _cart;
  int get cartCount => _cart.values.fold(0, (sum, it) => sum + it.quantity);
  double get cartTotal => _cart.values.fold(0.0, (sum, it) => sum + it.subtotal);

  QueueStatus? get queueStatus => _queueStatus;
  List<CustomerOrder> get activeOrders => _activeOrders;
  List<CustomerOrder> get pendingOfflineOrders => _pendingOfflineOrders;

  List<CustomerReview> _reviews = [];
  Map<String, dynamic> _reviewStats = {};
  bool _isLoadingReviews = false;

  List<CustomerReview> get reviews => _reviews;
  Map<String, dynamic> get reviewStats => _reviewStats;
  bool get isLoadingReviews => _isLoadingReviews;
  double get averageRating => (_reviewStats['average_rating'] as num?)?.toDouble() ?? 0.0;
  int get totalReviews => (_reviewStats['total_reviews'] as num?)?.toInt() ?? _reviews.length;

  ShopProvider() {
    init();
  }

  Future<void> init() async {
    await loadProducts();
    await loadLocalOrders();
    await refreshQueue();
    await loadReviews();

    // Start background queue polling every 10 seconds
    _queuePollTimer?.cancel();
    _queuePollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      refreshQueue(silent: true);
      refreshActiveOrders(silent: true);
    });
  }

  @override
  void dispose() {
    _queuePollTimer?.cancel();
    super.dispose();
  }

  void setCategory(String cat) {
    _selectedCategory = cat;
    notifyListeners();
  }

  // ── Products ──
  Future<void> loadProducts({bool showLoader = true}) async {
    if (showLoader) {
      _isLoading = true;
      _errorMessage = null;
      notifyListeners();
    }

    final res = await ApiService.fetchProducts();
    _isLoading = false;

    if (res.isSuccess && res.data != null) {
      _products = res.data!;
      _isOffline = false;
      _errorMessage = null;
    } else {
      _isOffline = res.isOffline;
      _errorMessage = res.errorMessage;
      // Load offline cached products if available
      final cached = await OfflineService.getCachedProducts();
      if (cached.isNotEmpty) {
        _products = cached;
      }
    }
    // Clean up any items that became inactive from active cart
    _cart.removeWhere((id, _) => _products.any((p) => p.id == id && !p.isActive));
    notifyListeners();
  }

  // ── Cart Operations ──
  void addToCart(Product product) {
    if (!product.isActive || product.stock <= 0) return;
    if (_cart.containsKey(product.id)) {
      final existing = _cart[product.id]!;
      if (existing.quantity < product.stock) {
        existing.quantity++;
      }
    } else {
      _cart[product.id] = CartItem(
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity: 1,
      );
    }
    notifyListeners();
  }

  void removeFromCart(int productId) {
    _cart.remove(productId);
    notifyListeners();
  }

  void updateQuantity(int productId, int delta) {
    if (!_cart.containsKey(productId)) return;
    final item = _cart[productId]!;
    final product = _products.firstWhere((p) => p.id == productId, orElse: () => Product(id: productId, name: item.productName, category: '', price: item.unitPrice, stock: 99, maxStock: 100, unit: '', description: '', imageUrl: ''));

    final newQty = item.quantity + delta;
    if (newQty <= 0) {
      _cart.remove(productId);
    } else if (newQty <= product.stock) {
      item.quantity = newQty;
    }
    notifyListeners();
  }

  void clearCart() {
    _cart.clear();
    notifyListeners();
  }

  // ── Place Order ──
  Future<CustomerOrder?> submitOrder({
    required String customerName,
    required String customerPhone,
    required String orderType,
    required String deliveryAddress,
    required String paymentMethod,
    required String notes,
  }) async {
    if (_cart.isEmpty) return null;

    final items = _cart.values.toList();
    _isLoading = true;
    notifyListeners();

    // Remember customer profile
    await OfflineService.saveCustomerProfile(customerName, customerPhone);

    final res = await ApiService.placeOrder(
      customerName: customerName,
      customerPhone: customerPhone,
      orderType: orderType,
      deliveryAddress: deliveryAddress,
      paymentMethod: paymentMethod,
      items: items,
      notes: notes,
    );

    _isLoading = false;

    if (res.isSuccess && res.data != null) {
      final order = res.data!;
      _cart.clear();
      _activeOrders.insert(0, order);
      await refreshQueue();
      await loadProducts(showLoader: false);
      notifyListeners();
      return order;
    } else if (res.isOffline) {
      // Saved to pending offline list
      _cart.clear();
      await loadLocalOrders();
      notifyListeners();
      return null;
    } else {
      _errorMessage = res.errorMessage;
      notifyListeners();
      return null;
    }
  }

  // ── Queue Management ──
  Future<void> refreshQueue({bool silent = false}) async {
    final res = await ApiService.fetchQueueStatus();
    if (res.isSuccess && res.data != null) {
      _queueStatus = res.data;
      if (!silent) notifyListeners();
    }
  }

  Future<void> loadLocalOrders() async {
    _activeOrders = await OfflineService.getActiveOrders();
    _pendingOfflineOrders = await OfflineService.getPendingOrders();
    notifyListeners();
  }

  Future<void> refreshActiveOrders({bool silent = false}) async {
    if (_activeOrders.isEmpty) return;
    bool changed = false;

    for (int i = 0; i < _activeOrders.length; i++) {
      final ord = _activeOrders[i];
      if (ord.id != null && !ord.isCompleted) {
        final res = await ApiService.fetchOrderDetails(ord.id!);
        if (res.isSuccess && res.data != null) {
          _activeOrders[i] = res.data!;
          changed = true;
        }
      }
    }

    if (changed && !silent) {
      notifyListeners();
    }
  }

  // ── Sync Offline Pending Orders ──
  Future<int> syncOfflineOrders() async {
    _isLoading = true;
    notifyListeners();

    final count = await ApiService.syncPendingOrders();
    await loadLocalOrders();
    await loadProducts(showLoader: false);
    await refreshQueue();

    _isLoading = false;
    notifyListeners();
    return count;
  }

  // ── GCash Payment Simulation ──
  Future<bool> processGCashPayment(CustomerOrder order) async {
    if (order.id == null) return false;

    // 1. Initiate GCash
    final initRes = await ApiService.initiateGCash(order.id!);
    if (!initRes.isSuccess) return false;

    final ref = initRes.data?['reference'] ?? 'GC-MANUAL';

    // 2. Simulate user confirming via GCash App / OTP callback
    final confirmRes = await ApiService.confirmGCashCallback(order.id!, ref);
    if (confirmRes.isSuccess) {
      order.paymentStatus = 'confirmed';
      await OfflineService.saveActiveOrder(order);
      await refreshActiveOrders();
      notifyListeners();
      return true;
    }
    return false;
  }

  // ── Customer Reviews ──
  Future<void> loadReviews({bool showLoader = false}) async {
    if (showLoader) {
      _isLoadingReviews = true;
      notifyListeners();
    }
    final res = await ApiService.fetchReviews();
    _isLoadingReviews = false;
    if (res.isSuccess && res.data != null) {
      _reviews = (res.data!['reviews'] as List<CustomerReview>?) ?? [];
      _reviewStats = (res.data!['stats'] as Map<String, dynamic>?) ?? {};
    }
    notifyListeners();
  }

  Future<ApiResult<CustomerReview>> submitReview({
    required int rating,
    String comment = '',
    String customerName = '',
    String customerPhone = '',
    int? orderId,
  }) async {
    final res = await ApiService.submitReview(
      rating: rating,
      comment: comment,
      customerName: customerName,
      customerPhone: customerPhone,
      orderId: orderId,
    );
    if (res.isSuccess) {
      await loadReviews();
    }
    return res;
  }
}
