import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

/// Lets the platform move to a new host without a new app release.
class ServerScreen extends StatefulWidget {
  const ServerScreen({super.key});
  @override
  State<ServerScreen> createState() => _ServerScreenState();
}

class _ServerScreenState extends State<ServerScreen> {
  late final TextEditingController _server;
  late final TextEditingController _tiles;
  bool? _reachable;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final cfg = AppScope.read(context).config;
    _server = TextEditingController(text: cfg.serverUrl);
    _tiles = TextEditingController(text: cfg.tileUrl);
  }

  @override
  void dispose() {
    _server.dispose();
    _tiles.dispose();
    super.dispose();
  }

  Future<bool> _test() async {
    final url = ServerConfig.normaliseServer(_server.text);
    if (url == null) {
      toast(context, context.l.invalidUrl, error: true);
      return false;
    }
    setState(() {
      _busy = true;
      _reachable = null;
    });
    final ok = await Api.probe(url);
    if (mounted) {
      setState(() {
        _busy = false;
        _reachable = ok;
      });
    }
    return ok;
  }

  Future<void> _save() async {
    final l = context.l;
    final url = ServerConfig.normaliseServer(_server.text);
    if (url == null) return toast(context, l.invalidUrl, error: true);
    if (!ServerConfig.isValidTileTemplate(_tiles.text)) {
      return toast(context, l.mapTilesHelp, error: true);
    }
    if (!await _test()) return;
    if (!mounted) return;
    await AppScope.read(context).setServer(ServerConfig(serverUrl: url, tileUrl: _tiles.text.trim()));
    if (!mounted) return;
    toast(context, l.saved);
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    return Scaffold(
      appBar: AppBar(title: Text(l.serverSettings)),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        TextField(
          controller: _server,
          keyboardType: TextInputType.url,
          textDirection: TextDirection.ltr,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: l.serverUrl,
            helperText: l.serverUrlHelp,
            helperMaxLines: 2,
            prefixIcon: const Icon(Icons.dns_rounded),
            suffixIcon: _reachable == null
                ? null
                : Icon(_reachable! ? Icons.check_circle_rounded : Icons.error_rounded,
                    color: _reachable! ? Palette.aurora : Palette.alarm),
          ),
          onChanged: (_) => setState(() => _reachable = null),
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _tiles,
          keyboardType: TextInputType.url,
          textDirection: TextDirection.ltr,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: l.mapTiles,
            helperText: l.mapTilesHelp,
            prefixIcon: const Icon(Icons.layers_rounded),
          ),
        ),
        const SizedBox(height: 28),
        OutlinedButton.icon(
          onPressed: _busy ? null : _test,
          icon: _busy
              ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.network_check_rounded),
          label: Text(_reachable == null ? l.testConnection : (_reachable! ? l.connectionOk : l.connectionFailed)),
        ),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy ? null : _save, child: Text(l.save)),
        const SizedBox(height: 12),
        TextButton(
          onPressed: () => setState(() {
            _server.text = ServerConfig.defaultServer;
            _tiles.text = '';
            _reachable = null;
          }),
          child: Text(l.restoreDefaults),
        ),
      ]),
    );
  }
}
