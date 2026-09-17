/* ============================================================
   assets/cryptoChart.js — Kripto için GERÇEK günlük/saatlik fiyat
   grafiği (CoinGecko market_chart). chart.js'teki seyrek-nokta +
   declutter mantığına gerek yok — burada onlarca/yüzlerce gerçek nokta
   var, tek tek etiketlemek yerine sade bir çizgi + ilk/son nokta
   etiketi yeterli. Aynı görsel dili (chart-area/chart-line/chart-grid/
   chart-label-chip CSS sınıfları) chart.js ile paylaşır.
   ============================================================ */
window.CryptoChart = (() => {
  const modalEl = () => document.getElementById("cryptoChartModal");
  const svgWrapEl = () => document.getElementById("cryptoChartSvgWrap");

  let currentCoin = null;
  let currentDays = 30;
  let requestSeq = 0; // sekmeler hızlı tıklanırsa eski cevabın yeniyi ezmesini önler

  function labelChip(text, cx, cy, anchor) {
    const w = text.length * 5.6 + 10;
    const rectX = anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2;
    return `
      <rect class="chart-label-chip" x="${rectX.toFixed(1)}" y="${(cy - 9).toFixed(1)}" width="${w.toFixed(1)}" height="13" rx="4"></rect>
      <text class="chart-price-label" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="${anchor}">${text}</text>`;
  }

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }); } catch { return ""; }
  }

  function svgHtml(points, gradId) {
    if (points.length < 2) {
      return `<div class="chart-empty hint">Bu pencere için grafik çizecek yeterli veri yok.</div>`;
    }
    const W = 340, H = 210, padL = 8, padR = 8, padT = 34, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    const tsList = points.map((p) => p[0]);
    const prices = points.map((p) => p[1]);
    const tMin = tsList[0], tMax = tsList[tsList.length - 1];
    let yMin = Math.min(...prices), yMax = Math.max(...prices);
    if (yMin === yMax) { yMin -= Math.max(1, yMin * 0.02); yMax += Math.max(1, yMax * 0.02); }
    const ySpan = yMax - yMin;
    yMin -= ySpan * 0.12; yMax += ySpan * 0.12;

    const x = (ts) => (tMax === tMin ? padL : padL + ((ts - tMin) / (tMax - tMin)) * plotW);
    const y = (price) => padT + (1 - (price - yMin) / (yMax - yMin)) * plotH;

    const first = prices[0], last = prices[prices.length - 1];
    const trendClass = last >= first ? "chart-line-pos" : "chart-line-neg";

    const coords = points.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
    const areaPath = `M${x(tsList[0]).toFixed(1)},${(padT + plotH).toFixed(1)} L${coords.split(" ").join(" L")} L${x(tMax).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

    const gridLines = [0.2, 0.5, 0.8].map((t) => {
      const gy = padT + t * plotH;
      return `<line class="chart-grid" x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}"></line>`;
    }).join("");

    const firstX = x(tsList[0]), lastX = x(tMax);
    const firstY = y(first), lastY = y(last);
    const endMarks = `
      <circle class="chart-dot ${trendClass}" cx="${firstX.toFixed(1)}" cy="${firstY.toFixed(1)}" r="3"></circle>
      ${labelChip(Fmt.cryptoPrice(first), firstX, Math.max(firstY - 12, 16), "start")}
      <circle class="chart-dot-halo ${trendClass}" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="9"></circle>
      <circle class="chart-dot ${trendClass}" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4.5"></circle>
      ${labelChip(Fmt.cryptoPrice(last), lastX, Math.max(lastY - 12, 16), "end")}
      <text class="chart-time-label" x="${firstX.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="start">${fmtDate(tsList[0])}</text>
      <text class="chart-time-label chart-time-label-now" x="${lastX.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="end">Şimdi</text>`;

    return `
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Kripto fiyat grafiği">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" class="chart-grad-start ${trendClass}"></stop>
            <stop offset="100%" class="chart-grad-end ${trendClass}"></stop>
          </linearGradient>
        </defs>
        ${gridLines}
        <path class="chart-area" d="${areaPath}" fill="url(#${gradId})"></path>
        <polyline class="chart-line crypto-chart-line ${trendClass}" points="${coords}" fill="none"></polyline>
        ${endMarks}
      </svg>`;
  }

  function periodStatHtml(points) {
    if (points.length < 2) return "";
    const first = points[0][1], last = points[points.length - 1][1];
    const diff = last - first;
    // bkz. chart.js aynı fonksiyondaki not — first 0 ise Infinity/NaN önlenir.
    const pct = first ? (diff / first) * 100 : 0;
    const cls = diff >= 0 ? "pct-pos" : "pct-neg";
    const sign = diff >= 0 ? "+" : "";
    return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span> <span class="chart-period-sub">(${Fmt.cryptoPrice(first)} → ${Fmt.cryptoPrice(last)})</span>`;
  }

  async function render(days) {
    currentDays = days;
    const seq = ++requestSeq;
    svgWrapEl().innerHTML = '<div class="spinner">⏳ Grafik yükleniyor…</div>';
    document.getElementById("cryptoChartPeriodStat").innerHTML = "";
    try {
      const data = await Api.get(`/api/crypto-chart?id=${encodeURIComponent(currentCoin.id)}&days=${days}`);
      if (seq !== requestSeq) return; // bu arada başka bir sekmeye tıklandı, eski cevap atlanır
      document.getElementById("cryptoChartPeriodStat").innerHTML = periodStatHtml(data.prices);
      svgWrapEl().innerHTML = svgHtml(data.prices, `cryptoChartGrad-${currentCoin.id}`);
    } catch (e) {
      if (seq !== requestSeq) return;
      svgWrapEl().innerHTML = `<div class="error">Yüklenemedi: ${e.message}</div>`;
    }
  }

  function show(coin) {
    currentCoin = coin;
    document.getElementById("cryptoChartModalLogo").innerHTML = Fmt.logoHtml(coin.symbol, coin.logo, "logo-md");
    document.getElementById("cryptoChartModalSymbol").textContent = coin.symbol;
    const defaultDays = 30;
    modalEl().querySelectorAll(".chart-tab").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.days) === defaultDays);
    });
    modalEl().classList.add("is-open");
    render(defaultDays);
  }

  function closeModal() {
    modalEl().classList.remove("is-open");
  }

  function init() {
    modalEl().querySelectorAll(".chart-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        modalEl().querySelectorAll(".chart-tab").forEach((b) => b.classList.toggle("active", b === btn));
        render(Number(btn.dataset.days));
      });
    });
    modalEl().addEventListener("click", (e) => {
      if (e.target === modalEl() || e.target.closest(".modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  return { init, show };
})();
