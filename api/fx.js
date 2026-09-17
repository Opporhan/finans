/* ============================================================
   api/fx.js — GET: Dolar/Euro/Altın (TL) anlık takip
   ============================================================ */
const CFG = require("../automation/config.js");
const { authorize } = require("./_lib/telegramAuth.js");
const fxRates = require("../automation/fxRates.js");

module.exports = async (req, res) => {
  const auth = authorize(req, CFG);
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false });
    return;
  }

  try {
    const rates = await fxRates.getRates();
    res.status(200).json({ ok: true, generatedAt: new Date().toISOString(), rates });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
