// 世界实体：关卡构建（金币 / 油罐 / 加速带 / 装饰）、拾取、骑尘
import { mulberry32, clamp } from "../core/utils.js";
import { SUB_DT, DT, REF_SPEED, DUST_V, DUST_HEAVY_V, KICK_V, KICK_MIN_V, CAN_FUEL, hazardSpeed, gateSpeed } from "../config/constants.js";
import { THEMES } from "../config/themes.js";
import { token } from "../config/ui-tokens.js";
import { levelAt, levelHillY, STEP_W, variantRule, segmentThemeAt, setFreeSeed } from "../config/levels.js";
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

/** 限时门的"起步余量"（px）：抵消静止起步必然低于均速的那段路程 */
const GATE_START_ALLOW = 900;

/**
 * 加速带距限速区（危险段）的最小间距（px）：≥ 一次全力刹车的距离，
 * 保证"被加速"与"必须减速"不会挤在一处。tools/autotest.mjs 有断言守护。
 */
export const BOOST_HAZARD_GAP = 400;

/** 关卡地形真实最低点（世界 y 最大，即屏幕最下方），用于"掉出地图"判定：直接用纯地形函数，避免依赖当前 lvIdx */
function measureBottomY(L) {
  let max = -Infinity;
  for (let x = 0; x <= L.len; x += 25) {
    const y = levelHillY(L, x);
    if (y > max) max = y;
  }
  return isFinite(max) ? max : 300;
}

/** 按装饰类型列表加权选取下标（靠前的更常见）。列表长度 ≥2，可 >2。 */
function pickDecoIndex(list, r) {
  let total = 0;
  for (let i = 0; i < list.length; i++) total += 1 / (i + 1);
  let x = r * total;
  for (let i = 0; i < list.length; i++) {
    x -= 1 / (i + 1);
    if (x <= 0) return i;
  }
  return list.length - 1;
}

/**
 * 「竖立/柱状」装饰白名单 —— 这类保持前景地位（带投影、正常对比，维持空间层次）。
 * 其余（岩石 / 灌木 / 花 / 瓦砾 / 冰山 / 陨坑…）一律退到背景层。
 *
 * 修掉一个长期存在的分组 bug：原实现按**数组下标**分流（`di === 0 ? trees : rocks`），
 * 于是月面的 moonrock、火山的 lavarock、冰川的 iceberg、峡谷的 mesarock 这些"最大最像
 * 障碍"的石头全被扔进 decoTree 画在最底层并套上高大投影；而绿野的 bush/flower 反而
 * 进 decoRock 被画在最前。结果是"草长得像石头、石头长得像树"。
 * 白名单按 themes.js 全部 12 个场景的 deco 列表逐一核对过。
 */
const TALL_DECO = new Set([
  "tree", "snowtree", "cactus", "fern", "pine", "reed", "stump", "pillar", "ruin",
]);

/** 生成装饰物（纯视觉）：只长在坡度平缓的地方；类型按"该处所属分段场景"的 deco 列表加权选择 */
function buildDeco(L, rng) {
  const T0 = THEMES[segmentThemeAt(L, 0)] || THEMES[0];
  const trees = [];
  const rocks = [];
  for (let x = 220; x < L.len - 120; x += 55 + rng() * 150) {
    const gi = groundInfo(x);
    if (gi.y === Infinity) continue;
    if (Math.abs(gi.m) > 0.5) continue; // 太陡的地方不长东西
    const s = 0.7 + rng() * 0.7;
    const ph = rng() * 6.28;
    const T = THEMES[segmentThemeAt(L, x)] || T0;
    const di = pickDecoIndex(T.deco, rng());
    const item = { x, y: gi.y, kind: T.deco[di], s, ph };
    if (TALL_DECO.has(item.kind)) trees.push(item);
    else rocks.push(item);
  }
  return { trees, rocks };
}

/**
 * 危险段：x 区间 + 允许的最大速度（px/s）。
 * 车身中点进入区间且超速必摔——玩家必须提前看限速牌减速，不能一路油门。
 * 位置避开出生点与终点缓冲区，段与段之间留足加速距离。
 */
