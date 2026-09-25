// 关卡数据与地形数学（纯函数，不依赖任何运行时状态）
//  · 20 关：难度沿"坡度 / 落差 / 颠簸 / 燃料"四轴递增，主题轮换
//  · 地形 = 主坡(大起伏) + 中波(连续坡) + 颠簸(细碎) + 下坡断层
import { clamp } from "../core/utils.js";

export const LEVEL_NAMES = [
  "平原热身", "丘陵骑行", "峡谷穿越", "坡道试炼", "山脊竞速",
  "溪谷漂移", "悬崖攀爬", "高峰攀登", "岩脊飞跃", "雪线冲刺",
  "云顶爬升", "雷暴山道", "峡谷深处", "孤峰之路", "断崖长廊",
  "极峰挑战", "星海赛道", "天堑大桥", "云端之巅", "终极征服",
];

// 主题与关卡名的语义对应：0=绿野 1=雪原 2=荒漠 3=月面
//   雪线冲刺→雪原、溪谷漂移→雪原(低抓地)、星海赛道→月面(星空)、
//   云顶/极峰/云端→雪原，峡谷/悬崖/岩脊/雷暴/断崖/天堑→荒漠，孤峰/终极→月面
export const THEME_MAP = [0, 0, 2, 0, 1, 1, 2, 1, 2, 1, 1, 2, 2, 3, 2, 1, 3, 2, 1, 3];

/** 断层过渡宽度（px）：做成"陡坡"而不是"窄坑"，否则车身会卡死 */
export const STEP_W = 150;
/** 起步缓冲长度（px）：前段把起伏逐渐放大，给足加速距离 */
const RUN_IN = 520;

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
  for (let x = 70; x <= L.len; x += 8) {
    const m = Math.abs(levelGroundInfo(L, x).m);
    if (m > mx) mx = m;
  }
  return (Math.atan(mx) * 180) / Math.PI;
}

// ---------------- 20 关参数 ----------------
export const LEVELS = Array.from({ length: LEVEL_NAMES.length }, (_, i) => {
  const diff = i / 19; // 线性难度系数 0→1
  // 难度分层：前 3 关几乎持平（教学），之后陡增。ramp 才是驱动地形/三星时限/油耗的主参数
  const ramp = Math.pow(clamp((diff - 0.14) / 0.86, 0, 1), 1.25);
  const len = Math.round(4200 + i * 420); // 路程 4200 → 12180
  const coinN = 16 + Math.floor(i * 1.5); // 金币 16 → 44
  // 三层叠加：越往后波长越短、振幅越大 → 坡度越陡
  const waves = [
    { f: (2 * Math.PI) / (2700 - ramp * 600), amp: 64 + ramp * 42, ph: 1.7 + i * 0.31 },
    { f: (2 * Math.PI) / (940 - ramp * 140), amp: 24 + ramp * 7, ph: 3.1 + i * 0.53 },
    { f: (2 * Math.PI) / (460 - ramp * 110), amp: 8 + ramp * 2, ph: 5.2 + i * 0.77 },
  ];
  // 下坡断层：落差 15 → ~90px（约 1~3 倍车高）
  const nStep = 1 + Math.floor(i / 3.5);
  const steps = [];
  for (let r = 0; r < nStep; r++) {
    const drop = Math.round(15 + i * 2.6 + r * 5);
    steps.push({ cx: Math.round(len * (0.16 + (0.68 * r) / nStep)), drop });
  }
  const L = {
    name: LEVEL_NAMES[i],
    len,
    waves,
    steps,
    coinN,
    ramp,
    // 三星时限的速度基准：前期约 1.6 倍余量，末关约 1.2 倍
    den3: 390 + 150 * ramp,
    // 油耗倍率：后期环境恶劣（缺氧/沙尘/低温），同样动作更费油
    fuelK: 1 + 3.1 * ramp,
    theme: THEME_MAP[i],
  };
  L.maxSlope = measureMaxSlope(L); // 实测最大坡度（含断层）
  return L;
});

/** 20 关的 ★ 三星时限（秒），任务书/测试可用 */
export function starTime(L) {
  return L.len / L.den3;
}
