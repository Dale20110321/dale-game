// 关卡数据与地形数学（纯函数，不依赖任何运行时状态）
//  · 36 条支线 × 12 关 = 432 关（扁平数组，索引 = 全局索引，与旧代码路径兼容）
//  · 难度沿"全局进度 gi"单调递增（坡度 / 落差 / 颠簸 / 燃料 / 三星时限）
//  · 地形 = 主坡(大起伏) + 中波(连续坡) + 颠簸(细碎) + 下坡断层
//  · 支线 i 绑定 THEMES[i]（场景下标 1:1）
import { clamp, mulberry32 } from "../core/utils.js";
import { REF_SPEED, KICK_TARGET } from "../config/constants.js";
import { THEMES } from "../config/themes.js";

/** 断层过渡宽度（px）：做成"陡坡"而不是"窄坑"，否则车身会卡死 */
export const STEP_W = 150;
/** 起伏渐入长度（px）：出发平台之后，用这段 smoothstep 把起伏逐渐放大，给足加速距离 */
const RUN_IN = 430;
/**
 * 收尾缓冲长度（px）：终点前这一段把地形平滑地收平。
 *
 * ★ 起步有 LAUNCH_PAD 平缓段、终点却没有，于是终点前 200px 的坡度完全由随机波形决定，
 *   偶发落到断崖上（72 关时样本少，扩到 432 关后必现）。过线即刻结算，坡度再大都无碍，
 *   所以这里按构造把终点收平，而不是去放宽那条断言。
 */
const FINISH_PAD = 900;

/** 每条支线的关卡数 */
export const LEVELS_PER_BRANCH = 12;
/** 支线数量（与 THEMES.length 一致） */
export const N_BRANCHES = 36;
/** 总关卡数 */
const TOTAL = N_BRANCHES * LEVELS_PER_BRANCH;

// ---------------- 关卡变体（穿插"好玩的"） ----------------

/** 6 种变体：normal 为常规关，其余 5 种是特殊变体 */
export const VARIANTS = ["normal", "sprint", "gauntlet", "airtime", "fuelrun", "downhill"];

/**
 * 每条支线的特殊变体关位（k 值）。12 关规模下取 5 个位：2/4/6/8/10。
 *
 * ★ 为什么是 5 个位、且要错开两轮轮转：最早的 6 关版只有 k=2、4 两个特殊位，
 *   5 种特殊变体在 72 关里分布很不均。扩到 12 关后若只补位不补齐，分布仍然偏斜。
 *   `SPECIAL_SLOTS` 给出位，`bi` 与 `bi+2` 错开轮转，保证相邻支线不会撞同一个变体。
 */
export const SPECIAL_SLOTS = [2, 4, 6, 8, 10];
// ★ 特殊变体只有 5 种（VARIANTS 去掉 normal），位也必须正好取 5 个 ——
//   位与种数必须相等，否则分布会偏：36 条支线 × 5 位 = 180 个特殊关，
//   180 / 5 种 = 每种正好 36 次。多一个位就会让先轮到的变体多出现 36 次。
const SPECIALS = ["sprint", "gauntlet", "airtime", "fuelrun", "downhill"];

/** 变体展示信息（HUD / 面板） */
export const VARIANT_INFO = {
  normal: { name: "常规", icon: "🚩", desc: "标准赛道" },
  sprint: { name: "限时冲刺", icon: "⏱", desc: "门限极严；赛前满油、赛道无补给" },
  gauntlet: { name: "跳台狂飙", icon: "🛫", desc: "跳台密集、断层相连" },
  airtime: { name: "空翻挑战", icon: "🕊", desc: "跳台飞跃：多刷滞空与连招" },
  fuelrun: { name: "燃料极限", icon: "⛽", desc: "赛道仅 1 个油罐，必须规划" },
  downhill: { name: "极速下坡", icon: "🎿", desc: "危险段密集，须精准刹车" },
};

/**
 * 变体对"机制生成"的改写规则。
 * ★ 故意不改 L 的难度指标字段（len / ramp / den3 / fuelK / mech / waves / steps）：
 *   那些字段被"难度逐关单调递增"断言守护，改了会破坏单调性。
 *   变体只改写"实体密度、门时限、结算条件"，难度仍由全局进度决定。
 *   · hazardK：危险段数量系数
 *   · gateK：门时限系数（>1 更严、<1 更宽松；门要求均速 = gateSpeed(den3) × gateK）
 *   · canN：赛道上油罐数量（null = 按油耗公式推导）
 *   · jumpN：跳台数量（确定性滞空源；达标线由 airTargetOf 从它派生）
 *   · prepFuel：是否把"少放的油罐"折算成赛前预加油（保证总油量不变、仍可通关）
 */
export const VARIANT_RULES = {
  normal: { hazardK: 1, gateK: 1, canN: null, jumpN: 0, prepFuel: false },
  sprint: { hazardK: 1, gateK: 1.1, canN: 0, jumpN: 0, prepFuel: true },
  gauntlet: { hazardK: 0, gateK: 0.75, canN: null, jumpN: 8, prepFuel: false },
  airtime: { hazardK: 0, gateK: 0.6, canN: null, jumpN: 4, prepFuel: false },
  fuelrun: { hazardK: 0.5, gateK: 0.9, canN: 1, jumpN: 0, prepFuel: true },
  downhill: { hazardK: 2.2, gateK: 0.7, canN: null, jumpN: 0, prepFuel: false },
};

/** 取变体规则 */
export function variantRule(v) {
  return VARIANT_RULES[v] || VARIANT_RULES.normal;
}

/**
 * 36 条支线：i 绑定 THEMES[i]（场景下标 1:1）。
 *
 * ★ 前 12 条手写（名字与 desc 是既有内容，不动）；第 13~36 条**由 THEMES 派生**，
 *   而不是再抄一份手写表 —— 派生保证"支线名永远等于它绑定的那个场景名"，
 *   不会出现两边各写一份、改了场景忘了改支线的漂移（这类漂移一旦发生，
 *   关卡地图上就会出现"名字叫 A 画的却是 B"的错位）。
 */
