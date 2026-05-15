const fs = require("fs").promises;
const path = require("path");

function financeDir(rootDir) {
  return path.join(rootDir, "data", "financeiro");
}

function userPath(rootDir, userId) {
  return path.join(financeDir(rootDir), `user-${userId}.json`);
}

async function ensureDir(rootDir) {
  await fs.mkdir(financeDir(rootDir), { recursive: true });
}

async function loadUser(rootDir, userId) {
  await ensureDir(rootDir);
  const p = userPath(rootDir, userId);
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") {
      return { pluggyItemId: null, accountId: null, lastSyncAt: null };
    }
    throw e;
  }
}

async function saveUser(rootDir, userId, data) {
  await ensureDir(rootDir);
  await fs.writeFile(userPath(rootDir, userId), JSON.stringify(data, null, 2) + "\n", "utf8");
}

module.exports = { loadUser, saveUser, financeDir };
