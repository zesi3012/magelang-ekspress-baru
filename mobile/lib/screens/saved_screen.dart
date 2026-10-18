
import 'package:flutter/material.dart';

import '../data/sample_data.dart';
import '../services/epaper_service.dart';

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
  final ValueChanged<Map<String, dynamic>> onOpenIssue;
  final ValueChanged<String> onToggleSaved;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final savedArticles = sampleArticles
        .where((article) => savedIds.contains(article['id']))
        .toList();

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Tersimpan',
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'E-paper dan artikel yang ingin kamu baca lagi.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 18),

          // Daftar e-paper asli dari Supabase
          FutureBuilder<List<Map<String, dynamic>>>(
            future: EpaperService.fetchPublished(),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                    child: CircularProgressIndicator(),
                  ),
                );
              }

              if (snapshot.hasError) {
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.error_outline),
                    title: const Text('E-paper gagal dimuat'),
                    subtitle: Text('${snapshot.error}'),
                    trailing: IconButton(
                      tooltip: 'Coba lagi',
                      icon: const Icon(Icons.refresh),
                      onPressed: () {
                        Navigator.of(context).pushReplacement(
                          MaterialPageRoute<void>(
                            builder: (_) => Scaffold(
                              appBar: AppBar(
                                title: const Text('Tersimpan'),
                              ),
                              body: const Center(
                                child: Text(
                                  'Silakan kembali ke menu Tersimpan '
                                  'untuk memuat ulang.',
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                );
              }

              final publications = snapshot.data ?? [];

              final savedPublications = publications.where((publication) {
                final id = publication['id']?.toString();
                return id != null && savedIds.contains(id);
              }).toList();

              if (savedPublications.isEmpty) {
                return const SizedBox.shrink();
              }

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'E-paper',
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  ...savedPublications.map((publication) {
                    final id = publication['id'].toString();
                    final title =
                        publication['title']?.toString() ?? 'E-paper';
                    final date =
                        publication['publication_date']?.toString() ?? '';

                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      clipBehavior: Clip.antiAlias,
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        leading: Container(
                          width: 46,
                          height: 52,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primaryContainer,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            Icons.newspaper_outlined,
                            color: theme.colorScheme.onPrimaryContainer,
                          ),
                        ),
                        title: Text(
                          title,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        subtitle: Text(
                          date.isEmpty ? 'E-paper Magelang Ekspress' : date,
                        ),
                        onTap: () => onOpenIssue(publication),
                        trailing: IconButton(
                          tooltip: 'Hapus dari tersimpan',
                          icon: const Icon(Icons.bookmark_remove_outlined),
                          onPressed: () => onToggleSaved(id),
                        ),
                      ),
                    );
                  }),
                  const SizedBox(height: 16),
                ],
              );
            },
          ),

          // Artikel tersimpan
          if (savedArticles.isNotEmpty) ...[
            Text(
              'Artikel',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            ...savedArticles.map(
              (article) => Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: const Icon(Icons.article_outlined),
                  title: Text(
                    article['title'] ?? 'Artikel',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(article['category'] ?? 'Artikel'),
                  onTap: () => onOpenArticle(article),
                  trailing: IconButton(
                    tooltip: 'Hapus dari tersimpan',
                    icon: const Icon(Icons.bookmark_remove_outlined),
                    onPressed: () => onToggleSaved(article['id']!),
                  ),
                ),
              ),
            ),
          ],

          if (savedIds.isEmpty)
            Container(
              padding: const EdgeInsets.all(26),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainer,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Column(
                children: [
                  Icon(Icons.bookmark_border, size: 42),
                  SizedBox(height: 12),
                  Text(
                    'Belum ada yang disimpan',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Tekan ikon bookmark pada e-paper atau artikel '
                    'untuk menyimpannya.',
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
