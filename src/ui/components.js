// 组件层：把「数据」渲染成「组件类 HTML」的纯函数集合。
//
// 纪律（与 styles/main.css 的组件层一一对应）：
//   · 只使用组件类（card / chip / btn / progress / stat / tabs / badge / empty / glass-sheet），
//     不产生任何用于配色的内联 style —— 色值一律由 CSS 从设计令牌取。
//   · 允许的 styleVars 只用于"把数据驱动的主题色/车辆色经自定义属性注入"
//     （如 --theme-accent），不是第二套色板。
//   · 纯函数：无副作用、不读 store、不碰 DOM，便于断言与复用。

/** HTML 文本转义（面板里出现的玩家可见文本都过一遍，避免注入与破版） */
export function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 去标签 + 压缩空白（用于把富文本摘要转成无障碍名称） */
export function plain(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 卡片。
 * @param {{icon?:string,title?:string,sub?:string,meta?:string,right?:string,
 *          interactive?:boolean,selected?:boolean,locked?:boolean,cls?:string,
 *          attrs?:string,styleVars?:string,body?:string}} o
 */
export function card(o = {}) {
  const cls = ["card"];
  if (o.cls) cls.push(...String(o.cls).split(/\s+/).filter(Boolean));
  if (o.interactive) cls.push("interactive");
  if (o.selected) cls.push("selected");
  if (o.locked) cls.push("locked");
  const aria = o.locked ? ' aria-disabled="true"' : "";
  const st = o.styleVars ? ` style="${o.styleVars}"` : "";
  // 可访问性（Task 9.1）：可交互卡片必须可被键盘聚焦与触发
  let a11y = "";
  if (o.interactive) {
    const name = plain([o.title, o.sub, o.meta].filter(Boolean).join(" · "));
    a11y = ` role="button" tabindex="0"` + (name ? ` aria-label="${esc(name)}"` : "");
  }
  const icon = o.icon ? `<div class="cardIcon">${o.icon}</div>` : "";
  const title = o.title ? `<div class="vname">${o.title}</div>` : "";
  const sub = o.sub ? `<div class="vdesc">${o.sub}</div>` : "";
  const meta = o.meta ? `<div class="vstat">${o.meta}</div>` : "";
  const right = o.right ? `<div class="cardRight">${o.right}</div>` : "";
  const inner = icon || title || sub || meta || right ? `<div class="cardHead">${icon}<div class="cardBody">${title}${sub}${meta}</div>${right}</div>` : "";
  return `<div class="${cls.join(" ")}"${o.attrs ? " " + o.attrs : ""}${aria}${st}${a11y}>${inner}${o.body || ""}</div>`;
}

/**
 * 状态标签。
 * @param {string} text
 * @param {""|"info"|"success"|"warn"|"danger"|"gold"} level
 * @param {{attrs?:string,interactive?:boolean}} [o]
 */
export function chip(text, level = "", o = {}) {
  const cls = ["chip"];
  if (level) cls.push(level);
  if (o.interactive) cls.push("interactive");
  const aria = o.interactive ? "" : "";
  return `<span class="${cls.join(" ")}"${o.attrs ? " " + o.attrs : ""}${aria}>${text}</span>`;
}

/**
 * 徽标（星级 / 锁定 / 变体）。
 * @param {string} text
 * @param {""|"star"|"lock"|"variant"|"success"|"danger"} kind
 * @param {{lg?:boolean,attrs?:string}} [o]
 */
export function badge(text, kind = "", o = {}) {
  const cls = ["badge"];
  if (kind) cls.push(kind);
  if (o.lg) cls.push("lg");
  return `<span class="${cls.join(" ")}"${o.attrs ? " " + o.attrs : ""}>${text}</span>`;
}

/**
 * 网格容器（默认 4 列关卡格布局）。
 * @param {string[]|string} cells
 * @param {{cols?:number,cls?:string}} [o]
 */
export function grid(cells, o = {}) {
  const cls = o.cls || (o.cols ? "grid" + o.cols : "lvGrid");
  const style = o.cols && !o.cls ? ` style="--grid-cols:${o.cols}"` : "";
  const body = Array.isArray(cells) ? cells.join("") : cells;
  return `<div class="${cls}"${style}>${body || ""}</div>`;
}

/**
 * 数值块行（进度概览）。
 * @param {{label:string,value:string,cls?:string}[]} items
 */
export function statRow(items = []) {
  const body = items
    .map((it) => `<div class="stat${it.cls ? " " + it.cls : ""}"><span>${it.label}</span><b>${it.value}</b></div>`)
    .join("");
  return `<div class="statGrid">${body}</div>`;
}

/** 空态 */
export function emptyState(text) {
  return `<div class="empty">${text}</div>`;
}

/**
 * 进度条（返回组件 HTML；宽度是布局类动态值，允许内联）。
 * @param {number} pct 0~100
 */
export function progress(pct, o = {}) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="progress"${o.attrs ? " " + o.attrs : ""}><i style="width:${v.toFixed(1)}%"></i></div>`;
}

/**
 * 主题色注入：把场景数据的配色以自定义属性下发，CSS 侧统一走 var()。
 * @param {object} th THEMES[i]
 */
export function themeVars(th) {
  const pal = (th && th.pal) || [];
  const sky = (th && th.sky) || [];
  const accent = pal[0] || "";
  const parts = [];
  if (accent) parts.push("--theme-accent:" + accent);
  if (sky[0]) parts.push("--theme-sky:" + sky[0]);
  if (sky[1]) parts.push("--theme-sky-2:" + sky[1]);
  if (pal[1]) parts.push("--theme-ground:" + pal[1]);
  return parts.join(";");
}

/** 车辆色注入 */
export function vehicleVars(color) {
  return color ? "--veh-accent:" + color : "";
}
