/* ============================================================
   assets/chart.js — "Durum" sekmesinde bir hisseye ait fiyat grafiği
   (X: zaman, Y: fiyat). Yeni bir API çağrısı yapmaz — zaten /api/status
   ile gelen 5 gerçek dönem getirisinden (1ay/3ay/YBB/6ay/1yıl) gerçek
   geçmiş fiyat seviyeleri türetip düz çizgiyle birleştirir. Finnhub'ın
   ücretsiz planı günlük mum (candle) vermediği için (403) bu, uydurma
   veri üretmeden ulaşılabilecek en iyi gerçek yaklaşımdır.
   ============================================================ */
window.Chart = (() => {
  const modalEl = () => document.getElementById("chartModal");
  const svgWrapEl = () => document.getElementById("chartSvgWrap");

  let currentSymbol = null;
  let currentData = null; // { returns, price }
  let currentWindowMonths = 12;

  // automation/advisor.js'teki ytdMonths() ile BİREBİR aynı formül —
  // istemci tarafında ağ çağrısı yapmadan aynı "kaç ay önce" mantığını
  // uygulamak için (bkz. budget.js'teki capWeights/recomputeWeights'in
  // sunucu mantığını client-side yansıtma deseni).
  function ytdMonthsNow() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = (now - startOfYear) / (1000 * 60 * 60 * 24);
    return Math.max(days / 30.44, 0.1);
  }

  // Her dönem yüzdesini ("o andan bugüne getiri") güncel fiyattan geriye
  // doğru gerçek bir geçmiş fiyat seviyesine çevirir: eğer p1 aylık getiri
  // %10 ise, o zaman 1 ay önceki fiyat = güncel fiyat / 1.10.
  // Not: "5g" kasıtlı olarak dışarıda bırakılır — "Şimdi"ye (0 ay) o kadar
  // yakın (~0.16 ay) ki orantılı eksende neredeyse üst üste biner ve
  // etiketleri okunmaz hale getirir; kalan 6 nokta zaten aynı hikayeyi
  // (1 yıl önceden bugüne) yeterince gösteriyor.
  function buildAllPoints(returns, price) {
    const defs = [
      { key: "m1", months: 1, label: "1A" },
      { key: "m3", months: 3, label: "3A" },
      { key: "ytd", months: ytdMonthsNow(), label: "YBB" },
      { key: "m6", months: 6, label: "6A" },
      { key: "y1", months: 12, label: "1Y" },
    ];
    const points = defs
      .map((d) => ({ ...d, returnPct: returns?.[d.key] }))
      .filter((d) => d.returnPct != null && Number.isFinite(d.months) && d.months > 0)
      .map((d) => ({ label: d.label, monthsAgo: d.months, price: price / (1 + d.returnPct / 100) }));
    points.push({ label: "Şimdi", monthsAgo: 0, price });
    points.sort((a, b) => b.monthsAgo - a.monthsAgo); // en eski -> en yeni
    return points;
  }

  // Zaman-orantılı x konumları birbirine çok yakın düşerse (ör. "3 Ay"
  // penceresinde 1A ile Şimdi) etiketler üst üste biner. Kronolojik
  // sırayı bozmadan, aralarında en az `minGap` piksel kalacak şekilde
  // sağa doğru iter (ilk nokta zaten her zaman tam `lo`'da başlar, çünkü
  // en eski nokta x eksenini tanımlıyor). Bu itme toplam genişliği
  // [lo,hi] sınırının dışına taşırırsa — minGap bu genişlikte
  // karşılanamıyor demektir — en adil ulaşılabilir çözüm olan EŞİT
  // aralıklı dağılıma düşülür (advisor.js'teki capWeights'in "tavan
  // ulaşılamazsa eşit ağırlığa düş" mantığıyla aynı fikir).
  function declutter(xs, minGap, lo, hi) {
    const n = xs.length;
    if (n <= 1) return xs.slice();
    const out = xs.slice();
    for (let i = 1; i < n; i++) {
      if (out[i] - out[i - 1] < minGap) out[i] = out[i - 1] + minGap;
    }
    if (out[n - 1] - lo > hi - lo) {
      const gap = (hi - lo) / (n - 1);
      return xs.map((_, i) => lo + i * gap);
    }
    return out;
  }

  function filterWindow(points, windowMonths) {
    return points.filter((p) => p.monthsAgo <= windowMonths + 1e-6);
  }

  // Fiyat etiketinin arkasına, metnin yaklaşık genişliğine göre yuvarlak
  // köşeli bir "chip" arka planı çizer — çizginin/ızgaranın üzerine
  // bindiğinde metin okunaksız olmasın diye.
  function labelChip(text, cx, cy, extraClass) {
    const w = text.length * 5.6 + 10;
    return `
      <rect class="chart-label-chip ${extraClass || ""}" x="${(cx - w / 2).toFixed(1)}" y="${(cy - 9).toFixed(1)}" width="${w.toFixed(1)}" height="13" rx="4"></rect>
      <text class="chart-price-label" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle">${text}</text>`;
  }

  function svgHtml(points, gradId) {
    if (points.length < 2) {
      return `<div class="chart-empty hint">Bu pencere için grafik çizecek yeterli veri yok.</div>`;
    }
    const W = 340, H = 210, padL = 26, padR = 26, padT = 34, padB = 28;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    const tMin = -points[0].monthsAgo, tMax = 0;
    const prices = points.map((p) => p.price);
    let yMin = Math.min(...prices), yMax = Math.max(...prices);
    if (yMin === yMax) { yMin -= Math.max(1, yMin * 0.02); yMax += Math.max(1, yMax * 0.02); }
    // Fiyat eksenine biraz nefes payı — en yüksek/düşük nokta tam kenara yapışmasın.
    const ySpan = yMax - yMin;
    yMin -= ySpan * 0.12; yMax += ySpan * 0.12;

    // Gerçek zamanla orantılı ham x konumları, ardından çok yakın
    // düşenler için minimum piksel aralığı uygulanır (bkz. declutter).
    const rawXs = points.map((p) => padL + ((-p.monthsAgo - tMin) / (tMax - tMin)) * plotW);
    const xs = declutter(rawXs, 46, padL, W - padR);
    const y = (price) => padT + (1 - (price - yMin) / (yMax - yMin)) * plotH;

    const first = points[0].price, last = points[points.length - 1].price;
    const trendClass = last >= first ? "chart-line-pos" : "chart-line-neg";

    const coords = points.map((p, i) => `${xs[i].toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
    const areaPath = `M${xs[0].toFixed(1)},${(padT + plotH).toFixed(1)} L${coords.split(" ").join(" L")} L${xs[xs.length - 1].toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

    // 3 yatay referans çizgisi (üst/orta/alt) — göz fiyat seviyesini
    // takip etsin diye, ekstra sayı etiketi olmadan sade bir ızgara.
    const gridLines = [0.2, 0.5, 0.8].map((t) => {
      const gy = padT + t * plotH;
      return `<line class="chart-grid" x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}"></line>`;
    }).join("");

    const marks = points.map((p, i) => {
      const px = xs[i], py = y(p.price);
      const isNow = i === points.length - 1;
      const priceLabelY = i % 2 === 0 ? Math.max(py - 12, 16) : Math.max(py - 24, 16);
      const dotR = isNow ? 4.5 : 3;
      return `
        ${isNow ? `<circle class="chart-dot-halo ${trendClass}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9"></circle>` : ""}
        <circle class="chart-dot ${trendClass}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${dotR}"></circle>
        ${labelChip("$" + p.price.toFixed(0), px, priceLabelY)}
        <text class="chart-time-label ${isNow ? "chart-time-label-now" : ""}" x="${px.toFixed(1)}" y="${(H - 10).toFixed(1)}" text-anchor="middle">${p.label}</text>`;
    }).join("");

    return `
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Fiyat grafiği">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" class="chart-grad-start ${trendClass}"></stop>
            <stop offset="100%" class="chart-grad-end ${trendClass}"></stop>
          </linearGradient>
        </defs>
        ${gridLines}
        <path class="chart-area" d="${areaPath}" fill="url(#${gradId})"></path>
        <polyline class="chart-line ${trendClass}" points="${coords}" fill="none"></polyline>
        ${marks}
      </svg>`;
  }

  function periodStatHtml(points) {
    if (points.length < 2) return "";
    const first = points[0].price, last = points[points.length - 1].price;
    const diff = last - first;
    // first 0 ise (türetilmiş/hatalı bir fiyat) bölme Infinity/NaN üretip
    // kullanıcıya finansal getiri olarak "Infinity%" gösterirdi.
    const pct = first ? (diff / first) * 100 : 0;
    const cls = diff >= 0 ? "pct-pos" : "pct-neg";
    const sign = diff >= 0 ? "+" : "";
    return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span> <span class="chart-period-sub">(${sign}$${Math.abs(diff).toFixed(0)} · ${points[0].label} → Şimdi)</span>`;
  }

  function render() {
    const points = filterWindow(buildAllPoints(currentData.returns, currentData.price), currentWindowMonths);
    document.getElementById("chartPeriodStat").innerHTML = periodStatHtml(points);
    svgWrapEl().innerHTML = svgHtml(points, `chartGrad-${currentSymbol}`);
  }

  // "YBB" sekmesi sabit bir ay sayısına değil, tam da "yıl başından
  // bugüne" olan gerçek süreye karşılık gelir — bu yüzden diğer
  // sekmeler gibi sabit bir sayı değil, `data-months="ytd"` özel
  // değeriyle işaretlenip tıklanma anında ytdMonthsNow() ile çözülür.
  function resolveWindowMonths(raw) {
    return raw === "ytd" ? ytdMonthsNow() : Number(raw);
  }

  function show(symbol, s) {
    currentSymbol = symbol;
    currentData = { returns: s.returns || {}, price: s.price };
    currentWindowMonths = 12;
    document.getElementById("chartModalLogo").innerHTML = Fmt.logoHtml(s.symbol, s.logo, "logo-md");
    document.getElementById("chartModalSymbol").textContent = symbol;
    modalEl().querySelectorAll(".chart-tab").forEach((btn) => {
      btn.classList.toggle("active", resolveWindowMonths(btn.dataset.months) === currentWindowMonths);
    });
    render();
    modalEl().classList.add("is-open");
  }

  function closeModal() {
    modalEl().classList.remove("is-open");
  }

  function init() {
    modalEl().querySelectorAll(".chart-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentWindowMonths = resolveWindowMonths(btn.dataset.months);
        modalEl().querySelectorAll(".chart-tab").forEach((b) => b.classList.toggle("active", b === btn));
        render();
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
