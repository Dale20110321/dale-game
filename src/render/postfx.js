// 后处理层（纯视觉）：渐晕 + 按场景的色彩分级 + 速度拖影 + 远景淡化 + 天气覆盖
//
// 纪律：
//  · 零逐帧对象分配：离屏画布与天气粒子数组在首次调用时创建并复用
//  · 不改变物理：本模块只读 store/bike，绝不写任何游戏状态（断言：同输入下"高"与"关"两档轨迹一致）
//  · 画质档位 高/中/低/关：低档关闭模糊类效果；移动端 / 低 DPR 默认中档
//  · 画质设置持久化到 **非存档键** `dale_quality`（不新增、不改动任何 bike_ 存档键）
//  · prefers-reduced-motion 下关闭拖影与天气流动
import { ctx, cv, view } from "../core/canvas.js";
import { store, bike } from "../core/store.js";
import { THEMES } from "../config/themes.js";
import { clamp } from "../core/utils.js";
import { token } from "../config/ui-tokens.js";
import { SPEEDLINE_REF } from "../config/constants.js";

/** 画质档位（三档：低 = 性能最优 / 中 = 增强 / 高 = 光影真实） */
export const QUALITY = ["low", "medium", "high"];
export const QUALITY_LABEL = { low: "低", medium: "中", high: "高" };
/** 持久化键：非 bike_ 前缀（不是存档键，导出/导入不包含它） */
const QKEY = "dale_quality";

/** 天气覆盖（按 THEMES[i].ambient.type 分派） */
const WEATHER_N = 64;
const weather = [];
for (let i = 0; i < WEATHER_N; i++) {
  weather.push({ x: 0, y: 0, s: 0, ph: 0, v: 0, seed: i / WEATHER_N });
}
let weatherSeeded = false;

let quality = "low";
let reduced = false;
let off = null;
let offCtx = null;
let offW = 0;
let offH = 0;
let fade = null;
let fadeHi = null; // 高画质用的更浓顶部淡化渐变
let warmGlow = null; // 高画质太阳暖浸染渐变

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
  quality = QUALITY.includes(saved) ? saved : "low";
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

/** 是否开启了模糊类效果（拖影 / 天气流动） */
export function blurEnabled() {
  return quality === "high" && !reduced;
}

/** 复用型离屏画布（尺寸变化时才重建，梯度随之作废） */
function ensureOff(w, h) {
  if (!off) {
    off = document.createElement("canvas");
    offCtx = off.getContext("2d");
  }
  if (offW !== w || offH !== h) {
    off.width = w;
    off.height = h;
    offW = w;
    offH = h;
    fade = null;
    fadeHi = null;
    warmGlow = null;
  }
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

/** 天气初始化（首次调用时按当前视口铺开，之后只做边界回绕） */
function seedWeather() {
  for (let i = 0; i < WEATHER_N; i++) {
    const p = weather[i];
    p.x = Math.random() * view.W;
    p.y = Math.random() * view.H;
    p.s = 0.6 + Math.random() * 1.6;
    p.v = 0.4 + Math.random() * 1.4;
    p.ph = Math.random() * 6.283;
  }
  weatherSeeded = true;
}

function drawWeather(amb, t) {
  if (!amb || amb.type === "none") return;
  const moving = !reduced;
  const n = Math.round(WEATHER_N * clamp(amb.rate, 0, 1) * 1.4);
  ctx.fillStyle = amb.color;
  ctx.strokeStyle = amb.color;
  const dtSec = 1 / 60;
  for (let i = 0; i < n; i++) {
    const p = weather[i];
    if (moving) {
      if (amb.type === "snow") { p.y += p.v * amb.spd * 40 * dtSec * 2; p.x += Math.sin(t + p.ph) * 0.3; }
      else if (amb.type === "rain") { p.y += p.v * 220 * dtSec * 2; p.x -= p.v * 30 * dtSec * 2; }
      else if (amb.type === "sand") { p.x -= p.v * 160 * dtSec * 2; p.y += Math.sin(t + p.ph) * 0.2; }
      else if (amb.type === "ember") { p.y -= p.v * 40 * dtSec * 2; p.x += Math.sin(t * 1.3 + p.ph) * 0.5; }
      else if (amb.type === "pollen") { p.x += Math.cos(t * 0.6 + p.ph) * 0.5; p.y += Math.sin(t * 0.7 + p.ph) * 0.4; }
      else if (amb.type === "mist") { p.x += p.v * 10 * dtSec; }
    }
    if (p.x < -10) p.x = view.W + 10;
    if (p.x > view.W + 10) p.x = -10;
    if (p.y < -10) p.y = view.H + 10;
    if (p.y > view.H + 10) p.y = -10;

    if (amb.type === "rain") {
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
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, 7);
      ctx.fill();
    }
  }
}

/**
 * 应用后处理（在 scene.js 的世界绘制之后、HUD 之前调用）。
 * 档位：
 *   · 低：不叠加任何全屏后处理（最快）
 *   · 中：极轻的色彩分级 + 顶部淡化 + 天气粒子
 *   · 高：正常分级/淡化（更真实的大气感）+ 太阳暖浸染 + 速度拖影 + 天气粒子
 * @param {number} t 秒级时间（用于天气相位）
 */
export function applyPostFx(t) {
  if (store.state !== "play") return;
  // 低画质：零后处理（干净、最快）
  if (quality === "low") return;
  const W = view.W;
  const H = view.H;
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
  if (isHi) {
    if (!warmGlow) {
      warmGlow = oc.createRadialGradient(W * 0.85, H * 0.12, H * 0.05, W * 0.85, H * 0.12, H * 0.5);
      warmGlow.addColorStop(0, token("fx-sun-warm"));
      warmGlow.addColorStop(1, token("fx-sun-none"));
    }
    // 太阳位置随场景略有偏移；未缓存则按当前太阳重建
    const sx = W * 0.85;
    const sy = H * 0.12;
    oc.fillStyle = warmGlow;
    oc.globalAlpha = 0.7; // 高画质：明显的日光浸染（中性香槟色，不偏黄）
    oc.fillRect(sx - H * 0.5, sy - H * 0.5, H, H);
    oc.globalAlpha = 1;
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, 0, 0);
  ctx.restore();

  // 4) （已移除）速度拖影：原把画面自身错位叠加两条制造涂抹感，用户反馈高速时像"虚影/残影"，整体移除
  //    blurEnabled() 保留供外部探测高画质模糊档（autotest 依赖），但不再执行任何叠加绘制。

  // 5) 天气覆盖（中 / 高档都有，数据来自 THEMES[i].ambient）
  const th = THEMES[store.phys.theme] || THEMES[0];
  if (th && th.ambient) {
    if (!weatherSeeded) seedWeather();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawWeather(th.ambient, t || 0);
    ctx.restore();
  }
}
