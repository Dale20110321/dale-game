// 比赛模式：AI 对手 / 排位赛 AI 强度
//
// 标定原则（据实机反馈修正）：AI 巡航速度必须与本关「三星要求均速 den3」挂钩，
// 而不是与玩家极速 topSpeed 挂钩。原因：topSpeed 由车辆/升级决定，不随关卡变难而提高，
// 旧实现 topSpeed×(0.80~1.28)×(1+42%×ramp) 会让后期 AI 巡航速度达到三星节奏的 2~3 倍
// （实测玩家/AI 用时比从 1.00 恶化到 2.23），比赛必胜 → 对手"太快"。
//
//  · 普通比赛（race）：基准 0.68×den3（明显慢于三星节奏），并带「追赶」修正——
//    AI 领先则降速、落后则提速，夹在 [0.80, 1.25]×基准。对手既不会一路绝尘，
//    也不会因玩家一次小失误就直接拉开差距。基准×追赶上限 = 0.85×den3 < 1×den3，
//    因此「跑出三星水平必赢」。
//  · 排位赛（ranked）：基准 rankedAIScale(rating, advanced)×den3，不带追赶——
//    段位赛是纯粹的配速检验，段位越高越接近、乃至超过三星节奏。
import { START_X, RATING_PEAK, RATING_TOP, RACE_FORMATS, PLAYER_TEAM, RIVAL_TEAM, racePlaceOf, buildRacers } from "../config/constants.js";
import { courseAt } from "../config/levels.js";
import { store, bike } from "../core/store.js";
import { groundInfo } from "../physics/terrain.js";
import { emitParticles } from "../render/particles.js";
import { token } from "../config/ui-tokens.js";

/** 普通比赛的基准配速（相对本关三星要求均速 den3） */
export const RACE_PACE = 0.68;

/** 排位赛 AI 强度：普通档基准 0.70×den3（随段位分最多 +0.20） */
const RANKED_BASE = 0.70;
const RANKED_GAIN = 0.20;
/** 高级排位赛：基准 0.95×den3（随段位分最多 +0.30），显著高于普通档 */
const RANKED_BASE_ADV = 0.95;
const RANKED_GAIN_ADV = 0.30;

/**
 * 段位分 → AI 强度的归一化系数 k ∈ [0, 1+TOP_EXTRA]，纯函数便于测试。
 *
 * ★ 两段折线而不是一条直线：
 *   1) 0 → RATING_PEAK（3300，大师）线性爬到 1 —— 这段是"打上大师"的主线，
 *      沿用原来的难度曲线手感不变。
 *   2) 登顶之后继续爬 TOP_EXTRA —— 段位表扩到 12000「超越」共 14 段，
 *      如果登顶就封顶，后面 5 个段位难度完全一样，阶梯就白设了。
 */
const RANKED_TOP_EXTRA = 0.35;
export function rankedAIScale(rating, advanced) {
  const r = Math.max(0, Number(rating) || 0);
  const t = Math.min(1, r / RATING_PEAK);
  const over = Math.min(1, Math.max(0, r - RATING_PEAK) / Math.max(1, RATING_TOP - RATING_PEAK));
  const k = t + RANKED_TOP_EXTRA * over;
  return advanced ? RANKED_BASE_ADV + RANKED_GAIN_ADV * k : RANKED_BASE + RANKED_GAIN * k;
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

// 赛制配置与名次计算是**纯数据 / 纯函数**，放在 config/constants.js ——
// render/hud.js 要显示"第 N / 6 名"，而 render/** 不许 import game/**（分层是单向的）。
// 因此这里不再转出一份：各层一律直接从 config/constants.js 取，避免"同一个常量有两个出处"。

/** 当前赛制（缺省 duel） */
export function raceFormat() {
  const id = store.raceFormat;
  return (id && RACE_FORMATS[id]) || RACE_FORMATS.duel;
}

/**
 * 决定胜负的那个对手（纯函数）：非团赛取全场最靠前者，团赛取**对手队**最靠前者。
 * game.js / HUD 都只看这一个对象，所以"6 人场"不需要改任何下游判定逻辑。
 */
export function raceDecider(list) {
  const f = raceFormat();
  let best = null;
  for (const a of list || []) {
    if (f.team && a.team !== RIVAL_TEAM) continue;
    if (!best || a.x > best.x) best = a;
  }
  return best;
}

/** 玩家名次（1 = 第一）。团赛返回 [队名次, 队内名次]，其余返回单个名次 */
export function racePlace(list, playerX) {
  return racePlaceOf(list, playerX, raceFormat());
}

export function raceInit(format) {
  store.raceFormat = format && RACE_FORMATS[format] ? format : "duel";
  const built = buildRacers(store.raceFormat);
  store.racers = built.r;
  store.raceAI = raceDecider(store.racers);
}

/** 每个固定步推进全部 AI */
export function raceUpdate(dt) {
  const list = store.racers;
  if (!list || !list.length) return;
  const L = courseAt(store.selLevel, store.mode);
  const playerX = (bike.rear.x + bike.front.x) / 2;

  for (const ai of list) {
    if (ai.finish) continue;
    if (groundInfo(ai.x).y === Infinity) continue;

    let mult;
    if (store.mode === "ranked") {
      // 排位赛：纯配速，无追赶；多人局里每位对手再乘自己的个体系数
      mult = rankedAIScale(store.progress.rating, store.rankedAdvanced) * ai.bias;
    } else {
      // 普通比赛：基准配速 × 追赶修正 × 个体系数。
      // 追赶仍然以**玩家**为参照 —— 团赛里队友也要被拉住，否则玩家掉队时队友会一骑绝尘。
      mult = RACE_PACE * catchupFactor(ai.x - playerX) * ai.bias;
    }
    const target = raceBaseSpeed(L, mult) * (1 + 0.06 * Math.sin(store.time * 0.9 + ai.x * 0.0007));

    ai.spd += (target - ai.spd) * Math.min(1, dt * 3);
    ai.x += ai.spd * dt;

    if (store.finishX !== Infinity && ai.x >= store.finishX) {
      ai.finish = true;
      const gy = groundInfo(store.finishX);
      if (gy.y !== Infinity) {
        emitParticles(store.finishX, gy.y - 20, 16, { color: token("danger"), spd: 2, life: 30, size: 3, grav: 0.03 });
      }
    }
  }

  // 下游（HUD 差距显示、胜负判定）只认一个"决定性对手"，这里每帧刷新
  store.raceAI = raceDecider(list);
}
