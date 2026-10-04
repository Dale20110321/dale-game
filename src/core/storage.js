// localStorage 存档读写 + 每辆车的升级数据访问 + 进度阶梯 / 累计统计 / 导入导出
//
// ★ **v5 结构化存档**（现行唯一事实来源）：整份进度写进**一个**键 `dale_save`，
//   形如 { app, format, schema, savedAt, profile, wallet, garage, campaign,
//   ranked, space, lifetime, settings }。
//   旧的 bike_* 裸键方案已弃用，读档时自动迁移一次并把旧键清掉
//   （见 migrateLegacy 与 docs/SAVE_FORMAT_DEPRECATION.md）。
//
//  ★ 三条设计约束（改之前先读完）：
//   1. **车库按 vehicle id 索引，绝不用数组下标**。下标会因为删车 / 重排整体前移，
//      按下标存的"拥有列表"会集体指向别的车 —— 本项目在 v5 之前正是这么存的，
//      所以这次删掉 8 台车必须与 id 化改造同时落地，缺一不可。
//   2. **金币存完整十进制字符串**。余额会超过 1e21（九台宇宙车全部资产约 2.5e25），
//      String() 在那个量级输出 "1e+25"，任何按十进制读的路径都会解析成另一个数。
//   3. 所有读写都经过 rawGet/rawSet 包装；localStorage 抛异常（隐私模式 / 配额满 /
//      被禁用）时把模块级 available 置 false 并吞掉异常，游戏仍可正常游玩。
import {
  SAVE_KEYS, MAX_LV, maxLvOf, RATING_ADVANCED, RATING_PEAK,
  SAVE_APP, SAVE_FORMAT, SAVE_SCHEMA, safeGold,
} from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { LEVELS, BRANCHES, LEVELS_PER_BRANCH, FINALE_SEGS } from "../config/levels.js";
import { store } from "./store.js";
import { toPlainDecimal, fromPlainDecimal } from "./utils.js";

/** 现行文档 schema 版本（constants.SAVE_SCHEMA 是它的单一事实来源） */
export const CUR_SCHEMA = SAVE_SCHEMA;
/**
 * 旧 bike_* 方案能有的最高 bike_v。
 * 迁移后写进 doc.migratedFrom，玩家能从存档里一眼看出"这份是从第几代搬过来的"。
 */
const LEGACY_MAX_VER = 4;

/** 全部受管理的存档键（导入/导出/重置都基于这份清单） */
const ALL_KEYS = Object.values(SAVE_KEYS);

/** 多存档槽上限 */
export const MAX_SLOTS = 6;
/** 槽位元数据键（**刻意不走 sk()**：它们不属于任何槽，是全局的） */
const META_KEYS = { slot: "dale_slot", slots: "dale_slots" };

/** localStorage 是否可用（隐私模式 / 配额满 / 被禁用时返回 false，供 UI 查询） */
let available = true;
export function isStorageAvailable() {
  return available;
}

const nowIso = () => new Date().toISOString();

// ---------------- 裸存取（可降级） ----------------

function rawGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    available = false;
    return null;
  }
}
function rawSet(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch (e) {
    available = false;
    return false;
  }
}
function rawRemove(k) {
  try {
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    available = false;
    return false;
  }
}

// ---------------- 槽位路由 ----------------
//
// ★ 槽 0 用裸键名，其余带 `dale_s{N}_` 前缀。老存档（槽 0 的 bike_*）迁移后
//   原位变成「存档1」，不需要额外的数据搬运。
function slotIndex() {
  const n = store.slot | 0;
  return n >= 0 && n < MAX_SLOTS ? n : 0;
}
function slotKey(n, k) {
  return n === 0 ? k : `dale_s${n}_${k}`;
}
function lsGet(k) {
  return rawGet(slotKey(slotIndex(), k));
}
function lsSet(k, v) {
  return rawSet(slotKey(slotIndex(), k), v);
}
function lsRemove(k) {
  return rawRemove(slotKey(slotIndex(), k));
}

// ---------------- 校验小工具 ----------------

