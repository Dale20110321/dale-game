// 世界实体：关卡构建（金币 / 油罐 / 加速带 / 装饰）、拾取、骑尘
import { mulberry32, clamp } from "../core/utils.js";
import { SUB_DT, DT, REF_SPEED, DUST_V, DUST_HEAVY_V, KICK_V, KICK_MIN_V, CAN_FUEL, CRUISE_V, hazardSpeed, gateSpeed } from "../config/constants.js";
import { THEMES } from "../config/themes.js";
import { token } from "../config/ui-tokens.js";
import { levelAt, courseAt, levelHillY, STEP_W, variantRule, segmentThemeAt, setFreeSeed } from "../config/levels.js";
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
 * 油罐预算的两条上限（见 buildLevel 里的推导）。
 * CAN_MIN_GAP 是间距下限（px）：罐间距窄于此值时高速下会连成"油罐墙"。
 * CAN_MAX 是总数上限：只为给极端里程封顶，避免几十万个小对象。
 */
const CAN_MIN_GAP = 2500;
const CAN_MAX = 6000;

/**
 * 加速带距限速区（危险段）的最小间距（px）：≥ 一次全力刹车的距离，
 * 保证"被加速"与"必须减速"不会挤在一处。
 */
export const BOOST_HAZARD_GAP = 400;

/**
 * 本局正在跑的关卡定义（buildLevel 写入，streamChunks 每帧读）。
 * ★ 放模块态而不是 store：它只是 buildLevel → streamChunks 之间的传参，
 *   写进 store 会让 config/core 层反向依赖，且没有任何别的消费者。
 */
let currentL = null;

/** 关卡地形真实最低点（世界 y 最大，即屏幕最下方），用于"掉出地图"判定：直接用纯地形函数，避免依赖当前关卡状态 */
function measureBottomY(L) {
  // ★ 采样步长随赛道长度放大：固定 25px 时，终局关（16.7M px）要跑 66 万次、
  //   宇宙场无相（1e9 px）要跑 4000 万次 —— 实测终极级单这一项就 7 秒。
  //   取 max(25, len/20000) 把采样数**封顶在 2 万次**，普通关与终局关逐位不变
  //   （它们的 len/20000 < 25），只有真正超长的赛道才降采样。
  //   降采样的代价：可能漏掉最深的那个窄坑。但掉出地图判定本身有 800px 的余量，
  //   且超长赛道的分段基准线漂移远小于单个窄坑，实测无差别。
  const step = Math.max(25, Math.round(L.len / 20000));
  let max = -Infinity;
  for (let x = 0; x <= L.len; x += step) {
    const y = levelHillY(L, x);
    if (y > max) max = y;
  }
  return isFinite(max) ? max : 300;
}

// ============================================================
//  流式实体生成（宇宙场专用）
//
//  ★ 为什么需要：宇宙场赛道长度 = 玩家极速 × 360s，无相满级是 **10 亿 px**。
//    一次性生成全赛道实体意味着：
//      · 装饰 7,700 万个 → 内存爆掉，且每帧剔除要遍历 7,700 万次
//      · 加速带选址 O(len/12 × 危险段数) = 2×10^11 次比较 → 开局卡死几分钟
//    实测（改动前）：终极级 buildLevel 耗时 187 秒。
//
//  ★ 做法：把赛道切成定长的 chunk，玩家附近 ±若干个 chunk 才生成实体，
//    跑远了就丢弃。每个 chunk 用**独立种子**生成 —— 于是
//    "同一个 chunk 无论何时生成，结果逐位相同"（纯函数），
//    倒车回来看到的还是同一批石头。
// ============================================================

/** chunk 宽度（px）：2M px = 2000km，一个 chunk 生成的实体约 1.5 万个 */
const CHUNK_W = 2000000;
/** 玩家身后保留几个 chunk（够长到看不见，也够倒着跑几秒） */
const CHUNK_BACK = 2;
/** 玩家身前预生成几个 chunk（高速时一帧就能跨过一个，必须提前铺） */
const CHUNK_AHEAD = 3;

