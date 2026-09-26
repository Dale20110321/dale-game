// ============================================================
//  物理：车架刚体 + 弹簧-阻尼悬挂 + 轮上动力学
//
//  模型（第 3 期重做）：
//    · 车架 = 后轴 / 前轴 / 骑手 三质点构成的刚体，用**逆质量加权**的距离约束保持刚性；
//      约束在**速度层**求解（顺序冲量），迭代由收敛判据驱动（残差 < SOLVER_TOL 即停），
//      再做一次位置投影消除漂移。
//    · 车轮 = 两个**独立刚体**（各带质量与转动惯量），由**弹簧-阻尼悬挂**连到对应车轴；
//      悬挂行程有上下限，减震升级真的改变刚度/阻尼/行程。
//    · 地面 = **单侧接触**（只推不拉）：法向力沿地形**解析法线**，摩擦上限 = μ × 法向力。
//      因此"打滑"是真的（超出摩擦上限的扭矩变成空转）、"腾空"是真的（离开接触带即弹道飞行）。
//    · 动力链：油门 → 轮上扭矩 → 轮胎切向力（受 μ×Fn 限制）→ 经悬挂/前叉约束推动整车。
//      翘头/栽头是"力作用在真实接地点 + 车架在车轴上"自然产生的力矩，不是写死的系数。
//    · 阻力：空气阻力（∝ v²）＋ 滚动阻力（∝ 法向力）。极速是"驱动力 = 阻力"的平衡点，
//      全文件不存在任何直接改写车速/竖向速度的钳制（只有数值异常兜底 NUM_CAP_V）。
//    · 空中姿态：玩家按键施加**角冲量**，松键后角速度保持（角动量守恒），落地由地面吸收。
//
//  标度：本文件所有速度换算必须用 SUBV（真实 px/s），不要写裸 *SUB。
//  分层：本文件不 import render/ 与 ui/；摔车/落地等表现通过 ./events.js 的注入回调派发。
// ============================================================
import {
  SUB, SUB_DT, SUBV, DT,
  WHEEL_R, WHEELBASE, SEAT_H,
  AIR_ROT_MAX, AIR_ROT_ACC,
  LAND_REF, CONTACT_BAND, CONTACT_BIAS, BIAS_MAX_V, STUN_TIME,
  SOLVER_TOL, SOLVER_ITERS, PEN_TOL, FN_MAX_K, NUM_CAP_V, HEAD_R,
  ROLL_RES_K, AIR_DRAG_K, wheelInertia, torqueAt,
  OBST_R, OBST_VIS_H, OBST_HIT_V, CRASH_FUEL_LOSS, CRASH_TIME_PENALTY,
  deriveHandling, deriveRigidBody, deriveSuspension, deriveFriction,
} from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, bike, world } from "../core/store.js";
import { clamp, lerp, wrapAngle } from "../core/utils.js";
import { getUp } from "../core/storage.js";
import { groundInfo, groundY, groundNormal } from "./terrain.js";
import { physEvents } from "./events.js";
import { key } from "../core/input.js";

const TAU = Math.PI * 2;
const WHEELS = ["rear", "front"];
const CHASSIS = ["axleR", "axleF", "head"];

/**
 * 数值异常兜底（NUM_CAP_V）累计触发次数。**只增不减**，跨局累计，
 * 供测试断言"整个测试过程中兜底从未触发"（Task 6.4 / checklist"异常兜底从未触发"）。
 */
let numCapHits = 0;
/** 读取兜底累计触发次数（正常游玩与全部测试中都应为 0） */
export const capHitCount = () => numCapHits;

/** 按当前车辆 + 升级等级重算驾驶参数（公式统一放在 config/constants.js 的 derive* 里） */
export function applyUpgrades() {
  const v = VEHICLES[store.currentVehicle];
  const up = getUp();
  Object.assign(store.phys, deriveHandling(v, up));
  // ---- 第 3 期 Task 1：质量/惯量/悬挂/摩擦也数据化 ----
  // 质量与惯量真参数（求解器按逆质量加权）、悬挂（刚度/阻尼/行程）、摩擦系数 μ。
  // 此处真实引用 M_R/M_F/M_H/M_TOT/COM_UP/I_BODY，使其不再是死代码。
  const rb = deriveRigidBody(v);
  store.phys.rb = rb;
  store.phys.susp = deriveSuspension(v, up);
  store.phys.mu = deriveFriction(store.phys.TRACTION, v, up);
  store.phys.wheelI = wheelInertia(rb.mW); // 轮转动惯量（实心圆盘近似）
  bike.rb = rb;
  bindMasses(rb);
}

