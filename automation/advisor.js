/* ============================================================
   automation/advisor.js — Yatırım Danışmanı
   Watchlist'i canlı analiz edip skor-ağırlıklı bir dağıtım önerisi
   üretir (sadece düzenli aylık yatırım / DCA). Kullanıcı istediği süreyi
   (ay cinsinden, serbest) girer:
   - ≤12 ay: gerçek Finnhub verisinden (d5 hariç m1/m3/ytd/m6/y1) iki en
     yakın noktanın DOĞRUSAL İNTERPOLASYONU — uydurma yok, iki gerçek
     nokta arasında matematiksel ara değer.
   - >12 ay: gerçek dönemlerin (m3/ytd/m6/y1) süre-ağırlıklı yıllıklaştırılmış
     ortalamasından çıkan tek bir "varsayılan yıllık oran", doğru aylık
     bileşik faizli (growing annuity) formülüyle ileriye taşınır — açıkça
     `isProjection` ile işaretlenir.
   ============================================================ */
const CFG = require("./config.js");
const Analyzer = require("../assets/js/analysis.js");

const BENCHMARK_SYMBOL = "SPY";

// S&P 500 (SPY) için, günlük fundamentals cache'inden (api/cron/refresh-
// fundamentals.js zaten watchlist'e ek olarak SPY'ı da çekip yazıyor) aynı
// estimateReturnPct fonksiyonunu kullanarak bir hisseyle birebir aynı
// yöntemle kıyaslanabilir getiri tahmini üretir. Cache'te SPY yoksa
// (cron henüz çalışmadıysa) null döner — uydurma sayı üretilmez.
function benchmarkReturnPct(fundamentalsCache, months) {
  const metric = fundamentalsCache?.[BENCHMARK_SYMBOL]?.metric;
  if (!metric) return null;
  const candidate = {
    returns: Analyzer.returnsFromMetric(metric),
    dividendYield: Analyzer.dividendYieldFromMetric(metric),
  };
  return estimateReturnPct(candidate, months);
}

// Piyasaya göre oynaklık (beta) eşikleri — hem tekil hisse hem portföy
// seviyesinde (ağırlıklı ortalama beta ile) kullanılır.
function riskLevelFor(beta) {
  if (beta == null) return null;
  if (beta < 0.8) return "Düşük";
  if (beta <= 1.3) return "Orta";
  return "Yüksek";
}

// Ağırlıkları (toplamı 1 olan bir dizi), hiçbiri maxWeight'i aşmayacak
// şekilde yeniden dağıtır — standart "cap-and-renormalize": tavanı aşan
// ağırlıklar tavana sabitlenir, kalan bütçe tavanın altındakilere orijinal
// oranlarıyla orantılı yeniden dağıtılır, kimse tavanı aşmayana kadar
// tekrarlanır. maxWeight * n < 1 ise (tavan matematiksel olarak
// ulaşılamaz — ör. 3 hisseye %25 tavan) en adil ulaşılabilir dağılım olan
// eşit ağırlığa düşülür.
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

