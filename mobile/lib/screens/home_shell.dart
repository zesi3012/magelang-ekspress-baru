
import 'package:flutter/material.dart';

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

  void toggleSaved(String id) {
    setState(() {
      if (!savedIds.add(id)) {
        savedIds.remove(id);
      }
    });
  }

  void openIssue([Map<String, dynamic>? publication]) {
    if (publication == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pilih edisi e-paper dari daftar terlebih dahulu.'),
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
        onOpenIssue: () => openIssue(),
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
