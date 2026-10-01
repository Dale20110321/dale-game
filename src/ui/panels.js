// 面板：支线任务 / 比赛 / 最终任务 / 排位赛 / 无限模式 / 车库 / 成就 / 存档
//  · 支线面板：12 张支线卡片（场景主题 / 完成度 / 总星）→ 点开才渲染该支线 6 个关卡格
//  · 全部面板交互走 #modePanel 上的事件委托（面板 HTML 重绘不会丢监听）
//  · 本模块只 import 其它层，绝不反向被 import
import {
  ACHS, toM, toKmh, rankName, MAX_LV, topSpeedOf, RATING_ADVANCED, RATING_PEAK,
  RATING_WIN_GAIN, RATING_LOSS, RATING_WIN_GAIN_ADVANCED, RATING_LOSS_ADVANCED,
} from "../config/constants.js";
import { THEMES } from "../config/themes.js";
import {
  LEVELS, BRANCHES, LEVELS_PER_BRANCH, N_BRANCHES, FINALE, FINALE_INDEX,
  branchLevel, globalIndexOf, branchOfGlobal, branchProgress, starTime, VARIANT_INFO,
} from "../config/levels.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, uiHooks } from "../core/store.js";
import {
  save, downloadSave, parseSave, importSave, resetSave,
  isStorageAvailable, availableFreeThemes, isAdvancedUnlocked,
  listSlots, switchSlot, createSlot, deleteSlot, currentSlot, MAX_SLOTS,
} from "../core/storage.js";
import { showToast } from "../core/toast.js";
import { initAudio } from "../core/audio.js";
import { hasAch } from "../game/progress.js";
import { getQuality, setQuality, QUALITY, QUALITY_LABEL } from "../render/postfx.js";
import { getRenderScale, setRenderScalePersisted, RENDER_SCALES, RENDER_SCALE_LABEL } from "../render/postfx.js";
import { showPanel, hidePanel, showMenu, refreshMenuButtons } from "./menu.js";
import { card, chip, badge, statRow, emptyState, themeVars } from "./components.js";

let api = {};
/** 支线墙面板：当前展开的支线下标（-1 = 全部收起）与面板种类（level | race） */
let openBranch = -1;
let panelKind = "level";
/** 主页面容器（关卡地图）：菜单态显示，面板态隐藏 —— 与 #modePanel 是"一屏一视图"关系 */
const homeView = document.getElementById("homeView");
/** 存档面板的临时视图状态（导入待确认数据 / 对比摘要 / 提示 / 二次确认） */
const saveView = { pending: null, summary: null, error: "", note: "", confirmReset: false };

// ---------------- 接线 ----------------

export function initPanels(a) {
  api = a || {};
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => {
      initAudio();
      if (store.state === "menu") fn();
    });
  };
  bind("btnGarage", renderGaragePanel);
  bind("btnAch", renderAchPanel);
  bind("btnSave", openSavePanel);

  // 玩法切换：闯关 / 比赛 / 排位 / 无限
  const tabs = document.getElementById("modeTabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-mode]") : null;
      if (!el) return;
      initAudio();
      if (store.state === "menu") selectMode(el.dataset.mode);
    });
  }

  const panel = document.getElementById("modePanel");
  if (panel) {
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("change", onPanelChange);
    // 可访问性（Task 9.1）：带 role=button 的卡片支持 Enter / 空格触发
    panel.addEventListener("keydown", onPanelKeydown);
  }
  // 主页面（关卡地图）与弹出面板共用同一套 data-act 委托
  const home = document.getElementById("homeView");
  if (home) {
    home.addEventListener("click", onPanelClick);
    home.addEventListener("keydown", onPanelKeydown);
  }
  // menu.js 的 showMenu() 也要重画主页面；panels 已 import menu，反向 import 会成环，
  // 故经 store 的钩子槽单向接线（见 core/store.js 的 uiHooks 注释）。
  uiHooks.onHome = () => { openBranch = -1; selectMode("level"); };
  uiHooks.onHome(); // 首屏就要有关卡地图：#homeView 在 HTML 里是空的
  refreshMenuButtons();
}

/** 玩法 tab 切换：闯关/比赛渲染关卡地图；排位/无限走全屏面板 */
export function selectMode(mode) {
  const m = mode === "race" || mode === "ranked" || mode === "free" ? mode : "level";
  for (const b of document.querySelectorAll("#modeTabs .mtab")) {
    const on = b.dataset.mode === m;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  }
  if (m === "level" || m === "race") {
    // 从"排位/无限"切回地图时，上一个面板还开着，必须先收起来，
    // 否则 modePanel 会盖住刚渲染好的关卡地图。
    hidePanel();
    if (homeView) homeView.style.display = "";
    renderHomeView(m);
  } else {
    if (homeView) homeView.style.display = "none";
    if (m === "ranked") renderRankedPanel();
    else renderFreePanel();
  }
}

/**
 * 主页面视图：最终任务 + 12 条支线的关卡地图。
 *
 * 旧版是"点开「闯关」才看得到、且 12 张卡默认全收起"，玩家得逐张扫读才能找到自己那条。
 * 这里直接展开**当前前沿支线**，并在卡片上标「▶ 继续 第 N 关」，
 * 让"我在第几关 / 下一关是什么 / 还剩多少"在一屏内自明。
 */
