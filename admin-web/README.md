# Magelang Ekspress — Admin Web (starter)

Frontend awal dashboard E-Paper menggunakan HTML, CSS, dan JavaScript. Saat ini terhubung ke endpoint yang sudah ada: `GET /api/publications`, yang hanya mengembalikan edisi `published`.

## Menjalankan

1. Jalankan PHP API dari folder `backend` seperti biasa.
2. Buka `js/config.js` dan sesuaikan `API_BASE_URL`.
   - Browser pada komputer yang sama: `http://127.0.0.1:8080/api`
   - Jika browser pada perangkat lain: ganti `127.0.0.1` dengan IPv4 komputer dan pastikan firewall mengizinkan port 8080.
3. Jalankan frontend melalui server lokal, jangan mengandalkan `file://`. Contoh dengan Python:
   `python -m http.server 5500`
4. Buka `http://127.0.0.1:5500`.

## Batasan saat ini

- Endpoint yang tersedia saat ini hanya GET publikasi terbit.
- Statistik total/terbit/premium dihitung dari daftar yang dikembalikan endpoint tersebut; bukan total semua edisi di database.
- Draft, login, role, upload PDF, tambah/edit/hapus, kategori, dan publikasi belum diaktifkan karena memerlukan endpoint PHP terautentikasi dan validasi server.
- Jangan masukkan kredensial database atau Supabase secret/service-role key ke file frontend.