/** 把质量 / 逆质量写到质点上（求解器与接触都用它） */
function bindMasses(rb) {
  const b = bike;
  b.rear.m = rb.mW; b.front.m = rb.mW;
  b.axleR.m = rb.mR; b.axleF.m = rb.mF; b.head.m = rb.mH;
  for (const p of b.pts) p.im = p.m > 0 ? 1 / p.m : 0;
}

/** 出生 / 重生：把车摆到地形上（保持速度为零） */
export function resetBike(x) {
  const b = bike;
  const L = WHEELBASE;
  b.spawnX = x;
  b.locked = true;
  const yR = groundY(x) - WHEEL_R;
  const yF = groundY(x + L) - WHEEL_R;
  const ang = Math.atan2(yF - yR, L);
  for (const [p, px, py] of [
    [b.rear, x, yR],
    [b.front, x + L, yF],
    [b.axleR, x, yR],
    [b.axleF, x + L, yF],
  ]) {
    p.x = px; p.y = py; p.px = px; p.py = py; p._vx = 0; p._vy = 0;
  }
  const hx = x + L / 2 - Math.sin(ang) * SEAT_H;
  const hy = (yR + yF) / 2 - Math.cos(ang) * SEAT_H;
  b.head.x = hx; b.head.y = hy; b.head.px = hx; b.head.py = hy;
  b.head._vx = 0; b.head._vy = 0;
  b.grounded = 0;
  b.speed = 0;
  b.wheelRear = 0;
  b.wheelFront = 0;
  b.frontGr = false;
  b.rearGr = false;
  b.squash = 0;
  b.squashVel = 0;
  b.angVel = 0;
  b.rotAcc = 0;
  b.lastAng = ang;
  b.penetration = 0;
  b._impactV = 0;
  // 记录骑手在轮轴线的哪一侧（刚体几何决定，任何旋转都不会改变）
  const ux = b.axleF.x - b.axleR.x;
  const uy = b.axleF.y - b.axleR.y;
  const d = Math.hypot(ux, uy) || 1e-4;
  const cross = (ux / d) * (b.head.y - b.axleR.y) - (uy / d) * (b.head.x - b.axleR.x);
  b.headUp = Math.sign(cross) || -1;
  // 第 3 期新增状态量一并归零（保证"同初始状态 + 同输入 → 完全可复现"）
  b.wheelRot.rear = 0; b.wheelRot.front = 0;
  b.wheelAcc.rear = 0; b.wheelAcc.front = 0;
  b.susp.rear.t = 0; b.susp.rear.v = 0;
  b.susp.front.t = 0; b.susp.front.v = 0;
  b.slip.rear = 0; b.slip.front = 0;
  b.fn.rear = 0; b.fn.front = 0;
  b.rb = store.phys.rb;
  bindMasses(store.phys.rb);
}

/**
 * 绕 (mx,my) 旋转整车（车架 + 两轮）rot 弧度，位置与速度一起转（刚体旋转，不改变动能）。
 * count=false 时不计入翻转累计。
 */
export function rotateBikeAround(mx, my, rot, count) {
  const b = bike;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const p of b.pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const nx = mx + dx * c - dy * s;
    const ny = my + dx * s + dy * c;
    p.px += nx - p.x;
    p.py += ny - p.y;
    p.x = nx;
    p.y = ny;
  }
  b.lastAng = (b.lastAng + rot) % TAU;
  if (count !== false) b.rotAcc += rot;
}

/** 摔车（附惩罚：扣 8% 燃料 + 2s 计时惩罚） */
export function crash() {
  const run = store.run;
  globalThis.__CRASHFROM = new Error("crash").stack;
  if (run.crashed) return;
  run.crashed = true;
  run.runCrashed = true;
  run.crashTimer = STUN_TIME;
  run.combo = 0;
  // 摔车惩罚：燃料与计时都要付出代价（计时惩罚在结算时计入，直接影响三星）
  const P = store.phys;
  P.fuel = Math.max(0, P.fuel - CRASH_FUEL_LOSS * P.fuelMax);
  run.penaltyTime += CRASH_TIME_PENALTY;
  // 表现与反馈交给注入的物理事件回调（Task 8）：震屏 / 音效 / 粒子 / 提示
  physEvents().onCrash({
    x: bike.head.x,
    y: bike.head.y,
    fuelLoss: CRASH_FUEL_LOSS,
    timePenalty: CRASH_TIME_PENALTY,
  });
}

