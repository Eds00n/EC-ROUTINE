/**
 * Envia HTML/JS/CSS do módulo financeiro para a Hostinger (FTPS).
 * Usa as mesmas variáveis FTP_* do .env que upload-hostinger.mjs.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Client } from "basic-ftp";
import { loadDotEnv } from "./load-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = [
  "index.html",
  "import.js",
  "import-ui.css",
  "painel.html",
  "painel.js",
  "entry.html",
  "entry.js",
  "conectar-nubank.html",
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
      const remoteDir = serverDir + "financeiro/";
      await client.ensureDir(remoteDir);

      for (const name of FILES) {
        const local = join(__dirname, name);
        if (!existsSync(local)) {
          console.warn("  omitido (não existe):", name);
          continue;
        }
        await client.uploadFrom(local, remoteDir + name);
        console.log("  →", remoteDir + name);
        n++;
      }

      const apiBase = join(__dirname, "..", "api-base.js");
      if (existsSync(apiBase)) {
        await client.uploadFrom(apiBase, serverDir + "api-base.js");
        console.log("  →", serverDir + "api-base.js");
        n++;
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
