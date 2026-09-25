// 地形渲染：地表填充 + 阴影 + 按主题的地表纹理
import { ctx, view } from "../core/canvas.js";
import { THEMES } from "../config/themes.js";
import { store } from "../core/store.js";
import { groundY } from "../physics/terrain.js";

export function drawTerrain(cx, cy) {
  const W = view.W;
  const H = view.H;
  const T = THEMES[store.phys.theme] || THEMES[0];
  const pal = T.pal;

  // 主体
  ctx.fillStyle = pal[0];
  ctx.beginPath();
  ctx.moveTo(0, cy);
  let lastG = cy;
  for (let x = 0; x <= W; x += 6) {
    const wx = x + cx;
    const gy = groundY(wx);
    if (gy === Infinity) ctx.lineTo(x, lastG);
    else {
      lastG = gy - cy;
      ctx.lineTo(x, gy - cy);
    }
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // 表层草线
  ctx.fillStyle = pal[1];
  ctx.strokeStyle = pal[1];
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 6) {
    const gy = groundY(x + cx);
    if (gy === Infinity) continue;
    ctx.lineTo(x, gy - cy - 8);
  }
  ctx.stroke();

  // 地表下方阴影
  ctx.fillStyle = "rgba(0,0,0,.08)";
  ctx.beginPath();
  ctx.moveTo(0, cy);
  for (let x = 0; x <= W; x += 6) {
    const gy = groundY(x + cx);
    if (gy === Infinity) ctx.lineTo(x, lastG);
    else ctx.lineTo(x, Math.min(gy + 40, cy + H) - cy);
  }
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // 主题化地表纹理
  const th = store.phys.theme;
  if (th === 0) {
    ctx.strokeStyle = "rgba(28,84,38,.45)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 12) {
      const wx = x + cx;
      const gy = groundY(wx);
      if (gy === Infinity) continue;
      const h = 4 + Math.abs(Math.sin(wx * 0.37)) * 7;
      ctx.beginPath();
      ctx.moveTo(x, gy - cy - 1);
      ctx.lineTo(x + 2.5, gy - cy - 1 - h);
      ctx.stroke();
    }
  } else if (th === 1) {
    ctx.fillStyle = "rgba(255,255,255,.5)";
    for (let x = 0; x <= W; x += 14) {
      const gy = groundY(x + cx);
      if (gy === Infinity) continue;
      ctx.beginPath();
      ctx.ellipse(x, gy - cy - 4, 9, 3.5, 0, 0, 7);
      ctx.fill();
    }
  } else if (th === 2) {
    ctx.strokeStyle = "rgba(120,80,40,.30)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 18) {
      const gy = groundY(x + cx);
      if (gy === Infinity) continue;
      ctx.beginPath();
      ctx.moveTo(x, gy - cy + 8);
      ctx.quadraticCurveTo(x + 9, gy - cy + 4, x + 18, gy - cy + 9);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "rgba(28,32,42,.35)";
    for (let x = 0; x <= W; x += 22) {
      const wx = x + cx;
      const gy = groundY(wx);
      if (gy === Infinity) continue;
      const r = 3 + Math.abs(Math.sin(wx * 0.21)) * 5;
      ctx.beginPath();
      ctx.ellipse(x, gy - cy + 10, r, r * 0.4, 0, 0, 7);
      ctx.fill();
    }
  }
}