/**
 * 障碍物碰撞：车身两轮 vs 障碍物圆。
 * 只有"贴着地面高速通过"才算撞上——低速可安全碾过，腾空可飞越。
 */
function hitObstacle() {
  if (!world.obstacles.length) return;
  const b = bike;
  if (Math.abs((b.front.x - b.front.px) * SUBV) < OBST_HIT_V) return;
  for (const o of world.obstacles) {
    const oy = o.y - OBST_VIS_H * 0.5;
    for (const wk of WHEELS) {
      const p = b[wk];
      if (Math.abs(o.x - p.x) > OBST_R + WHEEL_R) continue;
      if (Math.hypot(o.x - p.x, oy - p.y) < OBST_R + WHEEL_R * 0.7) {
        crash();
        return;
      }
    }
  }
}

// ============================================================
//  基础工具
// ============================================================

/** 由 (x - px)/sub 取回速度，写进 _vx/_vy（本子步的工作变量） */
function syncVel(b, sub) {
  for (const p of b.pts) {
    p._vx = (p.x - p.px) / sub;
    p._vy = (p.y - p.py) / sub;
  }
}
function addVel(p, dvx, dvy) { p._vx += dvx; p._vy += dvy; }

/** 用 _vx/_vy 前进一个子步（Verlet：px 保存上一位置，因此外部写 px 等价于设速度） */
function integrate(b, sub) {
  for (const p of b.pts) {
    p.px = p.x;
    p.py = p.y;
    p.x += p._vx * sub;
    p.y += p._vy * sub;
  }
}

/** 车架姿态：切向 t（后轴→前轴方向）与"下"方向 d（指向地面） */
function frameOf(b) {
  const a = Math.atan2(b.axleF.y - b.axleR.y, b.axleF.x - b.axleR.x);
  return { a, tx: Math.cos(a), ty: Math.sin(a), dx: -Math.sin(a), dy: Math.cos(a) };
}

/**
 * 骑手身体是否已低于两轴连线（前翻 / 倒立）。
 * 只有这种姿态下骑手身体才会碰到地面；正常骑行时头永远在轴线上方，
 * 因此身体接触对常规手感零影响（也避免在谷底等地形上误判）。
 */
function bodyLow(b) {
  return b.head.y > (b.axleR.y + b.axleF.y) * 0.5;
}

/** 车架质点（质量加权）质心 */
function chassisCom(b) {
  let mx = 0, my = 0, mt = 0;
  for (const k of CHASSIS) {
    const p = b[k];
    mx += p.x * p.m; my += p.y * p.m; mt += p.m;
  }
  return { x: mx / mt, y: my / mt, m: mt };
}

/** 整车质心（车架 + 两轮）速度（质量加权） */
function systemVel(b) {
  let vx = 0, vy = 0, mt = 0;
  for (const p of b.pts) {
    vx += p._vx * p.m; vy += p._vy * p.m; mt += p.m;
  }
  return { vx: vx / mt, vy: vy / mt, m: mt };
}

// ============================================================
//  悬挂：弹簧-阻尼（沿车架"下"方向）
// ============================================================
/**
 * 每个车轮一条悬挂。轮心与轴心的相对位移沿 d 分解：
 *   s = (W − A)·d   （0 = 静止位；>0 轮在轴下方 = 悬挂伸张，<0 = 被压缩）
 * 压缩量 c = −s，压缩速度 ċ = −ṡ。弹簧-阻尼力是两者之间的**内力**（不改变系统总动量）。
 * 阻尼冲量被限制在"一个子步内最多把相对速度降到 0"，避免深压缩时过冲爆冲。
 */
