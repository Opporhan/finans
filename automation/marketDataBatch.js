/* ============================================================
   automation/marketDataBatch.js — Mini App için eşzamanlı tarama
   scan.js/bot.js'in kullandığı sıralı (1.1sn gecikmeli) yolu değiştirmez;
   bu sadece Vercel fonksiyon süresine sığması için CFG.BATCH_CONCURRENCY
   kadar sembolü eşzamanlı çeken ayrı bir yoldur.
   ============================================================ */
const CFG = require("./config.js");
const marketData = require("./marketData.js");
const advisor = require("./advisor.js");
const store = require("./store.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Watchlist'teki TÜM sembolleri (kalifiye olsun olmasın) tam `returns`
// nesnesiyle döner — Mini App'in "Durum" panosu için.
async function analyzeWatchlistConcurrent(watchlist, { concurrency = CFG.BATCH_CONCURRENCY } = {}) {
  const results = [];
  let failCount = 0;
  const batches = chunk(watchlist, concurrency);
  const fundamentalsCache = await store.readJSON("fundamentals", {});

  for (let i = 0; i < batches.length; i++) {
    const settled = await Promise.all(batches[i].map(async (item) => {
      try {
        const { quote, analysis } = await marketData.analyzeSymbol(item.symbol, fundamentalsCache);
        if (analysis.overall == null) return null;
        return {
          symbol: item.symbol,
          name: item.name,
          logo: item.logo || null,
          industry: item.industry || null,
          score: analysis.overall,
          verdict: analysis.verdict.label,
          verdictKey: analysis.verdict.key,
          price: quote.c,
          returns: analysis.returns,
          dividendYield: analysis.dividendYield,
          beta: analysis.beta,
          riskLevel: advisor.riskLevelFor(analysis.beta),
        };
      } catch (e) {
        return null;
      }
    }));
    settled.forEach((r) => (r ? results.push(r) : failCount++));
    if (i < batches.length - 1) await sleep(CFG.REQUEST_DELAY_MS);
  }

  return { results, failCount, totalSymbols: watchlist.length };
}

// Aynı eşzamanlı tarama + advisor.buildAllocation (saf dağıtım mantığı) —
// Mini App'in Yatırım akışı için.
async function selectPortfolioConcurrent({ watchlist, budget, concurrency }) {
  const { results, failCount, totalSymbols } = await analyzeWatchlistConcurrent(watchlist, { concurrency });
  const candidates = results.filter((r) => r.verdictKey === "buy" || r.verdictKey === "strongBuy");
  const rec = advisor.buildAllocation({ candidates, budget });
  return { ...rec, failCount, totalSymbols };
}

module.exports = { analyzeWatchlistConcurrent, selectPortfolioConcurrent };
