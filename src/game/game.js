// 游戏主状态机：闯关 / 比赛 / 排位 / 无限，通关结算与重生
// 本模块不 import 任何 UI 模块，界面动作通过 initGame(presenter) 注入（避免循环依赖）
import {
  START_X, WHEELBASE, SUBV, toM, toKmh,
  RATING_MIN, RATING_WIN_GAIN, RATING_LOSS,
  RATING_WIN_GAIN_ADVANCED, RATING_LOSS_ADVANCED, rankName,
} from "../config/constants.js";
import { LEVELS, levelAt, segmentThemeAt, variantRule, airTargetOf } from "../config/levels.js";
import { THEMES } from "../config/themes.js";
import { store, bike, world } from "../core/store.js";
import { key } from "../core/input.js";
import { view } from "../core/canvas.js";
import { showToast } from "../core/toast.js";
import { save, addStat, settleProgress, isAdvancedUnlocked } from "../core/storage.js";
import { groundInfo, groundY, safeSpot } from "../physics/terrain.js";
import { applyUpgrades, crash, resetBike, stepPhysics } from "../physics/bike.js";
import { drainFuel, setFuel } from "../physics/fuel.js";
import { updateParticles } from "../render/particles.js";
import { updateStats } from "./stats.js";
import { addGold, checkAch } from "./progress.js";
import {
  buildLevel, freeInit, freeFill, syncSegmentTheme,
  updateBoosts, updateCanisters, updateCoins, emitRideDust, updateJumps,
} from "./world.js";
import { raceInit, raceUpdate } from "./race.js";

let presenter = { hideOverlay() {}, toMenu() {} };

/** 由 main.js 注入界面动作 */
export function initGame(p) {
  if (p) presenter = p;
}

/**
 * 单局世代守卫：把延迟结算回调绑定到"当前这一局"。
 * 玩家在结算动画期间按 R 重开 / 自动进入下一关后，旧回调必须失效，
 * 否则会把新开的一局推走（历史上出现过的"串档"缺陷）。
 */
export function runGuard(fn) {
  const g = store.run.gen;
  return () => {
    if (g !== store.run.gen) return;
    fn();
  };
}

/** 关卡开始时重置与上一关相关的全部状态（否则会出现"重生到上一关坐标"等串档问题） */
function resetRunState() {
  const run = store.run;
  run.gen++; // 开启新的一局：世代号 +1，作废上一局的延迟结算回调
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
  run.penaltyTime = 0;
  run.crashStall = 0;
  run.gateIdx = 0;
  run.failed = false;
  run.totalCoins =
    store.mode === "level" && levelAt(store.selLevel) ? levelAt(store.selLevel).coinN : 0;
  world.particles = [];
  world.airScore = 0;
  store.cam.shake = 0;
}

function pinBike() {
  bike.rear.x = bike.spawnX;
  bike.front.x = bike.spawnX + WHEELBASE;
  bike.head.x = bike.spawnX + WHEELBASE * 0.5;
}

/**
 * 开局/换关加满油。
 * 变体（sprint / fuelrun）把"少放的赛道油罐"折算成"赛前预加油"：
 * 直接放大本局油箱容量，这样 refuel / fuelRatio / 耗尽判定全部自洽。
 * fuelMax 由 applyUpgrades 从车辆基准重算，因此重复调用不会累积放大。
 */
function fillTank() {
  const pf = world.prepFuel || 0;
  if (pf > 0) store.phys.fuelMax *= 1 + pf;
  setFuel(store.phys.fuelMax);
}

function beginRun() {
  resetBike(START_X);
  resetRunState();
  store.cam.x = 0;
  fillTank();
  if (store.mode === "race" || store.mode === "ranked") raceInit();
  store.state = "play";
  presenter.hideOverlay();
}

/**
 * 排位赛结算（Task 11.1 / 11.3 / 11.4）。
 *  · 胜 +N / 负 -M（高档位高级赛的数值更高），下限 RATING_MIN=0，绝不出现负数
 *  · 战绩累加 wins / losses；rating ≥ RATING_PEAK 由 settleProgress → deriveUnlocks 永久置 peak
 *  · settleProgress() 刷新阶梯派生态并立即落盘
 * 导出以便测试直接断言数值（无需真跑一整场排位赛）。
 * @param {boolean} won 是否获胜
 * @returns {number} 结算后的段位分
 */
