import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../models/models.dart';
import 'config.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  const ApiException(this.status, this.message);

  bool get isNetwork => status == 0;
  bool get isUnauthorized => status == 401;

  @override
  String toString() => 'ApiException($status, $message)';
}

/// Thin typed client over the backend REST API.
class Api {
  Api(this.config, {this.onUnauthorized});

  ServerConfig config;
  String? token;
  void Function()? onUnauthorized;

  final http.Client _http = http.Client();
  static const _timeout = Duration(seconds: 20);

  Map<String, String> get _headers => {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> _send(String method, String path,
      {Object? body, Map<String, String>? query, bool raw = false}) async {
    final uri = config.api(path, query);
    http.Response res;
    try {
      final req = http.Request(method, uri)..headers.addAll(_headers);
      if (body != null) req.body = jsonEncode(body);
      res = await http.Response.fromStream(await _http.send(req).timeout(_timeout));
    } on SocketException {
      throw const ApiException(0, 'network');
    } on TimeoutException {
      throw const ApiException(0, 'timeout');
    } on HandshakeException {
      throw const ApiException(0, 'tls');
    } on http.ClientException {
      throw const ApiException(0, 'network');
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      var msg = res.reasonPhrase ?? 'error';
      try {
        final j = jsonDecode(utf8.decode(res.bodyBytes));
        if (j is Map && j['error'] is String) msg = j['error'] as String;
      } catch (_) {}
      // Only a rejected token ends the session. A 401 for a wrong *current*
      // password on the change-password form must not sign the user out.
      if (res.statusCode == 401 && token != null && path != '/me/password') {
        onUnauthorized?.call();
      }
      throw ApiException(res.statusCode, msg);
    }
    if (raw) return res.bodyBytes;
    if (res.bodyBytes.isEmpty) return null;
    return jsonDecode(utf8.decode(res.bodyBytes));
  }

  Future<dynamic> get(String p, [Map<String, String>? q]) => _send('GET', p, query: q);
  Future<dynamic> post(String p, [Object? b]) => _send('POST', p, body: b ?? const {});
  Future<dynamic> put(String p, Object b) => _send('PUT', p, body: b);
  Future<dynamic> delete(String p) => _send('DELETE', p);

  /// Checks that [serverUrl] answers like this backend, without changing the
  /// active configuration.
  static Future<bool> probe(String serverUrl) async {
    try {
      final cfg = ServerConfig(serverUrl: serverUrl, tileUrl: '');
      final res = await http.get(cfg.health).timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return false;
      final j = jsonDecode(res.body);
      return j is Map && j['status'] == 'ok';
    } catch (_) {
      return false;
    }
  }

  /// Platform settings the admin controls, such as the map server. Public,
  /// so it works before sign-in.
  Future<Map<String, String>> appConfig() async {
    final j = await get('/app-config');
    return {
      if (j is Map)
        for (final e in j.entries)
          if (e.value is String) e.key as String: e.value as String,
    };
  }

  // ------------------------------------------------------------ auth

  Future<(String, User)> login(String phone, String password) async {
    final j = await post('/login', {'phone': phone, 'password': password});
    return (j['token'] as String, User.fromJson(j['user']));
  }

  Future<void> register(String phone, String password) =>
      post('/register', {'phone': phone, 'password': password});

  Future<User> me() async => User.fromJson(await get('/me'));

  Future<void> changePassword(String current, String next) =>
      put('/me/password', {'current_password': current, 'new_password': next});

  // --------------------------------------------------------- devices

  Future<List<Device>> devices() async {
    final j = await get('/devices');
    return [for (final d in (j['devices'] as List? ?? [])) Device.fromJson(d)];
  }

  Future<int> activate(String serial, String secret) async {
    final j = await post('/activate', {'serial': serial, 'secret': secret});
    return (j['trial_days'] as num?)?.toInt() ?? 0;
  }

  Future<Position?> latest(String serial) async {
    try {
      return Position.fromJson(await get('/devices/${_e(serial)}/latest'));
    } on ApiException catch (e) {
      if (e.status == 404) return null;
      rethrow;
    }
  }

  Future<bool> online(String serial) async {
    final j = await get('/devices/${_e(serial)}/status');
    return j['online'] == true;
  }

  Future<Track> track(String serial, DateTime from, DateTime to) async {
    final j = await get('/devices/${_e(serial)}/track', {
      'from': _ts(from),
      'to': _ts(to),
    });
    return Track.fromJson(j);
  }

  Future<void> rename(String serial, String name) =>
      put('/devices/${_e(serial)}/name', {'name': name});

  Future<double> odometerKm(String serial) async {
    final j = await get('/devices/${_e(serial)}/odometer');
    return (j['total_km'] as num?)?.toDouble() ?? 0;
  }

  Future<void> setOdometer(String serial, double km) =>
      put('/devices/${_e(serial)}/odometer', {'total_km': km});

  Future<DeviceSettings> settings(String serial) async =>
      DeviceSettings.fromJson(await get('/devices/${_e(serial)}/settings'));

  Future<DeviceSettings> updateSettings(String serial, Map<String, Object> patch) async =>
      DeviceSettings.fromJson(await put('/devices/${_e(serial)}/settings', patch));

  Future<Command> command(String serial, String command, {bool confirm = false}) async =>
      Command.fromJson(await post('/devices/${_e(serial)}/commands',
          {'command': command, if (confirm) 'confirm': true}));

  Future<List<Command>> commands(String serial) async {
    final j = await get('/devices/${_e(serial)}/commands', {'limit': '10'});
    return [for (final c in (j['commands'] as List? ?? [])) Command.fromJson(c)];
  }

  Future<PlanInfo> plan(String serial) async =>
      PlanInfo.fromJson(await get('/devices/${_e(serial)}/subscription'));

  Future<List<int>> exportCsv(String serial, DateTime from, DateTime to) async {
    final bytes = await _send('GET', '/devices/${_e(serial)}/export.csv',
        query: {
          'from': _ts(from),
          'to': _ts(to),
        },
        raw: true);
    return bytes as List<int>;
  }

  // ------------------------------------------------------- geofences

  Future<List<Geofence>> geofences(String serial) async {
    final j = await get('/devices/${_e(serial)}/geofences');
    return [for (final g in (j['geofences'] as List? ?? [])) Geofence.fromJson(g)];
  }

  Future<Geofence> createGeofence(String serial, String name, double lat, double lng,
          int radius, String triggerOn) async =>
      Geofence.fromJson(await post('/devices/${_e(serial)}/geofences', {
        'name': name,
        'lat': lat,
        'lng': lng,
        'radius_m': radius,
        'trigger_on': triggerOn,
      }));

  Future<void> deleteGeofence(String serial, int id) =>
      delete('/devices/${_e(serial)}/geofences/$id');

  // ---------------------------------------------------------- alerts

  Future<(List<Alert>, int)> alerts({bool unreadOnly = false}) async {
    final j = await get('/alerts', {'limit': '100', if (unreadOnly) 'unread': '1'});
    return (
      [for (final a in (j['alerts'] as List? ?? [])) Alert.fromJson(a)],
      (j['unread_count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> markRead(int id) => post('/alerts/$id/read');
  Future<void> markAllRead() => post('/alerts/read-all');

  static String _e(String s) => Uri.encodeComponent(s);

  /// RFC3339 in UTC without fractional seconds, as the backend parses it.
  static String _ts(DateTime t) => '${t.toUtc().toIso8601String().split('.').first}Z';
}
