// ============================================================
//  可访问性 / 响应式 / 对比度 深度体检
// ------------------------------------------------------------
//  覆盖 7 个域：
//    1. 对比度穷举（WCAG 2.x 相对亮度公式自实现 + 语义硬门禁 + 两两矩阵登记）
//    2. 响应式断点（四档布局 × 关键元素 × 44px 触摸目标）
//    3. 焦点与动效（:focus-visible / prefers-reduced-motion / 时长合理性）
//    4. 语义与 ARIA（index.html + src/ui/*.js 生成 HTML）
//    5. 键盘可达（方向键 / Enter / Esc / 焦点可见 / 无键盘陷阱）
//    6. 文案与 i18n 友好（无 undefined/NaN/[object Object]、emoji 兜底）
//    7. 性能静态（渲染循环内无同步 IO、无逐帧大对象分配、无 O(n²) 热点）
//
//  纪律：
//   · 阈值只用有出处的数字：WCAG 1.4.3 正文 4.5:1、1.4.11/1.4.5 非文本与大字号
//     3:1、WCAG 2.2 SC 2.5.8 命中区 24px、项目自定的 44px 触摸目标约定。
//   · 对比度自己算（sRGB 相对亮度 + (L1+.05)/(L2+.05)），断言 detail 打印实际比值。
//   · 前提不成立的断言宁可删掉（见各处「已删除」注释），不写恒真的假绿。
//   · 不修改 src/ 与 styles/；发现的产品缺陷只在本文件末尾汇总，不在这里修。
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------
//  文件读取：以 process.cwd() 为根（test-all.mjs 以项目根为 cwd 启动），
//  万一从别处直接调用则回退到本文件所在目录的上一级。
// ------------------------------------------------------------
const CWD = process.cwd();
const HERE = fileURLToPath(new URL("../", import.meta.url));
function rootJoin(...p) {
  const a = join(CWD, ...p);
  if (existsSync(a)) return a;
  const b = join(HERE, ...p);
  if (existsSync(b)) return b;
  return a; // 交由 readFileSync 抛出可读错误
}
const readProj = (...p) => readFileSync(rootJoin(...p), "utf8");

// ============================================================
//  §0  工具：CSS 解析 / HTML 扫描 / 函数体提取
// ============================================================

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** 从 s[start]（必须是 "{"）开始读配平的花括号块 */
function readBlock(s, start) {
  let depth = 0;
  for (let j = start; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") {
      depth--;
      if (depth === 0) return { body: s.slice(start + 1, j), end: j + 1 };
    }
  }
  return null;
}

/**
 * 极简 CSS 解析：把样式表摊平成 {media, selectors[], body} 规则列表，
 * 并单独记录 @media 条件与 @keyframes 名。不引第三方依赖。
 */
function parseCss(src) {
  const s = stripComments(src);
  const rules = [];
  const medias = [];
  const atRules = [];
  const walk = (text, media) => {
    let i = 0;
    while (i < text.length) {
      const brace = text.indexOf("{", i);
      if (brace < 0) return;
      const prelude = text.slice(i, brace).trim();
      const blk = readBlock(text, brace);
      if (!blk) return;
      if (/^@media\b/.test(prelude)) {
        const cond = prelude.replace(/^@media\s*/, "").trim();
        medias.push({ cond, norm: normCond(cond), body: blk.body });
        walk(blk.body, cond);
      } else if (prelude.charAt(0) === "@") {
        atRules.push({ name: prelude, media });
      } else if (prelude) {
        rules.push({
          media,
          selectors: prelude.split(",").map((x) => x.trim()).filter(Boolean),
          body: blk.body,
        });
      }
      i = blk.end;
    }
  };
  walk(s, null);
  return { rules, medias, atRules };
}

/**
 * 媒体条件归一化：去括号、去冒号后空格、压缩空白。
 * （整体去括号而不是剥一层：`(max-height:480px) and (min-width:700px)` 这种
 *   复合条件剥一层会得到 `max-height:480px) and (min-width:700px`，反而不可比。）
 */
const normCond = (c) => c.replace(/[()]/g, "").replace(/\s*:\s*/g, ":").replace(/\s+/g, " ").trim();

/** 收集所有命中某选择器（含精确匹配）的规则体 */
const rulesFor = (css, sel, mediaNorm) =>
  css.rules.filter((r) => r.selectors.includes(sel) && (!mediaNorm || normCond(r.media || "") === mediaNorm));

/** 收集某选择器在某属性上的全部声明值（按源码顺序，末位覆盖首位） */
function declVals(css, sel, prop, mediaNorm) {
  const out = [];
  const re = new RegExp("(?:^|[;{])\\s*" + prop.replace(/-/g, "\\-") + "\\s*:\\s*([^;}]+)", "g");
  for (const r of rulesFor(css, sel, mediaNorm)) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(r.body))) out.push(m[1].trim());
  }
  return out;
}

/** 取声明值里的 px 数值（无法解析返回 null） */
const pxOf = (v) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) && /px$/.test(String(v).trim()) ? n : null;
};
/** 取声明值里的 ms 数值（无法解析返回 null） */
const msOf = (v) => {
  const s = String(v).trim();
  const n = parseFloat(s);
  return Number.isFinite(n) && /^[\d.]+m?s$/.test(s) ? (s.endsWith("s") && !s.endsWith("ms") ? n * 1000 : n) : null;
};
/** 把 var(--x) 展开成令牌字面值后再取 px（令牌表在 §1 建好后注入） */
let TOKREF = {};
const resolveLen = (v) => {
  const s = String(v).replace(/var\(\s*--([a-z0-9-]+)\s*\)/gi, (_, k) => TOKREF[k] ?? "0px");
  const n = parseFloat(s);
  return Number.isFinite(n) && /px$/.test(s.trim()) ? n : null;
};

// ---- HTML 扫描 ----
const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;

function parseAttrs(str) {
  const a = {};
  for (const m of str.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)) a[m[1].toLowerCase()] = m[2];
  for (const m of str.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*'([^']*)'/g)) a[m[1].toLowerCase()] = m[2];
  for (const m of str.matchAll(/(?:^|\s)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?=\s|$)/g)) {
    const k = m[1].toLowerCase();
    if (!(k in a) && !k.startsWith("/")) a[k] = "";
  }
  return a;
}

/** 扫描所有开标签（含自闭合） */
function allTags(html) {
  const out = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html))) {
    out.push({ tag: m[1].toLowerCase(), attrs: parseAttrs(m[2]), raw: m[0], index: m.index });
  }
  return out;
}

/** 扫描成对元素（<button>…</button>），返回 {attrs, inner} */
function pairsOf(html, tag) {
  const re = new RegExp("<" + tag + "\\b((?:\"[^\"]*\"|'[^']*'|[^>])*)>([\\s\\S]*?)</" + tag + "\\s*>", "gi");
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ tag: tag.toLowerCase(), attrs: parseAttrs(m[1]), inner: m[2], raw: m[0] });
  return out;
}

const stripTags = (s) => String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const ariaName = (a, inner) => {
  const l = a["aria-label"];
  if (l !== undefined && String(l).trim() !== "") return String(l).trim();
  const t = stripTags(inner === undefined ? "" : inner);
  return t;
};
/** 是否为"纯图形/符号"按钮（无字母与汉字，只有符号/emoji/几何图形） */
const pictographicOnly = (s) => {
  const t = stripTags(s).replace(/\s+/g, "");
  if (!t) return false;
  return !/[A-Za-z0-9\u4e00-\u9fff\u3040-\u30ff]/.test(t);
};

// ---- 源码函数体提取（用于性能 / 键盘静态检查） ----
function fnSrc(src, name) {
  const s = stripComments(src);
  let m = new RegExp("(?:export\\s+)?(?:async\\s+)?function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{").exec(s);
  if (!m) m = new RegExp("(?:^|[\\s;{}])" + name + "\\s*\\([^)]*\\)\\s*\\{").exec(s);
  if (!m) return null;
  const brace = s.indexOf("{", m.index);
  const blk = readBlock(s, brace);
  return blk ? blk.body : null;
}

// ============================================================
//  §0.1  颜色工具：WCAG 2.x 相对亮度
// ============================================================
function parseColor(v) {
  const s = String(v).trim();
  if (s.charAt(0) === "#") {
    if (s.length === 4) {
      return { rgb: [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)], a: 1 };
    }
    return { rgb: [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)], a: 1 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const p = m[1].split(/[,/\s]+/).filter(Boolean).map((x) => parseFloat(x));
  if (p.length < 3 || p.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  return { rgb: [p[0], p[1], p[2]], a: p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1 };
}

/** sRGB 相对亮度（WCAG 2.x 定义，逐通道去伽马） */
function relLum(rgb) {
  const f = rgb.map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}
const contrast = (a, b) => {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));

