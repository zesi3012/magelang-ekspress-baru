
import 'package:flutter/material.dart';

import '../services/article_service.dart';
import '../services/epaper_service.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({
    super.key,
    required this.onOpenArticle,
    required this.onOpenIssue,
  });

  final ValueChanged<Map<String, String>> onOpenArticle;
  final ValueChanged<Map<String, dynamic>> onOpenIssue;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _searchController = TextEditingController();

  String query = '';

  late Future<List<Map<String, String>>> _articlesFuture;
  late Future<List<Map<String, dynamic>>> _epapersFuture;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  void _loadData() {
    _articlesFuture = ArticleService.fetchArticles();
    _epapersFuture = EpaperService.fetchPublished();
  }

  void _refreshData() {
    setState(_loadData);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _normalise(String value) => value.toLowerCase().trim();

  bool _matchesArticle(Map<String, String> article) {
    if (query.trim().isEmpty) return true;

    final keyword = _normalise(query);

    return article.values.any(
      (value) => _normalise(value).contains(keyword),
    );
  }

  bool _matchesEpaper(Map<String, dynamic> publication) {
    if (query.trim().isEmpty) return true;

    final keyword = _normalise(query);

    final searchableValues = [
      publication['title'],
      publication['category_name'],
      publication['publication_date'],
      publication['description'],
      publication['publisher'],
    ];

    return searchableValues.any(
      (value) => _normalise(value?.toString() ?? '').contains(keyword),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: () async {
          _refreshData();
          try {
            await Future.wait([
              _articlesFuture,
              _epapersFuture,
            ]);
          } catch (_) {
            // Error ditampilkan pada bagian data masing-masing.
          }
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          children: [
            Text(
              'Pencarian',
              style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Temukan berita dan edisi Magelang Ekspress.',
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 20),

            TextField(
              controller: _searchController,
              onChanged: (value) {
                setState(() => query = value);
              },
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Cari judul, berita, kategori, atau edisi',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: query.isNotEmpty
                    ? IconButton(
                        tooltip: 'Hapus pencarian',
                        onPressed: () {
                          _searchController.clear();
                          setState(() => query = '');
                        },
                        icon: const Icon(Icons.close),
                      )
                    : null,
                filled: true,
                fillColor: theme.colorScheme.surfaceContainerHighest
                    .withValues(alpha: 0.45),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide.none,
                ),
              ),
            ),

            const SizedBox(height: 26),

            _sectionHeading(
              context,
              title: 'E-paper',
              icon: Icons.menu_book_outlined,
            ),
            const SizedBox(height: 12),

            FutureBuilder<List<Map<String, dynamic>>>(
              future: _epapersFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const _LoadingCard();
                }

                if (snapshot.hasError) {
                  return _ErrorCard(
                    message: 'E-paper tidak dapat dimuat.',
                    onRetry: _refreshData,
                  );
                }

                final publications = (snapshot.data ?? [])
                    .where(_matchesEpaper)
                    .toList();

                if (publications.isEmpty) {
                  return _EmptyCard(
                    message: query.isEmpty
                        ? 'Belum ada e-paper yang diterbitkan.'
                        : 'Tidak ada edisi yang cocok dengan "$query".',
                  );
                }

                return Column(
                  children: [
                    for (final publication in publications)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _EpaperResultTile(
                          publication: publication,
                          onTap: () => widget.onOpenIssue(publication),
                        ),
                      ),
                  ],
                );
              },
            ),

            const SizedBox(height: 24),

            _sectionHeading(
              context,
              title: 'Artikel berita',
              icon: Icons.article_outlined,
            ),
            const SizedBox(height: 12),

            FutureBuilder<List<Map<String, String>>>(
              future: _articlesFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const _LoadingCard();
                }

                if (snapshot.hasError) {
                  return _ErrorCard(
                    message: 'Artikel tidak dapat dimuat dari server.',
                    onRetry: _refreshData,
                  );
                }

                final articles = (snapshot.data ?? [])
                    .where(_matchesArticle)
                    .toList();

                if (articles.isEmpty) {
                  return _EmptyCard(
                    message: query.isEmpty
                        ? 'Belum ada artikel yang tersedia.'
                        : 'Tidak ada artikel yang cocok dengan "$query".',
                  );
                }

                return Column(
                  children: [
                    for (final article in articles)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ArticleResultTile(
                          article: article,
                          onTap: () => widget.onOpenArticle(article),
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionHeading(
    BuildContext context, {
    required String title,
    required IconData icon,
  }) {
    final theme = Theme.of(context);

    return Row(
      children: [
        Icon(icon, color: theme.colorScheme.primary),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            title,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _EpaperResultTile extends StatelessWidget {
  const _EpaperResultTile({
    required this.publication,
    required this.onTap,
  });

  final Map<String, dynamic> publication;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = publication['title']?.toString() ?? 'Tanpa judul';
    final category =
        publication['category_name']?.toString() ?? 'E-paper';
    final date = publication['publication_date']?.toString() ?? '';
    final coverUrl = publication['cover_url']?.toString() ?? '';
    final isPremium = publication['is_premium'] == true;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: 68,
                  height: 88,
                  child: coverUrl.startsWith('http')
                      ? Image.network(
                          coverUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              _coverPlaceholder(context),
                        )
                      : _coverPlaceholder(context),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      category,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      date.isEmpty ? 'Tanggal belum tersedia' : date,
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 5),
                    Text(
                      isPremium ? 'Premium' : 'Gratis',
                      style: theme.textTheme.labelSmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }

  Widget _coverPlaceholder(BuildContext context) {
    return Container(
      color: Theme.of(context).colorScheme.primary,
      alignment: Alignment.center,
      child: const Icon(
        Icons.newspaper,
        color: Colors.white,
        size: 32,
      ),
    );
  }
}

class _ArticleResultTile extends StatelessWidget {
  const _ArticleResultTile({
    required this.article,
    required this.onTap,
  });

  final Map<String, String> article;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 10,
        ),
        leading: Container(
          width: 44,
          height: 48,
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(
            Icons.article_outlined,
            color: theme.colorScheme.onPrimaryContainer,
          ),
        ),
        title: Text(
          article['title'] ?? 'Tanpa judul',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(
            [
              article['category'] ?? 'Berita',
              article['date'] ?? '',
            ].where((value) => value.isNotEmpty).join(' · '),
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _LoadingCard extends StatelessWidget {
  const _LoadingCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(22),
        child: Center(
          child: CircularProgressIndicator(),
        ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            const Icon(Icons.search_off),
            const SizedBox(width: 12),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.cloud_off_outlined),
            const SizedBox(width: 12),
            Expanded(child: Text(message)),
            IconButton(
              tooltip: 'Muat ulang',
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
      ),
    );
  }
}
