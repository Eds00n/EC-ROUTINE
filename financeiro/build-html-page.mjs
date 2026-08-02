/** Dashboard HTML — hierarquia: Saldo → Entradas/Gastos → Dívidas → Fluxo/Metas */

import { EC_THEME_BOOT_SCRIPT, EC_PAINEL_STYLES, finHeaderHtml } from "./financeiro-head.mjs";

function barFill(pct, variant, delaySec = 0) {
  const v = variant === "entrada" ? "entrada" : variant === "muted" ? "muted" : "saida";
  const delay = delaySec > 0 ? `;animation-delay:${delaySec}s` : "";
  return `<span class="bar-fill bar-fill--${v}" style="--w:${pct}%${delay}"></span>`;
}

function dividaCard(nome, valor, pctG, m, escapeHtml, delaySec = 0) {
  return `
        <div class="divida">
          <span class="nome">${escapeHtml(nome)}</span>
          <span class="valor neon-saida">${m(valor)}</span>
          <div class="bar" title="${pctG}% dos gastos">${barFill(pctG, "saida", delaySec)}</div>
          <span class="pct-label">${pctG}% dos gastos</span>
        </div>`;
}

function fluxoRow(f, m, escapeHtml) {
  return `<tr><td>${escapeHtml(f.dia)}</td><td>${escapeHtml(f.evento)}</td><td class="num ${f.entrada ? "entrada neon-entrada" : "saida neon-saida"}">${m(f.valor)}</td></tr>`;
}

function extratoSection(extrato, m, escapeHtml) {
  if (!extrato || !extrato.lancamentos?.length) return "";
  const saldoOk = extrato.saldoReal >= 0;
  const rows = extrato.lancamentos
    .slice(-12)
    .map(
      (r) =>
        `<tr><td>${escapeHtml(String(r.date).slice(8, 10) || r.date)}</td><td>${escapeHtml(r.desc)}</td><td class="num ${r.amount >= 0 ? "entrada neon-entrada" : "saida neon-saida"}">${m(r.amount)}</td></tr>`
    )
    .join("\n            ");
  const mais = extrato.lancamentos.length > 12 ? ` · +${extrato.lancamentos.length - 12} no extrato` : "";
  return `
    <section class="extrato-real" aria-label="Extrato real">
      <h2>Extrato real · ${escapeHtml(extrato.fonte || "banco")}${mais}</h2>
      <div class="extrato-kpis">
        <span>Entradas <b class="entrada neon-entrada">${m(extrato.totalEntradas)}</b></span>
        <span>Saídas <b class="saida neon-saida">${m(-extrato.totalSaidas)}</b></span>
        <span>Saldo <b class="${saldoOk ? "entrada neon-entrada" : "saida neon-saida"}">${m(extrato.saldoReal)}</b></span>
        <span class="extrato-count">${extrato.lancamentos.length} lançamentos</span>
      </div>
      <table class="extrato-table"><tbody>${rows}</tbody></table>
    </section>`;
}

