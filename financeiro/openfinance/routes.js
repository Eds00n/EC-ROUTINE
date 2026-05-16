const express = require("express");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");
const multer = require("multer");
const pluggy = require("./pluggy-client");
const userStore = require("./user-store");
const { buildLedger, mapPluggyTransactions } = require("./ledger");
const { applyToFinanceiroFiles } = require("./apply-files");
const { renderPainelHtml } = require("./render-painel");
const fs = require("fs").promises;

function runPlanilhaOrcamento(rootDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["financeiro/gerar-planilha.mjs"],
      {
        cwd: rootDir,
        env: { ...process.env, PLANILHA_SKIP_AUTO_IMPORT: "1" },
        stdio: "ignore",
      }
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gerar-planilha saiu com código ${code}`));
    });
  });
}

function monthRange(anoMes) {
  const [y, m] = anoMes.split("-").map(Number);
  const from = `${anoMes}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${anoMes}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

function financeiroDevBypass() {
  return (
    process.env.FINANCEIRO_DEV_BYPASS === "1" &&
    process.env.NODE_ENV !== "production" &&
    process.env.NODE_ENV !== "test"
  );
}

function createFinanceiroAuth(authenticateToken) {
  return function financeiroAuth(req, res, next) {
    if (financeiroDevBypass()) {
      req.user = { id: "local-dev", email: "dev@local" };
      return next();
    }
    return authenticateToken(req, res, next);
  };
}

const CSV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_IMPORT_MAX_BYTES },
  fileFilter(req, file, cb) {
    const name = String(file.originalname || "").toLowerCase();
    const ok =
      name.endsWith(".csv") ||
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "text/plain";
    cb(ok ? null : new Error("Envie um ficheiro CSV exportado do Nubank"), ok);
  },
});

function csvUploadSingle(req, res, next) {
  csvUpload.single("file")(req, res, (err) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "CSV demasiado grande (máx. 5 MB)." });
    }
    if (err) return res.status(400).json({ error: err.message || "Upload inválido" });
    next();
  });
}

