// 屏幕提示（纯 DOM 工具，无任何游戏逻辑依赖，避免层级倒挂）
//  · 四型分级 info / success / warn / danger（各有图标与色，色值由 CSS 从令牌取）
//  · 同屏最多 2 条，超出进入排队，前一条退出后自动补位
//  · **同文案去重**：重复提示就地续期而不是再排一条（见 showToast）
//  · 队列有上界：批量操作（连点升级）不会把真正重要的新提示挤出可视时间
//  · 进出场动画走令牌时长/缓动；prefers-reduced-motion 下降级为无位移（CSS 负责）
const toastEl = document.getElementById("toast");
const comboEl = document.getElementById("comboTag");
let comboTimer = null;

/** 提示级别（顺序即优先级） */
export const TOAST_LEVELS = ["info", "success", "warn", "danger"];
/** 同屏上限 */
export const TOAST_MAX = 2;
/**
 * 队列上界。
 *
 * ★ 为什么必须有：升级车间连点一次就是一条提示，20 连点会排 20 条。
 *   没有上界时它们按 1.6s 一条慢慢播，玩家要盯 30 秒才看得到最后一条，
 *   期间真正的关键提示（成就、金币不足）根本挤不进来。
 *   超出后丢**最旧**的一条：最新状态永远可见，过期状态没有保留价值。
 */
export const TOAST_QUEUE_MAX = 4;
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

  item.timer = setTimeout(() => finish(item), item.ms);
}

function finish(item) {
  const i = live.indexOf(item);
  if (i >= 0) live.splice(i, 1);
  if (item.timer) clearTimeout(item.timer);
  item.timer = 0;
  if (item.el) {
    if (item.el.classList && item.el.classList.remove) item.el.classList.remove("show");
    if (typeof item.el.remove === "function") item.el.remove();
  }
  const next = queue.shift();
  if (next) present(next);
}

/** 同文案已在屏上时：重置它的停留计时，让它"一直是最新状态"而不是再来一条 */
function restartTimer(item) {
  if (item.timer) clearTimeout(item.timer);
  item.timer = setTimeout(() => finish(item), item.ms);
}

/**
 * 屏幕提示。
 *
 * ★ 去重是批量操作场景下的刚需：
 *   升级车间连点 20 次会排 20 条"🔧 引擎 Lv3 → Lv4"，内容几乎相同却各占一格，
 *   玩家要等 20×1.6s 才能看到最后一条真正重要的信息。
 *   现在同文案的提示**就地续期**，队列满时丢最旧的一条，
 *   保证"最新状态"永远可见。
 *
 * @param {string} txt 文案
 * @param {number} [ms] 停留毫秒（默认 900）
 * @param {""|"info"|"success"|"warn"|"danger"} [level] 显式级别；不传则按文案推断
 * @returns {string} 实际使用的级别
 */
export function showToast(txt, ms, level) {
  const lv = TOAST_LEVELS.includes(level) ? level : inferLevel(txt);
  const text = String(txt === undefined || txt === null ? "" : txt);
  // 已在屏上：续期，不新增
  const shown = live.find((it) => it.txt === text);
  if (shown) {
    if (ms) shown.ms = ms;
    restartTimer(shown);
    return lv;
  }
  // 已在队列里：只更新时长，不重复入队
  const qi = queue.findIndex((it) => it.txt === text);
  if (qi >= 0) {
    if (ms) queue[qi].ms = ms;
    return lv;
  }
  const item = { txt: text, ms: ms || 900, level: lv, el: null, timer: 0 };
  if (live.length >= TOAST_MAX) {
    queue.push(item);
    // 超出上界：丢最旧的（新的更重要）
    while (queue.length > TOAST_QUEUE_MAX) queue.shift();
  } else {
    present(item);
  }
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