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

/** 画质档位 */
export const QUALITY = ["high", "medium", "low", "off"];
export const QUALITY_LABEL = { high: "高", medium: "中", low: "低", off: "关" };
/** 持久化键：非 bike_ 前缀（不是存档键，导出/导入不包含它） */
const QKEY = "dale_quality";

/** 天气覆盖（按 THEMES[i].ambient.type 分派） */
const WEATHER_N = 64;
const weather = [];
for (let i = 0; i < WEATHER_N; i++) {
  weather.push({ x: 0, y: 0, s: 0, ph: 0, v: 0, seed: i / WEATHER_N });
}
let weatherSeeded = false;

let quality = "high";
let reduced = false;
let off = null;
let offCtx = null;
let offW = 0;
let offH = 0;
let vignette = null;
let fade = null;

function lsGet(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch (e) { /* 存储不可用时静默降级 */ }
}

/** 低端设备判定：窄屏 / 低 DPR / 触摸 */
function isLowEnd() {
  const dpr = view.DPR || 1;
  const narrow = view.W < 620 || view.H < 420;
  const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
  return narrow || dpr < 1.5 || touch;
}

/**
 * 初始化后处理：读持久化档位（缺失时按设备给默认档），并订阅 reduced-motion。
 * 由 main.js 在首屏调用一次。
 */
export function initPostFx() {
  const saved = lsGet(QKEY);
  quality = QUALITY.includes(saved) ? saved : (isLowEnd() ? "medium" : "high");
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reduced = !!(mq && mq.matches);
      if (mq && typeof mq.addEventListener === "function") {
        mq.addEventListener("change", (e) => { reduced = !!e.matches; });
      }
    }
  } catch (e) { /* 环境不支持则视为不减少动效 */ }
  return quality;
}

export function getQuality() { return quality; }
export function setQuality(q) {
  if (!QUALITY.includes(q)) return quality;
  quality = q;
  lsSet(QKEY, q);
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
    vignette = null;
    fade = null;
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
 * @param {number} t 秒级时间（用于天气相位）
 */
export function applyPostFx(t) {
  if (store.state !== "play") return;
  if (quality === "off") return;
  const W = view.W;
  const H = view.H;
  const oc = ensureOff(W, H);

  // 1) 渐晕（缓存渐变，尺寸变化才重建）
  if (!vignette) {
    vignette = oc.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.32, W / 2, H * 0.5, Math.max(W, H) * 0.72);
    vignette.addColorStop(0, token("fx-none-dark"));
    vignette.addColorStop(1, token("shadow-md"));
  }
  oc.save();
  oc.clearRect(0, 0, W, H);
  oc.fillStyle = vignette;
  oc.fillRect(0, 0, W, H);

  // 2) 按场景的色彩分级（暖冷偏移，低不透明度）
  oc.globalAlpha = 0.10;
  oc.fillStyle = gradeColor();
  oc.fillRect(0, 0, W, H);
  oc.globalAlpha = 1;

  // 3) 远景淡化（顶部天空渐变）
  if (!fade) {
    fade = oc.createLinearGradient(0, 0, 0, H * 0.45);
    fade.addColorStop(0, token("fx-cloud-white"));
    fade.addColorStop(1, token("fx-none-dark"));
  }
  oc.fillStyle = fade;
  oc.fillRect(0, 0, W, H * 0.45);
  oc.restore();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, 0, 0);
  ctx.restore();

  // 4) 速度拖影 / 速度模糊（仅高档 + 允许动效）：把画面自身错位叠加形成涂抹感
  if (blurEnabled()) {
    const spd = Math.abs(bike.speed);
    const k = clamp((spd - SPEEDLINE_REF * 0.35) / (SPEEDLINE_REF * 0.65), 0, 0.5);
    if (k > 0.01) {
      const dir = bike.speed >= 0 ? 1 : -1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = k * 0.35;
      ctx.drawImage(cv, -dir * 4, 0);
      ctx.drawImage(cv, -dir * 9, 0);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // 5) 天气覆盖（数据来自 THEMES[i].ambient，第 1 期已声明）
  const th = THEMES[store.phys.theme] || THEMES[0];
  if (th && th.ambient) {
    if (!weatherSeeded) seedWeather();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawWeather(th.ambient, t || 0);
    ctx.restore();
  }
}
