/**
 * Sincronização em um passo: importa Nubank (se houver CSV) + gera arquivos + abre navegador.
 */
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runNubankImport, DEFAULT_CSV } from "./importar-nubank-csv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (existsSync(DEFAULT_CSV)) {
  const r = runNubankImport({ apply: true, quiet: true });
  if (r.ok && r.changed > 0) {
    console.log(`Nubank: ${r.changed} valor(es) atualizado(s) no config.json`);
  } else if (r.ok) {
    console.log("Nubank: CSV importado (valores já estavam iguais)");
  }
} else {
  console.log("Sem financeiro/import/nubank.csv — gerando só com config.json");
}

const gen = spawnSync(process.execPath, ["financeiro/gerar-planilha.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PLANILHA_SKIP_AUTO_IMPORT: "1" },
});
if (gen.status !== 0) process.exit(gen.status ?? 1);

const nav = spawnSync(process.execPath, ["financeiro/abrir-navegador.mjs"], {
  cwd: root,
  stdio: "inherit",
});
process.exit(nav.status ?? 0);
