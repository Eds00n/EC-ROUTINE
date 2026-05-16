/**
 * Importa extrato CSV do Nubank e sugere/atualiza financeiro/config.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildLedger } = require("./openfinance/ledger.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = join(__dirname, "config.json");
export const DEFAULT_CSV = join(__dirname, "import", "nubank.csv");

const RULES = [
  {
    key: "emp",
    label: "Empréstimo (parcela)",
    patterns: [/emprestimo/i, /parcela de empr/i, /credito pessoal/i],
    pick: "max",
  },
  {
    key: "cartao",
    label: "Cartão / fatura",
    patterns: [/pagamento de fatura/i, /fatura do cart/i, /pagamento.*cartao/i, /nu pay/i],
    pick: "max",
  },
  {
    key: "facul",
    label: "Faculdade",
    patterns: [/estacio/i, /estácio/i, /faculdade/i, /editora/i, /universidade/i],
    pick: "sum",
  },
  {
    key: "gas",
    label: "Gasolina",
    patterns: [/posto/i, /gasolina/i, /shell/i, /ipiranga/i, /br distribuidora/i],
    pick: "sum",
  },
  {
    key: "salLiq",
    label: "Salário",
    patterns: [/jovem aprendiz/i, /salario/i, /salário/i, /folha/i, /holerite/i],
    pick: "max",
    entrada: true,
  },
  {
    key: "pensao",
    label: "Pensão",
    patterns: [/pensao/i, /pensão/i],
    pick: "max",
    entrada: true,
  },
  {
    key: "auxilio",
    label: "Auxílio IFAL",
    patterns: [/ifal/i, /auxilio/i, /auxílio/i],
    pick: "max",
    entrada: true,
  },
  {
    key: "moto",
    label: "Moto",
    patterns: [/moto/i, /motocic/i, /consorcio.*moto/i],
    pick: "max",
  },
];

export function parseArgs(argv) {
  const out = { apply: false, mes: null, csv: DEFAULT_CSV, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--apply") out.apply = true;
    else if (argv[i] === "--dry-run") out.apply = false;
    else if (argv[i] === "--quiet") out.quiet = true;
    else if (argv[i] === "--mes" && argv[i + 1]) {
      out.mes = argv[++i];
    } else if (!argv[i].startsWith("-")) {
      out.csv = argv[i];
    }
  }
  return out;
}

function detectDelimiter(headerLine) {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  return semi > comma ? ";" : ",";
}

function parseCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if ((c === delim || c === "\n") && !inQ) {
      out.push(cur.trim());
      cur = "";
      if (c === "\n") break;
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseAmount(raw) {
  if (raw == null || raw === "") return NaN;
  let s = String(raw).trim().replace(/\s/g, "").replace(/R\$/gi, "");
  const neg = s.startsWith("-") || (s.includes("-") && !s.endsWith("-"));
  s = s.replace(/-/g, "");
  if (/,/.test(s) && /\./.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/,/.test(s)) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return neg && n > 0 ? -n : n;
}

function parseDate(raw) {
  const full = parseDateFull(raw);
  return full ? full.slice(0, 7) : null;
}

function parseDateFull(raw) {
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const br2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})/);
  if (br2) return `20${br2[3]}-${br2[2].padStart(2, "0")}-${br2[1].padStart(2, "0")}`;
  return null;
}

function normalizeHeader(h) {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function findColumn(headers, names) {
  const norm = headers.map(normalizeHeader);
  for (const name of names) {
    const i = norm.findIndex((h) => h === name || h.includes(name));
    if (i >= 0) return i;
  }
  return -1;
}

export function loadTransactionsFromText(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV vazio ou sem linhas de dados.");

  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim);
  const iDate = findColumn(headers, ["data", "date", "dt"]);
  const iDesc = findColumn(headers, [
    "descricao",
    "descrição",
    "description",
    "title",
    "lancamento",
    "lançamento",
    "historico",
  ]);
  const iVal = findColumn(headers, ["valor", "amount", "value", "quantia"]);
  const iSaldo = findColumn(headers, ["saldo", "balance"]);

  if (iDate < 0 || iVal < 0) {
    throw new Error(
      `Colunas não reconhecidas. Cabeçalho: ${lines[0]}\nEsperado: data + valor (+ descrição).`
    );
  }

  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r], delim);
    if (cols.length < 2) continue;
    const amount = parseAmount(cols[iVal]);
    if (Number.isNaN(amount) || amount === 0) continue;
    const dateFull = parseDateFull(cols[iDate]);
    const ym = dateFull ? dateFull.slice(0, 7) : parseDate(cols[iDate]);
    const desc =
      (iDesc >= 0 ? cols[iDesc] : cols.find((c, i) => i !== iDate && i !== iVal) || "") || "";
    let saldo = null;
    if (iSaldo >= 0 && cols[iSaldo]) {
      const s = parseAmount(cols[iSaldo]);
      if (!Number.isNaN(s)) saldo = s;
    }
    rows.push({
      ym,
      date: dateFull || (ym ? `${ym}-01` : null),
      desc,
      amount,
      saldo,
      line: r + 1,
    });
  }
  return rows;
}

export function loadTransactions(csvPath) {
  return loadTransactionsFromText(readFileSync(csvPath, "utf8"));
}

function matchRule(desc, rule) {
  return rule.patterns.some((p) => p.test(desc));
}

function aggregate(rows, filterYm) {
  const filtered = filterYm ? rows.filter((t) => t.ym === filterYm) : rows;
  const buckets = Object.fromEntries(RULES.map((r) => [r.key, []]));

  for (const t of filtered) {
    const abs = Math.abs(t.amount);
    for (const rule of RULES) {
      if (!matchRule(t.desc, rule)) continue;
      if (rule.entrada && t.amount <= 0) continue;
      if (!rule.entrada && t.amount >= 0) continue;
      buckets[rule.key].push(abs);
      break;
    }
  }

  const suggested = {};
  for (const rule of RULES) {
    const vals = buckets[rule.key];
    if (!vals.length) continue;
    if (rule.pick === "max") suggested[rule.key] = Math.max(...vals);
    else if (rule.pick === "sum") suggested[rule.key] = vals.reduce((a, b) => a + b, 0);
  }

  const lastSaldo = [...filtered].reverse().find((t) => t.saldo != null);
  if (lastSaldo && lastSaldo.saldo > 0) {
    suggested.reservaAtual = Math.round(lastSaldo.saldo * 100) / 100;
  }

  return { filtered, suggested, count: filtered.length };
}

export function mesRefFromYm(ym) {
  const [y, m] = ym.split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

function fmt(n) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Aplica import CSV a um objeto config (API ou ficheiro).
 * @param {object} config
 * @param {{ csvText?: string, csv?: string, mes?: string|null, apply?: boolean }} opts
 */
