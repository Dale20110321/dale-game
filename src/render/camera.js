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
  const spdN = clamp(Math.abs(bike.speed) / Math.max(1, store.phys.MAXV), 0, 1);
  const lead = (Math.sign(bike.speed) * spdN * view.W * 0.055) / zoom;
  const maxX = store.mode === "free" ? Infinity : Math.max(0, store.finishX - (view.W * 0.45) / zoom);
  const targetX = clamp(mx + lead - (view.W * 0.38) / zoom, 0, maxX);
  const targetY = my - (view.H * 0.55) / zoom + spdN * view.H * 0.02;
  cam.x = lerp(cam.x, targetX, 0.1);
  cam.y = lerp(cam.y, targetY, 0.3);

  if (cam.shake > 0.06) cam.shake *= Math.pow(0.86, dt * 60);
  else cam.shake = 0;
}

/** 取本帧的随机抖动偏移（只影响一次绘制） */
export function shakeOffset() {
  const s = store.cam.shake;
  if (s <= 0.06) return { x: 0, y: 0 };
  return { x: (Math.random() * 2 - 1) * s, y: (Math.random() * 2 - 1) * s * 0.7 };
}
