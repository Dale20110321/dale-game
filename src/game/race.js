// 比赛模式：AI 对手 / 排位赛 AI 强度
//
// 标定原则（据实机反馈修正）：AI 巡航速度必须与本关「三星要求均速 den3」挂钩，
// 而不是与玩家极速 MAXV 挂钩。原因：MAXV 由车辆/升级决定，不随关卡变难而提高，
// 旧实现 MAXV×(0.80~1.28)×(1+42%×ramp) 会让后期 AI 巡航速度达到三星节奏的 2~3 倍
// （实测玩家/AI 用时比从 1.00 恶化到 2.23），比赛必胜 → 对手"太快"。
//
//  · 普通比赛（race）：基准 0.68×den3（明显慢于三星节奏），并带「追赶」修正——
//    AI 领先则降速、落后则提速，夹在 [0.80, 1.25]×基准。对手既不会一路绝尘，
//    也不会因玩家一次小失误就直接拉开差距。基准×追赶上限 = 0.85×den3 < 1×den3，
//    因此「跑出三星水平必赢」。
//  · 排位赛（ranked）：基准 rankedAIScale(rating, advanced)×den3，不带追赶——
//    段位赛是纯粹的配速检验，段位越高越接近、乃至超过三星节奏。
import { START_X, RATING_PEAK } from "../config/constants.js";
import { levelAt } from "../config/levels.js";
import { store, bike } from "../core/store.js";
import { groundInfo } from "../physics/terrain.js";
import { emitParticles } from "../render/particles.js";

// 段位名与排位赛数值同为"配置层数据"，统一放 config/constants.js；
// 这里转出以便排位赛相关测试只从一个模块取用。
export { rankName } from "../config/constants.js";

/** 普通比赛的基准配速（相对本关三星要求均速 den3） */
export const RACE_PACE = 0.68;

/** 排位赛 AI 强度：普通档基准 0.70×den3（随段位分最多 +0.20） */
const RANKED_BASE = 0.70;
const RANKED_GAIN = 0.20;
/** 高级排位赛：基准 0.95×den3（随段位分最多 +0.30），显著高于普通档 */
const RANKED_BASE_ADV = 0.95;
const RANKED_GAIN_ADV = 0.30;

/**
 * 排位赛 AI 强度（相对本关三星要求均速 den3 的倍率）——纯函数，便于测试。
 * @param {number} rating 当前段位分
 * @param {boolean} advanced 是否高级赛
 * @returns {number} 倍率：普通档 [0.70, 0.90]，高级档 [0.95, 1.25]（任意 rating 下高级 > 普通）
 */
export function rankedAIScale(rating, advanced) {
  const r = Math.max(0, Number(rating) || 0);
  const t = Math.min(1, r / RATING_PEAK);
  return advanced ? RANKED_BASE_ADV + RANKED_GAIN_ADV * t : RANKED_BASE + RANKED_GAIN * t;
}

// ---- 普通比赛的「追赶」参数（rubber band）----
/** 追赶感知距离（px）：领先这么多时，速度修正达到 ±CATCHUP_K */
const CATCHUP_SPAN = 2600;
/** 追赶强度 */
const CATCHUP_K = 0.40;
/** AI 相对基准的最低/最高配速修正（保证对手不会绝尘、也不会突然变蜗牛） */
export const CATCHUP_MIN = 0.80;
export const CATCHUP_MAX = 1.25;

/**
 * AI 基准巡航速度（px/s）= 本关三星要求均速 × 倍率 —— 纯函数，便于测试。
 * @param {{den3?:number}} L 关卡定义
 * @param {number} mult 配速倍率（<1 表示比三星节奏慢）
 */
export function raceBaseSpeed(L, mult) {
  const den3 = L && L.den3 > 0 ? L.den3 : 0;
  return den3 * mult;
}

/**
 * 普通比赛的追赶修正（纯函数，便于测试）：
 * AI 领先玩家 → 降速；落后 → 提速；夹在 [CATCHUP_MIN, CATCHUP_MAX]。
 * @param {number} leadPx AI 相对玩家的领先量（px，正 = AI 领先）
 */
export function catchupFactor(leadPx) {
  const k = 1 - (leadPx / CATCHUP_SPAN) * CATCHUP_K;
  return Math.max(CATCHUP_MIN, Math.min(CATCHUP_MAX, k));
}

export function raceInit() {
  store.raceAI = { x: START_X, spd: 0, finish: false };
}

/** 每个固定步推进 AI */
export function raceUpdate(dt) {
  const ai = store.raceAI;
  if (!ai || ai.finish) return;
  const gi = groundInfo(ai.x);
  if (gi.y === Infinity) return;

  const L = levelAt(store.lvIdx);
  let mult;
  if (store.mode === "ranked") {
    // 排位赛：纯配速，无追赶
    mult = rankedAIScale(store.progress.rating, store.rankedAdvanced);
  } else {
    // 普通比赛：基准配速 × 追赶修正
    const playerX = (bike.rear.x + bike.front.x) / 2;
    mult = RACE_PACE * catchupFactor(ai.x - playerX);
  }
  // 轻微起伏（正弦均值≈0）：只让画面不呆板，不改变平均配速
  const target = raceBaseSpeed(L, mult) * (1 + 0.06 * Math.sin(store.time * 0.9 + ai.x * 0.0007));

  ai.spd += (target - ai.spd) * Math.min(1, dt * 3);
  ai.x += ai.spd * dt;

  if (store.finishX !== Infinity && ai.x >= store.finishX) {
    ai.finish = true;
    const gy = groundInfo(store.finishX);
    if (gy.y !== Infinity) {
      emitParticles(store.finishX, gy.y - 20, 16, { color: "#e63946", spd: 2, life: 30, size: 3, grav: 0.03 });
    }
  }
}
