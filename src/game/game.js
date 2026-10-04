// 游戏主状态机：闯关 / 比赛 / 排位 / 无限，通关结算与重生
// 本模块不 import 任何 UI 模块，界面动作通过 initGame(presenter) 注入（避免循环依赖）
import {
  START_X, WHEELBASE, toM, toKmh, LAND_REF,
  RATING_MIN, RANK_GAIN_BASE, RANK_GAIN_BASE_ADV, RATING_LOSS, RATING_LOSS_ADVANCED,
  rankName, rankStars, rankPromoReward, rankDelta, rankGold,
  RACE_FORMATS, RACE_FORMAT_IDS, RACE_PLACE_GOLD } from "../config/constants.js";
import {
  LEVELS, levelAt, courseAt, segmentThemeAt, variantRule, FINALE_INDEX, FINALE, FINALE_SEGS,
  MODE_SPACE, SPACE_LEAGUES, SPACE_DIVS, SPACE_RACES, setSpaceRace, spaceDivOf, spaceRaceOf,
  spaceLeagueOf, spaceDefOf, spaceCourse, pinSpaceCourse, spaceRatingDelta,
} from "../config/levels.js";
import { THEMES } from "../config/themes.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, bike, world } from "../core/store.js";
import { key } from "../core/input.js";
import { view } from "../core/canvas.js";
import { clamp, goldNum } from "../core/utils.js";
import { showToast } from "../core/toast.js";
import { playCrashSound } from "../core/audio.js";
import { token } from "../config/ui-tokens.js";
import {
  save, addStat, settleProgress, isAdvancedUnlocked,
  noteVehicleRun, noteSpaceResult, noteLevelRun, noteRaceRun,
} from "../core/storage.js";
import { groundInfo, groundY, safeSpot } from "../physics/terrain.js";
import { applyUpgrades, bikeVx, crash, resetBike, stepPhysics, ignoresHazardLimit } from "../physics/bike.js";
import { initPhysicsEvents } from "../physics/events.js";
import { drainFuel, setFuel } from "../physics/fuel.js";
import { updateParticles, emitParticles } from "../render/particles.js";
import { addShake } from "../render/camera.js";
import { updateStats, settleLanding } from "./stats.js";
import { addGold, checkAch, syncStateAch, checkSpeedAch } from "./progress.js";
import {
  buildLevel, freeInit, freeFill, syncSegmentTheme, streamChunks,
  updateBoosts, updateCanisters, updateCoins, emitRideDust, updateJumps,
} from "./world.js";
import { raceInit, raceUpdate, spaceUpdate, raceFormat, racePlace } from "./race.js";

let presenter = { hideOverlay() {}, toMenu() {} };

// ---------------- 物理事件 → 表现 ----------------
// 物理层只派发事件；震屏 / 音效 / 粒子 / 提示 / 落地结算在 game 层接线。
// 颜色一律来自设计令牌或场景数据（不引入新的裸色值）。
initPhysicsEvents({
  onCrash: (e) => {
    addShake(11);
    playCrashSound();
    emitParticles(e.x, e.y, 20, { color: token("danger"), spd: 2, life: 25, size: 3, grav: 0.06 });
    showToast(
      "💥 摔车！燃料 -" + Math.round(e.fuelLoss * 100) + "% · 计时 +" + e.timePenalty + "s",
      900,
      "danger"
    );
  },
  onLand: (e) => {
    addShake(clamp((e.vimp / LAND_REF) * 3.0, 1.0, 7));
    const T = THEMES[store.phys.theme] || THEMES[0];
    if (isFinite(e.gy)) {
      emitParticles(e.x, e.gy - 2, 8, { color: T.dust.light, spd: 1.6, life: 20, size: 3, grav: 0.03 });
    }
    settleLanding();
  },
});

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

// ---------------- 宇宙场准入与金币任务（R3.5） ----------------
/** 宇宙级车的判据：tier === "宇宙"（7 台，maxLv 500，vehicles.js 里的宇宙分组） */
export function hasUniverseVehicle() {
  const owned = store.ownedVehicles || [];
  for (const i of owned) {
    const v = VEHICLES[i];
    if (v && v.tier === "宇宙") return true;
  }
  return false;
}

/**
 * 宇宙场的准入判据：**跑完过排位赛**（用户要求）。
 *
 * ★ 为什么用 wins ≥ 1 而不是"拥有宇宙车"或"登顶"：
 *   · 金币任务已经保证玩家会拿到 cv1，用"拥有车"当门槛等于没有门槛；
 *   · 用 `peak`（段位分 ≥ 3300「登顶」）门槛太高，那是满级玩家的终点，
 *     而宇宙场的中低级分级正是给中段玩家练的。
 *   · "排位赛赢过一场"恰好是"玩家已经熟悉竞速玩法"的信号 ——
 *     宇宙场本质是竞速，把它放在排位赛之后是自然的顺序。
 */
