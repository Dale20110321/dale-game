// 相机：跟随 / 速度前瞻 / 速度自适应缩放 / 震屏
//
// ★ 三条不变量（改之前先读完）：
//   1. 跟随必须**速度前馈**。纯 lerp 追赶匀速目标时，稳态滞后恒为 v·τ：
//      350 km/h 落后 1458px、1000 km/h 落后 4167px —— 这就是"地图跟不上"。
//      加上 v·dt 前馈项后，匀速运动的稳态滞后**精确为 0**。
//   2. 缩放随速度自适应。世界可视宽度 = view.W / zoom，不缩放的话
//      高速时前方地形在两帧之间就跳过去了。
//   3. 相机是**世界坐标**，渲染层 ctx.scale(zoom) 后再减 cam.x/cam.y。
//      任何"屏幕 px 当世界 px 用"的写法都会在 zoom ≠ 1 时错位
//      （render/terrain.js 与 entities.js 都曾踩过这个坑）。
import { store, bike } from "../core/store.js";
import { view } from "../core/canvas.js";
import { clamp, lerp } from "../core/utils.js";

/** 叠加震屏强度（0~16） */
export function addShake(v) {
  store.cam.shake = Math.min(16, store.cam.shake + v);
}

/**
 * 相机跟随的时间常数（秒）。按 dt 折算成指数逼近，与刷新率无关。
 * ★ 不能写 lerp(…, 0.1)：那个 0.1 是每帧逼近比例，隐含 τ ≈ 0.15s，
 *   稳态滞后 = 0.15s × v，350 km/h 就差 1458px。
 */
const CAM_TAU = 0.11;

/**
 * 速度自适应缩放：zoom ∝ (v_ref/v)^γ。
 * ★ γ < 1 是折中 —— 理想的 zoom ∝ 1/v 会让 1000 km/h 缩到 0.05，车变成一个点。
 *   γ=0.5 时低速几乎不变、高速显著拉远，再由 CAM_ZOOM_MIN 兜底。
 */
const CAM_ZOOM_REF = 700;   // px/s ≈ 25 km/h，此附近不做任何缩放
const CAM_ZOOM_GAMMA = 0.5;
const CAM_ZOOM_MIN = 0.32; // 车身总长约 62px，在 0.32 下仍有 20px，肉眼可辨
/**
 * 高速时的**动态缩放下限**：保证"一帧位移"不超过屏幕宽度的 CAM_FRAME_SHARE。
 *
 * ★ 这是宇宙级车"看起来跑不出来"的直接原因：固定下限 0.32 把视野锁在 ±1km，
 *   而无相 10 万 km/h 一帧（1/60s）就走 46,096px = **461 米**，一帧跨过屏幕
 *   宽度的四分之一 —— 车不是在屏幕里"飞快"，而是直接闪出画面，玩家只看到空地。
 *
 *   缩放下限必须随速度放开：可见半宽 = (屏半宽)/zoom ≥ 一帧位移 × margin，
 *   即 zoom ≤ (屏半宽)·60 / (v · margin)。
 */
const CAM_FRAME_MARGIN = 1.6; // 车停在屏幕约 62% 处，右侧留出余量
const CAM_ZOOM_ABS_MIN = 1e-4; // 数值兜底（10 万 km/h 时算出 ~2.5e-3）
const CAM_ZOOM_LERP = 0.05; // 缩放自身的逼近比例（用 dt 在下面折算）

/** 本帧的车速（px/s，无符号）：用真实系统速度而不是 lerp 平滑过的 bike.speed */
function speedOf() {
  let vx = 0;
  let mt = 0;
  for (const p of bike.pts) {
    vx += p._vx * p.m;
    mt += p.m;
  }
  return mt > 0 ? Math.abs(vx / mt) : 0;
}

/**
 * 由车速推出的目标缩放（纯函数，便于断言）。
 * @param {number} v 车速（px/s）
 * @param {number} base 用户设定的基准缩放
 */
export function camZoomOf(v, base) {
  if (!(v > CAM_ZOOM_REF)) return base;
  const k = Math.pow(CAM_ZOOM_REF / v, CAM_ZOOM_GAMMA);
  // 取 base·k 与"保证一帧位移在屏内"的上限里**更小**的那个：
  //   · 慢速时 base·k 更小 → 维持原有观感，且不低于 CAM_ZOOM_MIN（车身可辨）
  //   · 高速时可见性上限更小 → 自动让位，车不会再闪出画面
  // ★ 早期写成 max(下限, base·k) 是反的：10 万 km/h 时 base·k = 0.0222 远大于
  //   上限 0.0104，下限机制根本没生效，车每帧走 46km 而屏内只有 2km。
  const halfW = (view.W || 960) * 0.5;
  const z = Math.max(CAM_ZOOM_MIN, base * k);
  const visCap = (halfW * 60) / (v * CAM_FRAME_MARGIN);
  return Math.max(CAM_ZOOM_ABS_MIN, Math.min(z, visCap));
}

