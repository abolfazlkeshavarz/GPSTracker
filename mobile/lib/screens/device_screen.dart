import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/models.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';
import 'control_tab.dart';
import 'find_car_screen.dart';
import 'journey_tab.dart';
import 'vehicle_settings_screen.dart';
import 'zones_tab.dart';

class DeviceScreen extends StatefulWidget {
  const DeviceScreen({super.key, required this.serial});
  final String serial;
  @override
  State<DeviceScreen> createState() => _DeviceScreenState();
}

class _DeviceScreenState extends State<DeviceScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final l = context.l;
    final device = s.device(widget.serial);
    if (device == null) return const Scaffold();

    final tabs = [
      _LiveTab(serial: widget.serial),
      JourneyTab(serial: widget.serial),
      ControlTab(serial: widget.serial),
      ZonesTab(serial: widget.serial),
    ];

    return Scaffold(
      extendBodyBehindAppBar: _tab == 0,
      appBar: AppBar(
        backgroundColor: _tab == 0 ? Colors.transparent : null,
        title: _tab == 0
            ? Glass(
                radius: 16,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Text(device.label, overflow: TextOverflow.ellipsis),
              )
            : Text(device.label),
        actions: [
          IconButton.filledTonal(
            tooltip: l.vehicleSettings,
            icon: const Icon(Icons.tune_rounded),
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => VehicleSettingsScreen(serial: widget.serial))),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.sensors_rounded), label: l.live),
          NavigationDestination(icon: const Icon(Icons.timeline_rounded), label: l.journey),
          NavigationDestination(icon: const Icon(Icons.gamepad_rounded), label: l.control),
          NavigationDestination(icon: const Icon(Icons.fence_rounded), label: l.zones),
        ],
      ),
    );
  }
}

class _LiveTab extends StatefulWidget {
  const _LiveTab({required this.serial});
  final String serial;
  @override
  State<_LiveTab> createState() => _LiveTabState();
}

class _LiveTabState extends State<_LiveTab> {
  final _map = MapController();
  bool _follow = true;
  bool _ready = false;
  double? _odometer;
  PlanInfo? _plan;
  Position? _last;

