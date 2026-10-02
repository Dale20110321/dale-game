// ============================================================
//  物理：车架刚体 + 弹簧-阻尼悬挂 + 轮上动力学
//
//  模型（重做）：
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
  ROLL_RES_K, AIR_DRAG_K, LINEAR_DRAG_K, wheelInertia, torqueAt, topSpeedOf, crashTiltDeg,
  ABSOLUT_V, ABSOLUT_DRAG_K, ABSOLUT_THRUST_K, ABSOLUT_SERVO_ACC,
  OMEGA_V, OMEGA_DRAG_K, OMEGA_THRUST_K, OMEGA_SERVO_ACC,
  FLIGHT_HOVER, FLIGHT_HOVER_K, FLIGHT_HOVER_LP, FLIGHT_PITCH_K,
  REAR_LOAD, wheelieTauOf,
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
const CHASSIS = ["axleRear", "axleFront", "head"];

/**
 * 数值异常兜底（NUM_CAP_V）累计触发次数。**只增不减**，跨局累计，
 * 供测试断言"整个测试过程中兜底从未触发"（checklist"异常兜底从未触发"）。
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

/** 「极速模式」把 topSpeed 抬到基准极速的多少倍 */
const ULTRA_SPEED_N = 10;
/** 终极模式的扭矩转速域倍率 */
const ULTRA_RPM_N = 8;
/**
 * 「轨道炮」形态的扭矩峰值倍率。
 *
 * ★ 这个常量以前**根本没声明过** —— applyUpgrades 的 railgun 分支一直在引用一个
 *   不存在的名字，一进这个形态就抛 ReferenceError。被 startGame 的 try/catch 吞掉后
 *   只剩一句"⚠️ 出错了"，于是 4 辆挂 railgun 的车（磁暴 / 山魈 / 玄铁 / 破阵）
 *   一解锁或一切换就开不了局。补上声明之前它没有任何"原值"可保留，
 *   10 是按同量级的 ULTRA_SPEED_N 选的：扭矩与极速同倍率放大，
 *   才撑得起该形态把表盘钉在 10× 的设定。要调手感从这里下手。
 */
const ULTRA_TORQUE_N = 10;
/** 「跃迁」形态的持续推力：加速度（/s）与单子步速度上限 */
const WARP_ACC = 6.5;
const WARP_V_CAP = 90;

/**
 * 当前生效的特殊模式代号（未解锁返回空串）。
 *
 * ★ 模式的**效果**按 mode 分派，而不是到处写 `v.id === "xxx"`：
 *   每辆车的 ultra.mode 是一个稳定标识，物理层只认这一个字符串，
 *   以后加车只要在 vehicles.js 里挂一个 mode + 一组 fx，不用改物理层的任何 if。
 *
 * ★★ `mode` 只决定**效果种类**，`fx` 决定**这一辆有多猛** ——
 *   同一 mode 下的每辆车参数各不相同：¥3000 的银箭与 ¥30000 的猎户都是「极速」，
 *   但前者的红线只拉到 3.5 倍、后者 7 倍；前者风阻仍有 45%、后者压到 14%。
 *   这样"买哪辆车的形态"才真的是一次选择，而不是换个名字买同一件东西。
 *
 * 模式表（vehicles.js 里的 ultra.mode）：
 *   stable 贴地   —— 轮/轴钉在地表，永不腾空、摔车无效；换来的是抓地与极速（岩驼 → 终焉）
 *   surge  极速   —— 扭矩域拉满换极速，代价是抓地余量被吃掉（银箭 → 猎户）
 *   shield 护盾   —— 摔车免疫但保留全部腾空与操控，换来的是抓地（幽影 → 天蚀）
 *   phase  相位   —— 摔车免疫 + 燃料无限 + 危险段豁免，代价是脆（星轨 → 潮生）
 *   railgun 轨道炮 —— 扭矩与红线同时暴涨，最暴力的一档（磁暴 → 玄铁）
 *   warp   跃迁   —— 持续推力，逼近极速的速度按 accel/vCap 分档（蜂鸟 → 逐日）
 *   absolut 绝对  —— 350 km/h 稳定极速 + 摔车/燃料/危险段全免（奇点，免解锁）
 *   omega  终焉   —— 1000 km/h + **常驻飞行**（从不触地）+ 摔车/燃料/危险段全免（终焉号）
 */
export function activeMode(veh) {
  const v = veh || VEHICLES[store.currentVehicle];
  if (!v || !v.ultra || !v.ultra.mode) return "";
  // ★ `builtin` 的形态**免解锁**：究极终局车的"绝对形态"是这辆车自带的，
  //   不需要也不应该在车库花金币解锁。免的只是这一项特性 —— 四项升级仍照常花钱。
  if (v.ultra.builtin === true) return v.ultra.mode;
  return store.ultra[v.id] === true ? v.ultra.mode : "";
}

