import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Carrega config.json e calcula totais derivados */
export function loadOrcamentoConfig() {
  const raw = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf8"));
  const v = { ...raw.valores };

  v.totalEntradas = v.salLiq + v.pensao + v.auxilio;
  v.totalDespesas = v.moto + v.emp + v.facul + v.gas + v.cartao + v.outros;
  v.saldo = v.totalEntradas - v.totalDespesas;
  v.subtotalDividas = v.moto + v.emp + v.cartao;
  v.subtotalFixos = v.facul + v.gas + v.outros;

  const fluxo = raw.fluxo.map((item) => {
    const bruto = v[item.key];
    const valor = item.sinal < 0 ? -bruto : bruto;
    const diaStr = String(item.dia).padStart(2, "0");
    const data = `${raw.anoMes}-${diaStr}`;
    return {
      dia: diaStr,
      evento: item.evento,
      valor,
      entrada: valor > 0,
    };
  });

  const emp = raw.emprestimo;
  const col = raw.colchao;
  const reserva = v.reservaAtual ?? 0;
  const colchaoMeta = col.metaMax ?? col.metaMin ?? 1000;

  const extrato = raw.extrato && Array.isArray(raw.extrato.lancamentos) ? raw.extrato : null;

  return {
    vals: v,
    mesRef: raw.mesRef,
    anoMes: raw.anoMes,
    fluxo,
    metas: raw.metas,
    extrato,
    emprestimo: {
      ...emp,
      pctParcelas: Math.round((emp.parcelasPagas / emp.parcelasTotal) * 100),
    },
    colchao: {
      ...col,
      meta: colchaoMeta,
      atual: reserva,
      pct: colchaoMeta > 0 ? Math.min(100, Math.round((reserva / colchaoMeta) * 100)) : 0,
    },
  };
}

export function fmtMoneyBR(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "";
  const abs = Math.abs(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefix = n < 0 ? "-R$ " : "R$ ";
  return prefix + abs;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
