/**
 * Envia Planilha_Orcamento.html para a Hostinger (FTPS), após gerar no PC.
 * Variáveis no .env (iguais ao GitHub Actions): FTP_SERVER, FTP_USERNAME, FTP_PASSWORD.
 * Opcional: FTP_SERVER_DIR (/public_html/), FTP_PORT (21), FINANCEIRO_FTP_SKIP=1
 */
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Client } from "basic-ftp";
import { loadDotEnv } from "./load-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAINEL_HTML = join(__dirname, "Planilha_Orcamento.html");
const REMOTE_FILE = "financeiro/Planilha_Orcamento.html";

function ftpConfig() {
  loadDotEnv();
  if (process.env.FINANCEIRO_FTP_SKIP === "1") {
    return { skip: true, reason: "FINANCEIRO_FTP_SKIP=1" };
  }
  const host = String(process.env.FTP_SERVER || "").trim();
  const user = String(process.env.FTP_USERNAME || "").trim();
  const password = String(process.env.FTP_PASSWORD || "");
  if (!host || !user || !password) {
    return { skip: true, reason: "FTP não configurado no .env" };
  }
  const siteDomain = String(process.env.FTP_SITE_DOMAIN || "white-lark-769069.hostingersite.com").trim();
  let serverDir = String(process.env.FTP_SERVER_DIR || "").trim();
  if (!serverDir) {
    serverDir = `/domains/${siteDomain}/public_html/`;
  }
  if (!serverDir.endsWith("/")) serverDir += "/";
  return {
    skip: false,
    host,
    user,
    password,
    port: Number(process.env.FTP_PORT) || 21,
    serverDir,
    verbose: process.env.FTP_VERBOSE === "1",
  };
}

/**
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, remote?: string }>}
 */
export async function uploadFinanceiroPainel() {
  const cfg = ftpConfig();
  if (cfg.skip) {
    return { ok: true, skipped: true, reason: cfg.reason };
  }
  if (!existsSync(PAINEL_HTML)) {
    return { ok: false, reason: "Arquivo local não encontrado: Planilha_Orcamento.html" };
  }

  const remotePath = cfg.serverDir + REMOTE_FILE;
  const client = new Client(60_000);
  client.ftp.verbose = cfg.verbose;

  try {
    await client.access({
      host: cfg.host,
      user: cfg.user,
      password: cfg.password,
      port: cfg.port,
      secure: true,
      secureOptions: { rejectUnauthorized: false },
    });
    const remoteDir = dirname(remotePath).replace(/\\/g, "/");
    await client.ensureDir(remoteDir);
    await client.uploadFrom(PAINEL_HTML, remotePath);
    return { ok: true, remote: remotePath };
  } finally {
    client.close();
  }
}

async function main() {
  const r = await uploadFinanceiroPainel();
  if (r.skipped) {
    console.log("FTP: ignorado (" + r.reason + ").");
    console.log("  Para publicar no site: defina FTP_SERVER, FTP_USERNAME e FTP_PASSWORD no .env");
    process.exit(0);
  }
  if (!r.ok) {
    console.error("FTP: falhou —", r.reason || "erro desconhecido");
    process.exit(1);
  }
  console.log("FTP: painel enviado →", r.remote);
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error("FTP:", err.message || err);
    process.exit(1);
  });
}
