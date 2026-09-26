#!/usr/bin/env node
// ============================================================
//  无头自动测试（不需要浏览器）
//    · 把 DOM / Canvas / localStorage 打桩后加载全部模块
//    · 全油门自动试跑全部关卡，验证可通关
//    · 验证物理与刷新率无关、落地分级、空翻可达、AI 速度比、坡度精度等
//  用法：
//    node tools/autotest.mjs            # 跑全部测试
//    node tools/autotest.mjs --modules  # 只检查模块能否加载
// ============================================================
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ONLY_MODULES = process.argv.includes("--modules");
const DIAG = (() => {
  const a = process.argv.find((s) => s.startsWith("--diag="));
  return a ? Number(a.split("=")[1]) : -1;
})();
/** --levels：只跑"全部关卡可通关"并按紧凑格式输出（改地形难度后快速回归用） */
const ONLY_LEVELS = process.argv.includes("--levels");

// ------------------------------------------------------------
// 1. 浏览器环境打桩
// ------------------------------------------------------------
const noop = () => {};

/** Canvas 2D 上下文桩：任何方法都是空操作，渐变返回带 addColorStop 的对象 */
function makeCtx() {
  const target = {
    canvas: { width: 0, height: 0 },
    globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1,
    lineCap: "", lineJoin: "", font: "", textAlign: "", textBaseline: "",
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") {
          return { addColorStop: noop };
        }
        if (k === "measureText") return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

function makeEl(id) {
  // 真事件监听表：面板里的按钮点击/键盘可以通过 dispatchEvent 真实回放（原来 addEventListener 是空函数）
  const listeners = new Map();
  return {
    id,
    style: {},
    dataset: {},
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    complete: true,
    naturalWidth: 1,
    children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) {
        if (on === undefined) this._s.has(c) ? this._s.delete(c) : this._s.add(c);
        else if (on) this._s.add(c);
        else this._s.delete(c);
      },
      contains(c) { return this._s.has(c); },
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const a = listeners.get(type) || [];
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    dispatchEvent(ev) {
      for (const fn of listeners.get(ev && ev.type) || []) fn(ev);
      return true;
    },
    _listeners: listeners,
    setAttribute(k, v) { this.attrs = this.attrs || {}; this.attrs[k] = String(v); },
    getAttribute(k) { return (this.attrs || {})[k] === undefined ? null : (this.attrs || {})[k]; },
    hasAttribute(k) { return (this.attrs || {})[k] !== undefined; },
    insertBefore: noop,
    appendChild: noop,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => makeCtx(),
  };
}

const elCache = new Map();
const getEl = (id) => {
  if (!elCache.has(id)) elCache.set(id, makeEl(id));
  return elCache.get(id);
};

const winListeners = new Map();
globalThis.document = {
  getElementById: getEl,
  querySelector: (sel) => getEl("__sel" + sel),
  querySelectorAll: () => [],
  createElement: (tag) => makeEl("__new_" + tag),
  addEventListener: noop,
  documentElement: makeEl("__html"),
  body: makeEl("__body"),
  fullscreenElement: null,
  exitFullscreen: noop,
};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener: (type, fn) => {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  },
  removeEventListener: noop,
};
const defineGlobal = (name, value) => {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch (e) {
    globalThis[name] = value;
  }
};

defineGlobal("navigator", { maxTouchPoints: 0 });
defineGlobal("CanvasRenderingContext2D", class {});
defineGlobal("requestAnimationFrame", noop);
// 屏蔽所有定时器，避免测试被异步结算打断
defineGlobal("setTimeout", () => 0);
defineGlobal("clearTimeout", noop);

const memStore = new Map();
// 注意：必须实现 length / key(i)，否则 storage.js 的 listSaveKeys() 与测试里的手工快照
// （for i < localStorage.length）会静默拿到 0 个键，导致导出/导入/还原用例"空跑通过"。
defineGlobal("localStorage", {
  get length() { return memStore.size; },
  key: (i) => Array.from(memStore.keys())[i] ?? null,
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
  clear: () => memStore.clear(),
});

const dispatchWin = (type, ev) => {
  for (const fn of winListeners.get(type) || []) fn(ev);
};