function createFinanceiroRouter({ rootDir, authenticateToken }) {
  const router = express.Router();
  const auth = createFinanceiroAuth(authenticateToken);

  /** Sem login — confirma se a API em produção tem o módulo financeiro. */
  router.get("/ping", (req, res) => {
    res.json({
      ok: true,
      financeiro: true,
      pluggyConfigured: pluggy.isConfigured(),
    });
  });

  function pluggyWebhookAuthorized(req) {
    const secret = String(process.env.PLUGGY_WEBHOOK_SECRET || "").trim();
    if (!secret) return true;
    const auth = String(req.headers.authorization || "").trim();
    return auth === secret || auth === `Bearer ${secret}`;
  }

  /** Pluggy exige HTTPS público (não localhost) para pedir produção. */
  router.get("/webhooks/pluggy", (req, res) => {
    res.json({
      ok: true,
      message: "Endpoint ativo. Configure POST com eventos Pluggy (event: all).",
    });
  });

  router.post("/webhooks/pluggy", (req, res) => {
    if (!pluggyWebhookAuthorized(req)) {
      return res.status(401).json({ error: "Webhook não autorizado" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    res.status(200).json({ received: true });
    setImmediate(() => {
      const tag = body.event || "unknown";
      const id = body.itemId || body.eventId || "";
      console.log("pluggy webhook", tag, id);
    });
  });

  router.get("/status", auth, async (req, res) => {
    try {
      const state = await userStore.loadUser(rootDir, req.user.id);
      res.json({
        pluggyConfigured: pluggy.isConfigured(),
        connected: Boolean(state.pluggyItemId && state.accountId),
        lastSyncAt: state.lastSyncAt || null,
        itemId: state.pluggyItemId || null,
        openFinance: true,
        provider: "pluggy",
        devBypass: financeiroDevBypass(),
      });
    } catch (e) {
      console.error("financeiro/status", e);
      res.status(500).json({ error: "Erro ao obter status financeiro" });
    }
  });

  router.post("/connect-token", auth, async (req, res) => {
    try {
      if (!pluggy.isConfigured()) {
        return res.status(503).json({
          error: "Open Finance não configurado no servidor",
          hint: "Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env (sandbox Pluggy)",
        });
      }
      const accessToken = await pluggy.createConnectToken(req.user.id);
      res.json({ accessToken });
    } catch (e) {
      console.error("financeiro/connect-token", e);
      res.status(500).json({ error: e.message || "Erro ao criar token de conexão" });
    }
  });

  router.post("/connection", auth, async (req, res) => {
    try {
      const { itemId } = req.body || {};
      if (!itemId) return res.status(400).json({ error: "itemId obrigatório" });

      const accounts = await pluggy.listAccounts(itemId);
      const account =
        accounts.find((a) => a.type === "BANK" && a.subtype === "CHECKING_ACCOUNT") ||
        accounts.find((a) => a.type === "BANK") ||
        accounts[0];

      if (!account) {
        return res.status(400).json({ error: "Nenhuma conta encontrada no item Pluggy" });
      }

      const state = await userStore.loadUser(rootDir, req.user.id);
      state.pluggyItemId = itemId;
      state.accountId = account.id;
      state.accountName = account.name;
      await userStore.saveUser(rootDir, req.user.id, state);

      res.json({
        ok: true,
        itemId,
        accountId: account.id,
        accountName: account.name,
      });
    } catch (e) {
      console.error("financeiro/connection", e);
      res.status(500).json({ error: e.message || "Erro ao guardar conexão" });
    }
  });

  router.post("/sync", auth, async (req, res) => {
    try {
      if (!pluggy.isConfigured()) {
        return res.status(503).json({ error: "Pluggy não configurado no .env" });
      }

      const state = await userStore.loadUser(rootDir, req.user.id);
      if (!state.accountId) {
        return res.status(400).json({
          error: "Conta não conectada",
          hint: "Abra /financeiro/conectar e autorize o Nubank",
        });
      }

      const configPath = path.join(rootDir, "financeiro", "config.json");
      const config = JSON.parse(await require("fs").promises.readFile(configPath, "utf8"));
      const anoMes = (req.body && req.body.anoMes) || config.anoMes;
      const { from, to } = monthRange(anoMes);

      const pluggyTx = await pluggy.listTransactions(state.accountId, from, to);
      const mapped = mapPluggyTransactions(pluggyTx);
      const ledger = buildLedger(mapped, anoMes);

      state.lastSyncAt = new Date().toISOString();
      state.lastLedger = {
        anoMes,
        count: ledger.count,
        totalEntradas: ledger.totalEntradas,
        totalSaidas: ledger.totalSaidas,
        saldoReal: ledger.saldoReal,
      };
      await userStore.saveUser(rootDir, req.user.id, state);

      const files = await applyToFinanceiroFiles(rootDir, ledger, {
        fonte: "pluggy",
        updateBudget: req.body?.updateBudget !== false,
        userId: req.user.id,
      });

      try {
        await runPlanilhaOrcamento(rootDir);
      } catch (genErr) {
        console.warn("financeiro/sync: planilha não regenerada", genErr.message);
      }

      res.json({
        ok: true,
        anoMes,
        ...ledger,
        files: files.configPath,
        message: `${ledger.count} lançamentos · saldo real R$ ${ledger.saldoReal.toFixed(2)}`,
      });
    } catch (e) {
      console.error("financeiro/sync", e);
      res.status(500).json({ error: e.message || "Erro na sincronização" });
    }
  });

  async function loadOrcamentoForUser(userId) {
    let raw = await userStore.loadOrcamento(rootDir, userId);
    if (raw) return raw;
    const configPath = path.join(rootDir, "financeiro", "config.json");
    try {
      return JSON.parse(await fs.readFile(configPath, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  router.post("/import", auth, csvUploadSingle, async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "Nenhum ficheiro CSV enviado" });
      }

      const importUrl = pathToFileURL(
        path.join(rootDir, "financeiro", "importar-nubank-csv.mjs")
      ).href;
      const { runNubankImportOnConfig } = await import(importUrl);

      let config = await loadOrcamentoForUser(req.user.id);
      if (!config) {
        const configPath = path.join(rootDir, "financeiro", "config.json");
        config = JSON.parse(await fs.readFile(configPath, "utf8"));
      } else {
        config = JSON.parse(JSON.stringify(config));
      }

      const anoMes =
        (req.body && String(req.body.anoMes || "").trim()) || config.anoMes;
      const csvText = req.file.buffer.toString("utf8");

      const result = runNubankImportOnConfig(config, {
        csvText,
        mes: anoMes,
        apply: true,
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.error || "Erro ao importar CSV" });
      }

      await userStore.saveOrcamento(rootDir, req.user.id, result.config);

      if (result.ledger) {
        const lancPath = path.join(
          userStore.financeDir(rootDir),
          `user-${req.user.id}-lancamentos.json`
        );
        await fs.mkdir(userStore.financeDir(rootDir), { recursive: true });
        await fs.writeFile(
          lancPath,
          JSON.stringify(
            { syncedAt: result.config.extrato.syncedAt, ...result.ledger },
            null,
            2
          ) + "\n",
          "utf8"
        );
      }

      const state = await userStore.loadUser(rootDir, req.user.id);
      state.lastSyncAt = result.config.extrato?.syncedAt || new Date().toISOString();
      await userStore.saveUser(rootDir, req.user.id, state);

      res.set("Cache-Control", "private, no-store");
      res.json({
        ok: true,
        anoMes: result.filterYm,
        count: result.count,
        changed: result.changed,
        message: `${result.count} lançamentos importados`,
        preview: result.preview,
      });
    } catch (e) {
      console.error("financeiro/import", e.message || e);
      res.status(500).json({ error: e.message || "Erro ao importar extrato" });
    }
  });

  router.get("/painel", auth, async (req, res) => {
    try {
      const raw = await loadOrcamentoForUser(req.user.id);
      if (!raw) {
        return res.status(404).json({
          error: "Nenhum orçamento sincronizado",
          hint: "Em FINANCEIRO, importe o CSV do Nubank ou sincronize no PC",
        });
      }

      const format = String(req.query.format || "html").toLowerCase();
      if (format === "json") {
        const loadConfigUrl = pathToFileURL(
          path.join(rootDir, "financeiro", "load-config.mjs")
        ).href;
        const { orcamentoFromRaw } = await import(loadConfigUrl);
        const state = await userStore.loadUser(rootDir, req.user.id);
        return res.json({
          ok: true,
          connected: Boolean(state.pluggyItemId && state.accountId),
          lastSyncAt: state.lastSyncAt || raw.extrato?.syncedAt || null,
          ...orcamentoFromRaw(raw),
        });
      }

      const html = await renderPainelHtml(raw);
      res.set("Cache-Control", "private, no-store");
      res.type("html").send(html);
    } catch (e) {
      console.error("financeiro/painel", e);
      res.status(500).json({ error: e.message || "Erro ao gerar painel" });
    }
  });

  router.get("/extrato", auth, async (req, res) => {
    try {
      const userLanc = path.join(
        userStore.financeDir(rootDir),
        `user-${req.user.id}-lancamentos.json`
      );
      let lancPath = userLanc;
      try {
        await fs.access(userLanc);
      } catch {
        lancPath = path.join(rootDir, "financeiro", "lancamentos.json");
      }
      const raw = await fs.readFile(lancPath, "utf8");
      res.json(JSON.parse(raw));
    } catch (e) {
      if (e.code === "ENOENT") {
        return res.status(404).json({ error: "Nenhum extrato sincronizado ainda" });
      }
      res.status(500).json({ error: "Erro ao ler extrato" });
    }
  });

  return router;
}

module.exports = { createFinanceiroRouter };
