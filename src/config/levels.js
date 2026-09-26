// 关卡数据与地形数学（纯函数，不依赖任何运行时状态）
//  · 12 条支线 × 6 关 = 72 关（扁平数组，索引 = 全局索引，与旧代码路径兼容）
//  · 难度沿"全局进度 gi"单调递增（坡度 / 落差 / 颠簸 / 燃料 / 三星时限）
//  · 地形 = 主坡(大起伏) + 中波(连续坡) + 颠簸(细碎) + 下坡断层
//  · 支线 i 绑定 THEMES[i]（场景下标 1:1）
import { clamp } from "../core/utils.js";
import { REF_SPEED, KICK_TARGET } from "../config/constants.js";

/** 断层过渡宽度（px）：做成"陡坡"而不是"窄坑"，否则车身会卡死 */
export const STEP_W = 150;
/** 起步缓冲长度（px）：前段把起伏逐渐放大，给足加速距离 */
const RUN_IN = 520;

/** 每条支线的关卡数 */
export const LEVELS_PER_BRANCH = 6;
/** 支线数量（与 THEMES.length 一致） */
export const N_BRANCHES = 12;
/** 总关卡数 */
const TOTAL = N_BRANCHES * LEVELS_PER_BRANCH;

// ---------------- 关卡变体（穿插"好玩的"） ----------------

/** 6 种变体：normal 为常规关，其余 5 种是特殊变体 */
export const VARIANTS = ["normal", "sprint", "gauntlet", "airtime", "fuelrun", "downhill"];

/** 每条支线第 3、5 关（k=2、k=4）为特殊变体，按此顺序轮转分配 */
const SPECIALS = ["sprint", "gauntlet", "airtime", "fuelrun", "downhill"];

/** 变体展示信息（HUD / 面板） */
export const VARIANT_INFO = {
  normal: { name: "常规", icon: "🚩", desc: "标准赛道" },
  sprint: { name: "限时冲刺", icon: "⏱", desc: "门限极严；赛前满油、赛道无补给" },
  gauntlet: { name: "障碍迷宫", icon: "🧱", desc: "障碍成簇密布，须减速穿越" },
  airtime: { name: "空翻挑战", icon: "🕊", desc: "累计滞空 + 连招达标才算通关" },
  fuelrun: { name: "燃料极限", icon: "⛽", desc: "赛道仅 1 个油罐，必须规划" },
  downhill: { name: "极速下坡", icon: "🎿", desc: "危险段密集，须精准刹车" },
};

/**
 * 变体对"机制生成"的改写规则。
 * ★ 故意不改 L 的难度指标字段（len / ramp / den3 / fuelK / mech / waves / steps）：
 *   那些字段被"难度逐关单调递增"断言守护，改了会破坏单调性。
 *   变体只改写"实体密度、门时限、结算条件"，难度仍由全局进度决定。
 *   · obstK / hazardK：障碍物、危险段数量系数
 *   · gateK：门时限系数（>1 更严、<1 更宽松；门要求均速 = gateSpeed(den3) × gateK）
 *   · canN：赛道上油罐数量（null = 按油耗公式推导）
 *   · jumpN：跳台数量（airtime 变体的确定性滞空源）
 *   · airTarget / comboW：airtime 变体的达标目标（滞空秒数 + 连招权重）
 *   · prepFuel：是否把"少放的油罐"折算成赛前预加油（保证总油量不变、仍可通关）
 */
export const VARIANT_RULES = {
  normal: { obstK: 1, hazardK: 1, gateK: 1, canN: null, jumpN: 0, prepFuel: false },
  sprint: { obstK: 1, hazardK: 1, gateK: 1.1, canN: 0, jumpN: 0, prepFuel: true },
  gauntlet: { obstK: 2.2, hazardK: 0, gateK: 0.85, canN: null, jumpN: 0, prepFuel: false },
  airtime: { obstK: 0, hazardK: 0, gateK: 0.6, canN: null, jumpN: 4, prepFuel: false },
  fuelrun: { obstK: 0.5, hazardK: 0.5, gateK: 0.9, canN: 1, jumpN: 0, prepFuel: true },
  downhill: { obstK: 0.5, hazardK: 2.2, gateK: 0.7, canN: null, jumpN: 0, prepFuel: false },
};

