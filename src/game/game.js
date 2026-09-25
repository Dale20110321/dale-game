// 游戏主状态机：闯关 / 比赛 / 无限，通关结算与重生
// 本模块不 import 任何 UI 模块，界面动作通过 initGame(presenter) 注入（避免循环依赖）
import { START_X, WHEELBASE, toM, toKmh } from "../config/constants.js";
import { LEVELS } from "../config/levels.js";
import { store, bike, world } from "../core/store.js";
import { key } from "../core/input.js";
import { view } from "../core/canvas.js";
import { showToast } from "../core/toast.js";
import { save } from "../core/storage.js";
import { groundInfo, groundY, safeSpot } from "../physics/terrain.js";
import { applyUpgrades, resetBike, stepPhysics } from "../physics/bike.js";
import { drainFuel, setFuel } from "../physics/fuel.js";
import { updateParticles } from "../render/particles.js";
import { updateStats } from "./stats.js";
import { addGold, checkAch } from "./progress.js";
import {
  buildLevel, freeInit, freeFill,
  updateBoosts, updateCanisters, updateCoins, emitRideDust,
} from "./world.js";
import { raceInit, raceUpdate } from "./race.js";

let presenter = { hideOverlay() {}, toMenu() {} };

/** 由 main.js 注入界面动作 */
export function initGame(p) {
  if (p) presenter = p;
}

/** 关卡开始时重置与上一关相关的全部状态（否则会出现"重生到上一关坐标"等串档问题） */
function resetRunState() {
  const run = store.run;
  run.crashed = false;
  run.crashTimer = 0;
  run.clearing = false;
  run.lastSafeX = START_X;
  run.runCrashed = false;
  run.combo = 0;
  run.comboStamp = -99;
  run.wheelieDist = 0;
  run.maxWheelieDist = 0;
  run.airTime = 0;
  run.landed = false;
  run.levelStartTime = store.time;
  run.coinGot = 0;
  run.totalCoins =
    store.mode === "level" && LEVELS[store.selLevel] ? LEVELS[store.selLevel].coinN : 0;
  world.particles = [];
  store.cam.shake = 0;
  bike.stunned = 0;
}

function pinBike() {
  bike.rear.x = bike.spawnX;
  bike.front.x = bike.spawnX + WHEELBASE;
  bike.head.x = bike.spawnX + WHEELBASE * 0.5;
}

function beginRun() {
  resetBike(START_X);
  resetRunState();
  store.cam.x = 0;
  setFuel(store.phys.fuelMax);
  if (store.mode === "race") raceInit();
  store.state = "play";
  presenter.hideOverlay();
}

/** 开局（菜单按钮 / 关卡面板 / 重开都走这里） */
export function startGame(m, lv) {
  try {
    store.lastMode = m || store.lastMode;
    store.mode = store.lastMode;
    store.selLevel = lv !== undefined ? lv : store.selLevel || 0;
    if (store.mode === "free") freeInit();
    else buildLevel(store.selLevel);
    applyUpgrades();
    beginRun();
  } catch (err) {
    console.error("startGame 错误:", err);
    showToast("⚠️ 出错了：" + err.message, 1500);
  }
}

/** 重开当前局 */
export function restart() {
  startGame();
}

/** 进入下一关 / 结束本局回到菜单 */
export function nextLevel() {
  if (store.mode === "level" && store.selLevel < LEVELS.length - 1) {
    store.selLevel++;
    buildLevel(store.selLevel);
    applyUpgrades();
    resetBike(START_X);
    resetRunState();
    store.cam.x = 0;
    setFuel(store.phys.fuelMax);
    showToast(
      "关卡 " + (store.selLevel + 1) + " · " + LEVELS[store.selLevel].name +
        " · " + ["绿野", "雪原", "荒漠", "月面"][LEVELS[store.selLevel].theme],
      800
    );
  } else {
    presenter.toMenu();
    if (store.mode === "level" && store.selLevel >= LEVELS.length - 1) showToast("🎉 全部通关！");
  }
}

/** 回到安全点 */
export function respawn() {
  const sx = safeSpot(store.run.lastSafeX);
  store.run.lastSafeX = sx;
  resetBike(sx);
  bike.locked = false;
  store.run.crashed = false;
  store.cam.x = sx - view.W * 0.35;
  showToast("! 回到安全点", 420);
}

/** 掉出地图：回到安全点重来 */
export function pitRewind() {
  const sx = safeSpot(store.run.lastSafeX);
  store.run.lastSafeX = sx;
  resetBike(sx);
  bike.locked = false;
  store.run.crashed = false;
  store.cam.x = sx - view.W * 0.35;
  showToast("滑出地图，回到安全点重来", 600);
}

