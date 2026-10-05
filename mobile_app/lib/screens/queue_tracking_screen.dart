import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/shop_provider.dart';
import '../models/order.dart';
import '../widgets/order_status_badge.dart';
import '../widgets/review_dialog.dart';
import '../widgets/gcash_qr_dialog.dart';

class QueueTrackingScreen extends StatelessWidget {
  const QueueTrackingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final shop = context.watch<ShopProvider>();
    final queue = shop.queueStatus;
    final activeOrders = shop.activeOrders;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Live Queue & Orders'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh Queue',
            onPressed: () async {
              await shop.refreshQueue();
              await shop.refreshActiveOrders();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await shop.refreshQueue();
          await shop.refreshActiveOrders();
        },
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
            // ── Live Unified Queue Header Card (ESP32 / OLED synchronized) ──
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFC62828), Color(0xFF8E0000)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: Colors.red.shade900.withValues(alpha: 0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: const BoxDecoration(
                              color: Colors.greenAccent,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            'ESP32 UNIFIED QUEUE',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 1,
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '${queue?.activeOrders ?? 0} active in line',
                          style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'NOW SERVING',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      queue != null && queue.hasActive && queue.nowServing > 0
                          ? '#${queue.nowServing}'
                          : 'No orders yet!',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 42,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    queue != null && queue.currentQueueNo > 0
                        ? 'Latest Ticket Assigned: #${queue.currentQueueNo}'
                        : 'Counter is ready for new orders',
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // ── Section Title ──
            const Text(
              'Your Active Orders',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),

            if (activeOrders.isEmpty && shop.pendingOfflineOrders.isEmpty)
              Card(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 16),
                  child: Column(
                    children: [
                      Icon(Icons.receipt_long_outlined, size: 54, color: Colors.grey.shade400),
                      const SizedBox(height: 12),
                      const Text(
                        'No orders placed yet',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Order delicious siomai from the menu to get a queue ticket number!',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
              )
            else ...[
              // Pending offline orders
              ...shop.pendingOfflineOrders.map((o) => _buildOfflineCard(context, shop, o)),
              // Active orders
              ...activeOrders.map((order) => _buildOrderTrackerCard(context, shop, order, queue?.nowServing ?? 0)),
            ],
          ],
        ),
      ),
    ),
  ),
);
}

  Widget _buildOfflineCard(BuildContext context, ShopProvider shop, CustomerOrder order) {
    return Card(
      color: Colors.amber.shade50,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.amber.shade300),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.cloud_off, color: Colors.amber.shade900, size: 20),
                const SizedBox(width: 8),
                const Text(
                  'Pending Offline Sync',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                const Spacer(),
                Text(
                  '₱${order.totalAmount.toStringAsFixed(2)}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${order.orderType.toUpperCase()} • ${order.paymentMethod} • ${order.items.length} item(s)',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber.shade800,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              ),
              icon: const Icon(Icons.sync, size: 16),
              label: const Text('Sync to Server Now'),
              onPressed: () async {
                final count = await shop.syncOfflineOrders();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Synced $count order(s) to backend!')),
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrderTrackerCard(BuildContext context, ShopProvider shop, CustomerOrder order, int nowServing) {
    final isServing = nowServing == order.queueNo && !order.isCompleted;
    final isAhead = order.queueNo > nowServing && !order.isCompleted;
    final ordersAhead = order.queueNo > nowServing ? order.queueNo - nowServing : 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: isServing
            ? const BorderSide(color: Colors.green, width: 2)
            : BorderSide(color: Colors.grey.shade200),
      ),
      elevation: isServing ? 4 : 1,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with Ticket No & Status
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: isServing ? Colors.green : const Color(0xFFC62828),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        'Ticket #${order.queueNo}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w900,
                          fontSize: 15,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        order.orderType.toUpperCase(),
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                OrderStatusBadge(status: order.status),
              ],
            ),
            const SizedBox(height: 12),

            // Live Queue Position banner
            if (isServing)
              Container(
                margin: const EdgeInsets.symmetric(vertical: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.green.shade300),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.campaign, color: Colors.green),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'YOUR TICKET IS NOW BEING SERVED! Please proceed to counter / await rider.',
                        style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 12),
                      ),
                    ),
                  ],
                ),
              )
            else if (isAhead)
              Container(
                margin: const EdgeInsets.symmetric(vertical: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Icon(Icons.timelapse, color: Colors.orange.shade800, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      '$ordersAhead order(s) ahead in line • Est. ${ordersAhead * 3} mins',
                      style: TextStyle(color: Colors.orange.shade900, fontWeight: FontWeight.w600, fontSize: 12),
                    ),
                  ],
                ),
              ),

            // Status Progress Visualizer
            const SizedBox(height: 8),
            _buildStatusTimeline(order.status, order.orderType),
            const SizedBox(height: 12),

            // Items List
            const Text('Items Ordered:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey)),
            const SizedBox(height: 4),
            ...order.items.map((it) => Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('• ${it.quantity}x ${it.productName}', style: const TextStyle(fontSize: 13)),
                    Text('₱${it.subtotal.toStringAsFixed(2)}', style: const TextStyle(fontSize: 13, color: Colors.black87)),
                  ],
                )),
            const Divider(),

            // Payment and Actions
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Payment: ${order.paymentMethod}',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    Row(
                      children: [
                        Icon(
                          order.paymentStatus == 'confirmed'
                              ? Icons.check_circle_rounded
                              : Icons.access_time_rounded,
                          size: 13,
                          color: order.paymentStatus == 'confirmed'
                              ? Colors.green
                              : Colors.amber.shade900,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          order.paymentStatus == 'confirmed'
                              ? 'Paid'
                              : 'Pending Payment',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: order.paymentStatus == 'confirmed'
                                ? Colors.green
                                : Colors.amber.shade900,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'Total: ₱${order.totalAmount.toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFFC62828)),
                    ),
                    if (order.paymentMethod == 'GCash' && order.paymentStatus != 'confirmed' && !order.isCompleted)
                      Padding(
                        padding: const EdgeInsets.only(top: 4.0),
                        child: TextButton.icon(
                          style: TextButton.styleFrom(
                            backgroundColor: const Color(0xFF007DFE),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            minimumSize: Size.zero,
                          ),
                          icon: const Icon(Icons.qr_code_2, size: 14),
                          label: const Text('Pay with GCash QR', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                          onPressed: () async {
                            await GCashQRDialog.show(
                              context,
                              order: order,
                              totalAmount: order.totalAmount,
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ],
            ),
            if (order.isCompleted)
              Padding(
                padding: const EdgeInsets.only(top: 10.0),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.amber.shade700,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    icon: const Icon(Icons.star_rounded, size: 17),
                    label: const Text('Rate this Order (1 - 5 Stars)'),
                    onPressed: () => ReviewDialog.show(
                      context,
                      orderId: order.id,
                      initialCustomerName: order.customerName,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusTimeline(String status, String orderType) {
    final steps = [
      'Placed',
      'Accepted',
      'Preparing',
      orderType == 'delivery' ? 'Out for Delivery' : 'Ready for Pickup',
      orderType == 'delivery' ? 'Delivered' : 'Completed',
    ];

    int currentStep = 0;
    switch (status.toLowerCase()) {
      case 'pending':
        currentStep = 0;
        break;
      case 'accepted':
        currentStep = 1;
        break;
      case 'preparing':
        currentStep = 2;
        break;
      case 'ready_pickup':
      case 'ready_delivery':
      case 'out_for_delivery':
        currentStep = 3;
        break;
      case 'completed':
      case 'delivered':
        currentStep = 4;
        break;
      default:
        currentStep = 0;
    }

    return Row(
      children: List.generate(steps.length * 2 - 1, (index) {
        if (index.isOdd) {
          final stepIndex = index ~/ 2;
          final isPast = stepIndex < currentStep;
          return Expanded(
            child: Container(
              height: 3,
              color: isPast ? const Color(0xFFC62828) : Colors.grey.shade300,
            ),
          );
        } else {
          final stepIndex = index ~/ 2;
          final isDone = stepIndex <= currentStep;
          return Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: isDone ? const Color(0xFFC62828) : Colors.grey.shade300,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: isDone
                  ? const Icon(Icons.check, size: 11, color: Colors.white)
                  : Text('${stepIndex + 1}', style: const TextStyle(fontSize: 9, color: Colors.white)),
            ),
          );
        }
      }),
    );
  }
}