const BRANCH_SEED = [
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

/** 由场景派生后续支线（12 → 36）：name 取场景名，desc 由该场景的重力/抓地自动描述 */
function deriveBranch(i) {
  // 兜底：场景表还没就绪时不至于整份配置加载失败（那会让整个 bundle 白屏）。
  // 正常情况下 THEMES.length === N_BRANCHES，这里永远不会走到兜底分支。
  const t = THEMES[i] || { name: "场景 " + (i + 1), g: 750, traction: 1 };
  const grip = t.traction <= 0.7 ? "极滑抓地" : t.traction <= 0.85 ? "湿滑路面" : "抓地良好";
  const grav = t.g < 600 ? "低重力" : t.g > 820 ? "高重力" : "标准重力";
  return {
    id: "s" + i,
    name: t.name,
    theme: i,
    desc: `${grav} · ${grip}`,
  };
}

export const BRANCHES = Array.from({ length: N_BRANCHES }, (_, i) =>
  BRANCH_SEED[i] || deriveBranch(i));

// ============================================================
//  地形体格：每关独一无二（形状随机 × 难度受控）
// ============================================================

/**
 * 12 种"地貌气质"——按支线下标取模轮转；支线内 12 关各自再掷一次地形种子。
 *
 * ★ 关键设计：体格只决定**形状**（波长配比、局部地貌、断层节奏），
 *   难度（实测最大坡度）由 fitSlope() 反解振幅统一标定，两者彻底解耦。
 *   于是每关都可以长得完全不同，而 maxSlope 仍严格随全局进度递增。
 *
 * ★ 波长下限是物理约束，不是审美选择：接触带只有 CONTACT_BAND=2px，
 *   地形曲率 d²y/dx² 决定车落地时法线翻转的剧烈程度。特征波长低于 ~340px
 *   时曲率会超出约束求解器的收敛能力（实测出现车架约束瞬时漂移 20px、
 *   高速穿断层 4px）。所以宁可"宽而缓"（玩家能预判、能规划），
 *   也不要"窄而陡"（解算器直接失稳）。变化靠**波长配比与地貌组合**，
 *   不靠把单个特征压窄。
 *
 * waves  : [基准波长px, 基础振幅px, 难度增量px] × 3
 *   ★ 振幅必须**长波主导**（约 80% / 15% / 5%，与原曲线同构）。
 *     固定坡度 m = amp·2π/λ 下，**累计爬升 ∝ 1/λ**：短波扛坡度 =
 *     用成倍的上下折腾换取同样的陡度，末关爬升会从 1084px 涨到 1900px+，
 *     参考骑手 150s 骑不完。所以体格只改波长/相位/地貌组合，
 *     三层振幅的**配比**保持长波主导。
 * feat   : 局部地貌出现权重（kicker 起跳唇 / dip 洼地 / shelf 平台 / whoops 碎浪 / chasm 深谷）
 * stepGap: 断层基准间距px · jitter: 波长抖动幅度（0=规整，1=狂野）
 * stepK  : 断层落差系数 —— **仅无限模式生效**（那里的断层落差只有 15~25px，
 *          放大无碍）。关卡模式的落差必须留在原曲线上，见 buildSteps 注释。
 */
const TERRAIN_MOODS = [
  { id: "rolling",  label: "起伏丘陵", waves: [[2600, 56, 34], [1000, 14, 7], [420, 5, 2]],
    feat: { dip: 3, shelf: 1.4, kicker: 0.8, ramp: 0.3 },            stepGap: 1800, stepK: 1.0,  jitter: 0.16 },
  { id: "dunes",    label: "连绵沙丘", waves: [[3400, 74, 42], [1400, 12, 6], [560, 4, 2]],
    feat: { shelf: 2, dip: 2, ramp: 0.3 },                            stepGap: 2400, stepK: 0.7,  jitter: 0.12 },
  { id: "whoops",   label: "碎浪连包", waves: [[2700, 48, 28], [900, 18, 10], [420, 9, 5]],
    feat: { whoops: 3, dip: 1.6, ramp: 0.4 },                         stepGap: 1500, stepK: 0.9,  jitter: 0.2 },
  { id: "canyon",   label: "深谷沟壑", waves: [[3000, 62, 34], [1100, 15, 8], [460, 6, 3]],
    feat: { chasm: 2.6, kicker: 1.6, shelf: 1, ramp: 0.6 },           stepGap: 2000, stepK: 1.2,  jitter: 0.18 },
  { id: "ridge",    label: "连绵山脊", waves: [[2900, 66, 40], [980, 13, 7], [400, 5, 2]],
    feat: { kicker: 3, dip: 1.4, ramp: 0.5 },                         stepGap: 1700, stepK: 1.1,  jitter: 0.16 },
  { id: "plateau",  label: "阶梯平台", waves: [[2800, 50, 30], [1150, 15, 8], [480, 5, 2]],
    feat: { shelf: 3.4, dip: 1.2, kicker: 1, ramp: 0.5 },             stepGap: 1300, stepK: 1.3,  jitter: 0.14 },
  { id: "chasm",    label: "断裂天堑", waves: [[3200, 56, 34], [1250, 14, 8], [520, 5, 3]],
    feat: { chasm: 3, whoops: 1.2, ramp: 0.7 },                       stepGap: 1100, stepK: 1.45, jitter: 0.18 },
  { id: "badlands", label: "嶙峋台地", waves: [[2500, 56, 34], [1000, 18, 10], [440, 8, 5]],
    feat: { kicker: 2, whoops: 2, shelf: 1.2, ramp: 0.6 },            stepGap: 1400, stepK: 1.15, jitter: 0.22 },
  { id: "rollers",  label: "长缓丘陵", waves: [[4000, 80, 46], [1600, 15, 8], [640, 5, 2]],
    feat: { dip: 2.4, shelf: 1.6, ramp: 0.6 },                        stepGap: 2600, stepK: 0.85, jitter: 0.1 },
  { id: "gauntlet", label: "断崖飞坡", waves: [[2500, 60, 36], [1000, 15, 8], [440, 6, 3]],
    feat: { kicker: 3.4, chasm: 1.6, ramp: 1.2 },                     stepGap: 1000, stepK: 1.5,  jitter: 0.2 },
  { id: "marsh",    label: "泥泞浅滩", waves: [[2600, 46, 28], [980, 16, 9], [440, 6, 3]],
    feat: { dip: 3.2, whoops: 1.4, shelf: 1, ramp: 1 },              stepGap: 1900, stepK: 0.95, jitter: 0.18 },
  { id: "summit",   label: "登峰造极", waves: [[2700, 64, 42], [1000, 19, 11], [440, 8, 4]],
    feat: { kicker: 2.4, chasm: 2, whoops: 2, ramp: 1.3 },             stepGap: 1200, stepK: 1.35, jitter: 0.24 },
];

/** 地形最小特征波长（px）：低于此值曲率会让约束求解器失稳（见 TERRAIN_MOODS 注释） */
const MIN_WAVELEN = 380;
/** 局部地貌最小宽度（px）：与 MIN_WAVELEN 同源的稳定性约束 */
const MIN_FEAT_W = 420;

/**
 * 目标最大坡度（度）随全局进度单调递增：19.5° → 54°。
 *
 * ★ 上限取 54° 而非原曲线的 57.6°，是为了让 fitSlope 的缩放系数贴近 1：
 *   关卡的陡度几乎全部来自断层（落差 D 铺在 STEP_W=150px 上 → 坡度 ≈ D/100；
 *   而一条 2600px 的长波要达到同样坡度需要 650px 振幅，根本不现实）。
 *   原曲线 57.6° 对应的最大断层落差是 145px，与 D/100≈1.45 自然吻合；
 *   若把目标抬到 57.5°，fitSlope 就必须把断层**放大**到 167px 才能凑出坡度，
 *   而断层曲率 ≈ 6·D/STEP_W² 随之涨到 0.044（超出原包线 0.039），
 *   高速撞断层时穿透超容差、车架约束出现瞬时漂移。
 *   把上限压到 54° 后目标坡度与断层自然落差重新对齐（k≈1），
 *   断层的落差与曲率都留在原曲线的包线内。
 */
function targetSlopeDeg(gN) {
  return 19.5 + 34.5 * Math.pow(gN, 1.1);
}

/**
 * 局部地貌的振幅预算（px）。
 *
 * ★ 当前取 0 = **只启用 ramp（长直坡）**，其余 5 类（kicker 起跳唇 / dip 洼地 /
 *   shelf 平台 / whoops 碎浪 / chasm 深谷）的形状与播撒逻辑都在，振幅被关掉。
 *   这是逐档实测标定的结论，不是没做完。把 FEAT_AMP_MAX 抬到 5/9/12/18 试跑，
 *   这条曲线要依次开始变红：
 *     · 5  → 陡坡法向力对比失配
 *     · 9  → +「低速过坡顶几乎不离地」：起跳唇本身就是"给速度才起跳"的设计，
 *             坡顶一带起跳唇，180px/s 慢速也会被弹飞，破坏"腾空必须靠速度"这条不变式
 *     · 12 → + 反向难度：缓丘等于白送速度，后 1/3 关"全油门不可通关"掉到 15/24（需 ≥16）
 *     · 18 → + 悬挂压缩对比（2.35 vs 2.34px，阈值 0.02px 的刀刃项）
 *   即：起跳唇/洼地/平台/碎浪/深谷与"坡度标定 + 低速不腾空 + 全油门不可通关"
 *   这三条已标定的物理不变式**不兼容**。要启用必须先重新标定那三项，
 *   不能只把振幅调大。
 *   ramp 是唯一例外：中段曲率恒为 0，不触碰上述任何一条，故单独按 RAMP_GRADE 计算。
 *
 * 地形多样性目前由这些承载（均已生效并有断言守护）：
 *   · 12 种地貌体格（波长配比 / 断层节奏 / 地貌组合各不相同）
 *   · 每关独立随机种子（波长抖动 / 相位 / 地貌落点 / 断层位置）
 *   · ramp 长直坡（不抬曲率的难度）
 *   · 432 关地形指纹两两不同
 */
const FEAT_AMP_MAX = 0;

/** 平滑阶跃：值与一阶导在两端均为 0 → 局部地貌与基底拼接后处处 C¹ 连续 */
function ss(u) {
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
}

/**
 * 局部地貌剖面：t∈[0,1] → 相对高度系数（两端恒为 0）。
 * 全部 C¹ —— 地形不会出现法线翻转，接触求解器不会被"人造尖角"打出穿透。
 *   kicker 凸包：前后各占一半的 smoothstep，峰在正中 → 高速压上去自然起跳
 *   dip/chasm 凹坑：同形的镜像，深浅由 FEAT_AMP 区分
 *   shelf 平台：升起→平台→落下，0.28~0.72 段为平台
 *   whoops 碎浪：sin² 包络 × 整数周期波，密集小包连续不断
 *
 * ★ 升/落段一律 50/50 分（不要 0.58/0.3 这类偏斜）：偏斜会把平滑过渡压缩到
 *   极短区间，曲率 ∝ 1/宽度² 直接翻数倍，实测超出原曲线包线、
 *   接触求解器出现车架约束瞬时漂移。左右对称则曲率减半，轮廓观感几乎不变。
 */
function featProfile(kind, t, n) {
  if (t <= 0 || t >= 1) return 0;
  switch (kind) {
    case "kicker":
      return t < 0.5 ? ss(t / 0.5) : 1 - ss((t - 0.5) / 0.5);
    case "dip":
      return -(t < 0.5 ? ss(t / 0.5) : 1 - ss((t - 0.5) / 0.5));
    case "shelf":
      return t < 0.28 ? ss(t / 0.28) : t < 0.72 ? 1 : 1 - ss((t - 0.72) / 0.28);
    case "whoops":
      return Math.sin(Math.PI * t) * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * n * t);
    case "chasm":
      return -(t < 0.5 ? ss(t / 0.5) : 1 - ss((t - 0.5) / 0.5));
    case "ramp":
      return rampProfile(t);
    default:
      return 0;
  }
}

/**
 * 陡坡台（ramp）：**等坡度的长直坡**——爬上去再原坡降回来，净高度为 0。
 *
 * ★ 这是"难度"与"曲率"解耦的关键手段：
 *   关卡难度几乎全部来自最大坡度，而最大坡度受断层曲率 6·D/STEP_W² 死锁
 *   （见 targetSlopeDeg 注释），抬不上去。但"难"并不等于"陡"——
 *   长时间顶着 25~30° 的直爬同样致命，而**直线的曲率恒为 0**，
 *   接触求解器完全不受影响。曲率只集中在首尾各 300px 的 smoothstep 过渡里。
 *   于是难度能加、求解器不抖、也不额外抬高 maxSlope。
 */
