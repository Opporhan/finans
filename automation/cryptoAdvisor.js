/* ============================================================
   automation/cryptoAdvisor.js — Kripto Yatırım Danışmanı
   automation/advisor.js'in kripto eşdeğeri — AYNI matematiksel
   yöntemler (kategori tavanlı seçim, risk-ayarlı ağırlıklandırma,
   tekli coin ağırlık tavanı, ≤12 ay için gerçek verilerin doğrusal
   interpolasyonu, >12 ay için süre-ağırlıklı yıllıklaştırılmış oranın
   bileşik faizle projeksiyonu) ama kriptoya özgü iki fark var:
   - Temettü yok (dividendContribution eşdeğeri YOK).
   - "Sektör" yerine gerçek CoinGecko kategorisi (Akıllı Kontrat
     Platformu, Değer Saklama, vb. — automation/cryptoWatchlist.json).
   - Beta yerine 7 günlük saatlik seriden hesaplanan HAM oynaklık oranı
     (automation/cryptoAnalysis.js'teki volatilityRatio) risk-ayarlı
     ağırlıklandırmada kullanılır.
   Bilerek advisor.js'ten bağımsız tutulur (aynı gerekçe: newsBatch.js/
   cryptoNewsBatch.js ayrımı — biri bozulursa diğerini etkilemesin).
   ============================================================ */

// 10 coin'lik küçük evrende ~8-12 hisse pozisyonu mantığı ölçeklenmez;
// akademik "diversifikasyon faydası" 5-6 pozisyonda zaten büyük ölçüde
// alınmış olur. Kategori tavanı 2 — automation/advisor.js'teki
// MAX_PER_INDUSTRY ile aynı mantık: 4 coin "Akıllı Kontrat Platformu"
// kategorisinde olduğu için tavan olmadan portföy tek temaya
// yoğunlaşabilirdi (hisse tarafındaki 7/18 Yarı İletken örneğiyle
// birebir aynı risk).
const PORTFOLIO_TOP_N = 6;
const MAX_PER_CATEGORY = 2;
const MAX_WEIGHT_PER_COIN = 0.30;
// Oynaklık oranı eksik/hesaplanamamış bir coin için varsayılan —
// automation/cryptoAnalysis.js'teki "Yüksek" bandının alt sınırına
// yakın, ne ödül ne ceza; ne çok iyimser ne çok kötümser bir orta yol.
const DEFAULT_VOLATILITY = 0.15;

// automation/advisor.js'teki capWeights ile BİREBİR aynı algoritma
// (saf, genel amaçlı matematik — kasıtlı olarak burada da tutuluyor,
// modüller birbirinden bağımsız kalsın diye).
function capWeights(rawWeights, maxWeight) {
  const n = rawWeights.length;
  if (n === 0) return [];
  if (maxWeight * n < 1 - 1e-9) return rawWeights.map(() => 1 / n);

  const result = new Array(n).fill(null);
  let cappedTotal = 0;
  let freeIdx = rawWeights.map((_, i) => i);
  let changed = true;
  while (changed) {
    changed = false;
    const freeTotal = freeIdx.reduce((s, i) => s + rawWeights[i], 0);
    const budgetLeft = 1 - cappedTotal;
    const stillFree = [];
    for (const i of freeIdx) {
      const candidateWeight = freeTotal > 0 ? budgetLeft * (rawWeights[i] / freeTotal) : 0;
      if (candidateWeight > maxWeight + 1e-9) {
        result[i] = maxWeight;
        cappedTotal += maxWeight;
        changed = true;
      } else {
        stillFree.push(i);
      }
    }
    freeIdx = stillFree;
  }
  const freeTotal = freeIdx.reduce((s, i) => s + rawWeights[i], 0);
  const budgetLeft = 1 - cappedTotal;
  for (const i of freeIdx) result[i] = freeTotal > 0 ? budgetLeft * (rawWeights[i] / freeTotal) : 0;
  return result;
}

function riskLevelFor(volatilityRatio) {
  if (volatilityRatio == null) return null;
  if (volatilityRatio < 0.1) return "Orta";
  if (volatilityRatio < 0.25) return "Yüksek";
  return "Çok Yüksek";
}

