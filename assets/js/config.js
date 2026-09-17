/* ============================================================
   config.js — Uygulama ayarları ve analiz parametreleri
   Skor eşiklerini buradan değiştirerek motorun davranışını
   tek yerden ayarlayabilirsiniz.
   ============================================================ */
const CONFIG = {
  API_BASE: "https://finnhub.io/api/v1",

  // Hızlı erişim çipleri
  POPULAR: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "AMD", "NFLX", "KO"],

  // Boyut ağırlıkları (toplam 1.00). Eksik veri olan boyut otomatik atlanır
  // ve kalan ağırlıklar yeniden normalize edilir.
  WEIGHTS: {
    valuation: 0.20,   // Değerleme
    profit:    0.20,   // Kârlılık
    growth:    0.20,   // Büyüme
    health:    0.15,   // Finansal sağlık
    technical: 0.15,   // Teknik / momentum
    analyst:   0.10,   // Analist görüşü
  },

  // Skor -> karar bantları (alt sınır dahil). `key` dilden bağımsız stabil
  // tanımlayıcıdır (portföy filtrelemesi buna göre çalışır); `label` ise
  // kullanıcıya gösterilen, emir kipi değil derecelendirme dilidir.
  VERDICT_BANDS: [
    { min: 75, key: "strongBuy",  label: "Çok İyi",  color: "var(--green)"   },
    { min: 60, key: "buy",        label: "İyi",       color: "var(--green-d)" },
    { min: 45, key: "hold",       label: "Normal",    color: "var(--yellow)"  },
    { min: 32, key: "sell",       label: "Zayıf",     color: "var(--orange)"  },
    { min: 0,  key: "strongSell", label: "Çok Zayıf", color: "var(--red)"     },
  ],

  // Skorlama eşikleri: [çok iyi, iyi, orta, zayıf]
  // "up"  -> yüksek değer iyi (eşikten büyük/eşitse puan artar)
  // "down"-> düşük değer iyi (eşikten küçük/eşitse puan artar)
  THRESHOLDS: {
    pe:        { dir: "down", t: [15, 25, 40, 60]  },
    pb:        { dir: "down", t: [1.5, 3, 6, 10]   },
    ps:        { dir: "down", t: [2, 5, 10, 18]    },
    roe:       { dir: "up",   t: [20, 12, 5, 0]    },
    roa:       { dir: "up",   t: [12, 7, 3, 0]     },
    netMargin: { dir: "up",   t: [20, 10, 3, 0]    },
    grossMargin:{ dir: "up",  t: [50, 35, 20, 10]  },
    revGrowth: { dir: "up",   t: [20, 8, 2, -5]    },
    epsGrowth: { dir: "up",   t: [20, 8, 0, -10]   },
    rev5y:     { dir: "up",   t: [15, 8, 3, 0]     },
    currentRatio:{ dir: "up", t: [2, 1.5, 1, 0.8]  },
    debtEquity:{ dir: "down", t: [0.5, 1, 2, 3]    },
    quickRatio:{ dir: "up",   t: [1.5, 1, 0.7, 0.4]},
    ret52:     { dir: "up",   t: [25, 8, -5, -25]  },
    ret13:     { dir: "up",   t: [15, 3, -5, -15]  },
    rangePos:  { dir: "up",   t: [60, 40, 20, 5]   },
  },
};

// Node'da (otomasyon scripti) require ile kullanılabilmesi için.
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
}
