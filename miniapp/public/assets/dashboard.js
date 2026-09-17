/* ============================================================
   assets/dashboard.js — "Durum" sekmesi: 18 hissenin tam panosu
   ============================================================ */
window.Dashboard = (() => {
  const listEl = () => document.getElementById("durumList");
  const updatedEl = () => document.getElementById("durumUpdated");
  let currentSymbols = []; // Chart.show için — yeni ağ çağrısı yapmadan erişim

  function rowHtml(s) {
    const badgeClass = Fmt.verdictBadgeClass(s.verdictKey);
    const r = s.returns || {};
    return `
      <div class="row" data-symbol="${s.symbol}">
        <div class="row-head">
          <div class="row-main">
            ${Fmt.logoHtml(s.symbol, s.logo)}
            <span class="score-ring" style="--score:${s.score};--ring-color:var(--${badgeClass})"><span>${s.score}</span></span>
            <span class="symbol">${s.symbol}</span>
          </div>
          <div class="row-head-right">
            <button class="chart-open-btn" data-symbol="${s.symbol}" type="button" aria-label="Grafiği gör" title="Grafiği gör">📈</button>
            <span class="badge ${badgeClass} info-trigger" data-info="score">${s.verdict}</span>
          </div>
        </div>
        <div class="row-metrics">
          <span>5g: <b class="${Fmt.pctClass(r.d5)}">${Fmt.pct(r.d5)}</b></span>
          <span>YBB: <b class="${Fmt.pctClass(r.ytd)}">${Fmt.pct(r.ytd)}</b></span>
          <span>1y: <b class="${Fmt.pctClass(r.y1)}">${Fmt.pct(r.y1)}</b></span>
          ${Fmt.riskBadgeHtml(s.riskLevel, s.beta)}
        </div>
        <div class="row-detail">
          <div class="detail-item"><span class="label">1 Ay</span><span class="${Fmt.pctClass(r.m1)}">${Fmt.pct(r.m1)}</span></div>
          <div class="detail-item"><span class="label">3 Ay</span><span class="${Fmt.pctClass(r.m3)}">${Fmt.pct(r.m3)}</span></div>
          <div class="detail-item"><span class="label">6 Ay</span><span class="${Fmt.pctClass(r.m6)}">${Fmt.pct(r.m6)}</span></div>
          <div class="detail-item"><span class="label">Fiyat</span><span>$${s.price}</span></div>
        </div>
      </div>`;
  }

  function attachToggle() {
    listEl().querySelectorAll(".row-head").forEach((head) => {
      head.addEventListener("click", (e) => {
        // Skor rozeti anlatım modalını, grafik butonu grafik modalını açar — ikisi de satırı katlamaz.
        if (e.target.closest(".info-trigger") || e.target.closest(".chart-open-btn")) return;
        head.closest(".row").classList.toggle("expanded");
      });
    });
  }

  // Liste her yeniden çizildiğinde (load()) satırlar değişse de #durumList
  // kabının kendisi sabit kalıyor — bu yüzden delegated listener SADECE
  // init()'te bir kez bağlanır (attachToggle'daki gibi her satıra tekrar
  // tekrar bağlanıp yığılmaz).
  function attachChartOpen() {
    listEl().addEventListener("click", (e) => {
      const btn = e.target.closest(".chart-open-btn");
      if (!btn) return;
      const s = currentSymbols.find((x) => x.symbol === btn.dataset.symbol);
      if (s) Chart.show(s.symbol, s);
    });
  }

  async function load() {
    listEl().innerHTML = '<div class="spinner">⏳ Hisseler canlı analiz ediliyor…</div>';
    try {
      const data = await Api.get("/api/status");
      if (!data.symbols.length) {
        listEl().innerHTML = '<div class="empty">Veri bulunamadı.</div>';
        return;
      }
      currentSymbols = data.symbols;
      listEl().innerHTML = data.symbols.map(rowHtml).join("");
      attachToggle();
      let label = `Son güncelleme: ${Fmt.dateTime(data.generatedAt)}`;
      if (data.failCount) label += ` (${data.failCount} sembol alınamadı)`;
      updatedEl().textContent = label;
    } catch (e) {
      listEl().innerHTML = `<div class="error">Yüklenemedi: ${e.message}</div>`;
    }
  }

  function init() {
    document.getElementById("refreshDurum").addEventListener("click", load);
    attachChartOpen();
    load();
  }

  return { init, load };
})();
