// 地形访问层：把"纯地形数学"（config/levels.js）与"当前关卡/模式状态"桥接起来
import { store } from "../core/store.js";
import { levelAt, levelHillY, levelGroundInfo, freeHill as freeHillPure } from "../config/levels.js";
import { clamp } from "../core/utils.js";

/** 无限模式地形 */
export const freeHill = freeHillPure;

/** 当前地形高度 */
export function hillY(x) {
  if (store.mode === "free") return freeHillPure(x);
  return levelHillY(levelAt(store.lvIdx), x);
}

export function groundY(x) {
  return hillY(x);
}

/** 当前位置的地面 {y, m}：m>0 下坡，m<0 上坡（保留旧签名，行为与旧实现一致） */
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

// ---------------- 解析地形接口（第 3 期 Task 3.1） ----------------
// 物理与渲染共用同一套采样。坐标约定：世界 y **向下为正**，因此：
//   · 坡度 m = dy/dx：m>0 为下坡（屏幕上看地面往下走），m<0 为上坡
//   · 曲率 d²y/dx² > 0 为「上凸坡顶」（腾空的几何条件），< 0 为凹谷
// 这些量用中心差分从**同一个** levelHillY/freeHill 求导得到，不引入第二套地形数学。

/** 地面坡度 m = dy/dx */
export function groundSlope(x) {
  const e = 2;
  const yL = groundY(x - e);
  const yR = groundY(x + e);
  if (!isFinite(yL) || !isFinite(yR)) return 0;
  return (yR - yL) / (2 * e);
}

/**
 * 单位法线（指向地面之外，即屏幕「上」方）。
 * 切向为 (1, m)，其垂线取 (m, -1)（y 分量为负 = 屏幕上方），再归一化。
 * 平地 m=0 → (0, -1) 竖直向上。
 */
export function groundNormal(x) {
  const m = groundSlope(x);
  const d = Math.hypot(1, m) || 1;
  return { x: m / d, y: -1 / d };
}

/** 地面曲率 d²y/dx²（>0 上凸坡顶 / <0 凹谷） */
export function groundCurvature(x) {
  const e = 6;
  const y0 = groundY(x);
  const yL = groundY(x - e);
  const yR = groundY(x + e);
  if (!isFinite(y0) || !isFinite(yL) || !isFinite(yR)) return 0;
  return (yR - 2 * y0 + yL) / (e * e);
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
