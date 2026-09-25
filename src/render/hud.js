// HUD：DOM 数值同步 + 画布上的指示条 / 速度线 / 竞速条
import { ctx, view } from "../core/canvas.js";
import { WHEEL_R, toKmh, toM, SPEEDLINE_V, SPEEDLINE_REF } from "../config/constants.js";
import { ACHS } from "../config/constants.js";
import { LEVELS } from "../config/levels.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, bike } from "../core/store.js";
import { clamp } from "../core/utils.js";
import { key } from "../core/input.js";
import { groundY } from "../physics/terrain.js";
import { fuelRatio } from "../physics/fuel.js";

const HUD = {
  lvl: document.getElementById("lvl"),
  speed: document.getElementById("speed"),
  coins: document.getElementById("coins"),
  prog: document.getElementById("prog"),
  progLabel: document.getElementById("progLabel"),
  progBar: document.getElementById("progBar"),
  lvlDesc: document.getElementById("lvlDesc"),
  fuel: document.getElementById("fuel"),
  fuelTxt: document.getElementById("fuelTxt"),
  fuelWrap: document.querySelector(".fuelwrap"),
};

/** 每个固定步/帧同步 DOM 数值（金币图标全局统一为 🪙） */
export function syncHudDom() {
  const run = store.run;
  const b = bike;
  const ratio = fuelRatio();

  if (HUD.fuel) HUD.fuel.style.width = (ratio * 100).toFixed(1) + "%";
  if (HUD.fuelTxt) HUD.fuelTxt.textContent = Math.round(ratio * 100) + "%";
  if (HUD.fuelWrap) HUD.fuelWrap.classList.toggle("low", ratio < 0.25);
  if (HUD.coins) HUD.coins.textContent = "🪙 " + store.gold;

  const kmh = toKmh(Math.abs(b.speed));
  if (HUD.speed) {
    HUD.speed.textContent =
      Math.round(kmh) + " km/h" + (run.airTime > 0.1 ? " ✈ " + Math.round(run.airTime * 10) / 10 + "s" : "");
  }

  const mx = (b.rear.x + b.front.x) / 2;
  if (store.mode === "free") {
    if (HUD.lvl) {
      HUD.lvl.textContent =
        "♾ 自由模式 · " + Math.round(toM(mx)) + "m" + (store.best > 0 ? " · 最佳" + store.best + "m" : "");
    }
    if (HUD.prog) HUD.prog.style.width = "100%";
    if (HUD.progBar) HUD.progBar.style.opacity = 0.3;
    if (HUD.progLabel) HUD.progLabel.style.opacity = 0.3;
  } else {
    if (HUD.lvl) {
      HUD.lvl.textContent =
        store.mode === "race"
          ? "🏆 比赛 第" + (store.selLevel + 1) + "关"
          : "关卡 " + (store.selLevel + 1) + " · " + LEVELS[store.selLevel].name;
    }
    if (HUD.prog) {
      HUD.prog.style.width = clamp((mx / Math.max(1, store.finishX)) * 100, 0, 100) + "%";
    }
    if (HUD.progBar) HUD.progBar.style.opacity = 1;
    if (HUD.progLabel) HUD.progLabel.style.opacity = 1;
  }

  if (store.state === "menu" && HUD.lvlDesc) {
    HUD.lvlDesc.textContent =
      "🚲 " + VEHICLES[store.currentVehicle].name + " · 🪙 " + store.gold +
      " · 已解锁 " + (store.unlocked + 1) + "/" + LEVELS.length +
      " 关 · 🏅 " + store.achGot.length + "/" + ACHS.length +
      (store.best > 0 ? " · 无限最佳 " + store.best + "m" : "");
  }
}

/** 车架姿态平衡条 */
export function drawBalanceBar() {
  const bw = 120;
  const bh = 8;
  const bx = view.W / 2 - bw / 2;
  const by = 30;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 4);
  ctx.fill();
  const ang = Math.atan2(bike.front.y - bike.rear.y, bike.front.x - bike.rear.x);
  const norm = clamp(ang * 2.5, -1, 1);
  const cx = bx + bw / 2 + norm * (bw / 2 - 4);
  const hue = 120 - Math.abs(norm) * 120;
  ctx.fillStyle = `hsl(${hue},90%,55%)`;
  ctx.beginPath();
  ctx.roundRect(cx - 4, by - 1, 8, bh + 2, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.roundRect(bx + bw / 2 - 1, by - 1, 2, bh + 2, 1);
  ctx.fill();
  if (store.run.maxWheelieDist > 0.5) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    // 翘头里程：100px = 1m（旧实现把像素当米显示，差 10 倍）
    ctx.fillText("🏍 " + Math.round(toM(store.run.maxWheelieDist)) + "m", bx + bw / 2, by - 6);
    ctx.textAlign = "left";
  }
}

/** 左下角按键指示 */
export function drawDriveIndicator() {
  const bw = 104;
  const bh = 10;
  const bx = view.W / 2 - bw / 2;
  const by = view.H - 30;
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.roundRect(bx - 3, by - 3, bw + 6, bh + 8, 6);
  ctx.fill();
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = key.left ? "#ff5252" : "rgba(255,255,255,0.45)";
  ctx.fillText("◀ A", bx + bw * 0.17, by + bh / 2 + 1);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("🚲", bx + bw * 0.5, by + bh / 2 + 1);
  ctx.fillStyle = key.right ? "#4cff88" : "rgba(255,255,255,0.45)";
  ctx.fillText("D ▶", bx + bw * 0.82, by + bh / 2 + 1);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

/** 高速速度线（阈值已改为真实标度，旧版 *SUB 导致几乎不可见） */
export function drawSpeedLines() {
  const spd = Math.abs(bike.speed);
  if (spd < SPEEDLINE_V || store.run.crashed) return;
  const intens = clamp(spd / SPEEDLINE_REF, 0, 1) * 0.3;
  ctx.strokeStyle = `rgba(255,255,255,${intens})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * view.W;
    const y = Math.random() * view.H * 0.6;
    const l = 10 + Math.random() * 25;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - l * Math.sign(bike.speed || 1), y);
    ctx.stroke();
  }
}

/** 比赛模式：进度条 + AI 小车 */
export function drawRaceHUD() {
  if (store.mode !== "race" || !store.raceAI) return;
  const bw = Math.min(view.W * 0.4, 300);
  const bh = 10;
  const bx = view.W / 2 - bw / 2;
  // 窄屏时下移，避免和右上角的全屏/手柄按钮撞车
  const by = view.W < 620 ? 56 : 34;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 4);
  ctx.fill();
  const total = Math.max(1, store.finishX);
  const px = clamp((bike.rear.x + bike.front.x) / 2 / total, 0, 1);
  const ax = clamp(store.raceAI.x / total, 0, 1);
  ctx.fillStyle = "#e63946";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw * ax, bh, 3);
  ctx.fill();
  ctx.fillStyle = "#4cff88";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw * px, bh, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("你(绿) vs AI(红)", view.W / 2, by - 4);
  ctx.textAlign = "left";

  const gy = groundY(store.raceAI.x);
  if (gy !== Infinity) {
    const sx = store.raceAI.x - store.cam.x;
    const sy = gy - WHEEL_R - store.cam.y;
    if (sx > -40 && sx < view.W + 40 && isFinite(sy)) {
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx + 14, sy, 6, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#b3202f";
      ctx.fillRect(sx + 5, sy - 15, 10, 5);
      ctx.fillStyle = "#fff";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("AI", sx + 7, sy - 20);
      ctx.textAlign = "left";
    }
  }
}
