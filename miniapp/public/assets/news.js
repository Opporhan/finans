/* ============================================================
   assets/news.js — "Haberler" sekmesi: watchlist'teki hisselerle ilgili
   son haberler (Türkçeye çevrilmiş, ilgili şirket logosuyla). Tıklanınca
   dış siteye çıkmaz, uygulama içinde bir modal'da tam metni gösterir.
   ============================================================ */
window.News = (() => {
  const listEl = () => document.getElementById("haberlerList");
  const updatedEl = () => document.getElementById("haberlerUpdated");
  const modalEl = () => document.getElementById("newsModal");
  let items = [];
  let loaded = false;
  let currentFilter = "all"; // "all" | "stock" | "crypto"

  // "Kripto" — belirli bir coin/şirket tespit edilemeyen genel haberlerin
  // sembolü (bkz. automation/cryptoNewsBatch.js) — tek harf yerine nötr
  // bir SVG coin ikonuna düşer (emoji değil — bkz. format.js notu).
  function fallbackCharFor(n) {
    return n.symbol === "Kripto" ? Fmt.genericCoinIconSvg() : undefined;
  }

  // Başlık/özet artık kaynağın kendi haber sayfasından kazınan gerçek
  // metni de içerebiliyor (bkz. automation/articleExtract.js) — Finnhub'ın
  // küratörlü özetinden farklı olarak rastgele karakterler barındırabilir,
  // bu yüzden innerHTML'e gömülmeden önce escape edilir.
  function esc(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function cardHtml(n, idx) {
    const summary = n.summary && n.summary !== n.headline ? `<div class="news-summary">${esc(n.summary)}</div>` : "";
    return `
      <div class="news-card" data-idx="${idx}" role="button" tabindex="0">
        ${Fmt.logoHtml(n.symbol, n.logo, "logo-md", fallbackCharFor(n))}
        <div class="news-body">
          <div class="news-meta"><span class="news-symbol">${esc(n.symbol)}</span><span class="hint">${esc(n.source || "")} · ${Fmt.relativeTime(n.datetime)}</span></div>
          <div class="news-headline">${esc(n.headline)}</div>
          ${summary}
        </div>
      </div>`;
  }

  function openModal(n) {
    document.getElementById("newsModalLogo").innerHTML = Fmt.logoHtml(n.symbol, n.logo, "logo-md", fallbackCharFor(n));
    document.getElementById("newsModalSymbol").textContent = n.symbol;
    document.getElementById("newsModalMeta").textContent = `${n.source || ""} · ${Fmt.relativeTime(n.datetime)}`;
    document.getElementById("newsModalHeadline").textContent = n.headline;
    document.getElementById("newsModalSummary").textContent = n.summary || "";
    document.getElementById("newsModalTruncatedNote").style.display = n.truncated ? "" : "none";
    const sourceLink = document.getElementById("newsModalSource");
    if (n.url) {
      sourceLink.href = n.url;
      sourceLink.style.display = "";
    } else {
      sourceLink.style.display = "none";
    }
    modalEl().classList.add("is-open");
  }

  function closeModal() {
    modalEl().classList.remove("is-open");
  }

  // data-idx her zaman TAM items dizisindeki orijinal index'i taşır —
  // filtrelenmiş alt kümenin kendi sırası değil, açık modalın doğru
  // haberi bulabilmesi için.
  function cardHtmlAll() {
    return items
      .map((n, idx) => ({ n, idx }))
      .filter(({ n }) => currentFilter === "all" || n.type === currentFilter)
      .map(({ n, idx }) => cardHtml(n, idx))
      .join("");
  }

  function renderList() {
    if (!items.length) {
      listEl().innerHTML = '<div class="empty">Şu anda ilgili haber bulunamadı.</div>';
      return;
    }
    const html = cardHtmlAll();
    listEl().innerHTML = html || '<div class="empty">Bu filtrede haber bulunamadı.</div>';
  }

  async function load() {
    listEl().innerHTML = '<div class="spinner">⏳ Haberler getiriliyor…</div>';
    try {
      const data = await Api.get("/api/news");
      items = data.news;
      renderList();
      updatedEl().textContent = `Son güncelleme: ${Fmt.dateTime(data.generatedAt)}`;
      loaded = true;
    } catch (e) {
      listEl().innerHTML = `<div class="error">Yüklenemedi: ${e.message}</div>`;
    }
  }

  function init() {
    document.getElementById("refreshHaberler").addEventListener("click", load);

    document.querySelectorAll(".news-filter-tabs .chart-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.filter;
        document.querySelectorAll(".news-filter-tabs .chart-tab").forEach((b) => b.classList.toggle("active", b === btn));
        renderList(); // yeni ağ çağrısı yok — zaten yüklü liste istemcide süzülür
      });
    });

    listEl().addEventListener("click", (e) => {
      const card = e.target.closest(".news-card");
      if (!card) return;
      const item = items[Number(card.dataset.idx)];
      if (item) openModal(item);
    });

    modalEl().addEventListener("click", (e) => {
      if (e.target === modalEl() || e.target.closest(".modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  // Haberler sekmesi ilk açılışta değil, sekmeye ilk geçildiğinde yüklenir
  // (gereksiz Finnhub/çeviri çağrısı yapılmasın diye).
  function ensureLoaded() {
    if (!loaded) load();
  }

  return { init, load, ensureLoaded };
})();