export function renderHomeView(mode) {
  const host = document.getElementById("homeView");
  if (!host) return;
  panelKind = mode === "race" ? "race" : "level";
  // 展开哪条支线：**优先当前关卡所在的支线**（返回首页 = 回到正在打的那一关），
  // 其次才是"前沿"。openBranch ≥ 0 说明玩家手动点开了某条支线，尊重之。
  if (openBranch < 0 || !branchOpen(openBranch)) {
    const cur = currentBranch();
    openBranch = cur >= 0 ? cur : frontierBranch();
  }
  // 顺序：最终任务 → 当前支线的 6 个关卡 → 12 支线总览。
  // 关卡格排在总览之前，玩家进主页面第一眼看到的是"现在打哪一关"，而不是先扫一遍 12 张卡。
  host.innerHTML =
    finaleTile() +
    (openBranch >= 0 ? levelBlock() : "") +
    `<div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>`;
}

/** 支线 bi 已通关关卡数（星级 ≥ 1） */
function branchCleared(bi) {
  let n = 0;
  for (let k = 0; k < LEVELS_PER_BRANCH; k++) if ((store.stars[globalIndexOf(bi, k)] || 0) >= 1) n++;
  return n;
}

/**
 * 当前关卡所在的支线：返回首页时优先展开它，把玩家带回"正在打的那一关"，
 * 而不是笼统的"第一条还没打完的支线"。
 * 未开放 / 越界时返回 -1，交由调用方回退。
 */
function currentBranch() {
  const gi = store.selLevel;
  if (!Number.isInteger(gi) || gi < 0 || gi >= LEVELS.length) return -1;
  const bi = branchOfGlobal(gi);
  return branchOpen(bi) ? bi : -1;
}

/**
 * 前沿支线：已开放、**且尚未全部通关**的第一条。
 *
 * ★ 修 bug：原来写的是 `firstLockedK(i) < LEVELS_PER_BRANCH`，
 *   而 firstLockedK 在支线全通时返回的是 `LEVELS_PER_BRANCH - 1`（不是 6），
 *   于是"已全通的第一条"永远满足条件 —— 前沿被死死钉在第一条支线（翠野乡道），
 *   展开的关卡块也跟着一直停在翠野乡道。改用 branchCleared() 判定"真的没打完"。
 */
function frontierBranch() {
  for (let i = 0; i < N_BRANCHES; i++) {
    if (branchOpen(i) && branchCleared(i) < LEVELS_PER_BRANCH) return i;
  }
  const last = Math.floor(unlockFrontier() / LEVELS_PER_BRANCH);
  return Math.max(0, Math.min(N_BRANCHES - 1, last));
}

/** 主页面顶部的最终任务卡：锁定时也显示进度，给出终极目标感 */
function finaleTile() {
  const done = clearedCount();
  const total = LEVELS.length;
  const unlocked = done >= total;
  const cleared = store.progress.finaleDone === true;
  return card({
    cls: "vehCard finaleTile",
    icon: unlocked ? "🎯" : "🔒",
    title: FINALE.name,
    sub: `${Math.round(toM(FINALE.len))}m · 依次穿越 6 个场景 · 坡度 ${Math.round(FINALE.maxSlope)}°`,
    meta: cleared ? "✅ 已通关，可重复挑战"
      : unlocked ? "已解锁 · 点击开始"
        : `通关全部 ${total} 关后解锁`,
    right: unlocked ? "▶" : `${done}/${total}`,
    interactive: unlocked,
    locked: !unlocked,
    attrs: unlocked ? 'data-act="finaleStart"' : "",
  });
}

/** 键盘激活面板内的伪按钮（真按钮由浏览器原生处理） */
function onPanelKeydown(e) {
  if (e.code !== "Enter" && e.code !== "Space") return;
  const el = e.target && e.target.closest ? e.target.closest('[role="button"][data-act]') : null;
  if (!el) return;
  if (e.preventDefault) e.preventDefault();
  if (el.getAttribute && el.getAttribute("aria-disabled") === "true") return;
  if (el.classList && el.classList.contains("locked")) return;
  el.click();
}

/** 面板内事件委托（按钮统一用 data-act 标注） */
function onPanelClick(e) {
  const el = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
  if (!el) return;
  const act = el.dataset.act;
  switch (act) {
    case "back":
      showMenu();
      return;
    case "branch": {
      const bi = +el.dataset.bi;
      if (!branchOpen(bi)) {
        showToast("🔒 支线「" + BRANCHES[bi].name + "」尚未开放：请先推进前面的支线", 900);
        return;
      }
      openBranch = openBranch === bi ? -1 : bi;
      rerender();
      return;
    }
    case "branchClose":
      openBranch = -1;
      rerender();
      return;
    case "play":
      playCell(+el.dataset.gi);
      return;
    case "veh":
      buyOrSelectVeh(+el.dataset.veh);
      return;
    case "buyUltra":
      buyUltra(+el.dataset.veh);
      return;
    case "finaleStart":
      api.startGame("level", FINALE_INDEX);
      return;
    case "ranked":
      api.startGame("ranked", store.selLevel || 0, { advanced: el.dataset.adv === "1" });
      return;
    case "freeRandom":
      api.startGame("free");
      return;
    case "free":
      api.startGame("free", undefined, { theme: +el.dataset.theme });
      return;
    case "quality":
      setQuality(el.dataset.q);
      renderSavePanel();
      showToast("🎚 画质已切到「" + QUALITY_LABEL[getQuality()] + "」", 800);
      return;
    case "scale":
      setRenderScalePersisted(el.dataset.s);
      renderSavePanel();
      showToast("🔍 锐度已切到「" + RENDER_SCALE_LABEL[getRenderScale()] + "」", 800);
      return;
    case "export":
      doExport();
      return;
    case "importPick":
      pickSaveFile();
      return;
    case "importConfirm":
      doImport();
      return;
    case "importCancel":
      saveView.pending = null;
      saveView.summary = null;
      renderSavePanel();
      return;
    case "resetAsk":
      saveView.confirmReset = true;
      renderSavePanel();
      return;
    case "resetCancel":
      saveView.confirmReset = false;
      renderSavePanel();
      return;
    case "resetConfirm":
      doReset();
      return;
    case "slotSwitch":
      doSwitchSlot(+el.dataset.slot);
      return;
    case "slotNew":
      doNewSlot();
      return;
    case "slotDelete":
      doDeleteSlot(+el.dataset.slot);
      return;
    default:
      return;
  }
}

