<?php
declare(strict_types=1);

use App\Config\Database;
use App\Repositories\ContentRepository;
use Dotenv\Dotenv;

header('Content-Type: application/json; charset=utf-8');

// Load environment dari folder backend/.env
require_once dirname(__DIR__) . '/vendor/autoload.php';
Dotenv::createImmutable(dirname(__DIR__))->safeLoad();

// CORS untuk pengembangan.
// Untuk produksi, batasi origin sesuai domain aplikasi.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, apikey');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/**
 * Mengirim respons JSON dan menghentikan eksekusi.
 */
function respond(int $status, array $data): never
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

/**
 * Membuat signed URL untuk objek dalam bucket private Supabase Storage.
 * Key rahasia hanya digunakan oleh backend.
 */
function createSupabaseSignedUrl(
    string $objectPath,
    int $expiresIn = 300
): string {
    $base = rtrim($_ENV['SUPABASE_URL'] ?? '', '/');
    $key = $_ENV['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    $bucket = 'magelang-ekspress';

    if ($base === '' || $key === '') {
        throw new RuntimeException(
            'Konfigurasi Supabase Storage belum lengkap.'
        );
    }

    $objectPath = trim($objectPath);

    // pdf_url harus berupa path objek di bucket, bukan URL lengkap.
    if (
        $objectPath === ''
        || str_starts_with($objectPath, '/')
        || str_contains($objectPath, '\\')
        || str_contains($objectPath, '?')
        || str_contains($objectPath, '#')
        || str_contains($objectPath, '://')
    ) {
        throw new RuntimeException('Path PDF tidak valid.');
    }

    $segments = explode('/', $objectPath);

    foreach ($segments as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..') {
            throw new RuntimeException('Path PDF tidak valid.');
        }
    }

    $encodedPath = implode(
        '/',
        array_map('rawurlencode', $segments)
    );

    $endpoint = $base
        . '/storage/v1/object/sign/'
        . rawurlencode($bucket)
        . '/'
        . $encodedPath;

    $curl = curl_init($endpoint);

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $key,
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode([
            'expiresIn' => $expiresIn,
        ]),
    ]);

    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);

    curl_close($curl);

    if ($body === false || $error !== '') {
        error_log('Supabase Storage connection error: ' . $error);

        throw new RuntimeException(
            'Tidak dapat menghubungi layanan penyimpanan PDF.'
        );
    }

    $result = json_decode($body, true);

    if (
        $status < 200
        || $status >= 300
        || !is_array($result)
        || empty($result['signedURL'])
    ) {
        error_log(
            'Supabase Storage signed URL gagal. HTTP '
            . $status
            . '. Respons: '
            . substr((string) $body, 0, 1500)
        );

        throw new RuntimeException(
            'Gagal membuat tautan PDF sementara. HTTP '
            . $status
        );
    }

    $signedPath = $result['signedURL'];

    // Supabase biasanya mengembalikan path relatif.
    if (preg_match('#^https://#i', $signedPath)) {
        return $signedPath;
    }

    return $base . '/storage/v1/' . ltrim($signedPath, '/');
}


/**
 * Upload PDF ke bucket private Supabase Storage.
 */
