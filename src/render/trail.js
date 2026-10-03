// 宇宙级速度拖尾：车后随速度生长的能量拖尾，强度过阈值后进一步蜕变为陨星 / 彗尾。
//
// ★ 三条纪律（改之前先读完）：
//   1. **纯表现层**：只读 store，绝不写任何游戏状态 —— 同输入下不同画质档的
//      物理轨迹必须逐位一致（与 render/postfx.js 同一条纪律）。
//   2. **零逐帧分配**：所有抖动都来自连续相位（sin/cos），不掷 Math.random()、
//      不建数组、不建渐变对象。逐帧白噪声会被读成"卡了一下 / 镜头没擦干净"
//      —— render/camera.js 的 shakeOffset 换掉 Math.random() 就是这个原因。
//   3. **长度按屏幕 px 定义**：世界层绘制发生在 ctx.scale(cam.zoom) 之内
//      （见 camera.js 的不变量 3），而 cam.zoom 随速度从 1.4 一路降到 1e-4。
//      尾长若按世界 px 写死，第七宇宙速度满级时尾巴会长到几百万像素（横贯
//      整个世界），低速时又缩成看不见的一个点 —— 两种都等于没画。
//      所以这里先按屏幕 px 设计，再除以 zoom 换算成世界 px。
//
// ★ 方向取**速度**而不是车身姿态：空翻时车在转，尾巴跟着甩会变成风扇；
//   陨星尾迹本来就沿速度方向，而且在 1e-4 的缩放下车身已经小到看不见，
//   唯有这条由速度决定的方向还能把"它在往哪飞"交代清楚。
import { ctx } from "../core/canvas.js";
import { store, bike } from "../core/store.js";
import { VEHICLES } from "../config/vehicles.js";
import {
  TRAIL_ON, TRAIL_FULL, TRAIL_METEOR_LO, TRAIL_METEOR_HI,
} from "../config/constants.js";
import { clamp } from "../core/utils.js";
import { getQuality } from "./postfx.js";

/** 连续相位（秒）。所有抖动都是 sin/cos(ph)，因此帧间平滑、与刷新率无关 */
let ph = 0;

/**
 * 画质系数：低画质砍掉约一半元素。
 * 拖尾是"锦上添花"的一层，不该让它把填充率吃满；但也**不整层关掉** ——
 * 宇宙级车的拖尾是这台车卖点的另一半，低画质下关掉等于那台车看起来是台哑巴。
 */
const qFac = () => (getQuality() === "low" ? 0.5 : getQuality() === "high" ? 1 : 0.78);

/**
 * 连续噪声（无状态、可重复）：两组不同频率的正弦叠加。
 * 比 Math.random() 好在帧间连续，比查表好在零分配。
 * @param {number} x 相位自变量（一般传 t·频率 + ph）
 * @param {number} s 每条元素各自的种子（错开抖动，让 7 台车不同步）
 */
const nz = (x, s) => Math.sin(x * 1.7 + s) * 0.62 + Math.sin(x * 4.3 + s * 2.7) * 0.38;

/**
 * 一笔"发光"描边：外层宽而淡（晕）+ 内层窄而亮（芯）。
 * 比单纯描一次更像能量，且对同一个 path 描两遍即可，不必重建路径。
 */
function glowStroke(col, wGlow, aGlow, wCore, aCore) {
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, wGlow);
  ctx.globalAlpha = aGlow;
  ctx.stroke();
  ctx.lineWidth = Math.max(0.35, wCore);
  ctx.globalAlpha = aCore;
  ctx.stroke();
}

/** 整车质心速度（px/s）。取不到分量时回退 0，绝不返回 NaN（见 bike 的 pts 注释）。 */
function velOf() {
  let vx = 0, vy = 0, mt = 0;
  for (const p of bike.pts) {
    vx += (p._vx || 0) * p.m;
    vy += (p._vy || 0) * p.m;
    mt += p.m;
  }
  return mt > 0 ? [vx / mt, vy / mt] : [0, 0];
}

/**
 * 拖尾强度 k ∈ [0,1]（归一口径见 constants.js 的 TRAIL_ON 注释）。
 * @param {number} spd 车速（px/s）
 */
function intensity(spd) {
  const top = store.phys && store.phys.topSpeed;
  if (!(top > 0) || !(spd > 0)) return 0;
  const r = spd / top;
  if (r <= TRAIL_ON) return 0;
  // 对数归一：七台车的极速跨 5 个数量级，线性会让强度在刚过门槛就撞顶
  return clamp(Math.log10(r / TRAIL_ON) / Math.log10(TRAIL_FULL / TRAIL_ON), 0, 1);
}

/** k → 陨星形态的交叉淡入系数 m ∈ [0,1] */
const meteorOf = (k) =>
  clamp((k - TRAIL_METEOR_LO) / (TRAIL_METEOR_HI - TRAIL_METEOR_LO), 0, 1);