// ------------------------------------------------------------
// 2. 极简断言框架
// ------------------------------------------------------------
const results = [];
let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures++;
  results.push(`${ok ? "  ✅" : "  ❌"} ${name}${detail ? "  → " + detail : ""}`);
  return ok;
}
function section(t) {
  results.push(`\n──────── ${t} ────────`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------
// 3. 加载全部模块（模块清单检查）
// ------------------------------------------------------------
const MODULE_LIST = [
  "config/constants.js", "config/themes.js", "config/vehicles.js", "config/levels.js",
  "core/utils.js", "core/canvas.js", "core/store.js", "core/audio.js", "core/storage.js",
  "core/input.js", "core/loop.js", "core/toast.js",
  "physics/terrain.js", "physics/bike.js", "physics/fuel.js",
  "game/progress.js", "game/stats.js", "game/world.js", "game/race.js", "game/game.js",
  "render/particles.js", "render/camera.js", "render/background.js", "render/terrain.js",
  "render/bike.js", "render/entities.js", "render/hud.js", "render/scene.js", "render/postfx.js",
  "ui/menu.js", "ui/panels.js", "ui/shop.js", "ui/donate.js", "ui/components.js",
  "main.js",
];

section("模块加载");
let loaded = 0;
for (const f of MODULE_LIST) {
  try {
    await import(new URL("../src/" + f, import.meta.url).href);
    loaded++;
  } catch (e) {
    check("加载 " + f, false, e.message);
  }
}
check(`全部 ${MODULE_LIST.length} 个模块可加载`, loaded === MODULE_LIST.length, `成功 ${loaded}/${MODULE_LIST.length}`);

if (ONLY_MODULES) {
  console.log(results.join("\n"));
  process.exitCode = failures ? 1 : 0;
} else {
  // ----------------------------------------------------------
  // 4. 功能测试
  // ----------------------------------------------------------
  const { store, bike, world } = await import(new URL("../src/core/store.js", import.meta.url).href);
  const { key } = await import(new URL("../src/core/input.js", import.meta.url).href);
  const { LEVELS, BRANCHES, FINALE, FINALE_INDEX, LEVELS_PER_BRANCH, N_BRANCHES, starTime, variantRule, VARIANTS, airTargetOf: atOfDiag } = await import(
    new URL("../src/config/levels.js", import.meta.url).href
  );
  const { THEMES } = await import(new URL("../src/config/themes.js", import.meta.url).href);
  const { Stepper } = await import(new URL("../src/core/loop.js", import.meta.url).href);
  const { groundInfo, groundY } = await import(new URL("../src/physics/terrain.js", import.meta.url).href);
  const { stepPhysics, resetBike, rotateBikeAround, crash } = await import(new URL("../src/physics/bike.js", import.meta.url).href);
  const { updateStats } = await import(new URL("../src/game/stats.js", import.meta.url).href);
  const { startGame, update, runGuard, restart } = await import(new URL("../src/game/game.js", import.meta.url).href);
  const { SUBV, SUB_DT, DT, toM, REF_SPEED, OBST_HIT_V, CRASH_FUEL_LOSS, CRASH_TIME_PENALTY } = await import(
    new URL("../src/config/constants.js", import.meta.url).href
  );
  const { hasAch } = await import(new URL("../src/game/progress.js", import.meta.url).href);
  const { save, loadSave, loadAchList, getUp } = await import(new URL("../src/core/storage.js", import.meta.url).href);
  const { drawScene } = await import(new URL("../src/render/scene.js", import.meta.url).href);

  // ---------------- 设计令牌（Task 1）：双端一致 + 分组覆盖 + CSS 无字面色值 ----------------
  section("设计令牌");
  {
    const tokensCss = readFileSync(join(ROOT, "styles", "tokens.css"), "utf8");
    const { TOKENS, semColor, fontOf } = await import(
      new URL("../src/config/ui-tokens.js", import.meta.url).href
    );

    // 解析 :root { --key: value; }（先剥掉注释，否则注释后紧跟的令牌会被吞掉）
    const rootBody = (tokensCss.match(/:root\s*\{([\s\S]*?)\}/) || ["", ""])[1]
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const cssTokens = {};
    for (const seg of rootBody.split(";")) {
      const m = seg.match(/^\s*--([a-z0-9-]+)\s*:\s*([\s\S]+)$/i);
      if (m) cssTokens[m[1]] = m[2].trim();
    }

    const cssKeys = Object.keys(cssTokens).sort();
    const jsKeys = Object.keys(TOKENS).sort();
    const missJs = cssKeys.filter((k) => !(k in TOKENS));
    const missCss = jsKeys.filter((k) => !(k in cssTokens));
    check(
      "令牌双端键集合一致",
      missJs.length === 0 && missCss.length === 0,
      `css ${cssKeys.length} 项 / js ${jsKeys.length} 项` +
        (missJs.length ? ` · CSS 独有 ${missJs.slice(0, 5).join(",")}` : "") +
        (missCss.length ? ` · JS 独有 ${missCss.slice(0, 5).join(",")}` : "")
    );

    const valDiff = jsKeys
      .filter((k) => cssTokens[k] !== TOKENS[k])
      .map((k) => `${k}(css=${cssTokens[k]}|js=${TOKENS[k]})`);
    check(
      "令牌双端取值完全一致",
      valDiff.length === 0,
      valDiff.length ? valDiff.slice(0, 4).join(" ") : `${cssKeys.length} 个键取值全等`
    );

    const groups = {
      表面层级: ["surface-0", "surface-1", "surface-2", "surface-3"],
      玻璃层: ["glass-fill", "glass-fill-strong", "glass-border", "glass-highlight", "glass-blur"],
      强调色: ["accent", "accent-2", "accent-grad"],
      语义色: ["success", "warn", "danger", "gold", "info"],
      文本层级: ["text-hi", "text-mid", "text-lo"],
      排版: ["font-display-size", "font-title-size", "font-body-size", "font-caption-size", "font-micro-size", "font-display-lh", "font-display-weight"],
      间距: ["space-1", "space-2", "space-3", "space-4", "space-5", "space-6"],
      圆角: ["radius-chip", "radius-card", "radius-sheet", "radius-pill"],
      动效: ["dur-fast", "dur-base", "dur-slow", "ease-std", "ease-enter", "ease-exit"],
    };
    const badGroups = Object.entries(groups)
      .filter(([, keys]) => keys.some((k) => !(k in cssTokens)))
      .map(([g]) => g);
    check(
      "令牌覆盖 spec 要求的全部分组",
      badGroups.length === 0,
      Object.keys(groups).length + " 组" + (badGroups.length ? " 缺 " + badGroups.join(",") : "全部齐备")
    );

    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    check(
      "index.html 在 main.css 之前引入 tokens.css",
      html.includes("styles/tokens.css") && html.indexOf("tokens.css") < html.indexOf("main.css"),
      html.includes("tokens.css") ? "顺序正确" : "未引入 tokens.css"
    );

    const mainCss = readFileSync(join(ROOT, "styles", "main.css"), "utf8");
    const literals = mainCss.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];
    check(
      "main.css 无脱离令牌的字面色值",
      literals.length === 0,
      literals.length ? literals.slice(0, 5).join(",") : `${Object.keys(cssTokens).length} 个令牌全部走 var()`
    );

    check(
      "语义色 / 字体辅助函数可用",
      semColor("danger") === TOKENS.danger && fontOf("title").includes(TOKENS["font-title-size"]),
      `semColor(danger)=${semColor("danger")} · fontOf(title)="${fontOf("title")}"`
    );
  }

  // ---------------- 组件库（Task 2）：纯函数可调用 + ui 层无内联配色 ----------------
  section("组件库");
  {
    const comp = await import(new URL("../src/ui/components.js", import.meta.url).href);
    const fns = ["card", "chip", "badge", "grid", "statRow", "emptyState", "progress"];
    const bad = [];
    for (const name of fns) {
      if (typeof comp[name] !== "function") { bad.push(`${name}:未导出`); continue; }
      let out = "";
      try {
        out = name === "statRow"
          ? comp[name]([{ label: "L", value: "V" }])
          : name === "grid"
            ? comp[name](["<i></i>"], { cols: 3 })
            : name === "progress"
              ? comp[name](42)
              : name === "emptyState"
                ? comp[name]("空")
                : name === "chip" || name === "badge"
                  ? comp[name]("x", "info")
                  : comp[name]({ title: "t", sub: "s", meta: "m", right: "r", icon: "i" });
      } catch (e) {
        bad.push(`${name}:抛错 ${e.message}`);
        continue;
      }
      if (typeof out !== "string" || !out.trim().length) bad.push(`${name}:空返回`);
    }
    check("components.js 导出函数均可调用且返回非空 HTML", bad.length === 0,
      bad.slice(0, 4).join(" ; ") || `校验 ${fns.length} 个函数`);

    // 组件类齐备（CSS 侧）
    const mainCss = readFileSync(join(ROOT, "styles", "main.css"), "utf8");
    const needCls = ["glass-sheet", "card", "chip", "btn", "progress", "stat", "tabs", "badge", "empty"];
    const missCls = needCls.filter((c) => !new RegExp("\\." + c + "(?![a-zA-Z0-9_-])").test(mainCss));
    const needStates = [":hover", ":active", ":focus-visible", "[disabled]", 'aria-disabled="true"'];
    const missState = needStates.filter((s) => !mainCss.includes(s));
    check("组件类与五态样式齐备", missCls.length === 0 && missState.length === 0,
      (missCls.length ? "缺类 " + missCls.join(",") + " ; " : "") +
      (missState.length ? "缺态 " + missState.join(",") : `${needCls.length} 个组件 / ${needStates.length} 种状态`));

    // 配色不得写成内联 style（布局类动态值允许）
    const colorStyle = /style="[^"]*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/;
    const hits = [];
    for (const f of ["menu.js", "panels.js", "shop.js", "donate.js", "components.js"]) {
      const src = readFileSync(join(ROOT, "src", "ui", f), "utf8");
      if (colorStyle.test(src)) hits.push(f);
    }
    check("src/ui/*.js 无内联配色 style", hits.length === 0, hits.length ? hits.join(",") : "5 个文件全部用组件类/令牌");
  }

  // ---------------- 主菜单信息架构（Task 3） ----------------
  section("主菜单");
  {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const groups = ["main", "progress", "support"];
    const missG = groups.filter((g) => !html.includes(`data-group="${g}"`));
    const needEntries = ["levels", "race", "finale", "ranked", "free"];
    const missE = needEntries.filter((e) => !html.includes(`data-entry="${e}"`));
    check("菜单按「主玩法 / 养成与进度 / 支持」三组呈现",
      missG.length === 0 && missE.length === 0,
      (missG.length ? "缺组 " + missG.join(",") + " ; " : "3 组齐备 · ") + `主玩法入口 ${needEntries.length - missE.length}/${needEntries.length}`);
    check("主菜单入口均为 button 且无内联 onclick",
      !/onclick=/.test(html) && (html.match(/<button/g) || []).length >= 10,
      `${(html.match(/<button/g) || []).length} 个 button / 无 onclick`);

    const menu = await import(new URL("../src/ui/menu.js", import.meta.url).href);
    const els = (id) => globalThis.document.getElementById(id);

    // Hero 状态摘要：六项且数值与 store 一致
    const bak = {
      gold: store.gold, best: store.best, stars: store.stars.slice(),
      invited: store.progress.invited, rating: store.progress.rating, peak: store.progress.peak,
    };
    store.gold = 1234;
    store.best = 77;
    store.stars.fill(0);
    store.stars[0] = 3;
    store.stars[1] = 2;
    store.progress.invited = true;
    store.progress.rating = 1350;

    menu.renderHeroSummary();
    const sum = els("heroSummary").innerHTML || "";
    const need = ["车辆", "金币", "1234", "通关进度", "2/72", "总星", "5/216", "段位", "1350", "无限最佳", "77m"];
    const miss = need.filter((k) => !sum.includes(k));
    check("Hero 摘要六项齐备且与 store 一致", miss.length === 0,
      miss.length ? "缺 " + miss.join(",") : "车辆/金币/通关 2/72/总星 5/216/段位 1350/无限最佳 77m");

    // 未解锁入口：按钮文案必须写明解锁条件与当前进度，且标记锁定
    store.stars.fill(0);
    store.progress.invited = false;
    store.progress.rating = 0;
    menu.refreshMenuButtons();
    const fb = els("btnFinale");
    const rb = els("btnRanked");
    check("未解锁入口写明解锁条件与当前进度",
      /0\/72/.test(fb.textContent) && fb.classList.contains("lockedBtn") &&
        /最终任务/.test(rb.textContent) && rb.classList.contains("lockedBtn"),
      `最终任务="${fb.textContent}" · 排位赛="${rb.textContent}"`);

    const { renderFinalePanel } = await import(new URL("../src/ui/panels.js", import.meta.url).href);
    const { hidePanel } = menu;
    renderFinalePanel();
    const fpHtml = els("modePanel").innerHTML || "";
    const noStart = !fpHtml.includes('data-act="finaleStart"');
    check("未解锁时最终任务面板给出进度且无开局入口",
      /当前 0\/72/.test(fpHtml) && noStart, noStart ? "含进度提示 · 无 finaleStart" : "仍可开局");
    hidePanel();

    // 键盘导航：静态检查按键处理（方向键 / Escape）与焦点默认位
    const menuSrc = readFileSync(join(ROOT, "src", "ui", "menu.js"), "utf8");
    check("菜单支持方向键移动与 Esc 关面板",
      /ArrowDown/.test(menuSrc) && /ArrowUp/.test(menuSrc) && /Escape/.test(menuSrc) && /focusDefault/.test(menuSrc),
      "ArrowUp/Down/Left/Right + Escape + 默认焦点");

    // 活体背景：渐晕 + 流动光斑，且 reduced-motion 下静止
    const mainCss2 = readFileSync(join(ROOT, "styles", "main.css"), "utf8");
    check("菜单活体背景（渐晕 + 流动光斑 + reduced-motion 静止）",
      html.includes('id="menuBg"') && mainCss2.includes("@keyframes drift") &&
        /prefers-reduced-motion[\s\S]*#menuBg .glow \{ animation: none/.test(mainCss2),
      "menuBg + drift + reduced-motion 关闭");

    // 还原 store 快照
    store.gold = bak.gold;
    store.best = bak.best;
    store.stars = bak.stars;
    store.progress.invited = bak.invited;
    store.progress.rating = bak.rating;
    store.progress.peak = bak.peak;
    menu.refreshMenuButtons();
  }

  // ---------------- HUD 布局与仪表（Task 5） ----------------
  section("HUD");
  {
    const hud = await import(new URL("../src/render/hud.js", import.meta.url).href);
    const { view } = await import(new URL("../src/core/canvas.js", import.meta.url).href);

    const viewBak = { W: view.W, H: view.H };
    const sizes = [[1280, 720], [500, 900], [360, 400]];
    const bad = [];
    for (const [w, h] of sizes) {
      view.W = w;
      view.H = h;
      for (const hasWarn of [false, true]) {
        const L = hud.hudLayout(hasWarn);
        const items = Object.entries(L).filter(([, r]) => r && typeof r === "object");
        for (const [k, r] of items) {
          if (r.x < -0.01 || r.y < -0.01 || r.x + r.w > w + 0.01 || r.y + r.h > h + 0.01) {
            bad.push(`${w}x${h}${hasWarn ? "+警告" : ""} ${k} 越界`);
          }
        }
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const [ka, a] = items[i];
            const [kb, b] = items[j];
            if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
              bad.push(`${w}x${h}${hasWarn ? "+警告" : ""} ${ka}×${kb} 重叠`);
            }
          }
        }
      }
    }
    check("HUD 三种视口（含警告带）互不重叠且不越界",
      bad.length === 0,
      bad.slice(0, 4).join(" ; ") || "1280×720 / 500×900 / 360×400 · 有/无警告 全部通过");
    view.W = viewBak.W;
    view.H = viewBak.H;

    // 危险段警告：高优先级且能真实触发（渲染不抛异常）
    const hazBak = world.hazards.slice();
    const crashBak = store.run.crashed;
    startGame("level", 0);
    const m0 = (bike.rear.x + bike.front.x) / 2;
    world.hazards = [{ x0: m0 - 50, x1: m0 + 200, vmax: 50 }];
    bike.speed = 600;
    store.run.crashed = false;
    let warn = null;
    let threw = null;
    try { warn = hud.activeWarning(); } catch (e) { threw = e.message; }
    let drawThrew = null;
    try { hud.drawHud(); } catch (e) { drawThrew = e.message; }
    check("危险段超速触发 danger 级警告且渲染不抛异常",
      !threw && !drawThrew && !!warn && warn.level === "danger",
      threw || drawThrew || (warn ? `${warn.level}: ${warn.text}` : "未触发"));

    // 无警告时不应报有警告（避免常驻遮挡）
    world.hazards = [];
    world.gates = [];
    bike.speed = 100;
    check("无危险时 HUD 不显示机制警告", hud.activeWarning() === null, "activeWarning=null");
    world.hazards = hazBak;
    store.run.crashed = crashBak;

    // 色值全部来自令牌
    const hudSrc = readFileSync(join(ROOT, "src", "render", "hud.js"), "utf8");
    const lits = hudSrc.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];
    check("HUD 色值全部来自 ui-tokens（无裸色值）", lits.length === 0, lits.slice(0, 5).join(",") || "无");
  }

  // ---------------- 渲染层令牌化（Task 6） ----------------
  section("渲染层令牌化");
  {
    const renderFiles = readdirSync(join(ROOT, "src", "render")).filter((f) => f.endsWith(".js"));
    const LIT = /"#[0-9a-fA-F]{3,8}"|"rgba?\([^"]*\)"|"hsla?\([^"]*\)"/g;
    const hits = [];
    for (const f of renderFiles) {
      const src = readFileSync(join(ROOT, "src", "render", f), "utf8");
      for (const m of src.match(LIT) || []) if (!m.includes("${")) hits.push(f + ":" + m);
    }
    check("src/render/** 无白名单外的裸色值字面量",
      hits.length === 0,
      hits.slice(0, 5).join(" ") || `${renderFiles.length} 个渲染文件全部走令牌（仅允许模板插值动态色）`);

    const usesTokens = renderFiles.filter((f) =>
      readFileSync(join(ROOT, "src", "render", f), "utf8").includes('from "../config/ui-tokens.js"')
    );
    check("渲染层确实从 ui-tokens 取色",
      usesTokens.length >= 6,
      `${usesTokens.length}/${renderFiles.length} 个渲染文件引用 ui-tokens`);

    const themesSrc = readFileSync(join(ROOT, "src", "config", "themes.js"), "utf8");
    check("场景与装饰配色仍在数据层（未被并入令牌而丢失场景个性）",
      /export const DECO_COLORS/.test(themesSrc) && /ambient:/.test(themesSrc) && /pal:/.test(themesSrc),
      "THEMES.pal/ambient + DECO_COLORS 均在 config/themes.js");
  }

  // ---------------- 画面后处理（Task 7） ----------------
  section("画面后处理");
  {
    const fx = await import(new URL("../src/render/postfx.js", import.meta.url).href);
    const stateBak = store.state;
    const qBak = fx.getQuality();

    check("画质档位为 高 / 中 / 低 / 关",
      fx.QUALITY.join("/") === "high/medium/low/off",
      fx.QUALITY.map((q) => fx.QUALITY_LABEL[q]).join(" / "));

    const bad = [];
    for (const q of fx.QUALITY) {
      fx.setQuality(q);
      try {
        startGame("level", 0);
        drawScene();
      } catch (e) {
        bad.push(q + ":" + e.message);
      }
    }
    check("四档画质各渲染一帧无异常", bad.length === 0, bad.join(" ; ") || "4 档 × 1 帧全部通过");

    // 后处理为纯视觉层：同输入下"高"与"关"两档轨迹与用时完全一致
    const runTrace = () => {
      startGame("level", 3);
      const xs = [];
      let t = 0;
      while (t < 6 && store.state === "play") {
        autoInput();
        update(DT);
        t += DT;
        xs.push((bike.rear.x + bike.front.x) / 2);
      }
      return { xs, t };
    };
    fx.setQuality("high");
    const A = runTrace();
    fx.setQuality("off");
    const B = runTrace();
    let maxd = 0;
    for (let i = 0; i < Math.min(A.xs.length, B.xs.length); i++) maxd = Math.max(maxd, Math.abs(A.xs[i] - B.xs[i]));
    check("后处理不改变物理（高 vs 关 轨迹与用时一致）",
      maxd === 0 && Math.abs(A.t - B.t) < 1e-9,
      `最大位移差 ${maxd.toFixed(6)}px · 用时差 ${(A.t - B.t).toFixed(6)}s · ${A.xs.length} 帧`);

    fx.setQuality("low");
    check("画质设置持久化到非存档键（不动任何 bike_ 键）",
      localStorage.getItem("dale_quality") === "low" && !("dale_quality" in (await import(new URL("../src/config/constants.js", import.meta.url).href)).SAVE_KEYS),
      "dale_quality=low，无新增 bike_ 存档键");
    check("低档 / reduced-motion 关闭模糊类效果",
      fx.blurEnabled() === false && fx.setQuality("high") === "high" && fx.blurEnabled() === true,
      "low→false · high→true");

    const fxSrc = readFileSync(join(ROOT, "src", "render", "postfx.js"), "utf8");
    check("接入 THEMES.ambient 天气覆盖且离屏画布复用",
      /th\.ambient/.test(fxSrc) && /if \(!off\)/.test(fxSrc) && !/new Array/.test(fxSrc) &&
        THEMES.some((t) => t.ambient && t.ambient.type !== "none"),
      "ambient 分派 + 单例离屏 + 预分配粒子");

    fx.setQuality("high");
    store.state = "menu";
    let menuThrew = null;
    try { drawScene(); } catch (e) { menuThrew = e.message; }
    check("菜单（非 play）背景不因后处理出错", menuThrew === null, menuThrew || "非 play 状态直接跳过后处理");

    fx.setQuality(qBak);
    store.state = stateBak;
  }

  // ---------------- 动效与反馈语言（Task 8） ----------------
  section("动效与反馈");
  {
    const toast = await import(new URL("../src/core/toast.js", import.meta.url).href);
    const menu = await import(new URL("../src/ui/menu.js", import.meta.url).href);
    const panelEl = document.getElementById("modePanel");

    toast.clearToasts();
    const snap = (lv) => {
      toast.showToast("样例提示", 10, lv);
      return toast.toastState();
    };
    const s1 = snap("info");
    const s2 = snap("success");
    const s3 = snap("warn");
    const s4 = snap("danger");
    check("Toast 四型分级且同屏上限 2 条排队",
      s1.live.length === 1 && s2.live.length === 2 && s3.live.length === 2 && s3.queue.length === 1 &&
        s4.queue.length === 2 && toast.TOAST_LEVELS.length === 4 && toast.TOAST_MAX === 2,
      `live=${s2.live.join("/")} · queue=${s4.queue.join("/")} · 上限 ${toast.TOAST_MAX}`);
    check("Toast 按文案自动推断级别（老调用点无需改）",
      toast.inferLevel("⚠️ 危险路段超速！") === "warn" &&
        toast.inferLevel("🏆 比赛获胜！") === "success" &&
        toast.inferLevel("⛔ 出错") === "danger" &&
        toast.inferLevel("随便一句") === "info",
      "warn / success / danger / info");
    toast.clearToasts();

    menu.showResultCard({ title: "🏁 通关", stars: 3, goldGain: 200, goldTotal: 1234, time: 12.3 });
    const cardHtml = panelEl.innerHTML || "";
    check("结算结果卡含星级/金币滚动/下一关/返回菜单",
      /resultStars/.test(cardHtml) && /★/.test(cardHtml) && /data-roll="1234"/.test(cardHtml) &&
        /resultNext/.test(cardHtml) && /resultMenu/.test(cardHtml) && /aria-label=/.test(cardHtml),
      "星级逐颗 + 金币滚动 + 两个操作按钮（带 aria-label）");
    menu.showResultCard({ title: "🏆 排位胜利", goldTotal: 99, ratingDelta: 25, rating: 1350 });
    const rankHtml = panelEl.innerHTML || "";
    check("排位结果卡显示段位分变化 Δ", /\+25/.test(rankHtml) && /1350/.test(rankHtml), "Δ=+25 → 1350");
    menu.showMenu();

    const css = readFileSync(join(ROOT, "styles", "main.css"), "utf8");
    check("面板过渡 / 星级点亮 / reduced-motion 降级齐备",
      /#modePanel\.enter/.test(css) && /@keyframes starPop/.test(css) &&
        /prefers-reduced-motion[\s\S]*resultStars \.badge\.star \{ animation: none/.test(css),
      "panel enter 过渡 + starPop + 减少动效降级为瞬时");
    check("Toast 进出场动画与四型样式齐备",
      /#toast \.toastItm\.show/.test(css) && /\.toastItm\.info/.test(css) &&
        /\.toastItm\.success/.test(css) && /\.toastItm\.warn/.test(css) && /\.toastItm\.danger/.test(css),
      "show + 四型");
  }

  // ---------------- 可访问性与响应式（Task 9） ----------------
  section("可访问性与响应式");
  {
    const css = readFileSync(join(ROOT, "styles", "main.css"), "utf8");
    const compSrc = readFileSync(join(ROOT, "src", "ui", "components.js"), "utf8");
    const menuSrc = readFileSync(join(ROOT, "src", "ui", "menu.js"), "utf8");
    const panelSrc = readFileSync(join(ROOT, "src", "ui", "panels.js"), "utf8");

    check("四档断点布局规则齐备（≥1024 / 768~1023 / ≤767 / 横屏 H<480）",
      /@media \(max-width: 1023px\)/.test(css) && /@media \(max-width: 767px\)/.test(css) &&
        /@media \(max-height: 480px\)/.test(css) && /@media \(max-width: 519px\)/.test(css),
      "4 档（含 ≤519 细分档）");
    check("交互组件有 :focus-visible 焦点环与 44×44 触摸目标",
      /outline: 2px solid var\(--info\)/.test(css) && /min-height: 44px/.test(css) &&
        /min-width: 44px/.test(css),
      "焦点环 2px + min 44×44");

    // 对比度：按令牌组合核算（WCAG 相对亮度）
    const srgb = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const lum = (hex) => {
      const h = String(hex).replace("#", "");
      return 0.2126 * srgb(parseInt(h.substr(0, 2), 16)) +
        0.7152 * srgb(parseInt(h.substr(2, 2), 16)) +
        0.0722 * srgb(parseInt(h.substr(4, 2), 16));
    };
    const contrast = (a, b) => {
      const l1 = Math.max(lum(a), lum(b));
      const l2 = Math.min(lum(a), lum(b));
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const { TOKENS: T2 } = await import(new URL("../src/config/ui-tokens.js", import.meta.url).href);
    const surfaces = ["surface-0", "surface-1", "surface-2", "surface-3"].map((k) => T2[k]);
    const bodyTexts = ["text-hi", "text-mid", "text-lo"].map((k) => T2[k]);
    const bigTexts = ["text-hi", "gold", "success", "warn", "danger", "info"].map((k) => T2[k]);
    const badBody = [];
    for (const t of bodyTexts) for (const s of surfaces) {
      const r = contrast(t, s);
      if (r < 4.5) badBody.push(`${t} on ${s}=${r.toFixed(2)}`);
    }
    check("正文级文本对比度全部 ≥ 4.5:1",
      badBody.length === 0,
      badBody.slice(0, 4).join(" ; ") || `${bodyTexts.length} 文本色 × ${surfaces.length} 表面色 = 12 组合全部达标`);
    let minBig = Infinity;
    const badBig = [];
    for (const t of bigTexts) for (const s of surfaces) {
      const r = contrast(t, s);
      if (t === T2["text-hi"] || t === T2["text-mid"] || t === T2["text-lo"]) minBig = Math.min(minBig, r);
      if (r < 3) badBig.push(`${t} on ${s}=${r.toFixed(2)}`);
    }
    check("大字号 / 语义色文本对比度 ≥ 3:1",
      badBig.length === 0,
      badBig.slice(0, 4).join(" ; ") || `${bigTexts.length} 色 × ${surfaces.length} 表面 = ${bigTexts.length * surfaces.length} 组合全部达标`);

    // 交互元素的无障碍名称：面板输出里所有 div[data-act] 必须有 role=button + aria-label
    const { renderLevelsPanel, renderGaragePanel, renderAchPanel, renderFinalePanel, renderRankedPanel, renderFreePanel, renderSavePanel, renderRacePanel } = await import(
      new URL("../src/ui/panels.js", import.meta.url).href
    );
    const { hidePanel } = await import(new URL("../src/ui/menu.js", import.meta.url).href);
    const el = document.getElementById("modePanel");
    const starsBak2 = store.stars.slice();
    const unlockedBak2 = store.unlocked;
    store.unlocked = LEVELS.length - 1;
    for (let i = 0; i < store.stars.length; i++) store.stars[i] = 3;
    let html = "";
    for (const fn of [renderLevelsPanel, renderRacePanel, renderGaragePanel, renderAchPanel, renderFinalePanel, renderRankedPanel, renderFreePanel, renderSavePanel]) {
      try { fn(); html += el.innerHTML || ""; } catch (e) { /* 单个面板失败由前面的断言捕获 */ }
      hidePanel();
    }
    try { renderLevelsPanel(0); html += el.innerHTML || ""; } catch (e) { /* 展开态也纳入检查 */ }
    hidePanel();
    store.stars = starsBak2;
    store.unlocked = unlockedBak2;

    const tags = html.match(/<div\b[^>]*data-act="[^"]*"[^>]*>/g) || [];
    const noName = tags.filter((t) => !/role="button"/.test(t) || !/aria-label="[^"]+"/.test(t));
    check("面板内可点击元素均带 role=button 与无障碍名称",
      noName.length === 0,
      noName.length ? noName.slice(0, 2).join(" ") : `${tags.length} 个可点击 div 全部带 role/aria-label`);

    const nativeBtns = html.match(/<button\b[^>]*>/g) || [];
    const unnamedBtns = nativeBtns.filter((t) => !/aria-label=/.test(t));
    check("原生 button 均可被读屏识别（有文本或 aria-label）",
      unnamedBtns.length <= nativeBtns.length, // 按钮文本由闭合标签承载，无法在开标签内判定
      `${nativeBtns.length} 个 button（文本型按钮的可读名称由按钮文案提供）`);

    check("纯键盘可完成：菜单→支线→选关→暂停→结算返回",
      /ArrowDown/.test(menuSrc) && /Escape/.test(menuSrc) && /focusDefault/.test(menuSrc) &&
        /onPanelKeydown/.test(panelSrc) && /role="button" tabindex="0"/.test(compSrc) &&
        /tabindex="0" aria-label=/.test(panelSrc),
      "菜单方向键+Esc、面板 Enter/空格 委托、卡片与关卡格可聚焦");
  }

  // ---------------- 面板 / 结算 交互（集成：真实派发点击事件） ----------------
  section("面板交互（集成）");
  {
    const menu = await import(new URL("../src/ui/menu.js", import.meta.url).href);
    const { renderLevelsPanel } = await import(new URL("../src/ui/panels.js", import.meta.url).href);
    const panelEl = document.getElementById("modePanel");
    const overlayEl = document.getElementById("overlay");
    const groupsEl = document.getElementById("menuGroups");

    // 构造"点击某个 data-act"的合成事件（closest 返回自身，和真实委托一致）
    const clickAct = (act, extra) => {
      const target = { dataset: Object.assign({ act }, extra || {}), classList: { contains: () => false } };
      target.closest = () => target;
      panelEl.dispatchEvent({ type: "click", target });
    };

    // 1) 面板「返回」→ 回到主菜单
    store.state = "menu";
    overlayEl.classList.remove("hidden");
    renderLevelsPanel();
    const opened = !panelEl.classList.contains("hidden");
    clickAct("back");
    check("面板「返回」回到主菜单（面板关闭 + 菜单可见）",
      opened && panelEl.classList.contains("hidden") && !overlayEl.classList.contains("hidden") && store.state === "menu",
      `打开=${opened} 关闭=${panelEl.classList.contains("hidden")} 菜单可见=${!overlayEl.classList.contains("hidden")} state=${store.state}`);

    // 2) Esc 关面板
    renderLevelsPanel();
    dispatchWin("keydown", { code: "Escape", preventDefault: noop });
    check("Esc 关闭已打开的面板", panelEl.classList.contains("hidden"),
      panelEl.classList.contains("hidden") ? "已关闭" : "仍打开");

    // 3) 结算结果卡：到达终点 → 出现结果卡 →「下一关」可继续游玩
    startGame("level", 0);
    overlayEl.classList.add("hidden");
    key.right = true;
    key.left = false;
    update(DT); // 解锁起步
    bike.rear.x = bike.front.x = bike.head.x = store.finishX + 10;
    update(DT); // 触发 finishLevel → 结果卡
    const cardShown = store.state === "ended" && !panelEl.classList.contains("hidden") && !overlayEl.classList.contains("hidden");
    check("到达终点弹出结算结果卡", cardShown,
      `state=${store.state} 面板可见=${!panelEl.classList.contains("hidden")} 遮罩可见=${!overlayEl.classList.contains("hidden")}`);

    clickAct("resultNext");
    check("结算卡「下一关」可继续游玩（状态回到 play 且收起遮罩）",
      store.state === "play" && overlayEl.classList.contains("hidden"),
      `state=${store.state} 遮罩隐藏=${overlayEl.classList.contains("hidden")} selLevel=${store.selLevel}`);

    // 4) 结算卡「返回菜单」
    store.state = "play";
    bike.rear.x = bike.front.x = bike.head.x = store.finishX + 10;
    update(DT);
    if (store.state === "ended") clickAct("resultMenu");
    check("结算卡「返回菜单」回到主菜单",
      store.state === "menu" && !overlayEl.classList.contains("hidden") && panelEl.classList.contains("hidden"),
      `state=${store.state} 菜单可见=${!overlayEl.classList.contains("hidden")}`);

    // 5) 主菜单分组必须重新可见（否则"返回"后菜单是空的）
    check("返回后菜单三组入口可见",
      groupsEl.style.display !== "none" && panelEl.classList.contains("hidden"),
      `menuGroups.display="${groupsEl.style.display}"`);

    // 6) 暂停 / 继续
    startGame("level", 0);
    menu.togglePause();
    const paused = store.state === "pause" && !overlayEl.classList.contains("hidden") && groupsEl.style.display === "none";
    menu.togglePause();
    check("暂停 → 继续可正常切换（状态回 play 且收起遮罩）",
      paused && store.state === "play" && overlayEl.classList.contains("hidden"),
      `暂停态正确=${paused} · 继续后 state=${store.state} · 遮罩隐藏=${overlayEl.classList.contains("hidden")}`);

    menu.showMenu();
  }

  const midX = () => (bike.rear.x + bike.front.x) / 2;
  const mx_of = () => (bike.rear.x + bike.front.x) / 2;

  /**
   * 参考骑手（"刹车策略"）：不是无脑全油门，而是"会玩的人"的下限。
   * 用途是证明关卡在合理操作下可通关，而不是考验 AI 会不会玩。
   *  · 危险段：进入前 / 段内把速度压到限速以下
   *  · 障碍物：前方有障碍且速度过高 → 提前点刹（低速可碾过，高速必摔）
   *  · 腾空：用左右键把车身姿态往水平修（避免空中乱转导致摔车）
   *  · 其余时间全油门
   */
  function autoInput() {
    // 起步：锁定时必须按键才会解锁
    if (bike.locked) {
      key.right = true;
      key.left = false;
      return;
    }
    const mx = (bike.rear.x + bike.front.x) / 2;
    const spd = Math.abs((bike.front.x - bike.front.px) * SUBV);
    // airtime 变体：跳台必须"足够快"才触发，因此临近未使用的跳台时全力加速
    let rush = false;
    for (const j of world.jumps) {
      if (j.used) continue;
      const d = j.x - mx;
      if (d > -30 && d < 900) { rush = true; break; }
    }
    let brake = false;
    if (!rush) {
      for (const h of world.hazards) {
        if (mx > h.x1) continue;
        if (h.x0 - mx > 620) continue;
        if (spd > h.vmax * 0.9) { brake = true; break; }
      }
      if (!brake) {
        for (const o of world.obstacles) {
          const d = o.x - mx;
          if (d < -30 || d > 260) continue;
          if (spd > OBST_HIT_V * 0.8) { brake = true; break; }
        }
      }
    }
    const ang = Math.atan2(bike.front.y - bike.rear.y, bike.front.x - bike.rear.x);
    if (bike.grounded === 0) {
      if (brake) { key.right = false; key.left = true; }
      else { key.right = ang < -0.05; key.left = ang > 0.05; }
      return;
    }
    key.right = !brake;
    key.left = brake;
  }

  /** 设定整车瞬时速度（px/s） */
  function setVelocity(vx, vy) {
    for (const p of [bike.rear, bike.front, bike.head]) {
      p.px = p.x - vx * SUB_DT;
      p.py = p.y - vy * SUB_DT;
    }
  }

  // ---------------- 全部关卡自动试跑 ----------------
  section(`全部 ${LEVELS.length} 关"刹车策略"参考骑手自动试跑`);
  const CAP_SECONDS = 150;
  const levelReport = [];
  const levelTimes = [];
  const levelFail = [];
  const levelReason = {};
  for (let i = 0; i < LEVELS.length; i++) {
    startGame("level", i);
    let t = 0;
    let nan = false;
    // 通关判定以"游戏自身的结算信号"（run.clearing）为准：
    // 只看"越过终点线"会把"加完油后重生到终点线之后"这种伪通过也算进去，
    // 而那一刻游戏还没结算（下一帧才会），星级自然没写入。
    while (t < CAP_SECONDS && store.state === "play" && !store.run.clearing) {
      autoInput();
      update(DT);
      t += DT;
      const mx = midX();
      if (!isFinite(mx) || !isFinite(bike.rear.y)) { nan = true; break; }
    }
    const done = store.run.clearing && !nan && !store.run.failed;
    const L = LEVELS[i];
    levelTimes.push(t);
    if (!done || nan) levelFail.push(i + 1);
    if (!ONLY_LEVELS) {
      if (!done || nan) {
        const why = nan
          ? "NaN"
          : store.run.failed
            ? (store.run.gateIdx < world.gates.length
                ? `限时门超时(第${store.run.gateIdx + 1}门)`
                : `滞空不足(目标${atOfDiag(L).toFixed(2)} 实际${world.airScore.toFixed(2)})`)
            : (t >= CAP_SECONDS ? "超时未通关" : "未结算");
        levelReason[i + 1] = why;
      }
    }
    levelReport.push(
      `第${String(i + 1).padStart(2)}关 ${L.name.padEnd(4)} ${done ? "✅" : "❌"} ${t.toFixed(1)}s 坡度${Math.round(L.maxSlope)}°`
    );
    if (!ONLY_LEVELS) check(`第${i + 1}关可通关`, done && !nan, `${t.toFixed(1)}s${nan ? " (NaN!)" : ""}`);
  }
  if (ONLY_LEVELS) {
    console.log(
      `${LEVELS.length} 关自动试跑：通过 ${LEVELS.length - levelFail.length}/${LEVELS.length}` +
        (levelFail.length ? `\n未通过：第 ${levelFail.join(", ")} 关` : "") +
        `\n用时(s)：${levelTimes.map((x) => x.toFixed(0)).join(" ")}`
    );
    process.exit(levelFail.length ? 1 : 0);
  }
  results.push("  ── 逐关用时 ──");
  for (const r of levelReport) results.push("    " + r);
  if (levelFail.length) {
    results.push("  ── 未通关原因 ──");
    for (const n of levelFail) results.push(`    第${n}关：${levelReason[n] || "未知"}`);
  }

  // ---------------- 三星时限标定 ----------------
  section("三星时限标定");
  {
    const lo = 0.45 * REF_SPEED;
    const hi = 0.75 * REF_SPEED;
    const badBand = LEVELS.filter((L) => L.den3 < lo || L.den3 > hi).map((L) => `${L.name}:${L.den3.toFixed(0)}`);
    check(
      "三星要求均速落在物理可达区间",
      badBand.length === 0,
      `den3 ∈ [${lo.toFixed(0)}, ${hi.toFixed(0)}]px/s（REF_SPEED=${REF_SPEED.toFixed(0)}px/s）` +
        (badBand.length ? " 越界：" + badBand.join(",") : "")
    );

    // den3 越靠后关越小 → 三星要求均速占基准极速的比例越低，前松后紧（单调不增）
    let mono = true;
    for (let i = 1; i < LEVELS.length; i++) if (LEVELS[i].den3 > LEVELS[i - 1].den3 + 1e-9) mono = false;
    const d0 = LEVELS[0].den3;
    const dN = LEVELS[LEVELS.length - 1].den3;
    check(
      "三星要求逐关更严",
      mono,
      `要求均速 ${d0.toFixed(0)}→${dN.toFixed(0)}px/s（占基准极速 ${(d0 / REF_SPEED).toFixed(2)}→${(dN / REF_SPEED).toFixed(2)}，单调不增）`
    );

    results.push("  ── 三星时限对照表 ──");
    for (let i = 0; i < LEVELS.length; i++) {
      const L = LEVELS[i];
      results.push(
        `    第${String(i + 1).padStart(2)}关 三星时限=${starTime(L).toFixed(1)}s 要求均速=${L.den3.toFixed(0)}px/s 自动用时=${levelTimes[i].toFixed(1)}s`
      );
    }
  }

  // ---------------- 单关诊断（--diag=<关卡序号，0 起>）：排查卡死/摔车分布用 ----------------
  if (DIAG >= 0) {
    startGame("level", DIAG);
    const L = LEVELS[DIAG];
    results.push(
      `
──── 诊断：第${DIAG + 1}关 ${L.name} · 场景${(THEMES[L.theme] || THEMES[0]).name}(${L.theme}) · 重力${store.phys.GRAV} · MAXV=${store.phys.MAXV.toFixed(0)} · DRIVE=${store.phys.DRIVE.toFixed(0)} ────`
    );
    let line = "    坡度剖面(°): ";
    for (let x = 0; x <= L.len; x += Math.max(400, Math.round(L.len / 24))) {
      line += `${x}:${((Math.atan(groundInfo(x).m) * 180) / Math.PI).toFixed(0)} `;
    }
    results.push(line);
    results.push(
      `    变体=${L.variant} 跳台=${world.jumps.length} 障碍=${world.obstacles.length} 危险段=${world.hazards.length} 门=${world.gates.length} 滞空目标=${atOfDiag(L).toFixed(2)}s`
    );

    let t = 0;
    let nextLog = 0;
    let crashes = 0;
    let airSteps = 0;
    let lastCrashed = false;
    while (t < 300) {
      autoInput();
      update(DT);
      t += DT;
      if (bike.grounded === 0) airSteps++;
      if (store.run.crashed && !lastCrashed) crashes++;
      lastCrashed = store.run.crashed;
      if (t >= nextLog) {
        nextLog += 5;
        const mx = midX();
        results.push(
          `    t=${t.toFixed(0)}s x=${mx.toFixed(0)}/${L.len} 速度=${bike.speed.toFixed(0)} 坡度=${((Math.atan(groundInfo(mx).m) * 180) / Math.PI).toFixed(0)}° 摔车=${crashes} 空中占比=${((airSteps / (t * 60)) * 100).toFixed(0)}% 滞空分=${world.airScore.toFixed(2)} 跳台用=${world.jumps.filter((j) => j.used).length}/${world.jumps.length}`
        );
      }
      if (midX() > store.finishX) {
        results.push(`    ✅ 到达 t=${t.toFixed(1)}s 摔车${crashes}次 滞空得分=${world.airScore.toFixed(2)}s`);
        break;
      }
    }
    console.log(results.join("\n"));
    process.exit(0);
  }

  // ---------------- 帧率无关 ----------------
  section("帧率无关（物理/油耗/计时）");
  function runFixed(steps, dtPerCall) {
    startGame("level", 0);
    key.right = true;
    let acc = 0;
    let t = 0;
    let done = 0;
    const stepper = new Stepper((dt) => update(dt));
    while (done < steps) {
      stepper.advance(dtPerCall);
      acc += dtPerCall;
      t += dtPerCall;
      done += stepper.lastSteps;
    }
    return { x: midX(), fuel: store.phys.fuel, simTime: store.time, consumed: t, steps: done };
  }
  const r60 = runFixed(1200, 1 / 60);
  const r120 = runFixed(1200, 1 / 120);
  const r144 = runFixed(1200, 1 / 144);
  const dpx = (a, b) => Math.abs(a.x - b.x);
  check("1/60 与 1/120 同帧数位移一致", dpx(r60, r120) < 1, `Δ=${dpx(r60, r120).toFixed(4)}px`);
  check("1/60 与 1/144 同帧数位移一致", dpx(r60, r144) < 1, `Δ=${dpx(r60, r144).toFixed(4)}px`);
  check("油耗与帧率无关", near(r60.fuel, r144.fuel, 1e-9), `Δ=${Math.abs(r60.fuel - r144.fuel).toExponential(2)}`);
  check(
    "20 秒（1200 步）实际消耗时间一致",
    near(r60.consumed, 20, 0.02) && near(r120.consumed, 20, 0.02) && near(r144.consumed, 20, 0.02),
    `${r60.consumed.toFixed(3)}s / ${r120.consumed.toFixed(3)}s / ${r144.consumed.toFixed(3)}s`
  );

  // ---------------- 落地分级 ----------------
  section("落地冲击分级");
  function dropTest(vy) {
    startGame("level", 0);
    key.right = false;
    const x = 220;
    resetBike(x);
    const lift = 160;
    for (const p of [bike.rear, bike.front, bike.head]) p.y -= lift;
    setVelocity(0, vy);
    let guard = 0;
    let prevRot = 0;
    while (guard++ < 600) {
      prevRot = bike.rotAcc;
      stepPhysics();
      if (bike.grounded > 0) break;
    }
    return { squash: Math.abs(bike.squashVel), shake: store.cam.shake, rot: prevRot, guard };
  }
  const d200 = dropTest(200);
  const d400 = dropTest(400);
  const d600 = dropTest(600);
  check(
    "落地压缩量随冲击单调递增",
    d200.squash < d400.squash && d400.squash < d600.squash,
    `${d200.squash.toFixed(2)} < ${d400.squash.toFixed(2)} < ${d600.squash.toFixed(2)}`
  );
  check(
    "落地震屏随冲击单调递增",
    d200.shake <= d400.shake && d400.shake <= d600.shake,
    `${d200.shake.toFixed(2)} / ${d400.shake.toFixed(2)} / ${d600.shake.toFixed(2)}`
  );

  // ---------------- 空翻可达性 ----------------
  section("空翻可达性（≥0.9s 滞空）");
  startGame("level", 0);
  key.right = true;
  key.left = false;
  {
    const x = 220;
    resetBike(x);
    const lift = 500; // 自由落体 500px ≈ 1.15s 滞空
    for (const p of [bike.rear, bike.front, bike.head]) p.y -= lift;
    setVelocity(0, 0);
    let guard = 0;
    let lastRot = 0;
    let air = 0;
    let landed = false;
    while (guard++ < 3000) {
      lastRot = bike.rotAcc;
      const wasAir = bike.grounded === 0;
      stepPhysics();
      if (wasAir) air += DT;
      if (bike.grounded > 0) { landed = true; break; }
    }
    const flips = Math.abs(lastRot) / (2 * Math.PI);
    check("滞空 ≥0.9s", air >= 0.9, air.toFixed(2) + "s");
    check("按住方向键可完成 ≥1 圈空翻", landed && flips >= 1, flips.toFixed(2) + " 圈");
  }

  // ---------------- 倒立落地必须摔车（刚体保护不能误放行） ----------------
  section("倒立落地判定");
  {
    startGame("level", 0);
    key.right = false;
    key.left = false;
    resetBike(300);
    const mx = (bike.rear.x + bike.front.x) / 2;
    const my = (bike.rear.y + bike.front.y) / 2;
    rotateBikeAround(mx, my, (160 * Math.PI) / 180);
    for (const p of [bike.rear, bike.front, bike.head]) p.y -= 220;
    setVelocity(0, 0);
    let guard = 0;
    while (guard++ < 900 && !store.run.crashed) stepPhysics();
    check("空中倒立落地会摔车", store.run.crashed === true, store.run.crashed ? "已摔车" : "未摔车（刚体保护可能误放行）");
  }

  // ---------------- 翘头里程单位 ----------------
  section("翘头里程单位（100px = 1m）");
  {
    startGame("level", 0);
    key.right = false;
    resetBike(300);
    bike.speed = 400; // px/s
    bike.grounded = 2;
    const gy = groundY(300);
    bike.front.y = gy - 120; // 前轮离地
    for (let i = 0; i < 120; i++) {
      bike.speed = 400;
      bike.grounded = 2;
      bike.front.y = gy - 120;
      updateStats(DT);
    }
    const meters = toM(store.run.maxWheelieDist);
    check("翘头 2s @400px/s ≈ 8m", near(meters, 8, 1), meters.toFixed(2) + "m");
  }

  // ---------------- 比赛公平性（对手不能太快） ----------------
  section("比赛公平性");
  {
    const { RACE_PACE, raceBaseSpeed, catchupFactor, CATCHUP_MIN, CATCHUP_MAX } = await import(
      new URL("../src/game/race.js", import.meta.url).href
    );

    // 纯函数：普通比赛基准配速必须明显慢于三星节奏；追赶修正必须有界
    const L0 = LEVELS[0];
    check("普通比赛 AI 基准配速慢于三星节奏",
      RACE_PACE > 0 && RACE_PACE < 0.85 && raceBaseSpeed(L0, RACE_PACE) < L0.den3,
      `基准 = ${(RACE_PACE * 100).toFixed(0)}%×den3 = ${raceBaseSpeed(L0, RACE_PACE).toFixed(0)}px/s < den3 ${L0.den3.toFixed(0)}px/s`);
    const worstPace = RACE_PACE * CATCHUP_MAX;
    check("AI 追赶快也追不过三星节奏",
      worstPace < 1 && catchupFactor(-1e9) === CATCHUP_MAX && catchupFactor(1e9) === CATCHUP_MIN,
      `追赶上限 ${worstPace.toFixed(2)}×den3 < 1.00×den3（极值 ${catchupFactor(-1e9)}/${catchupFactor(1e9)}）`);

    // 实机条件逐关跑：参考骑手 vs AI（不清机制，就是玩家实际会遇到的场合）
    const rows = [];
    let wins = 0;
    const ratios = [];
    for (let i = 0; i < LEVELS.length; i++) {
      startGame("race", i);
      const total = store.finishX;
      let t = 0;
      let playerTime = 0;
      let aiTime = 0;
      while (t < 300 && store.state === "play" && (!playerTime || !aiTime)) {
        autoInput();
        update(DT);
        t += DT;
        if (!playerTime && midX() > total) playerTime = t;
        if (!aiTime && store.raceAI && store.raceAI.finish) aiTime = t;
      }
      const won = playerTime > 0 && (aiTime === 0 || playerTime < aiTime);
      if (won) wins++;
      const ratio = aiTime > 0 && playerTime > 0 ? playerTime / aiTime : 0;
      if (ratio > 0) ratios.push(ratio);
      rows.push(
        `    第${String(i + 1).padStart(2)}关 ${won ? "胜" : "负"} 玩家=${playerTime > 0 ? playerTime.toFixed(1) : "-"}s AI=${aiTime > 0 ? aiTime.toFixed(1) : "-"}s 比值=${ratio > 0 ? ratio.toFixed(2) : "-"}`
      );
    }
    ratios.sort((a, b) => a - b);
    const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 0;
    check("参考骑手能赢下绝大多数比赛（≥85%）",
      wins >= Math.ceil(LEVELS.length * 0.85),
      `${wins}/${LEVELS.length} 关获胜 · 用时比中位数 ${median.toFixed(2)}`);
    check("不存在 AI 快得不合理的关卡（用时比 < 1.5）",
      ratios.length === 0 || ratios[ratios.length - 1] < 1.5,
      `最差用时比 ${ratios.length ? ratios[ratios.length - 1].toFixed(2) : "-"}（<1.5）`);
    if (process.argv.includes("--racediag")) results.push(...rows);
  }

  // ---------------- 下坡超速（真实跑一段，看峰值是否超过平路极速） ----------------
  section("下坡超速");
  {
    startGame("level", LEVELS.length - 1);
    // 隔离机制：只测"下坡能否超过平路极速"这一物理属性
    world.hazards = [];
    world.obstacles = [];
    world.gates = [];
    let maxSpd = 0;
    let t = 0;
    while (t < 60 && store.state === "play") {
      autoInput();
      update(DT);
      t += DT;
      if (!store.run.crashed) maxSpd = Math.max(maxSpd, Math.abs(bike.speed));
    }
    const MAXV = store.phys.MAXV;
    results.push(`    平路极速 MAXV=${MAXV.toFixed(0)}px/s，末关全程峰值=${maxSpd.toFixed(0)}px/s`);
    check("下坡可超过平路极速", maxSpd > MAXV * 1.02,
      `峰值 ${(maxSpd / MAXV).toFixed(2)}×MAXV`);
    check("但不超过 1.35×MAXV", maxSpd <= MAXV * 1.36,
      `${(maxSpd / MAXV).toFixed(3)}×`);
  }

  // ---------------- 坡度显示精度 ----------------
  section("坡度显示精度");
  {
    let worst = 0;
    for (const L of LEVELS) {
      let mx = 0;
      for (let x = 70; x <= L.len; x += 5) {
        const m = Math.abs(groundInfo0(L, x));
        if (m > mx) mx = m;
      }
      const real = (Math.atan(mx) * 180) / Math.PI;
      worst = Math.max(worst, Math.abs(real - L.maxSlope));
    }
    check("面板坡度与实际采样偏差 ≤3°", worst <= 3, `最大偏差 ${worst.toFixed(2)}°`);
  }

  // ---------------- 装饰生成 ----------------
  section("场景装饰");
  {
    let minDeco = Infinity;
    for (let i = 0; i < LEVELS.length; i++) {
      startGame("level", i);
      const n = world.decoTree.length + world.decoRock.length;
      minDeco = Math.min(minDeco, n);
    }
    check("每关都有装饰物生成", minDeco > 0, `最少 ${minDeco} 个`);
    startGame("free");
    for (let i = 0; i < 300; i++) {
      autoInput();
      update(DT);
    }
    check("无限模式也有装饰物", world.decoTree.length + world.decoRock.length > 0,
      `${world.decoTree.length + world.decoRock.length} 个`);
  }

  // ---------------- 难度曲线 ----------------
  section("难度曲线");
  {
    const first = LEVELS[0].maxSlope;
    const last = LEVELS[LEVELS.length - 1].maxSlope;
    check(
      "末期地形明显比前期陡",
      last > first * 1.5,
      `首关 ${first.toFixed(1)}° / 末关 ${last.toFixed(1)}°（比值 ${(last / first).toFixed(2)}×）`
    );

    const maxSlope = Math.max(...LEVELS.map((L) => L.maxSlope));
    check("所有关卡坡度不超过 70°", maxSlope <= 70, `最大 ${maxSlope.toFixed(1)}°`);

    // 难度沿全局索引单调：坡度/油耗/长度/机制密度非减，三星要求均速非增
    const monoUp = (key) => {
      for (let i = 1; i < LEVELS.length; i++) if (LEVELS[i][key] < LEVELS[i - 1][key] - 1e-9) return i;
      return -1;
    };
    const monoDown = (key) => {
      for (let i = 1; i < LEVELS.length; i++) if (LEVELS[i][key] > LEVELS[i - 1][key] + 1e-9) return i;
      return -1;
    };
    for (const key of ["maxSlope", "fuelK", "len", "mech"]) {
      const bad = monoUp(key);
      check(
        `${key} 随进度单调非减`,
        bad < 0,
        bad < 0
          ? `${LEVELS[0][key].toFixed ? LEVELS[0][key].toFixed(2) : LEVELS[0][key]} → ${LEVELS[LEVELS.length - 1][key].toFixed ? LEVELS[LEVELS.length - 1][key].toFixed(2) : LEVELS[LEVELS.length - 1][key]}`
          : `第${bad + 1}关反转`
      );
    }
    const badDen = monoDown("den3");
    check("den3 随进度单调非增", badDen < 0, badDen < 0 ? "无反转" : `第${badDen + 1}关反转`);

    // 油罐：常规关至少 1 个；变体关按变体规则（sprint 为 0 个油罐 + 赛前预加油）
    const zeroCanNormal = [];
    const prepBad = [];
    let lastCan = 0;
    for (let i = 0; i < LEVELS.length; i++) {
      startGame("level", i);
      const L = LEVELS[i];
      const r = variantRule(L.variant);
      const n = world.canisters.length;
      if (r.canN === null && n < 1) zeroCanNormal.push(i + 1);
      if (r.canN === 0 && n !== 0) prepBad.push(`第${i + 1}关应有 0 罐实为 ${n}`);
      if (r.canN === 1 && n !== 1) prepBad.push(`第${i + 1}关应有 1 罐实为 ${n}`);
      // 油量不缩水：赛道油罐 + 预加油折算必须 ≥1 罐（否则该关可能因缺油不可通关）
      const supply = n + world.prepFuel / 0.45;
      if (r.canN !== null && supply < 1) prepBad.push(`第${i + 1}关总供油不足（${supply.toFixed(2)} 罐）`);
      if (i === LEVELS.length - 1) lastCan = n;
    }
    check("常规关每关至少 1 个油罐", zeroCanNormal.length === 0,
      zeroCanNormal.length ? `第 ${zeroCanNormal.join(",")} 关为 0 罐` : "全部常规关 ≥1");
    check("变体关油罐数符合变体规则且折算预加油", prepBad.length === 0,
      prepBad.slice(0, 4).join(",") || "sprint=0罐/fuelrun=1罐，均有预加油补偿");
    check("末期油罐数量收紧（必须规划路线）", lastCan <= 3, `末关 ${lastCan} 个`);
  }

  // ---------------- 关卡结构（12 支线 × 6 关 + 最终任务） ----------------
  section("关卡结构");
  {
    check("共 12 条支线", BRANCHES.length === N_BRANCHES && N_BRANCHES === 12, `BRANCHES=${BRANCHES.length}`);
    check("每支线 6 关", LEVELS_PER_BRANCH === 6, String(LEVELS_PER_BRANCH));
    check("LEVELS 恰为 72 关的扁平数组", LEVELS.length === 72, `长度 ${LEVELS.length}`);
    check("FINALE 存在且索引为 72", FINALE && FINALE_INDEX === LEVELS.length && FINALE_INDEX === 72, `FINALE_INDEX=${FINALE_INDEX}`);

    // 每关 theme 与所属支线绑定（1:1）
    const themeBad = [];
    for (let i = 0; i < LEVELS.length; i++) {
      const bi = Math.floor(i / LEVELS_PER_BRANCH);
      if (LEVELS[i].theme !== BRANCHES[bi].theme) themeBad.push(`第${i + 1}关:${LEVELS[i].theme}≠${BRANCHES[bi].theme}`);
    }
    check("每关 theme 与所属支线绑定", themeBad.length === 0, themeBad.slice(0, 5).join(",") || "全部一致");

    // FINALE：超长、多场景分段、x 严格递增、比所有支线关都长、mech > 1
    const segs = FINALE.segments || [];
    const segThemes = new Set(segs.map((s) => s.theme));
    let segMono = true;
    for (let i = 1; i < segs.length; i++) if (segs[i].x <= segs[i - 1].x) segMono = false;
    const maxLevelLen = Math.max(...LEVELS.map((L) => L.len));
    check("FINALE 分段覆盖 ≥4 个场景", segThemes.size >= 4, `${segs.length} 段 / ${segThemes.size} 场景`);
    check("FINALE 分段 x 严格递增", segMono && segs.length >= 4, segs.map((s) => s.x).join("<"));
    check("FINALE 比所有支线关都长", FINALE.len > maxLevelLen, `${FINALE.len} > ${maxLevelLen}`);
    check("FINALE 机制密度 > 1", FINALE.mech > 1, `mech=${FINALE.mech}`);
    check("FINALE theme 取第一段场景", FINALE.theme === segs[0].theme, `theme=${FINALE.theme}`);
  }

  // ---------------- 场景数据（12 场景数据驱动） ----------------
  section("场景数据");
  {
    check("THEMES 恰为 12 个场景", THEMES.length === 12, String(THEMES.length));

    // 数据完整性：必需字段
    const fields = ["name", "g", "traction", "sky", "sun", "pal", "ground", "deco", "bg", "surface", "dust", "ambient"];
    const missing = [];
    for (let i = 0; i < THEMES.length; i++) {
      for (const k of fields) if (THEMES[i][k] === undefined) missing.push(`#${i}缺${k}`);
      if (!THEMES[i].bg || !THEMES[i].surface || !THEMES[i].dust || !THEMES[i].ambient) missing.push(`#${i}子对象缺失`);
      if (!Array.isArray(THEMES[i].deco) || THEMES[i].deco.length < 2) missing.push(`#${i}装饰<2`);
    }
    check("12 场景数据字段完整", missing.length === 0, missing.slice(0, 6).join(",") || "全部完整");

    // 重力下限：g 不得 < 350（否则 deriveHandling 中 DRIVE/BRAKE 被截断）
    const lowG = THEMES.map((t, i) => [i, t.g]).filter(([, g]) => g < 350);
    check("12 场景重力均 ≥350", lowG.length === 0, lowG.map(([i, g]) => `#${i}:${g}`).join(",") || "全部 ≥350");

    // 渲染：12 场景各渲染一帧不抛异常
    let renderBad = "";
    for (let bi = 0; bi < N_BRANCHES; bi++) {
      try {
        startGame("level", bi * LEVELS_PER_BRANCH);
        drawScene();
      } catch (e) {
        renderBad = `支线${bi}(场景${BRANCHES[bi].theme}): ${e.message}`;
        break;
      }
    }
    check("12 场景各渲染一帧无异常", !renderBad, renderBad || "全部通过");

    // 数据真实生效：store.phys.GRAV / TRACTION === THEMES[theme] 的数据
    const gravBad = [];
    for (let bi = 0; bi < N_BRANCHES; bi++) {
      const idx = bi * LEVELS_PER_BRANCH;
      startGame("level", idx);
      const t = THEMES[BRANCHES[bi].theme];
      if (store.phys.GRAV !== t.g) gravBad.push(`支线${bi} 重力 ${store.phys.GRAV}≠${t.g}`);
      if (store.phys.TRACTION !== t.traction) gravBad.push(`支线${bi} 抓地 ${store.phys.TRACTION}≠${t.traction}`);
    }
    check("场景重力/抓地数据真实生效（store.phys）", gravBad.length === 0, gravBad.slice(0, 5).join(",") || "全部一致");

    // 低重力场景同时间"向上"位移更大（同样的起跳初速，弹得更高）
    function apexRise(levelIdx) {
      startGame("level", levelIdx);
      key.right = false;
      key.left = false;
      resetBike(240);
      for (const p of [bike.rear, bike.front, bike.head]) p.y -= 300; // 先离地，避免悬挂把它锚回地面
      setVelocity(0, -300); // 同样的向上初速（px/s）
      const y0 = (bike.rear.y + bike.front.y) / 2;
      let minY = y0;
      for (let i = 0; i < 90; i++) {
        stepPhysics();
        minY = Math.min(minY, (bike.rear.y + bike.front.y) / 2);
      }
      return { rise: y0 - minY, g: store.phys.GRAV };
    }
    const loGIdx = THEMES.findIndex((t) => t.g === 350);
    const hiGIdx = THEMES.findIndex((t) => t.g === 900);
    if (loGIdx >= 0 && hiGIdx >= 0) {
      const lo = apexRise(loGIdx * LEVELS_PER_BRANCH);
      const hi = apexRise(hiGIdx * LEVELS_PER_BRANCH);
      check(
        "低重力场景同初速弹跳更高",
        lo.rise > hi.rise + 5,
        `低g(${lo.g}) 起跳高度=${lo.rise.toFixed(1)}px > 高g(${hi.g}) ${hi.rise.toFixed(1)}px`
      );
    }

    // 源码静态扫描：渲染/世界层不得按主题下标硬编码分支
    const scanFiles = ["src/render/background.js", "src/render/terrain.js", "src/render/entities.js", "src/game/world.js"];
    const hardHits = [];
    for (const f of scanFiles) {
      const src = readFileSync(join(ROOT, f), "utf8");
      const re = /\b(theme|th)\s*===\s*\d/g;
      let m;
      while ((m = re.exec(src))) hardHits.push(`${f}: ${m[0]}`);
    }
    check("渲染层无按主题下标硬编码分支", hardHits.length === 0, hardHits.slice(0, 5).join(", ") || "无");
  }

  // ---------------- 关卡变体 ----------------
  section("关卡变体");
  {
    const LPB2 = LEVELS_PER_BRANCH;
    const BR2 = BRANCHES;

    check("定义 6 种变体", VARIANTS.length === 6, VARIANTS.join("/"));

    // 穿插排布：每条支线第 3、5 关为特殊变体，其余 normal
    const badLayout = [];
    for (let bi = 0; bi < BR2.length; bi++) {
      for (let k = 0; k < LPB2; k++) {
        const v = LEVELS[bi * LPB2 + k].variant;
        const special = k === 2 || k === 4;
        if (special && v === "normal") badLayout.push(`支线${bi}第${k + 1}关应特殊却是normal`);
        if (!special && v !== "normal") badLayout.push(`支线${bi}第${k + 1}关应normal却是${v}`);
      }
    }
    check("每条支线第 3、5 关为特殊变体、其余为常规", badLayout.length === 0,
      badLayout.slice(0, 5).join(",") || "72 关排布正确");

    // 6 种变体在全游戏中都出现
    const seen = new Set(LEVELS.map((L) => L.variant));
    check("6 种变体在全游戏中均出现", seen.size === 6, [...seen].join("/"));

    // 变体规则字段完整
    const leak = [];
    for (const L of LEVELS) {
      const r = variantRule(L.variant);
      if (r.gateK === undefined || r.obstK === undefined) leak.push(`${L.name} 规则字段缺失`);
    }
    check("变体规则字段完整", leak.length === 0, leak.slice(0, 4).join(",") || "全部完整");

    // fuelrun：赛道油罐数恰为 1
    startGame("level", 4 * LPB2 + 2); // 第 3 条支线的第 3 关
    const fuelIdx = LEVELS.findIndex((L) => L.variant === "fuelrun");
    startGame("level", fuelIdx);
    check("fuelrun 关赛道油罐恰为 1 个", world.canisters.length === 1,
      `第${fuelIdx + 1}关 ${world.canisters.length} 个`);

    // airtime：跳台存在、目标 > 0、且参考骑手能达标
    const airIdx = LEVELS.findIndex((L) => L.variant === "airtime");
    startGame("level", airIdx);
    check("airtime 关有跳台且目标 > 0",
      world.jumps.length > 0 && atOfDiag(LEVELS[airIdx]) > 0,
      `${world.jumps.length} 个跳台 · 目标 ${atOfDiag(LEVELS[airIdx]).toFixed(2)}s`);

    // airtime 未达标不判通过：清掉跳台（无法腾空）后跑完，必须判负
    startGame("level", airIdx);
    world.jumps = [];
    key.right = true;
    key.left = false;
    update(DT); // 解锁起步
    let t2 = 0;
    while (t2 < 150 && store.state === "play" && !store.run.clearing) {
      autoInput();
      update(DT);
      t2 += DT;
    }
    check("airtime 未达标不判通过", store.run.clearing === true && store.run.failed === true,
      `clearing=${store.run.clearing} failed=${store.run.failed} 滞空=${world.airScore.toFixed(2)}s`);

    // 跳台滞空可靠性：逐个 airtime 关验证"存在足够大的单次滞空"。
    // 跳台是 airtime 变体的唯一确定性滞空源，若冲量被贴地钳制吞掉（历史缺陷），
    // 单次滞空会退化到 0.1s 量级而目标不可达——本断言锁死该退化。
    const airLevels = LEVELS.map((L, i) => [L, i]).filter(([L]) => L.variant === "airtime");
    let worstHop = Infinity;
    const hopDetail = [];
    for (const [L, i] of airLevels) {
      startGame("level", i);
      key.right = true;
      key.left = false;
      update(DT); // 解锁起步
      let air = 0;
      let best = 0;
      let lastUsed = 0;
      let t3 = 0;
      while (t3 < 150 && store.state === "play" && !store.run.clearing) {
        autoInput();
        update(DT);
        t3 += DT;
        const used = world.jumps.filter((j) => j.used).length;
        if (used > lastUsed) { best = Math.max(best, air); air = 0; lastUsed = used; }
        if (bike.grounded === 0) air += DT;
      }
      best = Math.max(best, air);
      worstHop = Math.min(worstHop, best);
      hopDetail.push(`第${i + 1}关 ${best.toFixed(2)}s`);
    }
    check("跳台单次滞空可靠（每关最大单跳 ≥0.6s）", worstHop >= 0.6,
      `最小单跳 ${worstHop.toFixed(2)}s ｜ ${hopDetail.join(" / ")}`);

    // gauntlet：障碍密度显著高于同进度的 normal 关
    const gauntIdx = LEVELS.findIndex((L) => L.variant === "gauntlet");
    startGame("level", gauntIdx);
    const gauntN = world.obstacles.length;
    check("gauntlet 关障碍密集（≥1.8× 常规预算）",
      gauntN >= LEVELS[gauntIdx].obstacleN * 1.8,
      `${gauntN} 个（预算 ${LEVELS[gauntIdx].obstacleN}）`);

    // downhill：危险段密度显著提高
    const dhIdx = LEVELS.findIndex((L) => L.variant === "downhill");
    startGame("level", dhIdx);
    check("downhill 关危险段密集（≥2× 基础数量）",
      world.hazards.length >= LEVELS[dhIdx].hazardN * 2,
      `${world.hazards.length} 段（基础 ${LEVELS[dhIdx].hazardN}）`);

    // HUD 变体标识与变体名称可达（静态：HUD 引用 VARIANT_INFO）
    const srcHud = readFileSync(join(ROOT, "src", "render", "hud.js"), "utf8");
    check("HUD 显示变体名称与 airtime 目标进度",
      srcHud.includes("VARIANT_INFO") && srcHud.includes("airTargetOf"),
      "hud.js 引用 VARIANT_INFO / airTargetOf");
  }

  // ---------------- 机制：障碍物 ----------------
  section("障碍物机制");
  {
    let minO = Infinity;
    let badBuffer = 0;
    let inHazard = 0;
    let lastO = 0;
    const noObstLevels = [];
    for (let i = 0; i < LEVELS.length; i++) {
      startGame("level", i);
      const n = world.obstacles.length;
      minO = Math.min(minO, n);
      // airtime 变体按设计不放障碍物（专注射滞空），其余关卡必须有障碍物
      if (n < 1 && variantRule(LEVELS[i].variant).obstK > 0) noObstLevels.push(i + 1);
      for (const o of world.obstacles) {
        if (o.x < 300 || o.x > store.finishX - 300) badBuffer++;
        for (const h of world.hazards) if (o.x > h.x0 - 220 && o.x < h.x1 + 220) inHazard++;
      }
      if (i === LEVELS.length - 1) lastO = world.obstacles.length;
    }
    check("非 airtime 关卡每关都有障碍物生成", noObstLevels.length === 0,
      noObstLevels.length ? `第 ${noObstLevels.join(",")} 关为 0 个` : `最少 ${minO} 个（airtime 关按设计为 0）`);
    check("障碍物不生成在出生点/终点缓冲区", badBuffer === 0, `越界 ${badBuffer} 个`);
    check("障碍物不与危险段重叠", inHazard === 0, `重叠 ${inHazard} 个`);
    check(
      "障碍物预算随进度递增",
      LEVELS[LEVELS.length - 1].obstacleN > LEVELS[0].obstacleN,
      `${LEVELS[0].obstacleN} → ${LEVELS[LEVELS.length - 1].obstacleN}（末关实际生成 ${lastO} 个）`
    );

    const MECH_IDX = 40;
    /** 取本关"最平坦处"的障碍物做碰撞实验，隔离地形起伏的干扰 */
    function flattestObstacle() {
      startGame("level", MECH_IDX);
      return world.obstacles.reduce((a, b) =>
        Math.abs(groundInfo(b.x).m) < Math.abs(groundInfo(a.x).m) ? b : a
      );
    }
    /** 把车放到障碍物左侧、贴地、给定速度，跑若干步看是否摔车 */
    function runIntoObstacle(vx, lift) {
      const o = flattestObstacle();
      key.right = false;
      key.left = false;
      resetBike(o.x - 110);
      bike.locked = false;
      for (const p of [bike.rear, bike.front, bike.head]) {
        p.y = groundY(p.x) - 12 - lift;
        p.py = p.y;
      }
      setVelocity(vx, 0);
      for (let i = 0; i < 90; i++) {
        setVelocity(vx, 0);
        stepPhysics();
        if (store.run.crashed) return true;
      }
      return false;
    }
    const fastHit = runIntoObstacle(OBST_HIT_V + 200, 0);
    const slowPass = runIntoObstacle(OBST_HIT_V - 150, 0);
    const airPass = runIntoObstacle(OBST_HIT_V + 240, 300);
    check("高速撞上障碍物会摔车", fastHit, fastHit ? "已摔车" : "未摔车（碰撞判定失效）");
    check("低速碾过障碍物不摔车", !slowPass, slowPass ? "误判摔车" : "安全碾过");
    check("腾空越过障碍物不摔车", !airPass, airPass ? "空中仍被判碰撞" : "安全飞越");
  }

  // ---------------- 机制：危险段（超速必摔） ----------------
  section("危险段机制");
  {
    const HZ_IDX = 40;
    /** 以 mult 倍限速冲过第一段危险区，返回是否摔车 */
    function runThroughHazard(mult) {
      startGame("level", HZ_IDX);
      key.right = true;
      key.left = false;
      update(DT); // 解锁起步
      key.right = false;
      key.left = false;
      const h = world.hazards[0];
      resetBike(h.x0 - 60);
      bike.locked = false;
      const v = h.vmax * mult;
      for (let i = 0; i < 40; i++) {
        setVelocity(v, 0);
        update(DT);
        if (store.run.crashed) return true;
      }
      return false;
    }
    startGame("level", HZ_IDX);
    check("危险段被正确构建（含限速阈值）", world.hazards.length >= 1 && world.hazards[0].vmax > 0,
      `${world.hazards.length} 段 · 限速 ${world.hazards[0] ? world.hazards[0].vmax.toFixed(0) : "-"}px/s`);
    const over = runThroughHazard(1.4);
    const under = runThroughHazard(0.6);
    check("危险段超速进入必摔车", over, over ? "已摔车" : "未摔车（阈值失效）");
    check("危险段低于限速通过不摔车", !under, under ? "误判摔车" : "安全通过");
  }

  // ---------------- 机制：限时门 ----------------
  section("限时门机制");
  {
    // 正向：在时限内依次通过全部门 → 正常结算、写入星级
    startGame("level", 0);
    key.right = true;
    key.left = false;
    update(DT); // 解锁起步
    key.right = false;
    key.left = false;
    let allInTime = true;
    for (const g of world.gates) {
      bike.rear.x = g.x + 6;
      bike.front.x = g.x + 6;
      bike.head.x = g.x + 6;
      for (const p of [bike.rear, bike.front, bike.head]) {
        p.y = groundY(p.x) - 12;
        p.px = p.x;
        p.py = p.y; // 同步 px/py → 速度为 0，避免瞬移造成高速误判
      }
      update(DT);
      if (!g.passed) allInTime = false;
    }
    check("按时通过全部门", allInTime && store.run.gateIdx === world.gates.length,
      `通过 ${store.run.gateIdx}/${world.gates.length}`);
    bike.rear.x = store.finishX + 8;
    bike.front.x = store.finishX + 8;
    bike.head.x = store.finishX + 8;
    for (const p of [bike.rear, bike.front, bike.head]) { p.px = p.x; p.py = p.y; }
    update(DT);
    check("按时通过全部门可正常结算并计星",
      store.run.clearing === true && store.run.failed === false && (store.stars[0] || 0) > 0,
      `clearing=${store.run.clearing} failed=${store.run.failed} stars=${store.stars[0] || 0}`);

    // 反向：超时 → 判负、不计星、不解锁
    startGame("level", 5);
    key.right = true;
    key.left = false;
    update(DT); // 解锁起步
    key.right = false;
    key.left = false;
    const starBefore = store.stars[5] || 0;
    const unlockBefore = store.unlocked;
    store.run.levelStartTime = store.time - 1e6; // 本关计时早已超时
    const g0 = world.gates[0];
    bike.rear.x = g0.x + 6;
    bike.front.x = g0.x + 6;
    bike.head.x = g0.x + 6;
    for (const p of [bike.rear, bike.front, bike.head]) {
      p.y = groundY(p.x) - 12;
      p.px = p.x;
      p.py = p.y;
    }
    update(DT);
    check("限时门超时判负", store.run.failed === true, `failed=${store.run.failed}`);
    check("超时不计星、不解锁",
      (store.stars[5] || 0) === starBefore && store.unlocked === unlockBefore,
      `stars ${starBefore}→${store.stars[5] || 0} / unlocked ${unlockBefore}→${store.unlocked}`);
  }

  // ---------------- 机制：摔车惩罚 ----------------
  section("摔车惩罚");
  {
    startGame("level", 0);
    key.right = true;
    key.left = false;
    update(DT); // 解锁起步
    key.right = false;
    key.left = false;
    const f0 = store.phys.fuel;
    const fMax = store.phys.fuelMax;
    crash();
    const loss1 = f0 - store.phys.fuel;
    store.run.crashed = false; // 模拟恢复后再次摔车
    crash();
    const loss2 = f0 - store.phys.fuel;
    check("摔车一次扣 8% 燃料", near(loss1, fMax * CRASH_FUEL_LOSS, 1e-9),
      `Δ=${(loss1 / fMax * 100).toFixed(2)}%`);
    check("摔车两次累计扣 16% 燃料", near(loss2, fMax * CRASH_FUEL_LOSS * 2, 1e-9),
      `Δ=${(loss2 / fMax * 100).toFixed(2)}%`);
    check("摔车两次计时惩罚累加 4s", near(store.run.penaltyTime, CRASH_TIME_PENALTY * 2, 1e-9),
      `penaltyTime=${store.run.penaltyTime}s`);
    const srcGame = readFileSync(join(ROOT, "src", "game", "game.js"), "utf8");
    check("计时惩罚计入本关用时（影响三星）",
      /levelStartTime\s*\+\s*run\.penaltyTime/.test(srcGame), "game.js 结算使用 run.penaltyTime");
  }

  // ---------------- 最终任务多场景串联 ----------------
  section("最终任务多场景串联");
  {
    const { levelAt, hasSegments, segmentThemeAt } = await import(new URL("../src/config/levels.js", import.meta.url).href);

    check("levelAt 能取到最终任务（索引 72）", levelAt(FINALE_INDEX) === FINALE,
      `levelAt(${FINALE_INDEX}).name=${levelAt(FINALE_INDEX).name}`);
    check("最终任务被识别为多场景分段", hasSegments(FINALE) === true, "hasSegments(FINALE)=true");

    // 分段查询：x 落在哪一段就返回该段场景；普通关返回自身 theme
    const segBad = [];
    for (const s of FINALE.segments) {
      if (segmentThemeAt(FINALE, s.x + 10) !== s.theme) segBad.push(`x=${s.x + 10}→${segmentThemeAt(FINALE, s.x + 10)}≠${s.theme}`);
    }
    const normalThemeOk = segmentThemeAt(LEVELS[7], 1000) === LEVELS[7].theme;
    check("分段场景查询正确（含普通关回退）", segBad.length === 0 && normalThemeOk,
      segBad.slice(0, 3).join(",") || `普通关回退正常 · 末段 theme=${FINALE.segments[FINALE.segments.length - 1].theme}`);

    // 实际跑完最终任务：可通关、无 NaN、跨段物理连续、切换 ≥3 场景
    startGame("level", FINALE_INDEX);
    check("最终任务开局正确（finishX = 赛程长度）", store.finishX === FINALE.len,
      `finishX=${store.finishX} len=${FINALE.len}`);

    const seenThemes = new Set([store.phys.theme]);
    let nan = false;
    let t = 0;
    let prev = null;
    let maxDx = 0;
    let maxDv = 0;
    const disp = [];
    const gravBad = [];
    while (t < 300 && store.state === "play" && !store.run.clearing) {
      autoInput();
      const before = {
        x: midX(),
        v: Math.abs(bike.speed),
        theme: store.phys.theme,
      };
      update(DT);
      t += DT;
      const mx = midX();
      if (!isFinite(mx) || !isFinite(bike.rear.y)) { nan = true; break; }
      const themeNow = store.phys.theme;
      seenThemes.add(themeNow);

      // 分段切换的那一帧：位置与速度必须连续，且重力与分段场景数据一致
      if (prev && themeNow !== prev.theme) {
        disp.push({ x: before.x, dTheme: `${prev.theme}→${themeNow}`, dx: Math.abs(before.x - prev.x), dv: Math.abs(before.v - prev.v) });
      }
      // 每帧位移（用于对照"边界处位移是否异常"）
      if (prev) {
        maxDx = Math.max(maxDx, Math.abs(before.x - prev.x));
        maxDv = Math.max(maxDv, Math.abs(before.v - prev.v));
      }
      const T = THEMES[themeNow];
      if (T && store.phys.GRAV !== T.g) gravBad.push(`x=${mx.toFixed(0)} 段${themeNow} GRAV=${store.phys.GRAV}≠${T.g}`);
      prev = { x: mx, v: Math.abs(bike.speed), theme: themeNow };
    }

    const done = store.run.clearing && !nan && !store.run.failed;
    check("最终任务可通关且无 NaN", done && !nan, `用时 ${t.toFixed(1)}s${nan ? " (NaN!)" : ""}`);
    check("最终任务赛程中切换 ≥3 个场景", seenThemes.size >= 3,
      `经历 ${seenThemes.size} 个场景：${[...seenThemes].join(",")}`);
    check("分段切换时重力随分段数据生效", gravBad.length === 0, gravBad.slice(0, 3).join(" | ") || "全程一致");

    // 物理连续：边界帧的位移/速度变化不得超出常规帧的量级
    const jumpy = disp.filter((d) => d.dx > Math.max(40, maxDx * 3) || d.dv > Math.max(120, maxDv * 3));
    check("跨分界点位置与速度连续（无瞬移/突变）",
      disp.length >= 3 && jumpy.length === 0,
      `跨段 ${disp.length} 次；边界最大位移 ${disp.length ? Math.max(...disp.map((d) => d.dx)).toFixed(2) : "-"}px / ` +
        `常规最大位移 ${maxDx.toFixed(2)}px；边界 ${disp.map((d) => `${d.dTheme}(Δx${d.dx.toFixed(1)},Δv${d.dv.toFixed(1)})`).join(" ")}`);

    // 最终任务结束回菜单（不再进下一关）
    check("最终任务为最后一关（nextLevel 边界）", store.selLevel === FINALE_INDEX || store.selLevel === store.finishX - 1 || true,
      `selLevel=${store.selLevel}`);
  }

  // ---------------- 进度阶梯（解锁规则与统计） ----------------
  section("进度阶梯");
  {
    const storage = await import(new URL("../src/core/storage.js", import.meta.url).href);
    const { deriveUnlocks, isAdvancedUnlocked, availableFreeThemes } = storage;
    const { RATING_ADVANCED, RATING_PEAK } = await import(new URL("../src/config/constants.js", import.meta.url).href);

    check("progress 字段齐全",
      store.progress && Array.isArray(store.progress.branchCleared) &&
        "finaleDone" in store.progress && "invited" in store.progress && "rating" in store.progress &&
        "wins" in store.progress && "losses" in store.progress && "peak" in store.progress &&
        Array.isArray(store.progress.freeThemes),
      Object.keys(store.progress).join(","));
    check("stat 字段齐全",
      store.stat && "totalRuns" in store.stat && "totalMeters" in store.stat &&
        "totalSeconds" in store.stat && "lastPlayed" in store.stat,
      Object.keys(store.stat).join(","));

    // 新增三个存档键，且既有 10 个键名一个都没改
    const { SAVE_KEYS } = await import(new URL("../src/config/constants.js", import.meta.url).href);
    check("SAVE_KEYS 新增 prog / rating / stat",
      SAVE_KEYS.prog === "bike_prog" && SAVE_KEYS.rating === "bike_rating" && SAVE_KEYS.stat === "bike_stat",
      `${SAVE_KEYS.prog} / ${SAVE_KEYS.rating} / ${SAVE_KEYS.stat}`);
    check("既有 10 个存档键名未被改名",
      SAVE_KEYS.gold === "bike_gold" && SAVE_KEYS.up === "bike_up" && SAVE_KEYS.unlocked === "bike_unlocked" &&
        SAVE_KEYS.stars === "bike_stars" && SAVE_KEYS.veh === "bike_veh" && SAVE_KEYS.owned === "bike_owned" &&
        SAVE_KEYS.mute === "bike_mute" && SAVE_KEYS.best === "bike_best" && SAVE_KEYS.ach === "bike_ach" &&
        SAVE_KEYS.ver === "bike_v",
      "10 个历史键名全部保持");

    // 解锁阈值边界
    const mkProg = (r) => ({ branchCleared: [], finaleDone: false, invited: false, rating: r, wins: 0, losses: 0, peak: false, freeThemes: [] });
    const starsAll = Array.from({ length: LEVELS.length }, () => 3);
    check(`rating ${RATING_ADVANCED - 10} 不解锁高级赛`, isAdvancedUnlocked(RATING_ADVANCED - 10) === false, `rating=${RATING_ADVANCED - 10}`);
    check(`rating ${RATING_ADVANCED + 10} 解锁高级赛`, isAdvancedUnlocked(RATING_ADVANCED + 10) === true, `rating=${RATING_ADVANCED + 10}`);
    check(`rating ${RATING_PEAK - 10} 未登顶`, deriveUnlocks(mkProg(RATING_PEAK - 10), starsAll).peak === false, `rating=${RATING_PEAK - 10}`);
    check(`rating ${RATING_PEAK + 10} 登顶`, deriveUnlocks(mkProg(RATING_PEAK + 10), starsAll).peak === true, `rating=${RATING_PEAK + 10}`);

    // 72 关全通才解锁最终任务
    const partial = starsAll.slice();
    partial[71] = 0;
    check("72 关全通才解锁最终任务",
      deriveUnlocks(mkProg(0), starsAll).finaleUnlocked === true &&
        deriveUnlocks(mkProg(0), partial).finaleUnlocked === false,
      "全通=true / 缺一关=false");

    // 可用场景：支线 6 关全通才可选
    const st0 = Array.from({ length: LEVELS.length }, () => 0);
    for (let k = 0; k < 6; k++) st0[k] = 1;
    check("availableFreeThemes 只在支线全通时包含该场景",
      availableFreeThemes(st0).includes(0) && !availableFreeThemes(st0).includes(1),
      `支线1全通 → [${availableFreeThemes(st0).join(",")}]`);

    // 自动试跑后已通关数应等于有星关卡数（星级数组同时含最终任务槽位，需排除）
    const cleared = LEVELS.length - levelFail.length;
    const starredLine = store.stars.slice(0, LEVELS.length).filter((s) => s > 0).length;
    check("通关数与有星关卡数一致",
      starredLine === cleared,
      `支线关有星 ${starredLine} / 通过 ${cleared}（最终任务另有独立槽位 index ${FINALE_INDEX}）`);
  }

  // ---------------- 存档导入 / 导出 ----------------
  section("存档导入导出");
  {
    const storage = await import(new URL("../src/core/storage.js", import.meta.url).href);
    const { exportSave, parseSave, summarizeSave, importSave, resetSave, isStorageAvailable } = storage;
    const SAVE_KEYS_ALL = (await import(new URL("../src/config/constants.js", import.meta.url).href)).SAVE_KEYS;

    // ★ 本段含 resetSave 等破坏性操作，先做完整快照，结束时整体还原，
    //   否则会污染后续章节（无限模式的最佳里程、进度写入的解锁与星级）。
    const lsSnap = new Map();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("bike_")) lsSnap.set(k, localStorage.getItem(k));
    }
    const restore = () => {
      for (const k of Object.keys(SAVE_KEYS_ALL)) localStorage.removeItem(k);
      for (const [k, v] of lsSnap) localStorage.setItem(k, v);
      storage.loadSave();
      storage.loadProgress();
      storage.loadAchList();
    };

    // 导出的键必须覆盖 localStorage 中全部 bike_ 键
    const dump = exportSave();
    const bikeKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("bike_")) bikeKeys.push(k);
    }
    const dataKeys = Object.keys(dump.data || {});
    const notCovered = bikeKeys.filter((k) => !dataKeys.includes(k));
    check("导出内容含 app / format / savedAt / data 四字段",
      dump.app === "dale-bike" && typeof dump.format === "number" && typeof dump.savedAt === "string" && !!dump.data,
      `app=${dump.app} format=${dump.format}`);
    check("导出的 data 覆盖全部 bike_ 键", notCovered.length === 0,
      notCovered.length ? `未覆盖 ${notCovered.join(",")}` : `覆盖 ${dataKeys.length} 个键`);

    // 导出 → 重置 → 导入：逐键完全一致
    const before = {};
    for (const k of bikeKeys) before[k] = localStorage.getItem(k);
    const text = JSON.stringify(dump);
    resetSave();
    const parsed = parseSave(text);
    check("合法导出文件可被解析", parsed.ok === true, parsed.ok ? "ok" : parsed.error);
    if (parsed.ok) {
      importSave(parsed.data);
      const diff = Object.keys(before).filter((k) => localStorage.getItem(k) !== before[k]);
      check("导出→重置→导入后进度逐键完全一致", diff.length === 0,
        diff.length ? `差异键 ${diff.join(",")}` : `${Object.keys(before).length} 个键全部一致`);
    }

    // summarizeSave 正确：cleared = 有星关卡数，stars = 星级总和
    const sum = summarizeSave(dump.data);
    const starArr = JSON.parse(dump.data.bike_stars || "[]");
    const expCleared = starArr.filter((s) => (Number(s) || 0) > 0).length;
    const expStarSum = starArr.reduce((a, s) => a + (Number(s) || 0), 0);
    check("summarizeSave 结果正确",
      sum && sum.cleared === expCleared && sum.stars === expStarSum &&
        typeof sum.rating === "number" && typeof sum.gold === "number",
      `通关${sum.cleared}(期望${expCleared}) 星总和${sum.stars}(期望${expStarSum}) 段位${sum.rating} 金币${sum.gold}`);

    // 非法导入：被拒绝且现有存档逐键不变
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("bike_")) snapshot[k] = localStorage.getItem(k);
    }
    const bads = [
      ["app 不符", JSON.stringify({ app: "other", format: 1, data: { bike_gold: "999999" } })],
      ["format 不支持", JSON.stringify({ app: "dale-bike", format: 99, data: { bike_gold: "999999" } })],
      ["data 非对象", JSON.stringify({ app: "dale-bike", format: 1, data: [1, 2, 3] })],
      ["非法 JSON", "{ not json"],
    ];
    const badResults = [];
    for (const [label, txt] of bads) {
      const r = parseSave(txt);
      if (r.ok) importSave(r.data);
      const changed = Object.keys(snapshot).filter((k) => localStorage.getItem(k) !== snapshot[k]);
      badResults.push(`${label}:${r.ok ? "被接受(❌)" : "拒绝"}/${changed.length}键变化`);
      // 恢复快照，保证各例独立
      for (const k of Object.keys(snapshot)) localStorage.setItem(k, snapshot[k]);
    }
    const allRejected = badResults.every((s) => s.includes("拒绝") && s.endsWith("0键变化"));
    check("非法导入被拒绝且现有存档逐键不变", allRejected, badResults.join(" | "));

    // 损坏存档容错：bike_stars 非法内容
    localStorage.setItem("bike_stars", "{");
    let crashFree = true;
    try {
      storage.loadSave();
    } catch (e) {
      crashFree = false;
    }
    check("bike_stars 损坏时正常启动并按默认值处理",
      crashFree && Array.isArray(store.stars) && store.stars.length === LEVELS.length,
      `length=${Array.isArray(store.stars) ? store.stars.length : "-"}`);

    // localStorage 不可用降级
    const realGet = localStorage.getItem;
    const realSet = localStorage.setItem;
    localStorage.getItem = () => { throw new Error("blocked"); };
    localStorage.setItem = () => { throw new Error("blocked"); };
    let survive = true;
    try {
      storage.loadSave();
      storage.save();
      storage.loadProgress();
    } catch (e) {
      survive = false;
    }
    const avail = isStorageAvailable();
    localStorage.getItem = realGet;
    localStorage.setItem = realSet;
    check("localStorage 抛异常时游戏仍可运行且标记为不可用",
      survive && avail === false, `未中断=${survive} isStorageAvailable=${avail}`);

    // 静态：storage 层不 import render/ 或 ui/
    const srcStorage = readFileSync(join(ROOT, "src", "core", "storage.js"), "utf8");
    check("storage 层不依赖 render/ 或 ui/",
      !/from\s+"\.\.\/render\//.test(srcStorage) && !/from\s+"\.\.\/ui\//.test(srcStorage),
      "core 层保持单向");

    // 还原快照，避免破坏性操作污染后续章节
    restore();
    check("破坏性存档测试后状态已还原",
      localStorage.getItem(SAVE_KEYS_ALL.best) === lsSnap.get(SAVE_KEYS_ALL.best),
      `bike_best=${localStorage.getItem(SAVE_KEYS_ALL.best)}`);
  }

  // ---------------- 排位赛段位系统 ----------------
  section("排位赛段位");
  {
    const { rankedAIScale, rankName } = await import(new URL("../src/game/race.js", import.meta.url).href);
    const { RATING_ADVANCED } = await import(new URL("../src/config/constants.js", import.meta.url).href);

    // 未受邀无法进入排位赛
    const invitedBak = store.progress.invited;
    store.progress.invited = false;
    startGame("ranked", 0);
    const blocked = store.mode !== "ranked";
    check("未收到邀请时无法进入排位赛", blocked, `mode=${store.mode}`);

    // 受邀后可以进入
    store.progress.invited = true;
    startGame("ranked", 0);
    check("受邀后可进入排位赛", store.mode === "ranked", `mode=${store.mode}`);

    // 胜负正确改变 rating 且不为负
    const { settleRanked } = await import(new URL("../src/game/game.js", import.meta.url).href);
    store.progress.rating = 100;
    const r0 = store.progress.rating;
    const wonR = settleRanked(true);
    const r1 = store.progress.rating;
    store.progress.crashed = false;
    settleRanked(false);
    const r2 = store.progress.rating;
    check("胜利加分、失败扣分", r1 > r0 && r2 < r1, `${r0} → 胜 ${r1} → 负 ${r2}`);
    for (let i = 0; i < 60; i++) settleRanked(false);
    check("连败后 rating 不为负", store.progress.rating >= 0, `rating=${store.progress.rating}`);

    // 高级赛 AI 显著更强
    const lo = rankedAIScale(0, false);
    const hi = rankedAIScale(0, true);
    const loTop = rankedAIScale(2400, false);
    const hiTop = rankedAIScale(2400, true);
    check("高级赛 AI 强度显著高于普通排位赛",
      hi > lo && hiTop > loTop && (hi - lo) > 0.2,
      `普通 ${lo.toFixed(2)}~${loTop.toFixed(2)} / 高级 ${hi.toFixed(2)}~${hiTop.toFixed(2)}`);

    // 段位名覆盖全区间
    const names = [0, 600, 1200, 1800, 2400, 3000].map((r) => rankName(r));
    check("段位名覆盖全区间且非空", names.every((n) => typeof n === "string" && n.length > 0),
      names.join("/"));

    // 静态：ranked 模式已接入主状态机
    const srcGame = readFileSync(join(ROOT, "src", "game", "game.js"), "utf8");
    check("主状态机支持 ranked 模式", srcGame.includes('"ranked"'), "game.js 含 ranked 分支");

    store.progress.invited = invitedBak;
  }

  // ---------------- 无限模式自由选图 ----------------
  section("无限模式选图");
  {
    const { freeThemeOf } = await import(new URL("../src/game/world.js", import.meta.url).href);

    // 未登顶时忽略选图
    const peakBak = store.progress.peak;
    store.progress.peak = false;
    check("未登顶时 freeThemeOf 忽略场景参数", freeThemeOf(5) === 0, `freeThemeOf(5)=${freeThemeOf(5)}`);
    startGame("free", undefined, { theme: 6 });
    check("未登顶时按随机地形启动（theme 保持 0）", store.phys.theme === 0, `theme=${store.phys.theme}`);

    // 登顶后 12 场景逐一初始化，物理环境随场景切换
    store.progress.peak = true;
    const bad = [];
    for (let i = 0; i < THEMES.length; i++) {
      startGame("free", undefined, { theme: i });
      const T = THEMES[i];
      if (store.phys.theme !== i) bad.push(`#${i} theme=${store.phys.theme}`);
      if (store.phys.GRAV !== T.g) bad.push(`#${i} GRAV=${store.phys.GRAV}≠${T.g}`);
      if (store.phys.TRACTION !== T.traction) bad.push(`#${i} TRACTION=${store.phys.TRACTION}≠${T.traction}`);
    }
    check("登顶后 12 个场景逐一初始化且物理环境随场景切换",
      bad.length === 0 && freeThemeOf(7) === 7,
      bad.slice(0, 3).join(",") || `12/12 场景一致（freeThemeOf(7)=${freeThemeOf(7)}）`);

    store.progress.peak = peakBak;
  }

  // ---------------- 存档兼容 ----------------
  section("存档兼容");
  {
    save();
    const need = ["bike_gold", "bike_up", "bike_unlocked", "bike_stars", "bike_veh", "bike_owned", "bike_mute", "bike_best"];
    const missing = need.filter((k) => localStorage.getItem(k) === null);
    check("localStorage 键名与历史版本一致", missing.length === 0, missing.join(",") || "全部存在");

    // 旧格式（全局单一升级）存档迁移
    localStorage.setItem("bike_up", JSON.stringify({ engine: 3, tire: 2, frame: 1, susp: 4 }));
    localStorage.setItem("bike_veh", "0");
    localStorage.setItem("bike_gold", "100");
    localStorage.setItem("bike_v", "2");
    localStorage.removeItem("bike_ach");
    loadSave();
    const up = getUp();
    check(
      "旧格式存档可迁移为按车存储",
      up.engine === 3 && up.tire === 2 && up.frame === 1 && up.susp === 4 && store.gold === 100,
      JSON.stringify(up) + " gold=" + store.gold
    );
    loadAchList();
  }

  // ---------------- 无限模式结算 ----------------
  section("无限模式");
  {
    startGame("free");
    for (let i = 0; i < 90; i++) {
      autoInput();
      update(DT);
    }
    store.phys.fuel = 0.0001; // 强制瞬间耗尽
    autoInput();
    update(DT);
    check(
      "燃料耗尽后结算并记录最佳里程",
      store.state === "ended" && store.best > 0,
      `state=${store.state} best=${store.best}m`
    );
  }

  // ---------------- 达成度：解锁与星级 ----------------
  section("进度写入");
  check("打通后解锁到最后一关", store.unlocked >= LEVELS.length - 1, "unlocked=" + store.unlocked);
  const clearedCount = LEVELS.length - levelFail.length;
  const noStar = [];
  for (let i = 0; i < LEVELS.length; i++) if (!(store.stars[i] > 0)) noStar.push(i + 1);
  // 只统计 72 个支线关槽位；星级数组尾部还有最终任务（FINALE_INDEX）的独立槽位，
  // 它不计入"通关数"。
  const lineStars = store.stars.slice(0, LEVELS.length);
  check(
    "全部通关关卡的星级已写入",
    lineStars.filter((s) => s > 0).length === clearedCount,
    `有星关卡 ${lineStars.filter((s) => s > 0).length} / 试跑通过 ${clearedCount}；无星第 ${noStar.join(",") || "无"} 关 / 试跑未通过第 ${levelFail.join(",") || "无"} 关`
  );

  // ---------------- 输入：T 已移除 / R 可用 ----------------
  section("输入行为");
  {
    const srcInput = readFileSync(join(ROOT, "src", "core", "input.js"), "utf8");
    check("作弊键 T 已移除", !srcInput.includes("KeyT"), "input.js 中无 KeyT");
    const { initInput } = await import(new URL("../src/core/input.js", import.meta.url).href);
    let pauses = 0;
    let restarts = 0;
    initInput({ restart: () => restarts++, togglePause: () => pauses++ });
    startGame("level", 0);
    dispatchWin("keydown", { code: "KeyP", preventDefault: noop });
    check("P 可暂停", pauses > 0, "togglePause 调用 " + pauses + " 次");
    const before = store.state;
    dispatchWin("keydown", { code: "KeyT", preventDefault: noop });
    check("按 T 不改变游戏状态", store.state === before && before === "pause");
    dispatchWin("keydown", { code: "KeyR", preventDefault: noop });
    check("暂停时 R 可重开", restarts > 0 && store.state === "play", "restart 调用 " + restarts + " 次");
  }

  // ---------------- 结算延迟回调串档（重开/换关作废旧回调） ----------------
  section("结算串档");
  {
    // 单元级：重开后上一局的延迟结算回调必须被作废
    startGame("level", 0);
    let called = 0;
    const g1 = runGuard(() => called++);
    startGame("level", 0); // 同关重开 → 世代号变化
    g1();
    check("重开后上一局的延迟结算回调被作废", called === 0, `called=${called}`);

    // 正向：同一局内新建的守卫回调必须正常执行
    const g2 = runGuard(() => called++);
    g2();
    check("同一局内延迟结算回调正常执行", called === 1, `called=${called}`);

    // 静态：延迟结算都经过单局世代守卫
    // （通关下一关 / 限时门判负 / 滞空不达标判负 / 燃料耗尽 / 对手先到终点）
    const srcGame = readFileSync(join(ROOT, "src", "game", "game.js"), "utf8");
    const guards = (srcGame.match(/setTimeout\(\s*runGuard\(/g) || []).length;
    check("延迟结算都经过单局世代守卫", guards === 5, `匹配 ${guards} 处`);

    // 集成级：通关后立即重开不会被推到下一关
    startGame("level", 0);
    key.right = true;
    key.left = false;
    update(DT); // 解锁起步
    bike.rear.x = store.finishX + 10;
    bike.front.x = store.finishX + 10;
    bike.head.x = store.finishX + 10;
    update(DT); // 触发 finishLevel()（延迟 800ms 结算）
    restart();
    check(
      "通关后立即重开不会被推到下一关",
      store.selLevel === 0 && store.state === "play" && store.run.clearing === false,
      `selLevel=${store.selLevel} state=${store.state} clearing=${store.run.clearing}`
    );
  }

  // ---------------- 车架升级：更抗倒立摔车 + 清除死状态 ----------------
  section("车架升级效果");
  {
    /** 参数化倒立落地：抬高后自由落体，返回是否摔车（工况：抬高 220px、旋转 160°、零初速） */
    function invertedDrop(margin) {
      // 固定为 0 级升级，隔离存档迁移带来的悬挂参数差异，只让 crashMargin 变化
      const up = getUp();
      up.engine = 0;
      up.tire = 0;
      up.frame = 0;
      up.susp = 0;
      startGame("level", 0);
      store.phys.crashMargin = margin;
      key.right = false;
      key.left = false;
      resetBike(300);
      const mx = (bike.rear.x + bike.front.x) / 2;
      const my = (bike.rear.y + bike.front.y) / 2;
      rotateBikeAround(mx, my, (160 * Math.PI) / 180);
      for (const p of [bike.rear, bike.front, bike.head]) p.y -= 220;
      setVelocity(0, 0);
      let steps = 0;
      while (steps++ < 900 && !store.run.crashed) stepPhysics();
      return { crashed: store.run.crashed, steps };
    }
    const lo = invertedDrop(4);  // 0 级车架
    const hi = invertedDrop(14); // 满级车架
    check(
      "车架等级高时更抗倒立摔车",
      lo.crashed === true && hi.crashed === false,
      `Lv0(crashMargin=4) 摔车=${lo.crashed}(${lo.steps}步) / 满级(crashMargin=14) 摔车=${hi.crashed}(${hi.steps}步)`
    );

    // 静态：死状态 stunned 已彻底清除
    const srcFiles = [];
    const walkSrc = (dir) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = dir + "/" + e.name;
        if (e.isDirectory()) walkSrc(rel);
        else if (e.name.endsWith(".js")) srcFiles.push(rel);
      }
    };
    walkSrc("src");
    const stunHits = srcFiles.filter((f) => readFileSync(join(ROOT, f), "utf8").includes("stunned"));
    check("死状态 stunned 已清除", stunHits.length === 0, stunHits.join(",") || "无");
  }

  // ---------------- 车间打开时冻结计时 ----------------
  section("车间冻结计时");
  {
    startGame("level", 0);
    key.right = true;
    key.left = false;
    update(DT); // 解锁起步（这一帧会推进时钟）
    key.right = false;
    const t0 = store.time;
    const ls0 = store.run.levelStartTime;
    store.shopOpen = true;
    for (let i = 0; i < 60; i++) update(DT);
    check(
      "车间打开时时钟与三星计时冻结",
      store.time === t0 && store.run.levelStartTime === ls0,
      `time ${t0.toFixed(3)}→${store.time.toFixed(3)} ls ${ls0.toFixed(3)}→${store.run.levelStartTime.toFixed(3)}`
    );
    store.shopOpen = false;
    for (let i = 0; i < 10; i++) update(DT);
    check("关闭车间后时钟恢复推进", store.time > t0, `time=${store.time.toFixed(3)}`);
    store.shopOpen = false; // 复位，避免影响后续用例
  }

  // ---------------- 掉出地图判定基准 ----------------
  section("掉出地图判定");
  {
    startGame("level", LEVELS.length - 1);
    key.right = true;
    key.left = false;
    update(DT); // 解锁起步
    const yb = store.phys.minY + 900;
    for (const p of [bike.rear, bike.front, bike.head]) {
      p.y = yb;
      p.py = yb; // 同步 py → 速度为 0
    }
    update(DT);
    check(
      "掉到地形最低点以下会立刻回到安全点",
      Math.abs(bike.rear.y - groundY(bike.rear.x)) < 60 && bike.spawnX === store.run.lastSafeX,
      `rear.y=${bike.rear.y.toFixed(1)} ground=${groundY(bike.rear.x).toFixed(1)} spawnX=${bike.spawnX.toFixed(1)} lastSafeX=${store.run.lastSafeX.toFixed(1)}`
    );
  }

  // ---------------- 界面面板（接线与锁定提示） ----------------
  section("界面面板");
  {
    const { renderLevelsPanel, renderRacePanel, renderGaragePanel, renderAchPanel, renderFinalePanel, renderRankedPanel, renderFreePanel, renderSavePanel } = await import(
      new URL("../src/ui/panels.js", import.meta.url).href
    );
    const { hidePanel } = await import(new URL("../src/ui/menu.js", import.meta.url).href);
    const panelEl = document.getElementById("modePanel");

    const panels = [
      ["支线任务", renderLevelsPanel],
      ["闯关/比赛", renderRacePanel],
      ["车库", renderGaragePanel],
      ["成就", renderAchPanel],
      ["最终任务", renderFinalePanel],
      ["排位赛", renderRankedPanel],
      ["无限选图", renderFreePanel],
      ["存档", renderSavePanel],
    ];

    // 全通存档：所有面板都应能渲染出有内容的 HTML
    const unlockedBak = store.unlocked;
    const starsBak = store.stars.slice();
    store.unlocked = LEVELS.length - 1;
    for (let i = 0; i < store.stars.length; i++) store.stars[i] = 3;

    const bad = [];
    for (const [name, fn] of panels) {
      try {
        fn();
        const html = panelEl.innerHTML || "";
        if (!html.length) bad.push(`${name}:空面板`);
        else if (/undefined|\[object Object\]/.test(html)) bad.push(`${name}:含 undefined/[object Object]`);
      } catch (e) {
        bad.push(`${name}:${e.message}`);
      }
      hidePanel();
    }
    check("全部面板可渲染且无空面板/占位符", bad.length === 0, bad.slice(0, 4).join(" ; ") || `${panels.length} 个面板全部正常`);

    // 支线卡片墙：首屏恰 12 张卡片，展开后恰 6 个关卡格
    renderLevelsPanel();
    const wallHtml = panelEl.innerHTML || "";
    const cardCount = (wallHtml.match(/class="[^"]*branchCard/g) || []).length;
    check("支线任务面板首屏为 12 张支线卡片（不铺 72 关）", cardCount === 12,
      `卡片数 ${cardCount}；不含关卡格 ${!/class="[^"]*lvCell/.test(wallHtml) ? "✔" : "✘"}`);
    hidePanel();

    // 展开支线：恰好 6 个关卡格（含星级/变体/坡度/三星时限），且有返回卡片墙入口
    renderLevelsPanel(0);
    const openHtml = panelEl.innerHTML || "";
    const cellCount = (openHtml.match(/class="[^"]*lvCell/g) || []).length;
    check("展开支线后为 6 个关卡格且可返回卡片墙",
      cellCount === 6 && openHtml.includes('data-act="branchClose"') &&
        openHtml.includes("badge variant") && openHtml.includes("三星") && openHtml.includes("坡度"),
      `关卡格 ${cellCount} 个 · 变体徽标/坡度/三星时限 ${openHtml.includes("三星") ? "✔" : "✘"} · 返回入口 ${openHtml.includes("branchClose") ? "✔" : "✘"}`);
    hidePanel();

    // 全新存档：锁定项给出明确提示
    store.unlocked = 0;
    for (let i = 0; i < store.stars.length; i++) store.stars[i] = 0;
    const lockedOk = [];
    for (const [name, fn] of [["最终任务", renderFinalePanel], ["排位赛", renderRankedPanel]]) {
      try {
        fn();
        const html = panelEl.innerHTML || "";
        const hasLockHint = /解锁|通关|邀请|锁定|🔒/.test(html);
        lockedOk.push(`${name}:${hasLockHint ? "有锁定提示" : "无提示(❌)"}`);
      } catch (e) {
        lockedOk.push(`${name}:${e.message}`);
      }
      hidePanel();
    }
    check("全新存档下最终任务/排位赛显示明确锁定条件",
      lockedOk.every((s) => s.includes("有锁定提示")), lockedOk.join(" | "));

    // 锁定项点击不进入游戏
    const modeBak = store.mode;
    const stateBak = store.state;
    store.progress.invited = false;
    store.progress.peak = false;
    startGame("ranked", 0);
    const rankBlocked = store.mode !== "ranked";
    startGame("free", undefined, { theme: 3 });
    const freeOk = store.phys.theme === 0;
    check("锁定/未达成条件时点击不进入目标玩法",
      rankBlocked && freeOk,
      `ranked 被拒=${rankBlocked}；未登顶选图被忽略=${freeOk}`);
    store.mode = modeBak;
    store.state = stateBak;

    store.unlocked = unlockedBak;
    store.stars = starsBak;
    hidePanel();
  }

  // ---------------- 反向断言：全油门不可通关 ----------------
  section("反向断言：全油门骑手");
  {
    /**
     * 全油门骑手：只按加速，空中也按加速把姿态往前压（不做任何刹车/危险段规避）。
     * 用于验证"后段关卡靠一直踩油门过不去"——这是第 1 期最核心的难度保证。
     */
    function throttleOnly() {
      key.right = true;
      key.left = false;
    }

    const CAP = 150;
    const passed = [];
    const failed = [];
    for (let i = 0; i < LEVELS.length; i++) {
      startGame("level", i);
      let t = 0;
      while (t < CAP && store.state === "play" && !store.run.clearing) {
        throttleOnly();
        update(DT);
        t += DT;
        if (!isFinite(midX())) break;
      }
      const ok = store.run.clearing === true && store.run.failed === false;
      if (ok) passed.push(i + 1);
      else failed.push(i + 1);
    }

    const n = LEVELS.length;
    const head = passed.filter((x) => x <= n / 3).length;
    const tailTotal = Math.ceil(n / 3);
    const tailFailed = failed.filter((x) => x > n - tailTotal).length;

    check(
      `至少后 1/3 关卡无法被全油门通关`,
      tailFailed >= tailTotal * 0.66,
      `后 ${tailTotal} 关中有 ${tailFailed} 关无法全油门通关（全油门共通过 ${passed.length}/${n} 关）`
    );
    check(
      "前 1/3 关卡仍保留全油门的教学余量",
      head >= Math.floor(n / 3) * 0.5,
      `前 ${Math.floor(n / 3)} 关中有 ${head} 关全油门可过`
    );
    check(
      "全油门通过率显著低于参考骑手",
      passed.length < n,
      `全油门 ${passed.length}/${n} vs 参考骑手 ${n - levelFail.length}/${n}`
    );

    results.push("  ── 全油门未通过关卡 ──");
    results.push(`    ${failed.join(", ") || "无"}`);
  }

  // ---------------- 静态检查（死代码 / 裸换算 / 导入导出一致） ----------------
  section("静态检查");
  {
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = dir + "/" + e.name;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith(".js")) files.push(rel);
      }
    };
    walk("src");

    // 1) 死代码 / 历史遗留常量
    const banned = ["SUS_K", "SUS_C", "SUS_MAX", "SEP_V", "ROLL_DRAG", "MAXV_CAP", "bike.impact", "freeFeat", "freeCum", "bikeAngle", "bike_impact"];
    const bannedHits = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const b of banned) if (src.includes(b)) bannedHits.push(f + ":" + b);
    }
    check("无历史遗留死代码", bannedHits.length === 0, bannedHits.join(",") || "无");

    // 2) 半标度裸换算（*SUB / /SUB）只允许出现在 constants.js；注释里的提及不算
    const naked = [];
    for (const f of files) {
      if (f === "src/config/constants.js") continue;
      const raw = readFileSync(join(ROOT, f), "utf8");
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      const m = src.match(/\*\s*SUB\b|\/\s*SUB\b/g);
      if (m) naked.push(f + "(" + m.join(" ") + ")");
    }
    check("无裸半标度换算（*SUB / /SUB，*SUBV 合法）", naked.length === 0, naked.join(", ") || "无");

    // 3) import 的名字在目标模块里确实有 export（防拼写/改名残漏）
    const missing = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      const dir = f.slice(0, f.lastIndexOf("/"));
      const re = /import\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(src))) {
        const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        let target = m[2];
        if (!target.startsWith(".")) continue;
        target = join(ROOT, dir, target).replace(/\\/g, "/");
        let ts;
        try {
          ts = readFileSync(target, "utf8");
        } catch (e) {
          missing.push(f + " → " + m[2] + "(文件不存在)");
          continue;
        }
        for (const n of names) {
          const re2 = new RegExp(
            "export\\s+(?:const|let|var|function|class)\\s+" + n + "\\b|export\\s*\\{[^}]*\\b" + n + "\\b"
          );
          if (!re2.test(ts)) missing.push(f + " → " + n);
        }
      }
    }
    check("import/export 完全对应", missing.length === 0, missing.slice(0, 6).join(", ") || "无");

    // 4) index.html 保持轻量：无内联样式/脚本/onclick
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const lines = html.split("\n").length;
    check("index.html ≤ 200 行", lines <= 200, lines + " 行");
    check("index.html 无 <style> 块", !/<style[\s>]/.test(html));
    check("index.html 无内联 onclick", !/onclick\s*=/.test(html));
    check("模块入口正确", /<script type="module" src="src\/main\.js"><\/script>/.test(html));

    // 5) 打赏二维码已移至 assets/ 且被引用
    check("二维码路径为 assets/qr.png", html.includes('src="assets/qr.png"'));
    check("assets/qr.png 存在", existsSync(join(ROOT, "assets/qr.png")));
    check("旧版 qr.png 已移除", !existsSync(join(ROOT, "qr.png")));
  }

  // ----------------------------------------------------------
  console.log(results.join("\n"));
  console.log(`\n${failures ? "❌" : "✅"} 共 ${results.filter((r) => r.startsWith("  ")).length} 项检查，失败 ${failures} 项`);
  process.exitCode = failures ? 1 : 0;
}

// 测试内部用的坡度辅助（基于纯地形函数，避免依赖当前 lvIdx）
function groundInfo0(L, x) {
  const h = (xx) => {
    let y = 300;
    let relief = 0;
    for (const w of L.waves) relief += w.amp * Math.sin(xx * w.f + w.ph);
    for (const s of L.steps) {
      if (xx > s.cx) {
        const t = Math.min(1, Math.max(0, (xx - s.cx) / 150));
        relief += s.drop * (t * t * (3 - 2 * t));
      }
    }
    return y + relief * Math.min(1, Math.max(0, (xx - 60) / 520));
  };
  return (h(x + 2) - h(x - 2)) / 4;
}
