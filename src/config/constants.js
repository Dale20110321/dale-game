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
// ---------------- 手感缩放（用户反馈"走得太快"后整体降速） ----------------
/** 极速降为原来的 2/3 */
export const SPD_K = 2 / 3;
/**
 * 平路参考极速公式的基准（半标度）。
 * ★ 只用于 REF_SPEED（危险段限速 / AI 巡航基准 / 成就阈值），**不再**用于 topSpeed。
 *   topSpeed 现在是"真实可达极速"，由 topSpeedOf 解算得到（见下）——两者用途不同，别混用。
 */
export const MAXV_BASE = 130;

/**
 * 平路基准极速（0 升级、spd=1）真实 px/s —— 油耗模型反推、AI 基准都用它。
 * 这是"半标度 → 真实 px/s"的一个合法出口，其它地方禁止再写裸 *SUB。
 * ★ 后它只是**标定参考**：真实极速由"扭矩曲线 × 传动 − 空气阻力"平衡自然产生，
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
/** 轮胎：每级提升摩擦系数 μ（+0.6%/级 —— 乘进 grip，地板与冰面按同一比例缩放） */
export const FRICTION_TIRE_UP = 0.006;

/**
 * 究极终局车「绝对形态」的标称极速（km/h）。
 * ★ 350 km/h = 9722 px/s，数值兜底上界 NUM_CAP_V 因此必须跟着抬高。
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

// ============================================================
//  「终焉形态」标定（究极终局车 · 1000 km/h · 常驻飞行）
//
//  ★ 这台车**从不接触地面**（见 physics/bike.js 的 flightStep），
//    所以 27,778 px/s 下"每帧走 12 个轴距"带来的穿透/采样问题在这里根本不存在 ——
//    没有接触求解器，也就没有隧道效应。代价是它必须自己维持高度与姿态。
// ============================================================
/** 终焉形态标称极速（km/h） */
export const OMEGA_KMH = 1000;
/** 目标极速（px/s）：27778 —— 已越过旧 NUM_CAP_V 20000 与 TOP_SPEED_CAP 12000，二者已一并抬高 */
export const OMEGA_V = (OMEGA_KMH / 3.6) * PX_PER_M;
/**
 * 该形态的风阻系数：按 L(v)=OMEGA_V 处的损耗反解，与 ABSOLUT_DRAG_K 同口径。
 *
 * ★ 与「绝对形态」的关键差别：这台车的推力不吃"接触摩擦"（轮胎不碰地），
 *   维持极速的推力由形态本身按可用抓地量级给出，再叠加与目标速度的偏差做比例修正。
 *   场景抓地缩放这条不变式仍然成立（低抓地场景推力下降）。
 */
export const OMEGA_DRAG_K = 0.000115;
/** 维持极速的基础推力 = 该系数 × 可用抓地量级（与 absolut 同口径，便于两台车对齐） */
export const OMEGA_THRUST_K = 1.0;
/** 推力对"与目标速度的偏差"的响应速度（/s）：决定从 0 爬到 1000 km/h 要多久 */
export const OMEGA_SERVO_ACC = 0.55;
/**
 * 推力上限 = 目标速度 × 本系数（即最快也在 4 秒内从 0 加速到目标速度）。
 *
 * ★ 这条是"宇宙级车能不能真跑到标称速度"的唯一决定项（两端各栽过一次）：
 *   1. 上限只取 μ·mTot·g·REAR_LOAD（轮胎抓地极限）时，风阻 ∝ v² 在 10 万 km/h
 *      上要 590 万 px/s² 的推力，是抓地上限的 36 倍 → 前馈被削光，平衡点落在
 *      标称速度之前，实测只能跑出 6749 km/h。
 *   2. 上限改取"维持目标速度所需的风阻"时同样失败：那是个**速度相关**的量，
 *      v=0 时全额施加会把车一步推到目标的 2.18 倍，下一步风阻再甩回去，
 *      形成两周期极限环（实测稳定在 73,275 km/h）。
 *   正比于目标速度的上限与速度量级无关，每步位移 ≤ 0.42% 目标 → 恒定收敛。
 */