function buildHazards(L, rng) {
  const out = [];
  const n = Math.round(L.hazardN * variantRule(L.variant).hazardK);
  const x0 = Math.max(760, L.len * 0.15);
  const x1 = L.len - 1000;
  if (n <= 0 || x1 <= x0) return out;
  const vmax = hazardSpeed(L.ramp);
  for (let i = 0; i < n; i++) {
    const cx = x0 + ((x1 - x0) * (i + 0.5)) / n + (rng() - 0.5) * 140;
    if (!isFinite(groundInfo(cx).y)) continue;
    const w = Math.round(300 + L.ramp * 260);
    const a = clamp(cx - w / 2, 240, L.len - 900);
    const b = clamp(cx + w / 2, 340, L.len - 700);
    if (b <= a) continue;
    out.push({ x0: Math.round(a), x1: Math.round(b), vmax });
  }
  return out;
}

/**
 * 限时门：3~5 道，累计时限 = (x + 起步余量) / 要求均速。
 * 起步余量抵消"静止起步加速"这段必然低于均速的路程，避免第一道门就变成不可能任务；
 * 要求均速比三星放宽 20%，所以只有摔车/磨蹭才会超时。
 */
function buildGates(L) {
  const out = [];
  const n = L.gateN;
  if (n <= 0) return out;
  const r = variantRule(L.variant);
  const spd = gateSpeed(L.den3) * r.gateK;
  const x0 = L.len * 0.22;
  const x1 = L.len * 0.94;
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * (i + 1)) / n);
    out.push({ x, limit: (x + GATE_START_ALLOW) / spd, passed: false });
  }
  return out;
}

/**
 * 跳台（跳台变体：airtime / gauntlet）：贴地高速压上去 → 整车获得向上的速度冲量。
 * 位置确定性排布（避开出生/终点与危险段），保证"该关卡一定存在可达成的滞空源"。
 */
function buildJumps(L) {
  const out = [];
  const n = variantRule(L.variant).jumpN;
  if (n <= 0) return out;
  const x0 = Math.max(700, L.len * 0.16);
  const x1 = L.len - 900;
  if (x1 <= x0) return out;
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * (i + 0.5)) / n);
    const gy = groundY(x);
    if (!isFinite(gy)) continue;
    out.push({ x, y: gy, used: false, boost: 0 });
  }
  return out;
}

