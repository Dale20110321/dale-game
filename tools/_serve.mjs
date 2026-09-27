// 极简静态文件服务器（开发用）：http://localhost:8765
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PORT = 8765;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(normalize(ROOT))) { res.writeHead(403); res.end(); return; }
    const s = await stat(fp);
    if (s.isDirectory()) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, {
      "Content-Type": MIME[extname(fp)] || "application/octet-stream",
      // 本地调试禁用缓存：改代码后 F5 即可生效，避免旧版 JS/CSS 残留
      "Cache-Control": "no-store",
    });
    res.end(await readFile(fp));
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(PORT, () => console.log("serving http://localhost:" + PORT));