/** 安全解析 JSON，失败返回 fallback */
function jsonOr(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

/**
 * 安全取整：非有限值 / 布尔 / null 一律返回 0。
 *
 * ★ 布尔必须显式排除：Number(true) === 1，会把一个坏字段读成"胜场 1 场"。
 */
function intOr(v) {
  if (typeof v === "boolean" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function strOr(v, fallback) {
  return typeof v === "string" && v ? v : fallback;
}
function objOr(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

/**
 * 把任意值夹成合法的升级等级。
 *
 * ★ 坏存档会让**物理直接算出 NaN**，而不只是"数值难看"：
 *   deriveHandling 算 `1 + 0.020 * up.engine`，engine 若是 "a" / undefined，
 *   topSpeed / torquePeak 全变 NaN → 车推不动而 state 仍显示 play。
 */
function clampLv(v, maxLv) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(maxLv || MAX_LV, n));
}
/** 把任意值夹成 0..3 的星级 */
function clampStar(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(3, n) : 0;
}

/** 车辆 id → VEHICLES 下标；-1 = 该车已从游戏里删掉 */
function indexOfVeh(id) {
  return VEHICLES.findIndex((v) => v.id === id);
}

/**
 * 逐车记录的**空模板**。
 *
 * boughtAt / formAt / odometerM / runs 是 v5 新增的明细字段：升级等级答不了
 * "这台车我什么时候买的、骑了多少公里"，而这些问题只有逐车留痕才答得上来。
 */
function blankVehMeta(id) {
  return {
    id,
    engine: 0, tire: 0, frame: 0, susp: 0,
    boughtAt: "", formAt: "", odometerM: 0, runs: 0,
  };
}

// ============================================================
//  旧方案（bike_* 下标索引）的下标 → id 对照表
//
//  ★ 这是**迁移专用**的常量，用完即可废弃：v5 之后车库按 id 存，
//    再删任何一台车都不会影响存档，因此永远不需要再更新这张表。
//    顺序 = 2026-10 精简之前的 VEHICLES 数组顺序（当时 33 辆）。
// ============================================================
const LEGACY_VEHICLE_IDS = [
  "trail", "sport", "mud", "volt", "ghost", "fort", "photon", "singularity",
  "cv1", "cv2", "cv3", "cv4", "cv5", "cv6", "cv7",
  "commuter", "dirt", "storm", "reef", "canyon", "aurora", "sandstorm", "magma",
  "glacier", "monsoon", "obsidian", "titan", "solstice", "vanguard", "phantom",
  "eclipse", "nova", "oblivion",
];
/** 旧下标 → 现存车辆 id；该车已被精简掉则返回 null（它的数据就此丢弃） */
function legacyIdAt(index) {
  const id = LEGACY_VEHICLE_IDS[intOr(index)];
  return id && indexOfVeh(id) >= 0 ? id : null;
}

// ============================================================
//  文档 ↔ store
// ============================================================

/** 把 store 复位成一份全新的空存档（resetSave / applyDoc(null) / 读档兜底共用） */
function blankStoreState() {
  store.gold = 0;
  store.unlocked = 0;
  store.selLevel = 0;
  store.stars = new Array(LEVELS.length).fill(0);
  store.ownedVehicles = [0];
  store.currentVehicle = 0;
  store.upgrades = {};
  store.ultra = {};
  store.garageMeta = {};
  store.muted = false;
  store.achGot = [];
  store.createdAt = "";
  store.progress = {
    branchCleared: [], finaleDone: false, finaleSeg: 0, invited: false,
    rating: 0, wins: 0, losses: 0, peak: false, promoClaimed: 0, freeThemes: [],
  };
  store.space = { rating: 0, records: {} };
  store.stat = {
    totalRuns: 0, totalMeters: 0, totalSeconds: 0, lastPlayed: "",
    earnedGold: 0, byMode: {},
  };
}

/** 校验"每车一份"的容器：只保留形状正确且**车辆仍存在**的条目 */
function sanitizeVehicles(raw) {
  const out = {};
  const src = objOr(raw);
  if (!src) return out;
  for (const veh of VEHICLES) {
    const rec = objOr(src[veh.id]);
    if (!rec) continue;
    const ml = maxLvOf(veh);
    out[veh.id] = {
      ...blankVehMeta(veh.id),
      engine: clampLv(rec.engine, ml), tire: clampLv(rec.tire, ml),
      frame: clampLv(rec.frame, ml), susp: clampLv(rec.susp, ml),
      boughtAt: strOr(rec.boughtAt, ""), formAt: strOr(rec.formAt, ""),
      odometerM: Math.max(0, intOr(rec.odometerM)), runs: Math.max(0, intOr(rec.runs)),
    };
  }
  return out;
}
function sanitizeByMode(raw) {
  const out = {};
  const src = objOr(raw);
  if (!src) return out;
  for (const key of ["level", "race", "ranked", "space", "free"]) {
    const o = objOr(src[key]);
    if (!o) continue;
    out[key] = {
      runs: Math.max(0, intOr(o.runs)),
      meters: Math.max(0, intOr(o.meters)),
      seconds: Math.max(0, intOr(o.seconds)),
    };
  }
  return out;
}
function sanitizeRecords(raw) {
  const out = {};
  const src = objOr(raw);
  if (!src) return out;
  for (const key in src) {
    const o = objOr(src[key]);
    // 赛事键的形状固定为 "联赛下标-分区-赛次"，越界的键一律丢弃
    if (!o || !/^L\d+-[ABC]-\d+$/.test(key)) continue;
    out[key] = { runs: Math.max(0, intOr(o.runs)), wins: Math.max(0, intOr(o.wins)), best: Math.max(0, intOr(o.best)) };
  }
  return out;
}

/** store → 存档文档（唯一序列化出口） */
export function buildDoc() {
  const vehicles = {};
  const owned = [];
  for (const index of store.ownedVehicles || []) {
    const veh = VEHICLES[index];
    if (!veh || owned.includes(veh.id)) continue;
    owned.push(veh.id);
    const up = store.upgrades[veh.id] || {};
    const meta = store.garageMeta[veh.id] || {};
    vehicles[veh.id] = {
      ...blankVehMeta(veh.id),
      engine: clampLv(up.engine, maxLvOf(veh)), tire: clampLv(up.tire, maxLvOf(veh)),
      frame: clampLv(up.frame, maxLvOf(veh)), susp: clampLv(up.susp, maxLvOf(veh)),
      boughtAt: strOr(meta.boughtAt, ""), formAt: strOr(meta.formAt, ""),
      odometerM: Math.max(0, intOr(meta.odometerM)), runs: Math.max(0, intOr(meta.runs)),
    };
  }
  const forms = {};
  for (const id in store.ultra || {}) {
    if (store.ultra[id] === true && indexOfVeh(id) >= 0) forms[id] = true;
  }
  const p = store.progress || {};
  const s = store.stat || {};
  const current = VEHICLES[store.currentVehicle];
  return {
    app: SAVE_APP,
    format: SAVE_FORMAT,
    schema: CUR_SCHEMA,
    savedAt: nowIso(),
    // 只有"从旧方案搬过来"的存档才带这个字段：新档不带，玩家一眼能分辨来历
    migratedFrom: store.migratedFrom > 0 ? store.migratedFrom : undefined,
    profile: {
      name: `存档${slotIndex() + 1}`,
      createdAt: strOr(store.createdAt, nowIso()),
      lastPlayed: strOr(s.lastPlayed, ""),
    },
    wallet: {
      gold: toPlainDecimal(store.gold),
      earned: toPlainDecimal(s.earnedGold),
    },
    garage: {
      current: current ? current.id : "",
      owned,
      forms,
      vehicles,
    },
    campaign: {
      unlocked: Math.max(0, intOr(store.unlocked)),
      sel: Math.max(0, intOr(store.selLevel)),
      stars: (store.stars || []).map(clampStar),
      finaleSeg: Math.max(0, Math.min(FINALE_SEGS, intOr(p.finaleSeg))),
      finaleDone: p.finaleDone === true,
      invited: p.invited === true,
    },
    ranked: {
      rating: Math.max(0, intOr(p.rating)),
      wins: Math.max(0, intOr(p.wins)),
      losses: Math.max(0, intOr(p.losses)),
      promoClaimed: Math.max(0, intOr(p.promoClaimed)),
      advanced: store.rankedAdvanced === true,
    },
    // 宇宙联赛与排位赛**分开**记：两套阶梯的解锁规则不同，混在一起会互相污染
    space: {
      rating: Math.max(0, intOr((store.space || {}).rating)),
      records: { ...((store.space || {}).records || {}) },
    },
    lifetime: {
      runs: Math.max(0, intOr(s.totalRuns)),
      meters: Math.max(0, intOr(s.totalMeters)),
      seconds: Math.max(0, intOr(s.totalSeconds)),
      lastPlayed: strOr(s.lastPlayed, ""),
      byMode: sanitizeByMode(s.byMode),
    },
    settings: { muted: store.muted === true },
  };
}

/** 存档文档 → store（读档唯一入口，逐字段校验） */
export function applyDoc(doc) {
  blankStoreState();
  if (!objOr(doc)) return false;
  const g = objOr(doc.garage) || {};
  const c = objOr(doc.campaign) || {};
  const r = objOr(doc.ranked) || {};
  const l = objOr(doc.lifetime) || {};
  const sp = objOr(doc.space) || {};

  store.createdAt = strOr((objOr(doc.profile) || {}).createdAt, "");
  store.migratedFrom = intOr(doc.migratedFrom);

  store.gold = safeGold(fromPlainDecimal((objOr(doc.wallet) || {}).gold));
  store.stat.earnedGold = safeGold(fromPlainDecimal((objOr(doc.wallet) || {}).earned));

  store.upgrades = sanitizeVehicles(g.vehicles);
  // 明细从 vehicles 里拆出来单独放一份：物理只读 upgrades，面板只读 garageMeta
  store.garageMeta = {};
  for (const id in store.upgrades) {
    const v = store.upgrades[id];
    store.garageMeta[id] = { boughtAt: v.boughtAt, formAt: v.formAt, odometerM: v.odometerM, runs: v.runs };
  }

  // 拥有列表：id → 下标。已经被精简掉的车自然消失，不需要任何额外处理
  store.ownedVehicles = [];
  for (const id of Array.isArray(g.owned) ? g.owned : []) {
    const index = indexOfVeh(id);
    if (index >= 0 && !store.ownedVehicles.includes(index)) store.ownedVehicles.push(index);
  }
  if (!store.ownedVehicles.length) store.ownedVehicles = [0];

  store.currentVehicle = indexOfVeh(strOr(g.current, ""));
  if (!store.ownedVehicles.includes(store.currentVehicle)) store.currentVehicle = store.ownedVehicles[0];

  store.ultra = {};
  for (const id in objOr(g.forms) || {}) {
    if (g.forms[id] === true && indexOfVeh(id) >= 0) store.ultra[id] = true;
  }

  store.unlocked = Math.max(0, Math.min(LEVELS.length - 1, intOr(c.unlocked)));
  store.selLevel = Math.max(0, Math.min(LEVELS.length - 1, intOr(c.sel)));
  store.stars = (Array.isArray(c.stars) ? c.stars.map(clampStar) : [])
    .concat(new Array(LEVELS.length).fill(0)).slice(0, LEVELS.length);

  store.progress.finaleSeg = Math.max(0, Math.min(FINALE_SEGS, intOr(c.finaleSeg)));
  store.progress.finaleDone = c.finaleDone === true;
  store.progress.invited = c.invited === true;
  store.progress.rating = Math.max(0, intOr(r.rating));
  store.progress.wins = Math.max(0, intOr(r.wins));
  store.progress.losses = Math.max(0, intOr(r.losses));
  store.progress.promoClaimed = Math.max(0, intOr(r.promoClaimed));
  store.rankedAdvanced = r.advanced === true;

  store.space = { rating: Math.max(0, intOr(sp.rating)), records: sanitizeRecords(sp.records) };

  store.stat.totalRuns = Math.max(0, intOr(l.runs));
  store.stat.totalMeters = Math.max(0, intOr(l.meters));
  store.stat.totalSeconds = Math.max(0, intOr(l.seconds));
  store.stat.lastPlayed = strOr(l.lastPlayed, "");
  store.stat.byMode = sanitizeByMode(l.byMode);

  store.muted = (objOr(doc.settings) || {}).muted === true;
  return true;
}

// ============================================================
//  旧 bike_* 方案 → v5 文档（自动迁移）
// ============================================================

/** 旧方案的升级数据里，四项等级在哪 */
function legacyLevelsOf(upRaw, id, veh) {
  // 早期还有"全局单一升级"的扁平格式（{engine,tire,frame,susp}），一并兜住
  const rec = objOr(upRaw) ? (objOr(upRaw[id]) || upRaw) : {};
  const ml = maxLvOf(veh);
  return {
    engine: clampLv(rec.engine, ml), tire: clampLv(rec.tire, ml),
    frame: clampLv(rec.frame, ml), susp: clampLv(rec.susp, ml),
  };
}

/**
 * 由旧方案的一组原始键值构造 v5 文档（纯函数，不碰 localStorage）。
 *
 * @param {object} map  旧键 → 原始字符串值
 * @returns {object|null} v5 文档；map 里没有任何 bike_* 键时返回 null
 */
function legacyDocFrom(map) {
  const src = objOr(map);
  if (!src) return null;
  const keys = Object.keys(src).filter((k) => k.indexOf("bike_") === 0);
  if (!keys.length) return null;

  const ver = intOr(src[SAVE_KEYS.ver]);
  // 版本 0/1 = 最早那代，金币的单位换过（详见下方 buildDoc 注释里那条历史）
  let gold = safeGold(fromPlainDecimal(src[SAVE_KEYS.gold]));
  if (ver < 2) gold *= 10;

  const ownedRaw = jsonOr(src[SAVE_KEYS.owned] || "[0]", [0]);
  const upRaw = jsonOr(src[SAVE_KEYS.up] || "{}", {});
  const owned = [];
  const vehicles = {};
  for (const index of (Array.isArray(ownedRaw) ? ownedRaw : [0]).map(intOr)) {
    const id = legacyIdAt(index);
    if (!id || owned.includes(id)) continue;
    owned.push(id);
    vehicles[id] = { ...blankVehMeta(id), ...legacyLevelsOf(upRaw, id, VEHICLES[indexOfVeh(id)]) };
  }
  if (!owned.length) owned.push(VEHICLES[0].id);

  const forms = {};
  const ultraRaw = objOr(jsonOr(src[SAVE_KEYS.ultra] || "{}", {})) || {};
  for (const id in ultraRaw) {
    if (ultraRaw[id] === true && indexOfVeh(id) >= 0) forms[id] = true;
  }

  const starsRaw = jsonOr(src[SAVE_KEYS.stars] || "[]", []);
  const stars = (Array.isArray(starsRaw) ? starsRaw : []).map(clampStar)
    .concat(new Array(LEVELS.length).fill(0)).slice(0, LEVELS.length);

  const prog = objOr(jsonOr(src[SAVE_KEYS.prog] || "{}", {})) || {};
  const stat = objOr(jsonOr(src[SAVE_KEYS.stat] || "{}", {})) || {};
  const current = legacyIdAt(src[SAVE_KEYS.veh]);

  return {
    app: SAVE_APP,
    format: SAVE_FORMAT,
    schema: CUR_SCHEMA,
    savedAt: nowIso(),
    migratedFrom: ver > 0 ? ver : LEGACY_MAX_VER,
    profile: {
      name: `存档${slotIndex() + 1}`,
      createdAt: nowIso(),
      lastPlayed: strOr(stat.lastPlayed, ""),
    },
    wallet: {
      gold: toPlainDecimal(gold),
      earned: toPlainDecimal(safeGold(Number(stat.earnedGold) || 0)),
    },
    garage: {
      current: current && owned.includes(current) ? current : owned[0],
      owned,
      forms,
      vehicles,
    },
    campaign: {
      unlocked: Math.max(0, intOr(src[SAVE_KEYS.unlocked])),
      sel: Math.max(0, intOr(src[SAVE_KEYS.sel])),
      stars,
      finaleSeg: Math.max(0, intOr(prog.finaleSeg)),
      finaleDone: prog.finaleDone === true,
      invited: prog.invited === true,
    },
    ranked: {
      rating: Math.max(0, intOr(src[SAVE_KEYS.rating] || prog.rating)),
      wins: Math.max(0, intOr(prog.wins)),
      losses: Math.max(0, intOr(prog.losses)),
      promoClaimed: Math.max(0, intOr(prog.promoClaimed)),
      advanced: false,
    },
    space: { rating: 0, records: {} },
    lifetime: {
      runs: Math.max(0, intOr(stat.totalRuns || stat.games)),
      meters: Math.max(0, intOr(stat.totalMeters || stat.dist)),
      seconds: Math.max(0, intOr(stat.totalSeconds || stat.time)),
      lastPlayed: strOr(stat.lastPlayed, ""),
      byMode: {},
    },
    settings: { muted: src[SAVE_KEYS.mute] === "1" || src[SAVE_KEYS.mute] === 1 },
  };
}

/** 当前槽是否存在旧方案数据（任一非文档键有值即算） */
function hasLegacyData() {
  for (const k of ALL_KEYS) {
    if (k === SAVE_KEYS.doc || k === SAVE_KEYS.ach) continue;
    if (lsGet(k) !== null) return true;
  }
  return false;
}

/** 清掉旧方案的键（成就键 bike_ach 保留：它不在文档里，独立于方案演进） */
function clearLegacyKeys() {
  for (const k of ALL_KEYS) {
    if (k === SAVE_KEYS.doc || k === SAVE_KEYS.ach) continue;
    lsRemove(k);
  }
}

// ============================================================
//  读写主路径
// ============================================================

/** 读当前槽的文档（校验 app 与形状；不合格视为"没有存档"） */
export function readDoc() {
  const d = objOr(jsonOr(lsGet(SAVE_KEYS.doc), null));
  return d && d.app === SAVE_APP ? d : null;
}
function writeDoc(doc) {
  return lsSet(SAVE_KEYS.doc, JSON.stringify(doc));
}

/**
 * 读档：优先新文档；没有就读旧方案并**就地迁移**（用户要求"访问过就自动升级"）。
 */
export function loadSave() {
  try {
    const persisted = parseInt(rawGet(META_KEYS.slot) || "0", 10);
    store.slot = Number.isFinite(persisted) && persisted >= 0 && persisted < MAX_SLOTS ? persisted : 0;

    // ★ 旧版的 bike_trial 后门（每次读档都把**全部**车辆置为已拥有 + 满级 + 形态全开）
    //   就是"买了车之后新车也自动拥有、而且是满级"这个故障的根因：
    //   它每次加载都无条件覆盖车库，玩家任何购车/升级结果都会被下一次刷新抹掉。
    //   直接连键带效果一起删除 —— 详见 docs/SAVE_FORMAT_DEPRECATION.md。
    if (lsGet("bike_trial") !== null) lsRemove("bike_trial");

    const doc = readDoc();
    if (doc) {
      applyDoc(doc);
    } else if (hasLegacyData()) {
      const legacy = {};
      for (const k of ALL_KEYS) {
        if (k === SAVE_KEYS.doc || k === SAVE_KEYS.ach) continue;
        const v = lsGet(k);
        if (v !== null) legacy[k] = v;
      }
      const migrated = legacyDocFrom(legacy);
      if (migrated) {
        applyDoc(migrated);
        writeDoc(migrated);
        clearLegacyKeys();
      } else {
        resetSave();
      }
    } else {
      resetSave();
    }
    loadAchList();
    refreshProgress();
    touchSlotMeta(slotIndex(), clearedCountOfCurrent());
  } catch (e) {
    blankStoreState();
  }
}

/**
 * 写盘（唯一落盘出口）。旧实现要写 12 个 bike_* 键，现在一次 JSON 写一整份文档。
 */
export function save() {
  const ok = writeDoc(buildDoc());
  if (ok) touchSlotMeta(slotIndex(), clearedCountOfCurrent());
  return ok;
}
export function saveAll() {
  return save();
}
/**
 * 下面三个是**历史 API 兼容层**：v5 之后整份文档一起写，它们不再各自持有数据。
 * 保留导出是因为 game/progress.js 等处仍在按"改了某项就落盘"的语义调用它们。
 */
export function saveProgress() {
  return save();
}
export function saveStat() {
  return save();
}
export function saveAchList() {
  // 成就清单仍单独存 bike_ach：它不在文档里，键也不再改动（历史兼容 + 体积小）
  return lsSet(SAVE_KEYS.ach, JSON.stringify(store.achGot || []));
}

/** 结算落盘点：刷新阶梯派生态后立即写盘 */
export function settleProgress() {
  refreshProgress();
  save();
  return store.progress;
}

/** 重读进度已由 loadSave 一并完成；保留导出是为了 main.js 现有的调用顺序 */
export function loadProgress() {
  return refreshProgress();
}
export function loadStat() {
  return store.stat;
}

// ============================================================
//  进度阶梯：纯函数
// ============================================================

/** 由星级数组推导"已通关支线下标" */
export function deriveBranchCleared() {
  const out = [];
  for (let b = 0; b < BRANCHES.length; b++) {
    let all = true;
    for (let k = 0; k < LEVELS_PER_BRANCH; k++) {
      if (!(store.stars[b * LEVELS_PER_BRANCH + k] > 0)) { all = false; break; }
    }
    if (all) out.push(b);
  }
  return out;
}

/** "已通关场景"下标数组（无限模式自由选图用） */
export function availableFreeThemes() {
  const out = [];
  for (const b of deriveBranchCleared()) {
    const t = BRANCHES[b] ? BRANCHES[b].theme : b;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** 高级排位赛准入（rating ≥ 1200） */
export function isAdvancedUnlocked(rating) {
  return (Number(rating) || 0) >= RATING_ADVANCED;
}

/**
 * 阶梯解锁判定（纯函数，不修改入参）。
 * 支线通关 / 最终任务邀请 / 高级赛 / 登顶全部由这里派生，store.progress 只存事实。
 */
export function deriveUnlocks(progress, stars) {
  const p = objOr(progress) || {};
  const arr = Array.isArray(stars) ? stars : [];
  const allCleared = LEVELS.length > 0 && arr.length >= LEVELS.length &&
    arr.slice(0, LEVELS.length).every((s) => s >= 1);
  const rating = Math.max(0, intOr(p.rating));
  return {
    allCleared,
    finaleUnlocked: allCleared,
    finaleDone: p.finaleDone === true,
    invited: p.finaleDone === true || p.invited === true,
    advancedUnlocked: isAdvancedUnlocked(rating),
    peak: p.peak === true || rating >= RATING_PEAK,
  };
}
/** 登顶后把"已通关支线对应的场景"写入 freeThemes；未登顶时清空 */
export function syncFreeThemes() {
  if (!store.progress.peak) {
    store.progress.freeThemes = [];
    return store.progress.freeThemes;
  }
  store.progress.freeThemes = availableFreeThemes();
  return store.progress.freeThemes;
}
/** 把阶梯派生态写回 store.progress（只改内存，落盘由调用方决定） */
export function refreshProgress() {
  const d = deriveUnlocks(store.progress, store.stars);
  store.progress.branchCleared = deriveBranchCleared();
  if (d.finaleDone) store.progress.finaleDone = true;
  if (d.invited) store.progress.invited = true;
  if (d.peak) store.progress.peak = true;
  syncFreeThemes();
  return store.progress;
}

// ============================================================
//  累计统计 / 车库明细 / 联赛成绩
// ============================================================

/**
 * 累计统计累加。
 * @param {{runs?:number,meters?:number,seconds?:number,mode?:string}} o
 *   mode 传入时**额外**累加到 stat.byMode[mode] —— v5 新增的分模式统计，
 *   用来回答"我在排位赛上到底花了多少时间"，扁平累加值答不了。
 */
export function addStat({ runs = 0, meters = 0, seconds = 0, mode = "" } = {}) {
  const st = store.stat;
  const r = Math.max(0, Number(runs) || 0);
  const m = Math.max(0, Number(meters) || 0);
  const s = Math.max(0, Number(seconds) || 0);
  st.totalRuns += r;
  st.totalMeters += m;
  st.totalSeconds += s;
  st.lastPlayed = nowIso();
  if (mode) {
    const b = st.byMode[mode] || (st.byMode[mode] = { runs: 0, meters: 0, seconds: 0 });
    b.runs += r;
    b.meters += m;
    b.seconds += s;
  }
  saveStat();
  return st;
}

/** 取（并惰性建立）某辆车的明细 */
function metaOf(id) {
  return store.garageMeta[id] || (store.garageMeta[id] = { boughtAt: "", formAt: "", odometerM: 0, runs: 0 });
}
/** 购车时打点：只记第一次（重复调用不会覆盖已记录的购入时间） */
export function noteVehiclePurchase(id) {
  const m = metaOf(id);
  if (!m.boughtAt) m.boughtAt = nowIso();
  return m;
}
/** 解锁形态时打点 */
export function noteVehicleForm(id) {
  metaOf(id).formAt = nowIso();
}
/** 每局结算时累加这台车的里程与场次 */
export function noteVehicleRun(id, meters) {
  const m = metaOf(id);
  m.runs += 1;
  m.odometerM += Math.max(0, Math.round(Number(meters) || 0));
  return m;
}
/**
 * 记录一场宇宙联赛赛事的成绩。
 * @param {string} key 赛事键（"L2-B-1" = 联赛 2 / 分区乙 / 第 1 场）
 * @param {number} place 最终名次（1 起；0 = 未完赛）
 */
export function noteSpaceResult(key, place, won) {
  const rec = store.space.records[key] || (store.space.records[key] = { runs: 0, wins: 0, best: 0 });
  rec.runs += 1;
  if (won) rec.wins += 1;
  if (place > 0 && (rec.best === 0 || place < rec.best)) rec.best = place;
  return rec;
}

// ---------------- 升级数据访问 ----------------

/** 读取当前车辆的升级等级（没有则惰性初始化） */
export function getUp() {
  const veh = VEHICLES[store.currentVehicle];
  const id = veh ? veh.id : VEHICLES[0].id;
  return store.upgrades[id] || (store.upgrades[id] = { engine: 0, tire: 0, frame: 0, susp: 0 });
}

export function loadAchList() {
  const v = jsonOr(lsGet(SAVE_KEYS.ach) || "[]", []);
  store.achGot = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

// ============================================================
//  多存档槽
// ============================================================

function readSlots() {
  const v = jsonOr(rawGet(META_KEYS.slots), []);
  return Array.isArray(v) ? v.slice(0, MAX_SLOTS) : [];
}
function writeSlots(v) {
  rawSet(META_KEYS.slots, JSON.stringify(v.slice(0, MAX_SLOTS)));
}
function slotUsed(n) {
  if (rawGet(slotKey(n, SAVE_KEYS.doc)) !== null) return true;
  for (const k of ALL_KEYS) {
    if (k === SAVE_KEYS.doc) continue;
    if (rawGet(slotKey(n, k)) !== null) return true;
  }
  return false;
}
export function currentSlot() {
  return slotIndex();
}
/** 汇总槽位列表（面板渲染用）：未启用的槽显示为"空" */
export function listSlots() {
  const meta = readSlots();
  const out = [];
  for (let n = 0; n < MAX_SLOTS; n++) {
    const used = slotUsed(n);
    const m = meta[n] || {};
    out.push({
      index: n,
      name: m.name || `存档${n + 1}`,
      used,
      active: n === slotIndex(),
      updatedAt: m.updatedAt || "",
      cleared: used ? (m.cleared | 0) : 0,
    });
  }
  return out;
}
function clearedCountOfCurrent() {
  let n = 0;
  for (const s of store.stars) if (s >= 1) n++;
  return n;
}
/** 记录当前槽的元信息（存档时顺带写，省一次额外遍历） */
function touchSlotMeta(n, cleared) {
  const meta = readSlots();
  while (meta.length < MAX_SLOTS) meta.push({});
  meta[n] = {
    ...meta[n],
    name: meta[n] && meta[n].name ? meta[n].name : `存档${n + 1}`,
    updatedAt: new Date().toISOString().slice(0, 10),
    cleared: cleared | 0,
  };
  writeSlots(meta);
}

/** 切换存档槽：先把当前槽落盘，再载入目标槽。目标槽为空 = 一份全新存档 */
export function switchSlot(n) {
  n = n | 0;
  if (n < 0 || n >= MAX_SLOTS) return false;
  if (n === slotIndex()) return true;
  try { save(); } catch (e) { /* 落盘失败不阻断切换 */ }
  rawSet(META_KEYS.slot, String(n));
  store.slot = n;
  loadSave();
  return true;
}
/** 新建一个空槽（占用下一个未使用的槽位）并切过去 */
export function createSlot() {
  if (listSlots().filter((s) => s.used).length >= MAX_SLOTS) return -1;
  const target = listSlots().findIndex((s) => !s.used);
  if (target < 0) return -1;
  switchSlot(target);
  resetSave();
  return target;
}
/** 删除某个槽（当前槽不能删，删了会失去落盘目标） */
export function deleteSlot(n) {
  n = n | 0;
  if (n < 0 || n >= MAX_SLOTS || n === slotIndex()) return false;
  for (const k of ALL_KEYS) rawRemove(slotKey(n, k));
  // 槽 0 还可能有历史遗留 / 手工塞进来的键（不在 ALL_KEYS 里），不删就会让槽位永远显示"已用"
  if (n === 0) {
    try {
      const dead = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.indexOf("bike_") === 0 || k === SAVE_KEYS.doc)) dead.push(k);
      }
      for (const k of dead) rawRemove(k);
    } catch (e) {
      available = false;
    }
  }
  const meta = readSlots();
  while (meta.length < MAX_SLOTS) meta.push({});
  meta[n] = {};
  writeSlots(meta);
  return true;
}

/** 清空当前槽并恢复初始状态（存档面板的"重置存档"） */
export function resetSave() {
  applyDoc(null);
  store.createdAt = nowIso();
  writeDoc(buildDoc());
  clearLegacyKeys();
  saveAchList();
  touchSlotMeta(slotIndex(), 0);
  return true;
}

// ============================================================
//  导入 / 导出
// ============================================================

/** 从导入数据里解析进度概览（容错不抛异常），供确认前的对比展示 */
export function summarizeSave(doc) {
  const d = objOr(doc) || {};
  const c = objOr(d.campaign) || {};
  const stars = Array.isArray(c.stars) ? c.stars : [];
  let total = 0;
  for (const s of stars) {
    const n = Number(s) || 0;
    if (n > 0) total += n;
  }
  const g = objOr(d.garage) || {};
  return {
    cleared: stars.filter((s) => Number(s) > 0).length,
    stars: total,
    rating: Math.max(0, intOr((objOr(d.ranked) || {}).rating)),
    spaceRating: Math.max(0, intOr((objOr(d.space) || {}).rating)),
    gold: safeGold(fromPlainDecimal((objOr(d.wallet) || {}).gold)),
    vehicles: Array.isArray(g.owned) ? g.owned.length : 0,
  };
}

/**
 * 校验导入文本。**同时接受两种格式**：
 *   format 2 = v5 文档（现行）；format 1 = 旧的 bike_* 裸键（弃用但仍可导入，
 *   导入时当场转成 v5 文档，玩家存了多年的老导出文件不会作废）。
 */
export function parseSave(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "存档内容不是合法 JSON" };
  }
  if (!objOr(obj) || obj.app !== SAVE_APP) {
    return { ok: false, error: "不是本游戏的存档" };
  }
  let data = null;
  if (obj.format === SAVE_FORMAT) data = objOr(obj.doc) || objOr(obj.data);
  else if (obj.format === 1) data = legacyDocFrom(obj.data);
  if (!data) return { ok: false, error: "存档数据非法" };
  return { ok: true, data, summary: summarizeSave(data) };
}

