import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/product.dart';
import '../providers/shop_provider.dart';

class ProductCard extends StatelessWidget {
  final Product product;

  const ProductCard({super.key, required this.product});

  IconData _getCategoryIcon(String category) {
    final cat = category.toLowerCase();
    if (cat.contains('drink') || cat.contains('beverage')) {
      return Icons.local_drink_rounded;
    } else if (cat.contains('add') || cat.contains('sauce')) {
      return Icons.soup_kitchen_outlined;
    }
    return Icons.lunch_dining_rounded;
  }

  Color _getCategoryColor(String category) {
    final cat = category.toLowerCase();
    if (cat.contains('drink') || cat.contains('beverage')) return const Color(0xFF0288D1);
    if (cat.contains('add') || cat.contains('sauce') || cat.contains('condiment')) return const Color(0xFFE65100);
    return const Color(0xFFC62828);
  }

  Widget _buildProductImage(Color catColor, bool isOut) {
    Widget fallbackIcon() => Container(
          color: catColor.withValues(alpha: 0.08),
          child: Center(
            child: Icon(
              _getCategoryIcon(product.category),
              size: 46,
              color: catColor.withValues(alpha: isOut ? 0.3 : 0.8),
            ),
          ),
        );

    // 1. Try local bundled asset first
    if (product.assetPath.isNotEmpty) {
      return Image.asset(
        product.assetPath,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        errorBuilder: (context, error, stackTrace) {
          // Fallback to online image if asset fails
          if (product.onlineFallbackUrl.isNotEmpty) {
            return Image.network(
              product.onlineFallbackUrl,
              fit: BoxFit.cover,
              width: double.infinity,
              height: double.infinity,
              errorBuilder: (context, error, stackTrace) => fallbackIcon(),
            );
          }
          return fallbackIcon();
        },
      );
    }

    // 2. Try network URL
    final netUrl = product.imageUrl.startsWith('http')
        ? product.imageUrl
        : (product.onlineFallbackUrl.isNotEmpty
            ? product.onlineFallbackUrl
            : '');

    if (netUrl.isNotEmpty) {
      return Image.network(
        netUrl,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        loadingBuilder: (context, child, progress) {
          if (progress == null) return child;
          return Container(
            color: Colors.grey.shade100,
            child: Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: catColor,
                ),
              ),
            ),
          );
        },
        errorBuilder: (context, error, stackTrace) => fallbackIcon(),
      );
    }

    return fallbackIcon();
  }

  void _showProductDetails(BuildContext context) {
    final catColor = _getCategoryColor(product.category);
    final isOut = product.stock <= 0;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Consumer<ShopProvider>(
          builder: (ctx, shop, _) {
            final cartItem = shop.cart[product.id];
            final inCart = cartItem != null && cartItem.quantity > 0;
            final qty = inCart ? cartItem.quantity : 0;

            return Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: SizedBox(
                      height: 180,
                      width: double.infinity,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          _buildProductImage(catColor, isOut),
                          Positioned(
                            top: 10,
                            left: 10,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.65),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(_getCategoryIcon(product.category), size: 13, color: Colors.white),
                                  const SizedBox(width: 4),
                                  Text(
                                    product.category,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
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
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          product.name,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF1E293B),
                          ),
                        ),
                      ),
                      Text(
                        '₱${product.price % 1 == 0 ? product.price.toInt() : product.price.toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFFC62828),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  if (product.description.isNotEmpty)
                    Text(
                      product.description,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade600,
                        height: 1.4,
                      ),
                    ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(
                        isOut ? Icons.cancel_outlined : Icons.check_circle_outline,
                        size: 16,
                        color: isOut
                            ? Colors.red
                            : (product.isLowStock ? Colors.orange : Colors.green),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        isOut
                            ? 'Currently Out of Stock'
                            : '${product.stock} ${product.unit} available',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: isOut
                              ? Colors.red
                              : (product.isLowStock
                                  ? Colors.orange.shade800
                                  : Colors.green.shade700),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  if (!isOut)
                    Row(
                      children: [
                        if (inCart) ...[
                          Container(
                            decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.grey.shade300),
                            ),
                            child: Row(
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.remove, size: 18),
                                  onPressed: () =>
                                      shop.updateQuantity(product.id, -1),
                                ),
                                Text(
                                  '$qty',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.add, size: 18),
                                  onPressed: qty < product.stock
                                      ? () =>
                                          shop.updateQuantity(product.id, 1)
                                      : null,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                        ],
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFFC62828),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                              elevation: 2,
                            ),
                            icon: Icon(inCart
                                ? Icons.shopping_bag_outlined
                                : Icons.add_shopping_cart_rounded),
                            label: Text(
                              inCart
                                  ? 'Added to Order ($qty in cart)'
                                  : 'Add to Order • ₱${product.price % 1 == 0 ? product.price.toInt() : product.price.toStringAsFixed(2)}',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            onPressed: () {
                              if (!inCart) {
                                shop.addToCart(product);
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final shop = context.watch<ShopProvider>();
    final cartItem = shop.cart[product.id];
    final inCart = cartItem != null && cartItem.quantity > 0;
    final isOut = product.stock <= 0;
    final isLow = product.isLowStock;
    final catColor = _getCategoryColor(product.category);

    return InkWell(
      onTap: () => _showProductDetails(context),
      borderRadius: BorderRadius.circular(18),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: inCart
              ? Border.all(color: const Color(0xFFC62828), width: 2)
              : Border.all(color: Colors.grey.shade200, width: 1),
          boxShadow: [
            BoxShadow(
              color: inCart
                  ? const Color(0xFFC62828).withValues(alpha: 0.16)
                  : Colors.black.withValues(alpha: 0.05),
              blurRadius: inCart ? 14 : 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(17),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Product Image Header ──
              SizedBox(
                height: 110,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _buildProductImage(catColor, isOut),

                    // Subtle bottom gradient shadow over image
                    Positioned(
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 40,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.transparent,
                              Colors.black.withValues(alpha: 0.35),
                            ],
                          ),
                        ),
                      ),
                    ),

                    // Category Pill top-left
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.6),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.3),
                            width: 0.5,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(_getCategoryIcon(product.category), size: 11, color: Colors.white),
                            const SizedBox(width: 3),
                            Text(
                              product.category,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Sold out overlay
                    if (isOut)
                      Container(
                        color: Colors.black.withValues(alpha: 0.6),
                        child: Center(
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFFC62828),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'SOLD OUT',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),
                        ),
                      )
                    else if (isLow)
                      Positioned(
                        top: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.orange.shade800,
                            borderRadius: BorderRadius.circular(10),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.25),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                          child: const Text(
                            'LOW STOCK',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ),

                    // In-Cart Badge bottom-right of image
                    if (inCart)
                      Positioned(
                        bottom: 6,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFC62828),
                            borderRadius: BorderRadius.circular(10),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.3),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                          child: Text(
                            '${cartItem.quantity} in cart',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              // ── Product Details Body ──
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Product Title
                    Text(
                      product.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: isOut ? Colors.grey.shade600 : const Color(0xFF1E293B),
                      ),
                    ),
                    const SizedBox(height: 2),

                    // Stock Pill
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: isOut
                                ? Colors.grey
                                : (isLow
                                    ? Colors.orange.shade700
                                    : Colors.green.shade600),
                          ),
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            isOut
                                ? 'Not available'
                                : '${product.stock} ${product.unit} left',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600,
                              color: isOut
                                  ? Colors.grey.shade500
                                  : (isLow
                                      ? Colors.orange.shade800
                                      : Colors.green.shade700),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // Price & Action Button
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Flexible(
                          child: Text(
                            '₱${product.price % 1 == 0 ? product.price.toInt() : product.price.toStringAsFixed(2)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              color: isOut
                                  ? Colors.grey.shade500
                                  : const Color(0xFFC62828),
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),

                        // Action: Add / Stepper
                        if (inCart)
                          Container(
                            height: 28,
                            decoration: BoxDecoration(
                              color: const Color(0xFFC62828).withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: const Color(0xFFC62828).withValues(alpha: 0.4),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                GestureDetector(
                                  onTap: () =>
                                      shop.updateQuantity(product.id, -1),
                                  child: const Padding(
                                    padding:
                                        EdgeInsets.symmetric(horizontal: 7),
                                    child: Icon(Icons.remove,
                                        size: 13, color: Color(0xFFC62828)),
                                  ),
                                ),
                                Text(
                                  '${cartItem.quantity}',
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w900,
                                    color: Color(0xFFC62828),
                                  ),
                                ),
                                GestureDetector(
                                  onTap: cartItem.quantity < product.stock
                                      ? () =>
                                          shop.updateQuantity(product.id, 1)
                                      : null,
                                  child: Padding(
                                    padding:
                                        const EdgeInsets.symmetric(horizontal: 7),
                                    child: Icon(
                                      Icons.add,
                                      size: 13,
                                      color: cartItem.quantity < product.stock
                                          ? const Color(0xFFC62828)
                                          : Colors.grey.shade400,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          )
                        else
                          GestureDetector(
                            onTap: isOut ? null : () => shop.addToCart(product),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: isOut
                                    ? Colors.grey.shade200
                                    : const Color(0xFFC62828),
                                shape: BoxShape.circle,
                                boxShadow: isOut
                                    ? null
                                    : [
                                        BoxShadow(
                                          color: const Color(0xFFC62828)
                                              .withValues(alpha: 0.35),
                                          blurRadius: 6,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                              ),
                              child: Icon(
                                Icons.add,
                                size: 16,
                                color: isOut ? Colors.grey.shade400 : Colors.white,
                              ),
                            ),
                          ),
                      ],
                    ),
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
