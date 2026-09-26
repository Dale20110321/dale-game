// 设计令牌 · Canvas 端镜像（唯一事实来源的另一半）
//
// 与 styles/tokens.css 逐键等价：键名 = CSS 变量名去掉 `--`，取值 = CSS 里的书写原文。
// tools/autotest.mjs 会解析两端并逐键比较，任何一边改动都要同步另一边。
//
// 渲染层（render/**）与界面层需要的色值/字体一律从这里取，禁止再写裸色值。

/** 全部令牌（键 = CSS 变量名去 `--`，值 = 原样字符串） */
export const TOKENS = Object.freeze({
  // 表面层级
  "surface-0": "#070f18",
  "surface-1": "#0d1b2a",
  "surface-2": "#14283b",
  "surface-3": "#1d3550",

  // 玻璃层
  "glass-fill": "rgba(255,255,255,0.06)",
  "glass-fill-strong": "rgba(255,255,255,0.12)",
  "glass-border": "rgba(255,255,255,0.18)",
  "glass-highlight": "rgba(255,255,255,0.34)",
  "glass-blur": "14px",
  "glass-shadow-in": "inset 0 1px 0 rgba(255,255,255,0.16)",
  "glass-shadow-out": "0 10px 30px rgba(0,0,0,0.42)",

  // 强调色
  accent: "#06d6a0",
  "accent-2": "#118ab2",
  "accent-grad": "linear-gradient(135deg, #06d6a0, #118ab2)",
  "accent-glow": "rgba(6,214,160,0.35)",

  // 语义色
  success: "#4cff88",
  warn: "#ffba08",
  danger: "#e63946",
  gold: "#ffd166",
  info: "#7ce7ff",

  // 文本层级
  "text-hi": "#ffffff",
  "text-mid": "#dbe3ec",
  "text-lo": "#a9b6c6",

  // 排版
  "font-family": '"Segoe UI", system-ui, sans-serif',
  "font-mono": 'ui-monospace, "SFMono-Regular", Consolas, monospace',
  "font-display-size": "44px",
  "font-display-lh": "1.1",
  "font-display-weight": "800",
  "font-title-size": "20px",
  "font-title-lh": "1.25",
  "font-title-weight": "700",
  "font-body-size": "14px",
  "font-body-lh": "1.6",
  "font-body-weight": "400",
  "font-caption-size": "12px",
  "font-caption-lh": "1.45",
  "font-caption-weight": "600",
  "font-micro-size": "10px",
  "font-micro-lh": "1.3",
  "font-micro-weight": "700",

  // 间距
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "24px",
  "space-6": "32px",

  // 圆角
  "radius-chip": "8px",
  "radius-card": "14px",
  "radius-sheet": "20px",
  "radius-pill": "999px",

  // 动效时长
  "dur-fast": "120ms",
  "dur-base": "200ms",
  "dur-slow": "320ms",

  // 动效缓动
  "ease-std": "cubic-bezier(0.2, 0.7, 0.3, 1)",
  "ease-enter": "cubic-bezier(0, 0.6, 0.3, 1)",
  "ease-exit": "cubic-bezier(0.4, 0, 1, 1)",

  // 游戏对象配色
  "obj-coin": "#ffd166",
  "obj-coin-dark": "#d9a400",
  "obj-canister": "#8a9098",
  "obj-canister-top": "#a9aeb6",
  "obj-boost": "#4cff88",
  "obj-obstacle": "#8a6a44",
  "obj-obstacle-dark": "#5b3a1e",
  "obj-hazard": "#e63946",
  "obj-hazard-soft": "rgba(255,72,60,0.16)",
  "obj-gate": "#7ce7ff",
  "obj-gate-passed": "#4cff88",
  "obj-finish": "#ee1111",
  "obj-bike-frame": "#1b1b1b",
  "obj-bike-metal": "#666666",
  "obj-bike-dark": "#161c22",
  "obj-rider-skin": "#e8a97e",
  "obj-rider-suit": "#e88c1f",
  "obj-dust-light": "rgba(255,255,255,0.6)",
  "obj-dust-heavy": "rgba(180,150,220,0.35)",
  "obj-shadow": "rgba(0,0,0,0.18)",
  "obj-shadow-soft": "rgba(0,0,0,0.12)",
  "obj-platform": "#2c3742",
  "obj-platform-dark": "#1d242b",
  "obj-glass-light": "rgba(255,255,255,0.12)",
  "obj-glass-mid": "rgba(255,255,255,0.6)",

  // 渲染调色盘（Canvas 世界实体 / 车手 / 背景特效）
  "obj-canister": "#e85d04",
  "obj-canister-dark": "#9c3d00",
  "obj-canister-glow": "rgba(255,160,20,0.16)",
  "obj-pole": "#555555",
  "obj-jump-base": "rgba(20,26,34,0.85)",
  "obj-jump-rim": "rgba(124,231,255,0.95)",
  "obj-jump-rim-used": "rgba(120,140,160,0.5)",
  "obj-jump-glow": "rgba(124,231,255,0.9)",
  "obj-hazard-fill": "rgba(18,18,22,0.85)",
  "obj-hazard-mark": "#ff5a4a",
  "obj-hazard-edge": "rgba(255,96,72,0.6)",
  "obj-gate-open": "rgba(90,225,140,0.9)",
  "obj-gate-pending": "rgba(255,208,80,0.92)",
  "obj-bike-tire": "#222222",
  "obj-bike-carbon": "#333333",
  "obj-bike-rim": "#2a2a2a",
  "obj-bike-hub": "#c0392b",
  "obj-bike-steel": "#555555",
  "obj-bike-gray": "#4a4a4a",
  "obj-helmet": "#212b34",
  "obj-goggle": "#8ad2ff",
  "obj-hair": "#3b2a20",
  "obj-rider-skin-2": "#f4a259",
  "obj-rider-skin-hi": "#ffcba5",
  "obj-rider-skin-sh": "#c98a5f",
  "obj-suit-far-dark": "#0d1116",
  "fx-halo-white": "rgba(255,255,255,0.40)",
  "fx-halo-warm": "rgba(255,140,60,0.45)",
  "fx-halo-warm-0": "rgba(255,140,60,0)",
  "fx-halo-sand": "rgba(255,208,138,0.6)",
  "fx-halo-none": "rgba(255,255,255,0)",
  "fx-cloud-green": "rgba(120,205,160,0.6)",
  "fx-cloud-white": "rgba(255,255,255,0.22)",
  "fx-ridge-white": "rgba(255,255,255,0.5)",
  "fx-shadow-soft": "rgba(0,0,0,0.15)",
  "fx-shadow-faint": "rgba(0,0,0,0.08)",
  "fx-none-dark": "rgba(0,0,0,0)",
  "obj-obstacle-fallback": "#8a8f98",
  "obj-obstacle-fallback-2": "#a9aeb6",


  // 界面扩展
  "glass-hover": "rgba(255,255,255,0.2)",
  track: "rgba(255,255,255,0.2)",
  scrim: "rgba(8,20,32,0.74)",
  "scrim-strong": "rgba(8,20,32,0.88)",
  "scrim-solid": "rgba(8,20,32,0.97)",
  "success-soft": "rgba(80,255,150,0.16)",
  "gold-soft": "rgba(255,209,102,0.16)",
  "shadow-sm": "rgba(0,0,0,0.35)",
  "shadow-md": "rgba(0,0,0,0.42)",
  "shadow-text": "rgba(0,0,0,0.6)",
  "shadow-text-strong": "rgba(0,0,0,0.72)",
  muted: "#7a869a",
  ink: "#4a2b00",
  "gold-2": "#f0a83c",
  "gold-3": "#e08b22",
  "gold-glow": "rgba(255,205,90,0.4)",
  "gold-glow-strong": "rgba(255,215,110,0.75)",
  "grad-progress": "linear-gradient(90deg, #06d6a0, #ffd166)",
  "grad-fuel": "linear-gradient(90deg, #e85d04, #ffba08)",
  "grad-donate": "linear-gradient(135deg, #ffd166, #f0a83c 55%, #e08b22)",
  press: "rgba(255,255,255,0.42)",
  "toggle-on": "rgba(80,255,150,0.28)",
  "toggle-on-border": "rgba(120,255,170,0.65)",
});

