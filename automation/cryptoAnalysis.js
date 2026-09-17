/* ============================================================
   automation/cryptoAnalysis.js — Kripto momentum skoru + risk
   Hisse skorundan (assets/js/analysis.js) BİLİNÇLİ OLARAK bağımsız:
   kriptonun F/K, ROE, borç gibi temel verisi yok — sadece fiyat
   momentumu var. Aynı 0-100 ölçeği kullanılır (görsel tutarlılık için,
   score-ring bileşeni yeniden kullanılabilsin diye) ama bantlar farklı
   kelimelerle etiketlenir ki hisse skoruyla aynı titizlikte
   hesaplandığı yanlış izlenimi verilmesin.
   ============================================================ */

// Skor -> momentum bandı (alt sınır dahil). `key` stabil, `label`
// kullanıcıya gösterilen metin — hisse VERDICT_BANDS'teki kelimelerle
// (Çok İyi/İyi/Normal...) KASITLI OLARAK çakışmaz.
const MOMENTUM_BANDS = [
  { min: 75, key: "strongUp", label: "Güçlü Yükseliş", color: "var(--green)" },
  { min: 60, key: "up", label: "Yükseliş", color: "var(--green-d)" },
  { min: 45, key: "neutral", label: "Nötr", color: "var(--yellow)" },
  { min: 32, key: "down", label: "Düşüş", color: "var(--orange)" },
  { min: 0, key: "strongDown", label: "Sert Düşüş", color: "var(--red)" },
];

// [çok iyi, iyi, orta, zayıf] eşikleri — hisse tarafındaki score()
// mantığıyla aynı şekil, kriptonun çok daha büyük tipik salınımlarına
// göre ayarlanmış farklı sayılar.
const THRESHOLDS = {
  d7: [15, 5, -5, -15],
  d30: [40, 15, -15, -40],
  y1: [100, 30, -20, -50],
};
const WEIGHTS = { d7: 0.25, d30: 0.35, y1: 0.4 };

function bandScore(v, thresholds) {
  if (v == null || !Number.isFinite(v)) return null;
  const [a, b, c, d] = thresholds;
  return v >= a ? 92 : v >= b ? 74 : v >= c ? 55 : v >= d ? 38 : 18;
}

function momentumScore(changes) {
  let weightSum = 0, scoreSum = 0;
  for (const key of Object.keys(WEIGHTS)) {
    const s = bandScore(changes[key], THRESHOLDS[key]);
    if (s == null) continue;
    weightSum += WEIGHTS[key];
    scoreSum += s * WEIGHTS[key];
  }
  return weightSum > 0 ? Math.round(scoreSum / weightSum) : null;
}

function momentumBandFor(score) {
  if (score == null) return { key: null, label: "Veri Yetersiz", color: "var(--muted)" };
  return MOMENTUM_BANDS.find((b) => score >= b.min) || MOMENTUM_BANDS[MOMENTUM_BANDS.length - 1];
}

// 7 günlük saatlik sparkline'dan basit bir oynaklık ölçüsü: haftalık
// bandın (max-min) ortalama fiyata oranı. Hem kategorik bant (rozet
// için) hem HAM sayı (cryptoAdvisor.js'in risk-ayarlı ağırlıklandırması
// için — hisse tarafındaki beta'nın sayısal eşdeğeri) döner.
function volatilityFromSparkline(prices) {
  if (!prices || prices.length < 2) return null;
  const max = Math.max(...prices), min = Math.min(...prices);
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  if (mean <= 0) return null;
  return (max - min) / mean;
}

// Hisse tarafının Düşük/Orta/Yüksek beta bantlarıyla AYNI isimler
// KASITLI OLARAK kullanılmaz — kriptonun "düşük" oynaklığı bile çoğu
// hissenin "yüksek" oynaklığını geçer, aynı etiket yanıltıcı olurdu.
function riskLevelFor(volatilityRatio) {
  if (volatilityRatio == null) return null;
  if (volatilityRatio < 0.1) return "Orta";
  if (volatilityRatio < 0.25) return "Yüksek";
  return "Çok Yüksek";
}

// Yatırım projeksiyonu (cryptoAdvisor.js) için gerçek getiri merdiveni —
// hisse tarafındaki returnsFromMetric ile aynı fikir, farklı dönemler
// (CoinGecko 7g/14g/30g/200g/1y veriyor; hisse tarafında YTD/6ay var,
// kriptoda yok — 200g ile 1y arası gerçek noktalarla dolduruluyor).
function returnsFromRow(row) {
  return {
    d7: row.price_change_percentage_7d_in_currency ?? null,
    d14: row.price_change_percentage_14d_in_currency ?? null,
    d30: row.price_change_percentage_30d_in_currency ?? null,
    d200: row.price_change_percentage_200d_in_currency ?? null,
    y1: row.price_change_percentage_1y_in_currency ?? null,
  };
}

// CoinGecko /coins/markets tek satırını + watchlist'teki eşleşen
// girişi (kategori bilgisi için) alıp görüntülenebilir analiz
// nesnesine çevirir.
function analyzeCoin(row, watchlistEntry) {
  const returns = returnsFromRow(row);
  const changes = {
    h24: row.price_change_percentage_24h_in_currency ?? null,
    d7: returns.d7,
    d30: returns.d30,
    y1: returns.y1,
  };
  const score = momentumScore(changes);
  const band = momentumBandFor(score);
  const volatilityRatio = volatilityFromSparkline(row.sparkline_in_7d?.price);
  const riskLevel = riskLevelFor(volatilityRatio);
  return {
    id: row.id,
    symbol: (row.symbol || "").toUpperCase(),
    name: row.name,
    category: watchlistEntry?.category || null,
    logo: row.image || null,
    price: row.current_price,
    changes,
    returns,
    momentumScore: score,
    momentumKey: band.key,
    momentumLabel: band.label,
    momentumColor: band.color,
    volatilityRatio,
    riskLevel,
  };
}

module.exports = { analyzeCoin, momentumScore, riskLevelFor, volatilityFromSparkline, MOMENTUM_BANDS };