/**
 * 为一个 chunk 生成实体（**纯函数**：同样 (L, ci) 永远得到同样结果）。
 *
 * ★ 种子必须由 chunk 下标唯一决定，不能用"接着上一个继续摇"——
 *   否则玩家倒车回来时新生成的 chunk 会与刚才丢掉的不是同一条路。
 */
function buildChunk(L, ci, withDeco) {
  const x0 = ci * CHUNK_W;
  const x1 = Math.min(L.len, x0 + CHUNK_W);
  const rng = mulberry32((L.seed ^ (ci * 0x9e3779b1)) >>> 0);

  const coins = [];
  const decoFore = [];
  const decoBack = [];

  // ---- 金币：第 i 枚落在全局位置 (i+0.5)/coinN × len，落在本 chunk 就归本 chunk ----
  // ★ 用"全局等分 + 按 chunk 过滤"，而不是"每块自己分 N 枚"：
  //   后者会让每块的首枚金币都落在块的同一相对位置，
  //   跨块拼起来就是一列等间距的节拍器（高速下尤其明显）。
  //   前者保证金币在整个赛道上严格等距，且与 chunk 划分完全无关。
  const nChunks = Math.max(1, Math.ceil(L.len / CHUNK_W));
  const i0 = Math.max(0, Math.ceil((x0 / L.len) * L.coinN - 0.5));
  const i1 = Math.min(L.coinN - 1, Math.ceil((x1 / L.len) * L.coinN - 0.5));
  for (let i = i0; i <= i1; i++) {
    const x = (L.len * (i + 0.5)) / L.coinN;
    if (x < x0 || x >= x1) continue;
    const gy = groundY(x);
    if (gy === Infinity) continue;
    coins.push({ x, y: gy - 35, taken: false, ph: rng() * 6.28, coinVal: L.coinVal || 30 });
  }
  void nChunks;

  // ---- 装饰：步长随 chunk 恒定 ----
  // ★ 流式赛道的装饰间距比普通关**大得多**（420px vs 130px）：
  //   代价是"看起来稀疏"，但在宇宙级速度下这个代价是看不见的 ——
  //   一帧位移数十 km，屏幕里本来就只有巡航色带（drawCruiseBands，>3600 km/h 生效），
  //   逐个装饰根本进不了视野。
  //   收益是跨块那一帧的开销从 ~21ms 降到 ~7ms：
  //   生成一个 chunk 要为每个装饰调 2 次 groundInfo（各含 3 次 levelHillY），
  //   间距放大 3.2 倍就直接把这一项砍到三分之一。
  //
  // ★ 进巡航层后**整段跳过**装饰：CHUNK_W 是 2M px，而顶档宇宙车的可视世界宽度
  //   只有 160k px —— 生成量是实际能显示量的 12 倍，实测每帧白花 8.4ms。
  //   金币/危险段仍然生成（它们进得了视野，也仍然要拾取/判定）。
  const T0 = THEMES[segmentThemeAt(L, x0)] || THEMES[0];
  for (let x = withDeco ? x0 + 220 : x1; x < x1 - 120; x += 175 + rng() * 490) {
    const gi = groundInfo(x);
    if (gi.y === Infinity) continue;
    if (Math.abs(gi.m) > 0.5) continue;
    const s = 0.7 + rng() * 0.7;
    const ph = rng() * 6.28;
    const T = THEMES[segmentThemeAt(L, x)] || T0;
    const di = pickDecoIndex(T.deco, rng());
    const item = { x, y: gi.y, kind: T.deco[di], s, ph };
    if (TALL_DECO.has(item.kind)) decoFore.push(item);
    else decoBack.push(item);
  }

  return { coins, decoFore, decoBack, x0, x1 };
}

