// 地形访问层：把"纯地形数学"（config/levels.js）与"当前关卡/模式状态"桥接起来
import { store } from "../core/store.js";
import { courseAt, levelHillY, levelGroundInfo, freeHill as freeHillPure } from "../config/levels.js";
import { clamp } from "../core/utils.js";

/** 无限模式地形 */
export const freeHill = freeHillPure;

/** 当前地形高度 */
export function hillY(x) {
  if (store.mode === "free") return freeHillPure(x);
  return levelHillY(courseAt(store.selLevel, store.mode), x);
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
    // 兜底必须返回**有限值**：原实现把 NaN/Infinity 原样返回，会沿"接触求解 → Verlet 积分"
    // 一路传播进物理链，最终让 game.js 每帧判定"坠出地图"并无限 respawn + 刷 toast。
    const safe = isFinite(y0) ? y0 : isFinite(yL) ? yL : isFinite(yR) ? yR : 0;
    return { y: safe, m: 0 };
  }
  return { y: y0, m: (yR - yL) / (2 * e) };
}

// ---------------- 解析地形接口 ----------------
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
  // 搜索窗向前留得更长：摔车多发生在下坡/断层之后，真正能起步的落点通常在前方
  for (let d = -200; d <= 600; d += 20) {
    const xx = Math.max(24, x + d);
    const m = Math.abs(groundInfo(xx).m);
    if (m < bm) {
      bm = m;
      bx = xx;
    }
  }
  // 找不到 |m|≤0.16 的点时也返回"窗内最平缓的那个"。原实现在此原样返回 x，
  // 于是陡坡/断层处每次重生都落回同一点 → 起步即摔 → 再重生（死循环，
  // 且每次循环都扣 8% 燃料 + 2s 计时）。
  return bx;
}
