// ============================================================
//  标度与物理常量 —— 唯一事实来源
//  规则：所有 px / m / px·s⁻¹ / km·h⁻¹ / 子步↔真实速度 的换算
//        只允许在这里定义，其它模块一律从这里 import。
//        （历史上散落各处的 *SUB / *SUBV 裸换算就是缺陷根源）
// ============================================================

/** 固定物理步长（秒） */
export const DT = 1 / 60;
/** 每个物理步的子步数 */
export const SUB = 6;
/** 子步时长（秒） */
export const SUB_DT = DT / SUB;
/** 子步位移 → 真实速度(px/s) 的换算系数：v = (x - x.px) * SUBV */
export const SUBV = 1 / SUB_DT;

/** 车身几何（px） */
export const WHEEL_R = 12;
export const WHEELBASE = 38;
export const SEAT_H = 26;

// ---------------- 世界标度：100px = 1m ----------------
export const PX_PER_M = 100;
/** px → 米 */
export const toM = (px) => px / PX_PER_M;
/** px/s → km/h */
export const toKmh = (pxs) => (pxs / PX_PER_M) * 3.6;
/** km/h → px/s（成就阈值等反向换算） */
export const kmhToPxs = (kmh) => (kmh / 3.6) * PX_PER_M;

// ---------------- 手感缩放（用户反馈"走得太快"后整体降速） ----------------
/** 极速降为原来的 2/3 */
export const SPD_K = 2 / 3;
/**
 * 平路参考极速公式的基准（半标度）与原始上限。
 * ★ 只用于 REF_SPEED（危险段限速 / AI 巡航基准 / 成就阈值），**不再**用于 MAXV。
 *   MAXV 现在是"真实可达极速"，由 topSpeedOf 解算得到（见下）——两者用途不同，别混用。
 */
export const MAXV_RAW_CAP = 350;
export const MAXV_BASE = 130;

/**
 * 平路基准极速（0 升级、spd=1）真实 px/s —— 油耗模型反推、AI 基准都用它。
 * 这是"半标度 → 真实 px/s"的一个合法出口，其它地方禁止再写裸 *SUB。
 * ★ 第 3 期后它只是**标定参考**：真实极速由"扭矩曲线 × 传动 − 空气阻力"平衡自然产生，
 *   不再有任何直接改写速度的钳制。
 */
export const REF_SPEED = MAXV_BASE * SUB * SPD_K;

// ============================================================
//  升级旋钮（每级线性，全部以 MAX_LV=100 为满级口径）
//
//  ★ 这里修的是一个根因：**引擎升级过去只抬扭矩峰值、不抬扭矩曲线的转速上限**。
//    torqueAt 在 ω > w0×3.2 归零，而 w0 = TORQUE_RPM_BASE × veh.rpm **与升级无关**，
//    于是"引擎 Lv100"在直线上的实际极速被死死钉在 691px/s（18×1×3.2×12），
//    实测 Lv0→Lv100 只快 15%~32%，花 28250 金币换来一点抖动和翻车。
//    现在引擎同时抬"峰值"和"转速域"，极速才真的涨。
// ============================================================
/** 引擎：每级提升扭矩峰值 */
export const ENGINE_TORQUE_UP = 0.010;
/** 引擎：每级拓宽扭矩曲线的转速域（= 提高红线，Lv100 约 ×2.8） */
export const ENGINE_RPM_UP = 0.018;
/** 轮胎：每级顺带提升扭矩（抓地才是硬上限，扭矩堆太多只会空转翻车） */
export const TIRE_TORQUE_UP = 0.006;
/** 轮胎：每级提升摩擦系数 μ（+0.6%/级，audit-physics 有精确断言锁定） */
export const FRICTION_TIRE_UP = 0.006;