/**
 * 保证玩家附近的 chunk 已生成，且把身后的丢掉。
 * 必须在每帧（或每次相机大幅移动后）调用一次。
 *
 * ★ 早退条件：只有"可见 chunk 集合真的变了"才重建 world.* 里的扁平数组。
 *   可见窗口是 [camX-2块, camX+3块]，而 chunk 有 2,000,000px 宽 ——
 *   绝大多数帧相机还停在同一个 chunk 里（无相满级一帧也只走 46,000px）。
 *   每帧无条件重建要 push 9 万次，实测单帧 21.4ms（46fps）；
 *   加了这个早退后，只有跨块的那一帧才付这笔钱（~21ms，每 40 帧一次）。
 *
 *   代价：拾取金币必须让缓存失效 —— 见 updateCoins 里的 world.chunksDirty。
 */
let lastLo = -1;
let lastHi = -1;
let lastCamX = 0;   // 上一次 streamChunks 时的相机 x：用来算本帧跨过了几块
export function streamChunks() {
  const L = currentL;
  if (!L || !L.streaming) return;
  const camX = store.cam.x;
  const ci0 = Math.floor(camX / CHUNK_W);

  // ---- 丢弃太远的 chunk ----
  for (const k of world.chunks.keys()) {
    if (k < ci0 - CHUNK_BACK || k > ci0 + CHUNK_AHEAD + 1) world.chunks.delete(k);
  }

  // ---- 生成缺失的 chunk ----
  const lo = Math.max(0, ci0 - CHUNK_BACK);
  const hi = Math.min(Math.ceil(L.len / CHUNK_W) - 1, ci0 + CHUNK_AHEAD);
  let grew = false;
  // ★ 每帧的生成**预算随相机位移缩放**，而不是死板的"1 块/帧"。
  //   最初写死 1 是因为当时最快的车一帧只走 46,296px（0.02 块），
  //   1 块/帧绰绰有余。但宇宙级顶档是 1.76e8 px/s = **2.9M px/帧 = 1.5 块/帧**，
  //   死板的 1 块/帧会**永远追不上** —— 窗口每帧被抽干，前方是空的。
  //   预算取"本帧相机跨过的块数 + 1"，另设 8 块上限兜住倒车/开局的大跳跃。
  //   低速时它算出来是 1，与原行为一致；高速时才放宽。
  const perFrame = Math.abs(camX - lastCamX);
  const budget = Math.max(1, Math.min(8, Math.ceil(perFrame / CHUNK_W) + 1));
  lastCamX = camX;
  // 进巡航层（>CRUISE_V）后装饰不再生成：那个速度下一帧就能跨过整个可视窗口，
  // 逐个装饰根本进不了视野（render/terrain.js 的 drawCruiseBands 也已经接管了地形）。
  const withDeco = store.phys.topSpeed < CRUISE_V;
  let made = 0;
  for (let ci = lo; ci <= hi && made < budget; ci++) {
    if (world.chunks.has(ci)) continue;
    world.chunks.set(ci, buildChunk(L, ci, withDeco));
    made++;
    grew = true;
  }

  // ---- 可见集合没变且没有新 chunk → 直接返回（绝大多数帧走这条）----
  if (lo === lastLo && hi === lastHi && !grew && !world.chunksDirty) {
    world.chunksDirty = false;
    return;
  }
  lastLo = lo;
  lastHi = hi;
  world.chunksDirty = false;

  // ---- 把可见 chunk 的实体汇总到 world.*（渲染层与物理层读的仍是同一批数组）----
  const coins = [];
  const decoFore = [];
  const decoBack = [];
  for (let ci = lo; ci <= hi; ci++) {
    const c = world.chunks.get(ci);
    if (!c) continue;
    for (const o of c.coins) if (!world.takenX.has(o.x)) coins.push(o);
    for (const o of c.decoFore) decoFore.push(o);
    for (const o of c.decoBack) decoBack.push(o);
  }
  world.coins = coins;
  world.decoFore = decoFore;
  world.decoBack = decoBack;
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
 * 「竖立/柱状」装饰白名单 —— 这类保持**前景**地位（带投影、正常对比，维持空间层次）。
 * 其余（岩石 / 灌木 / 花 / 瓦砾 / 冰山 / 陨坑…）一律退到**背景**层。
 *
 * ★ 这两个分组是"前后景"，不是"树与石"：白名单里既有树也有 pillar/ruin/stump，
 *   背景层里也有 bush/flower。早期实现按**数组下标**分流（`di === 0 ? 前景 : 背景`），
 *   于是月面的 moonrock、火山的 lavarock、冰川的 iceberg 这些"最大最像障碍"的石头
 *   全被扔进前景层画在最底层并套上高大投影，而绿野的 bush/flower 反而退到背景画在最前 ——
 *   结果是"草长得像石头、石头长得像树"。
 */
const TALL_DECO = new Set([
  "tree", "snowtree", "cactus", "fern", "pine", "reed", "stump", "pillar", "ruin",
]);

/** 生成装饰物（纯视觉）：只长在坡度平缓的地方；类型按"该处所属分段场景"的 deco 列表加权选择 */
function buildDeco(L, rng) {
  const T0 = THEMES[segmentThemeAt(L, 0)] || THEMES[0];
  const fore = [];
  const back = [];
  for (let x = 220; x < L.len - 120; x += 55 + rng() * 150) {
    const gi = groundInfo(x);
    if (gi.y === Infinity) continue;
    if (Math.abs(gi.m) > 0.5) continue; // 太陡的地方不长东西
    const s = 0.7 + rng() * 0.7;
    const ph = rng() * 6.28;
    const T = THEMES[segmentThemeAt(L, x)] || T0;
    const di = pickDecoIndex(T.deco, rng());
    const item = { x, y: gi.y, kind: T.deco[di], s, ph };
    if (TALL_DECO.has(item.kind)) fore.push(item);
    else back.push(item);
  }
  return { fore, back };
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
 * 限时门：累计时限 = (x + 起步余量) / 要求均速。
 * 起步余量抵消"静止起步加速"这段必然低于均速的路程，避免第一道门就变成不可能任务；
 * 要求均速比三星放宽 20%，所以只有摔车/磨蹭才会超时。
 *
 * ★ 有关分段的关卡（终局关 36 段 × 10 门）按**段内均匀**布门，
 *   而不是按全长均分：终局关每段 462,963px，按全长均分得到的门距
 *   与段界无关，视觉上与"每段 10 门"的验收口径（R1.2）对不上，
 *   而且段界处会出现两门贴在一起。段内布门天然对齐地形段。
 */
function buildGates(L) {
  const out = [];
  const n = L.gateN;
  if (n <= 0) return out;
  const r = variantRule(L.variant);
  const spd = gateSpeed(L.den3) * r.gateK;
  if (L.segments && L.segments.length) {
    // 段内均匀：第 s 段占 [seg.x, 下一段起点)，段内放 n/段数 个门
    const perSeg = Math.round(n / L.segments.length);
    for (let s = 0; s < L.segments.length; s++) {
      const sx = L.segments[s].x;
      const ex = s + 1 < L.segments.length ? L.segments[s + 1].x : L.len;
      for (let k = 1; k <= perSeg; k++) {
        const x = Math.round(sx + ((ex - sx) * k) / (perSeg + 1));
        out.push({ x, limit: (x + GATE_START_ALLOW) / spd, passed: false, seg: s });
      }
    }
  } else {
    const x0 = L.len * 0.22;
    const x1 = L.len * 0.94;
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * (i + 1)) / n);
      out.push({ x, limit: (x + GATE_START_ALLOW) / spd, passed: false, seg: 0 });
    }
  }
  out.sort((a, b) => a.x - b.x);
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

