/* ============================================================
   automation/config.js — Otomasyon ayarları
   .env dosyasını (proje kök dizininde) okur, hassas hiçbir
   değeri koda gömmez.
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

function loadEnv() {
  const env = {};
  if (fs.existsSync(ENV_PATH)) {
    const text = fs.readFileSync(ENV_PATH, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const fileEnv = loadEnv();
const get = (key) => process.env[key] || fileEnv[key] || "";

// Mini App'i kullanabilecek Telegram kullanıcı ID'leri. TELEGRAM_ALLOWED_USER_IDS
// virgülle ayrılmış birden fazla ID kabul eder (arkadaşlarla paylaşım için);
// verilmemişse geriye dönük uyumluluk için tek başına TELEGRAM_CHAT_ID kullanılır.
const allowedIdsRaw = get("TELEGRAM_ALLOWED_USER_IDS") || get("TELEGRAM_CHAT_ID");
const TELEGRAM_ALLOWED_USER_IDS = new Set(
  allowedIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
);

const WATCHLIST_PATH = path.join(__dirname, "watchlist.json");

// api/status.js, api/news.js, api/portfolio.js ve api/cron/refresh-fundamentals.js
// aynı watchlist.json'ı bağımsız bağımsız fs.readFileSync+JSON.parse ile
// okuyordu — tek yerden okunması tek bir yeri günceller.
function getWatchlist() {
  return JSON.parse(fs.readFileSync(WATCHLIST_PATH, "utf8"));
}

module.exports = {
  ROOT,
  FINNHUB_KEY: get("FINNHUB_KEY"),
  TELEGRAM_BOT_TOKEN: get("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_CHAT_ID: get("TELEGRAM_CHAT_ID"),
  TELEGRAM_ALLOWED_USER_IDS,
  // true ise Mini App'e giriş listedeki ID'lerle sınırlı kalmaz — geçerli
  // HER Telegram kullanıcısı girebilir (initData imza kontrolü hâlâ
  // zorunlu, sadece allowlist adımı atlanır). Kota/kötüye kullanım
  // sorunu çıkarsa bu değişkeni false yapıp deploy etmek tek geri
  // dönüş yoludur — kod değişikliği gerekmez.
  TELEGRAM_PUBLIC: get("TELEGRAM_PUBLIC") === "true",
  DEEPL_API_KEY: get("DEEPL_API_KEY"),

  WATCHLIST_PATH,
  getWatchlist,

  // Finnhub ücretsiz plan ~60 istek/dk. İstekler arasında bu kadar bekle.
  REQUEST_DELAY_MS: 1100,

  // Yatırım Danışmanı: İyi/Çok İyi sinyali veren hisselerden en yüksek
  // skorlu kaç tanesine dağıtım yapılsın (geri kalanı sessizce elenmez,
  // arayüzde belirtilir). Portföy teorisinde ~8-12 pozisyon civarında
  // çeşitlendirme faydasının büyük kısmı alınmış olur; 5 fazla yoğunlaşmış,
  // 20+ ise en iyi fikirleri sulandırıp küçük bir aylık tutarı anlamsız
  // parçalara böler.
  PORTFOLIO_TOP_N: 8,

  // Aynı sektörden (finnhubIndustry) en fazla kaç hisse seçilebilir —
  // "en yüksek skorlu N" tek bir sektöre (ör. yarı iletkenler) yoğunlaşmış
  // görünüşte çeşitli ama gerçekte tek bir temaya bağımlı bir portföy
  // üretmesin diye.
  MAX_PER_INDUSTRY: 2,

  // Tek bir hissenin risk-ayarlı skoru ne olursa olsun alabileceği azami
  // pay — az sayıda kalifiye aday olan günlerde (ör. sadece 3-4 hisse AL
  // sinyali verirse) tek bir hissenin portföyü domine etmesini önler.
  MAX_WEIGHT_PER_STOCK: 0.25,

  // Mini App: watchlist'i tararken kaç sembol eşzamanlı çekilsin
  // (marketDataBatch.js, newsBatch.js). Sıralı bot/scan yolunu etkilemez.
  // Canlı test edildi: concurrency=9 hatasız (18/18), concurrency=12
  // Finnhub'dan RATE hatası döndürdü (18 istekten 12'si başarısız) — 9,
  // gözlemlenen eşiğin altında güvenli bir marj bırakır.
  BATCH_CONCURRENCY: 9,
};
