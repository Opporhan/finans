/* ============================================================
   tests/cryptoAnalysis.test.js — automation/cryptoAnalysis.js
   Kripto momentum skoru ve risk hesaplamasının çekirdek mantığı — dış
   servise bağımlı değil, saf fonksiyonlar.
   ============================================================ */
const test = require("node:test");
const assert = require("node:assert/strict");
const { momentumScore, riskLevelFor, volatilityFromSparkline } = require("../automation/cryptoAnalysis.js");

test("momentumScore — güçlü yükselişte yüksek skor verir", () => {
  const score = momentumScore({ d7: 20, d30: 50, y1: 150 });
  assert.ok(score >= 75, `güçlü yükseliş >=75 bekleniyordu, gelen: ${score}`);
});

test("momentumScore — sert düşüşte düşük skor verir", () => {
  const score = momentumScore({ d7: -20, d30: -50, y1: -60 });
  assert.ok(score <= 32, `sert düşüş <=32 bekleniyordu, gelen: ${score}`);
});

test("momentumScore — hiç veri yoksa null döner (uydurma skor yok)", () => {
  assert.equal(momentumScore({}), null);
});

test("riskLevelFor — oynaklık oranını bant etiketine eşler (hisse betasıyla AYNI kelimeler kullanılmaz)", () => {
  assert.equal(riskLevelFor(0.05), "Orta");
  assert.equal(riskLevelFor(0.15), "Yüksek");
  assert.equal(riskLevelFor(0.30), "Çok Yüksek");
  assert.equal(riskLevelFor(null), null);
  // Hisse tarafının "Düşük" bandı kripto tarafında bilinçli olarak yok.
  assert.notEqual(riskLevelFor(0.01), "Düşük");
});

test("volatilityFromSparkline — (max-min)/ortalama oranını hesaplar", () => {
  const v = volatilityFromSparkline([100, 110, 90, 105]);
  assert.ok(Math.abs(v - 0.1975) < 0.001, `beklenen ~0.1975, gelen: ${v}`);
});

test("volatilityFromSparkline — yetersiz veri için null döner", () => {
  assert.equal(volatilityFromSparkline([100]), null);
  assert.equal(volatilityFromSparkline(null), null);
  assert.equal(volatilityFromSparkline([]), null);
});
