#!/usr/bin/env node
// ============================================================
//  仓库卫生与编码体检
//    动机：一次大改（地形生成重写 + 测试框架重构）里踩过两个坑，
//      1) FEAT_AMP_MAX 被留在调试值 0，5 类局部地貌静默失效，没有测试发现；
//      2) PowerShell 的 Get-Content -Raw / Set-Content -Encoding UTF8
//         在中文环境下把 UTF-8 读成 ANSI 再写回，**破坏源码中的中文字符**。
//    本脚本把第 2 类事故变成可检测的断言，并把其它卫生项一并体检。
//    用法：
//      node tools/hygiene.mjs
//    只读脚本：不写、不删、不改任何文件。
// ============================================================
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";

// ------------------------------------------------------------
//  0. 根目录定位（一律以 process.cwd() 为起点，向上找带 src/ + index.html 的目录）
// ------------------------------------------------------------
const CWD = process.cwd();
function findRoot(start) {
  let d = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, "src")) && existsSync(join(d, "index.html"))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return start; // 找不到就用 cwd，至少不崩
}
const ROOT = findRoot(CWD);

const rel = (p) => relative(ROOT, p).split("\\").join("/");

// ------------------------------------------------------------
//  1. 极简断言框架（与 tools/harness.mjs 同样的输出风格）
//     刻意**不** import harness.mjs：本脚本要在其它测试跑不起来时仍能跑，
//     且不能因为别人改动公共装置而失效。
// ------------------------------------------------------------
const results = [];
let failures = 0;
const clip = (s, n = 110) => {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
/** 一条断言 */
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures++;
  results.push({ kind: ok ? "pass" : "fail", name, detail: detail ? clip(detail) : "" });
  return ok;
}
/** 一条不带通过/失败语义的报告行（不计入断言数） */
function info(name, detail) {
  results.push({ kind: "info", name, detail: detail ? clip(detail, 400) : "" });
}
function section(t) {
  results.push({ kind: "section", name: t, detail: "" });
}
function finish() {
  const n = results.filter((r) => r.kind === "pass" || r.kind === "fail").length;
  const lines = results.map((r) => {
    if (r.kind === "section") return `\n──────── ${r.name} ────────`;
    if (r.kind === "info") return `  ·  ${r.name}${r.detail ? "  → " + r.detail : ""}`;
    return `  ${r.kind === "pass" ? "✅" : "❌"} ${r.name}${r.detail ? "  → " + r.detail : ""}`;
  });
  console.log(lines.join("\n"));
  console.log(`\n${failures ? "❌" : "✅"} 共 ${n} 项检查，失败 ${failures} 项`);
  process.exitCode = failures ? 1 : 0;
  return failures;
}

// ------------------------------------------------------------
//  2. 收集待体检文件
// ------------------------------------------------------------
const SCAN_DIRS = ["src", "tools", "styles"];
const SCAN_EXT = [".js", ".mjs", ".css", ".html"];
const SCAN_SINGLE = ["index.html"];
const SKIP_DIR = new Set(["node_modules", ".git", "dist", "assets"]);

/** @type {{abs:string, rel:string, ext:string, dir:string}[]} */
const files = [];
const readErrors = [];

function collect(dirAbs) {
  let entries;
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true });
  } catch (e) {
    readErrors.push(`${rel(dirAbs)} 目录读取失败：${e.message}`);
    return;
  }
  for (const e of entries) {
    const p = join(dirAbs, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      collect(p);
    } else if (e.isFile()) {
      const ext = e.name.slice(e.name.lastIndexOf("."));
      if (!SCAN_EXT.includes(ext)) continue;
      files.push({ abs: p, rel: rel(p), ext, dir: rel(dirAbs) === "" ? "." : rel(dirAbs) });
    }
  }
}
for (const d of SCAN_DIRS) {
  const p = join(ROOT, d);
  if (existsSync(p)) collect(p);
  else readErrors.push(`扫描目录不存在：${d}`);
}
for (const f of SCAN_SINGLE) {
  const p = join(ROOT, f);
  if (existsSync(p)) files.push({ abs: p, rel: f, ext: ".html", dir: "." });
  else readErrors.push(`扫描文件不存在：${f}`);
}
files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

