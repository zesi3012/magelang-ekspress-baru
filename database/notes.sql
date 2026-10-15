-- Jalankan hanya setelah memeriksa skema tabel Anda yang sudah ada.
-- SQL berikut adalah catatan indeks opsional, bukan wajib.
create index if not exists idx_articles_status_published
    on public.articles (status, published_at desc);

create index if not exists idx_publications_status_date
    on public.publications (status, publication_date desc);

create index if not exists idx_articles_category
    on public.articles (category_id);

-- RLS sudah diaktifkan pada tabel baru di contoh sebelumnya.
-- Buat policy terpisah sesuai kebutuhan baca publik dan role pengelola.
-- Jangan memberi akses INSERT/UPDATE/DELETE kepada anon tanpa policy dan validasi.
