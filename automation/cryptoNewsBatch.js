/* ============================================================
   automation/cryptoNewsBatch.js — Mini App için genel kripto haber akışı
   newsBatch.js ile AYNI desen (tekilleştirme, "zengin özet" önceliği,
   çeviri gruplama) ama sembol başına değil TEK bir genel piyasa
   çağrısıyla çalışır (Finnhub'ın /news?category=crypto uç noktası
   belirli bir coin'e değil genel kripto piyasasına bağlıdır — canlı
   doğrulandı, `related` alanı boş geliyor). Bilerek newsBatch.js'ten
   bağımsız tutulur ki biri bozulursa diğerini etkilemesin.

   Görsel: başlık+özet metninde GERÇEKTEN geçen bir varlık aranır —
   sadece watchlist'teki 10 coin değil, piyasa değerine göre en büyük
   250 coin (CoinGecko, tek istek) + haberlerde sık geçen ~20 kurum
   (automation/cryptoCompanies.json, Coinbase/Circle/Deutsche Bank vb.)
   taranır. Coin eşleşirse CoinGecko'nun gerçek logosu, kurum eşleşirse
   Google'ın favicon servisinden (ücretsiz, anahtarsız, kare PNG —
   canlı doğrulandı) o kurumun gerçek ikonu kullanılır. Hiçbiri
   eşleşmezse (tek bir varlığa bağlı olmayan genel piyasa/düzenleme
   haberi) nötr "Kripto" rozetine (🪙) düşülür — asla uydurma bir
   görsel atanmaz.
   ============================================================ */
const finnhub = require("./finnhub.js");
const coingecko = require("./coingecko.js");
const translate = require("./translate.js");
const articleExtract = require("./articleExtract.js");
const companies = require("./cryptoCompanies.json");

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const TOTAL_LIMIT = 15;
const TOP_COINS_COUNT = 250;
const ENRICH_CONCURRENCY = 6;
// bkz. newsBatch.js aynı sabitin yanındaki not.
const RICH_SUMMARY_WORD_COUNT = 40;

function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Piyasa değerine göre en büyük 250 coin — GERÇEK isim/sembol/logo
// (tek CoinGecko isteği). Başarısız olursa boş liste döner — tespit
// devre dışı kalır, haberler yine de "Kripto" rozetiyle akmaya devam
// eder (haber akışını asla kesmez).
async function buildCoinLookup() {
  try {
    const rows = await coingecko.topCoins(TOP_COINS_COUNT);
    return rows
      .filter((r) => r.image)
      .map((r) => ({ symbol: r.symbol.toUpperCase(), name: r.name, logo: r.image }));
  } catch {
    return [];
  }
}

