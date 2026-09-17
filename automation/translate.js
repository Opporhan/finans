/* ============================================================
   automation/translate.js — İngilizce → Türkçe çeviri
   Birincil: DeepL Free API (anahtarlı, hesap bazlı ~1.000.000 karakter/ay
   kotası — MyMemory/Google'ın anonim IP bazlı kotasının aksine Vercel'in
   paylaşımlı bulut IP'lerinden güvenilir çalışır, canlıda doğrulandı: her
   ikisi de aynı anda 429 dönerken DeepL sorunsuz çevirdi). DEEPL_API_KEY
   .env'de yoksa sırasıyla MyMemory → Google'ın resmi olmayan uç noktasına
   düşülür. Hepsi başarısız olursa sessizce orijinal metne döner — haber
   akışını asla kesmez.

   TOPLU İSTEK: DeepL'in KENDİ ücretsiz planı, ard arda çok sayıda AYRI
   istekte (~70-75 istek civarı, canlıda ölçüldü) kısa süreli bir hız
   sınırına takılıyor — tek tek 35 haberin başlık+özetini (70 istek)
   çevirmek bunu tetikliyordu. Çözüm: DeepL tek bir istekte BİRDEN FAZLA
   metni aynı anda çevirebiliyor (`text` parametresi tekrarlanır, istek
   başına azami 50 metin) — translateBatch() tüm haber turunu (~70 metin)
   2 isteğe indirir, sınıra hiç yaklaşmaz.

   ÖNBELLEK: aynı başlık/özet genelde birden çok yenilemede tekrar geliyor,
   o yüzden çeviri sonucu automation/store.js üzerinden (yerelde dosya,
   Vercel'de Blob) kalıcı önbelleğe yazılır — aynı metin bir daha asla ağ
   isteği tüketmez.
   ============================================================ */
const crypto = require("crypto");
const store = require("./store.js");
const CFG = require("./config.js");

