/* ============================================================
   miniapp/api/history.js — GET: geçmişte önerilen portföylerin bugüne
   kadar GERÇEKLEŞEN performansı. api/cron/refresh-fundamentals.js'in
   her gün Blob'a yazdığı `recommendationHistory` anlık görüntülerini,
   ilgili sembollerin BUGÜNKÜ canlı fiyatlarıyla kıyaslar.
   Yeterli geçmiş birikmemiş bir pencere için sahte veri üretmez —
   o pencere yanıtta yer almaz.
   ============================================================ */
const CFG = require("../automation/config.js");
const { authorize } = require("./_lib/telegramAuth.js");
const store = require("../automation/store.js");
const finnhub = require("../automation/finnhub.js");

// Hedef gün sayısı + kaç gün toleransla en yakın anlık görüntünün kabul
// edileceği (cron her gün çalıştığı için normalde ±1 gün yeterli, ama
// geçici bir cron aksaklığına karşı biraz pay bırakılır).
const WINDOWS = [
  { label: "1 ay önce", days: 30, tolerance: 6 },
  { label: "3 ay önce", days: 91, tolerance: 10 },
  { label: "6 ay önce", days: 182, tolerance: 14 },
  { label: "1 yıl önce", days: 365, tolerance: 20 },
];

function daysAgo(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  return Math.round((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function closestSnapshot(history, targetDays, tolerance) {
  let best = null, bestDiff = Infinity;
  for (const entry of history) {
    const diff = Math.abs(daysAgo(entry.date) - targetDays);
    if (diff < bestDiff) { best = entry; bestDiff = diff; }
  }
  return best && bestDiff <= tolerance ? best : null;
}

module.exports = async (req, res) => {
  const auth = authorize(req, CFG);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false });
    return;
  }

  try {
    const history = await store.readJSON("recommendationHistory", []);
    if (!history.length) {
      res.status(200).json({ ok: true, windows: [], hasAnyHistory: false });
      return;
    }

    const matches = WINDOWS
      .map((w) => ({ ...w, entry: closestSnapshot(history, w.days, w.tolerance) }))
      .filter((w) => w.entry);

    if (!matches.length) {
      res.status(200).json({ ok: true, windows: [], hasAnyHistory: true });
      return;
    }

    // Tüm eşleşen anlık görüntülerdeki sembollerin bugünkü fiyatlarını
    // tek seferde topla (aynı sembol birden fazla pencerede olabilir).
    // Az sayıda sembol olduğu için (tipik olarak watchlist büyüklüğünde)
    // paralel çekilir — Finnhub'ın dakika sınırına yaklaşmaz.
    const symbols = [...new Set(matches.flatMap((w) => w.entry.picks.map((p) => p.symbol)))];
    const currentPrices = {};
    await Promise.all(symbols.map(async (symbol) => {
      try {
        const q = await finnhub.quote(symbol);
        currentPrices[symbol] = q?.c ?? null;
      } catch {
        currentPrices[symbol] = null;
      }
    }));
    let currentSpyPrice = null;
    try {
      const q = await finnhub.quote("SPY");
      currentSpyPrice = q?.c ?? null;
    } catch { /* SPY alınamazsa benchmark o pencerede null kalır */ }

    const windows = matches.map((w) => {
      const { entry } = w;
      let weightSum = 0, weightedReturnSum = 0;
      const pickedSymbols = [];
      for (const p of entry.picks) {
        const current = currentPrices[p.symbol];
        pickedSymbols.push(p.symbol);
        if (current == null || !p.price) continue;
        const returnPct = ((current - p.price) / p.price) * 100;
        weightedReturnSum += p.weight * returnPct;
        weightSum += p.weight;
      }
      const realizedReturnPct = weightSum > 0 ? weightedReturnSum / weightSum : null;
      const benchmarkReturnPct = (entry.benchmarkPrice && currentSpyPrice)
        ? ((currentSpyPrice - entry.benchmarkPrice) / entry.benchmarkPrice) * 100
        : null;
      return {
        label: w.label,
        date: entry.date,
        pickedSymbols,
        realizedReturnPct,
        benchmarkReturnPct,
      };
    });

    res.status(200).json({ ok: true, windows, hasAnyHistory: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
