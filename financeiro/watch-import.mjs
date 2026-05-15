/**
 * Monitora financeiro/import/nubank.csv — ao salvar, importa e regera o painel.
 * Deixe este terminal aberto. Ctrl+C para parar.
 */
import { watch } from "fs";
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const importDir = join(__dirname, "import");
const csvPath = join(importDir, "nubank.csv");

mkdirSync(importDir, { recursive: true });

let debounce = null;
let running = false;

function runSync() {
  if (running) return;
  running = true;
  const t = new Date().toLocaleString("pt-BR");
  console.log(`\n[${t}] CSV detectado — sincronizando...`);

  const child = spawn(process.execPath, [join(__dirname, "sync.mjs")], {
    cwd: join(__dirname, ".."),
    stdio: "inherit",
    shell: false,
  });

  child.on("close", (code) => {
    running = false;
    if (code === 0) console.log(`[${t}] Pronto. Aguardando novo CSV...\n`);
    else console.log(`[${t}] Sync terminou com código ${code}\n`);
  });
}

if (existsSync(csvPath)) {
  console.log("CSV já existe — sincronizando uma vez...");
  runSync();
} else {
  console.log("Aguardando:", csvPath);
}

console.log("");
console.log("1. Exporte o extrato no app Nubank (CSV)");
console.log("2. Salve/substitua o arquivo acima (mesmo nome)");
console.log("3. O painel atualiza sozinho");
console.log("");

watch(importDir, { persistent: true }, (event, filename) => {
  if (filename !== "nubank.csv") return;
  clearTimeout(debounce);
  debounce = setTimeout(runSync, 600);
});
