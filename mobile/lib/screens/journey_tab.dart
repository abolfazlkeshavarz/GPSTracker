import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/models.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

/// A day told as a story: trips and stops on a timeline, with a replay that
/// drives the vehicle along the route.
class JourneyTab extends StatefulWidget {
  const JourneyTab({super.key, required this.serial});
  final String serial;
  @override
  State<JourneyTab> createState() => _JourneyTabState();
}

class _JourneyTabState extends State<JourneyTab> {
  final _map = MapController();
  DateTime _day = DateUtils.dateOnly(DateTime.now());
  Track? _track;
  Object? _error;
  bool _loading = false;
  bool _mapReady = false;
  double _cursor = 0;
  Timer? _player;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _player?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    _player?.cancel();
    setState(() {
      _loading = true;
      _error = null;
      _cursor = 0;
    });
    try {
      final from = _day;
      final to = from.add(const Duration(days: 1)).subtract(const Duration(seconds: 1));
      final t = await AppScope.read(context).api.track(widget.serial, from, to);
      if (!mounted) return;
      final caps = AppScope.read(context).caps.putIfAbsent(widget.serial, Capabilities.new);
      for (final p in t.points) {
        caps.learnPoint(p);
      }
      setState(() => _track = t);
      _fit(t.points);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _fit(List<TrackPoint> pts) {
    if (pts.isEmpty || !_mapReady) return;
    if (pts.length == 1) {
      _map.move(LatLng(pts.first.lat, pts.first.lng), 17);
      return;
    }
    _map.fitCamera(CameraFit.bounds(
      bounds: LatLngBounds.fromPoints([for (final p in pts) LatLng(p.lat, p.lng)]),
      padding: const EdgeInsets.all(36),
    ));
  }

  void _togglePlay() {
    final pts = _track?.points ?? const [];
    if (pts.length < 2) return;
    if (_player != null) {
      _player!.cancel();
      setState(() => _player = null);
      return;
    }
    if (_cursor >= pts.length - 1) _cursor = 0;
    _player = Timer.periodic(const Duration(milliseconds: 60), (_) {
      if (!mounted) return;
      setState(() {
        _cursor = (_cursor + 1).clamp(0, pts.length - 1).toDouble();
        if (_cursor >= pts.length - 1) {
          _player?.cancel();
          _player = null;
        }
      });
      final p = pts[_cursor.round()];
      if (_mapReady) _map.move(LatLng(p.lat, p.lng), _map.camera.zoom);
    });
    setState(() {});
  }

  static Color _speedColor(int kmh) {
    if (kmh < 30) return Palette.signal;
    if (kmh < 70) return Palette.aurora;
    if (kmh < 110) return Palette.ember;
    return Palette.alarm;
  }

  /// Splits the route into runs of the same speed band so the line is
  /// coloured by how fast the vehicle was going.
  List<Polyline> _lines(List<TrackPoint> pts) {
    final out = <Polyline>[];
    if (pts.length < 2) return out;
    var run = <LatLng>[LatLng(pts.first.lat, pts.first.lng)];
    var color = _speedColor(pts.first.speed);
    for (var i = 1; i < pts.length; i++) {
      final c = _speedColor(pts[i].speed);
      run.add(LatLng(pts[i].lat, pts[i].lng));
      if (c != color || i == pts.length - 1) {
        out.add(Polyline(points: run, color: color, strokeWidth: 5, borderColor: Colors.black26, borderStrokeWidth: 1));
        run = [LatLng(pts[i].lat, pts[i].lng)];
        color = c;
      }
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final t = Theme.of(context);
    final track = _track;
    final pts = track?.points ?? const <TrackPoint>[];
    final today = DateUtils.dateOnly(DateTime.now());
    final cur = pts.isEmpty ? null : pts[_cursor.round().clamp(0, pts.length - 1)];

    return Column(children: [
      SizedBox(
        height: 56,
        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), children: [
          ChoiceChip(
            label: Text(l.today),
            selected: _day == today,
            onSelected: (_) {
              _day = today;
              _load();
            },
          ),
          const SizedBox(width: 8),
          ChoiceChip(
            label: Text(l.yesterday),
            selected: _day == today.subtract(const Duration(days: 1)),
            onSelected: (_) {
              _day = today.subtract(const Duration(days: 1));
              _load();
            },
          ),
          const SizedBox(width: 8),
          ActionChip(
            avatar: const Icon(Icons.calendar_month_rounded, size: 18),
            label: Text(_day.isBefore(today.subtract(const Duration(days: 1))) ? context.day(_day) : l.pickDate),
            onPressed: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: _day,
                firstDate: today.subtract(const Duration(days: 365)),
                lastDate: today,
              );
              if (d != null) {
                _day = DateUtils.dateOnly(d);
                _load();
              }
            },
          ),
        ]),
      ),
      if (_loading) const LinearProgressIndicator(minHeight: 2),
      Expanded(
        flex: 5,
        child: Stack(children: [
          AppMap(
            controller: _map,
            center: pts.isEmpty ? null : LatLng(pts.first.lat, pts.first.lng),
            onMapReady: () {
              _mapReady = true;
              _fit(pts);
            },
            children: [
              PolylineLayer(polylines: _lines(pts)),
              MarkerLayer(markers: [
                for (final (i, s) in (track?.stops ?? const <TrackStop>[]).indexed)
                  Marker(
                    point: LatLng(s.lat, s.lng),
                    width: 28,
                    height: 28,
                    child: CircleAvatar(
                      backgroundColor: t.colorScheme.surface,
                      child: Text(context.n(i + 1), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                    ),
                  ),
                if (cur != null)
                  vehicleMarker(
                    Position(device: '', lat: cur.lat, lng: cur.lng, speed: cur.speed, satellites: cur.satellites, heading: cur.heading),
                    online: true,
                  ),
              ]),
            ],
          ),
          if (pts.length >= 2)
            Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: Glass(
                radius: 20,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(children: [
                  IconButton(
                    onPressed: _togglePlay,
                    icon: Icon(_player == null ? Icons.play_arrow_rounded : Icons.pause_rounded),
                  ),
                  Expanded(
                    child: Slider(
                      value: _cursor.clamp(0, (pts.length - 1).toDouble()),
                      max: (pts.length - 1).toDouble(),
                      onChanged: (v) {
                        setState(() => _cursor = v);
                        final p = pts[v.round()];
                        if (_mapReady) _map.move(LatLng(p.lat, p.lng), _map.camera.zoom);
                      },
                    ),
                  ),
                  if (cur != null)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 8),
                      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(context.time(cur.time), style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text('${context.n(cur.speed)} ${l.kmh}', style: t.textTheme.labelSmall),
                      ]),
                    ),
                ]),
              ),
            ),
        ]),
      ),
      Expanded(
        flex: 6,
        child: _error != null
            ? EmptyState(
                icon: Icons.cloud_off_rounded,
                title: errorText(context, _error!),
                action: OutlinedButton(onPressed: _load, child: Text(l.retry)),
              )
            : track == null
                ? const SizedBox()
                : pts.length < 2
                    ? EmptyState(icon: Icons.local_parking_rounded, title: l.noJourney)
                    : _Story(track: track, onSelect: _fit),
      ),
    ]);
  }
}

