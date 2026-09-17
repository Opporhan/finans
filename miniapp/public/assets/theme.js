/* ============================================================
   assets/theme.js — Manuel açık/karanlık tema anahtarı
   Otomatik algılamaya (prefers-color-scheme / Telegram colorScheme) ek
   olarak kullanıcı elle seçebilir; seçim localStorage'da kalıcı olur ve
   otomatik algılamaya her zaman önceliklidir (bkz. assets/telegram.js).
   ============================================================ */
(() => {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  function effectiveTheme() {
    if (root.dataset.theme === "dark" || root.dataset.theme === "light") return root.dataset.theme;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function setTheme(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch { /* kapalıysa yok say */ }
  }

  btn.addEventListener("click", () => {
    setTheme(effectiveTheme() === "dark" ? "light" : "dark");
  });
})();
