# İlerleme Günlüğü

Oturumlar arasında nerede kaldığımızı takip etmek için buraya ara sıra kısa
kayıtlar düşülür (tarih, ne yapıldı, sırada ne var). Bu proje git deposu
olmadığı için commit geçmişi yok — bu dosya onun yerine geçiyor.

---

## 2026-09-17

- Bu günlük oluşturuldu; bundan sonra anlamlı bir iş parçası tamamlandığında
  (özellik bitince, bug düzeltilince, oturum sonunda) buraya otomatik kayıt
  düşülecek.
- Mevcut durum taraması yapıldı (kod değişikliği yok). En son aktif çalışma:
  Mini App'e hisse + kripto **haber akışı** ekleme —
  `automation/newsBatch.js`, `automation/cryptoNewsBatch.js`,
  `automation/translate.js` (İngilizce → Türkçe çeviri, MyMemory birincil /
  Google Translate yedek), `automation/config.js`.
- Sırada: kullanıcıyla netleştirilecek.

---

## 2026-09-17 (devam) — Haber çevirisi ve uzunluk sorunu düzeltildi

Kullanıcı ekran görüntüsüyle bildirdi: haberler İngilizce kalıyordu ve çok
kısaydı (1-2 cümle). Kök nedenler bulundu ve düzeltildi:

- **Çeviri çalışmıyordu:** MyMemory + Google Translate'in ikisi de günlük
  ücretsiz kotaya takılmıştı (canlı doğrulandı, HTTP 429), kod sessizce
  İngilizceye düşüyordu. Kullanıcı anahtarsız kalmayı tercih etti → artık
  `translate.js` çeviri sonuçlarını `automation/store.js` üzerinden kalıcı
  önbelleğe alıyor (aynı haber bir daha kota tüketmiyor) ve uzun metinleri
  480 karakter sınırına takılmadan cümle bazlı parçalayıp çeviriyor.
- **Özetler kısaydı:** Kısa/kırpılmış özetler artık haberin kendi
  linkindeki makaleden gerçek metinle zenginleştiriliyor
  (`automation/articleExtract.js`, yeni dosya) — hiçbir şey uydurulmuyor,
  sadece kaynağın kendi paragrafları çekiliyor. Sonuç: 35 test haberinden
  34'ü artık 40-160 kelime aralığında temiz, Türkçeye çevrilebilir paragraf.
- Test sırasında bulunup düzeltilen 3 ayrı bug: (1) parça birleştirmede
  boşluk farkı yüzünden başarısız çeviriler yanlışlıkla önbelleğe yazılıyordu,
  (2) `<nav>/<header>/<form>` temizleme regex'i bazı sitelerde (MarketBeat)
  sayfanın %96'sını yanlışlıkla siliyordu, (3) Finnhub bazı özetleri
  kelime ortasından sessizce kesiyordu, bu tespit edilemiyordu.
- Ayrıca: kazınan içerik artık `innerHTML`'e escape'lenmeden basılmıyor
  (`miniapp/public/assets/news.js`) — üçüncü taraf sitelerden gelen metin
  arttığı için önlem alındı.
- Değişen dosyalar: `automation/translate.js`, `automation/articleExtract.js`
  (yeni), `automation/newsBatch.js`, `automation/cryptoNewsBatch.js`,
  `miniapp/public/assets/news.js`.
- Doğrulanamayan tek şey: gerçek Türkçe çeviri çıktısı — test ortamının
  MyMemory/Google kotası tükenmiş durumda (~2 saat sonra sıfırlanıyor).
  Mantık (chunking, cache, fallback) doğrulandı ama kullanıcının kendi
  ortamında ilk yenilemede gerçek Türkçe metni görüp görmediği kontrol
  edilmeli.

---

## 2026-09-17 (devam 2) — Kullanıcı deploy sonrası hâlâ kısa haber gördü

Kullanıcı 2 yeni ekran görüntüsüyle bildirdi: çeviri artık ÇALIŞIYORDU
(Türkçe geliyordu) ama bazı haberler hâlâ 1-2 cümleydi. Kazıma (scraping)
bazı sitelerde başarısız oluyormuş. Kök nedenler:

- **Motley Fool (fool.com):** Gerçek makaleden ÖNCE dev bir mega-menü düz
  `<p>` etiketleriyle geliyordu, paragraf filtreleri bunu yakalayamıyordu.
  Çözüm: önce `<article>` etiketi / yaygın CMS içerik class'ı (`article-body`
  vb.) bulunup SADECE onun içinde aranıyor, bulunamazsa tüm sayfaya (gürültü
  filtreleriyle) düşülüyor.
- **Yahoo Finance/Barron's:** Makale gövdesi statik HTML'de HİÇ YOK, JS ile
  render ediliyor — basit `fetch` ile ulaşılamıyor. Bilinen, kabul edilmiş
  bir sınır (headless tarayıcı gerektirir, şimdilik eklenmedi).
- Ayrıca bulunup düzeltilen 2 bug: ticker sembol+% ve yazar/tarih damgası
  bazı sitelerde gerçek metinle AYNI paragrafa gömülüydü, paragrafı komple
  atmak yerine artık sadece bu parçalar cımbızla ayıklanıyor; başlık-tekrarı
  kırpma döngüsünde `lower` yeniden hesaplanmadığı için ikinci geçiş
  kelimenin ortasından kesiyordu (düzeltildi).
- Sonuç (35 haberlik canlı test): 34/35 artık 40+ kelime, ~34/35 tamamen
  Türkçe (1 tanesinde kaynağın kendi footer'ından gelen 3 kelimelik İngilizce
  bir alıntı fragmanı kaldı — kozmetik, göz ardı edilebilir).
- Değişen dosya: `automation/articleExtract.js` (önemli ölçüde genişletildi).
- **Vercel'e deploy edildi** (`vercel --prod`, kullanıcı onayıyla) —
  `BLOB_STORE_ID` production'da tanımlı olduğu için önbellek kalıcı olacak.
  Production: https://miniapp-ochre-one.vercel.app

---

## 2026-09-17 (devam 3) — Alakasız haber + karışık dil (TR/EN) şikayeti

Kullanıcı deploy sonrası yeni bir ekran görüntüsüyle bildirdi: (1) "Kripto"
sekmesinde kripto/piyasayla hiç ilgisi olmayan bir OpenAI AI-güvenliği
haberi çıkıyordu, (2) aynı haberin özeti bir yere kadar Türkçe, sonra
düzeltilmemiş İngilizce devam ediyordu. Kullanıcı sert bir dille "hiçbir
sorun yaşamak istemiyorum" dedi — bundan sonra bu konuda temkinli olunmalı.

- **Alakasız haber:** Finnhub'ın `/news?category=crypto` ucu bazen saf
  AI/teknoloji haberlerini de kripto kategorisinde veriyor. Artık bilinen
  bir coin/kurum eşleşmesi yoksa VE metinde hiçbir finans/kripto anahtar
  kelimesi (bitcoin, market, SEC, Fed, regulat, invest, vb.) geçmiyorsa
  haber tamamen elenir (`cryptoNewsBatch.js`, `FINANCE_RELEVANCE_RE`).
- **Karışık dil:** `translate.js`'te bir metin parçası (chunk) çevrilemezse
  artık 3 kez (artan bekleme ile) yeniden denenir; yine de başarısız olursa
  o parça ve sonrası SONUCA HİÇ EKLENMEZ — İngilizce sızması yerine metin
  o noktada temiz kırpılır. Sadece TÜM parçalar da tamamen başarısız olursa
  (nadir, iki servis de tamamen kapalıysa) boş göstermek yerine orijinal
  metne düşülür — bu tek durumda tam İngilizce görülebilir, ama asla YARIM
  karışık değil.
- Mantık izole bir simülasyonla doğrulandı (gerçek ortamda test edilemedi —
  sandbox'ta MyMemory + Google ikisi de tam kapalıydı, kısmi başarısızlık
  senaryosu üretilemedi).
- Değişen dosyalar: `automation/translate.js`, `automation/cryptoNewsBatch.js`.
- Sırada: kullanıcının bunu kendi ortamında (deploy sonrası) doğrulaması —
  hem "Kripto" sekmesinde artık alakasız haber çıkmaması hem de hiçbir
  haberde karışık dil görülmemesi gerekiyor.

---

## 2026-09-17 (devam 4) — DeepL'e geçiş: kök sorun tamamen çözüldü

