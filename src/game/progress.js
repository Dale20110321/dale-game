// 进度结算：金币与成就（所有金币来源必须走 addGold，成就才能正确触发）
// 也放"由星级数组派生的进度读数"——ui/menu.js 与 ui/panels.js 都要用同一份。
import { ACHS, safeGold } from "../config/constants.js";
import { LEVELS } from "../config/levels.js";
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
  store.stat.earnedGold = safeGold((store.stat.earnedGold || 0) + n);
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