/** 构建关卡（金币、油罐、加速带、装饰、机制实体、环境物理） */
export function buildLevel(idx) {
  store.lvIdx = idx;
  const L = levelAt(idx);
  const rng = mulberry32(1000 + idx * 97);
  store.finishX = L.len;
  const th0 = segmentThemeAt(L, 0);
  store.phys.theme = th0;
  store.phys.minY = measureBottomY(L);

  const T = THEMES[th0] || THEMES[0];
  store.phys.GRAV = T.g;
  store.phys.TRACTION = T.traction;

  // ---------------- 金币 ----------------
  const coins = [];
  for (let i = 0; i < L.coinN; i++) {
    const cx = L.len * 0.15 + (i * (L.len * 0.75)) / (L.coinN - 1);
    coins.push({ x: cx, y: groundY(cx) - 35, taken: false, ph: rng() * 6.28, coinVal: L.coinVal || 30 });
  }

  // ---------------- 油罐 ----------------
  // 按真实油耗模型反推，保证"够通关但不宽裕"，漏罐即有代价
  //   平均消耗 kAvg = kIdle + duty×(kFull-kIdle)，duty=0.62
  //   平均地速 vAvg = 0.78×基准极速（真实 px/s）
  //   本关需求 need = len / range（箱）；每罐补 CAN_FUEL 箱（constants.js 单一事实来源）
  //   容错余量 M：前期 1.30（撒开了跑），末关 1.05（每一罐都得吃到）
  const vh = VEHICLES[store.currentVehicle];
  const up = getUp();
  const fMax = vh.tank * (1 + 0.004 * up.frame);
  const kIdle = ((0.005 * vh.wgt) / fMax) * L.fuelK;
  const kFull = ((0.021 * vh.wgt) / fMax) * L.fuelK;
  const kAvg = kIdle + 0.62 * (kFull - kIdle);
  const vAvg = 0.78 * REF_SPEED * vh.spd;
  const range = vAvg / kAvg;
  const need = L.len / range;
  const M = 1.30 - 0.25 * L.ramp;
  // 公式推导出的"预算油罐数"（下限 1）——变体只能改赛道上的罐数，
  // 少放的罐折算成"赛前预加油"补进油箱（总油量不变，仍可通关）
  const budgetCans = Math.max(1, Math.min(6, Math.ceil((need * M - 1) / CAN_FUEL)));
  const rule = variantRule(L.variant);
  const n = rule.canN === null ? budgetCans : Math.max(0, rule.canN);
  // 预加油比例（占基准油箱的比例）：仅在声明的变体上生效
  world.prepFuel = rule.prepFuel ? Math.max(0, budgetCans - n) * CAN_FUEL : 0;

  const canisters = [];
  if (n === 1) {
    const cx = canSpot(L.len, L.len * 0.5);
    canisters.push({ x: cx, y: groundY(cx) - 26, taken: false, ph: rng() * 6.28 });
  } else if (n > 1) {
    // 多罐关：均匀铺开在 [12%, 92%] 区间（比原来 [20%,84%] 更宽，间距更松），
    // 且落在平缓处（陡坡/坡顶会被腾空飞过）
    const x0 = L.len * 0.12;
    const x1 = L.len * 0.92;
    for (let i = 0; i < n; i++) {
      const x = canSpot(L.len, x0 + ((x1 - x0) * i) / (n - 1));
      canisters.push({ x, y: groundY(x) - 26, taken: false, ph: rng() * 6.28 });
    }
  }

  const hazards = buildHazards(L, mulberry32(9000 + idx * 173));

  // ---------------- 加速带 ----------------
  // 铺在"前方迎面是上坡"的位置；越到后期越少（前期教学友好，后期靠自己）。
  // ★ 不得落在限速区（危险段）内，也不得落在其前方 BOOST_HAZARD_GAP 内：
  //   加速带 +230px/s 与限速区是自相矛盾的组合（刚被推上去就超速必摔），留出刹车距离。
  // 全赛道先扫出候选点：首选"前方迎面是上坡"，兜底只要不在限速区（地形平缓的关卡
  // 没有理想点，仍照铺一条，与旧行为一致）；再取"离设计位置最近且彼此拉开 600px"的点，
  // 保证任何关卡都至少能放下一条（高难关危险段长，单点向前找会整关落空）。
  const boosts = [];
  const boostN = Math.max(1, 3 - Math.round(L.ramp * 2));
  const inHazardZone = (x) => hazards.some((h) => x > h.x0 - BOOST_HAZARD_GAP && x < h.x1 + BOOST_HAZARD_GAP);
  const spots = []; // 首选：前方迎面是上坡 且 不在限速区
  const safe = [];  // 兜底：仅要求不在限速区（硬约束只有这一条）
  for (let x = 120; x <= L.len - 320; x += 12) {
    if (inHazardZone(x)) continue;
    safe.push(x);
    if (groundInfo(x).m < 0.25 && groundInfo(x + 240).m < -0.35) spots.push(x);
  }
  const used = [];
  const pick = (list, seed) => {
    let best = null;
    for (const x of list) {
      if (used.some((u) => Math.abs(u - x) < 600)) continue;
      if (best === null || Math.abs(x - seed) < Math.abs(best - seed)) best = x;
    }
    return best;
  };
  for (let k = 1; k <= boostN; k++) {
    const seed = L.len * (0.12 + (0.76 * k) / (boostN + 1));
    let bx = pick(spots, seed);
    if (bx === null) bx = pick(safe, seed);
    if (bx === null) continue; // 全程都落在限速区（含刹车距离）内 → 不放，绝不塞进限速区
    used.push(bx);
    boosts.push({ x: bx, y: groundY(bx) - 4, taken: false, ph: rng() * 6.28 });
  }

  const deco = buildDeco(L, mulberry32(5000 + idx * 131));
  world.coins = coins;
  world.canisters = canisters;
  world.boosts = boosts;
  world.decoTree = deco.trees;
  world.decoRock = deco.rocks;
  world.hazards = hazards;
  world.gates = buildGates(L);
  world.jumps = buildJumps(L);
}

/**
 * 按车身中点 x 同步"所属分段的场景"到 store.phys（最终任务多场景串联）。
 * 只改渲染主题与重力/抓地 —— 绝不触碰车身位置/速度，因此分段切换物理连续；
 * 重力变化只影响后续子步的加速度，当前帧的状态不会突变。
 * 返回是否发生了场景切换。
 */
export function syncSegmentTheme(L, x) {
  const th = segmentThemeAt(L, x);
  if (th === store.phys.theme) return false;
  const T = THEMES[th] || THEMES[0];
  store.phys.theme = th;
  store.phys.GRAV = T.g;
  store.phys.TRACTION = T.traction;
  return true;
}