/**
 * 当前形态的**开关类**效果。哪些形态天生带哪些特权，只取决于 mode —— 与 fx 无关。
 *
 * ★ phase 的「燃料无限 + 危险段豁免」以前只是文案：drainFuel 与危险段判定
 *   都是无条件执行的，玩家为 ¥26000 买到的两个特权一个都没生效。
 *   现在把它们收敛到这里，由 physics/fuel.js 与 game/game.js 真正去读。
 */
const MODE_FLAGS = {
  stable:  { pinGround: true, noCrash: true },
  shield:  { noCrash: true },
  phase:   { noCrash: true, noFuel: true, noHazard: true },
  railgun: {},
  surge:   {},
  warp:    {},
  // ★ absolut **不加** pinGround：实测它约 14% 的时间在腾空，而这是**有意保留**的 ——
  //   玩家反馈"几乎一直飞在天上"，但同时也确认了它仍会被障碍顶起、落地要重新提速，
  //   也就是"能飞但飞不高、飞不久"。真正的常驻飞行是 omega 形态（见下）。
  absolut: { noCrash: true, noFuel: true, noHazard: true },
  // ★ omega 是唯一的 `fly` 形态：常驻飞行（见 flightStep），从不接触地面。
  omega:   { fly: true, noCrash: true, noFuel: true, noHazard: true },
};

/** 当前生效形态的效果开关（未解锁 / 无形态 → 全 false 的空对象） */
export function ultraFlags() {
  return MODE_FLAGS[activeMode()] || {};
}

/** 当前生效形态的**数值参数**（vehicles.js 里逐车手写；未解锁 → 空对象） */
export function ultraFx() {
  const v = VEHICLES[store.currentVehicle];
  const m = activeMode(v);
  if (!m || !v.ultra) return {};
  return v.ultra.fx || {};
}

/** 究极终局车「绝对形态」是否生效（免解锁，恒为真） */
export function isAbsolut() {
  return activeMode() === "absolut";
}

/** 当前车辆的专属特殊模式是否已解锁 */
export function isUltraActive() {
  return store.ultra[VEHICLES[store.currentVehicle].id] === true;
}

/** 「贴地模式」是否生效（stable：轮轴钉地，永不腾空） */
export function isUltraStable() {
  return ultraFlags().pinGround === true;
}

/**
 * 「常驻飞行」是否生效。
 *
 * ★ 两个来源：形态的 fly 开关（omega），或车辆自带的 `veh.hover`。
 *   归墟裸车也要飞 —— 它 μ=11 的抓地在地面上根本没法开（一踩油门就后空翻，
 *   实测满级只能跑 4.6 km/h）。它是飞行器，"落地模式"对它没有意义。
 *   hover 让它始终走 flightStep，形态只决定**飞多快**（裸车慢、终焉 1000）。
 */
export function isFlighter() {
  if (ultraFlags().fly === true) return true;
  const v = VEHICLES[store.currentVehicle];
  return !!(v && v.hover);
}

/** 是否处于"摔车免疫"形态（贴地 / 护盾 / 相位 / 绝对形态） */
export function isCrashImmune() {
  return ultraFlags().noCrash === true;
}

/** 燃料无限（相位 / 绝对形态）：physics/fuel.js 据此跳过消耗 */
export function hasInfiniteFuel() {
  return ultraFlags().noFuel === true;
}

/** 危险段限速豁免（相位 / 绝对形态）：game/game.js 据此跳过超速判定 */
export function ignoresHazardLimit() {
  return ultraFlags().noHazard === true;
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
    const A = wk === "rear" ? b.axleRear : b.axleFront;
    A.y = wheelY; A.py = wheelY; A._vy = 0;
  }
  const midY = (b.axleRear.y + b.axleFront.y) * 0.5;
  b.head.y = midY - SEAT_H;
  b.head.py = midY - SEAT_H;
  b.head._vy = 0;
}

/**
 * 「常驻飞行」推进：归墟号（omega 终焉形态 / 裸车 hover）。
 *
 * ★ 为什么完全不走 solveVelocityConstraints：
 *   1000 km/h = 27,778 px/s，一个物理帧走 463px = **12.2 个轴距**。
 *   接触求解器要求"两次采样之间轮子还在接触带内"，而这里每帧跨过 12 段地形，
 *   采样必然漏掉整个坡顶与坑底 —— 这是采样率低于地形特征频率的必然结果，
 *   调参修不好。这台车**根本不接触地面**，直接按运动学推进即可。
 *
 * 保留的物理：重力（由悬停伺服反向抵消）、水平推力伺服、空气阻力 ∝ v²、刹车与倒车。
 * 不成立的：悬挂、接触摩擦、翘头力矩、空中转体、摔车判定。
 *
 * ★ 前馈项是能不能真跑到标称极速的关键（绝对形态当年栽在这，标称 350 实测 285）：
 *   纯比例 `push = (V − v)·G` 在 v→V 时趋零，而 V 处风阻是有限正值，
 *   平衡点必然落在 V 之前。前馈恒等于目标速度处的风阻，使 V 成为稳定平衡点。
 */