/**
 * 在 seed 附近找一条加速带的落点。
 *
 * ★ 为什么不扫全赛道：旧实现是 `for (x = 120; x <= len; x += 12)` 扫全程，
 *   每点还要 `hazards.some()` 遍历全部危险段 —— 复杂度 O(len/12 × 危险段数)。
 *   终局关（16.7M px × 1389 段）已经是 1.9×10^9 次比较，
 *   宇宙场无相（10 亿 px × 2500 段）是 2×10^11 次 —— 开局卡死几分钟。
 *
 * ★ 改成**只在 seed 附近的窗口里找**（默认 ±120,000px）：
 *   加速带的语义是"铺在设计上该有的那几个位置附近"，本来就不需要看全程；
 *   窗口内的候选点用同一套判据（不在限速区 + 前方是上坡），
 *   找到就停手。窗口内找不到就扩到 4 倍，再找不到才放弃。
 *   普通关（≤78,000px）的行为因此逐位不变 —— 窗口已覆盖全程。
 *
 * @param {number} seed 设计落点（x）
 * @returns {number|null} 落点 x；找不到返回 null
 */
function pickBoostSpot(L, hazards, seed, tooClose) {
  const inHazardZone = (x) => hazards.some((h) => x > h.x0 - BOOST_HAZARD_GAP && x < h.x1 + BOOST_HAZARD_GAP);
  let win = 120000;
  for (let attempt = 0; attempt < 3; attempt++, win *= 4) {
    const lo = Math.max(120, seed - win);
    const hi = Math.min(L.len - 320, seed + win);
    if (hi <= lo) return null;
    // 首选：前方迎面是上坡且不在限速区；兜底：只要不在限速区
    let bestSpot = null, bestSafe = null;
    for (let x = lo; x <= hi; x += 12) {
      if (inHazardZone(x) || tooClose(x)) continue;
      if (bestSafe === null || Math.abs(x - seed) < Math.abs(bestSafe - seed)) bestSafe = x;
      if (groundInfo(x).m < 0.25 && groundInfo(x + 240).m < -0.35) {
        if (bestSpot === null || Math.abs(x - seed) < Math.abs(bestSpot - seed)) bestSpot = x;
      }
    }
    if (bestSpot !== null) return bestSpot;
    if (bestSafe !== null) return bestSafe;
  }
  return null;
}

