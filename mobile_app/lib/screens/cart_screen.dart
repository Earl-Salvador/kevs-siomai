import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/shop_provider.dart';
import '../services/offline_service.dart';

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _notesController = TextEditingController();

  String _orderType = 'pickup'; // 'pickup' or 'delivery'
  String _paymentMethod = 'GCash'; // 'GCash' or 'Cash'
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final profile = await OfflineService.getCustomerProfile();
    if (mounted) {
      setState(() {
        if (profile['name']?.isNotEmpty ?? false) {
          _nameController.text = profile['name']!;
        }
        if (profile['phone']?.isNotEmpty ?? false) {
          _phoneController.text = profile['phone']!;
        }
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _handleCheckout(ShopProvider shop) async {
    if (shop.cart.isEmpty) return;
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    final order = await shop.submitOrder(
      customerName: _nameController.text.trim(),
      customerPhone: _phoneController.text.trim(),
      orderType: _orderType,
      deliveryAddress: _addressController.text.trim(),
      paymentMethod: _paymentMethod,
      notes: _notesController.text.trim(),
    );

    setState(() => _isSubmitting = false);

    if (!mounted) return;

    if (order != null) {
      // Order placed successfully on backend
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: Row(
            children: [
              const Icon(Icons.check_circle, color: Colors.green),
              const SizedBox(width: 8),
              const Text('Order Placed!'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Your Queue Ticket: #${order.queueNo}',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFFC62828)),
              ),
              const SizedBox(height: 8),
              Text('Order Type: ${order.orderType.toUpperCase()}'),
              Text('Payment: ${order.paymentMethod} (${order.paymentStatus})'),
              Text('Total: ₱${order.totalAmount.toStringAsFixed(2)}'),
              const SizedBox(height: 12),
              const Text(
                'Your order has been sent to Boss KEVS and added to the live unified queue.',
                style: TextStyle(fontSize: 13, color: Colors.black87),
              ),
            ],
          ),
          actions: [
            if (order.paymentMethod == 'GCash' && order.paymentStatus == 'pending')
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF007DFE), foregroundColor: Colors.white),
                icon: const Icon(Icons.payment),
                label: const Text('Pay with GCash'),
                onPressed: () async {
                  Navigator.pop(ctx);
                  final success = await shop.processGCashPayment(order);
                  if (!mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(success ? 'GCash payment confirmed!' : 'Payment simulation complete'),
                      backgroundColor: success ? Colors.green : Colors.grey.shade800,
                    ),
                  );
                  Navigator.pop(context); // Back to catalog
                },
              ),
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                Navigator.pop(context); // Back to catalog
              },
              child: const Text('View Status in Queue'),
            ),
          ],
        ),
      );
    } else {
      // Check if saved offline
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Row(
            children: [
              Icon(Icons.cloud_off, color: Colors.amber.shade800),
              const SizedBox(width: 8),
              const Text('Saved Offline'),
            ],
          ),
          content: const Text(
            'Cannot reach server. Your order has been saved offline on your device and will automatically sync once connectivity is restored.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                Navigator.pop(context);
              },
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final shop = context.watch<ShopProvider>();
    final items = shop.cart.values.toList();
    final deliveryFee = _orderType == 'delivery' ? 30.0 : 0.0;
    final grandTotal = shop.cartTotal + deliveryFee;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout & Cart'),
        actions: [
          if (items.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined),
              tooltip: 'Clear Cart',
              onPressed: () => shop.clearCart(),
            ),
        ],
      ),
      body: items.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.shopping_cart_outlined, size: 70, color: Colors.grey.shade400),
                  const SizedBox(height: 12),
                  const Text('Your cart is empty', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Explore Menu'),
                  ),
                ],
              ),
            )
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ── Items List Card ──
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Order Items',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                          const Divider(),
                          ...items.map((it) => Padding(
                                padding: const EdgeInsets.symmetric(vertical: 6),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(it.productName, style: const TextStyle(fontWeight: FontWeight.w600)),
                                          Text(
                                            '₱${it.unitPrice.toStringAsFixed(2)} each',
                                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Row(
                                      children: [
                                        IconButton(
                                          icon: const Icon(Icons.remove_circle_outline, size: 20),
                                          onPressed: () => shop.updateQuantity(it.productId, -1),
                                        ),
                                        Text('${it.quantity}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                        IconButton(
                                          icon: const Icon(Icons.add_circle_outline, size: 20),
                                          onPressed: () => shop.updateQuantity(it.productId, 1),
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          '₱${it.subtotal.toStringAsFixed(2)}',
                                          style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFC62828)),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              )),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Fulfillment Type ──
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Fulfillment Option', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: ChoiceChip(
                                  avatar: const Icon(Icons.storefront, size: 18),
                                  label: const Center(child: Text('Store Pickup')),
                                  selected: _orderType == 'pickup',
                                  selectedColor: const Color(0xFFC62828),
                                  labelStyle: TextStyle(
                                    color: _orderType == 'pickup' ? Colors.white : Colors.black87,
                                    fontWeight: FontWeight.bold,
                                  ),
                                  onSelected: (val) {
                                    if (val) setState(() => _orderType = 'pickup');
                                  },
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: ChoiceChip(
                                  avatar: const Icon(Icons.delivery_dining, size: 18),
                                  label: const Center(child: Text('Delivery (+₱30)')),
                                  selected: _orderType == 'delivery',
                                  selectedColor: const Color(0xFFC62828),
                                  labelStyle: TextStyle(
                                    color: _orderType == 'delivery' ? Colors.white : Colors.black87,
                                    fontWeight: FontWeight.bold,
                                  ),
                                  onSelected: (val) {
                                    if (val) setState(() => _orderType = 'delivery');
                                  },
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Customer Details ──
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Customer Information', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _nameController,
                            decoration: const InputDecoration(
                              labelText: 'Your Name *',
                              prefixIcon: Icon(Icons.person_outline),
                              border: OutlineInputBorder(),
                            ),
                            validator: (val) => val == null || val.trim().isEmpty ? 'Please enter your name' : null,
                          ),
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _phoneController,
                            keyboardType: TextInputType.phone,
                            decoration: const InputDecoration(
                              labelText: 'Phone Number (e.g. 09171234567) *',
                              prefixIcon: Icon(Icons.phone_outlined),
                              border: OutlineInputBorder(),
                            ),
                            validator: (val) => val == null || val.trim().isEmpty ? 'Please enter contact number' : null,
                          ),
                          if (_orderType == 'delivery') ...[
                            const SizedBox(height: 10),
                            TextFormField(
                              controller: _addressController,
                              maxLines: 2,
                              decoration: const InputDecoration(
                                labelText: 'Delivery Address *',
                                prefixIcon: Icon(Icons.location_on_outlined),
                                border: OutlineInputBorder(),
                                hintText: 'House No, Street, Brgy, Town/City',
                              ),
                              validator: (val) =>
                                  _orderType == 'delivery' && (val == null || val.trim().isEmpty)
                                      ? 'Address required for delivery'
                                      : null,
                            ),
                          ],
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _notesController,
                            decoration: const InputDecoration(
                              labelText: 'Special Requests / Notes (Optional)',
                              prefixIcon: Icon(Icons.note_alt_outlined),
                              border: OutlineInputBorder(),
                              hintText: 'e.g. extra chili sauce, no calamansi',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Payment Method ──
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Payment Method', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          InkWell(
                            onTap: () => setState(() => _paymentMethod = 'GCash'),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: _paymentMethod == 'GCash' ? const Color(0xFF007DFE).withValues(alpha: 0.08) : Colors.transparent,
                                border: Border.all(
                                  color: _paymentMethod == 'GCash' ? const Color(0xFF007DFE) : Colors.grey.shade300,
                                  width: _paymentMethod == 'GCash' ? 2 : 1,
                                ),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF007DFE),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      'GCash',
                                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  const Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('GCash Digital e-Wallet', style: TextStyle(fontWeight: FontWeight.bold)),
                                        Text('Fast & contactless confirmation', style: TextStyle(fontSize: 12, color: Colors.grey)),
                                      ],
                                    ),
                                  ),
                                  if (_paymentMethod == 'GCash')
                                    const Icon(Icons.check_circle, color: Color(0xFF007DFE))
                                  else
                                    Icon(Icons.circle_outlined, color: Colors.grey.shade400),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          InkWell(
                            onTap: () => setState(() => _paymentMethod = 'Cash'),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: _paymentMethod == 'Cash' ? const Color(0xFFC62828).withValues(alpha: 0.08) : Colors.transparent,
                                border: Border.all(
                                  color: _paymentMethod == 'Cash' ? const Color(0xFFC62828) : Colors.grey.shade300,
                                  width: _paymentMethod == 'Cash' ? 2 : 1,
                                ),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFC62828),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      'Cash',
                                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  const Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('Cash (Counter / COD)', style: TextStyle(fontWeight: FontWeight.bold)),
                                        Text('Pay when you receive your siomai', style: TextStyle(fontSize: 12, color: Colors.grey)),
                                      ],
                                    ),
                                  ),
                                  if (_paymentMethod == 'Cash')
                                    const Icon(Icons.check_circle, color: Color(0xFFC62828))
                                  else
                                    Icon(Icons.circle_outlined, color: Colors.grey.shade400),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // ── Total Summary & Checkout Button ──
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    color: Colors.red.shade50,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('Items Subtotal:'),
                              Text('₱${shop.cartTotal.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                            ],
                          ),
                          if (_orderType == 'delivery') ...[
                            const SizedBox(height: 4),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Delivery Fee:'),
                                Text('₱${deliveryFee.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ],
                          const Divider(),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Grand Total:',
                                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                              ),
                              Text(
                                '₱${grandTotal.toStringAsFixed(2)}',
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFFC62828),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFFC62828),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              icon: _isSubmitting
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                    )
                                  : const Icon(Icons.check),
                              label: Text(
                                _isSubmitting
                                    ? 'Placing Order...'
                                    : 'Place Order • ₱${grandTotal.toStringAsFixed(2)}',
                                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                              onPressed: _isSubmitting ? null : () => _handleCheckout(shop),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