export function runNubankImportOnConfig(config, opts = {}) {
  const apply = opts.apply ?? false;
  const filterYm = opts.mes || config.anoMes;

  let rows;
  try {
    if (opts.csvText != null) {
      rows = loadTransactionsFromText(opts.csvText);
    } else if (opts.csv) {
      rows = loadTransactions(opts.csv);
    } else {
      return { ok: false, error: "csvText ou csv obrigatório", changed: 0, count: 0, filterYm };
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e), changed: 0, count: 0, filterYm };
  }

  const { filtered, suggested, count } = aggregate(rows, filterYm);
  if (count === 0) {
    return {
      ok: false,
      error: `Nenhum lançamento em ${filterYm}. Exporte o CSV do mês correto no Nubank.`,
      changed: 0,
      count: 0,
      filterYm,
    };
  }

  const valorKeys = ["salLiq", "pensao", "auxilio", "moto", "emp", "facul", "gas", "cartao", "outros"];
  let changed = 0;

  for (const key of valorKeys) {
    if (suggested[key] == null) continue;
    const cur = config.valores[key];
    const neu = Math.round(suggested[key] * 100) / 100;
    if (apply && cur !== neu) {
      config.valores[key] = neu;
      changed++;
    }
  }

  if (suggested.reservaAtual != null && apply) {
    const cur = config.valores.reservaAtual ?? 0;
    const neu = suggested.reservaAtual;
    if (cur !== neu) {
      config.valores.reservaAtual = neu;
      changed++;
    }
  }

  let ledger = null;
  if (apply) {
    if (filterYm && filterYm !== config.anoMes) {
      config.anoMes = filterYm;
      config.mesRef = mesRefFromYm(filterYm);
    }
    const mapped = filtered.map((t) => ({
      date: t.date || `${t.ym}-01`,
      desc: t.desc,
      amount: t.amount,
    }));
    ledger = buildLedger(mapped, filterYm);
    config.extrato = {
      fonte: "nubank-csv",
      syncedAt: new Date().toISOString(),
      totalEntradas: ledger.totalEntradas,
      totalSaidas: ledger.totalSaidas,
      saldoReal: ledger.saldoReal,
      lancamentos: ledger.lancamentos,
    };
  }

  return {
    ok: true,
    changed,
    count,
    filterYm,
    config,
    ledger,
    preview: {
      sugestoes: suggested,
      totalEntradas: ledger?.totalEntradas,
      totalSaidas: ledger?.totalSaidas,
      saldoReal: ledger?.saldoReal,
    },
  };
}