/**
 * 究极终局车「绝对形态」的标称极速（km/h）。
 * ★ 350 km/h = 9722 px/s，已超过旧的 NUM_CAP_V 6000 —— 数值兜底上界因此被一并抬高，
 *   否则这台车一冲起来就会把"兜底从未触发"那条断言顶穿（兜底不是性能保护，是最后一道防线）。
 */
export const ABSOLUT_KMH = 350;
/** 究极终局车的目标极速（px/s） */
export const ABSOLUT_V = (ABSOLUT_KMH / 3.6) * PX_PER_M;
/**
 * 该形态下的空气阻力系数（绝对值，不是在默认阻力上乘倍率）。
 *
 * ★ 标定方式：让「附加推力上限」恰好等于 350 km/h 处的风阻减速，
 *   极速因此是一个**稳定平衡点**（维持得住），而不是"冲一下就掉速"。
 *   默认阻力（0.0026）在 9722 px/s 处减速约 7.8 万 px/s²，任何驱动力都顶不住；
 *   要到 350 km/h，这个阻力必须**调小**（这正是空气阻力 ∝ v² 的物理结果）。
 *   算式：k = (μ·mTot·g·REAR_LOAD) / mTot / v²，取奇点号的 μ·mTot 得 1.3e-4。
 */
export const ABSOLUT_DRAG_K = 0.00013;
/**
 * 附加推力上限 = 该系数 × 可用抓地力（μ·mTot·g·REAR_LOAD）。
 *
 * ★ 按**可用抓地**成比例（而不是一个写死的常数）是关键：
 *   冰面 μ 是绿野的 0.62 倍 → 推力也只有 62% → 冰面极速仍然更低。
 *   写死常数会把"场景抓地缩放"这条不变式废掉（实测 μ_冰/μ_绿 变成 1.000）。
 */
export const ABSOLUT_THRUST_K = 1.0;
/** 附加推力的响应速度（/s）：越小越"瞬时"，越大越像渐进加速 */
export const ABSOLUT_SERVO_ACC = 1.2;

/** 重力基准（平路参考极速的解算基准；场景主题各自另有 g） */
export const GRAV_BASE = 750;
/** 后轮承担的垂直载荷比例：只有后轮被驱动，摩擦上限按后轮那份算 */
export const REAR_LOAD = 0.62;
/**
 * 驱动扭矩的翘头限幅系数：τ 上限 = mTot·g·WHEELBASE/2 × WHEELIE_K。
 *
 * 驱动扭矩经悬挂把车架向后掀，而重力绕后接地点的恢复力矩只有 mTot·g·WHEELBASE/2。
 * 系数取 1 时"刚过恢复力矩就翻"，对轻车过于苛刻：光子摩托满级被限到表盘的 29%。
 * 取 2.0 相当于真车要翘到 ~65° 才极限 —— 既留住"大扭矩会翘头"的物理直觉，
 * 又不至于把高速车限死。
 *
 * ★ 这个常量被**两处**消费：physics/bike.js 的实际限幅、topSpeedOf 的极速解算。
 *   两处各算一份的话，表盘会按未限幅扭矩标定而实车被限死（指针永远走不满）。
 */
export const WHEELIE_K = 2.0;
/** 由车辆质量与重力算出驱动扭矩的翘头上限（与 physics/bike.js 引用同一常量） */
export const wheelieTauOf = (mTot, GRAV) => mTot * GRAV * WHEELBASE * 0.5 * WHEELIE_K;
/** 真实可达极速的二分搜索上界（px/s），只作数值安全兜底 */
export const TOP_SPEED_CAP = 12000;

