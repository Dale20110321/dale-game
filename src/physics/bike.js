// ============================================================
//  物理：三接触点刚体
//  车体 = 后轮/前轮/骑手 三个质点构成的刚体三角形，用"质心 + 转角"描述。
//  力全部作用在真实位置（驱动/刹车作用在接地点），于是这些现象是"算出来"的：
//    · 油门翘头 / 刹车栽头 —— 接地点在质心下方，力对质心产生力矩
//    · 坡顶腾空 —— 地面掉得比重力快时轮子自然离地，之后是纯弹道飞行
//    · 落地冲击 —— 法向速度被悬挂吸收，压缩量驱动画面下沉
//    · 陡坡打滑 / 前轮离地 —— 法向力变小则摩擦上限变小
//  注意：本文件所有速度换算必须用 SUBV（真实 px/s），不要写裸 *SUB。
// ============================================================
import {
  SUB, SUB_DT, SUBV, DT,
  WHEEL_R, WHEELBASE, SEAT_H,
  AIR_ROT_MAX, AIR_ROT_ACC, AIR_ROT_RELEASE, AIR_HEAD_DAMP, PITCH_TORQUE,
  LAUNCH_K, LAUNCH_MAX, LAND_REF, VSPD_CAP, DOWNHILL_K, CONTACT_TOL, STUN_TIME,
  deriveHandling,
} from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { store, bike } from "../core/store.js";
import { clamp, lerp, wrapAngle } from "../core/utils.js";
import { getUp } from "../core/storage.js";
import { groundInfo, groundY } from "./terrain.js";
import { emitParticles } from "../render/particles.js";
import { addShake } from "../render/camera.js";
import { settleLanding } from "../game/stats.js";
import { playCrashSound } from "../core/audio.js";
import { showToast } from "../core/toast.js";
import { key } from "../core/input.js";

