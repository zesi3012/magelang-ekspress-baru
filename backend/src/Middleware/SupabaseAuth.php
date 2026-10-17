<?php
declare(strict_types=1);

namespace App\Middleware;

use RuntimeException;

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
            throw new RuntimeException(
                'Konfigurasi Supabase belum lengkap.'
            );
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
            throw new RuntimeException(
                'Tidak dapat memvalidasi token.'
            );
        }

        if ($status !== 200) {
            http_response_code(401);
            throw new RuntimeException(
                'Token tidak valid atau kedaluwarsa.'
            );
        }

        $user = json_decode($body, true);

        if (!is_array($user) || empty($user['id'])) {
            http_response_code(401);
            throw new RuntimeException(
                'Respons autentikasi tidak valid.'
            );
        }

        return $user;
    }

    public static function requireRole(array $allowedRoles): array
    {
        $user = self::requireUser();

        $pdo = \App\Config\Database::connect();

        $stmt = $pdo->prepare(
            'SELECT id, full_name, username, role, is_active
             FROM public.profiles
             WHERE id = :id
             LIMIT 1'
        );

        $stmt->execute(['id' => $user['id']]);
        $profile = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (
            !$profile ||
            !in_array($profile['is_active'], [true, 1, '1', 't'], true)
        ) {
            http_response_code(403);
            throw new RuntimeException(
                'Akun tidak ditemukan atau dinonaktifkan.'
            );
        }

        $role = strtolower(trim((string) $profile['role']));
        $allowedRoles = array_map(
            static fn ($value) => strtolower(trim((string) $value)),
            $allowedRoles
        );

        $authorized = in_array($role, $allowedRoles, true);

        // Super Admin boleh mengakses endpoint operasional Admin.
        // Endpoint khusus Super Admin tetap harus meminta
        // requireRole(['super_admin']).
        if (
            !$authorized &&
            $role === 'super_admin' &&
            in_array('admin', $allowedRoles, true)
        ) {
            $authorized = true;
        }

        if (!$authorized) {
            http_response_code(403);
            throw new RuntimeException(
                'Role Anda tidak memiliki izin untuk tindakan ini.'
            );
        }

        $profile['role'] = $role;
        $user['profile'] = $profile;

        return $user;
    }
}