export function rankedCleared() {
  return (store.progress.wins || 0) > 0;
}

/**
 * 金币任务的目标车（未拥有时有效）：基础宇宙车「第一宇宙速度」。
 *
 * ★ 原为「归墟」（id=omega）。宇宙级车按真实宇宙速度重做后 omega 已不存在，
 *   任务目标顺延到新的入门档 cv1（7.9 km/s = 28,440 km/h）。
 *   门槛仍为累计赚取 ¥8e8：相对新的入门车价 ¥1e10 是"认真玩几十关能达成"，
 *   相对形态解锁价 ¥1.25e11 则是明确的早期目标。
 */
const QUEST_VEHICLE = "cv1";

/**
 * 宇宙场金币任务的状态（R3.5）。
 * 纯读取，便于 UI 直接展示与断言。
 * @returns {{done:boolean, hasQuest:boolean, need:number, got:number, progress:number}}
 */
export function spaceQuestState() {
  const idx = VEHICLES.findIndex((v) => v.id === QUEST_VEHICLE);
  const owned = (store.ownedVehicles || []).includes(idx);
  // 任务条件：累计金币收入达到 ¥5e7
  //
  // ★ 从 8e8 降到 5e7：432 关全通只能攒到约 ¥500 万（goldBase 700~2500/关 +
  //   赛道金币），原门槛 ¥8 亿比**全部主线产出高两个数量级** ——
  //   也就是说主线通关根本推不动它，宇宙场对认真玩的人实际是永久锁死的。
  //   ¥5e7 ≈ 通关主线 + 若干场比赛，是"认真玩就能到"而不是"刷到吐"。
  // ★ 判据是「通关 30 关」，由 stars 直接数出来 —— 不需要"累计金币收入"这种字段。
  //   那个字段唯一的用途就是这一个判据：每次吃金币都要往存档里累加一个
  //   会一直涨到 1e25 的数，而它答不了任何别的问题（玩家不关心历史总收入，
  //   余额与车库明细已经覆盖了）。用它当任务进度，代价大、收益只有一处。
  const need = 30;
  let got = 0;
  for (let i = 0; i < store.stars.length; i++) if ((store.stars[i] || 0) >= 1) got++;
  return {
    done: owned,
    hasQuest: !owned,
    need,
    got: Math.min(got, need),
    progress: Math.max(0, Math.min(1, got / need)),
  };
}

/** 完成任务 → 发放归墟（幂等：已拥有则直接返回 false） */
export function claimSpaceQuest() {
  const st = spaceQuestState();
  if (!st.hasQuest) return false;
  if (st.got < st.need) return false;
  const idx = VEHICLES.findIndex((v) => v.id === QUEST_VEHICLE);
  if (!(idx >= 0) || (store.ownedVehicles || []).includes(idx)) return false;
  if (!Array.isArray(store.ownedVehicles)) store.ownedVehicles = [0];
  store.ownedVehicles.push(idx);
  // ★ **不**改 store.currentVehicle：玩家可能正开着攒了满级的另一台车点"领取"，
  //   静默切车会把"当前车 + 全部升级档位"一起顶掉（免费发放 ≠ 可以替玩家做决定）。
  //   面板在领取后会提示"已获得归墟"，由玩家自己在车库切换。
  //
  // ★ 升级容器按**车 id** 键（storage.js 的 getUp 读 store.upgrades[veh.id]，
  //   sanitizeUpgrades 也只保留 u[veh.id]）。旧代码用下标 idx 写，
  //   写进去的是一个永远读不到的孤儿键，下次 save→load 直接被丢弃。
  //   这里其实不必写：getUp() 对缺失键会惰性补默认值，
  //   写了反而多一处与 sanitizeUpgrades 打架的地方。故不写。
  save();
  return true;
}

