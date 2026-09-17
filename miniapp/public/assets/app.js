/* ============================================================
   assets/app.js — Sekme geçişi + başlatma
   ============================================================ */
(() => {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
      if (tab.dataset.tab === "haberler") News.ensureLoaded();
      if (tab.dataset.tab === "kripto") Crypto.ensureLoaded();
    });
  });

  // Üst sekmelerin içindeki alt sekmeler (Hisseler → Durum/Hisse
  // Yatırımlarım, Kripto → Durum/Kripto Yatırımlarım) — üst sekme
  // mekanizmasıyla aynı .tab/.tab-panel sınıflarını kullanmaz (o zaman
  // üst sekme geçişiyle çakışırdı), ayrı .chart-tab/.subtab-panel
  // çifti üzerinden çalışır.
  function initSubtabs(groupSelector, panelContainerSelector, idPrefix) {
    const subtabs = document.querySelectorAll(`${groupSelector} .chart-tab`);
    const subpanels = document.querySelectorAll(`${panelContainerSelector} .subtab-panel`);
    subtabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        subtabs.forEach((b) => b.classList.toggle("active", b === btn));
        subpanels.forEach((p) => p.classList.toggle("active", p.id === `${idPrefix}-${btn.dataset.subtab}`));
      });
    });
  }
  initSubtabs(".durum-subtabs", "#tab-durum", "durum-sub");
  initSubtabs(".kripto-subtabs", "#tab-kripto", "kripto-sub");

  Fx.init();
  Info.init();
  Chart.init();
  CryptoChart.init();
  Dashboard.init();
  News.init();
  Budget.init();
  Crypto.init();
  CryptoBudget.init();
})();
