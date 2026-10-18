<?php
declare(strict_types=1);

use App\Config\Database;
use App\Repositories\ContentRepository;
use Dotenv\Dotenv;

header('Content-Type: application/json; charset=utf-8');

require_once dirname(__DIR__) . '/vendor/autoload.php';
Dotenv::createImmutable(dirname(__DIR__))->safeLoad();

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, apikey');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ============================================================
 * HELPER FUNCTIONS
 * ============================================================ */

function respond(int $status, array $data): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function createSupabaseSignedUrl(string $objectPath, int $expiresIn = 300): string
{
    $base   = rtrim($_ENV['SUPABASE_URL'] ?? '', '/');
    $key    = $_ENV['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
    $bucket = 'magelang-ekspress';

    if ($base === '' || $key === '') {
        throw new RuntimeException('Konfigurasi Supabase Storage belum lengkap.');
    }

    $objectPath = trim($objectPath);

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

    $encodedPath = implode('/', array_map('rawurlencode', $segments));
    $endpoint = $base . '/storage/v1/object/sign/'
              . rawurlencode($bucket) . '/' . $encodedPath;

    $curl = curl_init($endpoint);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'apikey: ' . $key,
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode(['expiresIn' => $expiresIn]),
    ]);

    $body   = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error  = curl_error($curl);
    curl_close($curl);

    if ($body === false || $error !== '') {
        error_log('Supabase Storage connection error: ' . $error);
        throw new RuntimeException('Tidak dapat menghubungi layanan penyimpanan PDF.');
    }

    $result = json_decode($body, true);

    if ($status < 200 || $status >= 300 || !is_array($result) || empty($result['signedURL'])) {
        error_log('Supabase Storage signed URL gagal. HTTP ' . $status . '. Respons: ' . substr((string) $body, 0, 1500));
        throw new RuntimeException('Gagal membuat tautan PDF sementara. HTTP ' . $status);
    }

    $signedPath = $result['signedURL'];

    if (preg_match('#^https://#i', $signedPath)) {
        return $signedPath;
    }

    return $base . '/storage/v1/' . ltrim($signedPath, '/');
}

function uploadSupabasePdf(string $objectPath, string $filePath): void
{
    $base   = rtrim($_ENV['SUPABASE_URL'] ?? '', '/');
    $key    = $_ENV['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
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
    $endpoint = $base . '/storage/v1/object/'
              . rawurlencode($bucket) . '/' . $encodedPath;

    $contents = file_get_contents($filePath);
    if ($contents === false) {
        throw new RuntimeException('Gagal membaca file PDF.');
    }

    $curl = curl_init($endpoint);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT        => 180,
        CURLOPT_HTTPHEADER     => [
            'apikey: ' . $key,
            'Authorization: Bearer ' . $key,
            'Content-Type: application/pdf',
            'x-upsert: false',
        ],
        CURLOPT_POSTFIELDS => $contents,
    ]);

    $response = curl_exec($curl);
    $status   = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error    = curl_error($curl);
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

function supabaseAdminRequest(string $method, string $endpoint, ?array $payload = null): array
{
    $base = rtrim($_ENV['SUPABASE_URL'] ?? '', '/');
    $key  = $_ENV['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

    if ($base === '' || $key === '') {
        throw new RuntimeException('Konfigurasi Supabase Admin belum lengkap.');
    }

    $curl = curl_init($base . $endpoint);

    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => [
            'apikey: ' . $key,
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
        ],
    ];

    if ($payload !== null) {
        $options[CURLOPT_POSTFIELDS] = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
    }

    curl_setopt_array($curl, $options);

    $body   = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error  = curl_error($curl);
    curl_close($curl);

    if ($body === false || $error !== '') {
        error_log('Supabase Admin API: ' . $error);
        throw new RuntimeException('Tidak dapat menghubungi layanan autentikasi.');
    }

    $data = json_decode($body, true);

    if ($status < 200 || $status >= 300) {
        error_log('Supabase Admin HTTP ' . $status . ': ' . substr((string) $body, 0, 1000));
        throw new RuntimeException('Permintaan Supabase Auth Admin gagal (HTTP ' . $status . ').');
    }

    return is_array($data) ? $data : [];
}

