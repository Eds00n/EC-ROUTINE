import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "import");
const dest = join(dir, "nubank.csv");
const exemplo = join(dir, "exemplo-nubank.csv");

mkdirSync(dir, { recursive: true });
if (existsSync(dest)) {
  console.log("Ja existe:", dest);
} else if (existsSync(exemplo)) {
  copyFileSync(exemplo, dest);
  console.log("Criado:", dest, "(copia do exemplo)");
} else {
  console.log("Salve o CSV do Nubank em:", dest);
}
