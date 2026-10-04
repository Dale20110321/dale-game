// 巡航层：速度高到世界缩放会把车缩成一个点时的**专用表现**
//
// ★ 为什么必须有这一层（这是"10 倍光速手机上像卡死"的真因）：
//   相机的速度自适应缩放在 10 倍光速（2.998e11 px/s）下算出 zoom ≈ 2.4×10⁻⁸，
//   车身 62px 乘上去是 **0.0000015 屏幕像素** —— 画了等于没画。
//   于是画面几乎完全静止（只有背景在动），玩家看到的就是"卡住了"。
//
//   而且 `ctx.scale(2.4e-8)` 之后去 fill 一个半径 12 的圆，在部分移动 GPU 上
//   会退化成极慢的抗锯齿路径（要为亚像素图形分配临时缓冲）—— 这才是真正烧 CPU 的地方。
//
//   所以进入这一层时**整个换掉画法**，而不是继续在世界坐标系里挣扎：
//   · 屏幕坐标绘制，缩放恒为 1，路径长度与速度无关
//   · 车 = 一个固定屏幕尺寸的光点（永远看得见，尺寸随速度略增）
//   · 速度线 / 拖尾 / 背景照旧 —— 它们本来就是屏幕空间的
import { ctx, view } from "../core/canvas.js";
import { store, bike } from "../core/store.js";
import { token } from "../config/ui-tokens.js";
import { THEMES } from "../config/themes.js";
import { VEHICLES } from "../config/vehicles.js";
import { WHEEL_R } from "../config/constants.js";

/**
 * 进入巡航层的阈值（屏幕缩放）。
 *
 * ★ 0.05 的来由：车身 62px × 0.05 = 3.1px，还在"看得见但已看不清细节"的边界上；
 *   再低就只是几个亚像素的墨点，与其画一堆看不见的线框，不如直接换成巡航表现。
 *   对应车速约 5.5×10^5 px/s（2 万 km/h）：形态满级的宇宙级车从离尘起就进这一层。
 */
export const CRUISE_ZOOM = 0.05;

/** 该不该走巡航层（当前这一帧） */
export const inCruiseLayer = () => store.cam.zoom < CRUISE_ZOOM;

/**
 * 巡航层里画车：一个固定屏幕尺寸的光点 + 一道前向的短辉光。
 *
 * ★ 尺寸取屏幕比例而不是世界比例 —— 世界比例在 10⁻⁸ 的缩放下等于 0。
 *   玩家要看见的是"一团稳定的光在高速掠过"，尺寸变化只用来传达速度感，
 *   不该让车大到糊住画面或小到消失。
 */
export function drawCruiseBike() {
  const veh = VEHICLES[store.currentVehicle];
  const color = (veh && veh.color) || "#ffffff";
  const W = view.W;
  const H = view.H;
  // 车固定在屏幕 38% 处（与相机前瞻一致），纵向跟着地形走向略微下沉
  const x = W * 0.38;
  const y = H * 0.62;
  // 半径随速度在 7~13px 之间：够亮眼，又不会大到糊住画面
  const top = store.phys.topSpeed || 1;
  const spdN = Math.min(1, Math.abs(bike.speed) / Math.max(1, top));
  const r = 7 + spdN * 6;

  ctx.save();

  // 外晕：两层不同大小的圆，纯填充，不走 arc+stroke 的抗锯齿路径
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, 7);
  ctx.fill();

  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, 7);
  ctx.fill();

  // 核心：接近白色的一小点
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, 7);
  ctx.fill();

  // 前向辉光：一道向左（身后）的渐短横条，给出"在冲"的方向感
  if (spdN > 0.05) {
    const len = 40 + spdN * 150;
    ctx.globalAlpha = 0.28 * spdN;
    ctx.fillStyle = color;
    ctx.fillRect(x - len, y - r * 0.42, len, r * 0.84);
    ctx.globalAlpha = 0.5 * spdN;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - len * 0.45, y - r * 0.16, len * 0.45, r * 0.32);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * 巡航层的对手：同样改成固定屏幕尺寸的光点。
 *
 * ★ 与玩家同规格，但更小更暗 —— 主次要在这一层也分得清，
 *   否则六个一样的光点并排，玩家分不出哪个是自己。
 */
export function drawCruiseRacers() {
  const list = store.racers;
  if (!list || !list.length) return;
  const W = view.W;
  const H = view.H;
  // 屏幕宽度代表多少世界像素（与相机的可视宽度同源）
  const visW = W / store.cam.zoom;
  const base = store.cam.x + visW * 0.38;
  const COLORS = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c780e8", "#ff9f43"];
  ctx.save();
  for (let i = 0; i < list.length; i++) {
    const ai = list[i];
    // 世界 x → 屏幕 x：同一帧里所有对手都换算到相机的同一套坐标，
    // 于是"谁在前面"与"谁画得靠右"永远一致（超车关系不会看反）
    const rel = (ai.x - base) / visW;
    if (rel < -0.6 || rel > 1.6) continue;
    const x = rel * W;
    // 纵向错开一点，避免六个光点重叠成一条线
    const y = H * 0.62 + ((i % 3) - 1) * 16;
    const color = COLORS[i % COLORS.length];
    const r = 4.5;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * 巡航层的地面参考线：一条随相机滚动的水平亮带。
 *
 * ★ 没有它玩家会完全失去"地在哪、我在多高"的参照，画面纯黑一片，
 *   速度再快也只是"屏幕没变"。有了它，即便地形细节已经不可辨，
 *   亮带的起伏仍然在动 —— 那就是"在跑"的全部证据。
 */
export function drawCruiseGround() {
  const W = view.W;
  const H = view.H;
  const top = store.phys.topSpeed || 1;
  const spdN = Math.min(1, Math.abs(bike.speed) / Math.max(1, top));
  // 地表色直接取当前场景的 pal（三档：亮 / 中 / 暗），与地形绘制同源，
  // 于是太空 / 雪原 / 火山在巡航层依然是三种不同的画面，而不是一片黑。
  const T = THEMES[store.phys.theme] || THEMES[0];
  const pal = T.pal || ["#3f7d3a", "#58a24f", "#8b5e3c"];
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pal[2];
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = pal[1];
  ctx.fillRect(0, H * 0.78, W, H * 0.07);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = token("text-hi");
  // 随速度加快地横移的短划线：唯一还在动的元素，速度感全靠它
  const gap = 60 - spdN * 40;
  const speed = 2 + spdN * 26;
  const offset = (store.time * speed) % gap;
  ctx.fillRect(0, H * 0.78 - 2, W, 3);
  ctx.globalAlpha = 0.35 * spdN + 0.1;
  for (let x = -offset; x < W; x += gap) ctx.fillRect(x, H * 0.78 - 14, gap * 0.45, 12);
  ctx.globalAlpha = 1;
  ctx.restore();
}
