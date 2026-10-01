// 关卡数据与地形数学（纯函数，不依赖任何运行时状态）
//  · 12 条支线 × 6 关 = 72 关（扁平数组，索引 = 全局索引，与旧代码路径兼容）
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
 *   偶发落到断崖上（72 关时样本少，432 关后必现）。过线即刻结算，坡度再大都无碍，
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
 * 每条支线的特殊变体关位（k 值）。12 关规模下用 6 个位：2/4/6/8/10/11。
 *
 * ★ 为什么是这 6 个位、且要错开两轮轮转：原 6 关版只有 k=2、4 两个特殊位，
 *   6 种变体在 72 关里只出现 36 次、分布很不均。扩到 12 关后若只补位不补齐，
 *   变体分布仍会偏斜（checklist 要求 6 种出现次数两两差 ≤ 2）。
 *   `SPECIAL_SLOTS` 给出位，`bi` 与 `bi+2` 错开轮转，保证相邻支线不会撞同一个变体。
 */
export const SPECIAL_SLOTS = [2, 4, 6, 8, 10];
// ★ 特殊变体只有 5 种（VARIANTS 去掉 normal），所以位也取 5 个。
//   6 位 × 5 种会让 sprint 出现 72 次、其余各 36 次（实测差 36，远超"差 ≤2"）。
//   5 位 × 5 种 × 36 条支线 = 900 / 5 = 每种正好 36 次。
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
 * 12 种"地貌气质"——一条支线一种体格；支线内 6 关各自再掷一次地形种子。
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
 *   autotest 会依次开始红：
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
 *   · 72 关地形指纹两两不同
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
 *   一段短水平起跑区（~150px）让 72 关出生条件接近一致即可；
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

/** 原始地形高度（含起步缓冲，未做终点收尾） */
function hillRaw(L, x) {
  let y = 300;
  let relief = 0;
  for (const w of L.waves) relief += w.amp * Math.sin(x * w.f + w.ph);
  for (const s of L.steps) {
    if (x > s.cx) {
      const t = clamp((x - s.cx) / STEP_W, 0, 1);
      relief += s.drop * (t * t * (3 - 2 * t));
    }
  }
  const feats = L.feats;
  if (feats) {
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i];
      // 早退：绝大多数采样点落在任何局部地貌之外（x0/x1 升序 → 命中即停）
      if (x <= f.x0) break;
      if (x >= f.x1) continue;
      relief += f.amp * featProfile(f.kind, (x - f.x0) / (f.x1 - f.x0), f.n);
    }
  }
  // 起步缓冲：前 LAUNCH_PAD 恒平，之后 smoothstep 渐入真实起伏（见 LAUNCH_PAD 注释）。
  // smoothstep 两端导数均为 0（C¹），不会在平台边缘制造法线突跳。
  // （早期版本这里用线性 clamp，只连续 C⁰：导数在 x=60+RUN_IN 处突降为 0，
  //   坡度会跳变 relief/RUN_IN，体格振幅越大跳得越狠。）
  return y + relief * ss((x - LAUNCH_PAD) / RUN_IN);
}

/** 关卡地形信息：{y, m}（m 为斜率，>0 下坡 / <0 上坡） */
export function levelGroundInfo(L, x, e = 2) {
  const yL = levelHillY(L, x - e);
  const yR = levelHillY(L, x + e);
  return { y: levelHillY(L, x), m: (yR - yL) / (2 * e) };
}