/** 存档面板内的文件选择（导入） */
function onPanelChange(e) {
  const input = e.target;
  if (!input || input.id !== "saveFile") return;
  const f = input.files && input.files[0];
  if (f) readSaveFile(f);
}

/** 重绘当前支线墙面板（保持展开状态） */
function rerender() {
  // 主页面（关卡地图）与弹出面板各有自己的宿主，重绘到对的那个
  const home = document.getElementById("homeView");
  if (home && home.innerHTML) { renderHomeView(panelKind === "race" ? "race" : "level"); return; }
  if (panelKind === "race") renderRacePanel(openBranch);
  else renderLevelsPanel(openBranch);
}

// ---------------- 支线解锁规则 ----------------

/** 全局解锁前沿：max(显式解锁位, 最高有星关卡 + 1) */
function unlockFrontier() {
  let hi = -1;
  for (let i = 0; i < LEVELS.length; i++) if ((store.stars[i] || 0) > 0) hi = i;
  return Math.max(store.unlocked || 0, hi + 1);
}

/** 支线入口是否开放（支线之间互不阻塞：前沿覆盖到该支线即可进入） */
function branchOpen(bi) {
  return bi >= 0 && bi < N_BRANCHES && bi * LEVELS_PER_BRANCH <= unlockFrontier();
}

/** 支线 bi 第 k 关是否解锁（支线内链式：前 k 关都要通过） */
function levelUnlocked(bi, k) {
  if (!branchOpen(bi)) return false;
  for (let j = 0; j < k; j++) {
    if (!((store.stars[globalIndexOf(bi, j)] || 0) >= 1)) return false;
  }
  return true;
}

/** 支线 bi 内第一个未通关的关卡下标（全部通关时返回最后一关） */
function firstLockedK(bi) {
  for (let j = 0; j < LEVELS_PER_BRANCH; j++) {
    if (!((store.stars[globalIndexOf(bi, j)] || 0) >= 1)) return j;
  }
  return LEVELS_PER_BRANCH - 1;
}

/** 已通关关卡数（星级 ≥ 1） */
function clearedCount() {
  let n = 0;
  for (let i = 0; i < LEVELS.length; i++) if ((store.stars[i] || 0) >= 1) n++;
  return n;
}

// ---------------- 格式化 ----------------

/** 秒 → "m:ss" / "Xs"（关卡三星时限） */
function fmtClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? m + ":" + String(s % 60).padStart(2, "0") : s + "s";
}

/** 米 → "km"（累计里程） */
function fmtKm(m) {
  const km = (Number(m) || 0) / 1000;
  return (km >= 100 ? km.toFixed(0) : km.toFixed(2)) + " km";
}

/** 秒 → "h"（累计时长） */
function fmtHours(sec) {
  const h = (Number(sec) || 0) / 3600;
  return (h >= 10 ? h.toFixed(1) : h.toFixed(2)) + " h";
}

/** ISO 时间 → 本地 "YYYY-MM-DD HH:mm"（无记录显示 —） */
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

// ---------------- 13.1 支线任务面板 ----------------

function branchCard(bi) {
  const b = BRANCHES[bi];
  const th = THEMES[b.theme] || THEMES[0];
  const open = branchOpen(bi);
  let stars = 0;
  for (let k = 0; k < LEVELS_PER_BRANCH; k++) stars += store.stars[globalIndexOf(bi, k)] || 0;
  const cleared = branchCleared(bi);
  const done = cleared >= LEVELS_PER_BRANCH;
  const nextK = firstLockedK(bi);
  // 前沿 = 已开放、未全通、且还有未通关卡 → 标「▶ 继续 第 N 关」
  // 这是"玩家不知道自己在第几关"的直接解药：不用再逐张扫 12 张同构卡片去找自己那条。
  const front = open && !done && nextK < LEVELS_PER_BRANCH;
  return card({
    cls: "branchCard" + (front ? " frontier" : ""),
    icon: `<div class="brThumb"></div>`,
    title: `${open ? "" : "🔒 "}${b.name}`,
    sub: front
      ? `▶ 继续 第 ${nextK + 1} 关 · 场景「${th.name}」`
      : `场景「${th.name}」 · ${b.desc}`,
    meta: chip(`★ ${stars}/${LEVELS_PER_BRANCH * 3}`, "gold") +
      (done ? " " + badge("已通关", "success") : ""),
    right: `<div class="brDone">${cleared}/${LEVELS_PER_BRANCH}${done ? "<br>✅" : ""}</div>`,
    interactive: true,
    selected: openBranch === bi,
    locked: !open,
    styleVars: themeVars(th),
    attrs: `data-act="branch" data-bi="${bi}"`,
  });
}

