<?php
declare(strict_types=1);

namespace App\Middleware;

use RuntimeException;

/**
 * Verifies a bearer token by asking Supabase Auth's /auth/v1/user endpoint.
 * Do not trust user IDs or roles supplied in request JSON.
 */
final class SupabaseAuth
{
    public static function requireUser(): array
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            http_response_code(401);
            throw new RuntimeException('Bearer token diperlukan.');
        }

        $base = rtrim($_ENV['SUPABASE_URL'] ?? '', '/');
        $key = $_ENV['SUPABASE_PUBLISHABLE_KEY'] ?? '';
        if ($base === '' || $key === '') {
            throw new RuntimeException('Konfigurasi Supabase belum lengkap.');
        }

        $curl = curl_init($base . '/auth/v1/user');
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => [
                'apikey: ' . $key,
                'Authorization: Bearer ' . $matches[1],
            ],
        ]);
        $body = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($body === false || $error !== '') {
            throw new RuntimeException('Tidak dapat memvalidasi token.');
        }
        if ($status !== 200) {
            http_response_code(401);
            throw new RuntimeException('Token tidak valid atau kedaluwarsa.');
        }

        $user = json_decode($body, true);
        if (!is_array($user) || empty($user['id'])) {
            throw new RuntimeException('Respons autentikasi tidak valid.');
        }
        return $user;
    }

    public static function requireRole(array $allowedRoles): array
    {
        $user = self::requireUser();
        // Role must come from the trusted database, not the client request.
        $pdo = \App\Config\Database::connect();
        $stmt = $pdo->prepare('select role, is_active from public.profiles where id = :id');
        $stmt->execute(['id' => $user['id']]);
        $profile = $stmt->fetch();

        if (!$profile || !$profile['is_active'] || !in_array($profile['role'], $allowedRoles, true)) {
            http_response_code(403);
            throw new RuntimeException('Akses tidak diizinkan.');
        }
        $user['profile'] = $profile;
        return $user;
    }
}
