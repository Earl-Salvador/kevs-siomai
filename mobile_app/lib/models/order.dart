class CartItem {
  final int productId;
  final String productName;
  final double unitPrice;
  int quantity;

  CartItem({
    required this.productId,
    required this.productName,
    required this.unitPrice,
    this.quantity = 1,
  });

  double get subtotal => unitPrice * quantity;

  Map<String, dynamic> toJson() => {
    'product_id': productId,
    'product_name': productName,
    'quantity': quantity,
    'unit_price': unitPrice,
  };

  factory CartItem.fromJson(Map<String, dynamic> json) => CartItem(
    productId: json['product_id'] ?? 0,
    productName: json['product_name'] ?? '',
    unitPrice: (json['unit_price'] as num?)?.toDouble() ?? 0.0,
    quantity: json['quantity'] ?? 1,
  );
}

class CustomerOrder {
  final int? id;
  final int queueNo;
  final String customerName;
  final String customerPhone;
  final String orderType; // 'pickup' or 'delivery'
  final String deliveryAddress;
  final String paymentMethod; // 'GCash' or 'Cash'
  String paymentStatus; // 'pending', 'confirmed', 'failed'
  String status; // 'pending', 'accepted', 'preparing', 'ready_pickup', 'ready_delivery', 'out_for_delivery', 'completed', 'delivered', 'cancelled'
  final double totalAmount;
  final String notes;
  final String? createdAt;
  final String? paymentReference;
  final List<CartItem> items;
  final bool isOfflinePending;

  CustomerOrder({
    this.id,
    required this.queueNo,
    required this.customerName,
    required this.customerPhone,
    required this.orderType,
    this.deliveryAddress = '',
    required this.paymentMethod,
    this.paymentStatus = 'pending',
    this.status = 'pending',
    required this.totalAmount,
    this.notes = '',
    this.createdAt,
    this.paymentReference,
    required this.items,
    this.isOfflinePending = false,
  });

  bool get isCompleted => status == 'completed' || status == 'delivered';
  bool get isReady => status == 'ready_pickup' || status == 'ready_delivery';
  bool get isOutForDelivery => status == 'out_for_delivery';
  bool get isPreparing => status == 'preparing';
  bool get isPaid => paymentStatus == 'confirmed';

  factory CustomerOrder.fromJson(Map<String, dynamic> json) {
    var rawItems = json['items'] as List<dynamic>? ?? [];
    List<CartItem> parsedItems = [];
    for (var it in rawItems) {
      if (it is Map<String, dynamic>) {
        parsedItems.add(CartItem(
          productId: it['product_id'] ?? 0,
          productName: it['product_name'] ?? it['name'] ?? 'Siomai Item',
          unitPrice: (it['unit_price'] as num?)?.toDouble() ?? 0.0,
          quantity: it['quantity'] ?? 1,
        ));
      }
    }

    return CustomerOrder(
      id: json['id'],
      queueNo: json['queue_no'] ?? 0,
      customerName: json['customer_name'] ?? 'Customer',
      customerPhone: json['customer_phone'] ?? '',
      orderType: json['order_type'] ?? 'pickup',
      deliveryAddress: json['delivery_address'] ?? '',
      paymentMethod: json['payment_method'] ?? 'GCash',
      paymentStatus: json['payment_status'] ?? 'pending',
      status: json['status'] ?? 'pending',
      totalAmount: (json['total_amount'] as num?)?.toDouble() ?? 0.0,
      notes: json['notes'] ?? '',
      createdAt: json['created_at'],
      paymentReference: json['payment_reference'],
      items: parsedItems,
      isOfflinePending: json['is_offline_pending'] ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'queue_no': queueNo,
      'customer_name': customerName,
      'customer_phone': customerPhone,
      'order_type': orderType,
      'delivery_address': deliveryAddress,
      'payment_method': paymentMethod,
      'payment_status': paymentStatus,
      'status': status,
      'total_amount': totalAmount,
      'notes': notes,
      'created_at': createdAt,
      'payment_reference': paymentReference,
      'items': items.map((i) => i.toJson()).toList(),
      'is_offline_pending': isOfflinePending,
    };
  }
}