/**
 * 构建关卡（金币、油罐、加速带、装饰、机制实体、环境物理）。
 *
 * ★ 不接收关卡下标：唯一事实来源是 `store.selLevel`（"当前选中关卡"）。
 *   过去这里另存了一份 `store.lvIdx`，两份字段靠调用顺序保持同步 ——
 *   而首屏 `buildLevel(0)` 造的是第 1 关地形，`selLevel` 却可能来自存档是别的关，
 *   两者当场就不一致。现在只留一个字段，顺带让菜单背景直接显示玩家当前所在的那一关。
 */
export function buildLevel() {
  const idx = store.selLevel;
  // ★ 赛事走专用赛道（R6.1，见 levels.js 的 RACE_COURSE 注释）：
  //   AI 与地形必须取同一条，否则会出现"车跑在 A 赛道上、地形却是 B 的"。
  //   宇宙场多传一个玩家极速（长度 = 极速 × 360s）。
  const L = courseAt(idx, store.mode, store.phys.topSpeed);
  const rng = mulberry32(1000 + idx * 97);
  // 流式模式：chunk 生成器要读回这条赛道（seed / len / 主题），存模块态
  currentL = L;
  world.chunks = new Map();
  world.takenX = new Set();
  world.chunksDirty = false;
  lastLo = -1; lastHi = -1;   // 强制 streamChunks 重建第一屏
  lastCamX = 0;               // 预算按"本帧位移"算，开局相机在 0，不能拿上一局的残值
  store.finishX = L.len;
  const th0 = segmentThemeAt(L, 0);
  store.phys.theme = th0;
  store.phys.floorY = measureBottomY(L);

  const T = THEMES[th0] || THEMES[0];
  store.phys.gravity = T.g;
  store.phys.traction = T.traction;

  // ---------------- 金币 ----------------
  // ★ 只有非流式关卡在这里一次性铺开；流式关卡（宇宙场）改由 chunk 生成，
  //   否则 10 亿 px 的赛道要在开局铺 5 万枚金币 + 7700 万个装饰。
  const coins = [];
  if (!L.streaming) {
    for (let i = 0; i < L.coinN; i++) {
      const cx = L.len * 0.15 + (i * (L.len * 0.75)) / (L.coinN - 1);
      coins.push({ x: cx, y: groundY(cx) - 35, taken: false, ph: rng() * 6.28, coinVal: L.coinVal || 30 });
    }
  }

  // ---------------- 油罐 ----------------
  // 按真实油耗模型反推，保证"够通关但不宽裕"，漏罐即有代价
  //   平均消耗 kAvg = kIdle + duty×(kFull-kIdle)，duty=0.62
  //   平均地速 vAvg = 0.78×基准极速（真实 px/s）
  //   本关需求 need = len / range（箱）；每罐补 CAN_FUEL 箱（constants.js 单一事实来源）
  //   容错余量 M：前期 1.30（撒开了跑），末关 1.05（每一罐都得吃到）
  const vh = VEHICLES[store.currentVehicle];
  const up = getUp();
  const fMax = vh.fuel * (1 + 0.004 * up.frame);
  const kIdle = ((0.005 * vh.weight) / fMax) * L.fuelK;
  const kFull = ((0.021 * vh.weight) / fMax) * L.fuelK;
  const kAvg = kIdle + 0.62 * (kFull - kIdle);
  const vAvg = 0.78 * REF_SPEED * vh.speed;
  const range = vAvg / kAvg;
  const need = L.len / range;
  const M = 1.30 - 0.25 * L.ramp;
  // 公式推导出的"预算油罐数"（下限 1）——变体只能改赛道上的罐数，
  // 少放的罐折算成"赛前预加油"补进油箱（总油量不变，仍可通关）
  //
  // ★ 上限从 6 抬到 CAN_MAX：需求 need ∝ 赛道长度，而"最多 6 罐"是给
  //   13,200px 关卡定的硬顶。关卡拉长后它成了**不可通关**的死结 ——
  //   实测 78,000px 需 8.4 箱、供给只有 1+6×0.6=4.6 箱（差 4 箱），
  //   终局关 16.7M px 更是需 1795 箱而供给恒为 4.6 箱。
  //   调低 fuelK 救不回来（二分实测收敛回 4.1 = 现状），因为 fuelK 同时
  //   缩放消耗与"环境恶劣度"的设计意图，唯一出路是让罐数跟上里程。
  //   CAN_MAX=6000 覆盖终局关的 3141 罐仍有 2 倍余量，且最坏也只是
  //   几万个 {x,y,taken,ph} 小对象（~0.5MB），不构成内存压力。
  //   真正的兜底是**间距**：任何一关的罐间距都不会窄于 CAN_MIN_GAP，
  //   否则高速下会连成"油罐墙"（一帧穿过好几个，拾取判定 ±45px 会漏）。
  const rawCans = Math.ceil((need * M - 1) / CAN_FUEL);
  const byGap = Math.ceil(L.len / CAN_MIN_GAP);
  const budgetCans = Math.max(1, Math.min(CAN_MAX, Math.min(rawCans, byGap)));
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

  // ---------------- 装饰（仅非流式关卡）----------------
  // 流式关卡的装饰由 buildChunk 按 chunk 生成，这里跳过。
  const deco = L.streaming ? { fore: [], back: [] } : buildDeco(L, mulberry32(5000 + idx * 131));

  // ---------------- 加速带 ----------------
  // 铺在"前方迎面是上坡"的位置；越到后期越少（前期教学友好，后期靠自己）。
  // ★ 不得落在限速区（危险段）内，也不得落在其前方 BOOST_HAZARD_GAP 内：
  //   加速带 +230px/s 与限速区是自相矛盾的组合（刚被推上去就超速必摔），留出刹车距离。
  // 全赛道先扫出候选点：首选"前方迎面是上坡"，兜底只要不在限速区（地形平缓的关卡
  // 没有理想点，仍照铺一条，与旧行为一致）；再取"离设计位置最近且彼此拉开 600px"的点，
  // 保证任何关卡都至少能放下一条（高难关危险段长，单点向前找会整关落空）。
  const boosts = [];
  const boostN = Math.max(1, 3 - Math.round(L.ramp * 2));
  const used = [];
  const tooClose = (x) => used.some((u) => Math.abs(u - x) < 600);
  for (let k = 1; k <= boostN; k++) {
    const seed = L.len * (0.12 + (0.76 * k) / (boostN + 1));
    const bx = pickBoostSpot(L, hazards, seed, tooClose);
    if (bx === null) continue; // 全程都落在限速区（含刹车距离）内 → 不放，绝不塞进限速区
    used.push(bx);
    boosts.push({ x: bx, y: groundY(bx) - 4, taken: false, ph: rng() * 6.28 });
  }

  world.canisters = canisters;
  world.boosts = boosts;
  world.coins = coins;
  world.decoFore = L.streaming ? [] : deco.fore;
  world.decoBack = L.streaming ? [] : deco.back;
  world.hazards = hazards;
  world.gates = buildGates(L);
  world.jumps = buildJumps(L);
  // ★ 流式关卡立刻铺第一屏的 chunk（buildLevel 时相机还停在 x=0）
  if (L.streaming) streamChunks();
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
  store.phys.gravity = T.g;
  store.phys.traction = T.traction;
  return true;
}

