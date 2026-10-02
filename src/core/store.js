// 共享可变状态容器（唯一）。所有模块通过 import 读写这里，
// 从而彻底避免模块间互相 import 造成的循环依赖。
import { START_X, topSpeedOf } from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";

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
  /** 当前存档槽下标（0 = 存档1）。槽 0 沿用旧的 bike_* 键，老存档自动成为「存档1」。 */
  slot: 0,
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
  /** 特殊终极模式解锁状态：{ vehicleId: true }（由车库购买） */
  ultra: {},

  // 进度阶梯：支线通关 / 最终任务 / 比赛邀请 / 段位 / 登顶 / 无限模式可选场景
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

  // 累计统计（存档键 bike_stat）
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
  // ★ zoomBase = 用户用 +/- 设定的基准缩放；zoom = 实际用于渲染的缩放，
  //   由 render/camera.js 按车速从 zoomBase 自动缩放得出（见 camZoomOf）。
  //   两者必须分开：若让 +/- 直接改 zoom，速度自适应每帧都会把它覆盖回去。
  cam: { x: 0, y: 0, zoom: 1.4, zoomBase: 1.4, shake: 0 },

  // 环境 + 车辆派生参数（buildLevel / applyUpgrades 维护）
  phys: {
    theme: 0, // 当前地形主题索引（渲染用）
    floorY: 0, // 当前关卡地形最低点（世界 y 最大），用于"掉出地图"判定
    gravity: 750,
    traction: 1,
    topSpeed: topSpeedOf(VEHICLES[0], { engine: 0, tire: 0, frame: 0, susp: 0 }),
    crashMargin: 4,
    fuel: 1,
    fuelMax: 1,
    // ---- ：由车辆/升级/场景派生的物理量 ----
    /** 三质点刚体：{ mass, mR, mF, mH, mTot, comUp, iBody }（applyUpgrades 写入） */
    rb: null,
    /** 悬挂：{ k, c, travel } */
    susp: null,
    /** 摩擦系数 μ（场景 traction × 车辆 grip × 轮胎升级） */
    mu: 1,
  },

  // 单局运行态
  run: {
    // 单局世代号：重开/换关时递增，用于作废上一局的延迟结算回调
    gen: 0,
    crashed: false,
    crashTimer: 0,
    settling: false,
    lastSafeX: START_X,
    hasCrashed: false,
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
  raceAI: null,          // 决定胜负的那一个对手（HUD 差距显示 + 胜负判定都只看它）
  racers: [],            // 本场全部 AI 对手（多人赛 / 团赛时不止一个）
  raceFormat: "duel",    // duel | melee | relay
};

/**
 * 车身：车架刚体（后轴 / 前轴 / 骑手三质点）+ 两个独立车轮。
 *   · axleRear / axleFront / head —— 车架刚体（质量加权距离约束保持刚性）
 *   · rear / front         —— 车轮（独立刚体，由弹簧-阻尼悬挂连到对应轴）
 *   · pts                  —— 全部五质点（整体平移/旋转/传送时用，避免漏掉某一个）
 * 车轮与轴在"悬挂静止位"重合，压缩量见 susp.*.t。
 */