/**
 * 陡坡台（ramp）：**长直坡**——用升余弦隆起塑形，爬上去再降回来，净高度为 0。
 *
 * ★ 这是"难度"与"曲率"解耦的关键手段：
 *   关卡难度几乎全部来自最大坡度，而最大坡度被断层曲率 6·D/STEP_W² 死锁
 *   （见 targetSlopeDeg 注释），抬不上去。但"难"并不等于"陡"——
 *   长时间顶着 25~30° 的直爬同样致命，而**直线的曲率恒为 0**，
 *   接触求解器完全不受影响。曲率只集中在首尾的余弦过渡里，且被 w² 压得很小。
 *   于是难度能加、求解器不抖、也不额外抬高 maxSlope。
 *
 * 形状取 h(t) = (1-cos(2πt))/2 ∈[0,1]（t=0.5 处为 1，两端为 0）：
 * 解析可导、两端值与一阶导均为 0（C¹ 拼接），无分段积分出错的风险。
 * 中段近似直线 → 长直爬坡；两端余弦过渡 → 平顺接入。
 */
function rampProfile(t) {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
}

/** 局部地貌相对振幅（chasm 朝下，其余朝上；ramp 的振幅另由 RAMP_GRADE 反解） */
const FEAT_AMP = { kicker: 1, dip: 0.7, shelf: 0.85, whoops: 0.55, chasm: -1.15 };
/** 陡坡台的目标坡度（tan）：约 19°。见 rampProfile 注释 */
const RAMP_GRADE = 0.34;

/**
 * 出发平台（px）：前 LAUNCH_PAD 长度内地形**恒为水平**，之后用 smoothstep 渐入到真实起伏。
 *
 * ★ 只做"够用"的一段：随机相位会让每关出生点的坡度各不相同
 *   （实测 −0.03 ~ +0.21），同油门加速度对比这类测量会被出生点坡度污染。
 *   一段短水平起跑区（~150px）让各关出生条件接近一致即可；
 *   不宜过长——物理测试（悬挂压缩、约束残差）在 x≈220 处固定投放车辆，
 *   平台太长会把那里的地形压平，测量就失去意义。
 *   两端导数均为 0（C¹），不会在平台边缘制造法线突跳。
 */
const LAUNCH_PAD = 150;

// ---------------- 纯地形函数 ----------------

/**
 * 关卡地形高度（x 为世界坐标，返回世界 y）。
 *
 * = 未收尾的地形（hillRaw）按终点收尾权重向"终点平台高度"混合
 *   → 起点有 LAUNCH_PAD 平缓段、终点有 FINISH_PAD 收平段，两端坡度都由构造保证。
 */
export function levelHillY(L, x) {
  const t = finishT(L, x);
  if (t <= 0) return hillRaw(L, x);
  const a = finishAnchor(L);
  return hillRaw(L, a) + (hillRaw(L, x) - hillRaw(L, a)) * (1 - t);
}

/** 终点收尾的混合权重（0 = 原始地形，1 = 完全收平）；终点前不受影响 */
function finishT(L, x) {
  const a = finishAnchor(L);
  if (x <= a) return 0;
  return ss((x - a) / RUN_IN);
}
/** 收尾段锚点：终点前 FINISH_PAD 处，其地形高度作为收平后的平台高度 */
function finishAnchor(L) {
  return L.len - FINISH_PAD;
}

// ============================================================
//  地形参数的空间分桶索引
//
//  ★ 为什么需要：levelHillY 是全项目**最热**的函数（每个物理子步、每次接触采样、
//   每次渲染采样都会调它）。原实现里三个循环全部是 O(参数总数) 的线性扫描：
//     · waves  —— 无任何早退，167km 的终局关有 108 条，每帧全扫一遍
//     · steps  —— `if (x > s.cx)` 只能跳过单个元素，没有起点定位
//     · feats  —— 虽然 `if (x <= f.x0) break` 能早退，但仍要从下标 0 开始扫
//   实测（Node，同一关卡结构）：3 条 steps 时 3.1µs/次；500 条 steps 时 9.8µs/次；
//   5 万条时 **253µs/次** —— 百万像素级关卡光地形求值就是 6ms/帧（10fps）。
//
//  ★ 桶宽选 2048px 的理由：比最长波（3400px）短，保证一条波最多跨 2~3 个桶；
//   而 feats/step 的影响范围（420~980px / STEP_W=150px）远小于桶宽，一个元素
//   通常只落在一个桶里。桶数 = len/2048，167km 的终局关约 8100 个桶 —— 可接受。
// ============================================================
const BUCKET_W = 2048;

/**
 * 为关卡建立分桶索引（幂等：重复调用直接返回已建好的）。
 *
 * 桶内记的是**下标区间**，不是元素拷贝 —— 参数总数在百万像素级可达 10 万，
 * 拷贝会翻倍内存。取用时按下标切片即可。
 */
function buildIndex(L) {
  if (L._idx) return L._idx;
  const n = L.len;
  const nBuckets = Math.max(1, Math.ceil(n / BUCKET_W) + 2);
  /** 每个桶影响到的 waves 下标区间（升序，闭开区间） */
  const waveB = new Array(nBuckets);
  /** 每个桶影响到的 steps 下标区间（steps 按 cx 升序） */
  const stepB = new Array(nBuckets);
  /** 每个桶影响到的 feats 下标区间（feats 按 x0 升序） */
  const featB = new Array(nBuckets);

  // ---- waves：一条正弦的影响范围是**无限**的（sin 无衰减）----
  // 不能按"影响范围"分桶 —— 那样每条波都要进几乎所有桶，退化成全扫。
  // 折中：正弦求和本身就是 O(n) 且每项极便宜（一次 sin），
  // 实测 108 条 waves 的求和约 1.5µs，不是瓶颈（真正炸的是 steps 的分支逻辑）。
  // 因此 waves 保持线性求和，但用局部变量避免属性查找。
  const ws = L.waves;
  const wLen = ws.length;

  // ---- steps：影响范围 = [cx, cx + STEP_W] ----
  let sLo = 0;
  for (let b = 0; b < nBuckets; b++) {
    const bx0 = b * BUCKET_W;
    const bx1 = bx0 + BUCKET_W;
    // 起点：第一个 cx + STEP_W > bx0 的元素
    while (sLo < L.steps.length && L.steps[sLo].cx + STEP_W <= bx0) sLo++;
    let sHi = sLo;
    while (sHi < L.steps.length && L.steps[sHi].cx < bx1) sHi++;
    stepB[b] = [sLo, sHi];
  }

  // ---- feats：影响范围 = [x0, x1] ----
  let fLo = 0;
  for (let b = 0; b < nBuckets; b++) {
    const bx0 = b * BUCKET_W;
    const bx1 = bx0 + BUCKET_W;
    // feats 按 x0 升序：x1 > bx0 的第一个元素即为起点
    while (fLo < L.feats.length && L.feats[fLo].x1 <= bx0) fLo++;
    let fHi = fLo;
    while (fHi < L.feats.length && L.feats[fHi].x0 < bx1) fHi++;
    featB[b] = [fLo, fHi];
  }

  L._idx = { nBuckets, waveB, stepB, featB, wLen };
  return L._idx;
}

/** 原始地形高度（含起步缓冲，未做终点收尾） */
function hillRaw(L, x) {
  let relief = 0;
  // ---- waves：正弦求和保持线性（每项一次 sin，实测不是瓶颈）----
  const idx = L._idx || buildIndex(L);
  const ws = L.waves;
  for (let i = 0, n = idx.wLen; i < n; i++) {
    const w = ws[i];
    relief += w.amp * Math.sin(x * w.f + w.ph);
  }
  // ---- steps：按桶取下标区间，不再从 0 扫全表 ----
  const b = (x / BUCKET_W) | 0;
  const steps = L.steps;
  if (b >= 0 && b < idx.nBuckets) {
    const r = idx.stepB[b];
    for (let i = r[0], e = r[1]; i < e; i++) {
      const s = steps[i];
      if (x > s.cx) {
        const t = clamp((x - s.cx) / STEP_W, 0, 1);
        relief += s.drop * (t * t * (3 - 2 * t));
      }
    }
  }
  // ---- feats：按桶取下标区间 ----
  const feats = L.feats;
  if (feats && feats.length) {
    if (b >= 0 && b < idx.nBuckets) {
      const r = idx.featB[b];
      for (let i = r[0], e = r[1]; i < e; i++) {
        const f = feats[i];
        if (x <= f.x0) continue;
        if (x >= f.x1) continue;
        relief += f.amp * featProfile(f.kind, (x - f.x0) / (f.x1 - f.x0), f.n);
      }
    }
  }
  // 起步缓冲：前 LAUNCH_PAD 恒平，之后 smoothstep 渐入真实起伏（见 LAUNCH_PAD 注释）。
  // smoothstep 两端导数均为 0（C¹），不会在平台边缘制造法线突跳。
  return 300 + relief * ss((x - LAUNCH_PAD) / RUN_IN);
}

/** 关卡地形信息：{y, m}（m 为斜率，>0 下坡 / <0 上坡） */
export function levelGroundInfo(L, x, e = 2) {
  const yL = levelHillY(L, x - e);
  const yR = levelHillY(L, x + e);
  return { y: levelHillY(L, x), m: (yR - yL) / (2 * e) };
}

/**
 * 无限模式的**本局种子**。每次进入无限模式由 freeInit 重新摇一次（setFreeSeed）。
 *
 * ★ 修 bug：原来 freeHill 完全没有随机源 —— 每次打开无限模式，
 *   前几百米的地形轮廓、起伏相位、断层落点**逐字节相同**，玩十次像玩一次。
 *   种子只影响"这一局的地图长什么样"，同一局内仍然连续（同一 x 恒得同一个 y），
 *   物理与存档都不受影响。
 */
