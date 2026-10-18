
(() => {
  "use strict";

  const config = window.ADMIN_CONFIG || {};
  const apiBase = (config.API_BASE_URL || "").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);

  let publications = [];
  let categories = [];
  let editingId = null;
  let isSaving = false;
  let supabaseClient = null;
  let initialized = false;

  if (
    window.supabase &&
    config.SUPABASE_URL &&
    config.SUPABASE_PUBLISHABLE_KEY
  ) {
    supabaseClient = window.supabase.createClient(
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
    })[char]);
  }

  function normalizeData(payload) {
    if (Array.isArray(payload?.data)) return payload.data;
    if (payload?.data && typeof payload.data === "object") {
      return [payload.data];
    }
    if (Array.isArray(payload)) return payload;
    return [];
  }

  function setNotice(type, title, message) {
    const box = $("epaperFormNotice") || $("globalNotice");
    if (!box) return;

    box.replaceChildren();
    box.className = "notice is-visible";

    if (type === "error") box.classList.add("error");

    const strong = document.createElement("strong");
    strong.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = message;

    box.append(strong, paragraph);
  }

  function clearNotice() {
    ["epaperFormNotice", "globalNotice"].forEach((id) => {
      const box = $(id);
      if (box) {
        box.classList.remove("is-visible", "error");
        box.replaceChildren();
      }
    });
  }

  async function getAccessToken() {
    if (!supabaseClient) {
      throw new Error(
        "Konfigurasi Supabase belum lengkap. Periksa js/config.js."
      );
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const token = data?.session?.access_token;
    if (!token) {
      throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
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

  function isPremium(item) {
    return item.is_premium === true ||
      item.is_premium === "true" ||
      item.is_premium === 1;
  }

  function getCategoryName(item) {
    return item.category_name ||
      item.category ||
      categories.find(
        (category) =>
          String(category.id) === String(item.category_id)
      )?.name ||
      "Tanpa kategori";
  }

  // =====================================================
  // KATEGORI
  // =====================================================

  async function loadCategories() {
    try {
      const payload = await apiRequest("/categories");
      categories = normalizeData(payload);

      const select = $("epaperCategory");
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

      if (
        [...select.options].some(
          (option) => option.value === previousValue
        )
      ) {
        select.value = previousValue;
      }

      if (categories.length === 0) {
        setNotice(
          "error",
          "Kategori belum tersedia",
          "Tambahkan kategori terlebih dahulu sebelum membuat edisi."
        );
      }
    } catch (error) {
      console.error("Gagal memuat kategori:", error);
      setNotice("error", "Kategori gagal dimuat", error.message);
    }
  }

  // =====================================================
  // TABEL E-PAPER
  // =====================================================

  function renderPublications() {
    const container = $("epaperListContainer");
    if (!container) return;

    const term = ($("epaperSearch")?.value || "").trim().toLowerCase();

    const filtered = publications.filter((item) => {
      const searchable = [
        item.title,
        item.publisher,
        getCategoryName(item)
      ].join(" ").toLowerCase();

      return searchable.includes(term);
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>${publications.length
            ? "Edisi tidak ditemukan"
            : "Belum ada data E-Paper"}</strong>
          ${publications.length
            ? "Coba kata kunci pencarian yang berbeda."
            : "Klik Tambah Edisi untuk menambahkan koran digital."}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Judul Edisi</th>
              <th>Penerbit</th>
              <th>Tanggal Terbit</th>
              <th>Akses</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((item) => {
              const premium = isPremium(item);
              const published = item.status === "published";
              const hasPdf = Boolean(item.pdf_url);

              return `
                <tr>
                  <td>
                    <div class="table-title">
                      ${escapeHtml(item.title || "Tanpa judul")}
                    </div>
                    <div class="table-subtitle">
                      ${escapeHtml(getCategoryName(item))}
                    </div>
                  </td>
                  <td>${escapeHtml(item.publisher || "—")}</td>
                  <td>${escapeHtml(formatDate(item.publication_date))}</td>
                  <td>
                    <span class="role-badge">
                      ${premium ? "Premium" : "Gratis"}
                    </span>
                  </td>
                  <td>
                    <span class="status ${
                      published ? "status-published" : "status-draft"
                    }">
                      ${published ? "Terbit" : "Draft"}
                    </span>
                  </td>
                  <td>
                    <div class="table-actions">
                      <button type="button" class="icon-btn"
                        data-action="edit"
                        data-id="${escapeHtml(item.id)}">Edit</button>
                      <button type="button" class="icon-btn"
                        data-action="delete"
                        data-id="${escapeHtml(item.id)}">Hapus</button>
                      <button type="button" class="icon-btn"
                        data-action="pdf"
                        data-id="${escapeHtml(item.id)}"
                        ${hasPdf ? "" : "disabled"}>PDF</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div style="padding:12px 19px;color:#8293a5;font-size:11px;">
        Menampilkan ${filtered.length} dari ${publications.length} edisi.
      </div>
    `;
  }

  async function loadPublications() {
    const container = $("epaperListContainer");
    const button = $("refreshEpaper");

    if (button) {
      button.disabled = true;
      button.textContent = "Memuat...";
    }

    if (container) {
      container.innerHTML = `
        <div class="empty-state">Memuat data E-Paper...</div>
      `;
    }

    try {
      const payload = await apiRequest("/admin/publications");
      publications = normalizeData(payload);
      renderPublications();

      console.info(
        `Berhasil memuat ${publications.length} edisi E-Paper.`
      );
    } catch (error) {
      console.error("Gagal memuat E-Paper:", error);

      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <strong>Gagal memuat data E-Paper</strong>
            ${escapeHtml(error.message)}
          </div>
        `;
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "↻ Muat Ulang";
      }
    }
  }

  // =====================================================
  // FORM TAMBAH / EDIT
  // =====================================================

  function openForm(item = null) {
    const panel = $("epaperFormPanel");
    const form = $("epaperForm");

    if (!panel || !form) return;

    editingId = item?.id ?? null;
    form.reset();

    $("epaperFormTitle").textContent = editingId
      ? "Edit Edisi"
      : "Tambah Edisi";

    $("epaperTitle").value = item?.title || "";
    $("epaperPublisher").value =
      item?.publisher || "Magelang Ekspress";
    $("epaperDate").value =
      String(item?.publication_date || "").slice(0, 10);
    $("epaperPremium").value = isPremium(item) ? "true" : "false";

    const categorySelect = $("epaperCategory");
    const categoryId = item?.category_id;

    if (categoryId != null) {
      categorySelect.value = String(categoryId);
    } else if (item?.category) {
      const matchingCategory = categories.find(
        (category) => category.name === item.category
      );

      categorySelect.value = matchingCategory
        ? String(matchingCategory.id)
        : "";
    } else {
      categorySelect.value = "";
    }

    $("epaperPdf").value = "";

    const help = $("epaperFormPanel").querySelector(".form-help");
    if (help) {
      help.textContent = item?.pdf_url
        ? "PDF lama tetap digunakan jika tidak memilih file pengganti."
        : "Pilih file PDF jika ingin menyertakan koran digital.";
    }

    panel.hidden = false;
    clearNotice();
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    $("epaperTitle").focus();
  }

  function closeForm() {
    const panel = $("epaperFormPanel");
    const form = $("epaperForm");

    if (panel) panel.hidden = true;
    if (form) form.reset();

    editingId = null;
    clearNotice();
  }

  // =====================================================
  // UPLOAD PDF
  // Endpoint ini harus tersedia di backend.
  // =====================================================

  async function uploadPdf(file) {
    if (!file) return null;

    if (!file.name.toLowerCase().endsWith(".pdf") ||
        file.type && file.type !== "application/pdf") {
      throw new Error("File yang dipilih harus berupa PDF.");
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

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.success === false) {
      throw new Error(
        payload?.message ||
        payload?.error ||
        `Upload PDF gagal (HTTP ${response.status}).`
      );
    }

    const path = payload?.data?.pdf_url;

    if (typeof path !== "string" || !path) {
      throw new Error("Respons server tidak berisi data.pdf_url.");
    }

    return path;
  }

  // =====================================================
  // SIMPAN
  // =====================================================

  async function savePublication(event) {
    event.preventDefault();

    if (isSaving) return;

    const form = $("epaperForm");
    if (!form || !form.reportValidity()) return;

    const title = $("epaperTitle").value.trim();
    const publisher = $("epaperPublisher").value.trim();
    const date = $("epaperDate").value;
    const categoryId = $("epaperCategory").value;
    const file = $("epaperPdf").files?.[0];

    if (!categoryId) {
      setNotice(
        "error",
        "Kategori wajib dipilih",
        "Pilih kategori sebelum menyimpan edisi."
      );
      return;
    }

    const existing = publications.find(
      (item) => String(item.id) === String(editingId)
    );

    if (!editingId && !file) {
      setNotice(
        "error",
        "File PDF belum dipilih",
        "Pilih PDF untuk edisi baru agar koran dapat dibaca."
      );
      return;
    }

    isSaving = true;

    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton?.textContent || "Simpan Edisi";

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Menyimpan...";
    }

    try {
      let pdfPath = existing?.pdf_url || null;

      if (file) {
        setNotice(
          "",
          "Mengunggah PDF",
          "Mohon tunggu hingga file selesai diunggah."
        );
        pdfPath = await uploadPdf(file);
      }

      const body = {
        title,
        publisher,
        publication_date: date,
        category_id: categoryId,
        is_premium: $("epaperPremium").value === "true",
        pdf_url: pdfPath
      };

      // Status lama dipertahankan saat edit.
      // Edisi baru dibuat sebagai draft.
      body.status = existing?.status || "draft";

      const path = editingId
        ? `/admin/publications/${encodeURIComponent(editingId)}`
        : "/admin/publications";

      await apiRequest(path, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(body)
      });

      closeForm();
      setNotice(
        "",
        "Berhasil",
        editingId
          ? "Perubahan edisi berhasil disimpan."
          : "Edisi baru berhasil ditambahkan."
      );

      await loadPublications();
    } catch (error) {
      console.error("Gagal menyimpan edisi:", error);
      setNotice("error", "Gagal menyimpan E-Paper", error.message);
    } finally {
      isSaving = false;

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  }

  // =====================================================
  // EDIT
  // =====================================================

  async function editPublication(id) {
    await loadCategories();

    const item = publications.find(
      (publication) => String(publication.id) === String(id)
    );

    if (!item) {
      setNotice("error", "Data tidak ditemukan", "Edisi tidak tersedia.");
      return;
    }

    openForm(item);
  }

  // =====================================================
  // HAPUS
  // =====================================================

  async function deletePublication(id) {
    const item = publications.find(
      (publication) => String(publication.id) === String(id)
    );

    if (!item) return;

    if (!window.confirm(
      `Yakin ingin menghapus edisi "${item.title}"?`
    )) {
      return;
    }

    try {
      await apiRequest(
        `/admin/publications/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );

      setNotice(
        "",
        "Edisi dihapus",
        "Data E-Paper berhasil dihapus."
      );

      await loadPublications();
    } catch (error) {
      console.error("Gagal menghapus edisi:", error);
      setNotice("error", "Gagal menghapus E-Paper", error.message);
    }
  }

  // =====================================================
  // BUKA PDF
  // =====================================================

  async function openPdf(id) {
    const item = publications.find(
      (publication) => String(publication.id) === String(id)
    );

    if (!item?.pdf_url) {
      setNotice(
        "error",
        "PDF tidak tersedia",
        "Edisi ini belum memiliki file PDF."
      );
      return;
    }

    const popup = window.open("about:blank", "_blank");

    if (!popup) {
      setNotice(
        "error",
        "Pop-up diblokir",
        "Izinkan pop-up untuk membuka PDF."
      );
      return;
    }

    try {
      const payload = await apiRequest(
        `/publications/${encodeURIComponent(id)}/pdf`
      );

      const url = payload?.data?.signed_url ||
        payload?.data?.url;

      if (!url) {
        throw new Error("Server tidak mengembalikan URL PDF.");
      }

      const parsed = new URL(url);

      if (parsed.protocol !== "https:") {
        throw new Error("URL PDF harus menggunakan HTTPS.");
      }

      popup.location.href = parsed.href;
    } catch (error) {
      if (!popup.closed) popup.close();

      console.error("Gagal membuka PDF:", error);
      setNotice("error", "PDF gagal dibuka", error.message);
    }
  }

  // =====================================================
  // EVENT
  // =====================================================

  function initialize() {
    if (initialized) return;
    initialized = true;

    $("addEpaperButton")?.addEventListener("click", async () => {
      await loadCategories();
      openForm();
    });

    $("cancelEpaperForm")?.addEventListener("click", closeForm);
    $("cancelEpaperFormBottom")?.addEventListener("click", closeForm);
    $("epaperForm")?.addEventListener("submit", savePublication);
    $("refreshEpaper")?.addEventListener("click", loadPublications);
    $("epaperSearch")?.addEventListener("input", renderPublications);

    $("epaperListContainer")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button || button.disabled) return;

      const id = button.dataset.id;

      if (button.dataset.action === "edit") {
        await editPublication(id);
      } else if (button.dataset.action === "delete") {
        await deletePublication(id);
      } else if (button.dataset.action === "pdf") {
        await openPdf(id);
      }
    });

    window.addEventListener("epaper-page-open", () => {
      loadCategories();
      loadPublications();
    });

    loadCategories();
    loadPublications();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();
