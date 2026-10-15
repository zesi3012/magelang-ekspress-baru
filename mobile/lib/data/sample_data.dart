import '../models/epaper_issue.dart';

const sampleIssues = <EpaperIssue>[
  EpaperIssue(
    id: 'issue-001',
    title: 'Magelang Ekspress',
    dateLabel: 'Kamis, 15 Oktober 2026',
    priceLabel: 'Rp5.000',
    editionLabel: 'Edisi Utama',
    isPremium: true,
  ),
  EpaperIssue(
    id: 'issue-002',
    title: 'Radar Tegal',
    dateLabel: 'Rabu, 14 Oktober 2026',
    priceLabel: 'Rp5.000',
    editionLabel: 'Edisi Daerah',
    isPremium: true,
  ),
];

const sampleArticles = <Map<String, String>>[
  {
    'id': 'article-001',
    'title': 'Daerah Perkuat Layanan Publik dan Ekonomi Lokal',
    'category': 'Daerah',
    'date': '15 Oktober 2026',
    'excerpt': 'Kolaborasi pemerintah, pelaku usaha, dan masyarakat menjadi bagian penting dalam memperkuat layanan publik serta ekonomi lokal.',
    'body': 'Penguatan layanan publik dan ekonomi lokal memerlukan kerja sama yang konsisten antara pemerintah, pelaku usaha, dan masyarakat. Program yang dirancang dengan data yang baik dapat membantu menentukan prioritas dan mengukur hasil secara lebih terarah.\n\nSelain meningkatkan akses layanan, kolaborasi lintas sektor juga membuka ruang bagi usaha lokal untuk berkembang. Transparansi informasi dan evaluasi berkala menjadi unsur penting agar manfaat program dapat dirasakan secara luas.',
  },
  {
    'id': 'article-002',
    'title': 'Literasi Digital Jadi Bekal Generasi Muda',
    'category': 'Pendidikan',
    'date': '15 Oktober 2026',
    'excerpt': 'Kemampuan memilah informasi dan menggunakan teknologi secara bertanggung jawab semakin dibutuhkan.',
    'body': 'Literasi digital tidak hanya berkaitan dengan kemampuan menggunakan perangkat. Keterampilan memeriksa sumber, memahami konteks, dan menjaga keamanan data juga menjadi bagian penting.\n\nSekolah, keluarga, dan komunitas dapat bekerja bersama untuk membangun kebiasaan digital yang sehat. Pembelajaran praktis dan diskusi terbuka membantu generasi muda mengambil keputusan yang lebih bijak.',
  },
  {
    'id': 'article-003',
    'title': 'UMKM Lokal Mengembangkan Pasar melalui Inovasi',
    'category': 'Ekonomi',
    'date': '14 Oktober 2026',
    'excerpt': 'Inovasi produk dan pemanfaatan kanal digital membuka peluang pasar baru bagi usaha kecil.',
    'body': 'Pelaku usaha mikro, kecil, dan menengah terus mencari cara untuk menjangkau pelanggan baru. Pengembangan kualitas produk, pelayanan, dan strategi pemasaran menjadi fondasi dalam menghadapi persaingan.\n\nPemanfaatan kanal digital dapat memperluas jangkauan, tetapi perlu disertai pengelolaan pesanan, biaya, dan layanan pelanggan yang terukur.',
  },
];
