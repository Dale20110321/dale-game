// 世界实体绘制：装饰物 / 金币 / 油罐 / 加速带 / 机制实体（危险段/跳台/限时门）/ 终点旗
import { token } from "../config/ui-tokens.js";
import { ctx, view } from "../core/canvas.js";
import { store, world } from "../core/store.js";
import { groundY } from "../physics/terrain.js";
import { DECO_COLORS } from "../config/themes.js";
import { toKmh } from "../config/constants.js";
import { getQuality } from "./postfx.js";

/** 按主题绘制装饰物（纯视觉）；中/高画质给装饰加上地面投影 */
export function drawDeco(cx, cy) {
  const q = getQuality();
  const shade = q === "medium" || q === "high";
  for (const t of world.decoTree) {
    const sx = t.x - cx;
    if (sx < -60 || sx > view.W + 60) continue;
    if (shade) {
      ctx.fillStyle = token("obj-shadow");
      ctx.beginPath();
      ctx.ellipse(sx + 2, t.y - cy + 3, 13 * t.s, 4.2 * t.s, 0, 0, 7);
      ctx.fill();
      if (q === "high") {
        // 高画质：内层更实的第二道影子（边缘柔、中心深，接近真实投影）
        ctx.beginPath();
        ctx.ellipse(sx + 1, t.y - cy + 2, 8 * t.s, 2.4 * t.s, 0, 0, 7);
        ctx.fill();
      }
    }
    drawDecoItem(sx, t.y - cy, t.kind, t.s, t.ph);
  }
  // 背景层：岩石 / 灌木 / 花 / 瓦砾等 —— 缩小 + 降对比 + 不画投影。
  // 原实现给它们画椭圆投影、再被 drawTerrain 盖住下半截、轮廓又是高对比，
  // 三者叠加让纯装饰看上去就是"嵌在路面里的实心障碍"，玩家据此认定撞上必摔
  // （实际零碰撞，车直接穿过）。这里只改视觉层级，**不加任何碰撞体**。
  ctx.globalAlpha = 0.62;
  for (const r of world.decoRock) {
    const sx = r.x - cx;
    if (sx < -60 || sx > view.W + 60) continue;
    drawDecoItem(sx, r.y - cy, r.kind, r.s * 0.8, r.ph);
  }
  ctx.globalAlpha = 1;
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
    const sxr = Math.sin(c.ph) * 6; // ph 由固定步推进（updateCoins），渲染层只读不写
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
    const bob = Math.sin(c.ph) * 3; // ph 由固定步推进（updateCanisters），渲染层只读不写
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

/**
 * 跳台：双段"缓助跑坡 + 上翘起飞唇"台形（airtime 变体的起飞点）。
 *   · 助跑坡从地面缓升，末端上翘成 kicker lip，贴近真实 BMX 跳台轮廓
 *   · 底座深色收边、坡面高光、表面抓痕纹理、起飞箭头（呼吸）三件套
 */
export function drawJumps(cx, cy) {
  for (const j of world.jumps) {
    const sx = j.x - cx;
    if (sx < -90 || sx > view.W + 90) continue;
    const y = j.y - cy;
    if (!isFinite(y)) continue;
    ctx.save();
    ctx.translate(sx, y);

    // 台体轮廓：缓坡 (-46,-6)→(-12,-14) → 上翘唇 (-12,-14)→(24,-30) → 顶缘 (24,-30)→(30,-30)
    ctx.fillStyle = token("obj-jump-base");
    ctx.beginPath();
    ctx.moveTo(-46, 0);
    ctx.lineTo(-46, -6);
    ctx.lineTo(-12, -14);
    ctx.lineTo(24, -30);
    ctx.lineTo(30, -30);
    ctx.lineTo(30, 0);
    ctx.closePath();
    ctx.fill();
    // 起跳唇侧阴影（让上翘段有厚度感）
    ctx.fillStyle = token("fx-shadow-faint");
    ctx.beginPath();
    ctx.moveTo(24, -30);
    ctx.lineTo(30, -30);
    ctx.lineTo(30, -14);
    ctx.lineTo(24, -14);
    ctx.closePath();
    ctx.fill();

    // 坡面高光（缓坡 + 上翘唇两段）
    ctx.strokeStyle = j.used ? token("obj-jump-rim-used") : token("obj-jump-rim");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-46, -6);
    ctx.lineTo(-12, -14);
    ctx.lineTo(24, -30);
    ctx.stroke();

    // 表面抓痕纹理（垂直于坡向的短线，强化台面材质感）
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const t = 0.18 + i * 0.3; // 沿坡 0.18 / 0.48 / 0.78
      const gx = -46 + (-12 - -46) * t;
      const gy = -6 + (-14 - -6) * t;
      const dx = -12 - -46, dy = -14 - -6;
      const L = Math.hypot(dx, dy) || 1;
      const px = -dy / L, py = dx / L; // 坡面法向（屏幕向上）
      // 分段法：仅当 t 落在第一段（缓坡）或第二段（上翘）中间
      if (t < 0.55) {
        ctx.strokeStyle = token("obj-jump-rim-used");
        ctx.beginPath();
        ctx.moveTo(gx + px * 2, gy + py * 2);
        ctx.lineTo(gx - px * 2, gy - py * 2);
        ctx.stroke();
      }
    }
    // 上翘唇上的抓痕（第二段）
    const a2 = [0.3, 0.65];
    for (const t of a2) {
      const gx = -12 + (24 - -12) * t;
      const gy = -14 + (-30 - -14) * t;
      const dx = 24 - -12, dy = -30 - -14;
      const L = Math.hypot(dx, dy) || 1;
      const px = -dy / L, py = dx / L;
      ctx.strokeStyle = token("obj-jump-rim-used");
      ctx.beginPath();
      ctx.moveTo(gx + px * 1.6, gy + py * 1.6);
      ctx.lineTo(gx - px * 1.6, gy - py * 1.6);
      ctx.stroke();
    }

    // 顶缘高光（lip 亮边）
    ctx.strokeStyle = j.used ? token("obj-jump-rim-used") : token("obj-jump-glow");
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(24, -30);
    ctx.lineTo(30, -30);
    ctx.stroke();

    // 起飞箭头（呼吸跳动，未使用过时显示）
    if (!j.used) {
      const bob = Math.sin(store.time * 4 + j.x * 0.01) * 3;
      ctx.fillStyle = token("obj-jump-glow");
      ctx.beginPath();
      ctx.moveTo(-6, -40 + bob);
      ctx.lineTo(6, -40 + bob);
      ctx.lineTo(0, -52 + bob);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------- 机制实体：危险段 / 跳台 / 限时门 ----------------

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
