// 世界实体绘制：装饰物 / 金币 / 油罐 / 加速带 / 机制实体（障碍/危险段/限时门）/ 终点旗
import { token } from "../config/ui-tokens.js";
import { ctx, view } from "../core/canvas.js";
import { store, world } from "../core/store.js";
import { groundY } from "../physics/terrain.js";
import { THEMES, DECO_COLORS } from "../config/themes.js";
import { OBST_VIS_H, toKmh } from "../config/constants.js";

/** 按主题绘制装饰物（纯视觉） */
export function drawDeco(cx, cy) {
  for (const t of world.decoTree) {
    const sx = t.x - cx;
    if (sx < -60 || sx > view.W + 60) continue;
    drawDecoItem(sx, t.y - cy, t.kind, t.s, t.ph);
  }
  for (const r of world.decoRock) {
    const sx = r.x - cx;
    if (sx < -60 || sx > view.W + 60) continue;
    drawDecoItem(sx, r.y - cy, r.kind, r.s, r.ph);
  }
}

function drawDecoItem(sx, y, kind, s, ph) {
  ctx.save();
  ctx.translate(sx, y);
  ctx.scale(s, s);
  const C = DECO_COLORS[kind] || DECO_COLORS.__default || [];
  switch (kind) {
    case "tree":
      ctx.fillStyle = C[0];
      ctx.fillRect(-3, -14, 6, 14);
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.quadraticCurveTo(-20, -14, 0, -4);
      ctx.quadraticCurveTo(20, -14, 0, -38);
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.ellipse(-5, -22, 6, 10, 0.4, 0, 7);
      ctx.fill();
      break;
    case "bush":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, -6, 11, 7, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-7, -4, 7, 5, 0, 0, 7);
      ctx.fill();
      break;
    case "snowman":
      ctx.fillStyle = C[0];
      ctx.strokeStyle = C[1];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, -8, 8, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -20, 5.5, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(6, -19);
      ctx.lineTo(0, -18);
      ctx.closePath();
      ctx.fill();
      break;
    case "icespike":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(6, 0);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case "rock":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, -3, 9, 6, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(-2, -4, 5, 3, 0, 0, 7);
      ctx.fill();
      break;
    case "cactus":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.roundRect(-3.5, -24, 7, 24, 3);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-11, -18, 7, 5, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-11, -18, 5, 12, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(4, -14, 7, 5, 2.5);
      ctx.fill();
      break;
    case "crater":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, -2, 16, 5, 0, 0, 7);
      ctx.fill();
      break;
    case "moonrock":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-6, -11);
      ctx.lineTo(4, -13);
      ctx.lineTo(10, -4);
      ctx.lineTo(6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(-6, -11);
      ctx.lineTo(4, -13);
      ctx.lineTo(2, -7);
      ctx.closePath();
      ctx.fill();
      break;
    case "flower":
      ctx.strokeStyle = C[0];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -12);
      ctx.stroke();
      ctx.fillStyle = C[1];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.2832;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 4, -14 + Math.sin(a) * 4, 3.4, 2.4, a, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.arc(0, -14, 2.4, 0, 7);
      ctx.fill();
      break;
    case "snowtree":
      ctx.fillStyle = C[0];
      ctx.fillRect(-2.5, -10, 5, 10);
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(12, -8);
      ctx.lineTo(-12, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(7, -20);
      ctx.lineTo(-7, -20);
      ctx.closePath();
      ctx.fill();
      break;
    case "pebble":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(1, 0, 8, 2.6, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, -2.5, 6.5, 4, 0, 0, 7);
      ctx.fill();
      break;
    case "fern":
      ctx.strokeStyle = C[0];
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(i * 5, -12, i * 12, -20 - Math.abs(i) * -3);
        ctx.stroke();
      }
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 2, 0, 0, 7);
      ctx.fill();
      break;
    case "stump":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.roundRect(-7, -14, 14, 14, 2);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, -14, 7, 3, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = C[2];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -14, 4, 1.7, 0, 0, 7);
      ctx.stroke();
      break;
    case "lavarock":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-7, -10);
      ctx.lineTo(3, -13);
      ctx.lineTo(10, -3);
      ctx.lineTo(6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C[1];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(-1, -7);
      ctx.lineTo(3, -4);
      ctx.stroke();
      break;
    case "obsidian":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-4, -20);
      ctx.lineTo(6, -14);
      ctx.lineTo(8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(-4, -20);
      ctx.lineTo(6, -14);
      ctx.lineTo(0, -10);
      ctx.closePath();
      ctx.fill();
      break;
    case "iceberg":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 3, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-4, -22);
      ctx.lineTo(4, -12);
      ctx.lineTo(11, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.moveTo(-4, -22);
      ctx.lineTo(0, -10);
      ctx.lineTo(-8, -6);
      ctx.closePath();
      ctx.fill();
      break;
    case "crystal":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.arc(0, -8, 12, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(5, -8);
      ctx.lineTo(0, 0);
      ctx.lineTo(-5, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(5, -8);
      ctx.lineTo(0, -8);
      ctx.closePath();
      ctx.fill();
      break;
    case "mesarock":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(-9, -14);
      ctx.lineTo(9, -14);
      ctx.lineTo(11, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.fillRect(-9, -18, 18, 4);
      ctx.fillStyle = C[2];
      ctx.fillRect(-9, -9, 18, 2.4);
      break;
    case "reed":
      ctx.strokeStyle = C[0];
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 4, 0);
        ctx.quadraticCurveTo(i * 7, -14, i * 5, -26);
        ctx.stroke();
      }
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(-5, -27, 3, 6.5, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(5, -27, 3, 6.5, 0, 0, 7);
      ctx.fill();
      break;
    case "ruin":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-12, -18);
      ctx.lineTo(-4, -18);
      ctx.lineTo(-4, -10);
      ctx.lineTo(3, -10);
      ctx.lineTo(3, -22);
      ctx.lineTo(12, -22);
      ctx.lineTo(12, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.fillRect(-8, -8, 4, 5);
      ctx.fillRect(6, -14, 4, 5);
      break;
    case "rubble":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 3, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.fillRect(-10, -7, 9, 7);
      ctx.fillRect(-2, -11, 8, 11);
      ctx.fillStyle = C[2];
      ctx.fillRect(5, -6, 7, 6);
      break;
    case "pillar":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(-6, -24);
      ctx.lineTo(6, -24);
      ctx.lineTo(7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, -24, 6.5, 2, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.fillRect(-5, -18, 10, 2);
      break;
    case "cloudpuff":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.arc(-5, -8, 7, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5, -8, 7, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -13, 8, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, -4, 11, 3, 0, 0, 7);
      ctx.fill();
      break;
    case "pine":
      ctx.fillStyle = C[0];
      ctx.fillRect(-2.5, -10, 5, 10);
      ctx.fillStyle = C[1];
      for (let i = 0; i < 3; i++) {
        const ty = -10 - i * 9;
        const tw = 13 - i * 3.5;
        ctx.beginPath();
        ctx.moveTo(0, ty - 11);
        ctx.lineTo(tw, ty);
        ctx.lineTo(-tw, ty);
        ctx.closePath();
        ctx.fill();
      }
      break;
    default:
      // 未知类型兜底：小圆点
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, -3, 8, 5, 0, 0, 7);
      ctx.fill();
      break;
  }
  ctx.restore();
}

export function drawCoins(cx, cy) {
  for (const c of world.coins) {
    if (c.taken) continue;
    const sx = c.x - cx;
    if (sx < -20 || sx > view.W + 20) continue;
    const y = c.y - cy;
    const sxr = Math.sin(c.ph) * 6;
    c.ph += 0.05;
    ctx.fillStyle = token("obj-coin");
    ctx.strokeStyle = token("obj-coin-dark");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, y, 7, Math.max(2, 7 - Math.abs(sxr) * 0.6), 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = token("obj-coin-dark");
    ctx.beginPath();
    ctx.arc(sx, y, 2, 0, 7);
    ctx.fill();
  }
}

export function drawCanisters(cx, cy) {
  for (const c of world.canisters) {
    if (c.taken) continue;
    const sx = c.x - cx;
    if (sx < -30 || sx > view.W + 30) continue;
    const y = c.y - cy;
    const bob = Math.sin(c.ph) * 3;
    c.ph += 0.05;
    ctx.fillStyle = token("obj-canister-glow");
    ctx.beginPath();
    ctx.arc(sx, y + bob, 16, 0, 7);
    ctx.fill();
    ctx.fillStyle = token("obj-canister");
    ctx.strokeStyle = token("obj-canister-dark");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(sx - 8, y + bob - 7, 16, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = token("obj-coin");
    ctx.fillRect(sx - 4, y + bob - 5, 8, 10);
    ctx.fillStyle = token("text-hi");
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⛽", sx, y + bob - 10);
    ctx.textAlign = "left";
  }
}

export function drawBoosts(cx, cy) {
  for (const b of world.boosts) {
    if (b.taken) continue;
    const sx = b.x - cx;
    if (sx < -60 || sx > view.W + 60) continue;
    const y = b.y - cy;
    const t = store.time * 3.2 + b.ph;
    ctx.save();
    ctx.translate(sx, y);
    ctx.scale(1, 0.42);
    ctx.fillStyle = token("success-soft");
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, 7);
    ctx.fill();
    ctx.strokeStyle = token("obj-boost");
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const o = ((t * 26 + i * 18) % 38) - 19;
      const al = 1 - Math.abs(o) / 24;
      ctx.globalAlpha = Math.max(0.15, Math.min(1, al));
      ctx.beginPath();
      ctx.moveTo(o - 9, -11);
      ctx.lineTo(o + 3, 0);
      ctx.lineTo(o - 9, 11);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

export function drawFlag(cx, cy, finishX) {
  if (!isFinite(finishX)) return;
  const sx = finishX - cx;
  if (sx < -20 || sx > view.W + 20) return;
  const gy = groundY(finishX);
  if (gy === Infinity) return;
  const y = gy - cy;
  const bottom = cy + view.H / store.cam.zoom; // 视口底边（世界坐标），不再拿屏幕高当世界坐标
  ctx.strokeStyle = token("obj-bike-steel");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, y - 120);
  ctx.lineTo(sx, bottom);
  ctx.stroke();
  ctx.fillStyle = token("obj-finish");
  ctx.beginPath();
  ctx.moveTo(sx, y - 120);
  ctx.lineTo(sx + 34, y - 108);
  ctx.lineTo(sx, y - 96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = token("text-hi");
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("终点", sx - 6, y - 118);
  ctx.textAlign = "left";
}

/** 跳台：斜坡 + 箭头（airtime 变体的起飞点） */
export function drawJumps(cx, cy) {
  for (const j of world.jumps) {
    const sx = j.x - cx;
    if (sx < -70 || sx > view.W + 70) continue;
    const y = j.y - cy;
    if (!isFinite(y)) continue;
    ctx.save();
    ctx.translate(sx, y);
    // 台体
    ctx.fillStyle = token("obj-jump-base");
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(22, -22);
    ctx.lineTo(26, -22);
    ctx.lineTo(26, 0);
    ctx.closePath();
    ctx.fill();
    // 台面（高光）
    ctx.strokeStyle = j.used ? token("obj-jump-rim-used") : token("obj-jump-rim");
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(24, -22);
    ctx.stroke();
    if (!j.used) {
      // 起飞箭头（呼吸跳动）
      const bob = Math.sin(store.time * 4 + j.x * 0.01) * 3;
      ctx.fillStyle = token("obj-jump-glow");
      ctx.beginPath();
      ctx.moveTo(-6, -34 + bob);
      ctx.lineTo(6, -34 + bob);
      ctx.lineTo(0, -46 + bob);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------- 机制实体：障碍物 / 危险段 / 限时门 ----------------

/** 危险段：地表警示带 + 斜纹 + 限速牌（必须可提前预判） */
export function drawHazards(cx, cy) {
  for (const h of world.hazards) {
    const a = h.x0 - cx;
    const b = h.x1 - cx;
    if (b < -80 || a > view.W + 80) continue;
    const top = [];
    for (let x = h.x0; x <= h.x1; x += 22) {
      const y = groundY(x);
      if (!isFinite(y)) continue;
      top.push([x - cx, y - cy]);
    }
    const ye = groundY(h.x1);
    if (isFinite(ye)) top.push([h.x1 - cx, ye - cy]);
    if (top.length < 2) continue;

    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (const p of top) ctx.lineTo(p[0], p[1]);
    for (let i = top.length - 1; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1] + 130);
    ctx.closePath();
    ctx.fillStyle = token("obj-hazard-soft");
    ctx.fill();

    ctx.strokeStyle = token("obj-hazard-edge");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const flow = (store.time * 34) % 22;
    for (const p of top) {
      const ox = p[0] + flow - 22;
      ctx.beginPath();
      ctx.moveTo(ox, p[1] + 4);
      ctx.lineTo(ox + 12, p[1] + 20);
      ctx.stroke();
    }

    // 限速牌（中点上方的路牌）
    const midX = (h.x0 + h.x1) / 2;
    const gy = groundY(midX);
    if (!isFinite(gy)) continue;
    const px = midX - cx;
    const py = gy - cy;
    if (px < -80 || px > view.W + 80) continue;
    ctx.fillStyle = token("obj-hazard-fill");
    ctx.beginPath();
    ctx.roundRect(px - 4, py - 96, 96, 30, 7);
    ctx.fill();
    ctx.fillStyle = token("obj-hazard-mark");
    ctx.beginPath();
    ctx.arc(px + 14, py - 81, 9, 0, 7);
    ctx.fill();
    ctx.fillStyle = token("text-hi");
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(Math.round(toKmh(h.vmax)) + "", px + 14, py - 77);
    ctx.font = "10px sans-serif";
    ctx.fillText("限速 km/h", px + 62, py - 77);
    ctx.textAlign = "left";
  }
}

/** 障碍物：按场景主题外观绘制（高速撞上会摔车，须减速碾过或腾空飞越） */
export function drawObstacles(cx, cy) {
  const T = THEMES[store.phys.theme] || THEMES[0];
  const o = T.obstacle || { c1: token("obj-obstacle-fallback"), c2: token("obj-obstacle-fallback-2"), shape: "rock" };
  for (const obs of world.obstacles) {
    const sx = obs.x - cx;
    if (sx < -60 || sx > view.W + 60) continue;
    const sy = obs.y - cy;
    if (!isFinite(sy)) continue;
    ctx.save();
    ctx.translate(sx, sy);
    drawObstacleShape(o);
    ctx.restore();
  }
}

function drawObstacleShape(o) {
  const h = OBST_VIS_H;
  ctx.fillStyle = token("obj-shadow");
  ctx.beginPath();
  ctx.ellipse(0, 0, h * 0.75, 4, 0, 0, 7);
  ctx.fill();
  switch (o.shape) {
    case "log":
      ctx.fillStyle = o.c1;
      ctx.beginPath();
      ctx.roundRect(-h * 0.72, -h * 0.55, h * 1.44, h * 0.58, 5);
      ctx.fill();
      ctx.fillStyle = o.c2;
      ctx.beginPath();
      ctx.ellipse(-h * 0.72, -h * 0.26, h * 0.16, h * 0.29, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(h * 0.72, -h * 0.26, h * 0.16, h * 0.29, 0, 0, 7);
      ctx.fill();
      break;
    case "crystal":
      ctx.fillStyle = o.c1;
      ctx.beginPath();
      ctx.moveTo(0, -h * 1.35);
      ctx.lineTo(h * 0.55, -h * 0.35);
      ctx.lineTo(0, 0);
      ctx.lineTo(-h * 0.55, -h * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = o.c2;
      ctx.beginPath();
      ctx.moveTo(0, -h * 1.35);
      ctx.lineTo(h * 0.55, -h * 0.35);
      ctx.lineTo(0, -h * 0.42);
      ctx.closePath();
      ctx.fill();
      break;
    case "crate":
      ctx.fillStyle = o.c1;
      ctx.fillRect(-h * 0.6, -h, h * 1.2, h);
      ctx.strokeStyle = o.c2;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-h * 0.6, -h, h * 1.2, h);
      ctx.beginPath();
      ctx.moveTo(-h * 0.6, -h);
      ctx.lineTo(h * 0.6, 0);
      ctx.moveTo(h * 0.6, -h);
      ctx.lineTo(-h * 0.6, 0);
      ctx.stroke();
      break;
    case "lavaRock":
      ctx.fillStyle = o.c1;
      ctx.beginPath();
      ctx.moveTo(-h * 0.72, 0);
      ctx.lineTo(-h * 0.5, -h * 0.9);
      ctx.lineTo(h * 0.2, -h * 1.05);
      ctx.lineTo(h * 0.72, -h * 0.28);
      ctx.lineTo(h * 0.42, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = o.c2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-h * 0.3, -h * 0.16);
      ctx.lineTo(-h * 0.06, -h * 0.6);
      ctx.lineTo(h * 0.24, -h * 0.34);
      ctx.stroke();
      break;
    default:
      // rock
      ctx.fillStyle = o.c1;
      ctx.beginPath();
      ctx.moveTo(-h * 0.7, 0);
      ctx.lineTo(-h * 0.46, -h * 0.78);
      ctx.lineTo(h * 0.18, -h);
      ctx.lineTo(h * 0.7, -h * 0.4);
      ctx.lineTo(h * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = o.c2;
      ctx.beginPath();
      ctx.moveTo(-h * 0.46, -h * 0.78);
      ctx.lineTo(h * 0.18, -h);
      ctx.lineTo(h * 0.06, -h * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
  }
}

/** 限时门：旗杆 + 门楣，通过后变绿 */
export function drawGates(cx, cy) {
  for (const g of world.gates) {
    const sx = g.x - cx;
    if (sx < -80 || sx > view.W + 80) continue;
    const gy = groundY(g.x);
    if (!isFinite(gy)) continue;
    const y = gy - cy;
    const col = g.passed ? token("obj-gate-open") : token("obj-gate-pending");
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash(g.passed ? [] : [7, 6]);
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx, y - 150);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(sx - 20, y - 168, 40, 22, 5);
    ctx.fill();
    ctx.fillStyle = token("obj-bike-frame");
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(g.passed ? "✔" : "⏱", sx, y - 152);
    ctx.textAlign = "left";
  }
}
