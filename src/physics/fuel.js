// 燃料系统
// 消耗模型：滑行 0.005×weight/s，全油门 0.021×weight/s，再乘关卡油耗倍率 fuelK。
// 关卡油罐的"数量与间距"由同一套常数反推（见 game/world.js），改这里必须同步改那里。
import { VEHICLES } from "../config/vehicles.js";
import { courseAt } from "../config/levels.js";
import { store } from "../core/store.js";
import { key } from "../core/input.js";
import { hasInfiniteFuel } from "./bike.js";

/** 每个固定步消耗燃料（fuel 与 fuelMax 同单位，比值即百分比） */
export function drainFuel(dt) {
  // 「燃料无限」形态（相位 / 绝对形态）：直接不消耗。
  // ★ 这条以前只写在文案里 —— drainFuel 无条件扣油，四辆相位车（¥3500~¥26000）
  //   卖了却根本没能效，跑到一半照样没油。
  if (hasInfiniteFuel()) {
    store.phys.fuel = store.phys.fuelMax;
    return;
  }
  // ★ 宇宙场不耗油：levels.js 里 spaceCourse 把 fuelK 设成 0，
  //   意图是"超长赛道不该出现油罐墙"（world.js 的油罐预算据此算出 0 箱）。
  //   但旧代码 `store.mode === "level" ? levelAt(...) : null` 让 space 落到
  //   `fk = 1` —— 运行时照常耗油，而赛道上只有 1 个油罐（预算算出 0 箱后
  //   被 Math.max(1, …) 兜底）。于是耗尽 → handleFuelEmpty → 补 30% → 重生
  //   → 再耗尽，在赛道上无限循环打转。
  //   与其在这里特判 space，不如让 fuelK 从 courseAt 取，让 levels.js 成为
  //   唯一的口径来源 —— 赛事/排位的 fuelK 也一并自动生效。
  if (store.mode === "free") {
    const v = VEHICLES[store.currentVehicle];
    const use = 0.005 * v.weight + (key.right && !store.run.crashed ? 0.021 * v.weight : 0);
    store.phys.fuel = Math.max(0, store.phys.fuel - use * dt);
    return;
  }
  const v = VEHICLES[store.currentVehicle];
  const L = courseAt(store.selLevel, store.mode, store.phys.topSpeed);
  const fk = L ? L.fuelK : 1;
  // 踩油门即耗油（轮子离地空转也在烧油）
  const use = (0.005 * v.weight + (key.right && !store.run.crashed ? 0.021 * v.weight : 0)) * fk;
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
