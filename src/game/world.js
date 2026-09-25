// 世界实体：关卡构建（金币 / 油罐 / 加速带 / 装饰）、拾取、骑尘
import { mulberry32, clamp } from "../core/utils.js";
import { SUB_DT, REF_SPEED, DUST_V, DUST_HEAVY_V } from "../config/constants.js";
import { THEMES } from "../config/themes.js";
import { LEVELS, levelHillY, STEP_W } from "../config/levels.js";
import { store, world, bike } from "../core/store.js";
import { groundInfo, groundY, canSpot } from "../physics/terrain.js";
import { getUp } from "../core/storage.js";
import { VEHICLES } from "../config/vehicles.js";
import { view } from "../core/canvas.js";
import { emitParticles } from "../render/particles.js";
import { showToast } from "../core/toast.js";
import { playCoinSound, playBoostSound } from "../core/audio.js";
import { addGold } from "./progress.js";
import { pickCanister } from "./stats.js";

/** 关卡地形最低点（用于"掉出地图"判定）：直接用纯地形函数，避免依赖当前 lvIdx */
function measureMinY(L) {
  let min = Infinity;
  for (let x = 0; x <= L.len; x += 25) {
    const y = levelHillY(L, x);
    if (y < min) min = y;
  }
  return isFinite(min) ? min : 300;
}

/** 生成装饰物（纯视觉）：只长在坡度平缓的地方 */
function buildDeco(L, rng) {
  const T = THEMES[L.theme];
  const trees = [];
  const rocks = [];
  for (let x = 220; x < L.len - 120; x += 55 + rng() * 150) {
    const gi = groundInfo(x);
    if (gi.y === Infinity) continue;
    if (Math.abs(gi.m) > 0.5) continue; // 太陡的地方不长东西
    const s = 0.7 + rng() * 0.7;
    const ph = rng() * 6.28;
    if (rng() < 0.58) {
      trees.push({ x, y: gi.y, kind: T.deco[0], s, ph });
    } else {
      rocks.push({ x, y: gi.y, kind: T.deco[1], s, ph });
    }
  }
  return { trees, rocks };
}

/** 构建关卡（金币、油罐、加速带、装饰、环境物理） */
export function buildLevel(idx) {
  store.lvIdx = idx;
  const L = LEVELS[idx];
  const rng = mulberry32(1000 + idx * 97);
  store.finishX = L.len;
  store.phys.theme = L.theme;
  store.phys.minY = measureMinY(L);

  const T = THEMES[L.theme];
  store.phys.GRAV = T.g;
  store.phys.TRACTION = T.traction;

  // ---------------- 金币 ----------------
  const coins = [];
  for (let i = 0; i < L.coinN; i++) {
    const cx = L.len * 0.15 + (i * (L.len * 0.75)) / (L.coinN - 1);
    coins.push({ x: cx, y: groundY(cx) - 35, taken: false, ph: rng() * 6.28 });
  }

  // ---------------- 油罐 ----------------
  // 按真实油耗模型反推，保证"够通关但不宽裕"，漏罐即有代价
  //   平均消耗 kAvg = kIdle + duty×(kFull-kIdle)，duty=0.62
  //   平均地速 vAvg = 0.78×基准极速（真实 px/s）
  //   本关需求 need = len / range（箱）；每罐补 0.45 箱
  //   容错余量 M：前期 1.42（撒开了跑），末关 1.14（每一罐都得吃到）
  const vh = VEHICLES[store.currentVehicle];
  const up = getUp();
  const fMax = vh.tank * (1 + 0.004 * up.frame);
  const kIdle = ((0.005 * vh.wgt) / fMax) * L.fuelK;
  const kFull = ((0.021 * vh.wgt) / fMax) * L.fuelK;
  const kAvg = kIdle + 0.62 * (kFull - kIdle);
  const vAvg = 0.78 * REF_SPEED * vh.spd;  const range = vAvg / kAvg;
  const need = L.len / range;
  const M = 1.42 - 0.28 * L.ramp;
  let n = Math.ceil((need * M - 1) / 0.45);

  const canisters = [];
  if (n <= 1) {
    const cx = canSpot(L.len, L.len * 0.5);
    canisters.push({ x: cx, y: groundY(cx) - 26, taken: false, ph: rng() * 6.28 });
  } else {
    n = Math.min(n, 6);
    // 多罐关：均匀铺开在 [20%, 84%] 区间，且落在平缓处（陡坡/坡顶会被腾空飞过）
    const x0 = L.len * 0.2;
    const x1 = L.len * 0.84;
    for (let i = 0; i < n; i++) {
      const x = canSpot(L.len, x0 + ((x1 - x0) * i) / (n - 1));
      canisters.push({ x, y: groundY(x) - 26, taken: false, ph: rng() * 6.28 });
    }
  }

  // ---------------- 加速带 ----------------
  // 铺在"前方迎面是上坡"的位置；越到后期越少（前期教学友好，后期靠自己）
  const boosts = [];
  const boostN = Math.max(1, 3 - Math.round(L.ramp * 2));
  for (let k = 1; k <= boostN; k++) {
    let bx = Math.round(L.len * (0.12 + (0.76 * k) / (boostN + 1)));
    for (let s = 0; s < 70; s++) {
      if (groundInfo(bx).m < 0.25 && groundInfo(bx + 240).m < -0.35) break;
      bx += 12;
    }
    bx = clamp(bx, 120, L.len - 300);
    boosts.push({ x: bx, y: groundY(bx) - 4, taken: false, ph: rng() * 6.28 });
  }

  const deco = buildDeco(L, mulberry32(5000 + idx * 131));
  world.coins = coins;
  world.canisters = canisters;
  world.boosts = boosts;
  world.decoTree = deco.trees;
  world.decoRock = deco.rocks;
}

