import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'package:latlong2/latlong.dart';

import '../models/models.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

/// Guides the owner on foot back to the vehicle: live distance, a bearing
/// arrow and both positions on the map.
class FindCarScreen extends StatefulWidget {
  const FindCarScreen({super.key, required this.serial});
  final String serial;
  @override
  State<FindCarScreen> createState() => _FindCarScreenState();
}

class _FindCarScreenState extends State<FindCarScreen> {
  StreamSubscription<geo.Position>? _sub;
  geo.Position? _me;
  bool _denied = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      if (!await geo.Geolocator.isLocationServiceEnabled()) {
        setState(() => _denied = true);
        return;
      }
      var perm = await geo.Geolocator.checkPermission();
      if (perm == geo.LocationPermission.denied) perm = await geo.Geolocator.requestPermission();
      if (perm == geo.LocationPermission.denied || perm == geo.LocationPermission.deniedForever) {
        if (mounted) setState(() => _denied = true);
        return;
      }
      _sub = geo.Geolocator.getPositionStream(
        locationSettings: const geo.LocationSettings(accuracy: geo.LocationAccuracy.best, distanceFilter: 2),
      ).listen((p) {
        if (mounted) setState(() => _me = p);
      });
    } catch (_) {
      if (mounted) setState(() => _denied = true);
    }
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
    final t = Theme.of(context);
    final car = s.positions[widget.serial];
    final me = _me;
    final dist = car != null && me != null ? haversineM(me.latitude, me.longitude, car.lat, car.lng) : null;
    final bearing = car != null && me != null ? bearingDeg(me.latitude, me.longitude, car.lat, car.lng) : 0.0;

    return Scaffold(
      appBar: AppBar(title: Text(l.findMyCar)),
      body: _denied
          ? EmptyState(
              icon: Icons.location_off_rounded,
              title: l.locationDenied,
              action: OutlinedButton(onPressed: geo.Geolocator.openAppSettings, child: Text(l.settings)),
            )
          : Column(children: [
              Expanded(
                child: AppMap(
                  center: car == null ? null : LatLng(car.lat, car.lng),
                  zoom: 17,
                  bounds: car != null && me != null && dist! > 30
                      ? LatLngBounds.fromPoints([LatLng(car.lat, car.lng), LatLng(me.latitude, me.longitude)])
                      : null,
                  children: [
                    if (car != null && me != null)
                      PolylineLayer(polylines: [
                        Polyline(
                          points: [LatLng(me.latitude, me.longitude), LatLng(car.lat, car.lng)],
                          color: Palette.aurora,
                          strokeWidth: 4,
                          pattern: StrokePattern.dashed(segments: const [10, 8]),
                        ),
                      ]),
                    MarkerLayer(markers: [
                      if (car != null) vehicleMarker(car, online: s.onlineMap[widget.serial] ?? false),
                      if (me != null)
                        Marker(
                          point: LatLng(me.latitude, me.longitude),
                          width: 22,
                          height: 22,
                          child: Container(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Palette.signal,
                              border: Border.all(color: Colors.white, width: 3),
                            ),
                          ),
                        ),
                    ]),
                  ],
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Row(children: [
                    Transform.rotate(
                      angle: bearing * math.pi / 180,
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Palette.auroraGradient),
                        child: const Icon(Icons.navigation_rounded, color: Colors.white, size: 36),
                      ),
                    ),
                    const SizedBox(width: 20),
                    Expanded(
                      child: dist == null
                          ? const LinearProgressIndicator()
                          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(l.awayFromYou(context.distance(dist)), style: t.textTheme.headlineSmall),
                              Text(context.ago(car?.time), style: TextStyle(color: t.hintColor)),
                            ]),
                    ),
                  ]),
                ),
              ),
            ]),
    );
  }
}