/** 关卡开始时重置与上一关相关的全部状态（否则会出现"重生到上一关坐标"等串档问题） */
function resetRunState() {
  const run = store.run;
  run.gen++; // 开启新的一局：世代号 +1，作废上一局的延迟结算回调
  run.seed = (Math.imul(run.gen, 0x9e3779b1) ^ (store.selLevel + 1) * 2654435761) >>> 0;  // 宇宙场对手抖动用
  run.crashed = false;
  run.crashTimer = 0;
  run.settling = false;
  run.lastSafeX = START_X;
  run.hasCrashed = false;
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
  // 比赛：赛制与档位都由面板选好（3 赛制 × 普通/排位 两档 = 6 个入口）
  if (store.mode === "race") raceInit(store.raceFormat);
  // 宇宙联赛：阵容取**该场赛事自己的赛制**（短距=1V1 / 群雄=6人 / 长程=3v3）。
  // 第二个参数 true = 借阵容但不改玩家在比赛面板选的赛制。
  else if (store.mode === MODE_SPACE) raceInit(spaceDefOf().fmt, true);
  resumeFinaleCheckpoint();
  store.state = "play";
  // 逐关记录：开局先记一次尝试，通关时 finishLevel 再刷新最佳用时与金币
  if (store.mode === "level" && store.selLevel < LEVELS.length) {
    noteLevelRun(store.selLevel, null);
    save();
  }
  presenter.hideOverlay();
}

/**
 * 终局关断点续玩（R1.3）。
 *
 * 进度语义：`progress.finaleSeg` = **已通过的段数**，断点 x = `FINALE.segments[finaleSeg].x`。
 *  · 从断点段首开始，因此该段内的门必须**预先标记为已通过** ——
 *    否则第 1 个门的 `limit` 是"从关卡起点累计到该门"的时间，
 *    而计时从断点才起算，会立刻超时判负。
 *    做法：把断点之前（含当前段）的门全部置 passed，并让 run.gateIdx 对齐到断点，
 *    于是"门计时"从下一个未过的门开始算，与从断点起跑的实际用时自洽。
 *  · 其它模式与 finaleSeg=0 时行为完全不变（回到起点，起点之前没有门）。
 */
function resumeFinaleCheckpoint() {
  if (store.mode !== "level" || store.selLevel !== FINALE_INDEX) return;
  const seg = store.progress.finaleSeg || 0;
  if (!(seg > 0)) return;
  const L = FINALE;
  const segs = L.segments;
  const clamped = Math.min(seg, segs.length);
  const x = clamped < segs.length ? segs[clamped].x : L.len;
  resetBike(x); // resetBike 内部会把 spawnX 也置为 x
  // 跳过已通过的门：标记 passed 并把游标推到断点之后第一个未过的门
  let idx = 0;
  for (const g of world.gates) {
    if (g.x <= x) { g.passed = true; idx++; } else break;
  }
  store.run.gateIdx = idx;
  store.cam.x = x;
  store.phys.theme = segmentThemeAt(L, x);
  const T = THEMES[store.phys.theme] || THEMES[0];
  store.phys.gravity = T.g;
  store.phys.traction = T.traction;
  showToast(`⏩ 从第 ${clamped + 1} / ${segs.length} 段继续（断点已恢复）`, 1800);
}

/**
 * 通过一个地形段的最后一个计时门时落盘断点（R1.3）。
 * @param {{seg:number}} g 刚通过的计时门
 */
function checkpointFinale(g) {
  if (store.mode !== "level" || store.selLevel !== FINALE_INDEX) return;
  if (g.seg == null) return;
  const done = g.seg + 1;              // 已通过的段数
  if (done <= (store.progress.finaleSeg || 0)) return; // 只前进，不回退
  store.progress.finaleSeg = Math.min(done, FINALE_SEGS);
  settleProgress();                     // 立即写盘
}

