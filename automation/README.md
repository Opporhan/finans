# ⚙️ Paylaşılan Analiz Katmanı

Bu klasör artık bağımsız bir bot/tarama otomasyonu içermiyor — yalnızca
`miniapp/api/*.js` uçlarının kullandığı **paylaşılan analiz ve portföy
mantığını** barındırıyor. Telegram etkileşimi tamamen `miniapp/` üzerinden,
tek bir Mini App (WebApp) olarak yürüyor; bot mesaj göndermiyor, sadece
menü butonuyla uygulamayı açıyor.

## Dosyalar

- `config.js` — `.env`'i okur, ayarları (Finnhub anahtarı, Telegram kimlik
  bilgileri, watchlist yolu, eşzamanlılık vb.) dışa verir.
- `finnhub.js` — Finnhub API istemcisi (Node tarafı).
- `marketData.js` — Tek sembol için fetch + `assets/js/analysis.js` ile analiz.
- `marketDataBatch.js` — Watchlist'i eşzamanlı tarayıp (`miniapp/api/status.js`)
  ve bütçeye göre portföy seçip (`miniapp/api/portfolio.js`) döndürür.
- `advisor.js` — Bütçe ayrıştırma, portföy dağıtımı, vade bazlı getiri
  hesaplama ve mesaj render fonksiyonları (`miniapp/api/horizon.js` de kullanır).
- `insight.js` — Karar etiketine göre emoji seçimi (küçük yardımcı).
- `fx.js` — USD/TRY kur bilgisi.
- `watchlist.json` — İzlenen hisse listesi; sembol eklemek/çıkarmak için
  düzenleyebilirsiniz (`{ "symbol": "PLTR", "name": "Palantir" }`).

## Ayarlar

`config.js` içinde:
- `REQUEST_DELAY_MS` — Finnhub ücretsiz plan hız limiti için istekler arası bekleme
- `PORTFOLIO_TOP_N` — Bütçe Danışmanı'nın dağıtım yapacağı en yüksek skorlu hisse sayısı
- `BATCH_CONCURRENCY` — Watchlist taranırken kaç sembol eşzamanlı çekilsin

## Yerel test

Mini App'i yerelde çalıştırmak için: `node miniapp/dev-server.js` ile
`http://localhost:3131` üzerinden test edilebilir (statik dosyalar +
`/api/*` uçlarını birlikte sunar).
