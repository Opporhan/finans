/* ============================================================
   automation/finnhub.js — Finnhub API istemcisi (Node)
   assets/js/api.js'in tarayıcı dışı (localStorage'sız) eşdeğeri.
   ============================================================ */
const APP_CONFIG = require("../assets/js/config.js");
const CFG = require("./config.js");

async function request(path) {
  if (!CFG.FINNHUB_KEY) throw new Error("FINNHUB_KEY .env dosyasında eksik");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${APP_CONFIG.API_BASE}${path}${sep}token=${encodeURIComponent(CFG.FINNHUB_KEY)}`);
  if (res.status === 401 || res.status === 403) throw new Error("BAD_KEY");
  if (res.status === 429) throw new Error("RATE");
  if (!res.ok) throw new Error("HTTP_" + res.status);
  return res.json();
}

const quote = (symbol) => request(`/quote?symbol=${symbol}`);
const profile = (symbol) => request(`/stock/profile2?symbol=${symbol}`);
const metrics = (symbol) => request(`/stock/metric?symbol=${symbol}&metric=all`);
const recommendation = (symbol) => request(`/stock/recommendation?symbol=${symbol}`);

// Belirli bir sembole değil, genel piyasaya bağlı haber akışı —
// category: "general" | "forex" | "crypto" | "merger".
const generalNews = (category) => request(`/news?category=${category}`);

function companyNews(symbol, days = 2) {
  const to = new Date(), from = new Date();
  from.setDate(to.getDate() - days);
  const d = (x) => x.toISOString().slice(0, 10);
  return request(`/company-news?symbol=${symbol}&from=${d(from)}&to=${d(to)}`);
}

module.exports = { quote, profile, metrics, recommendation, companyNews, generalNews };