export function settleRanked(won) {
  const P = store.progress;
  const adv = store.rankedAdvanced === true;
  const before = P.rating;
  const delta = won
    ? (adv ? RATING_WIN_GAIN_ADVANCED : RATING_WIN_GAIN)
    : -(adv ? RATING_LOSS_ADVANCED : RATING_LOSS);
  P.rating = Math.max(RATING_MIN, before + delta);
  const applied = P.rating - before;
  if (won) P.wins++;
  else P.losses++;
  settleProgress(); // 刷新 peak / freeThemes 等派生态并立即落盘
  showToast(
    (won ? "🏆 排位胜利" : "🏳 排位失利") +
      (adv ? " · 高级赛" : " · 排位赛") +
      " · 段位分 " + (applied > 0 ? "+" : "") + applied +
      " → " + P.rating + "（" + rankName(P.rating) + "）" +
      " · " + P.wins + "胜" + P.losses + "负",
    1800
  );
  return P.rating;
}

/**
 * 开局（菜单按钮 / 关卡面板 / 重开都走这里）。
 * @param {string} [m] 模式：level | race | free | ranked
 * @param {number} [lv] 关卡下标（排行/比赛用）
 * @param {{advanced?:boolean, theme?:number}} [opt]
 *   · advanced：仅 ranked 有效，请求高级赛（rating < RATING_ADVANCED 时降级为普通）
 *   · theme：仅 free 有效，指定场景（未登顶时被 freeInit 忽略）
 */
