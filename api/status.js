/* ============================================================
   miniapp/api/status.js — GET: watchlist'teki 18 hissenin tam panosu
   ============================================================ */
const CFG = require("../automation/config.js");
const { authorize } = require("./_lib/telegramAuth.js");
const { analyzeWatchlistConcurrent } = require("../automation/marketDataBatch.js");

module.exports = async (req, res) => {
  const auth = authorize(req, CFG);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false });
    return;
  }

  try {
    const watchlist = CFG.getWatchlist();
    const { results, failCount, totalSymbols } = await analyzeWatchlistConcurrent(watchlist);
    results.sort((a, b) => b.score - a.score);
    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      totalSymbols,
      failCount,
      symbols: results,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
