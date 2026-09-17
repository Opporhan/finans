/* ============================================================
   miniapp/api/_lib/telegramAuth.js — Telegram Mini App initData doğrulama
   Telegram'ın resmi algoritması: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
   ============================================================ */
const crypto = require("crypto");

function verifyInitData(initDataRaw, botToken, maxAgeSec = 86400) {
  if (!initDataRaw || !botToken) return { valid: false, reason: "missing" };

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) return { valid: false, reason: "no_hash" };
  params.delete("hash");

  const pairs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad_hash" };
  }

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) {
    return { valid: false, reason: "expired" };
  }

  let user = null;
  try { user = JSON.parse(params.get("user") || "null"); } catch { /* geçersiz JSON, user null kalır */ }
  if (!user || !user.id) return { valid: false, reason: "no_user" };

  return { valid: true, user, authDate };
}

// Her API handler'ının başında çağrılır: initData imzası geçersizse 401.
// CFG.TELEGRAM_PUBLIC true DEĞİLSE, kullanıcı izin verilen ID listesinde
// olmalı yoksa 403 döner (bot token'ı/URL'yi bulan başka biri veriye
// erişemesin diye — CFG.TELEGRAM_ALLOWED_USER_IDS, tek kullanıcı ya da
// arkadaşlarla paylaşım için birden fazla ID içerebilir). TELEGRAM_PUBLIC
// true ise bu adım atlanır — imza kontrolü (geçerli bir Telegram kullanıcısı
// olma şartı) hâlâ zorunlu, sadece "kim" sorusu artık önemli değil.
function authorize(req, CFG) {
  const initData = req.headers["x-telegram-init-data"];
  const { valid, user } = verifyInitData(initData, CFG.TELEGRAM_BOT_TOKEN);
  if (!valid) return { ok: false, status: 401 };
  if (!CFG.TELEGRAM_PUBLIC && !CFG.TELEGRAM_ALLOWED_USER_IDS.has(String(user.id))) return { ok: false, status: 403 };
  return { ok: true, user };
}

module.exports = { verifyInitData, authorize };