// Saf fonksiyon: kalifiye adaylardan kategori tavanına uyan en yüksek
// momentum skorlu PORTFOLIO_TOP_N tanesini seçip yatırımı risk-ayarlı
// (oynaklığa bölünmüş skor) ağırlıklandırarak, tekli coin tavanına göre
// sınırlandırarak dağıtır.
function buildAllocation({ candidates, budget }) {
  if (!candidates.length) {
    return { picks: [], allCandidates: [], qualifiedCount: 0, budget };
  }

  candidates.sort((a, b) => b.momentumScore - a.momentumScore);
  const qualifiedCount = candidates.length;

  const categoryCounts = {};
  const picks = [];
  for (const c of candidates) {
    if (picks.length >= PORTFOLIO_TOP_N) break;
    const key = c.category || "Diğer";
    const count = categoryCounts[key] || 0;
    if (count >= MAX_PER_CATEGORY) continue;
    categoryCounts[key] = count + 1;
    picks.push(c);
  }

  const riskAdjustedScore = (p) => p.momentumScore / (1 + (p.volatilityRatio ?? DEFAULT_VOLATILITY));
  const rawScores = picks.map(riskAdjustedScore);
  const scoreSum = rawScores.reduce((s, v) => s + v, 0);
  const rawWeights = rawScores.map((s) => s / scoreSum);

  const cappedWeights = capWeights(rawWeights, MAX_WEIGHT_PER_COIN);

  picks.forEach((p, i) => {
    p.weight = cappedWeights[i];
    p.dollars = budget * p.weight;
    p.impliedUnits = p.price > 0 ? p.dollars / p.price : null;
  });

  const portfolioVolatility = picks.reduce((s, p) => s + p.weight * (p.volatilityRatio ?? DEFAULT_VOLATILITY), 0);
  const portfolioRiskLevel = riskLevelFor(portfolioVolatility);

  return { picks, allCandidates: candidates, qualifiedCount, budget, portfolioVolatility, portfolioRiskLevel };
}

function findAlternatives(picks, allCandidates, months, max = 2) {
  if (!allCandidates) return null;
  const pickedIds = new Set(picks.map((p) => p.id));
  const pool = allCandidates
    .filter((c) => !pickedIds.has(c.id))
    .map((c) => ({ symbol: c.symbol, returnPct: estimateReturnPct(c, months) }))
    .filter((c) => c.returnPct != null && c.returnPct > 0);
  if (!pool.length) return null;
  return pool.sort((a, b) => b.returnPct - a.returnPct).slice(0, max);
}

// Gerçek getiri merdiveni: CoinGecko'nun verdiği 7g/14g/30g/200g/1y
// gerçek noktaları — hisse tarafındaki 1ay/3ay/YBB/6ay/1yıl merdiveninin
// kripto eşdeğeri. 24s kasıtlı dışarıda bırakılır (çok gürültülü).
function buildReturnLadder(p) {
  const r = p.returns || {};
  const points = [
    { months: 7 / 30.44, returnPct: r.d7 },
    { months: 14 / 30.44, returnPct: r.d14 },
    { months: 1, returnPct: r.d30 },
    { months: 200 / 30.44, returnPct: r.d200 },
    { months: 12, returnPct: r.y1 },
  ].filter((pt) => pt.returnPct != null && Number.isFinite(pt.months) && pt.months > 0);
  points.sort((a, b) => a.months - b.months);
  return points;
}

// advisor.js'teki interpolateReturn ile birebir aynı.
function interpolateReturn(ladder, months) {
  if (!ladder.length) return null;
  if (months <= ladder[0].months) {
    const p0 = ladder[0];
    return p0.months > 0 ? (p0.returnPct * months) / p0.months : p0.returnPct;
  }
  if (months >= ladder[ladder.length - 1].months) {
    return ladder[ladder.length - 1].returnPct;
  }
  for (let i = 0; i < ladder.length - 1; i++) {
    const lo = ladder[i], hi = ladder[i + 1];
    if (months >= lo.months && months <= hi.months) {
      const t = (months - lo.months) / (hi.months - lo.months);
      return lo.returnPct + (hi.returnPct - lo.returnPct) * t;
    }
  }
  return null;
}