/** 取变体规则 */
export function variantRule(v) {
  return VARIANT_RULES[v] || VARIANT_RULES.normal;
}

/** 12 条支线：i 绑定 THEMES[i]（场景下标 1:1） */
export const BRANCHES = [
  { id: "green", name: "翠野乡道", theme: 0, desc: "平缓草甸，热身上路" },
  { id: "snow", name: "极寒雪原", theme: 1, desc: "积雪打滑，稳住节奏" },
  { id: "desert", name: "流沙荒漠", theme: 2, desc: "沙丘连绵，酷热耗油" },
  { id: "moon", name: "静默月面", theme: 3, desc: "低重力弹跳，天堑飞跃" },
  { id: "jungle", name: "雨林秘境", theme: 4, desc: "湿滑苔径，树影重重" },
  { id: "volcano", name: "熔岩火山", theme: 5, desc: "高重力陡坡，烈焰滚滚" },
  { id: "glacier", name: "万古冰川", theme: 6, desc: "冰面极滑，慎踩刹车" },
  { id: "canyon", name: "红岩峡谷", theme: 7, desc: "层岩台地，连续落差" },
  { id: "swamp", name: "迷雾沼泽", theme: 8, desc: "泥泞水洼，能见度低" },
  { id: "city", name: "城市废墟", theme: 9, desc: "残垣断壁，硬质路面" },
  { id: "sky", name: "天空浮岛", theme: 10, desc: "浮空群岛，轻若无物" },
  { id: "night", name: "极夜星空", theme: 11, desc: "极夜寒星，终极试炼" },
];

// ---------------- 纯地形函数 ----------------

/** 关卡地形高度（x 为世界坐标，返回世界 y） */
export function levelHillY(L, x) {
  let y = 300;
  let relief = 0;
  for (const w of L.waves) relief += w.amp * Math.sin(x * w.f + w.ph);
  for (const s of L.steps) {
    if (x > s.cx) {
      const t = clamp((x - s.cx) / STEP_W, 0, 1);
      relief += s.drop * (t * t * (3 - 2 * t));
    }
  }
  return y + relief * clamp((x - 60) / RUN_IN, 0, 1);
}

/** 关卡地形信息：{y, m}（m 为斜率，>0 下坡 / <0 上坡） */
export function levelGroundInfo(L, x, e = 2) {
  const yL = levelHillY(L, x - e);
  const yR = levelHillY(L, x + e);
  return { y: levelHillY(L, x), m: (yR - yL) / (2 * e) };
}

/** 无限模式地形（随里程缓慢加难，无终点） */
export function freeHill(x) {
  const d = Math.max(0, x - 400);
  const diff = Math.min(1, d / 120000);
  const diffS = diff * diff * (3 - 2 * diff);
  let y = 300;
  y += Math.sin(x * 0.004 + 1.7) * (26 + diffS * 160);
  y += Math.sin(x * 0.0013 + 3.1) * (22 + diffS * 110);
  y += Math.sin(x * 0.0007 + 5.2) * (18 + diffS * 80);
  const stepGap = 1400;
  const stepDrop = 15 + diffS * 10;
  const segIdx = Math.floor(d / stepGap);
  y += stepDrop * segIdx;
  const cur = d % stepGap;
  if (cur > 0) {
    const t = clamp(cur / STEP_W, 0, 1);
    y += stepDrop * (t * t * (3 - 2 * t));
  }
  return y;
}

/** 采样得到关卡真实最大坡度（含断层过渡段），面板展示用 */
function measureMaxSlope(L) {
  let mx = 0;
  for (let x = 70; x <= L.len; x += 4) {
    const m = Math.abs(levelGroundInfo(L, x).m);
    if (m > mx) mx = m;
  }
  return (Math.atan(mx) * 180) / Math.PI;
}

