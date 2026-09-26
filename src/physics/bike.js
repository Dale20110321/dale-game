// ============================================================
//  物理：三接触点刚体
//  车体 = 后轮/前轮/骑手 三个质点构成的刚体三角形，用"质心 + 转角"描述。
//  力全部作用在真实位置（驱动/刹车作用在接地点），于是这些现象是"算出来"的：
//    · 油门翘头 / 刹车栽头 —— 接地点在质心下方，力对质心产生力矩
//    · 坡顶腾空 —— 地面掉得比重力快时轮子自然离地，之后是纯弹道飞行
//    · 落地冲击 —— 法向速度被悬挂吸收，压缩量驱动画面下沉
//    · 陡坡打滑 / 前轮离地 —— 法向力变小则摩擦上限变小
//  注意：本文件所有速度换算必须用 SUBV（真实 px/s），不要写裸 *SUB。
//  分层：本文件不 import render/ 与 ui/；摔车/落地等表现通过 ./events.js 的注入回调派发。
// ============================================================
import {
  SUB, SUB_DT, SUBV,
  WHEEL_R, WHEELBASE, SEAT_H,
  AIR_ROT_MAX, AIR_ROT_ACC, AIR_ROT_RELEASE, AIR_HEAD_DAMP,
  LAND_REF, VSPD_CAP, DOWNHILL_K, CONTACT_TOL, STUN_TIME,
  SUSP_K_BASE, SUSP_C_BASE, SUSP_TRAVEL_BASE, SOLVER_TOL, SOLVER_ITERS,
  ROLL_RES_K, FRICTION_BASE, BRAKE_TORQUE_BASE, WHEEL_I_BASE, torqueAt,
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

/** 按当前车辆 + 升级等级重算驾驶参数（公式统一放在 config/constants.js 的 deriveHandling） */
export function applyUpgrades() {
  const v = VEHICLES[store.currentVehicle];
  const up = getUp();
  Object.assign(store.phys, deriveHandling(store.phys.GRAV, store.phys.TRACTION, v, up));
  // ---- 第 3 期 Task 1：质量/惯量/悬挂/摩擦也数据化 ----
  // 质量与惯量真参数（求解器按逆质量加权）、悬挂（刚度/阻尼/行程）、摩擦系数 μ。
  // 此处真实引用 M_R/M_F/M_H/M_TOT/COM_UP/I_BODY，使其不再是死代码。
  store.phys.rb = deriveRigidBody(v);
  store.phys.susp = deriveSuspension(v, up);
  store.phys.mu = deriveFriction(store.phys.TRACTION, v, up);
  store.phys.wheelI = WHEEL_I_BASE * store.phys.rb.mass; // 轮转动惯量（∝ 整车质量）
  bike.rb = store.phys.rb;
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
  b.rear.x = x; b.rear.y = yR; b.rear.px = x; b.rear.py = yR;
  b.front.x = x + L; b.front.y = yF; b.front.px = x + L; b.front.py = yF;
  const hx = x + L / 2 - Math.sin(ang) * SEAT_H;
  const hy = (yR + yF) / 2 - Math.cos(ang) * SEAT_H;
  b.head.x = hx; b.head.y = hy; b.head.px = hx; b.head.py = hy;
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
  b.lastAng = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
  // 记录骑手在轮轴线的哪一侧（本侧由刚体几何决定，任何旋转都不会改变）
  const ux = b.front.x - b.rear.x;
  const uy = b.front.y - b.rear.y;
  const d = Math.hypot(ux, uy) || 1e-4;
  const cross = (ux / d) * (b.head.y - b.rear.y) - (uy / d) * (b.head.x - b.rear.x);
  b.headUp = Math.sign(cross) || -1;
  // 第 3 期新增状态量一并归零（保证"同初始状态 + 同输入 → 完全可复现"）
  b.wheelRot.rear = 0; b.wheelRot.front = 0;
  b.wheelAcc.rear = 0; b.wheelAcc.front = 0;
  b.susp.rear.t = 0; b.susp.rear.v = 0;
  b.susp.front.t = 0; b.susp.front.v = 0;
  b.slip.rear = 0; b.slip.front = 0;
  b.fn.rear = 0; b.fn.front = 0;
  b.rb = store.phys.rb;
}

/**
 * 刚体保护：骑手必须始终在前后轮连线的同一侧。
 * 三个质点各自的边约束存在 ± 两组解，在陡坡上被地面钳位反复拉扯时，
 * 求解器可能把骑手翻到轮轴下方（表现为"头钻到轮轴下面"→ 误判倒立摔车）。
 * 这里检测到穿侧就沿轮轴线镜像回来（镜像不改变到前后轮的距离，三角形依然刚性）。
 */
function enforceHeadSide() {
  const b = bike;
  const dx = b.front.x - b.rear.x;
  const dy = b.front.y - b.rear.y;
  const d = Math.hypot(dx, dy) || 1e-4;
  const ux = dx / d;
  const uy = dy / d;
  const px = b.head.x - b.rear.x;
  const py = b.head.y - b.rear.y;
  const cross = ux * py - uy * px;
  if (cross === 0) return;
  if (Math.sign(cross) === b.headUp) return;
  // 沿轮轴线镜像（保持平行分量，翻转垂直分量）
  const par = px * ux + py * uy;
  const nx = b.rear.x + ux * par - (px - ux * par);
  const ny = b.rear.y + uy * par - (py - uy * par);
  const ddx = nx - b.head.x;
  const ddy = ny - b.head.y;
  b.head.x = nx;
  b.head.y = ny;
  b.head.px += ddx;
  b.head.py += ddy;
}

/** 绕车架中点旋转所有质点（保留线速度）。count=false 时不计入翻转累计 */
export function rotateBikeAround(mx, my, rot, count) {
  const b = bike;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const p of [b.rear, b.front, b.head]) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const nx = mx + dx * c - dy * s;
    const ny = my + dx * s + dy * c;
    p.px += nx - p.x;
    p.py += ny - p.y;
    p.x = nx;
    p.y = ny;
  }
  b.lastAng = (b.lastAng + rot) % (2 * Math.PI);
  if (count !== false) b.rotAcc += rot;
}

