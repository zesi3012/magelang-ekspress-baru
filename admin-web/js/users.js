
(function () {
  "use strict";
  console.log("users.js berhasil dijalankan");

  const config = window.ADMIN_CONFIG;

  if (!config || !window.supabase) {
    console.error("Konfigurasi Supabase tidak ditemukan.");
    return;
  }

  const client = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY
  );

  const $ = (id) => document.getElementById(id);

  let users = [];
  let editingUserId = null;

  async function apiRequest(path, options = {}) {
    const { data, error } = await client.auth.getSession();

    if (error) {
      throw new Error("Gagal memeriksa sesi: " + error.message);
    }

    if (!data.session) {
      window.location.replace("login.html");
      throw new Error("Sesi login tidak ditemukan.");
    }

    const baseUrl = String(config.API_BASE_URL || "").replace(/\/+$/, "");

    if (!baseUrl) {
      throw new Error("API_BASE_URL belum diatur di js/config.js.");
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${data.session.access_token}`,
        "apikey": config.SUPABASE_PUBLISHABLE_KEY,
        ...(options.headers || {})
      }
    });

    const responseText = await response.text();
    let result = null;

    if (responseText.trim()) {
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Respons backend bukan JSON (HTTP ${response.status}). ` +
          responseText.slice(0, 200)
        );
      }
    }

    if (!response.ok) {
      throw new Error(
        result?.message ||
        result?.error ||
        `Permintaan gagal (HTTP ${response.status}).`
      );
    }

    if (result === null) {
      throw new Error("Backend memberikan respons kosong.");
    }

    if (result.success === false) {
      throw new Error(result.message || "Permintaan API gagal.");
    }

    return result;
  }

  function showNotice(message, isError = false) {
    const notice = $("usersNotice");
    if (!notice) return;

    notice.textContent = message;
    notice.classList.toggle("is-error", isError);
    notice.style.display = "block";
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

  function isActive(user) {
    return user.is_active === true ||
      user.is_active === 1 ||
      user.is_active === "1" ||
      user.is_active === "true";
  }

  function roleLabel(role) {
    return ({
      super_admin: "Super Admin",
      admin: "Admin",
      author: "Author"
    })[role] || role || "-";
  }

  function updateStatistics() {
    const total = users.length;
    const active = users.filter(isActive).length;
    const admins = users.filter(
      user => ["admin", "super_admin"].includes(user.role)
    ).length;
    const authors = users.filter(user => user.role === "author").length;

    if ($("usersTotalCount")) {
      $("usersTotalCount").textContent = total;
    }

    if ($("usersActiveCount")) {
      $("usersActiveCount").textContent = active;
    }

    if ($("usersAdminCount")) {
      $("usersAdminCount").textContent = admins;
    }

    if ($("usersAuthorCount")) {
      $("usersAuthorCount").textContent = authors;
    }
  }

  function getFilteredUsers() {
    const search = ($("usersSearch")?.value || "")
      .toLowerCase()
      .trim();

    const role = $("usersRoleFilter")?.value || "";
    const status = $("usersStatusFilter")?.value || "";

    return users.filter(user => {
      const searchable = [
        user.full_name,
        user.username,
        user.email
      ].join(" ").toLowerCase();

      return searchable.includes(search) &&
        (!role || user.role === role) &&
        (!status || String(isActive(user)) === status);
    });
  }

  function renderUsers() {
    const container = $("usersListContainer");
    if (!container) return;

    const filtered = getFilteredUsers();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>Tidak ada pengguna yang ditemukan</strong>
          Coba ubah kata kunci pencarian atau filter yang digunakan.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama Lengkap</th>
              <th>Username</th>
              <th>Email</th>
              <th>Peran</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(user => {
              const active = isActive(user);
              const id = escapeHtml(user.id);

              return `
                <tr>
                  <td>${escapeHtml(user.full_name || "-")}</td>
                  <td>${escapeHtml(user.username || "-")}</td>
                  <td>${escapeHtml(user.email || "-")}</td>
                  <td>${escapeHtml(roleLabel(user.role))}</td>
                  <td>
                    <span class="pill ${active ? "published" : "draft"}">
                      ${active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td>
  <div class="actions">
    <button type="button" class="outline-btn"
      data-edit-user="${id}">Edit</button>
    <button type="button" class="outline-btn"
      data-toggle-user="${id}">
      ${active ? "Nonaktifkan" : "Aktifkan"}
    </button>
  </div>
</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        Menampilkan ${filtered.length} dari ${users.length} pengguna.
      </div>
    `;
  }

  async function loadUsers() {
  console.log("LOAD USERS DIPANGGIL");

  const container = $("usersListContainer");
  console.log("CONTAINER:", container);

    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>Memuat data pengguna...</strong>
          Mohon tunggu.
        </div>
      `;
    }

    try {
      const result = await apiRequest("/admin/users");

      const list = Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.users)
          ? result.users
          : null;

      if (!list) {
        throw new Error(
          "Format respons daftar pengguna tidak sesuai. Periksa respons GET /api/admin/users."
        );
      }

      users = list;
      updateStatistics();
      renderUsers();

      const notice = $("usersNotice");
      if (notice) {
        notice.textContent = "";
        notice.style.display = "none";
        notice.classList.remove("is-error");
      }
    } catch (error) {
      console.error("Gagal memuat pengguna:", error);

      if (container) {
        container.innerHTML = `
          <div class="empty-state">
            <strong>Data pengguna gagal dimuat</strong>
            Periksa pesan kesalahan di atas atau Console browser.
          </div>
        `;
      }

      showNotice(error.message, true);
    }
  }

  function openForm(user = null) {
    const form = $("userForm");
    const panel = $("userFormPanel");

    if (!form || !panel) return;

    editingUserId = user?.id || null;
    form.reset();

    $("userFormTitle").textContent = user
      ? "Edit Pengguna"
      : "Tambah Pengguna";

    $("userFullName").value = user?.full_name || "";
    $("userUsername").value = user?.username || "";
    $("userRole").value = user?.role || "author";
    $("userActive").value = String(
      user ? isActive(user) : true
    );
    $("userAvatar").value = user?.avatar_url || "";

    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeForm() {
    const panel = $("userFormPanel");
    if (panel) panel.hidden = true;

    editingUserId = null;
    $("userForm")?.reset();
  }

  async function saveUser(event) {
    event.preventDefault();

    const payload = {
      full_name: $("userFullName").value.trim(),
      username: $("userUsername").value.trim(),
      role: $("userRole").value,
      is_active: $("userActive").value === "true",
      avatar_url: $("userAvatar").value.trim() || null
    };

    if (!payload.full_name || !payload.username) {
      showNotice("Nama lengkap dan username wajib diisi.", true);
      return;
    }

    try {
      if (editingUserId) {
        await apiRequest(
          `/admin/users/${encodeURIComponent(editingUserId)}`,
          {
            method: "PUT",
            body: JSON.stringify(payload)
          }
        );

        showNotice("Data pengguna berhasil diperbarui.");
      } else {
        const email = window.prompt(
          "Masukkan email untuk akun pengguna baru:"
        );

        if (email === null) return;

        if (!email.trim()) {
          showNotice("Email wajib diisi.", true);
          return;
        }

        const password = window.prompt(
          "Buat kata sandi awal minimal 8 karakter:"
        );

        if (password === null) return;

        if (password.length < 8) {
          showNotice("Kata sandi minimal 8 karakter.", true);
          return;
        }

        await apiRequest("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            email: email.trim(),
            password
          })
        });

        showNotice("Pengguna berhasil ditambahkan.");
      }

      closeForm();
      await loadUsers();
    } catch (error) {
      console.error("Gagal menyimpan pengguna:", error);
      showNotice(error.message, true);
    }
  }

  async function editUser(id) {
    const user = users.find(item => String(item.id) === String(id));
    if (!user) return;

    openForm(user);
  }

  async function toggleUser(id) {
    const user = users.find(item => String(item.id) === String(id));
    if (!user) return;

    const active = isActive(user);
    const action = active ? "menonaktifkan" : "mengaktifkan";

    if (!window.confirm(
      `Yakin ingin ${action} akun ${user.full_name || user.username}?`
    )) {
      return;
    }

    try {
      await apiRequest(
        `/admin/users/${encodeURIComponent(id)}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ is_active: !active })
        }
      );

      showNotice("Status pengguna berhasil diperbarui.");
      await loadUsers();
    } catch (error) {
      console.error("Gagal mengubah status pengguna:", error);
      showNotice(error.message, true);
    }
  }

  $("refreshUsers")?.addEventListener("click", loadUsers);
  $("addUserButton")?.addEventListener("click", () => openForm());
  $("userForm")?.addEventListener("submit", saveUser);
  $("cancelUserForm")?.addEventListener("click", closeForm);
  $("cancelUserFormBottom")?.addEventListener("click", closeForm);

  $("usersSearch")?.addEventListener("input", renderUsers);
  $("usersRoleFilter")?.addEventListener("change", renderUsers);
  $("usersStatusFilter")?.addEventListener("change", renderUsers);

  $("usersListContainer")?.addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit-user]");
    const toggleButton = event.target.closest("[data-toggle-user]");

    if (editButton) {
      editUser(editButton.dataset.editUser);
    } else if (toggleButton) {
      toggleUser(toggleButton.dataset.toggleUser);
    }
  });

  // Dipanggil ketika halaman Pengguna dibuka.
  window.addEventListener("users-page-open", loadUsers);

  // Jika halaman Pengguna adalah halaman aktif saat skrip dijalankan.
  if ($("usersPage")?.classList.contains("active")) {
    loadUsers();
  }
})();