/**
 * 平路上**真实可达的极速**（px/s）——驱动能力与阻力的交点。
 *
 * 可用推力 avail(v) = min( τ(v/R)/R , μ·mTot·g·REAR_LOAD )
 * 阻力     loss(v) = AIR_DRAG_K·v² + ROLL_RES_K·mTot·g
 * avail 随 v 单调不增（扭矩曲线衰减 + 抓地上限），loss 随 v 单调增 ⇒ 交点唯一，
 * 二分即可，无需迭代收敛。返回的是"真能跑到的速度"，不是手填的标称值。
 *
 * ★ 为什么必须解算而不是写公式：MAXV 是 HUD 表盘满量程、相机前推量、倒挡目标速的
 *   共同基准。过去它由 `MAXV_BASE + 2.5·engine + 1.5·tire` 算出，满级涨 2.7 倍，
 *   而**真实极速只涨 32%** —— 于是升级后表盘指针反而越走越低（Lv25 就顶格），
 *   相机也不再前推，玩家自然觉得"升级没感觉"。现在表盘满量程 = 真能跑到的速度，
 *   每升一级指针都会多走一格，升级立刻可见。
 */
export function topSpeedOf(veh, up) {
  const p = (veh && veh.phys) || {};
  const u = up || {};
  const eng = u.engine || 0;
  const tire = u.tire || 0;
  const k = p.mass || (veh && veh.wgt) || 1;
  const mTot = (M_TOT + 2 * M_W) * k;
  const peak = TORQUE_PEAK_BASE * (p.torque || 1) *
    (1 + ENGINE_TORQUE_UP * eng + TIRE_TORQUE_UP * tire);
  const rpmK = 1 + ENGINE_RPM_UP * eng;
  const mu = FRICTION_BASE * ((veh && veh.grp) || 1) * (1 + FRICTION_TIRE_UP * tire);
  const grip = mu * mTot * GRAV_BASE * REAR_LOAD;
  const roll = ROLL_RES_K * mTot * GRAV_BASE;
  // ★ 限幅必须计入：驱动扭矩一旦越过 wheelieTau，多出来的部分只会把车掀翻而不是加速。
  //   漏掉它，表盘就按"无限扭矩"标定，而实车被限死 —— 满级高速档的指针只走 30%~65%。
  const tauCap = wheelieTauOf(mTot, GRAV_BASE);
  const avail = (v) => Math.min(Math.min(torqueAt(veh, v / WHEEL_R, 1, peak, rpmK), tauCap) / WHEEL_R, grip);
  const loss = (v) => AIR_DRAG_K * v * v + roll;
  let lo = 0;
  let hi = TOP_SPEED_CAP;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) * 0.5;
    if (avail(mid) > loss(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * 由"车辆数据 + 升级等级"推导驾驶参数（扭矩峰值 / 刹车峰值 / 极速 / 扭矩转速域 / 容差）。
 * ★ 所有半标度 → 真实 px/s 的换算只允许在这里发生（保持标度唯一事实来源）。
 */
export function deriveHandling(veh, up) {
  const u = up || {};
  const p = veh.phys || {};
  return {
    /** 发动机扭矩峰值（游戏单位）：升级与车辆扭矩曲线共同决定 */
    torquePeak: TORQUE_PEAK_BASE * (p.torque || 1) *
      (1 + ENGINE_TORQUE_UP * (u.engine || 0) + TIRE_TORQUE_UP * (u.tire || 0)),
    /** 刹车扭矩峰值 */
    brakePeak: BRAKE_TORQUE_BASE * veh.grp * (1 + 0.016 * (u.tire || 0) + 0.010 * (u.frame || 0)),
    /**
     * 扭矩曲线的转速域倍率：引擎等级抬高红线（Lv100 ≈ ×2.8）。
     * 这才是"引擎升级真的变快"的来源 —— 峰值扭矩在平坦路面早就撞上抓地上限了。
     */
    rpmK: 1 + ENGINE_RPM_UP * (u.engine || 0),
    /** 参考极速（HUD 表盘满量程 / 相机前推 / 倒挡目标速）：**平路真实可达极速** */
    MAXV: topSpeedOf(veh, up),
    // 倒立摔车判定的容差基准（越大越抗摔）：由车架升级 + 车重推导。
    // 0 级（up.frame=0, veh.wgt=1）≈ 4，满级（up.frame=100）≈ 14。
    crashMargin: Math.min(14, 2 + 0.1 * (u.frame || 0) + veh.wgt * 2),
    fuelMax: veh.tank * (1 + 0.004 * (u.frame || 0)),
  };
}

// ---------------- 空中姿态控制（骑手摆身） ----------------
// 定标依据：滞空 0.9s 全程按键，累计转角 ≥ 2π（完成一圈空翻）
//   θ(T) = ½·A·T²（角冲量持续施加，角速度上限 W），T=0.9, A=40 → 16 rad ≥ 2π
// 松键后角速度**保持**（Task 7：角动量守恒，不做人为衰减），落地由地面吸收。
export const AIR_ROT_MAX = 9.5;
export const AIR_ROT_ACC = 40;
// ---------------- 刚体质量与几何 ----------------
export const M_R = 1.0;
export const M_F = 1.0;
export const M_H = 0.7;
export const M_TOT = M_R + M_F + M_H;
/** 骑手重量把质心抬到轮轴线之上，这是翘头/栽头的物理根源 */
export const COM_UP = (M_H * SEAT_H) / M_TOT;
export const I_BODY =
  (M_R + M_F) * ((WHEELBASE * WHEELBASE) / 4 + COM_UP * COM_UP) +
  M_H * (SEAT_H - COM_UP) * (SEAT_H - COM_UP);
/** 单轮（相对）质量：车轮是独立刚体，由悬挂弹簧连到车架 */
export const M_W = 0.22;

// ---------------- 刚体 / 悬挂 / 摩擦 / 扭矩（第 3 期 Task 1.1 / 1.3） ----------------
// 全部物理常量集中在这一个文件；标度换算也只允许在这里发生。

/** 约束求解：残差收敛阈值（px）与迭代上限（收敛判据驱动，不是写死 6 次） */
export const SOLVER_TOL = 0.05;
export const SOLVER_ITERS = 8;
/** 法向力上限系数：Fn ≤ K × mTot × g（轮胎不可能无上限地推，防止深穿透爆冲） */
export const FN_MAX_K = 40;
/** 单侧接触的允许压入深度（px） */
export const PEN_TOL = 2;
/**
 * 骑手身体（头）的碰撞半径（px）。倒立 / 前翻时骑手身体会**真的撑在地面上**，
 * 不再穿地坠出地图；因此"身体的碰撞"与"车架等级的抗摔容差"共同决定倒立摔车。
 */
export const HEAD_R = 18;
/**
 * 数值异常兜底速度上限（px/s）。**只用于数值异常**（NaN 前兆 / 极端穿透），
 * 正常游玩与全部测试中都不应触发；tools/autotest.mjs 有断言守护"从未触发"。
 * 它替代了旧模型里 VSPD_CAP / DOWNHILL_K / MAXV 那种"每帧改写速度"的硬夹断。
 *
 * ★ 为什么是 20000 而不是当初的 6000：究极终局车满级跑 350 km/h 时，
 *   一个物理帧（DT=1/60）要走 9722/60 = **162px**，相当于 4.3 个轴距 ——
 *   车轮在两次接触采样之间直接跨过了整段地形，实测穿透峰值 14.6px（容差只有 2px），
 *   接触解算因此会注入巨大的冲量，单质点速度瞬时冲到 12000 以上。
 *   这是 **60Hz 固定步长在超高速下的分辨率极限**（不是数值发散：全程无 NaN、
 *   穿透有界、刚体残差达标）。兜底上界必须留出这一段瞬态余量，
 *   否则"兜底从未触发"会被高速车正常行驶误伤 —— 而那正是它要守护的东西。
 */
export const NUM_CAP_V = 20000;

/** 轮上扭矩峰值基准（游戏单位 px·px/s²） */
export const TORQUE_PEAK_BASE = 18000;
/** 扭矩峰值转速基准（车轮角速度 rad/s） */
export const TORQUE_RPM_BASE = 18;
/** 扭矩衰减区间：ω > rpm×LO 后线性衰减，ω = rpm×HI 归零 */
export const TORQUE_FADE_LO = 1.6;
export const TORQUE_FADE_HI = 3.2;
/** 车轮转动惯量：I = K · ½ m R²（实心圆盘近似） */
export const WHEEL_I_K = 1.0;
export const wheelInertia = (mW) => WHEEL_I_K * 0.5 * mW * WHEEL_R * WHEEL_R;

/** 悬挂：刚度 / 阻尼 / 行程基准（由车辆 + 减震升级缩放） */
export const SUSP_K_BASE = 780;
export const SUSP_C_BASE = 70;
export const SUSP_TRAVEL_BASE = 16;
/** 可伸张（droop）行程占行程上限的比例：防止轮子无限下垂 */
export const SUSP_EXT_K = 0.55;
/** 减震升级：每级 +2% 刚度 / +3% 阻尼 / +0.08px 行程 */
export const SUSP_K_UP = 0.02;
export const SUSP_C_UP = 0.03;
export const SUSP_TRAVEL_UP = 0.08;

/** 摩擦：基准摩擦系数（× 场景 traction × 车辆 grp × 轮胎升级） */
export const FRICTION_BASE = 1.15;

/** 刹车扭矩基准（远大于驱动扭矩：刹车本来就比加速猛） */
export const BRAKE_TORQUE_BASE = 12000;

/**
 * 抗摔等级（crashMargin）→ 车架要翻过多大角度才判摔（度）。
 * ★ 单一事实来源：physics/bike.js 的摔车判定与 ui/shop.js 的升级预览都读它，
 *   两处各写一份的话，商店显示的"抗摔 99°→100°"会和实际判定脱节。
 */
export const crashTiltDeg = (crashMargin) =>
  Math.min(0.7 * 180, (0.55 + (crashMargin - 4) * 0.014) * 180);

/** 空气阻力系数（∝ v²）与滚动阻力系数（∝ 法向力）：极速的"自然上限" */
export const AIR_DRAG_K = 0.0026;
export const ROLL_RES_K = 0.02;
/** 接触位置修正系数（Baumgarte）：把侵入速度按比例补回，避免穿透累积 */
export const CONTACT_BIAS = 0.25;
/**
 * 位置修正速度上限（px/s）。没有它时，修正速度 ∝ 侵入深度会随深度无界增长：
 * 掉进深坑（局部地面远在上方）时会在一个子步内注入上千 px/s，逼出数值兜底。
 * 上限取 ≈0.77×REF_SPEED：正常行驶（侵入 ≤ 数 px）完全不受影响。
 */
export const BIAS_MAX_V = 400;
/** 单侧接触的"接触带"（px，沿法线）：在此范围内仍算接触，用于腾空判定 */
export const CONTACT_BAND = 2;

const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 由车辆数据推导刚体（车架三质点的质量 / 质心高度 / 转动惯量，加上单轮质量）。
 * ★ 真实引用 M_R / M_F / M_H / M_TOT / COM_UP / I_BODY（不再是死代码）：
 *   车架 = 后轴 / 前轴 / 骑手三质点，车轮是独立刚体（由悬挂弹簧连到车架），
 *   车辆差异（质量、惯量）因此真正进入求解器。
 */
export function deriveRigidBody(veh) {
  const p = (veh && veh.phys) || {};
  const k = p.mass || (veh && veh.wgt) || 1;
  const inertia = p.inertia || 1;
  return {
    k,
    mCh: M_TOT * k, // 车架质量（= mR + mF + mH）
    mW: M_W * k, // 单轮质量
    mTot: M_TOT * k + 2 * M_W * k, // 整车质量（车架 + 两轮）
    mR: M_R * k,
    mF: M_F * k,
    mH: M_H * k,
    comUp: COM_UP,
    iBody: I_BODY * k * inertia,
  };
}

/** 由车辆 + 减震升级推导悬挂（刚度 / 阻尼 / 行程上限 / 可伸张行程） */
export function deriveSuspension(veh, up) {
  const p = (veh && veh.phys) || {};
  const s = (up && up.susp) || 0;
  const travel = (p.travel || SUSP_TRAVEL_BASE) + SUSP_TRAVEL_UP * s;
  return {
    k: SUSP_K_BASE * (p.suspK || 1) * (1 + SUSP_K_UP * s),
    c: SUSP_C_BASE * (p.suspC || 1) * (1 + SUSP_C_UP * s),
    travel,
    ext: travel * SUSP_EXT_K,
  };
}

/** 由场景抓地 + 车辆 + 轮胎升级推导摩擦系数 μ */
export function deriveFriction(traction, veh, up) {
  const t = (up && up.tire) || 0;
  return FRICTION_BASE * (traction || 1) * ((veh && veh.grp) || 1) * (1 + FRICTION_TIRE_UP * t);
}

/**
 * 轮上扭矩曲线：ω 超过峰值转速后线性衰减（高转没劲），throttle 为 0~1。
 * peak 由 deriveHandling 给出（含车辆扭矩与发动机升级），未给出时回退到车辆基准。
 */
export function torqueAt(veh, omega, throttle, peak, rpmK) {
  const p = (veh && veh.phys) || {};
  const P = peak || TORQUE_PEAK_BASE * (p.torque || 1);
  const w0 = TORQUE_RPM_BASE * (p.rpm || 1) * (rpmK || 1);
  const w = Math.abs(omega || 0);
  let f = 1;
  if (w > w0 * TORQUE_FADE_LO) {
    f = c01(1 - (w - w0 * TORQUE_FADE_LO) / (w0 * (TORQUE_FADE_HI - TORQUE_FADE_LO)));
  }
  return P * f * c01(throttle || 0);
}

// ---------------- 落地反馈与视觉特效阈值（一律真实 px/s） ----------------
/** 落地冲击归一化基准：竖向速度达到此值 = 压到底 */
export const LAND_REF = 520;
/** 骑尘 / 高速扬尘的启动速度 */
export const DUST_V = 150;
export const DUST_HEAVY_V = 320;
/** 速度线的启动速度与强度归一化基准 */
export const SPEEDLINE_V = 260;
export const SPEEDLINE_REF = 560;

/** 摔车昏迷时长（秒） */
export const STUN_TIME = 1.1;

// ---------------- 倒挡 ----------------
/** 挂入倒挡的速度门槛（px/s）：↓ 在此之上先当刹车用，停稳后才挂挡（避免高速硬挂） */
export const REV_ENTER_V = 24;
/** 倒车极速（占 MAXV 的比例）：自行车倒着推不快，够用即可 */
export const REV_SPEED = 0.3;
/** 出生点 x */
export const START_X = 40;

// ---------------- 机制标度：危险段 / 限时门 / 摔车惩罚 ----------------
/**
 * 危险段允许的最大速度（px/s）：随关卡难度收紧（ramp 0→1 时 0.95→0.75 倍基准极速）。
 * 车身中点进入危险段时超此速度必摔，玩家须提前减速。
 */
export const hazardSpeed = (ramp) => REF_SPEED * (0.95 - 0.2 * ramp);
/**
 * 限时门要求均速（px/s）：直接由本关三星要求（den3）派生并放宽 20%，
 * 保证"能卡三星的节奏"绝不会被计时门卡死，只有摔车/磨蹭才会超时。
 */
export const gateSpeed = (den3) => den3 * 0.8;
/** 摔车惩罚：燃料损失（占油箱比例） */
export const CRASH_FUEL_LOSS = 0.08;
/** 摔车惩罚：本关计时增加（秒） */
export const CRASH_TIME_PENALTY = 2;

// ---------------- 跳台（跳台变体专用，确定性滞空源） ----------------
/**
 * 跳台抬升速度（px/s）：一次性施加给整车的向上速度冲量。
 * 滞空 ≈ 2v/g = 2×250/750 ≈ 0.67s（与 KICK_TARGET 对应）。
 */
export const KICK_V = 250;
/** 触发跳台所需的最低车速（px/s）：太慢只是骑过去 */
export const KICK_MIN_V = 220;
/** 每个跳台的达标滞空（秒）：目标线 = 跳台数 × 该值 */
export const KICK_TARGET = 0.62;

// ---------------- 升级 ----------------
export const MAX_LV = 100;
/**
 * 升到第 lv 级所需金币。
 *
 * ★ 旧曲线 `30 + 5·lv` 全满一项要 28250 金币（四项 113000）——按每关 200~300 金币的
 *   收入，全满要重打四百多关，而"引擎"这项升满实测只快 32%。投入产出比低到没有体感。
 *   现在压到约 7000/项（四项 28000），一次完整通关 + 少量重刷就能把一台车推满。
 */
export const upCost = (lv) => Math.round(10 + 1.2 * lv);
/**
 * 某辆车升到第 lv 级的实际花费 = upCost(lv) × 该车的 costK（缺省 1）。
 *
 * ★ 为什么是"乘在基准曲线上"而不是另写一条曲线：基准曲线一旦改动，
 *   全部档位的价格会同步跟着动，不会出现"某档还按老价卖"的漂移。
 *   目前只有究极终局车 costK=40（四项满级 1,129,600，是普通档的 40 倍）；
 *   后续 5 档分级会把 costK 扩展成完整的档位倍率表（spec Task 2.1/2.2）。
 */
export const upCostOf = (veh, lv) => Math.round(upCost(lv) * ((veh && veh.costK) || 1));

/**
 * 油罐补给的油量（占油箱的比例）。
 *
 * ★ 唯一事实来源：world.js 用它反推"每关该放几个罐"，stats.js 用它实际加油。
 *   这两处以前各写死一份 0.45，改一处忘另一处就会出现"提示 +45% 却加了别的量"
 *   或者"油罐数量按 A 算、补给按 B 加"这种极难查的漂移。
 *
 * 为什么调大：每罐给得越多，达到同样续航所需的**罐数**就越少 —— 这是"让油罐更稀疏"
 * 而不牺牲可通关性的唯一手段（直接砍罐数会让人跑不完）。
 * 0.45 → 0.6 使罐数减少约 25%，而全程可获得油量不变。
 */
export const CAN_FUEL = 0.6;

// ---------------- 排位赛金币 ----------------
/**
 * 排位赛金币：胜利 = RANK_WIN_GOLD_BASE + rating × RANK_WIN_GOLD_K，失败 = RANK_LOSS_GOLD。
 * 胜利收益随段位分升高而升高，是"排位赛阶段也能把车升满"的收入来源。
 */
export const RANK_WIN_GOLD_BASE = 800;
export const RANK_WIN_GOLD_K = 0.5;
export const RANK_LOSS_GOLD = 150;
/** 排位赛金币（won 为胜负） */
export const rankGold = (won, rating) =>
  Math.round(won ? RANK_WIN_GOLD_BASE + Math.max(0, rating || 0) * RANK_WIN_GOLD_K : RANK_LOSS_GOLD);

// ---------------- 金币 ----------------
/** 金币安全上界（1e15）。超过它的余额一律夹回来。 */
export const GOLD_MAX = 1e15;
/**
 * 把任意值夹成合法的金币余额 ∈ [0, GOLD_MAX]。
 *
 * ★ 这道防线是必需的：金币一旦被写成非有限值，存档原文就变成
 *   "Infinity" / "NaN"，重载时解析失败并兜底为 **0** —— 玩家刷新页面即丢掉全部余额
 *   （这正是实测到的丢档 bug）。1e15 选得远低于 1e21，是因为再往上
 *   `String(v)` 会变成指数记数法 "1e+21"，那样连"读回来还是不是同一个数"都保证不了。
 */
export const safeGold = (v) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > GOLD_MAX ? GOLD_MAX : n;
};

// ---------------- 成就表 ----------------
export const ACHS = [
  { id: "air", name: "腾空初体验", icon: "🕊", desc: "单次腾空 0.8 秒以上" },
  { id: "flip", name: "空翻达人", icon: "🤸", desc: "完成一次空中翻转并安全落地" },
  { id: "combo3", name: "连招起步", icon: "🔥", desc: "空翻连招达到 x3" },
  { id: "coinall", name: "拾金不昧", icon: "💰", desc: "单关收集全部金币" },
  { id: "noc", name: "零失误", icon: "🛡", desc: "一局不摔车通关任意关卡" },
  { id: "fast", name: "风驰电掣", icon: "⚡", desc: "时速突破 30 km/h" },
  { id: "rich", name: "小康之家", icon: "🏦", desc: "累计金币达到 5000" },
  { id: "allstar", name: "三星王者", icon: "👑", desc: "全部关卡都拿到 3★" },
];

// ---------------- 存档键名（保持与历史版本一致，避免丢档） ----------------
export const SAVE_KEYS = {
  gold: "bike_gold",
  up: "bike_up",
  unlocked: "bike_unlocked",
  stars: "bike_stars",
  veh: "bike_veh",
  owned: "bike_owned",
  mute: "bike_mute",
  best: "bike_best",
  ach: "bike_ach",
  ver: "bike_v",
  // Task 9/10 新增：进度阶梯 / 段位分 / 累计统计（上面 10 个键名一律不动）
  prog: "bike_prog",
  rating: "bike_rating",
  stat: "bike_stat",
  // 特殊终极模式：各车是否已解锁（{ vehicleId: true }）
  ultra: "bike_ultra",
  // 当前关卡下标：此前只存在内存里，刷新页面后 HUD 与排位赛面板会谎报"第 1 关"
  sel: "bike_sel",
};

// ---------------- 进度阶梯阈值 ----------------
/** 高级排位赛准入段位分 */
export const RATING_ADVANCED = 1200;
/** 登顶段位分（登顶后无限模式可自由选图） */
export const RATING_PEAK = 2400;
/** 排位赛下限段位分（永不出现负数） */
export const RATING_MIN = 0;

// ---------------- 排位赛段位（Task 11） ----------------
/** 普通排位赛：胜 +25 / 负 20 */
export const RATING_WIN_GAIN = 25;
export const RATING_LOSS = 20;
/** 高级排位赛：胜 +40 / 负 30（收益与风险同步放大） */
export const RATING_WIN_GAIN_ADVANCED = 40;
export const RATING_LOSS_ADVANCED = 30;

/**
 * 段位表：按段位分升序，min 为进入该段位的门槛。
 * 覆盖 0 → 3000+ 全区间（RATING_PEAK = 2400 恰为"王者"门槛）。
 */
export const RANKS = [
  { min: 0, name: "青铜" },
  { min: 400, name: "白银" },
  { min: 800, name: "黄金" },
  { min: 1200, name: "铂金" },
  { min: 1600, name: "钻石" },
  { min: 2000, name: "星耀" },
  { min: 2400, name: "王者" },
  { min: 3000, name: "传奇" },
];

/** 段位分 → 段位名（纯函数：任意输入都返回非空段位名，负数/NaN 视为青铜） */
export function rankName(rating) {
  const r = Math.max(0, Number(rating) || 0);
  let name = RANKS[0].name;
  for (const k of RANKS) {
    if (r >= k.min) name = k.name;
    else break;
  }
  return name;
}

// ---------------- 存档导入/导出标识 ----------------
/** 存档文件标识（校验导入内容是否属于本游戏） */
export const SAVE_APP = "dale-bike";
/** 存档格式版本（当前只支持 1） */
export const SAVE_FORMAT = 1;
