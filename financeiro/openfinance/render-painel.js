/**
 * Gera HTML do painel a partir de config JSON (CJS — usado pelas rotas API).
 */
const path = require("path");
const { pathToFileURL } = require("url");

async function renderPainelHtml(raw) {
  const financeiroDir = path.join(__dirname, "..");
  const { orcamentoFromRaw, fmtMoneyBR, escapeHtml } = await import(
    pathToFileURL(path.join(financeiroDir, "load-config.mjs")).href
  );
  const { buildHtmlPage } = await import(
    pathToFileURL(path.join(financeiroDir, "build-html-page.mjs")).href
  );
  const ctx = orcamentoFromRaw(raw);
  const geradoEm = raw.extrato?.syncedAt
    ? new Date(raw.extrato.syncedAt).toLocaleString("pt-BR")
    : new Date().toLocaleString("pt-BR");
  return buildHtmlPage(ctx, geradoEm, escapeHtml, fmtMoneyBR);
}

module.exports = { renderPainelHtml };
