
import 'dart:convert';
import 'package:http/http.dart' as http;

class ArticleService {
  // Ganti dengan IP komputer yang sudah kamu gunakan.
  static const String baseUrl = 'http://192.168.0.105:8080/api';

  static Future<List<Map<String, String>>> fetchArticles() async {
    final response = await http
        .get(Uri.parse('$baseUrl/articles'))
        .timeout(const Duration(seconds: 15));

    if (response.statusCode != 200) {
      throw Exception('Gagal memuat artikel (${response.statusCode})');
    }

    final result = jsonDecode(response.body) as Map<String, dynamic>;

    if (result['success'] != true) {
      throw Exception(result['message'] ?? 'Gagal memuat artikel');
    }

    final items = result['data'] as List<dynamic>;

    return items.map((item) {
      final a = Map<String, dynamic>.from(item as Map);
      final publishedAt = a['published_at']?.toString() ?? '';

      final date = publishedAt.isEmpty
          ? ''
          : publishedAt.length >= 10
              ? publishedAt.substring(0, 10)
              : publishedAt;

      final content = (a['content'] ?? a['body'] ?? a['excerpt'] ?? '')
          .toString();

      return <String, String>{
        'id': (a['id'] ?? '').toString(),
        'title': (a['title'] ?? 'Tanpa judul').toString(),
        'slug': (a['slug'] ?? '').toString(),
        'category': (a['category'] ?? a['category_name'] ?? 'Berita')
            .toString(),
        'date': date,
        'published_at': publishedAt,
        'excerpt': (a['excerpt'] ?? '').toString(),
        'body': content,
        'content': content,
        'cover_url': (a['cover_url'] ?? '').toString(),
      };
    }).toList();
  }
}