function flightStep(P, dt, throttle, brk, rev) {
  const b = bike;
  const sv = systemVel(b);
  const vx = sv.vx;
  const base = P.baseTopSpeed || P.topSpeed;

  // ---- 水平：目标速度 = 前馈（维持极速所需推力） + 反馈（与目标的偏差） ----
  // 可用推力量级沿用 μ·mTot·g·REAR_LOAD 的标度，低抓地场景推力随之下降。
  const cap = P.mu * P.rb.mTot * P.gravity * REAR_LOAD * OMEGA_THRUST_K;
  // 终焉形态 1000 km/h；裸车悬停则回到这辆车平路可达的极速（torqueAt 解算值）
  const cruise = activeMode() === "omega" ? P.topSpeed : (P.baseTopSpeed || P.topSpeed);
  let target;
  if (rev) target = -base * REV_SPEED;
  else if (brk) target = 0;
  else if (throttle) target = cruise;
  else target = 0;
  const dragK = activeMode() === "omega" ? OMEGA_DRAG_K : P.airDragK;
  // 前馈 = 目标速度处的风阻减速，使 target 本身成为平衡点
  const ff = Math.min(cap, (dragK * target * target) / P.rb.mTot);
  // ★ 必须同时减掉**当前速度**下的风阻，前馈才有意义：
  //   net = (target − v)·G + ff − drag(v)。在 v = target 处 net = ff − drag(target) = 0，
  //   那才是平衡点。只加不减的话车会一路冲过 target 无限加速
  //   （漏了这一项时实测跑到 2300 km/h，是标称值的 2.3 倍）。
  const drag = (dragK * vx * Math.abs(vx)) / P.rb.mTot;
  const push = clamp((target - vx) * OMEGA_SERVO_ACC + ff - drag, -cap, cap);
  // 刹车：直接减速，不受前馈影响（否则松油门的滑行会被前馈顶住）
  const nextVx = brk
    ? clamp(vx - P.brakePeak * 0.6 * dt, -base * REV_SPEED, base * REV_SPEED)
    : vx + push * dt;

  // ---- 竖直：悬停伺服（抵消重力，保持固定离地高度）----
  const midX = (b.rear.x + b.front.x) * 0.5;
  const g = groundInfo(midX);
  const n = groundNormal(midX);
  // 目标轮心 y：沿地表法线抬升 FLIGHT_HOVER + WHEEL_R（n.y < 0 表示屏幕上方）
  const restY = (isFinite(g.y) ? g.y : b.rear.y) + n.y * (FLIGHT_HOVER + WHEEL_R);
  const curY = (b.rear.y + b.front.y) * 0.5;
  // ★ 那层低通是必需的：1000 km/h 下一帧横移 463px、断层落差可达 145px，
  //   逐帧直追 restY 时目标每帧跳 ±145px，离地间隙在 39~494px 乱晃（实测）。
  //   滤成一条平滑的"飞行高度线"再追，车才是掠过起伏而不是被弹来弹去。
  b.hoverY += (restY - b.hoverY) * Math.min(1, dt * FLIGHT_HOVER_LP);
  const vTarget = clamp((b.hoverY - curY) * FLIGHT_HOVER_K, -1600, 1600);
  const nextVy = clamp(sv.vy + ((vTarget - sv.vy) * FLIGHT_HOVER_K - P.gravity) * dt, -2400, 2400);

  // ---- 姿态：俯仰按 FLIGHT_PITCH_K 部分跟随地表倾角 ----
  // 全跟随会在每个坡顶大幅抬头（1000 km/h 下极晃），全水平又丢掉地速参照。
  // ★ 倾角 = atan2(n.x, −n.y)（groundNormal 给的是法线 (m,−1)/d）。
  //   早期版本多减了一个 π/2，平地被算成 −90°，车头死命低着（实测 −59°）。
  const surfAng = Math.atan2(n.x, -n.y);
  const curAng = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
  const dAng = wrapAngle(surfAng * FLIGHT_PITCH_K - curAng);
  rotateAroundMid(b, clamp(dAng, -0.08, 0.08));

  // ---- 写入速度并积分 ----
  // ★ px/py 必须同步：Verlet 用 (x − px)/sub 反推速度，只改 x 不改 px 等于清零。
  for (const p of b.pts) {
    p._vx = nextVx;
    p._vy = nextVy;
    p.px = p.x - nextVx * DT;
    p.py = p.y - nextVy * DT;
    p.x += nextVx * DT;
    p.y += nextVy * DT;
  }

  // ---- 车轮：按真实轮速积分（纯滚动，视觉用）----
  const w = nextVx / WHEEL_R;
  for (const wk of WHEELS) {
    b.wheelRot[wk] += (w - b.wheelRot[wk]) * Math.min(1, dt * 40);
  }
  b.grounded = 0;
}