let freeSeed = 0;
/** 已求出的体格序列（按块号索引），随里程增长；setFreeSeed 会清空 */
let nepSeq = [];
/** 无限模式的地块宽度（px） */
export const BLOCK_W = 3000;
export function setFreeSeed(s) {
  freeSeed = (Number(s) || 0) >>> 0;
  // ★ 必须清空序列：新的一局从头开始推导体格，
  //   若沿用上一局的残留，去重约束会把第 0~3 块误判成冲突而顺延。
  nepSeq = [];
}

/** 全体体格的平均 stepGap（整局恒定，作为断层频率基准） */
const FREE_GAP_AVG = 1800;
/**
 * 无限模式三层的角频率（rad/px），**整局恒定**。
 *
 * ★ 必须恒定，否则 sin(x·k) 会在 k 变化的块边界处跳半个波长
 *   （x=3000px、Δk=0.001 → 相位跳 3 rad → 地形瞬移上百像素）。
 *   取全体体格的平均波长再取倒数；振幅仍随体格变化，所以起伏"大小"各异，
 *   而轮廓相位永远连续。
 */
const FREE_K_WAVE = (() => {
  const n = 3;
  const avg = [0, 0, 0];
  for (const m of TERRAIN_MOODS) {
    for (let i = 0; i < n; i++) avg[i] += m.waves[i][0];
  }
  return avg.map((s) => (2 * Math.PI) / Math.max(MIN_WAVELEN, s / TERRAIN_MOODS.length));
})();

/** 无限模式：按"地块"换地貌体格，同一地块恒定（含本局种子 → 每局地图不同） */
function freeMoodOf(x) {
  const t = Math.floor(x / BLOCK_W);
  return TERRAIN_MOODS[freeMoodIndex(t)];
}

/**
 * 体格下标：对地块号做**无短周期**的混合。
 *
 * ★ 旧实现是 `Math.imul(t ^ seed ^ C1, C2) >>> 0 % 12`，它有一个隐蔽的周期性：
 *   imul 是 2³² 上的双射（乘数是奇数），而 `h % 4` 只取决于输入的低 2 位，
 *   于是 `h % 4` 在 t 上**周期恰为 4**。既然 `h % 12` 不同则 `h % 4` 必不同，
 *   每个 `t mod 4` 就被锁死在 12 种里的 3 种上（{0,4,8} / {3,7,11} / …）。
 *   实测 `mood(t+4) == mood(t)` 的概率高达 **90.3%** —— 玩家看到的
 *   "一直是同一块图再刷新"就是它：12 种体格被切成 4 组轮着来。
 *
 *   修法：先把哈希打散到高位，再取模。`>>> 16` 让参与取模的是高 16 位，
 *   它们与 t 的低 2 位不再有那种固定周期关系；再乘一个大的奇数再打散一次。
 */
function freeMoodIndex(t) {
  let h = (t ^ freeSeed) >>> 0;
  h = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;              // 高低位混合：打散 mod 4 的周期
  h = Math.imul(h, 0x7feb352d) >>> 0;      // 再打散一次
  h = (h ^ (h >>> 15)) >>> 0;              // ★ 必须补 >>>0
  //   （Math.imul 返回**有符号** int，异或会把符号位重新置上，
  //     于是 h % 12 可能得到 -1 ~ -11，`TERRAIN_MOODS[-1]` 就是 undefined ——）
  return h % TERRAIN_MOODS.length;
}

/**
 * 地块体格的**最近 N 块不重复**约束。
 *
 * ★ 光修哈希还不够：12 选 1 的随机序列里，"隔 3~4 块重复一次"仍属常见。
 *   这里显式记住前 NEP_BLOCKS 个用过的下标，命中就顺延到下一个空闲项。
 *   NEP 取得小（4）时几乎不改变分布，却能把最小重复间隔拉到 ≥ NEP 块。
 */
const NEP_BLOCKS = 4;

/**
 * 无限模式体格序列：每块一个下标，带"最近 NEP_BLOCKS 块不重复"约束。
 *
 * ★ 用**完整数组**而不是循环数组：`freeHill` 是纯函数，可能被任意 x 调用
 *   （渲染回看、respawn 跳回安全点、AI 落在远处……），
 *   循环数组只保留最后 N 块的值，早于那的块会取到别人的槽位。
 *   数组按需增长，每块多占 4 字节 —— 跑 10 万块（300km）也只占 400KB，可接受。
 */
function freeMoodSeq(t) {
  for (let i = nepSeq.length; i <= t; i++) {
    let idx = freeMoodIndex(i);
    // 与最近 NEP_BLOCKS 块冲突时顺延（最多试满一轮，必然找到空闲项）
    for (let k = 0; k < TERRAIN_MOODS.length; k++) {
      let clash = false;
      for (let j = Math.max(0, i - NEP_BLOCKS); j < i; j++) {
        if (nepSeq[j] === idx) { clash = true; break; }
      }
      if (!clash) break;
      idx = (idx + 1) % TERRAIN_MOODS.length;
    }
    nepSeq[i] = idx;
  }
  return nepSeq[t];
}

/** 无限模式地形（随里程缓慢加难，无终点；地形随地块切换体格，绝不重复） */
/**
 * 无限模式地形：随里程缓慢加难，无终点。
 *
 * ★ 本函数重写过三次，每一处都对应一个实测到的缺陷：
 *
 * ① 累积下沉（原 `y += stepDrop * segIdx`）
 *    segIdx 随 x 无界增长，地基就一路往下掉：实测 1km 处 y=1588、
 *    5km 处 y=12735。于是"跑得越远掉得越快"，高速车永远追不上地面，
 *    掉出地图判定（地面下方 800px）被反复触发 —— 用户报告的
 *    "无限模式只有 800 米""跑太快会滑出地图"是**同一个 bug 的两种表现**。
 *    现在改为**基准线回中**（见 baseYOf）：起伏围绕一条缓慢起伏的基准线展开，
 *    基准线本身有界，因此长期不漂移。
 *
 * ② 地块边界瞬移（原 stepGap 换常数 + 相位/波长跳变）
 *    旧代码每 3000px 就换一次体格，而体格决定 stepGap/stepDrop：
 *    segIdx 用**新** stepGap 重算，累计高度直接瞬移（实测平均 3525px、
 *    最大 15756px，189/200 个边界超过 50px）。现在把体格的影响改为
 *    **在块边界平滑过渡**（见 blendOver），并让相位/波长用连续函数而非分段常数。
 *
 * ③ 体格重复（原哈希的 mod 4 周期，见 freeMoodIndex）
 *    现在配合 NEP 去重，最小重复间隔 ≥ 4 块。
 */
export function freeHill(x) {
  const d = Math.max(0, x - 400);
  const diff = Math.min(1, d / 120000);
  const diffS = diff * diff * (3 - 2 * diff);
  // 与关卡一致的出发平台：前 LAUNCH_PAD 恒平，之后 smoothstep 渐入
  const ramp = ss((x - LAUNCH_PAD) / RUN_IN);
  const t = x / BLOCK_W;
  const seg = Math.floor(t);
  const frac = t - seg; // 块内进度 0~1
  // 体格参数：把**当前块与下一块**的对应参数做线性插值。
  // 插值权重 frac 在块边界处左右极限都是 0/1 处的同一体格，故所有参数 C⁰ 连续。
  const moodA = TERRAIN_MOODS[freeMoodSeq(seg)];
  const moodB = TERRAIN_MOODS[freeMoodSeq(seg + 1)];
  const lerpMood = (get) => get(moodA) * (1 - frac) + get(moodB) * frac;

  // ---- 三层正弦起伏 ----
  // ★ 这里有一个反复踩到的坑：**绝不能写成 sin(x · k(x))**。
  //   当 k 随 x 变化（哪怕只是随块跳一次）时，相位 x·k 会在那一刻出现 x·Δk 的
  //   **巨大相位跳变**：x 到 3000px 时 Δk=0.001 就是 3 rad ≈ 半波长，
  //   地形直接垂直瞬移上百像素（实测最大 252px）。
  //   所以频率 k 必须是**整局恒定的常量**，只让振幅随体格平滑过渡 ——
  //   相位于是是 x 的纯线性函数，天然 C^∞。
  //   体格差异改由"振幅 + 层间权重 + 断层落差系数"体现，
  //   加上 freeMoodSeq 决定的**装饰与地形标签**，视觉上同样是每段都不一样。
  const ph = (freeSeed % 6283) * 0.001;
  let relief = 0;
  for (let i = 0; i < 3; i++) {
    const wA = moodA.waves[i] || moodA.waves[moodA.waves.length - 1];
    const wB = moodB.waves[i] || moodB.waves[moodB.waves.length - 1];
    const ampA = wA[1] * 0.5 + wA[1] * 0.5 * diffS + wA[2] * diffS;
    const ampB = wB[1] * 0.5 + wB[1] * 0.5 * diffS + wB[2] * diffS;
    // 振幅平滑过渡（振幅只改变起伏大小，不产生跳变）
    const amp = ampA * (1 - frac) + ampB * frac;
    relief += Math.sin((x * FREE_K_WAVE[i]) + ph + i * 1.9) * amp;
  }

  // ---- 断层（下降台阶）：用**固定**波长的正弦叠加表达周期起伏 ----
  // ★ 关键：这里的相位必须是 x 的**纯线性**函数（k 定值）。
  //   任何 "floor(d / gap(x))" 形式都会在 gap 变化时让 floor 的整数跳变，
  //   于是整段地形平移一个 gap —— 这正是实测残余跳变（平均 3.2px / 最大 36px）的来源。
  //   用固定频率的正弦，既保留了"周期性陡坎"的观感，又天然 C^∞ 连续。
  //   stepGap 只用来定**波长**（取整到固定档），不参与相位计算。
  // 同上：频率必须**整局恒定**（不能是"当前块两体格的平均" —— 那仍然逐块跳变）。
  // 取全体体格的平均 stepGap 作常量，振幅随体格平滑过渡。
  const gapC = FREE_GAP_AVG;
  const stepK = lerpMood((m) => m.stepK);
  const stepDrop = (15 + diffS * 10) * stepK;
  const kStep = (2 * Math.PI) / gapC;
  relief += stepDrop * (1 + Math.sin(x * kStep + ph * 3.1)) * 0.5;

  // ---- 基准线 + 累计落差：全部是 x 的连续函数，无 floor ----
  //   累计落差取**饱和**形式：d·K/(1+d·K/上限)，长期趋于上限，
  //   既保留了"越跑越深"的成长感，又不会像原来那样线性下坠到几万像素。
  const DRIFT_K = 0.00022, DRIFT_CAP = 900;
  const drift = (d * DRIFT_K * DRIFT_CAP) / (DRIFT_CAP + d * DRIFT_K);
  const y = baseYOf(d) + drift + relief;
  return 300 + (y - 300) * ramp;
}

