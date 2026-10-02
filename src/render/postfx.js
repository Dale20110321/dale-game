// 后处理层（纯视觉）：按场景的色彩分级 + 远景淡化 + 太阳暖浸染 + 暗角 + 天气覆盖
//
// 纪律：
//  · 零逐帧对象分配：离屏画布与天气粒子数组在首次调用时创建并复用
//  · 不改变物理：本模块只读 store，绝不写任何游戏状态（断言：同输入下不同档位轨迹一致）
//  · 画质档位 高/中/低：低档零后处理（最快），缺省为**高**（明显偏弱的设备降为中）
//  · **渲染倍率是独立旋钮**，见 canvas.js；缺省 1×
//  · 所有"太阳在哪"的取值都来自 render/light.js，不在本模块写死坐标
//  · 画质与倍率都持久化到**非存档键**（dale_quality / dale_scale），不碰任何 bike_ 键
//  · prefers-reduced-motion 下关闭天气流动
import { ctx, cv, view, RENDER_SCALES, RENDER_SCALE_LABEL, setRenderScale } from "../core/canvas.js";
import { store } from "../core/store.js";
import { THEMES } from "../config/themes.js";
import { clamp } from "../core/utils.js";
import { token } from "../config/ui-tokens.js";
import { getLight } from "./light.js";

/** 画质档位（三档：低 = 性能最优 / 中 = 增强 / 高 = 光影真实） */
export const QUALITY = ["low", "medium", "high"];
export const QUALITY_LABEL = { low: "低", medium: "中", high: "高" };
/** 持久化键：非 bike_ 前缀（不是存档键，导出/导入不包含它） */
const QKEY = "dale_quality";
/** 渲染倍率的持久化键：同样是非存档键，与画质档互相独立 */
const SKEY = "dale_scale";

/** 天气覆盖（按 THEMES[i].ambient.type 分派） */
const WEATHER_N = 64;
const weather = [];
for (let i = 0; i < WEATHER_N; i++) {
  weather.push({ x: 0, y: 0, s: 0, ph: 0, v: 0, a: 0, d: 0, seed: i / WEATHER_N });
}
let weatherSeeded = false;
let weatherSeededW = 0; // 播种时的视口尺寸：变了就得重播，否则新露出的区域没有粒子
let weatherSeededH = 0;

let quality = "low";
let reduced = false;
let off = null;
let offCtx = null;
let offW = 0;
let offH = 0;
let fade = null;
let fadeHi = null; // 高画质用的更浓顶部淡化渐变
let warmGlow = null; // 高画质太阳暖浸染渐变（光源随镜头移动，位移超阈值就重建）
let warmPosX = NaN; // 建该渐变时的光源屏幕坐标
let warmPosY = NaN;
let vignette = null; // 高画质暗角（渐变只与视口有关，尺寸不变时可复用）
let gradTheme = -1; // 上次建渐变时的场景下标：换场景必须重建（太阳位置/配色都变了）

function lsGet(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch (e) { /* 存储不可用时静默降级 */ }
}

/**
 * 初始化后处理：读持久化档位（缺失时默认最低画质 = 性能最轻），并订阅 reduced-motion。
 * 由 main.js 在首屏调用一次。
 */
export function initPostFx() {
  const saved = lsGet(QKEY);
  // 缺省给"高"：玩家对画面的第一印象就是这一帧，宁可稍重也不要一开场就发平
  // （旧默认值是 low —— 于是雾、坡面光照、投影、暖浸染、暗角全都不执行，
  //  大家看到的第一印象永远是"没开画质"的样子）。
  // 明显偏弱的设备（低并发核数 / 窄屏）回落到"中"，避免首帧就把填充率打满。
  let weak = view.W < 560;
  try {
    const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0;
    if (cores > 0 && cores <= 4) weak = true;
  } catch (e) { /* 环境不支持则按不弱处理 */ }
  quality = QUALITY.includes(saved) ? saved : weak ? "medium" : "high";
  // 渲染倍率：独立于画质档。缺省 1×（与屏幕像素 1:1）——清晰度是"真实感"的一部分，
  // 不该在高分屏上被默认降级；真嫌卡再在设置里手动调省电 0.75× 或锐利 1.25×。
  const savedScale = parseFloat(lsGet(SKEY));
  setRenderScale(Number.isFinite(savedScale) ? savedScale : 1);
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reduced = !!(mq && mq.matches);
      if (mq && typeof mq.addEventListener === "function") {
        mq.addEventListener("change", (e) => { reduced = !!e.matches; });
      }
    }
  } catch (e) { /* 环境不支持则视为不减少动效 */ }
  applyCanvasLook();
  return quality;
}

