
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:pdfrx/pdfrx.dart';

import '../services/epaper_pdf_service.dart';

class EpaperScreen extends StatefulWidget {
  const EpaperScreen({
    super.key,
    required this.isSaved,
    required this.onToggleSaved,
    this.publication,
  });

  final bool isSaved;
  final VoidCallback onToggleSaved;
  final Map<String, dynamic>? publication;

  @override
  State<EpaperScreen> createState() => _EpaperScreenState();
}

class _EpaperScreenState extends State<EpaperScreen> {
  late Future<String>? _pdfFuture;

  @override
  void initState() {
    super.initState();
    _loadPdf();
  }

  void _loadPdf() {
    final id = widget.publication?['id']?.toString();

    if (id == null || id.isEmpty) {
      _pdfFuture = null;
    } else {
      _pdfFuture = EpaperPdfService.getPdfUrl(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final publication = widget.publication ?? {};
    final title =
        publication['title']?.toString() ?? 'Magelang Ekspress';
    final date =
        publication['publication_date']?.toString() ?? 'Edisi digital';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Baca E-paper'),
        actions: [
          IconButton(
            tooltip: widget.isSaved ? 'Hapus tersimpan' : 'Simpan',
            onPressed: widget.onToggleSaved,
            icon: Icon(
              widget.isSaved
                  ? Icons.bookmark
                  : Icons.bookmark_border,
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                const Icon(
                  Icons.menu_book_rounded,
                  size: 32,
                  color: Color(0xFF102A43),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        date,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _pdfFuture == null
                ? _buildMessage(
                    icon: Icons.picture_as_pdf_outlined,
                    message: 'Edisi belum dipilih.',
                    detail:
                        'Buka e-paper melalui kartu edisi yang tersedia.',
                  )
                : FutureBuilder<String>(
                    future: _pdfFuture,
                    builder: (context, snapshot) {
                      if (snapshot.connectionState ==
                          ConnectionState.waiting) {
                        return const Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircularProgressIndicator(),
                              SizedBox(height: 16),
                              Text('Memuat PDF e-paper...'),
                            ],
                          ),
                        );
                      }

                      if (snapshot.hasError) {
                        return _buildMessage(
                          icon: Icons.error_outline,
                          message: 'PDF gagal dimuat.',
                          detail: snapshot.error
                              .toString()
                              .replaceFirst('Exception: ', ''),
                          onRetry: () {
                            setState(_loadPdf);
                          },
                        );
                      }

                      final url = snapshot.data;
                      if (url == null || url.isEmpty) {
                        return _buildMessage(
                          icon: Icons.picture_as_pdf_outlined,
                          message: 'File PDF tidak tersedia.',
                          detail:
                              'Pastikan PDF sudah diunggah untuk edisi ini.',
                        );
                      }

                      return PdfViewer.uri(
                        Uri.parse(url),
                        params: PdfViewerParams(
                          margin: 12,
                          backgroundColor:
                              theme.colorScheme.surfaceContainerHighest,
                          pageAnchor: PdfPageAnchor.left,
                          pageAnchorEnd: PdfPageAnchor.right,
                          layoutPages: (pages, params) {
                            final height = pages.fold<double>(
                                  0,
                                  (previous, page) =>
                                      math.max(previous, page.height),
                                ) +
                                params.margin * 2;

                            final layouts = <Rect>[];
                            double x = params.margin;

                            for (final page in pages) {
                              layouts.add(
                                Rect.fromLTWH(
                                  x,
                                  (height - page.height) / 2,
                                  page.width,
                                  page.height,
                                ),
                              );
                              x += page.width + params.margin;
                            }

                            return PdfPageLayout(
                              pageLayouts: layouts,
                              documentSize: Size(x, height),
                            );
                          },
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessage({
    required IconData icon,
    required String message,
    required String detail,
    VoidCallback? onRetry,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(detail, textAlign: TextAlign.center),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Coba lagi'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