/** 语义色 → 令牌名（HUD / Toast / 徽标分级统一走这里） */
export const SEMANTIC = Object.freeze({
  info: "info",
  success: "success",
  warn: "warn",
  danger: "danger",
  gold: "gold",
  accent: "accent",
});

/** 语义名 → 色值（未知级别回退 info） */
export function semColor(name) {
  return TOKENS[SEMANTIC[name] || "info"] || TOKENS.info;
}

/** 取令牌原文；未定义的键回退空串（调用方应保证键存在，断言另有守护） */
export function token(name) {
  const v = TOKENS[name];
  return v === undefined ? "" : v;
}

/** 取令牌数值（用于 blur 半径、间距、圆角等 px 值），非数值返回 fallback */
export function tokenNum(name, fallback = 0) {
  const n = parseFloat(TOKENS[name]);
  return Number.isFinite(n) ? n : fallback;
}

/** 取令牌毫秒数（动效时长） */
export function tokenMs(name, fallback = 0) {
  const n = parseFloat(TOKENS[name]);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 组装 Canvas 的 font 字符串（字号取排版阶梯，字重取同层字重）。
 * @param {"display"|"title"|"body"|"caption"|"micro"} level
 */
export function fontOf(level = "body") {
  const size = TOKENS["font-" + level + "-size"] || TOKENS["font-body-size"];
  const weight = TOKENS["font-" + level + "-weight"] || TOKENS["font-body-weight"];
  return weight + " " + size + " " + TOKENS["font-family"];
}
