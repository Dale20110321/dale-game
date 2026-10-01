// 主菜单 / 暂停 / 面板容器
//  · 信息架构：Hero（标题 + 状态摘要 + 活体背景）+ 三组入口（主玩法 / 养成与进度 / 支持）
//  · 键盘导航：方向键在入口间移动、Enter 触发（按钮原生）、Esc 关闭面板
import { store, uiHooks } from "../core/store.js";
import { syncTouchVisibility } from "../core/input.js";
import { LEVELS } from "../config/levels.js";
import { isStorageAvailable } from "../core/storage.js";
import { statRow, badge, chip } from "./components.js";
import { nextLevel } from "../game/game.js";

const overlay = document.getElementById("overlay");
const ovTitle = document.getElementById("ovTitle");
const ovSub = document.getElementById("ovSub");
const heroSummary = document.getElementById("heroSummary");
const homeView = document.getElementById("homeView");
const modeTabs = document.getElementById("modeTabs");
const modePanel = document.getElementById("modePanel");

// 暂停操作条（overlay 顶层容器）：包含「继续」与「返回主页」。
// 放在 menuGroups 之外 —— 否则暂停时 menuGroups 被 display:none 会把按钮一起藏掉（旧的"进游戏退不出"）。
const pauseBar = document.createElement("div");
pauseBar.className = "pauseBar";
pauseBar.id = "pauseBar";
pauseBar.style.display = "none";

const resumeBtn = document.createElement("button");
resumeBtn.className = "btn lg";
resumeBtn.id = "btnResume";
resumeBtn.dataset.entry = "resume";
resumeBtn.textContent = "▶ 继续";
resumeBtn.addEventListener("click", () => {
  if (store.state === "pause") togglePause();
});

const homeBtn = document.createElement("button");
homeBtn.className = "btn ghost lg";
homeBtn.id = "btnHome";
homeBtn.dataset.entry = "home";
homeBtn.textContent = "🏠 返回主页";
homeBtn.addEventListener("click", () => {
  // 暂停/结束都回主页：状态交给 showMenu 统一处理
  if (store.state === "pause" || store.state === "ended") showMenu();
});
pauseBar.appendChild(resumeBtn);
pauseBar.appendChild(homeBtn);
if (overlay && overlay.appendChild) overlay.appendChild(pauseBar);

// 游戏画面内常驻的「返回主页」悬浮按钮（右上角，进游戏显示 / 回菜单隐藏）
const homeFloat = document.getElementById("btnHomeFloat");
if (homeFloat) {
  homeFloat.addEventListener("click", () => {
    if (store.state === "play" || store.state === "pause" || store.state === "ended") showMenu();
  });
}

/** 已通关关卡数（星级 ≥ 1）——阶梯入口的显示依据 */
function clearedCount() {
  let n = 0;
  for (let i = 0; i < LEVELS.length; i++) if ((store.stars[i] || 0) >= 1) n++;
  return n;
}

/** 总星数（只统计 72 个支线关，不含最终任务槽位） */


/**
 * Hero 区状态摘要：只留「通关 n/72」与「金币」两个数。
 * 结算后回到菜单会重新调用，因此数值始终与 store 一致（无需刷新页面）。
 */
export function renderHeroSummary() {
  if (!heroSummary) return;
  // 主页面只保留真正驱动决策的两个数：能打多少关、手里有多少钱。
  // 车辆 / 总星 / 段位 / 无限最佳都收进各自面板（车库 / 存档 / 排位 / 无限），
  // 不再在首屏堆六个 chip 把主视觉挤掉。
  heroSummary.innerHTML = [
    chip("通关 " + clearedCount() + "/" + LEVELS.length),
    chip("🪙 " + store.gold, "gold"),
  ].join("");
}

/** 菜单态显示关卡地图 / 面板态隐藏它（一屏一视图，避免叠在一起把顶部挤出视口） */
function setMenuGroupsVisible(v) {
  if (homeView) homeView.style.display = v ? "" : "none";
}

/**
 * 按存档状态刷新主菜单按钮：按钮上只留**短标签 + 当前进度**（避免换行撑乱版式），
 * 完整的解锁条件写在 aria-label / title，并在点开的面板里给出明确说明。
 */
export function refreshMenuButtons() {
  renderHeroSummary();
  // 主页面入口是图标按钮，没有文字行可写解锁条件 —— 存储可用性改用 title / 锁定态表达；
  // 完整解锁条件由 finaleTile（主页面卡片）与排位 / 无限面板各自呈现。
  const btnSave = document.getElementById("btnSave");
  if (btnSave) {
    const okSave = isStorageAvailable();
    btnSave.title = okSave ? "存档管理" : "存档（浏览器存储不可用）";
    btnSave.classList.toggle("lockedBtn", !okSave);
  }
}

