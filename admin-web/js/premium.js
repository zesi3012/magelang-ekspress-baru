
(function () {
  "use strict";

  const config = window.ADMIN_CONFIG;
  const $ = (id) => document.getElementById(id);

  const tableBody = () => $("premiumPlanRows");
  const notice = () => $("premiumNotice");

  let client = null;
  let loading = false;
  let saving = false;

  function getClient() {
    if (client) return client;

    if (
      !config ||
      !config.SUPABASE_URL ||
      !config.SUPABASE_PUBLISHABLE_KEY ||
      !window.supabase
    ) {
      throw new Error(
        "Konfigurasi Supabase tidak ditemukan. Periksa js/config.js."
      );
    }

    client = window.supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_PUBLISHABLE_KEY
    );

    return client;
  }

  function showNotice(type, message) {
    const el = notice();
    if (!el) return;

    el.className = "notice is-visible" + (type ? " " + type : "");
    el.textContent = message;
  }

  function formatRupiah(value) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function render(plans) {
    const tbody = tableBody();
    if (!tbody) return;

    if (!plans.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <strong>Belum ada paket Premium</strong>
              Klik Tambah Paket untuk membuat paket langganan pertama.
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = plans.map((plan) => {
      const active = plan.is_active === true;

      return `
        <tr>
          <td>
            <strong class="table-title">${escapeHtml(plan.name)}</strong>
          </td>
          <td>
            ${plan.billing_period === "monthly" ? "Bulanan" :
              plan.billing_period === "yearly" ? "Tahunan" :
              escapeHtml(plan.billing_period)}
          </td>
          <td>${Number(plan.duration_days) || 0} hari</td>
          <td><strong>${formatRupiah(plan.price_idr)}</strong></td>
          <td>
            <span class="status ${active ? "status-active" : "status-inactive"}">
              ${active ? "Aktif" : "Nonaktif"}
            </span>
          </td>
          <td>
            <div class="table-actions">
              <button
                class="icon-btn"
                type="button"
                data-action="edit"
                data-id="${escapeHtml(plan.id)}"
              >Edit</button>
              <button
                class="icon-btn"
                type="button"
                data-action="delete"
                data-id="${escapeHtml(plan.id)}"
                style="color:#c0392b;border-color:#f0d3d0"
              >Hapus</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadPlans() {
    if (loading) return;

    const tbody = tableBody();
    const refreshButton = $("refreshPremiumPlans");

    loading = true;

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = "Memuat...";
    }

    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="6">Memuat data paket Premium...</td></tr>
      `;
    }

    try {
      const supabase = getClient();

      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, billing_period, duration_days, price_idr, is_active")
        .order("price_idr", { ascending: true });

      if (error) throw error;

      render(data || []);
      showNotice(
        "success",
        `Berhasil memuat ${(data || []).length} paket langganan.`
      );
    } catch (error) {
      console.error("Gagal memuat paket Premium:", error);

      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="empty-state">
                <strong>Data paket gagal dimuat</strong>
                Periksa izin akses Supabase dan Console browser.
              </div>
            </td>
          </tr>
        `;
      }

      showNotice("error", error.message || "Gagal memuat paket Premium.");
    } finally {
      loading = false;

      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = "↻ Muat Ulang";
      }
    }
  }

  // ===== Modal tambah dan edit =====

  function openPlanModal(plan = null) {
    const modal = $("premiumPlanModal");
    const form = $("premiumPlanForm");

    if (!modal || !form) {
      showNotice(
        "error",
        "Modal tidak ditemukan. Periksa elemen premiumPlanModal di index.html."
      );
      return;
    }

    form.reset();

    $("premiumFormError").hidden = true;
    $("premiumFormError").textContent = "";

    $("premiumPlanId").value = plan ? plan.id : "";
    $("premiumModalTitle").textContent = plan
      ? "Edit Paket Premium"
      : "Tambah Paket Premium";

    $("savePremiumPlan").textContent = plan
      ? "Simpan Perubahan"
      : "Simpan Paket";

    $("premiumPlanName").value = plan?.name ?? "";
    $("premiumPlanPeriod").value = plan?.billing_period ?? "monthly";
    $("premiumPlanDuration").value = plan?.duration_days ?? 30;
    $("premiumPlanPrice").value = plan?.price_idr ?? "";
    $("premiumPlanActive").checked = plan
      ? plan.is_active === true
      : true;

    modal.hidden = false;
    document.body.style.overflow = "hidden";

    $("premiumPlanName").focus();
  }

  function closePlanModal() {
    const modal = $("premiumPlanModal");
    if (modal) modal.hidden = true;

    document.body.style.overflow = "";
  }

  function showFormError(message) {
    const error = $("premiumFormError");
    if (!error) return;

    error.textContent = message;
    error.hidden = false;
  }

  async function editPlan(id) {
    try {
      const supabase = getClient();

      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, billing_period, duration_days, price_idr, is_active")
        .eq("id", id)
        .single();

      if (error) throw error;

      openPlanModal(data);
    } catch (error) {
      console.error("Gagal mengambil paket:", error);
      showNotice("error", error.message || "Gagal mengambil data paket.");
    }
  }

  async function savePlan(event) {
    event.preventDefault();

    if (saving) return;

    const id = $("premiumPlanId").value;
    const name = $("premiumPlanName").value.trim();
    const billingPeriod = $("premiumPlanPeriod").value;
    const duration = Number($("premiumPlanDuration").value);
    const price = Number($("premiumPlanPrice").value);

    if (!name) {
      showFormError("Nama paket wajib diisi.");
      return;
    }

    if (!["monthly", "yearly"].includes(billingPeriod)) {
      showFormError("Pilih periode langganan yang valid.");
      return;
    }

    if (!Number.isSafeInteger(duration) || duration < 1) {
      showFormError("Durasi harus berupa bilangan bulat minimal 1 hari.");
      return;
    }

    if (!Number.isSafeInteger(price) || price < 0) {
      showFormError("Harga harus berupa bilangan bulat nol atau lebih.");
      return;
    }

    const payload = {
      name,
      billing_period: billingPeriod,
      duration_days: duration,
      price_idr: price,
      is_active: $("premiumPlanActive").checked
    };

    const saveButton = $("savePremiumPlan");
    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = "Menyimpan...";

    try {
      const supabase = getClient();
      let result;

      if (id) {
        result = await supabase
          .from("subscription_plans")
          .update(payload)
          .eq("id", id)
          .select("id")
          .single();
      } else {
        result = await supabase
          .from("subscription_plans")
          .insert(payload)
          .select("id")
          .single();
      }

      if (result.error) throw result.error;

      closePlanModal();

      showNotice(
        "success",
        id
          ? "Paket Premium berhasil diperbarui."
          : "Paket Premium berhasil ditambahkan."
      );

      await loadPlans();
    } catch (error) {
      console.error("Gagal menyimpan paket:", error);
      showFormError(
        error.message || "Terjadi kesalahan saat menyimpan paket."
      );
    } finally {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = id
        ? "Simpan Perubahan"
        : "Simpan Paket";
    }
  }

  async function deletePlan(id) {
    const confirmed = window.confirm(
      "Yakin ingin menghapus paket Premium ini? Tindakan ini tidak dapat dibatalkan."
    );

    if (!confirmed) return;

    try {
      const supabase = getClient();

      const { error } = await supabase
        .from("subscription_plans")
        .delete()
        .eq("id", id);

      if (error) throw error;

      showNotice("success", "Paket Premium berhasil dihapus.");
      await loadPlans();
    } catch (error) {
      console.error("Gagal menghapus paket:", error);
      showNotice("error", error.message || "Gagal menghapus paket.");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    $("addPremiumPlan")?.addEventListener("click", function () {
      openPlanModal();
    });

    $("refreshPremiumPlans")?.addEventListener("click", loadPlans);

    $("premiumPlanForm")?.addEventListener("submit", savePlan);

    $("closePremiumModal")?.addEventListener("click", closePlanModal);
    $("cancelPremiumModal")?.addEventListener("click", closePlanModal);

    $("premiumPlanModal")?.addEventListener("click", function (event) {
      if (event.target === this) closePlanModal();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !$("premiumPlanModal").hidden) {
        closePlanModal();
      }
    });

    tableBody()?.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const id = button.dataset.id;

      if (button.dataset.action === "edit") {
        editPlan(id);
      } else if (button.dataset.action === "delete") {
        deletePlan(id);
      }
    });

    window.addEventListener("premium-page-open", loadPlans);

    // Memuat daftar ketika halaman pertama kali dibuka.
    loadPlans();
  });
})();
