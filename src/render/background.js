// 背景：数据驱动图层解释器。
// 只负责把 THEMES[i].bg 描述的图层按顺序画出来，不含任何"按主题下标分支"的硬编码。
//   bg = { space, celestial, starLayers, aurora, cloudLayers, ridges, haze }
// 循环里只按 layer.kind 到注册表取绘制函数（函数式分派，不是按 theme 下标）。
import { ctx, view } from "../core/canvas.js";
import { THEMES } from "../config/themes.js";
import { store } from "../core/store.js";
import { mulberry32 } from "../core/utils.js";

/** 水平循环包裹：把世界 x 映射到 [0,W) 的屏幕 x */
function wrapX(v, W) {
  const m = W || 1;
  return ((v % m) + m) % m;
}

// ---------------- 天体注册表 ----------------
const CELESTIAL_PAINTERS = {
  sun(c, cx, W) {
    const x = wrapX(W * c.x - cx * c.parallax, W);
    const y = c.y;
    const halo = ctx.createRadialGradient(x, y, 12, x, y, c.r * 4.2);
    halo.addColorStop(0, "rgba(255,255,255,.40)");
    halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, c.r * 4.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, 7);
    ctx.fill();
  },
  moon(c, cx, W) {
    const x = wrapX(W * c.x - cx * c.parallax, W);
    const y = c.y;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.accent || "rgba(0,0,0,.15)";
    ctx.beginPath();
    ctx.arc(x - c.r * 0.3, y - c.r * 0.2, c.r * 0.28, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + c.r * 0.35, y + c.r * 0.25, c.r * 0.18, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + c.r * 0.1, y - c.r * 0.45, c.r * 0.12, 0, 7);
    ctx.fill();
  },
  earth(c, cx, W) {
    const ex = wrapX(W * c.x - cx * c.parallax, W);
    const ey = c.y;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(ex, ey, c.r, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.accent || "rgba(120,205,160,.6)";
    ctx.beginPath();
    ctx.ellipse(ex - c.r * 0.24, ey - c.r * 0.24, c.r * 0.42, c.r * 0.24, 0.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.beginPath();
    ctx.arc(ex, ey, c.r, 0, 7);
    ctx.fill();
  },
  ringed(c, cx, W) {
    const x = wrapX(W * c.x - cx * c.parallax, W);
    const y = c.y;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, 7);
    ctx.fill();
    ctx.strokeStyle = c.accent || "rgba(255,255,255,.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, c.r * 1.7, c.r * 0.5, -0.4, 0, 7);
    ctx.stroke();
  },
  redGiant(c, cx, W) {
    const x = wrapX(W * c.x - cx * c.parallax, W);
    const y = c.y;
    const halo = ctx.createRadialGradient(x, y, c.r * 0.4, x, y, c.r * 3.2);
    halo.addColorStop(0, "rgba(255,140,60,.45)");
    halo.addColorStop(1, "rgba(255,140,60,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, c.r * 3.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.accent || "rgba(255,208,138,.6)";
    ctx.beginPath();
    ctx.arc(x - c.r * 0.2, y - c.r * 0.15, c.r * 0.45, 0, 7);
    ctx.fill();
  },
};

// ---------------- 云层注册表 ----------------
const CLOUD_PAINTERS = {
  soft(cl, cx, W) {
    ctx.fillStyle = cl.color;
    ctx.globalAlpha = cl.alpha != null ? cl.alpha : 1;
    for (let i = 0; i < cl.count; i++) {
      const bw = cl.w + (i % 3) * cl.wVar;
      const bx = wrapX(i * cl.spread - cx * cl.parallax, W);
      const by = cl.yBand[0] + (i % 3) * cl.yBand[1];
      ctx.beginPath();
      ctx.ellipse(bx, by, bw, bw * 0.32, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  thin(cl, cx, W) {
    ctx.fillStyle = cl.color;
    ctx.globalAlpha = cl.alpha != null ? cl.alpha : 1;
    for (let i = 0; i < cl.count; i++) {
      const bw = cl.w + (i % 3) * cl.wVar;
      const bx = wrapX(i * cl.spread - cx * cl.parallax, W);
      const by = cl.yBand[0] + (i % 3) * cl.yBand[1];
      ctx.beginPath();
      ctx.ellipse(bx, by, bw, bw * 0.14, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  storm(cl, cx, W) {
    ctx.fillStyle = cl.color;
    ctx.globalAlpha = cl.alpha != null ? cl.alpha : 1;
    for (let i = 0; i < cl.count; i++) {
      const bw = cl.w + (i % 3) * cl.wVar;
      const bx = wrapX(i * cl.spread - cx * cl.parallax, W);
      const by = cl.yBand[0] + (i % 3) * cl.yBand[1];
      ctx.beginPath();
      ctx.ellipse(bx, by, bw, bw * 0.42, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};

// ---------------- 远山/近丘注册表 ----------------
/** 山形起伏函数：返回相对基准线的屏幕 y（负值向上） */
const RIDGE_SHAPES = {
  hills(wx, l) {
    return -Math.sin(wx * l.f1 + l.phase) * l.amp1 - Math.sin(wx * l.f2 + l.phase * 1.7) * l.amp2;
  },
  peaks(wx, l) {
    return -Math.abs(Math.sin(wx * l.f1 + l.phase)) * l.amp1 - Math.abs(Math.sin(wx * l.f2 + l.phase * 1.3)) * l.amp2;
  },
  dunes(wx, l) {
    return -Math.sin(wx * l.f1 + l.phase) * l.amp1 - Math.sin(wx * l.f2 + l.phase * 1.5) * l.amp2 * 0.6;
  },
  mesa(wx, l) {
    const t = Math.sin(wx * l.f1 + l.phase) * 0.5 + 0.5;
    return -(Math.floor(t * 3) / 3) * l.amp1 - Math.sin(wx * l.f2 + l.phase * 1.5) * l.amp2 * 0.5;
  },
  ruin(wx, l) {
    const t = Math.sin(wx * l.f1 + l.phase) * 0.5 + 0.5;
    return -(Math.floor(t * 5) / 5) * l.amp1 - Math.sin(wx * l.f2 + l.phase * 1.2) * l.amp2 * 0.4;
  },
  iceberg(wx, l) {
    return -Math.abs(Math.sin(wx * l.f1 + l.phase)) * l.amp1 - Math.abs(Math.sin(wx * l.f2 + l.phase * 1.2)) * l.amp2 * 0.8;
  },
  treeLine(wx, l) {
    return (
      -Math.abs(Math.sin(wx * l.f1 * 3 + l.phase)) * l.amp1 * 0.55 -
      Math.abs(Math.sin(wx * l.f2 * 4 + l.phase)) * l.amp2 * 0.5 -
      Math.sin(wx * l.f1 + l.phase) * l.amp1 * 0.4
    );
  },
  island(wx, l) {
    return -Math.sin(wx * l.f1 + l.phase) * l.amp1 - Math.abs(Math.sin(wx * l.f2 + l.phase)) * l.amp2;
  },
};

/** 通用山形剪影填充 */
function fillRidge(l, cx, W, H) {
  const shape = RIDGE_SHAPES[l.kind] || RIDGE_SHAPES.hills;
  ctx.fillStyle = l.color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) {
    const wx = x + cx * l.parallax;
    ctx.lineTo(x, H * l.y + shape(wx, l));
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// ---------------- 星空 / 极光 ----------------
function drawStarLayer(l, cx, W, H) {
  const rnd = mulberry32(l.seed || 1234);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = l.alpha != null ? l.alpha : 0.8;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < l.count; i++) {
    const rx = rnd();
    const ry = rnd();
    const rr = rnd();
    const sx = wrapX(rx * W - cx * l.parallax, W);
    const sy = ry * H * 0.75;
    ctx.beginPath();
    ctx.arc(sx, sy, rr * l.rMax, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = prev;
}

function drawAurora(a, cx, W) {
  const prev = ctx.globalAlpha;
  ctx.fillStyle = a.color;
  for (let i = 0; i < a.count; i++) {
    const sx = wrapX(i * a.spread - cx * a.parallax, W + 240) - 120;
    const sy = a.y0 + (i % a.rows) * a.rowGap;
    ctx.beginPath();
    ctx.ellipse(sx, sy, a.w + (i % 3) * a.wVar, a.h, 0, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = prev;
}

function drawHaze(hz, W, H) {
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, hz.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

/** 背景总装：天空渐变 → 星空 → 极光 → 天体 → 云 → 雾 → 远山/近丘 */
export function drawBackground(cx, cy) {
  const T = THEMES[store.phys.theme] || THEMES[0];
  const W = view.W;
  const H = view.H;
  const bg = T.bg || {};

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, T.sky[0]);
  g.addColorStop(0.7, T.sky[1]);
  g.addColorStop(1, T.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (const l of bg.starLayers || []) drawStarLayer(l, cx, W, H);
  if (bg.aurora) drawAurora(bg.aurora, cx, W);
  if (bg.celestial) {
    const p = CELESTIAL_PAINTERS[bg.celestial.type];
    if (p) p(bg.celestial, cx, W, H);
  }
  for (const cl of bg.cloudLayers || []) {
    const p = CLOUD_PAINTERS[cl.kind] || CLOUD_PAINTERS.soft;
    p(cl, cx, W, H);
  }
  if (bg.haze) drawHaze(bg.haze, W, H);
  for (const r of bg.ridges || []) fillRidge(r, cx, W, H);
}