/**
 * 绕车身质心旋转所有质点（只改相对位置，质心平动速度守恒）。
 *
 * ★ 与 airControl 里那段是同一件事：刚体旋转只改变"相对质心"的速度，
 *   若把质心速度一起旋转，朝向一变前进方向也跟着变（空中既不前进也不落地）。
 */
function rotateAroundMid(b, ang) {
  if (!ang) return;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  let mx = 0, my = 0, mt = 0;
  for (const p of b.pts) { mx += p.x * p.m; my += p.y * p.m; mt += p.m; }
  if (!(mt > 0)) return;
  mx /= mt;
  my /= mt;
  const sv = systemVel(b);
  const sub = DT;
  for (const p of b.pts) {
    const rx = p.x - mx;
    const ry = p.y - my;
    p.x = mx + rx * c - ry * s;
    p.y = my + rx * s + ry * c;
    // 相对速度同样旋转，质心速度原样保留
    const rvx = p._vx - sv.vx;
    const rvy = p._vy - sv.vy;
    p._vx = sv.vx + rvx * c - rvy * s;
    p._vy = sv.vy + rvx * s + rvy * c;
    p.px = p.x - p._vx * sub;
    p.py = p.y - p._vy * sub;
  }
  b.lastAng = wrapAngle(b.lastAng + ang);
}

