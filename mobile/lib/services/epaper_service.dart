
import 'package:supabase_flutter/supabase_flutter.dart';

class EpaperService {
  static final SupabaseClient _supabase = Supabase.instance.client;

  /// Mengambil daftar e-paper yang sudah diterbitkan.
  static Future<List<Map<String, dynamic>>> fetchPublished() async {
    try {
      final publicationResponse = await _supabase
          .from('publications')
          .select()
          .eq('status', 'published')
          .order('publication_date', ascending: false);

      final categoryResponse = await _supabase
          .from('categories')
          .select('id, name');

      final Map<String, String> categories = {};

      for (final item in categoryResponse) {
        categories[item['id'].toString()] =
            (item['name'] ?? 'Lainnya').toString();
      }

      final publications = <Map<String, dynamic>>[];

      for (final item in publicationResponse) {
        final publication = Map<String, dynamic>.from(item);
        final categoryId = publication['category_id']?.toString() ?? '';

        publication['category_name'] =
            categories[categoryId] ?? 'Kategori lainnya';

        publications.add(publication);
      }

      return publications;
    } catch (e) {
      throw Exception('Gagal memuat data e-paper: $e');
    }
  }
}
