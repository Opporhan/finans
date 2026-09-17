/* ============================================================
   automation/marketData.js — Tek sembol için fetch + analiz
   marketDataBatch.js'in kullandığı paylaşılan yol.

   Fiyat (`quote`) HER ZAMAN canlı çekilir. Temel veri (metric +
   recommendation) — ki bunlar zaten günlük granülaritede değişir,
   Finnhub'ın kendisi de bunları gün içinde neredeyse hiç güncellemez —
   önce günlük önbellekten (bkz. api/cron/refresh-fundamentals.js +
   automation/store.js) okunur; önbellek yoksa/eskiyse (ör. ilk kurulum,
   cron henüz çalışmadıysa) o sembol için canlı çekilir (fail-soft).
   Bu, aynı Finnhub istek bütçesiyle çok daha fazla sembol taramayı
   mümkün kılar (sembol başına 3 çağrı yerine 1).
   ============================================================ */
const finnhub = require("./finnhub.js");
const Analyzer = require("../assets/js/analysis.js");

const MAX_CACHE_AGE_MS = 36 * 60 * 60 * 1000; // 36 saat

function isFresh(entry) {
  if (!entry || !entry.updatedAt) return false;
  return Date.now() - new Date(entry.updatedAt).getTime() < MAX_CACHE_AGE_MS;
}

// `fundamentalsCache`: api/cron/refresh-fundamentals.js'in yazdığı
// {symbol: {metric, recommendation, updatedAt}} haritası. Çağıran taraf
// (marketDataBatch.js) bunu BİR KEZ okuyup tüm sembollere paylaştırır —
// sembol başına ayrı bir Blob okuması yapılmaz.
async function analyzeSymbol(symbol, fundamentalsCache) {
  const cached = fundamentalsCache?.[symbol];
  const useCache = isFresh(cached);

  const [quote, metricRes, rec] = await Promise.all([
    finnhub.quote(symbol),
    useCache ? Promise.resolve({ metric: cached.metric }) : finnhub.metrics(symbol).catch(() => ({})),
    useCache ? Promise.resolve(cached.recommendation) : finnhub.recommendation(symbol).catch(() => []),
  ]);
  if (!quote || (quote.c === 0 && quote.pc === 0 && quote.h === 0)) {
    throw new Error("Veri bulunamadı (NOT_FOUND)");
  }
  const m = metricRes?.metric || {};
  return { quote, analysis: Analyzer.analyze(m, quote, rec) };
}

module.exports = { analyzeSymbol };