export const OMEGA_ACC_FRAC = 0.25;

/**
 * 常驻飞行时的悬停高度（px，车轮底面离地表的高度）。
 *
 * ★ 固定高度而不是"跟着地形起伏"：飞车的卖点是**掠过**一切地形起伏，
 *   若高度跟着坡顶抬升，视觉上就退化成贴地跳坡，"一直在天上飞"这条卖点就没了。
 *   78px ≈ 6.5 个轮半径，既能清楚看出车在地面之上，
 *   又不会高到脱离地形轮廓、失去速度参照。
 */
export const FLIGHT_HOVER = 78;
/**
 * 悬停高度伺服的时间常数（/s）：越大越"稳"，越小越"跟手"。
 * 竖直方向要吃掉地形起伏（断层落差可达 145px），伺服太慢会一头扎进坡里。
 */
export const FLIGHT_HOVER_K = 9.0;
/**
 * 悬停目标高度的低通系数（/s）：把逐帧抖动的 restY 滤成一条平滑的飞行高度线。
 *
 * ★ 1000 km/h 下一帧横移 463px，而断层落差可达 145px ——
 *   直接逐帧追 restY 的话，目标高度每帧跳 ±145px，伺服必然追不上
 *   （实测离地间隙在 39~494px 之间乱晃，视觉上是抽搐而不是飞行）。
 *   18/s 对应约 55ms 的时间常数：足以抹平一帧之内的地形突变，
 *   又不至于把整段下坡拉成一条直线。
 */
export const FLIGHT_HOVER_LP = 18.0;
/** 悬停时车身俯仰跟随地表的系数（0~1）：0 = 始终水平，1 = 完全跟随地表倾角 */
export const FLIGHT_PITCH_K = 0.55;

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
/**
 * 翘头限幅的**逐车标定**：车辆固有抗翘头 `phys.wheelieK`（缺省 = 全局 WHEELIE_K）
 * + 随车架等级线性增长的 `phys.wheelieUp`。返回相对 WHEELIE_K 的**倍率**。
 *
 * ★ 为什么宇宙级车必须逐车标定：
 *   限幅 τ ≤ mTot·g·WHEELBASE/2·WHEELIE_K，而极速是它与 0.0026·v² 的交点。
 *   这条式子里**没有任何升级项**，于是星殒/坍缩/虚掷/终末/无相的 Lv0 与 Lv500
 *   裸车极速**完全相等**（69/70、63/63、58/58、83/83、54/54 km/h）—— 花五万倍的
 *   价钱买 500 级，裸车极速一点不涨；而 8 亿的归墟只有 74 km/h，和 3000 的玄铁
 *   （50 km/h）几乎一个水平。金币任务只发基础宇宙车的话，进了宇宙场就是垫底。
 *
 * ★ 设定上成立：宇宙级车的抓地来自**磁悬浮**而非轮胎接触，恢复力矩由悬浮系统
 *   提供，本就远大于"重力绕后接地点"的那一点。所以它们抗翘头能力天然更强。
 *
 * ★ 向后兼容：普通车 `phys.wheelieK` 未定义 → 倍率恒为 1，
 *   **27 台普通车的标定逐字节不变**。
 */
export function wheelieMulOf(veh, up) {
  const p = (veh && veh.phys) || {};
  const k0 = p.wheelieK || WHEELIE_K;
  const up0 = p.wheelieUp || 0;
  if (!up0) return k0 / WHEELIE_K;
  const full = maxLvOf(veh);
  const f = Math.max(0, Math.min(full, (up && up.frame) || 0));
  return (k0 + (up0 * f) / full) / WHEELIE_K;
}
export const wheelieTauOf = (mTot, gravity, kMul) =>
  mTot * gravity * WHEELBASE * 0.5 * WHEELIE_K * (kMul || 1);
/**
 * 真实可达极速的二分搜索上界（px/s），只作数值安全兜底。
 *
 * ★ 必须 ≥ 任何形态的目标极速，否则二分会在上界处提前收敛、
 *   把极速**静默截断**成一个假的平衡点（表盘与 HUD 一起说谎）。
 *   无相形态 100,000 km/h = 2,777,778 px/s，故上界抬到 4e7。
 */
