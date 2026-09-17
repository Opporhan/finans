/* ============================================================
   automation/coingecko.js — CoinGecko genel API istemcisi (Node)
   Finnhub'ın aksine anahtar/kayıt GEREKTİRMEZ — canlı doğrulandı.
   automation/finnhub.js ile aynı ince istemci deseni.
   ============================================================ */
const API_BASE = "https://api.coingecko.com/api/v3";

async function request(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (res.status === 429) throw new Error("RATE");
  if (!res.ok) throw new Error("HTTP_" + res.status);
  return res.json();
}

// 24s/7g/14g/30g/200g/1y % değişim + 7 günlük saatlik sparkline (risk
// hesabı için) TEK istekte gelir — ekstra çağrı gerekmez. 14g/200g,
// yatırım projeksiyonunda (cryptoAdvisor.js) gerçek bir getiri
// merdiveni kurmak için kullanılır (hisse tarafındaki 1ay/3ay/6ay/1yıl
// merdiveninin kripto eşdeğeri).
const markets = (ids) => request(
  `/coins/markets?vs_currency=usd&ids=${ids.join(",")}` +
  `&price_change_percentage=24h,7d,14d,30d,200d,1y&sparkline=true`
);

// days<=7 için interval verilmez (CoinGecko otomatik saatlik döner);
// daha uzun pencerelerde interval=daily ile gereksiz binlerce saatlik
// nokta yerine günlük çözünürlük istenir.
const marketChart = (id, days) => request(
  `/coins/${id}/market_chart?vs_currency=usd&days=${days}${days > 7 ? "&interval=daily" : ""}`
);

// Piyasa değerine göre en büyük N coin (isim/sembol/logo) — kripto
// haberlerinde watchlist'in 10 coin'i dışında geçen coin'leri (ör.
// Zcash) de gerçek logosuyla tespit edebilmek için (cryptoNewsBatch.js).
const topCoins = (n = 250) => request(
  `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${n}&page=1&sparkline=false`
);

module.exports = { markets, marketChart, topCoins };
