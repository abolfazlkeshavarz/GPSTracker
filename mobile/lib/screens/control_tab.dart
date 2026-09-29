import 'package:flutter/material.dart';

import '../core/api.dart';
import '../models/models.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class ControlTab extends StatefulWidget {
  const ControlTab({super.key, required this.serial});
  final String serial;
  @override
  State<ControlTab> createState() => _ControlTabState();
}

class _ControlTabState extends State<ControlTab> {
  List<Command> _history = [];
  List<Geofence> _fences = [];
  bool _guardBusy = false;

  static const _guardRadius = 150;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final api = AppScope.read(context).api;
    try {
      final r = await Future.wait([api.commands(widget.serial), api.geofences(widget.serial)]);
      if (!mounted) return;
      setState(() {
        _history = r[0] as List<Command>;
        _fences = r[1] as List<Geofence>;
      });
    } catch (_) {}
  }

  Geofence? get _guard {
    for (final f in _fences) {
      if (f.isGuard) return f;
    }
    return null;
  }

  Future<void> _send(String cmd, {bool confirm = false}) async {
    final l = context.l;
    try {
      final c = await AppScope.read(context).api.command(widget.serial, cmd, confirm: confirm);
      if (!mounted) return;
      toast(context, c.status == 'sent' ? l.commandSent : l.commandQueued);
      _refresh();
    } on ApiException catch (e) {
      if (!mounted) return;
      toast(context, e.status == 409 ? l.commandRefusedMoving : errorText(context, e), error: true);
    }
  }

  /// Guard mode is a tight "exit" zone around where the car is parked: it
  /// turns any movement — towing included — into an immediate alert, using
  /// only the geofence engine every tracker already supports.
  Future<void> _toggleGuard(bool on) async {
    final s = AppScope.read(context);
    final l = context.l;
    setState(() => _guardBusy = true);
    try {
      if (on) {
        final p = s.positions[widget.serial];
        if (p == null || !p.hasFix) {
          toast(context, l.guardNeedsFix, error: true);
          return;
        }
        await s.api.createGeofence(widget.serial, Geofence.guardName, p.lat, p.lng, _guardRadius, 'exit');
      } else if (_guard != null) {
        await s.api.deleteGeofence(widget.serial, _guard!.id);
      }
      await _refresh();
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _guardBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final t = Theme.of(context);
    final guard = _guard;

    Widget action(IconData icon, String label, VoidCallback onTap, {Color? color}) => Expanded(
          child: Card(
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: Column(children: [
                  Icon(icon, size: 30, color: color ?? t.colorScheme.primary),
                  const SizedBox(height: 8),
                  Text(label, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
          ),
        );

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Palette.auroraGradient),
                  child: const Icon(Icons.shield_rounded, color: Colors.white),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l.guardMode, style: t.textTheme.titleMedium),
                    Text(guard != null ? l.guardArmed(context.n(guard.radiusM)) : l.guardModeDesc,
                        style: t.textTheme.bodySmall?.copyWith(color: guard != null ? Palette.aurora : t.hintColor)),
                  ]),
                ),
                _guardBusy
                    ? const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2.5))
                    : Switch(value: guard != null, onChanged: _toggleGuard),
              ]),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        Text(l.remoteControl, style: t.textTheme.titleMedium),
        const SizedBox(height: 10),
        Row(children: [
          action(Icons.lock_rounded, l.doorLock, () => _send('door_lock')),
          const SizedBox(width: 10),
          action(Icons.lock_open_rounded, l.doorUnlock, () => _send('door_unlock')),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          action(Icons.my_location_rounded, l.locate, () => _send('locate')),
          const SizedBox(width: 10),
          action(Icons.power_settings_new_rounded, l.engineRestore, () => _send('engine_restore'), color: Palette.aurora),
        ]),
        const SizedBox(height: 20),
        Card(
          color: Palette.alarm.withValues(alpha: 0.08),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(Icons.car_crash_rounded, color: Palette.alarm),
                const SizedBox(width: 8),
                Text(l.engineCut, style: t.textTheme.titleMedium?.copyWith(color: Palette.alarm)),
              ]),
              const SizedBox(height: 8),
              Text(l.engineCutWarning, style: t.textTheme.bodySmall),
              const SizedBox(height: 14),
              SlideToConfirm(
                label: l.slideToConfirm,
                color: Palette.alarm,
                onConfirmed: () => _send('engine_cut', confirm: true),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        SlideToConfirm(
          label: l.reboot,
          color: Palette.ember,
          onConfirmed: () => _send('reboot', confirm: true),
        ),
        if (_history.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(l.recentCommands, style: t.textTheme.titleMedium),
          const SizedBox(height: 8),
          Card(
            child: Column(children: [
              for (final c in _history)
                ListTile(
                  dense: true,
                  title: Text(context.commandLabel(c.command)),
                  subtitle: c.issuedAt == null ? null : Text(context.dateTime(c.issuedAt!)),
                  trailing: Pill(
                    text: context.statusLabel(c.status),
                    color: switch (c.status) {
                      'acked' => Palette.aurora,
                      'failed' || 'expired' => Palette.alarm,
                      'sent' => Palette.signal,
                      _ => Palette.ember,
                    },
                  ),
                ),
            ]),
          ),
        ],
      ]),
    );
  }
}
