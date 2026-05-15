/**
 * Grava extrato completo + opcionalmente atualiza valores do orçamento (financeiro/config.json).
 */
const fs = require("fs").promises;
const path = require("path");

async function applyToFinanceiroFiles(rootDir, ledger, opts = {}) {
  const financeRoot = path.join(rootDir, "financeiro");
  const configPath = path.join(financeRoot, "config.json");
  const lancPath = path.join(financeRoot, "lancamentos.json");

  const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
  const syncedAt = new Date().toISOString();

  raw.extrato = {
    fonte: opts.fonte || "pluggy",
    syncedAt,
    totalEntradas: ledger.totalEntradas,
    totalSaidas: ledger.totalSaidas,
    saldoReal: ledger.saldoReal,
    lancamentos: ledger.lancamentos,
  };

  if (opts.updateBudget !== false && ledger.sugestoes) {
    for (const [key, val] of Object.entries(ledger.sugestoes)) {
      if (raw.valores[key] !== undefined) raw.valores[key] = val;
    }
  }

  await fs.writeFile(configPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
  await fs.writeFile(
    lancPath,
    JSON.stringify(
      {
        syncedAt,
        ...ledger,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return { configPath, lancPath, extrato: raw.extrato };
}

module.exports = { applyToFinanceiroFiles };