/** 燃料耗尽 */
function handleFuelEmpty() {
  if (store.mode === "free") {
    const mx = (bike.rear.x + bike.front.x) / 2;
    const dist = Math.round(toM(mx));
    let record = false;
    if (dist > store.best) {
      store.best = dist;
      save();
      record = true;
    }
    store.state = "ended";
    showToast("⛽ 燃料耗尽 · 本次 " + dist + "m" + (record ? " 🏅 新纪录！" : ""), 1600);
    setTimeout(() => {
      store.state = "menu";
      presenter.toMenu();
      store.raceAI = null;
    }, 1600);
  } else {
    setFuel(store.phys.fuelMax * 0.3);
    respawn();
    showToast("⛽ 燃料耗尽！回到安全点", 900);
  }
}

/** 到达终点结算 */
function finishLevel() {
  const run = store.run;
  run.clearing = true;
  if (store.mode === "race") {
    const won = !(store.raceAI && store.raceAI.finish);
    if (won) {
      addGold(300);
      showToast("🏆 比赛获胜！🪙+300");
    } else {
      showToast("🏁 抵达终点（对手更快）");
    }
  } else if (store.mode === "level") {
    const elapsed = store.time - run.levelStartTime;
    const L = LEVELS[store.selLevel];
    const ratio = run.totalCoins > 0 ? run.coinGot / run.totalCoins : 1;
    let s = 1;
    if (ratio >= 0.7) s = 2;
    if (elapsed < L.len / L.den3) s = 3; // 三星时限按关卡分层
    store.stars[store.selLevel] = Math.max(store.stars[store.selLevel] || 0, s);
    if (store.selLevel >= store.unlocked && store.selLevel < LEVELS.length - 1) {
      store.unlocked = store.selLevel + 1;
    }
    addGold(200); // 内部会 save()，一并写入解锁与星级
    showToast("🏁 通关 " + "★".repeat(s) + "！🪙+200");
    if (!run.runCrashed) checkAch("noc");
    if (run.totalCoins > 0 && run.coinGot >= run.totalCoins) checkAch("coinall");
    if (store.stars.length >= LEVELS.length && store.stars.every((v) => v >= 3)) checkAch("allstar");
  }
  setTimeout(() => nextLevel(), 800);
}

/** 是否掉出地图：以关卡地形最低点（无限模式为当前位置地面）为基准 */
function belowWorld(midX, midY) {
  const base = store.mode === "free" ? groundY(midX) + 800 : store.phys.minY + 800;
  return midY > base;
}

/** 每个固定步的游戏推进（由 core/loop.js 的 Stepper 调用） */
export function update(dt) {
  if (store.state === "pause") return;

  // 菜单 / 结算 / 车间中：只走时钟（背景动画继续）
  if (store.state !== "play" || store.shopOpen) {
    store.time += dt;
    return;
  }

  const run = store.run;
  const b = bike;
  const P = store.phys;

  if (b.locked) {
    if (key.right || key.left) {
      b.locked = false;
    } else {
      pinBike();
      return; // 等待起步：不推进时钟
    }
  }

  store.time += dt;
  stepPhysics();
  updateParticles();
  emitRideDust();
  updateStats(dt);
  drainFuel(dt);

  const fuelOk = P.fuel > 0;
  if (run.crashed) {
    run.crashTimer -= dt;
    if (run.crashTimer <= 0) respawn();
  }

  const mid = (b.rear.x + b.front.x) / 2;
  const midY = (b.rear.y + b.front.y) / 2;

  if (!isFinite(mid) || !isFinite(midY)) {
    respawn(); // 物理崩坏兜底
  } else if (b.grounded >= 2 && !run.crashed && Math.abs(groundInfo(mid).m) <= 0.2) {
    // 安全点只在"两轮贴地且坡度平缓(≤11°)"处更新
    run.lastSafeX = mid;
  }
  if (!run.crashed && belowWorld(mid, midY)) pitRewind();

  updateCoins();
  updateCanisters();
  updateBoosts();
  if (!fuelOk) handleFuelEmpty();

  if (toKmh(Math.abs(b.speed)) >= 30) checkAch("fast");

  if (store.mode === "race") {
    raceUpdate(dt);
    if (store.raceAI && store.raceAI.finish && !run.clearing) {
      run.clearing = true;
      showToast("😵 对手先到终点！");
      setTimeout(() => nextLevel(), 900);
    }
  }
  if (store.mode === "free") {
    freeFill();
  } else if (!run.clearing && mid > store.finishX) {
    finishLevel();
  }
}