// ============================================================
//  七种签名形态（每台宇宙车一种，见 vehicles.js 的 TRAIL 注释）
//
//  约定：全部画在**局部坐标系**里 —— 原点在车身中心、+x = 速度方向、
//  拖尾一律落在 -x 侧（车后方）。调用方已经 translate + rotate 到位。
//  所有长度/宽度都已由调用方从屏幕 px 换算成世界 px。
// ============================================================

/** 电弧（cv1 冰蓝）：三条分叉电弧，越靠后越散开 */
function drawArc(T, a, A, L, W, k, q) {
  const n = Math.max(2, Math.round(T.count * q));
  const steps = 9;
  for (let b = 0; b < n; b++) {
    const s = T.seed + b * 2.399; // 黄金角：三条弧的抖动互不同步
    const off = (b - (n - 1) / 2) * W * 0.95;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 电弧在离开车体之后才散开，所以振幅正比于 t
      const x = A - t * L;
      const y = off + nz(t * 3.1 + ph * 9, s) * W * 0.6 * t;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    glowStroke(T.glow, W * 0.34, a * 0.16, W * 0.11, a * 0.6);
    glowStroke(T.core, W * 0.09, a * 0.28, W * 0.045, a * 0.85);
  }
}

/** 螺旋（cv2 翡翠）：两股反向螺旋束，两端收口中段张开（束腰） */
function drawHelix(T, a, A, L, W, k, q) {
  const n = Math.max(2, Math.round(T.count * q));
  const steps = 16;
  for (let b = 0; b < n; b++) {
    const dir = b % 2 === 0 ? 1 : -1;
    const s = T.seed + b * 1.7;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = A - t * L;
      const env = 0.35 + 0.65 * Math.sin(t * Math.PI);
      const y = Math.sin(t * Math.PI * 2.5 * dir + ph * 3.4 + b) * W * 0.9 * env;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    glowStroke(T.glow, W * 0.4, a * 0.15, W * 0.13, a * 0.55);
    glowStroke(T.core, W * 0.09, a * 0.26, W * 0.05, a * 0.8);
  }
}

/** 日冕（cv3 明黄）：自尾根向后成扇形炸开的日珥，末端各带一枚亮斑 */
function drawCorona(T, a, A, L, W, k, q) {
  const n = Math.max(4, Math.round(T.count * q));
  for (let i = 0; i < n; i++) {
    const s = T.seed + i * 1.31;
    // 与"正后方"的夹角 [-0.62, 0.62] rad ≈ ±36°，中段（i≈n/2）几乎正后
    const ang = -0.62 + (1.24 * i) / Math.max(1, n - 1);
    // 长度随相位脉动：日冕不是刚体，每根日珥都在伸缩
    const len = L * (0.32 + 0.68 * Math.abs(Math.sin(ph * 2.2 + s)));
    const ex = A - Math.cos(ang) * len;
    const ey = Math.sin(ang) * len * 0.75;
    ctx.beginPath();
    ctx.moveTo(A, 0);
    ctx.lineTo(ex, ey);
    glowStroke(T.glow, W * 0.42, a * 0.14, W * 0.14, a * 0.5);
    // 末端亮斑：日珥顶端的凝结点，是"日冕"和"放射线"的分界
    ctx.fillStyle = T.core;
    ctx.globalAlpha = a * 0.8;
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(0.5, W * 0.1), 0, 7);
    ctx.fill();
  }
}

/** 余烬（cv4 烈橙）：离散碎块，沿尾部散开、边飞边升、边冷边暗 */
function drawEmber(T, a, A, L, W, k, q) {
  const n = Math.max(4, Math.round(T.count * q));
  for (let i = 0; i < n; i++) {
    const s = T.seed + i * 2.11;
    // 黄金分割散布：碎块在尾上各占一处，随相位缓慢向后流动
    const t = (((i * 0.618033 + ph * 0.16 + T.seed) % 1) + 1) % 1;
    const x = A - t * L;
    const y = -t * L * 0.22 + nz(t * 2 + ph * 3, s) * W * 0.55; // 越靠后升得越高
    const r = Math.max(0.5, W * (0.52 - 0.3 * t));
    // 外焰（大而淡）→ 芯（小而亮）叠两层，就得到"刚碎开还是白热"的读法，
    // 省掉一次颜色插值（也省掉逐帧的字符串拼接）
    ctx.fillStyle = T.glow;
    ctx.globalAlpha = a * (1 - t) * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1 + t * 1.8), r, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = T.core;
    ctx.globalAlpha = a * (1 - t) * 0.75;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.75 + t * 1.2), r * 0.6, 0, 0, 7);
    ctx.fill();
  }
}

