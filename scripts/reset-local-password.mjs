/**
 * Redefine senha no users.json local (só desenvolvimento no PC).
 * Uso: node scripts/reset-local-password.mjs seu@email.com novaSenha123
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const usersPath = join(__dirname, "..", "data", "users.json");

const email = String(process.argv[2] || "")
  .trim()
  .toLowerCase();
const password = process.argv[3] || "";

if (!email || !password || password.length < 8) {
  console.error("Uso: node scripts/reset-local-password.mjs email@exemplo.com senhaMin8chars");
  process.exit(1);
}

const users = JSON.parse(readFileSync(usersPath, "utf8"));
const i = users.findIndex((u) => String(u.email).toLowerCase() === email);
if (i < 0) {
  console.error("E-mail não encontrado em data/users.json:", email);
  process.exit(1);
}

users[i].password = await bcrypt.hash(password, 10);
writeFileSync(usersPath, JSON.stringify(users, null, 2) + "\n", "utf8");
console.log("Senha atualizada para", email);
console.log("Entre em http://localhost:3000/auth.html com essa senha.");
