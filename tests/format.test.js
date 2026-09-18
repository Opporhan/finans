/* ============================================================
   tests/format.test.js — miniapp/public/assets/format.js (Fmt)
   format.js tarayıcı için yazılmış (window.Fmt = {...}); Node'da
   çalıştırmak için minimal bir window stub'ı yeterli, dosyanın kendisi
   değiştirilmedi.
   ============================================================ */
const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global.window || {};
require("../miniapp/public/assets/format.js");
const Fmt = global.window.Fmt;

test("Fmt.try — ₺ her zaman sayının SONUNA eklenir (öne değil)", () => {
  assert.equal(Fmt.try(48.67), "49₺");
  assert.equal(Fmt.try(1234567.89), "1.234.568₺");
});

test("Fmt.try — negatif tutarda işaret ₺'den ÖNCE kalır", () => {
  assert.equal(Fmt.try(-5000), "-5.000₺");
});

test("Fmt.try — null/undefined için boş gösterge döner", () => {
  assert.equal(Fmt.try(null), "—");
  assert.equal(Fmt.try(undefined), "—");
});

test("Fmt.pct — pozitif değere + işareti ekler, negatife eklemez", () => {
  assert.equal(Fmt.pct(12.34), "+12.3%");
  assert.equal(Fmt.pct(-5.67), "-5.7%");
  assert.equal(Fmt.pct(0), "+0.0%");
});

test("Fmt.usd / Fmt.cryptoPrice — $ önekiyle, ondalık kuralları farklı", () => {
  assert.equal(Fmt.usd(1500), "$1,500");
  // Kripto: <$1 değerler 4 ondalık gösterir (küçük coin'ler $0'a yuvarlanmasın diye)
  assert.equal(Fmt.cryptoPrice(0.00008), "$0.0001");
  assert.equal(Fmt.cryptoPrice(45000), "$45,000");
});

test("Fmt.tryUsd — kur verilmezse sadece USD, verilirse TL birincil", () => {
  assert.equal(Fmt.tryUsd(100, null), "$100");
  assert.equal(Fmt.tryUsd(100, 40), "4.000₺ ($100)");
});

test("Fmt.verdictBadgeClass — hisse verdict anahtarını rozet rengine eşler", () => {
  assert.equal(Fmt.verdictBadgeClass("strongBuy"), "green");
  assert.equal(Fmt.verdictBadgeClass("buy"), "green");
  assert.equal(Fmt.verdictBadgeClass("sell"), "red");
  assert.equal(Fmt.verdictBadgeClass("strongSell"), "red");
  assert.equal(Fmt.verdictBadgeClass("hold"), "yellow");
});
