/* ============================================================
   automation/store.js — Kalıcı durum katmanı (günlük temel veri önbelleği)
   Vercel'de (BLOB_STORE_ID mevcutsa) private Blob storage'a, yerelde
   automation/ altındaki *.local.json dosyalarına okur/yazar.
   ============================================================ */
const fs = require("fs");
const path = require("path");

const USE_BLOB = !!process.env.BLOB_STORE_ID;

function localPath(key) {
  return path.join(__dirname, `${key}.local.json`);
}

async function readJSON(key, fallback) {
  if (USE_BLOB) {
    const { get } = require("@vercel/blob");
    try {
      const result = await get(`state/${key}.json`, { access: "private" });
      if (!result) return fallback;
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }
  try {
    return JSON.parse(fs.readFileSync(localPath(key), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJSON(key, obj) {
  if (USE_BLOB) {
    const { put } = require("@vercel/blob");
    await put(`state/${key}.json`, JSON.stringify(obj), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  fs.writeFileSync(localPath(key), JSON.stringify(obj, null, 2));
}

module.exports = { readJSON, writeJSON };
