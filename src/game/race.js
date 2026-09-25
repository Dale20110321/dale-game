// 比赛模式：AI 对手
// 关键修复：AI 巡航速度必须以"真实 px/s"标度计算（旧代码用 MAXV/SUB 的半标度基准，
// 使 AI 只有玩家的 1/6 速度，比赛必胜）。
import { START_X } from "../config/constants.js";
import { LEVELS } from "../config/levels.js";
import { store } from "../core/store.js";
import { groundInfo } from "../physics/terrain.js";
import { emitParticles } from "../render/particles.js";

export function raceInit() {
  store.raceAI = { x: START_X, spd: 0, finish: false };
}

/** 每个固定步推进 AI */
export function raceUpdate(dt) {
  const ai = store.raceAI;
  if (!ai || ai.finish) return;
  const gi = groundInfo(ai.x);
  if (gi.y === Infinity) return;

  const ramp = LEVELS[store.lvIdx] ? LEVELS[store.lvIdx].ramp : 0;
  // 基准 = 玩家当前平路极速 × 0.73（随车辆与升级同步，保证公平），随关卡推进最多 +35%
  const base =
    Math.max(120, store.phys.MAXV * (0.73 + Math.sin(store.time * 0.7 + ai.x * 0.001) * 0.08)) *
    (1 + 0.35 * ramp);
  // m>0 下坡加速，m<0 上坡减速
  const target = base * (gi.m > 0 ? 1.28 : 1 - Math.min(0.8, Math.max(0, -gi.m) * 0.85));
  ai.spd += (target - ai.spd) * Math.min(1, dt * 2.2);
  ai.x += ai.spd * dt;

  if (store.finishX !== Infinity && ai.x >= store.finishX) {
    ai.finish = true;
    const gy = groundInfo(store.finishX);
    if (gy.y !== Infinity) {
      emitParticles(store.finishX, gy.y - 20, 16, { color: "#e63946", spd: 2, life: 30, size: 3, grav: 0.03 });
    }
  }
}
