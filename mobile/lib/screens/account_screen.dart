import 'package:flutter/material.dart';
import '../main.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final app = MagelangEkspressApp.of(context);

    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Akun', style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: theme.colorScheme.primaryContainer,
                    child: Icon(Icons.person, size: 30, color: theme.colorScheme.onPrimaryContainer),
                  ),
                  const SizedBox(width: 14),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Pengunjung', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                        SizedBox(height: 4),
                        Text('Login untuk menyinkronkan akun'),
                      ],
                    ),
                  ),
                  OutlinedButton(
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => const _LoginDialog(),
                    ),
                    child: const Text('Login'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text('Preferensi membaca', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.text_fields),
                  title: const Text('Ukuran huruf'),
                  subtitle: const Text('Kecil · Sedang · Besar'),
                  trailing: DropdownButton<double>(
                    value: app.fontScale,
                    underline: const SizedBox.shrink(),
                    items: const [
                      DropdownMenuItem(value: .9, child: Text('Kecil')),
                      DropdownMenuItem(value: 1.0, child: Text('Sedang')),
                      DropdownMenuItem(value: 1.15, child: Text('Besar')),
                    ],
                    onChanged: (v) {
                      if (v != null) app.setFontScale(v);
                    },
                  ),
                ),
                const Divider(height: 1),
                SwitchListTile(
                  secondary: const Icon(Icons.dark_mode_outlined),
                  title: const Text('Tema gelap'),
                  value: app.themeMode == ThemeMode.dark,
                  onChanged: app.toggleTheme,
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Text('Informasi akun', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Card(
            child: const Column(
              children: [
                ListTile(leading: Icon(Icons.email_outlined), title: Text('Email'), subtitle: Text('Belum ditambahkan')),
                Divider(height: 1),
                ListTile(leading: Icon(Icons.phone_outlined), title: Text('Nomor HP'), subtitle: Text('Belum ditambahkan')),
                Divider(height: 1),
                ListTile(leading: Icon(Icons.workspace_premium_outlined), title: Text('Paket Premium'), subtitle: Text('Lihat paket dan metode pembayaran')),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text('Pembayaran QRIS dan transfer bank akan tersedia setelah integrasi penyedia pembayaran di backend.'),
        ],
      ),
    );
  }
}

class _LoginDialog extends StatefulWidget {
  const _LoginDialog();

  @override
  State<_LoginDialog> createState() => _LoginDialogState();
}

class _LoginDialogState extends State<_LoginDialog> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool obscure = true;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Login Magelang Ekspress'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
            const SizedBox(height: 10),
            TextField(
              controller: password,
              obscureText: obscure,
              decoration: InputDecoration(
                labelText: 'Kata sandi',
                suffixIcon: IconButton(
                  onPressed: () => setState(() => obscure = !obscure),
                  icon: Icon(obscure ? Icons.visibility : Icons.visibility_off),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text('Form tampilan awal. Autentikasi Supabase akan dihubungkan pada tahap berikutnya.'),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Tutup')),
        FilledButton(
          onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Login belum terhubung ke Supabase Auth.')),
          ),
          child: const Text('Masuk'),
        ),
      ],
    );
  }
}