export const TOP_SPEED_CAP = 4e7;

/**
 * 平路上**真实可达的极速**（px/s）——驱动能力与阻力的交点。
 *
 * 可用推力 avail(v) = min( τ(v/R)/R , μ·mTot·g·REAR_LOAD )
 * 阻力     loss(v) = AIR_DRAG_K·v² + ROLL_RES_K·mTot·g
 * avail 随 v 单调不增（扭矩曲线衰减 + 抓地上限），loss 随 v 单调增 ⇒ 交点唯一，
 * 二分即可，无需迭代收敛。返回的是"真能跑到的速度"，不是手填的标称值。
 *
 * ★ 为什么必须解算而不是写公式：topSpeed 是 HUD 表盘满量程、相机前推量、倒挡目标速的
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
  const k = p.mass || (veh && veh.weight) || 1;
  const mTot = (M_TOT + 2 * M_W) * k;
  const peak = TORQUE_PEAK_BASE * (p.torque || 1) *
    (1 + ENGINE_TORQUE_UP * eng + TIRE_TORQUE_UP * tire);
  const rpmK = 1 + ENGINE_RPM_UP * eng;
  const mu = FRICTION_BASE * ((veh && veh.grip) || 1) * (1 + FRICTION_TIRE_UP * tire);
  const grip = mu * mTot * GRAV_BASE * REAR_LOAD;
  const roll = ROLL_RES_K * mTot * GRAV_BASE;
  // ★ 限幅必须计入：驱动扭矩一旦越过 wheelieTau，多出来的部分只会把车掀翻而不是加速。
  //   漏掉它，表盘就按"无限扭矩"标定，而实车被限死 —— 满级高速档的指针只走 30%~65%。
  const tauCap = wheelieTauOf(mTot, GRAV_BASE, wheelieMulOf(veh, u));
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
    brakePeak: BRAKE_TORQUE_BASE * veh.grip * (1 + 0.016 * (u.tire || 0) + 0.010 * (u.frame || 0)),
    /**
     * 扭矩曲线的转速域倍率：引擎等级抬高红线（Lv100 ≈ ×2.8）。
     * 这才是"引擎升级真的变快"的来源 —— 峰值扭矩在平坦路面早就撞上抓地上限了。
     */
    rpmK: 1 + ENGINE_RPM_UP * (u.engine || 0),
    /** 参考极速（HUD 表盘满量程 / 相机前推 / 倒挡目标速）：**平路真实可达极速** */
    topSpeed: topSpeedOf(veh, up),
    // 倒立摔车判定的容差基准（越大越抗摔）：由车架升级 + 车重推导。
    // 0 级（up.frame=0, veh.weight=1）≈ 4，满级（up.frame=100）≈ 14。
    crashMargin: Math.min(14, 2 + 0.1 * (u.frame || 0) + veh.weight * 2),
    fuelMax: veh.fuel * (1 + 0.004 * (u.frame || 0)),
  };
}

// ---------------- 空中姿态控制（骑手摆身） ----------------
// 定标依据：滞空 0.9s 全程按键，累计转角 ≥ 2π（完成一圈空翻）
//   θ(T) = ½·A·T²（角冲量持续施加，角速度上限 W），T=0.9, A=40 → 16 rad ≥ 2π
// 松键后角速度**保持**（角动量守恒，不做人为衰减），落地由地面吸收。
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

