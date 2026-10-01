class CustomerReview {
  final int? id;
  final String customerName;
  final String customerPhone;
  final int rating;
  final String comment;
  final int? orderId;
  final String reply;
  final String? repliedAt;
  final bool isDisabled;
  final String? createdAt;
  final String? formattedDate;

  CustomerReview({
    this.id,
    required this.customerName,
    this.customerPhone = '',
    required this.rating,
    this.comment = '',
    this.orderId,
    this.reply = '',
    this.repliedAt,
    this.isDisabled = false,
    this.createdAt,
    this.formattedDate,
  });

  factory CustomerReview.fromJson(Map<String, dynamic> json) {
    return CustomerReview(
      id: json['id'],
      customerName: json['customer_name'] ?? 'Anonymous Customer',
      customerPhone: json['customer_phone'] ?? '',
      rating: json['rating'] is int ? json['rating'] : int.tryParse(json['rating']?.toString() ?? '5') ?? 5,
      comment: json['comment'] ?? '',
      orderId: json['order_id'],
      reply: json['reply'] ?? '',
      repliedAt: json['replied_at'],
      isDisabled: json['is_disabled'] == true,
      createdAt: json['created_at'],
      formattedDate: json['formatted_date'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': ?id,
      'customer_name': customerName,
      'customer_phone': customerPhone,
      'rating': rating,
      'comment': comment,
      'order_id': ?orderId,
    };
  }
}
