import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the app talks to. Both values are editable from Settings so the
/// platform can move to a new host without shipping a new build.
class ServerConfig {
  static const defaultServer = String.fromEnvironment(
    'DEFAULT_SERVER',
    defaultValue: 'https://gps.abolfazl.fun',
  );
  /// The tileserver-gl container that ships with the backend stack, exposed
  /// by nginx on the platform's own domain. Relative: resolved against the
  /// server address, so it follows the app when the server changes.
  static const platformTiles = '/tiles/styles/osm-bright/{z}/{x}/{y}.png';

  /// Per-tile fallback when the platform map server has no tile (e.g. outside
  /// the region its .mbtiles covers) or is unreachable.
  static const fallbackTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  /// Pre-2.0 builds stored the OpenStreetMap template as an explicit choice;
  /// it is now what "follow the server" falls back to.
  static const _legacyDefaultTiles = fallbackTiles;

  static const _kServer = 'server_url';
  static const _kTiles = 'tile_url';

  final String serverUrl;
  /// The user's own tile template, or empty to use the map server the
  /// platform admin configured (GET /api/app-config).
  final String tileUrl;

  const ServerConfig({required this.serverUrl, required this.tileUrl});

  static Future<ServerConfig> load() async {
    final p = await SharedPreferences.getInstance();
    return ServerConfig(
      serverUrl: p.getString(_kServer) ?? defaultServer,
      tileUrl: switch (p.getString(_kTiles)) {
        null || _legacyDefaultTiles => '',
        final v => v,
      },
    );
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kServer, serverUrl);
    await p.setString(_kTiles, tileUrl);
  }

  Uri api(String path, [Map<String, String>? query]) {
    final base = Uri.parse(serverUrl);
    return base.replace(
      path: '${base.path.replaceAll(RegExp(r'/+$'), '')}/api$path',
      queryParameters: query,
    );
  }

  Uri get health {
    final base = Uri.parse(serverUrl);
    return base.replace(path: '${base.path.replaceAll(RegExp(r'/+$'), '')}/health');
  }

  Uri get websocket {
    final u = api('/ws');
    return u.replace(scheme: u.scheme == 'https' ? 'wss' : 'ws');
  }

  /// Normalises what a user typed into a server address, or returns null when
  /// it cannot be one. Plain http is only accepted in debug builds: a release
  /// build would otherwise send the password and token in clear text.
  static String? normaliseServer(String raw) {
    var s = raw.trim();
    if (s.isEmpty) return null;
    if (!s.contains('://')) s = 'https://$s';
    final u = Uri.tryParse(s);
    if (u == null || u.host.isEmpty) return null;
    if (u.scheme != 'https' && !(u.scheme == 'http' && !kReleaseMode)) {
      return null;
    }
    if (u.hasQuery || u.hasFragment || u.userInfo.isNotEmpty) return null;
    return s.replaceAll(RegExp(r'/+$'), '');
  }

  /// Turns a platform-relative tile path (/tiles/...) into a full URL on the
  /// connected server; absolute templates are returned unchanged.
  String resolveTiles(String template) {
    if (!template.startsWith('/') || template.startsWith('//')) return template;
    return '${serverUrl.replaceAll(RegExp(r'/+$'), '')}$template';
  }

  static bool isValidTileTemplate(String raw) {
    if (raw.trim().isEmpty) return true; // empty = follow the server
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      return raw.contains('{z}') && raw.contains('{x}') && raw.contains('{y}');
    }
    final u = Uri.tryParse(raw.trim().replaceAll(RegExp(r'[{}]'), ''));
    return u != null &&
        (u.scheme == 'https' || (!kReleaseMode && u.scheme == 'http')) &&
        raw.contains('{z}') &&
        raw.contains('{x}') &&
        raw.contains('{y}');
  }
}