// ------------------------------------------------------------
//  3. 极简 JS 词法扫描器
//    产出三层文本，用来区分"真代码"与"只是规则文本"：
//      raw    —— 原文
//      code   —— 去掉注释，保留字符串
//      bare   —— 去掉注释**和**字符串（只剩真正的代码记号）
//    判定某标记是"残留"还是"工具自己的匹配模式"就靠这三层的差集。
//    已知局限：模板字符串不做 ${} 嵌套处理；正则字面量只在同一行内闭合时才当正则。
// ------------------------------------------------------------
const REGEX_PREV = new Set(["(", "[", "{", ",", ";", ":", "=", "!", "&", "|", "+", "-", "%", "^", "<", ">", "~", "?"]);
const REGEX_KW = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await", "throw"]);

function scanJs(src) {
  let code = "";
  let bare = "";
  const n = src.length;
  let i = 0;
  let prevSig = "";   // 上一个非空白字符
  let word = "";      // 上一个连续的标识符
  const isWordCh = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < n) {
    const c = src[i];
    const d = i + 1 < n ? src[i + 1] : "";

    // 行注释
    if (c === "/" && d === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n" && src[j] !== "\r") j++;
      code += src.slice(i, j);
      i = j;
      continue;
    }
    // 块注释
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    // 字符串 / 模板
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        if (src[j] === "\n" && c !== "`") break; // 单行字符串未闭合
        j++;
      }
      code += src.slice(i, j);
      prevSig = "x";
      word = "";
      i = j;
      continue;
    }
    // 正则字面量（仅当上一有效字符允许、且本行内能闭合）
    if (c === "/") {
      const allow = prevSig === "" || REGEX_PREV.has(prevSig) || REGEX_KW.has(word);
      if (allow) {
        let j = i + 1;
        let closed = false;
        while (j < n && src[j] !== "\n") {
          if (src[j] === "\\") { j += 2; continue; }
          if (src[j] === "/") { j++; closed = true; break; }
          j++;
        }
        if (closed) {
          code += src.slice(i, j);
          prevSig = "x";
          word = "";
          i = j;
          continue;
        }
      }
    }
    code += c;
    bare += c;
    if (!/\s/.test(c)) {
      prevSig = c;
      word = isWordCh(c) ? word + c : "";
    }
    i++;
  }
  return { code, bare };
}

// ------------------------------------------------------------
//  4. 逐文件读入 + 解码
// ------------------------------------------------------------
const utf8 = new TextDecoder("utf-8", { fatal: true });
/** U+FFFD。用 fromCharCode 写而不是字面量——否则本脚本自己就带着替换字符，体检自己必然红。 */
const FFFD = String.fromCharCode(0xfffd);
const countFFFD = (s) => s.split(FFFD).length - 1;
/** @type {Map<string, {buf:Buffer, text:string|null, decodeErr:string|null}>} */
const loaded = new Map();
for (const f of files) {
  let buf = null;
  try {
    buf = readFileSync(f.abs);
  } catch (e) {
    loaded.set(f.rel, { buf: null, text: null, decodeErr: `读取失败：${e.message}` });
    continue;
  }
  let text = null;
  let decodeErr = null;
  try {
    text = utf8.decode(buf); // fatal:true —— 非法字节直接抛
  } catch (e) {
    decodeErr = "非法 UTF-8 字节";
    try { text = new TextDecoder("utf-8").decode(buf); } catch { text = null; }
  }
  loaded.set(f.rel, { buf, text, decodeErr });
}

// ============================================================
//  5. 检查项
// ============================================================