function applySuspension(b, susp, sub) {
  const fr = frameOf(b);
  const FN_MAX = FN_MAX_K * store.phys.rb.mTot * store.phys.GRAV;
  for (const wk of WHEELS) {
    const W = b[wk];
    const A = wk === "rear" ? b.axleR : b.axleF;
    const s = (W.x - A.x) * fr.dx + (W.y - A.y) * fr.dy;
    const c = clamp(-s, -susp.ext, susp.travel);
    const cRate = -((W._vx - A._vx) * fr.dx + (W._vy - A._vy) * fr.dy);
    let F = susp.k * c;
    // 阻尼：最多在一个子步内把相对速度降到 0（否则会过冲）
    const mRel = 1 / (W.im + A.im);
    const FdCap = Math.abs(cRate) * mRel / sub;
    let Fd = susp.c * cRate;
    if (Math.abs(Fd) > FdCap) Fd = Math.sign(Fd) * FdCap;
    F += Fd;
    if (F > FN_MAX) F = FN_MAX;
    else if (F < -FN_MAX) F = -FN_MAX;
    const jx = fr.dx * F * sub;
    const jy = fr.dy * F * sub;
    addVel(W, jx * W.im, jy * W.im);
    addVel(A, -jx * A.im, -jy * A.im);
    b.susp[wk].t = c;
    b.susp[wk].v = cRate;
  }
}

// ============================================================
//  动力链：油门 → 轮上扭矩；刹车 → 反向扭矩 / 锁死；滚动阻力
// ============================================================
function applyDrive(b, P, sub, drv, brk) {
  const veh = VEHICLES[store.currentVehicle];
  const IW = P.wheelI || wheelInertia(P.rb.mW);
  for (const wk of WHEELS) {
    let w = b.wheelRot[wk];
    let tau = 0;
    // 油门只驱动后轮；刹车前后轮都作用（真车如此）
    if (wk === "rear" && drv) tau += torqueAt(veh, w, drv, P.torquePeak);
    if (brk) {
      // 刹车扭矩不得把轮子转成倒转（否则会变成"倒车"）；到 0 即抱死 → 转滑动摩擦
      const cap = Math.min(P.brakePeak, (Math.abs(w) * IW) / sub);
      tau -= Math.sign(w || 1) * cap * brk;
    }
    if (tau) w += (tau / IW) * sub;
    // 滚动阻力（∝ 法向力）：使轮速缓慢衰减
    const Fn = b.fn[wk];
    if (Fn > 0 && w !== 0) {
      const dw = (ROLL_RES_K * Fn * WHEEL_R * sub) / IW;
      w -= Math.sign(w) * Math.min(dw, Math.abs(w));
    }
    b.wheelRot[wk] = w;
  }
}

/** 空气阻力（∝ v²）：对整车施加与速度反向的加速度（所有质点同减，符合阻力性质） */
function applyDrag(b, P, sub) {
  const sv = systemVel(b);
  const sp = Math.hypot(sv.vx, sv.vy);
  if (sp < 1e-6) return;
  const ax = (-sv.vx / sp) * (AIR_DRAG_K * sp * sp) / sv.m;
  const ay = (-sv.vy / sp) * (AIR_DRAG_K * sp * sp) / sv.m;
  for (const p of b.pts) addVel(p, ax * sub, ay * sub);
}

// ============================================================
//  速度层约束：车架刚性 / 悬挂横向与行程 / 单侧接触（法向 + 摩擦）
// ============================================================

/** 逆质量加权的距离约束（顺序冲量）；返回当前长度误差，供收敛判据使用 */
function velDistance(a, b, L0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const nx = dx / d;
  const ny = dy / d;
  const vrel = (b._vx - a._vx) * nx + (b._vy - a._vy) * ny;
  const mEff = 1 / (a.im + b.im);
  const J = -vrel * mEff;
  addVel(a, -nx * J * a.im, -ny * J * a.im);
  addVel(b, nx * J * b.im, ny * J * b.im);
  return Math.abs(d - L0);
}

/** 悬挂横向约束：轮心必须落在悬挂轴线上（沿 t 的相对位移为 0） */
function velLateral(W, A, fr, sub) {
  const et = (W.x - A.x) * fr.tx + (W.y - A.y) * fr.ty;
  const vrel = (W._vx - A._vx) * fr.tx + (W._vy - A._vy) * fr.ty;
  const mEff = 1 / (W.im + A.im);
  const J = -(vrel + (CONTACT_BIAS * et) / sub) * mEff;
  addVel(W, fr.tx * J * W.im, fr.ty * J * W.im);
  addVel(A, -fr.tx * J * A.im, -fr.ty * J * A.im);
  return Math.abs(et);
}

