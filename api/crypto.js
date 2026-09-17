/* ============================================================
   miniapp/api/crypto.js — GET: kripto watchlist'inin momentum/risk
   panosu. CoinGecko anahtar gerektirmediği ve cömert olduğu için
   (Finnhub'ın aksine) her istekte canlı çekilir — günlük önbelleğe
   gerek yok.
   ============================================================ */
const CFG = require("../automation/config.js");
const { authorize } = require("./_lib/telegramAuth.js");
const { analyzeCryptoWatchlist } = require("../automation/cryptoMarketData.js");

module.exports = async (req, res) => {
  const auth = authorize(req, CFG);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false });
    return;
  }

  try {
    const { watchlist, coins: rawCoins } = await analyzeCryptoWatchlist();
    const coins = rawCoins.sort((a, b) => (b.momentumScore ?? -1) - (a.momentumScore ?? -1));
    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      totalCoins: watchlist.length,
      coins,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
