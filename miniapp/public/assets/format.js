/* ============================================================
   assets/format.js — Küçük görüntü yardımcıları
   ============================================================ */
window.Fmt = {
  usd(n) {
    if (n == null) return "—";
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  },
  // Kripto fiyatları hisselerden çok daha geniş bir aralıkta ($0.00008
  // ile $75.000 arası) — 0 ondalıklı sabit yuvarlama küçük coin'lerde
  // (DOGE, ADA vb.) fiyatı anlamsızca $0/$1'a indirger. Değere göre
  // ondalık basamak sayısı uyarlanır.
  cryptoPrice(n) {
    if (n == null) return "—";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    const digits = abs < 1 ? 4 : abs < 100 ? 2 : 0;
    return sign + "$" + abs.toLocaleString("en-US", { maximumFractionDigits: digits });
  },
  try(n) {
    if (n == null) return "—";
    const sign = n < 0 ? "-" : "";
    return sign + Math.abs(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + "₺";
  },
  // TL tutarını asıl değer, yanına parantez içinde USD karşılığını yardımcı
  // olarak gösterir — kullanıcı TL giriyor, dolar kuru değişebileceği için
  // TL her zaman birincil, dolar bilgi amaçlı.
  tryUsd(usdAmount, fxRate) {
    if (usdAmount == null) return "—";
    if (!fxRate) return this.usd(usdAmount);
    return `${this.try(usdAmount * fxRate)} (${this.usd(usdAmount)})`;
  },
  pct(n) {
    if (n == null) return "—";
    return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  },
  pctClass(n) {
    if (n == null) return "";
    return n >= 0 ? "pct-pos" : "pct-neg";
  },
  verdictBadgeClass(verdictKey) {
    if (verdictKey === "strongBuy" || verdictKey === "buy") return "green";
    if (verdictKey === "sell" || verdictKey === "strongSell") return "red";
    return "yellow";
  },
  // Kripto momentum bandı -> rozet rengi. Hisse verdictBadgeClass'tan
  // kasıtlı olarak ayrı tutulur (methodolojiler farklı), ama aynı
  // .badge.green/yellow/red CSS'ini yeniden kullanır.
  momentumBadgeClass(momentumKey) {
    if (momentumKey === "strongUp" || momentumKey === "up") return "green";
    if (momentumKey === "down" || momentumKey === "strongDown") return "red";
    return "yellow";
  },
  dateTime(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString("tr-TR"); } catch { return ""; }
  },
  relativeTime(unixSeconds) {
    if (!unixSeconds) return "";
    const diffS = Math.floor(Date.now() / 1000 - unixSeconds);
    if (diffS < 60) return "az önce";
    const diffMin = Math.floor(diffS / 60);
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} sa önce`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} gün önce`;
    try { return new Date(unixSeconds * 1000).toLocaleDateString("tr-TR"); } catch { return ""; }
  },
  initial(symbol) {
    return (symbol || "?").charAt(0).toUpperCase();
  },
  // Belirli bir şirket/coin'e bağlı olmayan genel haberler için nötr
  // ikon — emoji YERİNE bilinçli olarak düz SVG kullanılır: emoji
  // glyph'leri cihaza/fonta göre değişir (ör. 🪙 bazı Telegram
  // istemcilerinde bulanık gri bir küre/ay gibi render oluyor, canlı
  // ekran görüntüsüyle doğrulandı). SVG her platformda birebir aynı
  // görünür ve "currentColor" ile .logo-fallback'in --hint rengini
  // otomatik alır (açık/koyu tema farkı gözetmeden).
  genericCoinIconSvg() {
    return `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></svg>`;
  },
  // Şirket/coin logosu <img>, yoksa/yüklenemezse rozete düşer.
  // `fallbackHtml` verilmezse sembolün baş harfi kullanılır; genel
  // (belirli bir şirket/coin'e bağlı olmayan) içerik için çağıran taraf
  // bunun yerine genericCoinIconSvg() gibi ham HTML verebilir.
  logoHtml(symbol, url, sizeClass, fallbackHtml) {
    const cls = ["logo-wrap", sizeClass].filter(Boolean).join(" ");
    const fallback = fallbackHtml || this.initial(symbol);
    if (!url) return `<span class="${cls}"><span class="logo-fallback">${fallback}</span></span>`;
    return `<span class="${cls}"><img class="logo" src="${url}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span class="logo-fallback" style="display:none">${fallback}</span></span>`;
  },
  // Piyasaya göre oynaklık (beta) etiketi — Düşük/Orta/Yüksek risk.
  // Tıklanabilir: info.js bu rozeti yakalayıp anlam anlatımını açar.
  riskBadgeHtml(riskLevel, beta) {
    if (!riskLevel) return "";
    const cls = riskLevel === "Düşük" ? "green" : riskLevel === "Orta" ? "yellow" : "red";
    const betaText = beta != null ? ` (β${beta.toFixed(2)})` : "";
    return `<span class="risk-badge risk-${cls} info-trigger" data-info="risk">${riskLevel} risk${betaText}</span>`;
  },
  // Kripto oynaklık rozeti — beta değil, 7 günlük fiyat aralığından
  // türetilmiş ayrı bir ölçü (bkz. automation/cryptoAnalysis.js).
  // "Düşük" bandı kasıtlı olarak yok (kriptonun en sakin hali bile
  // çoğu hisseden daha oynak) — bu yüzden ayrı bir info içeriğine
  // (data-info="cryptoRisk") bağlanır, hisseninkiyle karıştırılmaz.
  cryptoRiskBadgeHtml(riskLevel) {
    if (!riskLevel) return "";
    const cls = riskLevel === "Orta" ? "yellow" : "red";
    return `<span class="risk-badge risk-${cls} info-trigger" data-info="cryptoRisk">${riskLevel} oynaklık</span>`;
  },
};
