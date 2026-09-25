// 燃料系统
// 消耗模型：滑行 0.005×wgt/s，全油门 0.021×wgt/s，再乘关卡油耗倍率 fuelK。
// 关卡油罐的"数量与间距"由同一套常数反推（见 game/world.js），改这里必须同步改那里。
import { VEHICLES } from "../config/vehicles.js";
import { LEVELS } from "../config/levels.js";
import { store } from "../core/store.js";
import { key } from "../core/input.js";

/** 每个固定步消耗燃料（fuel 与 fuelMax 同单位，比值即百分比） */
export function drainFuel(dt) {
  const v = VEHICLES[store.currentVehicle];
  const fk = store.mode === "level" && LEVELS[store.lvIdx] ? LEVELS[store.lvIdx].fuelK : 1;
  // 踩油门即耗油（轮子离地空转也在烧油）
  const use = (0.005 * v.wgt + (key.right && !store.run.crashed ? 0.021 * v.wgt : 0)) * fk;
  store.phys.fuel = Math.max(0, store.phys.fuel - use * dt);
}

/** 加油（frac 为油箱比例） */
export function refuel(frac) {
  const P = store.phys;
  P.fuel = Math.min(P.fuelMax, P.fuel + frac * P.fuelMax);
}

/** 直接设置燃料 */
export function setFuel(v) {
  store.phys.fuel = v;
}

/** 剩余燃料比例 0~1 */
export function fuelRatio() {
  const P = store.phys;
  return P.fuelMax > 0 ? P.fuel / P.fuelMax : 0;
}
