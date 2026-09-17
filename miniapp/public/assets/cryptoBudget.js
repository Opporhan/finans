/* ============================================================
   assets/cryptoBudget.js — "Kripto → Kripto Yatırımlarım" alt sekmesi
   budget.js'in kripto eşdeğeri — AYNI matematiksel yöntemler
   (kategori tavanlı seçim, risk-ayarlı ağırlıklandırma, tekli coin
   ağırlık tavanı, ≤12 ay interpolasyon / >12 ay bileşik projeksiyon),
   ayrı endpoint'ler (/api/crypto-portfolio, /api/crypto-horizon) ve
   ayrı terminoloji (momentum/oynaklık — hisse skoru/betasıyla
   karıştırılmasın diye) kullanır.
   ============================================================ */
window.CryptoBudget = (() => {
  let currentRec = null;
  let currentMonths = null;

  const resultEl = () => document.getElementById("kriptoBudgetResult");

  // budget.js'teki parseAmount ile birebir aynı (Türkçe/İngilizce
  // binlik-ondalık ayıracı ayrıştırma) — bağımsız modül tutmak için
  // kasıtlı olarak burada da tekrarlanır.
  function parseAmount(text) {
    if (!text) return null;
    let t = String(text).trim().replace(/\s+/g, "");
    if (!t) return null;

    const hasComma = t.includes(",");
    const hasDot = t.includes(".");

    if (hasComma && hasDot) {
      const lastComma = t.lastIndexOf(",");
      const lastDot = t.lastIndexOf(".");
      if (lastComma > lastDot) {
        t = t.replace(/\./g, "").replace(",", ".");
      } else {
        t = t.replace(/,/g, "");
      }
    } else if (hasComma && !hasDot) {
      const parts = t.split(",");
      const lastGroup = parts[parts.length - 1];
      if (parts.length > 1 && lastGroup.length === 3) {
        t = t.replace(/,/g, "");
      } else {
        t = t.replace(",", ".");
      }
    } else if (hasDot && !hasComma) {
      const parts = t.split(".");
      const lastGroup = parts[parts.length - 1];
      if (parts.length > 1 && lastGroup.length === 3) {
        t = t.replace(/\./g, "");
      }
    }

    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }

  // automation/cryptoAdvisor.js'teki sabitlerle BİREBİR aynı olmalı.
  const MAX_WEIGHT_PER_COIN = 0.30;
  const DEFAULT_VOLATILITY = 0.15;

  function riskAdjustedScore(p) {
    return p.momentumScore / (1 + (p.volatilityRatio ?? DEFAULT_VOLATILITY));
  }

  // cryptoAdvisor.js'teki capWeights ile birebir aynı cap-and-renormalize.
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

  function recomputeWeights(picks, budget) {
    const rawScores = picks.map(riskAdjustedScore);
    const scoreSum = rawScores.reduce((s, v) => s + v, 0);
    const rawWeights = rawScores.map((s) => s / scoreSum);
    const cappedWeights = capWeights(rawWeights, MAX_WEIGHT_PER_COIN);
    return picks.map((p, i) => {
      const weight = cappedWeights[i];
      const dollars = budget * weight;
      return { ...p, weight, dollars, impliedUnits: p.price > 0 ? dollars / p.price : null };
    });
  }

  function riskLevelFor(volatilityRatio) {
    if (volatilityRatio < 0.1) return "Orta";
    if (volatilityRatio < 0.25) return "Yüksek";
    return "Çok Yüksek";
  }

  function portfolioRisk(picks) {
    const volatility = picks.reduce((s, p) => s + p.weight * (p.volatilityRatio ?? DEFAULT_VOLATILITY), 0);
    return { volatility, level: riskLevelFor(volatility) };
  }

  const CATEGORY_COLORS = ["#4f63f0", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

  // budget.js'teki sectorDonutHtml ile aynı fikir, industry yerine category.
  function categoryDonutHtml(picks) {
    const totals = {};
    picks.forEach((p) => {
      const key = p.category || "Diğer";
      totals[key] = (totals[key] || 0) + p.weight;
    });
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (entries.length < 2) return "";

    let acc = 0;
    const stops = entries.map(([, w], i) => {
      const start = acc * 100;
      acc += w;
      return `${CATEGORY_COLORS[i % CATEGORY_COLORS.length]} ${start.toFixed(2)}% ${(acc * 100).toFixed(2)}%`;
    }).join(", ");
    const legend = entries.map(([name, w], i) => `
      <div class="sector-legend-row">
        <span class="sector-dot" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></span>
        <span>${name}</span>
        <span class="sector-legend-pct">%${(w * 100).toFixed(0)}</span>
      </div>`).join("");
    return `
      <div class="sector-donut-wrap">
        <div class="sector-donut" style="background: conic-gradient(${stops})"></div>
        <div class="sector-legend">${legend}</div>
      </div>`;
  }

  function swapSelectHtml(p) {
    const alternatives = (currentRec.allCandidates || [])
      .filter((c) => !currentRec.picks.some((pick) => pick.id === c.id))
      .sort((a, b) => b.momentumScore - a.momentumScore);
    if (!alternatives.length) return "";
    const options = [`<option value="${p.id}">${p.symbol} — şu anki seçim</option>`]
      .concat(alternatives.map((c) => `<option value="${c.id}">${c.symbol} — skor ${c.momentumScore} (${c.momentumLabel})</option>`));
    return `<select class="pick-swap" data-id="${p.id}">${options.join("")}</select>`;
  }

  function kvRow(label, valueHtml) {
    return `<div class="pick-kv"><span class="k">${label}</span><span class="v">${valueHtml}</span></div>`;
  }

  // Birim miktarı coin'in fiyat büyüklüğüne göre okunur biçimde
  // yuvarlar — BTC gibi pahalı bir coin için "~0.00" yerine anlamlı
  // basamak sayısı gösterir (Fmt.cryptoPrice ile aynı mantık).
  function fmtUnits(units) {
    if (units == null) return "—";
    const digits = units < 1 ? 6 : units < 100 ? 2 : 0;
    return units.toLocaleString("en-US", { maximumFractionDigits: digits });
  }

  function pickCardHtml(p, { withReturn }) {
    const badgeClass = Fmt.momentumBadgeClass(p.momentumKey);
    let body = `
      <div class="pick-head">
        <span class="symbol">${Fmt.logoHtml(p.symbol, p.logo, "logo-sm")}${p.symbol} <span class="badge ${badgeClass} info-trigger" data-info="cryptoMomentum">${p.momentumLabel}</span> ${Fmt.cryptoRiskBadgeHtml(p.riskLevel)}</span>
        <span class="score">skor ${p.momentumScore}</span>
      </div>
      <div class="pick-stats">`;
    const fxRate = currentRec.fxRate;
    body += kvRow("Aylık pay", `%${(p.weight * 100).toFixed(1)}`);
    body += kvRow("Aylık tutar", `${Fmt.tryUsd(p.dollars, fxRate)}/ay`);
    body += kvRow("Alınan miktar", `~${fmtUnits(p.impliedUnits)} ${p.symbol}/ay (@ ${Fmt.cryptoPrice(p.price)})`);
    body += `</div>`;

    if (withReturn) {
      if (p.dcaReturnPct != null) {
        const rateLabel = currentRec.isProjection ? "Varsayılan yıllık oran" : "Dönem getirisi";
        body += `<div class="pick-stats pick-stats-return">`;
        body += kvRow(rateLabel, `<b class="${Fmt.pctClass(p.returnPct)}">${Fmt.pct(p.returnPct)}</b>${currentRec.isProjection ? "/yıl" : ""}`);
        body += kvRow("Tahmini toplam getiri", `<b class="${Fmt.pctClass(p.dcaReturnPct)}">${Fmt.pct(p.dcaReturnPct)}</b>`);
        body += kvRow("Kazanç", Fmt.tryUsd(p.gainUSD, fxRate));
        body += kvRow("Toplam değer", `~${Fmt.tryUsd(p.futureValueUSD, fxRate)}`);
        body += `</div>`;
      } else {
        body += `<div class="pick-line hint">Bu süre için getiri verisi yok.</div>`;
      }
      if (p.alternatives && p.alternatives.length) {
        const list = p.alternatives.map((a) => `${a.symbol} (${Fmt.pct(a.returnPct)})`).join(", ");
        body += `<div class="alt-line">💡 Daha iyi giden alternatifler (dağıtıma dahil değil): ${list}</div>`;
      }
    }
    body += swapSelectHtml(p);
    return `<div class="pick-card">${body}</div>`;
  }

  function renderResult(rec) {
    currentRec = rec;

    if (!rec.picks.length) {
      resultEl().innerHTML = `<div class="card"><div class="empty">Şu anda Yükseliş/Güçlü Yükseliş momentumu gösteren coin yok. Zorla bir öneri üretmek yanıltıcı olur.</div></div>`;
      return;
    }

    const withReturn = rec.portfolioReturnPct !== undefined;
    const summary = (rec.qualifiedCount > rec.picks.length
      ? `${rec.qualifiedCount} coin'de sinyal var, ${rec.picks.length} tanesi seçildi.`
      : `${rec.picks.length} coin'de Yükseliş/Güçlü Yükseliş momentumu var.`)
      + ` Seçim tek bir kategoriye yoğunlaşmasın diye kategori başına en fazla 2, tek bir coin'e en fazla %30 pay verilir; kalan pay oynaklık dikkate alınarak ağırlıklandırılır — isterseniz aşağıdan değiştirebilirsiniz.`;

    const portfolioRiskBadge = rec.portfolioRiskLevel
      ? `<div class="portfolio-risk-row">${Fmt.cryptoRiskBadgeHtml(rec.portfolioRiskLevel)}<span class="hint">Portföy oynaklığı — coin'lerin ağırlıklı ortalaması</span></div>`
      : "";

    const donut = categoryDonutHtml(rec.picks);
    let html = `<div class="summary-card">${rec.fxNote || ""}<br>${summary}</div>`;
    if (portfolioRiskBadge || donut) {
      html += `<div class="summary-card">${portfolioRiskBadge}${donut}</div>`;
    }
    html += rec.picks.map((p) => pickCardHtml(p, { withReturn })).join("");

    if (withReturn) {
      const fxRate = rec.fxRate;
      const totalLine = rec.totalValueUSD != null
        ? `<br>💼 Toplam portföy değeri (tahmini): <b>${Fmt.tryUsd(rec.totalValueUSD, fxRate)}</b>`
        : "";
      html += `<div class="summary-card">💰 Toplam yatırılan (yaklaşık): ${Fmt.tryUsd(rec.totalInvested, fxRate)}<br>`;
      if (rec.portfolioReturnPct != null) {
        html += `📊 Portföy düzeyinde tahmini toplam getiri: <b class="${Fmt.pctClass(rec.portfolioReturnPct)}">${Fmt.pct(rec.portfolioReturnPct)}</b> (${Fmt.tryUsd(rec.estimatedGainUSD, fxRate)})${totalLine}`;
      } else {
        html += "Bu süre için getiri verisi bulunamadı.";
      }
      html += `</div>`;
      html += rec.isProjection
        ? `<div class="note">ℹ️ Bu bir PROJEKSİYONDUR: her coin'in mevcut gerçek getiri verileri (7g/14g/30g/200g/1y), süre uzunluğuna göre ağırlıklandırılarak tek bir varsayılan yıllık orana dönüştürülmüş ve bu oran bileşik faizle ${(rec.months / 12).toFixed(1)} yıl boyunca ileriye taşınmıştır. Gerçek veri değildir, gerçek sonuç önemli ölçüde farklı olabilir — kripto çok daha oynaktır.</div>`
        : `<div class="note">ℹ️ Bu süre için getiri, en yakın iki gerçek veri noktası arasında (ör. 7g ile 30g) matematiksel enterpolasyonla hesaplanmıştır; ardından paranın ortalama sürenin yarısı kadar piyasada kaldığı varsayımıyla düzenli yatırıma uyarlanmıştır.</div>`;
      html += `<div class="note">ℹ️ Momentum skoru geçmiş fiyat trendini ölçer, temel (şirket/bilanço) analiz değildir — gelecekteki fiyatı garanti etmez (rozete dokunarak anlatımı görebilirsiniz).<br>💱 Yatırım TL ile yapılsa da coin fiyatları USD cinsindendir; dolar/TL kuru değişimi getiriyi doğrudan etkiler.<br>🧾 Bu tahminler brüttür; kripto kazançları birçok ülkede vergiye tabidir, kendi vergi durumunuzu kontrol edin.<br>⚠️ Kural tabanlı otomatik bir tahmindir; yatırım tavsiyesi değildir. Kripto, hisselerden çok daha oynak bir varlık sınıfıdır.</div>`;
    }

    resultEl().innerHTML = html;
    resultEl().querySelectorAll(".pick-swap").forEach((sel) => {
      sel.addEventListener("change", () => swapPick(sel.dataset.id, sel.value));
    });
  }

  async function swapPick(oldId, newId) {
    if (oldId === newId) return;
    const candidate = currentRec.allCandidates.find((c) => c.id === newId);
    if (!candidate) return;

    const fresh = {
      id: candidate.id, symbol: candidate.symbol, name: candidate.name,
      momentumScore: candidate.momentumScore, momentumKey: candidate.momentumKey, momentumLabel: candidate.momentumLabel,
      price: candidate.price, returns: candidate.returns, logo: candidate.logo,
      category: candidate.category, volatilityRatio: candidate.volatilityRatio, riskLevel: candidate.riskLevel,
    };
    const picks = currentRec.picks.map((p) => (p.id === oldId ? fresh : p));
    const budget = currentRec.budget;
    const newPicks = recomputeWeights(picks, budget);
    const risk = portfolioRisk(newPicks);
    currentRec = { ...currentRec, picks: newPicks, portfolioVolatility: risk.volatility, portfolioRiskLevel: risk.level, portfolioReturnPct: undefined };

    if (currentMonths != null) {
      resultEl().innerHTML = '<div class="spinner">Yeniden hesaplanıyor…</div>';
      try {
        const { rec } = await Api.post("/api/crypto-horizon", { rec: currentRec, months: currentMonths });
        renderResult(rec);
      } catch (e) {
        resultEl().innerHTML = `<div class="error">Hesaplanamadı: ${e.message}</div>`;
      }
    } else {
      renderResult(currentRec);
    }
  }

  function readDurationMonths() {
    const n = Number(document.getElementById("kriptoDurationInput").value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = document.getElementById("kriptoDurationUnit").value;
    return unit === "yil" ? n * 12 : n;
  }

  async function calculate() {
    const amount = parseAmount(document.getElementById("kriptoBudgetInput").value);
    if (!Number.isFinite(amount) || amount <= 0) {
      resultEl().innerHTML = '<div class="error">Geçerli bir TL tutarı girin.</div>';
      return;
    }
    const months = readDurationMonths();
    if (months == null) {
      resultEl().innerHTML = '<div class="error">Geçerli bir süre girin (ör. 6 ay ya da 3 yıl).</div>';
      return;
    }
    if (months > 120) {
      resultEl().innerHTML = '<div class="error">Süre en fazla 10 yıl (120 ay) olabilir.</div>';
      return;
    }
    currentMonths = months;

    resultEl().innerHTML = '<div class="spinner">⏳ Coin\'ler canlı analiz ediliyor…</div>';
    try {
      const { rec } = await Api.post("/api/crypto-portfolio", { budgetTRY: amount });
      if (!rec.picks.length) {
        renderResult(rec);
        return;
      }
      const { rec: withReturn } = await Api.post("/api/crypto-horizon", { rec, months });
      renderResult(withReturn);
    } catch (e) {
      resultEl().innerHTML = `<div class="error">Hesaplanamadı: ${e.message}</div>`;
    }
  }

  function init() {
    document.getElementById("kriptoCalcBtn").addEventListener("click", calculate);
  }

  return { init };
})();
