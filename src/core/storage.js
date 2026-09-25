// localStorage 存档读写 + 每辆车的升级数据访问
// 键名与历史版本完全一致（见 constants.SAVE_KEYS），保证老存档不丢。
import { SAVE_KEYS, MAX_LV } from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { LEVELS } from "../config/levels.js";
import { store } from "./store.js";

/** 读取当前车辆的升级等级（没有则初始化） */
export function getUp() {
  const id = VEHICLES[store.currentVehicle].id;
  if (!store.upgrades[id]) {
    store.upgrades[id] = { engine: 0, tire: 0, frame: 0, susp: 0 };
  }
  return store.upgrades[id];
}

export function loadAchList() {
  try {
    store.achGot = JSON.parse(localStorage.getItem(SAVE_KEYS.ach) || "[]") || [];
  } catch (e) {
    store.achGot = [];
  }
}

export function saveAchList() {
  try {
    localStorage.setItem(SAVE_KEYS.ach, JSON.stringify(store.achGot));
  } catch (e) {
    /* 忽略配额/隐私模式错误 */
  }
}

export function save() {
  try {
    localStorage.setItem(SAVE_KEYS.gold, store.gold);
    localStorage.setItem(SAVE_KEYS.up, JSON.stringify(store.upgrades));
    localStorage.setItem(SAVE_KEYS.unlocked, store.unlocked);
    localStorage.setItem(SAVE_KEYS.stars, JSON.stringify(store.stars));
    localStorage.setItem(SAVE_KEYS.veh, store.currentVehicle);
    localStorage.setItem(SAVE_KEYS.owned, JSON.stringify(store.ownedVehicles));
    localStorage.setItem(SAVE_KEYS.mute, store.muted ? "1" : "0");
    localStorage.setItem(SAVE_KEYS.best, store.best);
  } catch (e) {
    /* 忽略 */
  }
}

export function loadSave() {
  try {
    store.gold = parseInt(localStorage.getItem(SAVE_KEYS.gold) || "0", 10) || 0;

    const u = JSON.parse(localStorage.getItem(SAVE_KEYS.up) || "{}");
    if (u && u.engine !== undefined) {
      // 旧格式（全局单一升级）→ 迁移到当前默认车辆名下
      const id = VEHICLES[store.currentVehicle].id;
      store.upgrades = {};
      store.upgrades[id] = {
        engine: Math.min(MAX_LV, u.engine || 0),
        tire: Math.min(MAX_LV, u.tire || 0),
        frame: Math.min(MAX_LV, u.frame || 0),
        susp: Math.min(MAX_LV, u.susp || 0),
      };
    } else {
      store.upgrades = u || {};
    }

    store.unlocked = Math.min(
      LEVELS.length - 1,
      parseInt(localStorage.getItem(SAVE_KEYS.unlocked) || "0", 10) || 0
    );

    try {
      store.stars = JSON.parse(localStorage.getItem(SAVE_KEYS.stars) || "[]");
    } catch (e) {
      store.stars = [];
    }
    if (!Array.isArray(store.stars)) store.stars = [];
    while (store.stars.length < LEVELS.length) store.stars.push(0);

    store.currentVehicle = parseInt(localStorage.getItem(SAVE_KEYS.veh) || "0", 10) || 0;

    try {
      store.ownedVehicles = JSON.parse(localStorage.getItem(SAVE_KEYS.owned) || "[0]");
    } catch (e) {
      store.ownedVehicles = [0];
    }
    if (!Array.isArray(store.ownedVehicles) || !store.ownedVehicles.length) store.ownedVehicles = [0];
    if (!store.ownedVehicles.includes(store.currentVehicle)) {
      store.currentVehicle = store.ownedVehicles[0] || 0;
    }

    store.muted = localStorage.getItem(SAVE_KEYS.mute) === "1";
    store.best = parseInt(localStorage.getItem(SAVE_KEYS.best) || "0", 10) || 0;

    // 历史版本货币换算（只执行一次）
    if (localStorage.getItem(SAVE_KEYS.ver) !== "2") {
      store.gold *= 10;
      localStorage.setItem(SAVE_KEYS.ver, "2");
      save();
    }
  } catch (e) {
    /* 存档损坏时用默认值继续 */
  }
}
