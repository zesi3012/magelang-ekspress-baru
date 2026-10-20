
import 'package:supabase_flutter/supabase_flutter.dart';

class ProfileService {
  static final SupabaseClient _supabase = Supabase.instance.client;

  static Future<Map<String, dynamic>?> fetchProfile() async {
    final user = _supabase.auth.currentUser;
    if (user == null) return null;

    return await _supabase
        .from('profiles')
        .select('id, full_name, username, phone, role, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
  }

  static Future<void> updateProfile({
    required String fullName,
    required String username,
    required String phone,
  }) async {
    final user = _supabase.auth.currentUser;
    if (user == null) {
      throw Exception('Silakan masuk terlebih dahulu.');
    }

    await _supabase.from('profiles').upsert({
      'id': user.id,
      'full_name': fullName.trim(),
      'username': username.trim(),
      'phone': phone.trim().isEmpty ? null : phone.trim(),
      'updated_at': DateTime.now().toUtc().toIso8601String(),
    });
  }
}
