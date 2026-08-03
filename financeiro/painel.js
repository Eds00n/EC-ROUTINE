(function () {
  "use strict";

  const mountEl = document.getElementById("fin-painel-mount");
  const loadingEl = document.getElementById("painel-loading");
  const STATIC_PAINEL = "/financeiro/Planilha_Orcamento.html";

  const API_BASE =
    (typeof window !== "undefined" && window.__EC_API_BASE__) ||
    "/api";

  function applyEcTheme() {
    try {
      if (localStorage.getItem("ecRoutineTheme") === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    } catch (_) {}
  }

  applyEcTheme();

  try {
    window.addEventListener("storage", function (e) {
      if (e.key === "ecRoutineTheme") applyEcTheme();
    });
  } catch (_) {}

  function getToken() {
    try {
      return localStorage.getItem("token");
    } catch (_) {
      return null;
    }
  }

  function helpActions() {
    return (
      '<a class="fin-btn fin-btn--secondary" href="/financeiro/index.html">Importar extrato</a>' +
      '<a class="fin-btn fin-btn--ghost" href="/dashboard.html">Dashboard</a>'
    );
  }

  function showError(msg, actionsHtml) {
    if (!mountEl) return;
    mountEl.innerHTML =
      '<div class="painel-loading err"><p>' +
      msg +
      "</p>" +
      (actionsHtml ? '<div class="painel-actions">' + actionsHtml + "</div>" : "") +
      "</div>";
  }

  function setLoading(text) {
    if (!mountEl) return;
    mountEl.innerHTML =
      '<div id="painel-loading" class="painel-loading">' + (text || "Carregando orçamento…") + "</div>";
  }

  function stripLegacyChrome(root) {
    if (!root) return;
    root.querySelectorAll("header.header, header.fin-header, header.fin-toolbar").forEach(function (el) {
      el.remove();
    });
    root.querySelectorAll("[style]").forEach(function (el) {
      var s = el.getAttribute("style") || "";
      if (/position\s*:\s*fixed/i.test(s)) el.remove();
    });
  }

  function mountPainelHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    document.title = doc.title || "Orçamento · EC ROUTINE";

    const page = doc.querySelector(".page");
    if (page && mountEl) {
      mountEl.innerHTML = "";
      stripLegacyChrome(page);
      mountEl.appendChild(document.importNode(page, true));
      return;
    }

    const legacyStyle = doc.querySelector("style");
    if (legacyStyle) {
      let el = document.getElementById("painel-styles-legacy");
      if (!el) {
        el = document.createElement("style");
        el.id = "painel-styles-legacy";
        document.head.appendChild(el);
      }
      el.textContent = legacyStyle.textContent;
    }

    if (mountEl) {
      const clone = doc.body.cloneNode(true);
      clone.querySelectorAll("header.header, header.fin-header, header.fin-toolbar").forEach(function (el) {
        el.remove();
      });
      mountEl.innerHTML = "";
      while (clone.firstChild) {
        mountEl.appendChild(clone.firstChild);
      }
    }
  }

  async function loadFromApi(token) {
    const res = await fetch(API_BASE + "/financeiro/painel?format=html", {
      cache: "no-store",
      headers: { Authorization: "Bearer " + token },
    });
    if (res.ok) {
      mountPainelHtml(await res.text());
      return true;
    }
    if (res.status === 404) {
      showError(
        "Ainda não há extrato importado. Em FINANCEIRO, envie o CSV do Nubank.",
        helpActions()
      );
      return true;
    }
    if (res.status === 401) {
      return false;
    }
    let err = "Erro ao carregar painel (" + res.status + ")";
    try {
      const j = await res.json();
      if (j.error) err = j.error;
    } catch (_) {}
    showError(err, helpActions());
    return true;
  }

  async function loadStaticPainel() {
    try {
      const res = await fetch(STATIC_PAINEL, { cache: "no-store" });
      if (res.ok) {
        mountPainelHtml(await res.text());
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function loadPainel() {
    setLoading("Carregando orçamento…");

    const token = getToken();
    if (token) {
      const done = await loadFromApi(token);
      if (done) return;
    }

    if (await loadStaticPainel()) return;

    showError(
      token
        ? "Painel indisponível. Importe o CSV em FINANCEIRO ou sincronize no PC."
        : "Faça login e importe o CSV em FINANCEIRO, ou gere o painel no PC (SINCRONIZAR_AUTOMATICO.bat).",
      helpActions()
    );
  }

  loadPainel();
})();