function uploadSupabasePdf(string $objectPath, string $filePath): void
{
    $base = rtrim($_ENV['SUPABASE_URL'] ?? '', '/');
    $key = $_ENV['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    $bucket = 'magelang-ekspress';

    if ($base === '' || $key === '') {
        throw new RuntimeException('Konfigurasi Supabase Storage belum lengkap.');
    }

    if (!is_file($filePath) || !is_readable($filePath)) {
        throw new RuntimeException('File PDF tidak dapat dibaca.');
    }

    $segments = explode('/', $objectPath);

    foreach ($segments as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..') {
            throw new RuntimeException('Path upload tidak valid.');
        }
    }

    $encodedPath = implode('/', array_map('rawurlencode', $segments));

    $endpoint = $base
        . '/storage/v1/object/'
        . rawurlencode($bucket)
        . '/'
        . $encodedPath;

    $contents = file_get_contents($filePath);

    if ($contents === false) {
        throw new RuntimeException('Gagal membaca file PDF.');
    }

    $curl = curl_init($endpoint);

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $key,
            'Authorization: Bearer ' . $key,
            'Content-Type: application/pdf',
            'x-upsert: false',
        ],
        CURLOPT_POSTFIELDS => $contents,
    ]);

    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);

    curl_close($curl);
    unset($contents);

    if ($response === false || $error !== '') {
        error_log('Supabase upload error: ' . $error);
        throw new RuntimeException('Tidak dapat menghubungi Supabase Storage.');
    }

    if ($status < 200 || $status >= 300) {
        error_log('Supabase upload HTTP ' . $status . ': ' . substr((string) $response, 0, 1000));
        throw new RuntimeException('Upload Supabase gagal. HTTP ' . $status);
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = rtrim($path ?: '/', '/') ?: '/';

try {
    if (
        !in_array(
            $method,
            ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            true
        )
    ) {
        header('Allow: GET, POST, PUT, DELETE, OPTIONS');

        respond(405, [
            'success' => false,
            'message' => 'Metode request tidak didukung.',
        ]);
    }

    // POST /api/admin/publications/upload-pdf
    if ($method === 'POST' && $path === '/api/admin/publications/upload-pdf') {
        \App\Middleware\SupabaseAuth::requireRole(['admin']);

        if (!isset($_FILES['pdf']) || !is_array($_FILES['pdf'])) {
            respond(422, [
                'success' => false,
                'message' => 'Pilih file PDF terlebih dahulu.',
            ]);
        }

        $file = $_FILES['pdf'];
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);

        if ($error !== UPLOAD_ERR_OK) {
            respond(422, [
                'success' => false,
                'message' => $error === UPLOAD_ERR_INI_SIZE
                    || $error === UPLOAD_ERR_FORM_SIZE
                    ? 'Ukuran PDF melebihi batas upload PHP.'
                    : 'Upload PDF gagal. Pilih ulang file dan coba lagi.',
            ]);
        }

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        $size = (int) ($file['size'] ?? 0);
        $originalName = (string) ($file['name'] ?? '');

        if ($size < 1 || $size > 50 * 1024 * 1024) {
            respond(422, [
                'success' => false,
                'message' => 'Ukuran PDF maksimal 50 MB.',
            ]);
        }

        if (
            $tmpPath === ''
            || !is_uploaded_file($tmpPath)
            || strtolower(pathinfo($originalName, PATHINFO_EXTENSION)) !== 'pdf'
        ) {
            respond(422, [
                'success' => false,
                'message' => 'Pilih file PDF yang valid.',
            ]);
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($tmpPath);
        $signature = file_get_contents($tmpPath, false, null, 0, 5);

        if ($mime !== 'application/pdf' || $signature !== '%PDF-') {
            respond(422, [
                'success' => false,
                'message' => 'Isi file bukan PDF yang valid.',
            ]);
        }

        $objectPath = 'majalah/'
            . date('Y/m')
            . '/'
            . bin2hex(random_bytes(16))
            . '.pdf';

        try {
            uploadSupabasePdf($objectPath, $tmpPath);
        } catch (\Throwable $e) {
            error_log('Upload PDF gagal: ' . $e->getMessage());

            respond(502, [
                'success' => false,
                'message' => 'Upload ke Supabase gagal. Periksa konfigurasi Storage.',
            ]);
        }

        respond(201, [
            'success' => true,
            'message' => 'PDF berhasil diunggah.',
            'data' => [
                'pdf_url' => $objectPath,
                'original_name' => basename($originalName),
                'size' => $size,
            ],
        ]);
    }

    // GET /api/health
    if ($path === '/api/health') {
        respond(200, [
            'success' => true,
            'message' => 'Magelang Ekspress API berjalan.',
            'environment' => $_ENV['APP_ENV'] ?? 'development',
        ]);
    }

    // GET /api/admin/me
    if ($path === '/api/admin/me') {
        $user = \App\Middleware\SupabaseAuth::requireRole(['admin']);

        respond(200, [
            'success' => true,
            'data' => [
                'id' => $user['id'],
                'email' => $user['email'] ?? null,
                'profile' => $user['profile'],
            ],
        ]);
    }

    // GET /api/articles dan GET /api/publications

    // GET /api/articles dan GET /api/publications

    // GET /api/publications
    if ($method === 'GET' && $path === '/api/publications') {
        $pdo = \App\Config\Database::connect();

        $stmt = $pdo->query(
            'SELECT * FROM public.publications ORDER BY publication_date DESC'
        );

        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        respond(200, [
            'success' => true,
            'data' => $rows,
        ]);
    }
    
    // GET /api/publications/{id}/pdf
    if (
        $method === 'GET'
        && preg_match('#^/api/publications/([0-9]+)/pdf$#', $path, $matches)
    ) {
        $publicationId = (int) $matches[1];

        $pdo = Database::connect();

        $stmt = $pdo->prepare(
            'SELECT id, title, pdf_url
             FROM public.publications
             WHERE id = :id
             LIMIT 1'
        );

        $stmt->execute(['id' => $publicationId]);
        $publication = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$publication) {
            respond(404, [
                'success' => false,
                'message' => 'Edisi tidak ditemukan.',
            ]);
        }

        if (empty($publication['pdf_url'])) {
            respond(404, [
                'success' => false,
                'message' => 'File PDF belum tersedia.',
            ]);
        }

        try {
            $signedUrl = createSupabaseSignedUrl(
                (string) $publication['pdf_url'],
                300
            );
        } catch (\Throwable $e) {
            error_log('Gagal membuka PDF: ' . $e->getMessage());

            respond(502, [
                'success' => false,
                'message' => 'Gagal membuat tautan PDF. Periksa konfigurasi Storage dan lokasi file.',
            ]);
        }

        respond(200, [
            'success' => true,
            'data' => [
                'id' => $publication['id'],
                'title' => $publication['title'],
                'signed_url' => $signedUrl,
            ],
        ]);
    }

    // GET /api/articles
    if ($method === 'GET' && $path === '/api/articles') {
        $pdo = \App\Config\Database::connect();

        $stmt = $pdo->query(
            'SELECT * FROM public.articles ORDER BY created_at DESC'
        );

        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        respond(200, $rows);
    }

    
    // ===============================
    // CRUD E-PAPER ADMIN
    // GET, POST, PUT, DELETE
    // ===============================

    if (
        preg_match(
            '#^/api/admin/publications(?:/([0-9]+))?$#',
            $path,
            $matches
        )
    ) {
        // Semua operasi CRUD wajib menggunakan akun admin.
        $user = \App\Middleware\SupabaseAuth::requireRole(['admin']);
        $pdo = Database::connect();

        $id = isset($matches[1]) ? (int) $matches[1] : null;

        // GET /api/admin/publications
        // Mengambil seluruh data E-Paper untuk dashboard admin.
        if ($method === 'GET' && $id === null) {
            $stmt = $pdo->query(
                'SELECT
                    p.*,
                    c.name AS category_name
                 FROM public.publications p
                 LEFT JOIN public.categories c
                    ON c.id = p.category_id
                 ORDER BY p.created_at DESC'
            );

            respond(200, [
                'success' => true,
                'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            ]);
        }

        // GET /api/admin/publications/{id}
        // Mengambil satu data E-Paper.
        if ($method === 'GET' && $id !== null) {
            $stmt = $pdo->prepare(
                'SELECT *
                 FROM public.publications
                 WHERE id = :id'
            );

            $stmt->execute(['id' => $id]);
            $publication = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$publication) {
                respond(404, [
                    'success' => false,
                    'message' => 'E-Paper tidak ditemukan.',
                ]);
            }

            respond(200, [
                'success' => true,
                'data' => $publication,
            ]);
        }

        // POST /api/admin/publications
        // Menambahkan E-Paper baru.
        if ($method === 'POST' && $id === null) {
            $input = json_decode(
                file_get_contents('php://input'),
                true
            );

            if (!is_array($input)) {
                respond(400, [
                    'success' => false,
                    'message' => 'Body JSON tidak valid.',
                ]);
            }

            $title = trim((string) ($input['title'] ?? ''));
            $publisher = trim((string) ($input['publisher'] ?? ''));
            $categoryId = filter_var(
                $input['category_id'] ?? null,
                FILTER_VALIDATE_INT
            );
            $publicationDate = trim(
                (string) ($input['publication_date'] ?? '')
            );
            $status = $input['status'] ?? 'draft';

            if (
                $title === ''
                || $publisher === ''
                || $categoryId === false
                || $categoryId === null
                || $categoryId < 1
                || $publicationDate === ''
            ) {
                respond(422, [
                    'success' => false,
                    'message' => 'Judul, penerbit, kategori, dan tanggal terbit wajib diisi.',
                ]);
            }

            $date = \DateTimeImmutable::createFromFormat(
                '!Y-m-d',
                $publicationDate
            );

            if (
                !$date
                || $date->format('Y-m-d') !== $publicationDate
            ) {
                respond(422, [
                    'success' => false,
                    'message' => 'Format tanggal harus YYYY-MM-DD.',
                ]);
            }

            if (!in_array($status, ['draft', 'published'], true)) {
                respond(422, [
                    'success' => false,
                    'message' => 'Status harus draft atau published.',
                ]);
            }

            $stmt = $pdo->prepare(
                'INSERT INTO public.publications (
                    title,
                    publisher,
                    category_id,
                    publication_date,
                    is_premium,
                    status,
                    cover_url,
                    pdf_url,
                    created_by
                ) VALUES (
                    :title,
                    :publisher,
                    :category_id,
                    :publication_date,
                    :is_premium,
                    :status,
                    :cover_url,
                    :pdf_url,
                    :created_by
                )
                RETURNING *'
            );

            $stmt->execute([
                'title' => $title,
                'publisher' => $publisher,
                'category_id' => $categoryId,
                'publication_date' => $publicationDate,
                'is_premium' => filter_var(
                    $input['is_premium'] ?? false,
                    FILTER_VALIDATE_BOOLEAN
                ),
                'status' => $status,
                'cover_url' => trim(
                    (string) ($input['cover_url'] ?? '')
                ) ?: null,
                'pdf_url' => trim(
                    (string) ($input['pdf_url'] ?? '')
                ) ?: null,
                'created_by' => $user['id'] ?? null,
            ]);

            respond(201, [
                'success' => true,
                'message' => 'E-Paper berhasil ditambahkan.',
                'data' => $stmt->fetch(PDO::FETCH_ASSOC),
            ]);
        }

        // PUT /api/admin/publications/{id}
        // Memperbarui data E-Paper.
        if ($method === 'PUT' && $id !== null) {
            $input = json_decode(
                file_get_contents('php://input'),
                true
            );

            if (!is_array($input)) {
                respond(400, [
                    'success' => false,
                    'message' => 'Body JSON tidak valid.',
                ]);
            }

            $title = trim((string) ($input['title'] ?? ''));
            $publisher = trim((string) ($input['publisher'] ?? ''));
            $categoryId = filter_var(
                $input['category_id'] ?? null,
                FILTER_VALIDATE_INT
            );
            $publicationDate = trim(
                (string) ($input['publication_date'] ?? '')
            );
            $status = $input['status'] ?? 'draft';

            if (
                $title === ''
                || $publisher === ''
                || $categoryId === false
                || $categoryId === null
                || $categoryId < 1
                || $publicationDate === ''
            ) {
                respond(422, [
                    'success' => false,
                    'message' => 'Judul, penerbit, kategori, dan tanggal terbit wajib diisi.',
                ]);
            }

            $date = \DateTimeImmutable::createFromFormat(
                '!Y-m-d',
                $publicationDate
            );

            if (
                !$date
                || $date->format('Y-m-d') !== $publicationDate
            ) {
                respond(422, [
                    'success' => false,
                    'message' => 'Format tanggal harus YYYY-MM-DD.',
                ]);
            }

            if (!in_array($status, ['draft', 'published'], true)) {
                respond(422, [
                    'success' => false,
                    'message' => 'Status harus draft atau published.',
                ]);
            }

            $stmt = $pdo->prepare(
                'UPDATE public.publications
                 SET title = :title,
                     publisher = :publisher,
                     category_id = :category_id,
                     publication_date = :publication_date,
                     is_premium = :is_premium,
                     status = :status,
                     cover_url = :cover_url,
                     pdf_url = :pdf_url
                 WHERE id = :id
                 RETURNING *'
            );

            $stmt->execute([
                'id' => $id,
                'title' => $title,
                'publisher' => $publisher,
                'category_id' => $categoryId,
                'publication_date' => $publicationDate,
                'is_premium' => filter_var(
                    $input['is_premium'] ?? false,
                    FILTER_VALIDATE_BOOLEAN
                ),
                'status' => $status,
                'cover_url' => trim(
                    (string) ($input['cover_url'] ?? '')
                ) ?: null,
                'pdf_url' => trim(
                    (string) ($input['pdf_url'] ?? '')
                ) ?: null,
            ]);

            $updated = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$updated) {
                respond(404, [
                    'success' => false,
                    'message' => 'E-Paper tidak ditemukan.',
                ]);
            }

            respond(200, [
                'success' => true,
                'message' => 'E-Paper berhasil diperbarui.',
                'data' => $updated,
            ]);
        }

        // DELETE /api/admin/publications/{id}
        // Menghapus data E-Paper dari database.
        if ($method === 'DELETE' && $id !== null) {
            $stmt = $pdo->prepare(
                'DELETE FROM public.publications
                 WHERE id = :id
                 RETURNING id'
            );

            $stmt->execute(['id' => $id]);

            if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
                respond(404, [
                    'success' => false,
                    'message' => 'E-Paper tidak ditemukan.',
                ]);
            }

            respond(200, [
                'success' => true,
                'message' => 'Data E-Paper berhasil dihapus.',
            ]);
        }

        respond(405, [
            'success' => false,
            'message' => 'Metode tidak sesuai untuk endpoint E-Paper ini.',
        ]);
    }


    // ===============================
