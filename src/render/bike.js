// 车辆与骑手绘制（分层：远侧肢体 → 背包 → 躯干 → 头 → 近侧肢体）
// 车架主色使用当前车辆颜色（旧实现写死蓝色，买车看不出区别）
import { ctx, view } from "../core/canvas.js";
import { WHEEL_R, WHEELBASE, SEAT_H } from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, bike } from "../core/store.js";

export function drawBike() {
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
  const vehCol = VEHICLES[store.currentVehicle].color;

  // 车架（主色随车辆变化）
  ctx.strokeStyle = vehCol;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-hw, 0);
  ctx.lineTo(0, -mdy);
  ctx.lineTo(hw, 0);
  ctx.moveTo(-hw, 0);
  ctx.lineTo(-hw * 0.2, -hr * 0.72 + sq2 * 3);
  ctx.moveTo(hw, 0);
  ctx.lineTo(hw * 0.5, -hr * 0.75 + sq2 * 3);
  ctx.stroke();

  // 减震弹簧
  ctx.strokeStyle = `rgba(255,${Math.round(210 - Math.abs(sq2) * 160)},${Math.round(
    60 - Math.abs(sq2) * 40
  )},${0.35 + Math.abs(sq2) * 0.65})`;
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
      const off = Math.sin(i * 0.63) * 2.2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px + nx * off, py + ny * off);
    }
    ctx.stroke();
  }

  // 坐垫 / 车把
  ctx.fillStyle = "#222";
  ctx.fillRect(-hw - 2, -hr * 0.8 - 4, 10, 4);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hw * 0.5, -hr * 0.75);
  ctx.lineTo(hw * 0.62, -hr * 1.0);
  ctx.stroke();
  ctx.fillStyle = "#e88c1f";
  ctx.fillRect(hw * 0.42, -hr * 1.0, 12, 3);

  // 车轮
  for (const [off, spin] of [[-hw, P.wheelRear], [hw, P.wheelFront]]) {
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(off, 0, WHEEL_R, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(off, 0, WHEEL_R - 1.5, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const r = WHEEL_R - 3;
    const ph = spin;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + ph;
      ctx.moveTo(off, 0);
      ctx.lineTo(off + Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(off, 0, 2.6, 0, 7);
    ctx.fill();
  }

  const glyphY = -hr * 0.72 + 3 * (bike.squash || 0);
  ctx.strokeStyle = "#f4a259";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-hw * 0.2, glyphY);
  ctx.lineTo(hw * 0.5, glyphY - 8);
  ctx.stroke();

  // ---------------- 骑手 ----------------
  const susY = sq2 * 3.5;
  // 骑行服：远侧肢体用"更暗的同色"而不是半透明，避免看起来像残影
  const suitCol = "#2c3742";
  const suitDark = "#161c22";
  const suitFar = "#1d242b";
  const suitFarDark = "#0d1116";
  const bbX = -hw * 0.32;
  const bbY = -2.5 + susY;
  const cr = 5.8;
  const hipX = -12.5;
  const hipY = glyphY - 6.3 + susY;
  const shX = 2.5;
  const shY = glyphY - 19.8 + susY;
  const hdX = 5.6;
  const hdY = glyphY - 22.8 + susY;
  const barX = hw * 0.5;
  const barY = glyphY - 8;
  const pda = bike.wheelRear * 0.9;

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
  const leg = (ph, w1, w2, col, dark) => {
    const fx = bbX + Math.cos(ph) * cr;
    const fy = bbY + Math.sin(ph) * cr;
    const kx = (hipX + fx) / 2 + 3.4;
    const ky = (hipY + fy) / 2 - 1.8;
    limb(hipX, hipY, kx, ky, fx, fy, w1, w2, col, dark);
    ctx.fillStyle = "#1b1b1b";
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
  ctx.fillStyle = "#212b34";
  ctx.strokeStyle = suitDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse((hipX + shX) / 2 - 2.4, (hipY + shY) / 2 + 1, 2.9, 4, -0.72, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#8ad2ff";
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
  ctx.strokeStyle = "#e8a97e";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(shX + 1.2, shY - 0.6);
  ctx.lineTo(hdX - 1.2, hdY + 2.8);
  ctx.stroke();
  ctx.fillStyle = "#ffcba5";
  ctx.strokeStyle = "#c98a5f";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(hdX, hdY, 3.4, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3b2a20";
  ctx.beginPath();
  ctx.arc(hdX + 2, hdY + 0.4, 0.75, 0, 7);
  ctx.fill();

  // 头盔：圆顶 + 前檐（去掉尖角/斜线，避免"头顶尖尖的"）
  ctx.fillStyle = "#e63946";
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(hdX - 0.2, hdY - 0.7, 4.4, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 前檐（前倾的小圆角檐）
  ctx.beginPath();
  ctx.roundRect(hdX + 2.3, hdY - 2.0, 4.6, 1.9, 0.9);
  ctx.fill();
  ctx.stroke();
  // 通风槽（贴着盔面的短弧，不做斜线）
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(hdX - 0.2, hdY - 0.7, 2.5, Math.PI * 1.12, Math.PI * 1.8);
  ctx.stroke();
  // 下巴带
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(hdX + 1.1, hdY + 1.5);
  ctx.lineTo(hdX + 0.2, hdY + 3.2);
  ctx.stroke();

  // 近侧曲柄与肢体
  ctx.strokeStyle = "#4a4a4a";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bbX, bbY);
  ctx.lineTo(bbX + Math.cos(pda) * cr, bbY + Math.sin(pda) * cr);
  ctx.stroke();
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(bbX, bbY, 1.8, 0, 7);
  ctx.fill();
  leg(pda, 4, 3, suitCol, suitDark);
  arm(3.2, suitCol, suitDark);

  ctx.restore();
}