// ---------------- 刚体 / 悬挂 / 摩擦 / 扭矩 ----------------
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
 * 正常游玩中不该触发 —— 它是最后一道数值防线，不是性能保护。
 * 它替代了旧模型里 VSPD_CAP / DOWNHILL_K / topSpeed 那种"每帧改写速度"的硬夹断。
 *
 * ★ 为什么是 60000 而不是当初的 6000：究极终局车满级跑 350 km/h 时，
 *   一个物理帧（DT=1/60）要走 9722/60 = **162px**，相当于 4.3 个轴距 ——
 *   车轮在两次接触采样之间直接跨过了整段地形，实测穿透峰值 14.6px（容差只有 2px），
 *   接触解算因此会注入巨大的冲量，单质点速度瞬时冲到 12000 以上。
 *   这是 **60Hz 固定步长在超高速下的分辨率极限**（不是数值发散：全程无 NaN、
 *   穿透有界、刚体残差达标）。兜底上界必须留出这一段瞬态余量，
 *   否则"兜底从未触发"会被高速车正常行驶误伤 —— 而那正是它要守护的东西。
 *
 *   终焉形态（1000 km/h = 27778 px/s）把这条余量要求又推高了一档，
 *   故抬到 60000：它每帧走 463px，接触瞬态与竖直伺服瞬态都远超 350 km/h 那一档。
 *   无相形态 100,000 km/h = 2,777,778 px/s（每帧 46,296px = 1218 个轴距），
 *   故上界抬到 3e8。常态极速 27778 / 3e8 ≈ 0.0093，兜底不会成为性能保护。
 */
export const NUM_CAP_V = 3e8;

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

/** 摩擦：基准摩擦系数（× 场景 traction × 车辆 grip × 轮胎升级） */
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
/**
 * 线性阻力系数（/s）：减速度 = LINEAR_DRAG_K × v。
 *
 * ★ 为什么需要它：空气阻力 ∝ v²，低速段趋近于零，**只剩下恒定的滚动阻力
 *   （ROLL_RES_K·g = 15 px/s²）**。于是一条尾巴极长：
 *   实测驮马从 40 km/h 松油门，速度减半只要 1.1s（这部分本来就对），
 *   但**完全停稳要 13.6 秒、滑行 27 米**，玄铁更是 19.7 秒 / 49 米。
 *   真车在 40 km/h 松手，2~3 秒内就基本停住了。
 *   缺的正是一个与速度**线性**相关的阻力项（真实世界里滚动阻力本就 ∝ v）。
 *
 * ★ 为什么不能靠调大 ROLL_RES_K 代替：ROLL_RES_K 同时出现在 topSpeedOf 的
 *   loss(v) = AIR_DRAG_K·v² + ROLL_RES_K·mTot·g 里，调它会**压低全部车辆的极速**
 *   ——而极速解算是这个项目的单一事实来源（表盘满量程、车库展示都读它）。
 *   只加线性项、放在 applyDrag 内侧，则对极速解算零影响。
 *
 * 取值 2.2：真实求解器里的实测标定（不是解析估算）。扫掠 0.6→2.2 得到
 *   驮马停稳 8.7s→4.5s / 滑行 17m→8m，玄铁停稳 14.2s→7.7s / 35m→20m。
 *   2.2 同时落在 checklist 的两条目标（驮马 4~6s、玄铁 5~8s）之内。
 *   ★ 注意它比解析估算（0.6）大不少：真实求解器里轮胎滚动阻力经接触摩擦传到
 *   整车，比"直接给整车减速度"弱得多，所以需要更大的系数才能达到同样手感。
 */
export const LINEAR_DRAG_K = 2.2;
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
  const k = p.mass || (veh && veh.weight) || 1;
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
  return FRICTION_BASE * (traction || 1) * ((veh && veh.grip) || 1) * (1 + FRICTION_TIRE_UP * t);
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
/** 倒车极速（占 topSpeed 的比例）：自行车倒着推不快，够用即可 */
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
/**
 * 普通车的升级上限（历史沿用值，保留为全局默认）。
 * ★ 不要在别处直接用 MAX_LV 做"某车是否满级"的判断 ——
 *   宇宙级车是 500 级，必须按车取，见 maxLvOf。
 */
export const MAX_LV = 100;
/**
 * 某辆车的升级上限（纯函数，便于断言）。
 *
 * ★ 为什么需要 per-vehicle：宇宙级车 500 级 —— 全局常量表达不了"按车不同上限"，
 *   而把判断散落在各处各读一次 MAX_LV，迟早漏掉某一处（升级按钮还亮着但点不动）。
 *   缺省回落 MAX_LV，向后兼容既有 27 台车。
 * @param {object} veh 车辆定义（VEHICLES 的一项）
 * @returns {number} 该车的升级上限（普通车 100 / 宇宙级车 500）
 */
