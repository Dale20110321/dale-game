// 面板：支线任务 / 比赛 / 最终任务 / 排位赛 / 无限模式 / 车库 / 成就 / 存档
//  · 支线面板：12 张支线卡片（场景主题 / 完成度 / 总星）→ 点开才渲染该支线 6 个关卡格
//  · 全部面板交互走 #modePanel 上的事件委托（面板 HTML 重绘不会丢监听）
//  · 本模块只 import 其它层，绝不反向被 import
import {
  ACHS, toM, rankName, RATING_ADVANCED, RATING_PEAK,
  RATING_WIN_GAIN, RATING_LOSS, RATING_WIN_GAIN_ADVANCED, RATING_LOSS_ADVANCED,
} from "../config/constants.js";
import { THEMES } from "../config/themes.js";
import {
  LEVELS, BRANCHES, LEVELS_PER_BRANCH, N_BRANCHES, FINALE, FINALE_INDEX,
  branchLevel, globalIndexOf, branchProgress, starTime, VARIANT_INFO,
} from "../config/levels.js";
import { VEHICLES } from "../config/vehicles.js";
import { store } from "../core/store.js";
import {
  save, downloadSave, parseSave, importSave, resetSave,
  isStorageAvailable, availableFreeThemes, isAdvancedUnlocked,
} from "../core/storage.js";
import { showToast } from "../core/toast.js";
import { initAudio } from "../core/audio.js";
import { hasAch } from "../game/progress.js";
import { showPanel, showMenu, refreshMenuButtons } from "./menu.js";

let api = {};
/** 支线墙面板：当前展开的支线下标（-1 = 全部收起）与面板种类（level | race） */
let openBranch = -1;
let panelKind = "level";
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
  bind("btnLevels", () => renderLevelsPanel());
  bind("btnRace", () => renderRacePanel());
  bind("btnFinale", renderFinalePanel);
  bind("btnRanked", renderRankedPanel);
  bind("btnFree", renderFreePanel);
  bind("btnGarage", renderGaragePanel);
  bind("btnAch", renderAchPanel);
  bind("btnSave", openSavePanel);

  const panel = document.getElementById("modePanel");
  if (panel) {
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("change", onPanelChange);
  }
  refreshMenuButtons();
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
  let cleared = 0;
  let stars = 0;
  for (let k = 0; k < LEVELS_PER_BRANCH; k++) {
    const s = store.stars[globalIndexOf(bi, k)] || 0;
    if (s >= 1) cleared++;
    stars += s;
  }
  const done = cleared >= LEVELS_PER_BRANCH;
  const main = (th.pal && th.pal[0]) || "#4cff88";
  return `<div class="branchCard${openBranch === bi ? " open" : ""}${open ? "" : " locked"}" data-act="branch" data-bi="${bi}"
    style="border-left-color:${main}">
    <div style="flex:1">
      <div class="brName">${open ? "" : "🔒 "}${b.name}</div>
      <div class="brSub">场景「${th.name}」 · ${b.desc}</div>
      <div class="brStars">★ ${stars}/${LEVELS_PER_BRANCH * 3}</div>
    </div>
    <div class="brDone">${cleared}/${LEVELS_PER_BRANCH}${done ? "<br>✅" : ""}</div>
  </div>`;
}

function levelCell(bi, k) {
  const gi = globalIndexOf(bi, k);
  const L = branchLevel(bi, k);
  const v = VARIANT_INFO[L.variant] || VARIANT_INFO.normal;
  const locked = !levelUnlocked(bi, k);
  const st = store.stars[gi] || 0;
  const stars = locked ? "🔒 未解锁" : st > 0 ? "★".repeat(st) + "☆".repeat(3 - st) : "☆☆☆";
  const color = (VEHICLES[store.currentVehicle] || VEHICLES[0]).color;
  return `<div class="lvCell${locked ? " locked" : st > 0 ? " done" : ""}" data-act="play" data-gi="${gi}"
      style="border-color:${color}44">
    <div>第${k + 1}关</div>
    <div class="thm">${v.icon} ${v.name}</div>
    <div class="thm">坡度 ${Math.round(L.maxSlope)}° · ${Math.round(toM(L.len))}m</div>
    <div class="thm">三星 ≤ ${fmtClock(starTime(L))}</div>
    <div class="stars">${stars}</div>
  </div>`;
}

/** 展开支线的 6 个关卡格（只有点开才渲染，首屏不会一次铺 72 个） */
function levelBlock() {
  const b = BRANCHES[openBranch];
  const th = THEMES[b.theme] || THEMES[0];
  const cells = Array.from({ length: LEVELS_PER_BRANCH }, (_, k) => levelCell(openBranch, k)).join("");
  return `<div class="branchLevels">
    <div class="brHead">${b.name} · 场景「${th.name}」 · 6 关</div>
    <div class="lvGrid">${cells}</div>
    <div class="panelNote">${b.desc} · ${VARIANT_INFO.normal.icon} 常规关为 🚩；第 3、5 关为特殊变体</div>
    <button class="btn sm ghost" data-act="branchClose">收起</button>
  </div>`;
}