/** 涟漪（cv5 洋红）：垂直于行进方向的激波环，沿尾向外扩散并变淡 */
function drawRipple(T, a, A, L, W, k, q) {
  const n = Math.max(3, Math.round(T.count * q));
  for (let i = 0; i < n; i++) {
    const s = T.seed + i * 1.9;
    const t = (((i / n + ph * 0.13 + T.seed) % 1) + 1) % 1;
    const x = A - t * L;
    const y = nz(t * 1.5 + ph * 2, s) * W * 0.3;
    const rx = Math.max(0.5, W * (0.35 + t * 1.6));
    const ry = rx * 0.42;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, 7);
    glowStroke(T.glow, W * 0.16, a * 0.14, W * 0.07, a * 0.55 * (1 - t * 0.7));
    glowStroke(T.core, W * 0.06, a * 0.16, W * 0.035, a * 0.5 * (1 - t * 0.8));
  }
}

/** 涡旋（cv6 星紫）：环面倾角沿尾一路扭转并自转，越远越小 = 收束的虫洞 */
function drawVortex(T, a, A, L, W, k, q) {
  const n = Math.max(3, Math.round(T.count * q));
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const s = T.seed + i * 0.9;
    const x = A - t * L;
    const y = nz(t * 1.2 + ph * 1.8, s) * W * 0.32;
    const rx = Math.max(0.5, W * (1.5 - t * 0.85)); // 收束：给纵深（环要够大才读得出"隧道"）
    const ry = rx * 0.3;
    // 倾角 = 沿尾的固定扭转 + 随相位的缓慢自转，两者叠加才像"隧道在转"
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 1.5 + ph * 1.1);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, 7);
    glowStroke(T.glow, W * 0.2, a * 0.15, W * 0.08, a * 0.55);
    glowStroke(T.core, W * 0.07, a * 0.18, W * 0.04, a * 0.6);
    ctx.restore();
  }
}

/** 光矛（cv7 星白）：纺锤形光幕 + 贯穿芯线 + 稀疏星屑，全场唯一的直线画法 */
function drawLance(T, a, A, L, W, k, q) {
  // 光幕：纺锤形 —— 尾根窄、约 1/3 处最宽、远端收成一点。
  // 用两个同心的填充多边形叠出"外晕 + 内芯"，避免逐帧建渐变对象。
  for (let i = 0; i < 2; i++) {
    const f = i === 0 ? 1 : 0.5;
    ctx.fillStyle = i === 0 ? T.glow : T.core;
    ctx.globalAlpha = a * (i === 0 ? 0.13 : 0.2);
    ctx.beginPath();
    ctx.moveTo(A, -W * 0.28 * f);
    ctx.lineTo(A - L * 0.34, -W * f);
    ctx.lineTo(A - L, -W * 0.05 * f);
    ctx.lineTo(A - L, W * 0.05 * f);
    ctx.lineTo(A - L * 0.34, W * f);
    ctx.lineTo(A, W * 0.28 * f);
    ctx.closePath();
    ctx.fill();
  }
  // 芯线：一路贯通到最远端，是"矛"而不是"带"的读法
  glowStroke(T.core, W * 0.34, a * 0.2, W * 0.11, a * 0.85);
  // 星屑：沿光矛稀疏散开，给这条直线一点"在飞"的动感
  const n = Math.max(3, Math.round(T.count * q));
  for (let i = 0; i < n; i++) {
    const s = T.seed + i * 2.399;
    const t = (((i * 0.382 + ph * 0.22 + T.seed) % 1) + 1) % 1;
    const x = A - t * L;
    const y = nz(t * 2.4 + ph * 4, s) * W * 0.8;
    const r = Math.max(0.4, W * 0.09 * (1 - t * 0.5));
    ctx.fillStyle = T.core;
    ctx.globalAlpha = a * 0.7 * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  }
}

/**
 * 陨星 / 彗尾层（七台共用骨架，颜色与头冠形状取自各自的 TRAIL 规格）。
 *
 * ★ 为什么是"交叉淡入"而不是"到阈值换画法"：见 constants.js 的 TRAIL_METEOR_LO。
 *   能量层在彗尾成形时被压到 62% 亮度但**不消失** —— 签名形态（螺旋 / 涡旋 / 电弧）
 *   是这七台车彼此唯一的辨识特征，形态层被完全盖住就成了七台一样的白彗星。
 */