  @override
  void initState() {
    super.initState();
    final api = AppScope.read(context).api;
    api.odometerKm(widget.serial).then((v) {
      if (mounted) setState(() => _odometer = v);
    }).catchError((_) {});
    api.plan(widget.serial).then((v) {
      if (mounted) setState(() => _plan = v);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final l = context.l;
    final t = Theme.of(context);
    final p = s.positions[widget.serial];
    final online = s.onlineMap[widget.serial] ?? false;
    final caps = s.caps[widget.serial] ?? Capabilities();

    // Follow the vehicle as it moves, unless the user panned away.
    if (p != null && p.hasFix && _ready && _follow && !identical(p, _last)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _map.move(LatLng(p.lat, p.lng), _map.camera.zoom);
      });
    }
    _last = p;

    final health = healthOf(p, online: online);
    final age = p?.time == null ? null : DateTime.now().difference(p!.time!).inSeconds;
    final levels = <double?>[
      age == null ? 0 : (age < 90 ? 1 : (age < 900 ? 0.5 : 0.1)),
      p == null
          ? 0
          : (caps.hdop && p.hdop != null
              ? (1 - ((p.hdop! - 1) / 5)).clamp(0.05, 1)
              : (p.satellites / 10).clamp(0.05, 1)),
      caps.csq && p?.csq != null ? (p!.csq! / 25).clamp(0.05, 1) : null,
      caps.battery && p?.battery != null ? ((p!.battery! - 11) / 2).clamp(0.05, 1) : null,
    ];

    return Stack(children: [
      AppMap(
        controller: _map,
        center: p != null && p.hasFix ? LatLng(p.lat, p.lng) : null,
        zoom: 16,
        onMapReady: () => _ready = true,
        onUserGesture: () {
          if (_follow) setState(() => _follow = false);
        },
        children: [
          if (p != null && p.hasFix)
            MarkerLayer(markers: [vehicleMarker(p, online: online, selected: true)]),
        ],
      ),
      PositionedDirectional(
        end: 16,
        top: MediaQuery.paddingOf(context).top + kToolbarHeight + 12,
        child: Column(children: [
          FloatingActionButton.small(
            heroTag: 'follow',
            onPressed: () {
              setState(() => _follow = true);
              if (p != null && p.hasFix) _map.move(LatLng(p.lat, p.lng), 16);
            },
            child: Icon(_follow ? Icons.gps_fixed_rounded : Icons.gps_not_fixed_rounded),
          ),
          const SizedBox(height: 8),
          FloatingActionButton.small(
            heroTag: 'walk',
            tooltip: l.findMyCar,
            onPressed: p == null || !p.hasFix
                ? null
                : () => Navigator.push(
                    context, MaterialPageRoute(builder: (_) => FindCarScreen(serial: widget.serial))),
            child: const Icon(Icons.directions_walk_rounded),
          ),
        ]),
      ),
      DraggableScrollableSheet(
        initialChildSize: 0.36,
        minChildSize: 0.2,
        maxChildSize: 0.85,
        builder: (context, scroll) => Glass(
          radius: 32,
          padding: EdgeInsets.zero,
          child: ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(20, 10, 20, 24), children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: t.hintColor, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Row(children: [
              StatusRing(
                size: 132,
                levels: levels,
                center: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(p == null ? '—' : context.n(p.speed),
                      style: t.textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800)),
                  Text(l.kmh, style: t.textTheme.labelSmall?.copyWith(color: t.hintColor)),
                ]),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l.health, style: t.textTheme.labelMedium?.copyWith(color: t.hintColor)),
                  Text(context.healthLabel(health),
                      style: t.textTheme.headlineSmall?.copyWith(
                          color: switch (health) {
                        Health.excellent || Health.good => Palette.aurora,
                        Health.fair => Palette.ember,
                        Health.poor => Palette.alarm,
                      })),
                  const SizedBox(height: 8),
                  Pill(
                    text: online ? l.online : l.offline,
                    color: online ? Palette.aurora : Colors.grey,
                    pulse: online,
                  ),
                  const SizedBox(height: 6),
                  Text(context.ago(p?.time), style: t.textTheme.bodySmall?.copyWith(color: t.hintColor)),
                ]),
              ),
            ]),
            if (p?.jamming == true || p?.extPower == false) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                    color: Palette.alarm.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(16)),
                child: Row(children: [
                  const Icon(Icons.warning_rounded, color: Palette.alarm),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(p?.jamming == true ? l.alertJamming : l.alertPowerCut,
                        style: const TextStyle(color: Palette.alarm, fontWeight: FontWeight.w700)),
                  ),
                ]),
              ),
            ],
            const SizedBox(height: 20),
            Text(l.sensors, style: t.textTheme.titleSmall),
            const SizedBox(height: 12),
            _SensorGrid(p: p, caps: caps, odometer: _odometer),
            if (_plan?.subscription != null) ...[
              const SizedBox(height: 20),
              _PlanRow(plan: _plan!),
            ],
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.ios_share_rounded),
              label: Text(l.exportCsv),
              onPressed: () => _export(context),
            ),
          ]),
        ),
      ),
    ]);
  }

  Future<void> _export(BuildContext context) async {
    final s = AppScope.read(context);
    final to = DateTime.now(), from = to.subtract(const Duration(days: 30));
    try {
      final bytes = await s.api.exportCsv(widget.serial, from, to);
      final dir = await getTemporaryDirectory();
      final safe = widget.serial.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
      final f = File('${dir.path}/$safe-history.csv');
      await f.writeAsBytes(bytes, flush: true);
      await SharePlus.instance.share(ShareParams(files: [XFile(f.path, mimeType: 'text/csv')]));
    } catch (e) {
      if (context.mounted) toast(context, errorText(context, e), error: true);
    }
  }
}