/**
 * 排位赛结算。
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
  const delta = rankDelta(before, adv, won); // 越高段位单场收益越高（constants 里有推导）
  P.rating = Math.max(RATING_MIN, before + delta);
  const applied = P.rating - before;
  if (won) P.wins++;
  else P.losses++;
  // 升段一次性奖励：让比赛阶段是"在爬 14 段阶梯"，而不是"重复同一场排位"。
  // promoClaimed 是只涨的水位线 —— 掉段再升回同一段位不会二次领钱（否则奖励可以反复刷）。
  const claimed = P.promoClaimed || 0;
  const promo = rankPromoReward(before, P.rating, claimed);
  if (promo > 0) addGold(promo);
  if (P.rating > claimed) P.promoClaimed = P.rating;
  syncStateAch();   // 段位晋升 / 里程 / 时长等状态型成就
  settleProgress(); // 刷新 peak / freeThemes 等派生态并立即落盘
  showToast(
    (won ? "🏆 排位胜利" : "🏳 排位失利") +
      (adv ? " · 高级赛" : " · 排位赛") +
      " · 段位分 " + (applied > 0 ? "+" : "") + applied +
      " → " + P.rating + "（" + rankName(P.rating) + " " + "★".repeat(rankStars(P.rating)) + "☆".repeat(3 - rankStars(P.rating)) + "）" +
      " · " + P.wins + "胜" + P.losses + "负" +
      (promo > 0 ? " · 升段奖励 🪙+" + promo.toLocaleString() : ""),
    promo > 0 ? 2400 : 1800
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
    const mode = m === "ranked" ? "race" : (m || store.lastMode);
    // 排位**档位**的准入：未收到邀请（通关最终任务）时，退回普通比赛而不是拒绝开局 ——
    //   排位档现在是比赛里的一个选项，直接拒绝会让玩家以为整个比赛坏了。
    const wantRanked = opt && opt.ranked !== undefined ? !!opt.ranked : store.raceRanked;
    if (wantRanked && mode === "race" && !store.progress.invited) {
      store.raceRanked = false;
      showToast("🔒 排位档未解锁（通关最终任务后开放）· 本局按普通比赛进行", 1600);
    } else {
      store.raceRanked = wantRanked;
    }
    // 宇宙场准入（两道门，用户要求"跑完排位赛才有"）：
    //  1) 排位赛赢过至少一场 —— 否则宇宙场只是竞速模式换个皮，
    //     放在排位赛之后才是自然的进度顺序。
    //  2) 拥有宇宙级车 —— 没有车只能干看着，先接受金币任务换一台入门款。
    if (mode === MODE_SPACE) {
      if (!rankedCleared()) {
        store.pendingSpace = true;
        showToast("🔒 宇宙场需要先赢下一场排位赛", 1800);
        return;
      }
      if (!hasUniverseVehicle()) {
        store.pendingSpace = true; // 由 ui 层弹出金币任务说明
        showToast("🔒 需要先完成宇宙场金币任务", 1500);
        return;
      }
    }
    store.mode = mode;
    // 高级赛请求：显式传入 opt.advanced 时以它为准（rating 未达标则降级为普通）；
    // 未传入时保留上一局的档位（重开 startGame() 不丢档）。
    const wantAdv = opt && opt.advanced !== undefined ? !!opt.advanced : store.rankedAdvanced === true;
    store.rankedAdvanced = store.raceRanked && wantAdv && isAdvancedUnlocked(store.progress.rating);
    store.selLevel = lv !== undefined ? lv : store.selLevel || 0;
    // 赛制：显式传入优先，否则沿用上一次选择（重开一局不丢赛制）
    if (mode === "race" && opt && opt.format && RACE_FORMATS[opt.format]) {
      store.raceFormatPick = opt.format;
    }
    if (store.mode === "free") freeInit(opt && opt.theme);
    else {
      if (store.mode === MODE_SPACE) {
        // ★ 顺序：定场次 → 重算极速 → 钉住赛道 → buildLevel。
        //
        //   1) 三级下标不传时**沿用本局的上次选择**：restart() 不传 opt，
        //      若回落 0，"在丙区打到一半按 R"会被重置成甲区另一条赛道，进度与名次双双错位。
        //   2) 赛道长度现在只由联赛 × 分区 × 赛次决定，**与玩家极速无关**，
        //      所以 applyUpgrades() 不再参与长度计算 —— 但仍要跑，
        //      因为 store.phys.topSpeed 是配速面板与"能不能赢"的判据。
        setSpaceRace(
          opt && opt.league !== undefined ? opt.league : spaceLeagueOf(),
          opt && opt.div !== undefined ? opt.div : spaceDivOf(),
          opt && opt.race !== undefined ? opt.race : spaceRaceOf(),
        );
        applyUpgrades();
        pinSpaceCourse(spaceCourse(spaceLeagueOf(), spaceDivOf(), spaceRaceOf()));
      }
      buildLevel();
    }
    if (store.mode !== MODE_SPACE) applyUpgrades();
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
    buildLevel();
    applyUpgrades();
    resetBike(START_X);
    resetRunState();
    store.cam.x = 0;
    fillTank();
    const NL = levelAt(store.selLevel);
    // 终局关不显示"第 433 关"（它不属于 432 关主线），同 hud.js 的口径
    const label = store.selLevel === FINALE_INDEX
      ? NL.name
      : "关卡 " + (store.selLevel + 1) + " · " + NL.name;
    showToast(
      label + " · " + (THEMES[segmentThemeAt(NL, 0)] || THEMES[0]).name,
      800
    );
    // 从结算结果卡进入下一关：必须恢复游玩状态并收起菜单遮罩，
    // 否则 store.state 会停在 "ended"，update() 直接早退 → 看起来"点不动"。
    store.state = "play";
    presenter.hideOverlay();
  } else {
    presenter.toMenu();
    if (store.mode === "level" && store.selLevel >= LEVELS.length - 1) showToast("🎉 全部通关！");
  }
}

/** belowWorld 里 dt 缺省时的兜底（正常调用一定传得到） */
const DT_HINT = 1 / 60;

