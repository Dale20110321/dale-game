// localStorage 存档读写 + 每辆车的升级数据访问 + 进度阶梯 / 累计统计 / 导入导出
// 键名与历史版本完全一致（见 constants.SAVE_KEYS），保证老存档不丢。
//
// 容错纪律（Task 9.7）：
//  · 所有读写都经过 lsGet / lsSet / lsRemove 包装；localStorage 抛异常（隐私模式 / 配额满 /
//    被禁用）时把模块级 available 置 false 并吞掉异常，游戏仍可正常游玩。
//  · 任一 bike_* 键缺失或 JSON 损坏 → 回退默认值，不崩溃。
import {
  SAVE_KEYS, MAX_LV, RATING_ADVANCED, RATING_PEAK, SAVE_APP, SAVE_FORMAT,
} from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { LEVELS, BRANCHES, LEVELS_PER_BRANCH } from "../config/levels.js";
import { store } from "./store.js";

/** 当前存档结构版本：3 = 已完成"20 关 → 72 关"迁移（2 = 货币换算） */
const CUR_VER = 3;

/** 全部受管理的存档键（导入/导出/重置都基于这份清单） */
const ALL_KEYS = Object.values(SAVE_KEYS);

// ---------------- localStorage 统一包装（可降级） ----------------
let available = true;

/** localStorage 是否可用（隐私模式 / 配额满 / 被禁用时返回 false，供 UI 查询） */
export function isStorageAvailable() {
  return available;
}

/** 探测 localStorage 是否可写（写-读-清，抛异常则标记为不可用） */
function probeStorage() {
  const k = "__dale_probe__"; // 不以 bike_ 开头，避免被导入/导出采集
  try {
    const prev = localStorage.getItem(k);
    localStorage.setItem(k, "1");
    if (prev === null) localStorage.removeItem(k);
  } catch (e) {
    available = false;
  }
}

function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    available = false;
    return null;
  }
}

function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch (e) {
    available = false;
    return false;
  }
}

function lsRemove(k) {
  try {
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    available = false;
    return false;
  }
}