export const maxLvOf = (veh) => (veh && veh.maxLv) || MAX_LV;

/**
 * 该车在**指定等级**下的"形态极速"（px/s）—— 由裸车解算比归一化插值得到。
 *
 * ★ 为什么形态极速必须随等级变化（这是 spec 的 R2.2）：
 *   早期实现把 omega 的目标速度直接写死成 OMEGA_V，于是 Lv0 与 Lv100 都是 1000 km/h
 *   —— "500 级"这条成长线对极速完全没有意义，玩家升满级只是多花了 20 倍的钱。
 *   用户明确要求："所有车没有升到满级的状态，达不到这么快的速度"。
 *
 *   口径：r = (当前解算比 − Lv0解算比) / (满级解算比 − Lv0解算比)，摊到 0~1；
 *        形态极速 = 裸车满级极速 + (标称极速 − 裸车满级极速) × r。
 *   于是 Lv0 只有裸车水平，Lv100 才达标称值，中间平滑过渡。
 *
 * @param {object} veh 车辆定义
 * @param {object} up  升级等级 {engine,tire,frame,susp}
 * @param {number} nominal 该车形态的标称极速（px/s，如归墟 1000km/h = 27778）
 * @returns {number} 该等级下的形态极速（px/s）
 */
export function ultraCruiseOf(veh, up, nominal) {
  if (!veh) return 0;
  const u = up || {};
  const lv = (k) => u[k] || 0;
  const full = maxLvOf(veh);
  // ★ 权重取**等级比例**，不是"极速解算比"。
  //   旧写法 r = (nowTop − base) / (fullTop − base) 借了 topSpeedOf 的曲线形状，
  //   而那条曲线前段陡后段平（扭矩线性、极速却受转速域与 v² 阻力双重压制），
  //   结果归墟 Lv100 就吃掉 83% 权重 → 形态极速 828/1000，Lv250 直接顶格。
  //   那样 500 级里后面 250 级完全无效，"升满才到标称"这条需求直接落空。
  //   等级线性保证：Lv0 = 裸车、只有 Lv500 才恰好等于标称，中间每一级都吃得到。
  const prog = Math.max(0, Math.min(1, ((lv("engine") + lv("tire") + lv("frame") + lv("susp")) / 4) / full));
  const base = topSpeedOf(veh, { engine: 0, tire: 0, frame: 0, susp: 0 });
  return base + (nominal - base) * prog;
}

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
/**
 * 金币安全上界（1e24）。超过它的余额一律夹回来。
 *
 * ★ 为什么从 1e15 抬到 1e24：宇宙级资产（6 台车 + 满级 + 形态）合计 2.43e22，
 *   1e15 会把它们**全部**截断 —— 最贵的车变成永远买不起。
 *   余量 41 倍给玩家继续刷，离 1e308（double 上限）也还有 8 个数量级。
 */
export const GOLD_MAX = 1e24;
/**
 * 把任意值夹成合法的金币余额 ∈ [0, GOLD_MAX]。
 *
 * ★ 这道防线是必需的：金币一旦被写成非有限值，存档原文就变成
 *   "Infinity" / "NaN"，重载时解析失败并兜底为 **0** —— 玩家刷新页面即丢掉全部余额
 *   （这正是实测到的丢档 bug）。
 *
 * ★ 余额会远超 2^53（9.007e15），落盘因此**不能**用 String(v)：
 *   JS 在 ≥1e21 输出指数记数法 "1e+21"，任何按十进制读的路径都会解析错。
 *   真正的十进制序列化在 core/utils.js 的 toPlainDecimal（BigInt 展开）。
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
  // 新增：进度阶梯 / 段位分 / 累计统计（上面 10 个键名一律不动）
  prog: "bike_prog",
  rating: "bike_rating",
  stat: "bike_stat",
  // 特殊终极模式：各车是否已解锁（{ vehicleId: true }）
  ultra: "bike_ultra",
  // 当前关卡下标：此前只存在内存里，刷新页面后 HUD 与排位赛面板会谎报"第 1 关"
  sel: "bike_sel",
};

// ---------------- 排位赛段位 ----------------
/** 高级排位赛准入门槛：铂金段 */
export const RATING_ADVANCED = 1200;
/** 登顶段位分：达到「大师」段（rating ≥ 3300）即解锁无限模式自由选图 */
export const RATING_PEAK = 3300;
/** 段位表最高门槛（「超越」段）：AI 强度与段位奖励都以它为封顶基准 */
export const RATING_TOP = 12000;
/** 排位赛下限段位分（永不出现负数） */
export const RATING_MIN = 0;

