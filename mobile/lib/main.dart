import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/home_shell.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'core/config/supabase_config.dart';


Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: SupabaseConfig.url,
    publishableKey: SupabaseConfig.publishableKey,
  );

  runApp(const MagelangEkspressApp());
}


class MagelangEkspressApp extends StatefulWidget {
  const MagelangEkspressApp({super.key});

  @override
  State<MagelangEkspressApp> createState() => MagelangEkspressAppState();

  static MagelangEkspressAppState of(BuildContext context) =>
      context.findAncestorStateOfType<MagelangEkspressAppState>()!;
}

class MagelangEkspressAppState extends State<MagelangEkspressApp> {
  ThemeMode themeMode = ThemeMode.light;
  double fontScale = 1.0;

  void toggleTheme(bool dark) =>
      setState(() => themeMode = dark ? ThemeMode.dark : ThemeMode.light);

  void setFontScale(double value) => setState(() => fontScale = value);

  @override
  Widget build(BuildContext context) {
    const navy = Color(0xFF102A43);
    final lightScheme = ColorScheme.fromSeed(
      seedColor: navy,
      brightness: Brightness.light,
      primary: navy,
      surface: const Color(0xFFF7F9FC),
    );
    final darkScheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF6FA8DC),
      brightness: Brightness.dark,
    );

    return MaterialApp(
      title: 'Magelang Ekspress',
      debugShowCheckedModeBanner: false,
      themeMode: themeMode,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: lightScheme,
        scaffoldBackgroundColor: const Color(0xFFF7F9FC),
        textTheme: GoogleFonts.interTextTheme().apply(
          bodyColor: const Color(0xFF172B3A),
          displayColor: const Color(0xFF102A43),
        ).apply(fontSizeFactor: fontScale),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFFF7F9FC),
          foregroundColor: navy,
          elevation: 0,
          centerTitle: false,
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: Color(0xFFE7EDF3)),
          ),
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: darkScheme,
        textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme)
            .apply(fontSizeFactor: fontScale),
        cardTheme: CardThemeData(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
      ),
      home: const HomeShell(),
    );
  }
}
