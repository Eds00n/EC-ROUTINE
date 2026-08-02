/**
 * Envia HTML/JS/CSS do módulo financeiro + pasta lib/ (front) para a Hostinger (FTPS).
 * Usa as mesmas variáveis FTP_* do .env que upload-hostinger.mjs.
 */
import { existsSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Client } from "basic-ftp";
import { loadDotEnv } from "./load-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FINANCEIRO_FILES = [
  "index.html",
  "import.js",
  "painel.html",
  "painel.js",
  "financeiro-theme.css",
  "financeiro-painel.css",
  "entry.html",
  "entry.js",
  "conectar-nubank.html",
];

const ROOT_FILES = [
  "ec-global-responsive.css",
  "dashboard.css",
  "dashboard-theme.css",
  "api-base.js",
];

function normalizeDir(dir) {
  let d = String(dir || "").trim();
  if (!d) return "/";
  if (!d.startsWith("/")) d = "/" + d;
  if (!d.endsWith("/")) d += "/";
  return d;
}

function ftpConfig() {
  loadDotEnv();
  const host = String(process.env.FTP_SERVER || "").trim();
  const user = String(process.env.FTP_USERNAME || "").trim();
  const password = String(process.env.FTP_PASSWORD || "");
  if (!host || !user || !password) {
    return { ok: false, reason: "FTP não configurado no .env" };
  }

  const siteDomain = String(process.env.FTP_SITE_DOMAIN || "white-lark-769069.hostingersite.com").trim();
  const domainDir = `/domains/${siteDomain}/public_html/`;
  const dirs = [];
  const explicit = String(process.env.FTP_SERVER_DIR || "").trim();
  if (explicit) {
    dirs.push(normalizeDir(explicit));
  } else {
    dirs.push(domainDir);
    dirs.push("/public_html/");
  }
  if (!dirs.some((d) => d.includes("/domains/"))) {
    dirs.push(normalizeDir(domainDir));
  }
  const extra = String(process.env.FTP_SERVER_DIR_EXTRA || "").trim();
  if (extra) dirs.push(normalizeDir(extra));

  const uniqueDirs = [...new Set(dirs)];

  return {
    ok: true,
    host,
    user,
    password,
    port: Number(process.env.FTP_PORT) || 21,
    serverDirs: uniqueDirs,
  };
}

const LIB_SKIP = new Set(["store.js", "store-pg.js", "store-files.js"]);

function shouldUploadLibFile(name) {
  if (LIB_SKIP.has(name)) return false;
  if (name.endsWith(".mjs")) return false;
  return true;
}

async function uploadLibTree(client, localRoot, remoteRoot) {
  let count = 0;
  const stack = [{ local: localRoot, remote: remoteRoot }];
  while (stack.length) {
    const { local, remote } = stack.pop();
    await client.ensureDir(remote);
    for (const name of readdirSync(local)) {
      const localPath = join(local, name);
      const remotePath = remote + name.replace(/\\/g, "/");
      const st = statSync(localPath);
      if (st.isDirectory()) {
        stack.push({ local: localPath, remote: remotePath + "/" });
        continue;
      }
      if (!shouldUploadLibFile(name)) continue;
      await client.uploadFrom(localPath, remotePath);
      console.log("  →", remotePath);
      count++;
    }
  }
  return count;
}

async function main() {
  const cfg = ftpConfig();
  if (!cfg.ok) {
    console.log("FTP: ignorado (" + cfg.reason + ").");
    console.log("Alternativa: git push para main (GitHub Actions faz deploy).");
    process.exit(0);
  }

  const client = new Client(60_000);

  try {
    await client.access({
      host: cfg.host,
      user: cfg.user,
      password: cfg.password,
      port: cfg.port,
      secure: true,
      secureOptions: { rejectUnauthorized: false },
    });

    let n = 0;
    for (const serverDir of cfg.serverDirs) {
      console.log("\nDestino:", serverDir);
      const remoteFin = serverDir + "financeiro/";
      await client.ensureDir(remoteFin);

      for (const name of FINANCEIRO_FILES) {
        const local = join(__dirname, name);
        if (!existsSync(local)) {
          console.warn("  omitido (não existe):", name);
          continue;
        }
        await client.uploadFrom(local, remoteFin + name);
        console.log("  →", remoteFin + name);
        n++;
      }

      for (const name of ROOT_FILES) {
        const local = join(ROOT, name);
        if (!existsSync(local)) {
          console.warn("  omitido raiz (não existe):", name);
          continue;
        }
        await client.uploadFrom(local, serverDir + name);
        console.log("  →", serverDir + name);
        n++;
      }

      const localLib = join(ROOT, "lib");
      if (existsSync(localLib)) {
        console.log("  lib/ (front):");
        n += await uploadLibTree(client, localLib, serverDir + "lib/");
      } else {
        console.warn("  omitido: pasta lib/ não encontrada em", ROOT);
      }
    }

    console.log("\nFTP: " + n + " upload(s) concluídos.");
    console.log("Abra o site com Ctrl+F5 em /financeiro/index.html");
  } catch (e) {
    console.error("FTP:", e.message || e);
    process.exit(1);
  } finally {
    client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
