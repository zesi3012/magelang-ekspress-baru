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