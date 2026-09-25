// 单局统计与特技结算
import { WHEEL_R } from "../config/constants.js";
import { store, bike } from "../core/store.js";
import { toM } from "../config/constants.js";
import { groundInfo } from "../physics/terrain.js";
import { emitParticles } from "../render/particles.js";
import { showCombo, showToast } from "../core/toast.js";
import { playFlipSound, playLandSound, playFuelSound } from "../core/audio.js";
import { addGold, checkAch } from "./progress.js";
import { refuel, fuelRatio } from "../physics/fuel.js";

/** 连招时间窗口（秒）：超过则连招重新计数 */
export const COMBO_WINDOW = 4.0;

/** 每个固定步调用：里程 / 滞空 / 翘头统计 */
export function updateStats(dt) {
  const b = bike;
  const run = store.run;

  const fg = groundInfo(b.front.x);
  const frontOffGround = fg.y === Infinity || b.front.y < fg.y - WHEEL_R - 2;

  if (b.grounded > 0 && frontOffGround && !run.crashed) {
    // 翘头里程：速度(px/s) × 时间(秒) = px，显示时按 100px=1m 换算
    run.wheelieDist += Math.abs(b.speed) * dt;
    run.maxWheelieDist = Math.max(run.maxWheelieDist, run.wheelieDist);
  } else if (!run.crashed) {
    run.wheelieDist = 0;
  }

  if (b.grounded === 0 && !run.crashed) {
    run.airTime += dt;
    run.landed = false;
  } else if (!run.landed && b.grounded > 0) {
    run.landed = true;
    if (run.airTime > 0.15) playLandSound();
    run.airTime = 0;
  }
}

/** 落地瞬间：翻转特技 + 空中时间奖励结算 */
export function settleLanding() {
  const run = store.run;
  const flips = Math.round(bike.rotAcc / (2 * Math.PI));
  bike.rotAcc = 0;
  const msgs = [];

  if (flips !== 0) {
    // 连招窗口：4 秒内再次空翻才累计，否则重新从 1 开始
    if (store.time - run.comboStamp <= COMBO_WINDOW) run.combo++;
    else run.combo = 1;
    run.comboStamp = store.time;

    const reward = Math.round(Math.abs(flips) * 40 * run.combo);
    addGold(reward);
    // 屏幕坐标 y 向下：正旋转 = 顺时针 = 前轮朝下 = 前空翻
    msgs.push((flips > 0 ? "🔃 前空翻" : "🔄 后空翻") + "×" + Math.abs(flips) + " 连招x" + run.combo + " +" + reward);
    playFlipSound();
    checkAch("flip");
    if (run.combo >= 3) checkAch("combo3");
  } else {
    run.combo = 0;
  }

  if (run.airTime > 0.8) {
    const bonus = Math.round(run.airTime * 20);
    addGold(bonus);
    msgs.push("🕐 空中 +" + bonus);
    checkAch("air");
  }

  if (msgs.length) showCombo(msgs.join("   "));
}

/** 拾取油罐：+45% 燃料 */
export function pickCanister(c) {
  c.taken = true;
  refuel(0.45);
  emitParticles(c.x, c.y, 10, { color: "#ffba08", spd: 1.4, life: 26, size: 3, grav: 0.02 });
  showToast("⛽ +45%", 650);
  playFuelSound();
}

/** 翘头里程显示（米） */
export function wheelieMeters() {
  return toM(store.run.maxWheelieDist);
}

/** 燃料百分比（0~1） */
export function fuelPercent() {
  return fuelRatio();
}
