/* ============================================================
   automation/newsBatch.js — Mini App için watchlist haber akışı
   marketDataBatch.js ile aynı eşzamanlılık/gecikme deseni: watchlist'teki
   her sembol için son şirket haberlerini çeker, birleştirip tarihe göre
   sıralar, başlık/özeti Türkçeye çevirir.
   ============================================================ */
const CFG = require("./config.js");
const finnhub = require("./finnhub.js");
const translate = require("./translate.js");
const articleExtract = require("./articleExtract.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const PER_SYMBOL_LIMIT = 5;
const TOTAL_LIMIT = 20;
const LOOKBACK_DAYS = 4;
const ENRICH_CONCURRENCY = 6;
// 18'den 40'a çıkarıldı: tek cümlelik (~20 kelime) özetler görsel olarak
// hâlâ "çok kısa" hissettiriyordu (canlı örnekte görüldü) — artık bu eşiğin
// altındakiler de kaynak makaleden zenginleştirilir.
const RICH_SUMMARY_WORD_COUNT = 40;

function wordCount(text) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

async function fetchWatchlistNews(watchlist, {
  concurrency = CFG.BATCH_CONCURRENCY,
  excerptCache: sharedExcerptCache,
  translationCache: sharedTranslationCache,
} = {}) {
  const items = [];
  const batches = chunk(watchlist, concurrency);

  for (let i = 0; i < batches.length; i++) {
    const settled = await Promise.all(batches[i].map(async (entry) => {
      try {
        const news = await finnhub.companyNews(entry.symbol, LOOKBACK_DAYS);
        return (news || [])
          .filter((n) => n.headline && n.datetime)
          .slice(0, PER_SYMBOL_LIMIT)
          .map((n) => {
            const summary = articleExtract.sanitizeSummary(n.summary || "");
            return {
              type: "stock",
              symbol: entry.symbol,
              // Gerçek şirket logosu (`entry.logo`, Finnhub profile2'den tek
              // seferlik çekilmiş, kare). Finnhub'ın haber `image` alanı
              // (kaynağın geniş banner'ı) fallback olarak denendi ama
              // cryptoNewsBatch.js'teki aynı gerekçeyle kullanılmıyor —
              // küçük ikon için tasarlanmadığından güvenilmez görünüyor.
              logo: entry.logo || null,
              headline: n.headline,
              summary,
              truncated: articleExtract.looksTruncated(summary),
              source: n.source || "",
              url: n.url || "",
              datetime: n.datetime,
            };
          });
      } catch {
        return [];
      }
    }));
    settled.forEach((arr) => items.push(...arr));
    if (i < batches.length - 1) await sleep(CFG.REQUEST_DELAY_MS);
  }

  // Bazı kaynaklar (ör. ChartMill) aynı genel "günün hareketli hisseleri"
  // makalesini watchlist'teki her sembole etiketliyor — bu, akışı aynı
  // başlığın kopyalarıyla dolduruyor. Başlığa göre tekilleştirilir, ilk
  // (en yeni) görülen sembolle tutulur.
  const seenHeadlines = new Set();
  const deduped = items
    .sort((a, b) => b.datetime - a.datetime)
    .filter((item) => {
      const key = item.headline.trim().toLowerCase();
      if (seenHeadlines.has(key)) return false;
      seenHeadlines.add(key);
      return true;
    });
  // Finnhub'ın verdiği özetler kaynağa göre çok değişken: bazıları tam
  // paragraf, bazıları tek cümlelik teaser. Bilgilendirici ("zengin")
  // özeti olanlara öncelik verilir — her iki alt grup da tekilleştirmeden
  // miras kalan tarih sırasını korur, sadece kısa olanlar yetmediğinde
  // devreye girer. Hiçbir metin uydurulmaz, sadece SEÇİM önceliklenir.
  const rich = deduped.filter((item) => wordCount(item.summary) >= RICH_SUMMARY_WORD_COUNT);
  const thin = deduped.filter((item) => wordCount(item.summary) < RICH_SUMMARY_WORD_COUNT);
  const top = [...rich, ...thin].slice(0, TOTAL_LIMIT);

  // Kısa ("thin") özetler kaynağın kendi haber sayfasından gerçek metinle
  // zenginleştirilir (bkz. articleExtract.js) — zaten yeterince uzun olan
  // ("rich") özetler tekrar çekilmez, gereksiz gecikme/istek olmasın.
  // Önbellek çağıran tarafından (api/news.js) paylaşılmışsa onu kullanıp
  // kaydetmeyi ÇAĞIRANA bırakır — aksi halde stok ve kripto akışları aynı
  // önbelleği eşzamanlı yükleyip birbirinin yeni eklediği kayıtları
  // sessizce üzerine yazardı (canlıda görülen bir yarış durumuydu).
  const excerptCache = sharedExcerptCache || await articleExtract.loadCache();
  const thinItems = top.filter((item) => (wordCount(item.summary) < RICH_SUMMARY_WORD_COUNT || item.truncated) && item.url);
  const enrichBatches = chunk(thinItems, ENRICH_CONCURRENCY);
  for (const batch of enrichBatches) {
    await Promise.all(batch.map(async (item) => {
      const excerpt = await articleExtract.excerptFor(item.url, item.headline, excerptCache);
      if (excerpt && wordCount(excerpt) > wordCount(item.summary)) {
        item.summary = excerpt;
        item.truncated = false; // artık kaynağın kırpılmış teaser'ı değil
      }
    }));
  }
  if (!sharedExcerptCache) await articleExtract.saveCache(excerptCache);

  // Tüm başlık+özetler TEK bir toplu çeviri çağrısında gönderilir (bkz.
  // translate.js dosya başı not) — DeepL'in ard arda çok sayıda ayrı
  // istekte takıldığı hız sınırına hiç yaklaşılmaz. Çeviri sonuçları
  // önbellekli: aynı başlık/özet bir sonraki yenilemede ağ isteği tüketmez.
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

module.exports = { fetchWatchlistNews };
