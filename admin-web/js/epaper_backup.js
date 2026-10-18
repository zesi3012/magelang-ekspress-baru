
(() => {
  "use strict";

  const config = window.ADMIN_CONFIG || {};
  const apiBase = (config.API_BASE_URL || "").replace(/\/+$/, "");
  const supabaseLib = window.supabase;
  const $ = (id) => document.getElementById(id);

  let publications = [];
  let categories = [];
  let editingId = null;
  let isSaving = false;
  let supabaseClient = null;

  if (supabaseLib && config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY) {
    supabaseClient = supabaseLib.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_PUBLISHABLE_KEY
    );
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function setNotice(type, title, message) {
    const box = $("apiNotice");
    if (!box) return;

    box.className = `notice ${type || ""}`;
    box.replaceChildren();

    const wrapper = document.createElement("div");
    const heading = document.createElement("strong");
    const paragraph = document.createElement("p");

    heading.textContent = title;
    paragraph.textContent = message;
    wrapper.append(heading, paragraph);
    box.append(wrapper);
  }

  function setButtonLoading(button, loading, loadingText, normalText) {
    if (!button) return;
    button.disabled = loading;
    button.textContent = loading ? loadingText : normalText;
  }

  function normalizeData(payload) {
    if (Array.isArray(payload?.data)) return payload.data;
    if (payload?.data && typeof payload.data === "object") {
      return [payload.data];
    }
    return [];
  }

  async function getAccessToken() {
    if (!supabaseClient) {
      throw new Error(
        "Konfigurasi Supabase belum lengkap. Periksa SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY di js/config.js."
      );
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const token = data?.session?.access_token;
    if (!token) {
      throw new Error("Sesi admin berakhir. Silakan login kembali.");
    }

    return token;
  }

  async function apiRequest(path, options = {}) {
    if (!apiBase) {
      throw new Error("API_BASE_URL belum diatur di js/config.js.");
    }

    const token = await getAccessToken();

    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      apikey: config.SUPABASE_PUBLISHABLE_KEY,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Respons API tidak valid (HTTP ${response.status}).`);
    }

    if (!response.ok || payload?.success === false) {
      throw new Error(
        payload?.message ||
        payload?.error ||
        `Permintaan gagal (HTTP ${response.status}).`
      );
    }

    return payload;
  }

  // Mengirim file PDF ke endpoint backend.
  // Backend harus menyediakan POST /api/admin/publications/upload-pdf.
  async function uploadPdf(file) {
    if (!file) return null;

    if (!apiBase) {
      throw new Error("API_BASE_URL belum diatur di js/config.js.");
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("File harus berformat PDF.");
    }

    if (file.size === 0) {
      throw new Error("File PDF kosong.");
    }

    if (file.size > 50 * 1024 * 1024) {
      throw new Error("Ukuran PDF maksimal 50 MB.");
    }

    const token = await getAccessToken();
    const formData = new FormData();
    formData.append("pdf", file);

    const response = await fetch(
      `${apiBase}/admin/publications/upload-pdf`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          apikey: config.SUPABASE_PUBLISHABLE_KEY
        },
        body: formData
      }
    );

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        `Respons upload tidak valid (HTTP ${response.status}).`
      );
    }

    if (!response.ok || payload?.success === false) {
      throw new Error(
        payload?.message ||
        payload?.error ||
        `Upload PDF gagal (HTTP ${response.status}).`
      );
    }

    const pdfPath = payload?.data?.pdf_url;
    if (!pdfPath || typeof pdfPath !== "string") {
      throw new Error("Server tidak mengembalikan path PDF.");
    }

    return pdfPath;
  }

  // =====================================================
  // FORM TAMBAH / EDIT E-PAPER
  // =====================================================

  

function ensurePublicationForm() {
  const page = $("epaperPage");
  if (!page) return;

  const toolbar = $("refreshBtn")?.parentElement;

  if (toolbar && !$("addPublicationBtn")) {
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.id = "addPublicationBtn";
    addButton.className = "primary-btn";
    addButton.textContent = "+ Tambah E-Paper";
    toolbar.append(addButton);
  }

  // Gunakan panel lama jika tersedia agar posisi dashboard tetap terjaga.
  let panel = $("publicationFormPanel");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "publicationFormPanel";
    panel.className = "category-card hidden";

    const notice = $("apiNotice");
    if (notice) {
      notice.insertAdjacentElement("afterend", panel);
    } else {
      page.prepend(panel);
    }
  }

  // Bangun ulang isi panel agar input PDF lama tergantikan.
  panel.innerHTML = `
    <div class="card-heading">
      <div>
        <h2 id="publicationFormTitle">Tambah E-Paper</h2>
        <p class="muted">Lengkapi informasi edisi koran digital.</p>
      </div>
    </div>

    <form id="publicationForm">
      <input type="hidden" id="publicationId">

      <div class="form-grid">
        <div class="form-group">
          <label for="publicationTitle">Judul edisi *</label>
          <input class="field" id="publicationTitle"
            maxlength="200" required placeholder="Judul edisi koran">
        </div>

        <div class="form-group">
          <label for="publicationPublisher">Penerbit *</label>
          <input class="field" id="publicationPublisher"
            maxlength="150" required value="Magelang Ekspress">
        </div>

        <div class="form-group">
          <label for="publicationCategory">Kategori *</label>
          <select class="field" id="publicationCategory" required>
            <option value="">Pilih kategori</option>
          </select>
        </div>

        <div class="form-group">
          <label for="publicationDate">Tanggal terbit *</label>
          <input class="field" type="date" id="publicationDate" required>
        </div>

        <div class="form-group">
          <label for="publicationStatus">Status publikasi *</label>
          <select class="field" id="publicationStatus" required>
            <option value="draft">Draft</option>
            <option value="published">Terbit</option>
          </select>
        </div>

        <div class="form-group">
          <label for="publicationPremium">Jenis edisi *</label>
          <select class="field" id="publicationPremium" required>
            <option value="false">Reguler / Gratis</option>
            <option value="true">Premium</option>
          </select>
        </div>

        <div class="form-group full">
          <label for="publicationCoverUrl">Path atau URL sampul</label>
          <input class="field" id="publicationCoverUrl"
            placeholder="Path atau URL gambar sampul">
        </div>

        <div class="form-group full">
          <label for="publicationPdfFile">Pilih File PDF E-Paper *</label>
          <input class="field" type="file" id="publicationPdfFile"
            accept=".pdf,application/pdf">
          <p class="muted" id="publicationPdfInfo">
            Pilih PDF dari komputer. Ukuran maksimal 50 MB.
          </p>
        </div>

        <div class="form-group full">
          <label for="publicationPdfUrl">Path PDF di Storage</label>
          <input class="field" id="publicationPdfUrl" readonly
            placeholder="Path terisi otomatis setelah upload berhasil">
          <p class="muted">
            PDF lama tetap digunakan ketika mengedit jika tidak memilih
            file pengganti.
          </p>
        </div>
      </div>

      <div class="form-actions">
        <button class="primary-btn" id="savePublicationBtn" type="submit">
          Simpan E-Paper
        </button>
        <button class="outline-btn" id="cancelPublicationBtn" type="button">
          Batal
        </button>
      </div>
    </form>
  `;
}



  function openForm(publication = null) {
    ensurePublicationForm();

    const panel = $("publicationFormPanel");
    const form = $("publicationForm");
    if (!panel || !form) return;

    editingId = publication?.id ?? null;
    form.reset();

    $("publicationId").value = editingId ?? "";
    $("publicationFormTitle").textContent =
      editingId ? "Edit E-Paper" : "Tambah E-Paper";

    $("publicationTitle").value = publication?.title ?? "";
    $("publicationPublisher").value =
      publication?.publisher ?? "Magelang Ekspress";

    $("publicationCategory").value =
      publication?.category_id == null
        ? ""
        : String(publication.category_id);

    $("publicationDate").value =
      String(publication?.publication_date ?? "").slice(0, 10);

    $("publicationStatus").value =
      publication?.status === "published" ? "published" : "draft";

    $("publicationPremium").value =
      publication?.is_premium === true ||
      publication?.is_premium === "true" ||
      publication?.is_premium === 1
        ? "true"
        : "false";

    $("publicationCoverUrl").value = publication?.cover_url ?? "";
    $("publicationPdfUrl").value = publication?.pdf_url ?? "";

    if ($("publicationPdfFile")) {
      $("publicationPdfFile").value = "";
    }

    if ($("publicationPdfInfo")) {
      $("publicationPdfInfo").textContent = publication?.pdf_url
        ? "PDF lama masih tersimpan. Pilih file baru jika ingin menggantinya."
        : "Pilih PDF dari komputer. Ukuran maksimal 50 MB.";
    }

    $("savePublicationBtn").textContent =
      editingId ? "Simpan Perubahan" : "Simpan E-Paper";

    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    $("publicationTitle").focus();
  }

  function closeForm() {
    $("publicationFormPanel")?.classList.add("hidden");
    $("publicationForm")?.reset();
    editingId = null;
  }

  // =====================================================
  // KATEGORI
  // =====================================================

  async function loadCategories() {
    try {
      const payload = await apiRequest("/categories", { method: "GET" });
      categories = normalizeData(payload);

      const select = $("publicationCategory");
      if (!select) return;

      const previousValue = select.value;

      select.innerHTML = `
        <option value="">Pilih kategori</option>
        ${categories.map((category) => `
          <option value="${escapeHtml(category.id)}">
            ${escapeHtml(category.name)}
          </option>
        `).join("")}
      `;

      if (categories.some(
        (category) => String(category.id) === previousValue
      )) {
        select.value = previousValue;
      }

      if (categories.length === 0) {
        setNotice(
          "error",
          "Kategori belum tersedia",
          "Tambahkan kategori terlebih dahulu sebelum membuat E-Paper."
        );
      }
    } catch (error) {
      console.error("Gagal memuat kategori:", error);

      if ($("publicationCategory")) {
        $("publicationCategory").innerHTML =
          '<option value="">Gagal memuat kategori</option>';
      }

      setNotice("error", "Gagal memuat kategori", error.message);
    }
  }

  // =====================================================
  // TABEL, PENCARIAN, FILTER
  // =====================================================

  function render() {
    const rows = $("publicationRows");
    if (!rows) return;

    const term = ($("searchInput")?.value ?? "").trim().toLowerCase();
    const filter = $("premiumFilter")?.value ?? "";

    const filtered = publications.filter((publication) => {
      const categoryName =
        publication.category_name ||
        publication.category ||
        categories.find(
          (category) =>
            String(category.id) === String(publication.category_id)
        )?.name ||
        "";

      const searchable = [
        publication.title,
        publication.publisher,
        categoryName
      ].join(" ").toLowerCase();

      const premium =
        publication.is_premium === true ||
        publication.is_premium === "true" ||
        publication.is_premium === 1;

      const premiumOk =
        filter === "" ||
        filter === "all" ||
        (filter === "premium" && premium) ||
        ((filter === "free" || filter === "regular") && !premium);

      return searchable.includes(term) && premiumOk;
    });

    if ($("totalCount")) {
      $("totalCount").textContent = publications.length;
    }

    if ($("publishedCount")) {
      $("publishedCount").textContent = publications.filter(
        (item) => item.status === "published"
      ).length;
    }

    if ($("premiumCount")) {
      $("premiumCount").textContent = publications.filter(
        (item) =>
          item.is_premium === true ||
          item.is_premium === "true" ||
          item.is_premium === 1
      ).length;
    }

    if ($("resultCount")) {
      $("resultCount").textContent =
        `${filtered.length} dari ${publications.length} edisi ditampilkan`;
    }

    if (filtered.length === 0) {
      rows.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;padding:28px">
            ${publications.length
              ? "Tidak ada edisi yang sesuai pencarian."
              : "Belum ada data E-Paper."}
          </td>
        </tr>
      `;
      return;
    }

    rows.innerHTML = filtered.map((publication) => {
      const premium =
        publication.is_premium === true ||
        publication.is_premium === "true" ||
        publication.is_premium === 1;

      const status = publication.status || "draft";

      const categoryName =
        publication.category_name ||
        publication.category ||
        categories.find(
          (category) =>
            String(category.id) === String(publication.category_id)
        )?.name ||
        "Tanpa kategori";

      const cover = publication.cover_url
        ? `<img class="cover"
              src="${escapeHtml(publication.cover_url)}"
              alt="Sampul edisi" loading="lazy"
              onerror="this.style.display='none'">`
        : `<span class="cover-placeholder">▤</span>`;

      return `
        <tr>
          <td>
            <div class="issue-cell">
              ${cover}
              <div>
                <div class="issue-title">
                  ${escapeHtml(publication.title || "Tanpa judul")}
                </div>
                <div class="issue-sub">${escapeHtml(categoryName)}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(publication.publisher || "—")}</td>
          <td>${escapeHtml(formatDate(publication.publication_date))}</td>
          <td>
            <span class="badge ${premium ? "premium" : ""}">
              ${premium ? "Premium" : "Reguler"}
            </span>
          </td>
          <td>
            <span class="badge ${status === "published" ? "published" : "draft"}">
              ${status === "published" ? "● Terbit" : "● Draft"}
            </span>
          </td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="outline-btn"
                data-edit-id="${escapeHtml(publication.id)}">Edit</button>
              <button type="button" class="danger-btn"
                data-delete-id="${escapeHtml(publication.id)}">Hapus</button>
              <button type="button" class="outline-btn"
                data-pdf-id="${escapeHtml(publication.id)}"
                ${publication.pdf_url ? "" : "disabled"}
                title="Buka PDF">PDF</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // =====================================================
  // MEMUAT DAFTAR E-PAPER
  // =====================================================

  async function loadPublications() {
    const refreshBtn = $("refreshBtn");

    setButtonLoading(refreshBtn, true, "Memuat...", "↻ Muat Ulang");
    setNotice("", "Menghubungkan ke API", "Mengambil data E-Paper dari backend.");

    try {
      const payload = await apiRequest("/admin/publications", {
        method: "GET"
      });

      publications = normalizeData(payload);
      render();

      setNotice(
        "success",
        "API terhubung",
        `${publications.length} data E-Paper berhasil dimuat.`
      );
    } catch (error) {
      console.error("Gagal memuat E-Paper:", error);
      publications = [];
      render();

      setNotice(
        "error",
        "Gagal mengambil data E-Paper",
        `${error.message} Pastikan server PHP aktif, endpoint admin tersedia, dan akun yang login memiliki role admin.`
      );
    } finally {
      setButtonLoading(refreshBtn, false, "Memuat...", "↻ Muat Ulang");
    }
  }

  // =====================================================
  // SIMPAN E-PAPER DAN UPLOAD PDF
  // =====================================================

  async function savePublication(event) {
    event.preventDefault();
    if (isSaving) return;

    const form = $("publicationForm");
    if (!form || !form.reportValidity()) return;

    const categoryValue = $("publicationCategory").value;

    if (!categoryValue) {
      setNotice(
        "error",
        "Kategori wajib dipilih",
        "Pilih kategori sebelum menyimpan E-Paper."
      );
      return;
    }

    const selectedFile = $("publicationPdfFile")?.files?.[0];
    const existingPdfPath = $("publicationPdfUrl").value.trim();

    if (!selectedFile && !existingPdfPath) {
      setNotice(
        "error",
        "File PDF wajib dipilih",
        "Pilih file PDF sebelum menyimpan E-Paper."
      );
      return;
    }

    const saveButton = $("savePublicationBtn");
    const normalText = editingId !== null
      ? "Simpan Perubahan"
      : "Simpan E-Paper";

    const isEditing = editingId !== null;
    isSaving = true;
    setButtonLoading(saveButton, true, "Memproses...", normalText);

    try {
      let pdfPath = existingPdfPath;

      if (selectedFile) {
        setNotice(
          "",
          "Mengunggah PDF",
          "File sedang diunggah. Jangan tutup halaman ini."
        );

        pdfPath = await uploadPdf(selectedFile);
        $("publicationPdfUrl").value = pdfPath;
      }

      const body = {
        title: $("publicationTitle").value.trim(),
        publisher: $("publicationPublisher").value.trim(),
        category_id: categoryValue,
        publication_date: $("publicationDate").value,
        status: $("publicationStatus").value,
        is_premium: $("publicationPremium").value === "true",
        cover_url: $("publicationCoverUrl").value.trim() || null,
        pdf_url: pdfPath
      };

      const path = isEditing
        ? `/admin/publications/${encodeURIComponent(editingId)}`
        : "/admin/publications";

      await apiRequest(path, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(body)
      });

      closeForm();

      setNotice(
        "success",
        "Berhasil disimpan",
        isEditing
          ? "Perubahan E-Paper berhasil disimpan."
          : "E-Paper baru berhasil ditambahkan."
      );

      await loadPublications();
    } catch (error) {
      console.error("Gagal menyimpan E-Paper:", error);
      setNotice("error", "E-Paper gagal disimpan", error.message);
    } finally {
      isSaving = false;
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = normalText;
      }
    }
  }

  async function editPublication(id) {
    try {
      setNotice("", "Memuat data", "Mengambil informasi edisi yang akan diedit.");

      const payload = await apiRequest(
        `/admin/publications/${encodeURIComponent(id)}`,
        { method: "GET" }
      );

      const publication = Array.isArray(payload.data)
        ? payload.data[0]
        : payload.data;

      if (!publication) {
        throw new Error("Data E-Paper tidak ditemukan.");
      }

      openForm(publication);
      setNotice(
        "",
        "Mode edit",
        "Ubah informasi E-Paper lalu tekan Simpan Perubahan."
      );
    } catch (error) {
      console.error("Gagal mengambil detail E-Paper:", error);

      const existing = publications.find(
        (item) => String(item.id) === String(id)
      );

      if (existing) {
        openForm(existing);
        setNotice(
          "",
          "Mode edit",
          "Data diambil dari daftar. Pastikan endpoint detail admin tersedia."
        );
      } else {
        setNotice("error", "Gagal membuka data", error.message);
      }
    }
  }

  // =====================================================
  // HAPUS E-PAPER
  // =====================================================

  async function deletePublication(id) {
    const publication = publications.find(
      (item) => String(item.id) === String(id)
    );

    const title = publication?.title || `ID ${id}`;

    if (!window.confirm(
      `Yakin ingin menghapus E-Paper "${title}"?\n\nTindakan ini menghapus data edisi dari database.`
    )) {
      return;
    }

    try {
      await apiRequest(
        `/admin/publications/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );

      publications = publications.filter(
        (item) => String(item.id) !== String(id)
      );

      render();
      setNotice("success", "E-Paper dihapus", `Data "${title}" berhasil dihapus dari database.`);
    } catch (error) {
      console.error("Gagal menghapus E-Paper:", error);
      setNotice("error", "E-Paper gagal dihapus", error.message);
    }
  }

  // =====================================================
  // BUKA PDF DENGAN SIGNED URL
  // =====================================================

  async function openPdf(id) {
    const popup = window.open("about:blank", "_blank");

    if (!popup) {
      setNotice(
        "error",
        "Pop-up diblokir",
        "Izinkan pop-up di browser, lalu coba lagi."
      );
      return;
    }

    try {
      const payload = await apiRequest(
        `/publications/${encodeURIComponent(id)}/pdf`,
        { method: "GET" }
      );

      const signedUrl = payload?.data?.signed_url;
      if (!signedUrl) throw new Error("Signed URL PDF tidak ditemukan.");

      const parsed = new URL(signedUrl);
      if (parsed.protocol !== "https:") {
        throw new Error("Tautan PDF harus menggunakan HTTPS.");
      }

      popup.location.href = parsed.href;
    } catch (error) {
      if (!popup.closed) popup.close();
      setNotice("error", "PDF gagal dibuka", error.message);
    }
  }

  // =====================================================
  // EKSPOR CSV
  // =====================================================

  function exportCsv() {
    const headers = [
      "id",
      "title",
      "publisher",
      "category_id",
      "publication_date",
      "status",
      "is_premium",
      "pdf_url",
      "cover_url"
    ];

    const cell = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [
      headers.join(","),
      ...publications.map((publication) =>
        headers.map((key) => cell(publication[key])).join(",")
      )
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "magelang-ekspress-epaper.csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // =====================================================
  // EVENT LISTENER
  // =====================================================

  function initialize() {
    ensurePublicationForm();

    const pdfInput = $("publicationPdfFile");

    pdfInput?.addEventListener("change", () => {
      const file = pdfInput.files?.[0];
      const info = $("publicationPdfInfo");
      if (!info) return;

      if (!file) {
        info.textContent = "Pilih PDF dari komputer. Ukuran maksimal 50 MB.";
        return;
      }

      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      info.textContent = `${file.name} — ${sizeMB} MB`;
    });

    const year = $("year");
    if (year) year.textContent = new Date().getFullYear();

    $("refreshBtn")?.addEventListener("click", loadPublications);

    $("dashboardRefreshBtn")?.addEventListener("click", () => {
      window.location.hash = "#epaper";
      loadPublications();
    });

    $("searchInput")?.addEventListener("input", render);
    $("premiumFilter")?.addEventListener("change", render);
    $("exportBtn")?.addEventListener("click", exportCsv);

    $("addPublicationBtn")?.addEventListener("click", async () => {
      await loadCategories();
      openForm();
    });

    $("publicationForm")?.addEventListener("submit", savePublication);
    $("cancelPublicationBtn")?.addEventListener("click", closeForm);

    $("publicationRows")?.addEventListener("click", async (event) => {
      const editButton = event.target.closest("[data-edit-id]");
      const deleteButton = event.target.closest("[data-delete-id]");
      const pdfButton = event.target.closest("[data-pdf-id]");

      if (editButton) {
        await loadCategories();
        await editPublication(editButton.dataset.editId);
      } else if (deleteButton) {
        await deletePublication(deleteButton.dataset.deleteId);
      } else if (pdfButton) {
        await openPdf(pdfButton.dataset.pdfId);
      }
    });

    $("menuToggle")?.addEventListener("click", () => {
      $("sidebar")?.classList.toggle("open");
    });

    window.addEventListener("epaper-page-open", loadPublications);

    loadCategories();
    loadPublications();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