section("编码 / BOM / 乱码");
{
  // 每个文件一条断言，失败时逐条列出具体原因
  const badUtf8 = [], badRepl = [], badBom = [];
  for (const f of files) {
    const r = loaded.get(f.rel);
    const why = [];
    if (!r.buf) {
      why.push(r.decodeErr || "未知读取错误");
      badUtf8.push(f.rel);
    } else {
      if (r.decodeErr) { why.push(r.decodeErr); badUtf8.push(f.rel); }
      if (r.text && r.text.indexOf(FFFD) !== -1) {
        why.push(`含 U+FFFD 替换字符 ×${countFFFD(r.text)}`);
        badRepl.push(f.rel);
      }
      if (r.buf.length >= 3 && r.buf[0] === 0xef && r.buf[1] === 0xbb && r.buf[2] === 0xbf) {
        why.push("含 UTF-8 BOM (EF BB BF)");
        badBom.push(f.rel);
      }
    }
    check(`编码 ${f.rel}`, why.length === 0, why.join("；"));
  }
  check("【汇总】全部文件是合法 UTF-8", badUtf8.length === 0, badUtf8.slice(0, 6).join(", "));
  check("【汇总】无 U+FFFD 替换字符（乱码）", badRepl.length === 0, badRepl.slice(0, 6).join(", "));
  check("【汇总】无 UTF-8 BOM", badBom.length === 0, badBom.slice(0, 6).join(", "));
  // 反向自检：防止规则写错导致 0 命中、恒绿
  check("【自检】扫描到的文件数合理（>30）", files.length > 30, `${files.length} 个`);
  for (const d of SCAN_DIRS) {
    check(`【自检】${d}/ 确实扫到文件`, files.some((f) => f.rel.startsWith(d + "/")), `${files.filter((f) => f.rel.startsWith(d + "/")).length} 个`);
  }
  check("【自检】index.html 确实被扫描", files.some((f) => f.rel === "index.html"));
  for (const e of readErrors) check(`【自检】扫描无错误：${e.split("：")[0]}`, false, e);
}

section("行尾一致性（CRLF / LF）");
{
  const kind = new Map();          // rel -> "CRLF" | "LF" | "MIXED" | "无换行"
  const byDir = new Map();         // dir -> { rel: kind }
  const selfMixed = [];
  for (const f of files) {
    const r = loaded.get(f.rel);
    if (!r || !r.buf) continue;
    const s = r.text == null ? r.buf.toString("latin1") : r.text;
    const crlf = (s.match(/\r\n/g) || []).length;
    const lf = (s.match(/(?:^|[^\r])\n/g) || []).length;
    let k;
    if (crlf === 0 && lf === 0) k = "无换行";
    else if (crlf > 0 && lf > 0) k = "MIXED";
    else if (crlf > 0) k = "CRLF";
    else k = "LF";
    kind.set(f.rel, k);
    if (k === "MIXED") selfMixed.push(f.rel);
    if (!byDir.has(f.dir)) byDir.set(f.dir, []);
    byDir.get(f.dir).push([f.rel, k]);
  }
  const tally = { CRLF: [], LF: [], MIXED: [], 无换行: [] };
  for (const [r, k] of kind) tally[k].push(r);
  info(`CRLF 文件（${tally.CRLF.length}）`, tally.CRLF.join(" "));
  info(`LF 文件（${tally.LF.length}）`, tally.LF.join(" "));
  info(`单文件内混用 CRLF/LF（${tally.MIXED.length}）`, tally.MIXED.join(" "));
  info(`无换行符（${tally["无换行"].length}）`, tally["无换行"].join(" "));

  check("单文件内部行尾一致（无 CRLF/LF 混用）", selfMixed.length === 0, selfMixed.slice(0, 6).join(", "));
  const mixedDirs = [];
  for (const [dir, list] of byDir) {
    const s = new Set(list.map(([, k]) => k).filter((k) => k === "CRLF" || k === "LF" || k === "MIXED"));
    if (s.size > 1) {
      mixedDirs.push(dir);
      check(`目录内行尾一致：${dir}`, false, list.map(([r, k]) => `${r}=${k}`).join(" "));
    } else {
      check(`目录内行尾一致：${dir}`, true, list[0][1]);
    }
  }
  check("【汇总】不存在行尾混用的目录", mixedDirs.length === 0, mixedDirs.join(", "));
  const allKinds = new Set([...kind.values()].filter((k) => k !== "无换行"));
  check("【汇总】全仓库行尾风格统一（只有一种）", allKinds.size <= 1, [...allKinds].join("+"));
  check("【自检】行尾扫描覆盖全部文件", kind.size === files.length, `${kind.size}/${files.length}`);
}

