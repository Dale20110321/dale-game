// 主菜单 / 暂停 / 面板容器
//  · 信息架构：Hero（标题 + 状态摘要 + 活体背景）+ 三组入口（主玩法 / 养成与进度 / 支持）
//  · 键盘导航：方向键在入口间移动、Enter 触发（按钮原生）、Esc 关闭面板
import { store } from "../core/store.js";
import { LEVELS, BRANCHES } from "../config/levels.js";
import { rankName } from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { isStorageAvailable } from "../core/storage.js";
import { statRow, badge } from "./components.js";
import { nextLevel } from "../game/game.js";

const overlay = document.getElementById("overlay");
const ovTitle = document.getElementById("ovTitle");
const ovSub = document.getElementById("ovSub");
const ovKeys = document.getElementById("ovKeys");
const menuGroups = document.getElementById("menuGroups");
const heroSummary = document.getElementById("heroSummary");
const modePanel = document.getElementById("modePanel");

// "继续"按钮（暂停时显示），由 setMenuChrome / togglePause 切换显隐
const resumeBtn = document.createElement("button");
resumeBtn.className = "btn lg";
resumeBtn.id = "btnResume";
resumeBtn.dataset.entry = "resume";
resumeBtn.textContent = "▶ 继续";
resumeBtn.style.display = "none";
resumeBtn.addEventListener("click", () => {
  if (store.state === "pause") togglePause();
});
{
  const mainGrp = document.querySelector('.menuGroup[data-group="main"] .grpBtns');
  if (mainGrp) mainGrp.insertBefore(resumeBtn, mainGrp.firstChild);
}

/** 已通关关卡数（星级 ≥ 1）——阶梯入口的显示依据 */
function clearedCount() {
  let n = 0;
  for (let i = 0; i < LEVELS.length; i++) if ((store.stars[i] || 0) >= 1) n++;
  return n;
}

/** 总星数（只统计 72 个支线关，不含最终任务槽位） */
function totalStars() {
  let n = 0;
  for (let i = 0; i < LEVELS.length; i++) n += store.stars[i] || 0;
  return n;
}

/**
 * Hero 区状态摘要（车辆 / 金币 / 通关进度 / 总星 / 段位 / 无限最佳）。
 * 结算后回到菜单会重新调用，因此数值始终与 store 一致（无需刷新页面）。
 */
export function renderHeroSummary() {
  if (!heroSummary) return;
  const veh = VEHICLES[store.currentVehicle] || VEHICLES[0];
  const P = store.progress || {};
  const rating = P.rating || 0;
  heroSummary.innerHTML = statRow([
    { label: "车辆", value: veh.name },
    { label: "金币", value: "🪙 " + store.gold },
    { label: "通关进度", value: clearedCount() + "/" + LEVELS.length },
    { label: "总星", value: totalStars() + "/" + LEVELS.length * 3 },
    { label: "段位", value: P.invited === true ? rankName(rating) + " " + rating : "未受邀" },
    { label: "无限最佳", value: (store.best || 0) + "m" },
  ]);
}

/**
 * 按存档状态刷新主菜单按钮：锁定项直接把"解锁条件 + 当前进度"写在按钮上，
 * 不需要进面板才知道（点击仍会打开面板查看条件，不会开局）。
 */
