/* ============================================================
   api/cron/refresh-fundamentals.js — Vercel Cron: watchlist'teki
   sembollerin temel verisini (metric + recommendation) günde bir kez
   önceden çekip Blob'a yazar. Bu sayede canlı tarama sadece `quote`
   (anlık fiyat) çeker — Finnhub'ın dakikada 60 istek sınırıyla çok
   daha fazla sembol taranabilir (bkz. automation/marketData.js).
   ============================================================ */
const CFG = require("../../automation/config.js");
const finnhub = require("../../automation/finnhub.js");
const store = require("../../automation/store.js");
const { analyzeWatchlistConcurrent } = require("../../automation/marketDataBatch.js");
const advisor = require("../../automation/advisor.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Geçmiş performans karşılaştırması için nominal (TL tutarından bağımsız)
// bir bütçe — sadece semboller/ağırlıklar önemli, gerçek tutar değil.
const HISTORY_NOMINAL_BUDGET = 1000;
const HISTORY_MAX_ENTRIES = 400; // ~13 ay günlük kayıt

// Benchmark kıyaslaması için S&P 500 (SPY) watchlist'e ek olarak aynı
// döngüde çekilir — tek ekstra sembol, mevcut istek bütçesini önemli
// ölçüde etkilemez.
const BENCHMARK_SYMBOL = "SPY";

async function refreshFundamentals() {
  const watchlist = CFG.getWatchlist();
  const symbols = [...watchlist.map((w) => w.symbol), BENCHMARK_SYMBOL];
  const data = {};
  let failCount = 0;

  for (const symbol of symbols) {
    try {
      const [metricRes, rec] = await Promise.all([
        finnhub.metrics(symbol),
        finnhub.recommendation(symbol),
      ]);
      data[symbol] = {
        metric: metricRes?.metric || {},
        recommendation: rec || [],
        updatedAt: new Date().toISOString(),
      };
    } catch (e) {
      failCount++;
    }
    await sleep(CFG.REQUEST_DELAY_MS);
  }

  // Tüm semboller başarısız olduysa (ör. geçici Finnhub kesintisi/anahtar
  // sorunu) boş veriyle son iyi bilinen önbelleğin üzerine yazmak yerine
  // atlanır — mevcut (dünkü) fundamentals önbelleği korunur.
  if (failCount < symbols.length) {
    await store.writeJSON("fundamentals", data);
  }

  // Geçmiş öneri performansı için günlük anlık görüntü: taze yazılan
  // cache'i kullanarak (sadece `quote` canlı çekilir) o günkü öneriyi
  // hesaplayıp sembol/ağırlık/fiyat olarak saklar. Birkaç hafta sonra
  // api/history.js bu kayıtları bugünkü fiyatlarla kıyaslayabilecek.
  let historyEntry = null;
  try {
    const { results } = await analyzeWatchlistConcurrent(watchlist);
    const candidates = results.filter((r) => r.verdictKey === "buy" || r.verdictKey === "strongBuy");
    const rec = advisor.buildAllocation({ candidates, budget: HISTORY_NOMINAL_BUDGET });
    const spyQuote = await finnhub.quote(BENCHMARK_SYMBOL).catch(() => null);
    historyEntry = {
      date: new Date().toISOString().slice(0, 10),
      picks: rec.picks.map((p) => ({ symbol: p.symbol, weight: p.weight, price: p.price })),
      benchmarkPrice: spyQuote?.c ?? null,
    };
    const history = await store.readJSON("recommendationHistory", []);
    history.push(historyEntry);
    while (history.length > HISTORY_MAX_ENTRIES) history.shift();
    await store.writeJSON("recommendationHistory", history);
  } catch (e) {
    // Geçmiş kaydı en iyi çaba ile yapılır — başarısız olursa günlük
    // fundamentals güncellemesini engellemez.
  }

  return { symbolCount: Object.keys(data).length, failCount, historySaved: !!historyEntry };
}

module.exports = async (req, res) => {
  // CRON_SECRET tanımlı değilse de erişim reddedilir (fail-closed) —
  // aksi halde bu endpoint, secret yapılandırılmayı unutulmuş herhangi bir
  // ortamda URL'i bilen herkes tarafından tetiklenebilir hale gelirdi.
  const auth = req.headers["authorization"];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    const result = await refreshFundamentals();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

module.exports.refreshFundamentals = refreshFundamentals;