/** 摔车（附惩罚：扣 8% 燃料 + 2s 计时惩罚） */
export function crash() {
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

/**
 * 障碍物碰撞：车身两轮 vs 障碍物圆。
 * 只有"贴着地面高速通过"才算撞上——低速可安全碾过，腾空可飞越。
 * 命中走既有摔车流程（含惩罚）。
 */
function hitObstacle() {
  if (!world.obstacles.length) return;
  const b = bike;
  if (Math.abs((b.front.x - b.front.px) * SUBV) < OBST_HIT_V) return;
  for (const o of world.obstacles) {
    const oy = o.y - OBST_VIS_H * 0.5;
    for (const p of [b.rear, b.front]) {
      if (Math.abs(o.x - p.x) > OBST_R + WHEEL_R) continue;
      if (Math.hypot(o.x - p.x, oy - p.y) < OBST_R + WHEEL_R * 0.7) {
        crash();
        return;
      }
    }
  }
}

// ============================================================
//  第 3 期：质量加权约束求解 + 单侧接触 + 力作用在接地点
// ============================================================

/** 三质点质量加权质心（力/力矩推导的基准） */
function bodyCom(b, rb) {
  const m = rb.mR + rb.mF + rb.mH;
  return {
    x: (b.rear.x * rb.mR + b.front.x * rb.mF + b.head.x * rb.mH) / m,
    y: (b.rear.y * rb.mR + b.front.y * rb.mF + b.head.y * rb.mH) / m,
  };
}

/**
 * 在「真实接地点」施加力（Task 3.3）：
 *   · 线性部分 a = F / M（三点同加速度）
 *   · 角部分   α = (r × F) / I，各点再叠加 α × r_i
 * 因为力作用在接地点而不是质心，**力矩是自然产生的** ——
 * 油门翘头（后接地点在质心后下方）、刹车栽头（前接地点在质心前下方）都是算出来的，
 * 不再需要任何"假力矩系数"。
 * @param {number} sq 子步时长平方（Verlet：Δp = a·dt²）
 */
function applyForceAt(b, rb, fx, fy, px, py, sq) {
  const com = bodyCom(b, rb);
  const invM = 1 / rb.mTot;
  const rx = px - com.x;
  const ry = py - com.y;
  const alpha = (rx * fy - ry * fx) / rb.iBody; // 2D 叉积 / 转动惯量
  for (const p of [b.rear, b.front, b.head]) {
    const drx = p.x - com.x;
    const dry = p.y - com.y;
    p.x += (fx * invM - alpha * dry) * sq;
    p.y += (fy * invM + alpha * drx) * sq;
  }
}

/**
 * 质量加权距离约束（Task 2.1 / 2.3）：修正量按**逆质量**分配（重的一端动得少），
 * 而不是三点等量推动。返回剩余误差，供收敛判据使用。
 */
function solveDistance(a, b, L0, wa, wb) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const e = d - L0;
  if (e === 0) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const ws = wa + wb;
  const ka = (wa / ws) * e;
  const kb = (wb / ws) * e;
  a.x += nx * ka; a.y += ny * ka; a.px += nx * ka; a.py += ny * ka;
  b.x -= nx * kb; b.y -= ny * kb; b.px -= nx * kb; b.py -= ny * kb;
  return Math.abs(e);
}