/**
 * 无限模式初始化（Task 12.2）。
 * @param {number} [theme] 场景下标（0~11）。不传 = 随机地形（现状行为，取 THEMES[0] 的环境参数）。
 *   · 未登顶（!progress.peak）时忽略该参数：不切场景，保持随机地形。
 *   · 登顶后接受合法下标；非法/越界回退 0。
 *   （"哪些场景可选"由 UI 依据 progress.freeThemes 过滤，见 storage.availableFreeThemes）
 * 选中的场景决定渲染主题与物理环境（g / traction）及 freeFill 的装饰类型。
 */
export function freeInit(theme) {
  store.mode = "free";
  store.lvIdx = 0;
  store.finishX = Infinity;
  // ★ 每局重摇地形种子：不然每次打开都是同一条路（地形函数本身没有随机源）
  setFreeSeed((Math.random() * 0xffffffff) >>> 0);
  // 场景也随机：主题决定重力 / 抓地 / 装饰，固定主题会让"无限模式"永远是同一个画面。
  // 未指定时在全部场景里等概率摇一个；已通关场景仍然可以在面板里点名自选。
  const picked = Number.isInteger(theme) ? freeThemeOf(theme) : rollFreeTheme();
  const th = picked;
  store.phys.theme = th;
  store.phys.minY = 0; // 无限模式用"当前位置地面以下 800px"判定
  store.phys.GRAV = (THEMES[th] || THEMES[0]).g;
  store.phys.TRACTION = (THEMES[th] || THEMES[0]).traction;
  world.coins = [];
  world.canisters = [];
  world.boosts = [];
  world.decoTree = [];
  world.decoRock = [];
  world.hazards = [];
  world.gates = [];
  world.jumps = [];
  world.prepFuel = 0;
  world.freeGenX = 0;
}

/**
 * 解析无限模式的生效场景下标（纯函数：只读 store，无副作用，便于断言）。
 *  · 未登顶（!progress.peak）→ 恒返回 0（拒绝切场景，保持随机地形）
 *  · 已登顶 → 传入合法下标（0~THEMES.length-1）则返回该下标，否则回退 0
 * 注意：0 是"默认场景/随机地形"的基准（随机地形本身不依赖场景数据，
 * 只有重力/抓地/装饰按该场景取，与既有行为一致）。
 */
/** 随机摇一个场景主题（无限模式默认入口，纯函数式取值） */
function rollFreeTheme() {
  return THEMES.length ? Math.floor(Math.random() * THEMES.length) : 0;
}

