/* ============================================================
   automation/articleExtract.js — Kaynak haber sayfasından gerçek metinden
   orta/uzun bir özet çıkarır. Finnhub'ın verdiği özet bazı kaynaklarda
   (ör. Cointelegraph) sadece 1-2 cümle oluyor — o metni uzatmak için
   HİÇBİR ŞEY uydurulmaz; bunun yerine haberin kendi linkindeki asıl
   makale HTML'i çekilip <p> paragrafları birleştirilir. Bir sitede
   başarısız olursa (JS ile render ediliyor, bot engeli, paywall vb.)
   sessizce null döner — çağıran Finnhub'ın kısa özetini kullanmaya
   devam eder, akış hiçbir zaman kesilmez.

   ÖNBELLEK: aynı URL bir sonraki haber yenilemesinde de görünebileceği
   için (translate.js'teki gerekçenin aynısı) çıkarılan metin
   automation/store.js üzerinden URL'ye göre önbelleğe alınır — aynı
   makale bir daha asla yeniden çekilip ayrıştırılmaz.
   ============================================================ */
const store = require("./store.js");

const FETCH_TIMEOUT_MS = 6000;
const MAX_WORDS = 160; // "orta/uzun paragraf" hedefi — tam makale değil
const MIN_PARAGRAPH_CHARS = 40; // nav/reklam/altyazı gibi kısa satırları ele
const MIN_EXCERPT_WORDS = 15; // bundan azsa gerçek makale metni bulunamamış say
const CACHE_KEY = "articleExcerptCache";
const MAX_CACHE_ENTRIES = 1500;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;|&#0?39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&#x2013;|&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/\s+/g, " ")
    .trim();
}

// Birçok haber sitesi şablonu (özellikle Cointelegraph gibi kripto
// kaynakları) gerçek makale metninden ÖNCE fiyat ticker şeridi, yazar/editör
// künyesi gibi tekrarlayan bloklar basıyor — bunlar da teknik olarak birer
// <p> paragrafı, o yüzden uzunluk filtresine takılmıyor. Canlı test edilip
// görüldü, adım adım elenir.
const JUNK_PATTERNS = [
  /written by/i,
  /reviewed by/i,
  /staff writer/i,
  /staff editor/i,
  /share (this )?article/i,
  /^related:?\s/i,
  /^read more/i,
  /^advertisement/i,
  /^subscribe/i,
  /accept cookies/i,
  /all rights reserved/i,
  /^\d+\s*min read/i,
  /copy link/i,
  /x \(twitter\)/i,
  /^summary show/i,
  /linkedin\s+facebook\s+email/i,
  /^make preferred on/i,
];

// "1.62% TRX $0.3357 0.27% LINK $11.22 ..." gibi fiyat ticker şeridi —
// paragrafta $-fiyat veya %-değer geçen birden fazla token varsa büyük
// olasılıkla düz metin değil bir widget'tır.
function looksLikeTickerRibbon(text) {
  const priceTokens = (text.match(/\$\d|\b\d+(\.\d+)?%/g) || []).length;
  return priceTokens >= 3;
}

// "NOK +3.05% MSFT -1.37%" gibi satır içi ticker sembol+değişim çiftleri
// bazı şablonlarda gerçek metinle AYNI paragrafa gömülü geliyor (canlıda
// görüldü: Nokia newsroom sayfası) — paragrafın tamamını atmak gerçek
// içeriği de kaybettirir, bu yüzden sadece bu parçalar cımbızla alınır.
function stripInlineTickers(text) {
  return text.replace(/\b[A-Z]{1,6}(?:\.[A-Z]{1,3})?\s+[+-]\d+(?:\.\d+)?%\s*/g, " ");
}

