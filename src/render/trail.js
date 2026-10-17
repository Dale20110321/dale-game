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

/** 平滑阶跃（两端导数为 0）：用于"随速度渐现"的过渡 */
const ss3 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

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
//  陨石形态体系：12 台宇宙级车统一为"陨石 / 流星"画法
//
//  ★ 为什么把 12 种签名形态全部换成陨石：旧版是"线条描边"风格 ——
//    每种都是几根发光的线（电弧 / 螺旋 / 涟漪…），没有体积、没有层次，
//    速度再快看起来也只是"线变长"。陨石 / 流星是"实体在飞"：
//    一团湍流翻滚的火球拖着火焰尾巴、一路撒火星，
//    速度越快火球越大、尾越长越亮 —— 这才读得出"炫酷"。
//  ★ 每台车的辨识度从"画法"改成"尾形 + 颜色"：T.style 映射火焰尾的
//    分叉数与螺旋缠绕度，颜色仍走 TRAIL 规格的 glow / core。
//  ★ 全部用 nz 连续相位，零逐帧分配（见文件头纪律 2）。
// ============================================================

/** style → 尾形个性：forks = 火焰尾分叉数，spin = 螺旋缠绕度（负 = 反向内吸） */
const STYLE_TRAITS = {
  arc:    { forks: 3, spin: 0.22 },
  helix:  { forks: 2, spin: 1.0 },
  corona: { forks: 5, spin: 0.1 },
  ember:  { forks: 1, spin: 0.06 },
  ripple: { forks: 3, spin: 0 },
  vortex: { forks: 1, spin: 1.35 },
  lance:  { forks: 1, spin: 0 },
  cone:   { forks: 3, spin: 0.12 },
  rift:   { forks: 2, spin: 0.2 },
  lattice:{ forks: 4, spin: 0.32 },
  braid:  { forks: 4, spin: 0.85 },
  event:  { forks: 1, spin: -0.95 },
};

/**
 * 陨石本体（彗核）：圆润、斑驳、有质感的灰石头 —— 没有任何光圈 / 发光层。
 *  · 岩体：近圆（Ry/Rx ≈ 0.9），整体比早期小 20%（Rx = 0.80R）；14 顶点轻微参差
 *  · 明暗：上侧受光亮、下侧背光暗，再叠五块深浅灰斑 —— 不是一片纯灰
 *  · 表面：24 个带亮沿的陨石坑 + 48 颗深/浅乱序颗粒，粗粝有石头质感
 */
