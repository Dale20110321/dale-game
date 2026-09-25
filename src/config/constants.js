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
/** 加速度降为原来的 1/3 */
export const ACCEL_K = 1 / 3;
/** 极速降为原来的 2/3 */
export const SPD_K = 2 / 3;
/** 极速公式的原始上限与基准（px/s 的半标度基准） */
export const MAXV_RAW_CAP = 350;
export const MAXV_BASE = 130;
/** 驱动 / 刹车基础值（px/s²，半标度基准） */
export const DRIVE_BASE = 600;
export const BRAKE_BASE = 600;

/**
 * 平路基准极速（0 升级、spd=1）真实 px/s —— 油耗模型反推、AI 基准都用它。
 * 这是"半标度 → 真实 px/s"的一个合法出口，其它地方禁止再写裸 *SUB。
 */
export const REF_SPEED = MAXV_BASE * SUB * SPD_K;

/**
 * 由"车辆倍率 + 升级等级"推导驾驶参数。
 * ★ 所有半标度 → 真实 px/s 的换算只允许在这里发生（保持标度唯一事实来源）。
 */
export function deriveHandling(grav, traction, veh, up) {
  const sus = up.susp || 0;
  return {
    DRIVE: Math.min(grav * 0.95, (DRIVE_BASE + 20 * up.engine + 16 * up.tire) * veh.drv * ACCEL_K),
    BRAKE: Math.min(grav * 0.95, (BRAKE_BASE + 16 * up.tire + 10 * up.frame) * veh.grp * traction),
    MAXV: Math.min(MAXV_RAW_CAP, MAXV_BASE + 2.5 * up.engine + 1.5 * up.tire) * SUB * veh.spd * SPD_K,
    crashMargin: Math.min(14, 2 + 0.1 * up.frame + veh.wgt * 2),
    fuelMax: veh.tank * (1 + 0.004 * up.frame),
    susAbsorb: Math.max(0.05, 0.25 - 0.002 * sus),
    susClimb: Math.max(1, 6 - 0.05 * sus),
    susRot: Math.max(0.3, 0.7 - 0.004 * sus),
  };
}

// ---------------- 空中姿态控制（骑手摆身） ----------------
// 定标依据：滞空 0.9s 全程按键，累计转角 ≥ 2π（完成一圈空翻）
//   θ(T) = W·T − W²/(2A)，T=0.9, W=9.5, A=40 → 6.53 rad ≥ 2π
export const AIR_ROT_MAX = 9.5;
export const AIR_ROT_ACC = 40;
export const AIR_ROT_RELEASE = 0.05;
/**
 * 空中骑手切向阻尼系数。
 * 必须为 1（不阻尼）：骑手是刚性固定在车上的，空中不能有相对阻尼——
 * 否则头会"拖在后面"，形成隐形的自动回正力矩（既违背角动量守恒，
 * 又会跟玩家按下的空中转体对抗，导致空翻翻不到一圈、倒立落地永远摔不下来）。
 */
export const AIR_HEAD_DAMP = 1.0;
/** 驱动/刹车反扭矩系数：油门翘头、刹车栽头 */
export const PITCH_TORQUE = 0.22;

// ---------------- 坡顶腾空 ----------------
export const LAUNCH_K = 0.55;
export const LAUNCH_MAX = 20;

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

// ---------------- 落地反馈与视觉特效阈值（一律真实 px/s） ----------------
/** 落地冲击归一化基准：竖向速度达到此值 = 压到底 */
export const LAND_REF = 520;
/** 竖向速度安全上限（防止数值爆掉） */
export const VSPD_CAP = 1200;
/** 下坡允许超过极速的倍率 */
export const DOWNHILL_K = 1.35;
/** 骑尘 / 高速扬尘的启动速度 */
export const DUST_V = 150;
export const DUST_HEAVY_V = 320;
/** 速度线的启动速度与强度归一化基准 */
export const SPEEDLINE_V = 260;
export const SPEEDLINE_REF = 560;

/** 贴地吸附带宽（px） */
export const CONTACT_TOL = 12;
/** 摔车昏迷时长（秒） */
export const STUN_TIME = 1.1;
/** 出生点 x */
export const START_X = 40;

// ---------------- 升级 ----------------
export const MAX_LV = 100;
/** 升级到 lv 级所需金币 */
export const upCost = (lv) => 30 + lv * 5;

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
};
