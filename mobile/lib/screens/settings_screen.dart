import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';

import '../core/api.dart';
import '../ui/format.dart';
import '../ui/widgets.dart';
import 'server_screen.dart';

Future<void> showLanguagePicker(BuildContext context) {
  final s = AppScope.read(context);
  const langs = [('en', 'English'), ('fa', 'فارسی'), ('it', 'Italiano')];
  return showModalBottomSheet(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        for (final (code, name) in langs)
          ListTile(
            title: Text(name),
            trailing: Localizations.localeOf(context).languageCode == code
                ? const Icon(Icons.check_rounded)
                : null,
            onTap: () {
              s.setLocale(Locale(code));
              Navigator.pop(c);
            },
          ),
      ]),
    ),
  );
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final l = context.l;
    final t = Theme.of(context);
    final langName = switch (Localizations.localeOf(context).languageCode) {
      'fa' => 'فارسی',
      'it' => 'Italiano',
      _ => 'English',
    };

    Widget section(String title, List<Widget> children) => Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 8, bottom: 8),
              child: Text(title, style: t.textTheme.labelLarge?.copyWith(color: t.colorScheme.primary)),
            ),
            Card(clipBehavior: Clip.antiAlias, child: Column(children: children)),
          ]),
        );

    return Scaffold(
      appBar: AppBar(title: Text(l.settings)),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        section(l.account, [
          ListTile(
            leading: const Icon(Icons.person_rounded),
            title: Text(s.user?.phone ?? '', textDirection: TextDirection.ltr),
            subtitle: Text(s.user?.role ?? ''),
          ),
          ListTile(
            leading: const Icon(Icons.password_rounded),
            title: Text(l.changePassword),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => _changePassword(context),
          ),
        ]),
        section(l.appearance, [
          ListTile(
            leading: const Icon(Icons.translate_rounded),
            title: Text(l.language),
            trailing: Text(langName),
            onTap: () => showLanguagePicker(context),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: SegmentedButton<ThemeMode>(
              segments: [
                ButtonSegment(value: ThemeMode.system, label: Text(l.themeSystem), icon: const Icon(Icons.brightness_auto_rounded)),
                ButtonSegment(value: ThemeMode.light, label: Text(l.themeLight), icon: const Icon(Icons.light_mode_rounded)),
                ButtonSegment(value: ThemeMode.dark, label: Text(l.themeDark), icon: const Icon(Icons.dark_mode_rounded)),
              ],
              selected: {s.themeMode},
              onSelectionChanged: (v) => s.setTheme(v.first),
            ),
          ),
        ]),
        section(l.security, [
          SwitchListTile(
            secondary: const Icon(Icons.fingerprint_rounded),
            title: Text(l.appLock),
            subtitle: Text(l.appLockDesc),
            value: s.biometricLock,
            onChanged: (on) async {
              if (on) {
                final auth = LocalAuthentication();
                try {
                  if (!await auth.isDeviceSupported()) {
                    if (context.mounted) toast(context, l.appLockUnavailable, error: true);
                    return;
                  }
                  if (!await auth.authenticate(localizedReason: l.unlockReason)) return;
                } catch (_) {
                  if (context.mounted) toast(context, l.appLockUnavailable, error: true);
                  return;
                }
              }
              await s.setBiometric(on);
            },
          ),
          SwitchListTile(
            secondary: const Icon(Icons.notifications_active_rounded),
            title: Text(l.notifications),
            subtitle: Text(l.notificationsDesc),
            value: s.notificationsOn,
            onChanged: s.setNotifications,
          ),
        ]),
        section(l.server, [
          ListTile(
            leading: const Icon(Icons.dns_rounded),
            title: Text(l.serverSettings),
            subtitle: Text(s.config.serverUrl, textDirection: TextDirection.ltr),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ServerScreen())),
          ),
        ]),
        section(l.about, [
          ListTile(
            leading: const Icon(Icons.info_outline_rounded),
            title: Text(l.appName),
            subtitle: Text(l.version(const String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0'))),
          ),
        ]),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            foregroundColor: t.colorScheme.error,
          ),
          icon: const Icon(Icons.logout_rounded),
          label: Text(l.logout),
          onPressed: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (c) => AlertDialog(
                title: Text(l.logoutConfirm),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(c, false), child: Text(l.cancel)),
                  FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(l.logout)),
                ],
              ),
            );
            if (ok == true && context.mounted) {
              Navigator.of(context).popUntil((r) => r.isFirst);
              await s.logout();
            }
          },
        ),
      ]),
    );
  }

  Future<void> _changePassword(BuildContext context) async {
    final l = context.l;
    final cur = TextEditingController(), next = TextEditingController();
    final form = GlobalKey<FormState>();
    await showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(l.changePassword),
        content: Form(
          key: form,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextFormField(controller: cur, obscureText: true, decoration: InputDecoration(labelText: l.currentPassword)),
            const SizedBox(height: 12),
            TextFormField(
              controller: next,
              obscureText: true,
              decoration: InputDecoration(labelText: l.newPassword),
              validator: (v) => (v ?? '').length < 8 ? l.passwordTooShort : null,
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: Text(l.cancel)),
          FilledButton(
            onPressed: () async {
              if (!form.currentState!.validate()) return;
              try {
                await AppScope.read(context).api.changePassword(cur.text, next.text);
                if (c.mounted) Navigator.pop(c);
                if (context.mounted) toast(context, l.passwordChanged);
              } on ApiException catch (e) {
                if (context.mounted) {
                  toast(context, e.status == 401 ? l.wrongCurrentPassword : errorText(context, e), error: true);
                }
              }
            },
            child: Text(l.save),
          ),
        ],
      ),
    );
  }
}