/**
 * 单场段位分 = 基数 + 段位系数 × floor(rating / 1000)（见 rankDelta）。
 * ★ 为什么不是固定加减：段位越高对手越强，固定 +25 会让 3000 分之后每爬一级
 *   都要几十场。奖励随高度递增（0 分 +25 → 10000 分 +105），登顶大师约 150 场、
 *   刷满全表约 300 场 —— 这才是"一个阶段"该有的长度。
 */
export const RANK_GAIN_BASE = 25;        // 普通赛基数
export const RANK_GAIN_STEP = 8;         // 普通赛：每 1000 段位分 +8
export const RANK_GAIN_BASE_ADV = 40;    // 高级赛基数
export const RANK_GAIN_STEP_ADV = 12;    // 高级赛：每 1000 段位分 +12
/** 单场扣分恒定（不随高度增长）——高分段位一次失误不至于直接跌段 */
export const RATING_LOSS = 20;
export const RATING_LOSS_ADVANCED = 30;

/**
 * 段位表：14 段 × 3 星，覆盖 0 → 12000 全区间。
 *
 * ★ 为什么从 8 段扩到 14 段：原来 0→3000、封顶王者 2400，按高级赛 +40/场打到顶
 *   也就六十来场，一天就玩完了 —— 比赛阶段形同虚设。扩段之后：
 *     · 1200 铂金 → 解锁高级排位赛
 *     · 3300 大师 → 登顶，解锁无限模式自由选图（`RATING_PEAK`）
 *     · 12000 超越 → 段位表刷满，比赛阶段真正的"通关"
 *   每一段都有**看得见的一次性金币奖励**，刷起来是"在爬阶梯"而不是"重复同一件事"。
 *
 * 每段 3 星：★ = 进段，★★ = 段内过半，★★★ = 段内 85%（青铜恒为 0 星）。
 *   ★ 星数按**段内跨度**（下一段门槛 − 本段门槛）算，不按本段门槛的倍数算：
 *     门槛倍数口径在 14 段表里大多数段位根本够不到 3★（1.5× 门槛会先跨进下一段），
 *     等于把 3★ 设成不可达。跨度口径保证每一段的 3★ 都能拿到，"还差一格"始终可见。
 *
 * ★ 段位名**不得与车辆名重复**（「奇点」曾是段位名，也是一台车的名字，玩家会分不清）。
 * 升段奖励只在**首次向上跨过**该段门槛时发一次，降段再升回来不重复发。
 * 全表升段奖励合计 562,000 ≈ 闯关一轮（212 万）的 26%：够买一两台中高档车，
 * 但不会盖过主线。
 */
export const RANKS = [
  { min: 0, name: "青铜", reward: 0 },
  { min: 300, name: "白银", reward: 2000 },
  { min: 700, name: "黄金", reward: 4000 },
  { min: 1200, name: "铂金", reward: 7000 },
  { min: 1800, name: "钻石", reward: 11000 },
  { min: 2500, name: "星耀", reward: 16000 },
  { min: 3300, name: "大师", reward: 22000 },
  { min: 4200, name: "宗师", reward: 30000 },
  { min: 5200, name: "王者", reward: 40000 },
  { min: 6300, name: "星之巅", reward: 52000 },
  { min: 7500, name: "永恒", reward: 66000 },
  { min: 8800, name: "虚空", reward: 82000 },
  { min: 10200, name: "凌驾", reward: 100000 },
  { min: 12000, name: "超越", reward: 130000 },
];