// Bazı şablonlarda kategori+tarih ("Latest News Published Sep 17, 2026"),
// "N min read" veya başlığın kendisi gerçek metinle AYNI paragrafın başında
// gömülü geliyor — ayrı bir paragraf olarak süzülemiyor, bu yüzden önek
// olarak kırpılır.
function stripKnownMetaPrefix(text, headlineNorm) {
  let out = text
    .replace(/^(Latest News|Markets|Business|Regulation|Analysis|Opinion)\s+Published\s+[A-Za-z]+\.?\s+\d{1,2},?\s*\d{4}\s*/i, "")
    .replace(/\b\d+\s*min read\b/gi, " ")
    // "Thu, September 17, 2026 at 8:01 AM GMT+3" gibi yazar/yayın tarih
    // damgaları — Yahoo Finance/Barron's gibi kaynaklarda gerçek metinle
    // aynı paragrafa gömülü geliyor.
    .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Z][a-z]+\s+\d{1,2},\s*\d{4}\s+at\s+\d{1,2}:\d{2}\s*[AP]M(\s+[A-Za-z]+[+-]?\d*)?\s*/gi, " ");
  if (headlineNorm) {
    // Şablonlar başlığı gövdede bir ya da iki kez tekrarlayabiliyor — her
    // adımda `lower` yeniden hesaplanır, aksi halde ikinci geçiş zaten
    // kırpılmış metni tekrar kırpıp kelimeyi ortadan kesebilir.
    for (let i = 0; i < 2; i++) {
      if (out.toLowerCase().startsWith(headlineNorm)) out = out.slice(headlineNorm.length).trim();
      else break;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function isJunkParagraph(text) {
  return JUNK_PATTERNS.some((re) => re.test(text)) || looksLikeTickerRibbon(text);
}

// Bazı siteler (ör. Motley Fool) gerçek makaleden ÖNCE dev bir mega-menüyü
// düz <p> etiketleriyle basıyor — tek tek "gürültü" paragraf filtresi
// bunun hepsini yakalayamıyor (canlıda görüldü: fool.com). Önce makalenin
// kendi konteynerini (HTML5 <article> etiketi ya da yaygın CMS içerik
// class'ı) bulup SADECE onun içinde arama yapmak bunu büyük ölçüde önler.
// Bulunamazsa tüm sayfaya (mevcut gürültü filtreleriyle) düşülür.
const CONTENT_CLASS_RE = /class="[^"]*(article-body|articleBody|entry-content|post-content|content-body|article-content|post-body|story-body|caas-body)[^"]*"/i;
const CONTENT_WINDOW_CHARS = 20000;

function candidateRegions(html) {
  const regions = [];
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) regions.push(articleMatch[1]);
  const classMatch = html.match(CONTENT_CLASS_RE);
  if (classMatch) {
    const idx = html.indexOf(classMatch[0]);
    regions.push(html.slice(idx, idx + CONTENT_WINDOW_CHARS));
  }
  regions.push(html); // son çare: tüm sayfa, gürültü filtreleriyle
  return regions;
}

function extractParagraphs(regionHtml, headline) {
  // Sadece script/style içeriği güvenle atılabilir (regex'le HTML parse
  // etmenin sınırı burada). <nav>/<header>/<footer>/<form>/<aside> için de
  // aynısı denenmişti ama canlıda ciddi bir hataya yol açtı: gerçek
  // sitelerde (ör. MarketBeat) eşleşen kapanış etiketi regex'in beklediği
  // yerde olmayınca sayfanın neredeyse tamamı (265KB→9KB) yanlışlıkla
  // silinip asıl makale metni de kayboluyordu. Menü/altbilgi gibi <p>
  // parçaları bunun yerine aşağıdaki içerik bazlı filtrelerle (isJunkParagraph)
  // elenir — daha az agresif ama hiçbir zaman asıl metni yok etmiyor.
  const cleaned = regionHtml.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const matches = [...cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  const headlineNorm = (headline || "").trim().toLowerCase();
  return matches
    .map((m) => stripTags(m[1]))
    .map((t) => stripInlineTickers(t))
    .map((t) => stripKnownMetaPrefix(t, headlineNorm))
    .filter((t) => t.length >= MIN_PARAGRAPH_CHARS)
    .filter((t) => !isJunkParagraph(t))
    // Şablonlar başlığı gövdede birebir tekrarlayabiliyor — özete tekrar girmesin.
    .filter((t) => t.toLowerCase() !== headlineNorm);
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildExcerpt(paragraphs) {
  let out = "";
  for (const p of paragraphs) {
    const next = out ? `${out} ${p}` : p;
    if (wordCount(next) > MAX_WORDS) {
      if (!out) return p; // ilk paragraf tek başına limiti aşıyorsa yine de kullan
      break;
    }
    out = next;
  }
  return out;
}

async function fetchExcerpt(url, headline) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();

  // Adaylar en dar/en temizden en geniş/en gürültülüye doğru sırayla
  // denenir — <article> içinde yeterince kelime bulunursa tüm sayfaya
  // hiç bakılmaz (mega-menü gibi gürültüye maruz kalınmaz).
  let best = "";
  for (const region of candidateRegions(html)) {
    const excerpt = buildExcerpt(extractParagraphs(region, headline));
    if (wordCount(excerpt) > wordCount(best)) best = excerpt;
    if (wordCount(excerpt) >= MIN_EXCERPT_WORDS) return excerpt;
  }
  if (wordCount(best) >= MIN_EXCERPT_WORDS) return best;
  throw new Error("yetersiz metin");
}

async function excerptFor(url, headline, cache) {
  if (!url) return null;
  if (cache && Object.prototype.hasOwnProperty.call(cache, url)) return cache[url];
  try {
    const excerpt = await fetchExcerpt(url, headline);
    if (cache) cache[url] = excerpt;
    return excerpt;
  } catch {
    // Başarısızlık önbelleğe YAZILMAZ — kaynak sonradan erişilebilir hale
    // gelirse (geçici ağ hatası vb.) bir sonraki yenilemede tekrar denensin.
    return null;
  }
}

// Finnhub'ın kendisi bazı özetleri sessizce, kelimenin ortasından kesiyor
// (canlıda görüldü: "...connect probabil" — "probably" kelimesinin
// ortasında, üç nokta bile eklenmeden). Cümle sonu noktalamasıyla
// bitmeyen bir özet neredeyse kesinlikle kırpılmıştır — zenginleştirme
// (ve UI'daki "kaynağın kırptığı" notu) için bu sinyal kullanılır.
function looksTruncated(text) {
  const t = (text || "").trim();
  if (!t) return false;
  return !/[.!?…”'")\]]$/.test(t);
}

// Finnhub'ın verdiği özet bazı kaynaklarda (canlı görüldü: investinglive.com)
// düz metin yerine ham HTML içeriyor — savunma amaçlı temizlenir. Ayrıca
// aşırı uzun (tam makale boyutunda) özetler cümle sınırında MAX_WORDS'e kırpılır.
function sanitizeSummary(raw) {
  if (!raw) return "";
  const text = /<[a-z][\s\S]*>/i.test(raw) ? stripTags(raw) : raw.trim();
  if (wordCount(text) <= MAX_WORDS) return text;
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  let out = "";
  for (const s of sentences) {
    if (wordCount(out + s) > MAX_WORDS) break;
    out += s;
  }
  return (out || text).trim();
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

module.exports = { excerptFor, sanitizeSummary, looksTruncated, loadCache, saveCache };