/**
 * 无限模式初始化。
 * @param {number} [theme] 场景下标（0~11）。不传 = 随机地形（现状行为，取 THEMES[0] 的环境参数）。
 *   · 未登顶（!progress.peak）时忽略该参数：不切场景，保持随机地形。
 *   · 登顶后接受合法下标；非法/越界回退 0。
 *   （"哪些场景可选"由 UI 依据 progress.freeThemes 过滤，见 storage.availableFreeThemes）
 * 选中的场景决定渲染主题与物理环境（g / traction）及 freeFill 的装饰类型。
 */
export function freeInit(theme) {
  store.mode = "free";
  store.finishX = Infinity;
  // ★ 每局重摇地形种子：不然每次打开都是同一条路（地形函数本身没有随机源）
  setFreeSeed((Math.random() * 0xffffffff) >>> 0);
  // 场景也随机：主题决定重力 / 抓地 / 装饰，固定主题会让"无限模式"永远是同一个画面。
  // 未指定时在全部场景里等概率摇一个；已通关场景仍然可以在面板里点名自选。
  const picked = Number.isInteger(theme) ? freeThemeOf(theme) : rollFreeTheme();
  const th = picked;
  store.phys.theme = th;
  store.phys.floorY = 0; // 无限模式用"当前位置地面以下 800px"判定
  store.phys.gravity = (THEMES[th] || THEMES[0]).g;
  store.phys.traction = (THEMES[th] || THEMES[0]).traction;
  world.coins = [];
  world.canisters = [];
  world.boosts = [];
  world.decoFore = [];
  world.decoBack = [];
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
  // ★ 生成范围必须按**世界**宽度算：可视世界宽度 = view.W / zoom，
  //   相机在高速时会缩到 0.32（见 camZoomOf），此时可视范围是屏幕宽的 3 倍。
  //   沿用 view.W 的话，无限模式在高速下会"前方一段路完全没有金币/油罐"——
  //   这正是"地图跟不上"的另一种表现：不是画不出来，是压根没生成。
  const z = store.cam.zoom > 0.01 ? store.cam.zoom : 1;
  const viewR = store.cam.x + (view.W / z) * 2;
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
        world.decoFore.push({ x: x + 60, y: groundY(x + 60), kind: deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
      } else if (rng() < 0.3) {
        world.decoBack.push({ x: x + 90, y: groundY(x + 90), kind: deco[1] || deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
      }
    }
    world.freeGenX += Math.round(170 + diffS * 260 + rng() * 280);
  }
  world.coins = world.coins.filter((c) => c.x > store.cam.x - 400 && !c.taken);
  world.canisters = world.canisters.filter((c) => c.x > store.cam.x - 400 && !c.taken);
  world.decoFore = world.decoFore.filter((c) => c.x > store.cam.x - 500);
  world.decoBack = world.decoBack.filter((c) => c.x > store.cam.x - 500);
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
      // ★ 流式模式：chunk 被丢弃后重新生成会得到全新实体对象，c.taken 就丢了。
      //   按 x 坐标记进 takenX，"吃过的金币"才不会被重新生成回来。
      world.takenX.add(c.x);
      world.chunksDirty = true;      // 让 streamChunks 下次重建数组
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