export function startGame(m, lv, opt) {
  try {
    const mode = m || store.lastMode;
    // 排位赛准入：未收到邀请（通关最终任务）时拒绝开局，且不改动任何状态
    if (mode === "ranked" && !store.progress.invited) {
      showToast("🔒 尚未收到排位赛邀请（通关最终任务后解锁）", 1500);
      return;
    }
    store.lastMode = mode;
    store.mode = mode;
    // 高级赛请求：显式传入 opt.advanced 时以它为准（rating 未达标则降级为普通）；
    // 未传入时保留上一局的档位（重开 startGame() 不丢档）。
    const wantAdv = opt && opt.advanced !== undefined ? !!opt.advanced : store.rankedAdvanced === true;
    store.rankedAdvanced = mode === "ranked" && wantAdv && isAdvancedUnlocked(store.progress.rating);
    store.selLevel = lv !== undefined ? lv : store.selLevel || 0;
    if (store.mode === "free") freeInit(opt && opt.theme);
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
    fillTank();
    const NL = levelAt(store.selLevel);
    showToast(
      "关卡 " + (store.selLevel + 1) + " · " + NL.name +
        " · " + (THEMES[segmentThemeAt(NL, 0)] || THEMES[0]).name,
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
    // 结束结算：累计统计（本局 +1 次、里程按 100px=1m 换算）（Task 9.5）
    addStat({
      runs: 1,
      meters: dist,
      seconds: Math.max(0, store.time - store.run.levelStartTime),
    });
    showToast("⛽ 燃料耗尽 · 本次 " + dist + "m" + (record ? " 🏅 新纪录！" : ""), 1600);
    setTimeout(runGuard(() => {
      store.state = "menu";
      presenter.toMenu();
      store.raceAI = null;
    }), 1600);
  } else {
    setFuel(store.phys.fuelMax * 0.3);
    respawn();
    showToast("⛽ 燃料耗尽！回到安全点", 900);
  }
}

/** 到达终点结算 */
function finishLevel() {
  const run = store.run;
  const L = levelAt(store.selLevel);
  // airtime 变体：先验"累计滞空 + 连招"是否达标，未达标不判通过并提示差距
  if (store.mode === "level" && L) {
    const target = airTargetOf(L);
    if (target > 0 && world.airScore < target) {
      run.clearing = true;
      run.failed = true;
      showToast(
        "🕊 滞空不足！需 " + target.toFixed(1) + "s · 当前 " + world.airScore.toFixed(1) +
          "s（差 " + (target - world.airScore).toFixed(1) + "s）",
        2200
      );
      setTimeout(runGuard(() => {
        store.state = "menu";
        presenter.toMenu();
      }), 2200);
      return;
    }
  }
  run.clearing = true;
  // 结算结果卡（Task 8.3）：由 presenter 注入到 ui 层渲染（game 不 import ui）
  const result = {
    title: "🏁 本局结束",
    stars: undefined,
    goldGain: 0,
    goldTotal: 0,
    time: undefined,
    nextLabel: "下一关 →",
  };
  if (store.mode === "race") {
    const won = !(store.raceAI && store.raceAI.finish);
    result.nextLabel = "继续 →";
    if (won) {
      addGold(300);
      showToast("🏆 比赛获胜！🪙+300", 900, "success");
      result.title = "🏆 比赛获胜！";
      result.goldGain = 300;
    } else {
      showToast("🏁 抵达终点（对手更快）", 900, "warn");
      result.title = "🏁 抵达终点（对手更快）";
    }
  } else if (store.mode === "ranked") {
    // 排位赛：胜负直接决定段位分变化（结算提示由 settleRanked 内部输出）
    const won = !(store.raceAI && store.raceAI.finish);
    const before = store.progress.rating;
    const after = settleRanked(won);
    result.title = won ? "🏆 排位胜利" : "🏳 排位失利";
    result.ratingDelta = after - before;
    result.rating = after;
    result.nextLabel = "继续 →";
  } else if (store.mode === "level") {
    // 计时惩罚（摔车）计入本关用时，直接影响三星时限
    const elapsed = store.time - run.levelStartTime + run.penaltyTime;
    const ratio = run.totalCoins > 0 ? run.coinGot / run.totalCoins : 1;
    let s = 1;
    if (ratio >= 0.7) s = 2;
    if (elapsed < L.len / L.den3) s = 3; // 三星时限按关卡分层
    store.stars[store.selLevel] = Math.max(store.stars[store.selLevel] || 0, s);
    if (store.selLevel >= store.unlocked && store.selLevel < LEVELS.length - 1) {
      store.unlocked = store.selLevel + 1;
    }
    addGold(200); // 内部会 save()，一并写入解锁与星级
    showToast("🏁 通关 " + "★".repeat(s) + "！🪙+200", 900, "success");
    result.title = "🏁 通关";
    result.stars = s;
    result.goldGain = 200;
    result.time = elapsed;
    result.nextLabel = store.selLevel < LEVELS.length - 1 ? "下一关 →" : "🎯 最终任务";
    if (!run.runCrashed) checkAch("noc");
    if (run.totalCoins > 0 && run.coinGot >= run.totalCoins) checkAch("coinall");
    if (store.stars.length >= LEVELS.length && store.stars.every((v) => v >= 3)) checkAch("allstar");
    // 通关结算：刷新阶梯派生态（支线通关 / 邀请 / 登顶）并立即写盘（Task 9.4 / 9.6）
    settleProgress();
  }
  // 累计统计：本局 +1 次、里程按 100px=1m 换算、时长为本局有效游玩时间（Task 9.5）
  addStat({
    runs: 1,
    meters: toM(store.finishX),
    seconds: Math.max(0, store.time - run.levelStartTime),
  });
  result.goldTotal = store.gold;
  // 有结果卡渲染器时交给它（玩家自选下一关/返回）；否则回退到定时自动推进
  if (typeof presenter.presentResult === "function") presenter.presentResult(result);
  else setTimeout(runGuard(() => nextLevel()), 800);
}

/** 带原因的摔车：只有在"本次真的摔了"时覆盖提示文案 */
function crashWithReason(msg) {
  const was = store.run.crashed;
  crash();
  if (!was && store.run.crashed) showToast(msg, 1000);
}

/** 限时门超时：本局判负（不计星、不解锁），回到关卡入口 */
function gateFail() {
  const run = store.run;
  run.clearing = true;
  run.failed = true;
  showToast("⏱ 限时门超时！本关判负（不计星、不解锁）", 1800);
  setTimeout(runGuard(() => {
    store.state = "menu";
    presenter.toMenu();
  }), 1800);
}

/** 是否掉出地图：以关卡地形最低点（无限模式为当前位置地面）为基准 */
function belowWorld(midX, midY) {
  // 关卡模式：低于本关地形真实最低点（世界 y 最大）以下 800px 判定掉坑；
  // 无限模式：低于"当前位置地面以下 800px"判定掉坑。
  const base = store.mode === "free" ? groundY(midX) + 800 : store.phys.minY + 800;
  return midY > base;
}

/** 每个固定步的游戏推进（由 core/loop.js 的 Stepper 调用） */
export function update(dt) {
  if (store.state === "pause") return;

  // 菜单 / 结算中：只走时钟（背景动画继续）
  if (store.state !== "play") {
    store.time += dt;
    return;
  }
  // 骑行中打开升级车间：连时钟一起冻结，否则会白吃三星时限
  if (store.shopOpen) return;

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
  // 最终任务多场景串联：按车身中点所属分段同步渲染主题与重力/抓地。
  // 放在 stepPhysics 之后：渲染主题始终与"本帧实际渲染的车身位置"一致（不会滞后 1 帧）。
  // ★ 物理连续性（Task 8.3）：本函数只改写 store.phys 的 theme / GRAV / TRACTION，
  //   绝不触碰 bike.rear / bike.front / bike.head 的 x / y / px / py；重力与抓地是按分段
  //   取值的常量，切换只改变"后续子步的加速度"，已经积分的当前帧状态不受影响。
  //   因此跨越分界点绝不会出现位置瞬移、速度突变或 NaN。
  if (store.mode === "level") {
    syncSegmentTheme(levelAt(store.lvIdx), (b.rear.x + b.front.x) / 2);
  }
  updateParticles();
  emitRideDust();
  updateStats(dt);
  drainFuel(dt);

  const fuelOk = P.fuel > 0;
  if (run.crashed) {
    const stall = Math.min(dt, run.crashTimer);
    run.crashStall += stall; // 昏迷时长不计入限时门（否则摔车等于双重惩罚）
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
  updateJumps();
  if (!fuelOk) handleFuelEmpty();

  if (toKmh(Math.abs(b.speed)) >= 30) checkAch("fast");

  // ---- 机制判定：危险段超速必摔 / 限时门准时通过 ----
  if (store.mode === "level" && !run.clearing) {
    if (!run.crashed && world.hazards.length) {
      const spd = Math.abs((b.front.x - b.front.px) * SUBV);
      for (const h of world.hazards) {
        if (mid >= h.x0 && mid <= h.x1 && spd > h.vmax) {
          crashWithReason("⚠️ 危险路段超速！燃料 -8% · 计时 +2s");
          break;
        }
      }
    }
    if (!run.failed && world.gates.length) {
      const g = world.gates[run.gateIdx];
      if (g && mid > g.x) {
        // 门计时 = 有效骑行时间（扣掉摔车昏迷），与三星判定用的"含惩罚用时"分开
        const rideTime = store.time - run.levelStartTime - run.crashStall;
        if (rideTime > g.limit) {
          gateFail();
        } else {
          g.passed = true;
          run.gateIdx++;
          showToast("⏱ 计时门 " + run.gateIdx + "/" + world.gates.length + " 通过", 600);
        }
      }
    }
  }

  if (store.mode === "race" || store.mode === "ranked") {
    raceUpdate(dt);
    if (store.raceAI && store.raceAI.finish && !run.clearing) {
      run.clearing = true;
      if (store.mode === "ranked") {
        settleRanked(false); // 对手先到终点 → 排位判负，立即结算段位分
      } else {
        showToast("😵 对手先到终点！");
      }
      setTimeout(runGuard(() => nextLevel()), 900);
    }
  }
  if (store.mode === "free") {
    freeFill();
  } else if (!run.clearing && mid > store.finishX) {
    finishLevel();
  }
}
