import 'package:flutter/material.dart';
import '../data/sample_data.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, required this.onOpenArticle, required this.onOpenIssue});
  final ValueChanged<Map<String, String>> onOpenArticle;
  final VoidCallback onOpenIssue;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  String query = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final results = sampleArticles.where((a) {
      final q = query.toLowerCase().trim();
      return q.isEmpty || a.values.any((v) => v.toLowerCase().contains(q));
    }).toList();

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Pencarian', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 6),
          Text('Temukan edisi dan artikel pilihan.', style: theme.textTheme.bodyMedium),
          const SizedBox(height: 18),
          TextField(
            onChanged: (v) => setState(() => query = v),
            decoration: InputDecoration(
              hintText: 'Cari berita atau edisi koran',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 18),
          Card(
            child: ListTile(
              leading: const Icon(Icons.menu_book),
              title: const Text('E-paper terbaru'),
              subtitle: const Text('Lihat edisi digital'),
              trailing: const Icon(Icons.chevron_right),
              onTap: widget.onOpenIssue,
            ),
          ),
          const SizedBox(height: 14),
          Text('${results.length} artikel', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          ...results.map((a) => Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.all(14),
                  title: Text(a['title']!, style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('${a['category']} · ${a['date']}'),
                  ),
                  onTap: () => widget.onOpenArticle(a),
                ),
              )),
        ],
      ),
    );
  }
}