/** 按当前车辆 + 升级等级重算驾驶参数（公式统一放在 config/constants.js 的 derive* 里） */
export function applyUpgrades() {
  const v = VEHICLES[store.currentVehicle];
  const up = getUp();
  Object.assign(store.phys, deriveHandling(v, up));
  // ---- 质量/惯量/悬挂/摩擦也数据化 ----
  // 质量与惯量真参数（求解器按逆质量加权）、悬挂（刚度/阻尼/行程）、摩擦系数 μ。
  // 此处真实引用 M_R/M_F/M_H/M_TOT/COM_UP/I_BODY，使其不再是死代码。
  const rb = deriveRigidBody(v);
  store.phys.rb = rb;
  store.phys.susp = deriveSuspension(v, up);
  store.phys.mu = deriveFriction(store.phys.traction, v, up);
  store.phys.wheelI = wheelInertia(rb.mW); // 轮转动惯量（实心圆盘近似）

  // 倒挡的**物理**基准极速：必须在下面特殊模式把 topSpeed 抬高**之前**存一份。
  // 拿"极速模式"的标称值当倒挡目标，会让终极模式"倒着比正着还快"。
  store.phys.baseTopSpeed = store.phys.topSpeed;

  // 风阻复位到基准值，再由下面的特殊形态覆写。
  // ★ 必须显式复位：airDragK 挂在 store.phys 上、跨 applyUpgrades() 调用存活，
  //   自己不会回到默认值。从「极速模式」(0.1×) 切回普通车却不清它，
  //   普通车就会带着那份低风阻跑 —— 极速凭空高一截。
  //   （原先这里是写 `airDragK = 0`，靠 applyDrag 的 `0 || AIR_DRAG_K` 兜回默认值，
  //     效果对但读起来像"关掉风阻"，是句有误导性的写法。）
  store.phys.airDragK = AIR_DRAG_K;

  // 特殊终极形态（放在所有派生量覆写之后：μ 由 deriveFriction 派生，
  // 若在前面放大会被覆盖，车会因打滑而极速上不去）。
  //
  // ★ 这里的每个数字都来自**当前这辆车自己手写的 fx**，不再是全局常量 ——
  //   同 mode 的车效果同类、量级不同。fx 里没写的字段一律取 1 / 不改，
  //   所以某个形态只想要"其中一样"时不必把七项都抄一遍。
  const fx = ultraFx();
  const mode = activeMode(v);
  const MAXED = { engine: MAX_LV, tire: MAX_LV };
  if (mode === "surge") {
    // 极速形态：扭矩曲线**拉长**（高速段仍接近满功率）+ 低风阻。
    // ★ 刻意不给抓地下限：把 μ 抬到 3 以上，驱动力就超过翘头临界，
    //   实测银箭满级挂形态后每 2 秒翻一次车，而同一辆车裸车 30 秒零摔车。
    //   抓地留给 stable / shield 形态（它们给的是倍率，不改绝对量级）。
    store.phys.rpmK *= fx.rpmK || 1;
    store.phys.topSpeed = Math.max(store.phys.topSpeed, (fx.speedN || 1) * REF_SPEED);
    if (fx.dragK) store.phys.airDragK = AIR_DRAG_K * fx.dragK;
  } else if (mode === "railgun") {
    // 轨道炮：把扭矩曲线**拉得又高又长**（红线暴涨 → 高速段仍有满功率），
    // 配合低风阻把极速顶上去。
    // ★ 刻意**不**再乘扭矩峰值：那个值一旦堆过牵引上限就完全无效（纯空转），
    //   而堆得刚好有效的那一档已经会把车后空翻 —— 实测玄铁扭矩 ×3 就第 55 帧翻过去。
    //   "按住不放就翻车"本身是这游戏的核心手感（README：松油门比按什么键重要），
    //   形态不该替玩家把这个决定代劳，所以只给红线与极速。
    store.phys.rpmK *= fx.rpmK || 1;
    if (fx.dragK) store.phys.airDragK = AIR_DRAG_K * fx.dragK;
    if (fx.speedN) store.phys.topSpeed = topSpeedOf(v, MAXED) * fx.speedN;
  } else if (mode === "absolut") {
    // 绝对形态：表盘满量程钉在 350 km/h，并把风阻调到该速度上恰好能与附加推力相抵
    // （默认阻力在 9722px/s 处减速约 7.8 万 px/s²，任何驱动力都顶不住，
    //  高速只会"冲一下就掉速"）。
    store.phys.topSpeed = ABSOLUT_V;
    // ★ rpmK 刻意**不**放大：扭矩路径已经够强（扭矩倍率 3.0），而把红线拉到
    //   ω=2376 会让满油门时的摩擦上限根本刹不住车轮 —— 实测后轮一路空转到
    //   ωR = 73,000 px/s，直接打挂"无动力滑行纯滚动 / 车轮锁死 / 滑移不爆炸"三项。
    //   350 km/h 由下面那段附加推力负责，扭矩路径保持正常尺度。
    store.phys.airDragK = ABSOLUT_DRAG_K;
  } else if (mode === "omega") {
    // 终焉形态：1000 km/h + 常驻飞行（见 flightStep）。
    // 风阻按同一口径标定，使 OMEGA_V 成为 flightStep 里那个稳定平衡点。
    store.phys.topSpeed = OMEGA_V;
    store.phys.airDragK = OMEGA_DRAG_K;
    // rpmK 同样不放大：扭矩路径在这台车上几乎不参与加速（见 flightStep 的说明），
    // 放大只会让车轮在 27778 px/s 下空转到 ωR ≈ 2300 rad/s，纯属浪费与数值噪声。
  } else if (mode === "warp") {
    // 跃迁形态：直接给整车注入持续推力冲量（见 stepPhysics 的 boost 段）。
    // accel / vCap 决定"逼近极速有多快"，逐车不同 —— 便宜的蜂鸟要踩更久才上得去。
    if (fx.speedN) store.phys.topSpeed = topSpeedOf(v, MAXED) * fx.speedN;
    store.phys.rpmK *= 2;
    if (fx.dragK) store.phys.airDragK = AIR_DRAG_K * fx.dragK;
  } else if (mode === "stable" || mode === "shield" || mode === "phase") {
    // 这三个形态的卖点是"不摔/不腾空/不掉油"，它们**不碰扭矩与红线**，
    // 换来的额外收益各不相同：贴地给抓地、护盾给抓地、相位给极速。
    if (fx.gripK) store.phys.mu *= fx.gripK;
    if (fx.speedN) store.phys.topSpeed *= fx.speedN;
  }
  bike.rb = rb;
  bindMasses(rb);
}

/** 把质量 / 逆质量写到质点上（求解器与接触都用它） */
function bindMasses(rb) {
  const b = bike;
  b.rear.m = rb.mW; b.front.m = rb.mW;
  b.axleRear.m = rb.mR; b.axleFront.m = rb.mF; b.head.m = rb.mH;
  for (const p of b.pts) p.im = p.m > 0 ? 1 / p.m : 0;
}