/** 闯关模式：支线卡片墙 + 展开选关 */
export function renderLevelsPanel(openBi) {
  panelKind = "level";
  openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
  showPanel(`<div class="modeTitle">🏁 闯关模式 · 支线任务</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock() : ""}
  <div class="panelNote">星级：通关 1★ · 金币 70% 以上 2★ · 快速通关 3★ ｜ 支线内链式解锁，支线之间可并行推进</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}

/** 比赛模式：同一套支线卡片墙（点某关与 AI 竞速） */
export function renderRacePanel(openBi) {
  panelKind = "race";
  openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
  showPanel(`<div class="modeTitle">🏆 比赛模式 · 与 AI 竞速</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock() : ""}
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
  showPanel(`<div class="modeTitle">🎯 最终任务</div>
  <div class="vehCard${unlocked ? "" : " locked"}"${unlocked ? ' data-act="finaleStart"' : ""}>
    <div style="font-size:26px">${unlocked ? "🎯" : "🔒"}</div>
    <div style="flex:1">
      <div class="vname">${FINALE.name}</div>
      <div class="vdesc">${Math.round(toM(FINALE.len))}m · 依次穿越 6 个场景 · 坡度 ${Math.round(FINALE.maxSlope)}° · 机制密度最高</div>
      <div class="vstat">${!unlocked
        ? "通关全部 " + total + " 关后解锁（当前 " + done + "/" + total + "）"
        : cleared ? "✅ 已通关，可重复挑战（点击开始）" : "已解锁 · 点击开始"}</div>
    </div>
  </div>
  ${unlocked
    ? `<div class="panelNote">通关最终任务 → 收到比赛邀请 → 解锁排位赛</div>`
    : `<div class="panelNote">还需通关 ${total - done} 关（当前 ${done}/${total}）</div>`}
  <button class="btn backBtn" data-act="back">返回</button>`);
}

function rankedTier(advanced, label, desc, ok, note) {
  return `<div class="vehCard${ok ? "" : " locked"}"${ok ? ` data-act="ranked" data-adv="${advanced ? 1 : 0}"` : ""}>
    <div style="font-size:24px">${ok ? (advanced ? "🔥" : "🏆") : "🔒"}</div>
    <div style="flex:1">
      <div class="vname">${label}</div>
      <div class="vdesc">${desc}</div>
      <div class="vstat">${note}</div>
    </div>
  </div>`;
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
  <div class="vehCard" data-act="freeRandom">
    <div style="font-size:26px">🎲</div>
    <div style="flex:1">
      <div class="vname">随机地形</div>
      <div class="vdesc">随里程缓慢加难，无终点；燃料耗尽即结算</div>
      <div class="vstat">个人最佳 ${store.best} m</div>
    </div>
  </div>
  ${peak ? "" : `<div class="panelNote">登顶（段位分 ≥ ${RATING_PEAK}）后可自选已通关场景</div>`}
  ${peak ? (themes.length
    ? `<div class="brHead">已通关场景 · 自选</div>
       <div class="branchWall">${themes.map((t) => {
        const th = THEMES[t] || THEMES[0];
        const b = BRANCHES[t];
        return `<div class="branchCard" data-act="free" data-theme="${t}">
          <div class="brIcon">🗺</div>
          <div style="flex:1">
            <div class="brName">${th.name}</div>
            <div class="brSub">${b ? b.name + " · " + b.desc : ""}</div>
          </div>
        </div>`;
      }).join("")}</div>`
    : `<div class="panelNote">还没有已通关的场景：把任一支线的 6 关全部通关即可解锁对应场景</div>`)
    : ""}
  <button class="btn backBtn" data-act="back">返回</button>`);
}

// ---------------- 车库 ----------------

export function renderGaragePanel() {
  panelKind = "garage";
  showPanel(`<div class="modeTitle">🏍️ 车库</div>
  ${VEHICLES.map((v, i) => {
    const own = store.ownedVehicles.includes(i);
    const sel = i === store.currentVehicle;
    return `<div class="vehCard ${sel ? "selected" : ""}" data-act="veh" data-veh="${i}">
      <div style="font-size:26px">${v.icon}</div>
      <div style="flex:1">
        <div class="vname">${v.name}</div>
        <div class="vdesc">${v.desc}</div>
        <div class="vstat">速度${Math.round(v.spd * 100)}% · 驱动${Math.round(v.drv * 100)}% · 抓地${Math.round(v.grp * 100)}% · 旋转${Math.round(v.air * 100)}% · 油箱${Math.round(v.tank * 100)}%</div>
      </div>
      <div>${sel ? "✅ 使用中" : own ? "已拥有" : "🪙 " + v.price}</div>
    </div>`;
  }).join("")}
  <div class="panelNote" id="pnNote"></div>
  <button class="btn backBtn" data-act="back">返回</button>`);
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
      <div><div class="achName">${got ? a.name : "？？？"}</div><div class="achDesc">${a.desc}</div></div>
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
  <div class="statGrid">
    <div class="statItm"><span>已通关</span><b>${cur.cleared}/${LEVELS.length}</b></div>
    <div class="statItm"><span>总星数</span><b>${cur.stars}/${LEVELS.length * 3}</b></div>
    <div class="statItm"><span>段位分</span><b>${rating} · ${rankName(rating)}</b></div>
    <div class="statItm"><span>成就</span><b>${store.achGot.length}/${ACHS.length}</b></div>
    <div class="statItm"><span>金币</span><b>🪙 ${store.gold}</b></div>
    <div class="statItm"><span>累计里程</span><b>${fmtKm(st.totalMeters)}</b></div>
    <div class="statItm"><span>累计时长</span><b>${fmtHours(st.totalSeconds)}</b></div>
    <div class="statItm"><span>最后游玩</span><b>${fmtDate(st.lastPlayed)}</b></div>
  </div>
  ${stor ? "" : `<div class="panelNote">⚠️ 浏览器存储不可用（隐私模式 / 空间已满 / 被禁用）：本次无法保存进度，导出 / 导入 / 重置均不可用</div>`}
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
