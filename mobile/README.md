# Magelang Ekspress — Starter Project

Starter awal frontend Flutter dan backend PHP untuk aplikasi e-paper.

## Struktur
- `mobile/`: Flutter UI starter (4 navigasi utama, Inter, tema terang/gelap, pencarian, tersimpan, akun, contoh e-paper dan mode teks).
- `backend/`: PHP REST API starter dengan validasi bearer token Supabase melalui Auth API, PDO PostgreSQL, dan endpoint health/profile/articles/publications.
- `database/`: SQL contoh untuk kebijakan dan kolom lanjutan. Sesuaikan dengan tabel yang sudah ada.

## Penting
1. Jangan memasukkan password database atau Supabase `service_role` key ke Flutter atau Git.
2. Backend memerlukan PHP 8.2+ dengan ekstensi `pdo_pgsql`, `curl`, dan Composer.
3. Isi konfigurasi backend dari `.env.example` menjadi `.env`.
4. UI saat ini memakai data contoh agar dapat dijalankan sebelum API terhubung.
5. Pembayaran QRIS/transfer memerlukan integrasi penyedia pembayaran berizin dan verifikasi webhook di backend; jangan menandai pembayaran sukses dari Flutter.
6. Buat aturan RLS yang sesuai dan uji role sebelum production.

## Menjalankan Flutter
```powershell
cd mobile
flutter pub get
flutter run
```

## Menjalankan backend lokal
```powershell
cd backend
copy .env.example .env
composer install
php -S 127.0.0.1:8080 -t public
```
Di emulator Android, alamat backend host biasanya `http://10.0.2.2:8080`; pada HP fisik gunakan IP LAN komputer. HTTP lokal hanya untuk development. Produksi wajib HTTPS.

## Catatan tabel
Starter ini mengasumsikan tabel `profiles`, `categories`, `articles`, dan `publications` sudah dibuat. Nama kolom yang dipakai endpoint ditunjukkan di `backend/src/Repositories/ContentRepository.php`; sesuaikan jika struktur tabel Anda berbeda.
