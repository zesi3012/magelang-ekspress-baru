
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
    notice.style.display = "block";
    notice.style.background = type === "error" ? "#fee2e2" : "#dcfce7";
    notice.style.color = type === "error" ? "#991b1b" : "#166534";
  }

  function hideNotice() {
    const notice = $("categoryNotice");
    if (notice) notice.style.display = "none";
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
    $("categoryTotal").textContent = categories.length;
    $("categoryActive").textContent = categories.filter(
      (item) => item.is_active === true ||
        item.is_active === 1 ||
        item.is_active === "1"
    ).length;

    if (categories.length === 0) {
      rows.innerHTML = `
        <tr>
          <td colspan="5" style="padding:24px;text-align:center;color:#64748b;">
            Belum ada kategori. Klik Tambah Kategori untuk membuat kategori pertama.
          </td>
        </tr>`;
      return;
    }

    rows.innerHTML = categories.map((item, index) => {
      const active =
        item.is_active === true ||
        item.is_active === 1 ||
        item.is_active === "1";

      return `
        <tr style="border-top:1px solid #e2e8f0;">
          <td style="padding:12px;">${index + 1}</td>
          <td style="padding:12px;">
            <strong>${escapeHtml(item.name)}</strong>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">
              ${escapeHtml(item.description || "Tidak ada deskripsi")}
            </div>
          </td>
          <td style="padding:12px;">${escapeHtml(item.slug)}</td>
          <td style="padding:12px;">
            <span style="
              display:inline-block;
              padding:5px 9px;
              border-radius:20px;
              font-size:12px;
              background:${active ? "#dcfce7" : "#f1f5f9"};
              color:${active ? "#166534" : "#475569"};">
              ${active ? "Aktif" : "Nonaktif"}
            </span>
          </td>
          <td style="padding:12px;white-space:nowrap;">
            <button type="button" data-edit="${escapeHtml(item.id)}"
              style="padding:7px 10px;border:0;border-radius:6px;background:#dbeafe;color:#1d4ed8;cursor:pointer;">
              Edit
            </button>
            <button type="button" data-delete="${escapeHtml(item.id)}"
              style="padding:7px 10px;border:0;border-radius:6px;background:#fee2e2;color:#b91c1c;cursor:pointer;">
              Hapus
            </button>
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