/** 当前可见的入口按钮（键盘导航用） */
function visibleEntries() {
  if (!homeView) return [];
  const btns = [];
  // 暂停态：pauseBar 内的「继续 / 返回主页」可见
  if (store.state === "pause" && pauseBar) {
    if (resumeBtn) btns.push(resumeBtn);
    if (homeBtn) btns.push(homeBtn);
    return btns;
  }
  if (resumeBtn.style.display !== "none") btns.push(resumeBtn);
  // 分组被隐藏（暂停态）时不要在里面游走焦点
  if (homeView.style.display === "none") return btns;
  for (const el of document.querySelectorAll(".mtab, .menuFoot button[data-entry]")) {
    if (el.disabled) continue;
    if (el.offsetParent === null) continue; // 浏览器中：被 display:none 隐藏的祖先
    btns.push(el);
  }
  return btns;
}

/** 键盘导航：方向键移动、默认焦点落在"继续/闯关" */
function onMenuKeydown(e) {
  if (!overlay || overlay.classList.contains("hidden")) return;
  if (store.state !== "menu" && store.state !== "pause") return;
  // Esc 关面板：不依赖"当前有可聚焦入口"，优先处理
  if (e.code === "Escape" && modePanel && !modePanel.classList.contains("hidden")) {
    e.preventDefault();
    hidePanel();
    return;
  }
  const btns = visibleEntries();
  if (!btns.length) return;
  const active = document.activeElement;
  const i = btns.indexOf(active);
  const move = (d) => {
    e.preventDefault();
    const next = i < 0 ? 0 : (i + d + btns.length) % btns.length;
    btns[next].focus();
  };
  if (e.code === "ArrowDown" || e.code === "ArrowRight") move(1);
  else if (e.code === "ArrowUp" || e.code === "ArrowLeft") move(-1);
}
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("keydown", onMenuKeydown);
}

/** 默认焦点：暂停时落在"继续"，否则落在"闯关" */
function focusDefault() {
  const target = store.state === "pause"
    ? resumeBtn
    : (modeTabs && modeTabs.querySelector(".mtab.is-on")) || modeTabs;
  if (target && typeof target.focus === "function") {
    try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
  }
}

export function setMenuChrome() {
  ovTitle.textContent = "🚲 越野自行车";
  // 副标题不再复述模式名（模式名已由下方 tab 表达）
  if (ovSub) ovSub.hidden = true;
  if (homeView) homeView.style.display = "";
  resumeBtn.style.display = "none";
  if (pauseBar) pauseBar.style.display = "none";
  refreshMenuButtons();
  // 主页面 = 关卡地图，交给 panels.js 重画（它是唯一持有支线/解锁逻辑的地方）
  if (uiHooks.onHome) uiHooks.onHome();
  focusDefault();
}

export function hideOverlay() {
  overlay.classList.add("hidden");
  // 悬浮返回按钮用内联 flex 覆盖 CSS 的 display:none（设 "" 会被 CSS 默认值盖住而不显示）
  if (homeFloat) homeFloat.style.display = "flex";
  syncTouchVisibility(); // 进游戏：触摸方向键该出现了
}

export function showPanel(html) {
  // 面板打开时收起菜单分组：改成"一屏一视图"，避免菜单与面板叠在一起
  // （叠着会把顶部挤出视口，看起来坏且点不到）
  setMenuGroupsVisible(false);
  modePanel.innerHTML = html;
  modePanel.classList.remove("hidden");
  // 进场过渡：先落到 .enter（位移 + 透明），强制回流后移除 → 过渡到基础态
  modePanel.classList.add("enter");
  void modePanel.offsetWidth;
  modePanel.classList.remove("enter");
  // 面板在滚动容器里时保证可见（否则小屏/长内容会停在屏幕外 → "点不动"）
  if (typeof modePanel.scrollIntoView === "function") {
    try { modePanel.scrollIntoView({ block: "nearest" }); } catch (e) { modePanel.scrollIntoView(); }
  }
}

export function hidePanel() {
  modePanel.classList.add("hidden");
  modePanel.innerHTML = "";
  setMenuGroupsVisible(true);
}

/** 回到主菜单（结算 / 无限模式结束 / 面板返回） */
export function showMenu() {
  store.state = "menu";
  store.raceAI = null;
  hidePanel();
  setMenuGroupsVisible(true);
  if (pauseBar) pauseBar.style.display = "none";
  if (homeFloat) homeFloat.style.display = "none";
  setMenuChrome();
  overlay.classList.remove("hidden");
  syncTouchVisibility(); // 回菜单：收掉操作键，别挡住底部图标栏
}