/** 回到安全点 */
export function respawn() {
  const prev = store.run.lastSafeX;
  let sx = safeSpot(prev);
  // safeSpot 原地无解时会返回原值：必须强制前移，否则"回到同一点 → 再摔"死循环。
  if (sx === prev) sx = Math.max(24, prev + 80);
  store.run.lastSafeX = sx;
  resetBike(sx);
  bike.locked = false;
  store.run.crashed = false;
  store.cam.x = sx - view.W * 0.35;
  showToast("! 回到安全点", 420);
}

/** 掉出地图：回到安全点重来 */
export function pitRewind() {
  const prev = store.run.lastSafeX;
  let sx = safeSpot(prev);
  if (sx === prev) sx = Math.max(24, prev + 80); // 同 respawn：躲开原地死循环
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
    endFreeRun("⛽ 燃料耗尽");
  } else {
    setFuel(store.phys.fuelMax * 0.3);
    respawn();
    showToast("⛽ 燃料耗尽！回到安全点", 900);
  }
}

/**
 * 结束无限模式本局（燃料耗尽 / 玩家主动退出）。
 *
 * ★ 抽出来是因为两条路径的结算完全相同（里程、破纪录、累计统计），
 *   只有提示文案与延迟不同。原先只有燃料耗尽一条路，
 *   于是"想收手"只能硬生生把油跑光 —— 而高极速车（奇点 350 / 归墟 1000）
 *   的油量根本撑不到玩家想停的时候，无限模式因此变成"不敢开始"。
 * @param {string} reason 提示前缀（⛽ 燃料耗尽 / 🏁 主动结束）
 */
function endFreeRun(reason) {
  const mx = (bike.rear.x + bike.front.x) / 2;
  const dist = Math.round(toM(mx));
  let record = false;
  if (dist > store.best) {
    store.best = dist;
    store.space.free.runs += 1;
    store.space.free.bestMeters = dist;
    store.space.free.bestAt = new Date().toISOString();
    save();
    record = true;
  } else {
    store.space.free.runs += 1;
  }
  store.state = "ended";
  store.run.settling = true;
  // 结束结算：累计统计（本局 +1 次、里程按 100px=1m 换算）
  addStat({
    runs: 1,
    meters: dist,
    seconds: Math.max(0, store.time - store.run.levelStartTime),
    mode: "free",
  });
  const freeVeh = VEHICLES[store.currentVehicle];
  if (freeVeh) noteVehicleRun(freeVeh.id, dist);
  // ★ 里程类成就在这里核对：单次纪录（无限之巅 / 光年之旅）与累计里程
  //   （环游 / 马拉松 / 深空行者）都是本局结算后才有的数。
  syncStateAch();
  showToast(reason + " · 本次 " + dist + "m" + (record ? " 🏅 新纪录！" : ""), 1600);
  setTimeout(runGuard(() => {
    store.state = "menu";
    presenter.toMenu();
    store.raceAI = null;
    store.racers = [];
  }), 1600);
}

/**
 * 无限模式「中途退出」：玩家主动结束本局，走与燃料耗尽完全相同的结算。
 *
 * ★ 由 ui/menu.js 的「⏹ 结束本局」按钮调用。非无限模式下一律拒绝
 *   （闯关/比赛的中途退出要走暂停菜单，那里已经有一整排按钮，再加一个反而更乱）。
 */
export function quitFreeRun() {
  if (store.mode !== "free" || store.state !== "play") return false;
  if (store.run.settling) return false;
  endFreeRun("🏁 主动结束");
  return true;
}

