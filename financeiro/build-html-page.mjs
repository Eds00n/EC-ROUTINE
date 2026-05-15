/** Dashboard HTML — hierarquia: Saldo → Entradas/Gastos → Dívidas → Fluxo/Metas */

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

export function buildHtmlPage(ctx, geradoEm, escapeHtml, fmtMoneyBR) {
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
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orçamento pessoal · ${escapeHtml(mesRef)}</title>
  <style>
    * { box-sizing: border-box; }
    :root {
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 12px;
      --bg: #000000;
      --surface: #0a0a0a;
      --surface-2: #141414;
      --border: #262626;
      --text: #ffffff;
      --muted: #b8b8b8;
      --entrada: #22c55e;
      --saida: #ef4444;
      --glow-entrada: 0 0 6px rgba(34,197,94,0.45), 0 0 18px rgba(34,197,94,0.12);
      --glow-saida: 0 0 6px rgba(239,68,68,0.45), 0 0 18px rgba(239,68,68,0.12);
      --glow-muted: 0 0 4px rgba(184,184,184,0.25);
    }
    @keyframes barFill {
      from { width: 0; }
      to { width: var(--w); }
    }
    @keyframes neonPulse {
      0%, 100% { opacity: 0.88; }
      50% { opacity: 1; }
    }
    .bar-fill {
      display: block;
      height: 100%;
      border-radius: 2px;
      width: 0;
      animation: barFill 0.85s cubic-bezier(0.33, 1, 0.68, 1) forwards;
    }
    .bar-fill--entrada {
      background: var(--entrada);
      box-shadow: var(--glow-entrada);
      animation: barFill 0.85s cubic-bezier(0.33, 1, 0.68, 1) forwards, neonPulse 3s ease-in-out 0.9s infinite;
    }
    .bar-fill--saida {
      background: var(--saida);
      box-shadow: var(--glow-saida);
      animation: barFill 0.85s cubic-bezier(0.33, 1, 0.68, 1) forwards, neonPulse 3s ease-in-out 0.9s infinite;
    }
    .bar-fill--muted {
      background: var(--muted);
      box-shadow: var(--glow-muted);
      animation: barFill 0.85s cubic-bezier(0.33, 1, 0.68, 1) forwards;
    }
    @media (prefers-reduced-motion: reduce) {
      .bar-fill {
        width: var(--w) !important;
        animation: none !important;
      }
    }
    .neon-entrada { text-shadow: var(--glow-entrada); }
    .neon-saida { text-shadow: var(--glow-saida); }
    html, body { height: 100%; margin: 0; background: var(--bg); color: var(--text); overflow: hidden; }
    .page {
      height: 100vh;
      max-width: 900px;
      margin: 0 auto;
      padding: 0.45rem 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .top { flex-shrink: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
    .top h1 { margin: 0; font-size: 0.78rem; font-weight: 600; color: var(--muted); letter-spacing: 0.08em; text-transform: uppercase; }
    .top-meta { text-align: right; font-size: 0.62rem; color: var(--muted); line-height: 1.35; }
    .top-meta .ref { display: block; color: var(--text); font-weight: 600; }
    .hero {
      flex-shrink: 0;
      text-align: center;
      padding: 0.55rem 0.6rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: linear-gradient(180deg, var(--surface-2) 0%, var(--surface) 100%);
      box-shadow: 0 0 32px rgba(34,197,94,0.08);
    }
    .hero .label {
      display: block;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.2rem;
    }
    .hero .valor {
      font-size: 1.85rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--entrada);
      letter-spacing: -0.03em;
      text-shadow: var(--glow-entrada);
    }
    .hero .valor.neg { color: var(--saida); text-shadow: var(--glow-saida); }
    .hero .hint { margin: 0.25rem 0 0; font-size: 0.62rem; color: var(--muted); }
    .hero-bar {
      height: 4px;
      border-radius: 2px;
      background: var(--border);
      margin: 0.35rem auto 0;
      max-width: 280px;
      overflow: hidden;
      display: flex;
    }
    .kpi-duo { flex-shrink: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; }
    .kpi-card {
      padding: 0.45rem 0.5rem;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface);
      text-align: center;
    }
    .kpi-card .label {
      display: block;
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
      margin-bottom: 0.15rem;
    }
    .kpi-card .valor { font-size: 1.1rem; font-weight: 800; font-variant-numeric: tabular-nums; }
    .kpi-card--entrada {
      border-color: rgba(34,197,94,0.35);
      box-shadow: 0 0 12px rgba(34,197,94,0.08);
    }
    .kpi-card--entrada .valor { color: var(--entrada); text-shadow: var(--glow-entrada); }
    .kpi-card--gasto {
      border-color: rgba(239,68,68,0.35);
      box-shadow: 0 0 12px rgba(239,68,68,0.08);
    }
    .kpi-card--gasto .valor { color: var(--saida); text-shadow: var(--glow-saida); }
    .kpi-card details { margin-top: 0.25rem; text-align: left; }
    .kpi-card summary {
      font-size: 0.62rem;
      color: var(--muted);
      cursor: pointer;
      list-style: none;
    }
    .kpi-card summary:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; border-radius: 2px; }
    .kpi-card summary::-webkit-details-marker { display: none; }
    .kpi-card summary::after { content: " ▾"; }
    .kpi-card details[open] summary::after { content: " ▴"; }
    .mini-table { width: 100%; font-size: 0.62rem; margin-top: 0.2rem; border-collapse: collapse; }
    .mini-table td { padding: 0.08rem 0; border-bottom: 1px solid var(--border); color: var(--muted); }
    .mini-table td:last-child { text-align: right; font-weight: 600; }
    .mini-table tr.sub td { font-style: italic; font-size: 0.58rem; }
    .mini-table tr.total td { font-weight: 700; color: var(--text); border-top: 1px solid var(--border); }
    .meta-progress, .divida .bar {
      height: 3px;
      border-radius: 2px;
      background: var(--border);
      margin-top: 0.2rem;
      overflow: hidden;
    }
    .dividas {
      flex-shrink: 0;
      padding: 0.35rem 0.45rem;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--surface);
    }
    .dividas h2 {
      margin: 0 0 0.15rem;
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text);
      text-align: center;
    }
    .dividas-legend {
      margin: 0 0 0.3rem;
      font-size: 0.55rem;
      color: var(--muted);
      text-align: center;
    }
    .dividas-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.3rem; }
    .divida {
      padding: 0.35rem 0.3rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      text-align: center;
    }
    .divida .nome { display: block; font-size: 0.62rem; font-weight: 600; margin-bottom: 0.1rem; }
    .divida .valor {
      display: block;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--saida);
      font-variant-numeric: tabular-nums;
    }
    .divida .pct-label { font-size: 0.52rem; color: var(--muted); margin-top: 0.15rem; display: block; }
    .bottom { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 0.35rem; }
    .panel {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      padding: 0.3rem 0.4rem;
      overflow: hidden;
      min-height: 0;
    }
    .panel--fluxo {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .panel--fluxo::-webkit-scrollbar { display: none; width: 0; height: 0; }
    .fluxo-cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.2rem 0.35rem;
    }
    .fluxo-cols table { font-size: 0.56rem; line-height: 1.02; }
    .fluxo-cols td { padding: 0.04rem 0.15rem; }
    .panel h2 {
      margin: 0 0 0.15rem;
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--muted);
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.65rem; line-height: 1.2; }
    td { padding: 0.1rem 0.25rem; border-bottom: 1px solid var(--border); color: var(--muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
    .entrada { color: var(--entrada); }
    .saida { color: var(--saida); }
    .metas { list-style: none; margin: 0; padding: 0; font-size: 0.62rem; }
    .meta { display: flex; gap: 0.35rem; align-items: flex-start; padding: 0.25rem 0; border-bottom: 1px solid var(--border); }
    .meta:last-child { border: none; }
    .meta-icon {
      flex-shrink: 0;
      width: 1.1rem;
      height: 1.1rem;
      border-radius: 4px;
      font-size: 0.55rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.08);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .meta-body { flex: 1; min-width: 0; }
    .meta-text { color: var(--muted); line-height: 1.3; display: block; }
    .meta-text b { color: var(--text); }
    .meta-pct { font-size: 0.55rem; color: var(--muted); display: block; margin-top: 0.1rem; }
    .extrato-real {
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: rgba(255,255,255,0.02);
    }
    .extrato-real h2 { font-size: 0.7rem; margin: 0 0 0.35rem; font-weight: 700; }
    .extrato-kpis {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
      font-size: 0.58rem;
      color: var(--muted);
      margin-bottom: 0.35rem;
    }
    .extrato-kpis b { font-size: 0.62rem; }
    .extrato-count { opacity: 0.85; }
    .extrato-table { width: 100%; border-collapse: collapse; font-size: 0.58rem; }
    .extrato-table td { padding: 0.12rem 0.2rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .extrato-table td:first-child { width: 1.4rem; color: var(--muted); }
    .extrato-table td:nth-child(2) { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 768px) {
      html, body { overflow: auto; }
      .page { height: auto; min-height: 100vh; }
      .fluxo-cols { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .kpi-duo, .bottom, .dividas-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="top">
      <h1>Orçamento pessoal</h1>
      <div class="top-meta">
        <span class="ref">Referência: ${escapeHtml(mesRef)}</span>
        <time>Atualizado ${escapeHtml(geradoEm)}</time>
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