// ---------------- 地形参数工厂 ----------------

/**
 * 三层叠加起伏：越往后振幅越大 → 坡度越陡。
 * 波长与相位为全局常量（不随关卡变化）：这样"起伏波形"对全局进度稳定，
 * 使 maxSlope 严格随进度单调非减（只有振幅在变）。
 */
function buildWaves(ramp) {
  return [
    { f: (2 * Math.PI) / 2600, amp: 56 + ramp * 34, ph: 1.7 },
    { f: (2 * Math.PI) / 1000, amp: 20 + ramp * 9, ph: 3.1 },
    { f: (2 * Math.PI) / 400, amp: 7 + ramp * 2, ph: 5.2 },
  ];
}

/**
 * 下坡断层：落差与条数随进度单调递增。
 * 断层位置固定在绝对世界坐标（间隔 1600px），不随 len 漂移，
 * 否则断层与起伏波形的相对相位会随关卡移动，导致实测 maxSlope 非单调。
 */
function buildSteps(ramp, gN) {
  const nStep = 1 + Math.floor(gN * 6);
  const steps = [];
  for (let r = 0; r < nStep; r++) {
    const drop = 15 + gN * 76 + r * (2 + gN * 7);
    steps.push({ cx: 700 + r * 1600, drop });
  }
  return steps;
}

/** 由全局进度推导一关的全部参数（难度对 gN 单调） */
function makeLevel(gi) {
  const gN = gi / (TOTAL - 1); // 0 → 1
  const bi = Math.floor(gi / LEVELS_PER_BRANCH);
  const k = gi % LEVELS_PER_BRANCH;
  // 变体穿插：每条支线第 3 关（k=2）、第 5 关（k=4）为特殊变体，错开两轮轮转保证 6 种都出现
  const variant =
    k === 2 ? SPECIALS[bi % SPECIALS.length]
    : k === 4 ? SPECIALS[(bi + 2) % SPECIALS.length]
    : "normal";
  // 难度分层：前期 ramp 增长慢（教学），后段陡增；ramp 对 gN 单调不减
  const ramp = Math.pow(clamp(gN, 0, 1), 1.15);
  const len = Math.round(4200 + gN * 9000); // 路程 4200 → 13200
  const coinN = Math.round(16 + gN * 40); // 金币 16 → 56
  const L = {
    name: BRANCHES[bi].name + " " + (k + 1),
    len,
    waves: buildWaves(ramp),
    steps: buildSteps(ramp, gN),
    coinN,
    ramp,
    // 三星时限的速度基准（三星要求均速）：前期 ≈0.72×基准极速（余量更宽、易拿满星），
    // 末期 ≈0.50×（更严，须在陡峭地形上稳住节奏）；starTime(L) = L.len / L.den3 语义不变
    den3: REF_SPEED * (0.72 - 0.22 * ramp),
    // 油耗倍率：后期环境恶劣（缺氧/沙尘/低温），同样动作更费油
    fuelK: 1 + 3.1 * ramp,
    // 机制密度权重（0~1）：障碍物/危险段/限时门的数量都按它缩放
    mech: gN,
    // 机制预算（数量）：实际落点由 game/world.js 按地形与既有机制筛选
    obstacleN: Math.round(5 + gN * 25), // 障碍物 5 → 30
    hazardN: Math.round(1 + gN * 5), // 危险段 1 → 6
    gateN: 3 + Math.round(gN * 2), // 限时门 3 → 5
    variant,
    theme: BRANCHES[bi].theme,
  };
  L.maxSlope = measureMaxSlope(L); // 实测最大坡度（含断层）
  return L;
}

// ---------------- 72 关 ----------------
export const LEVELS = Array.from({ length: TOTAL }, (_, gi) => makeLevel(gi));

