/* ============================================================
   assets/fx.js — Tema anahtarının yanındaki buton: TÜM döviz kurları ve
   değerli madenleri (altın/gümüş/platin/paladyum çeşitleri) TL bazında
   alt alta listeleyen bilgi penceresi. Sadece görüntüleme — başka hiçbir
   sekmeyi/veriyi etkilemez. info.js'teki modal aç/kapat deseniyle aynı.
   ============================================================ */
window.Fx = (() => {
  const modalEl = () => document.getElementById("fxModal");
  let loaded = false;

  // Döviz kodu tek başına herkes için net olmayabiliyor — yanına Türkçe
  // adı da yazılır (ör. "USD (Dolar)"). automation/fxRates.js'teki
  // CURRENCY_CODES ile aynı sırayı takip eder.
  const CURRENCY_NAMES = {
    USD: "Dolar", EUR: "Euro", GBP: "İngiliz Sterlini", CHF: "İsviçre Frangı",
    CAD: "Kanada Doları", RUB: "Rus Rublesi", AED: "BAE Dirhemi", AUD: "Avustralya Doları",
    DKK: "Danimarka Kronu", SEK: "İsveç Kronu", NOK: "Norveç Kronu", JPY: "Japon Yeni",
    KWD: "Kuveyt Dinarı", ZAR: "Güney Afrika Randı", BHD: "Bahreyn Dinarı", LYD: "Libya Dinarı",
    SAR: "Suudi Riyali", IQD: "Irak Dinarı", ILS: "İsrail Şekeli", INR: "Hindistan Rupisi",
    MXN: "Meksika Pesosu", HUF: "Macar Forinti", NZD: "Yeni Zelanda Doları", BRL: "Brezilya Reali",
    IDR: "Endonezya Rupiahı", CZK: "Çek Korunası", PLN: "Polonya Zlotisi", RON: "Romen Leyi",
    CNY: "Çin Yuanı", ARS: "Arjantin Pesosu", ALL: "Arnavutluk Leki", AZN: "Azerbaycan Manatı",
    BAM: "Bosna Hersek Markı", CLP: "Şili Pesosu", COP: "Kolombiya Pesosu", CRC: "Kosta Rika Kolonu",
    DZD: "Cezayir Dinarı", EGP: "Mısır Lirası", HKD: "Hong Kong Doları", ISK: "İzlanda Kronası",
    KRW: "Güney Kore Wonu", KZT: "Kazakistan Tengesi", LBP: "Lübnan Lirası", LKR: "Sri Lanka Rupisi",
    MAD: "Fas Dirhemi", MDL: "Moldova Leyi", MKD: "Makedonya Dinarı", MYR: "Malezya Ringgiti",
    OMR: "Umman Riyali", PEN: "Peru Solu", PHP: "Filipin Pesosu", PKR: "Pakistan Rupisi",
    QAR: "Katar Riyali", RSD: "Sırbistan Dinarı", SGD: "Singapur Doları", SYP: "Suriye Lirası",
    THB: "Tayland Bahtı", TWD: "Tayvan Doları", UAH: "Ukrayna Grivnası", UYU: "Uruguay Pesosu",
    GEL: "Gürcistan Larisi", TND: "Tunus Dinarı", BGN: "Bulgar Levası", VND: "Vietnam Dongu",
  };

  // Değerler her zaman TL — karışıklık olmasın diye her satırda ₺ ekiyle
  // gösterilir (üstteki not tek başına gözden kaçabilir). Uygulama genelinde
  // ₺ her zaman sayının SONUNA eklenir (bkz. format.js Fmt.try — aynı kural).
  function fmtTry(n) {
    if (n == null) return "—";
    return n.toLocaleString("tr-TR", { maximumFractionDigits: n < 100 ? 2 : 0 }) + "₺";
  }

  function rowsHtml(rows, labelKey) {
    return rows
      .map((r) => {
        const label = labelKey === "code" && CURRENCY_NAMES[r.code]
          ? `${r.code} <span class="fx-row-name">(${CURRENCY_NAMES[r.code]})</span>`
          : r[labelKey];
        return `
        <div class="fx-row">
          <span class="fx-row-code">${label}</span>
          <span class="fx-row-buy">${fmtTry(r.buy)}</span>
          <span class="fx-row-sell">${fmtTry(r.sell)}</span>
        </div>`;
      })
      .join("");
  }

  function sectionHtml(title, rows, labelKey) {
    if (!rows.length) return "";
    return `
      <div class="fx-section-title">${title}</div>
      <div class="fx-list-head">
        <span>${labelKey === "code" ? "Kod" : "Tür"}</span><span>Alış</span><span>Satış</span>
      </div>
      <div class="fx-list">${rowsHtml(rows, labelKey)}</div>`;
  }

  function render(data) {
    document.getElementById("fxBody").innerHTML =
      sectionHtml("Döviz Kurları", data.currencies || [], "code") +
      sectionHtml("Altın &amp; Gümüş", data.metals || [], "label");
    const updatedEl = document.getElementById("fxUpdated");
    updatedEl.textContent = data.updatedAt
      ? `Tüm değerler Türk Lirası (₺) cinsindendir · Güncelleme: ${data.updatedAt}`
      : "Tüm değerler Türk Lirası (₺) cinsindendir";
  }

  async function load() {
    try {
      const data = await Api.get("/api/fx");
      render(data.rates);
      loaded = true;
    } catch (e) {
      document.getElementById("fxBody").innerHTML = `<div class="error">Yüklenemedi: ${e.message}</div>`;
    }
  }

  function open() {
    modalEl().classList.add("is-open");
    if (!loaded) load();
  }

  function closeModal() {
    modalEl().classList.remove("is-open");
  }

  function init() {
    document.getElementById("fxButton").addEventListener("click", open);
    modalEl().addEventListener("click", (e) => {
      if (e.target === modalEl() || e.target.closest(".modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  return { init };
})();
