class EpaperIssue {
  const EpaperIssue({
    required this.id,
    required this.title,
    required this.dateLabel,
    required this.priceLabel,
    required this.editionLabel,
    this.coverUrl,
    this.pdfUrl,
    this.isPremium = true,
  });

  final String id;
  final String title;
  final String dateLabel;
  final String priceLabel;
  final String editionLabel;
  final String? coverUrl;
  final String? pdfUrl;
  final bool isPremium;
}