/** 悬挂行程限位（单侧速度约束）：到底后不允许继续压缩 / 伸张 */
function velTravel(W, A, fr, susp) {
  const s = (W.x - A.x) * fr.dx + (W.y - A.y) * fr.dy;
  const c = -s;
  const cRate = -((W._vx - A._vx) * fr.dx + (W._vy - A._vy) * fr.dy);
  let hit = false;
  if (c >= susp.travel && cRate > 0) hit = true;
  else if (c <= -susp.ext && cRate < 0) hit = true;
  if (hit) {
    const mEff = 1 / (W.im + A.im);
    const J = cRate * mEff;
    addVel(W, fr.dx * J * W.im, fr.dy * J * W.im);
    addVel(A, -fr.dx * J * A.im, -fr.dy * J * A.im);
  }
  return hit ? Math.abs(c > 0 ? c - susp.travel : c + susp.ext) : 0;
}

/**
 * 单侧地面接触：法向（只推不拉，离开接触带则完全没有法向力）
 * + 切向库仑摩擦（上限 μ×Jn），摩擦冲量同时作用于车轮线速度与轮角速度。
 */
function solveContacts(b, P, mu, sub, first) {
  const IW = P.wheelI || wheelInertia(P.rb.mW);
  const FN_MAX = FN_MAX_K * P.rb.mTot * P.GRAV;
  if (first) b.grounded = 0;
  for (const wk of WHEELS) {
    const W = b[wk];
    const g = groundInfo(W.x);
    if (first) { b.fn[wk] = 0; b.slip[wk] = 0; }
    if (!isFinite(g.y)) continue;
    const n = groundNormal(W.x);
    const cosT = -n.y; // 1/√(1+m²)
    const tx = -n.y;
    const ty = n.x;
    // 沿法线的侵入深度：轮心到地面直线的垂距与 R 的差
    const pen = WHEEL_R - (g.y - W.y) * cosT;
    if (pen > b.penetration) b.penetration = Math.max(0, pen);
    // 不在接触带内 → 无接触（可自由离地 → 坡顶自然腾空）
    if (pen < -CONTACT_BAND) continue;
    const vn = W._vx * n.x + W._vy * n.y;
    // 位置修正速度有上限：侵入极深时（掉进深坑）不让修正速度无界增长
    const bias = Math.min(Math.max(0, pen - PEN_TOL) * CONTACT_BIAS / sub, BIAS_MAX_V);
    let Jn = (bias - vn) * W.m;
    if (Jn < 0) Jn = 0;
    if (Jn > FN_MAX * sub) Jn = FN_MAX * sub;
    if (Jn > 0) {
      addVel(W, n.x * Jn * W.im, n.y * Jn * W.im);
      if (first) {
        b.grounded++;
        if (vn < 0) b._impactV = Math.max(b._impactV, -vn);
      }
    }
    if (first) b.fn[wk] = Jn / sub;
    // 切向：接触点相对滑动 slip = v·t − ωR（<0 = 空转，>0 = 拖滞/抱死）
    const vt = W._vx * tx + W._vy * ty;
    const w = b.wheelRot[wk];
    const slip = vt - w * WHEEL_R;
    let J = (-slip) / (W.im + (WHEEL_R * WHEEL_R) / IW);
    const Jmax = mu * Jn;
    if (Math.abs(J) > Jmax) J = Math.sign(J) * Jmax;
    if (J !== 0) {
      addVel(W, tx * J * W.im, ty * J * W.im);
      b.wheelRot[wk] = w - (J * WHEEL_R) / IW;
    }
    if (first) {
      const denom = Math.max(20, Math.abs(w * WHEEL_R));
      b.slip[wk] = clamp(slip / denom, -1, 1);
    }
  }
  solveBodyContact(b, FN_MAX, sub);
}

/**
 * 骑手身体（头）的地面接触：单侧、沿解析法线。
 * 只在"身体低于两轴连线"（前翻 / 倒立）时生效——此时身体会真的撑在地面上，
 * 不再穿地坠出地图；是否算摔车仍由"倒立判据 + 车架抗摔容差"决定。
 * 不计入 b.grounded / fn（"着地"与摩擦上限只由两个车轮定义）。
 */
