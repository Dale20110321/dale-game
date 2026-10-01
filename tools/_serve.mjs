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

/**
 * 开发模式：把 index.html 的入口切成"直接跑源码"（跳过 dist/game.bundle.js）。
 *
 * 打包文件是**发布**用的入口（file:// 双击、GitHub Pages 都走它）。用本地服务器
 * 调试时若仍走打包文件，改完源码不重新 build 就只能看到上一次的旧代码 ——
 * 这正是本服务器存在的意义。index.html 里两个入口是并列的，直接改写会让游戏
 * 初始化两遍（详见 index.html 的入口注释），所以这里只认这两行、其余原样返回。
 */
/**
 * 开发模式：把 index.html 的入口切成"直接跑源码"（跳过 dist/game.bundle.js）。
 *
 * 打包文件是**发布**用的入口（file:// 双击、GitHub Pages 都走它）。用本地服务器
 * 调试时若仍走打包文件，改完源码不重新 build 就只能看到上一次的旧代码 ——
 * 这正是本服务器存在的意义。index.html 里两个入口是并列的，直接改写会让游戏
 * 初始化两遍（详见 index.html 的入口注释）。
 *
 * ★ 整个入口块用**一条**正则整体匹配、整体替换：只改其中一条会留下
 *   "两个入口"（双初始化）或"一个入口都没有"（白屏），两种都比退回旧 bundle 糟。
 *   匹配不上就原样返回 —— 入口写法一旦变动，这里静默放弃改写而不是改坏页面。
 */
const ENTRY_BLOCK = /<script src="dist\/game\.bundle\.js"[^>]*><\/script>\s*<script type="module">\s*if \(!window\.__daleBooted\) await import\("\.\/src\/main\.js"\);\s*<\/script>/;

function devHtml(html) {
  if (!ENTRY_BLOCK.test(html)) return html;
  return html.replace(ENTRY_BLOCK,
    '<!-- dev：跳过打包入口，直接跑 src/main.js（改完源码 F5 即生效） -->\n' +
    '<script type="module">\n  await import("./src/main.js");\n</script>');
}

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
    const body = await readFile(fp);
    res.end(extname(fp) === ".html" ? devHtml(body.toString("utf8")) : body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(PORT, () => console.log("serving http://localhost:" + PORT));
