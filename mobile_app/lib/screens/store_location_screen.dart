import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class StoreLocationScreen extends StatelessWidget {
  const StoreLocationScreen({super.key});

  static const double storeLat = 14.2604;
  static const double storeLng = 121.3836;
  static const String storeName = 'Boss KEVS Siomai';
  static const String storeAddress = '070 Batisan, Gatid, Santa Cruz, Laguna';
  static const String storeHours = 'Open Daily: 9:00 AM - 8:00 PM';
  static const String storePhone = '0917-123-4567';

  Future<void> _openGoogleMaps(BuildContext context) async {
    // Google Maps directions URL directed to 070 Batisan, Gatid, Santa Cruz, Laguna
    final destination = Uri.encodeComponent(storeAddress);
    final url = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$destination');
    final coordUrl = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$storeLat,$storeLng');

    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      } else if (await canLaunchUrl(coordUrl)) {
        await launchUrl(coordUrl, mode: LaunchMode.externalApplication);
      } else {
        await launchUrl(url, mode: LaunchMode.platformDefault);
      }
    } catch (e) {
      try {
        await launchUrl(url, mode: LaunchMode.platformDefault);
      } catch (err) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error launching navigation: $err')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Store Location & Map'),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
          children: [
            // ── Store Visual Card (Tappable Map Card) ──
            Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () => _openGoogleMaps(context),
                child: Container(
                  height: 180,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    gradient: LinearGradient(
                      colors: [Colors.red.shade900, const Color(0xFFC62828), Colors.orange.shade800],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.red.shade900.withValues(alpha: 0.3),
                        blurRadius: 10,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: Stack(
                    children: [
                      Positioned(
                        right: -20,
                        bottom: -20,
                        child: Icon(Icons.location_on, size: 160, color: Colors.white.withValues(alpha: 0.12)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(20.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Text(
                                'TAP TO NAVIGATE',
                                style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              storeName,
                              style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              '070 Batisan, Gatid, Santa Cruz, Laguna',
                              style: TextStyle(color: Colors.white70, fontSize: 14),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ── One-Click Navigation CTA ──
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFC62828),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 3,
                ),
                icon: const Icon(Icons.directions, size: 24),
                label: const Text(
                  'Navigate in Google Maps',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                onPressed: () => _openGoogleMaps(context),
              ),
            ),
            const SizedBox(height: 16),

            // ── Store Information Details ──
            Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    _buildInfoRow(
                      Icons.place,
                      'Address',
                      storeAddress,
                      Colors.red,
                    ),
                    const Divider(height: 24),
                    _buildInfoRow(
                      Icons.access_time,
                      'Operating Hours',
                      storeHours,
                      Colors.blue,
                    ),
                    const Divider(height: 24),
                    _buildInfoRow(
                      Icons.phone,
                      'Contact Number',
                      storePhone,
                      Colors.green,
                    ),
                    const Divider(height: 24),
                    _buildInfoRow(
                      Icons.fastfood,
                      'Pickup Instructions',
                      'Show your queue ticket number at the counter upon arrival.',
                      Colors.orange,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ── Coordinates Info Pill ──
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.gps_fixed, size: 16, color: Colors.grey.shade700),
                  const SizedBox(width: 8),
                  Text(
                    'GPS: $storeLat, $storeLng',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade700, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  ),
);
}

  Widget _buildInfoRow(IconData icon, String title, String subtitle, MaterialColor color) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.shade50,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: color.shade700, size: 20),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.bold)),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.black87),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
