/* ============================================================
   automation/cryptoMarketData.js — Mini App için kripto watchlist taraması
   automation/marketDataBatch.js'in kripto eşdeğeri: watchlist'i okuyup
   CoinGecko'dan canlı veri çeker, her coin'i (kategorisiyle birlikte)
   analiz eder. api/crypto.js ve api/crypto-portfolio.js tarafından
   paylaşılır — ikisi de aynı ham veriye ihtiyaç duyuyor.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const coingecko = require("./coingecko.js");
const { analyzeCoin } = require("./cryptoAnalysis.js");

const WATCHLIST_PATH = path.join(__dirname, "cryptoWatchlist.json");

async function analyzeCryptoWatchlist() {
  const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, "utf8"));
  const rows = await coingecko.markets(watchlist.map((w) => w.id));
  const byId = new Map(watchlist.map((w) => [w.id, w]));
  // Her satır ayrı try/catch içinde — bkz. marketDataBatch.js'teki aynı
  // desen. Tek bir bozuk/beklenmedik şekilli CoinGecko satırı (analyzeCoin
  // içinde patlarsa) artık tüm Kripto sekmesini/crypto-portfolio'yu 500'e
  // düşürmüyor, sadece o coin sessizce dışarıda bırakılıyor.
  const coins = rows
    .map((row) => {
      try {
        return analyzeCoin(row, byId.get(row.id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { watchlist, coins };
}

module.exports = { analyzeCryptoWatchlist, WATCHLIST_PATH };