/** 安全地解析 JSON，失败返回 fallback */
function jsonOr(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

/** 安全地解析非负整数，失败返回 0 */
function intOr(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

/** 读取当前车辆的升级等级（没有则初始化） */
export function getUp() {
  const id = VEHICLES[store.currentVehicle].id;
  if (!store.upgrades[id]) {
    store.upgrades[id] = { engine: 0, tire: 0, frame: 0, susp: 0 };
  }
  return store.upgrades[id];
}

export function loadAchList() {
  const raw = lsGet(SAVE_KEYS.ach);
  const v = jsonOr(raw || "[]", []);
  store.achGot = Array.isArray(v) ? v : [];
}

export function saveAchList() {
  lsSet(SAVE_KEYS.ach, JSON.stringify(store.achGot));
}

/**
 * 主存档写盘（gold / up / unlocked / stars / veh / owned / mute / best）。
 * 同时落盘进度阶梯 / 段位分 / 累计统计（Task 9.6）：通关结算、解锁关卡/场景、购车、
 * 升级、成就、段位变化等既有落盘点都走这里，因此一处委托即可全覆盖。
 */
export function save() {
  lsSet(SAVE_KEYS.gold, store.gold);
  lsSet(SAVE_KEYS.up, JSON.stringify(store.upgrades));
  lsSet(SAVE_KEYS.unlocked, store.unlocked);
  lsSet(SAVE_KEYS.stars, JSON.stringify(store.stars));
  lsSet(SAVE_KEYS.veh, store.currentVehicle);
  lsSet(SAVE_KEYS.owned, JSON.stringify(store.ownedVehicles));
  lsSet(SAVE_KEYS.mute, store.muted ? "1" : "0");
  lsSet(SAVE_KEYS.best, store.best);
  saveProgress();
}

// ---------------- 进度阶梯：纯函数（Task 9.4） ----------------

/** 由星级数组推导"已通关支线下标"（纯函数：星级是唯一事实来源） */
function clearedBranchesOf(stars) {
  const arr = Array.isArray(stars) ? stars : [];
  const out = [];
  for (let bi = 0; bi < BRANCHES.length; bi++) {
    let all = true;
    for (let k = 0; k < LEVELS_PER_BRANCH; k++) {
      if (!(arr[bi * LEVELS_PER_BRANCH + k] > 0)) { all = false; break; }
    }
    if (all) out.push(bi);
  }
  return out;
}

/** 由 store.stars 推导"已通关支线下标" */
export function deriveBranchCleared() {
  return clearedBranchesOf(store.stars);
}

/**
 * "已通关场景"推导（纯函数，Task 12.2）：某支线 6 关全部 ≥1 星 → 该支线绑定的场景可选。
 * 支线的场景下标与支线下标 1:1（BRANCHES[i].theme === i），因此返回的是场景下标数组。
 * 只依赖星级，不含登顶判定（登顶是"能否选图"的准入，由 syncFreeThemes / freeInit 单独把关）。
 */
export function availableFreeThemes(stars) {
  const out = [];
  for (const bi of clearedBranchesOf(stars)) {
    const b = BRANCHES[bi];
    const th = b ? b.theme : bi;
    if (!out.includes(th)) out.push(th);
  }
  return out;
}

/** 高级排位赛准入（rating ≥ 1200）——纯函数，便于测试 */
export function isAdvancedUnlocked(rating) {
  return (Number(rating) || 0) >= RATING_ADVANCED;
}

/**
 * 阶梯解锁判定（纯函数，不修改入参）。
 * @param {object} progress store.progress 形态的对象
 * @param {number[]} stars 72 关星级数组
 * @returns {{allCleared:boolean, finaleUnlocked:boolean, finaleDone:boolean,
 *            invited:boolean, advancedUnlocked:boolean, peak:boolean}}
 *  · 72 关全通（每关星级 ≥1）→ finaleUnlocked = true
 *  · 最终任务通关 → finaleDone = true 且 invited = true
 *  · rating ≥ 1200 → advancedUnlocked = true
 *  · rating ≥ 2400 → peak = true（登顶后永久保持）
 */
export function deriveUnlocks(progress, stars) {
  const p = progress && typeof progress === "object" ? progress : {};
  const arr = Array.isArray(stars) ? stars : [];
  let allCleared = LEVELS.length > 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (!(arr[i] >= 1)) { allCleared = false; break; }
  }
  const done = p.finaleDone === true;
  const rating = Math.max(0, intOr(p.rating));
  return {
    allCleared,
    finaleUnlocked: allCleared,
    finaleDone: done,
    invited: done || p.invited === true,
    advancedUnlocked: isAdvancedUnlocked(rating),
    peak: p.peak === true || rating >= RATING_PEAK,
  };
}

/**
 * 把阶梯派生态写回 store.progress（支线通关 / 最终任务邀请 / 登顶永久化 / 自由选图）。
 * 只改内存，不落盘（由调用方决定何时 saveProgress）。
 */
export function refreshProgress() {
  const P = store.progress;
  P.branchCleared = deriveBranchCleared();
  const d = deriveUnlocks(P, store.stars);
  if (d.finaleDone) P.finaleDone = true;
  if (d.invited) P.invited = true;
  if (d.peak) P.peak = true;
  syncFreeThemes();
  return P;
}

/**
 * 登顶后把"已通关支线对应的场景"写入 freeThemes（无限模式自由选图用）。
 * 未登顶时不动（保持 empty）。
 */
export function syncFreeThemes() {
  const P = store.progress;
  if (!P.peak) {
    P.freeThemes = [];
    return P.freeThemes;
  }
  P.freeThemes = availableFreeThemes(store.stars);
  return P.freeThemes;
}

// ---------------- 进度 / 段位 / 累计统计 读写 ----------------

/** 读 bike_stat（缺失或损坏 → 全 0 / 空串） */
export function loadStat() {
  const raw = lsGet(SAVE_KEYS.stat);
  const s = jsonOr(raw || "null", null);
  const o = s && typeof s === "object" && !Array.isArray(s) ? s : {};
  store.stat.totalRuns = Math.max(0, intOr(o.totalRuns !== undefined ? o.totalRuns : o.games));
  store.stat.totalMeters = Math.max(0, Number(o.totalMeters !== undefined ? o.totalMeters : o.dist) || 0);
  store.stat.totalSeconds = Math.max(0, Number(o.totalSeconds !== undefined ? o.totalSeconds : o.time) || 0);
  store.stat.lastPlayed = typeof o.lastPlayed === "string" ? o.lastPlayed : "";
  return store.stat;
}

/** 写 bike_stat */
export function saveStat() {
  lsSet(SAVE_KEYS.stat, JSON.stringify(store.stat));
}

/** 写进度阶梯 / 段位分 / 累计统计（三个新增键） */
export function saveProgress() {
  lsSet(SAVE_KEYS.prog, JSON.stringify(store.progress));
  lsSet(SAVE_KEYS.rating, String(store.progress.rating));
  saveStat();
}

/** 结算落盘点：刷新阶梯派生态后立即写盘（通关 / 段位变化 / 解锁时调用） */
export function settleProgress() {
  refreshProgress();
  saveProgress();
  return store.progress;
}

/**
 * 读 bike_prog / bike_rating / bike_stat。
 * 任一键缺失或 JSON 损坏 → 该字段回退默认值（不崩溃）。
 * 支线通关 / 邀请 / 登顶以派生态兜底（手工改档 / 导入后仍自洽）。
 */
export function loadProgress() {
  const P = store.progress;
  const prog = jsonOr(lsGet(SAVE_KEYS.prog) || "null", null);
  const o = prog && typeof prog === "object" && !Array.isArray(prog) ? prog : {};

  P.finaleDone = o.finaleDone === true;
  P.invited = o.invited === true;
  P.wins = Math.max(0, intOr(o.wins));
  P.losses = Math.max(0, intOr(o.losses));
  P.peak = o.peak === true;
  P.rating = Math.max(0, intOr(lsGet(SAVE_KEYS.rating)));

  loadStat();

  // 派生兜底：最终任务通关 → 已邀请；rating 达标 → 登顶
  P.branchCleared = deriveBranchCleared();
  const d = deriveUnlocks(P, store.stars);
  if (d.invited) P.invited = true;
  if (d.peak) P.peak = true;
  P.freeThemes = Array.isArray(o.freeThemes)
    ? o.freeThemes.filter((n) => Number.isInteger(n) && n >= 0)
    : [];
  syncFreeThemes();
  return P;
}

/** 累计统计：{ totalRuns, totalMeters(m), totalSeconds(s) } 累加并刷新 lastPlayed */
export function addStat({ runs = 0, meters = 0, seconds = 0 } = {}) {
  const st = store.stat;
  st.totalRuns += Math.max(0, Number(runs) || 0);
  st.totalMeters += Math.max(0, Number(meters) || 0);
  st.totalSeconds += Math.max(0, Number(seconds) || 0);
  st.lastPlayed = new Date().toISOString();
  saveStat();
  return st;
}

/** 兜底写盘：主存档 + 进度/段位/统计（骑行中每 30 秒节流调用 / 切后台时调用） */
export function saveAll() {
  save();
  saveProgress();
}

/**
 * 接线自动保存（Task 9.6）：由 main.js 在首屏调用一次。
 *  · 先探测 localStorage 可用性（探测键不以 bike_ 开头，不污染导出内容）
 *  · 骑行中每 intervalMs（默认 30s）兜底写盘
 *  · visibilitychange 切到后台时立即写盘
 * 返回定时器句柄（浏览器为 number；Node 下已 unref，不阻塞进程退出）。
 */
let autoSaveTimer = null;
export function initAutoSave(intervalMs = 30000) {
  probeStorage();
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) saveAll();
    });
  }
  if (typeof setInterval === "function" && autoSaveTimer === null) {
    autoSaveTimer = setInterval(() => {
      if (store.state === "play") saveAll();
    }, intervalMs);
    if (autoSaveTimer && typeof autoSaveTimer.unref === "function") autoSaveTimer.unref();
  }
  return autoSaveTimer;
}