export function buildHtmlPage(ctx, geradoEm, escapeHtml, fmtMoneyBR, options = {}) {
  const standalone = options.standalone !== false;
  const { vals: v, mesRef, fluxo, metas, emprestimo: emp, colchao, extrato } = ctx;
  const m = (n) => escapeHtml(fmtMoneyBR(n));
  const pctMotoG = Math.round((v.moto / v.totalDespesas) * 100);
  const pctEmpG = Math.round((v.emp / v.totalDespesas) * 100);
  const pctCartaoG = Math.round((v.cartao / v.totalDespesas) * 100);
  const saldoOk = v.saldo >= 0;
  const pctSobra =
    v.totalEntradas > 0 ? Math.round((v.saldo / v.totalEntradas) * 100) : 0;
  const saldoRealOk = extrato ? extrato.saldoReal >= 0 : saldoOk;
  const heroSaldo = extrato ? extrato.saldoReal : v.saldo;
  const heroLabel = extrato ? "Saldo real (extrato)" : "Saldo do mês";
  const heroHint = extrato
    ? `Orçamento planejado ${m(v.saldo)} · Entradas reais ${m(extrato.totalEntradas)} − Saídas ${m(extrato.totalSaidas)}`
    : `Entradas ${m(v.totalEntradas)} − Gastos ${m(v.totalDespesas)} · Sobra ${pctSobra}% das entradas`;
  const pctGastos =
    v.totalEntradas > 0
      ? Math.round((v.totalDespesas / v.totalEntradas) * 100)
      : 0;

  const fluxoMid = Math.ceil(fluxo.length / 2);
  const fluxoCol1 = fluxo
    .slice(0, fluxoMid)
    .map((f) => fluxoRow(f, m, escapeHtml))
    .join("\n              ");
  const fluxoCol2 = fluxo
    .slice(fluxoMid)
    .map((f) => fluxoRow(f, m, escapeHtml))
    .join("\n              ");

  const metasHtml = metas
    .map((meta) => {
      let progress = "";
      if (meta.titulo === "Empréstimo") {
        progress = `<div class="meta-progress" aria-hidden="true">${barFill(emp.pctParcelas, "entrada", 0.2)}</div><span class="meta-pct">${emp.parcelasPagas}/${emp.parcelasTotal} parcelas</span>`;
      } else if (meta.titulo === "Colchão") {
        progress = `<div class="meta-progress" aria-hidden="true">${barFill(colchao.pct, "entrada", 0.35)}</div><span class="meta-pct">${m(colchao.atual)} / ${m(colchao.meta)}</span>`;
      }
      return `<li class="meta">
          <span class="meta-icon">${escapeHtml(meta.icone)}</span>
          <span class="meta-body">
            <span class="meta-text"><b>${escapeHtml(meta.titulo)}:</b> ${escapeHtml(meta.texto)}</span>
            ${progress}
          </span>
        </li>`;
    })
    .join("\n          ");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  ${EC_THEME_BOOT_SCRIPT}
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orçamento pessoal · ${escapeHtml(mesRef)}</title>
  ${EC_PAINEL_STYLES}
</head>
<body class="${standalone ? "fin-painel-shell" : "fin-painel-fragment"}">
  ${standalone ? finHeaderHtml("painel") : ""}
  <div class="page">
    <header class="top">
      <p class="top-brand">EC ROUTINE</p>
      <div class="top-row">
        <h1>Orçamento pessoal</h1>
        <div class="top-meta">
          <span class="ref">Referência: ${escapeHtml(mesRef)}</span>
          <time>Atualizado ${escapeHtml(geradoEm)}</time>
        </div>
      </div>
    </header>

    <section class="hero" aria-label="${escapeHtml(heroLabel)}">
      <span class="label">${escapeHtml(heroLabel)}</span>
      <span class="valor${saldoRealOk ? "" : " neg"}">${m(heroSaldo)}</span>
      <p class="hint">${heroHint}</p>
      <div class="hero-bar" title="Gastos ${pctGastos}% · Sobra ${pctSobra}% das entradas" aria-hidden="true">
        ${barFill(pctGastos, "saida", 0)}
        ${barFill(pctSobra, "entrada", 0.15)}
      </div>
    </section>

    ${extratoSection(extrato, m, escapeHtml)}

    <section class="kpi-duo" aria-label="Entradas e gastos">
      <article class="kpi-card kpi-card--entrada">
        <span class="label">Entradas</span>
        <span class="valor">${m(v.totalEntradas)}</span>
        <details>
          <summary>Ver detalhes</summary>
          <table class="mini-table"><tbody>
            <tr><td>Salário</td><td class="entrada neon-entrada">${m(v.salLiq)}</td></tr>
            <tr><td>Pensão</td><td class="entrada neon-entrada">${m(v.pensao)}</td></tr>
            <tr><td>IFAL</td><td class="entrada neon-entrada">${m(v.auxilio)}</td></tr>
          </tbody></table>
        </details>
      </article>
      <article class="kpi-card kpi-card--gasto">
        <span class="label">Gastos</span>
        <span class="valor">${m(v.totalDespesas)}</span>
        <details>
          <summary>Ver composição</summary>
          <table class="mini-table"><tbody>
            <tr class="sub"><td colspan="2">Dívidas (seção abaixo)</td></tr>
            <tr><td>Moto + Empr. + Cartão</td><td class="saida neon-saida">${m(v.subtotalDividas)}</td></tr>
            <tr class="sub"><td colspan="2">Gastos fixos</td></tr>
            <tr><td>Faculdade</td><td class="saida neon-saida">${m(v.facul)}</td></tr>
            <tr><td>Gasolina</td><td class="saida neon-saida">${m(v.gas)}</td></tr>
            <tr><td>Outros</td><td class="saida neon-saida">${m(v.outros)}</td></tr>
            <tr class="total"><td>Total</td><td class="saida neon-saida">${m(v.totalDespesas)}</td></tr>
          </tbody></table>
        </details>
      </article>
      <article class="kpi-card kpi-card--sobra" aria-label="Sobra do mês">
        <span class="label">Sobra</span>
        <span class="valor${saldoOk ? "" : " neg"}">${m(v.saldo)}</span>
        <p class="kpi-sobra-hint">Entradas − Gastos</p>
      </article>
    </section>

    <section class="dividas" aria-label="Dívidas recorrentes">
      <h2>Dívidas recorrentes</h2>
      <p class="dividas-legend">% dos gastos do mês</p>
      <div class="dividas-grid">
        ${dividaCard("Moto", v.moto, pctMotoG, m, escapeHtml, 0.1)}
        ${dividaCard("Empréstimo", v.emp, pctEmpG, m, escapeHtml, 0.2)}
        ${dividaCard("Cartão", v.cartao, pctCartaoG, m, escapeHtml, 0.3)}
      </div>
    </section>

    <div class="bottom">
      <section class="panel panel--fluxo" aria-label="Fluxo do mês">
        <h2>Fluxo do mês · ${escapeHtml(mesRef)}</h2>
        <div class="fluxo-cols">
          <table><tbody>
              ${fluxoCol1}
          </tbody></table>
          <table><tbody>
              ${fluxoCol2}
          </tbody></table>
        </div>
      </section>
      <section class="panel" aria-label="Metas">
        <h2>Metas</h2>
        <ul class="metas">
          ${metasHtml}
        </ul>
      </section>
    </div>
  </div>
</body>
</html>`;
}
