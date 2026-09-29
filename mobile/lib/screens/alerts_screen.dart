import 'dart:async';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';
import 'device_screen.dart';

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});
  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  List<Alert>? _alerts;
  Object? _error;
  String _filter = 'all';
  StreamSubscription<Alert>? _sub;

  @override
  void initState() {
    super.initState();
    _load();
    _sub = AppScope.read(context).alertStream.listen((a) {
      if (mounted && _alerts != null) setState(() => _alerts = [a, ..._alerts!]);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final s = AppScope.read(context);
    try {
      final (list, unread) = await s.api.alerts();
      s.setUnread(unread);
      if (mounted) {
        setState(() {
          _alerts = list;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _read(Alert a) async {
    if (a.isRead) return;
    final s = AppScope.read(context);
    setState(() => _alerts = [for (final x in _alerts!) x.id == a.id ? x.read() : x]);
    s.setUnread((s.unreadAlerts - 1).clamp(0, 1 << 30));
    try {
      await s.api.markRead(a.id);
    } catch (_) {}
  }

  Future<void> _readAll() async {
    final s = AppScope.read(context);
    try {
      await s.api.markAllRead();
      s.setUnread(0);
      if (mounted) setState(() => _alerts = [for (final a in _alerts ?? <Alert>[]) a.read()]);
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final l = context.l;
    final t = Theme.of(context);
    final list = (_alerts ?? const <Alert>[])
        .where((a) => _filter == 'all' || (_filter == 'unread' ? !a.isRead : a.severity == _filter))
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(l.alerts),
        actions: [
          if (s.unreadAlerts > 0)
            TextButton.icon(onPressed: _readAll, icon: const Icon(Icons.done_all_rounded), label: Text(l.markAllRead)),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: SizedBox(
            height: 52,
            child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), children: [
              for (final (k, label, color) in [
                ('all', '•', t.colorScheme.primary),
                ('unread', context.n(s.unreadAlerts), t.colorScheme.primary),
                ('critical', '!', Palette.alarm),
                ('warning', '!', Palette.ember),
                ('info', 'i', Palette.signal),
              ])
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: FilterChip(
                    selected: _filter == k,
                    onSelected: (_) => setState(() => _filter = k),
                    avatar: CircleAvatar(backgroundColor: color, child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 11))),
                    label: Text(switch (k) {
                      'all' => l.filterAll,
                      'unread' => l.filterUnread,
                      'critical' => l.severityCritical,
                      'warning' => l.severityWarning,
                      _ => l.severityInfo,
                    }),
                  ),
                ),
            ]),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _error != null && _alerts == null
            ? ListView(children: [
                SizedBox(height: 400, child: EmptyState(icon: Icons.cloud_off_rounded, title: errorText(context, _error!))),
              ])
            : _alerts == null
                ? const Center(child: CircularProgressIndicator())
                : list.isEmpty
                    ? ListView(children: [
                        SizedBox(height: 400, child: EmptyState(icon: Icons.verified_user_rounded, title: l.noAlerts)),
                      ])
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                        itemCount: list.length,
                        itemBuilder: (_, i) {
                          final a = list[i];
                          final color = Palette.severity(a.severity);
                          final name = s.device(a.device)?.label ?? a.device;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              onTap: () {
                                _read(a);
                                if (s.device(a.device) != null) {
                                  Navigator.push(context,
                                      MaterialPageRoute(builder: (_) => DeviceScreen(serial: a.device)));
                                }
                              },
                              leading: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(color: color.withValues(alpha: 0.15), shape: BoxShape.circle),
                                child: Icon(context.alertIcon(a.kind), color: color),
                              ),
                              title: Text(context.alertTitle(a),
                                  style: TextStyle(fontWeight: a.isRead ? FontWeight.w500 : FontWeight.w800)),
                              subtitle: Text([name, if (a.detail.isNotEmpty) a.detail, context.ago(a.createdAt)].join(' · ')),
                              trailing: a.isRead
                                  ? null
                                  : Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