// ---------------- 老存档迁移（20 关 → 72 关） ----------------

/** 判断是否为"旧 20 关结构"星级数组（长度 1~20 且 < 现有 72） */
function isLegacy20(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.length < LEVELS.length && arr.length <= 20;
}

/** 星级数组里最后一个有星的下标（无则 -1） */
function highestStarred(arr) {
  let hi = -1;
  for (let i = 0; i < arr.length; i++) if (arr[i] > 0) hi = i;
  return hi;
}

export function loadSave() {
  try {
    store.gold = intOr(lsGet(SAVE_KEYS.gold)) || 0;

    const u = jsonOr(lsGet(SAVE_KEYS.up) || "{}", {});
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
      store.upgrades = (u && typeof u === "object" && !Array.isArray(u)) ? u : {};
    }

    store.unlocked = Math.max(
      0,
      Math.min(LEVELS.length - 1, parseInt(lsGet(SAVE_KEYS.unlocked) || "0", 10) || 0)
    );

    const rawStars = jsonOr(lsGet(SAVE_KEYS.stars) || "[]", []);
    const starsArr = Array.isArray(rawStars) ? rawStars.slice() : [];

    store.currentVehicle = parseInt(lsGet(SAVE_KEYS.veh) || "0", 10) || 0;

    const owned = jsonOr(lsGet(SAVE_KEYS.owned) || "[0]", [0]);
    store.ownedVehicles = Array.isArray(owned) ? owned : [0];
    if (!store.ownedVehicles.length) store.ownedVehicles = [0];
    if (!store.ownedVehicles.includes(store.currentVehicle)) {
      store.currentVehicle = store.ownedVehicles[0] || 0;
    }

    store.muted = lsGet(SAVE_KEYS.mute) === "1";
    store.best = parseInt(lsGet(SAVE_KEYS.best) || "0", 10) || 0;

    const ver = parseInt(lsGet(SAVE_KEYS.ver) || "0", 10) || 0;

    // 版本 1 → 2：历史货币换算（只执行一次，保留原有逻辑）
    if (ver < 2) {
      store.gold *= 10;
    }

    // 版本 2 → 3：20 关 → 72 关结构迁移（只执行一次，由 bike_v 守护）
    // 旧第 i 关的全局索引仍是 i，因此星级按索引原样映射；解锁不回退；星级补齐 0。
    let migrated = false;
    let stars = starsArr;
    if (ver < 3 && isLegacy20(starsArr)) {
      migrated = true;
      stars = starsArr.slice(0, LEVELS.length);
      const hi = highestStarred(stars);
      if (store.unlocked < hi + 1) {
        store.unlocked = Math.min(LEVELS.length - 1, hi + 1);
      }
    }
    while (stars.length < LEVELS.length) stars.push(0);
    store.stars = stars;

    // 版本号落后 → 落盘迁移结果并提升到当前版本（只写一次）
    if (ver < CUR_VER) {
      if (migrated) store.progress.branchCleared = deriveBranchCleared();
      lsSet(SAVE_KEYS.ver, String(CUR_VER));
      save(); // 内部委托 saveProgress()，一并落盘进度阶梯
    }
  } catch (e) {
    /* 存档损坏时用默认值继续 */
  }
}

