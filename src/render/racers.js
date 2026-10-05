// AI 对手的世界层渲染：把每位对手画成一台**看得见的自行车**
//
// ★ 为什么以前"对手没有车"：对手在数据里只有 store.racers[i].x 一个标量，
//   HUD 进度条上画两个小圆点就算显示过了。但进度条是界面层的东西 ——
//   玩家在赛道上飞驰时眼睛盯的是画面中央，于是这是实打实的缺失，不是显示不明显。
//   本模块补的是**世界层**：车骑在对手所在的地表高度上，能被看见、能被超。
//
// ★ 坐标口径：调用方已经在 ctx.scale(cam.zoom) 之内并把画布原点移到了相机位置，
//   所以这里统一用 `x - camX` / `y - camY`（与 render/entities.js 的 drawDeco 同源）。
import { ctx, view } from "../core/canvas.js";
import { store } from "../core/store.js";
import { token } from "../config/ui-tokens.js";
import { groundInfo } from "../physics/terrain.js";
import { WHEEL_R, WHEELBASE, SEAT_H } from "../config/constants.js";
import { getQuality } from "./postfx.js";

/** 对手配色：按序号取，永远可分辨（不只靠红/绿，那对色觉障碍玩家无效） */
const RIVAL_COLORS = [
  "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c780e8", "#ff9f43",
];
/** 名牌浮在车头上方的距离（屏幕 px） */
const NAME_LIFT = 26;

/**
 * 画全部对手。
 * @param {number} camX 相机 x（世界坐标）
 * @param {number} camY 相机 y（世界坐标）
 */
export function drawRacers(camX, camY) {
  const list = store.racers;
  if (!list || !list.length) return;
  // 只有竞速类玩法有对手；闯关 / 无限模式不该凭空多出几台车
  const mode = store.mode;
  if (mode !== "race" && mode !== "ranked" && mode !== "space") return;

  const zoom = store.cam.zoom > 0.01 ? store.cam.zoom : 1;
  const visW = view.W / zoom;
  const margin = WHEELBASE * 2;   // 剔除余量：边界上不会"突然冒出一台车"
  const shadow = getQuality() !== "low";

  for (let i = 0; i < list.length; i++) {
    const ai = list[i];
    const sx = ai.x - camX;
    if (sx < -margin || sx > visW + margin) continue;
    const g = groundInfo(ai.x);
    if (!isFinite(g.y)) continue;
    drawOne(
      sx, g.y - camY,
      // 车跟着坡抬头：否则对手看上去是在起伏路面上"贴地平移"
      Math.atan(g.m),
      RIVAL_COLORS[i % RIVAL_COLORS.length],
      ai.name, shadow, zoom
    );
  }
}

/**
 * 单台对手车（简化剪影）。
 *
 * ★ 刻意不复用 render/bike.js 的 drawBike：那套依赖玩家车的全局状态
 *   （五质点、悬挂压缩、轮子转角、形态拖尾），而对手只有 x 与地表高度两个量。
 *   照抄一遍只会造出第二个"看起来像车但永远不动"的东西。
 *   这里只画轮廓：两轮 + 车架三角 + 骑手剪影 + 名牌 —— 够远看清是谁、够近看清在超车。
 */
function drawOne(sx, gy, ang, color, name, shadow, zoom) {
  ctx.save();
  ctx.translate(sx, gy);
  ctx.rotate(ang);

  // 车贴地 → 轮心在地表上方 WHEEL_R（屏幕 y 向下为正，所以是 -WHEEL_R）
  const wy = -WHEEL_R;

  if (shadow) {
    ctx.fillStyle = token("obj-shadow");
    ctx.beginPath();
    ctx.ellipse(0, 2, WHEELBASE * 0.62, 4, 0, 0, 7);
    ctx.fill();
  }

  // ---- 车轮 ----
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  for (const dx of [-WHEELBASE / 2, WHEELBASE / 2]) {
    ctx.beginPath();
    ctx.arc(dx, wy, WHEEL_R, 0, 7);
    ctx.stroke();
  }

  // ---- 车架三角 ----
  const seatX = -WHEELBASE * 0.16;
  const seatY = wy - SEAT_H * 0.62;
  const headX = WHEELBASE * 0.34;
  const headY = wy - SEAT_H * 0.74;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-WHEELBASE / 2, wy);
  ctx.lineTo(seatX, seatY);
  ctx.lineTo(headX, headY);
  ctx.closePath();
  ctx.stroke();

  // ---- 骑手剪影：肩 + 头，压在坐垫与车把之间 ----
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(seatX, seatY);
  ctx.lineTo(seatX + 2, seatY - SEAT_H * 0.42);
  ctx.lineTo(headX + 1, headY);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(headX + 1, headY - 3.4, 3.4, 0, 7);
  ctx.fill();

  // ---- 名牌 ----
  //   车身跟着车速缩放会缩到几个像素，名字跟着缩就没法读了：
  //   所以字号除以 zoom，让它在屏幕上恒定大小（世界坐标、屏幕字号）。
  ctx.scale(1 / zoom, 1 / zoom);
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 3;
  ctx.strokeStyle = token("shadow-text-strong");
  ctx.strokeText(name || "AI", 0, -SEAT_H - NAME_LIFT / zoom);
  ctx.fillStyle = color;
  ctx.fillText(name || "AI", 0, -SEAT_H - NAME_LIFT / zoom);
  ctx.restore();
}
