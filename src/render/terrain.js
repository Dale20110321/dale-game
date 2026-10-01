// 地形渲染：地表填充 + 阴影 + 数据驱动的地表纹理（THEMES[i].surface）
// 纹理绘制函数只做视觉，不含物理依赖，也不含"按主题下标分支"的硬编码。
import { token } from "../config/ui-tokens.js";
import { ctx, view } from "../core/canvas.js";
import { THEMES } from "../config/themes.js";
import { store } from "../core/store.js";
import { groundY } from "../physics/terrain.js";
import { clamp } from "../core/utils.js";
import { getQuality } from "./postfx.js";
import { getLight } from "./light.js";

/** 遍历可见地表采样点，回调 (screenX, screenGY, worldX) */
function eachGround(cx, cy, step, fn) {
  for (let x = 0; x <= view.W; x += step) {
    const wx = x + cx;
    const gy = groundY(wx);
    if (gy === Infinity) continue;
    fn(x, gy - cy, wx);
  }
}

// ---------------- 地表纹理注册表（12 种） ----------------
const SURFACE_PAINTERS = {
  // 草叶
  grass(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    // 间距 12→20px、高 4~11→3~8px、倾角 2.5→1.6px：原参数沿地表织出一条密集的浅色
    // "栅栏"，和真石头混在一起被读成"路中间一排障碍"，是"石头过不去"错觉的一大来源。
    eachGround(cx, cy, 20, (x, gy, wx) => {
      const h = 3 + Math.abs(Math.sin(wx * 0.37)) * 5;
      ctx.beginPath();
      ctx.moveTo(x, gy - 1);
      ctx.lineTo(x + 1.6, gy - 1 - h);
      ctx.stroke();
    });
  },
  // 雪团
  snowpuff(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 14, (x, gy) => {
      ctx.beginPath();
      ctx.ellipse(x, gy - 4, 9, 3.5, 0, 0, 7);
      ctx.fill();
    });
    if (s.color2) {
      ctx.fillStyle = s.color2;
      eachGround(cx, cy, 24, (x, gy, wx) => {
        const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
        ctx.beginPath();
        ctx.arc(x + 6, gy - 8, r, 0, 7);
        ctx.fill();
      });
    }
  },
  // 沙纹
  sandripple(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    eachGround(cx, cy, 18, (x, gy) => {
      ctx.beginPath();
      ctx.moveTo(x, gy + 8);
      ctx.quadraticCurveTo(x + 9, gy + 4, x + 18, gy + 9);
      ctx.stroke();
    });
  },
  // 月坑
  crater(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 22, (x, gy, wx) => {
      const r = 3 + Math.abs(Math.sin(wx * 0.21)) * 5;
      ctx.beginPath();
      ctx.ellipse(x, gy + 10, r, r * 0.4, 0, 0, 7);
      ctx.fill();
    });
  },
  // 苔藓丛
  moss(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 10, (x, gy, wx) => {
      const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
      ctx.beginPath();
      ctx.arc(x, gy - 2, r, Math.PI, 0);
      ctx.fill();
    });
  },
  // 熔岩缝
  lava(s, cx, cy) {
    ctx.strokeStyle = s.color2 || s.color;
    ctx.lineWidth = 2.5;
    eachGround(cx, cy, 20, (x, gy, wx) => {
      const d = 8 + Math.abs(Math.sin(wx * 0.3)) * 16;
      ctx.beginPath();
      ctx.moveTo(x, gy - 1);
      ctx.lineTo(x + 4, gy + d * 0.5);
      ctx.lineTo(x - 2, gy + d);
      ctx.stroke();
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 34, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.6)) * 3;
      ctx.beginPath();
      ctx.arc(x, gy - 2, r, 0, 7);
      ctx.fill();
    });
  },
  // 霜晶
  frost(s, cx, cy) {
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 12, (x, gy, wx) => {
      if (Math.abs(Math.sin(wx * 0.9)) < 0.5) return;
      ctx.fillRect(x, gy - 3, 5, 3);
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 18, (x, gy, wx) => {
      const r = 1.6 + Math.abs(Math.sin(wx * 0.7)) * 2;
      ctx.beginPath();
      ctx.arc(x + 4, gy - 8, r, 0, 7);
      ctx.fill();
    });
  },
  // 层岩
  strata(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    for (let dy = 12; dy <= 48; dy += 12) {
      ctx.beginPath();
      for (let x = 0; x <= view.W; x += 10) {
        const gy = groundY(x + cx);
        if (gy === Infinity) continue;
        ctx.lineTo(x, gy - cy + dy + Math.sin((x + cx) * 0.02 + dy) * 2);
      }
      ctx.stroke();
    }
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 20, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.4)) * 3;
      ctx.beginPath();
      ctx.arc(x, gy - 3, r, 0, 7);
      ctx.fill();
    });
  },
  // 水洼
  puddle(s, cx, cy) {
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 30, (x, gy, wx) => {
      const r = 8 + Math.abs(Math.sin(wx * 0.25)) * 8;
      ctx.beginPath();
      ctx.ellipse(x, gy - 1, r, 2.5, 0, 0, 7);
      ctx.fill();
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 22, (x, gy) => {
      ctx.beginPath();
      ctx.ellipse(x + 4, gy + 12, 6, 2, 0, 0, 7);
      ctx.fill();
    });
  },
  // 碎屑
  debris(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 14, (x, gy, wx) => {
      const w = 3 + Math.abs(Math.sin(wx * 0.6)) * 5;
      ctx.fillRect(x, gy - 4, w, 4);
    });
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 26, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.35)) * 3;
      ctx.beginPath();
      ctx.ellipse(x, gy + 10, r, r * 0.5, 0, 0, 7);
      ctx.fill();
    });
  },
  // 云絮
  cloudtuft(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 16, (x, gy, wx) => {
      const r = 6 + Math.abs(Math.sin(wx * 0.3)) * 7;
      ctx.beginPath();
      ctx.arc(x, gy - 5, r, 0, 7);
      ctx.fill();
    });
    if (s.color2) {
      ctx.fillStyle = s.color2;
      eachGround(cx, cy, 26, (x, gy, wx) => {
        const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
        ctx.beginPath();
        ctx.arc(x + 8, gy - 10, r, 0, 7);
        ctx.fill();
      });
    }
  },
  // 冰辉
  iceglow(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 16, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.55)) * 3.5;
      ctx.beginPath();
      ctx.arc(x, gy - 3, r, 0, 7);
      ctx.fill();
    });
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 22, (x, gy, wx) => {
      const r = 1.5 + Math.abs(Math.sin(wx * 0.8)) * 2.5;
      ctx.beginPath();
      ctx.arc(x + 6, gy - 9, r, 0, 7);
      ctx.fill();
    });
  },
};

