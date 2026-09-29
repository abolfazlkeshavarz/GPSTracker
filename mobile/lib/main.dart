import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/app_state.dart';
import 'l10n/app_localizations.dart';
import 'screens/auth_screen.dart';
import 'screens/home_shell.dart';
import 'screens/lock_screen.dart';
import 'ui/format.dart';
import 'ui/theme.dart';
import 'ui/widgets.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  final state = await AppState.create();
  runApp(AppScope(state: state, child: const TrackerApp()));
  if (state.signedIn && !state.locked) state.startSession();
}

class TrackerApp extends StatelessWidget {
  const TrackerApp({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final lang = s.locale?.languageCode ??
        WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    return MaterialApp(
      onGenerateTitle: (c) => c.l.appName,
      debugShowCheckedModeBanner: false,
      locale: s.locale,
      supportedLocales: L.supportedLocales,
      localizationsDelegates: const [
        L.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      localeResolutionCallback: (device, supported) {
        for (final l in supported) {
          if (l.languageCode == device?.languageCode) return l;
        }
        return const Locale('en');
      },
      themeMode: s.themeMode,
      theme: buildTheme(Brightness.light, lang),
      darkTheme: buildTheme(Brightness.dark, lang),
      home: const _Gate(),
    );
  }
}

class _Gate extends StatelessWidget {
  const _Gate();

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    s.alertTitle = (a) => context.alertTitle(a);
    final Widget child;
    if (!s.signedIn) {
      child = const AuthScreen(key: ValueKey('auth'));
    } else if (s.locked) {
      child = const LockScreen(key: ValueKey('lock'));
    } else {
      child = const HomeShell(key: ValueKey('home'));
    }
    return AnimatedSwitcher(duration: const Duration(milliseconds: 350), child: child);
  }
}
