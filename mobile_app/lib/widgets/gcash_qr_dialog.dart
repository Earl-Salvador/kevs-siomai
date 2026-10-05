import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/order.dart';
import '../providers/shop_provider.dart';

class GCashQRDialog extends StatefulWidget {
  final CustomerOrder? order;
  final double totalAmount;
  final VoidCallback? onCompleted;

  const GCashQRDialog({
    super.key,
    this.order,
    required this.totalAmount,
    this.onCompleted,
  });

  static Future<bool?> show(
    BuildContext context, {
    CustomerOrder? order,
    required double totalAmount,
    VoidCallback? onCompleted,
  }) {
    return showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (context) => GCashQRDialog(
        order: order,
        totalAmount: totalAmount,
        onCompleted: onCompleted,
      ),
    );
  }

  @override
  State<GCashQRDialog> createState() => _GCashQRDialogState();
}

class _GCashQRDialogState extends State<GCashQRDialog> {
  bool _isProcessing = false;

  Future<void> _handleConfirmPayment() async {
    if (widget.order == null) {
      Navigator.pop(context, true);
      widget.onCompleted?.call();
      return;
    }

    setState(() => _isProcessing = true);
    final shop = Provider.of<ShopProvider>(context, listen: false);
    final success = await shop.processGCashPayment(widget.order!);

    if (!mounted) return;
    setState(() => _isProcessing = false);

    Navigator.pop(context, success);
    widget.onCompleted?.call();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'GCash payment confirmed for Order #${widget.order?.queueNo ?? widget.order?.id}!'
              : 'Payment recorded. Verifying with merchant...',
        ),
        backgroundColor: success ? const Color(0xFF007DFE) : Colors.grey.shade800,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasOrder = widget.order != null;
    final order = widget.order;

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.25),
              blurRadius: 20,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Blue Header Bar ──
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF0056B3), Color(0xFF007DFE)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.qr_code_2, color: Colors.white, size: 24),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'GCash QR Payment',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            'Scan with your GCash App to Pay',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white70),
                      onPressed: () => Navigator.pop(context),
                      tooltip: 'Close',
                    ),
                  ],
                ),
              ),

              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    // ── Amount To Pay Banner ──
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF007DFE).withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFF007DFE).withValues(alpha: 0.25)),
                      ),
                      child: Column(
                        children: [
                          const Text(
                            'TOTAL AMOUNT TO PAY',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                              color: Color(0xFF0056B3),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '₱${widget.totalAmount.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF007DFE),
                            ),
                          ),
                          if (hasOrder && order?.queueNo != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              'Queue Ticket #${order!.queueNo}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFFC62828),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 16),

                    // ── GCash QR Code Image ──
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.grey.shade300, width: 1.5),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.asset(
                          'assets/images/gcash_qr.png',
                          width: double.infinity,
                          height: 310,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),

                    const SizedBox(height: 14),

                    // ── Account Details Card ──
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.grey.shade200),
                      ),
                      child: const Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Merchant:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                              Text('Boss KEVS Siomai', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                            ],
                          ),
                          SizedBox(height: 4),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('GCash Name:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                              Text('JO*N LL**D C.', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF007DFE))),
                            ],
                          ),
                          SizedBox(height: 4),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Mobile No:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                              Text('+63 921 296 ••••', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

                    // ── Quick Instructions ──
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.info_outline, color: Color(0xFF007DFE), size: 16),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Open your GCash app, tap "Scan QR" at the top, point camera at this QR code, and send ₱${widget.totalAmount.toStringAsFixed(2)}.',
                            style: const TextStyle(fontSize: 11, color: Colors.black87, height: 1.3),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 20),

                    // ── Action Buttons ──
                    if (hasOrder) ...[
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF007DFE),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            elevation: 2,
                          ),
                          icon: _isProcessing
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                )
                              : const Icon(Icons.check_circle_outline, size: 20),
                          label: Text(
                            _isProcessing ? 'Verifying Payment...' : 'I Have Paid with GCash',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                          onPressed: _isProcessing ? null : _handleConfirmPayment,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Pay Later at Counter / Close', style: TextStyle(color: Colors.grey)),
                      ),
                    ] else ...[
                      SizedBox(
                        width: double.infinity,
                        height: 46,
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF007DFE),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: () => Navigator.pop(context),
                          child: const Text('Got It, Return to Cart', style: TextStyle(fontWeight: FontWeight.bold)),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
