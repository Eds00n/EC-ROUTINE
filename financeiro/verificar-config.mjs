/**
 * Confere config.json (mesRef, anoMes, totais). npm run planilha:verificar
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadOrcamentoConfig } from "./load-config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf8"));
const { vals, mesRef, anoMes } = loadOrcamentoConfig();

const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
let ok = true;

if (!/^\d{4}-\d{2}$/.test(anoMes)) {
  console.error("anoMes invalido:", anoMes, "(use AAAA-MM)");
  ok = false;
}
const [y, m] = anoMes.split("-");
const esperado = `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`;
if (mesRef !== esperado) {
  console.warn("Aviso: mesRef", mesRef, "diferente do esperado para anoMes:", esperado);
}

const manual = ["moto", "outros"];
console.log("=== Verificacao config.json ===");
console.log("Referencia:", mesRef, "|", anoMes);
console.log("");
console.log("Totais calculados:");
console.log("  Entradas:", vals.totalEntradas.toFixed(2));
console.log("  Despesas:", vals.totalDespesas.toFixed(2));
console.log("  Saldo:   ", vals.saldo.toFixed(2));
console.log("");
console.log("Campos tipicos do Nubank (CSV):", "salLiq, pensao, auxilio, emp, cartao, gas, facul");
console.log("Ajuste manual se precisar:", manual.join(", "));
console.log("  moto atual:", vals.moto, "| outros:", vals.outros);
console.log("");
console.log(ok ? "Config OK." : "Corrija os erros acima.");

process.exit(ok ? 0 : 1);
