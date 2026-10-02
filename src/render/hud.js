// HUD：纯 Canvas 绘制（无底板信息栏 + 仪表化），色值/字体全部来自 src/config/ui-tokens.js
//
// 设计要点：
//  · 全部 HUD 元素的位置由一个纯函数 hudLayout() 决定 → 可被断言（小屏不重叠、不被裁切）
//  · 左上：**无底板的紧凑信息栏**（关卡名 + 变体徽标 + 里程进度条 + 限时门倒计时 + 姿态平衡），
//    直接贴在屏幕左上角，用文字阴影保证在任何天空/地表上可读（不再用灰色玻璃卡片）
//  · 其下：燃料条（无底板，数值右对齐）；右上：速度仪表（弧形量表 + 区间着色 + 数字）
//  · 底部居中：按键指示；顶部居中：机制警告（危险段超速 / 限时门紧张）——有警告时左列整体下移，绝不遮挡
import { ctx, view } from "../core/canvas.js";
import { toKmh, toM, SPEEDLINE_V, SPEEDLINE_REF, RACE_FORMATS, racePlaceOf } from "../config/constants.js";
import { LEVELS, VARIANT_INFO, levelAt } from "../config/levels.js";
import { store, bike, world } from "../core/store.js";
import { touchActive } from "../core/input.js";
import { clamp } from "../core/utils.js";
import { key } from "../core/input.js";
import { fuelRatio } from "../physics/fuel.js";
import { token, tokenNum, fontOf } from "../config/ui-tokens.js";
import { getQuality } from "./postfx.js";

/** 警告带宽（px）：有机制警告时左列下移，避免与警告重叠 */

/**
 * 比赛场次标签：多人竞技显示「第 N / 6 名」，团赛显示「我方第 N 队」。
 * 1V1 / 排位赛返回空串 —— 那两种只有两个人的对决，名次没有信息量。
 */
function placeTag() {
  if (store.mode !== "race") return "";
  const f = RACE_FORMATS[store.raceFormat] || RACE_FORMATS.duel;
  if (f.riders < 2) return "";
  const p = racePlaceOf(store.racers || [], (bike.rear.x + bike.front.x) / 2, f);
  if (f.team) {
    const [tp, ip] = p;
    return (tp === 1 ? "我方领先" : "我方落后") + " · 队内第 " + ip + " / " + f.teamSize;
  }
  return "第 " + p + " / " + (f.riders + 1) + " 名";
}

const WARN_H = 26;

/**
 * HUD 布局（纯函数，只读 view 尺寸）——所有元素互不重叠且完全落在视口内。
 * @param {boolean} hasWarn 是否正在显示机制警告
 * @param {boolean} touch 触摸方向键是否在显示（此时右下角被油门键占据，布局需避让）
 * @returns {{info:{x,y,w,h}, fuel:object, race:object|null, warn:object|null, speed:object, drive:object|null}}
 */
export function hudLayout(hasWarn = false, touch = false) {
  const W = view.W;
  const H = view.H;
  const compact = W < 520 || H < 480;
  const pad = tokenNum("space-2", 8);
  const gap = tokenNum("space-2", 8);
  const topBand = hasWarn ? WARN_H + gap : 0;

  // 无底板 → 信息栏只是一列文字 + 细进度条，高度从 88 收到 52，紧贴左上角
  const infoW = Math.min(compact ? 170 : 250, Math.max(120, W - pad * 2));
  const infoH = 52;
  const info = { x: pad, y: pad + topBand, w: infoW, h: infoH };

  const fuel = { x: pad, y: info.y + info.h + 6, w: infoW, h: 12 };

  const raceW = Math.min(W * 0.46, 300);
  const race = { x: (W - raceW) / 2, y: fuel.y + fuel.h + gap, w: raceW, h: 10 };

  const warnW = Math.min(320, Math.max(140, W - pad * 2));
  const warn = hasWarn ? { x: (W - warnW) / 2, y: pad, w: warnW, h: WARN_H } : null;

  const gr = compact ? 36 : 50;
  // 触摸时的位置按 Apple HIG「Game controls」定：
  //   · 主控近拇指，但必须"避开拇指预期滑动/视角移动的圆形区域"；
  //   · 次级控件放屏幕顶部。
  // 速度表是只读信息，既非主控也非次级，因此贴右下角**内侧**、让开底角的油门键。
  // 上移量按触摸键实测占位算（.tbtn 74px + space-4 边距 = 约 90px），而不是按 gr 的倍数 ——
  // gr 在小屏是 36、大屏 50，和触摸键尺寸不成比例，用倍数会把两者拉回重叠。
  // 实测 390×844：油门键 x300-374 / y728-802；这里让速度表完全停在其上沿之上。
  const TOUCH_KEY_ZONE = 90;   // .tbtn 直径 74 + space-4(16) 边距
  const speed = {
    x: W - pad - gr * 2,
    // 上移量 = 触摸键占位 + 两者之间留出的间隙（gap），否则速度表下沿会压住键的上沿
    y: H - pad - gr * 2 - (touch ? TOUCH_KEY_ZONE + gap * 2 : 0),
    w: gr * 2, h: gr * 2,
  };

  // 底部居中的 A/D ←→ 键位提示只对键盘用户有意义；触摸时已有屏幕方向键，再挂一条纯属噪音
  const drive = touch ? null : { x: (W - 104) / 2, y: H - pad - 14, w: 104, h: 14 };

  return { info, fuel, race, warn, speed, drive };
}