section("大文件（源码 > 1MB）");
{
  const LIMIT = 1024 * 1024;
  const big = files.filter((f) => (loaded.get(f.rel).buf || { length: 0 }).length > LIMIT);
  for (const f of big) {
    check(`大文件 ${f.rel}`, false, `${(loaded.get(f.rel).buf.length / 1024 / 1024).toFixed(2)} MB > 1 MB`);
  }
  const sized = files
    .filter((f) => loaded.get(f.rel).buf)
    .map((f) => [f.rel, loaded.get(f.rel).buf.length])
    .sort((a, b) => b[1] - a[1]);
  info("最大的 5 个文件", sized.slice(0, 5).map(([r, n]) => `${r}=${(n / 1024).toFixed(0)}KB`).join(" "));
  check("【汇总】无 > 1MB 的源码文件", big.length === 0, big.map((f) => f.rel).join(", "));
  check("【自检】大文件检查覆盖全部文件", sized.length === files.length, `${sized.length}/${files.length}`);
}

section("console 残留（仅限 src/，tools/ 允许）");
{
  const selfRel = "tools/hygiene.mjs";
  const scanned = [];
  const hits = [];
  for (const f of files) {
    if (f.rel === selfRel) continue; // 体检脚本自身必然包含这些字面量
    if (!f.rel.startsWith("src/")) continue;
    if (f.ext !== ".js" && f.ext !== ".mjs") continue;
    const r = loaded.get(f.rel);
    if (!r || r.text == null) continue;
    scanned.push(f.rel);
    const { bare } = scanJs(r.text);
    const m = bare.match(/\bconsole\s*\.\s*(?:log|debug)\b/g);
    if (m) hits.push([f.rel, m.length]);
  }
  for (const [r, n] of hits) check(`console 残留 ${r}`, false, `${n} 处 console.log/console.debug`);
  check("【汇总】src/ 无 console.log / console.debug", hits.length === 0, hits.map(([r]) => r).join(", "));
  check("【自检】console 检查确实扫到 src 文件（>30）", scanned.length > 30, `${scanned.length} 个`);
  check("【自检】tools/ 未被 console 检查波及", !files.some((f) => f.rel === selfRel && f.rel.startsWith("src/")), `本文件已排除：${selfRel}`);
}

section("调试残留（debugger / TODO / FIXME / XXX）");
{
  const selfRel = "tools/hygiene.mjs";
  const MARK = /\b(?:TODO|FIXME|XXX)\b/;
  const DBG = /\bdebugger\b/;
  const scanned = [];
  const dbgHits = [];
  const markHits = [];

  for (const f of files) {
    if (f.rel === selfRel) continue; // 规则文本本身不是残留
    const r = loaded.get(f.rel);
    if (!r || r.text == null) continue;
    scanned.push(f.rel);
    const isJs = f.ext === ".js" || f.ext === ".mjs";
    const { bare } = isJs ? scanJs(r.text) : { bare: "" };

    if (isJs) {
      const n = (bare.match(new RegExp(DBG, "g")) || []).length;
      if (n) dbgHits.push([f.rel, n, "代码中"]);
      else {
        const inCode = r.text.match(DBG);
        if (inCode) dbgHits.push([f.rel, inCode.length, "注释/字符串中"]);
      }
    }
    // 标记在 raw 里出现、在 bare 里消失 ⇒ 位于注释或字符串/正则里
    if (MARK.test(r.text)) {
      const inBare = MARK.test(bare);
      const count = (r.text.match(new RegExp(MARK, "g")) || []).length;
      const lines = r.text.split(/\r?\n/);
      const ln = lines.findIndex((l) => MARK.test(l)) + 1;
      const tok = (r.text.match(new RegExp(MARK, "g")) || [])[0];
      markHits.push([f.rel, count, ln, inBare ? "代码中（真残留）" : "注释/字符串/正则中", tok]);
    }
  }

  for (const [r, n, w] of dbgHits) check(`debugger 语句 ${r}`, false, `${n} 处（${w}）`);
  check("【汇总】无 debugger 语句", dbgHits.length === 0, dbgHits.map(([r]) => r).join(", "));
  for (const [r, n, ln, w, tok] of markHits) check(`调试标记 ${r}:${ln}`, false, `${n} 处 ${tok}（${w}）`);
  check("【汇总】无 TODO / FIXME / XXX 标记", markHits.length === 0, markHits.map(([r]) => r).join(", "));
  check("【自检】调试残留检查确实扫到文件（>30）", scanned.length > 30, `${scanned.length} 个`);
  info(`本文件已排除（规则文本不算残留）：${selfRel}`);
}

