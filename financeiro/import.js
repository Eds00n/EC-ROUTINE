(function () {
  "use strict";

  var API_BASE =
    (typeof window !== "undefined" && window.__EC_API_BASE__) ||
    "https://ec-routine-api.onrender.com/api";

  var fileInput = document.getElementById("csv-file");
  var btnImport = document.getElementById("btn-import");
  var statusEl = document.getElementById("import-status");
  var loginBlock = document.getElementById("login-required");
  var uploadBlock = document.getElementById("upload-block");
  var pcBlock = document.getElementById("pc-instructions");

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "import-status" + (type ? " " + type : "");
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
  }

  function initAuth() {
    var token = getToken();
    showLoggedIn(!!token);
    if (!token) {
      setStatus("Faça login para importar o extrato pelo site.", "warn");
    }
  }

  if (pcBlock) {
    var toggle = document.getElementById("toggle-pc-help");
    if (toggle) {
      toggle.addEventListener("click", function (e) {
        e.preventDefault();
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

      btnImport.disabled = true;
      setStatus("A importar…", "");

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
          setStatus(json.error || "Erro ao importar (" + res.status + ")", "err");
          btnImport.disabled = false;
          return;
        }
        setStatus(
          (json.message || "Importado") +
            " — " +
            json.count +
            " lançamentos. A abrir painel…",
          "ok"
        );
        window.location.href = "/financeiro/painel.html?imported=1";
      } catch (e) {
        setStatus("Sem ligação à API. Verifique a internet ou tente mais tarde.", "err");
        btnImport.disabled = false;
      }
    });
  }

  initAuth();
})();