// 12 aydan uzun istekler için: gerçek dönemleri (≤1 ay olanlar hariç —
// çok kısa, yıllıklaştırınca aşırı gürültülü olur) kendi sürelerine
// göre yıllıklaştırıp süre-ağırlıklı ortalamasını alır. Kriptoda bu
// eşiğin üstünde kalan gerçek noktalar 200g ve 1y — ikisi de gerçek,
// hiçbiri uydurma değil.
function blendedAnnualRate(p) {
  const r = p.returns || {};
  const periods = [
    { months: 200 / 30.44, returnPct: r.d200 },
    { months: 12, returnPct: r.y1 },
  ].filter((pt) => pt.returnPct != null && pt.months >= 2);

  if (!periods.length) return null;
  let weightSum = 0, weightedRateSum = 0;
  periods.forEach((pt) => {
    const annualRate = Math.pow(1 + pt.returnPct / 100, 12 / pt.months) - 1;
    weightSum += pt.months;
    weightedRateSum += annualRate * pt.months;
  });
  return weightedRateSum / weightSum;
}

// ≤12 ay: interpolasyon (gerçek veri). >12 ay: blendedAnnualRate'in
// doğru aylık bileşik faizle projeksiyonu. Temettü eşdeğeri yok.
function estimateReturnPct(p, months) {
  if (months <= 12) return interpolateReturn(buildReturnLadder(p), months);
  const annualRate = blendedAnnualRate(p);
  if (annualRate == null) return null;
  return (Math.pow(1 + annualRate, months / 12) - 1) * 100;
}

// advisor.js'teki applyDuration ile aynı yapı, temettü terimi olmadan.
function applyDuration(rec, months) {
  const isProjection = months > 12;

  let picks = rec.picks.map((p) => {
    const totalContribution = p.dollars * months;
    if (!isProjection) {
      const returnPct = interpolateReturn(buildReturnLadder(p), months);
      if (returnPct == null) {
        return { ...p, returnPct: null, dcaReturnPct: null, totalContribution, gainUSD: null, futureValueUSD: null };
      }
      const factor = (months + 1) / (2 * months);
      const dcaReturnPct = returnPct * factor;
      const gainUSD = (totalContribution * dcaReturnPct) / 100;
      return { ...p, returnPct, dcaReturnPct, totalContribution, gainUSD, futureValueUSD: totalContribution + gainUSD };
    }

    const annualRate = blendedAnnualRate(p);
    if (annualRate == null) {
      return { ...p, returnPct: null, dcaReturnPct: null, totalContribution, gainUSD: null, futureValueUSD: null };
    }
    const pmt = p.dollars;
    const rm = Math.pow(1 + annualRate, 1 / 12) - 1;
    const futureValueUSD = Math.abs(rm) < 1e-9 ? pmt * months : pmt * ((Math.pow(1 + rm, months) - 1) / rm);
    const gainUSD = futureValueUSD - totalContribution;
    const dcaReturnPct = totalContribution > 0 ? (gainUSD / totalContribution) * 100 : null;
    return { ...p, returnPct: annualRate * 100, dcaReturnPct, totalContribution, gainUSD, futureValueUSD };
  });

  picks = picks.map((p) => (
    p.dcaReturnPct != null && p.dcaReturnPct < 0
      ? { ...p, alternatives: findAlternatives(picks, rec.allCandidates, months) }
      : p
  ));

  const withReturn = picks.filter((p) => p.gainUSD != null);
  const totalInvested = picks.reduce((s, p) => s + p.totalContribution, 0);
  let portfolioReturnPct = null, estimatedGainUSD = null;
  if (withReturn.length) {
    const contribSum = withReturn.reduce((s, p) => s + p.totalContribution, 0);
    estimatedGainUSD = withReturn.reduce((s, p) => s + p.gainUSD, 0);
    portfolioReturnPct = (estimatedGainUSD / contribSum) * 100;
  }
  const missingReturnSymbols = picks.length - withReturn.length;
  const totalValueUSD = estimatedGainUSD != null ? totalInvested + estimatedGainUSD : null;

  return { ...rec, picks, months, isProjection, totalInvested, portfolioReturnPct, estimatedGainUSD, totalValueUSD, missingReturnSymbols };
}

module.exports = {
  buildAllocation,
  applyDuration,
  riskLevelFor,
  estimateReturnPct,
  PORTFOLIO_TOP_N,
  MAX_PER_CATEGORY,
  MAX_WEIGHT_PER_COIN,
};
