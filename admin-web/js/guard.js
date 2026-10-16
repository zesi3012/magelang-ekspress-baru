
(function () {
  document.body.style.visibility = "hidden";

  const config = window.ADMIN_CONFIG;

  if (!config || !window.supabase) {
    window.location.replace("login.html");
    return;
  }

  const client = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY
  );

  async function checkAdmin() {
    try {
      const { data, error } = await client.auth.getSession();

      if (error || !data.session) {
        window.location.replace("login.html");
        return;
      }

      const response = await fetch(
        config.API_BASE_URL + "/admin/me",
        {
          method: "GET",
          headers: {
            "Authorization": "Bearer " + data.session.access_token,
            "apikey": config.SUPABASE_PUBLISHABLE_KEY
          }
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        await client.auth.signOut();
        window.location.replace("login.html");
        return;
      }

      document.body.style.visibility = "visible";
    } catch (error) {
      console.error("Pemeriksaan admin gagal:", error);
      window.location.replace("login.html");
    }
  }

  checkAdmin();
})();