// ---------------- 存档导入 / 导出（Task 10） ----------------

/** 需要纳入导入/导出的键：受管理的键 + localStorage 里实际存在的其它 bike_ 前缀键 */
function listSaveKeys() {
  const set = new Set(ALL_KEYS);
  try {
    if (typeof localStorage.length === "number" && typeof localStorage.key === "function") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("bike_") === 0) set.add(k);
      }
    }
  } catch (e) {
    available = false;
  }
  return Array.from(set);
}

/** 汇总当前 localStorage 中全部 bike_ 键（原样字符串，不做字段级解析） */
export function exportSave() {
  const data = {};
  for (const k of listSaveKeys()) {
    const v = lsGet(k);
    if (v !== null && v !== undefined) data[k] = v;
  }
  return { app: SAVE_APP, format: SAVE_FORMAT, savedAt: new Date().toISOString(), data };
}

/** 导出文件名：dale-bike-save-<YYYYMMDD-HHmm>.json */
function saveFileName(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    "dale-bike-save-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    "-" + p(d.getHours()) + p(d.getMinutes()) + ".json"
  );
}

/**
 * 触发浏览器下载导出文件。
 * 测试环境没有 Blob / URL / document → 优雅降级并返回 false。
 */
export function downloadSave() {
  try {
    if (typeof Blob === "undefined" || typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function" || typeof document === "undefined") {
      return false;
    }
    const blob = new Blob([JSON.stringify(exportSave(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = saveFileName();
    if (typeof a.click === "function") a.click();
    if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/** 对象里是否含有直接的 bike_ 键 */
function hasBikeKey(obj) {
  return Object.keys(obj).some((k) => k.indexOf("bike_") === 0);
}

/** 从"完整导出对象 / parseSave 结果 / 裸 data 映射"里取出键值映射（容错） */
function pickDataMap(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  // 完整导出对象 or parseSave 结果：都带 .data
  if (data.data && typeof data.data === "object" && !Array.isArray(data.data) && !hasBikeKey(data)) {
    return data.data;
  }
  return data;
}

/**
 * 校验导入文本：JSON 可解析 / app 匹配 / format 受支持 / data 为非数组对象。
 * 校验失败**不写入任何键**，返回 { ok:false, error }。
 */
export function parseSave(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "存档内容不是合法 JSON" };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, error: "存档根对象非法" };
  }
  if (obj.app !== SAVE_APP) {
    return { ok: false, error: "不是本游戏的存档（app 不符）" };
  }
  if (obj.format !== SAVE_FORMAT) {
    return { ok: false, error: "不支持的存档格式：" + obj.format };
  }
  const data = obj.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "存档数据非法" };
  }
  return { ok: true, data, summary: summarizeSave(data) };
}

/** 从导入数据中解析进度概览（通关数 / 总星数 / 段位分 / 金币），容错不抛异常 */
export function summarizeSave(data) {
  const map = pickDataMap(data);
  const starsRaw = jsonOr(map[SAVE_KEYS.stars], []);
  const stars = Array.isArray(starsRaw) ? starsRaw : [];
  let cleared = 0;
  let totalStars = 0;
  for (const s of stars) {
    const n = Number(s) || 0;
    if (n > 0) { cleared++; totalStars += n; }
  }
  return {
    cleared,
    stars: totalStars,
    rating: Math.max(0, intOr(map[SAVE_KEYS.rating])),
    gold: Math.max(0, intOr(map[SAVE_KEYS.gold])),
  };
}

/**
 * 整体写回存档：先移除现有全部 bike_ 键，再写入 data 中的 bike_ 键，
 * 然后重新执行读档与迁移（loadSave + loadProgress），返回结果供界面刷新。
 * 入参可以是 parseSave 返回的 { data } / 完整导出对象 / 裸 data 映射。
 */
export function importSave(data) {
  const map = pickDataMap(data);
  const entries = Object.entries(map).filter(
    ([k, v]) => typeof k === "string" && k.indexOf("bike_") === 0 && v !== null && v !== undefined
  );
  if (!entries.length) return { ok: false, error: "存档不含任何 bike_ 键" };

  for (const k of listSaveKeys()) lsRemove(k);
  for (const [k, v] of entries) lsSet(k, String(v));

  loadSave();
  loadAchList();
  loadProgress();
  return { ok: true, data: map };
}

/** 清空全部 bike_ 键并恢复初始状态（仅第 1 关解锁），供存档面板"重置存档"用 */
export function resetSave() {
  for (const k of listSaveKeys()) lsRemove(k);

  store.gold = 0;
  store.unlocked = 0;
  store.stars = new Array(LEVELS.length).fill(0);
  store.best = 0;
  store.ownedVehicles = [0];
  store.currentVehicle = 0;
  store.upgrades = {};
  store.muted = false;
  store.achGot = [];
  store.progress = {
    branchCleared: [],
    finaleDone: false,
    invited: false,
    rating: 0,
    wins: 0,
    losses: 0,
    peak: false,
    freeThemes: [],
  };
  store.stat = { totalRuns: 0, totalMeters: 0, totalSeconds: 0, lastPlayed: "" };

  save(); // 内部委托 saveProgress()，一并落盘进度/段位/统计
  saveAchList();
  lsSet(SAVE_KEYS.ver, String(CUR_VER));
  return true;
}

export { RATING_ADVANCED, RATING_PEAK };
