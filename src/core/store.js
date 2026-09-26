// 共享可变状态容器（唯一）。所有模块通过 import 读写这里，
// 从而彻底避免模块间互相 import 造成的循环依赖。
import { START_X } from "../config/constants.js";

/** 全局设置 / 进度 / 环境 / 单局运行态 */
export const store = {
  /** 模拟时钟（秒）：只在"有效物理步"里推进，暂停/锁定时不流逝 */
  time: 0,

  // 流程状态
  state: "menu", // menu | play | pause | ended
  mode: "level", // level | race | free | ranked
  lastMode: "level",
  /** 排位赛档位：false = 普通排位赛，true = 高级排位赛（同一 mode，仅数值档位不同） */
  rankedAdvanced: false,

  // 进度
  lvIdx: 0,
  selLevel: 0,
  unlocked: 0,
  stars: [],
  finishX: 0,
  gold: 0,
  best: 0,
  muted: false,
  achGot: [],
  ownedVehicles: [0],
  currentVehicle: 0,
  upgrades: {},

  // 进度阶梯（Task 9）：支线通关 / 最终任务 / 比赛邀请 / 段位 / 登顶 / 无限模式可选场景
  progress: {
    /** 已通关的支线下标数组（支线 i 的 6 关全部有星 → 视为已通关）；完成度 = 通过数/6 由 stars 推导 */
    branchCleared: [],
    /** 最终任务是否通关 */
    finaleDone: false,
    /** 是否已收到排位赛邀请（通关最终任务后获得） */
    invited: false,
    /** 排位段位分（下限 0） */
    rating: 0,
    /** 排位战胜场数 */
    wins: 0,
    /** 排位战负场数 */
    losses: 0,
    /** 是否已登顶（rating ≥ RATING_PEAK 后永久为 true） */
    peak: false,
    /** 已解锁可用于无限模式（自由选图）的场景下标 */
    freeThemes: [],
  },

  // 累计统计（Task 9.5，存档键 bike_stat）
  stat: {
    /** 总局数：每局结束结算时 +1 */
    totalRuns: 0,
    /** 总里程（米） */
    totalMeters: 0,
    /** 总时长（秒） */
    totalSeconds: 0,
    /** 最后游玩时间（ISO 字符串，空串表示尚未游玩） */
    lastPlayed: "",
  },

  // UI 开关
  shopOpen: false,
  donateOpen: false,

  // 相机
  cam: { x: 0, y: 0, zoom: 1.4, shake: 0 },

  // 环境 + 车辆派生参数（buildLevel / applyUpgrades 维护）
  phys: {
    theme: 0, // 当前地形主题索引（渲染用）
    minY: 0, // 当前关卡地形最低点（世界 y 最大），用于"掉出地图"判定
    GRAV: 750,
    TRACTION: 1,
    DRIVE: 200,
    BRAKE: 600,
    MAXV: 520,
    susAbsorb: 0.25,
    susClimb: 6,
    susRot: 0.7,
    crashMargin: 4,
    fuel: 1,
    fuelMax: 1,
    // ---- 第 3 期（Task 1）：由车辆/升级/场景派生的物理量 ----
    /** 三质点刚体：{ mass, mR, mF, mH, mTot, comUp, iBody }（applyUpgrades 写入） */
    rb: null,
    /** 悬挂：{ k, c, travel } */
    susp: null,
    /** 摩擦系数 μ（场景 traction × 车辆 grp × 轮胎升级） */
    mu: 1,
  },

  // 单局运行态
  run: {
    // 单局世代号：重开/换关时递增，用于作废上一局的延迟结算回调
    gen: 0,
    crashed: false,
    crashTimer: 0,
    clearing: false,
    lastSafeX: START_X,
    runCrashed: false,
    combo: 0,
    comboStamp: -99, // 上一次空翻结算的 store.time
    wheelieDist: 0,
    maxWheelieDist: 0,
    airTime: 0,
    landed: false,
    levelStartTime: 0,
    coinGot: 0,
    totalCoins: 0,
    /** 摔车累计计时惩罚（秒）：计入三星时限判定 */
    penaltyTime: 0,
    /** 摔车昏迷累计时长（秒）：限时门计时扣除它，避免"摔车=双重惩罚" */
    crashStall: 0,
    /** 已通过的限时门数量 */
    gateIdx: 0,
    /** 本局是否因机制判负（限时门超时）——不计星、不解锁 */
    failed: false,
  },

  // 比赛 AI
  raceAI: null,
};

/** 车身：三个质点（后轮/前轮/骑手）构成的刚体三角形 */
export const bike = {
  rear: { x: 0, y: 0, px: 0, py: 0 },
  front: { x: 0, y: 0, px: 0, py: 0 },
  head: { x: 0, y: 0, px: 0, py: 0 },
  grounded: 0,
  speed: 0,
  wheelRear: 0,
  wheelFront: 0,
  locked: true,
  spawnX: START_X,
  frontGr: false,
  rearGr: false,
  squash: 0,
  squashVel: 0,
  lastAng: 0,
  angVel: 0,
  rotAcc: 0,
  // 骑手在"前轮→后轮连线"的哪一侧（刚体属性，旋转不变；用于防止约束求解把骑手甩到轮轴下方）
  headUp: -1,

  // ---- 第 3 期新增物理状态量（Task 1.2）----
  // 车轮"真状态"：角速度/角加速度（rad/s, rad/s²）。wheelRear/Front 降级为视觉角度（由它派生）。
  wheelRot: { rear: 0, front: 0 },
  wheelAcc: { rear: 0, front: 0 },
  // 悬挂：t = 行程（px，0=完全伸出，>=travel 到底），v = 行程速度（px/s）
  susp: { rear: { t: 0, v: 0 }, front: { t: 0, v: 0 } },
  // 滑移率：(ωR − v)/max(|v|, 小量)；>0 空转、<0 锁死抱死拖动
  slip: { rear: 0, front: 0 },
  // 法向接触力（游戏单位）：摩擦上限 = fn × μ 的依据
  fn: { rear: 0, front: 0 },
  // 求解器诊断量（Task 2.2）：迭代次数与残差 → "是否收敛"可被断言
  solverIters: 0,
  solverResid: 0,
  // 穿透量（px）：行程到底后仍压入地面的深度，断言其 ≤ 容差
  penetration: 0,
};

/** 世界实体（关卡模式与无限模式共用） */
export const world = {
  coins: [],
  canisters: [],
  boosts: [],
  decoTree: [],
  decoRock: [],
  particles: [],
  freeGenX: 0,
  /** 变体"赛前预加油"比例（占油箱）：buildLevel 按变体规则计算 */
  prepFuel: 0,
  /** 本局 airtime 变体的累计得分（滞空秒数 + 连招加权） */
  airScore: 0,
  /** 本局 airtime 变体的达标线（秒）：按跳台数量派生 */
  airTarget: 0,
  /** 机制实体：障碍物 / 危险段 / 限时门 / 跳台（buildLevel 构建，无限模式为空） */
  obstacles: [],
  hazards: [],
  gates: [],
  jumps: [],
};
