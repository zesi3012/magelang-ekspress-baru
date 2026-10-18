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
  // MENAMPILKAN DAFTAR KATEGORI DI HALAMAN KATEGORI
  // =====================================================

  async function renderCategoriesPage() {
    const container = $("categoriesListContainer");
    if (!container) return;

    container.innerHTML = `
      <style>
        /* ================= SCOPED STYLES: KATEGORI ================= */
        #categoriesListContainer .cat-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        #categoriesListContainer .cat-header h2 {
          margin: 0 0 4px;
          font-size: 1.25rem;
          color: var(--ink, #111827);
        }
        #categoriesListContainer .cat-header p {
          margin: 0;
          color: #6b7280;
          font-size: 0.875rem;
        }
        #categoriesListContainer .cat-toolbar {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 18px;
        }
        #categoriesListContainer .cat-search {
          position: relative;
          flex: 1 1 260px;
          max-width: 420px;
        }
        #categoriesListContainer .cat-search svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          color: #9ca3af;
          pointer-events: none;
        }
        #categoriesListContainer .cat-search input {
          width: 100%;
          padding: 10px 12px 10px 36px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.875rem;
          background: #fff;
          transition: border-color .15s, box-shadow .15s;
          box-sizing: border-box;
        }
        #categoriesListContainer .cat-search input:focus {
          outline: none;
          border-color: var(--primary, #1d4ed8);
          box-shadow: 0 0 0 3px rgba(29,78,216,.12);
        }
        #categoriesListContainer .cat-table-wrap {
          width: 100%;
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid #f1f5f9;
        }
        #categoriesListContainer .cat-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.875rem;
          min-width: 720px;
        }
        #categoriesListContainer .cat-table thead th {
          text-align: left;
          padding: 12px 14px;
          background: #f9fafb;
          color: #374151;
          font-weight: 600;
          font-size: 0.75rem;
          letter-spacing: .04em;
          text-transform: uppercase;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }
        #categoriesListContainer .cat-table thead th:last-child {
          text-align: center;
        }
        #categoriesListContainer .cat-table tbody td {
          padding: 14px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
          color: #1f2937;
        }
        #categoriesListContainer .cat-table tbody tr:last-child td {
          border-bottom: none;
        }
        #categoriesListContainer .cat-table tbody tr:hover {
          background: #f8fafc;
        }
        #categoriesListContainer .cat-table tbody td.num {
          color: #9ca3af;
          font-variant-numeric: tabular-nums;
          width: 48px;
        }
        #categoriesListContainer .cat-table tbody td.actions-col {
          text-align: center;
          white-space: nowrap;
        }
        #categoriesListContainer .cell-name {
          font-weight: 600;
          color: #111827;
        }
        #categoriesListContainer .cell-desc {
          color: #4b5563;
          max-width: 340px;
          line-height: 1.5;
          white-space: normal;
          word-break: break-word;
        }
        #categoriesListContainer .cell-desc.is-empty {
          color: #9ca3af;
          font-style: italic;
        }
        #categoriesListContainer .slug-chip {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 6px;
          background: #eef2ff;
          color: #3730a3;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.78rem;
          word-break: break-all;
        }
        #categoriesListContainer .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
        }
        #categoriesListContainer .status-pill::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        #categoriesListContainer .status-pill.on {
          background: #ecfdf5;
          color: #047857;
        }
        #categoriesListContainer .status-pill.off {
          background: #fef2f2;
          color: #b91c1c;
        }
        #categoriesListContainer .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border-radius: 7px;
          border: 1px solid #e5e7eb;
          background: #fff;
          font-size: 0.78rem;
          font-weight: 500;
          cursor: pointer;
          transition: all .15s;
          font-family: inherit;
        }
        #categoriesListContainer .action-btn + .action-btn {
          margin-left: 6px;
        }
        #categoriesListContainer .action-btn svg {
          width: 13px;
          height: 13px;
        }
        #categoriesListContainer .action-btn.edit {
          color: #1d4ed8;
        }
        #categoriesListContainer .action-btn.edit:hover {
          background: #eff6ff;
          border-color: #bfdbfe;
        }
        #categoriesListContainer .action-btn.delete {
          color: #b91c1c;
        }
        #categoriesListContainer .action-btn.delete:hover {
          background: #fef2f2;
          border-color: #fecaca;
        }
        #categoriesListContainer .action-btn:disabled {
          opacity: .5;
          cursor: not-allowed;
        }
        #categoriesListContainer .empty-state {
          text-align: center;
          padding: 48px 24px;
          color: #6b7280;
        }
        #categoriesListContainer .empty-state svg {
          width: 48px;
          height: 48px;
          margin-bottom: 12px;
          color: #d1d5db;
        }
        #categoriesListContainer .empty-state h3 {
          margin: 0 0 6px;
          font-size: 1rem;
          color: #374151;
        }
        #categoriesListContainer .empty-state p {
          margin: 0 0 16px;
          font-size: 0.875rem;
        }
        #categoriesListContainer .table-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          padding-top: 14px;
          font-size: 0.8rem;
          color: #6b7280;
        }
        #categoriesListContainer .notice-box {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 0.875rem;
          margin-bottom: 16px;
          border: 1px solid transparent;
        }
        #categoriesListContainer .notice-box.success {
          background: #ecfdf5;
          color: #065f46;
          border-color: #a7f3d0;
        }
        #categoriesListContainer .notice-box.error {
          background: #fef2f2;
          color: #991b1b;
          border-color: #fecaca;
        }
        #categoriesListContainer .notice-box svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        /* ================= MODAL KATEGORI ================= */
        #categoryCrudModal {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(15, 23, 42, .5);
          backdrop-filter: blur(2px);
        }
        #categoryCrudModal[hidden] {
          display: none;
        }
        #categoryCrudModal .category-modal-content {
          width: 100%;
          max-width: 460px;
          background: #fff;
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,.25);
          animation: catModalIn .2s ease;
          max-height: 90vh;
          overflow-y: auto;
        }
        @keyframes catModalIn {
          from { opacity: 0; transform: translateY(12px) scale(.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        #categoryCrudModal .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 16px;
        }
        #categoryCrudModal .form-field label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: #374151;
        }
        #categoryCrudModal .form-field .hint {
          font-size: 0.75rem;
          color: #9ca3af;
          margin: 0;
        }
        #categoryCrudModal .form-field input,
        #categoryCrudModal .form-field textarea,
        #categoryCrudModal .form-field select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.875rem;
          font-family: inherit;
          color: #111827;
          background: #fff;
          box-sizing: border-box;
          transition: border-color .15s, box-shadow .15s;
        }
        #categoryCrudModal .form-field input:focus,
        #categoryCrudModal .form-field textarea:focus,
        #categoryCrudModal .form-field select:focus {
          outline: none;
          border-color: var(--primary, #1d4ed8);
          box-shadow: 0 0 0 3px rgba(29,78,216,.12);
        }
        #categoryCrudModal .form-field textarea {
          resize: vertical;
          min-height: 80px;
        }
        #categoryCrudModal .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
          padding-top: 16px;
          border-top: 1px solid #f1f5f9;
        }
      </style>

     
<div class="category-page-header">
  <div class="category-heading-copy">
    <span class="category-eyebrow">KONTEN & PUBLIKASI</span>
    <h2>Manajemen Kategori</h2>
    <p>Atur dan kelola kategori berita Magelang Ekspress.</p>
  </div>

  <button type="button" id="categoryAddButton" class="primary-btn">
    <span class="category-plus">+</span>
    Tambah Kategori
  </button>
</div>

        <div id="categoryCrudNotice" class="notice-box" hidden></div>

        <div class="cat-toolbar">
          <div class="cat-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round"
                 stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.5-3.5"></path>
            </svg>
            <input type="search" id="categoryTableSearch"
                   placeholder="Cari nama, slug, atau deskripsi..." />
          </div>

          <button type="button" id="categoryReloadButton" class="outline-btn">
            ↻ Muat Ulang
          </button>
        </div>

        <div class="cat-table-wrap">
          <table class="cat-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Nama Kategori</th>
                <th>Slug</th>
                <th>Deskripsi</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody id="categoryTableBody">
              <tr><td colspan="6" class="empty">Memuat kategori...</td></tr>
            </tbody>
          </table>
        </div>

        <div class="table-meta">
          <span id="categoryTableCount">Memuat data...</span>
          <span>Magelang Ekspress · Manajemen Kategori</span>
        </div>
      </div>

      <div id="categoryCrudModal" class="category-modal" hidden>
        <div class="category-modal-content" role="dialog" aria-modal="true">
          <div class="cat-header" style="margin-bottom:18px">
            <div>
              <h2 id="categoryCrudTitle">Tambah Kategori</h2>
              <p id="categoryCrudSubtitle">Isi detail kategori baru.</p>
            </div>
            <button type="button" id="categoryCrudCancel" class="icon-btn"
                    aria-label="Tutup">✕</button>
          </div>

          <form id="categoryCrudForm">
            <input type="hidden" id="categoryCrudId" />

            <div class="form-field">
              <label for="categoryCrudName">Nama kategori *</label>
              <input id="categoryCrudName" type="text" maxlength="100"
                     placeholder="Contoh: Berita Daerah" required />
              <p class="hint">Slug akan dibuat otomatis dari nama kategori.</p>
            </div>

            <div class="form-field">
              <label for="categoryCrudDescription">Deskripsi</label>
              <textarea id="categoryCrudDescription" rows="3"
                        placeholder="Deskripsi singkat kategori (opsional)"></textarea>
            </div>

            <div class="form-field">
              <label for="categoryCrudStatus">Status kategori</label>
              <select id="categoryCrudStatus">
                <option value="true">Aktif — ditampilkan di situs</option>
                <option value="false">Nonaktif — disembunyikan</option>
              </select>
            </div>

            <div class="modal-actions">
              <button type="button" id="categoryCrudCancelBottom"
                      class="outline-btn">Batal</button>
              <button type="submit" id="categoryCrudSave"
                      class="primary-btn">Simpan Kategori</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // ================== Element refs ==================
    const tbody   = $("categoryTableBody");
    const search  = $("categoryTableSearch");
    const modal   = $("categoryCrudModal");
    const form    = $("categoryCrudForm");
    const notice  = $("categoryCrudNotice");
    const saveBtn = $("categoryCrudSave");

    let catList = [];
    let noticeTimer = null;

    // ================== Helpers ==================
    function showNotice(message, isError = false) {
      clearTimeout(noticeTimer);
      const icon = isError
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <circle cx="12" cy="12" r="10"/>
             <line x1="12" y1="8" x2="12" y2="12"/>
             <line x1="12" y1="16" x2="12.01" y2="16"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
             <polyline points="22 4 12 14.01 9 11.01"/>
           </svg>`;

      notice.className = `notice-box ${isError ? "error" : "success"}`;
      notice.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
      notice.hidden = false;

      noticeTimer = setTimeout(() => { notice.hidden = true; }, 4500);
    }

    function statusPill(active) {
      return active
        ? `<span class="status-pill on">Aktif</span>`
        : `<span class="status-pill off">Nonaktif</span>`;
    }

    function renderRows() {
      const keyword = search.value.trim().toLowerCase();

      const filtered = catList.filter((item) =>
        [item.name, item.slug, item.description].some((value) =>
          String(value || "").toLowerCase().includes(keyword)
        )
      );

      $("categoryTableCount").textContent =
        `Menampilkan ${filtered.length} dari ${catList.length} kategori`;

      if (!filtered.length) {
        const isFiltering = keyword.length > 0;
        tbody.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
                </svg>
                <h3>${isFiltering ? "Kategori tidak ditemukan" : "Belum ada kategori"}</h3>
                <p>${isFiltering
                  ? "Coba kata kunci lain atau hapus filter pencarian."
                  : "Tambahkan kategori pertama untuk mulai mengelola konten."}</p>
                ${!isFiltering
                  ? `<button type="button" class="primary-btn" data-empty-add>
                       + Tambah Kategori
                     </button>`
                  : ``}
              </div>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map((item, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td>
            <div class="cell-name">${escapeHtml(item.name || "-")}</div>
          </td>
          <td>
            ${item.slug
              ? `<code class="slug-chip">${escapeHtml(item.slug)}</code>`
              : `<span style="color:#9ca3af">—</span>`}
          </td>
          <td>
            <div class="cell-desc ${item.description ? "" : "is-empty"}">
              ${escapeHtml(item.description || "Tidak ada deskripsi")}
            </div>
          </td>
          <td>${statusPill(Boolean(item.is_active))}</td>
          <td class="actions-col">
            <button type="button" class="action-btn edit"
                    data-edit-category="${escapeHtml(item.id)}"
                    title="Edit kategori">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
            <button type="button" class="action-btn delete"
                    data-delete-category="${escapeHtml(item.id)}"
                    data-category-name="${escapeHtml(item.name)}"
                    title="Hapus kategori">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
              Hapus
            </button>
          </td>
        </tr>
      `).join("");
    }

    async function fetchCategories() {
      tbody.innerHTML = `
        <tr><td colspan="6" class="empty">Memuat data kategori...</td></tr>
      `;

      try {
        const response = await apiRequest("/categories", { method: "GET" });
        catList = normalizeData(response);
        renderRows();
      } catch (error) {
        tbody.innerHTML = `
          <tr><td colspan="6" class="empty">Gagal memuat kategori.</td></tr>
        `;
        showNotice(error.message || "Gagal memuat kategori.", true);
      }
    }

    function openCatForm(category = null) {
      form.reset();

      const isEdit = Boolean(category);
      $("categoryCrudId").value = isEdit ? category.id : "";
      $("categoryCrudTitle").textContent =
        isEdit ? "Edit Kategori" : "Tambah Kategori";
      $("categoryCrudSubtitle").textContent =
        isEdit ? "Perbarui detail kategori." : "Isi detail kategori baru.";

      $("categoryCrudName").value = isEdit ? (category.name || "") : "";
      $("categoryCrudDescription").value =
        isEdit ? (category.description || "") : "";
      $("categoryCrudStatus").value =
        isEdit ? String(Boolean(category.is_active)) : "true";

      saveBtn.textContent = isEdit ? "Simpan Perubahan" : "Simpan Kategori";

      modal.hidden = false;
      document.body.style.overflow = "hidden";
      setTimeout(() => $("categoryCrudName").focus(), 50);
    }

    function closeCatForm() {
      modal.hidden = true;
      document.body.style.overflow = "";
    }

    // ================== Events ==================
    $("categoryAddButton").addEventListener("click", () => openCatForm());
    $("categoryReloadButton").addEventListener("click", fetchCategories);
    search.addEventListener("input", renderRows);
    $("categoryCrudCancel").addEventListener("click", closeCatForm);
    $("categoryCrudCancelBottom").addEventListener("click", closeCatForm);

    // Tutup modal saat klik backdrop
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeCatForm();
    });

    // Tutup modal dengan Esc
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape" && !modal.hidden) {
        closeCatForm();
      }
    });

    tbody.addEventListener("click", async (event) => {
      if (event.target.closest("[data-empty-add]")) {
        openCatForm();
        return;
      }

      const editButton   = event.target.closest("[data-edit-category]");
      const deleteButton = event.target.closest("[data-delete-category]");

      if (editButton) {
        const category = catList.find(
          (item) => String(item.id) === editButton.dataset.editCategory
        );
        if (category) openCatForm(category);
        return;
      }

      if (deleteButton) {
        const id = deleteButton.dataset.deleteCategory;
        const name = deleteButton.dataset.categoryName;

        if (!confirm(`Hapus kategori "${name}"?\n\nTindakan ini tidak dapat dibatalkan.`)) {
          return;
        }

        deleteButton.disabled = true;

        try {
          await apiRequest(`/categories/${encodeURIComponent(id)}`, {
            method: "DELETE"
          });

          showNotice(`Kategori "${name}" berhasil dihapus.`);
          await fetchCategories();
          await loadCategories();
        } catch (error) {
          showNotice(error.message || "Gagal menghapus kategori.", true);
          deleteButton.disabled = false;
        }
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const id = $("categoryCrudId").value;
      const name = $("categoryCrudName").value.trim();
      const description = $("categoryCrudDescription").value.trim();
      const is_active = $("categoryCrudStatus").value === "true";

      if (!name) {
        showNotice("Nama kategori wajib diisi.", true);
        $("categoryCrudName").focus();
        return;
      }

      saveBtn.disabled = true;
      const originalText = saveBtn.textContent;
      saveBtn.textContent = "Menyimpan...";

      try {
        await apiRequest(
          id ? `/categories/${encodeURIComponent(id)}` : "/categories",
          {
            method: id ? "PUT" : "POST",
            body: JSON.stringify({ name, description, is_active })
          }
        );

        closeCatForm();
        showNotice(
          id ? "Kategori berhasil diperbarui." : "Kategori berhasil ditambahkan."
        );
        await fetchCategories();
        await loadCategories();
      } catch (error) {
        showNotice(error.message || "Gagal menyimpan kategori.", true);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    });

    await fetchCategories();
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
  // STATISTIK DASHBOARD UTAMA
  // =====================================================

  async function loadDashboardStats() {
    const stats = [
      { id: "totalEpaper", path: "/admin/publications" },
      { id: "totalArticles", path: "/articles" },
      { id: "totalCategories", path: "/categories" }
    ];

    const results = await Promise.allSettled(
      stats.map((item) =>
        apiRequest(item.path, { method: "GET" })
      )
    );

    results.forEach((result, index) => {
      const element = $(stats[index].id);
      if (!element) return;

      if (result.status === "fulfilled") {
        element.textContent = normalizeData(result.value).length;
      } else {
        element.textContent = "—";
        console.error(
          `Gagal memuat statistik ${stats[index].id}:`,
          result.reason
        );
      }
    });
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
    loadDashboardStats();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  window.addEventListener(
    "categories-page-open",
    renderCategoriesPage
  );
})();