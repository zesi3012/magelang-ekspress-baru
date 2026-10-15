import 'package:flutter/material.dart';

class ArticleScreen extends StatelessWidget {
  const ArticleScreen({
    super.key,
    required this.article,
    required this.isSaved,
    required this.onToggleSaved,
  });

  final Map<String, String> article;
  final bool isSaved;
  final VoidCallback onToggleSaved;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Baca artikel'),
        actions: [
          IconButton(
            onPressed: onToggleSaved,
            icon: Icon(isSaved ? Icons.bookmark : Icons.bookmark_border),
          ),
          IconButton(
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Berbagi akan diaktifkan pada tahap integrasi.')),
            ),
            icon: const Icon(Icons.share_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 8, 22, 32),
        children: [
          Text(article['category']!.toUpperCase(),
              style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w800, letterSpacing: 1)),
          const SizedBox(height: 12),
          Text(article['title']!,
              style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900, height: 1.22)),
          const SizedBox(height: 14),
          Text('Redaksi Magelang Ekspress · ${article['date']}',
              style: theme.textTheme.bodySmall),
          const SizedBox(height: 22),
          Text(article['excerpt']!,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600, height: 1.7)),
          const SizedBox(height: 18),
          Text(article['body']!,
              style: theme.textTheme.bodyLarge?.copyWith(height: 1.9, letterSpacing: .1)),
        ],
      ),
    );
  }
}