function levelCell(bi, k) {
  const gi = globalIndexOf(bi, k);
  const L = branchLevel(bi, k);
  const v = VARIANT_INFO[L.variant] || VARIANT_INFO.normal;
  const locked = !levelUnlocked(bi, k);
  const st = store.stars[gi] || 0;
  // next = 支线内第一个未通关且已解锁的关卡，也就是"该你打的下一关"，给它最醒目的样式
  const isNext = !locked && st === 0;
  // cur = 当前所在关卡（store.selLevel）：返回首页时一眼看出"我在这儿"
  const isCur = store.selLevel === gi;
  const stars = locked ? "🔒 未解锁" : st > 0 ? "★".repeat(st) + "☆".repeat(3 - st) : "☆☆☆";
  const label = `${BRANCHES[bi].name} 第${k + 1}关 ${v.name} 坡度${Math.round(L.maxSlope)}度 三星时限${Math.round(starTime(L))}秒 ${locked ? "未解锁" : st + "星"}${isCur ? "，当前关卡" : isNext ? "，下一关" : ""}`;
  const cls = locked ? " locked" : isCur ? " cur" : st > 0 ? " done" : " next";
  const head = isCur
    ? '<span class="lvNext">📍 当前关卡</span>'
    : isNext ? '<span class="lvNext">▶ 下一关</span>' : "第" + (k + 1) + "关";
  return `<div class="lvCell${cls}" data-act="play" data-gi="${gi}"
      role="button" tabindex="0" aria-label="${label}">
    <div>${head}</div>
    <div class="thm">${badge(v.icon + " " + v.name, "variant")}</div>
    <div class="thm">坡度 ${Math.round(L.maxSlope)}° · ${Math.round(toM(L.len))}m</div>
    <div class="thm">三星 ≤ ${fmtClock(starTime(L))}</div>
    <div class="stars">${stars}</div>
  </div>`;
}

/**
 * 展开支线的 6 个关卡格。
 * @param {boolean} [withClose] 是否带"收起"按钮。面板模式（renderLevelsPanel /
 *   renderRacePanel）需要它切回卡片墙；主页面（renderHomeView）下方本就紧跟 12 支线
 *   总览，再放一个"收起"只会挤占首屏。
 */
function levelBlock(withClose) {
  const b = BRANCHES[openBranch];
  const th = THEMES[b.theme] || THEMES[0];
  const cells = Array.from({ length: LEVELS_PER_BRANCH }, (_, k) => levelCell(openBranch, k)).join("");
  const note = withClose
    ? `${b.desc} · ${VARIANT_INFO.normal.icon} 常规关为 🚩；第 3、5 关为特殊变体`
    : b.desc;
  return `<div class="branchLevels">
    <div class="brHead">${b.name} · 场景「${th.name}」 · 6 关</div>
    <div class="lvGrid">${cells}</div>
    <div class="panelNote">${note}</div>
    ${withClose ? '<button class="btn sm ghost" data-act="branchClose">收起</button>' : ""}
  </div>`;
}