function solveBodyContact(b, FN_MAX, sub) {
  if (!bodyLow(b)) return;
  const H = b.head;
  const g = groundInfo(H.x);
  if (!isFinite(g.y)) return;
  const n = groundNormal(H.x);
  const cosT = -n.y;
  const pen = HEAD_R - (g.y - H.y) * cosT;
  if (pen < -CONTACT_BAND) return;
  const vn = H._vx * n.x + H._vy * n.y;
  const bias = Math.min(Math.max(0, pen - PEN_TOL) * CONTACT_BIAS / sub, BIAS_MAX_V);
  let Jn = (bias - vn) * H.m;
  if (Jn < 0) Jn = 0;
  const cap = FN_MAX * sub;
  if (Jn > cap) Jn = cap;
  if (Jn > 0) addVel(H, n.x * Jn * H.im, n.y * Jn * H.im);
}

/** 一轮速度层求解（车架刚性 + 悬挂 + 接触）；返回位置残差供收敛判据使用 */
function solveVelocityConstraints(b, P, susp, mu, sub) {
  const L = WHEELBASE;
  const Lr = Math.hypot(L * 0.5, SEAT_H);
  const fr = frameOf(b);
  let resid = 0;
  let iters = 0;
  for (let it = 0; it < SOLVER_ITERS; it++) {
    let r = Math.max(
      velDistance(b.axleR, b.axleF, L),
      velDistance(b.axleR, b.head, Lr),
      velDistance(b.axleF, b.head, Lr)
    );
    for (const wk of WHEELS) {
      const A = wk === "rear" ? b.axleR : b.axleF;
      r = Math.max(r, velLateral(b[wk], A, fr, sub), velTravel(b[wk], A, fr, susp));
    }
    solveContacts(b, P, mu, sub, it === 0);
    iters = it + 1;
    resid = r;
    if (r < SOLVER_TOL) break;
  }
  b.solverIters = iters;
  b.solverResid = resid;
}

// ============================================================
//  位置投影：消除约束漂移（只动位置，不额外注入速度）
// ============================================================
/** 逆质量加权的距离约束位置投影；返回剩余误差 */
function projDistance(a, b, L0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const e = d - L0;
  if (e === 0) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const ws = a.im + b.im;
  if (ws === 0) return Math.abs(e);
  const ka = (a.im / ws) * e;
  const kb = (b.im / ws) * e;
  a.x += nx * ka; a.y += ny * ka; a.px += nx * ka; a.py += ny * ka;
  b.x -= nx * kb; b.y -= ny * kb; b.px -= nx * kb; b.py -= ny * kb;
  return Math.abs(e);
}

/** 骑手侧向不等式约束（把骑手推回轮轴线正确一侧；不是镜像补丁） */
function projHeadSide(b) {
  const dx = b.axleF.x - b.axleR.x;
  const dy = b.axleF.y - b.axleR.y;
  const d = Math.hypot(dx, dy) || 1e-4;
  const ux = dx / d, uy = dy / d;
  const signed = ux * (b.head.y - b.axleR.y) - uy * (b.head.x - b.axleR.x);
  const want = b.headUp > 0 ? 1 : -1;
  if (signed * want >= 0) return 0;
  const need = want * SOLVER_TOL - signed;
  b.head.x += -uy * need;
  b.head.y += ux * need;
  b.head.px += -uy * need;
  b.head.py += ux * need;
  return Math.abs(need);
}

/** 悬挂位置约束：横向重合 + 行程上下限 */
function projSuspension(W, A, fr, susp) {
  let err = 0;
  const et = (W.x - A.x) * fr.tx + (W.y - A.y) * fr.ty;
  if (et !== 0) {
    const ws = W.im + A.im;
    const kw = (W.im / ws) * et;
    const ka = (A.im / ws) * et;
    W.x -= fr.tx * kw; W.y -= fr.ty * kw;
    W.px -= fr.tx * kw; W.py -= fr.ty * kw;
    A.x += fr.tx * ka; A.y += fr.ty * ka;
    A.px += fr.tx * ka; A.py += fr.ty * ka;
    err = Math.abs(et);
  }
  const s = (W.x - A.x) * fr.dx + (W.y - A.y) * fr.dy;
  const c = -s;
  let over = 0;
  if (c > susp.travel) over = c - susp.travel; // 压缩到底：轮沿 +d 推出
  else if (c < -susp.ext) over = c + susp.ext; // 伸张到底：轮沿 −d 拉回
  if (over !== 0) {
    const ws = W.im + A.im;
    const kw = (W.im / ws) * over;
    const ka = (A.im / ws) * over;
    W.x += fr.dx * kw; W.y += fr.dy * kw;
    W.px += fr.dx * kw; W.py += fr.dy * kw;
    A.x -= fr.dx * ka; A.y -= fr.dy * ka;
    A.px -= fr.dx * ka; A.py -= fr.dy * ka;
    err = Math.max(err, Math.abs(over));
  }
  return err;
}

