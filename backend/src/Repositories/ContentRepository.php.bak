<?php
declare(strict_types=1);

namespace App\Repositories;

use PDO;

final class ContentRepository
{
    public function __construct(private PDO $pdo) {}

    public function publishedArticles(): array
    {
        $sql = "select a.id, a.title, a.slug, a.excerpt, a.cover_url,
                       a.published_at, c.name as category
                from public.articles a
                left join public.categories c on c.id = a.category_id
                where a.status = 'published'
                order by a.published_at desc nulls last
                limit 50";
        return $this->pdo->query($sql)->fetchAll();
    }

    public function publishedPublications(): array
    {
        $sql = "select p.id, p.title, p.publisher, p.cover_url, p.pdf_url,
                       p.publication_date, p.is_premium, c.name as category
                from public.publications p
                left join public.categories c on c.id = p.category_id
                where p.status = 'published'
                order by p.publication_date desc nulls last
                limit 50";
        return $this->pdo->query($sql)->fetchAll();
    }
}