/** 玻璃卡片底座（深色） */
function glassRect(r, radius) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius === undefined ? tokenNum("radius-card", 14) : radius);
  // 深色底而非 --glass-fill（白色 6%）：HUD 压在**任意场景**上，白色薄底等于没底，
  // 白字在亮色天空（绿野的近白天空色）上会直接糊掉。深色底 + 白字对比才稳定。
  ctx.fillStyle = token("hud-scrim");
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = token("glass-border");
  ctx.stroke();
  // 顶部 1px 高光：把卡片从背景里"抬"起来，是玻璃感的关键
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, 1, 0.5);
  ctx.fillStyle = token("glass-highlight");
  ctx.fill();
}

/** 文本（统一走令牌字体，避免裸 font 字符串） */
function label(text, x, y, level, color, align) {
  ctx.font = fontOf(level);
  ctx.fillStyle = color;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

/** 小徽标（变体 / 状态） */
function badgeText(text, x, y, bg, fg) {
  ctx.font = fontOf("micro");
  const w = ctx.measureText(text).width + tokenNum("space-3", 12);
  const h = 15;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, tokenNum("radius-chip", 8));
  ctx.fillStyle = bg;
  ctx.fill();
  label(text, x + tokenNum("space-2", 8) / 2 + 1, y + 11, "micro", fg);
  return w;
}

/** 当前生效的机制警告（高优先级，不遮挡车身与前方赛道） */
export function activeWarning() {
  if (store.state !== "play") return null;
  const run = store.run;
  if (store.mode !== "level" || run.crashed) return null;
  const mx = (bike.rear.x + bike.front.x) / 2;
  const spd = Math.abs(bike.speed);

  // 限时门紧张：剩余 < 2.5s 或已超时
  const g = world.gates[run.gateIdx];
  if (g) {
    const ride = store.time - run.levelStartTime - run.crashStall;
    const rem = g.limit - ride;
    if (rem < 2.5) return { level: "warn", text: "⏱ 限时门 " + Math.max(0, rem).toFixed(1) + "s" };
  }
  // 危险段：提前 1000px 起预警，并直接给出"超了多少 / 当前多少"，让减速成为可操作动作。
  // 提前量从 620px 提上来的原因：满速 520px/s 下 620px 只有 1.2s 反应时间，几乎来不及松油门。
  // 注意：限速公式 hazardSpeed() 一个字没动，难度不变 —— 这里只增加**可预判性**。
  for (const h of world.hazards) {
    if (mx > h.x1) continue;
    if (h.x0 - mx > 1000) continue;
    const lim = Math.round(toKmh(h.vmax));
    if (mx >= h.x0 && spd > h.vmax) return { level: "danger", text: "⚠️ 危险路段超速！" };
    if (spd > h.vmax) {
      return { level: "warn", text: "⚠️ 已超速 " + Math.round(toKmh(spd) - lim) + " · 限速 " + lim };
    }
    if (spd > h.vmax * 0.9) {
      return { level: "warn", text: "⚠️ 前方限速 " + lim + "km/h · 当前 " + Math.round(toKmh(spd)) };
    }
  }
  return null;
}

const WARN_BG = { danger: "danger", warn: "warn", info: "info", success: "success" };

/** 绘制 HUD（每帧调用） */
export function drawHud() {
  if (store.state === "menu") return;
  const w = activeWarning();
  const L = hudLayout(!!w, touchActive);

  drawInfoCard(L.info);
  drawFuelGauge(L.fuel);
  if (store.mode === "race" || store.mode === "ranked") drawRaceBar(L.race);
  drawSpeedGauge(L.speed);
  if (L.drive) drawDriveIndicator(L.drive);
  if (w) drawWarning(L.warn, w);
  drawSpeedLines();
}