// Saf fonksiyon (ağ çağrısı yok): kalifiye adaylardan sektör tavanına uyan
// en yüksek skorlu CFG.PORTFOLIO_TOP_N tanesini seçip yatırımı risk-ayarlı
// (beta ile bölünmüş skor) ağırlıklandırarak, tekli hisse tavanına göre
// sınırlandırarak dağıtır. marketDataBatch (Mini App yolu) tarafından
// kullanılır.
function buildAllocation({ candidates, budget }) {
  if (!candidates.length) {
    return { picks: [], allCandidates: [], qualifiedCount: 0, budget };
  }

  candidates.sort((a, b) => b.score - a.score);
  const qualifiedCount = candidates.length;

  // 1) Sektör tavanlı seçim: skora göre yukarıdan aşağı gidilir, ama aynı
  // finnhubIndustry'den en fazla CFG.MAX_PER_INDUSTRY hisse alınır — bir
  // sektör (ör. yarı iletkenler) tavanı doldurduğunda sıradaki aday
  // atlanıp bir alttaki denenir. Bu, "en yüksek skorlu N" seçiminin
  // yanlışlıkla tek bir sektöre yoğunlaşmasını yapısal olarak engeller.
  const industryCounts = {};
  const picks = [];
  for (const c of candidates) {
    if (picks.length >= CFG.PORTFOLIO_TOP_N) break;
    const key = c.industry || "Diğer";
    const count = industryCounts[key] || 0;
    if (count >= CFG.MAX_PER_INDUSTRY) continue;
    industryCounts[key] = count + 1;
    picks.push(c);
  }

  // 2) Risk-ayarlı ağırlıklandırma: aynı skora sahip iki hisseden daha
  // oynak (yüksek beta) olana biraz daha az pay verilir. Beta bilinmiyorsa
  // piyasa ortalaması (1) varsayılır — ne ceza ne bonus.
  const riskAdjustedScore = (p) => p.score / (p.beta != null && p.beta > 0 ? p.beta : 1);
  const rawScores = picks.map(riskAdjustedScore);
  const scoreSum = rawScores.reduce((s, v) => s + v, 0);
  const rawWeights = rawScores.map((s) => s / scoreSum);

  // 3) Tekli hisse ağırlık tavanı: az sayıda kalifiye aday olduğu günlerde
  // tek bir hissenin portföyü domine etmesini engeller.
  const cappedWeights = capWeights(rawWeights, CFG.MAX_WEIGHT_PER_STOCK);

  picks.forEach((p, i) => {
    p.weight = cappedWeights[i];
    p.dollars = budget * p.weight;
    p.impliedShares = p.price > 0 ? p.dollars / p.price : null;
  });

  // Portföy seviyesinde tek bir risk özeti: ağırlıklı ortalama beta
  // (beta bilinmeyen hisseler için piyasa ortalaması 1 varsayılır — tekil
  // ağırlıklandırmayla tutarlı).
  const portfolioBeta = picks.reduce((s, p) => s + p.weight * (p.beta != null && p.beta > 0 ? p.beta : 1), 0);
  const portfolioRiskLevel = riskLevelFor(portfolioBeta);

  // Seçilmeyen kalifiye adaylar saklanır — kayıp gösteren bir pick için
  // "dağıtıma dahil olmayan ama iyi giden" alternatif önermekte, ve
  // kullanıcının bir pick'i elle değiştirebilmesinde (Mini App) kullanılır.
  return { picks, allCandidates: candidates, qualifiedCount, budget, portfolioBeta, portfolioRiskLevel };
}

// Kayıp gösteren bir pick için, ilk N'e girmeyen kalifiye adaylar arasından
// aynı sürede pozitif getirisi olanları bulur.
function findAlternatives(picks, allCandidates, months, max = 2) {
  if (!allCandidates) return null;
  const pickedSymbols = new Set(picks.map((p) => p.symbol));
  const pool = allCandidates
    .filter((c) => !pickedSymbols.has(c.symbol))
    .map((c) => ({ symbol: c.symbol, returnPct: estimateReturnPct(c, months) }))
    .filter((c) => c.returnPct != null && c.returnPct > 0);
  if (!pool.length) return null;
  return pool.sort((a, b) => b.returnPct - a.returnPct).slice(0, max);
}

// Bugüne kadar geçen sürenin ay karşılığı (YBB noktasını merdivene
// yerleştirmek için — yılın neresinde olduğumuza göre değişir).
function ytdMonths() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = (now - startOfYear) / (1000 * 60 * 60 * 24);
  return Math.max(days / 30.44, 0.1);
}

// Bir pick'in gerçek getiri noktalarını {months, returnPct} merdivenine
// çevirir, ay sayısına göre artan sıralar. d5 kasıtlı olarak dışarıda
// bırakılır (çok kısa/gürültülü, minimum girdi 1 ay olduğu için zaten
// hiç kullanılmayacaktı).
function buildReturnLadder(p) {
  const r = p.returns || {};
  const points = [
    { months: 1, returnPct: r.m1 },
    { months: 3, returnPct: r.m3 },
    { months: ytdMonths(), returnPct: r.ytd },
    { months: 6, returnPct: r.m6 },
    { months: 12, returnPct: r.y1 },
  ].filter((pt) => pt.returnPct != null && Number.isFinite(pt.months) && pt.months > 0);
  points.sort((a, b) => a.months - b.months);
  return points;
}