/** 质点速度（px/s） */
function nodeVX(p, sub) { return (p.x - p.px) / sub; }
function nodeVY(p, sub) { return (p.y - p.py) / sub; }

/**
 * 在「真实接地点」施加**冲量**（Task 4.2）：Δv = J/M + Δω × r。
 * 与 applyForceAt 同理，但用于摩擦约束的一次性速度修正。
 */
function applyImpulseAt(b, rb, jx, jy, px, py, sub) {
  const com = bodyCom(b, rb);
  const invM = 1 / rb.mTot;
  const rx = px - com.x;
  const ry = py - com.y;
  const alpha = (rx * jy - ry * jx) / rb.iBody;
  for (const p of [b.rear, b.front, b.head]) {
    const drx = p.x - com.x;
    const dry = p.y - com.y;
    p.x += (jx * invM - alpha * dry) * sub;
    p.y += (jy * invM + alpha * drx) * sub;
  }
}

/** 单个固定步的物理推进 */
export function stepPhysics() {
  const P = store.phys;
  const run = store.run;
  const b = bike;
  const L = WHEELBASE;
  const Lr = Math.hypot(L * 0.5, SEAT_H);
  const rb = b.rb || P.rb;
  const wR = 1 / rb.mR;
  const wF = 1 / rb.mF;
  const wH = 1 / rb.mH;
  const SUS = P.susp || { k: SUSP_K_BASE, c: SUSP_C_BASE, travel: SUSP_TRAVEL_BASE };
  const mu = P.mu || FRICTION_BASE;
  // 倒立摔车容差（车架等级越高越耐摔）——与第 1 期一致
  const crashTol = Math.max(8, 30 - (P.crashMargin - 4) * 1.4);
  const invMargin = -8 - (P.crashMargin - 4) * 0.3;
  const drvK = key.right && !run.crashed ? 1 : 0;
  const brkK = key.left && !run.crashed ? 1 : 0;
  const prevGrounded = b.grounded;
  const airCtrl = !run.crashed && b.grounded === 0;
  if (b.grounded > 0) b.angVel = 0; // 落地清零角速度
  b.penetration = 0;

  for (let s = 0; s < SUB; s++) {
    const sub = SUB_DT;
    const sq = sub * sub;

    // ---- 1) Verlet 积分 ----
    for (const p of [b.rear, b.front, b.head]) {
      const vx = p.x - p.px;
      const vy = p.y - p.py;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
    }
    // 重力（等价于在质心施加 mTot·g）
    for (const p of [b.rear, b.front, b.head]) p.y += P.GRAV * sq;

    // ---- 2) 空中转体（玩家角冲量；守恒模型见 Task 7）----
    if (airCtrl) {
      const inp = (key.right ? 1 : 0) - (key.left ? 1 : 0);
      const vehAir = VEHICLES[store.currentVehicle].air;
      if (inp) {
        b.angVel = clamp(
          b.angVel + inp * AIR_ROT_ACC * vehAir * sub,
          -AIR_ROT_MAX * vehAir,
          AIR_ROT_MAX * vehAir
        );
      } else {
        b.angVel *= Math.pow(AIR_ROT_RELEASE, sub);
      }
      if (b.angVel) {
        const mx = (b.rear.x + b.front.x) / 2;
        const my = (b.rear.y + b.front.y) / 2;
        rotateBikeAround(mx, my, b.angVel * sub);
      }
    }

    // ---- 3) 刚体内部约束：质量加权 + 收敛判据驱动（Task 2）----
    // 地面**不再**作为约束的锚点（那是旧的"双向接触"）；地面只通过第 4 步的接触力作用，
    // 因此"起飞/离地"是约束非活跃的自然结果，不需要任何启发式判据。
    let iters = 0;
    let resid = 0;
    for (let it = 0; it < SOLVER_ITERS; it++) {
      resid = Math.max(
        solveDistance(b.rear, b.front, L, wR, wF),
        solveDistance(b.rear, b.head, Lr, wR, wH),
        solveDistance(b.front, b.head, Lr, wF, wH)
      );
      iters = it + 1;
      if (resid < SOLVER_TOL) break;
    }
    b.solverIters = iters;
    b.solverResid = resid;

    // ---- 4) 单侧地面接触（Task 3.2 / 3.3）：只能推、不能拉 ----
    // 法向力 = 悬挂弹簧-阻尼的压缩反力，沿**解析法线**、作用在**接地点**；
    // 离地时恒为 0 → 坡顶自然腾空，且不存在"粘地"。
    b.grounded = 0;
    for (const wk of ["rear", "front"]) {
      const node = wk === "rear" ? b.rear : b.front;
      const sus = b.susp[wk];
      const IW = P.wheelI || WHEEL_I_BASE;
      const wPrev = b.wheelRot[wk];
      let w = wPrev;

      // ---- 轮上扭矩（Task 4.2；空中也转：油门空转，落地时带着轮速）----
      if (wk === "rear" && drvK) {
        w += (torqueAt(VEHICLES[store.currentVehicle], w, drvK) / IW) * sub;
      }
      if (brkK) {
        // 刹车：反向扭矩，且不使轮反转（否则下一步会变成倒转轮）
        const Jb = Math.min(BRAKE_TORQUE_BASE * brkK * sub, Math.abs(w) * IW);
        w -= Math.sign(w) * (Jb / IW);
      }

      const g = groundInfo(node.x);
      const tPrev = sus.t;
      if (!isFinite(g.y)) {
        sus.t = Math.max(0, tPrev - tPrev * 0.3);
        sus.v = (sus.t - tPrev) / sub;
        b.fn[wk] = 0;
        b.slip[wk] = 0;
        b.wheelRot[wk] = w;
        b.wheelAcc[wk] = (w - wPrev) / sub;
        continue;
      }
      const pen = node.y + WHEEL_R - g.y; // >0：轮胎压入地面（竖直侵入深度）
      if (pen > -CONTACT_TOL) b.grounded++;
      if (pen <= 0) {
        // 单侧约束：可自由离地，只做悬挂回弹，不产生向下拉力
        sus.t = Math.max(0, tPrev - Math.max(0, tPrev) * 0.3);
        sus.v = (sus.t - tPrev) / sub;
        b.fn[wk] = 0;
        b.slip[wk] = 0;
        b.wheelRot[wk] = w;
        b.wheelAcc[wk] = (w - wPrev) / sub;
        continue;
      }

      const tr = Math.min(pen, SUS.travel);
      const tRate = (tr - tPrev) / sub;
      sus.t = tr;
      sus.v = tRate;
      let Fn = Math.max(0, SUS.k * tr + SUS.c * Math.max(0, tRate));
      if (pen > SUS.travel) {
        // 行程到底：硬限位（防穿模）；超出部分记为穿透量，断言其 ≤ 容差
        Fn += (pen - SUS.travel) * SUS.k * 2.5;
        b.penetration = Math.max(b.penetration, pen - SUS.travel);
      }
      b.fn[wk] = Fn;

      const n = groundNormal(node.x);
      const cxp = node.x;
      const cyp = node.y + WHEEL_R; // 接地点（轮心下方 R）
      applyForceAt(b, rb, n.x * Fn, n.y * Fn, cxp, cyp, sq);

      // ---- 摩擦：接触点相对滑动 = 轮缘速度 − 车身切向速度 ----
      // 冲量把滑动拉回 0（滚动无滑），但受库仓上限 μ×Fn×dt 限制：
      // 需求超过上限 → 打滑（空转）；低于上限 → 静摩擦传递驱动力。
      const tx = -n.y;
      const ty = n.x; // 单位切向（n=(0,-1) → t=(1,0)）
      const vt = nodeVX(node, sub) * tx + nodeVY(node, sub) * ty;
      const slipV = w * WHEEL_R - vt;
      const mEff = 1 / (1 / rb.mTot + (WHEEL_R * WHEEL_R) / IW);
      let J = mEff * slipV;
      const Jmax = mu * Fn * sub;
      if (Math.abs(J) > Jmax) J = Math.sign(J) * Jmax;
      b.slip[wk] = clamp(slipV / Math.max(20, Math.abs(w) * WHEEL_R), -1, 1);
      applyImpulseAt(b, rb, tx * J, ty * J, cxp, cyp, sub);

      // 车轮被反作用冲量减速；滚动阻力（∝ 法向力）也在轮上耗散
      w -= (J * WHEEL_R) / IW;
      const rr = (ROLL_RES_K * Fn * WHEEL_R * sub) / IW;
      w -= Math.sign(w) * Math.min(rr, Math.abs(w));
      b.wheelRot[wk] = w;
      b.wheelAcc[wk] = (w - wPrev) / sub;
    }
    b.rearGr = b.fn.rear > 0;
    b.frontGr = b.fn.front > 0;

    // ---- 5) 落地防栽头：两轮贴地时骑手重心回摆 ----
    if (b.grounded >= 2 && !run.crashed) {
      const a2 = Math.atan2(b.front.y - b.rear.y, L);
      const mx2 = (b.rear.x + b.front.x) / 2;
      const my2 = (b.rear.y + b.front.y) / 2;
      b.head.x += (mx2 - SEAT_H * Math.sin(a2) - b.head.x) * 0.35;
      b.head.y += (my2 - SEAT_H * Math.cos(a2) - b.head.y) * 0.35;
    }

    // ---- 6) 贴地车架旋转限幅（防倒立卡死；空中不限制，允许翻转）----
    const angN = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
    const dA = wrapAngle(angN - b.lastAng);
    if (b.grounded > 0) {
      const MAXDA = 0.08;
      if (Math.abs(dA) > MAXDA) {
        const back = angN - Math.sign(dA) * (Math.abs(dA) - MAXDA) * 0.85;
        const rot = back - angN;
        const c = Math.cos(rot);
        const sn = Math.sin(rot);
        for (const p of [b.front, b.head]) {
          const dx = p.x - b.rear.x;
          const dy = p.y - b.rear.y;
          const nx = b.rear.x + dx * c - dy * sn;
          const ny = b.rear.y + dx * sn + dy * c;
          p.px += nx - p.x; p.py += ny - p.y;
          p.x = nx; p.y = ny;
        }
        b.lastAng = back;
      } else {
        b.lastAng = angN;
      }
    } else {
      b.lastAng = angN;
    }

    // ---- 7) 骑手切向阻尼（贴地吸收震动；空中保持刚体旋转）----
    const mxh = (b.rear.x + b.front.x) / 2;
    const myh = (b.rear.y + b.front.y) / 2;
    const dxh = b.head.x - mxh;
    const dyh = b.head.y - myh;
    const disth = Math.hypot(dxh, dyh) || 1e-4;
    const txx = -dyh / disth;
    const tyy = dxh / disth;
    const hvx = b.head.x - b.head.px;
    const hvy = b.head.y - b.head.py;
    const vth = hvx * txx + hvy * tyy;
    const vrh = vth * (b.grounded > 0 ? P.susRot : AIR_HEAD_DAMP);
    b.head.px = b.head.x - (hvx - (vth - vrh) * txx);
    b.head.py = b.head.y - (hvy - (vth - vrh) * tyy);

    // ---- 8) 贴地 >66° 回平 / 强制前向（防倒立卡死）----
    if (!run.crashed && b.grounded > 0) {
      const angF = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
      if (Math.abs(angF) > 1.15) {
        const rot = -angF * 0.22;
        const c = Math.cos(rot);
        const sn = Math.sin(rot);
        const mx2 = (b.rear.x + b.front.x) / 2;
        const my2 = (b.rear.y + b.front.y) / 2;
        for (const p of [b.rear, b.front, b.head]) {
          const dx = p.x - mx2;
          const dy = p.y - my2;
          const nx = mx2 + dx * c - dy * sn;
          const ny = my2 + dx * sn + dy * c;
          p.px += nx - p.x; p.py += ny - p.y;
          p.x = nx; p.y = ny;
        }
      }
    }
    if (b.front.x < b.rear.x && b.grounded > 0 && !run.crashed) {
      const hgi2 = groundInfo(b.head.x);
      const headNear = hgi2.y !== Infinity && b.head.y > hgi2.y - crashTol;
      if (!headNear) {
        const mx2 = (b.rear.x + b.front.x) / 2;
        const my2 = (b.rear.y + b.front.y) / 2;
        for (const p of [b.rear, b.front, b.head]) {
          const dxx = p.x - mx2;
          const dyy = p.y - my2;
          const nx = mx2 - dxx;
          const ny = my2 - dyy;
          p.px += nx - p.x; p.py += ny - p.y;
          p.x = nx; p.y = ny;
        }
      }
    }

    // ---- 9) 摔车判定：倒立且头触地 ----
    enforceHeadSide();
    const hgi = groundInfo(b.head.x);
    if (hgi.y !== Infinity && !run.crashed && b.head.y > hgi.y - crashTol) {
      const inverted = b.rear.y < b.head.y + invMargin && b.front.y < b.head.y + invMargin;
      if (inverted) crash();
    }
  }

  // ---------------- 落地结算 ----------------
  if (prevGrounded === 0 && b.grounded > 0 && !run.crashed) {
    const vimp = Math.abs(b.front.y - b.front.py) * SUBV; // 真实落地竖向速度 px/s
    b.squashVel = -clamp(vimp / LAND_REF, 0.6, 2.4);
    b.squash = -0.3;
    const midX = (b.rear.x + b.front.x) / 2;
    const gi = groundInfo(midX);
    physEvents().onLand({ x: midX, y: (b.rear.y + b.front.y) / 2, gy: gi.y, vimp });
  }

  // ---------------- 悬挂弹簧（画面下沉；Task 5 改为由行程派生） ----------------
  b.squash += b.squashVel;
  b.squashVel -= b.squash * 0.15;
  b.squashVel *= 0.84;
  if (Math.abs(b.squash) < 0.05 && Math.abs(b.squashVel) < 0.05) {
    b.squash = 0;
    b.squashVel = 0;
  }

  // ---------------- 引擎刹车（受抓地影响；下坡滑行不制动） ----------------
  if (!drvK && !brkK && b.grounded > 0 && groundInfo(b.front.x).m <= 0.03) {
    const dec = 0.024 * P.TRACTION;
    b.rear.px += (b.rear.x - b.rear.px) * dec;
    b.front.px += (b.front.x - b.front.px) * dec;
    b.head.px += (b.head.x - b.head.px) * dec;
  }

  // ---------------- 竖向速度安全上限（仅数值兜底） ----------------
  const cvy = (b.front.y - b.front.py) * SUBV;
  if (Math.abs(cvy) > VSPD_CAP) {
    const lim = VSPD_CAP * Math.sign(cvy);
    b.front.py = b.front.y - lim * SUB_DT;
    b.rear.py = b.rear.y - lim * SUB_DT;
    b.head.py = b.head.y - lim * SUB_DT;
  }

  // ---------------- 速度上限（Task 6 将以空气阻力替代这两处钳制） ----------------
  let vh = (b.front.x - b.front.px) * SUBV;
  const gmG = groundInfo(b.front.x);
  const hasGround = gmG.y !== Infinity;
  if (hasGround && gmG.m < 0) {
    // 上坡降速：坡度越陡可维持的车速上限越低（功率恒定，爬坡必然掉速）
    const vT = Math.max(60, P.MAXV / (1 + -gmG.m * 1.3));
    if (vh > vT) vh = vT + (vh - vT) * 0.1;
  }
  const capTop = hasGround && gmG.m > 0.05 ? P.MAXV * DOWNHILL_K : P.MAXV;
  if (vh > capTop) vh = capTop;
  else if (vh < -P.MAXV) vh = -P.MAXV;
  if (vh !== (b.front.x - b.front.px) * SUBV) {
    b.front.px = b.front.x - vh * SUB_DT;
    b.rear.px = b.rear.x - vh * SUB_DT;
    b.head.px = b.head.x - vh * SUB_DT;
  }

  b.speed = lerp(b.speed, (b.front.x - b.front.px) * SUBV, 0.12);
  // 车轮视觉角度由**真实轮角速度**派生（含打滑空转；0.06 为视觉降速）
  const TWO_PI = Math.PI * 2;
  b.wheelRear = (b.wheelRear + b.wheelRot.rear * SUB_DT * 0.06) % TWO_PI;
  b.wheelFront = (b.wheelFront + b.wheelRot.front * SUB_DT * 0.06) % TWO_PI;

  // ---------------- 障碍物碰撞（须减速碾过或腾空飞越） ----------------
  if (!run.crashed) hitObstacle();
}
