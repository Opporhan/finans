/* ============================================================
   api/_lib/http.js — POST endpoint'leri arasında paylaşılan küçük
   yardımcılar (önceden portfolio.js/crypto-portfolio.js/horizon.js/
   crypto-horizon.js'te birebir kopyalanmıştı).
   ============================================================ */

// Vercel bazen req.body'yi zaten parse eder (özellikle yerel dev sunucusu
// bunu yapmaz) — ikisini de kapsar.
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// Uygulama genelinde ₺ her zaman sayının SONUNA eklenir (bkz.
// miniapp/public/assets/format.js Fmt.try — aynı kural).
function fmtTRY(n) {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + "₺";
}

module.exports = { readJsonBody, fmtTRY };
