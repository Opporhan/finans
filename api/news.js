/* ============================================================
   api/news.js — GET: watchlist'teki hisselerle ilgili son haberler (TR)
   ============================================================ */
const CFG = require("../automation/config.js");
const { authorize } = require("./_lib/telegramAuth.js");
const { fetchWatchlistNews } = require("../automation/newsBatch.js");
const { fetchCryptoNews } = require("../automation/cryptoNewsBatch.js");
const translate = require("../automation/translate.js");
const articleExtract = require("../automation/articleExtract.js");

module.exports = async (req, res) => {
  const auth = authorize(req, CFG);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false });
    return;
  }

  try {
    const watchlist = CFG.getWatchlist();
    // Çeviri/özet önbellekleri BURADA, tek seferde yüklenip iki akışa da
    // paylaştırılır — aksi halde stok ve kripto akışları (aşağıdaki
    // Promise.all ile eşzamanlı) aynı önbelleği bağımsız yükleyip
    // birbirinin o istekte eklediği yeni kayıtları sessizce üzerine
    // yazıyordu (canlıda görülen bir yarış durumuydu).
    const [translationCache, excerptCache] = await Promise.all([
      translate.loadCache(),
      articleExtract.loadCache(),
    ]);
    // Paralel: hisse borusu (sembol başına Finnhub çağrısı, baskın
    // maliyet) ile kripto borusunu (tek çağrı, hızlı) art arda değil
    // eşzamanlı çalıştırıp 60sn fonksiyon süresine rahat sığar.
    const [stockNews, cryptoNews] = await Promise.all([
      fetchWatchlistNews(watchlist, { translationCache, excerptCache }),
      fetchCryptoNews({ translationCache, excerptCache }),
    ]);
    await Promise.all([
      translate.saveCache(translationCache),
      articleExtract.saveCache(excerptCache),
    ]);
    const news = [...stockNews, ...cryptoNews].sort((a, b) => b.datetime - a.datetime);
    res.status(200).json({ ok: true, generatedAt: new Date().toISOString(), news });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
