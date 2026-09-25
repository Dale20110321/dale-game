// 背景：天空渐变 / 太阳与光晕 / 云 / 远山视差 / 月面星空
import { ctx, view } from "../core/canvas.js";
import { THEMES } from "../config/themes.js";
import { store } from "../core/store.js";
import { mulberry32 } from "../core/utils.js";

export function drawBackground(cx, cy) {
  const T = THEMES[store.phys.theme] || THEMES[0];
  const W = view.W;
  const H = view.H;

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, T.sky[0]);
  g.addColorStop(0.7, T.sky[1]);
  g.addColorStop(1, T.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (store.phys.theme === 3) {
    // 月面：星空 + 银河 + 地球
    const star = mulberry32(99);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    for (let i = 0; i < 70; i++) {
      const sx = ((((star() * 2000 - cx * 0.15) % W) + W) % W);
      const sy = star() * H * 0.7;
      const r = star() * 1.4;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,.14)";
    for (let i = 0; i < 14; i++) {
      const sx = ((((i * 431 - cx * 0.2) % W) + W) % W);
      const sy = 80 + (i % 7) * 60;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 90 + (i % 3) * 40, 22, 0, 0, 7);
      ctx.fill();
    }
    const ex = ((((150 - cx * 0.06) % (W + 400)) + W + 400) % (W + 400)) - 200;
    const ey = 110;
    ctx.fillStyle = "#3b6ea5";
    ctx.beginPath();
    ctx.arc(ex, ey, 26, 0, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(120,205,160,.6)";
    ctx.beginPath();
    ctx.ellipse(ex - 6, ey - 6, 11, 6, 0.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.beginPath();
    ctx.arc(ex, ey, 26, 0, 7);
    ctx.fill();
    return;
  }

  ctx.fillStyle = T.sun;
  ctx.beginPath();
  ctx.arc(W - 120, 90, 40, 0, 7);
  ctx.fill();
  const halo = ctx.createRadialGradient(W - 120, 90, 12, W - 120, 90, 170);
  halo.addColorStop(0, "rgba(255,255,255,.40)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(W - 120, 90, 170, 0, 7);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.75)";
  for (let i = 0; i < 6; i++) {
    const bw = 120 + (i % 3) * 30;
    const bx = ((((i * 260 - ((cx * 0.2) % W)) % W) + W) % W);
    const by = 60 + (i % 3) * 40;
    ctx.beginPath();
    ctx.ellipse(bx, by, bw, bw * 0.32, 0, 0, 7);
    ctx.fill();
  }

  const th = store.phys.theme;
  // 远山剪影（视差 0.18）
  ctx.fillStyle =
    th === 1 ? "rgba(140,170,200,.45)" : th === 2 ? "rgba(165,115,70,.40)" : "rgba(85,130,170,.42)";
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 10) {
    const wx = x + cx * 0.18;
    const wy = H * 0.5 - Math.sin(wx * 0.0031 + 0.6) * 46 - Math.sin(wx * 0.0093 + 2.2) * 18;
    ctx.lineTo(x, wy);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // 近丘
  ctx.fillStyle = th === 1 ? "#dfeefb" : th === 2 ? "#f6d9a8" : "#9cc5e0";
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) {
    const wy =
      H * 0.62 - Math.sin((x + cx * 0.4) * 0.01) * 46 - Math.sin((x + cx * 0.4) * 0.03) * 22;
    ctx.lineTo(x, wy);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}
