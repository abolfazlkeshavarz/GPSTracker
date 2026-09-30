import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/models.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class ZonesTab extends StatefulWidget {
  const ZonesTab({super.key, required this.serial});
  final String serial;
  @override
  State<ZonesTab> createState() => _ZonesTabState();
}

class _ZonesTabState extends State<ZonesTab> {
  final _map = MapController();
  List<Geofence> _zones = [];
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final z = await AppScope.read(context).api.geofences(widget.serial);
      if (mounted) setState(() => _zones = z);
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    }
  }

  Future<void> _create(LatLng at) async {
    final l = context.l;
    final name = TextEditingController();
    var radius = 200.0;
    var trigger = 'both';
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(c).bottom + 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(l.newZone, style: Theme.of(c).textTheme.headlineSmall),
            const SizedBox(height: 16),
            TextField(controller: name, maxLength: 60, decoration: InputDecoration(labelText: l.zoneName)),
            Text('${l.radius}: ${l.meters(c.n(radius.round()))}'),
            Slider(value: radius, min: 50, max: 5000, divisions: 99, onChanged: (v) => set(() => radius = v)),
            Text(l.triggerOn),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'enter', label: Text(l.triggerEnter)),
                ButtonSegment(value: 'exit', label: Text(l.triggerExit)),
                ButtonSegment(value: 'both', label: Text(l.triggerBoth)),
              ],
              selected: {trigger},
              onSelectionChanged: (v) => set(() => trigger = v.first),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () {
                if (name.text.trim().isNotEmpty) Navigator.pop(c, true);
              },
              child: Text(l.save),
            ),
          ]),
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await AppScope.read(context)
          .api
          .createGeofence(widget.serial, name.text.trim(), at.latitude, at.longitude, radius.round(), trigger);
      await _load();
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    }
  }

  Future<void> _delete(Geofence z) async {
    final l = context.l;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(l.deleteZoneConfirm(z.isGuard ? l.guardMode : z.name)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(l.delete)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await AppScope.read(context).api.deleteGeofence(widget.serial, z.id);
      await _load();
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final s = AppScope.of(context);
    final p = s.positions[widget.serial];
    return Column(children: [
      Expanded(
        flex: 5,
        child: Stack(children: [
          AppMap(
            controller: _map,
            center: p != null && p.hasFix ? LatLng(p.lat, p.lng) : null,
            zoom: 13,
            onMapReady: () => _ready = true,
            onLongPress: _create,
            children: [
              CircleLayer(circles: [
                for (final z in _zones)
                  CircleMarker(
                    point: LatLng(z.lat, z.lng),
                    radius: z.radiusM.toDouble(),
                    useRadiusInMeter: true,
                    color: (z.isGuard ? Palette.aurora : Palette.signal).withValues(alpha: 0.18),
                    borderColor: z.isGuard ? Palette.aurora : Palette.signal,
                    borderStrokeWidth: 2,
                  ),
              ]),
              if (p != null && p.hasFix)
                MarkerLayer(markers: [vehicleMarker(p, online: s.onlineMap[widget.serial] ?? false)]),
            ],
          ),
          Positioned(
            left: 12,
            right: 12,
            top: 12,
            child: Glass(
              radius: 16,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(children: [
                const Icon(Icons.touch_app_rounded, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(l.zoneHint)),
              ]),
            ),
          ),
        ]),
      ),
      Expanded(
        flex: 4,
        child: _zones.isEmpty
            ? EmptyState(icon: Icons.fence_rounded, title: l.zones, body: l.noZones)
            : ListView(padding: const EdgeInsets.all(12), children: [
                for (final z in _zones)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      onTap: () {
                        if (_ready) _map.move(LatLng(z.lat, z.lng), 15);
                      },
                      leading: Icon(z.isGuard ? Icons.shield_rounded : Icons.place_rounded,
                          color: z.isGuard ? Palette.aurora : Palette.signal),
                      title: Text(z.isGuard ? l.guardMode : z.name),
                      subtitle: Text('${l.meters(context.n(z.radiusM))} · ${switch (z.triggerOn) {
                        'enter' => l.triggerEnter,
                        'exit' => l.triggerExit,
                        _ => l.triggerBoth,
                      }}'),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline_rounded),
                        onPressed: () => _delete(z),
                      ),
                    ),
                  ),
              ]),
      ),
    ]);
  }
}
