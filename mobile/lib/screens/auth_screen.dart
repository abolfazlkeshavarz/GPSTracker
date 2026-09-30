import 'package:flutter/material.dart';

import '../core/api.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import '../ui/widgets.dart';
import 'server_screen.dart';
import 'settings_screen.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _form = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _pass = TextEditingController();
  final _pass2 = TextEditingController();
  bool _register = false;
  bool _busy = false;
  bool _obscure = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final s = AppScope.read(context);
      final msg = switch (s.sessionMessage) {
        'expired' => context.l.sessionExpired,
        'server' => context.l.serverChangedRelogin,
        _ => null,
      };
      if (msg != null) toast(context, msg);
      s.sessionMessage = null;
    });
  }

  @override
  void dispose() {
    _phone.dispose();
    _pass.dispose();
    _pass2.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    final s = AppScope.read(context);
    final phone = _phone.text.trim();
    try {
      if (_register) {
        await s.api.register(phone, _pass.text);
        if (!mounted) return;
        toast(context, context.l.accountCreated);
      }
      await s.login(phone, _pass.text);
    } on ApiException catch (e) {
      if (!mounted) return;
      final msg = switch (e.status) {
        401 => context.l.invalidCredentials,
        409 => context.l.accountExists,
        _ => errorText(context, e),
      };
      toast(context, msg, error: true);
    } catch (e) {
      if (mounted) toast(context, errorText(context, e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l;
    final t = Theme.of(context);
    final host = Uri.tryParse(AppScope.of(context).config.serverUrl)?.host ?? '';
    return Scaffold(
      body: Stack(children: [
        Positioned(
          top: -120,
          right: -80,
          child: Container(
            width: 320,
            height: 320,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: Palette.auroraGradient,
              boxShadow: [BoxShadow(color: Palette.aurora.withValues(alpha: 0.4), blurRadius: 120)],
            ),
          ),
        ),
        SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Form(
                  key: _form,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      const Icon(Icons.radar_rounded, size: 36),
                      const Spacer(),
                      IconButton(
                        tooltip: l.language,
                        icon: const Icon(Icons.translate_rounded),
                        onPressed: () => showLanguagePicker(context),
                      ),
                      IconButton(
                        tooltip: l.serverSettings,
                        icon: const Icon(Icons.dns_rounded),
                        onPressed: () => Navigator.push(
                            context, MaterialPageRoute(builder: (_) => const ServerScreen())),
                      ),
                    ]),
                    const SizedBox(height: 40),
                    Text(l.appName, style: t.textTheme.displaySmall),
                    const SizedBox(height: 8),
                    Text(l.tagline, style: t.textTheme.titleMedium?.copyWith(color: t.hintColor)),
                    const SizedBox(height: 36),
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      textDirection: TextDirection.ltr,
                      autofillHints: const [AutofillHints.telephoneNumber, AutofillHints.username],
                      decoration: InputDecoration(labelText: l.phone, prefixIcon: const Icon(Icons.phone_rounded)),
                      validator: (v) {
                        final s = (v ?? '').trim();
                        return RegExp(r'^(admin|\+?[0-9]{6,20})$').hasMatch(s) ? null : l.invalidPhone;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _pass,
                      obscureText: _obscure,
                      autofillHints: [_register ? AutofillHints.newPassword : AutofillHints.password],
                      decoration: InputDecoration(
                        labelText: l.password,
                        prefixIcon: const Icon(Icons.key_rounded),
                        suffixIcon: IconButton(
                          icon: Icon(_obscure ? Icons.visibility_rounded : Icons.visibility_off_rounded),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) => _register && (v ?? '').length < 8
                          ? l.passwordTooShort
                          : ((v ?? '').isEmpty ? l.passwordTooShort : null),
                    ),
                    AnimatedSize(
                      duration: const Duration(milliseconds: 250),
                      child: _register
                          ? Padding(
                              padding: const EdgeInsets.only(top: 14),
                              child: TextFormField(
                                controller: _pass2,
                                obscureText: _obscure,
                                decoration: InputDecoration(
                                    labelText: l.confirmPassword, prefixIcon: const Icon(Icons.key_rounded)),
                                validator: (v) => v != _pass.text ? l.passwordsDontMatch : null,
                              ),
                            )
                          : const SizedBox(width: double.infinity),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                          : Text(_register ? l.createAccount : l.signIn),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy ? null : () => setState(() => _register = !_register),
                      child: Text(_register ? l.haveAccount : l.noAccount),
                    ),
                    const SizedBox(height: 24),
                    Center(
                      child: Pill(text: host, color: t.hintColor, icon: Icons.lock_rounded),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