/**
 * 无限模式的地形基准线（px）。
 *
 * ★ 用一条**有界的低频正弦**替代原先无界增长的下沉累积：
 *   玩家要求"无限模式真就是无限延伸"，所以地形既不能下沉也不能抬升，
 *   必须长期围绕一个稳定高度波动 —— 否则跑到 5km 之后地面已经在地下十几公里，
 *   相机跟随、装饰布置、掉出地图判定全部失去意义。
 *   波长取 240000px（2.4km），振幅 260px：约每 2.4km 一次缓慢的起伏，
 *   玩家能感到"路在缓缓升降"，但绝不会离基准线超过 ±260px。
 */
function baseYOf(d) {
  return Math.sin(d * 0.0000262) * 260;
}

/**
 * 采样得到关卡真实最大坡度（tan 值），标定与面板展示用。
 * @param {object} P 地形参数（waves/steps/feats）；传子集即可单独测量某一部分
 * @param {number} len 赛道长度
 *
 * ★ 采样**步长**随 len 自适应，但有限差分的基线 e 恒为 2px。
 *   这两件事必须分开：stride 只是"在哪些位置取样"，步长放大到 40px 时
 *   坡度峰所在的区段仍有十余个采样点，峰值不丢（实测 stride 4 → 40 的
 *   测量结果差 0.00°）；而 e 是差分的**跨度**，一放大就把坡度峰抹平 ——
 *   试过 e=stride，结果 fitSlope 低估坡度、把振幅反解放大 1.84 倍，
 *   第 1 关标称 19.5° 的地形实测成了 35.9°，直接毁掉难度曲线。
 *   e=2 对应接触求解器的 CONTACT_BAND，是"地形在多细的尺度上算斜坡"的定义。
 *   实测：432 关构建 1447ms → 522ms（R9.2 要求 ≤1000ms）。
 */
const SLOPE_SAMPLES = 20000;
const SLOPE_E = 2;
function measureMaxSlopeTan(P, len) {
  const stride = Math.max(4, Math.ceil(len / SLOPE_SAMPLES));
  let mx = 0;
  for (let x = 70; x <= len; x += stride) {
    const yL = levelHillY(P, x - SLOPE_E);
    const yR = levelHillY(P, x + SLOPE_E);
    const m = Math.abs((yR - yL) / (2 * SLOPE_E));
    if (m > mx) mx = m;
  }
  return mx;
}

/** 采样得到关卡真实最大坡度（含断层过渡段），面板展示用 */
function measureMaxSlope(L) {
  return (Math.atan(measureMaxSlopeTan(L, L.len)) * 180) / Math.PI;
}

/**
 * 难度标定：**基底波形**（waves + steps）缩放到 (1−FEAT_SLOPE_FRAC) 的目标坡度，
 * 局部地貌缩放到 FEAT_SLOPE_FRAC 的目标坡度，两者叠加后命中总目标。
 *
 * ★ 这是"形状随机"与"难度单调 + 可通关"三者共存的关键：
 *   地形高度对所有振幅线性 → 坡度也对振幅线性 → 一次采样即可解析求出缩放系数，
 *   无需迭代。于是体格（波长/局部地貌/断层位置）可以彻底自由随机，
 *   而 maxSlope 仍严格沿全局进度递增（难度曲线的断言得以保留）。
 *   注意起步缓冲是乘性的，同样线性，不影响该结论。
 *
 * 分两部分标定（而非整体缩放）是必要的：整体缩放时，坡度由最陡的局部地貌决定，
 * 会被迫把 gentle 的基底一起放大，累计爬升随之失控（见 FEAT_SLOPE_FRAC 注释）。
 */
function fitSlope(L, targetDeg) {
  const tanT = Math.tan((targetDeg * Math.PI) / 180);
  // 一次解析缩放即可精确命中：地形高度对全部振幅线性 → 坡度也线性，
  // 所以 maxSlope(整体) = k · maxSlope(原始)，反解 k 是闭式的，无需迭代。
  const raw = measureMaxSlopeTan(L, L.len);
  if (!(raw > 1e-6)) { L.maxSlope = targetDeg; return; }
  const k = tanT / raw;
  for (const w of L.waves) w.amp *= k;
  for (const s of L.steps) s.drop *= k;
  if (L.feats) for (const f of L.feats) f.amp *= k;
  // ★ 回填值直接取 targetDeg，**不再重跑一遍采样**（原为 measureMaxSlope(L)）。
  //   既然 maxSlope 对全部振幅严格线性，缩放 k 之后它必然等于 raw·k = tanT，
  //   第二次采样是恒等变换 —— 纯浪费一半生成耗时。
  //   逐关验证过：432 关的 maxSlope 与 targetSlopeDeg(gN) 的最大偏差为 0.00°。
  L.maxSlope = targetDeg;
}

// ---------------- 地形参数工厂 ----------------

/**
 * 三层叠加起伏：波长与相位由"体格 + 每关种子"随机决定 → 每关波形都不同。
 * 振幅在此只是"未标定的初值"，随后由 fitSlope() 统一缩放到目标坡度。
 */
function buildWaves(mood, ramp, rng) {
  const j = mood.jitter;
  const out = [];
  for (let i = 0; i < mood.waves.length; i++) {
    const [wl0, a0, aG] = mood.waves[i];
    // 波长抖动：同体格的关卡之间也不会撞出同一段波形；并夹到 MIN_WAVELEN 以上
    const wl = Math.max(MIN_WAVELEN, wl0 * (1 + (rng() * 2 - 1) * j));
    out.push({
      f: (2 * Math.PI) / wl,
      amp: a0 + aG * ramp,
      ph: rng() * Math.PI * 2,
    });
  }
  return out;
}

/**
 * 下坡断层：条数与落差沿用原曲线（**落差刻意不做体格缩放**）；变化来自**位置**。
 *
 * ★ 落差即曲率：断层的最大曲率 ≈ 6·drop/STEP_W²，是全关最尖的地方。
 *   放大落差会直接把接触求解器顶出容差（实测车架约束瞬时漂移 12px、
 *   高速穿断层 4px），所以"变化靠位置不靠落差"：断层落在 x=900 还是 x=2400
 *   对玩法与观感的影响远大于把落差调大 20%，且完全在物理包线内。
 */
function buildSteps(mood, ramp, gN, len, rng, nOverride) {
  // 起点：出发平台 + 渐入段**完全结束**之后（再留 200px 余量），
  // 避免断层落在渐入斜坡上 —— 那里 relief 正被 ramp 放大，落差会失真且曲率超标
  const first = LAUNCH_PAD + RUN_IN + 200;
  const usable = Math.max(1, len - first - 800);
  // ★ 体格间距与 len **解耦**：原来写成 `0.62 + (len/13200)*0.38`，
  //   那是在补偿"关卡变长 → 条数不变 → 后半段没有断层"。
  //   现在条数自己跟上长度（见下），间距回到纯体格值 + 难度的轻微加权。
  const gap = mood.stepGap * (0.85 + ramp * 0.3);
  // ★ 条数由"赛道长度 ÷ 体格间距"反解，不再是固定的 1~7 条：
  //   关卡拉长到 78,000px（5.9 倍）后仍只放 7 条，末两条会落在 40km 之外，
  //   玩家整段路见不到任何断层 ——"随里程加难"这条曲线在最后 1/3 直接断掉。
  //   现在条数 ∝ 长度，断层密度（条/px）回到与旧曲线同一量级。
  const nStep = nOverride != null ? nOverride : Math.max(1, Math.min(400, Math.round(usable / gap)));
  const steps = [];
  let cx = first + rng() * 400;
  for (let r = 0; r < nStep; r++) {
    // 落差随"关卡进度"涨，但**不随条数涨**：r/(nStep-1) 归一化，
    // 否则 400 条断层里最后一条的落差会是第一条的 300 倍。
    const f = nStep > 1 ? r / (nStep - 1) : 1;
    steps.push({ cx: Math.round(cx), drop: 15 + gN * 76 + f * (2 + gN * 7) });
    // 间距抖动保持在 ±18% 以内：断层是"高速把车弹飞"的坡度突变源，
    // 间距一小就会连成串，实测末关出现 828px 的密集断层群，
    // 参考骑手被反复弹起、落地倒立、摔车重生回到同一处 —— 直接死循环。
    cx += gap * (1 + (rng() * 2 - 1) * 0.18);
    if (cx > len - 900) break; // 不越过终点缓冲
  }
  return steps;
}

