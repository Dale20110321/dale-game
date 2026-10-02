// 车辆与骑手绘制（分层：远侧肢体 → 背包 → 躯干 → 头 → 近侧肢体）
// 车架主色使用当前车辆颜色（旧实现写死蓝色，买车看不出区别）
import { ctx, view } from "../core/canvas.js";
import { token } from "../config/ui-tokens.js";
import { WHEEL_R, WHEELBASE, SEAT_H, DT } from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, bike } from "../core/store.js";
import { clamp } from "../core/utils.js";

/** 两个 #rrggbb 之间线性插值（弹簧变色：两端色相仍来自令牌） */
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x + (y - x) * Math.max(0, Math.min(1, t)));
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

/**
 * 前后避震弹簧。k = 形态幅度系数：越野车最夸张（胖胎要配粗弹簧才成比例），
 * 山地车为 1；竞速车直接不画（k=0）。
 */
function drawCoils(hw, hr, mdy, sq2, k) {
  ctx.strokeStyle = mixHex(token("warn"), token("danger"), Math.abs(sq2));
  ctx.globalAlpha = 0.35 + Math.abs(sq2) * 0.65;
  ctx.lineWidth = 2;
  for (const [ax, ay, bx, by] of [
    [-hw * 0.2, -hr * 0.72 + sq2 * 3, 0, -mdy],
    [hw * 0.5, -hr * 0.75 + sq2 * 3, 0, -mdy],
  ]) {
    const L = Math.hypot(bx - ax, by - ay) || 1e-3;
    const coils = 2 + Math.abs(sq2) * 2.5;
    const nx = -(by - ay) / L;
    const ny = (bx - ax) / L;
    ctx.beginPath();
    for (let i = 0; i <= Math.round(coils * 10); i++) {
      const t = i / (coils * 10);
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const off = Math.sin(i * 0.63) * 2.2 * k;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px + nx * off, py + ny * off);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ============================================================
//  踩踏相位
// ============================================================
//
// ★ 为什么不能继续用 `bike.wheelAngleRear * 系数` 派生踏相：
//   1) wheelAngleRear 是**回绕**相位（每 TAU 跳一次），乘系数会在回绕点产生可见的跳变；
//      旧实现因为轮子只按真实转速的 1% 画、绕一圈要几千帧，跳变小到看不出来。
//   2) 车轮现在按真实轮速积分，高速每帧走 50~60°，直接当踏频就是 **9 转/秒**，
//      两条腿像风车一样甩。
//   改用 wheelStepRear（每帧的无回绕增量）累加：踏频与车速挂钩，但比例固定在
//   真实公路骑行区间（极速约 85 rpm），且与帧率无关。
const CRANK_RATIO = 0.155; // 踏频 / 轮速
const CRANK_FLOOR = 2.2;   // rad/s（折算成轮速）：停住时腿也别完全僵死
let crank = 0;

function crankPhase(b, dt) {
  // wheelStepRear 是**一个定步**的转角，而 drawBike 每渲染帧跑一次，两者不是一回事。
  // 换算成 rad/s 再乘本帧真实 dt，144Hz / 30Hz 上踏频才一致
  // （写死 ×60 的话 144Hz 会快 2.4 倍）。
  const wheelRps = Math.abs(b.wheelStepRear) / DT;
  crank += Math.max(wheelRps, CRANK_FLOOR) * CRANK_RATIO * dt;
  if (crank > 1e4) crank -= 1e4; // 长时间运行后的数值收敛，避免精度流失
  return crank;
}

export function drawBike(dt = 1 / 60) {
  const P = bike;
  const cxm = (P.rear.x + P.front.x) / 2;
  const cym = (P.rear.y + P.front.y) / 2;
  const ang = Math.atan2(P.front.y - P.rear.y, P.front.x - P.rear.x);

  ctx.save();
  ctx.translate(cxm - store.cam.x, cym - store.cam.y);
  ctx.rotate(ang);

  const hw = WHEELBASE * 0.5;
  const hr = SEAT_H;
  const sq2 = bike.squash || 0;
  const mdy = hr * 0.55 + sq2 * 4;
  const V = VEHICLES[store.currentVehicle];
  const vehCol = V.color;
  // 形态规格：同一物理包络（WHEEL_R / WHEELBASE / SEAT_H 是物理常量）里的样子差异
  const A = V.art || {};
  const POSE = A.pose || {};

  // 车架（主色随车辆变化，管径随形态变化）
  const seatTopY = -hr * 0.72 + sq2 * 3; // 座管顶
  const headTopY = -hr * 0.75 + sq2 * 3; // 前叉 / 头管顶
  ctx.strokeStyle = vehCol;
  ctx.lineWidth = A.tube || 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-hw, 0);
  ctx.lineTo(0, -mdy);
  ctx.lineTo(hw, 0);
  ctx.moveTo(-hw, 0);
  ctx.lineTo(-hw * 0.2, seatTopY);
  ctx.moveTo(hw, 0);
  ctx.lineTo(hw * 0.5, headTopY);
  ctx.stroke();
  // 上管：车架"性格"最直观的一根 —— 竞速车低且向车头下斜、越野车高而平直
  ctx.beginPath();
  ctx.moveTo(-hw * 0.2, seatTopY);
  ctx.lineTo(hw * 0.5, headTopY + (A.topDrop || 0));
  ctx.stroke();

  // 减震弹簧（竞速车 coil=0：公路车本来就没有避震，只留上面那根刚性前叉）
  if (A.coil > 0) drawCoils(hw, hr, mdy, sq2, A.coil);

  // 骑手纵向锚点：握把点从这里派生，姿态偏移时"手"和"把"永远画在同一处
  const glyphY = -hr * 0.72 + sq2 * 3;
  const barX = hw * 0.5 + (POSE.barX || 0);
  const barY = glyphY - 8 + (POSE.barY || 0);

  // 坐垫（宽度随形态：竞速窄垫、越野宽垫）
  ctx.fillStyle = token("obj-bike-tire");
  ctx.fillRect(-hw - 2, -hr * 0.8 - 4, A.saddleW || 10, 4);
  // 车把：flat 平把 / drop 弯把 / wide 直把
  ctx.strokeStyle = token("obj-bike-carbon");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hw * 0.5, headTopY);
  ctx.lineTo(barX, barY);
  ctx.stroke();
  ctx.fillStyle = token("obj-rider-suit");
  if (A.bar === "drop") {
    // 弯把：从把立甩出一段向下的钩 —— 公路车最有辨识度的轮廓
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.quadraticCurveTo(barX + 6.2, barY - 0.8, barX + 3.4, barY + 6.4);
    ctx.stroke();
    ctx.fillRect(barX - 5, barY - 1.6, 8.5, 3);
  } else if (A.bar === "wide") {
    // 直把：横杆更长更平（越野要张开手臂控方向）
    ctx.fillRect(barX - 5, barY - 1.6, 16, 3.4);
  } else {
    ctx.fillRect(barX - 4.5, barY - 1.5, 12, 3);
  }

  // 车轮：外缘半径恒为 WHEEL_R（物理常量，轮胎必须正好压在地面上），
  // 形态差异全在"描多粗"和"里面画多少辐条"上 —— 胖胎只是线宽变粗，中心线不动。
  const tire = A.tire || 3;
  const spokes = A.spokes || 6;
  const inner = WHEEL_R - tire * 0.5 - 1.2; // 胎内侧 = 内圈与辐条的落点
  for (const [off, spin, step] of [[-hw, P.wheelAngleRear, P.wheelStepRear], [hw, P.wheelAngleFront, P.wheelStepFront]]) {
    ctx.strokeStyle = token("obj-bike-tire");
    ctx.lineWidth = tire;
    ctx.beginPath();
    ctx.arc(off, 0, WHEEL_R, 0, 7);
    ctx.stroke();
    if (A.rim !== false) {
      ctx.strokeStyle = token("obj-bike-hub");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(off, 0, inner, 0, 7);
      ctx.stroke();
    }
    // 辐条：竞速车细胎高轮 → 多而细；越野胖胎 → 少而粗
    //
    // ★ 频闪处理：辐条图案每 (2π/辐条数) 重复一次，单帧转角一旦接近半个周期
    //   （6 辐条 → 30°），人眼就会把"每帧前进 43°"读成"每帧后退 17°"，轮子看着倒转。
    //   轮子现在按真实转速画（与路面严格同步），代价就是高速时辐条必须淡出，
    //   让高速段读成"一团在转的盘"，而不是一根根在跳的辐条。
    const halfPeriod = Math.PI / spokes;
    const blur = clamp((Math.abs(step) - halfPeriod * 0.4) / (halfPeriod * 1.2), 0, 1);
    const r = Math.max(2, inner - 1);
    ctx.globalAlpha = 1 - blur * 0.92;
    ctx.strokeStyle = token("obj-bike-metal");
    ctx.lineWidth = A.spokeW || 1.6;
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + spin;
      ctx.moveTo(off, 0);
      ctx.lineTo(off + Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    // 高速时补一道很淡的整圈，替代已淡出的辐条读出"在转"。
    // 辐条必须真的淡到接近 0：每帧转角接近辐条周期（6 辐条 = 60°）时，
    // 残留的辐条会每帧落回原位，看起来像**卡住不转**——这比转错方向更糟。
    if (blur > 0.25) {
      ctx.globalAlpha = blur * 0.26;
      ctx.strokeStyle = token("obj-bike-hub");
      ctx.lineWidth = (A.spokeW || 1.6) * 2.4;
      ctx.beginPath();
      ctx.arc(off, 0, r * 0.6, 0, 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = token("obj-bike-steel");
    ctx.beginPath();
    ctx.arc(off, 0, 2.6, 0, 7);
    ctx.fill();
  }

  // 骑手背线（沿同一 glyphY 锚点绘制）
  ctx.strokeStyle = token("obj-rider-skin-2");
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-hw * 0.2, glyphY);
  ctx.lineTo(hw * 0.5, glyphY - 8);
  ctx.stroke();

  // ---------------- 骑手 ----------------
  const susY = sq2 * 3.5;
  // 骑行服：远侧肢体用"更暗的同色"而不是半透明，避免看起来像残影
  const suitCol = token("obj-platform");
  const suitDark = token("obj-bike-dark");
  const suitFar = token("obj-platform-dark");
  const suitFarDark = token("obj-suit-far-dark");
  const bbX = -hw * 0.32;
  const bbY = -2.5 + susY;
  const cr = 5.8;
  const hipX = -12.5;
  const hipY = glyphY - 6.3 + susY;
  // 骑手姿态由形态规格给出：竞速车整个人压低前探、越野车坐得高、手臂张开够宽把
  const shX = 2.5 + (POSE.shX || 0);
  const shY = glyphY - 19.8 + susY + (POSE.shY || 0);
  const hdX = 5.6 + (POSE.hdX || 0);
  const hdY = glyphY - 22.8 + susY + (POSE.hdY || 0);
  const pda = crankPhase(bike, dt);

  const limb = (ax, ay, mx, my, bx, by, w1, w2, col, dark) => {
    ctx.lineCap = "round";
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(w1, w2) + 1.3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(mx, my);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.lineWidth = w2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };
  // 两段式逆向运动学：给定髋与脚，反解膝盖。
  // ★ 旧实现是"髋与脚的中点 + 固定偏移"——那条折线**不随踏相变化**，
  //   于是两条腿看起来是一根绕髋硬转的棍子在刮地，而不是真的在踩。
  //   现在膝盖位置由几何解出：踏板在上时膝盖自然抬高、伸直时自然落下。
  const L_THIGH = 15, L_SHIN = 15; // 髋到脚最大 30px > 实际最大 29.2px，够用且不会脱节
  const kneeOf = (hx, hy, fx, fy) => {
    let dx = fx - hx;
    let dy = fy - hy;
    const dRaw = Math.hypot(dx, dy) || 1e-4;
    // 夹进可达区间：完全伸直时 d 会逼近 L1+L2，不夹就会开出负的 h² → NaN
    const d = clamp(dRaw, Math.abs(L_THIGH - L_SHIN) + 0.001, (L_THIGH + L_SHIN) * 0.999);
    dx = (dx / dRaw) * d;
    dy = (dy / dRaw) * d;
    const a = (L_THIGH * L_THIGH - L_SHIN * L_SHIN + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L_THIGH * L_THIGH - a * a));
    const mx = hx + (dx / d) * a;
    const my = hy + (dy / d) * a;
    // 垂直方向两个解，取更靠前（+x）的那个 —— 膝盖朝前，与真车一致
    const px = (-dy / d) * h;
    const py = (dx / d) * h;
    return mx + px > mx - px ? [mx + px, my + py] : [mx - px, my - py];
  };
  const leg = (ph, w1, w2, col, dark) => {
    const fx = bbX + Math.cos(ph) * cr;
    const fy = bbY + Math.sin(ph) * cr;
    const [kx, ky] = kneeOf(hipX, hipY, fx, fy);
    limb(hipX, hipY, kx, ky, fx, fy, w1, w2, col, dark);
    ctx.fillStyle = token("obj-bike-frame");
    ctx.fillRect(fx - 2.6, fy - 0.8, 5.2, 1.7);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(fx + 1, fy - 0.5, 2.9, 1.8, 0, 0, 7);
    ctx.fill();
  };
  const arm = (w, col, dark) => {
    const ex = (shX + barX) / 2 + 0.8;
    const ey = (shY + barY) / 2 + 1.6;
    limb(shX + 0.8, shY + 0.8, ex, ey, barX - 0.8, barY + 0.6, w, w - 0.6, col, dark);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(barX - 0.8, barY + 0.6, 1.8, 0, 7);
    ctx.fill();
  };

  // 远侧肢体：暗色区分层次（不透明，避免"残影"）
  leg(pda + Math.PI, 3.2, 2.4, suitFar, suitFarDark);
  arm(2.5, suitFar, suitFarDark);

  // 水袋背包
  ctx.fillStyle = token("obj-helmet");
  ctx.strokeStyle = suitDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse((hipX + shX) / 2 - 2.4, (hipY + shY) / 2 + 1, 2.9, 4, -0.72, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = token("obj-goggle");
  ctx.beginPath();
  ctx.arc((hipX + shX) / 2 - 2.6, (hipY + shY) / 2 - 0.6, 0.8, 0, 7);
  ctx.fill();

  // 躯干
  ctx.fillStyle = suitCol;
  ctx.strokeStyle = suitDark;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(hipX - 2.6, hipY + 1.6);
  ctx.quadraticCurveTo(hipX - 4.4, hipY - 6, shX - 2.8, shY - 0.8);
  ctx.quadraticCurveTo(shX - 0.4, shY - 3.4, shX + 2.6, shY - 0.4);
  ctx.quadraticCurveTo(shX + 3.4, shY + 4, hipX + 2.4, hipY + 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = vehCol;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(hipX + 0.2, hipY + 0.4);
  ctx.lineTo(shX + 0.8, shY + 0.6);
  ctx.stroke();

  // 脖子与头
  ctx.strokeStyle = token("obj-rider-skin");
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(shX + 1.2, shY - 0.6);
  ctx.lineTo(hdX - 1.2, hdY + 2.8);
  ctx.stroke();
  ctx.fillStyle = token("obj-rider-skin-hi");
  ctx.strokeStyle = token("obj-rider-skin-sh");
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(hdX, hdY, 3.4, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = token("obj-hair");
  ctx.beginPath();
  ctx.arc(hdX + 2, hdY + 0.4, 0.75, 0, 7);
  ctx.fill();

  // 头盔：圆顶 + 前檐（去掉尖角/斜线，避免"头顶尖尖的"）
  ctx.fillStyle = token("obj-helmet");
  ctx.strokeStyle = token("obj-bike-frame");
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(hdX - 0.2, hdY - 0.7, A.helmR || 4.4, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 前檐（竞速车的气动盔没有前檐）
  if (A.peak !== false) {
    ctx.beginPath();
    ctx.roundRect(hdX + 2.3, hdY - 2.0, 4.6, 1.9, 0.9);
    ctx.fill();
    ctx.stroke();
  }
  // 通风槽（贴着盔面的短弧，不做斜线）；越野车槽更多
  ctx.strokeStyle = token("obj-glass-mid");
  ctx.lineWidth = 0.8;
  for (let v = 0, total = A.vents || 0; v < total; v++) {
    const a0 = Math.PI * (1.12 + v * 0.22);
    ctx.beginPath();
    ctx.arc(hdX - 0.2, hdY - 0.7, 2.5, a0, a0 + 0.6);
    ctx.stroke();
  }
  // 下巴带
  ctx.strokeStyle = token("obj-bike-carbon");
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(hdX + 1.1, hdY + 1.5);
  ctx.lineTo(hdX + 0.2, hdY + 3.2);
  ctx.stroke();

  // 近侧曲柄与肢体
  ctx.strokeStyle = token("obj-bike-gray");
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bbX, bbY);
  ctx.lineTo(bbX + Math.cos(pda) * cr, bbY + Math.sin(pda) * cr);
  ctx.stroke();
  ctx.fillStyle = token("obj-bike-carbon");
  ctx.beginPath();
  ctx.arc(bbX, bbY, 1.8, 0, 7);
  ctx.fill();
  leg(pda, 4, 3, suitCol, suitDark);
  arm(3.2, suitCol, suitDark);

  ctx.restore();
}