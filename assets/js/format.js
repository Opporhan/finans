/* ============================================================
   format.js — Ortak biçimlendirme yardımcıları
   Hem tarayıcı arayüzü (ui.js, analysis.js) hem de Node tabanlı
   otomasyon scripti (automation/) tarafından kullanılır.
   ============================================================ */
const isNum = (v) => v !== undefined && v !== null && !isNaN(v) && v !== "";
function num(v, d = 2) { return isNum(v) ? Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—"; }
function pct(v) { return isNum(v) ? (v > 0 ? "+" : "") + Number(v).toFixed(1) + "%" : "—"; }
function fx(v) { return isNum(v) ? Number(v).toFixed(2) + "×" : "—"; }
function cap(n) { if (!isNum(n)) return "—"; if (n >= 1e6) return (n / 1e6).toFixed(2) + " T"; if (n >= 1e3) return (n / 1e3).toFixed(2) + " B"; return n.toFixed(0) + " M"; }

// Node'da (otomasyon scripti) require ile kullanılabilmesi için.
// Tarayıcıda `module` tanımsız olduğundan bu blok hiçbir şey yapmaz.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { isNum, num, pct, fx, cap };
}
