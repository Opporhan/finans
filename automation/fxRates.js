/* ============================================================
   automation/fxRates.js — Döviz + değerli maden takip verisi (TL bazında)
   Anahtar gerektirmeyen Truncgil API'sini kullanır (Türkiye piyasası
   alış/satış fiyatları). automation/fx.js'teki USD/TRY (Frankfurter,
   portföy hesaplarında kullanılıyor) ile KARIŞTIRILMASIN — bu ayrı,
   sadece Mini App'teki döviz/altın takip penceresi için.
   ============================================================ */
const URL = "https://finans.truncgil.com/today.json";

// Truncgil'in listelediği TÜM döviz kodları (kur bazlı, TL karşılığı).
const CURRENCY_CODES = [
  "USD", "EUR", "GBP", "CHF", "CAD", "RUB", "AED", "AUD", "DKK", "SEK",
  "NOK", "JPY", "KWD", "ZAR", "BHD", "LYD", "SAR", "IQD", "ILS", "INR",
  "MXN", "HUF", "NZD", "BRL", "IDR", "CZK", "PLN", "RON", "CNY", "ARS",
  "ALL", "AZN", "BAM", "CLP", "COP", "CRC", "DZD", "EGP", "HKD", "ISK",
  "KRW", "KZT", "LBP", "LKR", "MAD", "MDL", "MKD", "MYR", "OMR", "PEN",
  "PHP", "PKR", "QAR", "RSD", "SGD", "SYP", "THB", "TWD", "UAH", "UYU",
  "GEL", "TND", "BGN", "VND",
];

// Değerli madenler — TL bazında olanlar (Truncgil'deki "ons" USD bazında
// döndüğü için burada YOK, diğerleriyle karıştırılırsa yanıltıcı olurdu).
const METAL_KEYS = [
  ["gram-altin", "Gram Altın"],
  ["gram-has-altin", "Gram Has Altın"],
  ["ceyrek-altin", "Çeyrek Altın"],
  ["yarim-altin", "Yarım Altın"],
  ["tam-altin", "Tam Altın"],
  ["cumhuriyet-altini", "Cumhuriyet Altını"],
  ["ata-altin", "Ata Altın"],
  ["14-ayar-altin", "14 Ayar Altın"],
  ["18-ayar-altin", "18 Ayar Altın"],
  ["22-ayar-bilezik", "22 Ayar Bilezik"],
  ["gumus", "Gram Gümüş"],
  ["gram-platin", "Gram Platin"],
  ["gram-paladyum", "Gram Paladyum"],
];

// Truncgil sayıları TR biçiminde döner ("6.771,48" — binlik nokta,
// ondalık virgül); JS'in Number()'ı bunu doğrudan anlamaz.
function parseTrNumber(s) {
  if (typeof s !== "string") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function pick(data, key) {
  const row = data?.[key];
  if (!row) return null;
  return { buy: parseTrNumber(row["Alış"]), sell: parseTrNumber(row["Satış"]) };
}

async function getRates() {
  const res = await fetch(URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("Döviz verisi alınamadı: HTTP " + res.status);
  const data = await res.json();

  const currencies = CURRENCY_CODES
    .map((code) => {
      const rate = pick(data, code);
      return rate ? { code, ...rate } : null;
    })
    .filter(Boolean);

  const metals = METAL_KEYS
    .map(([key, label]) => {
      const rate = pick(data, key);
      return rate ? { key, label, ...rate } : null;
    })
    .filter(Boolean);

  return { updatedAt: data?.Update_Date || null, currencies, metals };
}

module.exports = { getRates };
