import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/shop_provider.dart';
import '../services/offline_service.dart';
import '../widgets/gcash_qr_dialog.dart';

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

  String _selectedGatidSitio = 'Batisan (Near Boss KEVS)';
  final List<String> _gatidSitios = [
    'Batisan (Near Boss KEVS)',
    'National Highway, Gatid',
    'Sitio Ilaya, Gatid',
    'Sitio Ibaba, Gatid',
    'Sitio Maligaya, Gatid',
    'Gatid Elementary School Vicinity',
    'Other Area in Brgy. Gatid',
  ];

  String _buildFullDeliveryAddress() {
    final street = _addressController.text.trim();
    if (street.isEmpty) return '';
    return '$street, $_selectedGatidSitio, Brgy. Gatid, Santa Cruz, Laguna';
  }

  bool _isAddressInGatid(String addr) {
    if (_orderType != 'delivery') return true;
    final lower = addr.toLowerCase();
    return lower.contains('gatid') || lower.contains('batisan');
  }

  void _showOutsideDeliveryDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: const [
            Icon(Icons.location_off_rounded, color: Color(0xFFC62828)),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Outside Delivery Area',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              'Paumanhin, ang Boss KEVS delivery ay para lamang sa Barangay Gatid, Santa Cruz, Laguna.',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)),
            ),
            SizedBox(height: 8),
            Text(
              'Kapag wala sa Gatid ang iyong address, hindi po makakapag-deliver ang aming rider. Mangyaring lumipat sa "Store Pickup" upang maihanda ang iyong order sa tindahan (070 Batisan, Gatid, Santa Cruz, Laguna).',
              style: TextStyle(fontSize: 12.5, color: Colors.black87, height: 1.3),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('I-edit ang Address'),
          ),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFC62828),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            icon: const Icon(Icons.storefront_rounded, size: 16),
            label: const Text('Lumipat sa Store Pickup'),
            onPressed: () {
              Navigator.pop(ctx);
              setState(() => _orderType = 'pickup');
            },
          ),
        ],
      ),
    );
  }

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

    final fullDeliveryAddress = _orderType == 'delivery' ? _buildFullDeliveryAddress() : '';

    if (_orderType == 'delivery' && !_isAddressInGatid(fullDeliveryAddress)) {
      _showOutsideDeliveryDialog();
      return;
    }

    setState(() => _isSubmitting = true);

    final order = await shop.submitOrder(
      customerName: _nameController.text.trim(),
      customerPhone: _phoneController.text.trim(),
      orderType: _orderType,
      deliveryAddress: fullDeliveryAddress,
      paymentMethod: _paymentMethod,
      notes: _notesController.text.trim(),
    );

    setState(() => _isSubmitting = false);

    if (!mounted) return;

    if (order != null) {
      if (order.paymentMethod == 'GCash') {
        // Automatically display GCash QR code for payment
        await GCashQRDialog.show(
          context,
          order: order,
          totalAmount: order.totalAmount,
        );
        if (!mounted) return;
        Navigator.pop(context); // Back to catalog
      } else {
        // Order placed successfully on backend (Cash)
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: Row(
              children: const [
                Icon(Icons.check_circle, color: Colors.green),
                SizedBox(width: 8),
                Text('Order Placed!'),
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
                if (order.orderType == 'delivery' && order.deliveryAddress.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4.0),
                    child: Text(
                      'Delivery to: ${order.deliveryAddress}',
                      style: const TextStyle(fontSize: 12, color: Colors.black87),
                    ),
                  ),
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
      }
    } else if (shop.errorMessage != null && shop.errorMessage!.isNotEmpty) {
      // Backend returned specific validation error (e.g. delivery restriction)
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: const [
              Icon(Icons.warning_amber_rounded, color: Color(0xFFC62828)),
              SizedBox(width: 8),
              Text('Paunawa sa Delivery'),
            ],
          ),
          content: Text(shop.errorMessage!),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
            if (_orderType == 'delivery')
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFC62828),
                  foregroundColor: Colors.white,
                ),
                icon: const Icon(Icons.storefront_rounded, size: 16),
                label: const Text('Lumipat sa Store Pickup'),
                onPressed: () {
                  Navigator.pop(ctx);
                  setState(() => _orderType = 'pickup');
                },
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
          : Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 720),
                child: Form(
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
                          if (_orderType == 'delivery') ...[
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF2F2),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: const Color(0xFFFECACA)),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: const [
                                  Icon(Icons.location_on, size: 18, color: Color(0xFFDC2626)),
                                  SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      'Delivery Area: Eksklusibo lamang sa Barangay Gatid, Santa Cruz, Laguna ang aming delivery. Kapag nasa labas ng Gatid, mangyaring piliin ang Store Pickup.',
                                      style: TextStyle(fontSize: 11.5, color: Color(0xFF991B1B), height: 1.3),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
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
                            const SizedBox(height: 12),
                            // Zone / Sitio Selector in Gatid
                            DropdownButtonFormField<String>(
                              initialValue: _selectedGatidSitio,
                              decoration: const InputDecoration(
                                labelText: 'Sitio / Zone sa Brgy. Gatid *',
                                prefixIcon: Icon(Icons.map_outlined),
                                border: OutlineInputBorder(),
                                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                              ),
                              items: _gatidSitios.map((sitio) {
                                return DropdownMenuItem(
                                  value: sitio,
                                  child: Text(sitio, style: const TextStyle(fontSize: 13.5)),
                                );
                              }).toList(),
                              onChanged: (val) {
                                if (val != null) {
                                  setState(() => _selectedGatidSitio = val);
                                }
                              },
                            ),
                            const SizedBox(height: 10),
                            TextFormField(
                              controller: _addressController,
                              maxLines: 2,
                              decoration: const InputDecoration(
                                labelText: 'House No., Street & Landmark (sa Gatid) *',
                                prefixIcon: Icon(Icons.home_outlined),
                                border: OutlineInputBorder(),
                                hintText: 'Hal. House #070, Batisan, malapit sa Chapel',
                              ),
                              validator: (val) {
                                if (_orderType != 'delivery') return null;
                                if (val == null || val.trim().isEmpty) {
                                  return 'Address required for delivery';
                                }
                                final lower = val.toLowerCase();
                                final outsideKeywords = [
                                  'pagsanjan', 'pila', 'victoria', 'calamba', 'los banos', 'san pablo',
                                  'bubukal', 'bagumbayan', 'pagsawitan', 'calios', 'santisima cruz',
                                  'san jose', 'alipit', 'palasan', 'duhat', 'labuin', 'patimbao', 'manila'
                                ];
                                for (final out in outsideKeywords) {
                                  if (lower.contains(out) && !lower.contains('gatid')) {
                                    return 'Hindi sakop ang $out. Available lamang sa loob ng Brgy. Gatid!';
                                  }
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.check_circle_rounded, size: 14, color: Colors.green),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    'Delivery to: Brgy. Gatid, Santa Cruz, Laguna (+₱30.00)',
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.grey.shade700,
                                    ),
                                  ),
                                ),
                              ],
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
                          if (_paymentMethod == 'GCash')
                            Container(
                              margin: const EdgeInsets.only(top: 8, bottom: 4),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: const Color(0xFF007DFE).withValues(alpha: 0.05),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: const Color(0xFF007DFE).withValues(alpha: 0.25)),
                              ),
                              child: Column(
                                children: [
                                  Row(
                                    children: [
                                      const Icon(Icons.qr_code_2, color: Color(0xFF007DFE), size: 20),
                                      const SizedBox(width: 8),
                                      const Expanded(
                                        child: Text(
                                          'Scan GCash QR Code',
                                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF0056B3)),
                                        ),
                                      ),
                                      InkWell(
                                        onTap: () => GCashQRDialog.show(
                                          context,
                                          totalAmount: shop.cartTotal,
                                        ),
                                        child: const Padding(
                                          padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          child: Text(
                                            'Tap to Zoom',
                                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF007DFE)),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  InkWell(
                                    onTap: () => GCashQRDialog.show(
                                      context,
                                      totalAmount: shop.cartTotal,
                                    ),
                                    child: Container(
                                      padding: const EdgeInsets.all(6),
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(color: Colors.grey.shade300),
                                      ),
                                      child: ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: Image.asset(
                                          'assets/images/gcash_qr.png',
                                          height: 190,
                                          width: double.infinity,
                                          fit: BoxFit.contain,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text('Account: ', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                      Text('JO*N LL**D C. (0921 296 ••••)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.black87)),
                                    ],
                                  ),
                                ],
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
          ),
        ),
    );
  }
}
