
(function () {
  "use strict";

  const config = window.ADMIN_CONFIG;
  const supabaseLib = window.supabase;

  const $ = (id) => document.getElementById(id);

  const rows = $("categoryRows");
  const form = $("categoryForm");

  if (!config || !supabaseLib || !rows || !form) {
    console.error("Konfigurasi atau elemen halaman Kategori belum tersedia.");
    return;
  }

  const apiBase = config.API_BASE_URL.replace(/\/+$/, "");
  const supabase = supabaseLib.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY
  );

  let categories = [];
  let slugEdited = false;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

function showNotice(message, type = "success") {
  const notice = $("categoryNotice");
  if (!notice) return;

  notice.textContent = message;
  notice.hidden = false;
  notice.style.display = "block";
  notice.style.padding = "12px 16px";
  notice.style.marginBottom = "16px";
  notice.style.borderRadius = "8px";
  notice.style.fontSize = "14px";
  notice.style.fontWeight = "500";
  notice.style.border = type === "error"
    ? "1px solid #fecaca"
    : "1px solid #bbf7d0";
  notice.style.background = type === "error" ? "#fef2f2" : "#f0fdf4";
  notice.style.color = type === "error" ? "#991b1b" : "#166534";
}

  function hideNotice() {
  const notice = $("categoryNotice");

  if (notice) {
    notice.hidden = true;
    notice.style.display = "none";
    notice.textContent = "";
  }
}

  async function request(path, options = {}) {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error("Gagal memeriksa sesi login.");
    }

    const headers = {
      "Accept": "application/json",
      "apikey": config.SUPABASE_PUBLISHABLE_KEY,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(data.session?.access_token
        ? { "Authorization": "Bearer " + data.session.access_token }
        : {}),
      ...(options.headers || {})
    };

    const response = await fetch(apiBase + path, {
      ...options,
      headers
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      throw new Error(
        payload.message ||
        payload.error ||
        `Permintaan gagal (HTTP ${response.status}).`
      );
    }

    return payload;
  }

  
function renderCategories() {
  const totalElement = $("categoryTotal");
  const activeElement = $("categoryActive");
  const searchElement = $("categorySearch");

  const keyword = (searchElement?.value || "").trim().toLowerCase();

  if (totalElement) {
    totalElement.textContent = categories.length;
  }

  if (activeElement) {
    activeElement.textContent = categories.filter((item) =>
      item.is_active === true ||
      item.is_active === 1 ||
      item.is_active === "1"
    ).length;
  }

  const filteredCategories = categories.filter((item) => {
    const searchableText = [
      item.name,
      item.slug,
      item.description
    ].join(" ").toLowerCase();

    return searchableText.includes(keyword);
  });

  if (filteredCategories.length === 0) {
    const message = categories.length === 0
      ? "Belum ada kategori. Klik Tambah Kategori untuk membuat kategori pertama."
      : "Kategori yang kamu cari tidak ditemukan.";

    rows.innerHTML = `
      <tr>
        <td colspan="5" style="padding:32px 16px;text-align:center;color:#758195;">
          <div style="font-weight:600;color:#344054;margin-bottom:6px;">
            ${categories.length === 0 ? "Belum Ada Kategori" : "Tidak Ada Hasil"}
          </div>
          ${escapeHtml(message)}
        </td>
      </tr>`;
    return;
  }

  rows.innerHTML = filteredCategories.map((item, index) => {
    const active =
      item.is_active === true ||
      item.is_active === 1 ||
      item.is_active === "1";

    return `
      <tr>
        <td>${index + 1}</td>

        <td>
          <div class="category-name-cell">
            <strong>${escapeHtml(item.name || "-")}</strong>
            <span>${escapeHtml(item.description || "Tidak ada deskripsi")}</span>
          </div>
        </td>

        <td>
          <code class="category-slug">${escapeHtml(item.slug || "-")}</code>
        </td>

        <td>
          <span class="category-status ${active ? "is-active" : "is-inactive"}">
            <span class="category-status-dot"></span>
            ${active ? "Aktif" : "Nonaktif"}
          </span>
        </td>

        <td>
          <div class="category-actions">
            <button
              type="button"
              class="category-action-btn edit"
              data-edit="${escapeHtml(item.id)}"
              aria-label="Edit kategori ${escapeHtml(item.name)}">
              Edit
            </button>

            <button
              type="button"
              class="category-action-btn delete"
              data-delete="${escapeHtml(item.id)}"
              aria-label="Hapus kategori ${escapeHtml(item.name)}">
              Hapus
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");
}


  async function loadCategories() {
    rows.innerHTML = `
      <tr><td colspan="5" style="padding:20px;text-align:center;">
        Memuat kategori...
      </td></tr>`;

    try {
      const payload = await request("/categories");
      if (!Array.isArray(payload.data)) {
        throw new Error("Format data kategori dari API tidak sesuai.");
      }

      categories = payload.data;
      renderCategories();
    } catch (error) {
      console.error("Gagal memuat kategori:", error);
      rows.innerHTML = `
        <tr><td colspan="5" style="padding:20px;color:#b91c1c;">
          ${escapeHtml(error.message)}
        </td></tr>`;
    }
  }

  function openForm(category = null) {
    hideNotice();
    form.reset();
    slugEdited = false;

    $("categoryId").value = category?.id ?? "";
    $("categoryFormTitle").textContent = category
      ? "Edit Kategori"
      : "Tambah Kategori";

    $("categoryName").value = category?.name ?? "";
    $("categorySlug").value = category?.slug ?? "";
    $("categoryDescription").value = category?.description ?? "";

    slugEdited = Boolean(category);
    $("categoryFormPanel").style.display = "block";
    $("categoryFormPanel").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    $("categoryName").focus();
  }

  function closeForm() {
    $("categoryFormPanel").style.display = "none";
    form.reset();
    slugEdited = false;
  }

  $("addCategoryBtn").addEventListener("click", () => openForm());
  $("cancelCategoryBtn").addEventListener("click", closeForm);
  $("cancelCategoryForm").addEventListener("click", closeForm);
  $("refreshCategoriesBtn").addEventListener("click", loadCategories);

  $("categoryName").addEventListener("input", () => {
    if (slugEdited) return;

    $("categorySlug").value = $("categoryName").value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });

  $("categorySlug").addEventListener("input", () => {
    $("categorySearch").addEventListener("input", renderCategories);
    slugEdited = true;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideNotice();

    const id = $("categoryId").value;
    const name = $("categoryName").value.trim();
    const slug = $("categorySlug").value.trim();
    const description = $("categoryDescription").value.trim();

    if (!name || !slug) {
      showNotice("Nama kategori dan slug wajib diisi.", "error");
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      showNotice(
        "Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung.",
        "error"
      );
      return;
    }

    const saveButton = $("saveCategoryBtn");
    saveButton.disabled = true;
    saveButton.textContent = "Menyimpan...";

    try {
      const payload = { name, slug, description };
      const path = id ? `/categories/${encodeURIComponent(id)}` : "/categories";

      await request(path, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });

      closeForm();
      await loadCategories();
      showNotice(id
        ? "Kategori berhasil diperbarui."
        : "Kategori berhasil ditambahkan.");
    } catch (error) {
      console.error("Gagal menyimpan kategori:", error);
      showNotice(error.message, "error");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Simpan";
    }
  });

  rows.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");

    if (editButton) {
      const category = categories.find(
        (item) => String(item.id) === editButton.dataset.edit
      );

      if (category) openForm(category);
      return;
    }

    if (deleteButton) {
      const id = deleteButton.dataset.delete;
      const category = categories.find(
        (item) => String(item.id) === id
      );

      if (!category) return;

      const confirmed = window.confirm(
        `Yakin ingin menghapus kategori "${category.name}"?`
      );

      if (!confirmed) return;

      try {
        await request(`/categories/${encodeURIComponent(id)}`, {
          method: "DELETE"
        });

        await loadCategories();
        showNotice("Kategori berhasil dihapus.");
      } catch (error) {
        console.error("Gagal menghapus kategori:", error);
        showNotice(
          error.message +
          " Jika kategori sudah digunakan, nonaktifkan atau pertahankan kategori tersebut.",
          "error"
        );
      }
    }
  });

  loadCategories();
})();
