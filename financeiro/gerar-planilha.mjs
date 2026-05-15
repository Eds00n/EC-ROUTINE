/**
 * Gera planilha (XLSX), CSV, HTML e atalhos.
 * Edite financeiro/config.json e rode: npm run planilha:orcamento
 */
import ExcelJS from "exceljs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { buildHtmlPage } from "./build-html-page.mjs";
import { loadOrcamentoConfig, fmtMoneyBR, escapeHtml } from "./load-config.mjs";
import { runNubankImport, DEFAULT_CSV } from "./importar-nubank-csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "Planilha_Orcamento_Pessoal.xlsx");

if (existsSync(DEFAULT_CSV) && !process.env.PLANILHA_SKIP_AUTO_IMPORT) {
  const imp = runNubankImport({ apply: true, quiet: true });
  if (imp.ok && imp.changed > 0) {
    console.log(`Auto Nubank: ${imp.changed} valor(es) atualizado(s) a partir do CSV.`);
  }
}

const ctx = loadOrcamentoConfig();
const { vals, mesRef, anoMes, fluxo, metas, emprestimo: emp, colchao } = ctx;

/** CSV para Excel no Windows (PT-BR): separador `;` e decimal `,` */
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[;"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(cells) {
  return `${cells.map(csvEscape).join(";")}\r\n`;
}

const money = (n) => Number(n);
const brl = '"R$" #,##0.00';

const wb = new ExcelJS.Workbook();
wb.creator = "EC ROUTINE";
wb.created = new Date();
wb.modified = new Date();

function styleHeader(row) {
  row.font = { bold: true };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE7E6F7" },
  };
}

// --- Aba: Resumo ---
{
  const ws = wb.addWorksheet("Resumo", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 36 }, { width: 18 }, { width: 40 }];
  const h = ws.addRow(["Item", "Valor (R$)", "Observações"]);
  styleHeader(h);
  const rows = [
    ["Salário líquido (estimado, INSS 7%)", money(vals.salLiq), "Base bruta R$ 1.619 — ajuste pelo holerite"],
    ["Pensão", money(vals.pensao), "Cai dia 10 ou 11"],
    ["Auxílio IFAL", money(vals.auxilio), "Cai dia 29, 30 ou 31"],
    ["", "", ""],
    ["Total entradas (mês)", { formula: "SUM(B2:B4)" }, ""],
    ["", "", ""],
    ["Moto (parcela / compromisso)", money(vals.moto), ""],
    ["Empréstimo (parcela cheia)", money(vals.emp), `Pagar antes do vencimento reduz (ex.: ~R$ ${emp.parcelaAntecipada})`],
    ["Faculdade online", money(vals.facul), ""],
    ["Gasolina (média)", money(vals.gas), "Faixa informada R$ 80–90"],
    [`Cartão de crédito (ex. ${mesRef})`, money(vals.cartao), "Tende a cair conforme parcelas terminam"],
    ["Outros / resto (teto)", money(vals.outros), ""],
    ["", "", ""],
    ["Total despesas (cenário atual)", { formula: "SUM(B8:B13)" }, "Edite valores conforme seu mês"],
    ["", "", ""],
    ["Saldo estimado (entradas − despesas)", { formula: "B6-B15" }, "Referência; acompanhe na aba Fluxo de caixa"],
    ["", "", ""],
    ["Reserva atual (meta)", money(vals.reservaAtual ?? 0), "Preencha quando for juntando"],
    ["Investimento mensal (meta)", money(0), "Defina um valor fixo após colchão mínimo"],
    ["", "", ""],
    ["RESUMO:", "", ""],
    ["Gastos (total mensal)", { formula: "B15" }, "Soma das despesas do mês"],
    ["Saldo (estimado)", { formula: "B17" }, "Entradas − despesas"],
  ];
  rows.forEach((r) => ws.addRow(r));
  ws.getColumn(2).numFmt = brl;
  ws.getCell("B6").font = { bold: true };
  ws.getCell("B15").font = { bold: true };
  ws.getCell("B17").font = { bold: true, color: { argb: "FF006100" } };
  ws.getCell("A22").font = { bold: true, size: 12 };
  ws.getCell("B23").font = { bold: true };
  ws.getCell("B24").font = { bold: true, color: { argb: "FF006100" } };
}

