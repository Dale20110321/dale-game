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
import { drawMeteorCruise, METEOR_SCALE, ultraUnlocked } from "./trail.js";

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
 * 巡航层里画车：一颗固定屏幕尺寸的**陨石**（取代旧的光圈 + 前向拖尾）。
 *
 * ★ 旧版本画的是一团光晕（两层圆）+ 一道矩形拖尾 —— 高速下玩家看到的就是
 *   "光圈 + 尾巴"，跟"车"完全对不上。现在宇宙级车进巡航层后整颗车 = 陨石，
 *   与普通速度下的陨石形态（bike.js drawBike）一致，只是这里按屏幕坐标画。
 */
export function drawCruiseBike() {
  const veh = VEHICLES[store.currentVehicle];
  const W = view.W;
  const H = view.H;
  // 车固定在屏幕 62% 处（与相机 updateCamera 的 targetX 口径一致，见 camera.js ——
  // 巡航层不走相机，这里必须同参，否则普通速度在 62%、满速却跳回左边）
  const x = W * 0.62;
  const y = H * 0.62;
  const top = store.phys.topSpeed || 1;
  const spdN = Math.min(1, Math.abs(bike.speed) / Math.max(1, top));

  // 宇宙级车：解锁特殊形态后直接画陨石（从点起步 → 满速大陨石；
  // 不会缩成点，没有光圈/横条）。未解锁时**不显示**陨石与水滴破空罩 ——
  // 与 render/trail.js 的 meteorFactor 同一条规则。
  const T = veh && veh.trail;
  if (T && ultraUnlocked(veh)) {
    drawMeteorCruise(T, 0.35 + 0.65 * spdN, x, y, (2 + 60 * spdN) * METEOR_SCALE);
    return;
  }

  // 兜底（普通车 / 未解锁陨石外观的宇宙车）：一个纯色小方块，
  // 不用圆（避免读成"光圈"）。
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 1;
  ctx.fillRect(x - 5, y - 5, 10, 10);
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
  const base = store.cam.x + visW * 0.62; // 玩家在 62%，对手基准同参（见 drawCruiseBike）
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