export function freeThemeOf(theme) {
  const P = store.progress || {};
  if (P.peak !== true) return 0;
  const n = Number(theme);
  if (!Number.isInteger(n) || n < 0 || n >= THEMES.length) return 0;
  return n;
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
        // 无限模式没有具体关卡，用难度当量换算面值（随里程缓慢变高）
        world.coins.push({ x, y: gy - 30, taken: false, ph: rng() * 6.28,
          coinVal: Math.round(30 + 30 * diffS) });
      }
      if (rng() < 0.11) {
        world.canisters.push({ x, y: gy - 26, taken: false, ph: rng() * 6.28 });
      }
      // 装饰：按当前生效场景的 deco 列表（数据驱动，未登顶时为 THEMES[0]）
      const T = THEMES[store.phys.theme] || THEMES[0];
      const deco = T.deco && T.deco.length ? T.deco : THEMES[0].deco;
      if (rng() < 0.6) {
        world.decoTree.push({ x: x + 60, y: groundY(x + 60), kind: deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
      } else if (rng() < 0.3) {
        world.decoRock.push({ x: x + 90, y: groundY(x + 90), kind: deco[1] || deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
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
  const T = THEMES[store.phys.theme] || THEMES[0];
  const spd = Math.abs(b.speed);
  if (spd > DUST_V) {
    for (const p of [b.rear, b.front]) {
      if (Math.random() < 0.35) {
        const gi = groundInfo(p.x);
        if (gi.y !== Infinity) {
          emitParticles(p.x + Math.random() * 4 - 2, gi.y - 2, 1, {
            color: T.dust.light,
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
        color: T.dust.heavy,
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
    c.ph += 0.05; // 自转相位固定步推进：原在 drawCoins() 里按渲染帧自增，120/144Hz 屏上转速翻倍
    if (Math.hypot(c.x - mx, c.y - my) < 45) {
      c.taken = true;
      store.run.coinGot++;
      // 单枚面值随关卡进度递增（30 → 60），与 coinN 相乘后单关总产出 720 → 4320
      addGold(c.coinVal || 30);
      playCoinSound();
      emitParticles(c.x, c.y, 12, { color: token("obj-coin"), spd: 2.5, life: 30, size: 3, grav: 0.03 });
    }
  }
}

/** 油罐拾取 */
export function updateCanisters() {
  const mx = (bike.rear.x + bike.front.x) / 2;
  const my = (bike.rear.y + bike.front.y) / 2;
  for (const c of world.canisters) {
    if (c.taken) continue;
    c.ph += 0.05; // 同 updateCoins：浮动相位必须与刷新率无关
    if (Math.hypot(c.x - mx, c.y - my) < 45) pickCanister(c);
  }
}

/** 加速带平滑助推：时长（秒）与总速度增量（px/s） */
const BOOST_DUR = 0.5;
const BOOST_IMP = 205;

/**
 * 逐帧施加"缓进缓出"的助推冲量（正弦曲线 ∫=1 → 总增量 ≈ BOOST_IMP px/s）。
 * 取代旧版一次性速度脉冲 —— 车速平滑攀升，相机前瞻与画面不再顿挫。
 */
function boostImpulse(dt) {
  if (bike.boostT <= 0) return;
  const t = 1 - bike.boostT / BOOST_DUR; // 0 → 1
  const f = Math.sin(Math.PI * t); // 缓入缓出（0→1→0）
  const dv = BOOST_IMP * (Math.PI / 2) * f * dt; // 本帧速度增量 px/s
  for (const p of bike.pts) p.px -= dv * SUB_DT;
  bike.boostT -= dt;
}

/** 加速带：贴地压上去 → 触发一段平滑助推，帮玩家冲迎面陡坡 */
export function updateBoosts(dt) {
  if (bike.boostT > 0) boostImpulse(dt || DT);
  if (!world.boosts.length) return;
  const mx = (bike.rear.x + bike.front.x) / 2;
  for (const b of world.boosts) {
    if (b.taken || store.run.crashed || bike.grounded === 0) continue;
    if (Math.abs(mx - b.x) > 26) continue;
    b.taken = true;
    bike.boostT = BOOST_DUR; // 开启助推（由 boostImpulse 逐帧平滑施加，不再瞬时跳变）
    emitParticles(b.x, b.y - 4, 18, { color: token("obj-boost"), spd: 2.4, life: 24, size: 3, grav: -0.02 });
    addShakeLocal(3);
    showToast("⚡ 加速带！", 600);
    playBoostSound();
  }
}

/** 起跳垂直出射的"车速冲台系数"：速度越快腾空越高，抛体弧线更接近真实跳台 */
const KICK_SPD_K = 0.15;

/**
 * 跳台：贴地足够快压上去 → 整车获得"基础冲量 + 车速分量"的向上出射速度。
 * 水平速度原样保留，因此离台后按当前速度矢量做自然抛体飞行（高速冲台→更高更远）。
 */
export function updateJumps() {
  if (!world.jumps.length) return;
  const b = bike;
  const mx = (b.rear.x + b.front.x) / 2;
  for (const j of world.jumps) {
    if (j.used || store.run.crashed) continue;
    // 触发窗口 ±60px：高速下车身一帧掠过可能超过 10px，窗口太窄会漏触发
    if (mx < j.x - 60 || mx > j.x + 60) continue;
    if (b.grounded === 0 && b.rear.y < j.y - 60) continue;
    const spd = Math.abs(b.speed);
    if (spd < KICK_MIN_V) continue; // 太慢只是骑过去，不触发
    j.used = true;
    // 出射垂直速度：基础 KICK_V + 车速冲台分量（v = (y−py)/dt，py 增大 = 向上）。
    // 较之旧版固定冲量，这里让"腾空高度"随冲台速度连续变化，更真实。
    const up = KICK_V + spd * KICK_SPD_K;
    for (const p of b.pts) p.py += up * SUB_DT;
    emitParticles(j.x, j.y - 6, 14, { color: token("info"), spd: 2.2, life: 26, size: 3, grav: -0.02 });
    addShakeLocal(2.5);
    showToast("🛫 起飞台！", 600);
  }
}

// 直接操作 store，避免 world → render/camera 的层级倒挂
function addShakeLocal(v) {
  store.cam.shake = Math.min(16, store.cam.shake + v);
}
