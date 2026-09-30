import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import 'api.dart';
import 'config.dart';
import 'notifications.dart';
import 'realtime.dart';

/// App-wide state: session, preferences, the fleet and its live positions.
class AppState extends ChangeNotifier with WidgetsBindingObserver {
  AppState._(this.config, this._prefs) : api = Api(config) {
    api.onUnauthorized = _expireSession;
    realtime = Realtime(
      onPosition: _onPosition,
      onAlert: _onAlert,
      onState: (c) {
        if (live != c) {
          live = c;
          notifyListeners();
        }
      },
    );
  }

  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  );

  static Future<AppState> create() async {
    final prefs = await SharedPreferences.getInstance();
    final s = AppState._(await ServerConfig.load(), prefs);
    await s._restore();
    WidgetsBinding.instance.addObserver(s);
    s.refreshAppConfig();
    return s;
  }

  final SharedPreferences _prefs;
  ServerConfig config;
  final Api api;
  late final Realtime realtime;

  // --------------------------------------------------------- preferences
  Locale? locale;
  ThemeMode themeMode = ThemeMode.system;
  bool biometricLock = false;
  bool notificationsOn = true;

  // ------------------------------------------------------------ map server
  /// Tile template and attribution published by the platform admin.
  String? serverTileUrl;
  String? serverAttribution;

  /// What the map actually loads: the user's override, else the admin's map
  /// server, else OpenStreetMap.
  String get tileUrl => config.tileUrl.isNotEmpty
      ? config.tileUrl
      : (serverTileUrl?.isNotEmpty ?? false)
          ? serverTileUrl!
          : ServerConfig.fallbackTiles;

  String get mapAttribution => serverAttribution?.isNotEmpty ?? false
      ? serverAttribution!
      : '© OpenStreetMap contributors';

  Future<void> refreshAppConfig() async {
    try {
      final cfg = await api.appConfig();
      final tiles = cfg['map_tile_url'];
      if (tiles != null && ServerConfig.isValidTileTemplate(tiles)) {
        serverTileUrl = tiles;
        await _prefs.setString('server_tiles', tiles);
      }
      serverAttribution = cfg['map_attribution'];
      if (serverAttribution != null) await _prefs.setString('server_attr', serverAttribution!);
      notifyListeners();
    } catch (_) {
      // Offline: the cached value from the last successful fetch stays.
    }
  }

  // ------------------------------------------------------------- session
  User? user;
  bool get signedIn => api.token != null;
  bool locked = false;
  String? sessionMessage;

  // --------------------------------------------------------------- fleet
  List<Device> devices = [];
  final Map<String, Position> positions = {};
  final Map<String, bool> onlineMap = {};
  final Map<String, Capabilities> caps = {};
  bool loadingFleet = false;
  bool fleetFromCache = false;
  bool live = false;
  int unreadAlerts = 0;
  final _alertStream = StreamController<Alert>.broadcast();
  Stream<Alert> get alertStream => _alertStream.stream;

  Future<void> _restore() async {
    final code = _prefs.getString('locale');
    if (code != null) locale = Locale(code);
    themeMode = ThemeMode.values[_prefs.getInt('theme') ?? 0];
    biometricLock = _prefs.getBool('bio_lock') ?? false;
    notificationsOn = _prefs.getBool('notif') ?? true;
    serverTileUrl = _prefs.getString('server_tiles');
    serverAttribution = _prefs.getString('server_attr');
    locked = biometricLock;

    String? token;
    try {
      token = await _secure.read(key: 'token');
    } catch (_) {
      // Keystore can be wiped by an OS restore; treat as signed out.
    }
    if (token != null && !_jwtExpired(token)) {
      api.token = token;
      final u = _prefs.getString('user');
      if (u != null) user = User.fromJson(jsonDecode(u));
      _loadCachedFleet();
    } else if (token != null) {
      await _secure.delete(key: 'token');
    }
  }

  static bool _jwtExpired(String token) {
    try {
      final parts = token.split('.');
      final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      final exp = payload['exp'];
      return exp is num && DateTime.now().millisecondsSinceEpoch ~/ 1000 >= exp;
    } catch (_) {
      return true;
    }
  }

  // ----------------------------------------------------------- lifecycle

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && biometricLock && signedIn) {
      _pausedAt = DateTime.now();
    }
    if (state == AppLifecycleState.resumed) {
      if (_pausedAt != null &&
          DateTime.now().difference(_pausedAt!) > const Duration(seconds: 30)) {
        locked = true;
        notifyListeners();
      }
      _pausedAt = null;
      if (signedIn) {
        realtime.nudge();
        refreshFleet(quiet: true);
      }
    }
  }

  DateTime? _pausedAt;

  void unlock() {
    locked = false;
    notifyListeners();
    if (signedIn) startSession();
  }

  // ------------------------------------------------------------- session

  Future<void> login(String phone, String password) async {
    final (token, u) = await api.login(phone, password);
    api.token = token;
    user = u;
    await _secure.write(key: 'token', value: token);
    await _prefs.setString('user', jsonEncode(u.toJson()));
    sessionMessage = null;
    notifyListeners();
    await startSession();
  }

  Future<void> startSession() async {
    if (!signedIn || locked) return;
    realtime.start(config, api.token!);
    if (notificationsOn) Notifier.init();
    await refreshFleet();
    unawaited(refreshUnread());
  }

  Future<void> logout({String? message}) async {
    realtime.stop();
    api.token = null;
    user = null;
    devices = [];
    positions.clear();
    onlineMap.clear();
    caps.clear();
    unreadAlerts = 0;
    sessionMessage = message;
    await _secure.delete(key: 'token');
    await _prefs.remove('user');
    await _prefs.remove('fleet_cache');
    notifyListeners();
  }

  void _expireSession() {
    if (signedIn) logout(message: 'expired');
  }

  // ----------------------------------------------------------- preferences

  Future<void> setLocale(Locale? l) async {
    locale = l;
    if (l == null) {
      await _prefs.remove('locale');
    } else {
      await _prefs.setString('locale', l.languageCode);
    }
    notifyListeners();
  }

  Future<void> setTheme(ThemeMode m) async {
    themeMode = m;
    await _prefs.setInt('theme', m.index);
    notifyListeners();
  }

  Future<void> setBiometric(bool on) async {
    biometricLock = on;
    await _prefs.setBool('bio_lock', on);
    notifyListeners();
  }

  Future<void> setNotifications(bool on) async {
    notificationsOn = on;
    await _prefs.setBool('notif', on);
    if (on) await Notifier.requestPermission();
    notifyListeners();
  }

  /// Switches server. A token from one server means nothing to another, so
  /// changing the host signs the user out.
  Future<void> setServer(ServerConfig next) async {
    final hostChanged = next.serverUrl != config.serverUrl;
    await next.save();
    config = next;
    api.config = next;
    if (hostChanged) {
      serverTileUrl = null;
      serverAttribution = null;
      await _prefs.remove('server_tiles');
      await _prefs.remove('server_attr');
      unawaited(refreshAppConfig());
    }
    if (hostChanged && signedIn) {
      await logout(message: 'server');
    } else {
      notifyListeners();
    }
  }

  // ----------------------------------------------------------------- fleet

  void _loadCachedFleet() {
    final raw = _prefs.getString('fleet_cache');
    if (raw == null) return;
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      devices = [for (final d in j['devices'] as List) Device.fromJson(d)];
      for (final e in (j['positions'] as Map<String, dynamic>).entries) {
        final p = Position.fromJson(e.value);
        positions[e.key] = p;
        (caps[e.key] ??= Capabilities()).learn(p);
      }
      fleetFromCache = true;
    } catch (_) {}
  }

  void _saveFleetCache() {
    final pos = <String, dynamic>{};
    positions.forEach((k, p) => pos[k] = {
          'device': p.device,
          'lat': p.lat,
          'lng': p.lng,
          'speed': p.speed,
          'sat': p.satellites,
          if (p.csq != null) 'csq': p.csq,
          if (p.battery != null) 'battery': p.battery,
          if (p.ignition != null) 'ignition': p.ignition,
          if (p.heading != null) 'heading': p.heading,
          if (p.time != null) 'timestamp': p.time!.millisecondsSinceEpoch ~/ 1000,
        });
    _prefs.setString(
        'fleet_cache', jsonEncode({'devices': [for (final d in devices) d.raw], 'positions': pos}));
  }

  Future<void> refreshFleet({bool quiet = false}) async {
    if (!signedIn) return;
    if (!quiet) {
      loadingFleet = true;
      notifyListeners();
    }
    try {
      devices = await api.devices();
      await Future.wait(devices.map((d) async {
        try {
          final results = await Future.wait([api.latest(d.serial), api.online(d.serial)]);
          final p = results[0] as Position?;
          if (p != null) {
            positions[d.serial] = p;
            (caps[d.serial] ??= Capabilities()).learn(p);
          }
          onlineMap[d.serial] = results[1] as bool;
        } on ApiException catch (e) {
          if (e.isUnauthorized) rethrow;
        }
      }));
      fleetFromCache = false;
      _saveFleetCache();
    } on ApiException catch (e) {
      if (e.isNetwork) fleetFromCache = devices.isNotEmpty;
    } finally {
      loadingFleet = false;
      notifyListeners();
    }
  }

  Future<void> refreshUnread() async {
    try {
      final (_, n) = await api.alerts(unreadOnly: true);
      unreadAlerts = n;
      notifyListeners();
    } catch (_) {}
  }

  void setUnread(int n) {
    unreadAlerts = n;
    notifyListeners();
  }

  void renamed(String serial, String name) {
    devices = [for (final d in devices) d.serial == serial ? d.copyWith(name: name) : d];
    notifyListeners();
  }

  Device? device(String serial) {
    for (final d in devices) {
      if (d.serial == serial) return d;
    }
    return null;
  }

  void _onPosition(Position p) {
    if (device(p.device) == null) return;
    positions[p.device] = p;
    onlineMap[p.device] = true;
    (caps[p.device] ??= Capabilities()).learn(p);
    notifyListeners();
  }

  /// Localised title for an alert; set by the widget tree once localisations
  /// are available, so a background notification is in the user's language.
  String Function(Alert)? alertTitle;

  void _onAlert(Alert a) {
    unreadAlerts++;
    _alertStream.add(a);
    notifyListeners();
    if (notificationsOn) {
      final name = device(a.device)?.label ?? a.device;
      final title = alertTitle?.call(a) ?? a.title;
      Notifier.show(a.id, '$name · $title', a.detail, critical: a.severity == 'critical');
    }
  }
}