function drawMeteoroid(T, a, hx, R, m) {
  const Rx = R * 0.8;   // 按用户要求放小
  const Ry = Rx * 0.9;  // 更圆：近圆（略扁一丢丢）
  const rot = ph * 0.35 + T.seed;

  // 1) 岩体（亮灰 —— 陨石整体提亮，破空罩叠在上面时不会被压暗）
  const V = 14;
  ctx.fillStyle = "#9aa3ab";
  ctx.globalAlpha = a;
  ctx.beginPath();
  for (let i = 0; i <= V; i++) {
    const ang = rot + (i / V) * Math.PI * 2;
    const jx = 1 + nz(ang * 1.4, T.seed + 9) * 0.05;
    const jy = 1 + nz(ang * 2.1, T.seed + 5) * 0.09;
    const x = hx + Math.cos(ang) * Rx * jx;
    const y = Math.sin(ang) * Ry * jy;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // 2) 整体光照：上亮下暗（受光面 vs 背光面）—— 亮部更亮、对比更强
  ctx.fillStyle = "#d4dbe1";
  ctx.globalAlpha = a * 0.35;
  ctx.beginPath();
  ctx.ellipse(hx, -Ry * 0.42, Rx * 0.68, Ry * 0.36, rot * 0.4, 0, 7);
  ctx.fill();
  ctx.fillStyle = "#454c53";
  ctx.globalAlpha = a * 0.4;
  ctx.beginPath();
  ctx.ellipse(hx, Ry * 0.45, Rx * 0.72, Ry * 0.4, -rot * 0.3, 0, 7);
  ctx.fill();

  // 3) 深浅灰斑（五块，明暗对比强烈、错落分布）—— 亮斑更亮、暗斑不过度发黑
  const PATCH = ["#4a5159", "#d6dce3", "#6a727a", "#bcc3cb", "#3c434b"];
  for (let i = 0; i < 5; i++) {
    const s = T.seed + i * 3.7;
    const ang = rot * 1.4 + s;
    const px = hx + Math.cos(ang) * Rx * (0.18 + 0.35 * Math.abs(Math.sin(i * 1.3)));
    const py = Math.sin(ang) * Ry * (0.18 + 0.4 * Math.abs(Math.sin(i * 2.1)));
    ctx.fillStyle = PATCH[i];
    ctx.globalAlpha = a * 0.65;
    ctx.beginPath();
    ctx.ellipse(px, py, Rx * (0.14 + 0.05 * Math.abs(Math.sin(i * 0.7))), Ry * (0.12 + 0.04 * Math.abs(Math.sin(i * 1.1))), ang * 0.8, 0, 7);
    ctx.fill();
  }

  // 4) 密集小陨石坑（24 个）：坑沿亮 + 坑体暗 → 立体的小凹坑
  const CRATERS = 24;
  for (let i = 0; i < CRATERS; i++) {
    const ang = rot * 1.7 + i * 2.399 + T.seed; // 黄金角：相邻坑不扎堆
    const rr = Math.sqrt((i + 0.5) / CRATERS);  // 0→1 均匀覆盖圆面
    const cx = hx + Math.cos(ang) * Rx * rr * 0.95;
    const cy = Math.sin(ang) * Ry * rr * 0.95;
    const cr = Rx * (0.032 + 0.02 * ((i * 7) % 3)) * (1 - rr * 0.3);
    ctx.fillStyle = "#e5eaf0";
    ctx.globalAlpha = a * 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.7, cr, cr * 0.62, ang, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#333a41";
    ctx.globalAlpha = a * 0.85;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cr, cr * 0.6, ang, 0, 7);
    ctx.fill();
  }

  // 5) 表面颗粒噪点：48 颗深/浅"乱序"细点（用 nz 而非机械交替）→ 粗粝质感
  const GRAIN = 48;
  for (let i = 0; i < GRAIN; i++) {
    const ang = rot * 1.7 + i * 2.399 + T.seed;
    const rr = Math.sqrt((i + 0.5) / GRAIN);
    const cx = hx + Math.cos(ang) * Rx * rr * 0.96;
    const cy = Math.sin(ang) * Ry * rr * 0.96;
    ctx.fillStyle = nz(i * 1.9, T.seed * 1.3) > 0 ? "#e9edf2" : "#50565c";
    ctx.globalAlpha = a * (0.4 + 0.3 * Math.abs(nz(i * 2.3, T.seed * 0.7)));
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.5, Rx * (0.014 + 0.014 * ((i * 5) % 3)) * (1 - rr * 0.6)), 0, 7);
    ctx.fill();
  }

  // 6) 裂纹（两条深灰细线，从岩面发散）
  ctx.strokeStyle = "#333a41";
  ctx.lineWidth = Math.max(0.7, R * 0.028);
  ctx.globalAlpha = a * 0.7;
  for (let i = 0; i < 2; i++) {
    const s = T.seed + i * 2.9;
    const a0 = rot * 1.6 + s;
    ctx.beginPath();
    ctx.moveTo(hx + Math.cos(a0) * Rx * 0.3, Math.sin(a0) * Ry * 0.3);
    for (let j = 1; j <= 3; j++) {
      const aj = a0 + j * 0.3;
      ctx.lineTo(hx + Math.cos(aj) * Rx * (0.32 + j * 0.2), Math.sin(aj) * Ry * (0.32 + j * 0.2));
    }
    ctx.stroke();
  }
}

/**
 * 破空特效（炫目金色，**分两段**）：
 *  · **前缘破空罩**（低速就有）：椭圆穹顶套在陨石前缘，像钝头撞开空气的那种半圆罩 ——
 *    淡金罩面 + 两道同心亮弧（前沿压缩），形状固定、不随速度变。
 *  · **后侧流线尾**（高速才出现）：m 超过阈值才淡入，且**越拖越长**（2R → 18R）——
 *    一条细长的金色流线，从罩的尾部向后收成尖。
 * 全程零逐帧分配（ss3 / 固定循环）。
 */