/**
 * 局部地貌（起跳唇 / 洼地 / 平台 / 碎浪 / 深谷）：按体格权重沿赛道随机播撒。
 * 这是"复杂多变"的主要来源 —— 正弦叠加只会得到大同小异的丘陵，
 * 而带平台与深谷的局部结构才让每一关有真正不同的节奏与玩法。
 * x0 升序返回（levelHillY 依赖它早退）。
 */
function buildFeats(mood, ramp, len, rng) {
  const kinds = [];
  for (const k in mood.feat) {
    const n = Math.round(mood.feat[k] * (0.7 + ramp * 0.9));
    for (let i = 0; i < n; i++) kinds.push(k);
  }
  if (!kinds.length) return [];
  const feats = [];
  const x0Min = 900;
  const x1Max = len - 500;
  const span = x1Max - x0Min;
  if (span < 600) return [];
  // 每类地貌的特征宽度（px）——都远宽于 MIN_FEAT_W：宽而缓才可解算
  const W = { kicker: 760, dip: 700, shelf: 980, whoops: 900, chasm: 640, ramp: 750 };
  // 播撒数量：随体格总权重与赛道长度
  // ★ 上限从 16 抬到 600：原来 16 是给"最长 13,200px"关卡定的硬顶，
  //   关卡拉长到 78,000px 后公式算出 110 条却被截到 16 —— 密度掉到 1/6.9，
  //   末段赛道上每 4.9km 才有一处局部地貌，节奏感完全消失。
  //   600 同时兜住终局关：16.7M px 会算出 23,700 条，全存下来纯属浪费
  //   （且 FEAT_AMP_MAX=0 时非 ramp 地貌的振幅本就是 0，只占桶查询开销）。
  const total = kinds.length;
  const n = Math.max(3, Math.min(600, Math.round((total * span) / 4200)));
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length) % kinds.length];
    // whoops 的包数越多，最短子波长越短 → 限制在 1~2 包，保证子波长 ≥ MIN_WAVELEN
    const nPer = kind === "whoops" ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3);
    const minW = kind === "whoops" ? MIN_WAVELEN * (nPer + 1) * 0.5 : MIN_FEAT_W;
    const w = Math.max(minW, W[kind] * (0.85 + rng() * 0.5));
    if (w > span * 0.9) continue;
    // 均匀铺开 + 抖动，保证覆盖整条赛道且不扎堆
    const slot = (span - w) * ((i + 0.15 + rng() * 0.7) / n);
    const x0 = x0Min + slot;
    let amp;
    if (kind === "ramp") {
      // 直坡：profile 峰值 = 1，故 amp 即"总爬升"。由目标坡度反解：
      // 世界坡度 = amp·π/w，取 RAMP_GRADE → amp = RAMP_GRADE·w/π。
      // 振幅天然很大（宽坡才爬得高），但**中段曲率为 0**，不抬 maxSlope。
      amp = (RAMP_GRADE * w) / Math.PI * (0.8 + ramp * 0.35) * (0.85 + rng() * 0.3);
    } else {
      // 其余地貌：振幅锁在 FEAT_AMP_MAX 预算内（见其注释）——宽而浅
      amp = FEAT_AMP[kind] * FEAT_AMP_MAX * (0.55 + rng() * 0.6) * (0.7 + ramp * 0.4);
      // ★ FEAT_AMP_MAX=0 时 amp 恒为 0，对地形没有任何贡献 ——
      //   不生成是逐位等价的，却能省掉桶查询里的无用条目。
      //   关卡拉长后这一项从"16 个里偶尔有 1 个 ramp"变成
      //   "几百个 feats 里绝大多数是零振幅"，不剪的话纯属浪费。
      if (amp === 0) continue;
    }
    feats.push({
      kind,
      x0: Math.round(x0),
      x1: Math.round(x0 + w),
      amp,
      n: nPer,
    });
  }
  feats.sort((a, b) => a.x0 - b.x0);
  return feats;
}

/** 由全局进度推导一关的全部参数（难度对 gN 单调；形状每关独立随机） */
function makeLevel(gi) {
  const gN = gi / (TOTAL - 1); // 0 → 1
  const bi = Math.floor(gi / LEVELS_PER_BRANCH);
  const k = gi % LEVELS_PER_BRANCH;
  // 变体穿插：k ∈ SPECIAL_SLOTS 的关位为特殊变体，按支线下标错开两轮轮转
  const slotIdx = SPECIAL_SLOTS.indexOf(k);
  const variant = slotIdx >= 0 ? SPECIALS[(bi * 2 + slotIdx) % SPECIALS.length] : "normal";
  // 难度分层：前期 ramp 增长慢（教学），后段陡增；ramp 对 gN 单调不减
  const ramp = Math.pow(clamp(gN, 0, 1), 1.15);
  const len = Math.round(5610 + gN * (78000 - 5610)); // 路程 5610 → 78000
  // 赛道金币数量随全局进度递增（36 → 108）
  // ★ 随 len 同步放大：金币密度（枚/px）必须与路程无关，否则关卡拉长 5.9 倍后
  //   赛道会从"隔几步一个"变成"隔一公里一个"，中后段看起来像没人扫过的路。
  const coinN = Math.round(36 + gN * 72);
  // 通关固定奖励随进度递增（700 → 2500）：玩家在**闯关阶段**（前 36 关）
  // 就能把一台入门车四项升满，不必刷几百关才看得到升级效果。
  // 系数是反推出来的：前 36 关按 60% 收集率要能攒够 28,240（一台入门车四项升满）。
  const goldBase = Math.round(700 + 1800 * gN);
  // 单枚赛道金币的面值（40 → 90）：与 coinN 相乘，单关总产出 960 → 6480
  const coinVal = Math.round(40 + 50 * gN);
  // 体格：按支线下标对 12 种气质取模轮转（36 条支线覆盖 12 种气质），
  // 再叠加每关独立的种子 → 相邻关卡的波形 / 局部地貌 / 断层节奏都不同
  const mood = TERRAIN_MOODS[bi % TERRAIN_MOODS.length];
  const rng = mulberry32(0x51ed + gi * 2654435761);
  const L = {
    name: BRANCHES[bi].name + " " + (k + 1),
    len,
    waves: buildWaves(mood, ramp, rng),
    steps: buildSteps(mood, ramp, gN, len, rng),
    feats: buildFeats(mood, ramp, len, rng),
    coinN,
    goldBase,
    coinVal,
    ramp,
    // 三星时限的速度基准（三星要求均速）：前期 ≈0.72×基准极速（余量更宽、易拿满星），
    // 末期 ≈0.50×（更严，须在陡峭地形上稳住节奏）；starTime(L) = L.len / L.den3 语义不变
    den3: REF_SPEED * (0.72 - 0.22 * ramp),
    // 油耗倍率：后期环境恶劣（缺氧/沙尘/低温），同样动作更费油
    fuelK: 1 + 3.1 * ramp,
    // 机制密度权重（0~1）：危险段/限时门的数量都按它缩放
    mech: gN,
    // 机制预算（数量）：实际落点由 game/world.js 按地形与既有机制筛选
    hazardN: Math.round(1 + gN * 5), // 危险段 1 → 6
    gateN: 3 + Math.round(gN * 2), // 限时门 3 → 5
    variant,
    theme: BRANCHES[bi].theme,
    mood: mood.id, // 面板/HUD 可展示的地貌体格名
  };
  fitSlope(L, targetSlopeDeg(gN)); // 形状自由随机，难度由实测坡度精确标定
  return L;
}

// ---------------- 全部 432 关 ----------------
export const LEVELS = Array.from({ length: TOTAL }, (_, gi) => makeLevel(gi));

// ---------------- 长赛道构建器（终局关 / 赛事 / 宇宙场共用） ----------------
/**
 * 构造一条"多地形段拼接"的长赛道。
 *
 * ★ 为什么要抽出来：终局关（167km / 36 段）、赛事（3.6km 专用赛道）、
 *   宇宙场（10M~500M px，5 个分级）都是同一件事 ——
 *   "把 N 段不同地貌首尾拼成一条超长赛道，再整体标定坡度"。
 *   三处各写一份的结果是各自的断层/地貌密度公式各走各的，
 *   改一处就漂移（这正是原终局关里 `k = (len-first-800)/7800` 这种
 *   硬编码展宽系数的由来）。
 *
 * @param {object} o
 * @param {string} o.name        关卡名（展示用）
 * @param {number} o.len         总长（px）
 * @param {number} o.segs        地形段数（每段等长）
 * @param {number} o.slopeDeg    目标最大坡度
 * @param {number} o.seed        随机种子
 * @param {number[]} o.themes    每段对应的场景下标（长度 = segs；不传则依次取 THEMES）
 * @param {boolean} [o.allThemes] 为 true 时第 i 段强制绑定 THEMES[i].theme
 * @returns {object} 关卡定义（已 fitSlope）
 */
