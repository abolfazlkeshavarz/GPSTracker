import 'package:flutter/material.dart';

import '../models/models.dart';
import '../ui/format.dart';
import '../ui/widgets.dart';

class VehicleSettingsScreen extends StatefulWidget {
  const VehicleSettingsScreen({super.key, required this.serial});
  final String serial;
  @override
  State<VehicleSettingsScreen> createState() => _VehicleSettingsScreenState();
}

class _VehicleSettingsScreenState extends State<VehicleSettingsScreen> {
  DeviceSettings? _s;
  Object? _error;

  static const _intervals = [10, 15, 30, 60, 120, 300, 600];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await AppScope.read(context).api.settings(widget.serial);
      if (mounted) setState(() => _s = s);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _patch(Map<String, Object> patch) async {
    try {
      final s = await AppScope.read(context).api.updateSettings(widget.serial, patch);
      if (mounted) setState(() => _s = s);
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    }
  }

  Future<void> _rename() async {
    final state = AppScope.read(context);
    final l = context.l;
    final c = TextEditingController(text: state.device(widget.serial)?.name ?? '');
    final name = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(l.rename),
        content: TextField(controller: c, maxLength: 80, autofocus: true, decoration: InputDecoration(labelText: l.vehicleName)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: Text(l.save)),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    try {
      await state.api.rename(widget.serial, name);
      state.renamed(widget.serial, name);
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    }
  }

  Future<void> _odometer() async {
    final state = AppScope.read(context);
    final l = context.l;
    final c = TextEditingController();
    final v = await showDialog<double>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(l.setOdometer),
        content: TextField(
          controller: c,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: l.km, helperText: l.odometerHint),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(d, double.tryParse(c.text.replaceAll(',', '.'))), child: Text(l.save)),
        ],
      ),
    );
    if (v == null || v < 0) return;
    try {
      await state.api.setOdometer(widget.serial, v);
      if (mounted) toast(context, l.saved);
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    }
  }

  String _alertLabel(String key) {
    final l = context.l;
    return switch (key) {
      'alert_overspeed' => l.alertOverspeed,
      'alert_ignition' => '${l.alertIgnitionOn} / ${l.alertIgnitionOff}',
      'alert_tow' => l.alertTow,
      'alert_impact' => l.alertImpact,
      'alert_harsh_driving' => '${l.alertHarshAccel} / ${l.alertHarshBrake}',
      'alert_power_cut' => l.alertPowerCut,
      'alert_jamming' => l.alertJamming,
      'alert_low_battery' => l.alertLowBattery,
      'alert_geofence' => '${l.alertGeofenceEnter} / ${l.alertGeofenceExit}',
      'alert_offline' => l.alertOffline,
      _ => key,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final t = Theme.of(context);
    final s = _s;
    final device = AppScope.of(context).device(widget.serial);
    return Scaffold(
      appBar: AppBar(title: Text(l.vehicleSettings)),
      body: _error != null
          ? EmptyState(icon: Icons.cloud_off_rounded, title: errorText(context, _error!))
          : s == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Card(
                    child: Column(children: [
                      ListTile(
                        leading: const Icon(Icons.edit_rounded),
                        title: Text(l.rename),
                        subtitle: Text(device?.label ?? widget.serial),
                        onTap: _rename,
                      ),
                      ListTile(
                        leading: const Icon(Icons.route_rounded),
                        title: Text(l.setOdometer),
                        subtitle: Text(l.odometerHint),
                        onTap: _odometer,
                      ),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(l.speedLimit, style: t.textTheme.titleSmall),
                        Row(children: [
                          Expanded(
                            child: Slider(
                              value: s.speedLimitKmh.toDouble().clamp(0, 200),
                              max: 200,
                              divisions: 20,
                              onChanged: (v) => setState(() => _s = DeviceSettings(
                                  speedLimitKmh: v.round(),
                                  reportIntervalS: s.reportIntervalS,
                                  toggles: s.toggles,
                                  silentMode: s.silentMode)),
                              onChangeEnd: (v) => _patch({'speed_limit_kmh': v.round()}),
                            ),
                          ),
                          SizedBox(
                            width: 90,
                            child: Text(
                              s.speedLimitKmh == 0 ? l.speedLimitOff : '${context.n(s.speedLimitKmh)} ${l.kmh}',
                              textAlign: TextAlign.end,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                        ]),
                        const SizedBox(height: 12),
                        Text(l.reportInterval, style: t.textTheme.titleSmall),
                        const SizedBox(height: 8),
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          for (final i in _intervals)
                            ChoiceChip(
                              label: Text(l.seconds(context.n(i))),
                              selected: s.reportIntervalS == i,
                              onSelected: (_) => _patch({'report_interval_s': i}),
                            ),
                        ]),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Column(children: [
                      SwitchListTile(
                        title: Text(l.silentMode),
                        subtitle: Text(l.silentModeDesc),
                        value: s.silentMode,
                        onChanged: (v) => _patch({'silent_mode': v}),
                      ),
                      const Divider(height: 1),
                      Padding(
                        padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 4),
                        child: Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: Text(l.alertTypes, style: t.textTheme.titleSmall),
                        ),
                      ),
                      for (final k in DeviceSettings.alertKeys)
                        SwitchListTile(
                          dense: true,
                          title: Text(_alertLabel(k)),
                          value: s.toggles[k] ?? true,
                          onChanged: (v) => _patch({k: v}),
                        ),
                    ]),
                  ),
                ]),
    );
  }
}