function drawMeteor(T, m, W, L) {
  if (m <= 0) return;
  const R = W * (0.9 + 1.25 * m);
  const TL = L * (1.15 + 0.7 * m);

  // 1) 彗尾：5 层同轴多边形，外层最宽最淡 → 逐层收窄提亮。
  //    刻意不用渐变对象（那要逐帧分配，见文件头纪律 2），改用嵌套多边形叠软边。
  //    层数 5 是试出来的：4 层边缘还能看出台阶，6 层填充率翻倍而肉眼已不可见。
  //    ★ 只有最内一层用白热的 core 且只画近处 45%：整条都用白热色会糊成一根
  //    灰棒子（实测过），而陨石尾迹本该"近白远色"。
  const widths = [1, 0.74, 0.52, 0.32, 0.15];
  for (let i = 0; i < 5; i++) {
    const w = W * 0.85 * widths[i];
    const inner = i === 4;
    const tail = TL * (inner ? 0.45 : 1);
    ctx.fillStyle = inner ? T.core : T.glow;
    ctx.globalAlpha = m * (inner ? 0.16 : 0.05 + i * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, -w);
    ctx.lineTo(-tail, -w * 0.03);
    ctx.lineTo(-tail, w * 0.03);
    ctx.lineTo(0, w);
    ctx.closePath();
    ctx.fill();
  }

  // 2) 头冠：9 圈同心圆，alpha 按 (1−t)² 衰减。
  //    ★ 必须多圈：单层/三圈的 flat fill 会露出**硬边圆环**，看起来像套了个
  //    气泡罩在车上而不是"车在发光"。9 圈的半径间隔约 R/9，肉眼看不出台阶。
  for (let i = 9; i >= 1; i--) {
    const t = i / 9;
    ctx.fillStyle = i <= 3 ? T.core : T.glow;
    ctx.globalAlpha = m * 0.075 * (1 - t) * (1 - t);
    ctx.beginPath();
    ctx.arc(0, 0, R * t, 0, 7);
    ctx.fill();
  }

  // 3) 四芒耀斑：横向长 + 纵向短，陨石撞进大气的那种十字星芒。
  //    半高只给 R 的 8.5% —— 早期版本给到 15%/42% 透明度，两侧各支出一根
  //    灰白横杠，看着像车被夹在两块药片之间。
  ctx.fillStyle = T.core;
  ctx.globalAlpha = m * 0.3;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 1.35, R * 0.085, 0, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.085, R * 0.8, 0, 0, 7);
  ctx.fill();
}

/**
 * 在世界层里绘制当前车辆的拖尾。由 scene.js 在 drawBike 之前调用
 * （拖尾必须在车**后面**，否则能量会盖住骑手）。
 * @param {number} [dt] 本渲染帧真实时长（秒）—— 只用于推进相位，见 scene.js 的说明
 */
export function drawTrail(dt = 1 / 60) {
  const veh = VEHICLES[store.currentVehicle];
  const T = veh && veh.trail;
  if (!T) return; // 非宇宙级车不挂 trail（数据驱动，加车不必改这里）
  if (store.run && store.run.crashed) return; // 摔车时不给拖尾：能量全灭
  const [vx, vy] = velOf();
  const spd = Math.hypot(vx, vy);
  if (!(spd > 1e-6)) return;
  const k = intensity(spd);
  if (k <= 0) return;

  ph += dt;

  const cam = store.cam;
  const z = cam.zoom > 1e-6 ? cam.zoom : 1;
  const sw = (px) => px / z; // 屏幕 px → 世界 px（见文件头纪律 3）
  const q = qFac();
  const m = meteorOf(k);

  // 三个派生量：能量层亮度、彗尾交叉系数、尾长/尾宽
  const kE = k * (1 - 0.38 * m);
  const A = sw(16); // 尾根：车身后方一点，避免能量糊住车轮
  const L = sw(T.len * (0.32 + 0.68 * k));
  const W = sw(T.width * (0.55 + 0.45 * k));

  const cxm = (bike.rear.x + bike.front.x) / 2;
  const cym = (bike.rear.y + bike.front.y) / 2;

  ctx.save();
  ctx.translate(cxm - cam.x, cym - cam.y);
  ctx.rotate(Math.atan2(vy, vx)); // 局部 +x = 速度方向；拖尾全部画在 -x 侧
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 刻意用 source-over 而不是 "lighter"：加色混合在浅色场景（雪地 / 冰面 / 云层）
  // 上会把能量直接加没 —— 而宇宙级车任何场景都能开。发光感靠"宽而淡 + 窄而亮"
  // 的双层描边实现（glowStroke），两种背景上都读得出来。
  switch (T.style) {
    case "helix": drawHelix(T, kE, A, L, W, k, q); break;
    case "corona": drawCorona(T, kE, A, L, W, k, q); break;
    case "ember": drawEmber(T, kE, A, L, W, k, q); break;
    case "ripple": drawRipple(T, kE, A, L, W, k, q); break;
    case "vortex": drawVortex(T, kE, A, L, W, k, q); break;
    case "lance": drawLance(T, kE, A, L, W, k, q); break;
    default: drawArc(T, kE, A, L, W, k, q); break; // arc 兼作兜底
  }
  drawMeteor(T, m, W, L);
  ctx.globalAlpha = 1;
  ctx.restore();
}