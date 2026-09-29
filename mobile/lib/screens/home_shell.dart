import 'dart:async';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';
import 'alerts_screen.dart';
import 'fleet_screen.dart';
import 'settings_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  StreamSubscription<Alert>? _sub;

  @override
  void initState() {
    super.initState();
    // In-app banner for alerts that arrive while the app is open.
    _sub = AppScope.read(context).alertStream.listen((a) {
      if (!mounted) return;
      final name = AppScope.read(context).device(a.device)?.label ?? a.device;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        backgroundColor: Palette.severity(a.severity),
        content: Row(children: [
          Icon(context.alertIcon(a.kind), color: Colors.white),
          const SizedBox(width: 12),
          Expanded(child: Text('$name · ${context.alertTitle(a)}')),
        ]),
        action: SnackBarAction(
          label: context.l.alerts,
          textColor: Colors.white,
          onPressed: () => setState(() => _tab = 1),
        ),
      ));
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final l = context.l;
    return Scaffold(
      body: IndexedStack(index: _tab, children: const [
        FleetScreen(),
        AlertsScreen(),
        SettingsScreen(),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.map_outlined), selectedIcon: const Icon(Icons.map_rounded), label: l.garage),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: s.unreadAlerts > 0,
              label: Text(context.n(s.unreadAlerts)),
              child: const Icon(Icons.notifications_outlined),
            ),
            selectedIcon: const Icon(Icons.notifications_rounded),
            label: l.alerts,
          ),
          NavigationDestination(icon: const Icon(Icons.tune_outlined), selectedIcon: const Icon(Icons.tune_rounded), label: l.settings),
        ],
      ),
    );
  }
}
