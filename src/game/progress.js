// 进度结算：金币与成就（所有金币来源必须走 addGold，成就才能正确触发）
// 也放"由星级数组派生的进度读数"——ui/menu.js 与 ui/panels.js 都要用同一份。
import { ACHS, safeGold, SPEED_RUNGS, LY_M } from "../config/constants.js";
import { LEVELS, SPACE_LEAGUES } from "../config/levels.js";
import { VEHICLES } from "../config/vehicles.js";
import { store } from "../core/store.js";
import { save, saveAchList } from "../core/storage.js";
import { showToast } from "../core/toast.js";
import { playAchSound } from "../core/audio.js";

/**
 * 已通关关卡数（星级 ≥ 1）。
 *
 * ★ 单一事实来源：菜单 Hero 摘要与关卡地图的最终任务卡都要这个数，
 *   两处各写一份的话，改了一处另一处就悄悄对不上。
 */
export function clearedCount() {
  let n = 0;
  for (let i = 0; i < LEVELS.length; i++) if ((store.stars[i] || 0) >= 1) n++;
  return n;
}

export function hasAch(id) {
  return store.achGot.includes(id);
}

/** 唯一的金币入口：拾取 / 特技 / 比赛 / 通关都必须走这里 */
export function addGold(n) {
  if (!n) return;
  // 入口就夹紧：非有限值一旦进了 store.gold，落盘就会变成 "Infinity"/"NaN"，
  // 玩家刷新页面后余额直接归零（实测复现过）。
  store.gold = safeGold(store.gold + n);
  // 累计收入（宇宙场金币任务 R3.5 的进度判据）：只增不减，跨局累计。
  // ★ 必须落盘 —— 任务门槛是 ¥8e8，玩家要靠几十局的收入才攒得到，
  //   刷新页面就归零的话任务永远完不成。存在 stat 里随 addStat→saveStat 一起写。
  save();
  if (store.gold >= 5000) checkAch("rich");
}

/** 解锁成就；返回是否本次新解锁 */
export function checkAch(id) {
  if (hasAch(id)) return false;
  store.achGot.push(id);
  saveAchList();
  const a = ACHS.find((x) => x.id === id);
  if (a) {
    showToast("🏅 成就达成 · " + a.name, 1600);
    playAchSound();
  }
  return true;
}

/**
 * 按**当前存档状态**核对全部"状态型"成就。
 *
 * ★ 为什么要有这一个函数：新增的 16 个成就里，只有 3 个能挂在某个具体事件上
 *   （翻转 / 连招 / 通关）。剩下的判据全都只是"存档里某个数够不够大" ——
 *   累计里程、累计时长、车库数量、形态数量、联赛胜负、最终任务。
 *   它们各自散落在结算的不同分支里，逐个挂钩子必然漏（少挂一个 = 玩家
 *   永远拿不到，且没有任何提示）。所以改成**一处扫全表**：每次结算完调一次，
 *   读一遍存档，把所有已达成的补上。
 *
 * 幂等：checkAch 内部会挡重复，所以随时可以无脑调用。
 *
 * @param {object} [ctx] 本局的补充判据（事件型成就才需要）
 */
export function syncStateAch(ctx) {
  const st = store.stat || {};
  const byMode = st.byMode || {};
  const freeBy = byMode.free || {};
  const sp = store.space || {};
  const free = sp.free || {};

  // ---- 里程 / 时长（lifetime 总数，不分模式）----
  if ((Number(st.totalMeters) || 0) >= 1e6) checkAch("roadtrip");        // 1000 km
  if ((Number(st.totalSeconds) || 0) >= 36000) checkAch("marathon");      // 10 h
  if ((Number(st.totalMeters) || 0) >= LY_M) checkAch("deepspace");      // 累计 1 光年

  // ---- 无限模式单次纪录 ----
  //  ⚠ free.bestMeters 只在**破纪录**时写（见 game.js 的 endFreeRun），
  //    所以它是"历史最佳单次"，正是成就要的量。
  if ((Number(free.bestMeters) || 0) >= 1e5) checkAch("summit");         // 100 km
  if ((Number(free.bestMeters) || 0) >= LY_M) checkAch("ly");             // 1 光年

  // ---- 排位 / 最终任务 ----
  if ((store.progress.rating || 0) >= 1200) checkAch("promo");            // 高级排位线
  if (store.progress.finaleDone === true) checkAch("finale");

  // ---- 车库 ----
  const owned = store.ownedVehicles || [];
  if (owned.length >= VEHICLES.length) checkAch("collect");
  let forms = 0;
  for (const id in store.ultra) if (store.ultra[id] === true) forms++;
  if (forms >= 8) checkAch("forms");

  // ---- 宇宙联赛：每个联赛都赢过至少一场 ----
  if (sweepLeagues()) checkAch("sweep");

  // ---- 事件型（需要本局上下文）----
  if (ctx && (ctx.cleanRuns || 0) >= 30) checkAch("clean10");
}

/**
 * 宇宙联赛"全联赛横扫"：每个联赛的记录里至少有一场 wins > 0。
 *
 * ★ 判据落在 store.space.records（键形如 "L3-B-1"），而不是联赛序号上界 ——
 *   "打到最后一个联赛"不等于"每个都赢过"，中间可以一路输上去。
 */
function sweepLeagues() {
  const recs = (store.space && store.space.records) || {};
  const won = new Set();
  for (const k in recs) {
    if (recs[k] && recs[k].wins > 0) won.add(k.split("-")[0]);
  }
  return won.size >= SPACE_LEAGUES.length;
}

/**
 * 速度梯队成就：时速越过哪几档就点亮哪几个。
 *
 * ★ 每帧都会调用，所以**只做一次比较**再进循环，不做 24 次 find。
 *   门槛按 SPEED_RUNGS 递增，所以"越过高档"时低档必然也过了，
 *   但仍要逐个 checkAch（幂等，且低档可能因历史原因漏过）。
 *
 * @param {number} kmh 当前时速（km/h）
 */
export function checkSpeedAch(kmh) {
  const v = Math.abs(Number(kmh) || 0);
  if (!(v > 0)) return;
  for (let i = 0; i < SPEED_RUNGS.length; i++) {
    if (v < SPEED_RUNGS[i].kmh) break;   // 门槛递增，后面的更不可能到
    checkAch(SPEED_RUNGS[i].id);
  }
}