// İki en yakın gerçek noktayı sarıp aralarında doğrusal interpolasyon
// yapar. `months` merdivenin altındaysa orijinden (t=0, getiri=0) en
// yakın noktaya orantısal uzatır; üstündeyse en uzun gerçek noktayı
// (genelde y1) kullanır. Merdivende <1 nokta varsa null döner.
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

// 12 aydan uzun istekler için: gerçek dönemleri (1 ay hariç — çok kısa,
// yıllıklaştırınca aşırı gürültülü olur) kendi sürelerine göre
// yıllıklaştırıp, süre uzunluğuyla ağırlıklandırılmış ortalamasını alır.
// Uzun/istikrarlı dönemler (ör. y1) daha çok ağırlık taşır. Tek bir
// dönemin (ör. sadece son 1 yıl) gürültüsüne bağlı kalınmaz.
function blendedAnnualRate(p) {
  const r = p.returns || {};
  const periods = [
    { months: 3, returnPct: r.m3 },
    { months: ytdMonths(), returnPct: r.ytd },
    { months: 6, returnPct: r.m6 },
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

// Temettü veriminin süreye orantılı payı (%) — fiyat getirisine eklenir.
// Finnhub'da temettü alanı olmayan (hiç dağıtmayan) şirketler için 0,
// uydurma değil — sadece "katkısı yok" demek.
function dividendContribution(p, months) {
  return (p.dividendYield || 0) * (months / 12);
}

// Tek bir pick için, istenen ay sayısına göre gerçekçi getiri tahmini
// (fiyat + temettü). ≤12 ay: interpolasyon (gerçek veri). >12 ay:
// blendedAnnualRate'in doğru aylık bileşik faizle projeksiyonu.
function estimateReturnPct(p, months) {
  let priceReturn;
  if (months <= 12) {
    priceReturn = interpolateReturn(buildReturnLadder(p), months);
  } else {
    const annualRate = blendedAnnualRate(p);
    priceReturn = annualRate == null ? null : (Math.pow(1 + annualRate, months / 12) - 1) * 100;
  }
  if (priceReturn == null) return null;
  return priceReturn + dividendContribution(p, months);
}

// Önceden seçilmiş bir portföye, kullanıcının girdiği ay sayısına göre
// düzenli aylık yatırım (DCA) getiri/kâr rakamlarını uygular. Yeni ağ
// çağrısı yapmaz — her pick'in üzerinde duran `returns`'ten hesaplar.
function applyDuration(rec, months) {
  const isProjection = months > 12;

  let picks = rec.picks.map((p) => {
    const totalContribution = p.dollars * months;
    if (!isProjection) {
      const priceReturnPct = interpolateReturn(buildReturnLadder(p), months);
      if (priceReturnPct == null) {
        return { ...p, returnPct: null, dcaReturnPct: null, totalContribution, gainUSD: null, futureValueUSD: null };
      }
      // Fiyat getirisine, süreye orantılı temettü katkısı eklenir — kısa
      // dönemde bileşikleşme etkisi ihmal edilebilir düzeyde olduğu için
      // basit toplama yeterli.
      const returnPct = priceReturnPct + dividendContribution(p, months);
      // Paranın ortalama olarak sürenin yarısı kadar piyasada kaldığı
      // varsayımına dayanan basit dağıtım formülü — gerçek ay-ay veri
      // olmadığında (Finnhub ücretsiz plan) kullanılır.
      const factor = (months + 1) / (2 * months);
      const dcaReturnPct = returnPct * factor;
      const gainUSD = (totalContribution * dcaReturnPct) / 100;
      return { ...p, returnPct, dcaReturnPct, totalContribution, gainUSD, futureValueUSD: totalContribution + gainUSD };
    }

    const priceAnnualRate = blendedAnnualRate(p);
    if (priceAnnualRate == null) {
      return { ...p, returnPct: null, dcaReturnPct: null, totalContribution, gainUSD: null, futureValueUSD: null };
    }
    // Temettü, uzun vadede fiyat getirisiyle birlikte BİLEŞİK olarak
    // büyütülür (temettünün de yeniden yatırıldığı varsayılır) — kısa
    // vadedeki basit toplamadan farklı olarak burada bileşikleşme etkisi
    // çok yıllı ufukta ihmal edilemez.
    const annualRate = priceAnnualRate + (p.dividendYield || 0) / 100;
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
  benchmarkReturnPct,
};
