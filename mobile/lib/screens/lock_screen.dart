import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';

import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';

class LockScreen extends StatefulWidget {
  const LockScreen({super.key});
  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  final _auth = LocalAuthentication();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlock());
  }

  Future<void> _unlock() async {
    if (_busy) return;
    setState(() => _busy = true);
    final state = AppScope.read(context);
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) {
        // The lock can no longer be satisfied (e.g. the PIN was removed);
        // falling open is the only alternative to locking the owner out.
        await state.setBiometric(false);
        state.unlock();
        return;
      }
      final ok = await _auth.authenticate(
        localizedReason: mounted ? context.l.unlockReason : 'Unlock',
        persistAcrossBackgrounding: true,
      );
      if (ok) state.unlock();
    } catch (_) {
      // Cancelled or temporarily locked out; stay on this screen.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              padding: const EdgeInsets.all(28),
              decoration: const BoxDecoration(shape: BoxShape.circle, gradient: Palette.auroraGradient),
              child: const Icon(Icons.lock_rounded, size: 48, color: Colors.white),
            ),
            const SizedBox(height: 24),
            Text(context.l.locked, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 32),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 48),
              child: FilledButton.icon(
                onPressed: _busy ? null : _unlock,
                icon: const Icon(Icons.fingerprint_rounded),
                label: Text(context.l.unlock),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
