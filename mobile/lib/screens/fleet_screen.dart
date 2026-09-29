import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/api.dart';
import '../models/models.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';
import 'device_screen.dart';

/// The garage: every vehicle on one living map, with a swipeable deck of
/// cards instead of a list.
class FleetScreen extends StatefulWidget {
  const FleetScreen({super.key});
  @override
  State<FleetScreen> createState() => _FleetScreenState();
}

class _FleetScreenState extends State<FleetScreen> {
  final _map = MapController();
  final _pages = PageController(viewportFraction: 0.88);
  int _selected = 0;
  bool _mapReady = false;

  void _focus(int i) {
    final s = AppScope.read(context);
    if (i >= s.devices.length || !_mapReady) return;
    final p = s.positions[s.devices[i].serial];
    if (p != null && p.hasFix) _map.move(LatLng(p.lat, p.lng), 15);
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final l = context.l;
    final devices = s.devices;

    if (devices.isEmpty) {
      return Scaffold(
        body: SafeArea(
          child: s.loadingFleet
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: s.refreshFleet,
                  child: ListView(children: [
                    SizedBox(
                      height: MediaQuery.sizeOf(context).height * 0.75,
                      child: EmptyState(
                        icon: Icons.directions_car_filled_rounded,
                        title: l.noDevices,
                        body: l.noDevicesHint,
                        action: FilledButton.icon(
                          onPressed: () => showActivateSheet(context),
                          icon: const Icon(Icons.add_rounded),
                          label: Text(l.addDevice),
                        ),
                      ),
                    ),
                  ]),
                ),
        ),
      );
    }

    final fixes = [
      for (final d in devices)
        if (s.positions[d.serial]?.hasFix ?? false) s.positions[d.serial]!,
    ];
    final bounds = fixes.length > 1
        ? LatLngBounds.fromPoints([for (final p in fixes) LatLng(p.lat, p.lng)])
        : null;
    final sel = _selected.clamp(0, devices.length - 1);

