import 'package:flutter/material.dart';

/// "Night glass": a deep, calm canvas with one electric accent, so live data
/// is the brightest thing on screen.
class Palette {
  static const aurora = Color(0xFF3DDBB4); // live / healthy
  static const signal = Color(0xFF6C8CFF); // primary actions
  static const ember = Color(0xFFFFB547); // warnings
  static const alarm = Color(0xFFFF5A6E); // critical
  static const ink = Color(0xFF0B0F17);
  static const inkRaised = Color(0xFF141A26);

  static const auroraGradient = LinearGradient(
    colors: [Color(0xFF3DDBB4), Color(0xFF6C8CFF)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static Color severity(String s) => switch (s) {
        'critical' => alarm,
        'warning' => ember,
        _ => signal,
      };
}

ThemeData buildTheme(Brightness b, String lang) {
  final dark = b == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: Palette.signal,
    brightness: b,
    primary: dark ? Palette.signal : const Color(0xFF3B5BDB),
    secondary: Palette.aurora,
    error: Palette.alarm,
    surface: dark ? Palette.ink : const Color(0xFFF6F7FB),
  );
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    brightness: b,
    fontFamily: lang == 'fa' ? 'Vazirmatn' : null,
    scaffoldBackgroundColor: scheme.surface,
  );
  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      displaySmall: base.textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -1),
      headlineSmall: base.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
      titleLarge: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: dark ? Palette.inkRaised : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? Palette.inkRaised : Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(54),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: dark ? Palette.inkRaised : Colors.white,
      indicatorColor: scheme.primary.withValues(alpha: 0.18),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
  );
}