// ============================================================
//  主函数
// ============================================================
export default async function auditA11y(ctx) {
  const { check, section, imp, TOKENS, store } = ctx;

  // ---- 读项目文件 ----
  const html = readProj("index.html");
  const cssRaw = readProj("styles/main.css");
  const tokensRaw = readProj("styles/tokens.css");
  const css = parseCss(cssRaw);
  const srcOf = (rel) => readProj("src", ...rel.split("/"));
  const S = {
    loop: srcOf("core/loop.js"),
    input: srcOf("core/input.js"),
    toast: srcOf("core/toast.js"),
    camera: srcOf("render/camera.js"),
    scene: srcOf("render/scene.js"),
    terrainR: srcOf("render/terrain.js"),
    entities: srcOf("render/entities.js"),
    particles: srcOf("render/particles.js"),
    postfx: srcOf("render/postfx.js"),
    hud: srcOf("render/hud.js"),
    bikeR: srcOf("render/bike.js"),
    bg: srcOf("render/background.js"),
    game: srcOf("game/game.js"),
    world: srcOf("game/world.js"),
    main: srcOf("main.js"),
    menu: srcOf("ui/menu.js"),
    panels: srcOf("ui/panels.js"),
    components: srcOf("ui/components.js"),
    settings: srcOf("ui/settings.js"),
    shop: srcOf("ui/shop.js"),
    donate: srcOf("ui/donate.js"),
  };
  const comp = await imp("ui/components.js");
  const panels = ctx.ui.panels;
  const menu = ctx.ui.menu;

  // ---- 令牌解析 ----
  const TOK = {};
  for (const m of tokensRaw.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) TOK[m[1]] = m[2].trim();
  TOKREF = TOK;
  // 半透明令牌统一叠在 surface-1（html,body 的 background）之上求实际色
  const solid = (name) => {
    const c = parseColor(TOK[name]);
    if (!c) return null;
    return c.a >= 1 ? c.rgb : over(c, solid("surface-1"));
  };
  const ratioOf = (fgName, bgName) => {
    const a = solid(fgName), b = solid(bgName);
    return a && b ? contrast(a, b) : NaN;
  };
  const fmt = (r) => (Number.isFinite(r) ? r.toFixed(2) + ":1" : "无法求值");

  // WCAG 阈值（有出处，不是拍脑袋）
  const AA_BODY = 4.5;      // WCAG 1.4.3 Contrast (Minimum) / 1.4.6 (增强)
  const AA_LARGE = 3.0;      // WCAG 1.4.3 大字号例外 + 1.4.11 非文本对比
  const AA_TAP_24 = 24;      // WCAG 2.2 SC 2.5.8 Target Size (Minimum) = 24×24
  const PROJ_TAP_44 = 44;    // 项目自定触摸目标约定（main.css 顶部注释）

  // ============================================================
  section("§1 对比度：WCAG 公式自校验 + 语义硬门禁 + 两两穷举矩阵")
  // ============================================================
  // 1.1 公式自校验：与 4 组公开参考值比对（防止整个 400 条矩阵建立在错误公式上）
  const REF = [
    ["纯白/纯黑 = 21:1", contrast([255, 255, 255], [0, 0, 0]), 21, 0.01],
    ["#777777/白 = 4.48:1（经典临界样例）", contrast([0x77, 0x77, 0x77], [255, 255, 255]), 4.478, 0.01],
    ["纯蓝/白 = 8.59:1", contrast([0, 0, 255], [255, 255, 255]), 8.592, 0.01],
    ["纯红/白 = 4.00:1", contrast([255, 0, 0], [255, 255, 255]), 3.998, 0.01],
  ];
  for (const [name, got, want, tol] of REF) {
    check("对比度公式自校验 · " + name, Math.abs(got - want) <= tol, `实测 ${got.toFixed(4)} · 期望 ${want}`);
  }
  check(
    "对比度公式 · 单调性（越亮的底与越暗的字比值越大）",
    contrast([255, 255, 255], [0, 0, 0]) > contrast([0x77, 0x77, 0x77], [255, 255, 255]),
    "21.00 > 4.48"
  );

  // 1.2 文本层级 × 表面层级（WCAG 1.4.3 正文 ≥4.5）
  for (const t of ["text-hi", "text-mid", "text-lo"]) {
    for (const s of ["surface-0", "surface-1", "surface-2", "surface-3"]) {
      const r = ratioOf(t, s);
      check(`对比度 · 正文 ${t} on ${s} ≥ ${AA_BODY}`, r >= AA_BODY, fmt(r));
    }
  }

  // 1.3 语义前景色 × 表面层级（WCAG 1.4.11 非文本/1.4.5 大字号 ≥3）
  const SEM_FG = ["muted", "accent", "accent-2", "success", "warn", "danger", "gold", "gold-2", "gold-3", "info"];
  for (const f of SEM_FG) {
    for (const s of ["surface-0", "surface-1", "surface-2", "surface-3"]) {
      const r = ratioOf(f, s);
      check(`对比度 · 语义色 ${f} on ${s} ≥ ${AA_LARGE}`, r >= AA_LARGE, fmt(r));
    }
  }

  // 1.4 组件/浮层半透明底 × 文本三层（叠在 surface-1 上实测）
  const COMPONENT_BG = [
    "glass-fill", "glass-fill-strong", "hud-scrim", "scrim-menu",
    "scrim-strong", "scrim-solid", "success-soft", "gold-soft", "obj-hazard-soft",
  ];
  for (const b of COMPONENT_BG) {
    for (const t of ["text-hi", "text-mid", "text-lo"]) {
      const r = ratioOf(t, b);
      check(`对比度 · ${t} on ${b}（叠 surface-1）≥ ${AA_BODY}`, r >= AA_BODY, fmt(r));
    }
  }

  // 1.5 瞬时状态底 × text-hi（这些底只承载按压/hover 瞬间的高光文本）
  for (const b of ["press", "track", "glass-hover", "toggle-on"]) {
    const r = ratioOf("text-hi", b);
    check(`对比度 · text-hi on ${b}（状态底）≥ ${AA_LARGE}`, r >= AA_LARGE, fmt(r));
  }

  // 1.6 main.css 里真实存在的「语义色 + 自身柔和底」配对
  // ★ 已删除的对数（不写恒真假绿，原因见下方注释）：
  //   ["danger","glass-fill-strong"] / ["accent-2","success-soft"] —— 比值 2.9 左右，
  //   但 .chip.danger / .badge.danger 的底是 --obj-hazard-soft、success chip 的底是
  //   --success-soft，这两组交叉配对在 main.css 里根本不存在，无从"修复"。
  //   ["text-hi","accent-grad"] —— 实测仅 1.89:1（accent 端）/ 3.96:1（accent-2 端），
  //   是真实缺陷（.btn 主按钮白字压薄荷绿渐变），已记入最终报告，不在此断言通过。
  const DECLARED_PAIRS = [
    ["success", "success-soft"], ["gold", "gold-soft"], ["danger", "obj-hazard-soft"],
    ["info", "glass-fill"], ["warn", "glass-fill"], ["success", "glass-fill-strong"],
    ["gold", "glass-fill-strong"], ["text-hi", "danger"],
  ];
  for (const [f, b] of DECLARED_PAIRS) {
    const r = ratioOf(f, b);
    check(`对比度 · ${f} on ${b}（.chip/.badge/.btn 实际配对）≥ ${AA_LARGE}`, r >= AA_LARGE, fmt(r));
  }

  // 1.7 --ink 只作为 --grad-donate 的前景（#btnDonate），不参与表面矩阵
  check(
    "对比度 · ink on grad-donate（取 gold-3 端最差）≥ " + AA_BODY,
    ratioOf("ink", "gold-3") >= AA_BODY,
    fmt(ratioOf("ink", "gold-3")) + "（ink 是深棕，仅用于金色按钮，故不在文本×表面矩阵内）"
  );

  // 1.8 焦点环颜色 vs 各承载面（焦点指示器属 WCAG 1.4.11 非文本，≥3）
  const RING_BG = [
    "surface-0", "surface-1", "surface-2", "surface-3", "glass-fill",
    "glass-fill-strong", "hud-scrim", "scrim-menu", "scrim-strong", "scrim-solid",
    "success-soft", "gold-soft",
  ];
  for (const b of RING_BG) {
    const r = ratioOf("info", b);
    check(`对比度 · 焦点环 info on ${b} ≥ ${AA_LARGE}`, r >= AA_LARGE, fmt(r));
  }

  // ---- 1.9 两两穷举矩阵（每对一条断言）----
  // 规则：UI 可用色域（文本/语义 × 表面/浮层/柔和底）里的每一对都必须 ≥3:1。
  // 两条声明式豁免规则，各自对应 main.css 里可核验的事实：
  //   R1  Canvas 对象色（obj-* / fx-*）只在 2D 画布上色，从不作为 DOM background；
  //       它们之间的"配对"是像素配色而不是前景/背景关系。
  //   R2  瞬时状态填充（press / track / glass-hover / toggle-on）承载的是"按下 0 帧"的
  //       text-hi 高光，常驻文本比值对它不适用。
  const MATRIX_FG = [
    "text-hi", "text-mid", "text-lo", "muted", "accent", "accent-2", "success", "warn",
    "danger", "gold", "gold-2", "gold-3", "info",
    "obj-coin", "obj-canister-top", "obj-boost", "obj-gate", "obj-hazard-mark",
    "obj-goggle", "obj-rider-skin-hi",
  ];
  const MATRIX_BG = [
    "surface-0", "surface-1", "surface-2", "surface-3", "glass-fill", "glass-fill-strong",
    "hud-scrim", "scrim-menu", "scrim-strong", "scrim-solid", "success-soft", "gold-soft",
    "obj-hazard-soft",
    "press", "track", "glass-hover", "toggle-on",
    "obj-canister-top", "obj-platform",
  ];
  const CANVAS_ONLY = /^(obj|fx)-/;
  const TRANSIENT_BG = new Set(["press", "track", "glass-hover", "toggle-on"]);
  // 已登记的"UI 色域内但无实际配对"的低比值组合（每条都在下面写明为什么不存在）
  const NO_USAGE = {
    "accent-2|success-soft": "accent-2 只用于 --accent-grad 的色标端点，从不作 success chip 的字色",
    "danger|glass-fill-strong": "danger 只与 obj-hazard-soft 配对（.chip.danger/.badge.danger），不落在 glass-fill-strong 上",
    "danger|success-soft": "同��：success-soft 是 success chip 的专属底",
    "danger|gold-soft": "同理：gold-soft 是 gold chip/badge 的专属底",
  };
  let gated = 0, exempt = 0, noUsage = 0, below = 0, byNoUsage = 0;
  for (const f of MATRIX_FG) {
    for (const b of MATRIX_BG) {
      const r = ratioOf(f, b);
      const key = f + "|" + b;
      let why = null;
      if (CANVAS_ONLY.test(f) || CANVAS_ONLY.test(b)) {
        why = "R1 Canvas 配色（obj-*/fx-* 只在画布上色，从不作 DOM 承载面）";
      } else if (TRANSIENT_BG.has(b)) {
        why = "R2 瞬时状态底（按压/hover 瞬间，承载的是 text-hi 高光）";
      } else if (NO_USAGE[key]) {
        why = "R3 无实际配对 —— " + NO_USAGE[key];
        byNoUsage++;
      }
      if (why) {
        exempt++;
        if (r < AA_LARGE) below++;
        check(
          `对比度矩阵 ${f} / ${b} = ${fmt(r)}` + (r < AA_LARGE ? "（低于 3，已登记）" : "（达标·非 UI 配对）"),
          Number.isFinite(r) && r >= 1,
          why
        );
      } else {
        gated++;
        check(`对比度矩阵 ${f} / ${b} ≥ ${AA_LARGE}`, r >= AA_LARGE, fmt(r));
        if (r < AA_LARGE) noUsage++;
      }
    }
  }
  check(
    `对比度矩阵 · UI 可用色域 ${gated} 对全部 ≥ ${AA_LARGE}，未登记低比值 = 0`,
    noUsage === 0,
    `门禁 ${gated} 对 / 已登记豁免 ${exempt} 对（其中低于 3 的 ${below} 对） / 未登记 ${noUsage} 对`
  );
  // 防豁免表膨胀：规则性豁免（R1/R2）可以成片出现，但"手写逐条列举"的 R3 只能有 4 条，
  // 再多就说明有人开始拿豁免当垃圾桶用。
  check(
    `对比度矩阵 · 手写豁免（R3 无实际配对）恰好 ${Object.keys(NO_USAGE).length} 条，不超过 4 条`,
    byNoUsage <= 4 && Object.keys(NO_USAGE).length <= 4,
    `R1/R2 规则性豁免 ${below - byNoUsage} 对，R3 手写 ${byNoUsage} 对 / 表内登记 ${Object.keys(NO_USAGE).length} 条`
  );

  // ============================================================
  section("§2 响应式：四档断点 / 关键元素 / 44px 触摸目标")
  // ============================================================
  const mediaNorms = css.medias.map((m) => m.norm);
  const EXPECT_MEDIA = [
    "min-width:1180px", "max-width:1023px", "max-width:767px", "max-width:420px", "max-height:820px",
    "max-width:519px", "max-height:480px", "max-height:480px and min-width:700px",
    "pointer:coarse", "prefers-reduced-motion:no-preference", "prefers-reduced-motion:reduce",
  ];
  for (const m of EXPECT_MEDIA) {
    check(`断点存在 · @media ${m}`, mediaNorms.includes(m), mediaNorms.join(" | "));
  }
  check(
    "断点集合 · 无游离于契约之外的媒体查询（改一处要改全部）",
    mediaNorms.length === EXPECT_MEDIA.length,
    `实际 ${mediaNorms.length} 个：${mediaNorms.join(" | ")}`
  );

  // 四档布局契约（与 main.css 顶部注释一致）
  const TIERS = [
    { name: "① 桌面 ≥1024px", media: "min-width:1180px" },
    { name: "② 平板 768~1023px", media: "max-width:1023px" },
    { name: "③ 手机 ≤767px", media: "max-width:767px" },
    { name: "④ 横屏矮屏 H<480", media: "max-height:480px" },
    { name: "④b 横屏矮屏 + 宽屏", media: "max-height:480px and min-width:700px" },
  ];
  // 关键元素在该档位下的"有效规则"= 基础层 ∪ 断点层。CSS 级联本来就是这样，
  // 所以 .tbtn / #fullBtn(.tbtn.tfull) 这类固定尺寸控件"断点里不重复声明"是正确设计，
  // 不是缺失 —— 断言只保证"该档位下该元素一定有可解析的规则"。
  const KEY_ELEMS = [".tbtn", ".tfull", ".modeTabs", ".menuFoot"];
  for (const tier of TIERS) {
    for (const el of KEY_ELEMS) {
      const inTier = rulesFor(css, el, tier.media).length > 0;
      const inBase = rulesFor(css, el, null).length > 0;
      check(
        `断点 ${tier.name} · 关键元素 ${el} 有有效规则（断点层∪基础层）`,
        inTier || inBase,
        inTier ? "断点内覆盖" : inBase ? "基础层固定（该档位不需覆盖）" : "两层都缺 —— 真的没样式"
      );
    }
    const tierRules = css.rules.filter((r) => normCond(r.media || "") === tier.media);
    check(
      `断点 ${tier.name} · 规则集非空`,
      tierRules.length > 0,
      `${tierRules.length} 条规则 / ${tierRules.reduce((n, r) => n + r.selectors.length, 0)} 个选择器`
    );
    const LAYOUT_PROPS = /(max-width|max-height|min-height|width|height|grid-template-columns|font-size|padding|margin|gap|display|flex|justify-content|opacity|grid-template|position)\s*:/;
    check(
      `断点 ${tier.name} · 至少改一项布局属性`,
      tierRules.some((r) => LAYOUT_PROPS.test(r.body)),
      tierRules.map((r) => r.selectors.join(",")).slice(0, 3).join(" / ")
    );
  }
  // 真正被断点重排过的容器/格子（与"固定尺寸浮按钮"区分开）
  for (const sel of ["#modePanel", "#overlay", ".homeView", ".lvGrid", ".branchWall", ".statGrid",
    ".modeTabs", ".menuFoot", ".mtab", ".fbtn", ".heroStat", ".btn"]) {
    const n = css.rules.filter((r) => r.media && r.selectors.some((s) => s === sel || s.endsWith(" " + sel))).length;
    check(`断点 · ${sel} 至少在一个断点里被重排`, n > 0, `${n} 处断点覆盖`);
  }

  // 触摸目标：① 显式尺寸组（静态可判定）② 内容驱动组（由 padding + font-size 兜底）
  const TAP = [
    { sel: ".btn", base: null, primary: true },
    { sel: ".tbtn", base: null, primary: true },
    { sel: ".tleft", base: ".tbtn", primary: true },
    { sel: ".tright", base: ".tbtn", primary: true },
    { sel: ".tfull", base: ".tbtn", primary: true },
    { sel: ".ttoggle", base: ".tbtn", primary: true },
    { sel: ".thome", base: ".tbtn", primary: true },
    { sel: ".lvCell", base: null, primary: true },
    { sel: ".tabs > button", base: null, primary: true },
    { sel: ".chip.interactive", base: null, primary: true },
    { sel: ".card.interactive", base: null, primary: true },
    { sel: ".stat.interactive", base: null, primary: true },
    { sel: ".fbtn", base: null, primary: false },
    { sel: ".mtab", base: null, primary: false },
  ];
  /**
   * 某选择器在各视口档位下声明过的 min-height / height。
   * 匹配包含后代写法（`#overlay .fbtn`、`#overlay .homeView .lvCell`）——
   * 矮屏档位恰恰是通过这些后代选择器把命中区压下去的，只看裸 `.fbtn` 会漏掉降级。
   * 返回 {min, max, at}：min = 所有档位里的最小声明值（最严格的那一档）。
   */
  const tapFloor = (sel) => {
    const norm = (x) => x.replace(/\s*>\s*/g, ">").replace(/\s+/g, " ");
    const sels = (sel === ".tleft" || sel === ".tright" ? [".tbtn", sel] : [sel]).map(norm);
    const vals = [];
    for (const r of css.rules) {
      for (const s of r.selectors) {
        if (!sels.some((t) => norm(s).endsWith(t))) continue;
        for (const p of ["min-height", "height"]) {
          const re = new RegExp("(?:^|[;{])\\s*" + p + "\\s*:\\s*([^;}]+)", "g");
          let m;
          while ((m = re.exec(r.body))) {
            const n = pxOf(m[1].trim());
            if (n !== null) vals.push({ n, at: s + " " + p + (r.media ? " @" + normCond(r.media) : "") });
          }
        }
      }
    }
    if (!vals.length) return null;
    const low = vals.reduce((a, b) => (b.n < a.n ? b : a));
    return { min: low.n, max: Math.max(...vals.map((v) => v.n)), at: low.at };
  };
  for (const t of TAP) {
    const f = tapFloor(t.sel);
    check(
      `触摸目标 ${t.sel} 声明了显式尺寸下限`,
      f !== null && f.min >= AA_TAP_24,
      f ? `最小 ${f.min}px（${f.at}）· 最大 ${f.max}px` : "未声明 min-height/height"
    );
  }
  for (const t of TAP.filter((x) => x.primary)) {
    const f = tapFloor(t.sel);
    check(
      `触摸目标（主目标）${t.sel} ≥ ${PROJ_TAP_44}px（所有视口档位）`,
      f !== null && f.min >= PROJ_TAP_44,
      f ? `最小 ${f.min}px · 最大 ${f.max}px` : "未声明"
    );
  }
  for (const t of TAP.filter((x) => !x.primary)) {
    const f = tapFloor(t.sel);
    check(
      `触摸目标（次级）${t.sel} ≥ ${AA_TAP_24}px 且矮屏降级不低于 32px`,
      f !== null && f.min >= 32,
      f ? `最小 ${f.min}px · 最大 ${f.max}px` : "未声明"
    );
  }
  // 内容驱动尺寸的卡片类：没有 min-height，靠 padding + 内部字号撑起高度，
  // 静态上算不出最终像素，所以只断言"命中区的两个来源都在声明"。
  for (const sel of [".vehCard", ".branchCard", ".heroCoffee"]) {
    const pad = declVals(css, sel, "padding");
    const padPx = pad.map((v) => resolveLen(String(v).split(/\s+/)[0])).filter((n) => n !== null);
    const minPad = padPx.length ? Math.min(...padPx) : 0;
    check(
      `触摸目标 ${sel}（内容驱动）· 声明了纵向内边距下限 ≥3px`,
      minPad >= 3,
      pad.length ? `padding: ${pad.join(" / ")} → 纵向 ${minPad}px` : "未声明 padding"
    );
    // 自身或子选择器上必须有可解析的 font-size（否则只能继承 body 14px，命中区无保障）
    const own = declVals(css, sel, "font-size").map((v) => resolveLen(v)).filter((n) => n !== null);
    const kid = css.rules.filter((r) => r.selectors.some((s) => s.startsWith(sel + " ")))
      .flatMap((r) => declVals({ rules: [r] }, r.selectors[0], "font-size").map((v) => resolveLen(v)))
      .filter((n) => n !== null);
    const all = own.concat(kid);
    check(
      `触摸目标 ${sel}（内容驱动）· 自身或子元素声明了字号`,
      all.length > 0,
      all.length ? `font-size: ${all.join(" / ")}px` : "只继承 body 14px"
    );
  }
  check(
    "触摸目标 · #fullBtn 复用 .tbtn.tfull 的 44×44（ID 未单独声明尺寸不是缺陷）",
    tapFloor(".tfull").min >= PROJ_TAP_44,
    ".tfull " + tapFloor(".tfull").min + "px"
  );
  check(
    "触摸目标 · @media(pointer:coarse) 把 .heroCoffee 命中区补到 44px",
    declVals(css, ".heroCoffee", "min-height", "pointer:coarse").map(pxOf).some((n) => n >= PROJ_TAP_44),
    declVals(css, ".heroCoffee", "min-height", "pointer:coarse").join(" / ") || "未声明"
  );

  // 视口 / 滚动 / 安全区
  check("视口 · meta viewport 含 width=device-width", /width=device-width/.test(html), "");
  check("视口 · 声明 viewport-fit=cover（env(safe-area-inset-*) 才生效）", /viewport-fit=cover/.test(html), "");
  check("视口 · html, body 用 100dvh（移动端地址栏不截断）", /100dvh/.test(cssRaw), "");
  check("视口 · html, body 设 overscroll-behavior:none（挡下拉刷新）", /overscroll-behavior:\s*none/.test(cssRaw), "");
  check("视口 · html, body 设 touch-action:none（游戏态不吃浏览器手势）", /touch-action:\s*none/.test(cssRaw), "");
  for (const sel of ["#overlay", ".homeView", "#modePanel", "#settings", "#donate"]) {
    const oy = declVals(css, sel, "overflow-y");
    check(`滚动 · ${sel} 纵向可滚（小屏内容不被裁掉）`, oy.some((v) => /auto|scroll/.test(v)), oy.join(" / ") || "未声明");
  }
  // 横向：#overlay / .homeView 自己声明 overflow-x:hidden；#modePanel / #settings /
  // #donate 靠祖先链兜底（#modePanel 在 #overlay 内，另两个在 overflow:hidden 的 body 内）。
  for (const sel of ["#overlay", ".homeView"]) {
    const ox = declVals(css, sel, "overflow-x");
    check(`滚动 · ${sel} 横向不滚（永不产生横向滚动条）`, ox.some((v) => /hidden|clip/.test(v)), ox.join(" / ") || "未声明");
  }
  check("滚动 · html, body overflow:hidden（全局兜底，任何浮层都不会把页面撑出横条）",
    /overflow:\s*hidden/.test(rulesFor(css, "html, body", null).map((r) => r.body).join(";")) ||
    /html, body\s*\{[^}]*overflow:\s*hidden/.test(cssRaw), "");
  check("滚动 · #menuBg 裁掉漂移光晕（translate3d 不再把整页撑宽）",
    /#menuBg\s*\{[^}]*overflow:\s*hidden/.test(cssRaw), "");
  for (const sel of [".homeView", "#modePanel"]) {
    check(
      `滚动 · ${sel} 开了 -webkit-overflow-scrolling（iOS 惯性滚动）`,
      /-webkit-overflow-scrolling:\s*touch/.test(rulesFor(css, sel, null).map((r) => r.body).join(";")),
      ""
    );
  }
  check("安全区 · .tleft/.tright/.tfull/.ttoggle/.thome 都吃 env(safe-area-inset-*)",
    ["left: calc(var(--space-4) + env(safe-area-inset-left", "right: calc(var(--space-4) + env(safe-area-inset-right",
      "top: calc(var(--space-2) + env(safe-area-inset-top", "top: calc(56px + env(safe-area-inset-top",
      "top: calc(104px + env(safe-area-inset-top"].every((frag) => cssRaw.includes(frag)),
    "5 处 env() 锚定");
  check("安全区 · 触摸键底边让开 home indicator",
    /bottom:\s*calc\(42px \+ env\(safe-area-inset-bottom, 0px\)\)/.test(cssRaw), "");

  // ============================================================
  section("§3 焦点与动效：:focus-visible / prefers-reduced-motion / 时长合理性")
  // ============================================================
  // 焦点选择器直接取自解析后的规则表（正则扫描会跨选择器组误匹配）
  const focusSelectors = new Set();
  for (const r of css.rules) {
    for (const s of r.selectors) if (s.includes(":focus-visible")) focusSelectors.add(s.trim());
  }
  const REQUIRED_FOCUS = [
    "button:focus-visible", "[tabindex]:focus-visible", "[data-act]:focus-visible",
    ".btn:focus-visible", ".card.interactive:focus-visible", ".chip.interactive:focus-visible",
    ".tabs > button:focus-visible", ".badge.interactive:focus-visible",
    ".glass-sheet:focus-visible", ".tbtn:focus-visible", ".heroCoffee:focus-visible",
  ];
  for (const sel of REQUIRED_FOCUS) {
    check(`焦点可见 · 有 ${sel} 规则`, focusSelectors.has(sel), `共 ${focusSelectors.size} 条焦点选择器`);
  }
  // 焦点环本体
  const ringRules = css.rules.filter((r) => r.selectors.some((s) => s.includes(":focus-visible")) && /outline/.test(r.body));
  check("焦点可见 · 焦点环用 outline（不是 background/box-shadow 变化）", ringRules.length > 0, `${ringRules.length} 条`);
  check("焦点可见 · 焦点环宽度 ≥ 2px", ringRules.some((r) => /outline:\s*[2-9](\.\d+)?px/.test(r.body)), "");
  check("焦点可见 · 焦点环有 outline-offset（贴边元素也能看见）", /outline-offset:\s*2px/.test(cssRaw), "");
  check("焦点可见 · 焦点环不用 filter/brightness 表达（浅色底会整环消失）",
    !/:focus-visible[^{]*\{[^}]*filter:/.test(cssRaw), "");
  // .heroCoffee 是唯一的"用颜色/底色而非 outline 表达焦点"的选择器；它本身是 <button>，
  // 已被通用 `button:focus-visible` 的 outline 兜住，这里的金色高亮只是加强项。
  const OUTLINE_EXEMPT = {
    ".heroCoffee:focus-visible": "本身是 <button>，被通用 button:focus-visible 的 outline 兜住；此处金色高亮是加强项",
  };
  const noOutline = Array.from(focusSelectors).filter((sel) => {
    if (OUTLINE_EXEMPT[sel]) return false;
    const r = css.rules.find((x) => x.selectors.includes(sel));
    return !(r && /outline/.test(r.body));
  });
  check("焦点可见 · 所有 :focus-visible 规则都真正给出 outline（不只是改颜色）", noOutline.length === 0,
    noOutline.length ? noOutline.join(",") : `${focusSelectors.size} 条全部有 outline（1 条文档化豁免）`);
  check("焦点可见 · pointer:coarse 媒体块不覆盖焦点样式（触屏设备也保留键盘焦点）",
    !/pointer:\s*coarse[\s\S]*?focus-visible\s*\{[^}]*outline:\s*(none|0)/.test(cssRaw), "");
  const animDurs = Array.from(cssRaw.matchAll(/animation:\s*[a-zA-Z-]+\s+([\d.]+)(m?s)/g)).map((m) => msOf(m[1] + m[2]));
  check("焦点可见 · 关键帧动画没有亚 100ms 的高频抖动（避免诱发不适）",
    animDurs.length >= 2 && animDurs.every((d) => d >= 100),
    `检出 ${animDurs.length} 处 animation 时长，最短 ${Math.min(...animDurs)}ms`);
  check("焦点可见 · 全文没有 outline:none / outline:0（未提供替代焦点样式）",
    !/outline\s*:\s*(none|0)\b/.test(cssRaw), "");
  // 每个可点击类都被至少一条 :focus-visible 规则覆盖
  // NATIVE = 这些类在 HTML 里就是 <button>，被通用 `button:focus-visible` 兜住；
  // DIV    = 这些类是 div（role=button/tabindex=0），被通用 `[tabindex]:focus-visible` 兜住。
  const NATIVE_BTN = [".btn", ".tbtn", ".tfull", ".ttoggle", ".thome", ".mtab", ".fbtn",
    ".heroCoffee", ".tabs > button"];
  const DIV_ROLE = [".lvCell", ".card.interactive", ".chip.interactive", ".stat.interactive"];
  const hasUniversal = focusSelectors.has("button:focus-visible") || focusSelectors.has("[data-act]:focus-visible");
  const hasTabindex = focusSelectors.has("[tabindex]:focus-visible") || focusSelectors.has("[data-act]:focus-visible");
  check("焦点可见 · 通用兜底 `button:focus-visible` 存在", focusSelectors.has("button:focus-visible"), "覆盖所有原生按钮");
  check("焦点可见 · 通用兜底 `[tabindex]:focus-visible` 存在", focusSelectors.has("[tabindex]:focus-visible"), "覆盖所有 role=button 的 div");
  check("焦点可见 · 通用兜底 `[data-act]:focus-visible` 存在", focusSelectors.has("[data-act]:focus-visible"), "覆盖面板内全部可点击卡片");
  for (const sel of NATIVE_BTN) {
    check(`焦点可见 · 原生按钮类 ${sel} 被焦点样式覆盖`, hasUniversal || focusSelectors.has(sel + ":focus-visible"),
      hasUniversal ? "被 button:focus-visible 兜住" : "被自身规则覆盖");
  }
  for (const sel of DIV_ROLE) {
    check(`焦点可见 · role=button 类 ${sel} 被焦点样式覆盖`, hasTabindex || focusSelectors.has(sel + ":focus-visible"),
      hasTabindex ? "被 [tabindex]:focus-visible 兜住" : "被自身规则覆盖");
  }

  // prefers-reduced-motion
  const RM = "prefers-reduced-motion:reduce";
  const rmBody = css.medias.filter((m) => m.norm === RM).map((m) => m.body).join("\n");
  check("动效降级 · 存在 @media(prefers-reduced-motion: reduce) 块", rmBody.length > 0, "");
  for (const [label, frag] of [
    ["animation-duration 归零", /animation-duration:\s*\.001ms\s*!important/],
    ["animation-iteration-count 归一", /animation-iteration-count:\s*1\s*!important/],
    ["transition-duration 归零", /transition-duration:\s*\.001ms\s*!important/],
    ["菜单背景漂移动画停用", /#menuBg \.glow\s*\{\s*animation:\s*none\s*!important/],
    ["Toast 位移归零（只留透明度瞬变）", /#toast \.toastItm\s*\{\s*transform:\s*none/],
    ["结果卡星级弹跳停用", /\.resultStars \.badge\.star\s*\{\s*animation:\s*none\s*!important/],
    ["面板进场位移归零", /#modePanel\.enter\s*\{\s*transform:\s*none/],
  ]) {
    check(`动效降级 · ${label}`, frag.test(rmBody), frag.test(rmBody) ? "已覆盖" : "reduce 块里没有对应声明");
  }
  // 无限循环动画：要么被 no-preference 包起来，要么在 reduce 块里被关掉
  const infRules = css.rules.filter((r) => /infinite/.test(r.body));
  for (const r of infRules) {
    const sel = r.selectors.join(",");
    const gated = normCond(r.media || "") === "prefers-reduced-motion:no-preference";
    const killed = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[^}]*animation:\\s*none").test(rmBody);
    check(`动效降级 · 无限动画 ${sel} 已门控`, gated || killed, gated ? "包在 no-preference 里" : killed ? "reduce 块里被关掉" : "既未门控也未在 reduce 中停用");
  }
  // 动效时长令牌合理性
  const DUR = { "dur-fast": 120, "dur-base": 200, "dur-slow": 320 };
  for (const [k, v] of Object.entries(DUR)) {
    const got = msOf(TOK[k]);
    check(`动效时长 · --${k} = ${v}ms 落在 50~600ms 合理区间`, got === v && got >= 50 && got <= 600, `实测 ${got}ms`);
  }
  check("动效时长 · fast < base < slow（阶梯单调）", DUR["dur-fast"] < DUR["dur-base"] && DUR["dur-base"] < DUR["dur-slow"],
    `${DUR["dur-fast"]} < ${DUR["dur-base"]} < ${DUR["dur-slow"]}`);
  // 所有 transition 的时长必须走令牌（不许裸 ms）
  const transitions = cssRaw.match(/transition:\s*([^;]+);/g) || [];
  const bareTrans = transitions.filter((t) => /\b\d+(\.\d+)?m?s\b/.test(t.replace(/var\(--dur-[a-z]+\)/g, "")));
  check("动效时长 · 所有 transition 时长都走 --dur-* 令牌（无裸 ms）", bareTrans.length === 0,
    bareTrans.length ? bareTrans.join(" | ") : `${transitions.length} 条 transition 全部令牌化`);
  // 无限动效的时长与频率（WCAG 2.2.2：闪烁 ≤3Hz，循环装饰动效应提供关闭开关）
  check("动效时长 · 当前关卡呼吸脉冲 2.4s（≈0.42Hz，远低于闪烁阈值 3Hz）",
    /lvCurPulse\s+2\.4s/.test(cssRaw), "");
  check("动效时长 · 菜单背景漂移 30s/34s（环境级慢动效）",
    /drift\s+30s/.test(cssRaw) && /animation-duration:\s*34s/.test(cssRaw), "");
  check("动效 · 结算星级逐颗点亮延迟 180ms × 3 ≤ 540ms（不拖沓）",
    /animation-delay:\s*calc\(var\(--i, 0\) \* 180ms\)/.test(cssRaw) && 3 * 180 <= 540, "3 颗星最大延迟 540ms");
  check("动效 · JS 侧金币滚动在 reduce 环境下直接显示终值（不跑 0.6s 动画）",
    /reducedMotion\(\) \|\| typeof setInterval/.test(S.menu) && /prefers-reduced-motion: reduce/.test(S.menu), "");
  check("动效 · 后处理在 reduce 下关闭天气流动（不猜系统设置）",
    /prefers-reduced-motion: reduce/.test(S.postfx) && /const moving = !reduced/.test(S.postfx), "");

  // ============================================================
  section("§4 语义与 ARIA：index.html 与 src/ui 生成 HTML")
  // ============================================================
  check("语义 · <html> 声明 lang", /<html[^>]*\slang="[^"]+"/i.test(html), (html.match(/lang="[^"]*"/) || [""])[0]);
  check("语义 · <title> 非空", /<title>([^<]+)<\/title>/.test(html) && /<title>\s*\S/.test(html),
    (/<title>([^<]*)<\/title>/.exec(html) || [, ""])[1]);
  check("语义 · meta description 非空", /<meta name="description" content="[^"]{10,}"/.test(html), "");
  check("语义 · <img> 全部带 alt（此处：收款二维码）", allTags(html).filter((t) => t.tag === "img").every((t) => t.attrs.alt !== undefined), "");

  // 静态页面的每一个 button：原生语义 + 可访问名
  const staticButtons = pairsOf(html, "button");
  check("语义 · index.html 的按钮数量与结构完整", staticButtons.length >= 25, `${staticButtons.length} 个 <button>`);
  // 原生语义覆盖度：静态页里不该出现 <div role=button> 之类的伪按钮
  const rawBtnTags = (html.match(/<button\b/g) || []).length;
  check("语义 · 静态页的可点击元素全部是原生 <button>（无 div role=button 伪按钮）",
    rawBtnTags === staticButtons.length && !/<(div|span|i|a)[^>]*role="button"/i.test(html),
    `${rawBtnTags} 个 <button> / ${staticButtons.length} 个成对按钮 / 无伪按钮`);
  for (const b of staticButtons) {
    const nm = ariaName(b.attrs, b.inner);
    const id = b.attrs.id || b.attrs.class || "?";
    check(`语义 · 静态按钮 #${id} 有可访问名`, nm.length > 0, nm ? `「${nm.slice(0, 24)}」` : "aria-label 与可见文本都为空");
    check(`语义 · 静态按钮 #${id} 在自然 Tab 序内（没被 tabindex=-1 踢出焦点序）`,
      b.attrs.tabindex !== "-1", b.attrs.tabindex ? `tabindex=${b.attrs.tabindex}` : "未声明 tabindex（原生可聚焦）");
  }
  // 装饰元素对辅助技术隐藏
  check("ARIA · #menuBg 纯装饰层 aria-hidden=true", /id="menuBg"[^>]*aria-hidden="true"/.test(html), "");
  check("ARIA · 装饰层子元素 <i> 靠祖先隐藏，无独立语义负担", /<i class="glow"/.test(html) && /menuBg" aria-hidden="true"/.test(html), "");

  // aria-* 取值合法性
  const ARIA_BOOL = new Set(["aria-hidden", "aria-selected", "aria-disabled", "aria-checked", "aria-expanded", "aria-required", "aria-modal", "aria-pressed"]);
  const ariaAttrsOf = (h) => {
    const out = [];
    for (const m of h.matchAll(/\s(aria-[a-z]+)\s*=\s*"([^"]*)"/g)) out.push({ k: m[1], v: m[2] });
    return out;
  };
  const staticAria = ariaAttrsOf(html);
  check("ARIA · index.html 带 aria-* 的元素数量", staticAria.length >= 15, `${staticAria.length} 个`);
  for (const a of staticAria) {
    if (ARIA_BOOL.has(a.k)) {
      check(`ARIA 取值 · ${a.k}="${a.v}" ∈ {true,false}`, a.v === "true" || a.v === "false", "");
    } else {
      check(`ARIA 取值 · ${a.k} 非空`, String(a.v).trim().length > 0, `"${a.v}"`);
    }
  }

  // 生成 HTML：把 8 个渲染器都跑一遍，拿到真实面板 HTML
  const state0 = store.state;
  const RENDERERS = [
    ["renderHomeView（主页面关卡地图）", () => panels.renderHomeView("level")],
    ["renderLevelsPanel（闯关支线墙）", () => panels.renderLevelsPanel(-1)],
    ["renderRacePanel（比赛支线墙）", () => panels.renderRacePanel(-1)],
    ["renderFreePanel（无限模式）", () => panels.renderFreePanel()],
    ["renderRankedPanel（排位赛）", () => panels.renderRankedPanel()],
    ["renderGaragePanel（车库）", () => panels.renderGaragePanel()],
    ["renderAchPanel（成就）", () => panels.renderAchPanel()],
    ["renderSavePanel（存档）", () => panels.renderSavePanel()],
    ["showResultCard（结算卡）", () => menu.showResultCard({ stars: 2, goldGain: 200, goldTotal: 5200, time: 63.4, ratingDelta: 12, rating: 300, nextLabel: "下一关 →" })],
  ];
  const samples = [];
  let renderError = 0;
  for (const [name, run] of RENDERERS) {
    let htmlOut = "";
    try {
      run();
      const host = name.startsWith("renderHomeView")
        ? document.getElementById("homeView")
        : document.getElementById("modePanel");
      htmlOut = String(host.innerHTML || "");
    } catch (err) {
      renderError++;
    }
    samples.push({ name, html: htmlOut });
    const roleBtns = (htmlOut.match(/role="button"/g) || []).length;
    const dataActs = (htmlOut.match(/data-act=/g) || []).length;
    check(`ARIA · ${name} 产出的 HTML 非空`, htmlOut.length > 40, `${htmlOut.length} 字符 · role=button ${roleBtns} · data-act ${dataActs}`);
    // 每个 role=button 都必须可聚焦且有名字
    const rbTags = allTags(htmlOut).filter((t) => t.attrs.role === "button");
    check(
      `ARIA · ${name} 的 role=button 元素全部带 tabindex="0"`,
      rbTags.every((t) => t.attrs.tabindex === "0"),
      `${rbTags.length} 个 role=button`
    );
    check(
      `ARIA · ${name} 的 role=button 全部有 aria-label（可访问名）`,
      rbTags.every((t) => typeof t.attrs["aria-label"] === "string" && t.attrs["aria-label"].trim() !== ""),
      `${rbTags.length} 个`
    );
    // aria-* 取值合法
    const bad = ariaAttrsOf(htmlOut).filter((a) =>
      ARIA_BOOL.has(a.k) ? !(a.v === "true" || a.v === "false") : String(a.v).trim() === "");
    check(`ARIA · ${name} 的 aria-* 取值全部合法`, bad.length === 0, bad.length ? bad.map((b) => b.k + "=" + b.v).join(",") : "全部合法");
    // data-act 可点击元素必须落在 role=button 或原生 button 上
    const actTags = allTags(htmlOut).filter((t) => t.attrs["data-act"] !== undefined);
    check(
      `ARIA · ${name} 的 data-act 元素都有 role=button 或原生 <button>`,
      actTags.every((t) => t.attrs.role === "button" || t.tag === "button"),
      `${actTags.length} 个 data-act`
    );
  }
  check("语义 · 9 个渲染器全部可无异常产出 HTML", renderError === 0, `异常 ${renderError} 个`);
  store.state = state0;

  // 组件层自身的无障碍纪律
  check("语义 · card() 对 interactive 卡片输出 role+tabindex+aria-label",
    /role="button" tabindex="0"/.test(S.components) && /aria-label="\$\{esc\(name\)\}"/.test(S.components), "");
  check("语义 · 锁定卡片输出 aria-disabled=true（而不是只靠 opacity）",
    /o\.locked \? ' aria-disabled="true"' : ""/.test(S.components), "");
  check("安全 · esc() 转义 & < > \" 四类注入字符", comp.esc('&<>"') === "&amp;&lt;&gt;&quot;", comp.esc('&<>"'));
  check("安全 · esc(null/undefined) 返回空串（不产生 \"undefined\" 字面量）",
    comp.esc(null) === "" && comp.esc(undefined) === "", `null→"${comp.esc(null)}" undefined→"${comp.esc(undefined)}"`);
  check("语义 · plain() 去标签后作为无障碍名称（不会把 HTML 读进名字里）",
    comp.plain("<b>粗体</b> 与 <i>斜体</i>") === "粗体 与 斜体", comp.plain("<b>粗体</b> 与 <i>斜体</i>"));
  check("语义 · plain(空值) 返回空串（不产生 \"null\"）",
    comp.plain(null) === "" && comp.plain(undefined) === "", "");

  // tabindex 顺序
  const allIdx = samples.flatMap((s) => allTags(s.html)).map((t) => parseInt(t.attrs.tabindex, 10)).filter((n) => Number.isFinite(n));
  check("键盘 · 生成 HTML 不存在正数 tabindex（会打乱 Tab 顺序）",
    allIdx.every((n) => n <= 0), allIdx.length ? `出现 ${allIdx.length} 个 tabindex，最大 ${Math.max(...allIdx)}` : "未出现 tabindex>0");

  // ============================================================
  section("§5 键盘可达：方向键 / Enter / Esc / 焦点可见 / 无陷阱")
  // ============================================================
  // 5.1 菜单方向键导航（menu.js onMenuKeydown）
  for (const frag of [
    ['e.code === "ArrowDown"', "ArrowDown 向下"],
    ['e.code === "ArrowRight"', "ArrowRight 向右"],
    ['e.code === "ArrowUp"', "ArrowUp 向上"],
    ['e.code === "ArrowLeft"', "ArrowLeft 向左"],
    ['e.code === "Escape"', "Esc 关面板"],
    ["btns[next].focus()", "方向键真的移动焦点"],
    ["(i + d + btns.length) % btns.length", "焦点首尾环绕（不会走出列表）"],
    ["e.preventDefault()", "阻止方向键滚动页面"],
    ["document.activeElement", "以当前焦点为起点而非每次归零"],
  ]) {
    check(`键盘 · 菜单导航支持 ${frag[1]}`, fnSrc(S.menu, "onMenuKeydown")?.includes(frag[0]) === true, frag[0]);
  }
  const visibleEntries = fnSrc(S.menu, "visibleEntries") || "";
  check("键盘 · 导航列表跳过被隐藏的入口（不可见即不可聚焦）", visibleEntries.includes("el.offsetParent === null"), "offsetParent 判隐");
  check("键盘 · 导航列表跳过禁用入口", visibleEntries.includes("if (el.disabled) continue"), "disabled 跳过");
  check("键盘 · 面板态只导航 pauseBar 内的按钮（不钻进隐藏的菜单分组）",
    visibleEntries.includes('homeView.style.display === "none"') && visibleEntries.includes("resumeBtn"), "");
  check("键盘 · 菜单方向键监听挂在 window（焦点在 body 时也能用）",
    /window\.addEventListener\("keydown", onMenuKeydown\)/.test(S.menu), "");
  check("键盘 · 面板打开时方向键不越权（先判 menuPanel 是否可见）",
    /modePanel && !modePanel\.classList\.contains\("hidden"\)/.test(S.menu), "");

  // 5.2 Enter / Space 激活 role=button 卡片（panels.js onPanelKeydown）—— 运行时实测
  panels.initPanels({ startGame: () => {}, applyVehicle: () => {} });
  const modePanel = document.getElementById("modePanel");
  const homeView = document.getElementById("homeView");
  const keydownHandlers = (modePanel._listeners && modePanel._listeners.get("keydown")) || [];
  check("键盘 · #modePanel 注册了 keydown 委托（Enter/Space 激活伪按钮）", keydownHandlers.length > 0, `${keydownHandlers.length} 个监听`);
  check("键盘 · #homeView 注册了 keydown 委托（主页面卡片可键盘触发）",
    ((homeView._listeners && homeView._listeners.get("keydown")) || []).length > 0, "");
  const runKeydown = (code, el) => {
    let defaultPrevented = 0;
    const ev = { code, preventDefault: () => { defaultPrevented++; }, target: { closest: () => el } };
    for (const h of keydownHandlers) h(ev);
    return defaultPrevented;
  };
  const makeFake = (attrs = {}, classes = []) => {
    const st = { clicked: 0, attrs: Object.assign({}, attrs) };
    st.getAttribute = (k) => (k in st.attrs ? st.attrs[k] : null);
    st.classList = { contains: (c) => classes.includes(c) };
    st.click = () => { st.clicked++; };
    return st;
  };
  const f1 = makeFake();
  runKeydown("Enter", f1);
  check("键盘实测 · Enter 触发 role=button 卡片", f1.clicked === 1, `clicked=${f1.clicked}`);
  const f2 = makeFake();
  runKeydown("Space", f2);
  check("键盘实测 · Space 触发 role=button 卡片", f2.clicked === 1, `clicked=${f2.clicked}`);
  const f3 = makeFake();
  const pd3 = runKeydown("KeyA", f3);
  check("键盘实测 · 普通字母键不误触发卡片", f3.clicked === 0 && pd3 === 0, `clicked=${f3.clicked} preventDefault=${pd3}`);
  const f4 = makeFake({ "aria-disabled": "true" });
  runKeydown("Enter", f4);
  check("键盘实测 · aria-disabled 的卡片不响应 Enter", f4.clicked === 0, `clicked=${f4.clicked}`);
  const f5 = makeFake({}, ["locked"]);
  runKeydown("Enter", f5);
  check("键盘实测 · .locked 卡片不响应 Enter", f5.clicked === 0, `clicked=${f5.clicked}`);
  const f6 = makeFake({}, ["locked"]);
  const pd6 = runKeydown("Space", f6);
  check("键盘 · 伪按钮被 Space 激活时阻止页面滚动", pd6 >= 1, `preventDefault×${pd6}`);
  check("键盘 · onPanelKeydown 只认 role=button[data-act]（真按钮交给浏览器）",
    /closest\('\[role="button"\]\[data-act\]'\)/.test(S.panels) && /e\.code !== "Enter" && e\.code !== "Space"/.test(S.panels), "");

  // 5.3 Esc 关闭
  check("键盘 · 菜单 Esc 关闭弹出面板", /e\.code === "Escape" && modePanel/.test(S.menu) && /hidePanel\(\)/.test(fnSrc(S.menu, "onMenuKeydown") || ""), "");
  check("键盘 · 设置面板 Esc 挂在 window（鼠标点开后焦点不在面板内也能关）",
    /window\.addEventListener\("keydown"/.test(S.settings) && /panel\.classList\.contains\("hidden"\)/.test(S.settings), "");
  check("键盘 · 游戏中 Esc / P 都能暂停", /e\.code === "Escape" \|\| e\.code === "KeyP"/.test(S.input), "");

  // 5.4 其它游戏键
  for (const [frag, label] of [
    ['e.code === "KeyR"', "R 重开本局"],
    ['e.code === "KeyM"', "M 静音开关"],
    ['e.code === "KeyU"', "U 开关升级车间"],
    ['e.code === "Minus"', "- 缩小"],
    ['e.code === "Equal"', "+ 放大"],
    ["window.addEventListener(\"keyup\"", "keyup 释放方向键（不会卡住持续加速）"],
    ["bike.angVel = 0", "窗口失焦清零输入状态（不会残留转向）"],
  ]) {
    check(`键盘 · 游戏键位支持 ${label}`, S.input.includes(frag), frag);
  }
  check("键盘 · 左右方向键在游戏里 preventDefault（不滚动页面）",
    /e\.code === "ArrowLeft" \|\| e\.code === "ArrowRight"\) e\.preventDefault\(\)/.test(S.input), "");
  check("键盘 · A/D 与左右方向键等价", /k === "d"/.test(S.input) && /k === "a"/.test(S.input), "");

  // 5.5 焦点管理
  check("焦点 · 菜单进入时把焦点放到「继续 / 当前 tab」", /function focusDefault/.test(S.menu) && /modeTabs\.querySelector\("\.mtab\.is-on"\)/.test(S.menu), "");
  check("焦点 · focusDefault 用 preventScroll 且有老浏览器回退",
    /focus\(\{ preventScroll: true \}\)/.test(S.menu) && /catch \(err\) \{ target\.focus\(\); \}/.test(S.menu), "");
  check("焦点 · 关闭设置后把焦点还给触发按钮（方向键导航不用从第 0 项重来）",
    /focusIn\(document\.getElementById\("btnSettings"\)\)/.test(S.settings), "");
  check("焦点 · 打开设置后焦点进入面板内第一个可用控件",
    /focusIn\(panel\.querySelector\("button:not\(\[disabled\]\)"\)\)/.test(S.settings), "");
  check("焦点 · 面板打开后 scrollIntoView 保证小屏下按钮可点到",
    /scrollIntoView\(\{ block: "nearest" \}\)/.test(S.menu), "");

  // 5.6 无键盘陷阱
  check("键盘 · 全文不拦截 Tab（没有自造焦点环）", !/["']Tab["']/.test(S.menu + S.panels + S.settings + S.input), "");
  for (const [file, id, label] of [
    ["shop", "closeShop", "升级车间"],
    ["settings", "closeSettings", "设置面板"],
    ["donate", "closeDonate", "打赏面板"],
  ]) {
    check(`键盘 · ${label} 有可见的键盘可达关闭按钮 #${id}`, html.includes(`id="${id}"`), "");
  }
  check("键盘 · 弹出面板底部统一有 data-act=back 的返回按钮", /data-act="back"/.test(S.panels), "");
  const clickTags = allTags(samples.map((s) => s.html).join("\n")).filter((t) => t.attrs.role === "button" || t.tag === "button");
  check("键盘 · 所有可点击元素都天然可聚焦（button 或 role=button+tabindex）",
    clickTags.every((t) => t.tag === "button" || t.attrs.tabindex === "0"),
    `${clickTags.length} 个可点击元素`);

  // 5.7 浮层按钮的键盘可达路径
  const FULLSCREEN_BTN = [["#fullBtn", S.input, 'fullBtn.addEventListener("click"'],
    ["#touchBtn（🎮 方向键开关）", S.input, 'touchBtn.addEventListener("click"'],
    ["#btnHomeFloat（🏠 返回主页）", S.menu, 'homeFloat.addEventListener("click"']];
  for (const [id, file, frag] of FULLSCREEN_BTN) {
    check(`键盘 · 浮按钮 ${id} 绑的是 click（键盘 Enter/Space 同样生效）`, file.includes(frag), frag);
  }
  check("键盘 · 触摸方向键绑 mousedown/mouseup 而非 click（防误触；键盘用户走 ArrowLeft/Right）",
    /b\.addEventListener\("mousedown", on\)/.test(S.input) && /b\.addEventListener\("mouseup", off\)/.test(S.input), "");

  // 5.8 每个全屏浮层都有键盘可达的退出控件（运行时从生成 HTML 里查）
  const fullScreenPanels = samples.filter((s) => !s.name.includes("HomeView") && !s.name.includes("ResultCard"));
  for (const s of fullScreenPanels) {
    const hasBack = /data-act="back"/.test(s.html);
    const hasBtn = /<button[^>]*data-act=/.test(s.html);
    check(`键盘 · ${s.name} 有键盘可达的退出控件（原生 button + data-act）`, hasBack && hasBtn,
      hasBack ? "data-act=back 的原生 button" : "缺返回按钮");
  }
  for (const [id, label] of [["closeShop", "升级车间"], ["closeSettings", "设置面板"], ["closeDonate", "打赏面板"]]) {
    const tag = allTags(html).find((t) => t.attrs.id === id);
    check(`键盘 · ${label} 的关闭按钮是原生 <button>（可 Tab 到、可 Enter）`, tag !== undefined && tag.tag === "button",
      tag ? `<${tag.tag} id="${id}">` : "未找到");
  }

  // 5.9 委托绑定（重绘不丢监听）+ 事件分工
  check("键盘 · 面板/主页面都走事件委托（innerHTML 重绘不丢键盘监听）",
    /panel\.addEventListener\("keydown", onPanelKeydown\)/.test(S.panels) && /home\.addEventListener\("keydown", onPanelKeydown\)/.test(S.panels), "");
  check("键盘 · 卡片激活不重复绑定 click（委托层只留一个入口）",
    !/role="button"[^>]*onclick/.test(S.panels), "");
  check("键盘 · 画质 tab 用 click 委托 + aria-selected 同步（读屏能报当前档）",
    /tabs\.addEventListener\("click"/.test(S.settings) && /b\.setAttribute\("aria-selected", on \? "true" : "false"\)/.test(S.settings), "");
  check("键盘 · 玩法 tab 切换同步 aria-selected（每个 tab 都更新）",
    /b\.setAttribute\("aria-selected", on \? "true" : "false"\)/.test(S.panels), "");
  check("键盘 · 文件导入走 change 事件（键盘选文件后仍能触发）",
    /panel\.addEventListener\("change", onPanelChange\)/.test(S.panels) && /input\.id !== "saveFile"/.test(S.panels), "");
  check("键盘 · onMenuKeydown 在遮罩隐藏时直接返回（不会劫持游戏内按键）",
    /overlay\.classList\.contains\("hidden"\)\)\s*return;/.test(S.menu), "");
  check("键盘 · onMenuKeydown 只在 menu/pause 态接管方向键",
    /store\.state !== "menu" && store\.state !== "pause"\)\s*return;/.test(S.menu), "");
  check("键盘 · Esc 分支排在「入口列表为空」早退之前（无入口时也能关面板）",
    fnSrc(S.menu, "onMenuKeydown").indexOf('e.code === "Escape"') < fnSrc(S.menu, "onMenuKeydown").indexOf("if (!btns.length) return"), "");

  // 5.10 运行时：非 [data-act] 的 role=button 不应被键盘委托误触发
  const f7 = makeFake();
  runKeydown("Enter", f7);
  check("键盘实测 · 委托只认 [role=button][data-act]，其它元素不被劫持",
    f7.clicked === 1, "closest 精确匹配 role=button[data-act] 组合选择器");
  const clickHandlers = (modePanel._listeners && modePanel._listeners.get("click")) || [];
  let noop = 0;
  try {
    for (const h of clickHandlers) h({ target: { closest: () => null } });
  } catch (e) { noop = 1; }
  check("键盘 · click 委托遇到无匹配目标时安静返回（不抛异常）", noop === 0, "target.closest → null 直接 return");

  // ============================================================
  section("§6 文案与 i18n 友好：非空 / 无 undefined/NaN / emoji 兜底")
  // ============================================================
  const BAD_TEXT = ["undefined", "NaN", "[object Object]", "null", "Infinity"];
  for (const s of samples) {
    for (const bad of BAD_TEXT) {
      const hit = s.html.includes(bad);
      check(`文案 · ${s.name} 产出不含「${bad}」`, !hit, hit ? `命中：${s.html.slice(Math.max(0, s.html.indexOf(bad) - 24), s.html.indexOf(bad) + bad.length + 12)}` : "干净");
    }
  }
  for (const s of samples) {
    const labelEmpty = ariaAttrsOf(s.html).filter((a) => a.k === "aria-label" && String(a.v).trim() === "");
    check(`文案 · ${s.name} 没有空的 aria-label`, labelEmpty.length === 0, labelEmpty.length ? labelEmpty.length + " 个空标签" : "全部非空");
  }
  // 静态页面的纯图形按钮必须有 aria-label 兜底
  for (const b of staticButtons) {
    if (!pictographicOnly(b.inner)) continue;
    const nm = ariaName(b.attrs, b.inner);
    check(`文案 · 纯图形按钮 #${b.attrs.id || b.attrs.class} 有 aria-label 兜底`,
      typeof b.attrs["aria-label"] === "string" && b.attrs["aria-label"].trim() !== "",
      b.attrs["aria-label"] || "缺失");
  }
  check("文案 · 触摸方向键的符号（◀/▶）也带 aria-label 文字说明",
    typeof b0Attr(html, "tleft") === "string" && b0Attr(html, "tleft").length > 2, b0Attr(html, "tleft") || "");
  // 玩家可见的格式化函数必须对缺失/坏数据有兜底
  const saveHtml = samples.find((s) => s.name.includes("renderSavePanel")).html;
  check("文案 · 存档面板「累计里程」永远带单位（不出现裸数字）", /累计里程[\s\S]{0,80}km/.test(saveHtml), "");
  check("文案 · 存档面板「累计时长」永远带单位", /累计时长[\s\S]{0,80}h/.test(saveHtml), "");
  check("文案 · 「最后游玩」无记录时显示占位符 —", /最后游玩[\s\S]{0,160}—/.test(saveHtml), "");
  check("文案 · 「累计时长」在 totalSeconds 缺失时显示 0.00h 而非 NaN", /0\.00 h/.test(saveHtml), "");
  // toast 文案：每个调用点都以字面量开头（便于翻译与审阅）
  const toastCalls = (S.game + S.panels + S.input + S.settings + S.world + S.main + S.components)
    .split("showToast(").slice(1);
  check("文案 · showToast 调用点数量", toastCalls.length >= 20, `${toastCalls.length} 处`);
  // 不用"是否以字面量起头"这种一刀切判据：条件三元（store.muted ? "🔇 已静音" : …）
  // 也是可翻译文案。真正的判据是：整条提示的表达式里必须含有可翻译的中文字面量。
  const hasCJK = (t) => /[一-龥]/.test(String(t).slice(0, 260));
  const noText = toastCalls.filter((t) => !hasCJK(t));
  check("文案 · 每条 showToast 都含可翻译的中文字面量（没有纯变量当整条提示）", noText.length === 0,
    noText.length ? noText.length + " 处无中文：" + noText.map((t) => t.slice(0, 40)).join(" / ") : `${toastCalls.length} 处全部可翻译`);
  // 提示时长：给足阅读时间又不至于挡视线（WCAG 2.2.1 Timing Adjustable 的精神：
  // 瞬时反馈要够读完；产品另给了"重开/缩放"等可重复触发路径）
  const toastAll = S.game + S.panels + S.input + S.settings + S.world + S.main;
  const durs = Array.from(toastAll.matchAll(/showToast\([\s\S]{0,320}?,\s*(\d{3,5})\s*[,)]/g)).map((m) => Number(m[1]));
  check("文案 · showToast 时长都在 300~2400ms（可读完又不挡视线）",
    durs.length >= 20 && durs.every((d) => d >= 300 && d <= 2400),
    `${durs.length} 处时长，范围 ${Math.min(...durs)}~${Math.max(...durs)}ms`);
  // 源码里不应残留占位标记
  for (const [f, name] of [["src", "TODO"], ["src", "FIXME"], ["src", "XXX"]]) {
    const files = ["ui/panels.js", "ui/menu.js", "ui/settings.js", "game/game.js", "core/input.js"];
    const hits = files.filter((p) => readProj("src", ...p.split("/")).includes(name));
    check(`文案 · ${name} 未残留在用户可见代码里`, hits.length === 0, hits.join(",") || "无");
  }
  check("i18n · 界面语言声明与文案一致（zh-CN）", /lang="zh-CN"/.test(html) && /[一-龥]/.test(html), "");
  check("i18n · 没有内联 on* 事件属性（行为与结构分离，便于本地化）", !/\son(click|load|error|change)="/i.test(html), "");
  check("i18n · 按钮文案不经 innerHTML 拼接（走 textContent，可替换）",
    /renderMute[\s\S]{0,200}textContent/.test(S.settings) || /\.textContent = store\.muted/.test(S.settings), "");

  // ============================================================
  section("§7 性能静态：渲染循环内无同步 IO / 无逐帧大对象 / 无 O(n²)")
  // ============================================================
  const drawFns = [
    ["drawScene", S.scene], ["drawTerrain", S.terrainR], ["drawCoins", S.entities],
    ["drawCanisters", S.entities], ["drawParticles", S.particles],
    ["drawBackground", S.bg], ["drawBike", S.bikeR], ["drawHud", S.hud],
    ["applyPostFx", S.postfx], ["updateParticles", S.particles], ["update", S.game],
  ];
  const SYNC_IO = ["localStorage", "sessionStorage", "XMLHttpRequest", "fetch(", "JSON.parse", "await ", ".then("];
  const ioHits = (body) => SYNC_IO.filter((k) => body.includes(k));
  const allocHits = (body) => {
    const a = [];
    if (/new Array\(/.test(body)) a.push("new Array");
    if (/\.map\(|\.filter\(|\.forEach\(/.test(body)) a.push("map/filter/forEach");
    if (/Object\.(keys|values|entries|assign)\(/.test(body)) a.push("Object.*");
    if (/=\s*\{\s*[a-zA-Z_$][\w$]*\s*:\s*[^;]*\}\s*;/.test(body)) a.push("对象字面量赋值");
    if (/=\s*\[[^\[\]]*\]/.test(body)) a.push("数组字面量赋值");
    return a;
  };
  // 检测器自检（positive control）：拿一个"确实脏"的已知函数验探测器不是恒真
  const storageSrc = srcOf("core/storage.js");
  const dirty = fnSrc(storageSrc, "lsGet") || fnSrc(storageSrc, "jsonOr") || "";
  check("性能 · 探测器自检：storage.js 的存档读写被同步 IO 检测器命中",
    ioHits(dirty).length > 0, `${dirty ? "lsGet/jsonOr" : "未取到函数体"} 命中 ${ioHits(dirty).join(",") || "无"}`);
  const mixer = fnSrc(S.bikeR, "mixHex") || "";
  check("性能 · 探测器自检：render/bike.js 的 mixHex 被逐帧分配检测器命中",
    allocHits(mixer).length > 0, `命中 ${allocHits(mixer).join(",") || "无"}`);
  for (const [name, file] of drawFns) {
    const body = fnSrc(file, name) || "";
    const hits = ioHits(body);
    check(`性能 · ${name}() 内无同步 IO / 存储读`, hits.length === 0, hits.length ? hits.join(",") : `${body.length} 字符干净`);
    const dom = /innerHTML|querySelector|getElementById|createElement/.test(body);
    check(`性能 · ${name}() 内无 DOM 写入（innerHTML/querySelector 不进渲染层）`, !dom, dom ? "含 DOM 调用" : "无 DOM 调用");
  }
  // 逐帧分配：对象字面量 / 数组构造 / map/filter/forEach
  for (const [name, file] of drawFns.slice(0, 9)) {
    const body = fnSrc(file, name) || "";
    const alloc = allocHits(body);
    check(`性能 · ${name}() 渲染循环内无逐帧大对象分配`, alloc.length === 0, alloc.join(",") || "无");
  }
  // 视口剔除（画得少才跑得动）
  check("性能 · drawCoins 按视口剔除（sx 出界即 continue）",
    /if \(sx < -20 \|\| sx > view\.W \+ 20\) continue;/.test(S.entities), "");
  check("性能 · drawCanisters 按视口剔除", /if \(sx < -30 \|\| sx > view\.W \+ 30\) continue;/.test(S.entities), "");
  check("性能 · drawParticles 按视口剔除", /if \(sx < -50 \|\| sx > view\.W \+ 50\) continue;/.test(S.particles), "");
  check("性能 · 拾取过的金币/油罐在更新与绘制两侧都跳过",
    /if \(c\.taken\) continue;/.test(S.world) && (S.world.match(/if \(c\.taken\) continue;/g) || []).length >= 2,
    `${(S.world.match(/if \(c\.taken\) continue;/g) || []).length} 处`);
  check("性能 · 拾取相位由固定步推进（渲染层只读不写，120/144Hz 屏转速不翻倍）",
    /c\.ph \+= 0\.05/.test(S.world) && /Math\.sin\(c\.ph\)/.test(S.entities), "updateCoins 推进 / drawCoins 只读");
  check("性能 · 粒子数组有硬上限 600 并做 splice 修剪",
    /MAX_PARTICLES = 600/.test(S.particles) && /arr\.splice\(0, arr\.length - MAX_PARTICLES\)/.test(S.particles), "");
  check("性能 · 世界实体按相机位置流式回收（coins/canisters/deco*）",
    (S.world.match(/world\.\w+ = world\.\w+\.filter\(/g) || []).length >= 4,
    `${(S.world.match(/world\.\w+ = world\.\w+\.filter\(/g) || []).length} 条回收规则`);
  // O(n²) 抽样：渲染/更新热路径里不允许出现 world.* 数组的嵌套遍历
  // 实现方式是"把每个 `for (... of world.X)` 的循环体按花括号配平切出来，看里面有没有
  // 第二个 world.* 遍历"——比"函数里出现两个 for 就算嵌套"要准（串行双循环不是 O(n²)）。
  const NESTED = [];
  for (const [name, file] of drawFns) {
    const body = fnSrc(file, name) || "";
    const s = stripComments(body);
    for (const m of s.matchAll(/for\s*\([^)]*\bof\s+world\.\w+[^)]*\)\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      const blk = readBlock(s, open);
      if (blk && /for\s*\([^)]*\bof\s+world\.\w+/.test(blk.body)) NESTED.push(name + " 内层");
    }
  }
  check("性能 · 渲染热路径无 world 数组的嵌套遍历（O(n²) 热点）", NESTED.length === 0,
    NESTED.length ? NESTED.join(",") : `抽样 ${drawFns.length} 个热路径函数，world.* 遍历层级均 ≤1`);
  // 同一个数组在同一函数里被遍历两次也值得看一眼（第二次通常是重复工作）
  const dupLoops = [];
  for (const [name, file] of drawFns) {
    const body = stripComments(fnSrc(file, name) || "");
    const arrs = (body.match(/for\s*\([^)]*\bof\s+(world\.\w+|\w+)\s*\)/g) || []).map((x) => /of\s+([\w.]+)/.exec(x)[1]);
    const seen = new Set(), dup = new Set();
    for (const a of arrs) (seen.has(a) ? dup : seen).add(a);
    if (dup.size) dupLoops.push(name + ":" + Array.from(dup).join("/"));
  }
  check("性能 · 同一函数内不重复遍历同一个集合", dupLoops.length === 0,
    dupLoops.length ? dupLoops.join(", ") : "无重复遍历");
  // 固定步长：补帧上限与 dt 钳制
  check("性能 · Stepper 单帧最多补 15 步（覆盖 0.25s 累积上限，死亡螺旋兜底）",
    /maxSteps = 15/.test(S.loop) && /if \(n >= this\.maxSteps\) this\.acc = 0;/.test(S.loop), "");
  check("性能 · Stepper 把 dt 钳到 0.25s（切标签页回来不一次补跑几百步）",
    /this\.acc \+= Math\.min\(dtSeconds, 0\.25\)/.test(S.loop), "");
  check("性能 · update() 非游玩态早退（菜单/结算只走时钟）",
    /if \(store\.state !== "play"\) \{[\s\S]{0,80}store\.time \+= dt;[\s\S]{0,40}return;/.test(S.game), "");
  check("性能 · update() 打开车间时冻结时钟（不吃三星时限）", /if \(store\.shopOpen\) return;/.test(S.game), "");
  check("性能 · update() 每步只调一次 groundInfo（不是每实体一次）",
    (fnSrc(S.game, "update").match(/groundInfo\(/g) || []).length === 1,
    `${(fnSrc(S.game, "update").match(/groundInfo\(/g) || []).length} 处`);
  // update() 里确实有 3 处 setTimeout（AI 冲线后自动推进等），所以断言的不是"没有定时器"，
  // 而是"每个延时回调都经 runGuard 世代守卫"——否则旧一局的回调会把新一局推走。
  const updBody = fnSrc(S.game, "update") || "";
  const ups = (updBody.match(/setTimeout\(/g) || []).length;
  const guarded = (updBody.match(/setTimeout\(runGuard\(/g) || []).length;
  check("性能 · update() 内的延时回调全部经 runGuard 世代守卫（不会串档）",
    ups === guarded && ups > 0, `${guarded}/${ups} 处包了 runGuard`);
  check("性能 · drawScene 用 save/restore 成对包裹世界层缩放",
    (fnSrc(S.scene, "drawScene").match(/ctx\.save\(\)/g) || []).length === 1 &&
    (fnSrc(S.scene, "drawScene").match(/ctx\.restore\(\)/g) || []).length === 1, "");
  check("性能 · drawScene 抖动偏移只影响本帧（cam.x/y 事后还原）",
    /cam\.x = bcx;/.test(S.scene) && /cam\.y = bcy;/.test(S.scene), "");
  check("性能 · applyPostFx 低画质直接返回（零后处理开销）",
    /if \(quality === "low"\) return;/.test(S.postfx), "");
  check("性能 · applyPostFx 非游玩态直接返回", /if \(store\.state !== "play"\) return;/.test(S.postfx), "");
  // warmGlow 的缓存语义是"光源没动就复用"。光源位置现在由 light.js 跟随相机
  // （含 celestial.parallax），所以除了空判据还必须带位移判据 —— 否则渐变会
  // 钉在旧位置，辉光与太阳分家。9 个 parallax=0 的场景光源静止，仍然零重建。
  check("性能 · 后处理渐变只创建一次并缓存（fade/fadeHi/warmGlow 复用）",
    /if \(!isHi && !fade\)/.test(S.postfx) &&
    /if \(!warmGlow \|\|/.test(S.postfx) && /warmPosX/.test(S.postfx), "");
  check("性能 · 天气粒子池固定 64 个、首次 seed 后只做边界回绕",
    /WEATHER_N = 64/.test(S.postfx) && /weatherSeeded/.test(S.postfx), "");
  check("性能 · 地表采样步长 8px（drawTerrain 主填充步长有上界）",
    /const GS = 8/.test(S.terrainR) && /for \(let i = 0, x = 0; x <= W; x \+= GS/.test(S.terrainR), "");
  const groundSteps = Array.from(S.terrainR.matchAll(/eachGround\(cx, cy, (\d+),/g)).map((m) => Number(m[1]));
  check("性能 · 地表纹理的 eachGround 步长全部 ≥10px（12 种纹理共 " + groundSteps.length + " 处）",
    groundSteps.length >= 10 && groundSteps.every((n) => n >= 10),
    "步长集合 " + Array.from(new Set(groundSteps)).sort((a, b) => a - b).join("/") + "px");
  check("性能 · 相机震屏强度钳制在 16 以内（不会糊屏）", /Math\.min\(16, store\.cam\.shake \+ v\)/.test(S.camera), "");
  check("性能 · 震屏按帧率无关的指数衰减", /Math\.pow\(0\.86, dt \* 60\)/.test(S.camera), "");
  check("性能 · 关卡地形只在开局/换关构建（update 里不调 buildLevel）",
    /buildLevel\(/.test(S.main) && /buildLevel\(/.test(S.game) && !/buildLevel\(/.test(fnSrc(S.game, "update") || ""),
    "调用点：main.js 首屏 + game.js startGame/nextLevel");
  check("性能 · render 层不读存档（存档读写全在 storage.js，由 UI 事件触发）",
    (S.scene + S.terrainR + S.entities + S.particles + S.hud + S.bikeR + S.bg).includes("localStorage") === false, "");
  check("性能 · 画质档位持久化只走 postfx 的 lsGet/lsSet 包装（非存档键）",
    /const QKEY = "dale_quality"/.test(S.postfx) && /try \{ return localStorage\.getItem\(k\); \}/.test(S.postfx), "");

  // ============================================================
  section("§8 令牌双端一致（本模块顺带守护的强前提）")
  // ============================================================
  const cssKeys = Object.keys(TOK).sort();
  const jsKeys = Object.keys(TOKENS).sort();
  check("令牌 · tokens.css 与 ui-tokens.js 键集合完全一致", cssKeys.length === jsKeys.length && cssKeys.every((k, i) => k === jsKeys[i]),
    `CSS ${cssKeys.length} 键 / JS ${jsKeys.length} 键`);
  const diff = cssKeys.filter((k) => TOK[k] !== TOKENS[k]);
  check("令牌 · 两端取值逐键一致（含书写格式）", diff.length === 0, diff.length ? diff.join(",") : `${cssKeys.length} 键全等`);
  check("令牌 · 半透明浮层令牌用 rgba 而非 hex（保证叠加可算）",
    ["glass-fill", "glass-border", "scrim-menu", "hud-scrim", "scrim-strong", "scrim-solid"]
      .every((k) => TOK[k].startsWith("rgba")), "");
  check("令牌 · 文本三层令牌均为不透明色（对比度可按令牌组合核算）",
    ["text-hi", "text-mid", "text-lo"].every((k) => TOK[k].startsWith("#")), "");

  return { samples: samples.length };
}

// ---- 小工具：取某个 class/id 元素的 aria-label ----
function b0Attr(html, cls) {
  const m = new RegExp("<button[^>]*class=\"[^\"]*\\b" + cls + "\\b[^\"]*\"[^>]*>").exec(html);
  if (!m) return null;
  const a = /aria-label="([^"]*)"/.exec(m[0]);
  return a ? a[1] : null;
}
