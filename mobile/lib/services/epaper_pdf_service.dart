
import 'dart:convert';

import 'package:http/http.dart' as http;

class EpaperPdfService {
  // URL backend PHP yang sedang kamu jalankan.
  static const String _apiBaseUrl =
    'http://10.185.140.80:8787/api';

  static Future<String> getPdfUrl(String publicationId) async {
    final uri = Uri.parse(
      '$_apiBaseUrl/publications/$publicationId/pdf',
    );

    final response = await http.get(uri).timeout(
      const Duration(seconds: 30),
    );

    if (response.statusCode != 200) {
      throw Exception(
        'Gagal mengambil PDF. HTTP ${response.statusCode}: '
        '${response.body}',
      );
    }

    final Map<String, dynamic> result =
        jsonDecode(response.body) as Map<String, dynamic>;

    if (result['success'] != true) {
      throw Exception(
        result['message'] ?? 'URL PDF tidak berhasil dibuat.',
      );
    }

    final data = result['data'] as Map<String, dynamic>?;
    final url = data?['signed_url']?.toString();

    if (url == null || url.isEmpty) {
      throw Exception('Backend tidak mengembalikan signed_url.');
    }

    return url;
  }
}
