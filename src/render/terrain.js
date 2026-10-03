// 地形渲染：地表填充 + 阴影 + 数据驱动的地表纹理（THEMES[i].surface）
// 纹理绘制函数只做视觉，不含物理依赖，也不含"按主题下标分支"的硬编码。
import { token } from "../config/ui-tokens.js";
import { ctx, view } from "../core/canvas.js";
import { THEMES } from "../config/themes.js";
import { store, bike } from "../core/store.js";
import { groundY } from "../physics/terrain.js";
import { bikeVx } from "../physics/bike.js";
import { clamp } from "../core/utils.js";
import { CRUISE_V } from "../config/constants.js";
import { getQuality } from "./postfx.js";
import { getLight } from "./light.js";
import { worldView } from "./camera.js";

/**
 * 遍历可见地表采样点，回调 (localX, localGY, worldX)。
 *
 * ★ localX 是**世界坐标系的局部 x**（ctx 已 scale(zoom)），与旧的 view.W 循环不同：
 *   可视范围是世界宽度 w = view.W / zoom，不是屏幕宽度 view.W。
 *   相机在高速时会主动缩到 0.42（见 camZoomOf），按旧写法右半屏会完全空着。
 */
function eachGround(cx, cy, step, fn) {
  const w = view.W / zoomNow();
  for (let x = 0; x <= w; x += step) {
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
    const w = view.W / zoomNow();
    for (let dy = 12; dy <= 48; dy += 12) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 10) {
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
/**
 * 采样缓冲容量。
 *
 * ★ 从固定 2048 改为**按可见世界宽度动态扩容**：
 *   采样跨度 = view.W / zoom，而 camZoomOf 在高速下会把 zoom 放到极小。
 *   固定 2048 段只覆盖 2048×8 = 16,384px 的世界宽度，即 zoom < 0.156 时
 *   右半屏整片空白（groundBuf 里 Math.min(GBUF_N, …) 静默截断，
 *   drawTerrain 的循环又在 n 处停下 —— 是硬截断，不是插值误差）。
 *   实测（view.W=2560）：50,000 km/h 就已经截断，10 万 km/h 需要 4,941 段，
 *   满级无相（771,605 km/h，zoom 8.4e-4）需要 **381,042 段**。
 *
 * ★ 但**不必**真按这个数分配内存：高速时已经切到巡航色带层（见 drawCruiseBands），
 *   它只需要 CRUISE_BANDS+1 个采样点，与视��宽度无关。
 *   所以上限取 16,384 段（= 131,072px 可见宽度，≈ 250,000 km/h）已经够用 ——
 *   超过这个速度早就进巡航层，不会走 dense 路径。
 *   容量按需翻倍（2048 → 4096 → …），只在高速时增长，常驻内存最大
 *   (8+8+1) × 16384 ≈ 278KB。
 */
const GBUF_MIN = 2048;
const GBUF_MAX = 16384;
let GBUF_N = GBUF_MIN;
const gBuf = new Float64Array(GBUF_MAX);
const gOk = new Uint8Array(GBUF_MAX);
/** 逐段受光值（-1 背光 … +1 受光），模块级复用 → 逐帧零分配 */
const lBuf = new Float64Array(GBUF_MAX);

/** 按当前可见世界宽度扩容采样缓冲（幂等：够大就直接返回） */
function ensureGBuf(need) {
  if (need <= GBUF_N) return;
  let cap = GBUF_N;
  while (cap < need && cap < GBUF_MAX) cap *= 2;
  GBUF_N = Math.min(cap, GBUF_MAX);
}
/**
 * 高速巡航色带（R10.1）：地形降采样为水平色带。
 *
 * 把可视宽度切成 CRUISE_BANDS 条，每条取 3 个采样点的**中位数**画一条水平矩形，
 * 并按带的高低在三档配色间取色 —— 玩家看到的是随地形起伏滚动的宽色带，
 * 而不是高频锯齿（10 万 km/h 时一屏横跨上千个百 px 级起伏，8px 折线画出来是摩尔纹）。
 *
 * ★ **不依赖 gBuf**：采样点数与可视宽度无关，所以即使 GBUF 被截断也能画全屏 ——
 *   这正是"高速下右半屏空白"的根因（dense 缓冲按屏幕宽度展开），
 *   而巡航层天生只需 3×CRUISE_BANDS 个点。
 */
/**
 * 巡航层阈值（px/s）= 3600 km/h：超过就改画色带而不再画逐点地形。
 *
 * ★ 定义放在 config/constants.js（由这里 import）而不是就地导出：
 *   game/world.js 的 buildChunk 也要用它决定"要不要生成装饰"，而 game → render
 *   是反向依赖（game 在 render 之上）。两边都 import config 才是干净的。
 */
const CRUISE_BANDS = 26;      // 色带条数（屏幕纵向可分辨的上限）
const CRUISE_BAND_PX = 46;    // 每条带的屏幕高度（px）

function drawCruiseBands(cx, cy, W, H, pal) {
  // 先铺满整屏底色，防止条带之间露出上方的天空
  ctx.fillStyle = pal[0];
  ctx.fillRect(0, 0, W, H);
  const bandW = W / CRUISE_BANDS;
  for (let b = 0; b < CRUISE_BANDS; b++) {
    // 带内取 3 点（首/中/尾）求中位数：对单点尖峰（断层）不敏感，
    // 又比平均值更少受噪声影响
    const a = [], x0 = b * bandW;
    for (const f of [0.15, 0.5, 0.85]) {
      const gy = groundY(cx + x0 + bandW * f);
      if (gy !== Infinity) a.push(gy);
    }
    if (!a.length) continue;
    a.sort((p, q) => p - q);
    const gy = a[a.length >> 1] - cy;
    // 按高度在三档色里取：越高越亮（受光），越低越暗（背光）
    const t = Math.max(0, Math.min(1, (gy + H * 0.5) / (H * 1.5)));
    ctx.fillStyle = t > 0.62 ? pal[1] : t > 0.34 ? pal[0] : pal[2] || pal[0];
    ctx.fillRect(x0, gy, bandW + 1, CRUISE_BAND_PX);
  }
  // 顶部一条亮线：代替常规模式的地表线，给出"地面在哪"的唯一参照
  ctx.fillStyle = token("fx-lit-top");
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 0, W, 2);
  ctx.globalAlpha = 1;
}

/** 当前渲染缩放（防御性：zoom 非法时按 1 处理，避免除出 Infinity） */
function zoomNow() {
  const z = store.cam.zoom;
  return z > 0.01 ? z : 1;
}

/** 作废缓存：相机逐帧移动，所以每帧开头调一次即可。
 *  ★ 只清**上一帧真正用过的**那一段 —— gOk 现在有 65,536 槽（为高速预留），
 *   每帧全量 fill(0) 是 64KB 的无谓写入，60fps 下就是 3.8MB/s 的纯浪费。 */
let gUsed = 0;
function invalidateGround() {
  gOk.fill(0, 0, gUsed);
}
/** 填好当前相机位置下的地面高度，返回有效采样点数 */
function groundBuf(cx) {
  const need = (Math.ceil(view.W / zoomNow() / GS) + 2) | 0;
  ensureGBuf(need);
  const n = Math.min(GBUF_N, need);
  for (let i = 0; i < n; i++) {
    if (!gOk[i]) {
      gBuf[i] = groundY(cx + i * GS);
      gOk[i] = 1;
    }
  }
  if (n > gUsed) gUsed = n; // 记录本帧用到的长度，供下一帧的 invalidateGround 精确清理
  return n;
}

export function drawTerrain(cx, cy) {
  // ★ W/H 是**世界**尺寸：绘制发生在 ctx.scale(zoom) 之内，
  //   可视世界范围 = view.W / zoom。沿用屏幕尺寸会让缩放 < 1 时右半屏空着。
  const W = view.W / zoomNow();
  const H = view.H / zoomNow();
  const T = THEMES[store.phys.theme] || THEMES[0];
  const pal = T.pal;

  // ★ 高速巡航表现层（R10.1）：车速超过 CRUISE_V 后地形降采样成色带。
  //
  //   为什么需要：10 万 km/h 时可见世界宽度达 39km，而地形特征尺度是百 px
  //   量级 —— 一屏之内横跨上千个起伏，8px 步长的折线画出来是一团高频锯齿
  //   （摩尔纹），既看不出地形也拖慢 fill。
  //   ★ 判定放在 groundBuf **之前**：巡航层不需要 dense 采样，
  //     在那种缩放下 dense 路径要么被截断、要么白算几万次 groundY。
  if (Math.abs(bikeVx()) > CRUISE_V) {
    drawCruiseBands(cx, cy, W, H, pal);
    return;
  }

  invalidateGround();
  const n = groundBuf(cx);

  // 主体
  ctx.fillStyle = pal[0];
  ctx.beginPath();
  ctx.moveTo(0, cy);
  let lastG = cy;
  for (let i = 0, x = 0; x <= W && i < n; x += GS, i++) {
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
  for (let i = 0, x = 0; x <= W && i < n; x += GS, i++) {
    const gy = gBuf[i];
    if (gy === Infinity) continue;
    ctx.lineTo(x, gy - cy - 8);
  }
  ctx.stroke();

  // 地表下方阴影
  ctx.fillStyle = token("fx-shadow-faint");
  ctx.beginPath();
  ctx.moveTo(0, cy);
  for (let i = 0, x = 0; x <= W && i < n; x += GS, i++) {
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
    // ★ segs 必须夹到采样点数以内：下面两趟都要读 gBuf[i + 1]，
    //   而 W 已是世界宽度（高速时是屏幕宽的 2.4 倍），不夹就会越界读到陈旧数据。
    const segs = Math.min(n - 1, Math.ceil(W / GS) + 1);

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
      for (let i = 0, x = 0; x <= W && i < n; x += GS, i++) {
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