/** 导出为格式化 JSON 文本（供下载与测试断言） */
export function exportSave() {
  return JSON.stringify({ app: SAVE_APP, format: SAVE_FORMAT, doc: buildDoc() }, null, 2);
}

/** 触发浏览器下载。测试环境没有 Blob / URL / document → 优雅降级返回 false */
export function downloadSave() {
  try {
    if (typeof Blob === "undefined" || typeof URL === "undefined" ||
        typeof URL.createObjectURL !== "function" || typeof document === "undefined") {
      return false;
    }
    const blob = new Blob([exportSave()], { type: "application/json" });
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

/** 导出文件名：dale-bike-save-<YYYYMMDD-HHmm>.json */
function saveFileName(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    "dale-bike-save-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    "-" + p(d.getHours()) + p(d.getMinutes()) + ".json"
  );
}

/**
 * 导入并**立即生效**：直接覆盖当前槽的文档。
 * 入参是 parseSave 返回的 data（v5 文档）或 parseSave 的完整返回值。
 */
export function importSave(data) {
  const doc = data && data.data ? data.data : data;
  if (!objOr(doc)) return { ok: false, error: "存档数据非法" };
  applyDoc(doc);
  save();
  return { ok: true, data: doc };
}

// ============================================================
//  自动保存
// ============================================================

/** 探测 localStorage 是否可写（写-读-清，抛异常则标记为不可用） */
function probeStorage() {
  const k = "__dale_probe__"; // 不以 bike_ / dale_save 开头，避免被导出采集
  try {
    const prev = localStorage.getItem(k);
    localStorage.setItem(k, "1");
    if (prev === null) localStorage.removeItem(k);
  } catch (e) {
    available = false;
  }
}

/**
 * 接线自动保存：骑行中每 intervalMs 兜底写盘 + 切后台立即写盘。
 * 返回定时器句柄（Node 下已 unref，不阻塞进程退出）。
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

export { RATING_ADVANCED, RATING_PEAK };