export function refreshMenuButtons() {
  const total = LEVELS.length;
  const done = clearedCount();
  const P = store.progress || {};

  const btnFinale = document.getElementById("btnFinale");
  if (btnFinale) {
    const unlocked = done >= total;
    btnFinale.textContent = unlocked
      ? (P.finaleDone ? "🎯 最终任务 ✅" : "🎯 最终任务")
      : `🎯 最终任务 · 通关 ${done}/${total} 关解锁`;
    btnFinale.classList.toggle("lockedBtn", !unlocked);
  }

  const btnRanked = document.getElementById("btnRanked");
  if (btnRanked) {
    const rating = P.rating || 0;
    btnRanked.textContent = P.invited === true
      ? "🏆 排位赛 · " + rankName(rating) + " " + rating
      : "🏆 排位赛 · 通关最终任务解锁";
    btnRanked.classList.toggle("lockedBtn", P.invited !== true);
  }

  const btnFree = document.getElementById("btnFree");
  if (btnFree) {
    btnFree.textContent = P.peak === true
      ? "♾️ 无限模式 · 可选图"
      : P.rating >= 2400
        ? "♾️ 无限模式"
        : "♾️ 无限模式 · 随机地形";
  }

  const btnSave = document.getElementById("btnSave");
  if (btnSave) {
    btnSave.textContent = isStorageAvailable() ? "💾 存档" : "💾 存档（不可用）";
  }

  const btnLevels = document.getElementById("btnLevels");
  if (btnLevels && !P.finaleDone) {
    const clearedBranches = (P.branchCleared || []).length;
    btnLevels.textContent = "🏁 闯关 · " + clearedBranches + "/" + BRANCHES.length + " 支线";
    btnLevels.classList.remove("lockedBtn");
  }
  renderHeroSummary();
}

/** 当前可见的入口按钮（键盘导航用） */
function visibleEntries() {
  if (!menuGroups) return [];
  const btns = [];
  if (resumeBtn.style.display !== "none") btns.push(resumeBtn);
  // 分组被隐藏（暂停态）时不要在里面游走焦点
  if (menuGroups.style.display === "none") return btns;
  for (const el of menuGroups.querySelectorAll("button[data-entry]")) {
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
  const target = resumeBtn.style.display !== "none"
    ? resumeBtn
    : document.getElementById("btnLevels");
  if (target && typeof target.focus === "function") {
    try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
  }
}

export function setMenuChrome() {
  ovTitle.textContent = "🚲 越野自行车";
  ovSub.textContent = "物理引擎越野：支线任务 · 最终任务 · 排位赛 · 无限模式";
  ovKeys.textContent =
    "→/D 加速(空中顺时针转)  ←/A 刹车(空中逆时针转)  P/Esc 暂停  R 重开  M 静音  ↑↓←→ 选择";
  if (menuGroups) menuGroups.style.display = "";
  resumeBtn.style.display = "none";
  refreshMenuButtons();
  focusDefault();
}

export function hideOverlay() {
  overlay.classList.add("hidden");
}

export function showPanel(html) {
  modePanel.innerHTML = html;
  modePanel.classList.remove("hidden");
  // 进场过渡：先落到 .enter（位移 + 透明），强制回流后移除 → 过渡到基础态
  modePanel.classList.add("enter");
  void modePanel.offsetWidth;
  modePanel.classList.remove("enter");
}

export function hidePanel() {
  modePanel.classList.add("hidden");
  modePanel.innerHTML = "";
}

/** 回到主菜单（结算 / 无限模式结束 / 面板返回） */
export function showMenu() {
  store.state = "menu";
  store.raceAI = null;
  hidePanel();
  const groups = document.getElementById("menuGroups");
  if (groups) groups.style.display = "";
  setMenuChrome();
  overlay.classList.remove("hidden");
}

/**
 * 结算结果卡（Task 8.3）：星级逐颗点亮 + 金币滚动计数 + 段位分变化 + 下一关/返回菜单。
 * 由 game 层通过 presenter.presentResult 注入调用（game 不 import ui）。
 * @param {{title?:string,sub?:string,stars?:number,goldGain?:number,goldTotal?:number,
 *          ratingDelta?:number,rating?:number,time?:number,nextLabel?:string}} res
 */
export function showResultCard(res = {}) {
  store.state = "ended";
  overlay.classList.remove("hidden");
  const groups = document.getElementById("menuGroups");
  if (groups) groups.style.display = "none";
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
      const groups = document.getElementById("menuGroups");
      if (groups) groups.style.display = "";
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
    ovSub.textContent = "休息一下，随时继续（R 重开 / P 继续）";
    ovKeys.textContent = "";
    if (menuGroups) menuGroups.style.display = "none";
    resumeBtn.style.display = "";
    overlay.classList.remove("hidden");
    focusDefault();
  } else if (store.state === "pause") {
    store.state = "play";
    overlay.classList.add("hidden");
  }
}