/** 无限模式初始化 */
export function freeInit() {
  store.mode = "free";
  store.lvIdx = 0;
  store.finishX = Infinity;
  store.phys.theme = 0;
  store.phys.minY = 0; // 无限模式用"当前位置地面以下 800px"判定
  store.phys.GRAV = THEMES[0].g;
  store.phys.TRACTION = THEMES[0].traction;
  world.coins = [];
  world.canisters = [];
  world.boosts = [];
  world.decoTree = [];
  world.decoRock = [];
  world.freeGenX = 0;
}

/** 无限模式：按需生成前方实体（随里程缓慢加难） */
export function freeFill() {
  const rng = Math.random;
  const viewR = store.cam.x + view.W * 2;
  let guard = 0;
  while (world.freeGenX < viewR && guard++ < 200) {
    const d = Math.max(0, world.freeGenX - 400);
    const diff = Math.min(1, d / 120000);
    const diffS = diff * diff * (3 - 2 * diff);
    const x = world.freeGenX;
    const gy = groundY(x);
    if (gy !== Infinity) {
      if (rng() < 0.85 - diffS * 0.4) {
        world.coins.push({ x, y: gy - 30, taken: false, ph: rng() * 6.28 });
      }
      if (rng() < 0.11) {
        world.canisters.push({ x, y: gy - 26, taken: false, ph: rng() * 6.28 });
      }
      // 装饰
      const T = THEMES[0];
      if (rng() < 0.6) {
        world.decoTree.push({ x: x + 60, y: groundY(x + 60), kind: T.deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
      } else if (rng() < 0.3) {
        world.decoRock.push({ x: x + 90, y: groundY(x + 90), kind: T.deco[1], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
      }
    }
    world.freeGenX += Math.round(170 + diffS * 260 + rng() * 280);
  }
  world.coins = world.coins.filter((c) => c.x > store.cam.x - 400 && !c.taken);
  world.canisters = world.canisters.filter((c) => c.x > store.cam.x - 400 && !c.taken);
  world.decoTree = world.decoTree.filter((c) => c.x > store.cam.x - 500);
  world.decoRock = world.decoRock.filter((c) => c.x > store.cam.x - 500);
}

/** 骑尘：贴地行驶 + 高速冲刺扬尘 */
export function emitRideDust() {
  const b = bike;
  if (b.grounded <= 0 || store.run.crashed) return;
  const th = store.phys.theme;
  const spd = Math.abs(b.speed);
  if (spd > DUST_V) {
    for (const p of [b.rear, b.front]) {
      if (Math.random() < 0.35) {
        const gi = groundInfo(p.x);
        if (gi.y !== Infinity) {
          emitParticles(p.x + Math.random() * 4 - 2, gi.y - 2, 1, {
            color: th === 1 ? "#eef5fb" : th === 2 ? "#e6c98f" : th === 3 ? "#9aa2ad" : "#c4a882",
            spd: 0.6, life: 18, size: 3, grav: 0.02,
          });
        }
      }
    }
  }
  if (spd > DUST_HEAVY_V && Math.random() < 0.55) {
    const gi = groundInfo(b.rear.x);
    if (gi.y !== Infinity) {
      emitParticles(b.rear.x - 6, b.rear.y + 5, 1, {
        color: th === 1 ? "#ffffff" : th === 3 ? "#9aa2ad" : "#d9c39a",
        spd: 1.0, life: 22, size: 4, grav: -0.01, decay: 0.95,
      });
    }
  }
}

/** 金币拾取（唯一入口 addGold） */
export function updateCoins() {
  const mx = (bike.rear.x + bike.front.x) / 2;
  const my = (bike.rear.y + bike.front.y) / 2;
  for (const c of world.coins) {
    if (c.taken) continue;
    if (Math.hypot(c.x - mx, c.y - my) < 45) {
      c.taken = true;
      store.run.coinGot++;
      addGold(30);
      playCoinSound();
      emitParticles(c.x, c.y, 12, { color: "#ffd700", spd: 2.5, life: 30, size: 3, grav: 0.03 });
    }
  }
}

/** 油罐拾取 */
export function updateCanisters() {
  const mx = (bike.rear.x + bike.front.x) / 2;
  const my = (bike.rear.y + bike.front.y) / 2;
  for (const c of world.canisters) {
    if (c.taken) continue;
    if (Math.hypot(c.x - mx, c.y - my) < 45) pickCanister(c);
  }
}

/** 加速带：贴地压上去 → 瞬时提速，帮玩家冲迎面陡坡 */
export function updateBoosts() {
  if (!world.boosts.length) return;
  const mx = (bike.rear.x + bike.front.x) / 2;
  for (const b of world.boosts) {
    if (b.taken || store.run.crashed || bike.grounded === 0) continue;
    if (Math.abs(mx - b.x) > 26) continue;
    b.taken = true;
    const imp = 230; // 瞬时增速 px/s
    for (const p of [bike.rear, bike.front, bike.head]) p.px -= imp * SUB_DT * 0.9;
    bike.speed = Math.max(bike.speed, imp * 0.8);
    emitParticles(b.x, b.y - 4, 18, { color: "#4cff88", spd: 2.4, life: 24, size: 3, grav: -0.02 });
    addShakeLocal(3);
    showToast("⚡ 加速带！", 600);
    playBoostSound();
  }
}

// 直接操作 store，避免 world → render/camera 的层级倒挂
function addShakeLocal(v) {
  store.cam.shake = Math.min(16, store.cam.shake + v);
}
