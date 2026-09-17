/* ============================================================
   miniapp/api/portfolio.js — POST: aylık yatırım tutarı -> dağıtım
   Body: { budgetTRY: number }
   ============================================================ */
const CFG = require("../automation/config.js");
const { authorize } = require("./_lib/telegramAuth.js");
const { selectPortfolioConcurrent } = require("../automation/marketDataBatch.js");
const fx = require("../automation/fx.js");
const { readJsonBody, fmtTRY } = require("./_lib/http.js");

module.exports = async (req, res) => {
  const auth = authorize(req, CFG);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST gerekli" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    res.status(400).json({ ok: false, error: "Geçersiz JSON gövdesi" });
    return;
  }

  const budgetTRY = Number(body.budgetTRY);
  if (!Number.isFinite(budgetTRY) || budgetTRY <= 0) {
    res.status(400).json({ ok: false, error: "Geçersiz tutar" });
    return;
  }
  try {
    const rate = await fx.getUsdTryRate();
    const budgetUSD = Math.round((budgetTRY / rate) * 100) / 100;
    const fxNote = `Girilen aylık yatırım: ${fmtTRY(budgetTRY)} (kur: 1 USD ≈ ${rate.toFixed(2)} TL)`;

    const watchlist = CFG.getWatchlist();
    const rec = await selectPortfolioConcurrent({ watchlist, budget: budgetUSD });
    rec.fxRate = rate;
    rec.fxNote = fxNote;

    res.status(200).json({ ok: true, rec });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
