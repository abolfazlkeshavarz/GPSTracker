import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/app_state.dart';
import '../core/api.dart';
import '../core/config.dart';
import '../models/models.dart';
import 'format.dart';
import 'theme.dart';

/// Provides [AppState] to the tree.
class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child})
      : super(notifier: state);

  static AppState of(BuildContext c) =>
      c.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
  static AppState read(BuildContext c) =>
      (c.getElementForInheritedWidgetOfExactType<AppScope>()!.widget as AppScope).notifier!;
}

/// Frosted panel floating over the map.
class Glass extends StatelessWidget {
  const Glass({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.radius = 28});
  final Widget child;
  final EdgeInsets padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: (dark ? Palette.ink : Colors.white).withValues(alpha: dark ? 0.72 : 0.82),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: (dark ? Colors.white : Colors.black).withValues(alpha: 0.08)),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// A ring of four arcs — freshness, GPS, cell, power — around a big number.
/// Arcs for hardware a tracker does not have are drawn as faint ghosts
/// instead of as failures.
class StatusRing extends StatelessWidget {
  const StatusRing({super.key, required this.levels, required this.center, this.size = 150});
  final List<double?> levels; // 0..1, null = not reported
  final Widget center;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(milliseconds: 900),
          curve: Curves.easeOutCubic,
          builder: (context, t, _) => CustomPaint(
            painter: _RingPainter(levels, t, Theme.of(context).colorScheme.onSurface),
            child: Center(child: center),
          ),
        ),
      );
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.levels, this.t, this.track);
  final List<double?> levels;
  final double t;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final n = levels.length;
    const gap = 0.16;
    final sweep = (2 * math.pi - gap * n) / n;
    final rect = Offset.zero & size;
    final inset = rect.deflate(8);
    for (var i = 0; i < n; i++) {
      final start = -math.pi / 2 + i * (sweep + gap) + gap / 2;
      final bg = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..strokeCap = StrokeCap.round
        ..color = track.withValues(alpha: 0.08);
      canvas.drawArc(inset, start, sweep, false, bg);
      final v = levels[i];
      if (v == null) continue;
      final c = v >= 0.66 ? Palette.aurora : (v >= 0.33 ? Palette.ember : Palette.alarm);
      final fg = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..strokeCap = StrokeCap.round
        ..color = c;
      canvas.drawArc(inset, start, sweep * v.clamp(0.04, 1) * t, false, fg);
    }
  }

  @override
  bool shouldRepaint(_RingPainter o) => o.t != t || o.levels != levels;
}

/// Hold-and-drag confirmation for actions that reach a physical vehicle.
class SlideToConfirm extends StatefulWidget {
  const SlideToConfirm({super.key, required this.label, required this.onConfirmed, this.color});
  final String label;
  final Future<void> Function() onConfirmed;
  final Color? color;

  @override
  State<SlideToConfirm> createState() => _SlideToConfirmState();
}

class _SlideToConfirmState extends State<SlideToConfirm> {
  double _x = 0;
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? Theme.of(context).colorScheme.primary;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return LayoutBuilder(builder: (context, c) {
      const knob = 56.0;
      final max = c.maxWidth - knob - 8;
      return Container(
        height: 64,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(32),
        ),
        child: Stack(alignment: Alignment.center, children: [
          Text(widget.label,
              style: TextStyle(color: color, fontWeight: FontWeight.w700)),
          PositionedDirectional(
            start: 4 + _x,
            child: GestureDetector(
              onHorizontalDragUpdate: _busy
                  ? null
                  : (d) => setState(() => _x = (_x + (rtl ? -d.delta.dx : d.delta.dx)).clamp(0, max)),
              onHorizontalDragEnd: _busy
                  ? null
                  : (_) async {
                      if (_x >= max * 0.92) {
                        HapticFeedback.heavyImpact();
                        setState(() {
                          _x = max;
                          _busy = true;
                        });
                        try {
                          await widget.onConfirmed();
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      }
                      if (mounted) setState(() => _x = 0);
                    },
              child: Container(
                width: knob,
                height: knob,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: _busy
                    ? const Padding(
                        padding: EdgeInsets.all(16),
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : Icon(rtl ? Icons.keyboard_double_arrow_left_rounded : Icons.keyboard_double_arrow_right_rounded,
                        color: Colors.white),
              ),
            ),
          ),
        ]),
      );
    });
  }
}

class Metric extends StatelessWidget {
  const Metric({super.key, required this.icon, required this.label, required this.value, this.color});
  final IconData icon;
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: (color ?? t.colorScheme.primary).withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, size: 18, color: color ?? t.colorScheme.primary),
      ),
      const SizedBox(width: 10),
      Flexible(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: t.textTheme.labelSmall?.copyWith(color: t.hintColor), overflow: TextOverflow.ellipsis),
          Text(value, style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
        ]),
      ),
    ]);
  }
}

