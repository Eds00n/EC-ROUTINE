/**
 * Converte transações Pluggy/CSV em extrato (cada centavo) + sugestões de orçamento.
 */

const BUDGET_RULES = [
  { key: "emp", patterns: [/emprestimo/i, /parcela de empr/i], pick: "max", saida: true },
  { key: "cartao", patterns: [/fatura/i, /pagamento.*cart/i, /nu pay/i], pick: "max", saida: true },
  { key: "facul", patterns: [/estacio/i, /estácio/i, /faculdade/i, /editora/i], pick: "sum", saida: true },
  { key: "gas", patterns: [/posto/i, /gasolina/i, /shell/i, /ipiranga/i], pick: "sum", saida: true },
  { key: "salLiq", patterns: [/jovem aprendiz/i, /salario/i, /salário/i, /folha/i], pick: "max", entrada: true },
  { key: "pensao", patterns: [/pensao/i, /pensão/i], pick: "max", entrada: true },
  { key: "auxilio", patterns: [/ifal/i, /auxilio/i, /auxílio/i], pick: "max", entrada: true },
  { key: "moto", patterns: [/moto/i, /motocic/i], pick: "max", saida: true },
];

function normTx(raw) {
  const amount = Number(raw.amount);
  if (Number.isNaN(amount) || amount === 0) return null;
  const date = String(raw.date || raw.data || "").slice(0, 10);
  const desc =
    raw.description ||
    raw.descricao ||
    raw.desc ||
    (raw.merchant && raw.merchant.name) ||
    raw.title ||
    "";
  return { date, desc: String(desc).trim(), amount };
}

function buildLedger(transactions, filterYm) {
  const rows = [];
  for (const raw of transactions) {
    const t = normTx(raw);
    if (!t) continue;
    if (filterYm && !t.date.startsWith(filterYm)) continue;
    rows.push(t);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.desc.localeCompare(b.desc));

  let totalEntradas = 0;
  let totalSaidas = 0;
  for (const r of rows) {
    if (r.amount > 0) totalEntradas += r.amount;
    else totalSaidas += Math.abs(r.amount);
  }

  const buckets = Object.fromEntries(BUDGET_RULES.map((r) => [r.key, []]));
  for (const r of rows) {
    const abs = Math.abs(r.amount);
    for (const rule of BUDGET_RULES) {
      if (!rule.patterns.some((p) => p.test(r.desc))) continue;
      if (rule.entrada && r.amount <= 0) continue;
      if (rule.saida && r.amount >= 0) continue;
      buckets[rule.key].push(abs);
      break;
    }
  }

  const sugestoes = {};
  for (const rule of BUDGET_RULES) {
    const vals = buckets[rule.key];
    if (!vals.length) continue;
    sugestoes[rule.key] =
      rule.pick === "sum"
        ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100
        : Math.round(Math.max(...vals) * 100) / 100;
  }

  return {
    lancamentos: rows,
    totalEntradas: Math.round(totalEntradas * 100) / 100,
    totalSaidas: Math.round(totalSaidas * 100) / 100,
    saldoReal: Math.round((totalEntradas - totalSaidas) * 100) / 100,
    sugestoes,
    count: rows.length,
  };
}

function mapPluggyTransactions(pluggyList) {
  return pluggyList.map((t) => ({
    date: String(t.date || "").slice(0, 10),
    description: t.description || t.descriptionRaw || "",
    amount: typeof t.amount === "number" ? t.amount : Number(t.amount),
  }));
}

module.exports = { buildLedger, mapPluggyTransactions, BUDGET_RULES };