function buildLongCourse(o) {
  const { name, len, segs, slopeDeg, seed } = o;
  const rng = mulberry32(seed);
  const segLen = len / segs;
  const waves = [];
  const steps = [];
  const feats = [];
  const segments = [];
  for (let s = 0; s < segs; s++) {
    // 段 i 的场景：allThemes 时严格等于 THEMES[i].theme（R1.2 的硬要求），
    // 否则按下标错开取，保证相邻段的物理环境（重力/抓地）不至于连续重复
    const theme = o.allThemes
      ? (THEMES[s] ? s : s % THEMES.length)
      : (o.themes ? o.themes[s % o.themes.length] : (s * 5 + 3) % TERRAIN_MOODS.length);
    segments.push({ x: Math.round(s * segLen), theme });

    // 体格：按段下标错开取模，36 段正好把 12 种体格各过 3 遍
    const mood = TERRAIN_MOODS[(s * 5 + 3) % TERRAIN_MOODS.length];
    // ★ 每段只取该体格的**主波**（最长波长那层），不是全部三层。
    //   多条正弦全叠加时，同一坡度下的"粗糙度"会累加出数倍累计爬升，
    //   参考骑手连第一个分段都骑不完。长赛道要的是"地貌多样"而非"强度叠加"。
    const w = buildWaves(mood, 1, rng)[0];
    w.ph += s * 2.399963; // 段间错开相位，避免各段波形彼此重合
    // ★ 强度按几何级数递减：各段主波量级相近时，它们的峰几乎永不同向叠加 ——
    //   对齐后的最大坡度不变，但"各波坡度之和"（真正决定累计爬升的量）
    //   会按段数线性累加。按 0.62^s 递减后总爬升回到与单关相当，
    //   波长/相位的多样性完全保留。
    w.amp *= Math.pow(0.62, s % 12);
    waves.push(w);
    // 局部地貌逐段生成后平移到该段的 x 偏移
    //
    // ★ 只保留 amp≠0 的（即 ramp 长直坡）：FEAT_AMP_MAX=0 时其余 5 类地貌
    //   （起跳唇/洼地/平台/碎浪/深谷）的振幅**恒为 0**（见 FEAT_AMP 注释），
    //   对地形高度没有任何贡献。长赛道按 0.8k px/个 生成时，
    //   终局关会攒出 21,600 个 feats，其中 88.6% 是纯零振幅 ——
    //   它们只在 hillRaw 的桶查询里被逐个跳过，白占内存与热路径开销。
    //   这里直接不生成：零振幅条目对地形的贡献恒为 0，删掉是**逐位等价**的。
    for (const f of buildFeats(mood, 1, segLen, rng)) {
      if (f.amp === 0) continue;
      feats.push({ ...f, x0: f.x0 + s * segLen, x1: f.x1 + s * segLen });
    }
    // 断层按段铺开：每段固定条数，保证全长密度均匀
    // （旧实现只按全长放 7 条，167km 上最后一条会落在 40km 之外）
    const sp = buildSteps(mood, 1, 1, segLen, rng, Math.max(1, Math.round(segLen / mood.stepGap)));
    for (const st of sp) steps.push({ cx: Math.round(st.cx + s * segLen), drop: st.drop });
  }
  feats.sort((a, b) => a.x0 - b.x0);
  steps.sort((a, b) => a.cx - b.cx); // buildIndex 要求 cx 升序
  return { name, len, waves, steps, feats, segments };
}

// ---------------- 最终任务（索引 FINALE_INDEX，已接进 buildLevel） ----------------
/**
 * 终局关「环大陆」：16,666,666px（167km），36 个地形段 × 每段 10 个计时门 = 360 门。
 *
 * ★ den3 必须按"满级归墟（1000 km/h）跑完要 600s"反解，不能沿用 REF_SPEED×0.5：
 *   REF_SPEED=520，×0.5=260 px/s → starTime = 16,666,666/260 = **17.8 小时**。
 *   目标速度 27,777.8 px/s（即 1000 km/h），故 den3 = len/600。
 */
export const FINALE_LEN = 16666666;
export const FINALE_GATE_PER_SEG = 10;
/** 终局关的地形段数（= THEMES.length = 36）：断点续玩的进度上限 */
export const FINALE_SEGS = THEMES.length;
export const FINALE = (() => {
  const len = FINALE_LEN;
  const segs = FINALE_SEGS; // 36：每段严格对应一个场景（R1.2）
  const base = buildLongCourse({
    name: "终极远征 · 环大陆",
    len,
    segs,
    slopeDeg: 54,
    seed: 0xf17a1e,
    allThemes: true,
  });
  const L = {
    ...base,
    // 金币密度与普通关卡对齐（每 ~720px 一枚），而不是固定 90 枚
    coinN: Math.round(len / 720),
    ramp: 0.5,
    // ★ 见上方注释：den3 由"1000 km/h 跑完 600s"反解
    den3: len / 600,
    fuelK: 1 + 3.1,
    mech: 1.3,
    // 危险段密度：每 12km 一段（167km → 13 段）
    hazardN: Math.round(len / 12000),
    // 360 门 = 36 段 × 每段 10 门，间距 16,666,666/360 ≈ 46,296px
    gateN: segs * FINALE_GATE_PER_SEG,
    variant: "normal",
    theme: 0,
    mood: "gauntlet",
  };
  fitSlope(L, 54);
  return L;
})();

/**
 * 赛事专用赛道（R6.1）。
 *
 * ★ spec 里 R6.1（赛事 ≥6min）与 R6.3（普通关卡 5,610→78,000px）是**互斥**的：
 *   驮马 36 km/h = 1000 px/s，跑满 360s 需要 360,000px，
 *   而 432 关里最长的只有 78,000px（= 78s）。两者不可兼得 ——
 *   赛事必须有一条**不复用玩家所选关卡**的专用赛道。
 *   这是实施时对 spec 的修订，已写回 spec.md 的修订说明。
 */
export const RACE_LEN = 360000;
export const RACE_COURSE = (() => {
  const base = buildLongCourse({
    name: "竞速赛道",
    len: RACE_LEN,
    segs: 6,
    slopeDeg: 30,
    seed: 0x2ace01,
    themes: [0, 6, 5, 3, 10, 11],
  });
  const L = {
    ...base,
    coinN: Math.round(RACE_LEN / 720),
    ramp: 0.5,
    // AI 配速以 den3 为基准（见 race.js 的 raceBaseSpeed），
    // 取 REF_SPEED×0.68 使 AI 明显慢于三星节奏、但不会稳赢
    den3: REF_SPEED * 0.68,
    fuelK: 1 + 3.1,
    mech: 1.3,
    hazardN: Math.round(RACE_LEN / 12000),
    gateN: 0, // 赛事没有计时门
    variant: "normal",
    theme: 0,
    mood: "gauntlet",
  };
  fitSlope(L, 30);
  return L;
})();

/** 最终任务的全局索引（= LEVELS.length）：LEVELS 之后的一个逻辑关卡 */
export const FINALE_INDEX = LEVELS.length;

// ---------------- 宇宙场（R3） ----------------
/** 宇宙场模式标识（store.mode 的第 5 个取值） */
export const MODE_SPACE = "space";

/**
 * 5 个难度分级的定义表（R3.2）。
 *
 * | 分级 | 难度取向 | 关卡时长 |
 * |---|---|---|
 * | 易   | 长直坡、地形平缓 | 6 分钟 |
 * | 中   | 中等起伏 | 6 分钟 |
 * | 难   | 起伏加剧 | 6 分钟 |
 * | 极难 | 陡坡密布 | 6 分钟 |
 * | 终极 | 全地形 | 6 分钟 |
 *
 * ★ **长度按玩家实际极速缩放**（实施时修订，原 R3.2 写的是固定 10/50/100/250/500 Mpx）：
 *   `len = 玩家极速 × 360s`，于是**任何车进任何分级都刚好跑满 6 分钟**。
 *
 *   为什么必须改：AI 配速早就改成"玩家极速 ×0.9"了（见 spaceAIScale），
 *   长度却还钉在"某台参考车 × 6 分钟"上，两者直接打架 ——
 *   实测归墟（1000 km/h）跑终极级需要 **5 小时**，面板却写着"6 分钟"。
 *   玩家看到的是"6 分钟"，实际要开一整天。
 *   另一条路是给分级加车辆门槛，但那样归墟只能进「易」级，
 *   宇宙场对它几乎没用武之地（而它恰恰是任务换来的第一台车）。
 *
 *   分级的难度改由**地形**承担：segs（分段数）与 slopeDeg（坡度上限）逐级递增，
 *   越高的分级坡越陡、段落切换越频繁 —— 这才是"难"的正确载体。
 *
 * ★ 可用的太空场景下标：themes.js 里 `bg.space === true` 的 4 个
 *   （3 月面 / 11 极夜星空 / 24 冰晶湖 / 34 观星台），
 *   它们都自带视差天体（earth / moon / ringed），R3.1 不需要新写渲染代码。
 * ★ kmh 只用于**面板上的对照文案**（"参考配速"），不参与长度与 AI 计算。
 */
export const SPACE_TIERS = [
  { id: "easy", name: "易", icon: "🌑", kmh: 1000, segs: 12, slopeDeg: 26, gold: 4e10, themes: [3, 11, 24, 34] },
  { id: "mid", name: "中", icon: "🪐", kmh: 5000, segs: 18, slopeDeg: 22, gold: 2.4e13, themes: [24, 34, 3, 11] },
  { id: "hard", name: "难", icon: "🌌", kmh: 10000, segs: 24, slopeDeg: 18, gold: 1.08e17, themes: [34, 3, 24, 11] },
  { id: "brutal", name: "极难", icon: "⚫", kmh: 25000, segs: 30, slopeDeg: 14, gold: 5.184e21, themes: [3, 34, 11, 24] },
  { id: "final", name: "终极", icon: "🌠", kmh: 50000, segs: 36, slopeDeg: 10, gold: 1.5552e24, themes: [11, 24, 34, 3] },
];

