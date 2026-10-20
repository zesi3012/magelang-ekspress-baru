import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../main.dart';
import '../services/profile_service.dart';
import 'register_screen.dart';
import 'premium_screen.dart';
import 'login_screen.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final SupabaseClient _supabase = Supabase.instance.client;

  User? _user;
  Map<String, dynamic>? _profile;
  bool _isLoading = true;
  StreamSubscription<AuthState>? _authSubscription;

  @override
  void initState() {
    super.initState();

    _user = _supabase.auth.currentUser;
    _loadProfile();

    _authSubscription = _supabase.auth.onAuthStateChange.listen((data) {
      if (!mounted) return;

      setState(() {
        _user = data.session?.user ?? _supabase.auth.currentUser;
      });

      _loadProfile();
    });
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    if (_supabase.auth.currentUser == null) {
      if (!mounted) return;
      setState(() {
        _profile = null;
        _isLoading = false;
      });
      return;
    }

    if (mounted) {
      setState(() => _isLoading = true);
    }

    try {
      final profile = await ProfileService.fetchProfile();

      if (!mounted) return;

      setState(() {
        _profile = profile;
        _user = _supabase.auth.currentUser;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() => _isLoading = false);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal memuat profil: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  String get _displayName {
    final fullName = _profile?['full_name']?.toString().trim();
    if (fullName != null && fullName.isNotEmpty) return fullName;

    final username = _profile?['username']?.toString().trim();
    if (username != null && username.isNotEmpty) return username;

    final metadata = _user?.userMetadata;
    final metadataName = metadata?['full_name']?.toString().trim();
    if (metadataName != null && metadataName.isNotEmpty) {
      return metadataName;
    }

    final email = _user?.email;
    if (email != null && email.contains('@')) {
      return email.split('@').first;
    }

    return 'Pengunjung';
  }

  String get _email => _user?.email ?? '-';

  String get _phone {
    final profilePhone = _profile?['phone']?.toString().trim();
    if (profilePhone != null && profilePhone.isNotEmpty) {
      return profilePhone;
    }

    final authPhone = _user?.phone;
    if (authPhone != null && authPhone.isNotEmpty) {
      return authPhone;
    }

    return 'Belum ditambahkan';
  }

  Future<void> _openLogin() async {
  if (_user != null) return;

  final result = await Navigator.of(context).push<bool>(
    MaterialPageRoute<bool>(
      builder: (_) => const LoginScreen(),
    ),
  );

  if (!mounted) return;

  if (result == true) {
    await _loadProfile();

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Berhasil masuk ke akun.'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

  Future<void> _openRegister() async {
    if (_user != null) return;

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const RegisterScreen(),
      ),
    );

    if (!mounted) return;

    _user = _supabase.auth.currentUser;
    await _loadProfile();
  }

  Future<void> _editProfile() async {
    if (_user == null) return;

    final result = await showDialog<bool>(
      context: context,
      builder: (_) => _EditProfileDialog(
        fullName: _profile?['full_name']?.toString() ?? '',
        username: _profile?['username']?.toString() ?? '',
        phone: _profile?['phone']?.toString() ?? '',
      ),
    );

    if (!mounted || result != true) return;

    await _loadProfile();

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Profil berhasil diperbarui.'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Keluar dari akun?'),
        content: const Text(
          'Kamu perlu masuk kembali untuk mengakses akunmu.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    try {
      await _supabase.auth.signOut();

      if (!mounted) return;

      setState(() {
        _user = null;
        _profile = null;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Kamu berhasil keluar.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal keluar dari akun: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _openPremium() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const PremiumScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = MagelangEkspressApp.of(context);
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    final selectedFontScale =
        const [0.9, 1.0, 1.15].contains(app.fontScale)
            ? app.fontScale
            : 1.0;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Akun',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                _buildAccountCard(theme, colors),
                const SizedBox(height: 24),

                _sectionTitle('Preferensi membaca'),
                const SizedBox(height: 10),

                Card(
                  margin: EdgeInsets.zero,
                  child: Column(
                    children: [
                      ListTile(
                        leading: const Icon(Icons.text_fields_rounded),
                        title: const Text('Ukuran teks'),
                        subtitle: const Text(
                          'Sesuaikan kenyamanan membaca',
                        ),
                        trailing: DropdownButton<double>(
                          value: selectedFontScale,
                          underline: const SizedBox.shrink(),
                          items: const [
                            DropdownMenuItem(
                              value: 0.9,
                              child: Text('Kecil'),
                            ),
                            DropdownMenuItem(
                              value: 1.0,
                              child: Text('Sedang'),
                            ),
                            DropdownMenuItem(
                              value: 1.15,
                              child: Text('Besar'),
                            ),
                          ],
                          onChanged: (value) {
                            if (value != null) {
                              app.setFontScale(value);
                            }
                          },
                        ),
                      ),
                      const Divider(
                        height: 1,
                        indent: 16,
                        endIndent: 16,
                      ),
                      SwitchListTile(
                        secondary: Icon(
                          app.themeMode == ThemeMode.dark
                              ? Icons.dark_mode_rounded
                              : Icons.light_mode_rounded,
                        ),
                        title: const Text('Mode gelap'),
                        subtitle: const Text(
                          'Ubah tampilan terang atau gelap',
                        ),
                        value: app.themeMode == ThemeMode.dark,
                        onChanged: app.toggleTheme,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),
                _sectionTitle('Langganan'),
                const SizedBox(height: 10),

                Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: Icon(
                      Icons.workspace_premium_rounded,
                      color: colors.primary,
                      size: 30,
                    ),
                    title: const Text(
                      'Paket Premium',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: const Text(
                      'Lihat manfaat dan pilihan langganan',
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: _openPremium,
                  ),
                ),

                const SizedBox(height: 24),
                _sectionTitle('Informasi akun'),
                const SizedBox(height: 10),

                Card(
                  margin: EdgeInsets.zero,
                  child: Column(
                    children: [
                      ListTile(
                        leading: const Icon(Icons.email_outlined),
                        title: const Text('Email'),
                        subtitle: Text(
                          _user == null ? 'Belum masuk' : _email,
                        ),
                      ),
                      const Divider(
                        height: 1,
                        indent: 16,
                        endIndent: 16,
                      ),
                      ListTile(
                        leading: const Icon(Icons.phone_outlined),
                        title: const Text('Nomor telepon'),
                        subtitle: Text(_phone),
                      ),
                    ],
                  ),
                ),

                if (_user != null) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _editProfile,
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('Edit Profil'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _logout,
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('Keluar dari akun'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      foregroundColor: colors.error,
                    ),
                  ),
                ],

                const SizedBox(height: 24),
                Center(
                  child: Text(
                    'Magelang Ekspress',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildAccountCard(ThemeData theme, ColorScheme colors) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: colors.primary,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          CircleAvatar(
            radius: 34,
            backgroundColor: colors.onPrimary.withValues(alpha: 0.15),
            child: Icon(
              _user == null
                  ? Icons.person_outline_rounded
                  : Icons.person_rounded,
              size: 36,
              color: colors.onPrimary,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _user == null ? 'Selamat datang!' : _displayName,
            textAlign: TextAlign.center,
            style: theme.textTheme.titleLarge?.copyWith(
              color: colors.onPrimary,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            _user == null
                ? 'Masuk untuk menikmati pengalaman membaca yang lebih personal.'
                : _email,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: colors.onPrimary.withValues(alpha: 0.85),
            ),
          ),
          if (_user == null) ...[
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: _openLogin,
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.onPrimary,
                      foregroundColor: colors.primary,
                    ),
                    child: const Text('Masuk'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: _openRegister,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colors.onPrimary,
                      side: BorderSide(
                        color: colors.onPrimary.withValues(alpha: 0.7),
                      ),
                    ),
                    child: const Text('Daftar'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 2),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
      ),
    );
  }
}

class _EditProfileDialog extends StatefulWidget {
  final String fullName;
  final String username;
  final String phone;

  const _EditProfileDialog({
    required this.fullName,
    required this.username,
    required this.phone,
  });

  @override
  State<_EditProfileDialog> createState() => _EditProfileDialogState();
}

class _EditProfileDialogState extends State<_EditProfileDialog> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _nameController;
  late final TextEditingController _usernameController;
  late final TextEditingController _phoneController;

  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.fullName);
    _usernameController = TextEditingController(text: widget.username);
    _phoneController = TextEditingController(text: widget.phone);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _usernameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);

    try {
      await ProfileService.updateProfile(
        fullName: _nameController.text,
        username: _usernameController.text,
        phone: _phoneController.text,
      );

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal menyimpan profil: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Edit Profil'),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Nama lengkap',
                  prefixIcon: Icon(Icons.person_outline),
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Nama lengkap wajib diisi.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _usernameController,
                decoration: const InputDecoration(
                  labelText: 'Username',
                  prefixIcon: Icon(Icons.alternate_email),
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Username wajib diisi.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Nomor telepon',
                  hintText: 'Contoh: 08xxxxxxxxxx',
                  prefixIcon: Icon(Icons.phone_outlined),
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving ? null : () => Navigator.pop(context, false),
          child: const Text('Batal'),
        ),
        FilledButton(
          onPressed: _isSaving ? null : _save,
          child: _isSaving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Simpan'),
        ),
      ],
    );
  }
}

class _LoginDialog extends StatefulWidget {
  const _LoginDialog();

  @override
  State<_LoginDialog> createState() => _LoginDialogState();
}

class _LoginDialogState extends State<_LoginDialog> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _isLoading = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      await Supabase.instance.client.auth.signInWithPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on AuthException catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gagal masuk: $e'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Masuk ke akun'),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(
                  labelText: 'Email',
                  prefixIcon: Icon(Icons.email_outlined),
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  final email = value?.trim() ?? '';

                  if (email.isEmpty) return 'Email wajib diisi.';
                  if (!email.contains('@') || !email.contains('.')) {
                    return 'Masukkan alamat email yang valid.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                autofillHints: const [AutofillHints.password],
                decoration: InputDecoration(
                  labelText: 'Kata sandi',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    onPressed: () {
                      setState(() {
                        _obscurePassword = !_obscurePassword;
                      });
                    },
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Kata sandi wajib diisi.';
                  }
                  return null;
                },
                onFieldSubmitted: (_) => _login(),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context, false),
          child: const Text('Batal'),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _login,
          child: _isLoading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Masuk'),
        ),
      ],
    );
  }
}
