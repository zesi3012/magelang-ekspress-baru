
import 'package:flutter/material.dart';
import '../services/epaper_service.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({
    super.key,
    required this.onOpenIssue,
  });

  final ValueChanged<Map<String, dynamic>> onOpenIssue;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SafeArea(
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.newspaper,
                      color: Colors.white,
                      size: 27,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'MAGELANG EKSPRESS',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w900,
                            letterSpacing: .4,
                          ),
                        ),
                        Text(
                          'Berita dalam genggaman',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Notifikasi',
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Notifikasi akan dihubungkan ke backend.',
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.notifications_none),
                  ),
                ],
              ),
            ),
          ),

          // Banner e-paper
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            sliver: SliverToBoxAdapter(
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(22),
                  gradient: const LinearGradient(
                    colors: [
                      Color(0xFF102A43),
                      Color(0xFF245B82),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'E-PAPER HARI INI',
                      style: TextStyle(
                        color: Color(0xFFBBD7EC),
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.1,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Baca lebih dekat.\nPahami lebih dalam.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        height: 1.2,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Edisi digital pilihan, praktis dibaca kapan saja.',
                      style: TextStyle(
                        color: Colors.white70,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 16),
                    FilledButton.tonal(
                      onPressed: () => _openLatest(context),
                      child: const Text('Buka e-paper'),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Daftar edisi
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'E-paper terbaru',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => _openLatest(context),
                    child: const Text('Lihat semua'),
                  ),
                ],
              ),
            ),
          ),

          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            sliver: SliverToBoxAdapter(
              child: FutureBuilder<List<Map<String, dynamic>>>(
                future: EpaperService.fetchPublished(),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Padding(
                      padding: EdgeInsets.all(30),
                      child: Center(
                        child: CircularProgressIndicator(),
                      ),
                    );
                  }

                  if (snapshot.hasError) {
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          children: [
                            const Icon(Icons.cloud_off, size: 36),
                            const SizedBox(height: 8),
                            const Text('E-paper belum dapat dimuat.'),
                            const SizedBox(height: 6),
                            Text(
                              snapshot.error.toString(),
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodySmall,
                            ),
                            TextButton.icon(
                              onPressed: () {
                                Navigator.of(context).pushReplacement(
                                  MaterialPageRoute<void>(
                                    builder: (_) => const HomeScreen(
                                      onOpenIssue: _unusedOpenIssue,
                                    ),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.refresh),
                              label: const Text('Coba lagi'),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  final publications = snapshot.data ?? [];

                  if (publications.isEmpty) {
                    return const Card(
                      child: Padding(
                        padding: EdgeInsets.all(22),
                        child: Center(
                          child: Text(
                            'Belum ada e-paper yang diterbitkan.',
                          ),
                        ),
                      ),
                    );
                  }

                  final grouped =
                      <String, List<Map<String, dynamic>>>{};

                  for (final publication in publications) {
                    final category =
                        publication['category_name']?.toString() ??
                            'Kategori lainnya';

                    grouped.putIfAbsent(category, () => []).add(publication);
                  }

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final entry in grouped.entries) ...[
                        Padding(
                          padding: const EdgeInsets.only(
                            top: 12,
                            bottom: 12,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  entry.key,
                                  style:
                                      theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              Text(
                                '${entry.value.length} edisi',
                                style: theme.textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        for (final publication in entry.value) ...[
                          _PublishedEpaperCard(
                            publication: publication,
                            onTap: () => onOpenIssue(publication),
                          ),
                          const SizedBox(height: 12),
                        ],
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openLatest(BuildContext context) async {
    try {
      final publications = await EpaperService.fetchPublished();

      if (!context.mounted) return;

      if (publications.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Belum ada e-paper yang diterbitkan.'),
          ),
        );
        return;
      }

      onOpenIssue(publications.first);
    } catch (error) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Gagal memuat e-paper: $error')),
      );
    }
  }
}

void _unusedOpenIssue(Map<String, dynamic> publication) {}

class _PublishedEpaperCard extends StatelessWidget {
  const _PublishedEpaperCard({
    required this.publication,
    required this.onTap,
  });

  final Map<String, dynamic> publication;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = publication['title']?.toString() ?? 'Tanpa judul';
    final coverUrl = publication['cover_url']?.toString() ?? '';
    final date = publication['publication_date']?.toString() ?? '';
    final premium = publication['is_premium'] == true;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: 100,
                  height: 132,
                  child: coverUrl.startsWith('https://') ||
                          coverUrl.startsWith('http://')
                      ? Image.network(
                          coverUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _coverPlaceholder(),
                        )
                      : _coverPlaceholder(),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: SizedBox(
                  height: 132,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        publication['category_name']?.toString() ??
                            'Kategori lainnya',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            height: 1.3,
                          ),
                        ),
                      ),
                      Text(
                        date.isEmpty ? 'Tanggal belum tersedia' : date,
                        style: theme.textTheme.bodySmall,
                      ),
                      const SizedBox(height: 7),
                      Row(
                        children: [
                          Icon(
                            premium
                                ? Icons.lock_outline
                                : Icons.menu_book_outlined,
                            size: 15,
                            color: theme.colorScheme.primary,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            premium ? 'Premium' : 'Gratis',
                            style: theme.textTheme.labelMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const Spacer(),
                          const Icon(Icons.chevron_right, size: 20),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _coverPlaceholder() {
    return Container(
      color: const Color(0xFF102A43),
      alignment: Alignment.center,
      child: const Padding(
        padding: EdgeInsets.all(8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.newspaper, color: Colors.white, size: 34),
            SizedBox(height: 8),
            Text(
              'MAGELANG\nEKSPRESS',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
