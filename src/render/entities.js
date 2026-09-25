// 世界实体绘制：装饰物 / 金币 / 油罐 / 加速带 / 终点旗
import { ctx, view } from "../core/canvas.js";
import { store, world } from "../core/store.js";
import { groundY } from "../physics/terrain.js";

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
  switch (kind) {
    case "tree":
      ctx.fillStyle = "#5b3a1e";
      ctx.fillRect(-3, -14, 6, 14);
      ctx.fillStyle = "#2f7a35";
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.quadraticCurveTo(-20, -14, 0, -4);
      ctx.quadraticCurveTo(20, -14, 0, -38);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.beginPath();
      ctx.ellipse(-5, -22, 6, 10, 0.4, 0, 7);
      ctx.fill();
      break;
    case "bush":
      ctx.fillStyle = "#37703a";
      ctx.beginPath();
      ctx.ellipse(0, -6, 11, 7, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-7, -4, 7, 5, 0, 0, 7);
      ctx.fill();
      break;
    case "snowman":
      ctx.fillStyle = "#f7fbff";
      ctx.strokeStyle = "#c9dcec";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, -8, 8, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -20, 5.5, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e8622a";
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(6, -19);
      ctx.lineTo(0, -18);
      ctx.closePath();
      ctx.fill();
      break;
    case "icespike":
      ctx.fillStyle = "rgba(190,220,245,.85)";
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(6, 0);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case "rock":
      ctx.fillStyle = "#8a8f98";
      ctx.beginPath();
      ctx.ellipse(0, -3, 9, 6, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#a9aeb6";
      ctx.beginPath();
      ctx.ellipse(-2, -4, 5, 3, 0, 0, 7);
      ctx.fill();
      break;
    case "cactus":
      ctx.fillStyle = "#3d7a44";
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
      ctx.fillStyle = "rgba(28,32,42,.35)";
      ctx.beginPath();
      ctx.ellipse(0, -2, 16, 5, 0, 0, 7);
      ctx.fill();
      break;
    default: {
      // moonrock：多边形月岩
      ctx.fillStyle = "#7e848d";
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-6, -11);
      ctx.lineTo(4, -13);
      ctx.lineTo(10, -4);
      ctx.lineTo(6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#9aa1aa";
      ctx.beginPath();
      ctx.moveTo(-6, -11);
      ctx.lineTo(4, -13);
      ctx.lineTo(2, -7);
      ctx.closePath();
      ctx.fill();
      break;
    }
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
    ctx.fillStyle = "#ffd166";
    ctx.strokeStyle = "#d9a400";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, y, 7, Math.max(2, 7 - Math.abs(sxr) * 0.6), 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d9a400";
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
    ctx.fillStyle = "rgba(255,160,20,.16)";
    ctx.beginPath();
    ctx.arc(sx, y + bob, 16, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#e85d04";
    ctx.strokeStyle = "#9c3d00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(sx - 8, y + bob - 7, 16, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(sx - 4, y + bob - 5, 8, 10);
    ctx.fillStyle = "#fff";
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
    ctx.fillStyle = "rgba(76,255,136,.20)";
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(76,255,136,.85)";
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
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, y - 120);
  ctx.lineTo(sx, bottom);
  ctx.stroke();
  ctx.fillStyle = "#ee1111";
  ctx.beginPath();
  ctx.moveTo(sx, y - 120);
  ctx.lineTo(sx + 34, y - 108);
  ctx.lineTo(sx, y - 96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("终点", sx - 6, y - 118);
  ctx.textAlign = "left";
}
