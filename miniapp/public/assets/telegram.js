/* ============================================================
   assets/telegram.js — Telegram WebApp SDK başlatma + tema
   ============================================================ */
(() => {
  const tg = window.Telegram && window.Telegram.WebApp;

  // telegram-web-app.js script'i normal bir tarayıcıda da yüklenir ve
  // gerçek Telegram dışında sabit bir açık tema döndürür — initData boşsa
  // gerçekten Telegram içinde değiliz demektir, o zaman tarayıcının/işletim
  // sisteminin kendi karanlık/aydınlık tercihine (style.css'teki
  // prefers-color-scheme) karışmıyoruz.
  const insideTelegram = !!(tg && tg.initData);

  if (!insideTelegram) {
    window.TG = { initData: "", ready: () => {}, expand: () => {} };
    return;
  }

  tg.ready();
  tg.expand();

  // Telegram'ın tek tek tema renklerini (themeParams) almak yerine sadece
  // açık/karanlık bilgisini (colorScheme) kullanıyoruz: bazı Telegram
  // istemcilerinde themeParams eksik/tutarsız geliyor (örn. koyu arka plan +
  // varsayılan koyu metin kombinasyonu → okunmaz oluyor). style.css'teki
  // kendi kontrastı garanti paletimiz her zaman tutarlı kalır.
  // Kullanıcı assets/theme.js ile elle bir tema seçtiyse (localStorage),
  // bu seçim Telegram'ın otomatik algılamasına her zaman önceliklidir.
  function applyTheme() {
    let manual = null;
    try { manual = localStorage.getItem("theme"); } catch { /* kapalıysa yok say */ }
    if (manual === "dark" || manual === "light") return;
    document.documentElement.dataset.theme = tg.colorScheme === "dark" ? "dark" : "light";
  }
  applyTheme();
  tg.onEvent("themeChanged", applyTheme);

  window.TG = tg;
  window.TG.initData = tg.initData || "";
})();