function drawInfoCard(r) {
  const x = r.x;
  const L = levelAt(store.selLevel) || LEVELS[0];
  const compact = view.W < 520 || view.H < 480;
  const title = store.mode === "free"
    ? "♾ 自由模式"
    : store.mode === "race" || store.mode === "ranked"
      ? "🏆 " + (store.mode === "ranked" ? "排位赛" : "比赛") + " 第" + (store.selLevel + 1) + "关"
      : "关卡 " + (store.selLevel + 1) + (compact ? "" : " · " + L.name);

  // 无底板：文字靠投影保证在任意天空/地表上可读。
  // 实测 4px + shadow-text(黑 0.6) 在绿野的近白天空上压不住次要行（"破纪录 9.5s"发灰），
  // 故改用 shadow-text-strong(0.72) + 6px 模糊，并且整段文字统一走投影（save/restore 已包住）。
  ctx.save();
  ctx.shadowColor = token("shadow-text-strong");
  ctx.shadowBlur = 6;
  label(title, x, r.y + 14, "title", token("text-hi"));

  // 变体徽标（normal 不显示）与竞速差距：跟在标题同一行右侧（ctx.font 此刻仍是标题字体）
  let bx = x + ctx.measureText(title).width + 6;
  if (store.mode === "level" && L.variant !== "normal") {
    const vi = VARIANT_INFO[L.variant];
    if (vi) bx += badgeText(vi.icon + vi.name, bx, r.y + 1, token("glass-fill-strong"), token("info")) + 4;
  }
  if ((store.mode === "race" || store.mode === "ranked") && store.raceAI) {
    const lead = (bike.rear.x + bike.front.x) / 2 - store.raceAI.x;
    const txt = lead >= 0
      ? "领先 " + Math.round(toM(lead)) + "m"
      : "落后 " + Math.round(toM(-lead)) + "m";
    bx += badgeText(txt, bx, r.y + 1, token("glass-fill-strong"), lead >= 0 ? token("success") : token("danger")) + 4;
    // 多人赛 / 团赛：光看"领先落后"不知道场上有几个人，名字次才看得出超没超过去
    const ps = placeTag();
    if (ps) bx += badgeText(ps, bx, r.y + 1, token("glass-fill-strong"), token("gold")) + 4;
  }

  // 倒计时 / 目标行
  const info = [];
  if (store.mode === "free") {
    info.push("里程 " + Math.round(toM((bike.rear.x + bike.front.x) / 2)) + "m" + (store.best > 0 ? " · 最佳 " + store.best + "m" : ""));
  } else {
    const g = store.mode === "level" ? world.gates[store.run.gateIdx] : null;
    if (g) {
      const ride = store.time - store.run.levelStartTime - store.run.crashStall;
      const rem = Math.max(0, g.limit - ride);
      info.push("⏱ 第" + (store.run.gateIdx + 1) + "门 " + rem.toFixed(1) + "s");
    }
    if (!info.length) info.push("缩放 " + Math.round(store.cam.zoom * 100) + "% · R 重启 · +/- 缩放");
  }
  label(info.join("   "), x, r.y + 30, "caption", token("text-mid"));

  // 里程进度条（细，无底板：暗色槽 + 强调色填充）
  const mx = (bike.rear.x + bike.front.x) / 2;
  const pct = store.mode === "free"
    ? 1
    : clamp(mx / Math.max(1, store.finishX), 0, 1);
  const barY = r.y + 35;
  ctx.beginPath();
  ctx.roundRect(x, barY, r.w, 5, 2.5);
  ctx.fillStyle = token("scrim");
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x, barY, Math.max(2, r.w * pct), 5, 2.5);
  ctx.fillStyle = token("accent");
  ctx.fill();

  // 姿态平衡条（并入信息栏，避免小屏与其它元素打架）
  drawBalance(x, r.y + 45, r.w, 4);
  ctx.restore();
}

function drawBalance(x, y, w, h) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = token("scrim");
  ctx.fill();
  const ang = Math.atan2(bike.front.y - bike.rear.y, bike.front.x - bike.rear.x);
  const norm = clamp(ang * 2.5, -1, 1);
  const cx = x + w / 2 + norm * (w / 2 - 3);
  ctx.beginPath();
  ctx.roundRect(cx - 3, y - 1, 6, h + 2, 2);
  ctx.fillStyle = Math.abs(norm) > 0.6 ? token("danger") : token("success");
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 0.5, y - 1, 1, h + 2, 0.5);
  ctx.fillStyle = token("text-lo");
  ctx.fill();
}

