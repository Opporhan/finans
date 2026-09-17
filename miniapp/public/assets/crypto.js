/* ============================================================
   assets/crypto.js — "Kripto" sekmesi: momentum/oynaklık panosu.
   dashboard.js'in rowHtml/load desenini izler, ama kriptonun sadece
   4 gerçek metriği (24s/7g/30g/1y) olduğu için ayrı bir "detay"
   panosuna gerek yok — hepsi tek satırda görünür.
   ============================================================ */
window.Crypto = (() => {
  const listEl = () => document.getElementById("kriptoList");
  const updatedEl = () => document.getElementById("kriptoUpdated");
  let currentCoins = []; // CryptoChart.show için — yeni ağ çağrısı yapmadan erişim
  let loaded = false;

  function rowHtml(c) {
    const badgeClass = Fmt.momentumBadgeClass(c.momentumKey);
    const ch = c.changes || {};
    return `
      <div class="row" data-id="${c.id}">
        <div class="row-head">
          <div class="row-main">
            ${Fmt.logoHtml(c.symbol, c.logo)}
            <span class="score-ring" style="--score:${c.momentumScore ?? 0};--ring-color:var(--${badgeClass})"><span>${c.momentumScore ?? "—"}</span></span>
            <span class="symbol">${c.symbol}</span>
          </div>
          <div class="row-head-right">
            <button class="chart-open-btn" data-id="${c.id}" type="button" aria-label="Grafiği gör" title="Grafiği gör">📈</button>
            <span class="badge ${badgeClass} info-trigger" data-info="cryptoMomentum">${c.momentumLabel}</span>
          </div>
        </div>
        <div class="row-metrics">
          <span>24s: <b class="${Fmt.pctClass(ch.h24)}">${Fmt.pct(ch.h24)}</b></span>
          <span>7g: <b class="${Fmt.pctClass(ch.d7)}">${Fmt.pct(ch.d7)}</b></span>
          <span>30g: <b class="${Fmt.pctClass(ch.d30)}">${Fmt.pct(ch.d30)}</b></span>
          <span>1y: <b class="${Fmt.pctClass(ch.y1)}">${Fmt.pct(ch.y1)}</b></span>
          ${Fmt.cryptoRiskBadgeHtml(c.riskLevel)}
        </div>
        <div class="row-metrics row-metrics-price">
          <span class="hint">Fiyat: <b>${Fmt.cryptoPrice(c.price)}</b></span>
        </div>
      </div>`;
  }

  // #kriptoList kabı sabit kalıyor, dashboard.js'teki attachChartOpen ile
  // aynı gerekçeyle listener SADECE init()'te bir kez bağlanır.
  function attachChartOpen() {
    listEl().addEventListener("click", (e) => {
      const btn = e.target.closest(".chart-open-btn");
      if (!btn) return;
      const c = currentCoins.find((x) => x.id === btn.dataset.id);
      if (c) CryptoChart.show(c);
    });
  }

  async function load() {
    listEl().innerHTML = '<div class="spinner">⏳ Kripto verileri çekiliyor…</div>';
    try {
      const data = await Api.get("/api/crypto");
      if (!data.coins.length) {
        listEl().innerHTML = '<div class="empty">Veri bulunamadı.</div>';
        return;
      }
      currentCoins = data.coins;
      listEl().innerHTML = data.coins.map(rowHtml).join("");
      updatedEl().textContent = `Son güncelleme: ${Fmt.dateTime(data.generatedAt)}`;
      loaded = true;
    } catch (e) {
      listEl().innerHTML = `<div class="error">Yüklenemedi: ${e.message}</div>`;
    }
  }

  // "Kripto" sekmesi ilk açılışta değil, sekmeye ilk geçildiğinde
  // yüklenir (news.js'teki ensureLoaded deseniyle aynı) — gereksiz
  // CoinGecko çağrısı yapılmasın diye.
  function ensureLoaded() {
    if (!loaded) load();
  }

  function init() {
    document.getElementById("refreshKripto").addEventListener("click", load);
    attachChartOpen();
  }

  return { init, load, ensureLoaded };
})();
