// 地形访问层：把"纯地形数学"（config/levels.js）与"当前关卡/模式状态"桥接起来
import { store } from "../core/store.js";
import { LEVELS, levelHillY, levelGroundInfo, freeHill as freeHillPure } from "../config/levels.js";
import { clamp } from "../core/utils.js";

/** 无限模式地形 */
export const freeHill = freeHillPure;

/** 当前地形高度 */
export function hillY(x) {
  if (store.mode === "free") return freeHillPure(x);
  return levelHillY(LEVELS[store.lvIdx], x);
}

export function groundY(x) {
  return hillY(x);
}

/** 当前位置的地面 {y, m}：m>0 下坡，m<0 上坡 */
export function groundInfo(x) {
  const e = 2;
  const y0 = groundY(x);
  const yL = groundY(x - e);
  const yR = groundY(x + e);
  if (!isFinite(y0) || !isFinite(yL) || !isFinite(yR)) {
    return { y: y0, m: 0 };
  }
  return { y: y0, m: (yR - yL) / (2 * e) };
}

/** 在 [140, len-140] 内找一处最平缓的落点（油罐/重生点用） */
export function canSpot(len, xx) {
  let best = clamp(xx, 140, len - 140);
  let bm = 9;
  for (let d = -170; d <= 170; d += 10) {
    const tx = clamp(xx + d, 140, len - 140);
    const m = Math.abs(groundInfo(tx).m);
    if (m < bm) {
      bm = m;
      best = tx;
    }
  }
  return best;
}

/** 重生保障：安全点落在陡坡上时（从静止起不了步），就近换一个更平缓的位置 */
export function safeSpot(x) {
  let bx = x;
  let bm = Math.abs(groundInfo(x).m);
  for (let d = -120; d <= 320; d += 20) {
    const xx = Math.max(24, x + d);
    const m = Math.abs(groundInfo(xx).m);
    if (m < bm) {
      bm = m;
      bx = xx;
    }
  }
  return bm <= 0.16 ? bx : x;
}
