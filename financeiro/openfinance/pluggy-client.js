/**
 * Cliente Pluggy (Open Finance Brasil).
 * Docs: https://docs.pluggy.ai/
 */
const axios = require("axios");

const BASE = "https://api.pluggy.ai";

function isConfigured() {
  return Boolean(
    process.env.PLUGGY_CLIENT_ID &&
      process.env.PLUGGY_CLIENT_SECRET &&
      String(process.env.PLUGGY_CLIENT_ID).trim() &&
      String(process.env.PLUGGY_CLIENT_SECRET).trim()
  );
}

let cachedKey = null;
let keyExpires = 0;

async function getApiKey() {
  if (!isConfigured()) {
    throw new Error("Pluggy não configurado. Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no .env");
  }
  const now = Date.now();
  if (cachedKey && now < keyExpires) return cachedKey;

  const { data } = await axios.post(
    `${BASE}/auth`,
    {
      clientId: process.env.PLUGGY_CLIENT_ID,
      clientSecret: process.env.PLUGGY_CLIENT_SECRET,
    },
    { timeout: 20000 }
  );
  cachedKey = data.apiKey;
  keyExpires = now + 50 * 60 * 1000;
  return cachedKey;
}

async function createConnectToken(clientUserId) {
  const apiKey = await getApiKey();
  const { data } = await axios.post(
    `${BASE}/connect_token`,
    { clientUserId: String(clientUserId) },
    {
      headers: { "X-API-KEY": apiKey },
      timeout: 20000,
    }
  );
  return data.accessToken;
}

async function listAccounts(itemId) {
  const apiKey = await getApiKey();
  const { data } = await axios.get(`${BASE}/accounts`, {
    params: { itemId },
    headers: { "X-API-KEY": apiKey },
    timeout: 30000,
  });
  return data.results || [];
}

async function listTransactions(accountId, from, to) {
  const apiKey = await getApiKey();
  const all = [];
  let page = 1;
  const pageSize = 500;

  for (;;) {
    const { data } = await axios.get(`${BASE}/transactions`, {
      params: { accountId, from, to, page, pageSize },
      headers: { "X-API-KEY": apiKey },
      timeout: 30000,
    });
    const batch = data.results || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    page += 1;
    if (page > 20) break;
  }
  return all;
}

module.exports = {
  isConfigured,
  createConnectToken,
  listAccounts,
  listTransactions,
};