Kullanıcı deploy sonrası TÜM haberlerin İngilizce kaldığını bildirdi
(SpaceX haberi örnek verildi — daha önce düzeltilmiş, kazıma çalışıyordu
ama çeviri katmanı devre dışıydı). Araştırma: MyMemory + Google'ın ikisi
de hem benim test ortamımda HEM DE production'da aynı anda 429
döndürüyordu — bu, anonim/IP-bazlı ücretsiz kotanın Vercel'in paylaşımlı
bulut IP havuzundan yapısal olarak güvenilmez olduğunu kanıtladı (tesadüf
değil). Kullanıcıya durumu anlatıp tekrar soruldu, bu kez **evet** dedi:
ücretsiz DeepL API anahtarı aldı (`5c062b25-...-...fx`, `.env` ve Vercel
production'a eklendi), DeepL birincil sağlayıcı yapıldı.

- **Yeni sorun (DeepL entegrasyonu sırasında bulundu):** DeepL'in ücretsiz
  planı ard arda ~70-75 AYRI istekte kısa süreli bir hız sınırına
  takılıyor — ölçüldü: izole testte 100 sıralı istekten ilk 73'ü başarılı,
  sonraki hepsi 429. Tam haber turu (35 haber × başlık+özet = 70 istek)
  tam bu eşiğe denk geliyordu, bu yüzden ilk entegrasyonda hâlâ bazı
  haberler İngilizce kalıyordu.
- **Çözüm:** DeepL tek istekte BİRDEN FAZLA metni aynı anda çevirebiliyor
  (`text` parametresi tekrarlanır, istek başına azami 50 metin) —
  `translate.js`'e `translateBatch()` eklendi, tüm bir haber turunu
  (~70 metin) 2 isteğe indiriyor. Sınıra hiç yaklaşılmıyor. Canlı test:
  35/35 haber artık 40+ kelime VE tamamen Türkçe, ~5 saniyede tamamlanıyor
  (önceki chunked+retry yaklaşımı 25-38 saniye sürüyordu ve yine de
  başarısız oluyordu).
- MyMemory/Google hâlâ DEEPL_API_KEY yoksa ya da DeepL toplu isteği
  tamamen başarısız olursa devrede kalan yedek (kalan metinler tek tek,
  chunking + retry ile).
- Değişen dosyalar: `automation/translate.js` (translateBatch eklendi,
  DeepL birincil), `automation/newsBatch.js`, `automation/cryptoNewsBatch.js`
  (tek tek çeviri yerine tek toplu çağrı), `.env`, `.env.example`,
  `automation/config.js` (DEEPL_API_KEY).
- **Vercel'e deploy edildi**, DEEPL_API_KEY production ortamına eklendi.
- Önemli teknik bulgu: [[feedback_news_quality_bar]] güncellendi —
  ücretsiz/anahtarsız çeviri API'leri Vercel'in paylaşımlı IP'lerinden asla
  güvenilir olmayacak; bundan sonra bu tür bir ihtiyaç çıkarsa doğrudan
  anahtarlı bir servisle başlanmalı, "önce ücretsiz dene" döngüsüne
  girilmemeli.

---

## 2026-09-17 (devam 5) — Döviz/altın takip şeridi eklendi

Kullanıcı: tema anahtarının yanına Dolar/Euro/Altın'ı (TL) takip edebileceği
basit, sadece görüntüleme amaçlı bir alan istedi.

- **Backend:** `automation/fxRates.js` (yeni) — Truncgil'in ücretsiz,
  anahtarsız API'sinden (`finans.truncgil.com/today.json`) USD, EUR ve
  gram altın alış/satış fiyatlarını TL bazında çeker. Mevcut
  `automation/fx.js` (Frankfurter, sadece USD/TRY, portföy hesaplarında
  kullanılıyor) ile KARIŞTIRILMASIN — o dosyaya dokunulmadı, bu tamamen
  ayrı/yeni bir modül. `api/fx.js` (yeni) aynı auth deseniyle (diğer
  endpoint'ler gibi `telegramAuth.authorize`) bunu dışarı veriyor.
- **Frontend:** `miniapp/public/assets/fx.js` (yeni) — sayfa açılışında
  bir kez, sonra 5 dakikada bir sessizce yenilenen, tıklanamayan basit bir
  şerit. `.brand` (logo + isim + tema anahtarı) satırının hemen altına,
  `.tabbar`'dan önce yerleşti (`index.html`, `style.css`: `.fx-ticker`
  yeni sınıflar, mevcut `.badge`/`.risk-badge` pill deseniyle tutarlı).
- Yerel dev sunucusunda (Telegram auth olmadan) mock veriyle hem açık hem
  koyu temada görsel olarak doğrulandı — tema anahtarının hemen altında,
  üç yuvarlak pill ("Dolar ₺48,68", "Euro ₺55,99", "Altın ₺6.772").
- Değişen/yeni dosyalar: `automation/fxRates.js`, `api/fx.js`,
  `miniapp/public/assets/fx.js`, `miniapp/public/index.html`,
  `miniapp/public/style.css`, `miniapp/public/assets/app.js`.
- Sırada: deploy + kullanıcının kendi Telegram ortamında gerçek veriyle
  doğrulaması.

---

## 2026-09-17 (devam 6) — Döviz/altın: şerit yerine buton+pencere, tam liste

Kullanıcı önceki tasarımı reddetti: sabit şerit yerine tema anahtarının
yanına küçük bir buton istedi; tıklayınca açılan pencerede sadece
Dolar/Euro/Altın değil TÜM döviz kurları ve altın/gümüş çeşitleri alt alta
düzgünce listelenmeli.

- `automation/fxRates.js` genişletildi: artık Truncgil'deki TÜM döviz
  kodlarını (64 adet) ve TL bazlı tüm değerli maden türlerini (gram altın,
  has altın, çeyrek, yarım, tam, cumhuriyet, ata, 14/18 ayar, 22 ayar
  bilezik, gümüş, platin, paladyum — 13 tür) döndürüyor. Truncgil'in "ons"
  alanı USD bazında olduğu için (TL değil) bilerek dışarıda bırakıldı.
- Arayüz: `#fxTicker` şeridi tamamen kaldırıldı. Yerine `.brand` satırında
  tema anahtarının yanına aynı boyutta (30px, dairesel) bir "değiş-tokuş
  oku" ikonlu buton (`#fxButton`) eklendi. Tıklanınca mevcut modal deseniyle
  (info.js ile aynı aç/kapat mantığı) `#fxModal` açılıyor: "Döviz Kurları"
  ve "Altın & Gümüş" başlıklı iki bölüm, her biri Kod/Tür · Alış · Satış
  sütunlu, alt alta kartlar halinde. İlk açılışta lazy-load (News/Crypto
  sekmeleriyle aynı `ensureLoaded` deseni).
- CSS: `.theme-toggle`'ın dairesel taban stili `.icon-btn` olarak
  paylaşılan bir sınıfa çıkarıldı (hem tema hem döviz butonu kullanıyor),
  `.theme-toggle` artık sadece güneş/ay ikon geçiş mantığını taşıyor.
- Yerel dev sunucusunda sahte veriyle hem açık hem koyu temada görsel
  olarak doğrulandı (ekran görüntüleriyle) — buton doğru yerde, pencere
  temiz ve "alt alta düzgün" kartlar halinde açılıyor.
- Değişen dosyalar: `automation/fxRates.js`, `miniapp/public/index.html`,
  `miniapp/public/style.css`, `miniapp/public/assets/fx.js` (baştan
  yazıldı), `miniapp/public/assets/app.js`. `api/fx.js` değişmedi (zaten
  generic passthrough).
- Sırada: deploy + kullanıcının kendi Telegram ortamında doğrulaması.

---

## 2026-09-17 (devam 7) — Döviz penceresi: netlik ve ikon düzeltmesi

Kullanıcı iki ince ayar istedi: (1) değerlerin TL olduğu net değildi, (2)
buton ikonu ("sağ/sola bakan iki ok alt alta") beğenilmedi.

- `miniapp/public/assets/fx.js`: 62 döviz kodu için Türkçe isim haritası
  eklendi (`CURRENCY_NAMES`) — her satırda kod artı Türkçe adı ayrı satırda
  gösteriliyor (ör. "USD" / "(Dolar)"). Her Alış/Satış değeri artık ₺
  önekiyle gösteriliyor, pencere başlığının altına da "Tüm değerler Türk
  Lirası (₺) cinsindendir" notu eklendi — üçlü netlik (başlık notu + kod
  yanında isim + her değerde ₺).