/** 到达终点结算 */
function finishLevel() {
  const run = store.run;
  const L = courseAt(store.selLevel, store.mode);
  run.settling = true;
  // 结算结果卡：由 presenter 注入到 ui 层渲染（game 不 import ui）
  const result = {
    title: "🏁 本局结束",
    stars: undefined,
    goldGain: 0,
    goldTotal: 0,
    time: undefined,
    nextLabel: "下一关 →",
  };
  if (store.mode === "race" && !store.raceRanked) {
    const f = raceFormat();
    const won = !(store.raceAI && store.raceAI.finish);
    // 名次：多人竞技按名次发奖，团赛按队伍名次发奖（1V1 就是 1 或 2）
    const place = racePlace(store.racers, bike.rear.x);
    const p = f.team ? place[0] : place;
    const total = f.team ? 2 : f.riders + 1;
    // 名次奖金：第 1 名拿满，越靠后拿得越少，但**只要完赛就有**——
    // 6 人场跑第 5 也比 1V1 输一把的 0 块强，"多跑一场多赚一点"才有正反馈。
    const gold = RACE_PLACE_GOLD[Math.min(p - 1, RACE_PLACE_GOLD.length - 1)];
    noteRaceRun(RACE_FORMAT_IDS.indexOf(store.raceFormatPick), store.raceRanked, p, won);
    addGold(gold);
    result.nextLabel = "继续 →";
    result.goldGain = gold;
    result.place = p;
    result.placeTotal = total;
    const tag = f.team
      ? "团队接力 · 我方" + (p === 1 ? "获胜" : "惜败")
      : f.riders > 1 ? "多人竞技 · 第 " + p + " / " + total + " 名" : "比赛" + (won ? "获胜" : "失利");
    showToast((won ? "🏆 抵达终点 · " : "🏁 抵达终点 · ") + tag + " · 名次奖金 🪙+" + gold,
      1100, won ? "success" : "warn");
    result.title = (won ? "🏆 " : "🏁 ") + tag;
  } else if (store.mode === "race" && store.raceRanked) {
    // 排位档：胜负决定段位分变化（结算提示由 settleRanked 内部输出）。
    // ★ 与普通比赛共用同一个 mode —— 差别只在"结果算不算段位分"，
    //   所以名次奖金照发，段位分也照算，两者不冲突。
    const won = !(store.raceAI && store.raceAI.finish);
    const before = store.progress.rating;
    const after = settleRanked(won);
    result.title = won ? "🏆 排位胜利" : "🏳 排位失利";
    // 排位赛金币：胜利收益随段位分升高而升高（500 + rating×0.25）
    const gain = rankGold(won, before);
    addGold(gain);
    result.goldGain = gain;
    result.ratingDelta = after - before;
    result.rating = after;
    showToast((won ? "🏆 排位胜利 🪙+" : "🏳 排位失利 🪙+") + gain, 900, won ? "success" : "warn");
    result.nextLabel = "继续 →";
  } else if (store.mode === MODE_SPACE) {
    // 宇宙联赛结算：金币**只跟场次有关**（人人拿满，完赛就有 —— 输了也有，
    //   否则新分区里反复试错会被惩罚到不敢试）；联赛段位分才跟名次有关。
    const def = spaceDefOf();
    const fmt = RACE_FORMATS[def.fmt] || RACE_FORMATS.duel;
    const place = racePlace(store.racers, bike.rear.x);
    const p = fmt.team ? place[0] : place;
    const total = fmt.team ? 2 : fmt.riders + 1;
    const won = p === 1;
    addGold(def.gold);
    const delta = spaceRatingDelta(def.leagueIdx, def.divIdx, won);
    store.space.rating = Math.max(0, store.space.rating + delta);
    noteSpaceResult(def.key, p, won);
    if (won) checkAch("spacewin");
    // 全联赛横扫要读 records，所以必须在 noteSpaceResult **之后**核对
    syncStateAch();
    settleProgress();
    result.goldGain = def.gold;
    result.place = p;
    result.placeTotal = total;
    result.title = `${def.icon} 宇宙联赛 · ${fmt.team ? "我方" + (won ? "获胜" : "惜败") : "第 " + p + " / " + total + " 名"}`;
    result.nextLabel = "继续 →";
    showToast(
      `🌌 ${def.name} 完成 · 第 ${p}/${total} 名 · 🪙+${goldNum(def.gold)} · 联赛分 ${delta >= 0 ? "+" : ""}${delta} → ${store.space.rating}`,
      1800, won ? "success" : "warn"
    );
  } else if (store.mode === "level") {
    // 计时惩罚（摔车）计入本关用时，直接影响三星时限。
    // ★ 必须**先声明再用**：下面 noteLevelRun 那一行原本写在 const 之前，
    //   于是每次普通关卡通关都抛 ReferenceError（TDZ），finishLevel 整个中断 ——
    //   表现就是"骑过终点却不算过关"，星级、金币、解锁全都没写。
    const elapsed = store.time - run.levelStartTime + run.penaltyTime;
    // 逐关记录：最佳用时 / 最佳金币在这里一次性写回
    noteLevelRun(store.selLevel, { done: true, ms: elapsed * 1000, coins: run.coinGot });
    const ratio = run.totalCoins > 0 ? run.coinGot / run.totalCoins : 1;
    let s = 1;
    if (ratio >= 0.7) s = 2;
    if (elapsed < L.len / L.den3) s = 3; // 三星时限按关卡分层
    store.stars[store.selLevel] = Math.max(store.stars[store.selLevel] || 0, s);
    if (store.selLevel >= store.unlocked && store.selLevel < LEVELS.length - 1) {
      store.unlocked = store.selLevel + 1;
    }
    // ★ 通关环大陆（最终任务）时置 finaleDone —— 这一行以前**根本不存在**，
    //   而 storage.js 的 deriveUnlocks 只读它：`invited`（排位赛邀请）
    //   与"最终任务卡"的完成态全都由它派生。所以通关究极任务之后，
    //   排位赛入口永远是锁着的，玩家只能靠手改存档解锁。
    if (store.selLevel === FINALE_INDEX) {
      store.progress.finaleDone = true;
      showToast("🎯 通关「环大陆」！排位赛已解锁", 2200, "success");
    }
    // 通关固定奖励随全局进度递增（280 → 1000）：写死 200 时 432 关一轮的总收入
    // 撑不起任何一辆车的升级曲线。数值由 makeLevel 反推，见 levels.js 的注释。
    addGold(L.goldBase); // 内部会 save()，一并写入解锁与星级
    showToast("🏁 通关 " + "★".repeat(s) + "！🪙+" + L.goldBase, 900, "success");
    result.title = "🏁 通关";
    result.stars = s;
    result.goldGain = L.goldBase;
    result.time = elapsed;
    result.nextLabel = store.selLevel < LEVELS.length - 1 ? "下一关 →" : "🏠 返回菜单";
    if (!run.hasCrashed) checkAch("noc");
    if (run.totalCoins > 0 && run.coinGot >= run.totalCoins) checkAch("coinall");
    if (store.stars.length >= LEVELS.length && store.stars.every((v) => v >= 3)) checkAch("allstar");
    // 「十连无瑕」的计数：连续零摔车通关（摔了就清零，不累计）。
    // 口径必须是**连续**而不是累计 —— 累计的话玩家随便玩也会凑够 30 局，
    // 成就就没有分量了。
    store.stat.cleanRuns = run.hasCrashed ? 0 : (store.stat.cleanRuns || 0) + 1;
    if (store.selLevel === FINALE_INDEX) checkAch("finale");
    // 通关结算：刷新阶梯派生态（支线通关 / 邀请 / 登顶）并立即写盘
    settleProgress();
  }
  // 累计统计：本局 +1 次、里程按 100px=1m 换算、时长为本局有效游玩时间。
  // mode 一并记进 byMode（v5 新增的分模式统计），并给当前车记一程里程。
  const runMeters = toM(store.finishX);
  addStat({
    runs: 1,
    meters: runMeters,
    seconds: Math.max(0, store.time - run.levelStartTime),
    mode: store.mode,
  });
  const curVeh = VEHICLES[store.currentVehicle];
  if (curVeh) noteVehicleRun(curVeh.id, runMeters);
  // 结算尾声统一核对一次状态型成就：里程 / 时长 / 排位 / 车库 / 联赛 / 最终任务。
  // 幂等，所以"这里再调一次"不会重复弹提示。
  syncStateAch({ cleanRuns: store.stat.cleanRuns || 0 });
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
  run.settling = true;
  run.failed = true;
  showToast("⏱ 限时门超时！本关判负（不计星、不解锁）", 1800);
  setTimeout(runGuard(() => {
    store.state = "menu";
    presenter.toMenu();
  }), 1800);
}