function drawShockBubble(T, m, hx, R) {
  // ============ 头部罩：右端贴合陨石圆头 + 陨石生长中段由虚化变实 ============
  // 罩右缘 = cx0 + rx = hx + 0.8R —— 正好压在陨石（Rx=0.8R）右缘上，不再向前突出。
  const cx0 = hx - R * 0.25;            // 罩圆心（陨石中心稍后）
  const rx = R * 1.05;                  // 罩长半轴
  const ry = R * 0.85;                  // 罩短半轴（仍包住陨石上下）
  // 出现时机：**陨石还小的时候不出现半圆** —— m 0.36 才从虚化渐显，0.76 完全变实。
  // 只有陨石长到足够大，半圆破空罩才浮现，且是"由虚化凝实"，不是啪一下出现。
  const occ = ss3((m - 0.36) / 0.4);
  if (occ <= 0) return;

  // ============ 后侧流线尾：速度够了才出现，越拖越长 ============
  // r = 真实速度比例。r 0.7 才开始浮现，生长放慢（tailIn^2.6，≈旧版 1/5 速率）。
  const [vx, vy] = velOf();
  const top = store.phys && store.phys.topSpeed;
  const spd = Math.hypot(vx, vy);
  const r = top > 0 ? spd / top : 0;
  const tailIn = ss3((r - 0.7) / 0.3);
  const tail = R * (14 * Math.pow(tailIn, 2.6)); // 0 → 14R：无尾时 tail=0
  const tx = cx0 - tail;                     // 尾尖 x：tail=0 → 罩后沿（与罩同一闭合线）

  // ★★ 罩 + 尾 = **同一条闭合流线**：尖 →（下边缘流线）→ 罩下缘 →（椭圆右半罩）→
  //    罩上缘 →（上边缘流线）→ 尖。端点共享、C¹ 衔接，从圆头到细尖是一整条连贯曲线，
  //    把陨石完整包在中间，没有任何断档。（尾淡入时整条线一起拉长，全程无缝）
  const shell = () => {
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.bezierCurveTo(tx + tail * 0.3, ry * 0.5, cx0 - rx * 0.5, ry * 0.95, cx0, ry);
    ctx.ellipse(cx0, 0, rx, ry, 0, Math.PI * 0.5, -Math.PI * 0.5, true);
    ctx.bezierCurveTo(cx0 - rx * 0.5, -ry * 0.95, tx + tail * 0.3, -ry * 0.5, tx, 0);
    ctx.closePath();
  };

  // 罩/尾合体填充（**橙红 → 鲜艳金**，随 occ 由虚到深），**中心陨石区挖空**：
  // · 用 evenodd 环状填充 —— 外圈是流线罩，中心椭圆（陨石所在区域）不填充，
  //   于是破空罩只包在陨石外围发光，陨石本体完全不被遮挡、始终清晰可见。
  // · 橙红主层先亮起，鲜橙层在 occ 升高时才明显，金黄芯最晚最浓 → 颜色逐渐加深。
  // ---- 多层同心水滴：最内层金色贴住陨石，向外逐层放大、颜色由金渐变到橙红 ----
  // 里层不勾轮廓、靠渐变色区分层次；仅最外层勾一条细亮边 → 读出"多层水滴"。
  // 所有层都是低透明度重叠绘制，陨石透出来依然鲜艳；fade 随 occ 由虚化→实。
  const fade = Math.min(1, 0.2 + 0.8 * occ);
  const LAY = [
    { s: 1.0,  c: "#ffc23c", a: 0.28 },  // 第1层 金色：紧贴陨石
    { s: 1.18, c: "#ffa52a", a: 0.22 },  // 第2层 橙金
    { s: 1.38, c: "#ff8a12", a: 0.16 },  // 第3层 鲜橙
    { s: 1.6,  c: "#ff5f0a", a: 0.11 },  // 第4层 橙红
    { s: 1.85, c: "#ff8246", a: 0.06 },  // 第5层 淡橙外晕
  ];
  // ★ 全程**只填充、不描任何轮廓** —— 层次全靠从金到橙红的渐变区分。
  for (let li = 0; li < LAY.length; li++) {
    const ly = LAY[li];
    ctx.save();
    ctx.translate(hx, 0);
    ctx.scale(ly.s, ly.s);
    ctx.translate(-hx, 0);
    shell();
    ctx.fillStyle = ly.c;
    ctx.globalAlpha = ly.a * fade + 0.18 * tailIn;
    ctx.fill();
    ctx.restore();
  }

  // 两条侧流线（贴着包络，尾长后更有感）
  if (tailIn > 0) {
    for (let i = 0; i < 2; i++) {
      const yy = (i === 0 ? 1 : -1) * ry * 0.42;
      ctx.strokeStyle = "#ffb34d";
      ctx.lineWidth = Math.max(0.5, R * 0.014);
      ctx.globalAlpha = 0.5 * tailIn;
      ctx.beginPath();
      ctx.moveTo(cx0 - rx * 0.35, yy * 0.7);
      ctx.quadraticCurveTo(cx0 - tail * 0.45, yy * 1.1, tx * (0.9 + 0.1 * i), yy * (0.55 + 0.35 * i));
      ctx.stroke();
    }
  }
}