export function getQuality() { return quality; }

/** 当前渲染倍率（与画质档正交，见 canvas.js 的说明） */
export function getRenderScale() { return view.RS; }

/** 设置渲染倍率：持久化 + 立即重建画布（含离屏后处理层） */
export function setRenderScalePersisted(s) {
  const v = setRenderScale(s);
  lsSet(SKEY, String(v));
  // 离屏层是按旧倍率建的，必须作废重建，否则合成时会拉伸糊掉
  invalidateOff();
  return v;
}

export { RENDER_SCALES, RENDER_SCALE_LABEL };

/** 按档位给 canvas 元素应用 CSS 滤镜：高档更饱和/对比（真实照片感），一档一档肉眼可辨 */
function applyCanvasLook() {
  try {
    if (!cv || !cv.style) return;
    cv.style.filter =
      quality === "high"
        ? "saturate(1.16) contrast(1.12) brightness(1.02)"
        : quality === "medium"
          ? "saturate(1.06) contrast(1.03)"
          : "";
  } catch (e) { /* 不支持滤镜时静默 */ }
}

export function setQuality(q) {
  if (!QUALITY.includes(q)) return quality;
  quality = q;
  lsSet(QKEY, q);
  applyCanvasLook();
  return quality;
}


/** 作废离屏层缓存的渐变（尺寸 / 渲染倍率 / 场景变化后必须重建，否则合成时被拉伸糊掉） */
function invalidateOff() {
  fade = null;
  fadeHi = null;
  warmGlow = null;
  warmPosX = NaN; // 光源位置随之作废，否则重建判断会误以为"位置没变"
  warmPosY = NaN;
  vignette = null;
  gradTheme = -1;
}

/**
 * 复用型离屏画布（尺寸 / 渲染倍率变化时才重建，梯度随之作废）。
 *
 * ★ 离屏层与主画布**同分辨率**（都乘 view.k）：以前离屏只按 CSS px 建，
 *   在 DPR=2 的屏上等于先把效果画在 1/4 分辨率再放大 —— 泛光和暖浸染天生糊。
 *   渐变是按 CSS px 坐标建的，所以这里给离屏设同一个变换，坐标语义保持不变。
 */
function ensureOff(w, h) {
  if (!off) {
    off = document.createElement("canvas");
    offCtx = off.getContext("2d");
  }
  const k = view.k || view.DPR || 1;
  const pw = Math.max(1, Math.round(w * k));
  const ph = Math.max(1, Math.round(h * k));
  if (offW !== pw || offH !== ph) {
    off.width = pw;
    off.height = ph;
    offW = pw;
    offH = ph;
    invalidateOff();
  }
  offCtx.setTransform(k, 0, 0, k, 0, 0);
  return offCtx;
}

/** 场景主色（用于色彩分级）：由 THEMES 数据推导冷暖，不新增数据字段 */
function gradeColor() {
  const th = THEMES[store.phys.theme] || THEMES[0];
  const sun = (th && th.sun) || token("text-hi");
  const r = parseInt(sun.substr(1, 2), 16) || 0;
  const b = parseInt(sun.substr(5, 2), 16) || 0;
  return r >= b ? token("warn") : token("info");
}

/**
 * 天气初始化（首次调用时按当前视口铺开，之后只做边界回绕）。
 *
 * ★ 每颗粒子带一个**景深** d，而不是"同一种亮度的小圆点铺满全屏"。
 *   之前 s 是 0.6~2.2 的随机值、且一律 alpha=1：于是屏幕上是一层密度均匀、
 *   亮度一致、边缘发硬的白点 —— 读起来不像空气里的浮尘，像镜头没擦干净。
 *   现在近的大而略实、远的小而很淡，气氛在、眼睛不用去数它们。
 */
function seedWeather() {
  for (let i = 0; i < WEATHER_N; i++) {
    const p = weather[i];
    p.x = Math.random() * view.W;
    p.y = Math.random() * view.H;
    p.d = 0.2 + Math.random() * 0.8; // 景深：0 = 最远，1 = 最近
    p.s = 0.5 + p.d * 1.2; // 半径随景深
    p.a = 0.1 + p.d * 0.34; // 不透明度随景深（最远 0.10，最近 0.44）
    p.v = 0.4 + Math.random() * 1.4;
    p.ph = Math.random() * 6.283;
  }
  weatherSeededW = view.W;
  weatherSeededH = view.H;
  weatherSeeded = true;
}