/**
 * 当前视口覆盖的**世界坐标**范围。
 * ★ 渲染层必须用它而不是 view.W：世界层绘制发生在 ctx.scale(zoom) 之内，
 *   屏幕右缘对应 cam.x + view.W/zoom。历史上 terrain.js 与 entities.js 按后者
 *   采样与剔除，zoom < 1 时右半屏完全没地形（而速度自适应恰好会主动缩小 zoom）。
 */
export function worldView(cam, W, H) {
  const c = cam || store.cam;
  const z = c.zoom > 0.01 ? c.zoom : 1;
  const w = (W === undefined ? view.W : W) / z;
  const h = (H === undefined ? view.H : H) / z;
  return { x0: c.x, x1: c.x + w, y0: c.y, y1: c.y + h, w, h, z };
}

/** 每个固定步更新一次：与刷新率无关 */
export function updateCamera(dt) {
  if (store.state === "pause") return;
  const cam = store.cam;
  const mx = (bike.rear.x + bike.front.x) / 2;
  const my = (bike.rear.y + bike.front.y) / 2;

  // ---- 速度自适应缩放：先定 zoom，再用它算"世界该露多宽" ----
  // ★ 顺序很重要：视野宽度 = view.W / zoom，zoom 变了视野跟着变，
  //   若反过来先按旧 zoom 定位再改 zoom，车会在一帧内跳一下。
  const v = speedOf();
  const zTarget = camZoomOf(v, cam.zoomBase);
  const zl = 1 - Math.pow(1 - CAM_ZOOM_LERP, dt * 60);
  cam.zoom = lerp(cam.zoom, zTarget, zl);
  const zoom = cam.zoom > 0.01 ? cam.zoom : 1;

  // 世界可视范围（px）：屏幕宽高除以缩放。
  const worldW = view.W / zoom;
  const worldH = view.H / zoom;

  // ---- 水平跟随：指数逼近 + 速度前馈 ----
  // 前瞻量随速度增长：高速时要多看一点前方，才有时间对地形做出反应。
  // 分母用 worldW 而不是 view.W —— 缩放变化时前瞻的**世界**长度保持稳定。
  const spdN = clamp(v / Math.max(1, store.phys.topSpeed), 0, 1);
  const lead = (Math.sign(bike.speed || 1) * spdN * worldW * 0.10) / 1;
  const maxX = store.mode === "free" ? Infinity : Math.max(0, store.finishX - worldW * 0.45);
  const targetX = clamp(mx + lead - worldW * 0.38, 0, maxX);

  // ★ 速度前馈：指数逼近只负责吃掉"目标跳变"，匀速前进由前馈项直接补上。
  //   不加这一项时稳态滞后恒为 v·τ（见文件头不变量 1）。
  const a = 1 - Math.exp(-dt / CAM_TAU);
  cam.x += (targetX - cam.x) * a + (bike.speed ? bike.speed : 0) * dt * (1 - a);

  // ---- 竖直跟随：保留原有的较硬跟随（0.3/帧），但同样按 dt 折算 ----
  const targetY = my - worldH * 0.55 + spdN * worldH * 0.02;
  const ay = 1 - Math.pow(1 - 0.3, dt * 60);
  cam.y = lerp(cam.y, targetY, ay);

  if (cam.shake > 0.06) cam.shake *= Math.pow(0.86, dt * 60);
  else cam.shake = 0;
}

// 抖动相位（累积而非随机）：见 shakeOffset 注释
let shPhase = 0;

/**
 * 取本帧的抖动偏移（只影响一次绘制）。
 *
 * ★ 原来是逐帧 `Math.random()` 的**白噪声**：相邻两帧的偏移量毫无关联，
 *   整屏（背景/地形/车/实体一起）在帧与帧之间无规律地跳。撞上加速带那一刻
 *   同时又叠了 18 个粒子，画面一帧里既闪又多动，观感上就是"卡一下"。
 *   改成**连续振荡**（相位每帧累加），位移在帧间平滑变化，观感是"震"而不是"卡"；
 *   强度、衰减、封顶语义全部不变，行为可预期且仍然与刷新率无关。
 */
export function shakeOffset() {
  const s = store.cam.shake;
  if (s <= 0.06) { shPhase += 0.37; return { x: 0, y: 0 }; }
  shPhase += 0.55;
  return { x: Math.sin(shPhase * 2.1) * s, y: Math.cos(shPhase * 3.3) * s * 0.7 };
}