/**
 * 每帧的地面高度采样缓存（屏幕 x 步长 8px，与三趟主体循环一致）。
 *
 * ★ 原本"主体 / 表层线 / 地表下方阴影"是三趟各自独立的 `x += 8` 循环，
 *   每趟都重算同一批 groundY()，同一批 x 被算了两遍。这三趟共用一份缓存后，
 *   地面采样量降到约 1/3，且**数值逐位相同**（不是插值近似，渲染结果不变）。
 */
const GS = 8;
const gBuf = new Float64Array(4096);
const gOk = new Uint8Array(4096);
/** 逐段受光值（-1 背光 … +1 受光），模块级复用 → 逐帧零分配 */
const lBuf = new Float64Array(4096);

/** 作废缓存：相机逐帧移动，所以每帧开头调一次即可 */
function invalidateGround() {
  gOk.fill(0);
}
/** 填好当前相机位置下的地面高度，返回有效采样点数 */
function groundBuf(cx) {
  const n = Math.min(4096, (Math.ceil(view.W / GS) + 2) | 0);
  for (let i = 0; i < n; i++) {
    if (!gOk[i]) {
      gBuf[i] = groundY(cx + i * GS);
      gOk[i] = 1;
    }
  }
  return n;
}

export function drawTerrain(cx, cy) {
  const W = view.W;
  const H = view.H;
  const T = THEMES[store.phys.theme] || THEMES[0];
  const pal = T.pal;
  invalidateGround();
  const n = groundBuf(cx);
  void n;

  // 主体
  ctx.fillStyle = pal[0];
  ctx.beginPath();
  ctx.moveTo(0, cy);
  let lastG = cy;
  for (let i = 0, x = 0; x <= W; x += GS, i++) {
    const gy = gBuf[i];
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

  // 表层线
  ctx.fillStyle = pal[1];
  ctx.strokeStyle = pal[1];
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let i = 0, x = 0; x <= W; x += GS, i++) {
    const gy = gBuf[i];
    if (gy === Infinity) continue;
    ctx.lineTo(x, gy - cy - 8);
  }
  ctx.stroke();

  // 地表下方阴影
  ctx.fillStyle = token("fx-shadow-faint");
  ctx.beginPath();
  ctx.moveTo(0, cy);
  for (let i = 0, x = 0; x <= W; x += GS, i++) {
    const gy = gBuf[i];
    if (gy === Infinity) ctx.lineTo(x, lastG);
    else ctx.lineTo(x, Math.min(gy + 40, cy + H) - cy);
  }
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // 数据驱动的地表纹理
  const sp = T.surface && SURFACE_PAINTERS[T.surface.type];
  if (sp) sp(T.surface, cx, cy);

  // —— 坡面光照（中档轻、高档强）——
  // 受光判据 = 坡面法线与"来自光源那一侧"的水平分量做内积：t = -m · side
  //   t > 0 → 坡面朝向光源，打暖白；t < 0 → 背光，打冷暗；t = 0（平地）不着色。
  // side 来自 light.js（天体在哪半边就往哪边照），所以 9 个天体在右的场景
  // 与 3 个天体在左的场景，光方向自动各自成立，不再是一律"从左上"。
  const q = getQuality();
  if (q !== "low") {
    const isHi = q === "high";
    const L = getLight();
    const gain = isHi ? 1.5 : 0.7;      // 坡度 → 受光强度的增益
    const depth = isHi ? 170 : 95;     // 明暗向下渐隐的距离（越短越"贴地"）
    const maxA = isHi ? 0.4 : 0.15;    // 单段最大不透明度
    const segs = Math.ceil(W / GS) + 1;

    // 逐段坡度 → 受光值
    for (let i = 0; i < segs; i++) {
      const a0 = gBuf[i];
      const b0 = gBuf[i + 1];
      if (a0 === Infinity || b0 === Infinity) { lBuf[i] = 0; continue; }
      lBuf[i] = clamp((-(b0 - a0) / GS) * L.side * gain, -1, 1);
    }

    // 渐变在世界坐标里建一次，逐段只用 globalAlpha 调深浅：
    // 既避免了"每段 new 一个渐变"的逐帧分配，又比纯平涂多一层向下的柔和过渡。
    const gLit = ctx.createLinearGradient(0, 0, 0, depth);
    gLit.addColorStop(0, token("fx-lit-top"));
    gLit.addColorStop(1, token("fx-sun-none"));
    const gShd = ctx.createLinearGradient(0, 0, 0, depth);
    gShd.addColorStop(0, token("fx-shade-top"));
    gShd.addColorStop(1, token("fx-none-dark"));

    // ★ 画的是**贴地四边形**（上边贴着地表线、下边渐隐），不是矩形。
    //   旧实现是从地表一路 fillRect 到屏幕底 —— 明暗不随地形起伏、在坡上会浮成
    //   一根根硬边竖条，是"低多边形"观感的直接来源。
    //   相邻段共用同一条边（x1 = 下一段的 x0），不留缝也不重叠。
    ctx.save();
    for (let i = 0; i < segs; i++) {
      const v = lBuf[i];
      const a = Math.abs(v) * maxA;
      const g0 = gBuf[i];
      if (a < 0.012 || g0 === Infinity) continue;
      const g1 = gBuf[i + 1];
      const x0 = i * GS;
      const x1 = Math.min(x0 + GS, W);
      if (x1 <= x0) continue;
      const y0 = g0 - cy;
      const dy = g1 === Infinity ? 0 : g1 - cy - y0;
      // 平移到本段左上角，让共用的渐变从**这一段的地面**开始往下淡
      ctx.translate(x0, y0);
      ctx.globalAlpha = a;
      ctx.fillStyle = v > 0 ? gLit : gShd;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(x1 - x0, dy);
      ctx.lineTo(x1 - x0, dy + depth);
      ctx.lineTo(0, depth);
      ctx.closePath();
      ctx.fill();
      ctx.translate(-x0, -y0);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // —— 整片地面的受光提亮（高档）——
    // 单次 fill 的连续多边形。旧实现是"每 20px 画一个 24px 宽的矩形"，
    // 相邻矩形在 4px 重叠区被二次叠加，地面因此浮出一条条竖直亮带。
    if (isHi) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = token("fx-lit-top");
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0, x = 0; x <= W; x += GS, i++) {
        const gy = gBuf[i];
        ctx.lineTo(x, gy === Infinity ? H : gy - cy);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}