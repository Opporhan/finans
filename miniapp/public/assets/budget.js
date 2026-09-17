/* ============================================================
   assets/budget.js — "Hisseler → Hisse Yatırımlarım" alt sekmesi (sadece aylık düzenli yatırım)
   Kullanıcı tutarı VE süreyi (ay/yıl) birlikte girer, tek "Hesapla"
   tıklamasıyla hem portföy seçimi hem süreye göre tahmini getiri
   birlikte hesaplanır.
   ============================================================ */
window.Budget = (() => {
  let currentRec = null;
  let currentMonths = null;

  const resultEl = () => document.getElementById("butceResult");

  // "10000", "10.000", "10,000", "10.000,50" gibi Türkçe/İngilizce
  // binlik-ondalık ayıracı karışık yazımların hepsini doğru okur — hangi
  // işaretin binlik hangisinin ondalık olduğuna en SONDA geçen ayırıcıya
  // bakarak karar verir. Geçersizse null döner.
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

  // automation/config.js'teki CFG.MAX_WEIGHT_PER_STOCK ile birebir aynı
  // olmalı — istemci Node config'ine erişemediği için burada sabitlenir.
  const MAX_WEIGHT_PER_STOCK = 0.25;

  // buildAllocation (automation/advisor.js) ile birebir aynı risk-ayarlı
  // ağırlıklandırma formülü — bir pick değiştirildiğinde yeni ağ çağrısı
  // yapmadan client-side yeniden dağıtım için.
  function riskAdjustedScore(p) {
    return p.score / (p.beta != null && p.beta > 0 ? p.beta : 1);
  }

  // advisor.js'teki capWeights ile birebir aynı cap-and-renormalize algoritması.
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
    const cappedWeights = capWeights(rawWeights, MAX_WEIGHT_PER_STOCK);
    return picks.map((p, i) => {
      const weight = cappedWeights[i];
      const dollars = budget * weight;
      return { ...p, weight, dollars, impliedShares: p.price > 0 ? dollars / p.price : null };
    });
  }

  function portfolioRisk(picks) {
    const beta = picks.reduce((s, p) => s + p.weight * (p.beta != null && p.beta > 0 ? p.beta : 1), 0);
    const level = beta < 0.8 ? "Düşük" : beta <= 1.3 ? "Orta" : "Yüksek";
    return { beta, level };
  }

  const SECTOR_COLORS = ["#4f63f0", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

  // picks'in industry+weight bilgisinden saf CSS conic-gradient donut +
  // yan tarafta renk-etiket listesi üretir. Yeni veri/kütüphane gerekmez.
  function sectorDonutHtml(picks) {
    const totals = {};
    picks.forEach((p) => {
      const key = p.industry || "Diğer";
      totals[key] = (totals[key] || 0) + p.weight;
    });
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (entries.length < 2) return "";

    let acc = 0;
    const stops = entries.map(([, w], i) => {
      const start = acc * 100;
      acc += w;
      return `${SECTOR_COLORS[i % SECTOR_COLORS.length]} ${start.toFixed(2)}% ${(acc * 100).toFixed(2)}%`;
    }).join(", ");
    const legend = entries.map(([name, w], i) => `
      <div class="sector-legend-row">
        <span class="sector-dot" style="background:${SECTOR_COLORS[i % SECTOR_COLORS.length]}"></span>
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
      .filter((c) => !currentRec.picks.some((pick) => pick.symbol === c.symbol))
      .sort((a, b) => b.score - a.score);
    if (!alternatives.length) return "";
    const options = [`<option value="${p.symbol}">${p.symbol} — şu anki seçim</option>`]
      .concat(alternatives.map((c) => `<option value="${c.symbol}">${c.symbol} — skor ${c.score} (${c.verdict})</option>`));
    return `<select class="pick-swap" data-symbol="${p.symbol}">${options.join("")}</select>`;
  }

  function kvRow(label, valueHtml) {
    return `<div class="pick-kv"><span class="k">${label}</span><span class="v">${valueHtml}</span></div>`;
  }

  function pickCardHtml(p, { withReturn }) {
    const badgeClass = Fmt.verdictBadgeClass(p.verdictKey);
    let body = `
      <div class="pick-head">
        <span class="symbol">${Fmt.logoHtml(p.symbol, p.logo, "logo-sm")}${p.symbol} <span class="badge ${badgeClass} info-trigger" data-info="score">${p.verdict}</span> ${Fmt.riskBadgeHtml(p.riskLevel, p.beta)}</span>
        <span class="score">skor ${p.score}</span>
      </div>
      <div class="pick-stats">`;
    const fxRate = currentRec.fxRate;
    body += kvRow("Aylık pay", `%${(p.weight * 100).toFixed(1)}`);
    body += kvRow("Aylık tutar", `${Fmt.tryUsd(p.dollars, fxRate)}/ay`);
    body += kvRow("Alınan adet", `~${p.impliedShares?.toFixed(2)}/ay (@ $${p.price})`);
    if (p.dividendYield != null) {
      body += kvRow("Temettü verimi", `%${p.dividendYield.toFixed(2)}/yıl`);
    }
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
      const allFailed = rec.totalSymbols && rec.failCount >= rec.totalSymbols;
      resultEl().innerHTML = `<div class="card"><div class="empty">${
        allFailed
          ? "Şu anda veri alınamadı (geçici bir sorun olabilir). Birazdan tekrar deneyin."
          : "Şu anda İyi/Çok İyi sinyali veren hisse yok. Zorla bir öneri üretmek yanıltıcı olur."
      }</div></div>`;
      return;
    }

    const withReturn = rec.portfolioReturnPct !== undefined;
    const summary = (rec.qualifiedCount > rec.picks.length
      ? `${rec.qualifiedCount} hissede sinyal var, ${rec.picks.length} tanesi seçildi.`
      : `${rec.picks.length} hissede İyi/Çok İyi sinyali var.`)
      + ` Seçim tek bir sektöre yoğunlaşmasın diye sektör başına en fazla 2, tek bir hisseye en fazla %25 pay verilir; kalan pay risk (beta) dikkate alınarak ağırlıklandırılır — isterseniz aşağıdan değiştirebilirsiniz.`;

    const portfolioRiskBadge = rec.portfolioRiskLevel
      ? `<div class="portfolio-risk-row">${Fmt.riskBadgeHtml(rec.portfolioRiskLevel, rec.portfolioBeta)}<span class="hint">Portföy riski — hisselerin ağırlıklı ortalama betası</span></div>`
      : "";

    const donut = sectorDonutHtml(rec.picks);
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
      if (rec.benchmarkReturnPct != null) {
        html += `<br>📈 Aynı dönemde S&P 500 (SPY) tahmini getirisi: <b class="${Fmt.pctClass(rec.benchmarkReturnPct)}">${Fmt.pct(rec.benchmarkReturnPct)}</b>`;
      }
      html += `</div>`;
      html += rec.isProjection
        ? `<div class="note">ℹ️ Bu bir PROJEKSİYONDUR: her hissenin mevcut gerçek getiri verileri (3 ay, YBB, 6 ay, 1 yıl) ve temettü verimi, süre uzunluğuna göre ağırlıklandırılarak tek bir varsayılan yıllık orana dönüştürülmüş ve bu oran bileşik faizle ${(rec.months / 12).toFixed(1)} yıl boyunca ileriye taşınmıştır. Gerçek veri değildir, gerçek sonuç önemli ölçüde farklı olabilir.</div>`
        : `<div class="note">ℹ️ Bu süre için getiri, en yakın iki gerçek veri noktası arasında (ör. 3 ay ile 6 ay) matematiksel enterpolasyonla hesaplanmış fiyat getirisine, süreye orantılı temettü verimi eklenerek hesaplanmıştır; ardından paranın ortalama sürenin yarısı kadar piyasada kaldığı varsayımıyla düzenli yatırıma uyarlanmıştır.</div>`;
      html += `<div class="note">ℹ️ Skor ileriye dönük çoklu faktörlere dayanır; yüzdeler geçmiş fiyat performansıdır — ikisi farklı şeyi ölçer (rozete dokunarak anlatımı görebilirsiniz).<br>💱 Yatırım TL ile yapılsa da hisseler USD cinsindendir; dolar/TL kuru değişimi getiriyi doğrudan etkiler.<br>🧾 Bu tahminler brüttür; ABD hisselerinden gelen temettü stopaja tabidir, sermaye kazancı için kendi vergi durumunuzu kontrol edin.<br>🔢 Bazı aracı kurumlar kesirli hisse alımını desteklemez; "alınan adet" rakamı teorik bir orandır.<br>⚠️ Kural tabanlı otomatik bir tahmindir; yatırım tavsiyesi değildir.</div>`;
    }

    resultEl().innerHTML = html;
    resultEl().querySelectorAll(".pick-swap").forEach((sel) => {
      sel.addEventListener("change", () => swapPick(sel.dataset.symbol, sel.value));
    });
  }

  async function swapPick(oldSymbol, newSymbol) {
    if (oldSymbol === newSymbol) return;
    const candidate = currentRec.allCandidates.find((c) => c.symbol === newSymbol);
    if (!candidate) return;

    const fresh = { symbol: candidate.symbol, name: candidate.name, score: candidate.score, verdict: candidate.verdict, verdictKey: candidate.verdictKey, price: candidate.price, returns: candidate.returns, dividendYield: candidate.dividendYield, logo: candidate.logo, industry: candidate.industry, beta: candidate.beta, riskLevel: candidate.riskLevel };
    const picks = currentRec.picks.map((p) => (p.symbol === oldSymbol ? fresh : p));
    const budget = currentRec.budget;
    const newPicks = recomputeWeights(picks, budget);
    const risk = portfolioRisk(newPicks);
    currentRec = { ...currentRec, picks: newPicks, portfolioBeta: risk.beta, portfolioRiskLevel: risk.level, portfolioReturnPct: undefined };

    if (currentMonths != null) {
      resultEl().innerHTML = '<div class="spinner">Yeniden hesaplanıyor…</div>';
      try {
        const { rec } = await Api.post("/api/horizon", { rec: currentRec, months: currentMonths });
        renderResult(rec);
      } catch (e) {
        resultEl().innerHTML = `<div class="error">Hesaplanamadı: ${e.message}</div>`;
      }
    } else {
      renderResult(currentRec);
    }
  }

  function readDurationMonths() {
    const n = Number(document.getElementById("durationInput").value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = document.getElementById("durationUnit").value;
    return unit === "yil" ? n * 12 : n;
  }

  async function calculate() {
    const amount = parseAmount(document.getElementById("budgetInput").value);
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

    resultEl().innerHTML = '<div class="spinner">⏳ Hisseler canlı analiz ediliyor, ~10 saniye sürebilir…</div>';
    try {
      const { rec } = await Api.post("/api/portfolio", { budgetTRY: amount });
      if (!rec.picks.length) {
        renderResult(rec);
        return;
      }
      const { rec: withReturn } = await Api.post("/api/horizon", { rec, months });
      renderResult(withReturn);
    } catch (e) {
      resultEl().innerHTML = `<div class="error">Hesaplanamadı: ${e.message}</div>`;
    }
  }

  function init() {
    document.getElementById("calcBtn").addEventListener("click", calculate);
  }

  return { init };
})();