/** 出生 / 重生：把车摆到地形上（保持速度为零） */
export function resetBike(x) {
  const b = bike;
  const L = WHEELBASE;
  b.spawnX = x;
  b.awaitingStart = true;
  const yR = groundY(x) - WHEEL_R;
  const yF = groundY(x + L) - WHEEL_R;
  const ang = Math.atan2(yF - yR, L);
  for (const [p, px, py] of [
    [b.rear, x, yR],
    [b.front, x + L, yF],
    [b.axleRear, x, yR],
    [b.axleFront, x + L, yF],
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
  b.wheelAngleRear = 0;
  b.wheelAngleFront = 0;
  // 本帧轮角增量也必须一并归零：渲染层用它算辐条频闪淡出与踏频，
  // 残留旧值会让重生后第一帧的辐条几乎完全淡出（实测 blur 0.97 → alpha 0.107）。
  b.wheelStepRear = 0;
  b.wheelStepFront = 0;
  b.squash = 0;
  b.squashVel = 0;
  b.angVel = 0;
  b.rotAcc = 0;
  b.lastAng = ang;
  b.penetration = 0;
  b._impactV = 0;
  // 记录骑手在轮轴线的哪一侧（刚体几何决定，任何旋转都不会改变）
  const ux = b.axleFront.x - b.axleRear.x;
  const uy = b.axleFront.y - b.axleRear.y;
  const d = Math.hypot(ux, uy) || 1e-4;
  const cross = (ux / d) * (b.head.y - b.axleRear.y) - (uy / d) * (b.head.x - b.axleRear.x);
  b.headUp = Math.sign(cross) || -1;
  // 新增状态量一并归零（保证"同初始状态 + 同输入 → 完全可复现"）
  b.wheelRot.rear = 0; b.wheelRot.front = 0;
  b.wheelAcc.rear = 0; b.wheelAcc.front = 0;
  b.susp.rear.t = 0; b.susp.rear.v = 0;
  b.susp.front.t = 0; b.susp.front.v = 0;
  b.slip.rear = 0; b.slip.front = 0;
  b.fn.rear = 0; b.fn.front = 0;
  b.fricAcc.rear = 0; b.fricAcc.front = 0;
  // 助推计时必须一并归零：boostImpulse 只要 boostT>0 就继续改写 Verlet 前一帧位置
  //（=注入速度）。压过加速带后 0.5s 内重开/换关，新一局会白送一段速度冲量。
  b.boostT = 0;
  // 悬停高度线必须**初始化到当前真实高度**，不能留在上一局的残值：
  // 低通起点若为 0，飞行形态开局会从"悬停在 y=0"一路爬升到真实高度，
  // 表现为开局原地垂直起飞（实测能窜到 494px 高才稳住）。
  {
    const nx = (x + L / 2);
    const ng = groundInfo(nx);
    const nn = groundNormal(nx);
    b.hoverY = (isFinite(ng.y) ? ng.y : yR) + nn.y * (FLIGHT_HOVER + WHEEL_R);
  }
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
  run.hasCrashed = true;
  run.crashTimer = STUN_TIME;
  run.combo = 0;
  // 摔车惩罚：燃料与计时都要付出代价（计时惩罚在结算时计入，直接影响三星）
  const P = store.phys;
  P.fuel = Math.max(0, P.fuel - CRASH_FUEL_LOSS * P.fuelMax);
  run.penaltyTime += CRASH_TIME_PENALTY;
  // 表现与反馈交给注入的物理事件回调：震屏 / 音效 / 粒子 / 提示
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
  const a = Math.atan2(b.axleFront.y - b.axleRear.y, b.axleFront.x - b.axleRear.x);
  return { a, tx: Math.cos(a), ty: Math.sin(a), dx: -Math.sin(a), dy: Math.cos(a) };
}

/**
 * 骑手身体是否已低于两轴连线（前翻 / 倒立）。
 * 只有这种姿态下骑手身体才会碰到地面；正常骑行时头永远在轴线上方，
 * 因此身体接触对常规手感零影响（也避免在谷底等地形上误判）。
 */
function bodyLow(b) {
  return b.head.y > (b.axleRear.y + b.axleFront.y) * 0.5;
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
  const FN_MAX = FN_MAX_K * store.phys.rb.mTot * store.phys.gravity;
  for (const wk of WHEELS) {
    const W = b[wk];
    const A = wk === "rear" ? b.axleRear : b.axleFront;
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
function applyDrive(b, P, sub, throttle, brk, rev) {
  // 贴地模式（越野车终极模式）：轮子被钉在地表、接触摩擦为 0，
  // 油门/刹车改走"整车速度指令"（磁悬浮滑行）——否则完全走不动。
  if (isUltraStable()) {
    const sv = systemVel(b);
    const vx = sv.vx;
    let target = 0;
    if (rev) target = -(P.baseTopSpeed || P.topSpeed) * REV_SPEED;
    else if (throttle) target = P.topSpeed * 0.95; // 前进冲到极速；刹车/松油门滑停
    const maxAcc = P.topSpeed * 2; // 加速（/s），0.5s 内到极速，不突兀
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
  const wheelieTau = wheelieTauOf(P.rb.mTot, P.gravity);
  for (const wk of WHEELS) {
    let w = b.wheelRot[wk];
    let tau = 0;
    // 油门只驱动后轮；刹车前后轮都作用（真车如此）
    if (wk === "rear" && throttle) tau += clamp(torqueAt(veh, w, throttle, P.torquePeak, P.rpmK || 1), -wheelieTau, wheelieTau);
    // 倒挡 = 反向驱动力矩，把后轮推向目标倒转角速度（同样只驱动后轮）。
    // 用"趋近目标轮速"的差动式扭矩而不是固定反向扭矩：倒车到极速后扭矩自然归零。
    //
    // ★ 按住刹车时必须**停掉这个伺服**：torquePeak(18000×…) 恒大于 brakePeak(12000×…)
    //   （三种车各级升级实测比值 1.16~3.59），伺服饱和在 −torquePeak 而刹车只有
    //   +brakePeak，净扭矩永远为负 —— 于是"↓+←"会停在一个**非零的恒定倒车速度**
    //   上一直往后飘（实测 trail L0 稳定在 −19.8px/s，60 秒倒退 1187px）。
    //   交给刹车接管后，↓+← 能正常减速到停。
    if (wk === "rear" && rev && !brk) {
      const base = P.baseTopSpeed || P.topSpeed;
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
/**
 * 空气阻力：v² 项 + **v 线性项**，对整车施加与速度反向的加速度（所有质点同减）。
 *
 * ★ 线性项是"松油门能停下来的原因"。只有 v² 项时，减速在低速段趋零，
 *   剩下的恒定滚动阻力（15 px/s²）让速度尾巴拖十几秒、滑行几十米。
 *   详见 constants.js 的 LINEAR_DRAG_K 注释。
 *   ★ 该项**故意不进** topSpeedOf 的 loss()：那里是"极速解算"的单一事实来源，
 *   加进去会压低全部车辆的极速（实测见 checklist R7.2）。
 *   它只在这里作用于"已经松开油门后的减速"，对极速平衡点无影响。
 */
function applyDrag(b, P, sub) {
  const sv = systemVel(b);
  const sp = Math.hypot(sv.vx, sv.vy);
  if (sp < 1e-6) return;
  const k = P.airDragK || AIR_DRAG_K; // 极速模式用压缩后的阻力，普通模式用默认
  // 单位质量减速度 = k·sp²（风阻）+ LINEAR_DRAG_K·sp（线性项）
  const decel = k * sp * sp + LINEAR_DRAG_K * sp;
  const ax = (-sv.vx / sp) * decel / sv.m;
  const ay = (-sv.vy / sp) * decel / sv.m;
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
  const FN_MAX = FN_MAX_K * P.rb.mTot * P.gravity;
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
      velDistance(b.axleRear, b.axleFront, L),
      velDistance(b.axleRear, b.head, Lr),
      velDistance(b.axleFront, b.head, Lr)
    );
    for (const wk of WHEELS) {
      const A = wk === "rear" ? b.axleRear : b.axleFront;
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
  const dx = b.axleFront.x - b.axleRear.x;
  const dy = b.axleFront.y - b.axleRear.y;
  const d = Math.hypot(dx, dy) || 1e-4;
  const ux = dx / d, uy = dy / d;
  const signed = ux * (b.head.y - b.axleRear.y) - uy * (b.head.x - b.axleRear.x);
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
      projDistance(b.axleRear, b.axleFront, L),
      projDistance(b.axleRear, b.head, Lr),
      projDistance(b.axleFront, b.head, Lr)
    );
    resid = Math.max(resid, projHeadSide(b));
    for (const wk of WHEELS) {
      const A = wk === "rear" ? b.axleRear : b.axleFront;
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
    const wMax = (AIR_ROT_MAX * veh.airRot) / inv;
    const a = (AIR_ROT_ACC * veh.airRot) / inv;
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
  // ★ grounded > 0 的门槛对**飞行形态无效**：flightStep 每帧把 b.grounded 置 0，
  //   于是飞行时 revK 恒为 0 —— 倒挡在飞行形态下永久失效（实测：按住 ↓ 车纹丝不动）。
  //   飞行形态由 isFlighter() 判定，飞行中"触地"没有意义，故直接放行。
  const revK = key.rev && !run.crashed && (b.grounded > 0 || isFlighter()) ? 1 : 0;
  const revReady = revK && systemVel(b).vx < REV_ENTER_V;
  const brkK = (key.left || (revK && !revReady)) && !run.crashed ? 1 : 0;
  const rev = revReady ? 1 : 0;
  // 附加推力模式在整帧内固定，每子步重查 mode 是纯浪费
  const mode0 = activeMode();
  const fx = ultraFx();
  const warp = mode0 === "warp";
  const absolut = mode0 === "absolut";
  const omega = mode0 === "omega";
  const hover = isFlighter();
  const ang0 = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);

  // ★ 飞行形态整条换掉推进方式：常驻飞行，不接触地面。
  //   必须在所有接地逻辑之前返回，否则高速下接触求解器必然被打穿
  //   （每帧 12 个轴距，采样率低于地形特征频率）。详见 flightStep 的说明。
  if (hover && !run.crashed) {
    flightStep(P, DT, drvK, brkK, rev);
    b.speed = lerp(b.speed, systemVel(b).vx, 0.12);
    const angF = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
    b.angRate = wrapAngle(angF - ang0) / DT;
    b.wheelStepRear = b.wheelRot.rear * DT;
    b.wheelStepFront = b.wheelRot.front * DT;
    b.wheelAngleRear = (b.wheelAngleRear + b.wheelStepRear) % TAU;
    b.wheelAngleFront = (b.wheelAngleFront + b.wheelStepFront) % TAU;
    b.squash = 0;
    b.squashVel = 0;
    return;
  }

  const prevGrounded = b.grounded;
  const prevSpin = { rear: b.wheelRot.rear, front: b.wheelRot.front };
  b._impactV = 0;
  b.penetration = 0;
  b.solverIters = 0;
  b.solverResid = 0;

  for (let s = 0; s < SUB; s++) {
    const sub = SUB_DT;
    syncVel(b, sub);
    // 1) 重力（均匀加速度，与质量无关）
    for (const p of b.pts) p._vy += P.gravity * sub;
    // 2) 空中姿态（角冲量，守恒）
    airControl(b, sub);
    // 3) 悬挂弹簧-阻尼
    applySuspension(b, SUS, sub);
    // 4) 动力链 + 刹车 + 滚动阻力
    applyDrive(b, P, sub, drvK, brkK, rev);
    // 5) 空气阻力
    applyDrag(b, P, sub);
    // 5.5) 附加推力：「跃迁」与「绝对形态」共用，**传动链保持完整**
    // （早期版本试过用速度伺服整条替换传动链，结果刹车锁死 / 打滑率 / 场景抓地缩放
    //   三条不变式同时失效，一次就打挂 15 项断言 —— 所以只能"叠加"，不能"替换"）
    if ((warp || absolut) && drvK && !run.crashed) {
      const svw = systemVel(b);
      let add;
      if (warp) {
        // accel / vCap 逐车手写：贵的形态"踩一下就贴上去"，便宜的要多踩一会儿。
        // 两者都从 fx 读，缺省回落到旧的两个全局值（= 当年逐日那台的档位）。
        const acc = fx.accel || WARP_ACC;
        const cap = fx.vCap || WARP_V_CAP;
        add = clamp((P.topSpeed * 0.98 - svw.vx) * acc * sub, 0, cap * sub);
      } else {
        // 上限 = 可用抓地。★ 不能再套跃迁的 vCap：那个值是按"整秒"标定的单子步限速，
        // 除以子步长后只剩零点几 px/子步，会把 350km/h 的推力掐到只剩万分之一。
        const grip = P.mu * P.rb.mTot * P.gravity * REAR_LOAD;
        // ★★ 前馈项是这台车能不能真跑到 350 的**唯一**关键（原先实测只到 285）：
        //   纯比例项 (V−v)·G 在 v→V 时趋零，而 V 处的风阻（3261 px/s²）却是有限正值，
        //   平衡点必然落在 V 之前 —— 解 (V−v)·G = k·v²/mTot + roll 得 v ≈ 8000 px/s = 288 km/h，
        //   与实测的 285 完全吻合。前馈 = 目标速度处的风阻减速，使 V 本身成为稳定平衡点；
        //   推力上限（grip = 9672）是该风阻（3276）的 2.95 倍，因此不会先撞上限而卡住。
        const ff = (P.airDragK * P.topSpeed * P.topSpeed) / P.rb.mTot;
        add = clamp((P.topSpeed - svw.vx) * ABSOLUT_SERVO_ACC * sub + ff * sub,
          0, grip * ABSOLUT_THRUST_K * sub);
      }
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
  // 画面下沉由**真实悬挂行程**派生（不再有独立弹簧）
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
  b.wheelStepRear = b.wheelRot.rear * DT;
  b.wheelStepFront = b.wheelRot.front * DT;
  b.wheelAngleRear = (b.wheelAngleRear + b.wheelStepRear) % TAU;
  b.wheelAngleFront = (b.wheelAngleFront + b.wheelStepFront) % TAU;

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
  //   · 骑手身体确实落到地面附近 —— 空中倒立但还离地很高时不判摔，
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
