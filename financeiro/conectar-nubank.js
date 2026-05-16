(function () {
  const statusEl = document.getElementById("status");
  const btnConnect = document.getElementById("btnConnect");
  const btnSync = document.getElementById("btnSync");
  const btnLogin = document.getElementById("btnLogin");
  const loginHint = document.getElementById("loginHint");
  const originHint = document.getElementById("originHint");
  const updateBudget = document.getElementById("updateBudget");
  const sandboxCard = document.getElementById("sandboxCard");

  function isLocalDev() {
    const h = String(window.location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1";
  }

  function showSandboxHint(show) {
    if (sandboxCard) sandboxCard.style.display = show ? "block" : "none";
  }

  if (originHint) {
    originHint.textContent = window.location.origin || "http://localhost:3000";
  }

  function token() {
    return localStorage.getItem("token");
  }

  function apiRoot() {
    const base =
      (typeof window !== "undefined" && window.__EC_API_BASE__) ||
      window.location.origin.replace(/\/$/, "") + "/api";
    return String(base).replace(/\/$/, "");
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  async function api(path, options) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options && options.headers),
    };
    const t = token();
    if (t) headers.Authorization = "Bearer " + t;
    const res = await fetch(apiRoot() + "/financeiro" + path, {
      ...options,
      headers,
    });
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      data = {};
    }
    if (!res.ok) {
      let msg = data.error || res.statusText;
      if (data.hint) msg += " — " + data.hint;
      if (res.status === 401) msg = "Faça login no EC ROUTINE (botão abaixo).";
      if (res.status === 403) msg = "Sessão expirada — entre de novo.";
      if (res.status === 404) {
        const apiHost = apiRoot().replace(/\/api\/?$/i, "");
        const html404 = /Cannot GET/i.test(raw);
        msg = html404
          ? "A API em " +
            apiHost +
            " ainda não tem o módulo financeiro (deploy antigo). No Render: Manual Deploy do último commit + variáveis PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET."
          : "Rota financeiro não encontrada (404). Faça redeploy da API.";
      }
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function checkApiDeployed() {
    try {
      const res = await fetch(apiRoot() + "/financeiro/ping", {
        headers: { Accept: "application/json" },
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {}
      if (res.ok && data.ok && data.financeiro) return data;
      if (res.status === 404) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function showLoginRequired() {
    setStatus("Você precisa estar logado neste site (mesma URL do npm start).", "err");
    if (loginHint) loginHint.style.display = "block";
    if (btnLogin) btnLogin.style.display = "block";
    btnConnect.disabled = true;
    btnSync.disabled = true;
  }

  async function refreshStatus() {
    try {
      const ping = await checkApiDeployed();
      if (!ping) {
        const local =
          window.location.hostname === "localhost" &&
          window.location.port === "3000";
        setStatus(
          local
            ? "Servidor local sem rotas financeiro — reinicie npm start na pasta EC ROUTINE."
            : "API desatualizada (sem /financeiro). No Render: redeploy + Pluggy no Environment.",
          "err"
        );
        btnConnect.disabled = true;
        btnSync.disabled = true;
        return;
      }
      showSandboxHint(isLocalDev());
      if (!ping.pluggyConfigured && !isLocalDev()) {
        setStatus(
          "API no ar sem Pluggy. No Render, adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET e redeploy.",
          "err"
        );
        btnConnect.disabled = true;
        btnSync.disabled = true;
        return;
      }
      const s = await api("/status");
      if (!s.pluggyConfigured) {
        setStatus("Pluggy não configurado. Reinicie npm start após editar .env.", "err");
        btnConnect.disabled = true;
        btnSync.disabled = true;
        return;
      }
      if (!token() && !s.devBypass) {
        showLoginRequired();
        return;
      }
      if (loginHint) loginHint.style.display = "none";
      if (btnLogin) btnLogin.style.display = "none";
      const prefix = s.devBypass && !token() ? "Modo PC · " : "";
      if (s.connected) {
        const when = s.lastSyncAt
          ? " última sync " + new Date(s.lastSyncAt).toLocaleString("pt-BR")
          : "";
        setStatus(prefix + "Conta conectada." + when, "ok");
        btnConnect.textContent = "Reconectar conta";
        btnConnect.disabled = false;
        btnSync.disabled = false;
      } else {
        setStatus(
          prefix + (s.devBypass && !token()
            ? "Sem login EC ROUTINE. Pode conectar o banco."
            : "Pronto para conectar o Nubank."),
          "ok"
        );
        btnConnect.disabled = false;
        btnSync.disabled = true;
      }
    } catch (e) {
      if (!token()) showLoginRequired();
      else {
        setStatus(e.message || "Erro ao obter status", "err");
        btnConnect.disabled = true;
        btnSync.disabled = true;
      }
    }
  }

  async function saveConnection(itemId) {
    await api("/connection", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    });
    setStatus("Conta ligada. Sincronizando extrato…", "ok");
    btnSync.disabled = false;
    await doSync();
  }

  async function doSync() {
    btnSync.disabled = true;
    try {
      const data = await api("/sync", {
        method: "POST",
        body: JSON.stringify({ updateBudget: updateBudget.checked }),
      });
      setStatus(data.message || "Extrato sincronizado. Abrindo painel…", "ok");
      window.location.href = "/financeiro/painel.html?synced=1";
      return;
    } catch (e) {
      setStatus(e.message || "Falha na sincronização", "err");
    } finally {
      btnSync.disabled = false;
      refreshStatus();
    }
  }

  btnConnect.addEventListener("click", async function () {
    if (!token()) {
      try {
        const s = await api("/status");
        if (!s.devBypass) {
          setStatus("Login necessário.", "err");
          return;
        }
      } catch (e) {
        setStatus("Login necessário.", "err");
        return;
      }
    }
    if (typeof PluggyConnect === "undefined") {
      setStatus("Widget Pluggy não carregou. Verifique a internet.", "err");
      return;
    }
    btnConnect.disabled = true;
    if (isLocalDev()) {
      setStatus("Sandbox: no widget escolha Pluggy Bank (não Nubank real).", "ok");
    } else {
      setStatus("Abrindo Pluggy Connect…");
    }
    try {
      const { accessToken } = await api("/connect-token", { method: "POST", body: "{}" });
      const pluggyConnect = new PluggyConnect({
        connectToken: accessToken,
        includeSandbox: true,
        onSuccess: async function (itemData) {
          const itemId = itemData && (itemData.item && itemData.item.id ? itemData.item.id : itemData.itemId);
          if (!itemId) {
            setStatus("Conexão OK, mas itemId não veio na resposta.", "err");
            btnConnect.disabled = false;
            return;
          }
          try {
            await saveConnection(itemId);
          } catch (e) {
            setStatus(e.message || "Erro ao guardar conexão", "err");
          }
          btnConnect.disabled = false;
        },
        onError: function (error) {
          console.error("Pluggy Connect", error);
          const detail =
            error && (error.message || error.code || error.description)
              ? String(error.message || error.code || error.description)
              : "";
          const sandboxOnly =
            /sandbox|contas de teste|pluggy bank/i.test(detail) ||
            /sandbox|contas de teste|pluggy bank/i.test(
              error && error.data ? String(error.data.message || "") : ""
            );
          setStatus(
            sandboxOnly
              ? "Conta Pluggy de teste: escolha Pluggy Bank no widget (user-ok / password-ok). Nubank real só com produção na Pluggy."
              : detail
                ? "Pluggy: " + detail
                : "Conexão cancelada ou com erro no widget.",
            "err"
          );
          btnConnect.disabled = false;
        },
        onClose: function () {
          btnConnect.disabled = false;
          refreshStatus();
        },
      });
      pluggyConnect.init();
    } catch (e) {
      setStatus(e.message || "Não foi possível abrir o widget", "err");
      btnConnect.disabled = false;
    }
  });

  btnSync.addEventListener("click", doSync);

  refreshStatus();
})();