/** 是否掉出地图：以关卡地形最低点（无限模式为当前位置地面）为基准 */
function belowWorld(midX, midY, dt) {
  // ★ 宇宙场必须走**局部地面**，不能用 store.phys.floorY：
  //   floorY = measureBottomY(L)，采样数封顶在 2 万次，而宇宙场顶级赛道长
  //   3150 亿 px（步长 7.56e6 px）。2 万个样本取 max 只是个近似值，
  //   而地形基准线在这么长的赛道上漂移可达数百万 px —— 实测 floorY 只有 461，
  //   局部真实地面却到 1186，正常飞行的车被反复判成"掉出地图"。
  //
  // ★ 余量还要随**每帧位移**放大：FLIGHT_HOVER 的升降速度上限是 1600 px/s
  //   （26.7 px/帧），而顶级宇宙车一帧横移 290 万 px —— 地面在一帧之内就能
  //   降下几十万 px，悬停伺服物理上追不上。若按固定 800px 判，落差稍大的
  //   连续下坡就会每几帧触发一次 pitRewind；而飞行中 `grounded` 恒为 0，
  //   lastSafeX 永不更新，于是每次都退回起点（实测第七宇宙速度在难/极难/终极
  //   三档跑 1000 秒仍停在 1~3 Mpx）。
  //   余量取"每帧位移 × 1.8"≈ 60° 坡 —— 覆盖本项目最高的 26° 坡还有余量，
  //   而对慢速车（每帧几十 px）几乎不改变行为，掉坑判定照常生效。
  if (store.mode === MODE_SPACE) {
    const perFrame = Math.abs(bikeVx()) * (dt || DT_HINT);
    return midY > groundY(midX) + 800 + perFrame * 1.8;
  }
  const base = store.mode === "free" ? groundY(midX) + 800 : store.phys.floorY + 800;
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

  if (b.awaitingStart) {
    if (key.right || key.left) {
      b.awaitingStart = false;
    } else {
      pinBike();
      return; // 等待起步：不推进时钟
    }
  }

  store.time += dt;

  stepPhysics();
  // 最终任务多场景串联：按车身中点所属分段同步渲染主题与重力/抓地。
  // 放在 stepPhysics 之后：渲染主题始终与"本帧实际渲染的车身位置"一致（不会滞后 1 帧）。
  // ★ 物理连续性：本函数只改写 store.phys 的 theme / gravity / traction，
  //   绝不触碰 bike.rear / bike.front / bike.head 的 x / y / px / py；重力与抓地是按分段
  //   取值的常量，切换只改变"后续子步的加速度"，已经积分的当前帧状态不受影响。
  //   因此跨越分界点绝不会出现位置瞬移、速度突变或 NaN。
  if (store.mode === "level" || store.mode === "race" || store.mode === MODE_SPACE) {
    syncSegmentTheme(courseAt(store.selLevel, store.mode), (b.rear.x + b.front.x) / 2);
  }
  // 流式实体（宇宙场）：按相机位置铺/丢 chunk。放在物理之后，
  // 于是本帧的相机已经是物理推进后的真实位置，剔除窗口不会落后一帧。
  streamChunks();
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
  if (!run.crashed && belowWorld(mid, midY, dt)) pitRewind();

  updateCoins();
  updateCanisters();
  updateBoosts(dt);
  updateJumps();
  if (!fuelOk) handleFuelEmpty();

  if (toKmh(Math.abs(b.speed)) >= 30) checkAch("fast");
  // ★ 光速梯队的五个成就（c / 10c / 100c / 1000c / 10000c）在这里判定。
  //   checkSpeedAch 内部按门槛递增提前 break，每帧最多一次比较 + 少量幂等调用。
  checkSpeedAch(toKmh(Math.abs(b.speed)));

  // ---- 机制判定：危险段超速必摔 / 限时门准时通过 ----
  // ★ 宇宙场也走危险段判定：world.hazards 在 space 下照样生成、scene.js 也照样画，
  //   若这里不判，玩家会看到 2500 条限速警示带却毫无后果 —— 纯装饰性机制。
  //   （限时门 gateN=0，world.gates 为空，第二个分支自然不进。）
  if ((store.mode === "level" || store.mode === MODE_SPACE) && !run.settling) {
    if (!run.crashed && world.hazards.length && !ignoresHazardLimit()) {
      const spd = Math.abs(bikeVx());
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
          // ★ 终局关断点续玩（R1.3）：每通过一个地形段的**最后一个门**就落盘。
          //   判据用 g.seg（buildGates 按段布门时写入），且只在段号前进时落盘，
          //   所以 360 个门不会触发 360 次写盘 —— 每段恰好一次。
          checkpointFinale(g);
        }
      }
    }
  }

  if (store.mode === MODE_SPACE) {
    // 宇宙场：AI 先到终点不判负（本地模拟，奖励只看是否完赛，见 finishLevel）
    spaceUpdate(dt);
  } else if (store.mode === "race") {
    raceUpdate(dt);
    if (store.raceAI && store.raceAI.finish && !run.settling) {
      run.settling = true;
      if (store.raceRanked) {
        settleRanked(false); // 对手先到终点 → 排位判负，立即结算段位分
      } else {
        showToast("😵 对手先到终点！");
      }
      setTimeout(runGuard(() => nextLevel()), 900);
    }
  }
  if (store.mode === "free") {
    freeFill();
  } else if (!run.settling && mid > store.finishX) {
    finishLevel();
  }
}


