import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Local notifications for alerts that arrive over the live socket.
class Notifier {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static Future<void> init() async {
    if (_ready) return;
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
      );
      _ready = true;
    } catch (_) {
      // A missing notification service must never stop the app starting.
    }
  }

  static Future<bool> requestPermission() async {
    await init();
    if (Platform.isAndroid) {
      return await _plugin
              .resolvePlatformSpecificImplementation<
                  AndroidFlutterLocalNotificationsPlugin>()
              ?.requestNotificationsPermission() ??
          false;
    }
    if (Platform.isIOS) {
      return await _plugin
              .resolvePlatformSpecificImplementation<
                  IOSFlutterLocalNotificationsPlugin>()
              ?.requestPermissions(alert: true, badge: true, sound: true) ??
          false;
    }
    return false;
  }

  static Future<void> show(int id, String title, String body, {required bool critical}) async {
    if (!_ready) return;
    try {
      await _plugin.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            critical ? 'critical_alerts' : 'vehicle_alerts',
            critical ? 'Critical vehicle alerts' : 'Vehicle alerts',
            importance: critical ? Importance.max : Importance.defaultImportance,
            priority: critical ? Priority.max : Priority.defaultPriority,
            category: critical ? AndroidNotificationCategory.alarm : null,
          ),
          iOS: DarwinNotificationDetails(
            interruptionLevel:
                critical ? InterruptionLevel.timeSensitive : InterruptionLevel.active,
          ),
        ),
      );
    } catch (_) {}
  }
}
