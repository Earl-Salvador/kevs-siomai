import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/shop_provider.dart';
import '../services/offline_service.dart';

class ReviewDialog extends StatefulWidget {
  final int? orderId;
  final String? initialCustomerName;

  const ReviewDialog({
    super.key,
    this.orderId,
    this.initialCustomerName,
  });

  static Future<bool?> show(
    BuildContext context, {
    int? orderId,
    String? initialCustomerName,
  }) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => ReviewDialog(
        orderId: orderId,
        initialCustomerName: initialCustomerName,
      ),
    );
  }

  @override
  State<ReviewDialog> createState() => _ReviewDialogState();
}

class _ReviewDialogState extends State<ReviewDialog> {
  int _selectedRating = 5; // Default 5 stars
  final _commentController = TextEditingController();
  final _nameController = TextEditingController();
  bool _isSubmitting = false;

  final List<String> _ratingLabels = [
    'Tap a star to rate',
    'Poor (1 Star)',
    'Fair (2 Stars)',
    'Good (3 Stars)',
    'Very Good (4 Stars)',
    'Outstanding (5 Stars)',
  ];

  @override
  void initState() {
    super.initState();
    _loadInitialName();
  }

  Future<void> _loadInitialName() async {
    if (widget.initialCustomerName != null && widget.initialCustomerName!.isNotEmpty) {
      _nameController.text = widget.initialCustomerName!;
      return;
    }
    final profile = await OfflineService.getCustomerProfile();
    final savedName = profile['name'] ?? '';
    if (mounted && savedName.isNotEmpty) {
      setState(() {
        _nameController.text = savedName;
      });
    }
  }

  @override
  void dispose() {
    _commentController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _submitReview() async {
    if (_selectedRating < 1 || _selectedRating > 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please pick a star rating between 1 and 5.')),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final shop = context.read<ShopProvider>();
    final customerName = _nameController.text.trim().isNotEmpty
        ? _nameController.text.trim()
        : 'Anonymous Customer';
    final comment = _commentController.text.trim();

    final result = await shop.submitReview(
      rating: _selectedRating,
      comment: comment, // Comment is optional
      customerName: customerName,
      orderId: widget.orderId,
    );

    if (!mounted) return;
    setState(() => _isSubmitting = false);

    if (result.isSuccess) {
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.star, color: Colors.amber),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Thank you! Your $_selectedRating-star review was submitted!'),
              ),
            ],
          ),
          backgroundColor: Colors.green.shade800,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.errorMessage ?? 'Failed to submit review.'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      elevation: 12,
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header with badge
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFFC62828), Color(0xFFEF5350)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Center(
                    child: Icon(Icons.star_rounded, size: 26, color: Colors.white),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Rate BOSS KEVS',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1E293B),
                        ),
                      ),
                      Text(
                        widget.orderId != null
                            ? 'Review for Order #${widget.orderId}'
                            : 'How was your experience?',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.grey),
                  onPressed: _isSubmitting ? null : () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const Divider(height: 28),

            // Star Rating Picker (1 to 5 Stars)
            Center(
              child: Column(
                children: [
                  const Text(
                    'Pick a star rating (1 - 5):',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (index) {
                      final starIndex = index + 1;
                      final isSelected = starIndex <= _selectedRating;

                      return InkWell(
                        onTap: _isSubmitting
                            ? null
                            : () {
                                setState(() {
                                  _selectedRating = starIndex;
                                });
                              },
                        borderRadius: BorderRadius.circular(99),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4.0),
                          child: AnimatedScale(
                            scale: starIndex == _selectedRating ? 1.2 : 1.0,
                            duration: const Duration(milliseconds: 180),
                            child: Icon(
                              isSelected ? Icons.star_rounded : Icons.star_outline_rounded,
                              size: 40,
                              color: isSelected ? Colors.amber.shade600 : Colors.grey.shade300,
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 6),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Text(
                      _ratingLabels[_selectedRating],
                      key: ValueKey<int>(_selectedRating),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Colors.amber.shade900,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Optional Review Comment Input
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Your Review:',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.black87),
                ),
                Text(
                  '(Optional)',
                  style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: Colors.grey.shade600),
                ),
              ],
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _commentController,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              enabled: !_isSubmitting,
              decoration: InputDecoration(
                hintText: 'Share details of your experience, food quality, or delivery (optional)...',
                hintStyle: TextStyle(fontSize: 12, color: Colors.grey.shade400),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFC62828), width: 1.5),
                ),
                filled: true,
                fillColor: Colors.grey.shade50,
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
            const SizedBox(height: 14),

            // Customer Name (Optional / Prefilled)
            TextField(
              controller: _nameController,
              enabled: !_isSubmitting,
              decoration: InputDecoration(
                labelText: 'Your Name (Optional)',
                hintText: 'e.g. Juan / Anonymous',
                labelStyle: const TextStyle(fontSize: 12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                prefixIcon: const Icon(Icons.person_outline, size: 20),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
            const SizedBox(height: 22),

            // Submit Button
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFC62828),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 2,
              ),
              onPressed: _isSubmitting ? null : _submitReview,
              child: _isSubmitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : Text(
                      'Submit $_selectedRating-Star Review',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                    ),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: _isSubmitting ? null : () => Navigator.of(context).pop(),
              child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
            ),
          ],
        ),
      ),
    );
  }
}