/** 段位分 → 段位下标（纯函数；越界钳到表尾） */
export function rankIndexOf(rating) {
  const r = Math.max(0, Number(rating) || 0);
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) {
    if (r >= RANKS[k].min) i = k;
    else break;
  }
  return i;
}

/**
 * 某一段的"段内跨度"：下一段门槛 − 本段门槛。
 * 末段（超越）没有下一段，用自身的 1/5 当跨度，保证它的 3★ 同样可达。
 */
export function rankSpanOf(index) {
  const r = RANKS[index];
  if (!r) return 0;
  const nx = RANKS[index + 1];
  return nx ? nx.min - r.min : Math.max(1, Math.round(r.min * 0.2));
}

/**
 * 段位星数（0~3）：进段 1★ / 段内过半 2★ / 段内 85% 3★（青铜恒为 0 星）。
 * ★ 用**当前所在段位的跨度**来算，而不是本段门槛的倍数 —— 倍数口径在 14 段表里
 *   大多数段位根本到不了 3★（1.5× 门槛会先跨进下一段，星数被"吃掉"）。
 *   跨度口径保证每段的 3★ 都拿得到，升段后星数从 1★ 重新起算，"还差一格"始终可见。
 */
export function rankStars(rating) {
  const i = rankIndexOf(rating);
  const r = RANKS[i];
  if (!r || r.min <= 0) return 0;
  const span = rankSpanOf(i);
  const t = (Math.max(0, Number(rating) || 0) - r.min) / span;
  if (t >= 0.85) return 3;
  if (t >= 0.5) return 2;
  return 1;
}

/** 下一个段位（纯函数）；已封顶（「超越」）返回 null */
export function rankNextOf(rating) {
  const i = rankIndexOf(rating);
  return i + 1 < RANKS.length ? RANKS[i + 1] : null;
}

/**
 * 单场段位分增减（纯函数，便于测试）。
 * @param {number} rating 当前段位分
 * @param {boolean} advanced 是否高级赛
 * @param {boolean} won 是否获胜
 * @returns {number} 有符号增量
 */
export function rankDelta(rating, advanced, won) {
  if (!won) return -(advanced ? RATING_LOSS_ADVANCED : RATING_LOSS);
  const r = Math.max(0, Number(rating) || 0);
  const k = Math.floor(r / 1000);
  return advanced
    ? RANK_GAIN_BASE_ADV + RANK_GAIN_STEP_ADV * k
    : RANK_GAIN_BASE + RANK_GAIN_STEP * k;
}

/**
 * 升段一次性奖励：from → to 期间**新跨过、且此前从未领取过**的那些段位之和（纯函数，不写状态）。
 *
 * @param {number} from 本局开始前的段位分
 * @param {number} to 本局结束后的段位分
 * @param {number} [claimed] 历史已发到哪一档（progress.promoClaimed，只增不减）
 *
 * ★ 为什么必须带 claimed：只看 from → to 的话，"钻石掉回铂金、再赢回钻石"会二次发钱，
 *   等于奖励可以反复刷。claimed 是一条只涨的水位线，跨过的段位一旦结算就永久作废。
 *   老存档没有这个字段时按 0 处理，等于"之前都没领过"，下一次跨段会一次性补齐。
 */
export function rankPromoReward(from, to, claimed) {
  const a = Math.max(0, Number(from) || 0);
  const b = Math.max(0, Number(to) || 0);
  if (b <= a) return 0;
  const floorV = Math.max(a, Math.max(0, Number(claimed) || 0));
  if (b <= floorV) return 0;
  let sum = 0;
  for (const r of RANKS) if (r.min > floorV && r.min <= b) sum += r.reward || 0;
  return sum;
}

// ---------------- 比赛赛制（纯配置 / 纯函数） ----------------
/**
 * 三种赛制。`riders` = AI 人数（不含玩家），`team` = 是否团赛。
 *
 * ★ 为什么要分赛制：1V1 只有"赢 / 输"两个结果，打二十场和打一场的信息量一样；
 *   多人竞技按**名次**给奖，团赛按**两队累计里程**给奖 ——
 *   同一个终点线，玩法就从"比谁快"变成"怎么配合 / 怎么超车"，比赛阶段才立得住。
 */
