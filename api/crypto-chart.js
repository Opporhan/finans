/* ============================================================
   miniapp/api/crypto-chart.js — GET: bir coin'in gerçek geçmiş fiyat
   serisi. ?id=bitcoin&days=30
   ============================================================ */
const CFG = require("../automation/config.js");
const { authorize } = require("./_lib/telegramAuth.js");
const coingecko = require("../automation/coingecko.js");

const ALLOWED_DAYS = new Set([7, 30, 90, 365]);

module.exports = async (req, res) => {
  const auth = authorize(req, CFG);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false });
    return;
  }

  const { id } = req.query || {};
  const days = Number((req.query || {}).days);
  if (!id || typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) {
    res.status(400).json({ ok: false, error: "Geçersiz id" });
    return;
  }
  if (!ALLOWED_DAYS.has(days)) {
    res.status(400).json({ ok: false, error: "Geçersiz days (7, 30, 90 ya da 365 olmalı)" });
    return;
  }

  try {
    const data = await coingecko.marketChart(id, days);
    res.status(200).json({ ok: true, prices: data.prices || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
