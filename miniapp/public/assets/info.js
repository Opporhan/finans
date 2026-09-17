/* ============================================================
   assets/info.js — Skor ve risk rozetlerine tıklanınca açılan
   tam ekran anlatım modalı. İçerik sabit metindir (assets/js/config.js'teki
   gerçek ağırlık/eşik değerleriyle senkron tutulmalı — CONFIG bu dosyada
   yüklü değil çünkü skorlar sunucu tarafında zaten hesaplanmış geliyor).
   ============================================================ */
window.Info = (() => {
  const modalEl = () => document.getElementById("infoModal");

  const CONTENT = {
    score: {
      title: "Skor nasıl hesaplanıyor?",
      body: `
        <p>0-100 arası skor, 6 boyutun ağırlıklı ortalamasıdır:</p>
        <ul class="info-list">
          <li><b>Değerleme (%20)</b> — F/K, PD/DD, F/S oranları: hisse pahalı mı ucuz mu?</li>
          <li><b>Kârlılık (%20)</b> — ROE, ROA, net/brüt kâr marjı: şirket ne kadar verimli para kazanıyor?</li>
          <li><b>Büyüme (%20)</b> — gelir ve hisse başı kâr büyümesi: iş ne hızda büyüyor?</li>
          <li><b>Finansal Sağlık (%15)</b> — cari oran, borç/özkaynak: bilanço sağlam mı?</li>
          <li><b>Teknik / Momentum (%15)</b> — 52 haftalık ve 3 aylık fiyat getirisi: trend ne yönde?</li>
          <li><b>Analist Görüşü (%10)</b> — profesyonel analistlerin AL/SAT dağılımı.</li>
        </ul>
        <p>Her boyut kendi içindeki metriklerden 18-92 arası puanlanır, sonra ağırlıklı ortalama alınır. Karşılık gelen derece:</p>
        <ul class="info-list">
          <li><b>75+ → Çok İyi</b></li>
          <li><b>60-74 → İyi</b></li>
          <li><b>45-59 → Normal</b></li>
          <li><b>32-44 → Zayıf</b></li>
          <li><b>0-31 → Çok Zayıf</b></li>
        </ul>
        <p class="hint">Bu skor ileriye dönük çoklu faktörlere dayanır; hisse kartlarındaki yüzdeler ise geçmiş fiyat performansıdır — ikisi farklı şeyi ölçer. Kural tabanlı otomatik bir değerlendirmedir, yatırım tavsiyesi değildir.</p>`,
    },
    risk: {
      title: "Risk (beta) ne anlama geliyor?",
      body: `
        <p><b>β (beta)</b>, bir hissenin S&P 500 endeksine göre ne kadar oynak olduğunu gösteren katsayıdır. β=1, piyasayla aynı oynaklık demektir.</p>
        <ul class="info-list">
          <li><b>β &lt; 0.8 → Düşük risk</b> — piyasadan daha sakin, iniş-çıkışı yumuşak.</li>
          <li><b>0.8 - 1.3 → Orta risk</b> — piyasayla benzer oynaklık.</li>
          <li><b>β &gt; 1.3 → Yüksek risk</b> — piyasadan daha sert iniş-çıkış, hem kazanç hem kayıp potansiyeli büyür.</li>
        </ul>
        <p>Portföy seviyesindeki risk rozeti, seçilen hisselerin ağırlıklı ortalama betasından hesaplanır — tek bir yüksek riskli hisse, düşük paya sahipse portföyün genel riskini az etkiler.</p>
        <p class="hint">Beta, hissenin KENDİ oynaklığını ölçer. Yatırım TL ile yapılsa da hisseler USD cinsindendir; dolar/TL kuru değişimi de gerçekleşen getiriyi doğrudan etkileyen ayrı bir risktir ve beta'ya dahil değildir.</p>`,
    },
    cryptoMomentum: {
      title: "Kripto momentum skoru nasıl hesaplanıyor?",
      body: `
        <p><b>Bu, hisse skoruyla AYNI şey değildir.</b> Hisse skoru F/K, ROE, borç/özkaynak gibi şirket temel verilerine dayanır — kriptonun böyle bir bilançosu/şirketi yok, sadece fiyat verisi var. Bu yüzden kripto için sadece <b>fiyat momentumu</b> ölçülür:</p>
        <ul class="info-list">
          <li><b>7 günlük getiri (%25)</b></li>
          <li><b>30 günlük getiri (%35)</b></li>
          <li><b>1 yıllık getiri (%40)</b></li>
        </ul>
        <p>24 saatlik değişim skora dahil edilmez (çok gürültülü, sadece bilgi amaçlı gösterilir). Karşılık gelen derece:</p>
        <ul class="info-list">
          <li><b>75+ → Güçlü Yükseliş</b></li>
          <li><b>60-74 → Yükseliş</b></li>
          <li><b>45-59 → Nötr</b></li>
          <li><b>32-44 → Düşüş</b></li>
          <li><b>0-31 → Sert Düşüş</b></li>
        </ul>
        <p class="hint">Bu bir temel analiz değildir, sadece geçmiş fiyat trendini ölçer — gelecekteki fiyatı tahmin etmez. Kripto, hisse "Yatırım" portföyüne dahil edilmez, sadece bilgi amaçlıdır. Yatırım tavsiyesi değildir.</p>`,
    },
    cryptoRisk: {
      title: "Kripto oynaklık rozeti ne anlama geliyor?",
      body: `
        <p>Hisselerdeki beta ile AYNI ölçüm değildir. Kriptonun S&P 500'e göre betası anlamlı bir kıyas değil — bunun yerine son 7 günün saatlik fiyat verisinden basit bir aralık ölçüsü kullanılır: <b>(haftanın en yükseği − en düşüğü) / ortalama fiyat</b>.</p>
        <ul class="info-list">
          <li><b>%10'un altı → Orta oynaklık</b></li>
          <li><b>%10 - %25 → Yüksek oynaklık</b></li>
          <li><b>%25 üzeri → Çok Yüksek oynaklık</b></li>
        </ul>
        <p class="hint">Hisselerdeki gibi "Düşük" bandı kasıtlı olarak yok — kriptonun en sakin haftası bile çoğu hissenin en oynak haftasından daha sert hareket eder; aynı etiketi kullanmak yanıltıcı olurdu.</p>`,
    },
  };

  function show(kind) {
    const content = CONTENT[kind];
    if (!content) return;
    document.getElementById("infoModalTitle").textContent = content.title;
    document.getElementById("infoModalBody").innerHTML = content.body;
    modalEl().classList.add("is-open");
  }

  function closeModal() {
    modalEl().classList.remove("is-open");
  }

  function init() {
    // Rozetler birden çok sekmede (Durum/Yatırım) ve yeniden render edilen
    // listelerde göründüğü için document seviyesinde event delegation
    // kullanılır — her render sonrası ayrıca listener bağlamak gerekmez.
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest(".info-trigger");
      if (!trigger) return;
      e.stopPropagation(); // dashboard.js'teki satır-genişletme tıklamasıyla çakışmasın
      show(trigger.dataset.info);
    });

    modalEl().addEventListener("click", (e) => {
      if (e.target === modalEl() || e.target.closest(".modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  return { init, show };
})();
