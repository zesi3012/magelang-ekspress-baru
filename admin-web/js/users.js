
(function () {
  "use strict";

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


async function apiRequest(path, options = {}) {
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error("Gagal memeriksa sesi login: " + error.message);
  }

  if (!data.session) {
    window.location.replace("login.html");
    throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
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

  // Baca respons sebagai teks dahulu agar respons kosong tidak
  // langsung menimbulkan error Unexpected end of JSON input.
  const responseText = await response.text();
  let result = null;

  if (responseText.trim() !== "") {
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Respons backend bukan JSON (HTTP ${response.status}). ` +
        `Periksa URL API atau error PHP. Respons: ` +
        responseText.slice(0, 250)
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      result?.message ||
      result?.error ||
      `Permintaan API gagal (HTTP ${response.status}).`
    );
  }

  if (result === null) {
    throw new Error(
      "Backend memberikan respons kosong. Periksa endpoint API."
    );
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

  function roleLabel(role) {
    return ({
      super_admin: "Super Admin",
      admin: "Admin",
      author: "Author"
    })[role] || role || "-";
  }

  function renderUsers() {
    const rows = $("usersRows");
    if (!rows) return;

    const search = ($("usersSearch")?.value || "").toLowerCase().trim();
    const role = $("usersRoleFilter")?.value || "";

    const filtered = users.filter((user) => {
      const searchable = [
        user.full_name,
        user.username,
        user.email
      ].join(" ").toLowerCase();

      return searchable.includes(search) && (!role || user.role === role);
    });

    if (!filtered.length) {
      rows.innerHTML =
        '<tr><td colspan="6">Tidak ada pengguna yang sesuai.</td></tr>';
    } else {
      rows.innerHTML = filtered.map((user) => {
        const active = user.is_active === true;

        return `
          <tr>
            <td>${escapeHtml(user.full_name || "-")}</td>
            <td>${escapeHtml(user.username || "-")}</td>
            <td>${escapeHtml(user.email || "-")}</td>
            <td>${escapeHtml(roleLabel(user.role))}</td>
            <td>${active ? "Aktif" : "Nonaktif"}</td>
            <td>
              <button type="button" class="outline-btn"
                data-edit-user="${escapeHtml(user.id)}">Edit</button>
              <button type="button" class="outline-btn"
                data-toggle-user="${escapeHtml(user.id)}"
                data-active="${active}">
                ${active ? "Nonaktifkan" : "Aktifkan"}
              </button>
            </td>
          </tr>`;
      }).join("");
    }

    if ($("usersCount")) {
      $("usersCount").textContent =
        `${filtered.length} pengguna ditampilkan dari ${users.length} akun.`;
    }
  }

  async function loadUsers() {
    const rows = $("usersRows");
    if (rows) {
      rows.innerHTML =
        '<tr><td colspan="6">Memuat data pengguna...</td></tr>';
    }

    try {
      const result = await apiRequest("/admin/users");
      users = Array.isArray(result.data)
        ? result.data
        : Array.isArray(result.users)
          ? result.users
          : [];

      renderUsers();
    } catch (error) {
      console.error("Gagal memuat pengguna:", error);
      if (rows) {
        rows.innerHTML =
          '<tr><td colspan="6">Data gagal dimuat.</td></tr>';
      }
      showNotice(error.message, true);
    }
  }

  async function addUser() {
    const full_name = prompt("Masukkan nama lengkap pengguna:");
    if (full_name === null) return;

    const username = prompt("Masukkan username:");
    if (username === null) return;

    const email = prompt("Masukkan email pengguna:");
    if (email === null) return;

    const password = prompt("Masukkan password awal pengguna:");
    if (password === null) return;

    const role = prompt(
      "Masukkan role: super_admin, admin, atau author",
      "author"
    );

    if (role === null) return;

    if (!["super_admin", "admin", "author"].includes(role)) {
      showNotice("Role tidak valid.", true);
      return;
    }

    if (!full_name.trim() || !username.trim() || !email.trim() || password.length < 8) {
      showNotice("Lengkapi data. Password minimal 8 karakter.", true);
      return;
    }

    try {
      await apiRequest("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: full_name.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          role
        })
      });

      showNotice("Pengguna berhasil ditambahkan.");
      await loadUsers();
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  async function editUser(id) {
    const user = users.find((item) => String(item.id) === String(id));
    if (!user) return;

    const full_name = prompt("Nama lengkap:", user.full_name || "");
    if (full_name === null) return;

    const username = prompt("Username:", user.username || "");
    if (username === null) return;

    const role = prompt(
      "Role: super_admin, admin, atau author",
      user.role || "author"
    );

    if (role === null) return;

    if (!["super_admin", "admin", "author"].includes(role)) {
      showNotice("Role tidak valid.", true);
      return;
    }

    try {
      await apiRequest(`/admin/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({
          full_name: full_name.trim(),
          username: username.trim(),
          role
        })
      });

      showNotice("Data pengguna berhasil diperbarui.");
      await loadUsers();
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  async function toggleUser(id, currentlyActive) {
    const action = currentlyActive ? "menonaktifkan" : "mengaktifkan";

    if (!confirm(`Yakin ingin ${action} akun ini?`)) return;

    try {
      await apiRequest(
        `/admin/users/${encodeURIComponent(id)}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ is_active: !currentlyActive })
        }
      );

      showNotice("Status akun berhasil diperbarui.");
      await loadUsers();
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  $("refreshUsersBtn")?.addEventListener("click", loadUsers);
  $("addUserBtn")?.addEventListener("click", addUser);
  $("usersSearch")?.addEventListener("input", renderUsers);
  $("usersRoleFilter")?.addEventListener("change", renderUsers);

  $("usersRows")?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-user]");
    const toggleButton = event.target.closest("[data-toggle-user]");

    if (editButton) {
      editUser(editButton.dataset.editUser);
    } else if (toggleButton) {
      toggleUser(
        toggleButton.dataset.toggleUser,
        toggleButton.dataset.active === "true"
      );
    }
  });

  window.addEventListener("users-page-open", loadUsers);
})();