// Haberlerde sık geçen kurumlar (Coinbase, Circle, Deutsche Bank vb.) —
// Google'ın ücretsiz favicon servisi ile gerçek, kare ikonları.
function buildCompanyLookup() {
  return companies.map((c) => ({
    symbol: c.name,
    name: c.name,
    logo: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(c.domain)}&sz=128`,
  }));
}

// En büyük 250 coin arasında 1-2 harfli sembolü olanlar var (ör. "a",
// "u", "ai") — bunlar İngilizce metinde (çeviriden önce taranıyor)
// sıradan kelimelerle (ör. "a") kelime-sınırı eşleşmesine bile takılıp
// yanlış pozitif üretiyor (canlı test edildi). Sadece 3+ karakterli
// sembol/isimler eşleştirilir — gerçek coin adları zaten neredeyse
// hiçbir zaman bu kadar kısa değil, tespit kalitesini etkilemez.
const MIN_MATCH_LENGTH = 3;

function matches(text, entity) {
  if (!text) return false;
  if (entity.name.length >= MIN_MATCH_LENGTH) {
    // Kısa büyük-harf kısaltmalar (FCA, SEC, IMF...) küçük harfle de
    // eşleşirse yanlış pozitif riski yüksek ("sec" -> "a sec" gibi) —
    // gerçek haberlerde bu kısaltmalar neredeyse hep büyük harfle
    // yazılır, o yüzden bunlar büyük/küçük harf duyarlı eşleştirilir.
    const isAcronym = entity.name.length <= 5 && entity.name === entity.name.toUpperCase();
    const nameRe = new RegExp(`\\b${escapeRegex(entity.name)}\\b`, isAcronym ? "" : "i");
    if (nameRe.test(text)) return true;
  }
  if (entity.symbol && entity.symbol !== entity.name && entity.symbol.length >= MIN_MATCH_LENGTH) {
    const symRe = new RegExp(`\\b${escapeRegex(entity.symbol)}\\b`);
    if (symRe.test(text)) return true;
  }
  return false;
}

// Metinde (İngilizce orijinal, çeviriden ÖNCE) bir coin ya da kurum
// GERÇEKTEN geçiyor mu diye kelime sınırıyla bakar. Öncelik: başlıktaki
// coin > başlıktaki kurum > özetteki coin > özetteki kurum — asıl konu
// genelde başlıkta olur, kurum genelde ikincil bağlamdır.
function detectEntity(headline, summary, coins, companyList) {
  return (
    coins.find((c) => matches(headline, c)) ||
    companyList.find((c) => matches(headline, c)) ||
    coins.find((c) => matches(summary, c)) ||
    companyList.find((c) => matches(summary, c)) ||
    null
  );
}

// Finnhub'ın /news?category=crypto uç noktası bazen kripto/piyasayla hiçbir
// ilgisi olmayan genel yapay zeka/teknoloji haberlerini de veriyor (canlıda
// görüldü: Cointelegraph'ın yayınladığı, hiçbir finansal/piyasa boyutu
// olmayan bir "OpenAI model davranışı" haberi). Bilinen bir coin/kurum
// eşleşmesi YOKSA, en az bir finans/kripto anahtar kelimesi geçmiyorsa
// haber tamamen elenir — "Kripto" genel rozeti gerçekten alakasız içeriğin
// çöp kutusu olmasın diye.
const FINANCE_RELEVANCE_RE = /\b(crypto|bitcoin|btc|ethereum|blockchain|token|stablecoin|defi|nft|altcoin|web3|wallet|mining|miner|halving|exchange|coinbase|binance|kraken|sec|cftc|etf|regulat|market|invest|trading|trader|price|rally|rate hike|interest rate|fed\b|federal reserve|stock|shares|ipo|lawsuit|fraud|bank|treasury|tax)\b/i;

function isFinanceRelevant(match, headline, summary) {
  return !!match || FINANCE_RELEVANCE_RE.test(`${headline} ${summary}`);
}

async function fetchCryptoNews({ excerptCache: sharedExcerptCache, translationCache: sharedTranslationCache } = {}) {
  let raw;
  try {
    raw = await finnhub.generalNews("crypto");
  } catch {
    return [];
  }

  const coins = await buildCoinLookup();
  const companyList = buildCompanyLookup();

  const items = (raw || [])
    .filter((n) => n.headline && n.datetime)
    .filter((n) => {
      const match = detectEntity(n.headline, n.summary || "", coins, companyList);
      return isFinanceRelevant(match, n.headline, n.summary || "");
    })
    .map((n) => {
      const match = detectEntity(n.headline, n.summary || "", coins, companyList);
      const summary = articleExtract.sanitizeSummary(n.summary || "");
      return {
        type: "crypto",
        symbol: match ? match.symbol : "Kripto",
        logo: match ? match.logo : null,
        headline: n.headline,
        summary,
        truncated: articleExtract.looksTruncated(summary),
        source: n.source || "",
        url: n.url || "",
        datetime: n.datetime,
      };
    });

  const seenHeadlines = new Set();
  const deduped = items
    .sort((a, b) => b.datetime - a.datetime)
    .filter((item) => {
      const key = item.headline.trim().toLowerCase();
      if (seenHeadlines.has(key)) return false;
      seenHeadlines.add(key);
      return true;
    });

  const rich = deduped.filter((item) => wordCount(item.summary) >= RICH_SUMMARY_WORD_COUNT);
  const thin = deduped.filter((item) => wordCount(item.summary) < RICH_SUMMARY_WORD_COUNT);
  const top = [...rich, ...thin].slice(0, TOTAL_LIMIT);

  // bkz. newsBatch.js aynı bloğun yanındaki not (paylaşılan önbellek
  // verilmişse yükleme/kaydetme çağırana bırakılır — yarış durumunu önler).
  const excerptCache = sharedExcerptCache || await articleExtract.loadCache();
  const thinItems = top.filter((item) => (wordCount(item.summary) < RICH_SUMMARY_WORD_COUNT || item.truncated) && item.url);
  const enrichBatches = chunk(thinItems, ENRICH_CONCURRENCY);
  for (const batch of enrichBatches) {
    await Promise.all(batch.map(async (item) => {
      const excerpt = await articleExtract.excerptFor(item.url, item.headline, excerptCache);
      if (excerpt && wordCount(excerpt) > wordCount(item.summary)) {
        item.summary = excerpt;
        item.truncated = false;
      }
    }));
  }
  if (!sharedExcerptCache) await articleExtract.saveCache(excerptCache);

  // bkz. newsBatch.js aynı bloğun yanındaki not (tek toplu çeviri isteği).
  const translationCache = sharedTranslationCache || await translate.loadCache();
  const texts = top.flatMap((item) => [item.headline, item.summary]);
  const translated = await translate.translateBatch(texts, translationCache);
  top.forEach((item, i) => {
    item.headline = translated[i * 2];
    item.summary = translated[i * 2 + 1];
  });
  if (!sharedTranslationCache) await translate.saveCache(translationCache);

  return top;
}

module.exports = { fetchCryptoNews };