/**
 * @param {{ apply?: boolean, mes?: string|null, csv?: string, quiet?: boolean }} opts
 * @returns {{ ok: boolean, missing?: boolean, changed: number, count: number, filterYm: string }}
 */
export function runNubankImport(opts = {}) {
  const csv = opts.csv ?? DEFAULT_CSV;
  const apply = opts.apply ?? false;
  const quiet = opts.quiet ?? false;
  const log = quiet ? () => {} : console.log.bind(console);
  const logErr = quiet ? () => {} : console.error.bind(console);

  if (!existsSync(csv)) {
    return { ok: false, missing: true, changed: 0, count: 0, filterYm: "" };
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  log("=== Import Nubank CSV ===");
  log("Arquivo:", csv);

  const result = runNubankImportOnConfig(config, { csv, mes: opts.mes, apply });
  if (!result.ok) {
    if (!quiet) logErr(result.error || "Erro no import");
    return { ok: false, changed: 0, count: result.count || 0, filterYm: result.filterYm || "" };
  }

  const { suggested } = result.preview || {};
  const filterYm = result.filterYm;
  log("Mês filtro:", filterYm, `(${result.count} lançamentos)`);
  log("");

  const valorKeys = ["salLiq", "pensao", "auxilio", "moto", "emp", "facul", "gas", "cartao", "outros"];
  const keys = Object.keys(suggested || {}).filter((k) => k !== "reservaAtual");

  if (!keys.length && suggested?.reservaAtual == null) {
    log("Nenhum lançamento reconhecido nas regras automáticas (extrato gravado mesmo assim).");
  } else if (!quiet) {
    log("Sugestões (comparado com config atual):");
    log("");
    for (const key of valorKeys) {
      if (suggested[key] == null) continue;
      const cur = config.valores[key];
      const neu = Math.round(suggested[key] * 100) / 100;
      const rule = RULES.find((r) => r.key === key);
      const tag = cur === neu ? "=" : "→";
      log(
        `  ${rule?.label || key}: R$ ${fmt(cur)} ${tag} R$ ${fmt(neu)}${tag === "=" ? " (igual)" : ""}`
      );
    }
    log("");
    log("Não detectados automaticamente: moto (fora do Nu), outros, metas, fluxo.");
  }

  if (apply && result.ledger) {
    writeFileSync(
      join(__dirname, "lancamentos.json"),
      JSON.stringify({ syncedAt: config.extrato.syncedAt, ...result.ledger }, null, 2) + "\n",
      "utf8"
    );
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
    if (!quiet) log(`config.json atualizado (${result.changed} campo(s) alterado(s)).`);
  } else if (!quiet) {
    log("Modo leitura. Para gravar: npm run planilha:import-nubank -- --apply");
  }

  return { ok: true, changed: result.changed, count: result.count, filterYm };
}

function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(args.csv)) {
    mkdirSync(dirname(args.csv), { recursive: true });
    console.error("Arquivo não encontrado:", args.csv);
    console.error("");
    console.error("Como obter o CSV no Nubank:");
    console.error("  Conta Nu → Exportar extrato → CSV");
    console.error("  Salve como: financeiro/import/nubank.csv");
    console.error("");
    console.error("Automático: npm run planilha:watch (monitora essa pasta)");
    process.exit(1);
  }
  runNubankImport({ apply: args.apply, mes: args.mes, csv: args.csv, quiet: args.quiet });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