// ---------------- 最终任务（索引 FINALE_INDEX，已接进 buildLevel） ----------------
export const FINALE = (() => {
  const len = 22000;
  const L = {
    name: "终极远征 · 环大陆",
    len,
    waves: buildWaves(1),
    steps: buildSteps(1, 1),
    coinN: 90,
    ramp: 1,
    den3: REF_SPEED * (0.72 - 0.22),
    fuelK: 1 + 3.1,
    mech: 1.3,
    obstacleN: 40,
    hazardN: 8,
    gateN: 6,
    variant: "normal",
    theme: 0, // 取第一段的场景
    // 场景分段（x 递增，覆盖多个场景）——game/world.js 的 syncSegmentTheme 按 x 切换渲染/物理
    segments: [
      { x: 0, theme: 0 },
      { x: 3600, theme: 6 },
      { x: 7600, theme: 5 },
      { x: 11800, theme: 3 },
      { x: 16000, theme: 10 },
      { x: 19800, theme: 11 },
    ],
  };
  L.maxSlope = measureMaxSlope(L);
  return L;
})();

/** 最终任务的全局索引（= 72）：LEVELS 之后的一个逻辑关卡 */
export const FINALE_INDEX = LEVELS.length;

// ---------------- 关卡访问（含最终任务） ----------------

/** 按全局索引取关卡定义：0~71 为支线关，FINALE_INDEX 为最终任务 */
export function levelAt(idx) {
  return idx === FINALE_INDEX ? FINALE : LEVELS[idx];
}

/** 该关卡是否定义了"场景分段"（最终任务多场景串联用） */
export function hasSegments(L) {
  return !!(L && Array.isArray(L.segments) && L.segments.length > 0);
}

/**
 * 按世界坐标 x 查询所属分段的场景下标。
 * 无分段定义的关卡恒返回 L.theme（支线关行为不变）；
 * 有分段时返回满足 segments[i].x <= x 的最后一段的 theme。
 */
export function segmentThemeAt(L, x) {
  if (!hasSegments(L)) return L ? L.theme : 0;
  const segs = L.segments;
  let th = segs[0].theme;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].x <= x) th = segs[i].theme;
    else break;
  }
  return th;
}

// ---------------- 支线查询辅助（供后续 UI/HUD 使用） ----------------

/** 取支线定义 */
export function getBranch(bi) {
  return BRANCHES[bi];
}

/** 支线 bi 的第 k 关（0 起） */
export function branchLevel(bi, k) {
  return LEVELS[bi * LEVELS_PER_BRANCH + k];
}

/** 支线 bi 第 k 关的全局索引 */
export function globalIndexOf(bi, k) {
  return bi * LEVELS_PER_BRANCH + k;
}

/** 全局索引 → 支线下标 */
export function branchOfGlobal(gi) {
  return Math.floor(gi / LEVELS_PER_BRANCH);
}

/** 全局索引 → { bi, k } */
export function branchProgress(gi) {
  return { bi: Math.floor(gi / LEVELS_PER_BRANCH), k: gi % LEVELS_PER_BRANCH };
}

/** 全局索引 → 归一化进度 0~1 */
export function globalProgress(gi) {
  return gi / (TOTAL - 1);
}

/** 三星时限（秒），任务书/测试可用 */
export function starTime(L) {
  return L.len / L.den3;
}

/**
 * airtime 变体的滞空达标线（秒）= 跳台数 × 单台达标滞空。
 * 跳台是确定性的滞空源，因此"达标"只取决于玩家是否真的飞了跳台，
 * 不依赖随机地形是否恰好有坡顶——保证任何支线（含最平缓的翠野乡道）都可达成。
 */
export function airTargetOf(L) {
  const r = variantRule(L.variant);
  if (!r.jumpN) return 0;
  // 只要求飞满 3/4 的跳台（留出容错：漏掉最后一个跳台仍能通关）
  return Math.max(1, r.jumpN - 1) * KICK_TARGET;
}