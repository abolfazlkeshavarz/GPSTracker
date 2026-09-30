import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/app_localizations.dart';
import '../models/models.dart';

extension Fmt on BuildContext {
  L get l => L.of(this);
  String get lang => Localizations.localeOf(this).languageCode;

  /// Numbers in the script of the active language (Persian digits for fa).
  String n(num v, {int decimals = 0}) {
    final f = NumberFormat.decimalPattern(lang)
      ..minimumFractionDigits = decimals
      ..maximumFractionDigits = decimals;
    return f.format(v);
  }

  String ago(DateTime? t) {
    if (t == null) return l.notReported;
    final d = DateTime.now().difference(t);
    if (d.inSeconds < 60) return l.justNow;
    if (d.inMinutes < 60) return l.minutesAgo(n(d.inMinutes));
    if (d.inHours < 24) return l.hoursAgo(n(d.inHours));
    return l.daysAgo(n(d.inDays));
  }

  String time(DateTime t) => DateFormat.Hm(lang).format(t);
  String day(DateTime t) => DateFormat.MMMEd(lang).format(t);
  String dateTime(DateTime t) => DateFormat.MMMd(lang).add_Hm().format(t);

  String duration(int seconds) {
    final h = seconds ~/ 3600, m = (seconds % 3600) ~/ 60;
    return '${n(h)}:${NumberFormat('00', lang).format(m)}';
  }

  String distance(double meters) =>
      meters < 1000 ? l.meters(n(meters.round())) : '${n(meters / 1000, decimals: 1)} ${l.km}';

  String alertTitle(Alert a) => switch (a.kind) {
        'impact' => l.alertImpact,
        'sos' => l.alertSos,
        'power_cut' => l.alertPowerCut,
        'power_restored' => l.alertPowerRestored,
        'tow' => l.alertTow,
        'jamming' => l.alertJamming,
        'overspeed' => l.alertOverspeed,
        'low_battery' => l.alertLowBattery,
        'offline' => l.alertOffline,
        'back_online' => l.alertBackOnline,
        'geofence_enter' => l.alertGeofenceEnter,
        'geofence_exit' => l.alertGeofenceExit,
        'ignition_on' => l.alertIgnitionOn,
        'ignition_off' => l.alertIgnitionOff,
        'harsh_accel' => l.alertHarshAccel,
        'harsh_brake' => l.alertHarshBrake,
        'harsh_corner' => l.alertHarshCorner,
        'subscription_expiring' => l.alertSubExpiring,
        'subscription_expired' => l.alertSubExpired,
        _ => a.title.isNotEmpty ? a.title : l.alertGeneric,
      };

  IconData alertIcon(String kind) => switch (kind) {
        'impact' => Icons.car_crash_rounded,
        'sos' => Icons.sos_rounded,
        'power_cut' || 'power_restored' => Icons.power_rounded,
        'tow' => Icons.rv_hookup_rounded,
        'jamming' => Icons.signal_cellular_nodata_rounded,
        'overspeed' => Icons.speed_rounded,
        'low_battery' => Icons.battery_alert_rounded,
        'offline' => Icons.cloud_off_rounded,
        'back_online' => Icons.cloud_done_rounded,
        'geofence_enter' || 'geofence_exit' => Icons.fence_rounded,
        'ignition_on' || 'ignition_off' => Icons.key_rounded,
        'harsh_accel' || 'harsh_brake' || 'harsh_corner' => Icons.warning_amber_rounded,
        _ => Icons.notifications_rounded,
      };

  String healthLabel(Health h) => switch (h) {
        Health.excellent => l.healthExcellent,
        Health.good => l.healthGood,
        Health.fair => l.healthFair,
        Health.poor => l.healthPoor,
      };

  String commandLabel(String c) => switch (c) {
        'engine_cut' => l.engineCut,
        'engine_restore' => l.engineRestore,
        'door_lock' => l.doorLock,
        'door_unlock' => l.doorUnlock,
        'locate' => l.locate,
        'reboot' => l.reboot,
        'set_interval' => l.reportInterval,
        _ => c,
      };

  String statusLabel(String s) => switch (s) {
        'pending' => l.statusPending,
        'sent' => l.statusSent,
        'acked' => l.statusAcked,
        'failed' => l.statusFailed,
        'expired' => l.statusExpired,
        _ => s,
      };
}
