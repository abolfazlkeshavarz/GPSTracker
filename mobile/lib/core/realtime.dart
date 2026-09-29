import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:web_socket_channel/io.dart';

import '../models/models.dart';
import 'config.dart';

/// The single live socket: device positions plus this user's alerts.
///
/// Reconnects with capped exponential backoff and jitter so a fleet of phones
/// does not stampede the server when it comes back after a restart.
class Realtime {
  Realtime({required this.onPosition, required this.onAlert, required this.onState});

  final void Function(Position) onPosition;
  final void Function(Alert) onAlert;
  final void Function(bool connected) onState;

  IOWebSocketChannel? _ch;
  StreamSubscription? _sub;
  Timer? _retry;
  int _attempt = 0;
  bool _wanted = false;
  ServerConfig? _cfg;
  String? _token;

  void start(ServerConfig cfg, String token) {
    _cfg = cfg;
    _token = token;
    _wanted = true;
    _attempt = 0;
    _connect();
  }

  void stop() {
    _wanted = false;
    _retry?.cancel();
    _sub?.cancel();
    _ch?.sink.close(1000);
    _ch = null;
    onState(false);
  }

  /// Called when the app returns to the foreground: skip any pending backoff.
  void nudge() {
    if (_wanted && _ch == null) {
      _retry?.cancel();
      _connect();
    }
  }

  void _connect() {
    if (!_wanted || _cfg == null || _token == null) return;
    try {
      // The token travels in a header rather than the query string so it
      // never lands in proxy access logs.
      final ch = IOWebSocketChannel.connect(
        _cfg!.websocket,
        headers: {HttpHeaders.authorizationHeader: 'Bearer $_token'},
        pingInterval: const Duration(seconds: 25),
        connectTimeout: const Duration(seconds: 15),
      );
      _ch = ch;
      ch.ready.then((_) {
        _attempt = 0;
        onState(true);
      }, onError: (Object _) {
        // The stream's onError/onDone below handles the reconnect.
      });
      _sub = ch.stream.listen(_onMessage, onDone: _drop, onError: (_) => _drop());
    } catch (_) {
      _drop();
    }
  }

  void _onMessage(dynamic data) {
    if (data is! String) return;
    Map<String, dynamic> j;
    try {
      final d = jsonDecode(data);
      if (d is! Map<String, dynamic>) return;
      j = d;
    } catch (_) {
      return;
    }
    switch (j['type']) {
      case 'alert':
        onAlert(Alert.fromJson(j));
      case 'connected':
        break;
      default:
        if (j['device'] is String && j['lat'] is num) onPosition(Position.fromJson(j));
    }
  }

  void _drop() {
    _sub?.cancel();
    _sub = null;
    _ch = null;
    onState(false);
    if (!_wanted) return;
    final base = math.min(60, 1 << math.min(_attempt, 6));
    final jitter = math.Random().nextDouble() * base * 0.3;
    _attempt++;
    _retry?.cancel();
    _retry = Timer(Duration(milliseconds: ((base + jitter) * 1000).round()), _connect);
  }
}