/** 宇宙场的目标时长（秒）：任何车、任何分级都跑满这么久 */
export const SPACE_TARGET_SEC = 360;

/**
 * 该分级的赛道长度（px）= 玩家实际极速 × SPACE_TARGET_SEC。
 *
 * @param {object} tier SPACE_TIERS 的一项
 * @param {number} playerTop 玩家当前实际极速（px/s）
 */
export const spaceLenOf = (tier, playerTop) =>
  Math.round(Math.max(1, playerTop || 1) * SPACE_TARGET_SEC);

/**
 * 宇宙场赛道（惰性构建 + 按长度缓存）。
 *
 * ★ 缓存键必须**含长度**：同一分级下不同车速得到不同长度的赛道，
 *   只按 tier.id 缓存会让第二台车拿到第一台车的赛道。
 *   键用"长度分桶"（按 4096px 向上取整）而不是精确长度 ——
 *   否则每帧极速的微小抖动都会生成一条新赛道。
 */
const spaceCache = new Map();
export function spaceCourse(tierIdx, playerTop) {
  const t = SPACE_TIERS[tierIdx];
  if (!t) return null;
  const len = spaceLenOf(t, playerTop);
  const key = t.id + ":" + Math.ceil(len / 4096);
  if (spaceCache.has(key)) return spaceCache.get(key);
  const base = buildLongCourse({
    name: `宇宙场 · ${t.name}`,
    len,
    segs: t.segs,
    slopeDeg: t.slopeDeg,
    seed: 0x5ace00 + tierIdx * 7919,
    themes: t.themes,
  });
  const L = {
    ...base,
    // ★ 实体密度按"每秒几个"给，而不是按每 px 几个：
    //   长度已经随车速缩放，用 px 密度会让无相的赛道（= 极速×360s）实体数暴涨。
    coinN: 0,          // 由下面按 playerTop 算
    ramp: 0.5,
    den3: Math.max(1, playerTop || 1),   // AI 与三星节奏共用玩家极速基准
    // ★ fuelK = 0：需求 need = len/range，而 range = vAvg/kAvg，kAvg ∝ fuelK →
    //   fuelK = 0 时 kAvg = 0 → range = ∞ → need = 0，一箱都不用加。
    //   这正是宇宙场该有的手感（omega 形态本来就 noFuel，其余车等效）。
    fuelK: 0,
    mech: 1.3,
    hazardN: 0,        // 同上
    gateN: 0,
    variant: "normal",
    theme: t.themes[0],
    mood: "gauntlet",
    spaceTier: t.id,
    // 宇宙场专用：赛道极长，实体必须**流式生成**（见 world.js 的 CHUNK_*）
    streaming: true,
  };
  // ★ 密度按"每几秒一个"给，与车速无关 —— 长度已经随车速缩放，
  //   用 px 密度会让无相的赛道（= 极速×360s）实体数暴涨。
  //   每 3 秒一枚金币：6 分钟共 120 枚，沿途始终有东西可捡，
  //   但对 10 亿 px 的赛道也只占 120 个对象（可忽略）。
  L.coinN = Math.max(8, Math.round(SPACE_TARGET_SEC / 3));
  L.hazardN = Math.max(2, Math.round(SPACE_TARGET_SEC / 90));
  L.coinVal = Math.max(1, Math.round(t.gold / (L.coinN * 20)));   // 赛道金币合计 ≈ 分级奖金的 5%
  fitSlope(L, t.slopeDeg);
  spaceCache.set(key, L);
  // 缓存只留最近 6 条：玩家换车 / 换分级会不断产生新长度的赛道，
  // 无上限地留着会让地形数组（每条几万个 steps/feats）持续堆积。
  if (spaceCache.size > 6) spaceCache.delete(spaceCache.keys().next().value);
  return L;
}

/**
 * 宇宙场的 AI 配速（R3.3 / R3.4）。
 *
 * ★ 核心口径：AI 取玩家**当前车辆实际极速**的 0.9 倍，而不是全局固定值。
 *   Lv0 归墟（~90 km/h）→ AI 81 km/h，慢于玩家 → 玩家能赢；
 *   满级归墟（1000 km/h）→ AI 900 km/h，明显更快；
 *   无相（100,000 km/h）→ 90,000 被 cap 钳到 50,000 → 玩家稳赢。
 *
 * ★ tier.kmh **完全不参与**配速：它只是面板上的"参考配速"文案。
 *   早先把它当"AI 该多快"的下限，结果 Lv0 玩家参赛时 AI 反而快 1.3~67 倍，
 *   "AI 不会因为玩家车弱而必胜"整条落空。
 *
 * @param {number} playerTop 玩家当前实际极速（px/s）
 * @param {object} tier      SPACE_TIERS 的一项（保留参数，签名与调用方一致）
 * @returns {number} AI 配速（px/s），已钳在 50000 km/h
 */
export function spaceAIScale(playerTop, tier) {
  void tier;
  const KM = (v) => (v / 3.6) * 100; // px/s → km/h
  const cap = KM(50000);
  const player = Math.max(1, playerTop || 0);
  // ★ 单一公式：恒为玩家的 0.9 倍，再钳在 50000 km/h。
  //   长度、配速、金币三者现在都以玩家极速为基准，口径统一，
  //   "6 分钟 / AI 90% / 稳赢或可赢"三条验收在任何车上都自洽。
  return Math.min(player * 0.9, cap);
}

// ---------------- 关卡访问（含最终任务） ----------------

/** 按全局索引取关卡定义：0~431 为支线关，FINALE_INDEX 为最终任务 */
export function levelAt(idx) {
  return idx === FINALE_INDEX ? FINALE : LEVELS[idx];
}

/**
 * 取"当前模式实际要跑的关卡"。
 *
 * ★ 为什么需要它：赛事不能复用玩家选中的那一关 ——
 *   R6.1 要求驮马（36 km/h）跑满 ≥360s，即赛道 ≥360,000px，
 *   而 432 关最长只有 78,000px。两者不可兼得（见 RACE_COURSE 注释），
 *   所以 race/ranked 一律走赛事专用赛道 RACE_COURSE。
 *   关卡模式（含终局关）仍走 levelAt，行为不变。
 *
 * 注意：**物理层与渲染层也必须走这里**，不能只让 world.js 换赛道 ——
 *   physics/terrain.js 的 hillY 直接读 levelAt(store.selLevel)，
 *   若只改 world.js，AI 会跑在 A 赛道上而地形仍是 B 的。
 *
 * ★ 宇宙场多一个参数：赛道长度 = 玩家极速 × 360s，所以必须传极速。
 *   缺省回落到 27778 px/s（= 1000 km/h，归墟标称），
 *   保证任何忘了传参的调用方都能拿到一条长度合理的赛道而不是长度 0。
 */
export function courseAt(idx, mode, playerTop) {
  // 宇宙场：优先用 startGame 钉好的那条赛道（见 spaceCourseOf）
  if (mode === MODE_SPACE) return spacePinned || spaceCourse(spaceTier, playerTop || 27778) || RACE_COURSE;
  return mode === "race" || mode === "ranked" ? RACE_COURSE : levelAt(idx);
}

/**
 * 宇宙场当前分级的下标。
 * ★ 放在 config 层而不是 store：courseAt 被 physics/terrain.js 的**热路径**
 *   （每帧每子步）调用，而 config ← core 是单向依赖的既定分层 ——
 *   若 levels.js 去 import store.js 就构成了反向依赖。
 *   用一个模块级变量 + setter 保持单向，写入方仍是 game 层。
 */
let spaceTier = 0;
export function setSpaceTier(i) {
  spaceTier = Math.max(0, Math.min(SPACE_TIERS.length - 1, i | 0));
}
/** 读当前分级下标（供 game/race.js 结算与 AI 配速取用） */
export const spaceTierOf = () => spaceTier;

/**
 * 宇宙场本局钉住的赛道（startGame 时算一次，之后所有 courseAt 调用都返回它）。
 *
 * ★ 为什么必须"钉住"而不是每次重算：courseAt 有 6 个调用点，
 *   其中 physics/terrain.js 那个在**每个物理子步**上。赛道长度依赖玩家极速，
 *   而极速在一局之内会变（升级、形态、上下坡）——
 *   若每次都重算，terrain 用的赛道和 world.js 建实体的赛道就会**不是同一条**，
 *   症状是"车飘在半空 / 掉出地图 / AI 跑在另一张图上"。
 *   这正是本函数注释里"AI 与地形必须取同一条，否则会出现车跑在 A 赛道上、
 *   地形却是 B 的"那条老 bug 的宇宙场版本。
 *
 *   钉住之后，一局之内长度恒定 —— 这也是"6 分钟"成立的前提。
 */
let spacePinned = null;
export function pinSpaceCourse(L) {
  spacePinned = L || null;
}
export const spaceCourseOf = () => spacePinned;

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


/** 三星时限（秒），任务书/测试可用 */
export function starTime(L) {
  return L.len / L.den3;
}

/**
 * 跳台变体（airtime / gauntlet）的滞空达标线（秒）= 跳台数 × 单台达标滞空。
 * 跳台是确定性的滞空源，因此"达标"只取决于玩家是否真的飞了跳台，
 * 不依赖随机地形是否恰好有坡顶——保证任何支线（含最平缓的翠野乡道）都可达成。
 */
export function airTargetOf(L) {
  const r = variantRule(L.variant);
  if (!r.jumpN) return 0;
  // 只要求飞满绝大多数跳台（留出容错：漏掉最后一个跳台仍能通关）
  return Math.max(1, r.jumpN - 1) * KICK_TARGET;
}