/** 无限模式：按"地块"换地貌体格，同一地块恒定（纯函数，不含状态） */
function freeMoodOf(x) {
  const t = Math.floor(x / 3000);
  // 哈希 → 12 种气质：让相邻地块体格不同、整体覆盖全部 12 种
  const h = Math.imul(t ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return TERRAIN_MOODS[h % TERRAIN_MOODS.length];
}

/** 无限模式地形（随里程缓慢加难，无终点；地形随地块切换体格，绝不重复） */
export function freeHill(x) {
  const d = Math.max(0, x - 400);
  const diff = Math.min(1, d / 120000);
  const diffS = diff * diff * (3 - 2 * diff);
  let y = 300;
  // 与关卡一致的出发平台：前 LAUNCH_PAD 恒平，之后 smoothstep 渐入
  const ramp = ss((x - LAUNCH_PAD) / RUN_IN);
  // 地块内局部相位：同一地块恒定 → 边界不跳变
  const seg = Math.floor(x / 3000);
  const mood = freeMoodOf(x);
  const ph = (seg * 2.399963) % 6.283185307;
  for (let i = 0; i < mood.waves.length; i++) {
    const w = mood.waves[i];
    const wl = Math.max(MIN_WAVELEN, w[0] * (0.85 + ((seg * 7 + i * 13) % 31) / 31 * 0.3));
    y += Math.sin((x / wl) * 6.283185307 + ph + i * 1.9) * (w[1] * 0.5 + w[1] * 0.5 * diffS + w[2] * diffS);
  }
  const stepGap = mood.stepGap;
  const stepDrop = (15 + diffS * 10) * mood.stepK;
  const segIdx = Math.floor(d / stepGap);
  y += stepDrop * segIdx;
  const cur = d % stepGap;
  if (cur > 0) {
    const t = clamp(cur / STEP_W, 0, 1);
    y += stepDrop * (t * t * (3 - 2 * t));
  }
  return 300 + (y - 300) * ramp;
}

/**
 * 采样得到关卡真实最大坡度（tan 值），标定与面板展示用。
 * @param {object} P 地形参数（waves/steps/feats）；传子集即可单独测量某一部分
 * @param {number} len 赛道长度
 */
function measureMaxSlopeTan(P, len) {
  let mx = 0;
  for (let x = 70; x <= len; x += 4) {
    const m = Math.abs(levelGroundInfo(P, x).m);
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
  L.maxSlope = measureMaxSlope(L); // 回填实测值（≈targetDeg）
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
  const nStep = nOverride != null ? nOverride : 1 + Math.floor(gN * 6);
  const steps = [];
  // 起点：出发平台 + 渐入段**完全结束**之后（再留 200px 余量），
  // 避免断层落在渐入斜坡上 —— 那里 relief 正被 ramp 放大，落差会失真且曲率超标
  let cx = LAUNCH_PAD + RUN_IN + 200 + rng() * 400;
  const gap = mood.stepGap * (0.62 + (len / 13200) * 0.38);
  for (let r = 0; r < nStep; r++) {
    steps.push({ cx: Math.round(cx), drop: 15 + gN * 76 + r * (2 + gN * 7) });
    // 间距抖动保持在 ±18% 以内：断层是"高速把车弹飞"的坡度突变源，
    // 间距一小就会连成串，实测末关出现 828px 的密集断层群，
    // 参考骑手被反复弹起、落地倒立、摔车重生回到同一处 —— 直接死循环。
    cx += gap * (1 + (rng() * 2 - 1) * 0.18);
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
  const total = kinds.length;
  const n = Math.max(3, Math.min(16, Math.round((total * span) / 4200)));
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
  const len = Math.round(4200 + gN * 9000); // 路程 4200 → 13200
  // 赛道金币数量随全局进度递增（24 → 72）
  const coinN = Math.round(24 + gN * 48);
  // 通关固定奖励随进度递增（240 → 900）：玩家在**闯关阶段**（前 36 关）
  // 就能把一台入门车四项升满，不必刷几百关才看得到升级效果。
  // 系数是反推出来的：432 关里前 36 关（闯关阶段）按 60% 收集率要能攒够 28,240
  // （一台入门车四项升满）。240/660 时实测只到 27,090，差一点；抬到 280/720 后有富余。
  const goldBase = Math.round(280 + 720 * gN);
  // 单枚赛道金币的面值（30 → 60）：与 coinN 相乘，单关总产出 720 → 4320
  const coinVal = Math.round(30 + 30 * gN);
  // 体格：一条支线一种（按支线下标错开轮转，12 条支线覆盖 12 种气质），
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

// ---------------- 72 关 ----------------
export const LEVELS = Array.from({ length: TOTAL }, (_, gi) => makeLevel(gi));

// ---------------- 最终任务（索引 FINALE_INDEX，已接进 buildLevel） ----------------
export const FINALE = (() => {
  const len = 22000;
  // 终极关：多段体格拼接（每段换一种地貌，避免 22km 全程一个样）
  const rng = mulberry32(0xf17a1e);
  const segLen = 3600;
  const segs = 6;
  const waves = [];
  const steps = [];
  const feats = [];
  for (let s = 0; s < segs; s++) {
    const mood = TERRAIN_MOODS[(s * 5 + 3) % TERRAIN_MOODS.length];
    // ★ 每段只取该体格的**主波**（最长波长那层），不是全部三层。
    //   18 条正弦全叠加时，同一坡度下的"粗糙度"会累加出数倍累计爬升
    //   （实测 4350px vs 预算 3222px），参考骑手 300s 骑不到第三个分段。
    //   终极关要的是"地貌多样"而非"强度叠加"：6 条主波的波长/相位各不相同，
    //   配合沿路的 25 处局部地貌，22km 全程没有一段是重复的。
    const w = buildWaves(mood, 1, rng)[0];
    w.ph += s * 2.399963; // 段间错开相位，避免各段波形彼此重合
    // ★ 强度递减：各段主波量级相近时，它们的峰几乎永不同向叠加 ——
    //   对齐后的最大坡度仍是 57.5°，但"各波坡度之和"（真正决定累计爬升的量）
    //   会涨到约 2.5 倍，累计爬升随之翻倍。按几何级数递减后，
    //   6 条波的坡度之和回到与单关相当，波长/相位的多样性完全保留。
    w.amp *= Math.pow(0.62, s);
    waves.push(w);
    for (const f of buildFeats(mood, 1, segLen, rng)) {
      feats.push({ ...f, x0: f.x0 + s * segLen, x1: f.x1 + s * segLen });
    }
  }
  // 断层：数量沿用原曲线（1+floor(1×6)=7），落差不变，只把位置铺开到 22km 上
  {
    const first = LAUNCH_PAD + RUN_IN + 200;
    const sp = buildSteps(TERRAIN_MOODS[9], 1, 1, len, rng, 7);
    const k = (len - first - 800) / 7800; // 把首断层之后的部分再展到 22km
    for (const st of sp) steps.push({ cx: Math.round(first + (st.cx - first) * k), drop: st.drop });
  }
  feats.sort((a, b) => a.x0 - b.x0);
  const L = {
    name: "终极远征 · 环大陆",
    len,
    waves,
    steps,
    feats,
    coinN: 90,
    ramp: 0.5,
    den3: REF_SPEED * (0.72 - 0.22),
    fuelK: 1 + 3.1,
    mech: 1.3,
    hazardN: 8,
    gateN: 6,
    variant: "normal",
    theme: 0, // 取第一段的场景
    mood: "gauntlet",
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
  fitSlope(L, 54);
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