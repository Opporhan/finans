/* ============================================================
   tests/articleExtract.test.js — automation/articleExtract.js
   Sadece ağ isteği YAPMAYAN saf fonksiyonlar test edilir
   (sanitizeSummary, looksTruncated) — excerptFor gerçek bir HTTP isteği
   attığı için burada kapsam dışı.
   ============================================================ */
const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeSummary, looksTruncated } = require("../automation/articleExtract.js");

test("sanitizeSummary — düz metni olduğu gibi bırakır", () => {
  assert.equal(sanitizeSummary("Plain text, no html."), "Plain text, no html.");
});

test("sanitizeSummary — gömülü HTML'i temizler (savunma amaçlı, ör. investinglive.com sorunu)", () => {
  assert.equal(sanitizeSummary("<p>Hello <b>world</b> &amp; friends</p>"), "Hello world & friends");
});

test("sanitizeSummary — boş/null girdi için boş döner", () => {
  assert.equal(sanitizeSummary(""), "");
  assert.equal(sanitizeSummary(null), "");
});

test("sanitizeSummary — aşırı uzun metni MAX_WORDS'e (160) cümle sınırında kırpar", () => {
  const longText = Array.from({ length: 200 }, (_, i) => `Sentence number ${i}.`).join(" ");
  const out = sanitizeSummary(longText);
  const wordCount = out.trim().split(/\s+/).length;
  assert.ok(wordCount <= 160, `beklenen <=160 kelime, gelen: ${wordCount}`);
  // Cümle sınırında kesilmeli — ortadan değil, "." ile bitmeli.
  assert.ok(out.endsWith("."), "kırpma cümle sonunda bitmeli, ortada değil");
});

test("looksTruncated — cümle sonu noktalamasıyla biten metni kırpılmamış sayar", () => {
  assert.equal(looksTruncated("This ends properly."), false);
  assert.equal(looksTruncated("Is this a question?"), false);
  assert.equal(looksTruncated('He said "stop."'), false);
});

test("looksTruncated — kelime ortasında sessizce kesilen metni kırpılmış sayar (Finnhub bug'ı)", () => {
  assert.equal(looksTruncated("This is cut off mid"), true);
  assert.equal(looksTruncated("...connect probabil"), true);
});

test("looksTruncated — boş/null metni kırpılmamış sayar", () => {
  assert.equal(looksTruncated(""), false);
  assert.equal(looksTruncated(null), false);
});
