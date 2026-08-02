(function () {
  "use strict";

  var API_BASE =
    (typeof window !== "undefined" && window.__EC_API_BASE__) ||
    "https://ec-routine-api.onrender.com/api";

  var fileInput = document.getElementById("csv-file");
  var fileNameEl = document.getElementById("csv-file-name");
  var fileZoneEl = document.getElementById("csv-file-zone");
  var btnImport = document.getElementById("btn-import");
  var statusEl = document.getElementById("import-status");
  var loginBlock = document.getElementById("login-required");
  var uploadBlock = document.getElementById("upload-block");
  var pcBlock = document.getElementById("pc-instructions");

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    var cls = "import-status";
    if (type) cls += " import-status--" + type;
    statusEl.className = cls;
  }

  function setLoading(loading) {
    if (btnImport) {
      btnImport.disabled = !!loading;
      btnImport.classList.toggle("is-loading", !!loading);
      btnImport.setAttribute("aria-busy", loading ? "true" : "false");
    }
    if (loading) {
      setStatus("A importar o extrato…", "loading");
    }
  }

  function getToken() {
    try {
      return localStorage.getItem("token");
    } catch (_) {
      return null;
    }
  }

  function showLoggedIn(show) {
    if (loginBlock) loginBlock.hidden = show;
    if (uploadBlock) uploadBlock.hidden = !show;
    if (show) {
      setStatus("", "");
    }
  }

  function initAuth() {
    var token = getToken();
    showLoggedIn(!!token);
    if (!token) {
      setStatus("Faça login para importar o extrato pelo site.", "warn");
    }
  }

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) {
        if (fileNameEl) {
          fileNameEl.hidden = true;
          fileNameEl.textContent = "";
        }
        if (fileZoneEl) fileZoneEl.classList.remove("fin-file__zone--has-file");
        return;
      }
      if (fileNameEl) {
        fileNameEl.textContent = file.name;
        fileNameEl.hidden = false;
      }
      if (fileZoneEl) fileZoneEl.classList.add("fin-file__zone--has-file");
      setStatus("Ficheiro pronto: " + file.name + ". Clique em Importar.", "");
    });
  }

  if (pcBlock) {
    var toggle = document.getElementById("toggle-pc-help");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var open = pcBlock.hidden;
        pcBlock.hidden = !open;
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  if (btnImport) {
    btnImport.addEventListener("click", async function () {
      var token = getToken();
      if (!token) {
        window.location.href = "/auth.html?next=" + encodeURIComponent("/financeiro/index.html");
        return;
      }
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        setStatus("Escolha o ficheiro CSV exportado do Nubank.", "err");
        return;
      }
      if (!/\.csv$/i.test(file.name)) {
        setStatus("Use o formato CSV (não PDF).", "err");
        return;
      }

      setLoading(true);

      var fd = new FormData();
      fd.append("file", file);

      try {
        var res = await fetch(API_BASE + "/financeiro/import", {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          body: fd,
        });
        var json = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) {
          var msg = json.error || "Não foi possível importar (" + res.status + ").";
          if (res.status === 404) {
            msg =
              "Serviço indisponível (404). Atualize a API na Render e tente de novo.";
          }
          setLoading(false);
          setStatus(msg, "err");
          return;
        }
        setStatus(
          (json.message || "Importado com sucesso") +
            " — " +
            json.count +
            " lançamentos. A abrir o painel…",
          "ok"
        );
        window.location.href = "/financeiro/painel.html?imported=1";
      } catch (e) {
        setLoading(false);
        setStatus("Sem ligação à internet. Verifique a rede e tente outra vez.", "err");
      }
    });
  }

  initAuth();
})();
