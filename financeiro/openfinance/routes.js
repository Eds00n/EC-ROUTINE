const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const pluggy = require("./pluggy-client");
const userStore = require("./user-store");
const { buildLedger, mapPluggyTransactions } = require("./ledger");
const { applyToFinanceiroFiles } = require("./apply-files");

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
    process.env.NODE_ENV !== "production"
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

function createFinanceiroRouter({ rootDir, authenticateToken }) {
  const router = express.Router();
  const auth = createFinanceiroAuth(authenticateToken);

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

  router.get("/extrato", auth, async (req, res) => {
    try {
      const lancPath = path.join(rootDir, "financeiro", "lancamentos.json");
      const raw = await require("fs").promises.readFile(lancPath, "utf8");
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