export const bike = {
  rear: { x: 0, y: 0, px: 0, py: 0 },
  front: { x: 0, y: 0, px: 0, py: 0 },
  head: { x: 0, y: 0, px: 0, py: 0 },
  axleRear: { x: 0, y: 0, px: 0, py: 0 },
  axleFront: { x: 0, y: 0, px: 0, py: 0 },
  grounded: 0,
  speed: 0,
  /** 加速带助推剩余时长（秒）：触发后平滑缓进缓出的加速，避免一次性脉冲造成顿挫 */
  boostT: 0,
  /**
   * 飞行形态的悬停高度线（世界 y）：由 restY 低通而来（见 bike.js flightStep）。
   * 逐帧直接追 restY 会在 1000 km/h 下抽搐（目标每帧跳 ±145px），
   * 先滤出这条平滑的"飞行高度线"，伺服再去追它。
   */
  hoverY: 0,
  wheelAngleRear: 0,
  wheelAngleFront: 0,
  /** 出生后等待玩家第一次按键才起步（在此之前时钟与物理都不推进） */
  awaitingStart: true,
  spawnX: START_X,
  squash: 0,
  squashVel: 0,
  lastAng: 0,
  angVel: 0,
  /** 真实车身角速度（rad/s，物理层每帧写入）：含地形与悬挂带来的转动 */
  angRate: 0,
  /** 本帧车轮视觉转角（rad/帧）：渲染层据此判断辐条是否已快到频闪、该糊掉了。
   *  后轮/前轮各一个 —— 渲染层两个轮子都要读，漏声明哪个，开局到首次按键之间
   *  （stepPhysics 尚未跑过）就会读到 undefined → NaN 污染 globalAlpha。 */
  wheelStepRear: 0,
  wheelStepFront: 0,
  rotAcc: 0,
  // 骑手在"前轴→后轴连线"的哪一侧（刚体属性，旋转不变；用于防止约束求解把骑手甩到轮轴下方）
  headUp: -1,

  // ---- 新增物理状态量----
  // 车轮"真状态"：角速度/角加速度（rad/s, rad/s²）。wheelAngleRear/Front 降级为视觉角度（由它派生）。
  wheelRot: { rear: 0, front: 0 },
  wheelAcc: { rear: 0, front: 0 },
  // 悬挂：t = 压缩量（px，0 = 静止位、>0 = 被压缩），v = 压缩速度（px/s）
  susp: { rear: { t: 0, v: 0 }, front: { t: 0, v: 0 } },
  // 滑移率：(ωR − v)/max(|ωR|, 小量)；>0 拖滞、<0 空转
  slip: { rear: 0, front: 0 },
  // 法向接触力（游戏单位）：摩擦上限 = fn × μ 的依据
  fn: { rear: 0, front: 0 },
  // 切向摩擦冲量的**子步累计量**：每轮迭代只施加增量，累计量按 μ×fn 限幅
  // （不累加的话一轮迭代能叠加 SOLVER_ITERS 份满摩擦力，把车掀翻）
  fricAcc: { rear: 0, front: 0 },
  // 求解器诊断量：迭代次数与残差 → "是否收敛"可被断言
  solverIters: 0,
  solverResid: 0,
  // 穿透量（px）：沿法线的最大侵入深度，断言其 ≤ 容差
  penetration: 0,
};
/** 五质点列表（只在结构与质量变化时重建） */
bike.pts = [bike.rear, bike.front, bike.head, bike.axleRear, bike.axleFront];

/** 世界实体（关卡模式与无限模式共用） */
export const world = {
  coins: [],
  canisters: [],
  boosts: [],
  decoFore: [],
  decoBack: [],
  particles: [],
  freeGenX: 0,
  /** 变体"赛前预加油"比例（占油箱）：buildLevel 按变体规则计算 */
  prepFuel: 0,
  /** 本局 airtime 变体的累计得分（滞空秒数 + 连招加权） */
  airScore: 0,
  /** 机制实体：危险段 / 限时门 / 跳台（buildLevel 构建，无限模式为空） */
  hazards: [],
  gates: [],
  jumps: [],
};

// ---------------- 跨层 UI 钩子 ----------------
/**
 * panels.js 在 initPanels() 时把"重画主页面"的实现挂到这里。
 *
 * 为什么需要它：menu.js 的 showMenu() 必须重画主页面，而 panels.js 已经 import 了
 * menu.js（showPanel / showMenu / refreshMenuButtons）；让 menu.js 反向 import panels.js
 * 会构成循环依赖。store 是二者共同的下层，放这里既能保持单向接线。
 * 也刻意没用 CustomEvent —— 自己派发 + 单一 listener 就够，少一个构造器依赖。
 */
export const uiHooks = {
  /** 重画主页面视图（菜单态）。未注册时 menu.js 静默跳过。 */
  onHome: null,
};
