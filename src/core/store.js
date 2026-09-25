// 共享可变状态容器（唯一）。所有模块通过 import 读写这里，
// 从而彻底避免模块间互相 import 造成的循环依赖。
import { START_X } from "../config/constants.js";

/** 全局设置 / 进度 / 环境 / 单局运行态 */
export const store = {
  /** 模拟时钟（秒）：只在"有效物理步"里推进，暂停/锁定时不流逝 */
  time: 0,

  // 流程状态
  state: "menu", // menu | play | pause | ended
  mode: "level", // level | race | free
  lastMode: "level",

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

  // UI 开关
  shopOpen: false,
  donateOpen: false,

  // 相机
  cam: { x: 0, y: 0, zoom: 1.4, shake: 0 },

  // 环境 + 车辆派生参数（buildLevel / applyUpgrades 维护）
  phys: {
    theme: 0, // 当前地形主题索引（渲染用）
    minY: 0, // 当前关卡地形最低点（世界 y），用于"掉出地图"判定
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
  },

  // 单局运行态
  run: {
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
  stunned: 0,
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
  rearAir: false, // 后轮"腾空中"：坡顶起飞后走弹道，真正压到地面才收回
  frontAir: false,
  // 骑手在"前轮→后轮连线"的哪一侧（刚体属性，旋转不变；用于防止约束求解把骑手甩到轮轴下方）
  headUp: -1,
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
};