function drawWeather(amb, t, dt) {
  if (!amb || amb.type === "none") return;
  const moving = !reduced;
  // 本帧真实时长（秒）。绝不能写死 1/60：drawWeather 跑在**渲染帧**上而不是定步上，
  // 144Hz 屏上会快 2.4 倍。drawScene(dt) 已经把真实 dt 一路传下来了。
  const dtSec = dt;
  // n 必须夹到 WEATHER_N：weather 是定长 64 的池子，而 rate 夹到 1 后
  // 64×1×1.4 = 90 会越界读出 undefined。目前 12 个场景最大 rate=0.7 才侥幸没炸，
  // 但任何一个场景把 rate 调到 0.72 以上就会在绘制里抛异常。
  const n = Math.min(WEATHER_N, Math.round(WEATHER_N * clamp(amb.rate, 0, 1) * 1.4));
  ctx.fillStyle = amb.color;
  ctx.strokeStyle = amb.color;
  for (let i = 0; i < n; i++) {
    const p = weather[i];
    // 摆动幅度按景深缩放：远处的微粒在屏幕上本来就几乎不动，全屏同幅度地飘
    // 会变成一层"始终在动"的噪点（用户反馈：光点一直飘来飘去）。
    const sw = p.d * 0.45;
    if (moving) {
      if (amb.type === "snow") { p.y += p.v * amb.spd * 40 * dtSec * 2; p.x += Math.sin(t + p.ph) * 0.3 * sw * 2; }
      else if (amb.type === "rain") { p.y += p.v * 220 * dtSec * 2; p.x -= p.v * 30 * dtSec * 2; }
      else if (amb.type === "sand") { p.x -= p.v * 160 * dtSec * 2; p.y += Math.sin(t + p.ph) * 0.2 * sw * 2; }
      else if (amb.type === "ember") { p.y -= p.v * 40 * dtSec * 2; p.x += Math.sin(t * 1.3 + p.ph) * 0.5 * sw * 2; }
      else if (amb.type === "pollen") { p.x += Math.cos(t * 0.6 + p.ph) * 0.5 * sw * 2; p.y += Math.sin(t * 0.7 + p.ph) * 0.4 * sw * 2; }
      else if (amb.type === "mist") { p.x += p.v * 10 * dtSec; }
      // dust（城市废墟）：被风推着横向飘的浮尘。之前这里没有分支，
      // 于是 dust 落到最后那个"画圆点"的兜底里 —— 粒子照画、但**永远不动**，
      // rate/spd 全被静默忽略。
      else if (amb.type === "dust") { p.x += p.v * 90 * amb.spd * dtSec; p.y += Math.sin(t * 0.5 + p.ph) * 0.25 * sw * 2; }
    }
    if (p.x < -10) p.x = view.W + 10;
    if (p.x > view.W + 10) p.x = -10;
    if (p.y < -10) p.y = view.H + 10;
    if (p.y > view.H + 10) p.y = -10;

    // 每颗粒子按自己的景深取不透明度（原来一律 alpha=1，于是是一层发硬的白点）
    if (amb.type === "rain") {
      ctx.globalAlpha = p.a * 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 2 - p.s, p.y + 8 + p.s * 4);
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (amb.type === "mist") {
      ctx.globalAlpha = 0.05 + p.s * 0.04;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 60 + p.s * 30, 12 + p.s * 4, 0, 0, 7);
      ctx.fill();
    } else {
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, 7);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * 应用后处理（在 scene.js 的世界绘制之后、HUD 之前调用）。
 * 档位：
 *   · 低：不叠加任何全屏后处理（最快）
 *   · 中：极轻的色彩分级 + 顶部淡化 + 天气粒子
 *   · 高：正常分级/淡化（更真实的大气感）+ 太阳暖浸染 + 暗角 + 天气粒子
 * @param {number} t 秒级时间（用于天气相位）
 */
export function applyPostFx(t, dt = 1 / 60) {
  if (store.state !== "play") return;
  // 低画质：零后处理（干净、最快）
  if (quality === "low") return;
  const W = view.W;
  const H = view.H;
  // 换场景 → 重建渐变（太阳位置、暖光色、远景淡化的深浅都随场景变）
  if (store.phys.theme !== gradTheme) invalidateOff();
  gradTheme = store.phys.theme;
  const oc = ensureOff(W, H);

  // 清空离屏叠加层：下面各项都是半透明，不清空会跨帧累积
  oc.clearRect(0, 0, W, H);

  // 按档位取强度：中档偏轻，高档更浓（但仍克制，避免发灰/过曝）
  const isHi = quality === "high";

  // 1) 按场景的色彩分级（暖冷偏移）——压到极低，避免浅色天空/云被染出偏黄、破坏亮度统一
  oc.globalAlpha = isHi ? 0.02 : 0.015;
  oc.fillStyle = gradeColor();
  oc.fillRect(0, 0, W, H);
  oc.globalAlpha = 1;

  // 2) 远景淡化（顶部天空渐变，增强大气透视）
  if (!isHi && !fade) {
    fade = oc.createLinearGradient(0, 0, 0, H * 0.45);
    fade.addColorStop(0, token("fx-fade-top"));
    fade.addColorStop(1, token("fx-none-dark"));
  } else if (isHi && !fadeHi) {
    fadeHi = oc.createLinearGradient(0, 0, 0, H * 0.55);
    fadeHi.addColorStop(0, token("fx-fade-hi-top"));
    fadeHi.addColorStop(1, token("fx-none-dark"));
  }
  oc.fillStyle = isHi ? (fadeHi || fade) : fade;
  oc.fillRect(0, 0, W, H * (isHi ? 0.55 : 0.45));

  // 3) 高画质：太阳暖色浸染（光线从太阳侧洒落，制造"阳光感"）
  //    圆心取自 light.js 的天体位置 —— 与天空里的太阳、背景的地平线辉光、
  //    地表坡面的受光方向同源，四处不再各说各话。
  if (isHi) {
    const L = getLight();
    const sx = L.x; // 已是屏幕坐标（含视差与包裹），不要再乘 W
    const sy = L.y;
    // ★ 光源现在**随镜头移动**（视差场景），所以这个渐变不能再只建一次：
    //   缓存会钉在旧位置，辉光就与太阳分家了。按位移阈值重建 ——
    //   9 个 parallax=0 的场景光源是静止的，永远不会触发重建，仍是零逐帧分配。
    if (!warmGlow || Math.abs(sx - warmPosX) > 2 || Math.abs(sy - warmPosY) > 2) {
      warmPosX = sx;
      warmPosY = sy;
      warmGlow = oc.createRadialGradient(sx, sy, H * 0.05, sx, sy, H * 0.5);
      warmGlow.addColorStop(0, token("fx-sun-warm"));
      warmGlow.addColorStop(1, token("fx-sun-none"));
    }
    oc.fillStyle = warmGlow;
    oc.globalAlpha = 0.7; // 高画质：明显的日光浸染（中性香槟色，不偏黄）
    oc.fillRect(sx - H * 0.5, sy - H * 0.5, H, H);
    oc.globalAlpha = 1;
  }

  // 4) 高画质：暗角（vignette）——把注意力收回画面中心，是"照片感"最省力的一味。
  //    必须是**全屏**的：这里曾经有过一版"给 HUD 挖椭圆保护区"的写法，
  //    在左上角留下一块发白偏灰的孤立区域（宽半屏、高屏 19%），已整体移除。
  if (isHi) {
    if (!vignette) {
      vignette = oc.createRadialGradient(
        W * 0.5, H * 0.5, Math.min(W, H) * 0.3,
        W * 0.5, H * 0.5, Math.max(W, H) * 0.76
      );
      vignette.addColorStop(0, token("fx-none-dark"));
      vignette.addColorStop(1, token("fx-vignette"));
    }
    oc.fillStyle = vignette;
    oc.fillRect(0, 0, W, H);
  }

  // 叠加回主画布：**不要**重置变换。
  // ★ 原实现是 setTransform(1,0,0,1,0,0) + drawImage(off,0,0)：identity 意味着
  //   绘制坐标是**设备像素**，而离屏层是按 CSS px 建的（W×H）。于是 DPR=2 时
  //   整层后处理只落在屏幕左上角 1/4 区域 —— 色彩分级、远景淡化、太阳辉光
  //   在高分屏/手机上等于"只在角落生效"。现在离屏与主画布同分辨率，
  //   按 CSS px 目标尺寸贴回即可铺满。
  ctx.drawImage(off, 0, 0, W, H);

  // 5) 天气覆盖（中 / 高档都有，数据来自 THEMES[i].ambient）
  //    同样**不重置变换**：粒子的 x/y 是按 view.W/H（CSS px）种子的，
  //    在 identity 下会被塞进屏幕左上角。
  const th = THEMES[store.phys.theme] || THEMES[0];
  if (th && th.ambient) {
    // 视口变了就得重播：粒子坐标是按旧尺寸铺的。
  //  · 视口变大 → 新露出的那条区域里一颗粒子都没有，而且 pollen/snow/ember
  //    的摆动是围绕原位置的往复（净漂移≈0），**永远不会自己回来**；
  //  · 视口变小 → 越界的粒子会在同一帧被搬到 x=-10，然后钉在左边缘成一条直线。
  if (!weatherSeeded || weatherSeededW !== view.W || weatherSeededH !== view.H) seedWeather();
    ctx.save();
    drawWeather(th.ambient, t || 0, dt);
    ctx.restore();
  }
}