    return Scaffold(
      body: Stack(children: [
        AppMap(
          controller: _map,
          center: fixes.isEmpty ? null : LatLng(fixes.first.lat, fixes.first.lng),
          bounds: bounds,
          onMapReady: () => _mapReady = true,
          children: [
            MarkerLayer(markers: [
              for (var i = 0; i < devices.length; i++)
                if (s.positions[devices[i].serial]?.hasFix ?? false)
                  vehicleMarker(
                    s.positions[devices[i].serial]!,
                    online: s.onlineMap[devices[i].serial] ?? false,
                    selected: i == sel,
                    onTap: () => _pages.animateToPage(i,
                        duration: const Duration(milliseconds: 400), curve: Curves.easeOutCubic),
                  ),
            ]),
          ],
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Glass(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(children: [
                Text(l.garage, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(width: 12),
                if (s.fleetFromCache)
                  Pill(text: l.showingCached, color: Palette.ember, icon: Icons.cloud_off_rounded)
                else
                  Pill(
                    text: s.live ? l.realtimeOn : l.realtimeOff,
                    color: s.live ? Palette.aurora : Palette.ember,
                    pulse: s.live,
                  ),
                const Spacer(),
                IconButton.filledTonal(
                  tooltip: l.addDevice,
                  onPressed: () => showActivateSheet(context),
                  icon: const Icon(Icons.add_rounded),
                ),
              ]),
            ),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 16,
          height: 188,
          child: PageView.builder(
            controller: _pages,
            itemCount: devices.length,
            onPageChanged: (i) {
              setState(() => _selected = i);
              _focus(i);
            },
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: _VehicleCard(device: devices[i]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _VehicleCard extends StatelessWidget {
  const _VehicleCard({required this.device});
  final Device device;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final l = context.l;
    final t = Theme.of(context);
    final p = s.positions[device.serial];
    final online = s.onlineMap[device.serial] ?? false;
    final caps = s.caps[device.serial];
    final (stateText, stateColor) = p == null
        ? (l.noSignalYet, t.hintColor)
        : !online
            ? (l.offline, Colors.grey)
            : p.speed > 3
                ? (l.moving, Palette.aurora)
                : p.ignition == true
                    ? (l.idling, Palette.ember)
                    : (l.parked, Palette.signal);

    return GestureDetector(
      onTap: () => Navigator.push(
          context, MaterialPageRoute(builder: (_) => DeviceScreen(serial: device.serial))),
      child: Glass(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text(device.label,
                  style: t.textTheme.titleLarge, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            Pill(text: stateText, color: stateColor, pulse: online && p != null),
          ]),
          const SizedBox(height: 4),
          Text(
            p?.time == null ? device.serial : '${device.serial} · ${context.ago(p!.time)}',
            style: t.textTheme.bodySmall?.copyWith(color: t.hintColor),
          ),
          const Spacer(),
          Row(children: [
            Expanded(
              child: Metric(
                icon: Icons.speed_rounded,
                label: l.speed,
                value: p == null ? '—' : '${context.n(p.speed)} ${l.kmh}',
              ),
            ),
            if (caps?.battery ?? false)
              Expanded(
                child: Metric(
                  icon: Icons.battery_charging_full_rounded,
                  label: l.battery,
                  value: l.volts(context.n(p?.battery ?? 0, decimals: 1)),
                  color: (p?.battery ?? 12.5) < 11.6 ? Palette.alarm : Palette.aurora,
                ),
              )
            else
              Expanded(
                child: Metric(
                  icon: Icons.satellite_alt_rounded,
                  label: l.satellites,
                  value: p == null ? '—' : context.n(p.satellites),
                ),
              ),
            const Icon(Icons.chevron_right_rounded),
          ]),
          if (device.subscription?.isExpiring ?? false) ...[
            const SizedBox(height: 6),
            Text(l.daysLeft(context.n(device.subscription!.daysRemaining)),
                style: t.textTheme.labelSmall?.copyWith(color: Palette.ember)),
          ],
        ]),
      ),
    );
  }
}

Future<void> showActivateSheet(BuildContext context) {
  final serial = TextEditingController(), secret = TextEditingController();
  var busy = false;
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (c) => StatefulBuilder(builder: (c, set) {
      final l = c.l;
      Future<void> submit() async {
        if (serial.text.trim().isEmpty || secret.text.isEmpty) return;
        set(() => busy = true);
        final s = AppScope.read(context);
        try {
          final days = await s.api.activate(serial.text.trim(), secret.text);
          if (c.mounted) Navigator.pop(c);
          if (context.mounted) toast(context, l.activated(context.n(days)));
          // The live socket authorises devices when it connects, so it has to
          // reconnect to start streaming the new one.
          s.realtime.stop();
          await s.startSession();
        } on ApiException catch (e) {
          if (!c.mounted) return;
          set(() => busy = false);
          toast(c, switch (e.status) {
            404 => l.deviceNotFound,
            401 => l.wrongSecret,
            409 => l.alreadyActivated,
            _ => errorText(c, e),
          }, error: true);
        }
      }

      return Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(c).bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(l.addDevice, style: Theme.of(c).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(l.noDevicesHint, style: TextStyle(color: Theme.of(c).hintColor)),
          const SizedBox(height: 20),
          TextField(
            controller: serial,
            textDirection: TextDirection.ltr,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(labelText: l.serial, prefixIcon: const Icon(Icons.qr_code_rounded)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: secret,
            obscureText: true,
            textDirection: TextDirection.ltr,
            decoration: InputDecoration(labelText: l.deviceSecret, prefixIcon: const Icon(Icons.key_rounded)),
            onSubmitted: (_) => submit(),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: busy ? null : submit,
            child: busy
                ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                : Text(l.activate),
          ),
        ]),
      );
    }),
  );
}
