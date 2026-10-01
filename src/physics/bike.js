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
//  标度：速度一律用 SUBV 换算成真实 px/s，不要写裸 *SUB（仅 config/constants.js 例外）。
//  分层：本文件不 import render/ 与 ui/；摔车/落地等表现通过 ./events.js 的注入回调派发。
// ============================================================
import {
  SUB, SUB_DT, DT,
  WHEEL_R, WHEELBASE, SEAT_H,
  AIR_ROT_MAX, AIR_ROT_ACC,
  LAND_REF, CONTACT_BAND, CONTACT_BIAS, BIAS_MAX_V, STUN_TIME,
  REV_SPEED, REV_ENTER_V,
  SOLVER_TOL, SOLVER_ITERS, PEN_TOL, FN_MAX_K, NUM_CAP_V, HEAD_R,
  ROLL_RES_K, AIR_DRAG_K, wheelInertia, torqueAt, topSpeedOf, crashTiltDeg,
  CRASH_FUEL_LOSS, CRASH_TIME_PENALTY, MAX_LV, REF_SPEED,
  deriveHandling, deriveRigidBody, deriveSuspension, deriveFriction,
} from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, bike } from "../core/store.js";
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

/**
 * 整车瞬时水平速度（px/s）：质量加权，**无滞后**。
 *
 * ★ 危险段限速判定必须用它。原实现取的是"前轮世界坐标的逐子步差分"，那算的是
 *   **前轮这一个点**的瞬时速度：车身俯仰时前轮要绕质心横扫，落地压缩时轮心被
 *   悬挂拽动，都会让差分瞬间冲到限速的好几倍 —— 于是 HUD 上明明没超速却被判
 *   超速。`bike.speed`（HUD 用的那个）是 lerp(…, 0.12) 的平滑值，又带 0.13s 滞后、
 *   系统性偏低，用它判定等于偷偷放宽限速。systemVel 则是刚体整体的真实平动速度：
 *   旋转项在质量加权下自动抵消，也没有滞后。
 */
export function bikeVx() {
  return systemVel(bike).vx;
}

/** 竞速车「极速模式」把 MAXV 抬到基准极速的多少倍 */
const ULTRA_SPEED_N = 10;
/** 终极模式的扭矩转速域倍率 */
const ULTRA_RPM_N = 8;
/** 「光子跃迁」持续推力：加速度（/s）与单子步速度上限 */
const WARP_ACC = 6.5;
const WARP_V_CAP = 90;

/**
 * 当前生效的特殊模式代号（未解锁返回空串）。
 *
 * ★ 模式的**效果**按 mode 分派，而不是到处写 `v.id === "xxx"`：
 *   每辆车的 ultra.mode 是一个稳定标识，物理层只认这一个字符串，
 *   以后加车只要在 vehicles.js 里挂一个 mode，不用改物理层的任何 if。
 * 模式表（vehicles.js 里的 ultra.mode）：
 *   stable 贴地   —— 轮/轴钉在地表，永不腾空、摔车无效（越野车）
 *   surge  极速   —— 红线与极速暴涨（竞速车）
 *   shield 护盾   —— 摔车免疫，但保留全部腾空与操控（磁力堡垒）
 *   phase  相位   —— 摔车免疫 + 燃料无限 + 危险段限速豁免（影行者）
 *   railgun 轨道炮 —— 推力与红线同时暴涨（电磁王座）
 *   warp   跃迁   —— 持续推力冲量 + 红线倍增（光子摩托）
 */
export function activeMode(veh) {
  const v = veh || VEHICLES[store.currentVehicle];
  if (!v || !v.ultra || store.ultra[v.id] !== true) return "";
  return v.ultra.mode || "";
}

/** 当前车辆的专属特殊模式是否已解锁 */
export function isUltraActive() {
  return store.ultra[VEHICLES[store.currentVehicle].id] === true;
}

