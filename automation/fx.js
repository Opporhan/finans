/* ============================================================
   automation/fx.js — USD/TRY kur bilgisi
   Anahtar gerektirmeyen ücretsiz Frankfurter API'sini kullanır.
   ============================================================ */

async function getUsdTryRate() {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=TRY");
  if (!res.ok) throw new Error("Kur bilgisi alınamadı");
  const data = await res.json().catch(() => ({}));
  const rate = data?.rates?.TRY;
  if (!rate) throw new Error("Kur verisi eksik");
  return rate;
}

module.exports = { getUsdTryRate };