// --- Aba: Entradas ---
{
  const ws = wb.addWorksheet("Entradas");
  ws.columns = [{ width: 28 }, { width: 16 }, { width: 14 }, { width: 40 }];
  const h = ws.addRow(["Fonte", "Valor (R$)", "Dia típico", "Notas"]);
  styleHeader(h);
  [
    ["Jovem aprendiz (líquido estimado)", money(vals.salLiq), "5", "INSS 7% sobre R$ 1.619 — confira holerite"],
    ["Pensão", money(vals.pensao), "10–11", ""],
    ["Auxílio IFAL", money(vals.auxilio), "29–31", ""],
    ["13º salário", "", "", "Lançar quando receber (parcela fixa)"],
    ["Férias", "", "", "Lançar quando receber"],
  ].forEach((r) => ws.addRow(r));
  ws.getColumn(2).numFmt = brl;
}

// --- Aba: Despesas ---
{
  const ws = wb.addWorksheet("Despesas");
  ws.columns = [{ width: 26 }, { width: 16 }, { width: 14 }, { width: 46 }];
  const h = ws.addRow(["Descrição", "Valor (R$)", "Vencimento", "Notas"]);
  styleHeader(h);
  [
    ["Moto", money(vals.moto), "", "Maior item do orçamento"],
    ["Empréstimo Nubank", money(vals.emp), "16", `${emp.parcelasRestantes} parcelas restantes; saldo app ~R$ ${emp.saldoRestante.toLocaleString("pt-BR")}`],
    ["Faculdade online", money(vals.facul), "", "EDITORA / NuPay no cartão"],
    ["Gasolina", money(vals.gas), "", "Ajuste 80–90"],
    ["Cartão de crédito", money(vals.cartao), "10", `Fatura ${mesRef}; evite novas parcelas até estabilizar`],
    ["Outros (teto)", money(vals.outros), "", "Lazer / imprevisto leve"],
  ].forEach((r) => ws.addRow(r));
  ws.getColumn(2).numFmt = brl;
}

// --- Aba: Fluxo de caixa (modelo) ---
{
  const ws = wb.addWorksheet("Fluxo de caixa");
  ws.columns = [{ width: 12 }, { width: 28 }, { width: 16 }, { width: 40 }];
  const h = ws.addRow(["Data", "Evento", "Valor (R$)", "Saldo após (preencher)"]);
  styleHeader(h);
  const note = ws.addRow([
    "",
    "Copie linhas abaixo e lance dia a dia. Negativo = saída.",
    "",
    "Comece com saldo em conta no dia 1º.",
  ]);
  note.getCell(2).font = { italic: true, color: { argb: "FF666666" } };
  ws.addRow([]);
  fluxo.forEach((f) => {
    ws.addRow([`${anoMes}-${f.dia}`, f.evento, money(f.valor), ""]);
  });
  ws.getColumn(3).numFmt = brl;
}

// --- Aba: Dívidas e metas ---
{
  const ws = wb.addWorksheet("Dividas e metas");
  ws.columns = [{ width: 34 }, { width: 20 }, { width: 50 }];
  const h = ws.addRow(["Tema", "Valor / prazo", "Ação sugerida"]);
  styleHeader(h);
  metas.forEach((meta) => {
    const valorPrazo =
      meta.titulo === "Empréstimo"
        ? `${emp.parcelasRestantes} parcelas · saldo ~R$ ${emp.saldoRestante.toLocaleString("pt-BR")}`
        : meta.titulo === "Colchão"
          ? `Meta: R$ ${colchao.metaMin}–${colchao.metaMax} (atual: R$ ${colchao.atual})`
          : "—";
    ws.addRow([meta.titulo, valorPrazo, meta.texto]);
  });
}

// --- Aba: Lançamentos (controle mês) ---
{
  const ws = wb.addWorksheet("Lancamentos mes");
  ws.columns = [{ width: 12 }, { width: 22 }, { width: 14 }, { width: 36 }];
  const h = ws.addRow(["Data", "Categoria", "Valor (R$)", "Observação"]);
  styleHeader(h);
  for (let i = 0; i < 25; i++) ws.addRow(["", "", "", ""]);
  ws.getColumn(3).numFmt = brl;
}

await mkdirSync(dirname(outPath), { recursive: true });
await wb.xlsx.writeFile(outPath);
console.log("Gerado:", outPath);

