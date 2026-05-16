(function () {
  const loadingEl = document.getElementById("painel-loading");
  const STATIC_PAINEL = "/financeiro/Planilha_Orcamento.html";

  const API_BASE =
    (typeof window !== "undefined" && window.__EC_API_BASE__) ||
    "https://ec-routine-api.onrender.com/api";

  function getToken() {
    try {
      return localStorage.getItem("token");
    } catch (_) {
      return null;
    }
  }

  function showError(msg, actionsHtml) {
    loadingEl.className = "painel-loading err";
    loadingEl.innerHTML =
      "<p>" + msg + "</p>" + (actionsHtml ? '<div class="painel-actions">' + actionsHtml + "</div>" : "");
  }

  function mountPainelHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const style = doc.querySelector("style");
    if (style) {
      let el = document.getElementById("painel-styles");
      if (!el) {
        el = document.createElement("style");
        el.id = "painel-styles";
        document.head.appendChild(el);
      }
      el.textContent = style.textContent;
    }
    document.title = doc.title || "Orçamento · EC ROUTINE";
    document.body.innerHTML = doc.body.innerHTML;

    const nav = document.createElement("div");
    nav.style.cssText =
      "position:fixed;top:0.5rem;right:0.5rem;z-index:9999;display:flex;gap:0.35rem;font-size:0.75rem;";
    nav.innerHTML =
      '<a href="/dashboard.html" style="color:#8b5cf6;text-decoration:none;padding:0.35rem 0.5rem;background:rgba(0,0,0,0.6);border-radius:6px;">Dashboard</a>' +
      '<a href="/financeiro/index.html" style="color:#9a9a9a;text-decoration:none;padding:0.35rem 0.5rem;background:rgba(0,0,0,0.6);border-radius:6px;">Importar CSV</a>';
    document.body.appendChild(nav);
  }

  function helpActions() {
    return (
      '<a class="secondary" href="index.html">Importar extrato</a>' +
      '<a class="secondary" href="../dashboard.html">Dashboard</a>'
    );
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
    loadingEl.className = "painel-loading";
    loadingEl.textContent = "Carregando painel…";

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