// KATEGORI
// Letakkan sebelum fallback 404
// ===============================

    // GET /api/categories
    if ($path === '/api/categories' && $method === 'GET') {
        $pdo = \App\Config\Database::connect();

        $stmt = $pdo->query(
            "SELECT id, name, slug, description, is_active, created_at
         FROM public.categories
         ORDER BY id ASC"
        );

        respond(200, [
            'success' => true,
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
        ]);
    }

    // POST /api/categories
    if ($path === '/api/categories' && $method === 'POST') {
        \App\Middleware\SupabaseAuth::requireRole(['admin']);

        $input = json_decode(file_get_contents('php://input'), true);

        if (!is_array($input)) {
            respond(400, [
                'success' => false,
                'message' => 'Body JSON tidak valid.',
            ]);
        }

        $name = trim((string) ($input['name'] ?? ''));
        $slug = strtolower(trim((string) ($input['slug'] ?? '')));
        $description = trim((string) ($input['description'] ?? ''));

        if ($name === '' || $slug === '') {
            respond(422, [
                'success' => false,
                'message' => 'Nama dan slug wajib diisi.',
            ]);
        }

        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            respond(422, [
                'success' => false,
                'message' => 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung di antara kata.',
            ]);
        }

        $pdo = \App\Config\Database::connect();

        try {
            $stmt = $pdo->prepare(
                "INSERT INTO public.categories
                (name, slug, description, is_active)
             VALUES
                (:name, :slug, :description, TRUE)
             RETURNING id, name, slug, description, is_active, created_at"
            );

            $stmt->execute([
                'name' => $name,
                'slug' => $slug,
                'description' => $description !== '' ? $description : null,
            ]);

            respond(201, [
                'success' => true,
                'message' => 'Kategori berhasil ditambahkan.',
                'data' => $stmt->fetch(PDO::FETCH_ASSOC),
            ]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23505') {
                respond(409, [
                    'success' => false,
                    'message' => 'Nama atau slug kategori sudah digunakan.',
                ]);
            }

            throw $e;
        }
    }

    // PUT /api/categories/{id}
    if (
        preg_match('#^/api/categories/([0-9]+)$#', $path, $matches)
        && $method === 'PUT'
    ) {
        \App\Middleware\SupabaseAuth::requireRole(['admin']);

        $input = json_decode(file_get_contents('php://input'), true);

        if (!is_array($input)) {
            respond(400, [
                'success' => false,
                'message' => 'Body JSON tidak valid.',
            ]);
        }

        $name = trim((string) ($input['name'] ?? ''));
        $slug = strtolower(trim((string) ($input['slug'] ?? '')));
        $description = trim((string) ($input['description'] ?? ''));

        if ($name === '' || $slug === '') {
            respond(422, [
                'success' => false,
                'message' => 'Nama dan slug wajib diisi.',
            ]);
        }

        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            respond(422, [
                'success' => false,
                'message' => 'Format slug tidak valid.',
            ]);
        }

        $pdo = \App\Config\Database::connect();

        try {
            $stmt = $pdo->prepare(
                "UPDATE public.categories
             SET name = :name,
                 slug = :slug,
                 description = :description
             WHERE id = :id
             RETURNING id, name, slug, description, is_active, created_at"
            );

            $stmt->execute([
                'id' => (int) $matches[1],
                'name' => $name,
                'slug' => $slug,
                'description' => $description !== '' ? $description : null,
            ]);

            $category = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$category) {
                respond(404, [
                    'success' => false,
                    'message' => 'Kategori tidak ditemukan.',
                ]);
            }

            respond(200, [
                'success' => true,
                'message' => 'Kategori berhasil diperbarui.',
                'data' => $category,
            ]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23505') {
                respond(409, [
                    'success' => false,
                    'message' => 'Nama atau slug kategori sudah digunakan.',
                ]);
            }

            throw $e;
        }
    }

    // DELETE /api/categories/{id}
    if (
        preg_match('#^/api/categories/([0-9]+)$#', $path, $matches)
        && $method === 'DELETE'
    ) {
        \App\Middleware\SupabaseAuth::requireRole(['admin']);

        $pdo = \App\Config\Database::connect();
        $pdo->beginTransaction();

        try {
            $id = (int) $matches[1];

            $check = $pdo->prepare(
                'SELECT id
             FROM public.categories
             WHERE id = :id
             FOR UPDATE'
            );
            $check->execute(['id' => $id]);

            if (!$check->fetchColumn()) {
                $pdo->rollBack();

                respond(404, [
                    'success' => false,
                    'message' => 'Kategori tidak ditemukan.',
                ]);
            }

            $usage = $pdo->prepare(
                "SELECT
                EXISTS (
                    SELECT 1
                    FROM public.articles
                    WHERE category_id = :article_id
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.publications
                    WHERE category_id = :publication_id
                )"
            );

            $usage->execute([
                'article_id' => $id,
                'publication_id' => $id,
            ]);

            $inUse = filter_var(
                $usage->fetchColumn(),
                FILTER_VALIDATE_BOOLEAN
            );

            if ($inUse) {
                $pdo->rollBack();

                respond(409, [
                    'success' => false,
                    'message' => 'Kategori masih digunakan oleh artikel atau publikasi. Nonaktifkan kategori jika tidak ingin menggunakannya lagi.',
                ]);
            }

            $delete = $pdo->prepare(
                'DELETE FROM public.categories WHERE id = :id'
            );
            $delete->execute(['id' => $id]);

            $pdo->commit();

            respond(200, [
                'success' => true,
                'message' => 'Kategori berhasil dihapus.',
            ]);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            throw $e;
        }
    }
} catch (\Throwable $e) {
    error_log((string) $e);

    $status = http_response_code();
    if ($status < 400) {
        $status = 500;
    }

    respond($status, [
        'success' => false,
        'message' => $status === 401
            ? 'Autentikasi diperlukan atau token tidak valid.'
            : ($status === 403
                ? 'Akses tidak diizinkan.'
                : 'Terjadi kesalahan pada server.'),
    ]);
}