import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class PremiumScreen extends StatefulWidget {
  const PremiumScreen({super.key});

  @override
  State<PremiumScreen> createState() => _PremiumScreenState();
}

class _PremiumScreenState extends State<PremiumScreen> {
  final SupabaseClient _supabase = Supabase.instance.client;

  late Future<List<Map<String, dynamic>>> _plansFuture;
  Map<String, dynamic>? _activeSubscription;
  bool _checkingSubscription = true;

  @override
  void initState() {
    super.initState();
    _plansFuture = _fetchPlans();
    _fetchActiveSubscription();
  }

  Future<List<Map<String, dynamic>>> _fetchPlans() async {
    final response = await _supabase
        .from('subscription_plans')
        .select('id, name, billing_period, duration_days, price_idr')
        .eq('is_active', true)
        .order('price_idr');

    return List<Map<String, dynamic>>.from(response);
  }

  Future<void> _fetchActiveSubscription() async {
    final user = _supabase.auth.currentUser;

    if (user == null) {
      if (mounted) {
        setState(() => _checkingSubscription = false);
      }
      return;
    }

    try {
      final response = await _supabase
          .from('subscriptions')
          .select('plan_id, status, starts_at, expires_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      Map<String, dynamic>? validSubscription;

      if (response != null) {
        final expiresAt = response['expires_at'];
        final isValid = expiresAt == null ||
            DateTime.parse(expiresAt.toString())
                .isAfter(DateTime.now().toUtc());

        if (isValid) {
          validSubscription = Map<String, dynamic>.from(response);
        }
      }

      if (mounted) {
        setState(() {
          _activeSubscription = validSubscription;
          _checkingSubscription = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _checkingSubscription = false);
      }
    }
  }

  String _formatRupiah(dynamic value) {
    final amount = int.tryParse(value?.toString() ?? '') ?? 0;
    final digits = amount.toString().replaceAllMapped(
          RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
          (match) => '${match[1]}.',
        );

    return 'Rp$digits';
  }

  String _formatDate(dynamic value) {
    if (value == null) return 'Belum ditentukan';

    try {
      final date = DateTime.parse(value.toString()).toLocal();

      return '${date.day.toString().padLeft(2, '0')}/'
          '${date.month.toString().padLeft(2, '0')}/'
          '${date.year}';
    } catch (_) {
      return 'Belum ditentukan';
    }
  }

  void _showPaymentNotice(String planName) {
    if (_supabase.auth.currentUser == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Silakan masuk terlebih dahulu untuk berlangganan.'),
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Paket $planName dipilih. '
          'Integrasi pembayaran belum tersedia.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Paket Premium'),
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _plansFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.cloud_off_rounded, size: 42),
                    const SizedBox(height: 12),
                    const Text(
                      'Paket langganan gagal dimuat.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${snapshot.error}',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () {
                        setState(() {
                          _plansFuture = _fetchPlans();
                        });
                      },
                      icon: const Icon(Icons.refresh),
                      label: const Text('Coba lagi'),
                    ),
                  ],
                ),
              ),
            );
          }

          final plans = snapshot.data ?? [];

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: colors.primary,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.workspace_premium_rounded,
                      size: 42,
                      color: colors.onPrimary,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Pilih paket Magelang Ekspress',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        color: colors.onPrimary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Nikmati akses e-paper Premium, '
                      'atau pilih paket dengan pelatihan jurnalistik.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: colors.onPrimary.withValues(alpha: 0.9),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Pilihan paket langganan',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
              if (plans.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(18),
                    child: Text(
                      'Belum ada paket langganan yang tersedia.',
                    ),
                  ),
                ),
              ...plans.map((plan) {
                final name = plan['name'] as String? ?? 'Paket Premium';
                final price = plan['price_idr'];
                final duration = plan['duration_days'] ?? 30;
                final includesTraining =
                    name == 'Premium + Pelatihan Jurnalistik';

                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: _PlanCard(
                    title: name,
                    price: _formatRupiah(price),
                    duration: duration.toString(),
                    subtitle: includesTraining
                        ? 'Untuk pembaca yang ingin belajar jurnalistik'
                        : 'Untuk pembaca Magelang Ekspress',
                    features: [
                      'Masa langganan $duration hari',
                      'Akses edisi e-paper Premium',
                      if (includesTraining) 'Pelatihan jurnalistik gratis',
                    ],
                    highlighted: includesTraining,
                    onChoose: () => _showPaymentNotice(name),
                  ),
                );
              }),
              const SizedBox(height: 8),
              Text(
                'Status langganan',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 10),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: _checkingSubscription
                      ? const Row(
                          children: [
                            SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            ),
                            SizedBox(width: 12),
                            Text('Memeriksa langganan...'),
                          ],
                        )
                      : _activeSubscription == null
                          ? const Row(
                              children: [
                                Icon(Icons.info_outline_rounded),
                                SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    'Belum ditemukan langganan Premium aktif.',
                                  ),
                                ),
                              ],
                            )
                          : Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Row(
                                  children: [
                                    Icon(
                                      Icons.verified_rounded,
                                      color: Colors.green,
                                    ),
                                    SizedBox(width: 8),
                                    Text(
                                      'Premium aktif',
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  'Berlaku sampai: '
                                  '${_formatDate(_activeSubscription!['expires_at'])}',
                                ),
                              ],
                            ),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Pembayaran QRIS dan transfer bank belum terhubung. '
                'Langganan baru hanya akan aktif setelah pembayaran '
                'diverifikasi oleh backend.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceVariant,
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  final String title;
  final String price;
  final String duration;
  final String subtitle;
  final List<String> features;
  final bool highlighted;
  final VoidCallback onChoose;

  const _PlanCard({
    required this.title,
    required this.price,
    required this.duration,
    required this.subtitle,
    required this.features,
    required this.onChoose,
    this.highlighted = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: highlighted ? colors.primary : colors.outlineVariant,
          width: highlighted ? 1.5 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (highlighted)
              const Padding(
                padding: EdgeInsets.only(bottom: 10),
                child: Chip(
                  avatar: Icon(Icons.school_rounded, size: 18),
                  label: Text('Termasuk pelatihan'),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            Text(
              title,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              subtitle,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Flexible(
                  child: Text(
                    price,
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: colors.primary,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '/ $duration hari',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            ...features.map(
              (feature) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.check_circle_outline_rounded,
                      size: 20,
                      color: colors.primary,
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Text(feature)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: onChoose,
                child: const Text('Pilih paket'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}