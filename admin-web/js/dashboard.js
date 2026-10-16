(() => {
  const apiBase = (window.ADMIN_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  let publications = [];

  const $ = (id) => document.getElementById(id);
  $("year").textContent = new Date().getFullYear();

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  }

  function showNotice(type, title, message) {
    const box = $("apiNotice");
    box.className = `notice ${type || ""}`;
    box.innerHTML = `<span class="notice-icon">i</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  }

  function render() {
    const term = $("searchInput").value.trim().toLowerCase();
    const premiumFilter = $("premiumFilter").value;
    const filtered = publications.filter((p) => {
      const searchable = `${p.title || ""} ${p.publisher || ""}`.toLowerCase();
      const premiumOk = premiumFilter === "all" || (premiumFilter === "premium" ? Boolean(p.is_premium) : !p.is_premium);
      return searchable.includes(term) && premiumOk;
    });

    $("totalCount").textContent = publications.length;
    $("publishedCount").textContent = publications.length;
    $("premiumCount").textContent = publications.filter((p) => Boolean(p.is_premium)).length;
    $("resultCount").textContent = `${filtered.length} edisi ditampilkan`;

    if (!filtered.length) {
      $("publicationRows").innerHTML = `<tr><td colspan="6" class="empty">${publications.length ? "Tidak ada edisi yang sesuai pencarian." : "Belum ada edisi yang dikembalikan API."}</td></tr>`;
      return;
    }

    $("publicationRows").innerHTML = filtered.map((p) => {
      const cover = p.cover_url
        ? `<img class="cover" src="${escapeHtml(p.cover_url)}" alt="Sampul" loading="lazy" onerror="this.style.display='none'">`
        : `<span class="cover-placeholder">▤</span>`;

      const pdfAction = p.pdf_url
        ? `<button class="icon-btn" type="button" data-pdf-id="${escapeHtml(p.id)}" title="Buka PDF" aria-label="Buka PDF">↗</button>`
        : `<span class="icon-btn" title="URL PDF belum tersedia">—</span>`;

      return `<tr>
        <td><div class="issue-cell">${cover}<div><div class="issue-title">${escapeHtml(p.title || "Tanpa judul")}</div><div class="issue-sub">${escapeHtml(p.category || "Tanpa kategori")}</div></div></div></td>
        <td>${escapeHtml(p.publisher || "—")}</td>
        <td>${escapeHtml(formatDate(p.publication_date))}</td>
        <td><span class="pill ${p.is_premium ? "premium" : "regular"}">${p.is_premium ? "Premium" : "Reguler"}</span></td>
        <td><span class="pill published">● Terbit</span></td>
        <td><div class="actions">${pdfAction}</div></td>
      </tr>`;
    }).join("");
  }

  async function loadPublications() {
    if (!apiBase) {
      showNotice("error", "URL API belum diatur", "Atur API_BASE_URL di js/config.js.");
      $("publicationRows").innerHTML = `<tr><td colspan="6" class="empty">Konfigurasi API belum tersedia.</td></tr>`;
      return;
    }
    $("refreshBtn").disabled = true;
    $("refreshBtn").textContent = "Memuat…";
    showNotice("", "Menghubungkan ke API", `Mengambil data dari ${apiBase}/publications`);
    try {
      const response = await fetch(`${apiBase}/publications`, { headers: { "Accept": "application/json" } });
      if (!response.ok) throw new Error(`Server merespons HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload.success || !Array.isArray(payload.data)) throw new Error(payload.message || "Format respons API tidak sesuai.");
      publications = payload.data;
      render();
      showNotice("success", "API terhubung", "Data menampilkan edisi yang berstatus published. Draft dan pengelolaan data memerlukan endpoint admin yang terautentikasi.");
    } catch (error) {
      publications = [];
      render();
      showNotice("error", "Gagal mengambil data E-Paper", `${error.message}. Pastikan PHP API berjalan dan URL di js/config.js benar.`);
    } finally {
      $("refreshBtn").disabled = false;
      $("refreshBtn").innerHTML = "↻ <span>Muat ulang data</span>";
    }
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-pdf-id]");
    if (!button) return;

    const publicationId = button.dataset.pdfId;
    const pdfWindow = window.open("about:blank", "_blank");

    if (!pdfWindow) {
      showNotice(
        "error",
        "Pop-up diblokir",
        "Izinkan pop-up untuk membuka PDF."
      );
      return;
    }

    button.disabled = true;

    try {
      const response = await fetch(
        `${apiBase}/publications/${encodeURIComponent(publicationId)}/pdf`,
        { headers: { Accept: "application/json" } }
      );

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.message || `Server merespons HTTP ${response.status}`
        );
      }

      const signedUrl = payload.data?.signed_url;

      if (!signedUrl) {
        throw new Error("Tautan PDF tidak ditemukan dalam respons API.");
      }

      pdfWindow.location.href = signedUrl;
    } catch (error) {
      pdfWindow.close();
      showNotice(
        "error",
        "PDF gagal dibuka",
        error.message
      );
    } finally {
      button.disabled = false;
    }
  });

  $("refreshBtn").addEventListener("click", loadPublications);
  $("searchInput").addEventListener("input", render);
  $("premiumFilter").addEventListener("change", render);
  $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  document.addEventListener("click", (event) => {
    if (window.innerWidth <= 720 && !$("sidebar").contains(event.target) && !$("menuToggle").contains(event.target)) {
      $("sidebar").classList.remove("open");
    }
  });

  $("exportBtn").addEventListener("click", () => {
    const headers = ["title", "publisher", "publication_date", "is_premium", "pdf_url", "cover_url"];
    const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...publications.map(p => headers.map(h => csvCell(p[h])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "magelang-ekspress-epaper.csv"; link.click();
    URL.revokeObjectURL(url);
  });

  loadPublications();
})();