function drawFuelGauge(r) {
  const ratio = fuelRatio();
  const labelW = 48;
  const inner = { x: r.x, y: r.y + 2, w: Math.max(24, r.w - labelW), h: r.h - 4 };

  ctx.save();
  ctx.shadowColor = token("shadow-text");
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w, inner.h, inner.h / 2);
  ctx.fillStyle = token("scrim");
  ctx.fill();

  const low = ratio < 0.25;
  const alpha = low ? 0.55 + 0.45 * Math.abs(Math.sin(store.time * 6)) : 1;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, Math.max(1, inner.w * ratio), inner.h, inner.h / 2);
  ctx.fillStyle = low ? token("danger") : token("warn");
  ctx.fill();
  ctx.globalAlpha = 1;

  // 刻度（每 10%）
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const tx = inner.x + (inner.w * i) / 10;
    ctx.moveTo(tx, inner.y);
    ctx.lineTo(tx, inner.y + inner.h * 0.45);
  }
  ctx.strokeStyle = token("shadow-text");
  ctx.lineWidth = 1;
  ctx.stroke();

  // 数值放在条的右侧（条上没有底板，压在条上会看不清）
  label("⛽ " + Math.round(ratio * 100) + "%", r.x + r.w, r.y + r.h - 2, "micro", token("text-hi"), "right");
  ctx.restore();
}

function drawSpeedGauge(r) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = r.w / 2 - 4;
  const kmh = toKmh(Math.abs(bike.speed));
  const maxK = toKmh(store.phys.topSpeed) || 1;
  const frac = clamp(kmh / maxK, 0, 1);

  // 玻璃底盘
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, r.w / 2);
  ctx.fillStyle = token("glass-fill");
  ctx.fill();
  ctx.strokeStyle = token("glass-border");
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, rad, Math.PI * 0.75, Math.PI * 2.25);
  ctx.strokeStyle = token("track");
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, rad, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * frac);
  ctx.strokeStyle = frac > 0.85 ? token("danger") : frac > 0.6 ? token("warn") : token("success");
  ctx.lineWidth = 7;
  ctx.stroke();

  label(String(Math.round(kmh)), cx, cy + 4, "display", token("text-hi"), "center");
  label("km/h", cx, cy + 18, "micro", token("text-lo"), "center");
}

function drawDriveIndicator(r) {
  glassRect(r, tokenNum("radius-chip", 8));
  const bh = r.h;
  label("◀ A", r.x + 16, r.y + bh - 4, "micro", key.left ? token("danger") : token("text-lo"), "center");
  label("🚲", r.x + r.w / 2, r.y + bh - 4, "micro", token("text-mid"), "center");
  label("D ▶", r.x + r.w - 16, r.y + bh - 4, "micro", key.right ? token("success") : token("text-lo"), "center");
}

function drawRaceBar(r) {
  glassRect(r, tokenNum("radius-chip", 8));
  const pad = tokenNum("space-2", 8) / 2;
  const inner = { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 };
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w, inner.h, 3);
  ctx.fillStyle = token("track");
  ctx.fill();
  const total = Math.max(1, store.finishX);
  const px = clamp((bike.rear.x + bike.front.x) / 2 / total, 0, 1);
  const ax = clamp(store.raceAI ? store.raceAI.x / total : 0, 0, 1);
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w * ax, inner.h, 3);
  ctx.fillStyle = token("danger");
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w * px, inner.h, 3);
  ctx.fillStyle = token("success");
  ctx.fill();

  // AI 小车（世界坐标 → 屏幕）
  if (store.raceAI) {
    const sx = store.raceAI.x - store.cam.x;
    if (sx > -40 && sx < view.W + 40) {
      const sy = r.y + r.h + 14;
      ctx.beginPath();
      ctx.arc(sx - 7, sy, 5, 0, 7);
      ctx.arc(sx + 7, sy, 5, 0, 7);
      ctx.fillStyle = token("danger");
      ctx.fill();
      label("AI", sx, sy - 8, "micro", token("danger"), "center");
    }
  }
}

function drawWarning(r, w) {
  const bg = token(WARN_BG[w.level] || "info");
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, tokenNum("radius-chip", 8));
  ctx.fillStyle = token("scrim-strong");
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = bg;
  ctx.stroke();
  label(w.text, r.x + r.w / 2, r.y + r.h - 8, "caption", bg, "center");
}

/** 高速速度线（阈值用真实标度；高画质下更密集更明显，营造速度感） */
export function drawSpeedLines() {
  const spd = Math.abs(bike.speed);
  if (spd < SPEEDLINE_V || store.run.crashed) return;
  const q = getQuality();
  const intensBase = q === "high" ? 0.42 : 0.3;
  const intens = clamp(spd / SPEEDLINE_REF, 0, 1) * intensBase;
  const n = q === "high" ? 16 : 12;
  ctx.strokeStyle = token("obj-glass-mid");
  ctx.globalAlpha = intens;
  ctx.lineWidth = q === "high" ? 1.7 : 1.5;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * view.W;
    const y = Math.random() * view.H * 0.62;
    const l = 10 + Math.random() * (q === "high" ? 34 : 25);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - l * Math.sign(bike.speed || 1), y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
