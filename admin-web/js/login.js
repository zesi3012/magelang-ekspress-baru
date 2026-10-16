console.log("LOGIN.JS BERHASIL DIMUAT");

(function () {
  const config = window.ADMIN_CONFIG;
  const form = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const button = document.getElementById("loginButton");

  document.getElementById("year").textContent =
    new Date().getFullYear();

  function showMessage(text) {
    message.textContent = text;
    message.style.display = "block";
  }

  if (
    !config ||
    !config.SUPABASE_URL ||
    !config.SUPABASE_PUBLISHABLE_KEY ||
    !window.supabase
  ) {
    showMessage("Konfigurasi Supabase belum tersedia. Periksa js/config.js.");
    button.disabled = true;
    return;
  }

  const client = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY
  );

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    message.style.display = "none";
    button.disabled = true;
    button.textContent = "Memeriksa akun...";

    try {
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error("Sesi login tidak berhasil dibuat.");
      }

      window.location.href = "index.html";
    } catch (error) {
      console.error("Login gagal:", error);
      showMessage(
        error.message === "Invalid login credentials"
          ? "Email atau kata sandi salah."
          : error.message || "Login gagal. Silakan coba lagi."
      );
    } finally {
      button.disabled = false;
      button.textContent = "Masuk";
    }
  });

  console.log("EVENT LOGIN BERHASIL DIPASANG");
})();
