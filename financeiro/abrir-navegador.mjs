/**
 * Abre Planilha_Orcamento.html no navegador padrão.
 * Uso: node financeiro/abrir-navegador.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = join(__dirname, "Planilha_Orcamento.html");

if (!existsSync(html)) {
  console.error("Arquivo nao encontrado:", html);
  console.error("Gere antes: npm run planilha:orcamento");
  process.exit(1);
}

if (process.platform === "win32") {
  execFileSync("cmd", ["/c", "start", "", html], { stdio: "inherit" });
} else if (process.platform === "darwin") {
  execFileSync("open", [html], { stdio: "inherit" });
} else {
  execFileSync("xdg-open", [html], { stdio: "inherit" });
}
