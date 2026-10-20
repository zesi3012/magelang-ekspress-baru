
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'home_screen.dart';
import 'search_screen.dart';
import 'saved_screen.dart';
import 'account_screen.dart';
import 'epaper_screen.dart';
import 'article_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int index = 0;

  final Set<String> savedIds = <String>{};

  static const String _savedIdsKey =
      'magelang_ekspress_saved_ids';

  bool _savedIdsLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadSavedIds();
  }

  Future<void> _loadSavedIds() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final storedIds =
          prefs.getStringList(_savedIdsKey) ?? <String>[];

      if (!mounted) return;

      setState(() {
        savedIds
          ..clear()
          ..addAll(storedIds);
        _savedIdsLoaded = true;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _savedIdsLoaded = true;
      });

      debugPrint('Gagal memuat bookmark: $e');
    }
  }

  Future<void> _persistSavedIds() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(
        _savedIdsKey,
        savedIds.toList(),
      );
    } catch (e) {
      debugPrint('Gagal menyimpan bookmark: $e');
    }
  }

  void toggleSaved(String id) {
    if (!_savedIdsLoaded) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Tunggu sebentar, bookmark sedang dimuat.',
          ),
        ),
      );
      return;
    }

    if (id.isEmpty) return;

    setState(() {
      if (!savedIds.add(id)) {
        savedIds.remove(id);
      }
    });

    _persistSavedIds();
  }

  void openIssue([Map<String, dynamic>? publication]) {
    if (publication == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Pilih edisi e-paper dari daftar terlebih dahulu.',
          ),
        ),
      );
      return;
    }

    final publicationId = publication['id']?.toString() ?? '';

    if (publicationId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('ID edisi e-paper tidak ditemukan.'),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => EpaperScreen(
          publication: publication,
          isSaved: savedIds.contains(publicationId),
          onToggleSaved: () => toggleSaved(publicationId),
        ),
      ),
    );
  }

  void openArticle(Map<String, String> article) {
    final articleId = article['id'] ?? '';

    if (articleId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('ID artikel tidak ditemukan.'),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ArticleScreen(
          article: article,
          isSaved: savedIds.contains(articleId),
          onToggleSaved: () => toggleSaved(articleId),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomeScreen(
        onOpenIssue: (publication) => openIssue(publication),
      ),
      SearchScreen(
        onOpenArticle: openArticle,
        onOpenIssue: (publication) => openIssue(publication),
      ),
      SavedScreen(
        savedIds: savedIds,
        onOpenArticle: openArticle,
        onOpenIssue: (publication) => openIssue(publication),
        onToggleSaved: toggleSaved,
      ),
      const AccountScreen(),
    ];

    return Scaffold(
      body: IndexedStack(
        index: index,
        children: pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) {
          setState(() => index = value);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Beranda',
          ),
          NavigationDestination(
            icon: Icon(Icons.search),
            selectedIcon: Icon(Icons.search),
            label: 'Pencarian',
          ),
          NavigationDestination(
            icon: Icon(Icons.bookmark_border),
            selectedIcon: Icon(Icons.bookmark),
            label: 'Tersimpan',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Akun',
          ),
        ],
      ),
    );
  }
}
