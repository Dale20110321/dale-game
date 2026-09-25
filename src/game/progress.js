// 进度结算：金币与成就（所有金币来源必须走 addGold，成就才能正确触发）
import { ACHS } from "../config/constants.js";
import { store } from "../core/store.js";
import { save, saveAchList } from "../core/storage.js";
import { showToast } from "../core/toast.js";
import { playAchSound } from "../core/audio.js";

export function hasAch(id) {
  return store.achGot.includes(id);
}

/** 唯一的金币入口：拾取 / 特技 / 比赛 / 通关都必须走这里 */
export function addGold(n) {
  if (!n) return;
  store.gold += n;
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