class _SensorGrid extends StatelessWidget {
  const _SensorGrid({required this.p, required this.caps, this.odometer});
  final Position? p;
  final Capabilities caps;
  final double? odometer;

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final p = this.p;
    String dirName(double h) {
      const d = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      return '${d[((h % 360) / 45).round() % 8]} ${context.n(h.round())}°';
    }

    final tiles = <Widget>[
      Metric(icon: Icons.satellite_alt_rounded, label: l.satellites, value: p == null ? '—' : context.n(p.satellites)),
      if (odometer != null)
        Metric(icon: Icons.route_rounded, label: l.odometer, value: '${context.n(odometer!, decimals: 1)} ${l.km}'),
      if (caps.csq)
        Metric(icon: Icons.signal_cellular_alt_rounded, label: l.cellSignal, value: p?.csq == null ? '—' : '${context.n(((p!.csq! / 31) * 100).clamp(0, 100).round())}%'),
      if (caps.battery)
        Metric(
          icon: Icons.car_repair_rounded,
          label: l.battery,
          value: p?.battery == null ? '—' : l.volts(context.n(p!.battery!, decimals: 1)),
          color: (p?.battery ?? 13) < 11.6 ? Palette.alarm : null,
        ),
      if (caps.ignition)
        Metric(icon: Icons.key_rounded, label: l.ignition, value: p?.ignition == true ? l.on : l.off,
            color: p?.ignition == true ? Palette.aurora : null),
      if (caps.heading && p?.heading != null)
        Metric(icon: Icons.explore_rounded, label: l.heading, value: dirName(p!.heading!)),
      if (caps.altitude && p?.altitude != null)
        Metric(icon: Icons.terrain_rounded, label: l.altitude, value: l.meters(context.n(p!.altitude!.round()))),
      if (caps.hdop && p?.hdop != null)
        Metric(icon: Icons.my_location_rounded, label: l.gpsAccuracy, value: '±${l.meters(context.n((p!.hdop! * 2.5).round()))}'),
      if (caps.extPower)
        Metric(icon: Icons.power_rounded, label: l.extPower, value: p?.extPower == false ? l.disconnected : l.connected,
            color: p?.extPower == false ? Palette.alarm : null),
      if (caps.jamming)
        Metric(icon: Icons.wifi_tethering_error_rounded, label: l.jamming, value: p?.jamming == true ? l.detected : l.clear,
            color: p?.jamming == true ? Palette.alarm : null),
      if (caps.operator && (p?.operator ?? '').isNotEmpty)
        Metric(icon: Icons.cell_tower_rounded, label: l.operator, value: p!.operator!),
    ];

    return LayoutBuilder(builder: (context, c) {
      final w = (c.maxWidth - 12) / 2;
      return Wrap(spacing: 12, runSpacing: 14, children: [
        for (final t in tiles) SizedBox(width: w, child: t),
      ]);
    });
  }
}

class _PlanRow extends StatelessWidget {
  const _PlanRow({required this.plan});
  final PlanInfo plan;

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final sub = plan.subscription!;
    final color = !sub.isActive ? Palette.alarm : (sub.isExpiring ? Palette.ember : Palette.aurora);
    return Card(
      child: ListTile(
        leading: Icon(Icons.workspace_premium_rounded, color: color),
        title: Text('${l.subscription} · ${sub.plan}'),
        subtitle: Text(sub.isActive ? l.daysLeft(context.n(sub.daysRemaining)) : l.expired),
        trailing: plan.warrantyExpires == null
            ? null
            : Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(l.warranty, style: Theme.of(context).textTheme.labelSmall),
                Text(context.day(plan.warrantyExpires!),
                    style: TextStyle(color: plan.warrantyActive ? null : Palette.alarm)),
              ]),
      ),
    );
  }
}