// Tek bir MyMemory/Google isteğinde gönderilecek azami karakter — MyMemory
// tek sorguda ~500 karakterle sınırlı. Bundan uzun metinler cümle
// sınırlarında parçalara bölünüp ayrı ayrı çevrilir ve birleştirilir.
const CHUNK_MAX_CHARS = 450;
// DeepL: istek başına azami metin sayısı (kendi belgelenmiş sınırı 50).
const DEEPL_BATCH_SIZE = 50;
const CACHE_KEY = "translationCache";
const MAX_CACHE_ENTRIES = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hashKey(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

// Anahtar sonu ":fx" ile bitiyorsa ücretsiz plan — o zaman api.deepl.com
// DEĞİL, api-free.deepl.com kullanılmalı (DeepL'in kendi gereksinimi).
function deeplEndpoint() {
  return CFG.DEEPL_API_KEY.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
}

// Tek istekte birden fazla metin — sıra korunarak eşit uzunlukta bir dizi
// döner. Grubun tamamı ya birlikte başarılı olur ya da hep birlikte hata
// fırlatır (çağıran bir sonraki katmana düşer).
async function viaDeepLBatch(texts) {
  if (!CFG.DEEPL_API_KEY) throw new Error("DeepL: anahtar yok");
  const params = new URLSearchParams();
  texts.forEach((t) => params.append("text", t));
  params.append("target_lang", "TR");
  params.append("source_lang", "EN");
  const res = await fetch(deeplEndpoint(), {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `DeepL-Auth-Key ${CFG.DEEPL_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!res.ok) throw new Error("DeepL HTTP " + res.status);
  const data = await res.json();
  const translations = data?.translations;
  if (!Array.isArray(translations) || translations.length !== texts.length) {
    throw new Error("DeepL: beklenmeyen yanıt");
  }
  return translations.map((t) => t.text);
}

async function viaMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|tr`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("MyMemory HTTP " + res.status);
  const data = await res.json();
  // MyMemory kota/hız sınırına takılınca da HTTP 200 dönebiliyor ama
  // gövdedeki responseStatus 200 DEĞİLDİR ve translatedText alanına
  // gerçek çeviri yerine düz İngilizce bir hata/uyarı metni yazar
  // ("QUERY LENGTH LIMIT EXCEEDED...", "YOU USED ALL AVAILABLE FREE
  // TRANSLATIONS...") — bu kontrol edilmezse hata mesajı sanki gerçek
  // çeviriymiş gibi ekrana düşer (canlıda böyle görüldü).
  const status = Number(data?.responseStatus);
  if (status && status !== 200) throw new Error("MyMemory status " + status);
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error("MyMemory: boş yanıt");
  return translated;
}

async function viaGoogle(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("Google HTTP " + res.status);
  const data = await res.json();
  const translated = (data[0] || []).map((seg) => seg[0]).join("");
  if (!translated) throw new Error("Google: boş yanıt");
  return translated;
}

// DeepL toplu istek başarısız olursa (kalan az sayıda metin, ya da hiç
// DEEPL_API_KEY yoksa) tek tek buraya düşülür. Aynı anda çok fazla ayrı
// isteğin hız sınırını tetiklememesi için PAYLAŞILAN bir kapıdan geçilir.
const MAX_CONCURRENT_REQUESTS = 3;
let activeRequests = 0;
const waitQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (activeRequests < MAX_CONCURRENT_REQUESTS) {
        activeRequests++;
        resolve();
      } else {
        waitQueue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

function releaseSlot() {
  activeRequests--;
  const next = waitQueue.shift();
  if (next) next();
}

// null = MyMemory ve Google'ın ikisi de başarısız oldu.
async function translateChunkFreeOnly(text) {
  await acquireSlot();
  try {
    try {
      return await viaMyMemory(text);
    } catch {
      try {
        return await viaGoogle(text);
      } catch {
        return null;
      }
    }
  } finally {
    releaseSlot();
  }
}

// Kullanıcı hiçbir şekilde karışık dil (bir kısmı Türkçe, bir kısmı
// İngilizce) görmek istemiyor — canlıda böyle bir haber bildirildi. Genelde
// tek seferlik geçici bir hata olduğu için birkaç kez daha (artan bekleme
// ile) denenir.
async function translateChunkWithRetry(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await translateChunkFreeOnly(text);
    if (result !== null) return result;
    if (attempt < 2) await sleep(500 * (attempt + 1));
  }
  return null;
}

// Metni CHUNK_MAX_CHARS altında kalan parçalara böler, mümkün olduğunca
// cümle sınırında keser (çeviri kalitesi cümle ortasında kesilince düşer).
function splitIntoChunks(text) {
  if (text.length <= CHUNK_MAX_CHARS) return [text];
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > CHUNK_MAX_CHARS) {
      chunks.push(cur.trim());
      cur = "";
    }
    if (s.length > CHUNK_MAX_CHARS) {
      // Tek bir "cümle" başlı başına sınırı aşıyor (noktalama zayıf metin) —
      // zorunlu olarak karakter sınırında kes.
      if (cur) { chunks.push(cur.trim()); cur = ""; }
      for (let i = 0; i < s.length; i += CHUNK_MAX_CHARS) chunks.push(s.slice(i, i + CHUNK_MAX_CHARS).trim());
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

// DeepL'e hiç dokunmadan, sadece MyMemory/Google (chunking + retry) ile
// çevirir. DeepL toplu istek zaten başarısız olduysa (rate limit vb.)
// tekrar DeepL denemek anlamsız — doğrudan anahtarsız yedeğe düşülür.
async function translateFreeOnly(text) {
  const chunks = splitIntoChunks(text);
  const translatedParts = [];
  // Kasıtlı olarak sıralı (paralel değil) — tek bir uzun metnin parçaları
  // aynı anda ayrı ayrı sağlayıcıya gitmesin.
  for (const chunk of chunks) {
    const result = await translateChunkWithRetry(chunk);
    if (result === null) break; // İngilizce sızmasın diye burada dur — geri kalanı eklenmez
    translatedParts.push(result);
  }
  let translated = translatedParts.join(" ").replace(/\s+/g, " ").trim();
  // Hiçbir parça çevrilemediyse (nadir) boş göstermek yerine orijinal
  // metin kullanılır — kullanıcı asla boş bir başlık/özet görmemeli.
  if (!translated) translated = text;
  return translated;
}

function chunkArray(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Birden fazla metni TEK seferde çevirir (bkz. dosya başı not). texts
// içindeki boş/whitespace-only girdiler aynen korunur. Sıra input ile
// birebir aynı kalır. cache verilirse aynı metin bir daha ağ isteği
// tüketmez.
async function translateBatch(texts, cache) {
  const results = new Array(texts.length).fill("");
  const pending = [];

  texts.forEach((text, i) => {
    if (!text || !text.trim()) { results[i] = text || ""; return; }
    const key = cache ? hashKey(text) : null;
    if (cache && Object.prototype.hasOwnProperty.call(cache, key)) {
      results[i] = cache[key];
      return;
    }
    pending.push({ index: i, text, key, done: false });
  });

  if (pending.length === 0) return results;

  if (CFG.DEEPL_API_KEY) {
    const groups = chunkArray(pending, DEEPL_BATCH_SIZE);
    for (const group of groups) {
      // Grubun tamamı bir arada 2 kez daha denenir (429 genelde geçici) —
      // başarısız olursa grup içindeki her metin tek tek yedeğe düşer.
      let translated = null;
      for (let attempt = 0; attempt < 3 && !translated; attempt++) {
        try {
          translated = await viaDeepLBatch(group.map((p) => p.text));
        } catch {
          if (attempt < 2) await sleep(800 * (attempt + 1));
        }
      }
      if (translated) {
        group.forEach((p, gi) => {
          results[p.index] = translated[gi];
          if (cache) cache[p.key] = translated[gi];
          p.done = true;
        });
      }
    }
  }

  const remaining = pending.filter((p) => !p.done);
  if (remaining.length) {
    const CONCURRENCY = 3;
    const batches = chunkArray(remaining, CONCURRENCY);
    for (const batch of batches) {
      await Promise.all(batch.map(async (p) => {
        const translated = await translateFreeOnly(p.text);
        results[p.index] = translated;
        if (cache && translated !== p.text) cache[p.key] = translated;
      }));
    }
  }

  return results;
}

// Tek bir metin için kullanışlı sarmalayıcı (translateBatch'in tek
// elemanlı hali) — ad-hoc/tekil çağrılar için.
async function toTurkish(text, cache) {
  if (!text || !text.trim()) return text || "";
  const [result] = await translateBatch([text], cache);
  return result;
}

async function loadCache() {
  return (await store.readJSON(CACHE_KEY, {})) || {};
}

async function saveCache(cache) {
  const keys = Object.keys(cache);
  let trimmed = cache;
  if (keys.length > MAX_CACHE_ENTRIES) {
    const keep = keys.slice(keys.length - MAX_CACHE_ENTRIES);
    trimmed = {};
    keep.forEach((k) => { trimmed[k] = cache[k]; });
  }
  await store.writeJSON(CACHE_KEY, trimmed);
}

module.exports = { toTurkish, translateBatch, loadCache, saveCache };
