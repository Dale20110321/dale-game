// 面板：支线任务 / 比赛 / 最终任务 / 排位赛 / 无限模式 / 车库 / 成就 / 存档
//  · 支线面板：12 张支线卡片（场景主题 / 完成度 / 总星）→ 点开才渲染该支线 6 个关卡格
//  · 全部面板交互走 #modePanel 上的事件委托（面板 HTML 重绘不会丢监听）
//  · 本模块只 import 其它层，绝不反向被 import
import {
  ACHS, toM, toKmh, rankName, maxLvOf, topSpeedOf,
  RATING_ADVANCED, RATING_PEAK, RATING_TOP,
  RANKS, rankStars, rankIndexOf, rankNextOf, rankDelta, RATING_LOSS, RATING_LOSS_ADVANCED,
  RACE_FORMATS, RACE_FORMAT_IDS, RACE_PLACE_GOLD,
} from "../config/constants.js";
import { THEMES } from "../config/themes.js";
import {
  LEVELS, BRANCHES, LEVELS_PER_BRANCH, N_BRANCHES, FINALE, FINALE_INDEX, FINALE_SEGS,
  branchLevel, globalIndexOf, branchOfGlobal, branchProgress, starTime, VARIANT_INFO,
  SPACE_LEAGUES, SPACE_DIVS, SPACE_RACES,
  spaceRaceDef, spaceDivOpen, spaceDivRatingNeed, spaceAIScale, spaceDurOf,
} from "../config/levels.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, uiHooks } from "../core/store.js";
import { abbrevNum, goldNum } from "../core/utils.js";
import {
  save, downloadSave, parseSave, importSave, resetSave,
  isStorageAvailable, availableFreeThemes, isAdvancedUnlocked,
  listSlots, switchSlot, createSlot, deleteSlot, currentSlot, MAX_SLOTS,
} from "../core/storage.js";
import { showToast } from "../core/toast.js";
import { initAudio, playCoinSound } from "../core/audio.js";
import { hasAch, clearedCount } from "../game/progress.js";
import { spaceQuestState, claimSpaceQuest, rankedCleared } from "../game/game.js";
import { rankedAIScale, raceFormatPick } from "../game/race.js";
import { getQuality, setQuality, QUALITY, QUALITY_LABEL } from "../render/postfx.js";
import { getRenderScale, setRenderScalePersisted, RENDER_SCALES, RENDER_SCALE_LABEL } from "../render/postfx.js";
import { showPanel, hidePanel, showMenu, refreshMenuButtons } from "./menu.js";
import { card, chip, badge, statRow, emptyState, themeVars, progress } from "./components.js";

let api = {};
/** 支线墙面板：当前展开的支线下标（-1 = 全部收起）与面板种类（level | race） */
let openBranch = -1;
let panelKind = "level";
/** 主页面容器（关卡地图）：菜单态显示，面板态隐藏 —— 与 #modePanel 是"一屏一视图"关系 */
const homeView = document.getElementById("homeView");
/** 当前视图由主页面（关卡地图）承载还是由弹出面板承载 */
let inHomeView = true;
/** 上次选中的玩法 tab：返回主页时回到它，而不是永远弹回「闯关」 */
let lastTab = "level";
/** 宇宙联赛面板当前展开的联赛下标（-1 = 全收起） */
let openSpaceLeague = 0;
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
    // 可访问性：带 role=button 的卡片支持 Enter / 空格触发
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
  uiHooks.onHome = () => { openBranch = -1; selectMode(lastTab); };
  uiHooks.onHome(); // 首屏就要有关卡地图：#homeView 在 HTML 里是空的
  refreshMenuButtons();
}