/** 闯关模式：支线卡片墙 + 展开选关 */
export function renderLevelsPanel(openBi) {
  panelKind = "level";
  openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
  showPanel(`<div class="modeTitle">🏁 闯关模式 · 支线任务</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock(true) : ""}
  <div class="panelNote">星级：通关 1★ · 金币 70% 以上 2★ · 快速通关 3★ ｜ 支线内链式解锁，支线之间可并行推进</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

/** 比赛模式：同一套支线卡片墙（点某关与 AI 竞速） */
export function renderRacePanel(openBi) {
  panelKind = "race";
  openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
  showPanel(`<div class="modeTitle">🏆 比赛模式 · 与 AI 竞速</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock(true) : ""}
  <div class="panelNote">先到终点赢 300 🪙（赛道需已解锁）</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

/** 点关卡格：按当前面板种类开局；锁定则给出明确的解锁提示 */
function playCell(gi) {
  const { bi, k } = branchProgress(gi);
  if (!levelUnlocked(bi, k)) {
    if (!branchOpen(bi)) {
      showToast("🔒 支线「" + BRANCHES[bi].name + "」尚未开放", 900);
    } else {
      const need = firstLockedK(bi);
      showToast("🔒 先通关「" + branchLevel(bi, need).name + "」解锁", 900);
    }
    return;
  }
  api.startGame(panelKind === "race" ? "race" : "level", gi);
}

// ---------------- 13.2 最终任务 / 排位赛 ----------------

/** 最终任务：72 关全通才解锁，未解锁时给出 x/72 进度提示 */
export function renderFinalePanel() {
  const done = clearedCount();
  const total = LEVELS.length;
  const unlocked = done >= total;
  const cleared = store.progress.finaleDone === true;
  const body = card({
    cls: "vehCard",
    icon: unlocked ? "🎯" : "🔒",
    title: FINALE.name,
    sub: `${Math.round(toM(FINALE.len))}m · 依次穿越 6 个场景 · 坡度 ${Math.round(FINALE.maxSlope)}° · 机制密度最高`,
    meta: !unlocked
      ? "通关全部 " + total + " 关后解锁（当前 " + done + "/" + total + "）"
      : cleared ? "✅ 已通关，可重复挑战（点击开始）" : "已解锁 · 点击开始",
    interactive: unlocked,
    locked: !unlocked,
    attrs: unlocked ? 'data-act="finaleStart"' : "",
  });
  showPanel(`<div class="modeTitle">🎯 最终任务</div>
  ${body}
  ${unlocked
    ? `<div class="panelNote">通关最终任务 → 收到比赛邀请 → 解锁排位赛</div>`
    : `<div class="panelNote">还需通关 ${total - done} 关（当前 ${done}/${total}）</div>`}
  <button class="btn backBtn" data-act="back">返回</button>`);
}

function rankedTier(advanced, label, desc, ok, note) {
  return card({
    cls: "vehCard",
    icon: ok ? (advanced ? "🔥" : "🏆") : "🔒",
    title: label,
    sub: desc,
    meta: note,
    interactive: ok,
    locked: !ok,
    attrs: ok ? `data-act="ranked" data-adv="${advanced ? 1 : 0}"` : "",
  });
}

/** 排位赛：段位分 / 段位名 / 战绩 / 普通与高级两档（高级按 rating ≥ 1200 解锁） */
export function renderRankedPanel() {
  const P = store.progress;
  const rating = P.rating || 0;
  const invited = P.invited === true;
  const adv = isAdvancedUnlocked(rating);
  const segIdx = Number.isInteger(store.selLevel) ? store.selLevel : 0;
  const seg = LEVELS[segIdx] || LEVELS[0];
  showPanel(`<div class="modeTitle">🏆 排位赛${P.peak ? " · 已登顶" : ""}</div>
  <div class="rankBox">
    <div class="rankScore">${rating}</div>
    <div class="rankSub">段位：${rankName(rating)} · 战绩 ${P.wins} 胜 ${P.losses} 负</div>
  </div>
  ${invited ? "" : `<div class="panelNote">🔒 尚未收到排位赛邀请：通关「最终任务」后解锁</div>`}
  ${rankedTier(false, "普通排位赛", "AI 配速随段位分提升（三星节奏的 0.70× → 0.90×）",
    invited, invited ? `胜 +${RATING_WIN_GAIN} / 负 -${RATING_LOSS}` : "未解锁")}
  ${rankedTier(true, "高级排位赛", "AI 配速显著更高，可超过三星节奏（0.95× → 1.25×）",
    invited && adv,
    !invited ? "未解锁"
      : adv ? `胜 +${RATING_WIN_GAIN_ADVANCED} / 负 -${RATING_LOSS_ADVANCED}`
        : `段位分 ≥ ${RATING_ADVANCED} 解锁（当前 ${rating}）`)}
  <div class="panelNote">赛道：第 ${segIdx + 1} 关 · ${seg.name}（随你最近选择的关卡）</div>
  <div class="panelNote">登顶（段位分 ≥ ${RATING_PEAK}）解锁无限模式自由选图${P.peak ? " · 已达成" : ""}</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

// ---------------- 13.3 无限模式 ----------------

/** 无限模式：未登顶只有随机地形；登顶后可自选"已通关场景" */
export function renderFreePanel() {
  const peak = store.progress.peak === true;
  const themes = peak ? availableFreeThemes(store.stars) : [];
  showPanel(`<div class="modeTitle">♾️ 无限模式</div>
  ${card({
    cls: "vehCard",
    icon: "🎲",
    title: "随机地形",
    sub: "随里程缓慢加难，无终点；燃料耗尽即结算",
    meta: "个人最佳 " + store.best + " m",
    interactive: true,
    attrs: 'data-act="freeRandom"',
  })}
  ${peak ? "" : `<div class="panelNote">登顶（段位分 ≥ ${RATING_PEAK}）后可自选已通关场景</div>`}
  ${peak ? (themes.length
    ? `<div class="brHead">已通关场景 · 自选</div>
       <div class="branchWall">${themes.map((t) => {
        const th = THEMES[t] || THEMES[0];
        const b = BRANCHES[t];
        return card({
          cls: "branchCard",
          icon: "🗺",
          title: th.name,
          sub: b ? b.name + " · " + b.desc : "",
          interactive: true,
          styleVars: themeVars(th),
          attrs: `data-act="free" data-theme="${t}"`,
        });
      }).join("")}</div>`
    : emptyState("还没有已通关的场景：把任一支线的 6 关全部通关即可解锁对应场景"))
    : ""}
  <button class="btn backBtn" data-act="back">返回</button>`);
}

// ---------------- 车库 ----------------

/** 满级四项的升级表（车库卡片用它算"这台车满级能跑多快"） */
const MAXED = { engine: MAX_LV, tire: MAX_LV, frame: MAX_LV, susp: MAX_LV };

export function renderGaragePanel() {
  panelKind = "garage";
  showPanel(`<div class="modeTitle">🏍️ 车库</div>
  ${VEHICLES.map((v, i) => {
    const own = store.ownedVehicles.includes(i);
    const sel = i === store.currentVehicle;
    return card({
      cls: "vehCard",
      icon: v.icon,
      title: v.name,
      sub: v.desc,
      // 末位是**满级真实可达极速**（表盘满量程同源）：三辆入门车与四辆变态车的差价
      // 到底换来了多少速度，一眼可比，不必买回去试。
      meta: `速度${Math.round(v.spd * 100)}% · 驱动${Math.round(v.drv * 100)}% · 抓地${Math.round(v.grp * 100)}% · 旋转${Math.round(v.air * 100)}% · 油箱${Math.round(v.tank * 100)}% · 满级极速 <b>${Math.round(toKmh(topSpeedOf(v, MAXED)))} km/h</b>`,
      right: sel ? "✅ 使用中" : own ? "已拥有" : "🪙 " + v.price.toLocaleString(),
      interactive: true,
      selected: sel,
      attrs: `data-act="veh" data-veh="${i}"`,
    }) + (v.ultra ? ultraBlock(v, i) : "");
  }).join("")}
  <div class="panelNote" id="pnNote"></div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

/** 车辆全部升级（引擎/轮胎/车架/减震）是否已满级 —— 解锁特殊模式的前提 */
function allMaxed(id) {
  const u = store.upgrades[id];
  return !!u && u.engine >= MAX_LV && u.tire >= MAX_LV && u.frame >= MAX_LV && u.susp >= MAX_LV;
}

/** 车库卡片下的特殊模式区块（已开启 / 未满级提示 / 可购买三态） */
function ultraBlock(v, i) {
  if (store.ultra[v.id] === true) {
    return `<div class="ultraRow got">${v.ultra.icon} 特殊模式「${v.ultra.name}」已开启 · ${v.ultra.desc}</div>`;
  }
  if (!allMaxed(v.id)) {
    return `<div class="ultraRow lock">🔒 ${v.ultra.icon} ${v.ultra.name}：${v.ultra.desc}（全部升级满级 Lv${MAX_LV} 后解锁）</div>`;
  }
  return `<div class="ultraRow buy">
    <button class="btn sm" data-act="buyUltra" data-veh="${i}">${v.ultra.icon} 解锁「${v.ultra.name}」 · ${v.ultra.cost.toLocaleString()} 🪙</button>
    <div class="ultraDesc">${v.ultra.desc}</div>
  </div>`;
}

/** 购买特殊终极模式：满级 + 100 万金币 */
function buyUltra(i) {
  const v = VEHICLES[i];
  if (!allMaxed(v.id)) {
    showToast("🔒 先把这辆车的全部升级升到满级", 900);
    return;
  }
  if (store.ultra[v.id] === true) {
    showToast("🏆 已拥有该特殊模式", 700);
    return;
  }
  if (store.gold < v.ultra.cost) {
    showToast("🪙 金币不足，需要 " + v.ultra.cost.toLocaleString(), 900);
    return;
  }
  store.gold -= v.ultra.cost;
  store.ultra[v.id] = true;
  save();
  // 若买的就是当前使用的车，立即应用效果
  if (store.currentVehicle === i && api.applyVehicle) api.applyVehicle();
  renderGaragePanel();
  showToast("🚀 已解锁「" + v.ultra.name + "」！", 1200);
}

export function buyOrSelectVeh(i) {
  const note = () => document.getElementById("pnNote");
  if (store.ownedVehicles.includes(i)) {
    store.currentVehicle = i;
    // 车辆专属升级数据按车 id 存储，切换后重新应用
    save();
    renderGaragePanel();
    const n = note();
    if (n) n.textContent = "已切换到 " + VEHICLES[i].name;
    api.applyVehicle();
  } else {
    const v = VEHICLES[i];
    if (store.gold >= v.price) {
      store.gold -= v.price;
      store.ownedVehicles.push(i);
      store.currentVehicle = i;
      save();
      renderGaragePanel();
      const n = note();
      if (n) n.textContent = "🎉 购买并切换到 " + v.name;
      api.applyVehicle();
    } else {
      const n = note();
      if (n) n.textContent = "金币不足，需要 " + v.price + " 🪙";
    }
  }
}

// ---------------- 成就 ----------------

export function renderAchPanel() {
  panelKind = "ach";
  showPanel(`<div class="modeTitle">🏅 成就 · 已达成 ${store.achGot.length}/${ACHS.length}</div>
  <div class="achList">${ACHS.map((a) => {
    const got = hasAch(a.id);
    return `<div class="achItm ${got ? "got" : ""}">
      <div class="achIcon">${got ? a.icon : "🔒"}</div>
      <div class="cardBody"><div class="achName">${got ? a.name : "？？？"}</div><div class="achDesc">${a.desc}</div></div>
      <div class="cardRight">${badge(got ? "已达成" : "未达成", got ? "success" : "lock")}</div>
    </div>`;
  }).join("")}</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

// ---------------- 13.4 存档面板 ----------------

export function openSavePanel() {
  saveView.pending = null;
  saveView.summary = null;
  saveView.error = "";
  saveView.note = "";
  saveView.confirmReset = false;
  renderSavePanel();
}

/** 当前存档进度摘要（通关数 / 总星 / 段位 / 金币） */
function currentSummary() {
  let cleared = 0;
  let stars = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    const s = store.stars[i] || 0;
    if (s > 0) { cleared++; stars += s; }
  }
  return { cleared, stars, rating: store.progress.rating || 0, gold: store.gold || 0 };
}

function compareBox(cur, imp) {
  const row = (label, a, b) => `<div class="cmpRow"><span>${label}</span><b>${a} → ${b}</b></div>`;
  return `<div class="cmpBox">
    <div class="cmpRow" style="opacity:.7"><span>项目</span><b>当前 → 导入</b></div>
    ${row("已通关", cur.cleared, imp.cleared)}
    ${row("总星数", cur.stars, imp.stars)}
    ${row("段位分", cur.rating, imp.rating)}
    ${row("金币", cur.gold, imp.gold)}
  </div>`;
}

export function renderSavePanel() {
  const st = store.stat || {};
  const cur = currentSummary();
  const rating = store.progress.rating || 0;
  const stor = isStorageAvailable();
  const cmp = saveView.pending && saveView.summary
    ? `${compareBox(cur, saveView.summary)}
       <div class="panelNote">⚠️ 导入将覆盖当前进度，且不可撤销</div>
       <div class="row2">
         <button class="btn sm" data-act="importConfirm">确认导入</button>
         <button class="btn sm ghost" data-act="importCancel">取消</button>
       </div>`
    : "";
  const askReset = saveView.confirmReset
    ? `<div class="panelNote">⚠️ 确认重置？全部进度（星级 / 解锁 / 段位 / 金币 / 成就 / 车库升级）将被清空，且不可撤销</div>
       <div class="row2">
         <button class="btn sm" data-act="resetConfirm">确认重置</button>
         <button class="btn sm ghost" data-act="resetCancel">取消</button>
       </div>`
    : "";
  showPanel(`<div class="modeTitle">💾 存档 · 进度管理</div>
  ${slotListHtml()}
  ${statRow([
    { label: "已通关", value: `${cur.cleared}/${LEVELS.length}` },
    { label: "总星数", value: `${cur.stars}/${LEVELS.length * 3}` },
    { label: "段位分", value: `${rating} · ${rankName(rating)}` },
    { label: "成就", value: `${store.achGot.length}/${ACHS.length}` },
    { label: "金币", value: `🪙 ${store.gold}` },
    { label: "累计里程", value: fmtKm(st.totalMeters) },
    { label: "累计时长", value: fmtHours(st.totalSeconds) },
    { label: "最后游玩", value: fmtDate(st.lastPlayed) },
  ])}
  ${stor ? "" : `<div class="panelNote">⚠️ 浏览器存储不可用（隐私模式 / 空间已满 / 被禁用）：本次无法保存进度，导出 / 导入 / 重置均不可用</div>`}
  <div class="brHead">🎚 画面设置 · 画质</div>
  <div class="tabs" role="tablist">${QUALITY.map((q) =>
    `<button class="tab" role="tab" data-act="quality" data-q="${q}" aria-selected="${q === getQuality()}" aria-label="画质 ${QUALITY_LABEL[q]}">${QUALITY_LABEL[q]}</button>`
  ).join("")}</div>
  <div class="panelNote">画质决定"画多少东西"（阴影 / 雾 / 辉光 / 天气粒子）；低档全部关闭、最省性能</div>
  <div class="brHead">🔍 画面设置 · 锐度</div>
  <div class="tabs" role="tablist">${RENDER_SCALES.map((s) =>
    `<button class="tab" role="tab" data-act="scale" data-s="${s}" aria-selected="${Math.abs(s - getRenderScale()) < 0.01}" aria-label="锐度 ${RENDER_SCALE_LABEL[s]}">${RENDER_SCALE_LABEL[s]}</button>`
  ).join("")}</div>
  <div class="panelNote">锐度决定"画在多少像素上"，与画质互不影响：省电 0.75×（56% 像素）/ 标准 1× / 锐利 1.25×（156% 像素）。两项设置都保存在浏览器本地（非存档键，导出存档不包含它们）</div>
  ${saveView.error ? `<div class="panelNote">${saveView.error}</div>` : ""}
  ${saveView.note ? `<div class="panelNote">${saveView.note}</div>` : ""}
  ${cmp}
  ${askReset}
  ${stor ? `<div class="row2" style="margin-top:10px">
    <button class="btn sm" data-act="export">导出存档</button>
    <button class="btn sm" data-act="importPick">导入存档</button>
    <button class="btn sm ghost" data-act="resetAsk">重置存档</button>
  </div>` : ""}
  <input type="file" id="saveFile" class="saveFileInput" accept=".json,application/json">
  <div class="panelNote">导出 = 把全部 bike_ 存档打包成一个 JSON 文件下载；导入 = 整体覆盖（不做字段合并）</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

function doExport() {
  const ok = downloadSave();
  saveView.error = "";
  saveView.note = ok ? "💾 已导出存档文件（见浏览器下载）" : "⚠️ 导出失败：当前环境不支持文件下载";
  renderSavePanel();
}

function pickSaveFile() {
  const el = document.getElementById("saveFile");
  if (el && typeof el.click === "function") {
    el.click(); // 不重绘：立刻重绘会销毁 input，change 事件就丢了
    return;
  }
  saveView.error = "";
  saveView.note = "⚠️ 当前环境无法打开文件选择框";
  renderSavePanel();
}

function readSaveFile(file) {
  const done = (text) => applyImportText(text);
  const fail = (e) => {
    saveView.pending = null;
    saveView.summary = null;
    saveView.note = "";
    saveView.error = "❌ 读取文件失败：" + (e && e.message ? e.message : e);
    renderSavePanel();
  };
  try {
    if (typeof file.text === "function") {
      file.text().then(done).catch(fail);
      return;
    }
    if (typeof FileReader === "undefined") {
      fail(new Error("浏览器不支持 FileReader"));
      return;
    }
    const fr = new FileReader();
    fr.onload = () => done(String(fr.result || ""));
    fr.onerror = () => fail(new Error("读取中断"));
    fr.readAsText(file);
  } catch (e) {
    fail(e);
  }
}

/** 校验导入文本；通过则进入"当前 vs 导入"对比 + 二次确认 */
function applyImportText(text) {
  const res = parseSave(text);
  if (!res.ok) {
    saveView.pending = null;
    saveView.summary = null;
    saveView.note = "";
    saveView.error = "❌ 导入失败：" + res.error + "（现有存档未改动）";
    renderSavePanel();
    return;
  }
  saveView.pending = res.data;
  saveView.summary = res.summary;
  saveView.error = "";
  saveView.note = "";
  renderSavePanel();
}

function doImport() {
  if (!saveView.pending) return;
  const res = importSave(saveView.pending);
  if (!res.ok) {
    saveView.error = "❌ 导入失败：" + res.error + "（现有存档未改动）";
    renderSavePanel();
    return;
  }
  saveView.pending = null;
  saveView.summary = null;
  saveView.error = "";
  saveView.note = "✅ 存档已导入并生效";
  if (api.applyVehicle) api.applyVehicle();
  refreshMenuButtons();
  renderSavePanel();
}

function doReset() {
  resetSave();
  saveView.confirmReset = false;
  saveView.pending = null;
  saveView.summary = null;
  saveView.error = "";
  saveView.note = "♻️ 存档已重置：回到新玩家初始状态（仅支线 1 第 1 关解锁）";
  if (api.applyVehicle) api.applyVehicle();
  refreshMenuButtons();
  renderSavePanel();
}

// ---------------- 存档槽 ----------------

/** 切换存档槽：落盘当前槽 → 载入目标槽 → 重建整车派生量 */
function doSwitchSlot(n) {
  const before = currentSlot();
  if (n === before) return;
  if (!isStorageAvailable()) { saveView.error = "⚠️ 浏览器存储不可用，无法切换存档"; renderSavePanel(); return; }
  if (switchSlot(n)) {
    if (api.applyVehicle) api.applyVehicle();
    saveView.error = "";
    saveView.note = `✅ 已切换到「存档${n + 1}」`;
    refreshMenuButtons();
  }
  renderSavePanel();
}

/** 新建存档槽：占用下一个空槽并切入（等于开一局新的） */
function doNewSlot() {
  if (!isStorageAvailable()) { saveView.error = "⚠️ 浏览器存储不可用，无法新建存档"; renderSavePanel(); return; }
  const n = createSlot();
  if (n < 0) {
    saveView.error = "⚠️ 存档位已满，无法新建";
  } else {
    if (api.applyVehicle) api.applyVehicle();
    saveView.error = "";
    saveView.note = `✨ 已新建「存档${n + 1}」，从第 1 关重新开始`;
    refreshMenuButtons();
  }
  renderSavePanel();
}

/** 删除非当前槽 */
function doDeleteSlot(n) {
  if (!isStorageAvailable()) { saveView.error = "⚠️ 浏览器存储不可用，无法删除存档"; renderSavePanel(); return; }
  if (deleteSlot(n)) saveView.note = `🗑 已删除「存档${n + 1}」`;
  else saveView.error = "⚠️ 无法删除当前正在使用的存档";
  renderSavePanel();
}

/** 存档槽列表的渲染；只显示到"下一个空槽"为止，避免一屏塞 6 个空槽 */
function slotListHtml() {
  const slots = listSlots();
  const shown = [];
  for (const s of slots) {
    shown.push(s);
    if (!s.used) break; // 第一个空槽之后就不再展示
  }
  const cells = shown.map((s) => {
    const cls = "lvCell slotCell" + (s.active ? " cur" : s.used ? " done" : "");
    const sub = s.active ? "📍 当前" : s.used ? `已通关 ${s.cleared}/${LEVELS.length}` : "空存档位";
    return `<div class="${cls}" role="button" tabindex="0" data-act="slotSwitch" data-slot="${s.index}"
        aria-label="${s.name}${s.used ? `，已通关 ${s.cleared} 关` : "，空存档位"}${s.active ? "，当前使用中" : ""}">
      <div>${s.name}</div>
      <div class="thm">${sub}</div>
      ${s.used && !s.active ? `<button class="btn sm ghost slotDel" data-act="slotDelete" data-slot="${s.index}" aria-label="删除${s.name}">🗑</button>` : ""}
    </div>`;
  }).join("");
  const hasEmpty = listSlots().some((s) => !s.used);
  return `<div class="brHead">🗂 存档位</div>
    <div class="lvGrid slotGrid">${cells}</div>
    ${hasEmpty ? `<button class="btn sm ghost slotNew" data-act="slotNew">✨ 新建存档</button>` : `<div class="panelNote">存档位已满（上限 ${MAX_SLOTS} 个）</div>`}
    <div class="panelNote">切换存档位会各自保存独立的进度 / 星级 / 金币 / 车库。当前正在玩的存档位不能删除。</div>`;
}