export const RACE_FORMATS = {
  duel: {
    id: "duel", name: "1V1 竞速", icon: "⚔️", riders: 1, team: false,
    desc: "单挑一名对手，冲过终点即获胜",
  },
  melee: {
    id: "melee", name: "多人竞技", icon: "🏁", riders: 5, team: false,
    desc: "5 名对手同场，按最终名次发奖（第 1 名最多）",
  },
  relay: {
    id: "relay", name: "团队接力", icon: "🤝", riders: 5, team: true, teamSize: 3,
    desc: "3v3：你的队伍累计里程先到终点即获胜，两队都贡献了里程",
  },
};
/**
 * 名次奖金（第 1~6 名，px/s 无关，纯金币）。团赛按队伍名次取，1V1 只有第 1 / 第 2 两档。
 * ★ 第 6 名仍然给钱是刻意的：6 人场跑最后一名也有正反馈，
 *   否则玩家会觉得"多打 5 个人只是多了 5 次挫败"，不如一直刷 1V1。
 */
export const RACE_PLACE_GOLD = [600, 400, 300, 220, 160, 120];

/** 赛制列表（面板渲染顺序） */
export const RACE_FORMAT_IDS = ["duel", "melee", "relay"];

/** 团赛里玩家所在队伍编号；非团赛返回 -1 */
export const PLAYER_TEAM = 0;
/** 团赛的对手队伍编号 */
export const RIVAL_TEAM = 1;

/** AI 车手名（按名次固定分配，同一赛制每次开局的阵容一致，玩家能形成记忆点） */
const RIDER_NAMES = ["疾风", "铁砧", "青隼", "赤影", "磐岩", "游隼", "夜枭·二", "铜铃", "白鸦", "砂砾"];

/**
 * 建一整场比赛的对手（纯函数：不碰 store，便于测试）。
 * @param {string} format RACE_FORMATS 的键
 * @returns {{r:object[], team:number}} 对手数组与玩家队伍号
 */
export function buildRacers(format) {
  const f = RACE_FORMATS[format] || RACE_FORMATS.duel;
  const size = f.team ? f.teamSize : 0;
  const r = [];
  for (let i = 0; i < f.riders; i++) {
    r.push({
      name: RIDER_NAMES[i % RIDER_NAMES.length],
      // 错开起跑位置：6 个人挤在同一个点，开局就叠在一起看不出是多人场
      x: START_X - 120 - i * 190,
      spd: 0,
      finish: false,
      // ★ bias 是稳定的个体配速系数：同一名车手每局快慢一致，才谈得上"知己知彼"；
      //   用取模而不是 Math.random，是为了让阵容在同赛制下可复现（不然后台无法断言）。
      bias: 0.93 + (((i * 7 + 3) % 11) / 100),
      team: f.team ? (i < size - 1 ? PLAYER_TEAM : RIVAL_TEAM) : -1,
    });
  }
  return { r, team: f.team ? PLAYER_TEAM : -1 };
}

/**
 * 玩家名次（纯函数，render 与 game 共用）。
 * @param {object[]} list 本场 AI 列表
 * @param {number} playerX 玩家横坐标
 * @param {{team?:boolean, riders?:number, teamSize?:number}} fmt 当前赛制
 * @returns {number|number[]} 非团赛 = 个人名次（1 起）；团赛 = [队伍名次, 队内名次]
 */
export function racePlaceOf(list, playerX, fmt) {
  const f = fmt || RACE_FORMATS.duel;
  if (!f.team) {
    let p = 1;
    for (const a of list || []) if (a.x > playerX) p++;
    return p;
  }
  const ahead = (list || []).filter((a) => a.team === PLAYER_TEAM && a.x > playerX).length;
  const rivalAhead = (list || []).filter((a) => a.team === RIVAL_TEAM && a.x > playerX).length;
  return [ahead <= rivalAhead ? 1 : 2, ahead + 1];
}

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
