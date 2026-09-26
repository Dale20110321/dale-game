// 屏幕提示（纯 DOM 工具，无任何游戏逻辑依赖，避免层级倒挂）
//  · 四型分级 info / success / warn / danger（各有图标与色，色值由 CSS 从令牌取）
//  · 同屏最多 2 条，超出进入排队，前一条退出后自动补位
//  · 进出场动画走令牌时长/缓动；prefers-reduced-motion 下降级为无位移（CSS 负责）
const toastEl = document.getElementById("toast");
const comboEl = document.getElementById("comboTag");
let comboTimer = null;

/** 提示级别（顺序即优先级） */
export const TOAST_LEVELS = ["info", "success", "warn", "danger"];
/** 同屏上限 */
export const TOAST_MAX = 2;
/** 级别图标 */
export const TOAST_ICON = { info: "ℹ️", success: "✅", warn: "⚠️", danger: "⛔" };

const live = [];
const queue = [];

/**
 * 由文案推断级别：让既有 30+ 处调用点不改也能获得合理分级。
 * 关键词优先于图标；无法判断时归为 info。
 */
export function inferLevel(txt) {
  const s = String(txt === undefined || txt === null ? "" : txt);
  if (/⛔|❌|😵|失败|出错|不足|不可用/.test(s)) return "danger";
  if (/⚠️|🔒|超速|耗尽|紧张|未解锁/.test(s)) return "warn";
  if (/🏆|🎉|✅|获胜|通过|达成|解锁|已切|已导入|已导出|已重置|新纪录/.test(s)) return "success";
  return "info";
}

/** 供断言观察：当前同屏 / 排队中的提示级别 */
export function toastState() {
  return { live: live.map((t) => t.level), queue: queue.map((t) => t.level) };
}

/** 清空全部提示（测试与场景重置用） */
export function clearToasts() {
  live.length = 0;
  queue.length = 0;
  if (toastEl) toastEl.innerHTML = "";
}

function present(item) {
  if (!toastEl) {
    live.push(item);
    return;
  }
  const el = document.createElement("div");
  el.className = "toastItm " + item.level;
  if (typeof el.setAttribute === "function") {
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", item.level + " 提示：" + item.txt);
  }
  el.textContent = (TOAST_ICON[item.level] || "") + "　" + item.txt;
  if (typeof toastEl.appendChild === "function") toastEl.appendChild(el);
  item.el = el;
  live.push(item);

  const show = () => {
    if (el.classList && el.classList.add) el.classList.add("show");
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(show);
  else show();

  const finish = () => {
    const i = live.indexOf(item);
    if (i >= 0) live.splice(i, 1);
    if (el.classList && el.classList.remove) el.classList.remove("show");
    if (typeof el.remove === "function") el.remove();
    const next = queue.shift();
    if (next) present(next);
  };
  if (typeof setTimeout === "function") setTimeout(finish, item.ms);
}

/**
 * 居中提示。
 * @param {string} txt 文案
 * @param {number} [ms] 停留毫秒（默认 900）
 * @param {""|"info"|"success"|"warn"|"danger"} [level] 显式级别；不传则按文案推断
 * @returns {string} 实际使用的级别
 */
export function showToast(txt, ms, level) {
  const lv = TOAST_LEVELS.includes(level) ? level : inferLevel(txt);
  const item = {
    txt: String(txt === undefined || txt === null ? "" : txt),
    ms: ms || 900,
    level: lv,
    el: null,
  };
  if (live.length >= TOAST_MAX) queue.push(item);
  else present(item);
  return lv;
}

/** 特技连招提示（居中大字，进出场走令牌时长） */
export function showCombo(txt) {
  if (!comboEl) return;
  comboEl.textContent = txt;
  comboEl.style.opacity = 1;
  comboEl.style.transform = "translate(-50%,-50%) scale(1)";
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => {
    comboEl.style.opacity = 0;
    comboEl.style.transform = "translate(-50%,-50%) scale(1.35)";
  }, 1400);
}