class _Story extends StatelessWidget {
  const _Story({required this.track, required this.onSelect});
  final Track track;
  final void Function(List<TrackPoint>) onSelect;

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final t = Theme.of(context);
    final sum = track.summary;
    final story = track.story;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
      if (track.truncated)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Pill(text: l.truncated, color: Palette.ember, icon: Icons.info_rounded),
        ),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Wrap(spacing: 16, runSpacing: 14, children: [
            _Stat(label: l.distance, value: '${context.n(sum.distanceKm, decimals: 1)} ${l.km}'),
            _Stat(label: l.drivingTime, value: context.duration(sum.movingSeconds)),
            _Stat(label: l.parkedTime, value: context.duration(sum.stoppedSeconds)),
            _Stat(label: l.maxSpeed, value: '${context.n(sum.maxSpeed)} ${l.kmh}'),
            _Stat(label: l.avgSpeed, value: '${context.n(sum.avgMovingSpeed)} ${l.kmh}'),
          ]),
        ),
      ),
      const SizedBox(height: 16),
      for (final (i, e) in story.indexed)
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SizedBox(
              width: 36,
              child: Column(children: [
                Container(
                  margin: const EdgeInsets.only(top: 14),
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: e is JourneyTrip ? Palette.aurora : Palette.signal,
                  ),
                ),
                if (i < story.length - 1)
                  Expanded(child: Container(width: 2, color: t.dividerColor)),
              ]),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: switch (e) {
                  JourneyTrip(:final leg) => Card(
                      child: ListTile(
                        onTap: () => onSelect(leg.points),
                        leading: const Icon(Icons.route_rounded, color: Palette.aurora),
                        title: Text('${l.trip} · ${context.n(leg.distanceKm, decimals: 1)} ${l.km}'),
                        subtitle: Text(
                            '${context.time(leg.start)} → ${context.time(leg.end)} · ${l.maxSpeed} ${context.n(leg.maxSpeed)}'),
                        trailing: leg.points.any((p) => p.isBackfill)
                            ? Tooltip(message: l.backfill, child: const Icon(Icons.history_rounded, size: 18))
                            : null,
                      ),
                    ),
                  JourneyStop(:final stop) => Card(
                      child: ListTile(
                        onTap: () => onSelect([
                          TrackPoint(lat: stop.lat, lng: stop.lng, speed: 0, satellites: 0, csq: 0,
                              battery: 0, isBackfill: false, time: stop.arrived),
                        ]),
                        leading: const Icon(Icons.local_parking_rounded, color: Palette.signal),
                        title: Text('${l.stop} · ${context.duration(stop.seconds)}'),
                        subtitle: Text('${context.time(stop.arrived)} → ${context.time(stop.departed)}'),
                      ),
                    ),
                },
              ),
            ),
          ]),
        ),
    ]);
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return SizedBox(
      width: 96,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: t.textTheme.labelSmall?.copyWith(color: t.hintColor)),
        Text(value, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
      ]),
    );
  }
}