function solvePositions(b, susp) {
  const L = WHEELBASE;
  const Lr = Math.hypot(L * 0.5, SEAT_H);
  const fr = frameOf(b);
  for (let it = 0; it < SOLVER_ITERS; it++) {
    let resid = Math.max(
      projDistance(b.axleR, b.axleF, L),
      projDistance(b.axleR, b.head, Lr),
      projDistance(b.axleF, b.head, Lr)
    );
    resid = Math.max(resid, projHeadSide(b));
    for (const wk of WHEELS) {
      const A = wk === "rear" ? b.axleR : b.axleF;
      resid = Math.max(resid, projSuspension(b[wk], A, fr, susp));
    }
    if (resid < SOLVER_TOL) break;
  }
  // 穿透兜底：沿法线推出，保证侵入 ≤ 容差（只会在极端穿透/异常数据上生效）
  for (const wk of WHEELS) {
    const W = b[wk];
    const g = groundInfo(W.x);
    if (!isFinite(g.y)) continue;
    const n = groundNormal(W.x);
    const cosT = -n.y;
    const pen = WHEEL_R - (g.y - W.y) * cosT;
    if (pen > PEN_TOL) {
      const push = Math.min(pen - PEN_TOL, 4);
      W.x += n.x * push; W.y += n.y * push;
      W.px += n.x * push; W.py += n.y * push;
    }
  }
  // 骑手身体穿透兜底（同上，只在倒立/前翻姿态下生效）
  if (bodyLow(b)) {
    const H = b.head;
    const g = groundInfo(H.x);
    if (isFinite(g.y)) {
      const n = groundNormal(H.x);
      const pen = HEAD_R - (g.y - H.y) * (-n.y);
      if (pen > PEN_TOL) {
        const push = Math.min(pen - PEN_TOL, 4);
        H.x += n.x * push; H.y += n.y * push;
        H.px += n.x * push; H.py += n.y * push;
      }
    }
  }
}

// ============================================================
//  空中姿态：玩家角冲量（角动量守恒，松键保持）
// ============================================================
function airControl(b, sub) {
  if (b.grounded > 0) { b.angVel = 0; return; }
  const inp = (key.right ? 1 : 0) - (key.left ? 1 : 0);
  const veh = VEHICLES[store.currentVehicle];
  const inv = veh.phys ? veh.phys.inertia : 1;
  if (inp) {
    // 角冲量：受转动惯量影响（惯量大者转得慢）
    const wMax = (AIR_ROT_MAX * veh.air) / inv;
    const a = (AIR_ROT_ACC * veh.air) / inv;
    b.angVel = clamp(b.angVel + inp * a * sub, -wMax, wMax);
  }
  // 松键后角速度保持（不做人为衰减）
  if (!b.angVel) return;
  let mx = 0, my = 0, mt = 0;
  for (const p of b.pts) { mx += p.x * p.m; my += p.y * p.m; mt += p.m; }
  mx /= mt; my /= mt;
  const dth = b.angVel * sub;
  const co = Math.cos(dth);
  const si = Math.sin(dth);
  // 质心速度（平动）必须守恒：刚体旋转只改变"相对质心"的那部分速度。
  // （若连质心速度一起旋转，动量方向会跟着车身转 → 空中既不落地也不前进，纯属错误。）
  const sv = systemVel(b);
  for (const p of b.pts) {
    const rx = p.x - mx;
    const ry = p.y - my;
    p.x = mx + rx * co - ry * si;
    p.y = my + rx * si + ry * co;
    const rvx = p._vx - sv.vx;
    const rvy = p._vy - sv.vy;
    p._vx = sv.vx + rvx * co - rvy * si;
    p._vy = sv.vy + rvx * si + rvy * co;
  }
  b.lastAng += dth;
  b.rotAcc += dth;
}