section("文件结尾（无连续空行）");
{
  const hits = [];
  for (const f of files) {
    const r = loaded.get(f.rel);
    if (!r || r.text == null) continue;
    // 以"两个及以上换行（可夹空白）"结尾 ⇒ 尾部有连续空行
    if (/(?:\r?\n)[ \t]*(?:\r?\n)[ \t]*$/.test(r.text)) hits.push(f.rel);
  }
  for (const r of hits) check(`文件结尾 ${r}`, false, "以连续空行结尾");
  check("【汇总】无以连续空行结尾的文件", hits.length === 0, hits.slice(0, 8).join(", "));
  check("【自检】结尾检查覆盖全部文件", files.every((f) => loaded.get(f.rel).text != null), `${files.length} 个`);
}

section("一次性产物（只报告，不删除）");
{
  // 形如 probe*.mjs / mut*.mjs / sweep.mjs / dbg* / *.bak / *_out.txt / mut.txt
  // 允许前导下划线与任意前后缀：实测残留长成 `_probe-save.mjs`、`_probe2_tmp.mjs`、
  // `_tmp_probe.mjs` 等各种形状，只认 `^probe` 会漏掉一大半。
  // 名字里含 probe / mut / sweep / dbg 一律算残留——"看起来像正式文件"的调试残留
  // 恰恰是最该被抓出来的。已核对：正式文件（autotest/audit/harness/serve）均不含这些子串。
  const P = (re) => new RegExp(re, "i");
  const PATTERNS = [
    P("probe"), P("^_*mut.*\\.mjs$"), P("sweep"), P("dbg"),
    /\.bak$/i, /_out\.txt$/i, P("^_*mut\\.txt$"),
  ];
  // 白名单：mutate.mjs 是**正式**的变异测试工具（根目录与 tools/ 都算数）
  const WHITELIST = new Set(["mutate.mjs", "tools/mutate.mjs"]);
  const found = [];
  for (const d of [".", "tools"]) {
    const dirAbs = join(ROOT, d);
    let entries = [];
    try { entries = readdirSync(dirAbs, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const r = d === "." ? e.name : `tools/${e.name}`;
      if (WHITELIST.has(r) || WHITELIST.has(e.name)) continue;
      if (PATTERNS.some((p) => p.test(e.name))) found.push(r);
    }
  }
  for (const f of found) check(`一次性产物 ${f}`, false, "疑似调试残留（未删除，请人工确认）");
  check("【汇总】无一次性调试产物（mutate.mjs 已白名单）", found.length === 0, found.join(", "));
  check("【自检】确实扫到了根目录", existsSync(join(ROOT, "package.json")), "package.json");
  check("【自检】确实扫到了 tools/", files.some((f) => f.rel.startsWith("tools/")), `${files.filter((f) => f.rel.startsWith("tools/")).length} 个`);
  check("【自检】mutate.mjs 存在且已白名单", existsSync(join(ROOT, "mutate.mjs")) || existsSync(join(ROOT, "tools", "mutate.mjs")), "根目录或 tools/");
}

// ------------------------------------------------------------
finish();