// --- CSV ---
let csvResumo = "\uFEFF";
csvResumo += csvLine(["ORCAMENTO - RESUMO (valores em R$)"]);
csvResumo += csvLine([`Referencia: ${mesRef}`]);
csvResumo += csvLine([]);
csvResumo += csvLine(["Item", "Valor", "Observacoes"]);
csvResumo += csvLine(["Salario liquido (estimado INSS 7%)", fmtMoneyBR(vals.salLiq), "Base bruta R$ 1619 - confira holerite"]);
csvResumo += csvLine(["Pensao", fmtMoneyBR(vals.pensao), "Cai dia 10 ou 11"]);
csvResumo += csvLine(["Auxilio IFAL", fmtMoneyBR(vals.auxilio), "Cai dia 29, 30 ou 31"]);
csvResumo += csvLine(["Total entradas (calculado)", fmtMoneyBR(vals.totalEntradas), ""]);
csvResumo += csvLine([]);
csvResumo += csvLine(["Moto", fmtMoneyBR(vals.moto), ""]);
csvResumo += csvLine(["Emprestimo", fmtMoneyBR(vals.emp), "Pagar antes do vencimento pode reduzir"]);
csvResumo += csvLine(["Faculdade online", fmtMoneyBR(vals.facul), ""]);
csvResumo += csvLine(["Gasolina (media)", fmtMoneyBR(vals.gas), ""]);
csvResumo += csvLine(["Cartao de credito", fmtMoneyBR(vals.cartao), ""]);
csvResumo += csvLine(["Outros (teto)", fmtMoneyBR(vals.outros), ""]);
csvResumo += csvLine(["Total despesas (calculado)", fmtMoneyBR(vals.totalDespesas), ""]);
csvResumo += csvLine([]);
csvResumo += csvLine(["Saldo estimado (entradas - despesas)", fmtMoneyBR(vals.saldo), ""]);
csvResumo += csvLine([]);
csvResumo += csvLine(["RESUMO", "", ""]);
csvResumo += csvLine(["Gastos (total mensal)", fmtMoneyBR(vals.totalDespesas), ""]);
csvResumo += csvLine(["Saldo (estimado)", fmtMoneyBR(vals.saldo), ""]);
writeFileSync(join(__dirname, "Planilha_Resumo.csv"), csvResumo, "utf8");

let csvFluxo = "\uFEFF";
csvFluxo += csvLine([`FLUXO DE CAIXA (${mesRef})`]);
csvFluxo += csvLine(["Data", "Evento", "Valor"]);
fluxo.forEach((f) => {
  csvFluxo += csvLine([`${anoMes}-${f.dia}`, f.evento, fmtMoneyBR(f.valor)]);
});
writeFileSync(join(__dirname, "Planilha_Fluxo.csv"), csvFluxo, "utf8");

// --- HTML (abre no navegador; sem servidor) ---
const geradoEm = new Date().toLocaleString("pt-BR");
const htmlPath = join(__dirname, "Planilha_Orcamento.html");
const html = buildHtmlPage(ctx, geradoEm, escapeHtml, fmtMoneyBR);
writeFileSync(htmlPath, html, "utf8");

const bat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "Planilha_Orcamento_Pessoal.xlsx" (
  echo Arquivo XLSX nao encontrado. Na pasta do projeto rode: npm run planilha:orcamento
  pause
  exit /b 1
)
echo Abrindo planilha com o programa padrao do Windows (Excel ou similar)...
start "" "Planilha_Orcamento_Pessoal.xlsx"
exit /b 0
`;
writeFileSync(join(__dirname, "ABRIR_PLANILHA.bat"), bat, "utf8");

const batNav = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "Planilha_Orcamento.html" (
  echo HTML nao encontrado. Na pasta do projeto rode: npm run planilha:orcamento
  pause
  exit /b 1
)
start "" "Planilha_Orcamento.html"
exit /b 0
`;
writeFileSync(join(__dirname, "ABRIR_NO_NAVEGADOR.bat"), batNav, "utf8");

console.log("Gerado:", join(__dirname, "Planilha_Resumo.csv"));
console.log("Gerado:", join(__dirname, "Planilha_Fluxo.csv"));
console.log("Gerado:", htmlPath);
console.log("Gerado:", join(__dirname, "ABRIR_PLANILHA.bat"));
console.log("Gerado:", join(__dirname, "ABRIR_NO_NAVEGADOR.bat"));
console.log("");
console.log("Navegador: npm run planilha:navegador  ou  dois cliques em ABRIR_NO_NAVEGADOR.bat");
console.log("Dica: edite financeiro/config.json e regenere com npm run planilha:orcamento");
