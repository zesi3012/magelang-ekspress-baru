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
header('Access-Control-Allow-Methods: GET, OPTIONS');
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
    if ($method !== 'GET') {
        header('Allow: GET, OPTIONS');

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
    if ($path === '/api/articles' || $path === '/api/publications') {
        $pdo = Database::connect();
        $repository = new ContentRepository($pdo);

        $data = $path === '/api/articles'
            ? $repository->publishedArticles()
            : $repository->publishedPublications();

        respond(200, [
            'success' => true,
            'data' => $data,
        ]);
    }

    // GET /api/articles/{slug}
    if (preg_match(
        '#^/api/articles/([a-zA-Z0-9-]+)$#',
        $path,
        $matches
    )) {
        $pdo = Database::connect();
        $repository = new ContentRepository($pdo);

        $article = $repository->findPublishedArticleBySlug(
            $matches[1]
        );

        if ($article === null) {
            respond(404, [
                'success' => false,
                'message' => 'Artikel tidak ditemukan.',
            ]);
        }

        $isPremium = in_array(
            $article['is_premium'],
            [true, 1, '1', 't', 'true'],
            true
        );

        // Artikel premium memerlukan login dan langganan aktif.
        if ($isPremium) {
            $user = \App\Middleware\SupabaseAuth::requireUser();

            $stmt = $pdo->prepare(
                "SELECT EXISTS (
                    SELECT 1
                    FROM public.subscriptions
                    WHERE user_id = :user_id
                      AND status = 'active'
                      AND starts_at IS NOT NULL
                      AND starts_at <= NOW()
                      AND expires_at IS NOT NULL
                      AND expires_at > NOW()
                )"
            );

            $stmt->execute(['user_id' => $user['id']]);

            $hasSubscription = in_array(
                $stmt->fetchColumn(),
                [true, 1, '1', 't', 'true'],
                true
            );

            if (!$hasSubscription) {
                respond(403, [
                    'success' => false,
                    'message' =>
                        'Artikel ini memerlukan langganan premium aktif.',
                ]);
            }
        }

        respond(200, [
            'success' => true,
            'data' => $article,
        ]);
    }

    // GET /api/publications/{id}/pdf
    // Route ini berdiri sendiri, di luar route artikel.
    if (preg_match(
        '#^/api/publications/([0-9]+)/pdf$#',
        $path,
        $matches
    )) {
        $pdo = Database::connect();

        $stmt = $pdo->prepare(
            "SELECT id, title, pdf_url, is_premium
             FROM public.publications
             WHERE id = :id
               AND status = 'published'
             LIMIT 1"
        );

        $stmt->execute(['id' => $matches[1]]);
        $publication = $stmt->fetch();

        if (!$publication) {
            respond(404, [
                'success' => false,
                'message' => 'Publikasi tidak ditemukan.',
            ]);
        }

        $objectPath = trim(
            (string) ($publication['pdf_url'] ?? '')
        );

        if ($objectPath === '') {
            respond(404, [
                'success' => false,
                'message' => 'File PDF belum tersedia.',
            ]);
        }

        $isPremium = in_array(
            $publication['is_premium'],
            [true, 1, '1', 't', 'true'],
            true
        );

        // PDF premium memerlukan login dan langganan aktif.
        if ($isPremium) {
            $user = \App\Middleware\SupabaseAuth::requireUser();

            $stmt = $pdo->prepare(
                "SELECT EXISTS (
                    SELECT 1
                    FROM public.subscriptions
                    WHERE user_id = :user_id
                      AND status = 'active'
                      AND starts_at IS NOT NULL
                      AND starts_at <= NOW()
                      AND expires_at IS NOT NULL
                      AND expires_at > NOW()
                )"
            );

            $stmt->execute(['user_id' => $user['id']]);

            $hasSubscription = in_array(
                $stmt->fetchColumn(),
                [true, 1, '1', 't', 'true'],
                true
            );

            if (!$hasSubscription) {
                respond(403, [
                    'success' => false,
                    'message' =>
                        'PDF ini memerlukan langganan premium aktif.',
                ]);
            }
        }

        // URL hanya dibuat setelah pemeriksaan akses selesai.
        $signedUrl = createSupabaseSignedUrl($objectPath, 300);

        respond(200, [
            'success' => true,
            'data' => [
                'publication_id' => $publication['id'],
                'title' => $publication['title'],
                'signed_url' => $signedUrl,
                'expires_in' => 300,
            ],
        ]);
    }

    // Endpoint tidak dikenal
    respond(404, [
        'success' => false,
        'message' => 'Endpoint tidak ditemukan.',
    ]);
} catch (Throwable $e) {
    error_log((string) $e);

    $currentStatus = http_response_code();
    $status = in_array($currentStatus, [401, 403], true)
        ? $currentStatus
        : 500;

    $debug = filter_var(
        $_ENV['APP_DEBUG'] ?? 'false',
        FILTER_VALIDATE_BOOLEAN
    );

    respond($status, [
        'success' => false,
        'message' => $status === 401
            ? 'Autentikasi diperlukan atau token tidak valid.'
            : ($status === 403
                ? 'Akses ditolak atau langganan tidak memenuhi syarat.'
                : 'Terjadi kesalahan pada server.'),
        'detail' => $debug ? $e->getMessage() : null,
    ]);
}