/** 按当前车辆 + 升级等级重算驾驶参数（公式统一放在 config/constants.js 的 deriveHandling） */
export function applyUpgrades() {
  const v = VEHICLES[store.currentVehicle];
  const up = getUp();
  Object.assign(store.phys, deriveHandling(store.phys.GRAV, store.phys.TRACTION, v, up));
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
  b.stunned = 0;
  b.wheelRear = 0;
  b.wheelFront = 0;
  b.frontGr = false;
  b.rearGr = false;
  b.squash = 0;
  b.squashVel = 0;
  b.angVel = 0;
  b.rotAcc = 0;
  b.rearAir = false;
  b.frontAir = false;
  b.lastAng = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
  // 记录骑手在轮轴线的哪一侧（本侧由刚体几何决定，任何旋转都不会改变）
  const ux = b.front.x - b.rear.x;
  const uy = b.front.y - b.rear.y;
  const d = Math.hypot(ux, uy) || 1e-4;
  const cross = (ux / d) * (b.head.y - b.rear.y) - (uy / d) * (b.head.x - b.rear.x);
  b.headUp = Math.sign(cross) || -1;
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

/** 摔车 */
export function crash() {
  const run = store.run;
  if (run.crashed) return;
  run.crashed = true;
  run.runCrashed = true;
  run.crashTimer = STUN_TIME;
  bike.stunned = STUN_TIME;
  run.combo = 0;
  addShake(11);
  playCrashSound();
  emitParticles(bike.head.x, bike.head.y, 20, { color: "#ff6b35", spd: 2, life: 25, size: 3, grav: 0.06 });
  showToast("💥 摔车！", 700);
}

/** 单个固定步的物理推进 */
export function stepPhysics() {
  const P = store.phys;
  const run = store.run;
  const b = bike;
  const L = WHEELBASE;
  const Lr = Math.hypot(L * 0.5, SEAT_H);
  const aDrive = key.right && !run.crashed ? P.DRIVE : 0;
  const aBrake = key.left && !run.crashed ? P.BRAKE : 0;
  const prevGrounded = b.grounded;
  const airCtrl = !run.crashed && b.grounded === 0;
  if (b.grounded > 0) b.angVel = 0; // 落地清零角速度

  for (let s = 0; s < SUB; s++) {
    const sub = SUB_DT;
    const sq = sub * sub;
    const pts = [b.rear, b.front, b.head];

    // Verlet 积分
    for (const p of pts) {
      const vx = p.x - p.px;
      const vy = p.y - p.py;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
    }
    for (const p of pts) p.y += P.GRAV * sq;

    // ---- 驱动 / 刹车：整车推力 + 反扭矩（重量转移） ----
    if (aDrive || aBrake) {
      let a = aDrive;
      if (aBrake) {
        // 刹车是"阻力"而非"倒车推力"：方向始终与当前速度相反，且不会把车推向反向
        const vNow = (b.rear.x - b.rear.px) / sub;
        const bmag = Math.min(aBrake, Math.abs(vNow) / sub);
        a -= Math.sign(vNow) * bmag;
      }
      b.rear.x += a * sq * 1.05;
      b.front.x += a * sq * 0.95;
      const mx = (b.rear.x + b.front.x) / 2;
      const my = (b.rear.y + b.front.y) / 2;
      rotateBikeAround(mx, my, -a * PITCH_TORQUE * sq, false);
    }

    // ---- 空中转体：按右=顺时针（前空翻），按左=逆时针（后空翻） ----
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

    // ---- 刚性约束：贴地轮 y 锚定，离地轮全自由度 ----
    // 位置修正必须同步写回 px/py（= 保持速度不变），否则会被 Verlet 当成速度突变
    // 接地高度每轮迭代重新采样（迭代本身会移动轮子）
    for (let it = 0; it < 6; it++) {
      const FS = groundInfo(b.front.x).y - WHEEL_R;
      const RS = groundInfo(b.rear.x).y - WHEEL_R;
      b.frontGr = b.front.y > FS - CONTACT_TOL;
      b.rearGr = b.rear.y > RS - CONTACT_TOL;

      const dR = [0, 0], dF = [0, 0], dH = [0, 0];
      let dx = b.front.x - b.rear.x;
      let dy = b.front.y - b.rear.y;
      let d = Math.hypot(dx, dy) || 1e-4;
      let diff = (d - L) / d;

      if (b.rearGr && b.frontGr) {
        if (Math.abs(dy) < 25) {
          const err = diff * dx * 0.5;
          dR[0] += err;
          dF[0] -= err;
        } else {
          dR[0] += dx * diff * 0.5; dR[1] += dy * diff * 0.5;
          dF[0] -= dx * diff * 0.5; dF[1] -= dy * diff * 0.5;
        }
      } else if (b.rearGr) {
        dF[0] -= dx * diff; dF[1] -= dy * diff;
      } else if (b.frontGr) {
        dR[0] += dx * diff; dR[1] += dy * diff;
      } else {
        dR[0] += dx * diff * 0.5; dR[1] += dy * diff * 0.5;
        dF[0] -= dx * diff * 0.5; dF[1] -= dy * diff * 0.5;
      }

      // head-rear
      dx = b.head.x - b.rear.x; dy = b.head.y - b.rear.y;
      d = Math.hypot(dx, dy) || 1e-4; diff = (d - Lr) / d;
      if (b.rearGr) {
        dH[0] -= dx * diff; dH[1] -= dy * diff;
      } else {
        dR[0] += dx * diff * 0.5; dR[1] += dy * diff * 0.5;
        dH[0] -= dx * diff * 0.5; dH[1] -= dy * diff * 0.5;
      }

      // head-front
      dx = b.head.x - b.front.x; dy = b.head.y - b.front.y;
      d = Math.hypot(dx, dy) || 1e-4; diff = (d - Lr) / d;
      if (b.frontGr) {
        dH[0] -= dx * diff; dH[1] -= dy * diff;
      } else {
        dF[0] += dx * diff * 0.5; dF[1] += dy * diff * 0.5;
        dH[0] -= dx * diff * 0.5; dH[1] -= dy * diff * 0.5;
      }

      b.rear.x += dR[0]; b.rear.y += dR[1]; b.rear.px += dR[0]; b.rear.py += dR[1];
      b.front.x += dF[0]; b.front.y += dF[1]; b.front.px += dF[0]; b.front.py += dF[1];
      b.head.x += dH[0]; b.head.y += dH[1]; b.head.px += dH[0]; b.head.py += dH[1];
    }
    // 刚体保护：骑手不得被求解器甩到轮轴下方（否则会误判"倒立"而假摔车）
    enforceHeadSide();

    // ---- 逐轮压回贴地 / 坡顶腾空 ----
    b.grounded = 0;
    for (const [p, flag] of [[b.rear, "rearGr"], [b.front, "frontGr"]]) {
      const srf = groundInfo(p.x).y - WHEEL_R;
      b[flag] = p.y > srf - CONTACT_TOL;
      if (p.y > srf - 60) {
        const airKey = flag === "rearGr" ? "rearAir" : "frontAir";
        const vxs = (p.x - p.px) / sub;
        const gC = groundInfo(p.x);
        const curv = (groundInfo(p.x + 10).y - 2 * gC.y + groundInfo(p.x - 10).y) / 100; // >0 = 上凸坡顶

        // 坡顶腾空：轮子要贴坡顶走需要向下向心加速度 a=v²κ，超过重力+悬挂上限则离地
        if (!b[airKey] && p.y <= srf + 1 && vxs * vxs * curv > P.GRAV * LAUNCH_K) {
          // 只在小圆丘式坡顶起飞：前方是断层/大落差时不飞（否则会变成不自然的大跳台）
          const span = Math.max(90, Math.abs(vxs) * 0.3);
          if (groundInfo(p.x + span).y - WHEEL_R - srf < LAUNCH_MAX * 2.2) {
            b[airKey] = true;
            // 悬挂回弹吸掉多余上冲：把竖直上冲限制在"刚好跳起 LAUNCH_MAX"的量级
            const vup = Math.sqrt(2 * P.GRAV * LAUNCH_MAX);
            if ((p.y - p.py) / sub < -vup) p.py = p.y + vup * sub;
          }
        }

        if (b[airKey]) {
          if (p.y >= srf) {
            b[airKey] = false; // 真正压到地面才算落地
          } else {
            // 悬挂拉伸回拉：离地超过 LAUNCH_MAX 才用连续加速度把轮子带回地面附近，绝不瞬移
            const gapNow = srf - p.y;
            if (gapNow > LAUNCH_MAX) {
              const pull = Math.min(P.GRAV, 40 * (gapNow - LAUNCH_MAX));
              p.py -= pull * sub * sub;
            }
            b[flag] = false;
            continue;
          }
        }

        const ginfo = groundInfo(p.x);
        if (ginfo.y !== Infinity) {
          p.x += ((P.GRAV * ginfo.m) / Math.hypot(1, ginfo.m)) * 0.11 * sq;
          if (ginfo.m < -1.0) p.px += (p.x - p.px) * 0.01;
        }

        const depth = p.y - srf;
        if (depth > 8) {
          p.y = Math.max(srf, p.y - P.susClimb);
          const vy = p.y - p.py;
          if (vy < 0) p.py = p.y;
          else if (vy > 0) p.py = p.y - vy * P.susAbsorb;
        } else if (depth < -8) {
          p.y = Math.min(srf, p.y + P.susClimb);
          const vy = p.y - p.py;
          if (vy > 0) p.py = p.y - vy * P.susAbsorb;
        } else {
          const vy = p.y - p.py;
          if (vy > 0) p.py = p.y - vy * P.susAbsorb;
          p.y = srf;
        }
        b.grounded++;
      }
    }

    // ---- 落地防栽头：两轮贴地时骑手重心回摆 ----
    if (b.grounded >= 2 && !run.crashed) {
      const a2 = Math.atan2(b.front.y - b.rear.y, L);
      const mx2 = (b.rear.x + b.front.x) / 2;
      const my2 = (b.rear.y + b.front.y) / 2;
      b.head.x += (mx2 - SEAT_H * Math.sin(a2) - b.head.x) * 0.35;
      b.head.y += (my2 - SEAT_H * Math.cos(a2) - b.head.y) * 0.35;
    }

    // ---- 车架旋转限制：贴地时角度突变过限则绕后轮回拨（空中不限制，允许翻转） ----
    const angN = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
    const dA = wrapAngle(angN - b.lastAng);
    if (b.grounded > 0) {
      const MAXDA = 0.08;
      if (Math.abs(dA) > MAXDA) {
        const back = angN - Math.sign(dA) * (Math.abs(dA) - MAXDA) * 0.85;
        const rot = back - angN;
        const c = Math.cos(rot), s = Math.sin(rot);
        for (const p of [b.front, b.head]) {
          const dx = p.x - b.rear.x, dy = p.y - b.rear.y;
          const nx = b.rear.x + dx * c - dy * s;
          const ny = b.rear.y + dx * s + dy * c;
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

    // ---- 旋转阻尼：贴地时衰减骑手切向速度（吸收震动）；空中不阻尼，保持刚体旋转 ----
    const mxh = (b.rear.x + b.front.x) / 2;
    const myh = (b.rear.y + b.front.y) / 2;
    const dxh = b.head.x - mxh, dyh = b.head.y - myh;
    const disth = Math.hypot(dxh, dyh) || 1e-4;
    const txx = -dyh / disth, tyy = dxh / disth;
    const hvx = b.head.x - b.head.px, hvy = b.head.y - b.head.py;
    const vt = hvx * txx + hvy * tyy;
    const vr = vt * (b.grounded > 0 ? P.susRot : AIR_HEAD_DAMP);

    // ---- 贴地车架 >66° 强力回平（空中不干预，玩家自己控姿态） ----
    if (!run.crashed && b.grounded > 0) {
      const angF = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
      if (Math.abs(angF) > 1.15) {
        const rot = -angF * 0.22;
        const c = Math.cos(rot), s = Math.sin(rot);
        const mx2 = (b.rear.x + b.front.x) / 2;
        const my2 = (b.rear.y + b.front.y) / 2;
        for (const p of [b.rear, b.front, b.head]) {
          const dx = p.x - mx2, dy = p.y - my2;
          const nx = mx2 + dx * c - dy * s;
          const ny = my2 + dx * s + dy * c;
          p.px += nx - p.x; p.py += ny - p.y;
          p.x = nx; p.y = ny;
        }
      }
    }

    // ---- 贴地强制车架前向（防倒立卡死） ----
    // 例外：若头已贴近地面，说明这是真正的"倒立落地"，留给下面的摔车判定处理。
    // （若此时强行把车翻正，会让人明明倒立落地却摔不下来，画面也会瞬间镜像跳变）
    if (b.front.x < b.rear.x && b.grounded > 0 && !run.crashed) {
      const hgi2 = groundInfo(b.head.x);
      const headNear = hgi2.y !== Infinity && b.head.y > hgi2.y - 30;
      if (!headNear) {
        const mx2 = (b.rear.x + b.front.x) / 2;
        const my2 = (b.rear.y + b.front.y) / 2;
        for (const p of [b.rear, b.front, b.head]) {
          const dxx = p.x - mx2, dyy = p.y - my2;
          const nx = mx2 - dxx, ny = my2 - dyy;
          p.px += nx - p.x; p.py += ny - p.y;
          p.x = nx; p.y = ny;
        }
      }
    }

    b.head.px = b.head.x - (hvx - (vt - vr) * txx);
    b.head.py = b.head.y - (hvy - (vt - vr) * tyy);

    // ---- 摔车判定：倒立且头触地 ----
    enforceHeadSide(); // 判定前再做一次，确保不是求解器穿侧造成的假倒立
    const hgi = groundInfo(b.head.x);
    if (hgi.y !== Infinity && !run.crashed && b.head.y > hgi.y - 30) {
      const inverted = b.rear.y < b.head.y - 8 && b.front.y < b.head.y - 8;
      if (inverted) crash();
    }
  }

  // ---------------- 落地结算 ----------------
  if (prevGrounded === 0 && b.grounded > 0 && !run.crashed) {
    const vimp = Math.abs(b.front.y - b.front.py) * SUBV; // 真实落地竖向速度 px/s
    b.squashVel = -clamp(vimp / LAND_REF, 0.6, 2.4);
    b.squash = -0.3;
    addShake(clamp((vimp / LAND_REF) * 3.0, 1.0, 7));
    const gi = groundInfo((b.rear.x + b.front.x) / 2);
    if (gi.y !== Infinity) {
      emitParticles((b.rear.x + b.front.x) / 2, gi.y - 2, 8, {
        color: "#c4a882", spd: 1.6, life: 20, size: 3, grav: 0.03,
      });
    }
    settleLanding();
  }

  // ---------------- 悬挂弹簧（画面下沉） ----------------
  b.squash += b.squashVel;
  b.squashVel -= b.squash * 0.15;
  b.squashVel *= 0.84;
  if (Math.abs(b.squash) < 0.05 && Math.abs(b.squashVel) < 0.05) {
    b.squash = 0;
    b.squashVel = 0;
  }

  // ---------------- 引擎刹车（受抓地影响；下坡滑行不制动） ----------------
  if (!aDrive && !aBrake && b.grounded > 0 && groundInfo(b.front.x).m <= 0.03) {
    const dec = 0.024 * P.TRACTION;
    b.rear.px += (b.rear.x - b.rear.px) * dec;
    b.front.px += (b.front.x - b.front.px) * dec;
    b.head.px += (b.head.x - b.head.px) * dec;
  }

  // ---------------- 竖向速度安全上限 ----------------
  const cvy = (b.front.y - b.front.py) * SUBV;
  if (Math.abs(cvy) > VSPD_CAP) {
    const lim = VSPD_CAP * Math.sign(cvy);
    b.front.py = b.front.y - lim * SUB_DT;
    b.rear.py = b.rear.y - lim * SUB_DT;
    b.head.py = b.head.y - lim * SUB_DT;
  }

  // ---------------- 速度上限：平路 MAXV，下坡允许超速到 DOWNHILL_K×MAXV ----------------
  let vh = (b.front.x - b.front.px) * SUBV;
  const gmG = groundInfo(b.front.x);
  const hasGround = gmG.y !== Infinity;
  if (hasGround && gmG.m < 0) {
    // 上坡降速：坡度越陡，可维持的车速上限越低（功率恒定，爬坡必然掉速）
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
  // 车轮视觉转速：ω = v / R（再乘 0.06 做视觉降速，避免高速糊成一片）
  const TWO_PI = Math.PI * 2;
  b.wheelRear = (b.wheelRear + (((b.rear.x - b.rear.px) * SUBV) / WHEEL_R) * 0.06) % TWO_PI;
  b.wheelFront = (b.wheelFront + (((b.front.x - b.front.px) * SUBV) / WHEEL_R) * 0.06) % TWO_PI;
  if (b.stunned > 0) b.stunned -= DT;
}