/**
 * 结算结果卡（Task 8.3）：星级逐颗点亮 + 金币滚动计数 + 段位分变化 + 下一关/返回菜单。
 * 由 game 层通过 presenter.presentResult 注入调用（game 不 import ui）。
 * @param {{title?:string,sub?:string,stars?:number,goldGain?:number,goldTotal?:number,
 *          ratingDelta?:number,rating?:number,time?:number,nextLabel?:string}} res
 */
export function showResultCard(res = {}) {
  store.state = "ended";
  if (pauseBar) pauseBar.style.display = "none";
  overlay.classList.remove("hidden");
  setMenuGroupsVisible(false);
  renderHeroSummary();

  const stars = res.stars === undefined ? null : Math.max(0, Math.min(3, res.stars));
  const starHtml = stars === null
    ? ""
    : `<div class="resultStars">${[0, 1, 2]
        .map((i) => badge(i < stars ? "★" : "☆", i < stars ? "star" : "lock", { lg: true, attrs: `style="--i:${i}"` }))
        .join("")}</div>`;

  const items = [{ label: "金币", value: `<b class="roll" data-roll="${res.goldTotal === undefined ? store.gold || 0 : res.goldTotal}">0</b>` },
    { label: "本局获得", value: "🪙 +" + (res.goldGain || 0) },
    { label: "本局用时", value: res.time ? res.time.toFixed(1) + "s" : "—" }];
  if (res.ratingDelta) {
    items.push({ label: "段位分", value: (res.ratingDelta > 0 ? "+" : "") + res.ratingDelta + " → " + res.rating });
  }

  showPanel(`<div class="resultCard">
  <div class="modeTitle">${res.title || "🏁 本局结束"}</div>
  ${res.sub ? `<div class="panelNote">${res.sub}</div>` : ""}
  ${starHtml}
  ${statRow(items)}
  <div class="row2">
    <button class="btn" data-act="resultNext" aria-label="${res.nextLabel || "下一关"}">${res.nextLabel || "下一关 →"}</button>
    <button class="btn ghost" data-act="resultMenu" aria-label="返回主菜单">🏠 返回菜单</button>
  </div>
</div>`);

  startGoldRoll();
}

/** 金币滚动计数（≤0.6s；减少动效环境直接显示终值） */
function startGoldRoll() {
  const el = modePanel ? modePanel.querySelector(".roll") : null;
  if (!el) return;
  const target = Number(el.dataset.roll) || 0;
  if (reducedMotion() || typeof setInterval !== "function") {
    el.textContent = String(target);
    return;
  }
  let cur = 0;
  let steps = 0;
  const timer = setInterval(() => {
    steps++;
    cur = Math.round(target * Math.min(1, steps / 18));
    el.textContent = String(cur);
    if (steps >= 18) {
      el.textContent = String(target);
      clearInterval(timer);
    }
  }, 33);
}

function reducedMotion() {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? !!window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  } catch (e) {
    return false;
  }
}

// 结果卡按钮（面板内事件委托；panels.js 忽略它不认识的 data-act）
if (modePanel && typeof modePanel.addEventListener === "function") {
  modePanel.addEventListener("click", (e) => {
    const el = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el) return;
    if (el.dataset.act === "resultNext") {
      hidePanel();
      nextLevel();
    } else if (el.dataset.act === "resultMenu") {
      showMenu();
    }
  });
}

export function togglePause() {
  if (store.state === "play") {
    store.state = "pause";
    ovTitle.textContent = "⏸ 已暂停";
    if (ovSub) { ovSub.hidden = false; ovSub.textContent = "休息一下，随时继续，或返回主页"; }
    if (homeView) homeView.style.display = "none";
    // 浮按钮的 z-index 已降到 #overlay 之下（否则会压住主菜单与暂停遮罩），
    // 但遮罩是半透明的，仍会透出轮廓 —— 暂停时直接不显示。
    if (homeFloat) homeFloat.style.display = "none";
    if (pauseBar) pauseBar.style.display = "";
    resumeBtn.style.display = "";
    homeBtn.style.display = "";
    overlay.classList.remove("hidden");
    focusDefault();
  } else if (store.state === "pause") {
    store.state = "play";
    overlay.classList.add("hidden");
    if (homeFloat) homeFloat.style.display = "flex"; // 恢复「🏠 返回主页」
  }
}
