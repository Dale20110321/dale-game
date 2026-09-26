// 物理层事件接口（第 3 期 Task 8）
//
// 目的：恢复"单向分层"。物理层只负责**判定与派发事件**，不直接依赖表现层。
//
//   config/core → physics → game → render → ui → main.js
//
// 因此 physics/** 里不允许出现：
//   · render/particles.js（粒子）      · render/camera.js（震屏）
//   · core/audio.js（音效）            · core/toast.js（提示）
//   · game/**（上层）
//
// 表现与结算改由装配点（game/game.js）通过 initPhysicsEvents() 注入；
// 未注入时全部为空操作，所以物理层可以在没有表现层的环境（单元测试 / 无头模拟）里独立运行。

const noop = () => {};

/** 事件名 → 说明
 *  onCrash({ x, y, fuelLoss, timePenalty })  摔车（燃料与计时惩罚已由物理层扣好）
 *  onLand ({ x, y, gy, vimp })               落地（vimp = 真实落地竖向速度 px/s；gy = 地面高度）
 *  onSlip ({ x, y, slip })                   车轮打滑（滑移率超阈值，供扬尘/音效使用）
 */
let hooks = { onCrash: noop, onLand: noop, onSlip: noop };

/**
 * 注入物理事件表现回调（由装配点调用）。
 * @param {{onCrash?:Function,onLand?:Function,onSlip?:Function}} h
 * @returns 生效后的回调集合
 */
export function initPhysicsEvents(h) {
  hooks = {
    onCrash: (h && typeof h.onCrash === "function") ? h.onCrash : noop,
    onLand: (h && typeof h.onLand === "function") ? h.onLand : noop,
    onSlip: (h && typeof h.onSlip === "function") ? h.onSlip : noop,
  };
  return hooks;
}

/** 当前生效的回调集合（可读；供测试备份/复原） */
export function physEvents() {
  return hooks;
}