/** 玩法 tab 切换：闯关/比赛渲染关卡地图；排位/无限走全屏面板 */
export function selectMode(mode) {
  const m = mode === "race" || mode === "free" || mode === "space" ? mode : "level";
  for (const b of document.querySelectorAll("#modeTabs .mtab")) {
    const on = b.dataset.mode === m;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  }
  lastTab = m;
  if (m === "race") {
    // ★ 比赛必须走 renderRacePanel，而不是像以前那样 renderHomeView("race") ——
    //   后者渲染的是**和闯关一模一样的关卡地图**，赛制选择器（1V1 / 多人 / 团赛）
    //   根本没被画出来。于是"点比赛 tab"和"点闯关 tab"看到的是同一屏，
    //   玩家报告的"比赛点击过后显示的还是首页的内容"就是这个。
    //   hidePanel() 会把 homeView 重新显示出来，这里要主动盖掉它（一屏一视图）。
    if (homeView) homeView.style.display = "none";
    renderRacePanel(openBranch);
  } else if (m === "level") {
    // 从"排位/无限/宇宙"切回地图时，上一个面板还开着，必须先收起来，
    // 否则 modePanel 会盖住刚渲染好的关卡地图。
    hidePanel();
    if (homeView) homeView.style.display = "";
    renderHomeView("level");
  } else {
    if (homeView) homeView.style.display = "none";
    if (m === "space") renderSpacePanel();
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
  inHomeView = true;
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
  // ★ 断点续玩进度（R1.3）：finaleSeg = 已通过的段数，0 = 从头开始。
  //   终局关是 167km / 36 段的超长赛道，进度必须以"段"为单位可见 ——
  //   右侧那个 done/total 是 432 关主线的通关数，与终局关自身进度无关。
  const seg = Math.max(0, Math.min(FINALE_SEGS, store.progress.finaleSeg || 0));
  const segTxt = cleared
    ? "36/36 段 ✅"
    : seg > 0 ? `⏩ 从第 ${seg + 1} / ${FINALE_SEGS} 段继续` : `0 / ${FINALE_SEGS} 段`;
  return card({
    cls: "vehCard finaleTile",
    icon: unlocked ? "🎯" : "🔒",
    // ★ 「依次穿越 6 个场景」是 Task 8 之前的旧文案（那时 FINALE 只有 6 段）。
    //   FINALE_SEGS 早已改成 THEMES.length = 36，文案却没跟着改 —— 面板在骗人。
    title: FINALE.name,
    sub: `${Math.round(toM(FINALE.len))}m · 依次穿越 ${FINALE_SEGS} 个场景 · ${FINALE.gateN} 个计时门 · 坡度 ${Math.round(FINALE.maxSlope)}°`,
    meta: (cleared ? "✅ 已通关，可重复挑战" : unlocked ? "已解锁 · 点击开始" : `通关全部 ${total} 关后解锁`)
      + " · " + segTxt,
    body: progress((seg / FINALE_SEGS) * 100, { label: "环大陆进度" }),
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
    case "buyVeh":
      // 「立即购买并使用」：明确的花钱动作，与"点卡片只切换"区分开。
      // 点击冒泡到卡片时已被上面 return 拦掉，这里不会重复触发。
      buyVehicleNow(+el.dataset.veh);
      return;
    case "finaleStart":
      api.startGame("level", FINALE_INDEX);
      return;
    case "ranked":
      store.raceRanked = el.dataset.adv === "1";
      renderRacePanel(openBranch);
      return;
    case "raceFmt": {
      // 切赛制只改选择，不开局 —— 面板重绘即可，赛制在 store 里留存
      const id = el.dataset.fmt;
      if (RACE_FORMATS[id]) {
        store.raceFormatPick = id;
        renderRacePanel(openBranch);
      }
      return;
    }
    case "freeRandom":
      api.startGame("free");
      return;
    case "free":
      api.startGame("free", undefined, { theme: +el.dataset.theme });
      return;
    case "spaceLeague":
      openSpaceLeague = openSpaceLeague === +el.dataset.league ? -1 : +el.dataset.league;
      renderSpacePanel();
      return;
    case "spaceStart":
      openSpaceLeague = +el.dataset.league;
      api.startGame("space", undefined, {
        league: +el.dataset.league,
        div: +el.dataset.div,
        race: +el.dataset.race,
      });
      return;
    case "spaceClaim":
      if (claimSpaceQuest()) {
        showToast("🛰️ 已获得「星环」！宇宙联赛向你开放", 2000, "success");
        renderSpacePanel();
      } else {
        showToast("金币任务还没完成", 1200);
      }
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

/**
 * 重绘当前支线墙面板（保持展开状态）。
 *
 * ★ 宿主由 `inHomeView` 判定，**不再靠 `homeView.innerHTML` 是否为空** ——
 *   那个启发式在"比赛改走面板"之后必然出错：主页面可能还留着上一次渲染的
 *   关卡地图，于是比赛面板里点一下支线卡，重绘会落到 homeView 上，
 *   看起来就是"点了没反应"。
 */
function rerender() {
  if (inHomeView) renderHomeView(panelKind === "race" ? "race" : "level");
  else if (panelKind === "race") renderRacePanel(openBranch);
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
    ${levelRecHtml(gi, L)}
  </div>`;
}

/**
 * 展开支线的 6 个关卡格。
 * @param {boolean} [withClose] 是否带"收起"按钮。面板模式（renderLevelsPanel /
 *   renderRacePanel）需要它切回卡片墙；主页面（renderHomeView）下方本就紧跟 12 支线
 *   总览，再放一个"收起"只会挤占首屏。
 */
/**
 * 逐关记录行：最佳用时 / 最佳金币 / 尝试次数 / 上次通过。
 *
 * ★ 星级只答"有没有通关、几星"，答不出"打了多久才三星、试了几次"。
 *   有了这三行，同一个三星关卡反复重打的收益才看得见，玩家才知道该刷哪一关。
 */
function levelRecHtml(gi, L) {
  const r = (store.levelRecords || {})[gi];
  if (!r || !r.tries) return "";
  const bits = ["试过 " + r.tries + " 次"];
  if (r.bestMs > 0) bits.push("最佳 " + (r.bestMs / 1000).toFixed(1) + "s");
  if (r.bestCoins > 0) bits.push("金币 " + r.bestCoins + "/" + L.coinN);
  if (r.lastAt) bits.push("上次 " + fmtDate(r.lastAt).slice(5, 16));
  return '<div class="lvRec">📋 ' + bits.join(" · ") + "</div>";
}

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
  inHomeView = false;
  openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
  showPanel(`<div class="modeTitle">🏁 闯关模式 · 支线任务</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock(true) : ""}
  <div class="panelNote">星级：通关 1★ · 金币 70% 以上 2★ · 快速通关 3★ ｜ 支线内链式解锁，支线之间可并行推进</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

/**
 * 比赛面板：**3 种赛制 × 2 个档位（普通 / 排位）**。
 *
 * ★ 排位赛不再是独立 tab（用户要求合并）：它和比赛玩的是同一件事 —— 跟 AI 竞速 ——
 *   差别只在"结果算不算段位分"。而赛制选择（1V1 / 多人 / 团赛）本来就与段位无关，
 *   分成两个入口只会让玩家为了刷段位先想"我该点哪个 tab"。
 *   现在 6 个入口在同一屏选完：先选赛制，再选档位，最后点关卡开跑。
 *
 * 档位行同时兼作**段位面板**：当前段位分 / 星数 / 距离下一段还差多少 / 升段奖励，
 * 全部就地显示，不必再切到别处查。
 */
function rankTierCard(advanced, label, desc, note, ok) {
  return card({
    cls: "vehCard",
    icon: store.raceRanked === advanced ? "◉" : "○",
    title: label + (store.raceRanked === advanced ? " · 已选" : ""),
    sub: desc,
    meta: note,
    interactive: ok,
    locked: !ok,
    selected: store.raceRanked === advanced,
    attrs: ok ? `data-act="ranked" data-adv="${advanced ? 1 : 0}"` : "",
  });
}

export function renderRacePanel(openBi) {
  panelKind = "race";
  inHomeView = false;
  openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
  const cur = raceFormatPick();
  const P = store.progress;
  const rating = P.rating || 0;
  const invited = P.invited === true;
  const adv = isAdvancedUnlocked(rating);
  const curR = RANKS[rankIndexOf(rating)] || RANKS[0];
  const next = rankNextOf(rating);
  const curIdx = rankIndexOf(rating);
  const pct = next
    ? Math.max(0, Math.min(100, ((rating - curR.min) / Math.max(1, next.min - curR.min)) * 100))
    : 100;
  const starOf = (r, i) => (rating < r.min ? 0 : i < curIdx ? 3 : rankStars(rating));
  const hi = pct.toFixed(1);
  showPanel(`<div class="modeTitle">🏆 比赛 · 3 种赛制 × 2 个档位</div>
  <div class="brHead">① 选赛制</div>
  <div class="fmtRow">${RACE_FORMAT_IDS.map((id) => {
    const f = RACE_FORMATS[id];
    const on = id === cur;
    return `<button class="fmtBtn${on ? " on" : ""}" data-act="raceFmt" data-fmt="${id}"
      aria-pressed="${on}" title="${f.desc}">
      <span class="fmtIcon">${f.icon}</span><span class="fmtName">${f.name}</span>
      <span class="fmtDesc">${f.desc}</span>
      <span class="fmtGold">名次奖金 ${RACE_PLACE_GOLD[0]} / ${RACE_PLACE_GOLD[1]} / …</span>
    </button>`;
  }).join("")}</div>

  <div class="brHead">② 选档位 · 排位档会结算段位分，普通档只发名次奖金</div>
  <div class="rankBox">
    <div class="rankScore">${rating}</div>
    <div class="rankSub">${rankName(rating)}
      <span class="rankStars" aria-label="本段星数 ${rankStars(rating)} / 3">${"★".repeat(rankStars(rating))}<span class="dim">${"☆".repeat(3 - rankStars(rating))}</span></span>
      · 战绩 ${P.wins} 胜 ${P.losses} 负</div>
    <div class="rankBar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"
         aria-label="${rankName(rating)} 段内进度"><i style="width:${hi}%"></i></div>
    <div class="rankSub">${next
      ? `下一段「${next.name}」还差 <b>${next.min - rating}</b> 分 · 升段奖励 🪙 ${goldNum(next.reward)}`
      : `段位表已刷满 · 累计升段奖励 🪙 ${goldNum(RANKS.reduce((a, r) => a + r.reward, 0))}`}</div>
  </div>
  ${rankTierCard(false, "普通比赛",
    "AI 配速固定在三��节奏的 0.68 倍，带追赶修正 —— 输赢不影响段位分",
    `名次奖金 ${RACE_PLACE_GOLD[0]} → ${RACE_PLACE_GOLD[RACE_PLACE_GOLD.length - 1]} 🪙 · 段位分不变`,
    true)}
  ${rankTierCard(true, "排位比赛",
    `AI 配速随段位分提升（三星节奏的 ${paceRange(false)}）${adv ? ` · 高级排位可到 ${paceRange(true)}` : ""}`,
    !invited ? "🔒 通关「最终任务」后解锁"
      : `胜 +${rankDelta(rating, false, true)} / 负 -${RATING_LOSS} 段位分`
        + (adv ? " · 已解锁高级排位" : ` · 段位分 ≥ ${RATING_ADVANCED} 开高级排位`),
    invited)}
  <details class="rankLadder"><summary>段位阶梯（${RANKS.length} 段 × 3 星）</summary>
    <ol class="rankList">${RANKS.map((r, i) => {
      const got = starOf(r, i);
      return `<li class="${rating >= r.min ? "on" : ""}${i === curIdx ? " cur" : ""}">
        <span class="rkMin">${r.min}</span>
        <span class="rkName">${r.name}</span>
        <span class="rkStar" aria-label="${got} 星">${i === 0 ? "" : "★".repeat(got) + "☆".repeat(3 - got)}</span>
        <span class="rkRew">${r.reward ? "🪙 " + goldNum(r.reward) : "—"}</span>
      </li>`;
    }).join("")}</ol>
    <div class="panelNote">升段奖励只在首次跨过该段门槛时发一次（掉段再升回来不补发）；
      ★ 进段 · ★★ 段内过半 · ★★★ 段内 85%</div>
  </details>

  <div class="brHead">③ 选赛道</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock(true) : ""}
  <div class="panelNote">按名次发奖（第 1 名 ${RACE_PLACE_GOLD[0]} 🪙，完赛即有）· 赛道需已解锁</div>
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
  if (panelKind === "race") api.startGame("race", gi, { format: raceFormatPick(), ranked: store.raceRanked });
  else api.startGame("level", gi);
}

// ---------------- 13.2 最终任务 / 排位赛 ----------------



/**
 * 排位赛 AI 配速区间文案：直接由 rankedAIScale() 算两端，不再手写数字。
 *
 * ★ 原来这里写死"0.70× → 1.25×"/"0.95× → 1.41×"，与该函数实际算出的
 *   0.70→0.97 / 0.95→1.36 对不上 —— 面板在向玩家承诺一个 AI 达不到的速度上限。
 */
function paceRange(advanced) {
  const lo = rankedAIScale(0, advanced).toFixed(2);
  const hi = rankedAIScale(RATING_TOP, advanced).toFixed(2);
  return `${lo}× → ${hi}×`;
}

// ---------------- 13.3 无限模式 ----------------

/** 无限模式：未登顶只有随机地形；登顶后可自选"已通关场景" */
export function renderFreePanel() {
  panelKind = "free";
  inHomeView = false;
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

// ---------------- 宇宙场 ----------------
/**
 * 距离的紧凑写法（宇宙场面板用）。
 *
 * ★ 为什么不能直接 `abbrevNum`：赛道长度按玩家极速缩放，无相满级是
 *   **10 亿 px = 10 万 km**，走"万/亿"档会显示成"1万万千公里"这种没人读的串。
 *   距离的单位天然是 km，量级也天然跨越很宽，所以单列一套：
 *   <1000 km 直接写，<1e6 km 用「万 km」，再往上用科学计数。
 */
function abbrevLen(px) {
  const km = px / 1e5;              // 100px = 1m → 100,000px = 1km
  if (km < 1000) return Math.round(km) + " km";
  if (km < 1e6) return Math.round(km / 1e4) + " 万 km";
  return abbrevNum(km) + " km";
}

/**
 * 宇宙场面板（R3.1~R3.6）。
 *
 * 无宇宙级车时先弹金币任务说明（R3.5）：不提供"直接开跑"的入口，
 * 因为宇宙场是本作的中长期目标，白嫖会跳过整个经济曲线。
 */
export function renderSpacePanel() {
  panelKind = "space";
  inHomeView = false;
  const q = spaceQuestState();
  const pending = store.pendingSpace;
  store.pendingSpace = false;

  // ★ 第一道门：排位赛没赢过就只看得到锁（用户要求"跑完排位赛才有"）。
  //   放在最前面，金币任务面板排在它后面 —— 没打过排位的人不该先看到赚钱任务。
  if (!rankedCleared()) {
    showPanel(`<div class="modeTitle">🌌 宇宙场</div>
      ${card({
        cls: "vehCard",
        icon: "🔒",
        title: "先赢下一场排位赛",
        sub: "宇宙场是 5 个难度分级的长程竞速，需要你先熟悉竞速玩法",
        meta: `排位战绩 ${store.progress.wins} 胜 ${store.progress.losses} 负`,
        locked: true,
        interactive: false,
      })}
      <div class="panelNote">通关「最终任务」后解锁排位赛 → 赢一场即可开启宇宙场。</div>
      <button class="btn backBtn" data-act="back">返回</button>`);
    return;
  }

  if (q.hasQuest) {
    showPanel(`<div class="modeTitle">🌌 宇宙场 · 金币任务</div>
      ${pending ? `<div class="panelNote">完成下面的任务即可获得基础宇宙车「星环」</div>` : ""}
      ${card({
        cls: "vehCard",
        icon: "☄️",
        title: "累计赚取 " + abbrevNum(q.need, { yuan: true }),
        sub: "完成后可获得基础宇宙车「星环」（价值 ¥100亿 · 极速 28,440 km/h）",
        meta: `进度 ${abbrevNum(q.got)} / ${abbrevNum(q.need)}（${Math.round(q.progress * 100)}%）`,
        body: progress(q.progress * 100, { label: "金币任务" }),
        interactive: q.got >= q.need,
        locked: q.got < q.need,
        attrs: q.got >= q.need ? 'data-act="spaceClaim"' : "",
      })}
      ${q.got < q.need
        ? `<div class="panelNote">金币来自通关、赛道拾取、比赛名次与段位奖励。${pending ? "点击下方返回可稍后再来。" : ""}</div>`
        : `<div class="panelNote">✅ 条件已达成，点击上方卡片领取「星环」</div>`}
      <button class="btn backBtn" data-act="back">返回</button>`);
    return;
  }

  const cur = VEHICLES[store.currentVehicle];
  // ★ 必须用**实车**极速（store.phys.topSpeed，已含升级与形态），
  //   不能用 nominalKmh（形态标称）：Lv0 的实车极速远低于标称值，
  //   拿标称去和对手配速比会显示成"稳赢"，实际开局差着几个数量级。
  const topPx = store.phys.topSpeed > 1 ? store.phys.topSpeed : 100;
  const rating = Math.max(0, store.space.rating || 0);
  const openLeague = openSpaceLeague;

  showPanel(`<div class="modeTitle">🌌 宇宙联赛</div>
    <div class="panelNote">${SPACE_LEAGUES.length} 个联赛 × 3 个分区 × 3 场赛事。<b>分区按联赛段位分解锁</b>，
      不按车 —— 买不起新车只是暂时跑不快，不会把整块玩法锁死在门外。
      对手配速是该联赛的<b>固定值</b>（不跟着你的车速变），赛道长度由配速 × 时长决定，
      所以任何车跑任何一场都是 <b>30~122 秒</b>。</div>
    <div class="rankBox">
      <div class="rankScore">${rating}</div>
      <div class="rankSub">宇宙联赛段位分 · 已解锁分区
        ${SPACE_DIVS.map((d) => `${d.name}${spaceDivOpen(0, SPACE_DIVS.indexOf(d), rating) ? "" : "🔒"}`).join(" ")}
        （分区需求按联赛递增）</div>
    </div>
    <div class="brHead">联赛 · 选一个展开分区</div>
    <div class="branchWall">${SPACE_LEAGUES.map((L, li) => {
      const ref = spaceAIScale(li, 0) / (SPACE_DIVS[0].aiK || 1);
      const rec = leagueRecord(li);
      return card({
        cls: "branchCard" + (openLeague === li ? " frontier" : ""),
        icon: L.icon,
        title: `联赛 ${li + 1} · ${L.name}`,
        sub: `参考配速 ${abbrevNum(Math.round(toKmh(ref)))} km/h · ${L.segs} 段地形 · 坡度 ${L.slopeDeg}°` +
          (best ? ` · 已打过 ${best} 场` : ""),
        meta: best ? `最高分区 ${best}` : `起步分区 甲（段位分 ${spaceDivRatingNeed(li, 0)}）`,
        right: openLeague === li ? "▾" : "▸",
        interactive: true,
        selected: openLeague === li,
        styleVars: spaceThemeVars(L),
        attrs: `data-act="spaceLeague" data-league="${li}"`,
      });
    }).join("")}</div>
    ${openLeague >= 0 ? spaceDivisionsHtml(openLeague, rating, topPx) : ""}
    <div class="panelNote">当前车辆：${cur ? cur.name : "—"} · 形态极速
      <b>${abbrevNum(Math.round(toKmh(topPx)))} km/h</b>。对面配速高于这个数就是跑不赢，
      面板会在每一场赛事上直接标出来。</div>
    <button class="btn backBtn" data-act="back">返回</button>`);
}

/** 联赛的场景配色（取它用的第一个太空场景） */
function spaceThemeVars(L) {
  const th = THEMES[L.themes[0]] || THEMES[0];
  return themeVars(th);
}

/** 展开中的联赛下标（-1 = 全收起）；面板每次重绘都会读它 */
/** 展开中的联赛下标（-1 = 全收起）；面板每次重绘都会读它 */
/** 某个分区已打过多少场 / 最好名次（由成绩记录反推） */
function leagueRecord(li) {
  const recs = store.space.records || {};
  const tag = SPACE_LEAGUES[li].id + "-";
  let runs = 0;
  let wins = 0;
  let top = "";
  for (const k in recs) {
    if (k.indexOf(tag) !== 0) continue;
    runs += recs[k].runs;
    wins += recs[k].wins;
    if (!top || SPACE_DIVS.findIndex((d) => d.id === k.split("-")[1]) >
      SPACE_DIVS.findIndex((d) => d.id === top)) top = k.split("-")[1];
  }
  return { runs, wins, top };
}

/** 单场赛事的格子（每个分区 3 个） */
function spaceRaceCell(li, di, ri, topPx) {
  const def = spaceRaceDef(li, di, ri);
  const fmt = RACE_FORMATS[def.fmt] || RACE_FORMATS.duel;
  const total = fmt.team ? 2 : fmt.riders + 1;
  const winnable = topPx >= def.ai;
  const rec = (store.space.records || {})[def.key];
  const aiKmh = abbrevNum(Math.round(toKmh(def.ai)));
  const label = def.name + "，" + fmt.name + "，" + abbrevLen(def.len) + "，" + def.dur + " 秒，" +
    "对手配速 " + aiKmh + " 千米每小时，奖金 " + goldNum(def.gold) + " 金币，" +
    (winnable ? "你的极速足够跑赢" : "当前极速跑不赢") +
    (rec ? "，最好第 " + rec.best + " 名，打过 " + rec.runs + " 场" : "");
  const verdict = winnable
    ? '<span style="color:var(--success)">✔ 你的极速足够</span>'
    : '<span style="color:var(--danger)">⚠ 配速高于你的极速</span>';
  const stars = rec ? '<div class="stars">最好第 ' + rec.best + " / " + total + " 名</div>" : "";
  return '<div class="lvCell' + (winnable ? " next" : " locked") + '" data-act="spaceStart"' +
    ' role="button" tabindex="0" data-league="' + li + '" data-div="' + di + '" data-race="' + ri + '"' +
    ' aria-label="' + label + '">' +
    "<div>" + SPACE_RACES[ri].icon + " " + SPACE_RACES[ri].name + "</div>" +
    '<div class="thm">' + badge(fmt.name, "variant") + "</div>" +
    "<div class=\"thm\">" + abbrevLen(def.len) + " · " + def.dur + "s</div>" +
    "<div class=\"thm\">🪙 " + goldNum(def.gold) + "</div>" +
    '<div class="thm">' + verdict + "</div>" + stars + "</div>";
}

/** 一个联赛的 3 个分区（甲 / 乙 / 丙），分区按联赛段位分解锁 */
function spaceDivisionsHtml(li, rating, topPx) {
  const L = SPACE_LEAGUES[li];
  const head = '<div class="branchLevels"><div class="brHead">' + L.name + " · 3 个分区</div>";
  const body = SPACE_DIVS.map((d, di) => {
    const open = spaceDivOpen(li, di, rating);
    const need = spaceDivRatingNeed(li, di);
    const pace = abbrevNum(Math.round(toKmh(spaceAIScale(li, di))));
    const title = (open ? "" : "🔒 ") + d.name + "区 · 对手配速 " + pace + " km/h · 单场 " +
      spaceDurOf(di, 1) + " 秒" + (open ? "" : "（需联赛段位分 " + need + "，当前 " + rating + "）");
    if (!open) return '<div class="brHead">' + title + "</div>";
    const cells = SPACE_RACES.map((r, ri) => spaceRaceCell(li, di, ri, topPx)).join("");
    return '<div class="brHead">' + title + '</div><div class="lvGrid">' + cells + "</div>";
  }).join("");
  const note = '<div class="panelNote">甲区对手 60% 参考配速、乙区 74%、丙区 86% —— 全都低于 1，' +
    "所以只要你的形态极速达到该区配速就一定跑得过。差的那部分只能靠升级补。</div></div>";
  return head + body + note;
}

// ---------------- 车库 ----------------

/**
 * 满级四项的升级表（车库卡片用它算"这台车满级能跑多快"）。
 * ★ 必须按车取上限：宇宙级车 500 级，用全局 MAX_LV=100 算出来的"满级极速"是错的
 *   （那只是它 Lv100 的速度）。
 */
const MAXED_OF = (veh) => {
  const m = maxLvOf(veh);
  return { engine: m, tire: m, frame: m, susp: m };
};

/**
 * 车库展示顺序 = 车价升序。
 *
 * ★ 只在**渲染层**排序，VEHICLES 数组本身不动、渲染仍用原下标 i：
 *   存档键 bike_veh / bike_owned 存的是数组下标，重排数据会让老存档刷新后
 *   指向另一台车。价格相同的按原下标排，保证顺序稳定（否则每次渲染都可能跳动）。
 */
const BY_PRICE = VEHICLES.map((v, i) => ({ v, i }))
  .sort((a, b) => a.v.price - b.v.price || a.i - b.i);

/**
 * 车辆卡片的**属性网格**。
 *
 * ★ 为什么从一行文字改成网格：原来把 6 项属性塞进一行 meta，
 *   27 辆车连排时每张卡都是一长串"速度260% · 驱动300% · 抓地300% · 旋转55% · 油箱340% · 满级极速 66 km/h"，
 *   在窄屏上还会被 ellipsis 截断 —— 于是"贵的车到底贵在哪"根本读不出来，
 *   车库看上去就是一堵字墙。改成 2×3 的小格后，
 *   **满级极速单独占一格并用主色**，横向比价时眼睛会自然落在那一列上。
 */
function vehStatGrid(v) {
  const cell = (k, val, hi) =>
    `<div class="vsCell${hi ? " hi" : ""}"><span>${k}</span><b>${val}</b></div>`;
  return `<div class="vsGrid">
    ${cell("极速", Math.round(toKmh(topSpeedOf(v, MAXED_OF(v)))) + " <i>km/h</i>", true)}
    ${cell("抓地", Math.round(v.grip * 100) + "%")}
    ${cell("驱动", Math.round(v.phys.torque * 100) + "%")}
    ${cell("油箱", Math.round(v.fuel * 100) + "%")}
    ${cell("重量", Math.round(v.weight * 100) + "%")}
    ${cell("旋转", Math.round(v.airRot * 100) + "%")}
  </div>`;
}

/**
 * 档位徽标：价格阶梯之外的第二层信息（同名档位一眼可辨）。
 * ★ 必须覆盖 vehicles.js 里**全部** tier 取值，缺一个那组就退化成无 class
 *   （灰底白字，与其它组视觉上无差别）。宇宙档是 Task 7 新增的，
 *   加了 6 台车却忘了加 tier5 —— 那 6 台能列出来但整组没有专属配色。
 */
const TIER_CLS = {
  普通: "tier0", 稀有: "tier1", 史诗: "tier2", 传说: "tier3", 神话: "tier4", 宇宙: "tier5",
};

/**
 * 车库渲染。
 *
 * ★ 结构改成"按档位分组"而不是一张 27 项的长列表：
 *   价格升序排下来，普通档 8 台会占掉整整两屏，玩家要滑很久才够得到神话档。
 *   分组后每个档位自成一块，标题里直接写"这一档多少钱、买得起哪几台"。
 */
export function renderGaragePanel() {
  panelKind = "garage";
  inHomeView = false;
  // 按档位分组，组内保持价格升序（BY_PRICE 已经是价格升序）
  const groups = [];
  for (const { v, i } of BY_PRICE) {
    let g = groups.find((x) => x.tier === v.tier);
    if (!g) { g = { tier: v.tier, items: [] }; groups.push(g); }
    g.items.push({ v, i });
  }
  showPanel(`<div class="modeTitle">🏍️ 车库 · ${VEHICLES.length} 辆</div>
  ${groups.map((g) => {
    const prices = g.items.map((x) => x.v.price).filter((p) => p > 0);
    const lo = prices.length ? Math.min(...prices) : 0;
    const hi = prices.length ? Math.max(...prices) : 0;
    const owned = g.items.filter((x) => store.ownedVehicles.includes(x.i)).length;
    const range = lo === hi ? goldNum(lo) : goldNum(lo) + " → " + goldNum(hi);
    return `<section class="vehGroup">
      <h3 class="vehGroupHead ${TIER_CLS[g.tier] || ""}">
        <b>${g.tier}</b>
        <span class="vehGroupMeta">${g.items.length} 辆 · 已拥有 ${owned}/${g.items.length} · 🪙 ${range}</span>
      </h3>
      ${g.items.map(({ v, i }) => {
        const own = store.ownedVehicles.includes(i);
        const sel = i === store.currentVehicle;
        return card({
          cls: "vehCard" + (sel ? " isSel" : ""),
          icon: v.icon,
          title: v.name + `<span class="vehTier ${TIER_CLS[v.tier] || ""}">${v.tier}</span>`,
          sub: v.desc,
          body: vehStatGrid(v),
          right: sel ? "✅<br>使用中" : own ? "已<br>拥有" : "🪙<br>" + goldNum(v.price),
          interactive: true,
          selected: sel,
          attrs: `data-act="veh" data-veh="${i}"`,
        }) + ownDetail(v.id) + (own ? "" : buyBlock(v, i)) + (v.ultra ? ultraBlock(v, i) : "");
      }).join("")}
    </section>`;
  }).join("")}
  <div class="panelNote" id="pnNote"></div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

/**
 * 未拥有车辆下方的「立即购买并使用」按钮。
 *
 * ★ 为什么不再只靠点整张卡片：卡片右上角那行价格既小又不是按钮，
 *   移动端点不准（金币一栏还会随屏宽被 ellipsis 截断）。这里给一个
 *   ≥44px 高、≥120px 宽的独立按钮，热区大、文案直白、不误触。
 */
/**
 * 已拥有车辆的**明细行**（v5 存档新增的逐车记录）。
 *
 * ★ 这些数字以前存不下：升级等级只答得出"这台车现在多强"，
 *   答不出"我什么时候买的、骑了多少公里、形态花了多少钱"。
 *   逐车留痕之后车库卡片才真的像一本账，而不是一排参数。
 */
function ownDetail(id) {
  const m = store.garageMeta[id];
  if (!m) return "";
  const parts = [];
  if (!m.runs) return "";
  return `<div class="ultraRow">📋 骑过 ${m.runs} 局 · 累计 ${fmtKm(m.odometerM)}</div>`;
}

function buyBlock(v, i) {
  const lack = Math.max(0, v.price - store.gold);
  const afford = lack === 0;
  return `<div class="buyRow">
    <button class="btn buyNow${afford ? "" : " ghost"}" data-act="buyVeh" data-veh="${i}"
      ${afford ? "" : 'aria-disabled="true"'}>
      🪙 立即购买并使用 · ${goldNum(v.price)}
    </button>
    <div class="buyHint">${afford ? "点击即可购买并切换到这台车" : "还差 " + goldNum(lack) + " 金币"}</div>
  </div>`;
}

/**
 * 「立即购买并使用」的点击处理。
 * 与 buyOrSelectVeh 分开：点卡片只是"选中/切换"，点这个按钮才是明确的"花钱买"。
 */
function buyVehicleNow(i) {
  const note = () => document.getElementById("pnNote");
  const v = VEHICLES[i];
  if (store.ownedVehicles.includes(i)) {
    store.currentVehicle = i;
    save();
    renderGaragePanel();
    const n = note();
    if (n) n.textContent = "已切换到 " + v.name;
    api.applyVehicle();
    return;
  }
  const lack = Math.max(0, v.price - store.gold);
  if (lack > 0) {
    const n = note();
    if (n) n.textContent = "金币不足，还差 " + goldNum(lack) + " 🪙（需要 " + goldNum(v.price) + "）";
    showToast("🪙 还差 " + goldNum(lack) + " 金币", 1100);
    return;
  }
  store.gold -= v.price;
  store.ownedVehicles.push(i);
  store.currentVehicle = i;
  save();
  renderGaragePanel();
  const n = note();
  if (n) n.textContent = "🎉 购买并切换到 " + v.name;
  api.applyVehicle();
  showToast("🎉 已购买 " + v.name + "！", 1200);
  playCoinSound();
}

/**
 * 形态的量化效果行（由 vehicles.js 从 fx 反推，见那里的 fxText）。
 *
 * ★ 它是"同 mode 不同车到底差在哪"的唯一可见答案：desc 是 prose，四辆车共用一句；
 *   这一行是数字，玩家横向比形态时看的正是它。
 */
function fxLine(v) {
  return v.ultra && v.ultra.fxText ? ` <b class="ultraFx">${v.ultra.fxText}</b>` : "";
}

/** 车辆全部升级（引擎/轮胎/车架/减震）是否已满级 —— 解锁特殊模式的前提 */
function allMaxed(id) {
  const u = store.upgrades[id];
  if (!u) return false;
  // ★ 按该车的上限判断（宇宙级车 500 级）
  const m = maxLvOf(VEHICLES.find((v) => v.id === id));
  return u.engine >= m && u.tire >= m && u.frame >= m && u.susp >= m;
}

/** 车库卡片下的特殊模式区块（已开启 / 未满级提示 / 可购买三态） */
function ultraBlock(v, i) {
  if (store.ultra[v.id] === true) {
    return `<div class="ultraRow got">${v.ultra.icon} 特殊模式「${v.ultra.name}」已开启 · ${v.ultra.desc}</div>`;
  }
  if (!allMaxed(v.id)) {
    return `<div class="ultraRow lock">🔒 ${v.ultra.icon} ${v.ultra.name}：${v.ultra.desc}${fxLine(v)}（全部升级满级 Lv${maxLvOf(v)} 后解锁）</div>`;
  }
  return `<div class="ultraRow buy">
    <button class="btn sm" data-act="buyUltra" data-veh="${i}">${v.ultra.icon} 解锁「${v.ultra.name}」 · ${goldNum(v.ultra.cost)} 🪙</button>
    <div class="ultraDesc">${v.ultra.desc}${fxLine(v)}</div>
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
    showToast("🪙 金币不足，需要 " + goldNum(v.ultra.cost), 900);
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
  inHomeView = false;
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
  panelKind = "save";
  inHomeView = false;
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
  return {
    cleared,
    stars,
    rating: store.progress.rating || 0,
    spaceRating: store.space.rating || 0,
    vehicles: (store.ownedVehicles || []).length,
    createdAt: store.createdAt || "",
    gold: store.gold || 0,
  };
}

/**
 * 分模式统计表（v5 新增）。
 *
 * ★ 为什么值得单独摆一张表：全局的"总局数 / 总里程 / 总时长"只回答"我玩了多久"，
 *   玩家真正要判断的是"该继续刷哪里" —— 而那需要知道时间到底花在哪种玩法上。
 */
/**
 * 详细档案：把散落在存档各处的**成绩**汇到一屏。
 *
 * ★ 为什么单独做一块：v5 存档里成绩分属 campaign / ranked / space / records 四个分区，
 *   而玩家想回答的却是同一个问题 —— "我在哪儿刷得最好"。这张表就是那个问题的答案，
 *   也是"存档是不是真的记了东西"最直接的证据。
 *   每一行都是"试过几次 / 最好多少 / 上次什么时候"，不是只有一个累计值。
 */
function dossierHtml() {
  const F = store.space.free || {};
  const lv = store.levelRecords || {};
  const race = store.raceRecords || {};
  const sp = store.space.records || {};

  // 逐关：三星最快、最少尝试、最高金币
  let bestLv = null;
  let fastest = 0;
  let fewest = Infinity;
  for (let gi = 0; gi < LEVELS.length; gi++) {
    const r = lv[gi];
    if (!r || !r.tries) continue;
    if (r.bestMs > 0 && (fastest === 0 || r.bestMs < fastest)) { fastest = r.bestMs; bestLv = gi; }
    if (r.tries < fewest) fewest = r.tries;
  }
  const lvDone = Object.keys(lv).filter((k) => lv[k].bestMs > 0).length;

  const raceRows = Object.keys(race).map((k) => {
    const r = race[k];
    const [f, t] = k.split("-");
    const fName = (RACE_FORMATS[RACE_FORMAT_IDS[+f]] || {}).name || ("赛制 " + f);
    return [fName + (t === "1" ? " · 排位" : ""), r.runs + " 局",
      (r.best ? "最好第 " + r.best + " 名" : "未进过前三"),
      r.wins + " 胜", r.lastAt ? fmtDate(r.lastAt).slice(5, 16) : "—"];
  });

  const spaceRows = Object.keys(sp).slice(0, 6).map((k) => {
    const r = sp[k];
    const parts = k.split("-");
    const L = SPACE_LEAGUES.find((x) => x.id === parts[0]);
    const D = SPACE_DIVS.find((x) => x.id === parts[1]);
    const Ra = SPACE_RACES[+parts[2]];
    return [(L ? L.name : parts[0]) + " " + (D ? D.name : "") + "区 · " + (Ra ? Ra.name : ""),
      r.runs + " 局", (r.best ? "最好第 " + r.best + " 名" : "—"), r.wins + " 胜",
      r.lastAt ? fmtDate(r.lastAt).slice(5, 16) : "—"];
  });

  const rows = [];
  rows.push(["∞ 无限模式", F.runs + " 局",
    F.bestMeters ? "最佳 " + fmtKm(F.bestMeters) : "尚无纪录",
    "累计 " + fmtKm(F.totalMeters), F.bestAt ? fmtDate(F.bestAt).slice(0, 10) : "—"]);
  if (bestLv !== null) {
    rows.push(["⛳ 关卡最快三星", LEVELS[bestLv].name,
      (fastest / 1000).toFixed(1) + " 秒", "全 " + lvDone + " 关有记录", "—"]);
  }
  rows.forEach((r) => raceRows.push(r));
  spaceRows.forEach((r) => rows.push(r));
  if (rows.length <= 1) {
    return '<div class="brHead">🗂 详细档案</div>' +
      '<div class="panelNote">还没有成绩记录 —— 跑一局闯关或无限模式，这里就会记下用时、里程与名次。</div>';
  }
  return '<div class="brHead">🗂 详细档案 · 成绩明细</div>' +
    '<table class="dossier"><thead><tr><th>项目</th><th>次数</th><th>最佳</th><th>补充</th><th>时间</th></tr></thead><tbody>' +
    rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") +
    "</tbody></table>";
}

const MODE_LABEL = { level: "闯关", race: "比赛", ranked: "排位", space: "宇宙联赛", free: "无限" };
function modeStatHtml(st) {
  const by = st.byMode || {};
  const keys = Object.keys(MODE_LABEL).filter((k) => by[k] && by[k].runs);
  if (!keys.length) return "";
  return '<div class="brHead">🧭 分模式统计</div>' +
    statRow(keys.map((k) => ({
      label: MODE_LABEL[k],
      value: by[k].runs + " 局 · " + fmtHours(by[k].seconds) + " · " + fmtKm(by[k].meters),
    })));
}

function compareBox(cur, imp) {
  const row = (label, a, b) => `<div class="cmpRow"><span>${label}</span><b>${a} → ${b}</b></div>`;
  return `<div class="cmpBox">
    <div class="cmpRow" style="opacity:.7"><span>项目</span><b>当前 → 导入</b></div>
    ${row("已通关", cur.cleared, imp.cleared)}
    ${row("总星数", cur.stars, imp.stars)}
    ${row("段位分", cur.rating, imp.rating)}
    ${row("宇宙联赛分", cur.spaceRating, imp.spaceRating)}
    ${row("车辆", cur.vehicles, imp.vehicles)}
    ${row("金币", goldNum(cur.gold), goldNum(imp.gold))}
  </div>`;
}

export function renderSavePanel() {
  const st = store.stat || {};
  const cur = currentSummary();
  const rating = store.progress.rating || 0;
  const stor = isStorageAvailable();
  const cmp = saveView.pending && saveView.summary
    ? `${compareBox(cur, saveView.summary)}
       <div class="panelNote">这份存档含 ${saveView.summary.vehicles} 辆车 · 宇宙联赛分 ${saveView.summary.spaceRating} · 建于 ${fmtDate(saveView.summary.createdAt)}</div>
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
    { label: "金币", value: `🪙 ${goldNum(store.gold)}` },
    { label: "累计里程", value: fmtKm(st.totalMeters) },
    { label: "累计时长", value: fmtHours(st.totalSeconds) },
    { label: "宇宙联赛分", value: `${store.space.rating || 0}` },
    { label: "最后游玩", value: fmtDate(st.lastPlayed) },
    { label: "存档建立", value: fmtDate(store.createdAt) },
  ])}
  ${dossierHtml()}${modeStatHtml(st)}
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