// ============================================================
//  单个固定步的物理推进
// ============================================================
export function stepPhysics() {
  const P = store.phys;
  const run = store.run;
  const b = bike;
  const SUS = P.susp;
  const mu = P.mu;
  // 倒立摔车容差（车架等级越高越耐摔）——与第 1 期一致
  const crashTol = Math.max(8, 30 - (P.crashMargin - 4) * 1.4);
  const invMargin = -8 - (P.crashMargin - 4) * 0.3;
  const drvK = key.right && !run.crashed ? 1 : 0;
  const brkK = key.left && !run.crashed ? 1 : 0;
  const prevGrounded = b.grounded;
  const prevSpin = { rear: b.wheelRot.rear, front: b.wheelRot.front };
  const ang0 = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
  b._impactV = 0;
  b.penetration = 0;
  b.solverIters = 0;
  b.solverResid = 0;

  for (let s = 0; s < SUB; s++) {
    const sub = SUB_DT;
    syncVel(b, sub);
    // 1) 重力（均匀加速度，与质量无关）
    for (const p of b.pts) p._vy += P.GRAV * sub;
    // 2) 空中姿态（角冲量，守恒）
    airControl(b, sub);
    // 3) 悬挂弹簧-阻尼
    applySuspension(b, SUS, sub);
    // 4) 动力链 + 刹车 + 滚动阻力
    applyDrive(b, P, sub, drvK, brkK);
    // 5) 空气阻力
    applyDrag(b, P, sub);
    // 6) 速度层约束（车架刚性 / 悬挂 / 单侧接触）
    solveVelocityConstraints(b, P, SUS, mu, sub);
    // 7) 数值异常兜底（正常游玩与全部测试都不应触发；触发即计数，供断言守护）
    for (const p of b.pts) {
      if (!isFinite(p._vx) || Math.abs(p._vx) > NUM_CAP_V) {
        p._vx = clamp(p._vx || 0, -NUM_CAP_V, NUM_CAP_V);
        numCapHits++;
      }
      if (!isFinite(p._vy) || Math.abs(p._vy) > NUM_CAP_V) {
        p._vy = clamp(p._vy || 0, -NUM_CAP_V, NUM_CAP_V);
        numCapHits++;
      }
    }
    // 8) 积分 + 位置投影（消除漂移）
    integrate(b, sub);
    solvePositions(b, SUS);
  }

  b.rearGr = b.fn.rear > 0;
  b.frontGr = b.fn.front > 0;
  for (const wk of WHEELS) b.wheelAcc[wk] = (b.wheelRot[wk] - prevSpin[wk]) / DT;

  // ---------------- 落地结算（悬挂行程与压缩速度派生） ----------------
  if (prevGrounded === 0 && b.grounded > 0 && !run.crashed) {
    const vimp = b._impactV;
    b.squashVel = -clamp(vimp / LAND_REF, 0.6, 2.4);
    const midX = (b.rear.x + b.front.x) / 2;
    const gi = groundInfo(midX);
    physEvents().onLand({ x: midX, y: (b.rear.y + b.front.y) / 2, gy: gi.y, vimp });
  }
  // 画面下沉由**真实悬挂行程**派生（Task 5.2：不再有独立弹簧）
  const cAvg = (b.susp.rear.t + b.susp.front.t) * 0.5;
  const target = -clamp(cAvg / Math.max(1, SUS.travel), 0, 1);
  b.squash += (target - b.squash) * 0.4;
  if (Math.abs(b.squash) < 0.004) b.squash = 0;

  // ---------------- 车轮视觉角度由真实轮角速度派生（含空转） ----------------
  b.wheelRear = (b.wheelRear + b.wheelRot.rear * SUB_DT * 0.06) % TAU;
  b.wheelFront = (b.wheelFront + b.wheelRot.front * SUB_DT * 0.06) % TAU;

  // ---------------- 车速与真实车身角速度 ----------------
  b.speed = lerp(b.speed, systemVel(b).vx, 0.12);
  // 真实角速度（含地形/悬挂给车架带来的转动）：供空中姿态控制与表现层使用
  const ang1 = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
  b.angRate = wrapAngle(ang1 - ang0) / DT;

  // ---------------- 摔车判定：倒立且头触地 ----------------
  const hgi = groundInfo(b.head.x);
  if (!run.crashed && isFinite(hgi.y) && b.head.y > hgi.y - crashTol) {
    const inverted = b.axleR.y < b.head.y + invMargin && b.axleF.y < b.head.y + invMargin;
    if (inverted) crash();
  }

  // ---------------- 障碍物碰撞（须减速碾过或腾空飞越） ----------------
  if (!run.crashed) hitObstacle();
}
