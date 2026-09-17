/* ============================================================
   assets/api.js — Backend fetch sarmalayıcı
   Her istekte Telegram initData'yı X-Telegram-Init-Data header'ıyla gönderir.
   401/403 (whitelist'te olmayan kullanıcı) özel olarak yakalanır: kullanıcıya
   ham bir hata yerine kendi Telegram ID'sini gösteren tam ekran bir kart
   açılır — arkadaş paylaşımında @userinfobot gibi ayrı bir araca gerek
   kalmadan, uygulamayı ilk açtığında ID'sini görüp iletebilsin diye.
   ============================================================ */
let accessDeniedShown = false;

function showAccessDenied() {
  if (accessDeniedShown) return;
  accessDeniedShown = true;
  const id = window.TG?.initDataUnsafe?.user?.id;
  const overlay = document.createElement("div");
  overlay.className = "access-denied-overlay";
  overlay.innerHTML = `
    <div class="access-denied-card">
      <div class="access-denied-title">🔒 Erişim izni gerekiyor</div>
      <p class="access-denied-text">Bu uygulama sadece izin verilen kişiler tarafından kullanılabilir. Aşağıdaki numarayı uygulamayı size veren kişiye iletin — ekledikten sonra bu sayfayı yeniden açın.</p>
      ${id
        ? `<div class="access-denied-id">${id}</div><button class="btn-primary access-denied-copy" type="button">ID'yi kopyala</button>`
        : `<p class="hint">ID okunamadı — bu sayfayı Telegram uygulaması içinden açtığınızdan emin olun.</p>`}
    </div>`;
  document.body.appendChild(overlay);
  const copyBtn = overlay.querySelector(".access-denied-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(id));
        copyBtn.textContent = "Kopyalandı ✓";
      } catch {
        /* pano erişimi yoksa sessiz geç — numara zaten ekranda okunabilir */
      }
    });
  }
}

async function handleResponse(res) {
  if (res.status === 401 || res.status === 403) showAccessDenied();
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

window.Api = {
  async get(path) {
    const res = await fetch(path, {
      headers: { "X-Telegram-Init-Data": window.TG.initData || "" },
    });
    return handleResponse(res);
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": window.TG.initData || "",
      },
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  },
};