/** 越野车「贴地模式」是否生效（已解锁并选用越野车） */
export function isUltraStable() {
  return activeMode() === "stable";
}

/** 是否处于"摔车免疫"模式（护盾 / 相位；贴地模式另行处理） */
export function isCrashImmune() {
  const m = activeMode();
  return m === "shield" || m === "phase" || m === "stable";
}

/** 贴地模式：把车轮/轮轴垂直钉到各自下方地表，头保持在轴中线 SEAT_H 上方（水平滑行，永不腾空） */
function pinToGround() {
  const b = bike;
  for (const wk of WHEELS) {
    const W = b[wk];
    const g = groundInfo(W.x);
    if (!isFinite(g.y)) continue;
    const n = groundNormal(W.x);
    // 法线朝屏幕上方（n.y < 0）→ 轮心在地表上方 WHEEL_R：g.y + n.y*WHEEL_R
    // （旧写法 g.y - n.y*WHEEL_R 把轮心钉进地表之下，造成"陷地 + 无摩擦走不动"）
    const wheelY = g.y + n.y * WHEEL_R;
    W.y = wheelY; W.py = wheelY; W._vy = 0;
    const A = wk === "rear" ? b.axleR : b.axleF;
    A.y = wheelY; A.py = wheelY; A._vy = 0;
  }
  const midY = (b.axleR.y + b.axleF.y) * 0.5;
  b.head.y = midY - SEAT_H;
  b.head.py = midY - SEAT_H;
  b.head._vy = 0;
}

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

  // 倒挡的**物理**基准极速：必须在下面特殊模式把 MAXV 抬高**之前**存一份。
  // 拿"极速模式"的标称值当倒挡目标，会让终极模式"倒着比正着还快"。
  store.phys.MAXVPhys = store.phys.MAXV;

  // 特殊终极模式（放在所有派生量覆写之后：μ 由 deriveFriction 派生，
  // 若在前面放大会被覆盖，车会因打滑而极速上不去）
  const mode = activeMode(v);
  if (mode === "surge") {
    // 极速模式：扭矩域拉到极高 → 扭矩曲线在高速段仍是满功率，配合极低风阻真的冲得上去。
    store.phys.rpmK *= ULTRA_RPM_N;
    store.phys.MAXV = Math.max(store.phys.MAXV, ULTRA_SPEED_N * REF_SPEED);
    store.phys.mu = Math.max(store.phys.mu, 4); // 高抓地：大扭矩不打滑
    store.phys.airDragK = AIR_DRAG_K * 0.1; // 极低风阻，极速真正冲上去
  } else if (mode === "railgun") {
    // 电磁轨道炮：推力与红线同时暴涨（"变态"到极速表读数本身都不够用了）
    store.phys.torquePeak *= ULTRA_TORQUE_N;
    store.phys.rpmK *= ULTRA_RPM_N * 1.6;
    store.phys.mu = Math.max(store.phys.mu, 3.4);
    store.phys.airDragK = AIR_DRAG_K * 0.2;
    store.phys.MAXV = topSpeedOf(v, { engine: MAX_LV, tire: MAX_LV }) * ULTRA_SPEED_N;
  } else if (mode === "warp") {
    // 光子跃迁：直接给整车注入持续推力冲量（见 stepPhysics 的 boost 段）
    store.phys.MAXV = topSpeedOf(v, { engine: MAX_LV, tire: MAX_LV }) * ULTRA_SPEED_N * 1.6;
    store.phys.rpmK *= 2;
  }
  if (!mode || mode === "stable" || mode === "shield" || mode === "phase") {
    store.phys.airDragK = 0;
  }
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
  // 骑手位置 = 车架中点 + 垂直于「后轴→前轴」方向、朝上的 SEAT_H。
  //   方向向量 u = (cos ang, sin ang)，其"朝上"法线 = (sin ang, -cos ang)。
  // ★ 原来这里 x 分量写的是 **-sin**，符号反了：平地上 sin=0 看不出来，
  //   一到坡面就把骑手往"后"错位 2·sin(ang)·SEAT_H（30° 坡即 26px）。
  //   后果是每次摔车重生都先摆出一个非刚体的姿态（实测刚性误差 p50 4.1px /
  //   p99 26.8px / 峰值 31.3px，99% 的重生点都超过 SOLVER_TOL），
  //   要等下一帧 solvePositions 才对上 —— 表现为重生瞬间的 1 帧"跳一下"。
  //   （START_X=40 恰好是平地，所以开局看不到，只有重生会踩到。）
  const hx = x + L / 2 + Math.sin(ang) * SEAT_H;
  const hy = (yR + yF) / 2 - Math.cos(ang) * SEAT_H;
  b.head.x = hx; b.head.y = hy; b.head.px = hx; b.head.py = hy;
  b.head._vx = 0; b.head._vy = 0;
  b.grounded = 0;
  b.speed = 0;
  b.wheelRear = 0;
  b.wheelFront = 0;
  // 本帧轮角增量也必须一并归零：渲染层用它算辐条频闪淡出与踏频，
  // 残留旧值会让重生后第一帧的辐条几乎完全淡出（实测 blur 0.97 → alpha 0.107）。
  b.wheelStep = 0;
  b.wheelStepF = 0;
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
  b.fricAcc.rear = 0; b.fricAcc.front = 0;
  // 助推计时必须一并归零：boostImpulse 只要 boostT>0 就继续改写 Verlet 前一帧位置
  // （=注入速度）。压过加速带后 0.5s 内重开/换关，新一局会白送一段速度冲量。
  b.boostT = 0;
  b.angRate = 0;
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