class Pill extends StatelessWidget {
  const Pill({super.key, required this.text, required this.color, this.icon, this.pulse = false});
  final String text;
  final Color color;
  final IconData? icon;
  final bool pulse;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (pulse) _PulseDot(color: color) else if (icon != null) Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
        ]),
      );
}

class _PulseDot extends StatefulWidget {
  const _PulseDot({required this.color});
  final Color color;
  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, _) => SizedBox.square(
          dimension: 12,
          child: Stack(alignment: Alignment.center, children: [
            Container(
              width: 12 * _c.value,
              height: 12 * _c.value,
              decoration: BoxDecoration(
                  shape: BoxShape.circle, color: widget.color.withValues(alpha: 1 - _c.value)),
            ),
            Container(width: 6, height: 6, decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color)),
          ]),
        ),
      );
}

/// Map with the configured tile source, dark-mode tiles and attribution.
class AppMap extends StatelessWidget {
  const AppMap({
    super.key,
    required this.children,
    this.controller,
    this.center,
    this.zoom = 14,
    this.onLongPress,
    this.bounds,
    this.onMapReady,
    this.onUserGesture,
  });
  final List<Widget> children;
  final MapController? controller;
  final LatLng? center;
  final double zoom;
  final LatLngBounds? bounds;
  final void Function(LatLng)? onLongPress;
  final VoidCallback? onMapReady;
  final VoidCallback? onUserGesture;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return FlutterMap(
      mapController: controller,
      options: MapOptions(
        initialCenter: center ?? const LatLng(35.6892, 51.389),
        initialZoom: center == null ? 5 : zoom,
        initialCameraFit: bounds == null
            ? null
            : CameraFit.bounds(bounds: bounds!, padding: const EdgeInsets.fromLTRB(40, 120, 40, 260)),
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
        onLongPress: onLongPress == null ? null : (_, p) => onLongPress!(p),
        onMapReady: onMapReady,
        onPositionChanged: onUserGesture == null
            ? null
            : (_, hasGesture) {
                if (hasGesture) onUserGesture!();
              },
      ),
      children: [
        TileLayer(
          urlTemplate: s.tileUrl,
          // If the configured map server is down or does not cover an area,
          // tiles come from OpenStreetMap instead of leaving holes.
          fallbackUrl: s.tileUrl == ServerConfig.fallbackTiles ? null : ServerConfig.fallbackTiles,
          userAgentPackageName: 'com.gpstracker.mobile',
          tileBuilder: dark ? darkModeTileBuilder : null,
          maxNativeZoom: 19,
        ),
        ...children,
        SimpleAttributionWidget(source: Text(s.mapAttribution)),
      ],
    );
  }
}

/// Vehicle marker: an arrow when the hardware reports heading, a dot when not.
Marker vehicleMarker(Position p, {required bool online, VoidCallback? onTap, bool selected = false}) {
  final color = !online ? Colors.grey : (p.speed > 3 ? Palette.aurora : Palette.signal);
  return Marker(
    point: LatLng(p.lat, p.lng),
    width: selected ? 64 : 52,
    height: selected ? 64 : 52,
    child: GestureDetector(
      onTap: onTap,
      child: Stack(alignment: Alignment.center, children: [
        Container(
          decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.22)),
        ),
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [BoxShadow(color: color.withValues(alpha: 0.6), blurRadius: 14)],
          ),
          child: p.heading != null
              ? Transform.rotate(
                  angle: p.heading! * math.pi / 180,
                  child: const Icon(Icons.navigation_rounded, size: 16, color: Colors.white))
              : const Icon(Icons.directions_car_rounded, size: 15, color: Colors.white),
        ),
      ]),
    ),
  );
}

/// Human message for a failed request, in the active language.
String errorText(BuildContext context, Object e) {
  if (e is ApiException) {
    if (e.isNetwork) return context.l.networkError;
    if (e.status == 401) return context.l.sessionExpired;
    return e.message;
  }
  return context.l.somethingWrong;
}

void toast(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Palette.alarm : null,
    ));
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.body, this.action});
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Palette.auroraGradient),
            child: Icon(icon, size: 40, color: Colors.white),
          ),
          const SizedBox(height: 20),
          Text(title, style: t.textTheme.titleLarge, textAlign: TextAlign.center),
          if (body != null) ...[
            const SizedBox(height: 8),
            Text(body!, style: t.textTheme.bodyMedium?.copyWith(color: t.hintColor), textAlign: TextAlign.center),
          ],
          if (action != null) ...[const SizedBox(height: 24), action!],
        ]),
      ),
    );
  }
}
