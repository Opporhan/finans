/* ============================================================
   miniapp/api/horizon.js — POST: serbest süreye göre getiri hesabı
   Body: { rec: <portfolio.js'ten dönen rec>, months: number }
   months: 1-120 arası (10 yıla kadar). ≤12 ay gerçek veriden
   interpolasyon, >12 ay tüm mevcut verilerden çıkan bir algoritma ile
   projeksiyon (bkz. automation/advisor.js applyDuration).
   Ağ çağrısı yapmaz — sadece automation/advisor.js'in saf applyDuration'ını çağırır.
   ============================================================ */
const CFG = require("../automation/config.js");
const { authorize } = require("./_lib/telegramAuth.js");
const advisor = require("../automation/advisor.js");
const store = require("../automation/store.js");
const { readJsonBody } = require("./_lib/http.js");

const MIN_MONTHS = 1;
const MAX_MONTHS = 120;

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

  const { rec } = body;
  const months = Number(body.months);
  if (!rec || !Array.isArray(rec.picks)) {
    res.status(400).json({ ok: false, error: "Geçersiz rec" });
    return;
  }
  if (!Number.isFinite(months) || months < MIN_MONTHS || months > MAX_MONTHS) {
    res.status(400).json({ ok: false, error: `Süre ${MIN_MONTHS}-${MAX_MONTHS} ay arasında olmalı` });
    return;
  }

  try {
    const enriched = advisor.applyDuration(rec, months);
    const fundamentalsCache = await store.readJSON("fundamentals", {});
    enriched.benchmarkReturnPct = advisor.benchmarkReturnPct(fundamentalsCache, months);
    res.status(200).json({ ok: true, rec: enriched });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
