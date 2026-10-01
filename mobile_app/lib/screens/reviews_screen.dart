import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/shop_provider.dart';
import '../widgets/review_dialog.dart';

class ReviewsScreen extends StatefulWidget {
  const ReviewsScreen({super.key});

  @override
  State<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends State<ReviewsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ShopProvider>().loadReviews(showLoader: true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final shop = context.watch<ShopProvider>();
    final reviews = shop.reviews;
    final stats = shop.reviewStats;
    final avg = (stats['average_rating'] as num?)?.toDouble() ?? 0.0;
    final total = (stats['total_reviews'] as num?)?.toInt() ?? reviews.length;
    final breakdown = (stats['rating_breakdown'] as Map<String, dynamic>?) ?? {};

    return Scaffold(
      appBar: AppBar(
        title: const Text('Customer Reviews'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Reviews',
            onPressed: () => shop.loadReviews(showLoader: true),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFFC62828),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.rate_review_outlined),
        label: const Text('Write Review', style: TextStyle(fontWeight: FontWeight.bold)),
        onPressed: () async {
          final res = await ReviewDialog.show(context);
          if (res == true) {
            shop.loadReviews();
          }
        },
      ),
      body: shop.isLoadingReviews
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () => shop.loadReviews(),
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Overall Rating Summary Card
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    elevation: 3,
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              // Left: Big Rating Number
                              Column(
                                children: [
                                  Text(
                                    avg.toStringAsFixed(1),
                                    style: const TextStyle(
                                      fontSize: 44,
                                      fontWeight: FontWeight.w900,
                                      color: Color(0xFFC62828),
                                      height: 1.0,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Row(
                                    children: List.generate(5, (index) {
                                      final filled = index < avg.round();
                                      return Icon(
                                        filled ? Icons.star_rounded : Icons.star_outline_rounded,
                                        size: 18,
                                        color: Colors.amber.shade700,
                                      );
                                    }),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '$total review${total == 1 ? '' : 's'}',
                                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                  ),
                                ],
                              ),
                              const SizedBox(width: 20),
                              // Right: Rating Distribution Bars
                              Expanded(
                                child: Column(
                                  children: [5, 4, 3, 2, 1].map((star) {
                                    final count = (breakdown[star.toString()] as num?)?.toInt() ?? 0;
                                    final pct = total > 0 ? count / total : 0.0;
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 2.0),
                                      child: Row(
                                        children: [
                                          Text('$star★', style: TextStyle(fontSize: 11, color: Colors.grey.shade700)),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            child: ClipRRect(
                                              borderRadius: BorderRadius.circular(4),
                                              child: LinearProgressIndicator(
                                                value: pct,
                                                minHeight: 6,
                                                backgroundColor: Colors.grey.shade200,
                                                valueColor: AlwaysStoppedAnimation<Color>(Colors.amber.shade700),
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          SizedBox(
                                            width: 20,
                                            child: Text(
                                              '$count',
                                              textAlign: TextAlign.end,
                                              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 24),
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.amber.shade700,
                              foregroundColor: Colors.white,
                              minimumSize: const Size.fromHeight(42),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            icon: const Icon(Icons.star_rounded, size: 20),
                            label: const Text('Rate BOSS KEVS (1 - 5 Stars)', style: TextStyle(fontWeight: FontWeight.bold)),
                            onPressed: () async {
                              final res = await ReviewDialog.show(context);
                              if (res == true) {
                                shop.loadReviews();
                              }
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Reviews List
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Recent Reviews (${reviews.length})',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  if (reviews.isEmpty)
                    Card(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      child: const Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(
                          child: Column(
                            children: [
                              Text('🥟⭐', style: TextStyle(fontSize: 40)),
                              SizedBox(height: 10),
                              Text(
                                'Be the first to leave a review!',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                              ),
                              SizedBox(height: 4),
                              Text(
                                'Tell others about your favorite siomai and cart experience.',
                                style: TextStyle(fontSize: 12, color: Colors.grey),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      ),
                    )
                  else
                    ...reviews.map((review) {
                      final hasReply = review.reply.trim().isNotEmpty;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        elevation: 1,
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Customer Info & Rating
                              Row(
                                children: [
                                  CircleAvatar(
                                    radius: 18,
                                    backgroundColor: const Color(0xFFC62828).withValues(alpha: 0.15),
                                    child: Text(
                                      (review.customerName.isNotEmpty ? review.customerName[0] : 'C').toUpperCase(),
                                      style: const TextStyle(color: Color(0xFFC62828), fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          review.customerName,
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                        ),
                                        if (review.formattedDate != null)
                                          Text(
                                            review.formattedDate!,
                                            style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                                          ),
                                      ],
                                    ),
                                  ),
                                  // Star icons
                                  Row(
                                    children: List.generate(5, (i) {
                                      final filled = i < review.rating;
                                      return Icon(
                                        filled ? Icons.star_rounded : Icons.star_outline_rounded,
                                        size: 16,
                                        color: Colors.amber.shade700,
                                      );
                                    }),
                                  ),
                                ],
                              ),

                              // Optional comment
                              if (review.comment.trim().isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Text(
                                  review.comment,
                                  style: const TextStyle(fontSize: 13, height: 1.35, color: Colors.black87),
                                ),
                              ] else ...[
                                const SizedBox(height: 6),
                                Text(
                                  '(Rated ${review.rating} stars)',
                                  style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: Colors.grey.shade600),
                                ),
                              ],

                              // Merchant / Owner Reply
                              if (hasReply) ...[
                                const SizedBox(height: 12),
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.red.shade50,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: Colors.red.shade200),
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          const Text('🥟', style: TextStyle(fontSize: 14)),
                                          const SizedBox(width: 6),
                                          const Text(
                                            'BOSS KEVS Response',
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 11,
                                              color: Color(0xFFC62828),
                                            ),
                                          ),
                                          const Spacer(),
                                          Text(
                                            'Store Owner',
                                            style: TextStyle(fontSize: 10, color: Colors.red.shade700, fontStyle: FontStyle.italic),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        review.reply,
                                        style: TextStyle(fontSize: 12, height: 1.3, color: Colors.grey.shade900),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    }),
                  const SizedBox(height: 60), // Padding for FAB
                ],
              ),
            ),
    );
  }
}