/**
 * 尘埃尾：彗星标志性的**宽而弯曲**的尾。
 * 6 层嵌套（外宽淡 → 内窄亮），轮廓用幂函数收窄 —— 从尾根约火球直径宽
 * 平滑过渡到尖端一点，是"锥形"，不是"长条"。
 * forks 股在尾根扇形散开、沿尾逐渐汇聚；中轴按 spin 蛇形摆动。
 */
function drawDustTail(T, a, hx, TL, R, k, q, forks, spin) {
  const steps = 22;
  const rootW = R * 0.6 / Math.sqrt(forks);
  const LAY = [1, 0.68, 0.46, 0.3, 0.17, 0.08];
  const AL = [0.05, 0.07, 0.1, 0.14, 0.2, 0.3];
  for (let f = 0; f < forks; f++) {
    const s = T.seed + f * 2.13;
    const ph0 = forks > 1 ? (f / forks) * Math.PI * 2 : 0;
    const off = forks > 1 ? (f - (forks - 1) / 2) * rootW * 1.15 : 0;
    for (let li = 0; li < LAY.length; li++) {
      const fw = LAY[li];
      const tailFrac = 1 - li * 0.05;
      ctx.fillStyle = li < 2 ? T.glow : T.core;
      ctx.globalAlpha = a * AL[li] * (0.5 + 0.5 * k);
      ctx.beginPath();
      ctx.moveTo(hx, off * 0.7 - rootW * fw * 0.8);
      for (let j = 1; j <= steps; j++) {
        const t = (j / steps) * tailFrac;
        const x = hx - t * TL;
        const w = Math.max(0.4, rootW * fw * Math.pow(1 - t, 1.75));
        const bend = -t * t * TL * 0.12 * tailFrac;   // 尘埃尾被推弯的弧
        const sway = Math.sin(t * spin * 3.6 + ph0 + ph * (1.5 + Math.abs(spin))) * w * 0.9 * t;
        const turb = nz(t * 2.6 + ph * 1.9, s) * w * 0.55 * t;
        const cy = off * (1 - t * 0.85) + bend + sway + turb * (li < 2 ? 1.5 : 0.7);
        ctx.lineTo(x, cy - w);
      }
      for (let j = steps; j >= 1; j--) {
        const t = (j / steps) * tailFrac;
        const x = hx - t * TL;
        const w = Math.max(0.4, rootW * fw * Math.pow(1 - t, 1.75));
        const bend = -t * t * TL * 0.12 * tailFrac;
        const sway = Math.sin(t * spin * 3.6 + ph0 + ph * (1.5 + Math.abs(spin))) * w * 0.9 * t;
        const turb = nz(t * 2.6 + ph * 1.9, s) * w * 0.55 * t;
        const cy = off * (1 - t * 0.85) + bend + sway + turb * (li < 2 ? 1.5 : 0.7);
        ctx.lineTo(x, cy + w);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** 离子尾：笔直、窄、白热 —— 彗星那条细而亮的蓝白尾巴，比尘埃尾长 15% */
function drawIonTail(T, a, hx, TL, R, k) {
  const ionW = R * 0.13;
  for (let li = 0; li < 2; li++) {
    const fw = 1 - li * 0.45;
    ctx.fillStyle = li === 0 ? T.glow : T.core;
    ctx.globalAlpha = a * (li === 0 ? 0.12 : 0.24) * (0.45 + 0.55 * k);
    ctx.beginPath();
    ctx.moveTo(hx, -ionW * fw);
    ctx.lineTo(hx - TL * 0.5, -ionW * fw * 0.16);
    ctx.lineTo(hx - TL * 1.15, -ionW * fw * 0.04);
    ctx.lineTo(hx - TL * 1.15, ionW * fw * 0.04);
    ctx.lineTo(hx - TL * 0.5, ionW * fw * 0.16);
    ctx.lineTo(hx, ionW * fw);
    ctx.closePath();
    ctx.fill();
  }
}

/** 火星碎屑：沿尾飞溅、闪烁的亮点（彗核解体掉下的碎片），数量随速度增多 */
function drawSparks(T, a, hx, TL, R, k, q) {
  const n = Math.max(8, Math.round((6 + T.count * 2.2) * q * (0.3 + 0.7 * k)));
  for (let i = 0; i < n; i++) {
    const s = T.seed + i * 1.63;
    const t = (((i * 0.414 + ph * (0.25 + 0.2 * k) + T.seed) % 1) + 1) % 1;
    const x = hx - t * TL * 1.05;
    const y = nz(t * 3.2 + ph * 2.8, s) * R * (0.45 + t) * 0.75 - t * t * TL * 0.12;
    const r = Math.max(0.5, R * 0.055 * (1 - t * 0.5) * (0.5 + 0.8 * Math.abs(Math.sin(ph * 3 + s))));
    ctx.fillStyle = T.core;
    ctx.globalAlpha = a * 0.75 * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  }
}

/** 激波辉光：满速时彗核前缘的压缩弧（大气摩擦） */
function drawShock(T, m, hx, R) {
  if (m <= 0) return;
  ctx.fillStyle = T.glow;
  ctx.globalAlpha = m * 0.14;
  ctx.beginPath();
  ctx.ellipse(hx + R * 0.5, 0, R * 0.8, R * 0.38, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = T.core;
  ctx.globalAlpha = m * 0.1;
  ctx.beginPath();
  ctx.ellipse(hx + R * 0.55, 0, R * 0.5, R * 0.2, 0, 0, 7);
  ctx.fill();
}

/**
 * 彗星形态（唯一画法）：彗发 + 彗核 + 尘埃尾 + 离子尾 + 碎屑 + 激波。
 * 速度越快 → 彗核越大（R）、尾越长（TL）、碎屑越多；满速（m）追加激波。
 * @param R 彗核光晕半径（世界 px，调用方已按屏幕 px 换算，见 drawTrail）
 */
function drawCometTrail(T, a, A, L, W, R, k, m, q) {
  const tr = STYLE_TRAITS[T.style] || STYLE_TRAITS.arc;
  const TL = L * (0.35 + 0.95 * k);
  const hx = A - R * 0.3;
  drawDustTail(T, a, hx, TL, R, k, q, tr.forks, tr.spin);
  drawIonTail(T, a, hx, TL, R, k);
  drawMeteoroid(T, a, hx, R, k);
  drawSparks(T, a, hx, TL, R, k, q);
  drawShock(T, m, hx, R);
}

/**
 * 拖尾绘制已整体移除（高速形态重构）：不再画任何光晕 / 彗尾 / 能量带。
 * 宇宙级车的高速外观改为「车本身替换成一颗陨石」——见 bike.js 的 drawBike。
 * 这里保留空壳仅是为了 scene.js 不改 import / 调用点，将来要恢复拖尾也好找入口。
 */
export function drawTrail() {
  return;
}

/** 当前车是否已解锁特殊形态（builtin 形态视为天然解锁，与 physics/bike.js 同口径） */
export function ultraUnlocked(veh) {
  if (!veh || !veh.ultra || !veh.ultra.mode) return false;
  return veh.ultra.builtin === true || store.ultra[veh.id] === true;
}

/**
 * 陨星形态系数 m ∈ [0,1]（同旧拖尾口径：速度强度 → 对数归一 k → 陨星交叉淡入）。
 * 只有当前车挂了 trail（宇宙级车）才可能非 0 —— 普通车永远返回 0，
 * 保证 drawBike 不会误把普通车替换成陨石。
 *
 * ★ **未解锁特殊形态时恒返回 0**：陨石本体 + 水滴破空罩是解锁后的专属外观，
 *   裸车哪怕跑到当前极速也不显示（用户明确要求）。
 *   注意这与速度无关，也与 physics 的防翻车无关 —— 裸车现在能正常跑，
 *   但外观仍然是普通自行车，直到买下形态才蜕变为陨石。
 */
export function meteorFactor() {
  const veh = VEHICLES[store.currentVehicle];
  if (!veh || !veh.trail) return 0;
  if (!ultraUnlocked(veh)) return 0;
  const [vx, vy] = velOf();
  const spd = Math.hypot(vx, vy);
  return meteorOf(intensity(spd));
}

/** 陨石完全成型阈值：meteorFactor() ≥ 此值后淡入满，车被陨石完整罩住 */
export const METEOR_SWITCH = 0.5;
/** 陨石淡入起点：≥此值开始从纯车过渡到陨石（smoothstep 到 METEOR_SWITCH 满）。
 *  ★ 放低到 0.05：更早浮现、窗口更宽，避免"一到阈值瞬间全盖上"的突兀。 */
export const METEOR_FADE_LO = 0.05;
/** 陨石 / 破风水滴的统一缩放系数（先按要求缩 2/3，再缩一半 → 1/3）。 */
export const METEOR_SCALE = 1 / 3;

/**
 * 在已 translate + rotate 到车辆位置的坐标系里，把整辆车画成一颗陨石。
 * @param {number} m 陨星系数（0~1）——决定陨石大小与灼烧亮度
 */
export function drawMeteorBike(veh, m, alpha) {
  const T = veh && veh.trail;
  if (!T || !(m > 0)) return;
  ph += 1 / 60; // 自转相位（drawTrail 空操作后由这里推进）
  const z = store.cam.zoom > 1e-6 ? store.cam.zoom : 1;
  // 尺寸按屏幕 px 定义再 ÷zoom：速度再快、相机缩得再远，陨石在屏幕上保持车大小。
  // **从一个点涨到最终大小**：起点 R=2（刚显形就一个小灰点，落在车中心），
  // 满速 R=62（直径 124 = 两倍车宽），再整体 ×METEOR_SCALE（用户要求缩 2/3）。
  const R = ((2 + 60 * m) / z) * METEOR_SCALE;
  // alpha 由 bike.js 传入（实心，不淡入）；缺省沿 m 生长（巡航层等调用）
  drawMeteoroid(T, alpha ?? 0.8 + 0.2 * m, 0, R, m);
  // 金色的破空水滴纹包在陨石外面：圆头朝前、尖尾拖后，随速度变长
  drawShockBubble(T, m, 0, R);
}

/**
 * 巡航层陨石（屏幕坐标）：cruise.js 的 drawCruiseBike 用 —— 在 (x,y) 画半径 r 屏幕 px
 * 的陨石。巡航层 zoom 缩到 0.05 以下，世界坐标画车会缩成亚像素，所以这里固定屏幕尺寸。
 */
export function drawMeteorCruise(T, m, x, y, r) {
  if (!T || !(m > 0)) return;
  ph += 1 / 60; // 自转相位
  ctx.save();
  ctx.translate(x, y);
  drawMeteoroid(T, 0.8 + 0.2 * m, 0, r, m);
  drawShockBubble(T, m, 0, r);
  ctx.restore();
}