/** 摔车（附惩罚：扣 8% 燃料 + 2s 计时惩罚）；护盾 / 相位 / 贴地模式下永不摔车 */
export function crash() {
  if (isCrashImmune()) return;
  const run = store.run;
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
function applyDrive(b, P, sub, drv, brk, rev) {
  // 贴地模式（越野车终极模式）：轮子被钉在地表、接触摩擦为 0，
  // 油门/刹车改走"整车速度指令"（磁悬浮滑行）——否则完全走不动。
  if (isUltraStable()) {
    const sv = systemVel(b);
    const vx = sv.vx;
    let target = 0;
    if (rev) target = -(P.MAXVPhys || P.MAXV) * REV_SPEED;
    else if (drv) target = P.MAXV * 0.95; // 前进冲到极速；刹车/松油门滑停
    const maxAcc = P.MAXV * 2; // 加速（/s），0.5s 内到极速，不突兀
    const dv = clamp(target - vx, -maxAcc * sub, maxAcc * sub);
    if (dv !== 0) for (const p of b.pts) p._vx += dv;
    // 轮子视觉角速度跟随车速（轮心贴地时真实接触不转轮），倒车时反向
    const want = vx / WHEEL_R;
    b.wheelRot.rear += clamp(want - b.wheelRot.rear, -40, 40) * sub;
    b.wheelRot.front = b.wheelRot.rear;
    return;
  }
  const veh = VEHICLES[store.currentVehicle];
  const IW = P.wheelI || wheelInertia(P.rb.mW);
  /**
   * 驱动扭矩的**翘头上限**：车轮收到的驱动扭矩会通过悬挂把车架向后掀，
   * 而重力绕后接地点的恢复力矩只有 mTot·g·WHEELBASE/2。τ 一旦越过它，车必然后空翻
   * ——实测引擎一升级扭矩就翻：扭矩峰值 18k→47k 时恢复力矩才 44.7k，
   * 于是山地车 Lv50 起、竞速车 Lv50 起、光子摩托 Lv25 起就在后空翻摔车
   * （光子摩托 480 帧里 370 帧在摔，越野车 Lv75 直接躺着不动 v=9px/s）。
   *
   * 限幅的**不是速度**而是扭矩，所以引擎升级带来的极速提升（来自抬红线 rpmK，
   * 不来自堆扭矩）完全不受影响：τ 被压在恢复力矩之下，驱动力仍够把车推上去。
   * 只限驱动扭矩，刹车 / 倒挡伺服 / 被动阻力都不动 —— 那三者本来就不产生这个力矩。
   */
  const wheelieTau = P.rb.mTot * P.GRAV * WHEELBASE * 0.5;
  for (const wk of WHEELS) {
    let w = b.wheelRot[wk];
    let tau = 0;
    // 油门只驱动后轮；刹车前后轮都作用（真车如此）
    if (wk === "rear" && drv) tau += clamp(torqueAt(veh, w, drv, P.torquePeak, P.rpmK || 1), -wheelieTau, wheelieTau);
    // 倒挡 = 反向驱动力矩，把后轮推向目标倒转角速度（同样只驱动后轮）。
    // 用"趋近目标轮速"的差动式扭矩而不是固定反向扭矩：倒车到极速后扭矩自然归零。
    //
    // ★ 按住刹车时必须**停掉这个伺服**：torquePeak(18000×…) 恒大于 brakePeak(12000×…)
    //   （三种车各级升级实测比值 1.16~3.59），伺服饱和在 −torquePeak 而刹车只有
    //   +brakePeak，净扭矩永远为负 —— 于是"↓+←"会停在一个**非零的恒定倒车速度**
    //   上一直往后飘（实测 trail L0 稳定在 −19.8px/s，60 秒倒退 1187px）。
    //   交给刹车接管后，↓+← 能正常减速到停。
    if (wk === "rear" && rev && !brk) {
      const base = P.MAXVPhys || P.MAXV;
      const wantW = (-base * REV_SPEED) / WHEEL_R;
      tau += clamp(clamp(((wantW - w) * IW) / sub, -wheelieTau, wheelieTau), -wheelieTau, wheelieTau);
    }
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
  const k = P.airDragK || AIR_DRAG_K; // 极速模式用压缩后的阻力，普通模式用默认
  const ax = (-sv.vx / sp) * (k * sp * sp) / sv.m;
  const ay = (-sv.vy / sp) * (k * sp * sp) / sv.m;
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
function solveContacts(b, P, mu, sub, first, geo) {
  const IW = P.wheelI || wheelInertia(P.rb.mW);
  const FN_MAX = FN_MAX_K * P.rb.mTot * P.GRAV;
  if (first) b.grounded = 0;
  for (const wk of WHEELS) {
    const W = b[wk];
    const g = geo[wk].info;
    if (first) { b.fn[wk] = 0; b.slip[wk] = 0; b.fricAcc[wk] = 0; }
    if (!isFinite(g.y)) continue;
    const n = geo[wk].norm;
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
    //
    // ★ 摩擦冲量必须**按子步累加**并对**累计量**限幅，而不是每次迭代都从零算。
    //   旧实现每轮迭代都重新求 J = −slip/(…) 再直接施加：一轮迭代里打滑一旦饱和
    //   （|J| ≥ μ·Jn），J 就恒等于 ±μ·Jn，而 solveContacts 一轮迭代要跑 SOLVER_ITERS=8 次
    //   —— 于是一个子步能施加**最多 8 倍**摩擦力。这条过量的力同时
    //     ① 让实际推力远超物理上限（表观"凭空加速"）；
    //     ② 通过 μ·Fn 的反作用力矩把车架向后掀 —— 引擎一升级扭矩就更容易后空翻摔车。
    //   实测未修时：山地车 Lv50 有 190/480 帧在摔，越野车 Lv75 直接躺着不动（v=9px/s）。
    //   现在每轮只施加**增量**，并要求 |累计| ≤ μ·Jn（标准 accumulated-impulse 限幅）。
    const vt = W._vx * tx + W._vy * ty;
    const w = b.wheelRot[wk];
    const slip = vt - w * WHEEL_R;
    let dJ = (-slip) / (W.im + (WHEEL_R * WHEEL_R) / IW);
    const Jmax = mu * Jn;
    const acc0 = b.fricAcc[wk];
    // 累计值限幅：只允许本轮把 |acc| 推近 μ·Jn，不允许越界（越界即多给一次摩擦力）
    const lo = -Jmax;
    const hi = Jmax;
    if (acc0 + dJ < lo) dJ = lo - acc0;
    else if (acc0 + dJ > hi) dJ = hi - acc0;
    b.fricAcc[wk] = acc0 + dJ;
    if (dJ !== 0) {
      addVel(W, tx * dJ * W.im, ty * dJ * W.im);
      b.wheelRot[wk] = w - (dJ * WHEEL_R) / IW;
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
  // 地形静态：速度层迭代只改速度、不改位置，同一位置沿迭代数轮采样结果完全相同，
  // 因此每子步采样一次、迭代内复用（原实现每轮迭代都重新采样，等于把地形算约 10 遍）。
  const geo = {
    rear: { info: groundInfo(b.rear.x), norm: groundNormal(b.rear.x) },
    front: { info: groundInfo(b.front.x), norm: groundNormal(b.front.x) },
  };
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
    solveContacts(b, P, mu, sub, it === 0, geo);
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
  // 倒立摔车容差（都只由车架等级决定，理由见本函数末尾的摔车判定）：
  //  · crashTol：头离地多近算"撑在地上"（0 级 30px → 摔得早，满级 16px → 摔得晚）
  //  · tiltMin：车架要翻过多大角度才算倒立（0 级 ≈99°，满级 ≈124°）
  const crashTol = Math.max(8, 30 - (P.crashMargin - 4) * 1.4);
  const tiltMin = (crashTiltDeg(P.crashMargin) * Math.PI) / 180;
  const drvK = key.right && !run.crashed ? 1 : 0;
  // 倒挡是**独立按键**（↓/S），不是"停住后继续踩刹车"——
  // 刹车在本项目里有一条刻意的不变量：永远只减速、绝不倒转轮子（见 applyDrive）。
  // 复用刹车键去挂倒挡会同时打破那条不变量，并让"减速进危险段"的玩家突然开始倒车。
  //
  // ↓ 的两段行为和真车一致：速度还快时它**先当刹车用**，停稳后才真正挂上倒挡。
  // 不设这道门槛的话，高速按住 ↓ 会把后轮直接倒转起来硬拽整车（= 高速挂倒挡）。
  const revK = key.rev && !run.crashed && b.grounded > 0 ? 1 : 0;
  const revReady = revK && systemVel(b).vx < REV_ENTER_V;
  const brkK = (key.left || (revK && !revReady)) && !run.crashed ? 1 : 0;
  const rev = revReady ? 1 : 0;
  // 「光子跃迁」的持续推力在整帧内固定，每子步重查 mode 是纯浪费
  const warp = activeMode() === "warp";
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
    applyDrive(b, P, sub, drvK, brkK, rev);
    // 5) 空气阻力
    applyDrag(b, P, sub);
    // 5.5) 「光子跃迁」：踩住油门即持续注入水平推力冲量（0.7s 内逼近标称极速）
    if (warp && drvK && !run.crashed) {
      const tgt = P.MAXV * 0.98;
      const svw = systemVel(b);
      const add = clamp((tgt - svw.vx) * WARP_ACC * sub, 0, WARP_V_CAP * sub);
      for (const p of b.pts) p._vx += add;
    }
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

  // —— 贴地模式（越野车终极模式）：整车钉在地表，永不翻车 ——
  if (isUltraStable() && !run.crashed) pinToGround();

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

  // ---------------- 车轮视觉角度：与路面严格同步 ----------------
  // 纯滚动时轮角速度就是 v/R，所以直接用真实轮角速度积分即可"贴路"：
  // 实测加速段 ω/(v/R)=1.04~1.06，猛加速时升到 1.28~1.36 —— 那是**真实的空转/打滑**，
  // 过去被 0.06 这个视觉系数抹平了（轮子按真实转速的 6% 画），既不贴路也看不见打滑。
  //
  // ★ 必须乘 **DT（整帧）而不是 SUB_DT（单子步）**：这段积分每帧只在子步循环
  //   之后做一次，用 SUB_DT 就等于每帧只走了 1/SUB = 1/6 圈，转速只有真实的 1/6。
  //   （旧代码 `* SUB_DT * 0.06` 因此实际只画出真实转速的 1%。）
  //   按真实转速画之后单帧转角会到 40°+，辐条必然频闪，交给渲染层淡出处理。
  b.wheelStep = b.wheelRot.rear * DT;
  b.wheelStepF = b.wheelRot.front * DT;
  b.wheelRear = (b.wheelRear + b.wheelStep) % TAU;
  b.wheelFront = (b.wheelFront + b.wheelStepF) % TAU;

  // ---------------- 车速与真实车身角速度 ----------------
  b.speed = lerp(b.speed, systemVel(b).vx, 0.12);
  // 真实角速度（含地形/悬挂给车架带来的转动）：供空中姿态控制与表现层使用
  const ang1 = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
  b.angRate = wrapAngle(ang1 - ang0) / DT;

  // ---------------- 摔车判定：车架翻过 tiltMin 且骑手身体撑到地面 ----------------
  //
  // ★ 这里原本有两条判据，顺序错了：
  //     if (gap < HEAD_R + CONTACT_BAND && bodyLow(b)) crash();   ← 恒真，抢先
  //     else if (gap < crashTol && inverted) crash();             ← 真正的判据
  //   位置求解器本来就有骑手身体的穿透兜底（solvePositions 末尾），会把压进地里的
  //   头推回到**恰好 HEAD_R** 处，所以只要骑手身体是最低接触点，gap 就恒在 18 上下，
  //   而阈值 HEAD_R + CONTACT_BAND = 20 —— 第一条**永远成立**。连带后果是第二条成了
  //   死代码：**车架等级的抗摔能力从来没生效过**；bodyLow 又只是"头低于两轮中点"
  //   （≈ 翻过 90°），于是车身一过垂直线、哪怕头还离地几十像素也立刻判摔 ——
  //   这就是"头朝底下立刻摔"。
  //
  // ★ 第二个判据的"倒立"也一并换了写法。旧的 `两轮都低于头 invMargin` 有盲区：
  //   车倾斜着撑在地上时两轮一高一低，只要有一轮没低于头 8px 就不算倒立 ——
  //   实测 150° 落地会稳定停在 -116°（头朝下撑地）却不判摔。
  //   现在直接用**车架自身的倾角** |atan2(前轮−后轮)|：与哪个点最低无关，
  //   0 = 水平、π = 完全倒置，稳。
  //
  //   两条同时成立才摔：
  //   · 倾角过 tiltMin —— 擦过垂直线（约 99°）还有活路，车架升级还能再放宽到 124°；
  //   · 骑手身体确实落到地面附近 —— 空中倒立但还离地很高时��判摔，
  //     玩家有时间用空中转体（AIR_ROT_MAX 9.5 rad/s，转 30° 只要 0.055s）救回来。
  const hgi = groundInfo(b.head.x);
  if (!run.crashed && isFinite(hgi.y)) {
    const gap = hgi.y - b.head.y;
    // 阈值取两者的**较大值**：下界保证"头真的撑在地上"时任何等级都必摔
    // （满级 crashTol 只有 16px，比求解器维持的 18px 还小，单用它会开出盲区），
    // 上界让车架等级真正生效。车架升级只会放宽窗口，不会开出"贴地却不摔"。
    if (gap < Math.max(HEAD_R + CONTACT_BAND, crashTol) && Math.abs(wrapAngle(ang1)) > tiltMin) crash();
  }
}
