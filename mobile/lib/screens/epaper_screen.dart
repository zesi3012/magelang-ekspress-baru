import 'package:flutter/material.dart';

class EpaperScreen extends StatefulWidget {
  const EpaperScreen({super.key, required this.isSaved, required this.onToggleSaved});
  final bool isSaved;
  final VoidCallback onToggleSaved;

  @override
  State<EpaperScreen> createState() => _EpaperScreenState();
}

class _EpaperScreenState extends State<EpaperScreen> {
  int page = 1;
  bool textMode = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('E-paper'),
        actions: [
          IconButton(
            tooltip: widget.isSaved ? 'Hapus tersimpan' : 'Simpan',
            onPressed: widget.onToggleSaved,
            icon: Icon(widget.isSaved ? Icons.bookmark : Icons.bookmark_border),
          ),
          IconButton(
            tooltip: 'Bagikan',
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Fitur berbagi akan dihubungkan berikutnya.')),
            ),
            icon: const Icon(Icons.share_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Magelang Ekspress', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900)),
                      Text('Kamis, 15 Oktober 2026 · Edisi Utama', style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
                const Text('Rp5.000', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, icon: Icon(Icons.auto_stories), label: Text('Flip koran')),
                ButtonSegment(value: true, icon: Icon(Icons.article_outlined), label: Text('Mode teks')),
              ],
              selected: {textMode},
              onSelectionChanged: (s) => setState(() => textMode = s.first),
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: textMode ? _textArticle(theme) : _flipPage(theme),
          ),
          if (!textMode)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton.filledTonal(
                    onPressed: page > 1 ? () => setState(() => page--) : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  const SizedBox(width: 14),
                  Text('Halaman $page dari 12', style: theme.textTheme.labelLarge),
                  const SizedBox(width: 14),
                  IconButton.filledTonal(
                    onPressed: page < 12 ? () => setState(() => page++) : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _flipPage(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 18),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        child: Container(
          key: ValueKey(page),
          width: double.infinity,
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            border: Border.all(color: theme.dividerColor.withValues(alpha: .35)),
            boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 18, offset: Offset(0, 5))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('MAGELANG EKSPRESS  •  EDISI DIGITAL',
                  style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 1, fontWeight: FontWeight.w800)),
              const Divider(height: 24),
              Text(
                page == 1 ? 'Kabar Utama Hari Ini' : 'Sorotan Berita · Halaman $page',
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900, height: 1.15),
              ),
              const SizedBox(height: 14),
              Container(
                height: 130,
                width: double.infinity,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  gradient: const LinearGradient(colors: [Color(0xFF102A43), Color(0xFF5486A8)]),
                ),
                child: const Center(child: Icon(Icons.newspaper, color: Colors.white, size: 58)),
              ),
              const SizedBox(height: 16),
              Text('Daerah Perkuat Layanan Publik dan Ekonomi Lokal',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800, height: 1.35)),
              const SizedBox(height: 10),
              Text(
                'Kolaborasi dan akses informasi menjadi bagian penting dalam perkembangan daerah. Baca versi teks untuk menikmati artikel dengan ukuran huruf yang nyaman.',
                style: theme.textTheme.bodyMedium?.copyWith(height: 1.75),
              ),
              const Spacer(),
              Text('Contoh tampilan halaman $page · PDF asli akan dihubungkan dari Supabase Storage.',
                  style: theme.textTheme.labelSmall),
            ],
          ),
        ),
      ),
    );
  }

  Widget _textArticle(ThemeData theme) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(22, 18, 22, 28),
      children: [
        Text('DAERAH', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w800, letterSpacing: 1)),
        const SizedBox(height: 10),
        Text('Daerah Perkuat Layanan Publik dan Ekonomi Lokal',
            style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900, height: 1.2)),
        const SizedBox(height: 12),
        Text('Redaksi Magelang Ekspress · 15 Oktober 2026',
            style: theme.textTheme.bodySmall),
        const SizedBox(height: 22),
        Text(
          'Penguatan layanan publik dan ekonomi lokal memerlukan kerja sama yang konsisten antara pemerintah, pelaku usaha, dan masyarakat. Program yang dirancang dengan data yang baik dapat membantu menentukan prioritas dan mengukur hasil secara lebih terarah.\n\nSelain meningkatkan akses layanan, kolaborasi lintas sektor juga membuka ruang bagi usaha lokal untuk berkembang. Transparansi informasi dan evaluasi berkala menjadi unsur penting agar manfaat program dapat dirasakan secara luas.',
          style: theme.textTheme.bodyLarge?.copyWith(height: 1.9, letterSpacing: .1),
        ),
      ],
    );
  }
}