/* ============================================================
 * ROUTING
 * ============================================================ */

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path   = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path   = rtrim($path ?: '/', '/') ?: '/';

try {
    if (!in_array($method, ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], true)) {
        header('Allow: GET, POST, PUT, DELETE, OPTIONS');
        respond(405, ['success' => false, 'message' => 'Metode request tidak didukung.']);
    }

    /* ------------------------------------------------------------
     * HEALTH CHECK
     * ------------------------------------------------------------ */
    if ($path === '/api/health') {
        respond(200, [
            'success'     => true,
            'message'     => 'Magelang Ekspress API berjalan.',
            'environment' => $_ENV['APP_ENV'] ?? 'development',
        ]);
    }

    /* ------------------------------------------------------------
     * ADMIN: CURRENT USER
     * ------------------------------------------------------------ */
    if ($path === '/api/admin/me') {
        $user = \App\Middleware\SupabaseAuth::requireRole(['admin', 'super_admin']);

        respond(200, [
            'success' => true,
            'data' => [
                'id'      => $user['id'],
                'email'   => $user['email'] ?? null,
                'profile' => $user['profile'] ?? null,
            ],
        ]);
    }

    /* ------------------------------------------------------------
     * ADMIN: UPLOAD PDF E-PAPER
     * ------------------------------------------------------------ */
    if ($method === 'POST' && $path === '/api/admin/publications/upload-pdf') {
        \App\Middleware\SupabaseAuth::requireRole(['admin']);

        if (!isset($_FILES['pdf']) || !is_array($_FILES['pdf'])) {
            respond(422, ['success' => false, 'message' => 'Pilih file PDF terlebih dahulu.']);
        }

        $file   = $_FILES['pdf'];
        $error  = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);

        if ($error !== UPLOAD_ERR_OK) {
            respond(422, [
                'success' => false,
                'message' => $error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE
                    ? 'Ukuran PDF melebihi batas upload PHP.'
                    : 'Upload PDF gagal. Pilih ulang file dan coba lagi.',
            ]);
        }

        $tmpPath      = (string) ($file['tmp_name'] ?? '');
        $size         = (int) ($file['size'] ?? 0);
        $originalName = (string) ($file['name'] ?? '');

        if ($size < 1 || $size > 50 * 1024 * 1024) {
            respond(422, ['success' => false, 'message' => 'Ukuran PDF maksimal 50 MB.']);
        }

        if (
            $tmpPath === ''
            || !is_uploaded_file($tmpPath)
            || strtolower(pathinfo($originalName, PATHINFO_EXTENSION)) !== 'pdf'
        ) {
            respond(422, ['success' => false, 'message' => 'Pilih file PDF yang valid.']);
        }

        $finfo     = new \finfo(FILEINFO_MIME_TYPE);
        $mime      = $finfo->file($tmpPath);
        $signature = file_get_contents($tmpPath, false, null, 0, 5);

        if ($mime !== 'application/pdf' || $signature !== '%PDF-') {
            respond(422, ['success' => false, 'message' => 'Isi file bukan PDF yang valid.']);
        }

        $objectPath = 'majalah/' . date('Y/m') . '/' . bin2hex(random_bytes(16)) . '.pdf';

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
                'pdf_url'       => $objectPath,
                'original_name' => basename($originalName),
                'size'          => $size,
            ],
        ]);
    }

    /* ------------------------------------------------------------
     * ADMIN: USERS MANAGEMENT
     * ------------------------------------------------------------ */
    // GET /api/admin/users
    if ($method === 'GET' && $path === '/api/admin/users') {
        \App\Middleware\SupabaseAuth::requireRole(['super_admin']);

        $pdo = Database::connect();
        $stmt = $pdo->query(
            'SELECT id, full_name, username, role, is_active, created_at, updated_at
             FROM public.profiles
             ORDER BY created_at DESC'
        );
        $profiles = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $authResponse = supabaseAdminRequest('GET', '/auth/v1/admin/users?page=1&per_page=100');
        $emails = [];
        foreach (($authResponse['users'] ?? []) as $authUser) {
            if (!empty($authUser['id'])) {
                $emails[$authUser['id']] = $authUser['email'] ?? '';
            }
        }

        foreach ($profiles as &$profile) {
            $profile['email']     = $emails[$profile['id']] ?? '';
            $profile['is_active'] = filter_var($profile['is_active'], FILTER_VALIDATE_BOOLEAN);
        }
        unset($profile);

        respond(200, ['success' => true, 'data' => $profiles]);
    }

    // POST /api/admin/users
    if ($method === 'POST' && $path === '/api/admin/users') {
        \App\Middleware\SupabaseAuth::requireRole(['super_admin']);

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            respond(400, ['success' => false, 'message' => 'Body JSON tidak valid.']);
        }

        $fullName = trim((string) ($input['full_name'] ?? ''));
        $username = strtolower(trim((string) ($input['username'] ?? '')));
        $email    = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $role     = strtolower(trim((string) ($input['role'] ?? 'author')));

        if (
            $fullName === '' ||
            $username === '' ||
            !filter_var($email, FILTER_VALIDATE_EMAIL) ||
            strlen($password) < 8 ||
            !in_array($role, ['admin', 'author', 'super_admin'], true)
        ) {
            respond(422, [
                'success' => false,
                'message' => 'Periksa nama, username, email, role, dan kata sandi (minimal 8 karakter).',
            ]);
        }

        $pdo = Database::connect();

        $check = $pdo->prepare('SELECT 1 FROM public.profiles WHERE lower(username) = lower(:username) LIMIT 1');
        $check->execute(['username' => $username]);
        if ($check->fetchColumn()) {
            respond(409, ['success' => false, 'message' => 'Username sudah digunakan.']);
        }

        $authUser = supabaseAdminRequest('POST', '/auth/v1/admin/users', [
            'email'         => $email,
            'password'      => $password,
            'email_confirm' => true,
            'user_metadata' => [
                'full_name' => $fullName,
                'username'  => $username,
            ],
        ]);

        $authId = $authUser['id'] ?? '';
        if (!is_string($authId) || $authId === '') {
            throw new RuntimeException('Supabase tidak mengembalikan ID pengguna.');
        }

        try {
            $insert = $pdo->prepare(
                'INSERT INTO public.profiles
                    (id, full_name, username, role, is_active, created_at, updated_at)
                 VALUES
                    (:id, :full_name, :username, :role, TRUE, NOW(), NOW())
                 RETURNING id, full_name, username, role, is_active, created_at, updated_at'
            );
            $insert->execute([
                'id'        => $authId,
                'full_name' => $fullName,
                'username'  => $username,
                'role'      => $role,
            ]);

            respond(201, [
                'success' => true,
                'message' => 'Pengguna berhasil dibuat.',
                'data'    => $insert->fetch(PDO::FETCH_ASSOC),
            ]);
        } catch (\Throwable $e) {
            try {
                supabaseAdminRequest('DELETE', '/auth/v1/admin/users/' . rawurlencode($authId));
            } catch (\Throwable $rollbackError) {
                error_log('Rollback Auth gagal: ' . $rollbackError->getMessage());
            }
            throw $e;
        }
    }

    // PUT /api/admin/users/{uuid}
    if ($method === 'PUT' && preg_match('#^/api/admin/users/([0-9a-fA-F-]{36})$#', $path, $userMatch)) {
        $actor = \App\Middleware\SupabaseAuth::requireRole(['super_admin']);
        $targetId = $userMatch[1];

        if (strtolower($targetId) === strtolower($actor['id'])) {
            respond(422, [
                'success' => false,
                'message' => 'Gunakan Pengaturan Akun untuk mengubah profil sendiri.',
            ]);
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            respond(400, ['success' => false, 'message' => 'Body JSON tidak valid.']);
        }

        $fullName = trim((string) ($input['full_name'] ?? ''));
        $username = strtolower(trim((string) ($input['username'] ?? '')));
        $role     = strtolower(trim((string) ($input['role'] ?? '')));

        if ($fullName === '' || $username === '' || !in_array($role, ['admin', 'author', 'super_admin'], true)) {
            respond(422, ['success' => false, 'message' => 'Nama, username, dan role wajib valid.']);
        }

        $pdo = Database::connect();
        $target = $pdo->prepare('SELECT id, role FROM public.profiles WHERE id = :id');
        $target->execute(['id' => $targetId]);
        $existing = $target->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            respond(404, ['success' => false, 'message' => 'Pengguna tidak ditemukan.']);
        }

        if ($existing['role'] === 'super_admin' && $role !== 'super_admin') {
            $count = $pdo->query("SELECT COUNT(*) FROM public.profiles WHERE role = 'super_admin' AND is_active = TRUE")->fetchColumn();
            if ((int) $count <= 1) {
                respond(409, [
                    'success' => false,
                    'message' => 'Tidak dapat menurunkan role Super Admin aktif terakhir.',
                ]);
            }
        }

        $duplicate = $pdo->prepare(
            'SELECT 1 FROM public.profiles
             WHERE lower(username) = lower(:username) AND id <> :id LIMIT 1'
        );
        $duplicate->execute(['username' => $username, 'id' => $targetId]);
        if ($duplicate->fetchColumn()) {
            respond(409, ['success' => false, 'message' => 'Username sudah digunakan.']);
        }

        $update = $pdo->prepare(
            'UPDATE public.profiles
             SET full_name = :full_name, username = :username, role = :role, updated_at = NOW()
             WHERE id = :id
             RETURNING id, full_name, username, role, is_active, created_at, updated_at'
        );
        $update->execute([
            'id'        => $targetId,
            'full_name' => $fullName,
            'username'  => $username,
            'role'      => $role,
        ]);

        respond(200, [
            'success' => true,
            'message' => 'Data pengguna berhasil diperbarui.',
            'data'    => $update->fetch(PDO::FETCH_ASSOC),
        ]);
    }

    // PUT /api/admin/users/{uuid}/status
    if ($method === 'PUT' && preg_match('#^/api/admin/users/([0-9a-fA-F-]{36})/status$#', $path, $statusMatch)) {
        $actor = \App\Middleware\SupabaseAuth::requireRole(['super_admin']);
        $targetId = $statusMatch[1];

        if (strtolower($targetId) === strtolower($actor['id'])) {
            respond(422, [
                'success' => false,
                'message' => 'Kamu tidak dapat menonaktifkan akun sendiri.',
            ]);
        }

        $input  = json_decode(file_get_contents('php://input'), true);
        $active = $input['is_active'] ?? null;

        if (!is_array($input) || !is_bool($active)) {
            respond(422, ['success' => false, 'message' => 'is_active harus bernilai true atau false.']);
        }

        $pdo = Database::connect();
        $find = $pdo->prepare('SELECT id, role, is_active FROM public.profiles WHERE id = :id');
        $find->execute(['id' => $targetId]);
        $existing = $find->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            respond(404, ['success' => false, 'message' => 'Pengguna tidak ditemukan.']);
        }

        if (!$active && $existing['role'] === 'super_admin') {
            $count = $pdo->query("SELECT COUNT(*) FROM public.profiles WHERE role = 'super_admin' AND is_active = TRUE")->fetchColumn();
            if ((int) $count <= 1) {
                respond(409, [
                    'success' => false,
                    'message' => 'Super Admin aktif terakhir tidak dapat dinonaktifkan.',
                ]);
            }
        }

        supabaseAdminRequest('PUT', '/auth/v1/admin/users/' . rawurlencode($targetId), [
            'ban_duration' => $active ? 'none' : '876000h',
        ]);

        $update = $pdo->prepare('UPDATE public.profiles SET is_active = :active, updated_at = NOW() WHERE id = :id');
        $update->execute(['id' => $targetId, 'active' => $active]);

        respond(200, [
            'success' => true,
            'message' => $active ? 'Pengguna berhasil diaktifkan.' : 'Pengguna berhasil dinonaktifkan.',
        ]);
    }

    // PUT /api/admin/account
    if ($method === 'PUT' && $path === '/api/admin/account') {
        $user = \App\Middleware\SupabaseAuth::requireRole(['admin', 'super_admin']);

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            respond(400, ['success' => false, 'message' => 'Body JSON tidak valid.']);
        }

        $fullName = trim((string) ($input['full_name'] ?? ''));
        $username = strtolower(trim((string) ($input['username'] ?? '')));

        if ($fullName === '' || $username === '') {
            respond(422, ['success' => false, 'message' => 'Nama lengkap dan username wajib diisi.']);
        }

        $pdo = Database::connect();
        $duplicate = $pdo->prepare(
            'SELECT 1 FROM public.profiles
             WHERE lower(username) = lower(:username) AND id <> :id LIMIT 1'
        );
        $duplicate->execute(['username' => $username, 'id' => $user['id']]);
        if ($duplicate->fetchColumn()) {
            respond(409, ['success' => false, 'message' => 'Username sudah digunakan.']);
        }

        $stmt = $pdo->prepare(
            'UPDATE public.profiles
             SET full_name = :full_name, username = :username, updated_at = NOW()
             WHERE id = :id
             RETURNING id, full_name, username, role, is_active, updated_at'
        );
        $stmt->execute([
            'id'        => $user['id'],
            'full_name' => $fullName,
            'username'  => $username,
        ]);

        respond(200, [
            'success' => true,
            'message' => 'Pengaturan akun berhasil disimpan.',
            'data'    => $stmt->fetch(PDO::FETCH_ASSOC),
        ]);
    }

    /* ------------------------------------------------------------
     * PUBLIC: PUBLICATIONS
     * ------------------------------------------------------------ */
    if ($method === 'GET' && $path === '/api/publications') {
        $pdo = Database::connect();
        $stmt = $pdo->query('SELECT * FROM public.publications ORDER BY publication_date DESC');
        respond(200, [
            'success' => true,
            'data'    => $stmt->fetchAll(PDO::FETCH_ASSOC),
        ]);
    }

    // GET /api/publications/{id}/pdf
    if ($method === 'GET' && preg_match('#^/api/publications/([0-9]+)/pdf$#', $path, $matches)) {
        $publicationId = (int) $matches[1];
        $pdo = Database::connect();

        $stmt = $pdo->prepare('SELECT id, title, pdf_url FROM public.publications WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $publicationId]);
        $publication = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$publication) {
            respond(404, ['success' => false, 'message' => 'Edisi tidak ditemukan.']);
        }

        if (empty($publication['pdf_url'])) {
            respond(404, ['success' => false, 'message' => 'File PDF belum tersedia.']);
        }

        try {
            $signedUrl = createSupabaseSignedUrl((string) $publication['pdf_url'], 300);
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
                'id'         => $publication['id'],
                'title'      => $publication['title'],
                'signed_url' => $signedUrl,
            ],
        ]);
    }

    /* ------------------------------------------------------------
     * PUBLIC: ARTICLES
     * ------------------------------------------------------------ */
    if ($method === 'GET' && $path === '/api/articles') {
        $pdo = Database::connect();
        $stmt = $pdo->query('SELECT * FROM public.articles ORDER BY created_at DESC');
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // KONSISTEN: bungkus dengan {success, data}
        respond(200, ['success' => true, 'data' => $rows]);
    }

    /* ------------------------------------------------------------
     * ADMIN: PUBLICATIONS (E-PAPER CRUD)
     * ------------------------------------------------------------ */
    if (preg_match('#^/api/admin/publications(?:/([0-9]+))?$#', $path, $matches)) {
        $user = \App\Middleware\SupabaseAuth::requireRole(['admin']);
        $pdo  = Database::connect();
        $id   = isset($matches[1]) ? (int) $matches[1] : null;

        // GET list
        if ($method === 'GET' && $id === null) {
            $stmt = $pdo->query(
                'SELECT p.*, c.name AS category_name
                 FROM public.publications p
                 LEFT JOIN public.categories c ON c.id = p.category_id
                 ORDER BY p.created_at DESC'
            );
            respond(200, [
                'success' => true,
                'data'    => $stmt->fetchAll(PDO::FETCH_ASSOC),
            ]);
        }

        // GET one
        if ($method === 'GET' && $id !== null) {
            $stmt = $pdo->prepare('SELECT * FROM public.publications WHERE id = :id');
            $stmt->execute(['id' => $id]);
            $publication = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$publication) {
                respond(404, ['success' => false, 'message' => 'E-Paper tidak ditemukan.']);
            }

            respond(200, ['success' => true, 'data' => $publication]);
        }

        // POST create
        if ($method === 'POST' && $id === null) {
            $input = json_decode(file_get_contents('php://input'), true);
            if (!is_array($input)) {
                respond(400, ['success' => false, 'message' => 'Body JSON tidak valid.']);
            }

            $title           = trim((string) ($input['title'] ?? ''));
            $publisher       = trim((string) ($input['publisher'] ?? ''));
            $categoryId      = filter_var($input['category_id'] ?? null, FILTER_VALIDATE_INT);
            $publicationDate = trim((string) ($input['publication_date'] ?? ''));
            $status          = $input['status'] ?? 'draft';

            if (
                $title === '' || $publisher === ''
                || $categoryId === false || $categoryId === null || $categoryId < 1
                || $publicationDate === ''
            ) {
                respond(422, [
                    'success' => false,
                    'message' => 'Judul, penerbit, kategori, dan tanggal terbit wajib diisi.',
                ]);
            }

            $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $publicationDate);
            if (!$date || $date->format('Y-m-d') !== $publicationDate) {
                respond(422, ['success' => false, 'message' => 'Format tanggal harus YYYY-MM-DD.']);
            }

            if (!in_array($status, ['draft', 'published'], true)) {
                respond(422, ['success' => false, 'message' => 'Status harus draft atau published.']);
            }

            $stmt = $pdo->prepare(
                'INSERT INTO public.publications (
                    title, publisher, category_id, publication_date,
                    is_premium, status, cover_url, pdf_url, created_by
                 ) VALUES (
                    :title, :publisher, :category_id, :publication_date,
                    :is_premium, :status, :cover_url, :pdf_url, :created_by
                 ) RETURNING *'
            );

            $stmt->execute([
                'title'            => $title,
                'publisher'        => $publisher,
                'category_id'      => $categoryId,
                'publication_date' => $publicationDate,
                'is_premium'       => filter_var($input['is_premium'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'status'           => $status,
                'cover_url'        => trim((string) ($input['cover_url'] ?? '')) ?: null,
                'pdf_url'          => trim((string) ($input['pdf_url'] ?? '')) ?: null,
                'created_by'       => $user['id'] ?? null,
            ]);

            respond(201, [
                'success' => true,
                'message' => 'E-Paper berhasil ditambahkan.',
                'data'    => $stmt->fetch(PDO::FETCH_ASSOC),
            ]);
        }

        // PUT update
        if ($method === 'PUT' && $id !== null) {
            $input = json_decode(file_get_contents('php://input'), true);
            if (!is_array($input)) {
                respond(400, ['success' => false, 'message' => 'Body JSON tidak valid.']);
            }

            $title           = trim((string) ($input['title'] ?? ''));
            $publisher       = trim((string) ($input['publisher'] ?? ''));
            $categoryId      = filter_var($input['category_id'] ?? null, FILTER_VALIDATE_INT);
            $publicationDate = trim((string) ($input['publication_date'] ?? ''));
            $status          = $input['status'] ?? 'draft';

            if (
                $title === '' || $publisher === ''
                || $categoryId === false || $categoryId === null || $categoryId < 1
                || $publicationDate === ''
            ) {
                respond(422, [
                    'success' => false,
                    'message' => 'Judul, penerbit, kategori, dan tanggal terbit wajib diisi.',
                ]);
            }

            $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $publicationDate);
            if (!$date || $date->format('Y-m-d') !== $publicationDate) {
                respond(422, ['success' => false, 'message' => 'Format tanggal harus YYYY-MM-DD.']);
            }

            if (!in_array($status, ['draft', 'published'], true)) {
                respond(422, ['success' => false, 'message' => 'Status harus draft atau published.']);
            }

            $stmt = $pdo->prepare(
                'UPDATE public.publications
                 SET title = :title, publisher = :publisher,
                     category_id = :category_id, publication_date = :publication_date,
                     is_premium = :is_premium, status = :status,
                     cover_url = :cover_url, pdf_url = :pdf_url
                 WHERE id = :id
                 RETURNING *'
            );
            $stmt->execute([
                'id'               => $id,
                'title'            => $title,
                'publisher'        => $publisher,
                'category_id'      => $categoryId,
                'publication_date' => $publicationDate,
                'is_premium'       => filter_var($input['is_premium'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'status'           => $status,
                'cover_url'        => trim((string) ($input['cover_url'] ?? '')) ?: null,
                'pdf_url'          => trim((string) ($input['pdf_url'] ?? '')) ?: null,
            ]);

            $updated = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$updated) {
                respond(404, ['success' => false, 'message' => 'E-Paper tidak ditemukan.']);
            }

            respond(200, [
                'success' => true,
                'message' => 'E-Paper berhasil diperbarui.',
                'data'    => $updated,
            ]);
        }

        // DELETE
        if ($method === 'DELETE' && $id !== null) {
            $stmt = $pdo->prepare('DELETE FROM public.publications WHERE id = :id RETURNING id');
            $stmt->execute(['id' => $id]);

            if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
                respond(404, ['success' => false, 'message' => 'E-Paper tidak ditemukan.']);
            }

            respond(200, ['success' => true, 'message' => 'Data E-Paper berhasil dihapus.']);
        }

        respond(405, ['success' => false, 'message' => 'Metode tidak sesuai untuk endpoint E-Paper ini.']);
    }

    /* ------------------------------------------------------------
     * CATEGORIES
     * ------------------------------------------------------------ */
    if ($path === '/api/categories' && $method === 'GET') {
        $pdo = Database::connect();
        $stmt = $pdo->query(
            'SELECT id, name, slug, description, is_active, created_at
             FROM public.categories
             ORDER BY id ASC'
        );
        respond(200, [
            'success' => true,
            'data'    => $stmt->fetchAll(PDO::FETCH_ASSOC),
        ]);
    }

    if ($path === '/api/categories' && $method === 'POST') {
        \App\Middleware\SupabaseAuth::requireRole(['admin']);

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            respond(400, ['success' => false, 'message' => 'Body JSON tidak valid.']);
        }

        $name        = trim((string) ($input['name'] ?? ''));
        $slug        = strtolower(trim((string) ($input['slug'] ?? '')));
        $description = trim((string) ($input['description'] ?? ''));

        if ($name === '' || $slug === '') {
            respond(422, ['success' => false, 'message' => 'Nama dan slug wajib diisi.']);
        }

        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            respond(422, [
                'success' => false,
                'message' => 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung di antara kata.',
            ]);
        }

        $pdo = Database::connect();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO public.categories (name, slug, description, is_active)
                 VALUES (:name, :slug, :description, TRUE)
                 RETURNING id, name, slug, description, is_active, created_at'
            );
            $stmt->execute([
                'name'        => $name,
                'slug'        => $slug,
                'description' => $description !== '' ? $description : null,
            ]);

            respond(201, [
                'success' => true,
                'message' => 'Kategori berhasil ditambahkan.',
                'data'    => $stmt->fetch(PDO::FETCH_ASSOC),
            ]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23505') {
                respond(409, ['success' => false, 'message' => 'Nama atau slug kategori sudah digunakan.']);
            }
            throw $e;
        }
    }

    if (preg_match('#^/api/categories/([0-9]+)$#', $path, $matches) && $method === 'PUT') {
        \App\Middleware\SupabaseAuth::requireRole(['admin']);

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            respond(400, ['success' => false, 'message' => 'Body JSON tidak valid.']);
        }

        $name        = trim((string) ($input['name'] ?? ''));
        $slug        = strtolower(trim((string) ($input['slug'] ?? '')));
        $description = trim((string) ($input['description'] ?? ''));

        if ($name === '' || $slug === '') {
            respond(422, ['success' => false, 'message' => 'Nama dan slug wajib diisi.']);
        }
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            respond(422, ['success' => false, 'message' => 'Format slug tidak valid.']);
        }

        $pdo = Database::connect();
        try {
            $stmt = $pdo->prepare(
                'UPDATE public.categories
                 SET name = :name, slug = :slug, description = :description
                 WHERE id = :id
                 RETURNING id, name, slug, description, is_active, created_at'
            );
            $stmt->execute([
                'id'          => (int) $matches[1],
                'name'        => $name,
                'slug'        => $slug,
                'description' => $description !== '' ? $description : null,
            ]);

            $category = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$category) {
                respond(404, ['success' => false, 'message' => 'Kategori tidak ditemukan.']);
            }

            respond(200, [
                'success' => true,
                'message' => 'Kategori berhasil diperbarui.',
                'data'    => $category,
            ]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23505') {
                respond(409, ['success' => false, 'message' => 'Nama atau slug kategori sudah digunakan.']);
            }
            throw $e;
        }
    }

    if (preg_match('#^/api/categories/([0-9]+)$#', $path, $matches) && $method === 'DELETE') {
        \App\Middleware\SupabaseAuth::requireRole(['admin']);

        $pdo = Database::connect();
        $pdo->beginTransaction();

        try {
            $id = (int) $matches[1];

            $check = $pdo->prepare('SELECT id FROM public.categories WHERE id = :id FOR UPDATE');
            $check->execute(['id' => $id]);

            if (!$check->fetchColumn()) {
                $pdo->rollBack();
                respond(404, ['success' => false, 'message' => 'Kategori tidak ditemukan.']);
            }

            $usage = $pdo->prepare(
                'SELECT
                    EXISTS (SELECT 1 FROM public.articles WHERE category_id = :article_id)
                    OR EXISTS (SELECT 1 FROM public.publications WHERE category_id = :publication_id)'
            );
            $usage->execute(['article_id' => $id, 'publication_id' => $id]);

            $inUse = filter_var($usage->fetchColumn(), FILTER_VALIDATE_BOOLEAN);
            if ($inUse) {
                $pdo->rollBack();
                respond(409, [
                    'success' => false,
                    'message' => 'Kategori masih digunakan oleh artikel atau publikasi. Nonaktifkan kategori jika tidak ingin menggunakannya lagi.',
                ]);
            }

            $delete = $pdo->prepare('DELETE FROM public.categories WHERE id = :id');
            $delete->execute(['id' => $id]);

            $pdo->commit();

            respond(200, ['success' => true, 'message' => 'Kategori berhasil dihapus.']);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /* ------------------------------------------------------------
     * FALLBACK 404
     * ------------------------------------------------------------ */
    respond(404, [
        'success' => false,
        'message' => 'Endpoint tidak ditemukan: ' . $method . ' ' . $path,
    ]);

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