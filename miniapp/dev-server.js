/* Geçici yerel geliştirme sunucusu — Vercel'in statik+API yönlendirmesini
   taklit eder. Sadece test için, deploy edilmeyecek (miniapp/.gitignore). */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "public");
const API_DIR = path.join(__dirname, "..", "api");

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json" };

function serveStatic(req, res) {
  let p = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(PUBLIC_DIR, p);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
    res.end(data);
  });
}

function mockVercelRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  return res;
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    const name = req.url.split("?")[0].replace("/api/", "");
    const modPath = path.join(API_DIR, name + ".js");
    if (!fs.existsSync(modPath)) { res.writeHead(404); res.end("no such api"); return; }
    // Sadece istenen dosyayı değil, proje içindeki TÜM require cache'ini
    // temizle — yoksa modPath'in transitive bağımlılıkları (automation/*.js)
    // ilk yüklendikleri haliyle önbellekte kalıp değişiklikleri yansıtmaz.
    const ROOT = path.join(__dirname, "..");
    Object.keys(require.cache).forEach((key) => {
      if (key.startsWith(ROOT) && !key.includes("node_modules")) delete require.cache[key];
    });
    const handler = require(modPath);
    mockVercelRes(res);
    try {
      await handler(req, res);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }
  serveStatic(req, res);
});

const PORT = 3131;
server.listen(PORT, () => console.log(`Dev server: http://localhost:${PORT}`));
