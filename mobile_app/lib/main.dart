import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/shop_provider.dart';
import 'screens/home_screen.dart';
import 'screens/queue_tracking_screen.dart';
import 'screens/store_location_screen.dart';
import 'screens/settings_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BossKevsApp());
}

class BossKevsApp extends StatelessWidget {
  const BossKevsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ShopProvider()),
      ],
      child: MaterialApp(
        title: 'BOSS KEVS Siomai',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFFC62828), // Boss Kevs Red
            primary: const Color(0xFFC62828),
            secondary: Colors.amber.shade700,
          ),
          appBarTheme: const AppBarTheme(
            backgroundColor: Color(0xFFC62828),
            foregroundColor: Colors.white,
            elevation: 2,
            centerTitle: false,
          ),
        ),
        home: const MainNavigationShell(),
      ),
    );
  }
}

class MainNavigationShell extends StatefulWidget {
  const MainNavigationShell({super.key});

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  int _currentIndex = 0;

  void _switchTab(int index) {
    setState(() => _currentIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    final shop = context.watch<ShopProvider>();
    final activeCount = shop.activeOrders.where((o) => !o.isCompleted).length;

    final pages = [
      HomeScreen(onGoToQueue: () => _switchTab(1)),
      const QueueTrackingScreen(),
      const StoreLocationScreen(),
      const SettingsScreen(),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: _switchTab,
        indicatorColor: const Color(0xFFC62828).withValues(alpha: 0.18),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.restaurant_menu_outlined),
            selectedIcon: Icon(Icons.restaurant_menu, color: Color(0xFFC62828)),
            label: 'Menu',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: activeCount > 0,
              label: Text('$activeCount'),
              child: const Icon(Icons.confirmation_number_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: activeCount > 0,
              label: Text('$activeCount'),
              child: const Icon(Icons.confirmation_number, color: Color(0xFFC62828)),
            ),
            label: 'Queue',
          ),
          const NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map, color: Color(0xFFC62828)),
            label: 'Store Map',
          ),
          const NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings, color: Color(0xFFC62828)),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}
