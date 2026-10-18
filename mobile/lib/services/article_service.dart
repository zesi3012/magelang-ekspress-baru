
import 'dart:convert';
import 'package:http/http.dart' as http;

class ArticleService {
  // Alamat backend PHP di komputer yang sama.
  static const String baseUrl = 'http://127.0.0.1:8787/api';

  static Future<List<Map<String, String>>> fetchArticles() async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/articles'))
          .timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) {
        throw Exception(
          'Gagal memuat artikel (${response.statusCode}): ${response.body}',
        );
      }

      final result =
          jsonDecode(response.body) as Map<String, dynamic>;

      if (result['success'] != true) {
        throw Exception(
          result['message']?.toString() ?? 'Gagal memuat artikel',
        );
      }

      final items = result['data'] as List<dynamic>;

      return items.map<Map<String, String>>((item) {
        final a = Map<String, dynamic>.from(item as Map);

        final publishedAt = a['published_at']?.toString() ?? '';
        final date = publishedAt.length >= 10
            ? publishedAt.substring(0, 10)
            : publishedAt;

        final content =
            (a['content'] ?? a['body'] ?? a['excerpt'] ?? '')
                .toString();

        return <String, String>{
          'id': (a['id'] ?? '').toString(),
          'title': (a['title'] ?? 'Tanpa judul').toString(),
          'slug': (a['slug'] ?? '').toString(),
          'category':
              (a['category'] ?? a['category_name'] ?? 'Berita')
                  .toString(),
          'date': date,
          'published_at': publishedAt,
          'excerpt': (a['excerpt'] ?? '').toString(),
          'body': content,
          'content': content,
          'cover_url': (a['cover_url'] ?? '').toString(),
        };
      }).toList();
    } catch (e) {
      throw Exception('Gagal mengambil artikel: $e');
    }
  }
}
