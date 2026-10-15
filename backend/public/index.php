<?php
declare(strict_types=1);

use App\Config\Database;
use App\Repositories\ContentRepository;
use Dotenv\Dotenv;

header('Content-Type: application/json; charset=utf-8');

// Konfigurasi environment dari folder backend/.env
require_once dirname(__DIR__) . '/vendor/autoload.php';

Dotenv::createImmutable(dirname(__DIR__))->safeLoad();

// CORS untuk pengembangan. Sesuaikan jika diperlukan untuk web.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, apikey');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(int $status, array $data): never
{
    http_response_code($status);
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = rtrim($path ?: '/', '/') ?: '/';

try {
    if ($method !== 'GET') {
        header('Allow: GET, OPTIONS');
        respond(405, [
            'success' => false,
            'message' => 'Metode request tidak didukung.'
        ]);
    }

    // GET /api/health
    if ($path === '/api/health') {
        respond(200, [
            'success' => true,
            'message' => 'Magelang Ekspress API berjalan.',
            'environment' => $_ENV['APP_ENV'] ?? 'development'
        ]);
    }

    // Koneksi database hanya diperlukan untuk endpoint data.
    if ($path === '/api/articles' || $path === '/api/publications') {
        $pdo = Database::connect();
        $repository = new ContentRepository($pdo);

        if ($path === '/api/articles') {
            $data = $repository->publishedArticles();
        } else {
            $data = $repository->publishedPublications();
        }

        respond(200, [
            'success' => true,
            'data' => $data
        ]);
    }

    respond(404, [
        'success' => false,
        'message' => 'Endpoint tidak ditemukan.'
    ]);
} catch (Throwable $e) {
    error_log((string) $e);

    $debug = filter_var(
        $_ENV['APP_DEBUG'] ?? 'false',
        FILTER_VALIDATE_BOOLEAN
    );

    respond(500, [
        'success' => false,
        'message' => 'Terjadi kesalahan pada server.',
        'detail' => $debug ? $e->getMessage() : null
    ]);
}