- Buton ikonu değiştirildi: eski çift-ok "değiş-tokuş" sembolü kaldırıldı,
  yerine sade bir banknot ikonu (dikdörtgen + ortada daire + iki nokta)
  kondu — daha tanınır bir "para/döviz" simgesi.
- CSS: `.fx-row-name` eklendi (kod altında küçük, hint renkli, ayrı satır).
- Yerel dev sunucusunda gerçek `Fx` modülü sahte `Api.get` yanıtıyla uçtan
  uca test edildi (hem açık hem koyu tema) — ekran görüntüleriyle
  doğrulandı.
- Değişen dosyalar: `miniapp/public/index.html` (ikon),
  `miniapp/public/assets/fx.js`, `miniapp/public/style.css`.
- Sırada: deploy + kullanıcının kendi ortamında son kontrolü.

---

## 2026-09-17 (devam 8) — "Dolar" aynı satıra, ₺ konumu soruldu

Kullanıcı: kod + Türkçe isim ("USD" / "(Dolar)") alt alta değil aynı
satırda olsun dedi — `fx-row-name`'in `display:block` kuralı kaldırıldı,
ilk sütun genişliği `1.4fr`→`1.7fr` yapıldı (uzun isimler, ör. "BAM
(Bosna Hersek Markı)", tek satıra sığsın diye). Yerel test doğrulandı.

Ayrıca kullanıcı ₺ işaretinin sonda mı ("48,67₺") önde mi ("₺48,67") daha
mantıklı olacağını sordu — önde kalması önerildi (uygulamanın geri
kalanında `format.js`'teki `Fmt.try()` zaten hep önde ₺ kullanıyor,
tutarlılık için), ama nihai karar kullanıcıya bırakıldı, henüz
değiştirilmedi.
- Değişen dosyalar: `miniapp/public/assets/fx.js`, `miniapp/public/style.css`.
- Sırada: deploy + kullanıcının ₺ konumu kararı.

---

## 2026-09-17 (devam 9) — ₺ artık HER YERDE sayının sonunda

Kullanıcı karar verdi: ₺ komple sayıdan SONRA gelsin ("48,67₺"), tüm
uygulamada tutarlı olsun. `grep -rl '₺' miniapp/public/` ile TÜM
kullanım yerleri bulundu — sadece 2 dosyada gerçek biçimlendirme kodu var:
- `format.js` → `Fmt.try(n)` (uygulama genelinde TL gösteren TEK merkezi
  fonksiyon — dashboard/budget/crypto/cryptoBudget hepsi bunun üzerinden
  geçiyor): `"₺" + sayı` → `sayı + "₺"`. Negatif işaret sayının önünde
  kalıyor ("-5.000₺"), sadece ₺ sona taşındı.
- `fx.js` → `fmtTry(n)`: aynı değişiklik.
- Node'da `Intl`/`toLocaleString` ile mantık izole test edildi
  (241.500₺, -5.000₺, 48,68₺ vb. doğru çıktı verdi), sonra fx penceresi
  yerel dev sunucusunda gerçek veriyle görsel olarak doğrulandı — hizalama/
  kayma sorunu yok (karakter sayısı/uzunluk aynı kaldığı için yapısal
  olarak bozulma riski zaten yoktu).
- Değişen dosyalar: `miniapp/public/assets/format.js`,
  `miniapp/public/assets/fx.js`.
- Sırada: deploy.

---

## 2026-09-17 (devam 10) — Herkese açık erişim + git/GitHub/Vercel pipeline

Kullanıcı üç kararı verdi: (1) Mini App tamamen herkese açık olsun, (2)
GitHub reposu şimdilik private, (3) GitHub/LinkedIn'de "dikkatli"
paylaşım ayrı, sonraki bir adım (bu oturumun kapsamı DIŞINDA).

- **Herkese açık erişim:** `TELEGRAM_PUBLIC` adında geri alınabilir bir
  toggle eklendi (`automation/config.js`, `api/_lib/telegramAuth.js`).
  `true` ise `TELEGRAM_ALLOWED_USER_IDS` allowlist kontrolü atlanır ama
  Telegram initData HMAC imza doğrulaması HÂLÂ zorunlu — "herkese açık"
  = "geçerli bir Telegram kullanıcısı olan herkes", kimliksiz erişim
  değil. `.env` ve Vercel production'a `TELEGRAM_PUBLIC=true` eklendi.
  Kota sorunu çıkarsa `false` yapıp deploy etmek tek geri dönüş yolu.
- **Git + GitHub:** Proje `git init` ile depo yapıldı (`main` dalı),
  `.gitignore` zaten sağlamdı (sır içeren hiçbir dosya stage olmadı,
  `git status` ile doğrulandı). `brew install gh` + kullanıcı tarayıcıdan
  `gh auth login --web` ile tek seferlik giriş yaptı (Opporhan hesabı).
  `gh repo create finans --private --source=. --remote=origin --push` ile
  private repo oluşturulup ilk commit push edildi:
  https://github.com/Opporhan/finans
- **Vercel ↔ GitHub bağlantısı:** `vercel git connect` ilk denemede
  "Login Connection" eksikliğinden (400), ikinci denemede GitHub App'in
  hesapta hiç kurulu olmamasından (`github.com/settings/installations`
  boştu) başarısız oldu. Çözüm: kullanıcı Vercel dashboard'dan
  (`vercel.com/orhan10/miniapp/settings/git`) "Connect Git Repository"
  akışını kullandı — bu hem GitHub App'i kurdu hem `finans` reposuna
  izni verdi, tek adımda. Sonrasında `vercel git connect` "already
  connected" dedi — bağlantı kuruldu.
- Not: `git commit` otomatik olarak hostname bazlı bir yazar kimliği
  kullandı (hostname'e dayalı, geçersiz bir e-posta) — repo public
  olmadan önce (sonraki "dikkatli paylaşım" adımında) `git config
  user.email`/`user.name` düzgün ayarlanıp gerekirse `--amend` ile
  düzeltilmeli.
- Değişen dosyalar: `automation/config.js`, `api/_lib/telegramAuth.js`,
  `.env`, `.env.example`.
- Sırada: `git push` ile otomatik deploy'un gerçekten tetiklendiğini
  doğrulamak (bir sonraki commit'te test edilecek).

---

## 2026-09-17 (devam 11) — Pipeline kök neden bulundu: geçersiz commit yazarı

İlk `git push` sonrası tetiklenen deployment (ve ardından denenen TÜM
manuel `vercel --prod` denemeleri) saatlerce "Building…"/UNKNOWN durumunda
takılı kaldı, hiç ilerlemedi (build 0ms). Vercel durum sayfası "her şey
normal" diyordu, git bağlantısını kesip tekrar denemek de yardımcı olmadı.

- **Kök neden (kullanıcı ekran görüntüsüyle buldu):** Vercel dashboard'da
  o deployment "Blocked" durumundaydı — sebep: `git init` sırasında git
  otomatik olarak hostname bazlı geçersiz bir yazar e-postası atamıştı
  (bkz. 2026-09-17 devam 10 notundaki "not").
  Vercel, GitHub hesabıyla eşleşen geçerli bir e-posta olmadan deploy'a
  izin vermiyor — bu TEK blocked deployment, Hobby plan'ın eşzamanlı
  build sınırı yüzünden SONRAKİ TÜM deploy denemelerini (git-tetiklemeli
  ve manuel CLI, ikisi de) tıkamıştı.
- **Çözüm:** `git config user.name/user.email` geçerli bir adresle
  düzeltildi, mevcut 2 commit `git checkout --orphan` ile
  TEK, doğru yazarlı bir commit'e sıkıştırılıp `main`'in yerine
  force-push edildi (kullanıcı onayıyla — repo private/solo/2 commit'lik
  olduğu için veri kaybı riski yoktu). Push sonrası yeni deployment 24
  saniyede **Ready** oldu ve production alias'larının (`ochre-one`,
  `orhan10`, `git-main`) HEPSİNE otomatik atandığı doğrulandı — pipeline
  artık uçtan uca çalışıyor.
- **Sonuç:** Herkese açık erişim (`TELEGRAM_PUBLIC=true`) artık canlıda.
  `https://miniapp-ochre-one.vercel.app` HTTP 200 dönüyor, GitHub'a her
  `git push` bundan sonra otomatik olarak bu adrese deploy olacak.
- Ders: yeni bir git deposu kurulduğunda `git config user.email`'in
  gerçek/geçerli bir adres olduğu İLK commit'ten önce doğrulanmalı — aksi
  halde (bu projede olduğu gibi) sorun saatler sonra, alakasız görünen bir
  "deploy takıldı" belirtisiyle ortaya çıkabiliyor.

---

## 2026-09-17 (devam 12) — Kapsamlı kod incelemesi + 9 bulgunun tümü düzeltildi

Kullanıcı: "her şeyi baştan sona kontrol et, varsa iyileştirmeleri uygula"
dedi. `/code-review high` skill'i TÜM kod tabanına (boş git ağacına karşı
diff, 66 dosya, ~7650 satır) karşı çalıştırıldı. 10 bulgudan 1'i
(automation/store.js'in Blob kimlik doğrulaması) `@vercel/blob@2.8.0`'ın
kaynak kodu okunarak YANLIŞ POZİTİF olduğu kanıtlandı — paket, `BLOB_STORE_ID`
+ Vercel'in otomatik enjekte ettiği `VERCEL_OIDC_TOKEN` ikilisiyle otomatik
OIDC kimlik doğrulamasına düşüyor, `BLOB_READ_WRITE_TOKEN` şart değil.

Kalan 9 bulgunun TÜMÜ düzeltildi ve fonksiyonel olarak test edildi:

1. **XSS (assets/js/ui.js):** renderNews/renderSuggestions/renderError'daki
   escape'siz innerHTML interpolasyonlarına `esc()` eklendi (miniapp'teki
   news.js'in aynı deseni).
2. **Yarış durumu (api/news.js):** stok ve kripto haber akışları aynı
   translation/excerpt önbelleğini bağımsız yükleyip birbirinin yeni
   kayıtlarını sessizce siliyordu. Önbellekler artık api/news.js'te TEK
   seferde yüklenip iki akışa da paylaştırılıyor, TEK seferde kaydediliyor
   (newsBatch.js/cryptoNewsBatch.js artık opsiyonel paylaşılan önbellek
   parametresi kabul ediyor).
3. **Cron overwrite (api/cron/refresh-fundamentals.js):** tüm semboller
   başarısız olursa fundamentals önbelleği artık boş veriyle ezilmiyor.
4. **Cron fail-open → fail-closed:** `CRON_SECRET` tanımsızsa artık erişim
   reddediliyor (önceden auth tamamen atlanıyordu).
5. **cryptoMarketData.js:** her coin artık ayrı try/catch içinde — tek bozuk
   satır tüm Kripto sekmesini 500'e düşürmüyor.
6. **chart.js + cryptoChart.js:** başlangıç fiyatı 0 olursa "Infinity%"/"NaN%"
   yerine 0 gösteriliyor.
7. **Global git config:** placeholder e-posta geçerli bir adresle
   düzeltildi — bu makinede başka bir repo aynı "geçersiz yazar → Vercel
   deploy engellenir" sorununu bir daha yaşamayacak.
8. **Kod tekrarı (readJsonBody/fmtTRY):** `api/_lib/http.js` (yeni) altında
   birleştirildi, 4 dosyadan (portfolio/crypto-portfolio/horizon/
   crypto-horizon) kopyalar kaldırıldı. `fmtTRY` da bu vesileyle sayı-sonra-₺
   kuralına (bkz. devam 9) uyduruldu.
9. **Kod tekrarı (watchlist okuma):** `automation/config.js`'e `getWatchlist()`
   eklendi, 4 dosyadaki (status/news/portfolio/cron) bağımsız
   fs.readFileSync+JSON.parse kaldırıldı.
- Tüm değişiklikler node --check ile (66 dosyanın tamamı) ve etkilenen
  endpoint'lerin gerçek iş mantığı doğrudan çağrılarak fonksiyonel test
  edildi — hiçbir regresyon bulunmadı.
- Değişen/yeni dosyalar: `assets/js/ui.js`, `api/news.js`,
  `automation/newsBatch.js`, `automation/cryptoNewsBatch.js`,
  `api/cron/refresh-fundamentals.js`, `automation/cryptoMarketData.js`,
  `miniapp/public/assets/chart.js`, `miniapp/public/assets/cryptoChart.js`,
  `api/_lib/http.js` (yeni), `api/portfolio.js`, `api/crypto-portfolio.js`,
  `api/horizon.js`, `api/crypto-horizon.js`, `automation/config.js`.
- Sırada: commit + push (artık düzelmiş pipeline'ı tekrar test edecek).
