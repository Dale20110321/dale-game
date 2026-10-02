// 相机：跟随 / 速度前瞻 / 震屏
import { store, bike } from "../core/store.js";
import { view } from "../core/canvas.js";
import { clamp, lerp } from "../core/utils.js";

/** 叠加震屏强度（0~16） */
export function addShake(v) {
  store.cam.shake = Math.min(16, store.cam.shake + v);
}

/** 每个固定步更新一次：与刷新率无关 */
export function updateCamera(dt) {
  if (store.state === "pause") return;
  const cam = store.cam;
  const mx = (bike.rear.x + bike.front.x) / 2;
  const my = (bike.rear.y + bike.front.y) / 2;
  const zoom = cam.zoom;
  // 速度感：车速越快镜头越往前推（前瞻），并略微下移让视野更开阔
  const spdN = clamp(Math.abs(bike.speed) / Math.max(1, store.phys.topSpeed), 0, 1);
  const lead = (Math.sign(bike.speed) * spdN * view.W * 0.055) / zoom;
  const maxX = store.mode === "free" ? Infinity : Math.max(0, store.finishX - (view.W * 0.45) / zoom);
  const targetX = clamp(mx + lead - (view.W * 0.38) / zoom, 0, maxX);
  const targetY = my - (view.H * 0.55) / zoom + spdN * view.H * 0.02;
  cam.x = lerp(cam.x, targetX, 0.1);
  cam.y = lerp(cam.y, targetY, 0.3);

  if (cam.shake > 0.06) cam.shake *= Math.pow(0.86, dt * 60);
  else cam.shake = 0;
}

// 抖动相位（累积而非随机）：见 shakeOffset 注释
let shPhase = 0;

/**
 * 取本帧的抖动偏移（只影响一次绘制）。
 *
 * ★ 原来是逐帧 `Math.random()` 的**白噪声**：相邻两帧的偏移量毫无关联，
 *   整屏（背景/地形/车/实体一起）在帧与帧之间无规律地跳。撞上加速带那一刻
 *   同时又叠了 18 个粒子，画面一帧里既闪又多动，观感上就是"卡一下"。
 *   改成**连续振荡**（相位每帧累加），位移在帧间平滑变化，观感是"震"而不是"卡"；
 *   强度、衰减、封顶语义全部不变，行为可预期且仍然与刷新率无关。
 */
export function shakeOffset() {
  const s = store.cam.shake;
  if (s <= 0.06) { shPhase += 0.37; return { x: 0, y: 0 }; }
  shPhase += 0.55;
  return { x: Math.sin(shPhase * 2.1) * s, y: Math.cos(shPhase * 3.3) * s * 0.7 };
}
