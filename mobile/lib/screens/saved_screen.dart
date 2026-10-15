import 'package:flutter/material.dart';
import '../data/sample_data.dart';

class SavedScreen extends StatelessWidget {
  const SavedScreen({
    super.key,
    required this.savedIds,
    required this.onOpenArticle,
    required this.onOpenIssue,
    required this.onToggleSaved,
  });

  final Set<String> savedIds;
  final ValueChanged<Map<String, String>> onOpenArticle;
  final VoidCallback onOpenIssue;
  final ValueChanged<String> onToggleSaved;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final savedArticles = sampleArticles.where((a) => savedIds.contains(a['id'])).toList();
    final issueSaved = savedIds.contains('issue-001');

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Tersimpan', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text('Artikel dan edisi yang ingin kamu baca lagi.', style: theme.textTheme.bodyMedium),
          const SizedBox(height: 18),
          if (!issueSaved && savedArticles.isEmpty)
            Container(
              padding: const EdgeInsets.all(26),
              decoration: BoxDecoration(color: theme.colorScheme.surface, borderRadius: BorderRadius.circular(20)),
              child: const Column(
                children: [
                  Icon(Icons.bookmark_border, size: 42),
                  SizedBox(height: 12),
                  Text('Belum ada yang disimpan', style: TextStyle(fontWeight: FontWeight.w800)),
                  SizedBox(height: 6),
                  Text('Tekan ikon bookmark pada artikel atau e-paper.'),
                ],
              ),
            ),
          if (issueSaved)
            Card(child: ListTile(
              leading: const Icon(Icons.newspaper),
              title: const Text('Magelang Ekspress — Edisi Utama'),
              subtitle: const Text('E-paper'),
              onTap: onOpenIssue,
              trailing: IconButton(
                icon: const Icon(Icons.bookmark_remove_outlined),
                onPressed: () => onToggleSaved('issue-001'),
              ),
            )),
          ...savedArticles.map((a) => Card(
            child: ListTile(
              title: Text(a['title']!, style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(a['category']!),
              onTap: () => onOpenArticle(a),
              trailing: IconButton(
                icon: const Icon(Icons.bookmark_remove_outlined),
                onPressed: () => onToggleSaved(a['id']!),
              ),
            ),
          )),
        ],
      ),
    );
  }
}
