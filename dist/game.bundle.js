// src/core/utils.js
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var lerp = (a, b, t) => a + (b - a) * t;
function toPlainDecimal(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0)
    return "0";
  if (n < 1)
    return "0";
  const s = BigInt(Math.floor(n)).toString();
  return s;
}
function fromPlainDecimal(s) {
  if (typeof s === "number")
    return Number.isFinite(s) ? s : 0;
  if (typeof s !== "string")
    return 0;
  const t = s.trim();
  if (!/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
function sciExp(a) {
  return Math.floor(Math.log(a) / Math.log(3));
}
function sciBody(a, d) {
  const e = sciExp(a);
  const mant = a / Math.pow(3, e);
  const norm = mant >= 9.9995 ? [a / Math.pow(3, e + 1), e + 1] : mant < 0.99995 ? [mant * 3, e - 1] : [mant, e];
  const m = norm[0];
  return m.toFixed(d) + "×10^" + norm[1];
}
function goldNum(n, o) {
  const v = Number(n);
  if (!Number.isFinite(v))
    return String(n);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  const pre = o && o.yuan ? "¥" : "";
  if (a < 1e4)
    return pre + sign + Math.round(a).toLocaleString("en-US");
  return pre + sign + sciBody(a, o && o.d || 2);
}
function abbrevNum(n, o) {
  const v = Number(n);
  if (!Number.isFinite(v))
    return String(n);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  const pre = o && o.yuan ? "¥" : "";
  const fixed = (x, d) => {
    const s = x.toFixed(d);
    return s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s;
  };
  if (a < 1e4)
    return pre + sign + Math.round(a).toLocaleString("en-US");
  if (a < 1e8) {
    const wan = a / 1e4;
    return pre + sign + (wan < 10 ? fixed(wan, 2) : wan < 1000 ? fixed(wan, 1) : String(Math.floor(wan))) + "万";
  }
  if (a < 1000000000000) {
    const yi = a / 1e8;
    return pre + sign + (yi < 10 ? fixed(yi, 2) : yi < 1000 ? fixed(yi, 1) : String(Math.floor(yi))) + "亿";
  }
  return pre + sign + sciBody(a, 2);
}
var wrapX = (v, m) => {
  const w = m || 1;
  return (v % w + w) % w;
};
function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function installRoundRect() {
  if (typeof CanvasRenderingContext2D === "undefined")
    return;
  const P = CanvasRenderingContext2D.prototype;
  if (!P.roundRect) {
    P.roundRect = function(x, y, w, h, r) {
      r = Math.min(r || 0, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
    };
  }
}
function wrapAngle(a) {
  while (a > Math.PI)
    a -= 2 * Math.PI;
  while (a < -Math.PI)
    a += 2 * Math.PI;
  return a;
}

// src/core/canvas.js
var cv = document.getElementById("cv");
var ctx = cv.getContext("2d");
var view = { W: 0, H: 0, DPR: 1, RS: 1, k: 1 };
var RENDER_SCALES = [0.75, 1, 1.25];
var RENDER_SCALE_LABEL = { 0.75: "省电", 1: "标准", 1.25: "锐利" };
function setRenderScale(s) {
  const v = Number(s);
  const hit = RENDER_SCALES.find((x) => Math.abs(x - v) < 0.01);
  view.RS = hit || 1;
  resize();
  return view.RS;
}
function resize() {
  view.W = window.innerWidth;
  view.H = window.innerHeight;
  view.DPR = Math.min(window.devicePixelRatio || 1, view.W < 700 || view.H < 480 ? 1.6 : 2);
  const k = view.DPR * view.RS;
  view.k = k;
  cv.width = Math.max(1, Math.round(view.W * k));
  cv.height = Math.max(1, Math.round(view.H * k));
  cv.style.width = view.W + "px";
  cv.style.height = view.H + "px";
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

// src/config/constants.js
var CAM_ZOOM_BASE = 1.4;
var CRUISE_V = 1e5;
var DT = 1 / 60;
var SUB = 6;
var SUB_DT = DT / SUB;
var SUBV = 1 / SUB_DT;
var WHEEL_R = 12;
var WHEELBASE = 38;
var SEAT_H = 26;
var PX_PER_M = 100;
var toM = (px) => px / PX_PER_M;
var toKmh = (pxs) => pxs / PX_PER_M * 3.6;
var SPD_K = 2 / 3;
var MAXV_BASE = 130;
var REF_SPEED = MAXV_BASE * SUB * SPD_K;
var ENGINE_TORQUE_UP = 0.01;
var ENGINE_RPM_UP = 0.018;
var TIRE_TORQUE_UP = 0.006;
var FRICTION_TIRE_UP = 0.006;
var ABSOLUT_KMH = 350;
var ABSOLUT_V = ABSOLUT_KMH / 3.6 * PX_PER_M;
var ABSOLUT_DRAG_K = 0.00013;
var ABSOLUT_THRUST_K = 1;
var ABSOLUT_SERVO_ACC = 1.2;
var OMEGA_KMH = 1000;
var OMEGA_V = OMEGA_KMH / 3.6 * PX_PER_M;
var OMEGA_DRAG_K = 0.000115;
var OMEGA_THRUST_K = 1;
var OMEGA_SERVO_ACC = 0.55;
var OMEGA_ACC_FRAC = 0.25;
var FLIGHT_HOVER = 78;
var FLIGHT_HOVER_K = 9;
var FLIGHT_HOVER_LP = 18;
var FLIGHT_PITCH_K = 0.55;
var GRAV_BASE = 750;
var REAR_LOAD = 0.62;
var WHEELIE_K = 2;
function wheelieMulOf(veh, up) {
  const p = veh && veh.phys || {};
  const k0 = p.wheelieK || WHEELIE_K;
  const up0 = p.wheelieUp || 0;
  if (!up0)
    return k0 / WHEELIE_K;
  const full = maxLvOf(veh);
  const f = Math.max(0, Math.min(full, up && up.frame || 0));
  return (k0 + up0 * f / full) / WHEELIE_K;
}
var wheelieTauOf = (mTot, gravity, kMul) => mTot * gravity * WHEELBASE * 0.5 * WHEELIE_K * (kMul || 1);
var TOP_SPEED_CAP = 1000000000000;
function topSpeedOf(veh, up, o) {
  const p = veh && veh.phys || {};
  const u = up || {};
  const ov = o || {};
  const eng = u.engine || 0;
  const tire = u.tire || 0;
  const k = p.mass || veh && veh.weight || 1;
  const mTot = (M_TOT + 2 * M_W) * k;
  const peak = TORQUE_PEAK_BASE * (p.torque || 1) * (1 + ENGINE_TORQUE_UP * eng + TIRE_TORQUE_UP * tire) * (ov.torqueN || 1);
  const rpmK = (1 + ENGINE_RPM_UP * eng) * (ov.rpmK || 1);
  const mu = ov.mu != null ? ov.mu : FRICTION_BASE * (veh && veh.grip || 1) * (1 + FRICTION_TIRE_UP * tire);
  const grip = mu * mTot * GRAV_BASE * REAR_LOAD;
  const roll = ROLL_RES_K * mTot * GRAV_BASE;
  const tauCap = wheelieTauOf(mTot, GRAV_BASE, ov.wheelieMul != null ? ov.wheelieMul : wheelieMulOf(veh, u));
  const avail = (v) => Math.min(Math.min(torqueAt(veh, v / WHEEL_R, 1, peak, rpmK), tauCap) / WHEEL_R, grip);
  const dragK = ov.airDragK != null ? ov.airDragK : AIR_DRAG_K;
  const loss = (v) => dragK * v * v + LINEAR_DRAG_K * v + roll;
  let lo = 0;
  let hi = TOP_SPEED_CAP;
  for (let i = 0;i < 40; i++) {
    const mid = (lo + hi) * 0.5;
    if (avail(mid) > loss(mid))
      lo = mid;
    else
      hi = mid;
  }
  return lo;
}
function deriveHandling(veh, up) {
  const u = up || {};
  const p = veh.phys || {};
  return {
    torquePeak: TORQUE_PEAK_BASE * (p.torque || 1) * (1 + ENGINE_TORQUE_UP * (u.engine || 0) + TIRE_TORQUE_UP * (u.tire || 0)),
    brakePeak: BRAKE_TORQUE_BASE * veh.grip * (1 + 0.016 * (u.tire || 0) + 0.01 * (u.frame || 0)),
    rpmK: 1 + ENGINE_RPM_UP * (u.engine || 0),
    topSpeed: topSpeedOf(veh, up),
    crashMargin: Math.min(14, 2 + 0.1 * (u.frame || 0) + veh.weight * 2),
    fuelMax: veh.fuel * (1 + 0.004 * (u.frame || 0))
  };
}
var AIR_ROT_MAX = 9.5;
var AIR_ROT_ACC = 40;
var M_R = 1;
var M_F = 1;
var M_H = 0.7;
var M_TOT = M_R + M_F + M_H;
var COM_UP = M_H * SEAT_H / M_TOT;
var I_BODY = (M_R + M_F) * (WHEELBASE * WHEELBASE / 4 + COM_UP * COM_UP) + M_H * (SEAT_H - COM_UP) * (SEAT_H - COM_UP);
var M_W = 0.22;
var SOLVER_TOL = 0.05;
var SOLVER_ITERS = 8;
var FN_MAX_K = 40;
var PEN_TOL = 2;
var HEAD_R = 18;
var NUM_CAP_V = 1000000000000;
var TORQUE_PEAK_BASE = 18000;
var TORQUE_RPM_BASE = 18;
var TORQUE_FADE_LO = 1.6;
var TORQUE_FADE_HI = 3.2;
var WHEEL_I_K = 1;
var wheelInertia = (mW) => WHEEL_I_K * 0.5 * mW * WHEEL_R * WHEEL_R;
var SUSP_K_BASE = 780;
var SUSP_C_BASE = 70;
var SUSP_TRAVEL_BASE = 16;
var SUSP_EXT_K = 0.55;
var SUSP_K_UP = 0.02;
var SUSP_C_UP = 0.03;
var SUSP_TRAVEL_UP = 0.08;
var FRICTION_BASE = 1.15;
var BRAKE_TORQUE_BASE = 12000;
var crashTiltDeg = (crashMargin) => Math.min(0.7 * 180, (0.55 + (crashMargin - 4) * 0.014) * 180);
var AIR_DRAG_K = 0.0026;
var ROLL_RES_K = 0.02;
var LINEAR_DRAG_K = 2.2;
var CONTACT_BIAS = 0.25;
var BIAS_MAX_V = 400;
var CONTACT_BAND = 2;
var c01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function deriveRigidBody(veh) {
  const p = veh && veh.phys || {};
  const k = p.mass || veh && veh.weight || 1;
  const inertia = p.inertia || 1;
  return {
    k,
    mCh: M_TOT * k,
    mW: M_W * k,
    mTot: M_TOT * k + 2 * M_W * k,
    mR: M_R * k,
    mF: M_F * k,
    mH: M_H * k,
    comUp: COM_UP,
    iBody: I_BODY * k * inertia
  };
}
function deriveSuspension(veh, up) {
  const p = veh && veh.phys || {};
  const s = up && up.susp || 0;
  const travel = (p.travel || SUSP_TRAVEL_BASE) + SUSP_TRAVEL_UP * s;
  return {
    k: SUSP_K_BASE * (p.suspK || 1) * (1 + SUSP_K_UP * s),
    c: SUSP_C_BASE * (p.suspC || 1) * (1 + SUSP_C_UP * s),
    travel,
    ext: travel * SUSP_EXT_K
  };
}
function deriveFriction(traction, veh, up) {
  const t = up && up.tire || 0;
  return FRICTION_BASE * (traction || 1) * (veh && veh.grip || 1) * (1 + FRICTION_TIRE_UP * t);
}
function torqueAt(veh, omega, throttle, peak, rpmK) {
  const p = veh && veh.phys || {};
  const P = peak || TORQUE_PEAK_BASE * (p.torque || 1);
  const w0 = TORQUE_RPM_BASE * (p.rpm || 1) * (rpmK || 1);
  const w = Math.abs(omega || 0);
  let f = 1;
  if (w > w0 * TORQUE_FADE_LO) {
    f = c01(1 - (w - w0 * TORQUE_FADE_LO) / (w0 * (TORQUE_FADE_HI - TORQUE_FADE_LO)));
  }
  return P * f * c01(throttle || 0);
}
var LAND_REF = 520;
var DUST_V = 150;
var DUST_HEAVY_V = 320;
var SPEEDLINE_V = 260;
var SPEEDLINE_REF = 560;
var SPEEDLINE_WARP_V = 1e5;
var SPEEDLINE_WARP_REF = 20000000;
var TRAIL_ON = 0.14;
var TRAIL_FULL = 0.92;
var TRAIL_METEOR_LO = 0.5;
var TRAIL_METEOR_HI = 0.86;
var STUN_TIME = 1.1;
var REV_ENTER_V = 24;
var REV_SPEED = 0.3;
var START_X = 40;
var hazardSpeed = (ramp) => REF_SPEED * (0.95 - 0.2 * ramp);
var gateSpeed = (den3) => den3 * 0.8;
var CRASH_FUEL_LOSS = 0.08;
var CRASH_TIME_PENALTY = 2;
var KICK_V = 250;
var KICK_MIN_V = 220;
var MAX_LV = 100;
var maxLvOf = (veh) => veh && veh.maxLv || MAX_LV;
function ultraCruiseOf(veh, up, nominal) {
  if (!veh)
    return 0;
  const u = up || {};
  const lv = (k) => u[k] || 0;
  const full = maxLvOf(veh);
  const prog = Math.max(0, Math.min(1, (lv("engine") + lv("tire") + lv("frame") + lv("susp")) / 4 / full));
  const base = topSpeedOf(veh, { engine: 0, tire: 0, frame: 0, susp: 0 });
  return base + (nominal - base) * prog;
}
var upCost = (lv) => Math.round(10 + 1.2 * lv);
var upCostOf = (veh, lv) => Math.round(upCost(lv) * (veh && veh.costK || 1));
var CAN_FUEL = 0.6;
var RANK_WIN_GOLD_BASE = 800;
var RANK_WIN_GOLD_K = 0.5;
var RANK_LOSS_GOLD = 150;
var rankGold = (won, rating) => Math.round(won ? RANK_WIN_GOLD_BASE + Math.max(0, rating || 0) * RANK_WIN_GOLD_K : RANK_LOSS_GOLD);
var GOLD_MAX = 1000000000000000000000000000;
var safeGold = (v) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n))
    return 0;
  return n < 0 ? 0 : n > GOLD_MAX ? GOLD_MAX : n;
};
var ACHS = [
  { id: "air", name: "腾空初体验", icon: "\uD83D\uDD4A", desc: "单次腾空 0.8 秒以上" },
  { id: "flip", name: "空翻达人", icon: "\uD83E\uDD38", desc: "完成一次空中翻转并安全落地" },
  { id: "combo3", name: "连招起步", icon: "\uD83D\uDD25", desc: "空翻连招达到 x3" },
  { id: "coinall", name: "拾金不昧", icon: "\uD83D\uDCB0", desc: "单关收集全部金币" },
  { id: "noc", name: "零失误", icon: "\uD83D\uDEE1", desc: "一局不摔车通关任意关卡" },
  { id: "fast", name: "风驰电掣", icon: "⚡", desc: "时速突破 30 km/h" },
  { id: "rich", name: "小康之家", icon: "\uD83C\uDFE6", desc: "累计金币达到 5000" },
  { id: "allstar", name: "三星王者", icon: "\uD83D\uDC51", desc: "全部关卡都拿到 3★" }
];
var SAVE_KEYS = {
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
  prog: "bike_prog",
  rating: "bike_rating",
  stat: "bike_stat",
  ultra: "bike_ultra",
  sel: "bike_sel",
  doc: "dale_save"
};
var SAVE_SCHEMA = 5;
var RATING_ADVANCED = 1200;
var RATING_PEAK = 3300;
var RATING_TOP = 12000;
var RATING_MIN = 0;
var RANK_GAIN_BASE = 25;
var RANK_GAIN_STEP = 8;
var RANK_GAIN_BASE_ADV = 40;
var RANK_GAIN_STEP_ADV = 12;
var RATING_LOSS = 20;
var RATING_LOSS_ADVANCED = 30;
var RANKS = [
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
  { min: 10200, name: "凌驾", reward: 1e5 },
  { min: 12000, name: "超越", reward: 130000 }
];
function rankIndexOf(rating) {
  const r = Math.max(0, Number(rating) || 0);
  let i = 0;
  for (let k = 0;k < RANKS.length; k++) {
    if (r >= RANKS[k].min)
      i = k;
    else
      break;
  }
  return i;
}
function rankSpanOf(index) {
  const r = RANKS[index];
  if (!r)
    return 0;
  const nx = RANKS[index + 1];
  return nx ? nx.min - r.min : Math.max(1, Math.round(r.min * 0.2));
}
function rankStars(rating) {
  const i = rankIndexOf(rating);
  const r = RANKS[i];
  if (!r || r.min <= 0)
    return 0;
  const span = rankSpanOf(i);
  const t = (Math.max(0, Number(rating) || 0) - r.min) / span;
  if (t >= 0.85)
    return 3;
  if (t >= 0.5)
    return 2;
  return 1;
}
function rankNextOf(rating) {
  const i = rankIndexOf(rating);
  return i + 1 < RANKS.length ? RANKS[i + 1] : null;
}
function rankDelta(rating, advanced, won) {
  if (!won)
    return -(advanced ? RATING_LOSS_ADVANCED : RATING_LOSS);
  const r = Math.max(0, Number(rating) || 0);
  const k = Math.floor(r / 1000);
  return advanced ? RANK_GAIN_BASE_ADV + RANK_GAIN_STEP_ADV * k : RANK_GAIN_BASE + RANK_GAIN_STEP * k;
}
function rankPromoReward(from, to, claimed) {
  const a = Math.max(0, Number(from) || 0);
  const b = Math.max(0, Number(to) || 0);
  if (b <= a)
    return 0;
  const floorV = Math.max(a, Math.max(0, Number(claimed) || 0));
  if (b <= floorV)
    return 0;
  let sum = 0;
  for (const r of RANKS)
    if (r.min > floorV && r.min <= b)
      sum += r.reward || 0;
  return sum;
}
var RACE_FORMATS = {
  duel: {
    id: "duel",
    name: "1V1 竞速",
    icon: "⚔️",
    riders: 1,
    team: false,
    desc: "单挑一名对手，冲过终点即获胜"
  },
  melee: {
    id: "melee",
    name: "多人竞技",
    icon: "\uD83C\uDFC1",
    riders: 5,
    team: false,
    desc: "5 名对手同场，按最终名次发奖（第 1 名最多）"
  },
  relay: {
    id: "relay",
    name: "团队接力",
    icon: "\uD83E\uDD1D",
    riders: 5,
    team: true,
    teamSize: 3,
    desc: "3v3：你的队伍累计里程先到终点即获胜，两队都贡献了里程"
  }
};
var RACE_PLACE_GOLD = [600, 400, 300, 220, 160, 120];
var RACE_FORMAT_IDS = ["duel", "melee", "relay"];
var PLAYER_TEAM = 0;
var RIVAL_TEAM = 1;
var RIDER_NAMES = ["疾风", "铁砧", "青隼", "赤影", "磐岩", "游隼", "夜枭·二", "铜铃", "白鸦", "砂砾"];
function buildRacers(format) {
  const f = RACE_FORMATS[format] || RACE_FORMATS.duel;
  const size = f.team ? f.teamSize : 0;
  const r = [];
  for (let i = 0;i < f.riders; i++) {
    r.push({
      name: RIDER_NAMES[i % RIDER_NAMES.length],
      x: START_X - 120 - i * 190,
      spd: 0,
      finish: false,
      ix: i,
      bias: 0.93 + (i * 7 + 3) % 11 / 100,
      team: f.team ? i < size - 1 ? PLAYER_TEAM : RIVAL_TEAM : -1
    });
  }
  return { r, team: f.team ? PLAYER_TEAM : -1 };
}
function racePlaceOf(list, playerX, fmt) {
  const f = fmt || RACE_FORMATS.duel;
  if (!f.team) {
    let p = 1;
    for (const a of list || [])
      if (a.x > playerX)
        p++;
    return p;
  }
  const ahead = (list || []).filter((a) => a.team === PLAYER_TEAM && a.x > playerX).length;
  const rivalAhead = (list || []).filter((a) => a.team === RIVAL_TEAM && a.x > playerX).length;
  return [ahead <= rivalAhead ? 1 : 2, ahead + 1];
}
function rankName(rating) {
  const r = Math.max(0, Number(rating) || 0);
  let name = RANKS[0].name;
  for (const k of RANKS) {
    if (r >= k.min)
      name = k.name;
    else
      break;
  }
  return name;
}
var SAVE_APP = "dale-bike";
var SAVE_FORMAT = 2;

// src/config/vehicles.js
var P = (mass, inertia, suspK, suspC, travel, torque, rpm, wheelieK, wheelieUp) => ({ mass, inertia, suspK, suspC, travel, torque, rpm, wheelieK, wheelieUp });
var POSE = (shX, shY, hdX, hdY, barX, barY) => ({ shX, shY, hdX, hdY, barX, barY });
var TRAIL = (style, core, glow, o) => Object.assign({
  style,
  core,
  glow,
  len: 220,
  width: 9,
  count: 4,
  spread: 8,
  seed: 0
}, o);
var ART = (o) => Object.assign({
  tire: 3,
  rim: true,
  spokes: 6,
  spokeW: 1.6,
  tube: 4,
  topDrop: 2,
  coil: 1,
  bar: "flat",
  saddleW: 10,
  helmR: 4.4,
  peak: true,
  vents: 1,
  pose: POSE(0, 0, 0, 0, 0, 0)
}, o);
function fxText(fx) {
  if (!fx || !Object.keys(fx).length)
    return "";
  const out = [];
  if (fx.speedN != null)
    out.push("极速 ×" + fx.speedN);
  if (fx.rpmK != null)
    out.push("红线 ×" + fx.rpmK);
  if (fx.gripK != null)
    out.push("抓地 ×" + fx.gripK);
  if (fx.dragK != null)
    out.push("风阻 ×" + fx.dragK);
  if (fx.accel != null)
    out.push("推进 " + fx.accel);
  if (fx.vCap != null)
    out.push("限速 " + fx.vCap);
  return out.join(" · ");
}
var VEHICLES = [
  {
    id: "trail",
    name: "驮马",
    icon: "\uD83D\uDC34",
    desc: "均衡全能，新手之选",
    tier: "普通",
    costK: 1,
    price: 0,
    speed: 1,
    grip: 1,
    weight: 1,
    airRot: 1,
    fuel: 1,
    color: "#314ccd",
    art: ART({}),
    phys: P(1, 1, 1, 1, 16, 1, 1),
    ultra: {
      fx: { speedN: 1.1 },
      name: "老驮马",
      icon: "\uD83D\uDC34",
      mode: "phase",
      cost: 6000,
      desc: "见惯不惊：永不摔车 + 燃料无限 + 危险段限速豁免"
    }
  },
  {
    id: "sport",
    name: "银箭",
    icon: "\uD83C\uDFF9",
    desc: "极速快，空中旋转快，油箱小",
    tier: "普通",
    costK: 1,
    price: 3000,
    speed: 1.4,
    grip: 0.55,
    weight: 0.6,
    airRot: 2,
    fuel: 0.75,
    color: "#e63946",
    art: ART({
      tire: 1.7,
      rim: false,
      spokes: 12,
      spokeW: 0.8,
      tube: 2.4,
      topDrop: 6,
      coil: 0,
      bar: "drop",
      saddleW: 6.5,
      helmR: 4.9,
      peak: false,
      vents: 0,
      pose: POSE(4.5, 5.5, 6, 5, 1.5, 3.5)
    }),
    phys: P(0.55, 0.5, 1.25, 1.1, 13, 1.05, 2.05),
    ultra: {
      fx: { speedN: 3.2, rpmK: 2, dragK: 0.55 },
      name: "极速模式",
      icon: "\uD83D\uDE80",
      mode: "surge",
      cost: 8000,
      desc: "引擎过载：加速与极速大幅提升，风驰电掣"
    }
  },
  {
    id: "mud",
    name: "岩驼",
    icon: "\uD83D\uDC2B",
    desc: "抓地强，耐撞，油箱大，旋转慢",
    tier: "稀有",
    costK: 5,
    price: 10500,
    speed: 0.7,
    grip: 1.72,
    weight: 2,
    airRot: 0.455,
    fuel: 1.45,
    color: "#8a5a2b",
    art: ART({
      tire: 5.6,
      spokes: 5,
      spokeW: 2.4,
      tube: 6.2,
      topDrop: -1,
      coil: 1.9,
      bar: "wide",
      saddleW: 14,
      helmR: 4.2,
      vents: 3,
      pose: POSE(-3, -4.5, -3.5, -4.5, -1, -4)
    }),
    phys: P(2.05, 2.2, 0.85, 0.9, 20, 0.92, 0.68),
    ultra: {
      fx: { gripK: 1.3, speedN: 0.95 },
      name: "贴地模式",
      icon: "\uD83D\uDEE1️",
      mode: "stable",
      cost: 40500,
      desc: "磁悬浮贴地：始终贴地，永不翻车"
    }
  },
  {
    id: "volt",
    name: "磁暴",
    icon: "⚡",
    desc: "满级极速是山地车的 2 倍，爬坡不喘",
    tier: "稀有",
    costK: 5,
    price: 7500,
    speed: 1.85,
    grip: 1,
    weight: 0.62,
    airRot: 1.136,
    fuel: 1.3,
    color: "#00d4ff",
    art: ART({
      tire: 2.2,
      rim: false,
      spokes: 10,
      spokeW: 1,
      tube: 3,
      topDrop: 8,
      coil: 0.6,
      bar: "drop",
      saddleW: 8,
      helmR: 5,
      vents: 2,
      pose: POSE(5, 6, 7, 5.5, 2, 4)
    }),
    phys: P(0.6, 0.88, 1.35, 1.15, 14, 2.5, 0.95),
    ultra: {
      fx: { speedN: 3.4, rpmK: 2.2, dragK: 0.52 },
      name: "电磁轨道炮",
      icon: "\uD83D\uDD0C",
      mode: "railgun",
      cost: 27000,
      desc: "电磁轨道炮：推力与红线同时暴涨，平地直接贴地飞行"
    }
  },
  {
    id: "ghost",
    name: "夜枭",
    icon: "\uD83E\uDD89",
    desc: "摔不坏、油无限、危险段随便冲",
    tier: "史诗",
    costK: 12,
    price: 19000,
    speed: 1.6,
    grip: 1.25,
    weight: 0.48,
    airRot: 2.778,
    fuel: 2.2,
    color: "#9d4edd",
    art: ART({
      tire: 1.5,
      rim: false,
      spokes: 14,
      spokeW: 0.7,
      tube: 2.2,
      topDrop: 9,
      coil: 0.3,
      bar: "drop",
      saddleW: 6,
      helmR: 5.2,
      peak: false,
      vents: 0,
      pose: POSE(6, 7, 8, 6, 2.5, 5)
    }),
    phys: P(0.45, 0.36, 1.5, 1.2, 12, 1.35, 1.85),
    ultra: {
      fx: { speedN: 1.3 },
      name: "相位穿行",
      icon: "\uD83C\uDF00",
      mode: "phase",
      cost: 90500,
      desc: "相位穿行：永不摔车 + 燃料无限 + 危险段限速豁免"
    }
  },
  {
    id: "fort",
    name: "磐石",
    icon: "\uD83D\uDEE1️",
    desc: "巨重巨稳，抓地碾压，翻过来也能爬起来",
    tier: "神话",
    costK: 40,
    price: 75500,
    speed: 1.35,
    grip: 2.6,
    weight: 2.7,
    airRot: 0.385,
    fuel: 2.6,
    color: "#f4a261",
    art: ART({
      tire: 7.5,
      spokes: 4,
      spokeW: 3,
      tube: 8,
      topDrop: -3,
      coil: 2.6,
      bar: "wide",
      saddleW: 18,
      helmR: 5.4,
      vents: 4,
      pose: POSE(-4, -6, -2, -7, 0, -6)
    }),
    phys: P(2.85, 2.6, 0.72, 0.85, 24, 0.76, 1),
    ultra: {
      fx: { gripK: 1.6, speedN: 1.3 },
      name: "磁力护盾",
      icon: "\uD83D\uDD30",
      mode: "shield",
      cost: 556500,
      desc: "磁力护盾：任何姿态都摔不下去，腾空与操控全部保留"
    }
  },
  {
    id: "photon",
    name: "光子",
    icon: "\uD83D\uDCAB",
    desc: "神话档第一台：极速与操控的巅峰",
    tier: "稀有",
    costK: 5,
    price: 6500,
    speed: 2.1,
    grip: 1.1,
    weight: 0.4,
    airRot: 1.087,
    fuel: 1.6,
    color: "#ff70a6",
    art: ART({
      tire: 2.6,
      rim: false,
      spokes: 11,
      spokeW: 1.2,
      tube: 3.4,
      topDrop: 10,
      coil: 0.2,
      bar: "drop",
      saddleW: 7,
      helmR: 5.1,
      peak: false,
      vents: 1,
      pose: POSE(7, 8, 9, 7, 3, 5.5)
    }),
    phys: P(0.38, 0.92, 1.45, 1.25, 13, 1, 2.9),
    ultra: {
      fx: { speedN: 3.6, accel: 3.2, vCap: 40 },
      name: "光子跃迁",
      icon: "\uD83C\uDF0C",
      mode: "warp",
      cost: 22000,
      desc: "光子跃迁：踩住油门持续喷射，0.7 秒逼近极速"
    }
  },
  {
    id: "singularity",
    name: "奇点",
    icon: "\uD83C\uDF0C",
    desc: "究极终局：350 km/h 极速 · 摔不坏 · 全项目最强参数",
    tier: "神话",
    costK: 40,
    price: 120000,
    speed: 2.6,
    grip: 3,
    weight: 1.22,
    airRot: 0.532,
    fuel: 3.4,
    color: "#00ff9d",
    art: ART({
      tire: 6.2,
      spokes: 12,
      spokeW: 2,
      tube: 9,
      topDrop: 12,
      coil: 2.2,
      bar: "drop",
      saddleW: 20,
      helmR: 6,
      peak: true,
      vents: 5,
      pose: POSE(9, 9, 11, 8, 4, 7)
    }),
    phys: P(1.22, 1.88, 1.6, 1.5, 26, 3, 3.6),
    ultra: {
      fx: {},
      name: "绝对形态",
      icon: "\uD83C\uDF0C",
      mode: "absolut",
      builtin: true,
      cost: 1020000,
      desc: "免解锁：350 km/h 极速 · 怎么摔都摔不坏 · 抗摔不设上限"
    }
  },
  {
    id: "cv1",
    name: "星环",
    icon: "\uD83D\uDEF0️",
    desc: "第一宇宙速度 · 7.9 km/s 环绕速度 · 近地轨道",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 28440,
    costK: 51513,
    price: 800000000,
    speed: 2.6,
    grip: 3.42,
    weight: 3.1,
    airRot: 0.612,
    fuel: 5,
    color: "#5EC8F5",
    art: ART({
      tire: 2.8,
      rim: true,
      spokes: 10,
      spokeW: 1.3,
      tube: 3.6,
      topDrop: 6,
      coil: 1.1,
      bar: "flat",
      saddleW: 9,
      helmR: 5,
      peak: true,
      vents: 2,
      pose: POSE(1.5, 0.5, 2, 0.5, 0.5, -0.5)
    }),
    trail: TRAIL("arc", "#EAF9FF", "#5EC8F5", { len: 190, width: 8, count: 3, spread: 9, seed: 0.13 }),
    phys: P(68.6, 1.63, 2.4, 1.5, 12, 26.4, 0.75, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "环绕形态",
      icon: "\uD83D\uDEF0️",
      mode: "omega",
      cost: 10000000000,
      desc: "28440 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "cv2",
    name: "离尘",
    icon: "\uD83D\uDE80",
    desc: "第二宇宙速度 · 11.2 km/s 地球逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 40320,
    costK: 1545396,
    price: 24000000000,
    speed: 2.6,
    grip: 6.18,
    weight: 2.45,
    airRot: 0.745,
    fuel: 6,
    color: "#3FE0A5",
    art: ART({
      tire: 2,
      rim: false,
      spokes: 14,
      spokeW: 1,
      tube: 3,
      topDrop: 10,
      coil: 0.5,
      bar: "drop",
      saddleW: 7,
      helmR: 5.4,
      peak: false,
      vents: 3,
      pose: POSE(4.5, 2.5, 5.5, 2, 1.5, 1.5)
    }),
    trail: TRAIL("helix", "#E6FFF6", "#3FE0A5", { len: 235, width: 10, count: 2, seed: 0.41 }),
    phys: P(101.9, 1.34, 3.5, 1.5, 11, 39.2, 0.82, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "逃逸形态",
      icon: "\uD83D\uDE80",
      mode: "omega",
      cost: 300000000000,
      desc: "40320 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "cv3",
    name: "越日",
    icon: "\uD83C\uDF0C",
    desc: "第三宇宙速度 · 16.7 km/s 太阳系逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 60120,
    costK: 46361880,
    price: 720000000000,
    speed: 2.6,
    grip: 11.4,
    weight: 1.9,
    airRot: 0.868,
    fuel: 7,
    color: "#FFE14D",
    art: ART({
      tire: 1.5,
      rim: false,
      spokes: 20,
      spokeW: 0.7,
      tube: 2.6,
      topDrop: 14,
      coil: 0,
      bar: "wide",
      saddleW: 10,
      helmR: 6,
      peak: true,
      vents: 4,
      pose: POSE(-1, -2, -1.5, -2, -2, -3)
    }),
    trail: TRAIL("corona", "#FFF8D6", "#FFE14D", { len: 215, width: 11, count: 9, seed: 0.68 }),
    phys: P(136.8, 1.15, 5, 1.5, 11, 52.6, 0.9, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "星际形态",
      icon: "\uD83C\uDF0C",
      mode: "omega",
      cost: 9000000000000,
      desc: "60120 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "cv4",
    name: "出银",
    icon: "\uD83C\uDF20",
    desc: "第四宇宙速度 · 525 km/s 银河系逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 1890000,
    costK: 1390856407,
    price: 21600000000000,
    speed: 2.6,
    grip: 27.8,
    weight: 1.42,
    airRot: 0.942,
    fuel: 9,
    color: "#FF6B3D",
    art: ART({
      tire: 3,
      rim: true,
      spokes: 12,
      spokeW: 1.8,
      tube: 4.6,
      topDrop: 3,
      coil: 1.5,
      bar: "flat",
      saddleW: 13,
      helmR: 5.6,
      peak: true,
      vents: 3,
      pose: POSE(-0.5, -2.5, -1, -2, 0, -3)
    }),
    trail: TRAIL("ember", "#FFD98A", "#FF6B3D", { len: 245, width: 10, count: 15, seed: 0.29 }),
    phys: P(240.2, 1.06, 8, 1.5, 12, 92.4, 1, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "银河形态",
      icon: "\uD83C\uDF20",
      mode: "omega",
      cost: 270000000000000,
      desc: "1890000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "cv5",
    name: "破群",
    icon: "\uD83D\uDD78️",
    desc: "第五宇宙速度 · 1000 km/s 本星系群逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 3600000,
    costK: 41725692209,
    price: 648000000000000,
    speed: 2.6,
    grip: 63.4,
    weight: 1.02,
    airRot: 1.031,
    fuel: 11,
    color: "#FF4D9E",
    art: ART({
      tire: 1,
      rim: false,
      spokes: 26,
      spokeW: 0.45,
      tube: 2,
      topDrop: 20,
      coil: 0,
      bar: "drop",
      saddleW: 4,
      helmR: 6.4,
      peak: false,
      vents: 6,
      pose: POSE(7.5, 6, 9.5, 5, 3, 4.5)
    }),
    trail: TRAIL("ripple", "#FFD6EC", "#FF4D9E", { len: 250, width: 12, count: 6, seed: 0.87 }),
    phys: P(435.7, 0.97, 12, 1.5, 14, 168.5, 1.08, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "星系群形态",
      icon: "\uD83D\uDD78️",
      mode: "omega",
      cost: 8100000000000000,
      desc: "3600000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "cv6",
    name: "超脱",
    icon: "\uD83D\uDD73️",
    desc: "第六宇宙速度 · 1500 km/s 超星系团逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 5400000,
    costK: 1251770766259,
    price: 19440000000000000,
    speed: 2.6,
    grip: 128.5,
    weight: 0.72,
    airRot: 0.502,
    fuel: 13,
    color: "#B07CFF",
    art: ART({
      tire: 3.8,
      rim: true,
      spokes: 8,
      spokeW: 2.4,
      tube: 5.2,
      topDrop: 1,
      coil: 1.8,
      bar: "wide",
      saddleW: 15,
      helmR: 5.8,
      peak: true,
      vents: 2,
      pose: POSE(1, -5, -0.5, -4, 1, -5.5)
    }),
    trail: TRAIL("vortex", "#F0E4FF", "#B07CFF", { len: 262, width: 13, count: 5, seed: 0.55 }),
    phys: P(790.8, 1.99, 18, 1.5, 16, 305.8, 1.15, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "超星系团形态",
      icon: "\uD83D\uDD73️",
      mode: "omega",
      cost: 243000000000000000,
      desc: "5400000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "cv7",
    name: "无界",
    icon: "\uD83D\uDCAB",
    desc: "第七宇宙速度 · 1750 km/s 全域逃逸速度",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 6300000,
    costK: 37553122987766,
    price: 583200000000000000,
    speed: 2.6,
    grip: 312,
    weight: 0.42,
    airRot: 1.284,
    fuel: 16,
    color: "#F0F4FF",
    art: ART({
      tire: 0.6,
      rim: false,
      spokes: 32,
      spokeW: 0.22,
      tube: 1.1,
      topDrop: 25,
      coil: 0,
      bar: "drop",
      saddleW: 2,
      helmR: 6.8,
      peak: false,
      vents: 8,
      pose: POSE(12, 10, 15, 9.5, 5, 8)
    }),
    trail: TRAIL("lance", "#FFFFFF", "#F0F4FF", { len: 420, width: 9, count: 7, seed: 0.02 }),
    phys: P(1087.6, 0.78, 26, 1.5, 20, 420.6, 1.22, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "全域形态",
      icon: "\uD83D\uDCAB",
      mode: "omega",
      cost: 7290000000000000000,
      desc: "6300000 km/h · 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "cv8",
    name: "光锥",
    icon: "⚡",
    desc: "光速 · 299,792 km/s · 形态极速即光速本身",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 1079252849,
    costK: 33797810688989052,
    price: 524880000000000000000,
    speed: 2.6,
    grip: 620,
    weight: 0.3,
    airRot: 1.412,
    fuel: 18,
    color: "#C9F7FF",
    art: ART({
      tire: 0.4,
      rim: false,
      spokes: 40,
      spokeW: 0.15,
      tube: 0.8,
      topDrop: 28,
      coil: 0,
      bar: "drop",
      saddleW: 1.5,
      helmR: 7.2,
      peak: false,
      vents: 10,
      pose: POSE(14, 12, 17, 11, 6, 10)
    }),
    trail: TRAIL("cone", "#FFFFFF", "#C9F7FF", { len: 460, width: 12, count: 9, seed: 0.31 }),
    phys: P(1346.8, 0.708, 40, 1.5, 24, 520.8, 1.3, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "光锥",
      icon: "⚡",
      mode: "omega",
      cost: 6561000000000000000000,
      desc: "1079252849 km/h（= 光速）· 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "cv9",
    name: "弦外",
    icon: "\uD83C\uDF00",
    desc: "十倍光速 · 2,997,925 km/s · 超出因果律的那一格",
    tier: "宇宙",
    maxLv: 500,
    nominalKmh: 10792528488,
    costK: 30418029620090147000,
    price: 472392000000000000000000,
    speed: 2.6,
    grip: 1180,
    weight: 0.22,
    airRot: 1.557,
    fuel: 20,
    color: "#FF4DE8",
    art: ART({
      tire: 0.25,
      rim: false,
      spokes: 56,
      spokeW: 0.1,
      tube: 0.4,
      topDrop: 32,
      coil: 0,
      bar: "drop",
      saddleW: 1,
      helmR: 7.8,
      peak: false,
      vents: 12,
      pose: POSE(17, 15, 20, 14, 7, 13)
    }),
    trail: TRAIL("rift", "#FFFFFF", "#FF4DE8", { len: 520, width: 14, count: 6, seed: 0.77 }),
    phys: P(1655.6, 0.642, 60, 1.5, 30, 640.2, 1.38, 1.2, 1.4),
    ultra: {
      fx: {},
      name: "弦外",
      icon: "\uD83C\uDF00",
      mode: "omega",
      cost: 5904900000000000000000000,
      desc: "10792528488 km/h（= 10 倍光速）· 全程离地飞行 · 摔不坏 · 燃料无限 · 无视危险段"
    }
  },
  {
    id: "dirt",
    name: "山魈",
    icon: "\uD83D\uDC12",
    desc: "松软地面上的老手，颠簸路面也稳当",
    tier: "稀有",
    costK: 5,
    price: 12000,
    speed: 0.95,
    grip: 1.48,
    weight: 1.6,
    airRot: 0.658,
    fuel: 1.35,
    color: "#b07d4f",
    art: ART({ tire: 4.6, spokes: 6, spokeW: 1.9, tube: 5, topDrop: 0, coil: 1.5, bar: "wide", saddleW: 13, helmR: 4.4, vents: 2, pose: POSE(-1, -2, -1, -2, -0.5, -2.5) }),
    phys: P(1.66, 1.52, 0.9, 0.95, 19, 1.28, 0.98),
    ultra: {
      fx: { speedN: 4, rpmK: 2.8, dragK: 0.45 },
      name: "泥地推进",
      icon: "\uD83C\uDFC7",
      mode: "railgun",
      cost: 49500,
      desc: "推力与红线同时暴涨，泥地也能飞"
    }
  },
  {
    id: "storm",
    name: "白毛风",
    icon: "\uD83C\uDF2C️",
    desc: "雪地极速，滑起来比谁都远",
    tier: "普通",
    costK: 1,
    price: 5000,
    speed: 1.5,
    grip: 0.62,
    weight: 0.64,
    airRot: 1.923,
    fuel: 1.4,
    color: "#a8d8e8",
    art: ART({ tire: 2.2, rim: false, spokes: 10, spokeW: 1, tube: 2.8, topDrop: 5, coil: 0.5, bar: "drop", saddleW: 9, helmR: 4.8, peak: false, pose: POSE(3, 3, 4, 3, 1, 2) }),
    phys: P(0.62, 0.52, 1.25, 1.1, 14, 1.68, 2.4),
    ultra: {
      fx: { speedN: 3.6, rpmK: 2.4, dragK: 0.5 },
      name: "暴风增压",
      icon: "\uD83C\uDF28️",
      mode: "surge",
      cost: 14500,
      desc: "红线与极速暴涨，雪地起飞"
    }
  },
  {
    id: "canyon",
    name: "赤鹫",
    icon: "\uD83E\uDD85",
    desc: "台地上连落差，俯冲落地比谁都稳",
    tier: "稀有",
    costK: 5,
    price: 5500,
    speed: 1.6,
    grip: 1.02,
    weight: 1.02,
    airRot: 1.515,
    fuel: 1.25,
    color: "#cd5c5c",
    art: ART({ tire: 2.8, rim: false, spokes: 12, spokeW: 1.1, tube: 3.4, topDrop: 6, coil: 1.2, bar: "drop", saddleW: 8, helmR: 4.9, pose: POSE(4, 4, 5, 4, 1.5, 3) }),
    phys: P(1.05, 0.66, 1.3, 1.15, 17, 1.38, 1.18),
    ultra: {
      fx: { speedN: 3.2, accel: 2.8, vCap: 34 },
      name: "台地飞驰",
      icon: "\uD83C\uDFDC️",
      mode: "warp",
      cost: 18000,
      desc: "持续喷射：踩住油门就一直加速"
    }
  },
  {
    id: "aurora",
    name: "星轨",
    icon: "\uD83C\uDF20",
    desc: "极夜里最亮的一辆，空中转得飞快",
    tier: "普通",
    costK: 1,
    price: 3500,
    speed: 1.55,
    grip: 0.78,
    weight: 0.5,
    airRot: 2.941,
    fuel: 1.3,
    color: "#66f0c8",
    art: ART({ tire: 1.8, rim: false, spokes: 13, spokeW: 0.8, tube: 2.4, topDrop: 7, coil: 0.4, bar: "drop", saddleW: 7, helmR: 5, peak: false, pose: POSE(5, 6, 6, 5, 2, 4) }),
    phys: P(0.48, 0.34, 1.35, 1.15, 13, 1.8, 1.42),
    ultra: {
      fx: { speedN: 1.1 },
      name: "极光穿行",
      icon: "\uD83C\uDF0C",
      mode: "phase",
      cost: 1e4,
      desc: "摔不坏 + 燃料无限 + 危险段限速豁免"
    }
  },
  {
    id: "glacier",
    name: "冰魄",
    icon: "\uD83E\uDDCA",
    desc: "冰面上最不容易失控的那台",
    tier: "传说",
    costK: 25,
    price: 55500,
    speed: 1.3,
    grip: 2.35,
    weight: 1.95,
    airRot: 0.538,
    fuel: 2.3,
    color: "#8ecae6",
    art: ART({ tire: 7, spokes: 4, spokeW: 2.9, tube: 7.8, topDrop: -3, coil: 2.4, bar: "wide", saddleW: 17, helmR: 5.2, vents: 4, pose: POSE(-3, -6, -2, -6, -1, -6) }),
    phys: P(2, 1.86, 0.75, 0.85, 23, 1.18, 1.14),
    ultra: {
      fx: { gripK: 1.75, speedN: 1.1 },
      name: "冰魄浮壳",
      icon: "❄️",
      mode: "shield",
      cost: 371500,
      desc: "大悬挂继续晃，但怎么都摔不下去"
    }
  },
  {
    id: "obsidian",
    name: "玄铁",
    icon: "⬛",
    desc: "重到离谱，却快得离谱",
    tier: "传说",
    costK: 25,
    price: 65000,
    speed: 1.6,
    grip: 1.32,
    weight: 2.5,
    airRot: 0.435,
    fuel: 2.2,
    color: "#2b2d42",
    art: ART({ tire: 6.8, spokes: 6, spokeW: 2.7, tube: 7.5, topDrop: 1, coil: 2.3, bar: "wide", saddleW: 16, helmR: 5.1, vents: 3, pose: POSE(-3, -5, -2, -5, -1, -5) }),
    phys: P(2.6, 2.3, 0.7, 0.82, 24, 2.6, 1.24),
    ultra: {
      fx: { speedN: 5.4, rpmK: 4, dragK: 0.3 },
      name: "黑曜石炮",
      icon: "⬛",
      mode: "railgun",
      cost: 454500,
      desc: "推力与红线同时暴涨"
    }
  },
  {
    id: "solstice",
    name: "逐日",
    icon: "☀️",
    desc: "追着太阳跑，滑行距离长得离谱",
    tier: "史诗",
    costK: 12,
    price: 14000,
    speed: 2.05,
    grip: 1.02,
    weight: 1.02,
    airRot: 1.25,
    fuel: 2.2,
    color: "#ffb703",
    art: ART({ tire: 2, rim: false, spokes: 12, spokeW: 0.9, tube: 2.6, topDrop: 7, coil: 0.3, bar: "drop", saddleW: 8, helmR: 5.1, peak: false, pose: POSE(6, 7, 7, 6, 2.5, 4.5) }),
    phys: P(0.86, 0.8, 1.5, 1.3, 14, 2.2, 1.85),
    ultra: {
      fx: { speedN: 4.2, accel: 3.8, vCap: 50 },
      name: "至日喷射",
      icon: "☀️",
      mode: "warp",
      cost: 60500,
      desc: "一脚油门不见尽头"
    }
  },
  {
    id: "eclipse",
    name: "天蚀",
    icon: "\uD83C\uDF11",
    desc: "传说档的终点，越暗的地方它越快",
    tier: "神话",
    costK: 40,
    price: 103000,
    speed: 1.9,
    grip: 1.65,
    weight: 2.45,
    airRot: 0.769,
    fuel: 2.3,
    color: "#212529",
    art: ART({ tire: 5.2, spokes: 9, spokeW: 2.2, tube: 6.4, topDrop: 2, coil: 1.8, bar: "wide", saddleW: 15, helmR: 5.3, peak: true, vents: 4, pose: POSE(-1, -3, -1, -3, 0, -3) }),
    phys: P(1.38, 1.3, 0.82, 0.9, 21, 2.15, 2.85),
    ultra: {
      fx: { speedN: 4.2, rpmK: 2.6, dragK: 0.44 },
      name: "蚀之超载",
      icon: "\uD83C\uDF11",
      mode: "surge",
      cost: 833500,
      desc: "暗蚀引擎全功率：红线与极速暴涨，风阻压到四成半"
    }
  },
  {
    id: "nova",
    name: "猎户",
    icon: "\uD83C\uDFAF",
    desc: "神话档第二台：极速与操控的巅峰",
    tier: "史诗",
    costK: 12,
    price: 30000,
    speed: 2.3,
    grip: 1.42,
    weight: 0.76,
    airRot: 1.563,
    fuel: 2.6,
    color: "#ff006e",
    art: ART({ tire: 2, rim: false, spokes: 13, spokeW: 0.9, tube: 2.8, topDrop: 9, coil: 0.35, bar: "drop", saddleW: 7, helmR: 5.3, peak: false, vents: 2, pose: POSE(8, 9, 9, 8, 3.5, 6) }),
    phys: P(0.74, 0.64, 1.5, 1.3, 13, 1.42, 3.35),
    ultra: {
      fx: { speedN: 5, rpmK: 3.6, dragK: 0.36 },
      name: "新星过载",
      icon: "\uD83D\uDCAB",
      mode: "surge",
      cost: 165500,
      desc: "红线与极速暴涨，一路顶到极速"
    }
  },
  {
    id: "oblivion",
    name: "终焉",
    icon: "\uD83D\uDD73️",
    desc: "神话档最重：一台会走路的深坑",
    tier: "神话",
    costK: 40,
    price: 88000,
    speed: 1.8,
    grip: 1.95,
    weight: 3.4,
    airRot: 0.303,
    fuel: 2.9,
    color: "#03045e",
    art: ART({ tire: 8.2, spokes: 4, spokeW: 3.4, tube: 9.2, topDrop: -4, coil: 3, bar: "wide", saddleW: 20, helmR: 5.8, vents: 5, pose: POSE(-4, -8, -3, -8, -1, -8) }),
    phys: P(3.6, 3.3, 0.65, 0.78, 26, 0.98, 1),
    ultra: {
      fx: { gripK: 2, speedN: 1.2 },
      name: "湮灭领域",
      icon: "\uD83D\uDD73️",
      mode: "stable",
      cost: 681000,
      desc: "贴地推进，永不腾空"
    }
  }
];
for (const v of VEHICLES) {
  if (v.ultra && v.ultra.fx)
    v.ultra.fxText = fxText(v.ultra.fx);
}

// src/core/store.js
var store = {
  time: 0,
  state: "menu",
  mode: "level",
  lastMode: "level",
  pendingSpace: false,
  rankedAdvanced: false,
  raceRanked: false,
  slot: 0,
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
  ultra: {},
  garageMeta: {},
  levelRecords: {},
  raceRecords: {},
  createdAt: "",
  progress: {
    branchCleared: [],
    finaleDone: false,
    finaleSeg: 0,
    invited: false,
    rating: 0,
    wins: 0,
    losses: 0,
    peak: false,
    freeThemes: []
  },
  stat: {
    totalRuns: 0,
    totalMeters: 0,
    totalSeconds: 0,
    lastPlayed: "",
    byMode: {}
  },
  space: {
    rating: 0,
    records: {}
  },
  shopOpen: false,
  donateOpen: false,
  cam: { x: 0, y: 0, zoom: CAM_ZOOM_BASE, shake: 0 },
  phys: {
    theme: 0,
    floorY: 0,
    gravity: 750,
    traction: 1,
    topSpeed: topSpeedOf(VEHICLES[0], { engine: 0, tire: 0, frame: 0, susp: 0 }),
    crashMargin: 4,
    fuel: 1,
    fuelMax: 1,
    rb: null,
    susp: null,
    mu: 1
  },
  run: {
    gen: 0,
    seed: 1,
    crashed: false,
    crashTimer: 0,
    settling: false,
    lastSafeX: START_X,
    hasCrashed: false,
    combo: 0,
    comboStamp: -99,
    wheelieDist: 0,
    maxWheelieDist: 0,
    airTime: 0,
    landed: false,
    levelStartTime: 0,
    coinGot: 0,
    totalCoins: 0,
    penaltyTime: 0,
    crashStall: 0,
    gateIdx: 0,
    failed: false
  },
  raceAI: null,
  racers: [],
  raceFormat: "duel",
  raceFormatPick: "duel"
};
var bike = {
  rear: { x: 0, y: 0, px: 0, py: 0 },
  front: { x: 0, y: 0, px: 0, py: 0 },
  head: { x: 0, y: 0, px: 0, py: 0 },
  axleRear: { x: 0, y: 0, px: 0, py: 0 },
  axleFront: { x: 0, y: 0, px: 0, py: 0 },
  grounded: 0,
  speed: 0,
  boostT: 0,
  hoverY: 0,
  wheelAngleRear: 0,
  wheelAngleFront: 0,
  awaitingStart: true,
  spawnX: START_X,
  squash: 0,
  squashVel: 0,
  lastAng: 0,
  angVel: 0,
  angRate: 0,
  wheelStepRear: 0,
  wheelStepFront: 0,
  rotAcc: 0,
  headUp: -1,
  wheelRot: { rear: 0, front: 0 },
  wheelAcc: { rear: 0, front: 0 },
  susp: { rear: { t: 0, v: 0 }, front: { t: 0, v: 0 } },
  slip: { rear: 0, front: 0 },
  fn: { rear: 0, front: 0 },
  fricAcc: { rear: 0, front: 0 },
  solverIters: 0,
  solverResid: 0,
  penetration: 0
};
bike.pts = [bike.rear, bike.front, bike.head, bike.axleRear, bike.axleFront];
var world = {
  coins: [],
  canisters: [],
  boosts: [],
  decoFore: [],
  decoBack: [],
  particles: [],
  freeGenX: 0,
  prepFuel: 0,
  airScore: 0,
  hazards: [],
  gates: [],
  jumps: [],
  chunks: new Map,
  takenX: new Set,
  chunksDirty: false
};
var uiHooks = {
  onHome: null
};

// src/core/audio.js
var audioCtx = null;
var audioInit = false;
function initAudio() {
  if (audioInit) {
    if (audioCtx && audioCtx.state === "suspended" && audioCtx.resume) {
      try {
        audioCtx.resume();
      } catch (e) {}
    }
    return;
  }
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor)
      return;
    audioCtx = new Ctor;
    audioInit = true;
  } catch (e) {
    audioInit = false;
  }
}
function playTone(freq, dur, type, gain) {
  if (!audioCtx || store.muted)
    return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(gain || 0.08, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}
function playCoinSound() {
  playTone(880, 0.12, "sine", 0.1);
  setTimeout(() => playTone(1320, 0.15, "sine", 0.08), 80);
}
function playCrashSound() {
  playTone(120, 0.3, "sawtooth", 0.12);
  playTone(80, 0.4, "square", 0.08);
}
function playLandSound() {
  playTone(200, 0.1, "sine", 0.06);
}
function playFlipSound() {
  playTone(660, 0.1, "triangle", 0.09);
  setTimeout(() => playTone(990, 0.14, "triangle", 0.07), 70);
}
function playFuelSound() {
  playTone(320, 0.1, "sine", 0.08);
  setTimeout(() => playTone(480, 0.12, "sine", 0.07), 60);
}
function playBoostSound() {
  playTone(520, 0.09, "sawtooth", 0.07);
  setTimeout(() => playTone(900, 0.16, "sine", 0.08), 60);
}
function playAchSound() {
  playTone(784, 0.12, "triangle", 0.09);
  setTimeout(() => playTone(1046, 0.12, "triangle", 0.08), 110);
  setTimeout(() => playTone(1318, 0.2, "triangle", 0.07), 220);
}

// src/core/toast.js
var toastEl = document.getElementById("toast");
var comboEl = document.getElementById("comboTag");
var comboTimer = null;
var TOAST_LEVELS = ["info", "success", "warn", "danger"];
var TOAST_MAX = 2;
var TOAST_QUEUE_MAX = 4;
var TOAST_ICON = { info: "ℹ️", success: "✅", warn: "⚠️", danger: "⛔" };
var live = [];
var queue = [];
function inferLevel(txt) {
  const s = String(txt === undefined || txt === null ? "" : txt);
  if (/⛔|❌|😵|失败|出错|不足|不可用/.test(s))
    return "danger";
  if (/⚠️|🔒|超速|耗尽|紧张|未解锁/.test(s))
    return "warn";
  if (/🏆|🎉|✅|获胜|通过|达成|解锁|已切|已导入|已导出|已重置|新纪录/.test(s))
    return "success";
  return "info";
}
function present(item) {
  if (!toastEl) {
    live.push(item);
    return;
  }
  const el = document.createElement("div");
  el.className = "toastItm " + item.level;
  if (typeof el.setAttribute === "function") {
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", item.level + " 提示：" + item.txt);
  }
  el.textContent = (TOAST_ICON[item.level] || "") + "　" + item.txt;
  if (typeof toastEl.appendChild === "function")
    toastEl.appendChild(el);
  item.el = el;
  live.push(item);
  const show = () => {
    if (el.classList && el.classList.add)
      el.classList.add("show");
  };
  if (typeof requestAnimationFrame === "function")
    requestAnimationFrame(show);
  else
    show();
  item.timer = setTimeout(() => finish(item), item.ms);
}
function finish(item) {
  const i = live.indexOf(item);
  if (i >= 0)
    live.splice(i, 1);
  if (item.timer)
    clearTimeout(item.timer);
  item.timer = 0;
  if (item.el) {
    if (item.el.classList && item.el.classList.remove)
      item.el.classList.remove("show");
    if (typeof item.el.remove === "function")
      item.el.remove();
  }
  const next = queue.shift();
  if (next)
    present(next);
}
function restartTimer(item) {
  if (item.timer)
    clearTimeout(item.timer);
  item.timer = setTimeout(() => finish(item), item.ms);
}
function showToast(txt, ms, level) {
  const lv = TOAST_LEVELS.includes(level) ? level : inferLevel(txt);
  const text = String(txt === undefined || txt === null ? "" : txt);
  const shown = live.find((it) => it.txt === text);
  if (shown) {
    if (ms)
      shown.ms = ms;
    restartTimer(shown);
    return lv;
  }
  const qi = queue.findIndex((it) => it.txt === text);
  if (qi >= 0) {
    if (ms)
      queue[qi].ms = ms;
    return lv;
  }
  const item = { txt: text, ms: ms || 900, level: lv, el: null, timer: 0 };
  if (live.length >= TOAST_MAX) {
    queue.push(item);
    while (queue.length > TOAST_QUEUE_MAX)
      queue.shift();
  } else {
    present(item);
  }
  return lv;
}
function showCombo(txt) {
  if (!comboEl)
    return;
  comboEl.textContent = txt;
  comboEl.style.opacity = 1;
  comboEl.style.transform = "translate(-50%,-50%) scale(1)";
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => {
    comboEl.style.opacity = 0;
    comboEl.style.transform = "translate(-50%,-50%) scale(1.35)";
  }, 1400);
}

// src/config/themes.js
var THEMES = [
  {
    name: "绿野",
    g: 750,
    traction: 1,
    sky: ["#7ec8f7", "#cdeffd", "#eef8fc"],
    sun: "#ffe677",
    pal: ["#3f7d3a", "#58a24f", "#8b5e3c"],
    ground: "#c4a882",
    deco: ["tree", "bush", "flower"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffe677", accent: "#fffbe0", r: 40, x: 0.9, y: 90, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 6, color: "rgba(255,255,255,.75)", alpha: 0.75, parallax: 0.2, w: 120, wVar: 30, spread: 260, yBand: [60, 40] }],
      ridges: [
        { kind: "hills", color: "rgba(85,130,170,.42)", parallax: 0.18, y: 0.5, amp1: 46, f1: 0.0031, amp2: 18, f2: 0.0093, phase: 0.6 },
        { kind: "hills", color: "#9cc5e0", parallax: 0.4, y: 0.62, amp1: 46, f1: 0.01, amp2: 22, f2: 0.03, phase: 0 }
      ],
      haze: null
    },
    surface: { type: "grass", color: "rgba(28,84,38,.45)", color2: "#58a24f" },
    dust: { light: "#c4a882", heavy: "#d9c39a" },
    ambient: { type: "pollen", color: "#eaf6c0", rate: 0.3, spd: 0.3 }
  },
  {
    name: "雪原",
    g: 750,
    traction: 0.72,
    sky: ["#bcd8f2", "#e6f2fd", "#fbfeff"],
    sun: "#fff3c4",
    pal: ["#dbe9f5", "#eef5fb", "#9fb8cc"],
    ground: "#eef5fb",
    deco: ["snowtree", "snowman", "icespike"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#fff3c4", accent: "#fffdf0", r: 38, x: 0.88, y: 80, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 7, color: "rgba(255,255,255,.8)", alpha: 0.8, parallax: 0.2, w: 130, wVar: 30, spread: 280, yBand: [55, 45] }],
      ridges: [
        { kind: "peaks", color: "rgba(140,170,200,.45)", parallax: 0.18, y: 0.5, amp1: 52, f1: 0.0031, amp2: 22, f2: 0.0093, phase: 0.6 },
        { kind: "hills", color: "#dfeefb", parallax: 0.4, y: 0.62, amp1: 46, f1: 0.01, amp2: 22, f2: 0.03, phase: 0 }
      ],
      haze: null
    },
    surface: { type: "snowpuff", color: "rgba(255,255,255,.5)", color2: "rgba(190,215,235,.6)" },
    dust: { light: "#eef5fb", heavy: "#ffffff" },
    ambient: { type: "snow", color: "#ffffff", rate: 0.6, spd: 0.5 }
  },
  {
    name: "荒漠",
    g: 750,
    traction: 0.88,
    sky: ["#ffc46b", "#ffe0b0", "#fff3d8"],
    sun: "#ffd27a",
    pal: ["#c28b4f", "#d9a766", "#7a5a36"],
    ground: "#e6c98f",
    deco: ["cactus", "rock", "pebble"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffe0a0", accent: "#fff6d8", r: 46, x: 0.84, y: 92, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "thin", count: 3, color: "rgba(255,246,220,.55)", alpha: 0.55, parallax: 0.2, w: 150, wVar: 40, spread: 300, yBand: [50, 34] }],
      ridges: [
        { kind: "dunes", color: "rgba(165,115,70,.40)", parallax: 0.18, y: 0.53, amp1: 34, f1: 0.0022, amp2: 14, f2: 0.0071, phase: 0.6 },
        { kind: "dunes", color: "#f6d9a8", parallax: 0.4, y: 0.63, amp1: 32, f1: 0.008, amp2: 16, f2: 0.026, phase: 0 }
      ],
      haze: { color: "rgba(255,225,175,.20)" }
    },
    surface: { type: "sandripple", color: "rgba(120,80,40,.30)", color2: "rgba(200,160,100,.4)" },
    dust: { light: "#e6c98f", heavy: "#d9c39a" },
    ambient: { type: "sand", color: "#e9c98f", rate: 0.5, spd: 0.6 }
  },
  {
    name: "月面",
    g: 350,
    traction: 1,
    sky: ["#05070f", "#0d1326", "#141d3a"],
    sun: "#f6f8ff",
    pal: ["#6a7078", "#828a94", "#4d5259"],
    ground: "#9aa2ad",
    deco: ["moonrock", "crater"],
    bg: {
      space: true,
      celestial: { type: "earth", color: "#3b6ea5", accent: "rgba(120,205,160,.6)", r: 26, x: 0.12, y: 110, parallax: 0.06 },
      starLayers: [{ count: 70, alpha: 0.8, rMax: 1.4, parallax: 0.15, seed: 99 }],
      aurora: { color: "rgba(255,255,255,.14)", count: 14, parallax: 0.2, spread: 431, y0: 80, rowGap: 60, rows: 7, w: 90, wVar: 40, h: 22 },
      cloudLayers: [],
      ridges: [],
      haze: null
    },
    surface: { type: "crater", color: "rgba(28,32,42,.35)", color2: "rgba(120,128,140,.35)" },
    dust: { light: "#9aa2ad", heavy: "#9aa2ad" },
    ambient: { type: "none", color: "#9aa2ad", rate: 0, spd: 0 }
  },
  {
    name: "雨林",
    g: 760,
    traction: 0.92,
    sky: ["#8fd0b0", "#c9ecc9", "#eaf8e2"],
    sun: "#eaffc0",
    pal: ["#245c30", "#3f8a3f", "#5a3a24"],
    ground: "#6b4a2e",
    deco: ["fern", "tree", "stump"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#eaffc0", accent: "#f7ffe0", r: 34, x: 0.86, y: 64, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 8, color: "rgba(240,255,240,.55)", alpha: 0.55, parallax: 0.22, w: 130, wVar: 34, spread: 270, yBand: [45, 42] }],
      ridges: [
        { kind: "treeLine", color: "rgba(40,90,60,.45)", parallax: 0.16, y: 0.52, amp1: 38, f1: 0.006, amp2: 20, f2: 0.017, phase: 1.2 },
        { kind: "treeLine", color: "#2f6b3c", parallax: 0.38, y: 0.64, amp1: 30, f1: 0.012, amp2: 16, f2: 0.03, phase: 0 }
      ],
      haze: { color: "rgba(180,230,190,.18)" }
    },
    surface: { type: "moss", color: "rgba(30,80,40,.5)", color2: "rgba(90,150,70,.5)" },
    dust: { light: "#6b4a2e", heavy: "#8a6a3a" },
    ambient: { type: "mist", color: "#dff5e0", rate: 0.5, spd: 0.25 }
  },
  {
    name: "火山",
    g: 900,
    traction: 0.86,
    sky: ["#3a0f0f", "#7a2a15", "#c65a1e"],
    sun: "#ff8a3d",
    pal: ["#3a2b28", "#5a3a30", "#1c1412"],
    ground: "#4a2f26",
    deco: ["lavarock", "obsidian"],
    bg: {
      space: false,
      celestial: { type: "redGiant", color: "#ff7a2a", accent: "#ffd08a", r: 52, x: 0.78, y: 110, parallax: 0.04 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "storm", count: 5, color: "rgba(60,30,30,.55)", alpha: 0.55, parallax: 0.24, w: 160, wVar: 40, spread: 320, yBand: [50, 45] }],
      ridges: [
        { kind: "peaks", color: "rgba(60,25,20,.6)", parallax: 0.18, y: 0.5, amp1: 70, f1: 0.004, amp2: 26, f2: 0.012, phase: 0.4 },
        { kind: "peaks", color: "#2a1815", parallax: 0.42, y: 0.62, amp1: 55, f1: 0.008, amp2: 24, f2: 0.02, phase: 2.1 }
      ],
      haze: { color: "rgba(120,40,20,.18)" }
    },
    surface: { type: "lava", color: "rgba(255,120,40,.75)", color2: "rgba(255,200,80,.55)" },
    dust: { light: "#4a2f26", heavy: "#8a5a3a" },
    ambient: { type: "ember", color: "#ff9040", rate: 0.7, spd: 0.5 }
  },
  {
    name: "冰川",
    g: 740,
    traction: 0.62,
    sky: ["#9fd4f0", "#d8f0fb", "#f4fbff"],
    sun: "#ffffff",
    pal: ["#bfe0ee", "#e6f6fd", "#7ba8c4"],
    ground: "#dff2fa",
    deco: ["iceberg", "icespike", "crystal"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#eaf7ff", accent: "#ffffff", r: 34, x: 0.16, y: 80, parallax: 0.05 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "thin", count: 5, color: "rgba(255,255,255,.6)", alpha: 0.6, parallax: 0.2, w: 170, wVar: 40, spread: 310, yBand: [50, 46] }],
      ridges: [
        { kind: "iceberg", color: "rgba(150,190,215,.5)", parallax: 0.16, y: 0.5, amp1: 58, f1: 0.0032, amp2: 22, f2: 0.009, phase: 0.9 },
        { kind: "iceberg", color: "#dff2fa", parallax: 0.4, y: 0.62, amp1: 48, f1: 0.009, amp2: 24, f2: 0.026, phase: 0 }
      ],
      haze: null
    },
    surface: { type: "frost", color: "rgba(255,255,255,.6)", color2: "rgba(160,215,245,.5)" },
    dust: { light: "#dff2fa", heavy: "#ffffff" },
    ambient: { type: "snow", color: "#dff2fa", rate: 0.5, spd: 0.5 }
  },
  {
    name: "红岩峡谷",
    g: 760,
    traction: 0.9,
    sky: ["#f2a15c", "#f7c98a", "#fbe3bd"],
    sun: "#ffd68a",
    pal: ["#9c4a2a", "#c26a3a", "#5a2f1c"],
    ground: "#b5643a",
    deco: ["mesarock", "rock"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffe0a0", accent: "#fff2cf", r: 38, x: 0.88, y: 100, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "thin", count: 3, color: "rgba(255,235,210,.5)", alpha: 0.5, parallax: 0.2, w: 160, wVar: 40, spread: 300, yBand: [48, 40] }],
      ridges: [
        { kind: "mesa", color: "rgba(150,80,45,.45)", parallax: 0.18, y: 0.5, amp1: 52, f1: 0.0035, amp2: 20, f2: 0.01, phase: 1.5 },
        { kind: "mesa", color: "#d98a5a", parallax: 0.42, y: 0.62, amp1: 44, f1: 0.008, amp2: 22, f2: 0.024, phase: 0 }
      ],
      haze: { color: "rgba(240,180,130,.16)" }
    },
    surface: { type: "strata", color: "rgba(90,45,25,.35)", color2: "rgba(200,130,90,.4)" },
    dust: { light: "#b5643a", heavy: "#d98a5a" },
    ambient: { type: "sand", color: "#d98a5a", rate: 0.4, spd: 0.5 }
  },
  {
    name: "沼泽",
    g: 720,
    traction: 0.7,
    sky: ["#6d7f6a", "#9fb39a", "#c9d6c2"],
    sun: "#e6e7b0",
    pal: ["#3e4a32", "#556843", "#2a3324"],
    ground: "#4a5238",
    deco: ["reed", "stump"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#e6e7b0", accent: "#f2f2cc", r: 30, x: 0.2, y: 90, parallax: 0.05 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "storm", count: 6, color: "rgba(150,160,150,.5)", alpha: 0.5, parallax: 0.22, w: 150, wVar: 36, spread: 300, yBand: [45, 40] }],
      ridges: [
        { kind: "treeLine", color: "rgba(60,70,55,.5)", parallax: 0.16, y: 0.52, amp1: 30, f1: 0.005, amp2: 14, f2: 0.015, phase: 0.7 },
        { kind: "hills", color: "#556843", parallax: 0.4, y: 0.64, amp1: 26, f1: 0.01, amp2: 12, f2: 0.028, phase: 0 }
      ],
      haze: { color: "rgba(180,190,170,.22)" }
    },
    surface: { type: "puddle", color: "rgba(40,60,50,.45)", color2: "rgba(120,160,150,.4)" },
    dust: { light: "#4a5238", heavy: "#6a7a50" },
    ambient: { type: "mist", color: "#c9d6c2", rate: 0.6, spd: 0.2 }
  },
  {
    name: "城市废墟",
    g: 780,
    traction: 1,
    sky: ["#8a93a8", "#b9c0d0", "#dfe3ec"],
    sun: "#f4f6ff",
    pal: ["#6a6e76", "#8a9098", "#4a4e56"],
    ground: "#7a7f88",
    deco: ["ruin", "rubble", "pillar"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#f4f6ff", accent: "#ffffff", r: 30, x: 0.8, y: 70, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "thin", count: 4, color: "rgba(255,255,255,.5)", alpha: 0.5, parallax: 0.2, w: 160, wVar: 36, spread: 300, yBand: [50, 40] }],
      ridges: [
        { kind: "ruin", color: "rgba(80,85,95,.55)", parallax: 0.16, y: 0.5, amp1: 60, f1: 0.004, amp2: 24, f2: 0.012, phase: 2.4 },
        { kind: "ruin", color: "#aab0bc", parallax: 0.4, y: 0.62, amp1: 50, f1: 0.008, amp2: 22, f2: 0.024, phase: 0 }
      ],
      haze: { color: "rgba(200,205,215,.14)" }
    },
    surface: { type: "debris", color: "rgba(50,52,60,.4)", color2: "rgba(150,152,162,.45)" },
    dust: { light: "#7a7f88", heavy: "#a0a4ac" },
    ambient: { type: "dust", color: "#b0b4bc", rate: 0.4, spd: 0.4 }
  },
  {
    name: "天空浮岛",
    g: 520,
    traction: 1,
    sky: ["#5aa8e6", "#a8d8f5", "#eaf6ff"],
    sun: "#fff4c8",
    pal: ["#6aa86a", "#9ccb7a", "#b9a98a"],
    ground: "#cfe3a0",
    deco: ["cloudpuff", "bush"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#fff4c8", accent: "#fffbe8", r: 44, x: 0.85, y: 80, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [
        { kind: "soft", count: 10, color: "rgba(255,255,255,.85)", alpha: 0.85, parallax: 0.24, w: 140, wVar: 40, spread: 300, yBand: [60, 60] },
        { kind: "thin", count: 6, color: "rgba(255,255,255,.5)", alpha: 0.5, parallax: 0.12, w: 190, wVar: 50, spread: 360, yBand: [40, 30] }
      ],
      ridges: [
        { kind: "island", color: "rgba(120,160,190,.4)", parallax: 0.18, y: 0.5, amp1: 60, f1: 0.003, amp2: 26, f2: 0.009, phase: 1.1 },
        { kind: "island", color: "#cfe3a0", parallax: 0.42, y: 0.64, amp1: 50, f1: 0.008, amp2: 24, f2: 0.022, phase: 0 }
      ],
      haze: { color: "rgba(220,240,255,.18)" }
    },
    surface: { type: "cloudtuft", color: "rgba(255,255,255,.5)", color2: "#9ccb7a" },
    dust: { light: "#eaf6ff", heavy: "#ffffff" },
    ambient: { type: "none", color: "#ffffff", rate: 0, spd: 0 }
  },
  {
    name: "极夜星空",
    g: 740,
    traction: 0.8,
    sky: ["#04060e", "#0a1424", "#10203a"],
    sun: "#cfe0ff",
    pal: ["#3a4a5a", "#4f6478", "#2a3642"],
    ground: "#5a6a7a",
    deco: ["pine", "crystal"],
    bg: {
      space: true,
      celestial: { type: "moon", color: "#dfe8ff", accent: "rgba(160,180,210,.6)", r: 34, x: 0.82, y: 80, parallax: 0.05 },
      starLayers: [
        { count: 90, alpha: 0.85, rMax: 1.5, parallax: 0.12, seed: 2024 },
        { count: 40, alpha: 0.5, rMax: 2.2, parallax: 0.06, seed: 777 }
      ],
      aurora: { color: "rgba(110,255,190,.16)", count: 8, parallax: 0.08, spread: 260, y0: 60, rowGap: 40, rows: 4, w: 130, wVar: 50, h: 18 },
      cloudLayers: [],
      ridges: [
        { kind: "peaks", color: "rgba(40,55,75,.6)", parallax: 0.16, y: 0.5, amp1: 64, f1: 0.0035, amp2: 24, f2: 0.011, phase: 1.9 },
        { kind: "peaks", color: "#2a3a4a", parallax: 0.4, y: 0.62, amp1: 50, f1: 0.009, amp2: 22, f2: 0.026, phase: 0 }
      ],
      haze: { color: "rgba(60,90,140,.12)" }
    },
    surface: { type: "iceglow", color: "rgba(140,200,255,.5)", color2: "rgba(90,150,220,.4)" },
    dust: { light: "#5a6a7a", heavy: "#8ab0d0" },
    ambient: { type: "snow", color: "#bfe0ff", rate: 0.6, spd: 0.5 }
  },
  {
    name: "雾都",
    g: 780,
    traction: 0.94,
    sky: ["#6d7684", "#9aa4b0", "#cdd4dc"],
    sun: "#eef2f7",
    pal: ["#4e545e", "#6a7078", "#33373e"],
    ground: "#7a808a",
    deco: ["pillar", "ruin", "rubble"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#e8eef4", accent: "#ffffff", r: 24, x: 0.8, y: 58, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [
        { kind: "storm", count: 8, color: "rgba(150,160,172,.55)", alpha: 0.55, parallax: 0.16, w: 190, wVar: 46, spread: 340, yBand: [40, 40] },
        { kind: "soft", count: 5, color: "rgba(210,216,224,.45)", alpha: 0.45, parallax: 0.24, w: 210, wVar: 50, spread: 380, yBand: [96, 42] }
      ],
      ridges: [
        { kind: "ruin", color: "rgba(92,98,108,.55)", parallax: 0.15, y: 0.5, amp1: 66, f1: 0.0042, amp2: 26, f2: 0.012, phase: 1.7 },
        { kind: "ruin", color: "#b3bcc7", parallax: 0.38, y: 0.62, amp1: 52, f1: 0.0084, amp2: 22, f2: 0.023, phase: 0 }
      ],
      haze: { color: "rgba(200,208,218,.30)" }
    },
    surface: { type: "debris", color: "rgba(48,52,60,.42)", color2: "rgba(158,164,174,.45)" },
    dust: { light: "#7a808a", heavy: "#a6acb6" },
    ambient: { type: "mist", color: "#dbe1e9", rate: 0.7, spd: 0.16 }
  },
  {
    name: "稻田",
    g: 750,
    traction: 0.86,
    sky: ["#8fc8dc", "#cce8dc", "#f2f8e4"],
    sun: "#f6ffd4",
    pal: ["#3e7038", "#5c9042", "#5e4a28"],
    ground: "#8aa05c",
    deco: ["reed", "fern", "bush"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#f2ffcc", accent: "#fbffe8", r: 32, x: 0.24, y: 72, parallax: 0.04 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 7, color: "rgba(255,255,255,.6)", alpha: 0.6, parallax: 0.2, w: 150, wVar: 34, spread: 300, yBand: [44, 38] }],
      ridges: [
        { kind: "hills", color: "rgba(120,146,100,.42)", parallax: 0.17, y: 0.51, amp1: 28, f1: 0.0025, amp2: 13, f2: 0.0074, phase: 1.4 },
        { kind: "hills", color: "#a6cf7e", parallax: 0.4, y: 0.63, amp1: 24, f1: 0.0078, amp2: 12, f2: 0.026, phase: 0 }
      ],
      haze: { color: "rgba(226,238,208,.22)" }
    },
    surface: { type: "puddle", color: "rgba(46,76,40,.38)", color2: "rgba(150,186,110,.42)" },
    dust: { light: "#8aa05c", heavy: "#b4c88a" },
    ambient: { type: "mist", color: "#e4f2d4", rate: 0.5, spd: 0.14 }
  },
  {
    name: "石林",
    g: 762,
    traction: 0.88,
    sky: ["#7fb6c8", "#bcdcd8", "#e8f4ee"],
    sun: "#f0ffe0",
    pal: ["#2f5c48", "#457a5e", "#24402f"],
    ground: "#7d9686",
    deco: ["mesarock", "rock", "pebble"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ecffe0", accent: "#faffec", r: 30, x: 0.82, y: 68, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "thin", count: 6, color: "rgba(255,255,255,.5)", alpha: 0.5, parallax: 0.2, w: 165, wVar: 40, spread: 310, yBand: [48, 34] }],
      ridges: [
        { kind: "peaks", color: "rgba(74,110,90,.46)", parallax: 0.16, y: 0.5, amp1: 70, f1: 0.0036, amp2: 26, f2: 0.011, phase: 0.9 },
        { kind: "peaks", color: "#7ba78c", parallax: 0.38, y: 0.62, amp1: 52, f1: 0.0088, amp2: 22, f2: 0.025, phase: 0 }
      ],
      haze: { color: "rgba(200,226,214,.22)" }
    },
    surface: { type: "strata", color: "rgba(38,70,52,.36)", color2: "rgba(150,190,164,.4)" },
    dust: { light: "#7d9686", heavy: "#a8c2ac" },
    ambient: { type: "pollen", color: "#e6f6c8", rate: 0.35, spd: 0.28 }
  },
  {
    name: "湖岸",
    g: 745,
    traction: 1.05,
    sky: ["#5aa6e0", "#a8d8f0", "#e8f8ff"],
    sun: "#fff2c0",
    pal: ["#26584e", "#3d8070", "#1c4238"],
    ground: "#a08e66",
    deco: ["bush", "tree", "pebble"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#fff0bc", accent: "#fffae4", r: 36, x: 0.88, y: 86, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 6, color: "rgba(255,255,255,.72)", alpha: 0.72, parallax: 0.2, w: 145, wVar: 34, spread: 295, yBand: [50, 36] }],
      ridges: [
        { kind: "hills", color: "rgba(96,142,150,.4)", parallax: 0.17, y: 0.51, amp1: 42, f1: 0.003, amp2: 18, f2: 0.009, phase: 2.3 },
        { kind: "hills", color: "#84c8c4", parallax: 0.4, y: 0.63, amp1: 32, f1: 0.009, amp2: 15, f2: 0.027, phase: 0 }
      ],
      haze: { color: "rgba(210,236,244,.22)" }
    },
    surface: { type: "puddle", color: "rgba(28,72,68,.36)", color2: "rgba(140,200,205,.42)" },
    dust: { light: "#a08e66", heavy: "#cbb68e" },
    ambient: { type: "pollen", color: "#eef8d4", rate: 0.3, spd: 0.24 }
  },
  {
    name: "高原",
    g: 872,
    traction: 1,
    sky: ["#3a7ec8", "#8cbcec", "#e2ecf8"],
    sun: "#fffce4",
    pal: ["#6a6440", "#8c8252", "#463e26"],
    ground: "#b0a478",
    deco: ["rock", "bush", "pebble"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#fffae0", accent: "#fffff8", r: 40, x: 0.82, y: 56, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [
        { kind: "soft", count: 8, color: "rgba(255,255,255,.8)", alpha: 0.8, parallax: 0.22, w: 135, wVar: 32, spread: 285, yBand: [40, 40] },
        { kind: "thin", count: 4, color: "rgba(255,255,255,.5)", alpha: 0.5, parallax: 0.12, w: 200, wVar: 50, spread: 360, yBand: [98, 30] }
      ],
      ridges: [
        { kind: "hills", color: "rgba(126,118,86,.4)", parallax: 0.15, y: 0.52, amp1: 38, f1: 0.0022, amp2: 16, f2: 0.0065, phase: 1.9 },
        { kind: "hills", color: "#cbb478", parallax: 0.36, y: 0.64, amp1: 30, f1: 0.0072, amp2: 13, f2: 0.023, phase: 0 }
      ],
      haze: { color: "rgba(228,226,240,.24)" }
    },
    surface: { type: "grass", color: "rgba(92,88,44,.35)", color2: "#8c8252" },
    dust: { light: "#b0a478", heavy: "#d6c89c" },
    ambient: { type: "dust", color: "#e2dcc2", rate: 0.4, spd: 0.42 }
  },
  {
    name: "熔岩台地",
    g: 860,
    traction: 0.9,
    sky: ["#280e12", "#5a1a16", "#a83c1c"],
    sun: "#ff7028",
    pal: ["#2c2224", "#463633", "#181214"],
    ground: "#3a2f2d",
    deco: ["obsidian", "lavarock"],
    bg: {
      space: false,
      celestial: { type: "redGiant", color: "#ff6a1e", accent: "#ffc078", r: 44, x: 0.7, y: 112, parallax: 0.04 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "storm", count: 6, color: "rgba(48,24,24,.6)", alpha: 0.6, parallax: 0.22, w: 175, wVar: 42, spread: 330, yBand: [46, 42] }],
      ridges: [
        { kind: "mesa", color: "rgba(46,20,18,.62)", parallax: 0.16, y: 0.5, amp1: 68, f1: 0.0032, amp2: 24, f2: 0.0098, phase: 0.5 },
        { kind: "mesa", color: "#2a1614", parallax: 0.4, y: 0.62, amp1: 50, f1: 0.0082, amp2: 22, f2: 0.023, phase: 0 }
      ],
      haze: { color: "rgba(112,36,22,.22)" }
    },
    surface: { type: "lava", color: "rgba(255,110,40,.7)", color2: "rgba(255,190,80,.5)" },
    dust: { light: "#3a2f2d", heavy: "#7a5240" },
    ambient: { type: "ember", color: "#ff7c34", rate: 0.7, spd: 0.45 }
  },
  {
    name: "盐湖",
    g: 748,
    traction: 1.12,
    sky: ["#8ec2e2", "#cfe2f0", "#fbfdff"],
    sun: "#ffffff",
    pal: ["#dce4ea", "#eef2f6", "#a8b2bc"],
    ground: "#f2f5f8",
    deco: ["rock", "pebble", "crater"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffffff", accent: "#ffffff", r: 48, x: 0.88, y: 100, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "thin", count: 3, color: "rgba(255,255,255,.5)", alpha: 0.5, parallax: 0.18, w: 195, wVar: 46, spread: 345, yBand: [52, 30] }],
      ridges: [
        { kind: "hills", color: "rgba(162,182,198,.32)", parallax: 0.14, y: 0.54, amp1: 20, f1: 0.002, amp2: 10, f2: 0.006, phase: 0.6 },
        { kind: "hills", color: "#dbe6ee", parallax: 0.36, y: 0.66, amp1: 16, f1: 0.007, amp2: 9, f2: 0.022, phase: 0 }
      ],
      haze: { color: "rgba(255,255,255,.26)" }
    },
    surface: { type: "frost", color: "rgba(255,255,255,.55)", color2: "rgba(178,200,220,.45)" },
    dust: { light: "#f2f5f8", heavy: "#ffffff" },
    ambient: { type: "dust", color: "#ffffff", rate: 0.3, spd: 0.55 }
  },
  {
    name: "赛博都市",
    g: 792,
    traction: 1.08,
    sky: ["#160a2e", "#3c1466", "#6a2a8a"],
    sun: "#ff5ad8",
    pal: ["#2e2450", "#483a6e", "#181430"],
    ground: "#4a4470",
    deco: ["pillar", "ruin", "obsidian"],
    bg: {
      space: false,
      celestial: { type: "ringed", color: "#ff6ad8", accent: "#7ae8ff", r: 30, x: 0.24, y: 68, parallax: 0.06 },
      starLayers: [],
      aurora: { color: "rgba(120,220,255,.12)", count: 7, parallax: 0.1, spread: 280, y0: 56, rowGap: 40, rows: 4, w: 130, wVar: 50, h: 18 },
      cloudLayers: [{ kind: "storm", count: 6, color: "rgba(70,26,96,.55)", alpha: 0.55, parallax: 0.24, w: 175, wVar: 44, spread: 330, yBand: [42, 40] }],
      ridges: [
        { kind: "ruin", color: "rgba(46,22,70,.6)", parallax: 0.15, y: 0.5, amp1: 78, f1: 0.0044, amp2: 28, f2: 0.013, phase: 1.1 },
        { kind: "ruin", color: "#6a4a92", parallax: 0.38, y: 0.62, amp1: 56, f1: 0.0086, amp2: 24, f2: 0.024, phase: 0 }
      ],
      haze: { color: "rgba(96,36,130,.24)" }
    },
    surface: { type: "debris", color: "rgba(26,18,44,.45)", color2: "rgba(140,96,220,.42)" },
    dust: { light: "#4a4470", heavy: "#7a6aa8" },
    ambient: { type: "rain", color: "#8ad8ff", rate: 0.6, spd: 0.6 }
  },
  {
    name: "云海日出",
    g: 700,
    traction: 1,
    sky: ["#e07a5c", "#f7b489", "#ffeed6"],
    sun: "#ffd28a",
    pal: ["#8a7a8a", "#b8a2ae", "#5e5266"],
    ground: "#e0c8c0",
    deco: ["cloudpuff", "bush"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffcf86", accent: "#fff0d0", r: 50, x: 0.78, y: 94, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [
        { kind: "soft", count: 12, color: "rgba(255,238,226,.85)", alpha: 0.85, parallax: 0.26, w: 155, wVar: 44, spread: 310, yBand: [86, 54] },
        { kind: "thin", count: 5, color: "rgba(255,220,190,.5)", alpha: 0.5, parallax: 0.12, w: 210, wVar: 52, spread: 380, yBand: [40, 30] }
      ],
      ridges: [
        { kind: "island", color: "rgba(170,140,150,.36)", parallax: 0.16, y: 0.52, amp1: 58, f1: 0.0028, amp2: 24, f2: 0.0086, phase: 0.7 },
        { kind: "island", color: "#f2d6c4", parallax: 0.4, y: 0.65, amp1: 46, f1: 0.008, amp2: 22, f2: 0.023, phase: 0 }
      ],
      haze: { color: "rgba(255,225,205,.22)" }
    },
    surface: { type: "cloudtuft", color: "rgba(255,255,255,.55)", color2: "#b8a2ae" },
    dust: { light: "#e0c8c0", heavy: "#f8ece4" },
    ambient: { type: "mist", color: "#ffece0", rate: 0.6, spd: 0.14 }
  },
  {
    name: "苔原",
    g: 742,
    traction: 0.74,
    sky: ["#93a8b4", "#c2d2d6", "#eaf2f2"],
    sun: "#f4faf6",
    pal: ["#4e5c48", "#6c7c60", "#33402e"],
    ground: "#7f8c74",
    deco: ["snowtree", "pine", "rock"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#eef6f4", accent: "#ffffff", r: 26, x: 0.2, y: 62, parallax: 0.05 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "storm", count: 7, color: "rgba(180,196,198,.48)", alpha: 0.48, parallax: 0.2, w: 160, wVar: 38, spread: 305, yBand: [44, 40] }],
      ridges: [
        { kind: "hills", color: "rgba(96,112,98,.42)", parallax: 0.16, y: 0.52, amp1: 34, f1: 0.0026, amp2: 15, f2: 0.0078, phase: 2.6 },
        { kind: "hills", color: "#b6c6b8", parallax: 0.38, y: 0.64, amp1: 28, f1: 0.0082, amp2: 13, f2: 0.026, phase: 0 }
      ],
      haze: { color: "rgba(210,222,218,.24)" }
    },
    surface: { type: "moss", color: "rgba(52,72,48,.45)", color2: "rgba(130,160,120,.45)" },
    dust: { light: "#7f8c74", heavy: "#a8b4a0" },
    ambient: { type: "snow", color: "#f4fbf8", rate: 0.4, spd: 0.4 }
  },
  {
    name: "戈壁滩",
    g: 756,
    traction: 0.9,
    sky: ["#d9b07a", "#eecf9e", "#fbeccd"],
    sun: "#ffdc9a",
    pal: ["#9a7a4e", "#b89a66", "#6a5030"],
    ground: "#c8ac78",
    deco: ["rock", "pebble", "flower"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffe8b4", accent: "#fff8e0", r: 42, x: 0.84, y: 96, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "thin", count: 4, color: "rgba(255,245,220,.5)", alpha: 0.5, parallax: 0.2, w: 175, wVar: 44, spread: 320, yBand: [50, 32] }],
      ridges: [
        { kind: "dunes", color: "rgba(150,110,70,.36)", parallax: 0.17, y: 0.52, amp1: 30, f1: 0.0021, amp2: 13, f2: 0.0068, phase: 1.2 },
        { kind: "dunes", color: "#d8c49a", parallax: 0.4, y: 0.64, amp1: 26, f1: 0.0076, amp2: 12, f2: 0.025, phase: 0 }
      ],
      haze: { color: "rgba(240,215,175,.22)" }
    },
    surface: { type: "sandripple", color: "rgba(110,80,50,.28)", color2: "rgba(200,175,130,.38)" },
    dust: { light: "#c8ac78", heavy: "#ddc596" },
    ambient: { type: "sand", color: "#e2c894", rate: 0.55, spd: 0.68 }
  },
  {
    name: "雪谷",
    g: 768,
    traction: 0.66,
    sky: ["#a8c6e2", "#d8e8f6", "#fbfdff"],
    sun: "#f4f8ff",
    pal: ["#c8dcec", "#e6f0fa", "#8fa8c0"],
    ground: "#dcecf8",
    deco: ["snowtree", "icespike", "snowman"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#eef6ff", accent: "#ffffff", r: 30, x: 0.3, y: 54, parallax: 0.06 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "storm", count: 6, color: "rgba(240,248,255,.6)", alpha: 0.6, parallax: 0.2, w: 170, wVar: 40, spread: 320, yBand: [46, 38] }],
      ridges: [
        { kind: "peaks", color: "rgba(130,158,188,.46)", parallax: 0.15, y: 0.5, amp1: 84, f1: 0.0032, amp2: 28, f2: 0.0096, phase: 1.3 },
        { kind: "peaks", color: "#cfdfef", parallax: 0.36, y: 0.62, amp1: 58, f1: 0.0082, amp2: 24, f2: 0.025, phase: 0 }
      ],
      haze: { color: "rgba(225,240,252,.26)" }
    },
    surface: { type: "snowpuff", color: "rgba(255,255,255,.55)", color2: "rgba(186,212,236,.55)" },
    dust: { light: "#dcecf8", heavy: "#ffffff" },
    ambient: { type: "snow", color: "#ffffff", rate: 0.65, spd: 0.5 }
  },
  {
    name: "冰晶湖",
    g: 734,
    traction: 0.64,
    sky: ["#081428", "#123050", "#245070"],
    sun: "#cfe8ff",
    pal: ["#3c6a86", "#6ea8c4", "#2a4a5e"],
    ground: "#b8dcec",
    deco: ["crystal", "iceberg", "icespike"],
    bg: {
      space: true,
      celestial: { type: "moon", color: "#e2f2ff", accent: "rgba(150,196,226,.6)", r: 32, x: 0.78, y: 66, parallax: 0.05 },
      starLayers: [
        { count: 80, alpha: 0.82, rMax: 1.5, parallax: 0.12, seed: 5050 },
        { count: 34, alpha: 0.45, rMax: 2.2, parallax: 0.06, seed: 1616 }
      ],
      aurora: { color: "rgba(120,220,255,.13)", count: 7, parallax: 0.09, spread: 280, y0: 58, rowGap: 38, rows: 4, w: 140, wVar: 52, h: 18 },
      cloudLayers: [],
      ridges: [
        { kind: "island", color: "rgba(60,110,150,.48)", parallax: 0.16, y: 0.5, amp1: 52, f1: 0.003, amp2: 22, f2: 0.009, phase: 2.4 },
        { kind: "island", color: "#9ec8dc", parallax: 0.38, y: 0.62, amp1: 44, f1: 0.0084, amp2: 20, f2: 0.025, phase: 0 }
      ],
      haze: { color: "rgba(56,108,150,.16)" }
    },
    surface: { type: "iceglow", color: "rgba(150,220,255,.5)", color2: "rgba(80,150,210,.4)" },
    dust: { light: "#b8dcec", heavy: "#8ac0e0" },
    ambient: { type: "snow", color: "#d8f0ff", rate: 0.5, spd: 0.42 }
  },
  {
    name: "草原",
    g: 750,
    traction: 1.05,
    sky: ["#6ab0e8", "#b6d8f2", "#f4f8dc"],
    sun: "#fff4b0",
    pal: ["#5c8438", "#82a84c", "#6a4e28"],
    ground: "#a8b866",
    deco: ["bush", "flower", "tree"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#fff0a4", accent: "#fffbe0", r: 40, x: 0.9, y: 88, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 6, color: "rgba(255,255,255,.7)", alpha: 0.7, parallax: 0.2, w: 155, wVar: 36, spread: 300, yBand: [48, 36] }],
      ridges: [
        { kind: "hills", color: "rgba(130,155,90,.4)", parallax: 0.17, y: 0.51, amp1: 28, f1: 0.0024, amp2: 13, f2: 0.0074, phase: 0.4 },
        { kind: "hills", color: "#c4d486", parallax: 0.4, y: 0.63, amp1: 24, f1: 0.0078, amp2: 12, f2: 0.025, phase: 0 }
      ],
      haze: { color: "rgba(235,240,205,.2)" }
    },
    surface: { type: "grass", color: "rgba(70,96,34,.42)", color2: "#82a84c" },
    dust: { light: "#a8b866", heavy: "#ccd894" },
    ambient: { type: "pollen", color: "#f4f8bc", rate: 0.45, spd: 0.35 }
  },
  {
    name: "热泉阶地",
    g: 748,
    traction: 0.7,
    sky: ["#8ca8a0", "#c4dcd0", "#eef6ec"],
    sun: "#fff0c8",
    pal: ["#3c5a44", "#5a7a58", "#6a4436"],
    ground: "#8a9478",
    deco: ["reed", "bush", "stump"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffeec4", accent: "#fffbe4", r: 32, x: 0.26, y: 76, parallax: 0.04 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 8, color: "rgba(250,255,248,.6)", alpha: 0.6, parallax: 0.22, w: 165, wVar: 40, spread: 310, yBand: [46, 38] }],
      ridges: [
        { kind: "hills", color: "rgba(90,120,100,.44)", parallax: 0.16, y: 0.52, amp1: 42, f1: 0.0034, amp2: 18, f2: 0.01, phase: 2 },
        { kind: "hills", color: "#a9c4a2", parallax: 0.38, y: 0.64, amp1: 34, f1: 0.0088, amp2: 16, f2: 0.026, phase: 0 }
      ],
      haze: { color: "rgba(225,238,222,.28)" }
    },
    surface: { type: "puddle", color: "rgba(40,66,52,.38)", color2: "rgba(150,200,160,.42)" },
    dust: { light: "#8a9478", heavy: "#b0b896" },
    ambient: { type: "mist", color: "#e8f4e4", rate: 0.65, spd: 0.2 }
  },
  {
    name: "溪谷",
    g: 754,
    traction: 0.82,
    sky: ["#7ab0c8", "#bcdcd8", "#e8f6ea"],
    sun: "#f4ffdc",
    pal: ["#2c5a38", "#427e44", "#4f3a24"],
    ground: "#6f7a52",
    deco: ["fern", "tree", "stump"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#eefcdc", accent: "#f8ffe8", r: 32, x: 0.22, y: 70, parallax: 0.05 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "storm", count: 7, color: "rgba(200,225,220,.5)", alpha: 0.5, parallax: 0.22, w: 150, wVar: 36, spread: 300, yBand: [42, 38] }],
      ridges: [
        { kind: "treeLine", color: "rgba(40,86,54,.46)", parallax: 0.16, y: 0.52, amp1: 42, f1: 0.0044, amp2: 20, f2: 0.014, phase: 1.6 },
        { kind: "treeLine", color: "#3f7a4a", parallax: 0.38, y: 0.64, amp1: 34, f1: 0.0098, amp2: 17, f2: 0.028, phase: 0 }
      ],
      haze: { color: "rgba(200,228,210,.24)" }
    },
    surface: { type: "puddle", color: "rgba(30,70,50,.4)", color2: "rgba(150,200,190,.42)" },
    dust: { light: "#6f7a52", heavy: "#94a074" },
    ambient: { type: "rain", color: "#d8f0e4", rate: 0.6, spd: 0.55 }
  },
  {
    name: "孤峰",
    g: 864,
    traction: 0.93,
    sky: ["#6a9fd0", "#b6d0e8", "#f8efdc"],
    sun: "#fff0c8",
    pal: ["#9c4c2e", "#c46e42", "#5e2e1c"],
    ground: "#b06840",
    deco: ["mesarock", "cactus", "rock"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffe8b8", accent: "#fff8e0", r: 36, x: 0.88, y: 102, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "thin", count: 4, color: "rgba(255,250,235,.55)", alpha: 0.55, parallax: 0.2, w: 165, wVar: 42, spread: 310, yBand: [48, 36] }],
      ridges: [
        { kind: "mesa", color: "rgba(160,88,50,.42)", parallax: 0.16, y: 0.5, amp1: 74, f1: 0.0034, amp2: 24, f2: 0.01, phase: 0.2 },
        { kind: "mesa", color: "#c98a5e", parallax: 0.4, y: 0.62, amp1: 56, f1: 0.0084, amp2: 22, f2: 0.024, phase: 0 }
      ],
      haze: { color: "rgba(240,200,160,.18)" }
    },
    surface: { type: "strata", color: "rgba(96,44,24,.36)", color2: "rgba(210,140,96,.4)" },
    dust: { light: "#b06840", heavy: "#d69a72" },
    ambient: { type: "dust", color: "#e8c8a4", rate: 0.45, spd: 0.5 }
  },
  {
    name: "珊瑚浅滩",
    g: 800,
    traction: 0.68,
    sky: ["#0e6a86", "#2fa0b4", "#8fd8d8"],
    sun: "#e8fff4",
    pal: ["#1a5a68", "#2e8c94", "#0e3c48"],
    ground: "#e0d8bc",
    deco: ["crystal", "iceberg", "pebble"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#d8fff0", accent: "#f0fff8", r: 44, x: 0.7, y: 46, parallax: 0.04 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 9, color: "rgba(200,255,250,.4)", alpha: 0.4, parallax: 0.24, w: 170, wVar: 46, spread: 330, yBand: [30, 44] }],
      ridges: [
        { kind: "island", color: "rgba(30,110,124,.4)", parallax: 0.16, y: 0.52, amp1: 44, f1: 0.0028, amp2: 20, f2: 0.0084, phase: 1.8 },
        { kind: "island", color: "#63c2c8", parallax: 0.4, y: 0.64, amp1: 38, f1: 0.0082, amp2: 18, f2: 0.024, phase: 0 }
      ],
      haze: { color: "rgba(120,220,220,.30)" }
    },
    surface: { type: "frost", color: "rgba(200,250,250,.4)", color2: "rgba(90,190,200,.4)" },
    dust: { light: "#e0d8bc", heavy: "#f0ece0" },
    ambient: { type: "mist", color: "#c8f0ee", rate: 0.55, spd: 0.2 }
  },
  {
    name: "雾松林",
    g: 742,
    traction: 0.8,
    sky: ["#7a8c8a", "#b0c4bc", "#dce8e2"],
    sun: "#eaf2e6",
    pal: ["#2e4a38", "#436a4c", "#24382a"],
    ground: "#5f6e50",
    deco: ["pine", "fern", "stump"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#e6f0e2", accent: "#f6fcf2", r: 26, x: 0.2, y: 60, parallax: 0.05 },
      starLayers: [],
      aurora: null,
      cloudLayers: [
        { kind: "soft", count: 8, color: "rgba(220,232,226,.55)", alpha: 0.55, parallax: 0.2, w: 175, wVar: 44, spread: 320, yBand: [42, 38] },
        { kind: "storm", count: 4, color: "rgba(190,204,198,.4)", alpha: 0.4, parallax: 0.1, w: 210, wVar: 50, spread: 370, yBand: [100, 32] }
      ],
      ridges: [
        { kind: "treeLine", color: "rgba(40,66,48,.5)", parallax: 0.15, y: 0.52, amp1: 36, f1: 0.0052, amp2: 18, f2: 0.015, phase: 2.8 },
        { kind: "treeLine", color: "#4a6b52", parallax: 0.38, y: 0.64, amp1: 30, f1: 0.0104, amp2: 15, f2: 0.029, phase: 0 }
      ],
      haze: { color: "rgba(214,228,220,.30)" }
    },
    surface: { type: "moss", color: "rgba(34,60,40,.48)", color2: "rgba(100,140,96,.48)" },
    dust: { light: "#5f6e50", heavy: "#849278" },
    ambient: { type: "mist", color: "#dceae0", rate: 0.7, spd: 0.15 }
  },
  {
    name: "麦浪",
    g: 748,
    traction: 0.96,
    sky: ["#7ab4e4", "#c8dcf0", "#fdf3d8"],
    sun: "#ffe89a",
    pal: ["#8a7030", "#b89a48", "#6a5028"],
    ground: "#d4b868",
    deco: ["flower", "bush", "tree"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#ffe49a", accent: "#fff8d8", r: 44, x: 0.86, y: 92, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 6, color: "rgba(255,252,236,.68)", alpha: 0.68, parallax: 0.2, w: 150, wVar: 36, spread: 300, yBand: [46, 36] }],
      ridges: [
        { kind: "hills", color: "rgba(170,145,80,.4)", parallax: 0.17, y: 0.51, amp1: 26, f1: 0.0022, amp2: 12, f2: 0.007, phase: 2.2 },
        { kind: "hills", color: "#e0c476", parallax: 0.4, y: 0.63, amp1: 22, f1: 0.0074, amp2: 11, f2: 0.024, phase: 0 }
      ],
      haze: { color: "rgba(250,235,190,.22)" }
    },
    surface: { type: "grass", color: "rgba(120,96,34,.35)", color2: "#b89a48" },
    dust: { light: "#d4b868", heavy: "#eed590" },
    ambient: { type: "pollen", color: "#fff0b0", rate: 0.55, spd: 0.4 }
  },
  {
    name: "梯田",
    g: 752,
    traction: 0.9,
    sky: ["#8ec4d8", "#cfe8d4", "#f2f8e4"],
    sun: "#fff4c0",
    pal: ["#38684a", "#52885a", "#5e4830"],
    ground: "#7fa06a",
    deco: ["reed", "bush", "fern"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#fef2bc", accent: "#fffce4", r: 34, x: 0.82, y: 72, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 7, color: "rgba(255,255,255,.66)", alpha: 0.66, parallax: 0.2, w: 150, wVar: 36, spread: 300, yBand: [48, 36] }],
      ridges: [
        { kind: "hills", color: "rgba(100,140,100,.44)", parallax: 0.16, y: 0.51, amp1: 36, f1: 0.003, amp2: 16, f2: 0.009, phase: 0.8 },
        { kind: "hills", color: "#9ec77e", parallax: 0.38, y: 0.63, amp1: 30, f1: 0.0086, amp2: 14, f2: 0.026, phase: 0 }
      ],
      haze: { color: "rgba(220,238,214,.22)" }
    },
    surface: { type: "grass", color: "rgba(48,92,52,.42)", color2: "#52885a" },
    dust: { light: "#7fa06a", heavy: "#a6c094" },
    ambient: { type: "mist", color: "#e6f4de", rate: 0.45, spd: 0.18 }
  },
  {
    name: "黑沙滩",
    g: 748,
    traction: 1.06,
    sky: ["#4a5a70", "#8294a8", "#c4d0dc"],
    sun: "#e8eef8",
    pal: ["#22262e", "#353a44", "#14161c"],
    ground: "#3a3f48",
    deco: ["rock", "pebble", "obsidian"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#dde6f4", accent: "#f4f8ff", r: 30, x: 0.28, y: 68, parallax: 0.04 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "storm", count: 7, color: "rgba(120,136,158,.5)", alpha: 0.5, parallax: 0.22, w: 180, wVar: 44, spread: 330, yBand: [44, 40] }],
      ridges: [
        { kind: "island", color: "rgba(52,60,74,.5)", parallax: 0.16, y: 0.52, amp1: 56, f1: 0.003, amp2: 24, f2: 0.009, phase: 2.5 },
        { kind: "island", color: "#4e5560", parallax: 0.4, y: 0.64, amp1: 46, f1: 0.0084, amp2: 20, f2: 0.025, phase: 0 }
      ],
      haze: { color: "rgba(160,178,200,.24)" }
    },
    surface: { type: "debris", color: "rgba(16,18,24,.5)", color2: "rgba(120,128,142,.42)" },
    dust: { light: "#3a3f48", heavy: "#646a76" },
    ambient: { type: "rain", color: "#c4d2e4", rate: 0.55, spd: 0.5 }
  },
  {
    name: "观星台",
    g: 760,
    traction: 1,
    sky: ["#04060f", "#0b1428", "#16223e"],
    sun: "#e6ecff",
    pal: ["#44506a", "#5c6a86", "#2c3448"],
    ground: "#6e788e",
    deco: ["pillar", "crystal", "ruin"],
    bg: {
      space: true,
      celestial: { type: "ringed", color: "#f0e6d2", accent: "rgba(200,220,255,.75)", r: 30, x: 0.8, y: 58, parallax: 0.07 },
      starLayers: [
        { count: 120, alpha: 0.9, rMax: 1.6, parallax: 0.1, seed: 3131 },
        { count: 50, alpha: 0.5, rMax: 2.4, parallax: 0.05, seed: 9090 },
        { count: 20, alpha: 0.3, rMax: 3.2, parallax: 0.02, seed: 2020 }
      ],
      aurora: null,
      cloudLayers: [],
      ridges: [
        { kind: "peaks", color: "rgba(34,44,66,.6)", parallax: 0.15, y: 0.5, amp1: 68, f1: 0.0034, amp2: 24, f2: 0.01, phase: 2.2 },
        { kind: "peaks", color: "#3e4a6e", parallax: 0.4, y: 0.62, amp1: 50, f1: 0.0088, amp2: 22, f2: 0.026, phase: 0 }
      ],
      haze: { color: "rgba(52,74,120,.14)" }
    },
    surface: { type: "strata", color: "rgba(24,30,46,.42)", color2: "rgba(150,168,205,.4)" },
    dust: { light: "#6e788e", heavy: "#98a6c4" },
    ambient: { type: "none", color: "#c8d6f0", rate: 0, spd: 0 }
  },
  {
    name: "盐沼",
    g: 752,
    traction: 1,
    sky: ["#a8c0c4", "#d8e4dc", "#f4f8ec"],
    sun: "#fff8d8",
    pal: ["#5e6a4e", "#828e64", "#3e4634"],
    ground: "#b0b494",
    deco: ["reed", "fern", "bush"],
    bg: {
      space: false,
      celestial: { type: "sun", color: "#fdf6d4", accent: "#fffff0", r: 38, x: 0.86, y: 88, parallax: 0 },
      starLayers: [],
      aurora: null,
      cloudLayers: [{ kind: "soft", count: 8, color: "rgba(255,255,255,.6)", alpha: 0.6, parallax: 0.22, w: 165, wVar: 40, spread: 315, yBand: [46, 38] }],
      ridges: [
        { kind: "hills", color: "rgba(120,138,118,.4)", parallax: 0.17, y: 0.52, amp1: 30, f1: 0.0026, amp2: 14, f2: 0.0078, phase: 1.6 },
        { kind: "hills", color: "#b6c9b0", parallax: 0.4, y: 0.64, amp1: 25, f1: 0.008, amp2: 12, f2: 0.026, phase: 0 }
      ],
      haze: { color: "rgba(232,240,228,.24)" }
    },
    surface: { type: "puddle", color: "rgba(60,72,50,.34)", color2: "rgba(210,220,190,.42)" },
    dust: { light: "#b0b494", heavy: "#d0d2b4" },
    ambient: { type: "mist", color: "#eef4e4", rate: 0.5, spd: 0.17 }
  }
];
var DECO_COLORS = {
  tree: ["#5b3a1e", "#2f7a35", "rgba(255,255,255,.12)"],
  bush: ["#37703a"],
  snowman: ["#f7fbff", "#c9dcec", "#e8622a"],
  icespike: ["rgba(190,220,245,.85)"],
  rock: ["#8a8f98", "#a9aeb6"],
  cactus: ["#3d7a44"],
  crater: ["rgba(28,32,42,.35)"],
  moonrock: ["#7e848d", "#9aa1aa"],
  flower: ["#2f7a35", "#e8557a", "#ffd166"],
  snowtree: ["#6b4a30", "#2f6b4a", "rgba(255,255,255,.8)"],
  pebble: ["rgba(0,0,0,.12)", "#b09a78"],
  fern: ["#2f8a4a", "rgba(0,0,0,.12)"],
  stump: ["#6b4a2a", "#8a6a44", "rgba(60,40,20,.5)"],
  lavarock: ["#2a201e", "#ff7a2a"],
  obsidian: ["#141018", "rgba(180,150,220,.35)"],
  iceberg: ["rgba(0,0,0,.12)", "#cfe9f7", "rgba(255,255,255,.6)"],
  crystal: ["rgba(140,200,255,.25)", "#a8ddff", "rgba(255,255,255,.6)"],
  mesarock: ["#8a4526", "#c26a3a", "rgba(0,0,0,.15)"],
  reed: ["#6f8a3a", "#a9863a"],
  ruin: ["#6a6e76", "rgba(0,0,0,.18)"],
  rubble: ["rgba(0,0,0,.12)", "#7a7f88", "#9aa0aa"],
  pillar: ["#8a9098", "#aab0bc", "rgba(0,0,0,.18)"],
  cloudpuff: ["rgba(255,255,255,.9)", "rgba(180,210,235,.5)"],
  pine: ["#4a3520", "#1f4a34"],
  __default: ["#8a8f98"]
};

// src/config/levels.js
var STEP_W = 150;
var RUN_IN = 430;
var FINISH_PAD = 900;
var LEVELS_PER_BRANCH = 12;
var N_BRANCHES = 36;
var TOTAL = N_BRANCHES * LEVELS_PER_BRANCH;
var SPECIAL_SLOTS = [2, 4, 6, 8, 10];
var SPECIALS = ["sprint", "gauntlet", "airtime", "fuelrun", "downhill"];
var VARIANT_INFO = {
  normal: { name: "常规", icon: "\uD83D\uDEA9", desc: "标准赛道" },
  sprint: { name: "限时冲刺", icon: "⏱", desc: "门限极严；赛前满油、赛道无补给" },
  gauntlet: { name: "跳台狂飙", icon: "\uD83D\uDEEB", desc: "跳台密集、断层相连" },
  airtime: { name: "空翻挑战", icon: "\uD83D\uDD4A", desc: "跳台飞跃：多刷滞空与连招" },
  fuelrun: { name: "燃料极限", icon: "⛽", desc: "赛道仅 1 个油罐，必须规划" },
  downhill: { name: "极速下坡", icon: "\uD83C\uDFBF", desc: "危险段密集，须精准刹车" }
};
var VARIANT_RULES = {
  normal: { hazardK: 1, gateK: 1, canN: null, jumpN: 0, prepFuel: false },
  sprint: { hazardK: 1, gateK: 1.1, canN: 0, jumpN: 0, prepFuel: true },
  gauntlet: { hazardK: 0, gateK: 0.75, canN: null, jumpN: 8, prepFuel: false },
  airtime: { hazardK: 0, gateK: 0.6, canN: null, jumpN: 4, prepFuel: false },
  fuelrun: { hazardK: 0.5, gateK: 0.9, canN: 1, jumpN: 0, prepFuel: true },
  downhill: { hazardK: 2.2, gateK: 0.7, canN: null, jumpN: 0, prepFuel: false }
};
function variantRule(v) {
  return VARIANT_RULES[v] || VARIANT_RULES.normal;
}
var BRANCH_SEED = [
  { id: "green", name: "翠野乡道", theme: 0, desc: "平缓草甸，热身上路" },
  { id: "snow", name: "极寒雪原", theme: 1, desc: "积雪打滑，稳住节奏" },
  { id: "desert", name: "流沙荒漠", theme: 2, desc: "沙丘连绵，酷热耗油" },
  { id: "moon", name: "静默月面", theme: 3, desc: "低重力弹跳，天堑飞跃" },
  { id: "jungle", name: "雨林秘境", theme: 4, desc: "湿滑苔径，树影重重" },
  { id: "volcano", name: "熔岩火山", theme: 5, desc: "高重力陡坡，烈焰滚滚" },
  { id: "glacier", name: "万古冰川", theme: 6, desc: "冰面极滑，慎踩刹车" },
  { id: "canyon", name: "红岩峡谷", theme: 7, desc: "层岩台地，连续落差" },
  { id: "swamp", name: "迷雾沼泽", theme: 8, desc: "泥泞水洼，能见度低" },
  { id: "city", name: "城市废墟", theme: 9, desc: "残垣断壁，硬质路面" },
  { id: "sky", name: "天空浮岛", theme: 10, desc: "浮空群岛，轻若无物" },
  { id: "night", name: "极夜星空", theme: 11, desc: "极夜寒星，终极试炼" }
];
function deriveBranch(i) {
  const t = THEMES[i] || { name: "场景 " + (i + 1), g: 750, traction: 1 };
  const grip = t.traction <= 0.7 ? "极滑抓地" : t.traction <= 0.85 ? "湿滑路面" : "抓地良好";
  const grav = t.g < 600 ? "低重力" : t.g > 820 ? "高重力" : "标准重力";
  return {
    id: "s" + i,
    name: t.name,
    theme: i,
    desc: `${grav} · ${grip}`
  };
}
var BRANCHES = Array.from({ length: N_BRANCHES }, (_, i) => BRANCH_SEED[i] || deriveBranch(i));
var TERRAIN_MOODS = [
  {
    id: "rolling",
    label: "起伏丘陵",
    waves: [[2600, 56, 34], [1000, 14, 7], [420, 5, 2]],
    feat: { dip: 3, shelf: 1.4, kicker: 0.8, ramp: 0.3 },
    stepGap: 1800,
    stepK: 1,
    jitter: 0.16
  },
  {
    id: "dunes",
    label: "连绵沙丘",
    waves: [[3400, 74, 42], [1400, 12, 6], [560, 4, 2]],
    feat: { shelf: 2, dip: 2, ramp: 0.3 },
    stepGap: 2400,
    stepK: 0.7,
    jitter: 0.12
  },
  {
    id: "whoops",
    label: "碎浪连包",
    waves: [[2700, 48, 28], [900, 18, 10], [420, 9, 5]],
    feat: { whoops: 3, dip: 1.6, ramp: 0.4 },
    stepGap: 1500,
    stepK: 0.9,
    jitter: 0.2
  },
  {
    id: "canyon",
    label: "深谷沟壑",
    waves: [[3000, 62, 34], [1100, 15, 8], [460, 6, 3]],
    feat: { chasm: 2.6, kicker: 1.6, shelf: 1, ramp: 0.6 },
    stepGap: 2000,
    stepK: 1.2,
    jitter: 0.18
  },
  {
    id: "ridge",
    label: "连绵山脊",
    waves: [[2900, 66, 40], [980, 13, 7], [400, 5, 2]],
    feat: { kicker: 3, dip: 1.4, ramp: 0.5 },
    stepGap: 1700,
    stepK: 1.1,
    jitter: 0.16
  },
  {
    id: "plateau",
    label: "阶梯平台",
    waves: [[2800, 50, 30], [1150, 15, 8], [480, 5, 2]],
    feat: { shelf: 3.4, dip: 1.2, kicker: 1, ramp: 0.5 },
    stepGap: 1300,
    stepK: 1.3,
    jitter: 0.14
  },
  {
    id: "chasm",
    label: "断裂天堑",
    waves: [[3200, 56, 34], [1250, 14, 8], [520, 5, 3]],
    feat: { chasm: 3, whoops: 1.2, ramp: 0.7 },
    stepGap: 1100,
    stepK: 1.45,
    jitter: 0.18
  },
  {
    id: "badlands",
    label: "嶙峋台地",
    waves: [[2500, 56, 34], [1000, 18, 10], [440, 8, 5]],
    feat: { kicker: 2, whoops: 2, shelf: 1.2, ramp: 0.6 },
    stepGap: 1400,
    stepK: 1.15,
    jitter: 0.22
  },
  {
    id: "rollers",
    label: "长缓丘陵",
    waves: [[4000, 80, 46], [1600, 15, 8], [640, 5, 2]],
    feat: { dip: 2.4, shelf: 1.6, ramp: 0.6 },
    stepGap: 2600,
    stepK: 0.85,
    jitter: 0.1
  },
  {
    id: "gauntlet",
    label: "断崖飞坡",
    waves: [[2500, 60, 36], [1000, 15, 8], [440, 6, 3]],
    feat: { kicker: 3.4, chasm: 1.6, ramp: 1.2 },
    stepGap: 1000,
    stepK: 1.5,
    jitter: 0.2
  },
  {
    id: "marsh",
    label: "泥泞浅滩",
    waves: [[2600, 46, 28], [980, 16, 9], [440, 6, 3]],
    feat: { dip: 3.2, whoops: 1.4, shelf: 1, ramp: 1 },
    stepGap: 1900,
    stepK: 0.95,
    jitter: 0.18
  },
  {
    id: "summit",
    label: "登峰造极",
    waves: [[2700, 64, 42], [1000, 19, 11], [440, 8, 4]],
    feat: { kicker: 2.4, chasm: 2, whoops: 2, ramp: 1.3 },
    stepGap: 1200,
    stepK: 1.35,
    jitter: 0.24
  }
];
var MIN_WAVELEN = 380;
var MIN_FEAT_W = 420;
function targetSlopeDeg(gN) {
  return 19.5 + 34.5 * Math.pow(gN, 1.1);
}
var FEAT_AMP_MAX = 0;
function ss(u) {
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
}
function featProfile(kind, t, n) {
  if (t <= 0 || t >= 1)
    return 0;
  switch (kind) {
    case "kicker":
      return t < 0.5 ? ss(t / 0.5) : 1 - ss((t - 0.5) / 0.5);
    case "dip":
      return -(t < 0.5 ? ss(t / 0.5) : 1 - ss((t - 0.5) / 0.5));
    case "shelf":
      return t < 0.28 ? ss(t / 0.28) : t < 0.72 ? 1 : 1 - ss((t - 0.72) / 0.28);
    case "whoops":
      return Math.sin(Math.PI * t) * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * n * t);
    case "chasm":
      return -(t < 0.5 ? ss(t / 0.5) : 1 - ss((t - 0.5) / 0.5));
    case "ramp":
      return rampProfile(t);
    default:
      return 0;
  }
}
function rampProfile(t) {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
}
var FEAT_AMP = { kicker: 1, dip: 0.7, shelf: 0.85, whoops: 0.55, chasm: -1.15 };
var RAMP_GRADE = 0.34;
var LAUNCH_PAD = 150;
function levelHillY(L, x) {
  const t = finishT(L, x);
  if (t <= 0)
    return hillRaw(L, x);
  const a = finishAnchor(L);
  return hillRaw(L, a) + (hillRaw(L, x) - hillRaw(L, a)) * (1 - t);
}
function finishT(L, x) {
  const a = finishAnchor(L);
  if (x <= a)
    return 0;
  return ss((x - a) / RUN_IN);
}
function finishAnchor(L) {
  return L.len - FINISH_PAD;
}
var BUCKET_W_MIN = 2048;
var BUCKET_MAX = 20000;
var bucketWidthOf = (len) => Math.max(BUCKET_W_MIN, Math.ceil(len / BUCKET_MAX));
var STEPS_PER_SEG_MAX = 2000;
function buildIndex(L) {
  if (L._idx)
    return L._idx;
  const n = L.len;
  const bw = bucketWidthOf(n);
  const nBuckets = Math.max(1, Math.ceil(n / bw) + 2);
  const waveB = new Array(nBuckets);
  const stepB = new Array(nBuckets);
  const featB = new Array(nBuckets);
  const ws = L.waves;
  const wLen = ws.length;
  let sLo = 0;
  for (let b = 0;b < nBuckets; b++) {
    const bx0 = b * bw;
    const bx1 = bx0 + bw;
    while (sLo < L.steps.length && L.steps[sLo].cx + STEP_W <= bx0)
      sLo++;
    let sHi = sLo;
    while (sHi < L.steps.length && L.steps[sHi].cx < bx1)
      sHi++;
    stepB[b] = [sLo, sHi];
  }
  let fLo = 0;
  for (let b = 0;b < nBuckets; b++) {
    const bx0 = b * bw;
    const bx1 = bx0 + bw;
    while (fLo < L.feats.length && L.feats[fLo].x1 <= bx0)
      fLo++;
    let fHi = fLo;
    while (fHi < L.feats.length && L.feats[fHi].x0 < bx1)
      fHi++;
    featB[b] = [fLo, fHi];
  }
  L._idx = { nBuckets, bw, waveB, stepB, featB, wLen };
  return L._idx;
}
function hillRaw(L, x) {
  let relief = 0;
  const idx = L._idx || buildIndex(L);
  const ws = L.waves;
  for (let i = 0, n = idx.wLen;i < n; i++) {
    const w = ws[i];
    relief += w.amp * Math.sin(x * w.f + w.ph);
  }
  const b = x / idx.bw | 0;
  const steps = L.steps;
  if (b >= 0 && b < idx.nBuckets) {
    const r = idx.stepB[b];
    for (let i = r[0], e = r[1];i < e; i++) {
      const s = steps[i];
      if (x > s.cx) {
        const t = clamp((x - s.cx) / STEP_W, 0, 1);
        relief += s.drop * (t * t * (3 - 2 * t));
      }
    }
  }
  const feats = L.feats;
  if (feats && feats.length) {
    if (b >= 0 && b < idx.nBuckets) {
      const r = idx.featB[b];
      for (let i = r[0], e = r[1];i < e; i++) {
        const f = feats[i];
        if (x <= f.x0)
          continue;
        if (x >= f.x1)
          continue;
        relief += f.amp * featProfile(f.kind, (x - f.x0) / (f.x1 - f.x0), f.n);
      }
    }
  }
  return 300 + relief * ss((x - LAUNCH_PAD) / RUN_IN);
}
var freeSeed = 0;
var BLOCK_W = 3000;
function setFreeSeed(s) {
  freeSeed = (Number(s) || 0) >>> 0;
}
var FREE_GAP_AVG = 1800;
var FREE_K_WAVE = (() => {
  const n = 3;
  const avg = [0, 0, 0];
  for (const m of TERRAIN_MOODS) {
    for (let i = 0;i < n; i++)
      avg[i] += m.waves[i][0];
  }
  return avg.map((s) => 2 * Math.PI / Math.max(MIN_WAVELEN, s / TERRAIN_MOODS.length));
})();
function freeMoodIndex(t) {
  let h = (t ^ freeSeed) >>> 0;
  h = Math.imul(h ^ 2654435769, 2246822507) >>> 0;
  h = (h ^ h >>> 16) >>> 0;
  h = Math.imul(h, 2146121005) >>> 0;
  h = (h ^ h >>> 15) >>> 0;
  return h % TERRAIN_MOODS.length;
}
function freeMoodSeq(t) {
  const idx = freeMoodIndex(t);
  if (t > 0 && idx === freeMoodIndex(t - 1)) {
    return (idx + 1) % TERRAIN_MOODS.length;
  }
  return idx;
}
function freeHill(x) {
  const d = Math.max(0, x - 400);
  const diff = Math.min(1, d / 120000);
  const diffS = diff * diff * (3 - 2 * diff);
  const ramp = ss((x - LAUNCH_PAD) / RUN_IN);
  const t = x / BLOCK_W;
  const seg = Math.floor(t);
  const frac = t - seg;
  const moodA = TERRAIN_MOODS[freeMoodSeq(seg)];
  const moodB = TERRAIN_MOODS[freeMoodSeq(seg + 1)];
  const lerpMood = (get) => get(moodA) * (1 - frac) + get(moodB) * frac;
  const ph = freeSeed % 6283 * 0.001;
  let relief = 0;
  for (let i = 0;i < 3; i++) {
    const wA = moodA.waves[i] || moodA.waves[moodA.waves.length - 1];
    const wB = moodB.waves[i] || moodB.waves[moodB.waves.length - 1];
    const ampA = wA[1] * 0.5 + wA[1] * 0.5 * diffS + wA[2] * diffS;
    const ampB = wB[1] * 0.5 + wB[1] * 0.5 * diffS + wB[2] * diffS;
    const amp = ampA * (1 - frac) + ampB * frac;
    relief += Math.sin(x * FREE_K_WAVE[i] + ph + i * 1.9) * amp;
  }
  const gapC = FREE_GAP_AVG;
  const stepK = lerpMood((m) => m.stepK);
  const stepDrop = (15 + diffS * 10) * stepK;
  const kStep = 2 * Math.PI / gapC;
  relief += stepDrop * (1 + Math.sin(x * kStep + ph * 3.1)) * 0.5;
  const DRIFT_K = 0.00022, DRIFT_CAP = 900;
  const drift = d * DRIFT_K * DRIFT_CAP / (DRIFT_CAP + d * DRIFT_K);
  const y = baseYOf(d) + drift + relief;
  return 300 + (y - 300) * ramp;
}
function baseYOf(d) {
  return Math.sin(d * 0.0000262) * 260;
}
var SLOPE_SAMPLES = 20000;
var SLOPE_E = 2;
function measureMaxSlopeTan(P, len) {
  const stride = Math.max(4, Math.ceil(len / SLOPE_SAMPLES));
  let mx = 0;
  for (let x = 70;x <= len; x += stride) {
    const yL = levelHillY(P, x - SLOPE_E);
    const yR = levelHillY(P, x + SLOPE_E);
    const m = Math.abs((yR - yL) / (2 * SLOPE_E));
    if (m > mx)
      mx = m;
  }
  return mx;
}
function fitSlope(L, targetDeg) {
  const tanT = Math.tan(targetDeg * Math.PI / 180);
  const raw = measureMaxSlopeTan(L, L.len);
  if (!(raw > 0.000001)) {
    L.maxSlope = targetDeg;
    return;
  }
  const k = tanT / raw;
  for (const w of L.waves)
    w.amp *= k;
  for (const s of L.steps)
    s.drop *= k;
  if (L.feats)
    for (const f of L.feats)
      f.amp *= k;
  L.maxSlope = targetDeg;
}
function buildWaves(mood, ramp, rng) {
  const j = mood.jitter;
  const out = [];
  for (let i = 0;i < mood.waves.length; i++) {
    const [wl0, a0, aG] = mood.waves[i];
    const wl = Math.max(MIN_WAVELEN, wl0 * (1 + (rng() * 2 - 1) * j));
    out.push({
      f: 2 * Math.PI / wl,
      amp: a0 + aG * ramp,
      ph: rng() * Math.PI * 2
    });
  }
  return out;
}
function buildSteps(mood, ramp, gN, len, rng, nOverride) {
  const first = LAUNCH_PAD + RUN_IN + 200;
  const usable = Math.max(1, len - first - 800);
  const gap = mood.stepGap * (0.85 + ramp * 0.3);
  const nStep = nOverride != null ? nOverride : Math.max(1, Math.min(400, Math.round(usable / gap)));
  const steps = [];
  let cx = first + rng() * 400;
  for (let r = 0;r < nStep; r++) {
    const f = nStep > 1 ? r / (nStep - 1) : 1;
    steps.push({ cx: Math.round(cx), drop: 15 + gN * 76 + f * (2 + gN * 7) });
    cx += gap * (1 + (rng() * 2 - 1) * 0.18);
    if (cx > len - 900)
      break;
  }
  return steps;
}
function buildFeats(mood, ramp, len, rng) {
  const kinds = [];
  for (const k in mood.feat) {
    const n = Math.round(mood.feat[k] * (0.7 + ramp * 0.9));
    for (let i = 0;i < n; i++)
      kinds.push(k);
  }
  if (!kinds.length)
    return [];
  const feats = [];
  const x0Min = 900;
  const x1Max = len - 500;
  const span = x1Max - x0Min;
  if (span < 600)
    return [];
  const W = { kicker: 760, dip: 700, shelf: 980, whoops: 900, chasm: 640, ramp: 750 };
  const total = kinds.length;
  const n = Math.max(3, Math.min(600, Math.round(total * span / 4200)));
  for (let i = 0;i < n; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length) % kinds.length];
    const nPer = kind === "whoops" ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3);
    const minW = kind === "whoops" ? MIN_WAVELEN * (nPer + 1) * 0.5 : MIN_FEAT_W;
    const w = Math.max(minW, W[kind] * (0.85 + rng() * 0.5));
    if (w > span * 0.9)
      continue;
    const slot = (span - w) * ((i + 0.15 + rng() * 0.7) / n);
    const x0 = x0Min + slot;
    let amp;
    if (kind === "ramp") {
      amp = RAMP_GRADE * w / Math.PI * (0.8 + ramp * 0.35) * (0.85 + rng() * 0.3);
    } else {
      amp = FEAT_AMP[kind] * FEAT_AMP_MAX * (0.55 + rng() * 0.6) * (0.7 + ramp * 0.4);
      if (amp === 0)
        continue;
    }
    feats.push({
      kind,
      x0: Math.round(x0),
      x1: Math.round(x0 + w),
      amp,
      n: nPer
    });
  }
  feats.sort((a, b) => a.x0 - b.x0);
  return feats;
}
function makeLevel(gi) {
  const gN = gi / (TOTAL - 1);
  const bi = Math.floor(gi / LEVELS_PER_BRANCH);
  const k = gi % LEVELS_PER_BRANCH;
  const slotIdx = SPECIAL_SLOTS.indexOf(k);
  const variant = slotIdx >= 0 ? SPECIALS[(bi * 2 + slotIdx) % SPECIALS.length] : "normal";
  const ramp = Math.pow(clamp(gN, 0, 1), 1.15);
  const len = Math.round(5610 + gN * (78000 - 5610));
  const coinN = Math.round(36 + gN * 72);
  const goldBase = Math.round(700 + 1800 * gN);
  const coinVal = Math.round(40 + 50 * gN);
  const mood = TERRAIN_MOODS[bi % TERRAIN_MOODS.length];
  const rng = mulberry32(20973 + gi * 2654435761);
  const L = {
    name: BRANCHES[bi].name + " " + (k + 1),
    len,
    waves: buildWaves(mood, ramp, rng),
    steps: buildSteps(mood, ramp, gN, len, rng),
    feats: buildFeats(mood, ramp, len, rng),
    coinN,
    goldBase,
    coinVal,
    ramp,
    den3: REF_SPEED * (0.72 - 0.22 * ramp),
    fuelK: 1 + 3.1 * ramp,
    mech: gN,
    hazardN: Math.round(1 + gN * 5),
    gateN: 3 + Math.round(gN * 2),
    variant,
    theme: BRANCHES[bi].theme,
    mood: mood.id
  };
  fitSlope(L, targetSlopeDeg(gN));
  return L;
}
var LEVELS = Array.from({ length: TOTAL }, (_, gi) => makeLevel(gi));
function buildLongCourse(o) {
  const { name, len, segs, slopeDeg, seed } = o;
  const rng = mulberry32(seed);
  const segLen = len / segs;
  const waves = [];
  const steps = [];
  const feats = [];
  const segments = [];
  for (let s = 0;s < segs; s++) {
    const theme = o.allThemes ? THEMES[s] ? s : s % THEMES.length : o.themes ? o.themes[s % o.themes.length] : (s * 5 + 3) % TERRAIN_MOODS.length;
    segments.push({ x: Math.round(s * segLen), theme });
    const mood = TERRAIN_MOODS[(s * 5 + 3) % TERRAIN_MOODS.length];
    const w = buildWaves(mood, 1, rng)[0];
    w.ph += s * 2.399963;
    w.amp *= Math.pow(0.62, s % 12);
    waves.push(w);
    for (const f of buildFeats(mood, 1, segLen, rng)) {
      if (f.amp === 0)
        continue;
      feats.push({ ...f, x0: f.x0 + s * segLen, x1: f.x1 + s * segLen });
    }
    const sp = buildSteps(mood, 1, 1, segLen, rng, Math.max(1, Math.min(STEPS_PER_SEG_MAX, Math.round(segLen / mood.stepGap))));
    for (const st of sp)
      steps.push({ cx: Math.round(st.cx + s * segLen), drop: st.drop });
  }
  feats.sort((a, b) => a.x0 - b.x0);
  steps.sort((a, b) => a.cx - b.cx);
  return { name, len, waves, steps, feats, segments };
}
var FINALE_LEN = 16666666;
var FINALE_GATE_PER_SEG = 10;
var FINALE_SEGS = THEMES.length;
var FINALE = (() => {
  const len = FINALE_LEN;
  const segs = FINALE_SEGS;
  const base = buildLongCourse({
    name: "终极远征 · 环大陆",
    len,
    segs,
    slopeDeg: 54,
    seed: 15825438,
    allThemes: true
  });
  const L = {
    ...base,
    coinN: Math.round(len / 720),
    ramp: 0.5,
    den3: len / 600,
    fuelK: 1 + 3.1,
    mech: 1.3,
    hazardN: Math.round(len / 12000),
    gateN: segs * FINALE_GATE_PER_SEG,
    variant: "normal",
    theme: 0,
    mood: "gauntlet"
  };
  fitSlope(L, 54);
  return L;
})();
var RACE_LEN = 360000;
var RACE_COURSE = (() => {
  const base = buildLongCourse({
    name: "竞速赛道",
    len: RACE_LEN,
    segs: 6,
    slopeDeg: 30,
    seed: 2805249,
    themes: [0, 6, 5, 3, 10, 11]
  });
  const L = {
    ...base,
    coinN: Math.round(RACE_LEN / 720),
    ramp: 0.5,
    den3: REF_SPEED * 0.68,
    fuelK: 1 + 3.1,
    mech: 1.3,
    hazardN: Math.round(RACE_LEN / 12000),
    gateN: 0,
    variant: "normal",
    theme: 0,
    mood: "gauntlet"
  };
  fitSlope(L, 30);
  return L;
})();
var FINALE_INDEX = LEVELS.length;
var MODE_SPACE = "space";
var SPACE_LEAGUES = [
  { id: "L1", name: "星环层", icon: "\uD83D\uDEF0️", refKmh: 1000, segs: 10, slopeDeg: 24, gold: 20000000000, themes: [3, 11, 24, 34] },
  { id: "L2", name: "疾驰层", icon: "⚡", refKmh: 20000, segs: 12, slopeDeg: 22, gold: 900000000000, themes: [24, 34, 3, 11] },
  { id: "L3", name: "越界层", icon: "\uD83C\uDF11", refKmh: 45000, segs: 14, slopeDeg: 20, gold: 40500000000000, themes: [34, 3, 24, 11] },
  { id: "L4", name: "深空层", icon: "\uD83C\uDF0C", refKmh: 1500000, segs: 18, slopeDeg: 17, gold: 1822500000000000, themes: [3, 34, 11, 24] },
  { id: "L5", name: "星系层", icon: "\uD83C\uDF20", refKmh: 3600000, segs: 22, slopeDeg: 14, gold: 82012500000000000, themes: [11, 24, 34, 3] },
  { id: "L6", name: "超域层", icon: "\uD83D\uDD73️", refKmh: 5400000, segs: 26, slopeDeg: 11, gold: 3690562500000000000, themes: [24, 3, 11, 34] },
  { id: "L7", name: "全域层", icon: "\uD83D\uDCAB", refKmh: 6300000, segs: 30, slopeDeg: 10, gold: 166075000000000000000, themes: [34, 11, 24, 3] },
  { id: "L8", name: "光锥层", icon: "\uD83D\uDD06", refKmh: 800000000, segs: 32, slopeDeg: 8, gold: 7473370000000000000000, themes: [3, 24, 34, 11] },
  { id: "L9", name: "弦外层", icon: "\uD83C\uDF00", refKmh: 9000000000, segs: 34, slopeDeg: 6, gold: 336301000000000000000000, themes: [11, 3, 24, 34] }
];
var SPACE_DIVS = [
  { id: "A", name: "甲", dur: 40, aiK: 0.6, rating: 0, goldK: 0.6 },
  { id: "B", name: "乙", dur: 65, aiK: 0.74, rating: 90, goldK: 1 },
  { id: "C", name: "丙", dur: 90, aiK: 0.86, rating: 220, goldK: 1.6 }
];
var SPACE_RACES = [
  { id: 0, name: "短距冲刺", icon: "⚡", fmt: "duel", lenK: 0.75, goldK: 0.8 },
  { id: 1, name: "群雄竞速", icon: "\uD83C\uDFC1", fmt: "melee", lenK: 1, goldK: 1 },
  { id: 2, name: "长程接力", icon: "\uD83E\uDD1D", fmt: "relay", lenK: 1.35, goldK: 1.3 }
];
var LEAGUE_RATING_STEP = 260;
var spaceDivRatingNeed = (leagueIdx, divIdx) => Math.max(0, leagueIdx) * LEAGUE_RATING_STEP + (SPACE_DIVS[divIdx] || SPACE_DIVS[0]).rating;
var spaceDivOpen = (leagueIdx, divIdx, rating) => (Number(rating) || 0) >= spaceDivRatingNeed(leagueIdx, divIdx);
var spaceRefPx = (leagueIdx) => (SPACE_LEAGUES[leagueIdx] || SPACE_LEAGUES[0]).refKmh / 3.6 * 100;
var spaceLenOf = (leagueIdx, divIdx, raceIdx) => {
  const r = SPACE_RACES[raceIdx] || SPACE_RACES[0];
  const d = SPACE_DIVS[divIdx] || SPACE_DIVS[0];
  return Math.round(spaceRefPx(leagueIdx) * d.dur * r.lenK);
};
var spaceDurOf = (divIdx, raceIdx) => (SPACE_DIVS[divIdx] || SPACE_DIVS[0]).dur * (SPACE_RACES[raceIdx] || SPACE_RACES[0]).lenK;
var spaceAIScale = (leagueIdx, divIdx) => spaceRefPx(leagueIdx) * (SPACE_DIVS[divIdx] || SPACE_DIVS[0]).aiK;
function spaceAIJitter(base, i, seed) {
  let t = (seed ^ (i + 1) * 2654435761) >>> 0;
  t = Math.imul(t ^ t >>> 16, 569420461) >>> 0;
  t = Math.imul(t ^ t >>> 15, 1935289751) >>> 0;
  const r = ((t ^ t >>> 15) >>> 0) / 4294967296;
  return base * (0.93 + r * 0.14);
}
var spaceGoldOf = (leagueIdx, divIdx, raceIdx) => Math.round((SPACE_LEAGUES[leagueIdx] || SPACE_LEAGUES[0]).gold * (SPACE_DIVS[divIdx] || SPACE_DIVS[0]).goldK * (SPACE_RACES[raceIdx] || SPACE_RACES[0]).goldK);
function spaceRatingDelta(leagueIdx, divIdx, won) {
  if (!won)
    return -12;
  const base = [24, 40, 62][divIdx] || 24;
  return Math.round(base * (1 + leagueIdx * 0.3));
}
var spaceRaceKey = (leagueIdx, divIdx, raceIdx) => `${(SPACE_LEAGUES[leagueIdx] || SPACE_LEAGUES[0]).id}-${(SPACE_DIVS[divIdx] || SPACE_DIVS[0]).id}-${(SPACE_RACES[raceIdx] || SPACE_RACES[0]).id}`;
function spaceRaceDef(leagueIdx, divIdx, raceIdx) {
  const L = SPACE_LEAGUES[leagueIdx] || SPACE_LEAGUES[0];
  const d = SPACE_DIVS[divIdx] || SPACE_DIVS[0];
  const r = SPACE_RACES[raceIdx] || SPACE_RACES[0];
  return {
    leagueIdx,
    divIdx,
    raceIdx,
    key: spaceRaceKey(leagueIdx, divIdx, raceIdx),
    name: `${L.name} · ${d.name} · ${r.name}`,
    icon: r.icon,
    fmt: r.fmt,
    len: spaceLenOf(leagueIdx, divIdx, raceIdx),
    dur: spaceDurOf(divIdx, raceIdx),
    ai: spaceAIScale(leagueIdx, divIdx),
    refPx: spaceRefPx(leagueIdx),
    gold: spaceGoldOf(leagueIdx, divIdx, raceIdx),
    need: spaceDivRatingNeed(leagueIdx, divIdx)
  };
}
var spaceCache = new Map;
function spaceCourse(leagueIdx, divIdx, raceIdx) {
  const L = SPACE_LEAGUES[leagueIdx] || SPACE_LEAGUES[0];
  const d = SPACE_DIVS[divIdx] || SPACE_DIVS[0];
  const r = SPACE_RACES[raceIdx] || SPACE_RACES[0];
  const len = spaceLenOf(leagueIdx, divIdx, raceIdx);
  const key = spaceRaceKey(leagueIdx, divIdx, raceIdx) + ":" + Math.ceil(len / 4096);
  if (spaceCache.has(key))
    return spaceCache.get(key);
  const base = buildLongCourse({
    name: `宇宙联赛 · ${L.name} ${d.name}区`,
    len,
    segs: L.segs,
    slopeDeg: L.slopeDeg,
    seed: 5950976 + leagueIdx * 7919 + divIdx * 131 + raceIdx * 17,
    themes: L.themes
  });
  const def = spaceRaceDef(leagueIdx, divIdx, raceIdx);
  const course = {
    ...base,
    coinN: Math.max(8, Math.round(def.dur / 3)),
    ramp: 0.5,
    den3: Math.max(1, def.ai),
    fuelK: 0,
    mech: 1.3,
    hazardN: Math.max(2, Math.round(def.dur / 90)),
    gateN: 0,
    variant: "normal",
    theme: L.themes[0],
    mood: "gauntlet",
    spaceLeague: L.id,
    spaceDiv: d.id,
    spaceRace: r.name,
    streaming: true
  };
  course.coinVal = Math.max(1, Math.round(def.gold / (course.coinN * 5)));
  fitSlope(course, L.slopeDeg);
  spaceCache.set(key, course);
  if (spaceCache.size > 6)
    spaceCache.delete(spaceCache.keys().next().value);
  return course;
}
function levelAt(idx) {
  return idx === FINALE_INDEX ? FINALE : LEVELS[idx];
}
function courseAt(idx, mode) {
  if (mode === MODE_SPACE)
    return spacePinned || spaceCourse(0, 0, 0) || RACE_COURSE;
  return mode === "race" || mode === "ranked" ? RACE_COURSE : levelAt(idx);
}
var spaceLeague = 0;
var spaceDiv = 0;
var spaceRace = 0;
function setSpaceRace(l, d, r) {
  spaceLeague = Math.max(0, Math.min(SPACE_LEAGUES.length - 1, l | 0));
  spaceDiv = Math.max(0, Math.min(SPACE_DIVS.length - 1, d | 0));
  spaceRace = Math.max(0, Math.min(SPACE_RACES.length - 1, r | 0));
}
var spaceLeagueOf = () => spaceLeague;
var spaceDivOf = () => spaceDiv;
var spaceRaceOf = () => spaceRace;
var spaceDefOf = () => spaceRaceDef(spaceLeague, spaceDiv, spaceRace);
var spacePinned = null;
function pinSpaceCourse(L) {
  spacePinned = L || null;
}
function hasSegments(L) {
  return !!(L && Array.isArray(L.segments) && L.segments.length > 0);
}
function segmentThemeAt(L, x) {
  if (!hasSegments(L))
    return L ? L.theme : 0;
  const segs = L.segments;
  let th = segs[0].theme;
  for (let i = 0;i < segs.length; i++) {
    if (segs[i].x <= x)
      th = segs[i].theme;
    else
      break;
  }
  return th;
}
function branchLevel(bi, k) {
  return LEVELS[bi * LEVELS_PER_BRANCH + k];
}
function globalIndexOf(bi, k) {
  return bi * LEVELS_PER_BRANCH + k;
}
function branchOfGlobal(gi) {
  return Math.floor(gi / LEVELS_PER_BRANCH);
}
function branchProgress(gi) {
  return { bi: Math.floor(gi / LEVELS_PER_BRANCH), k: gi % LEVELS_PER_BRANCH };
}
function starTime(L) {
  return L.len / L.den3;
}

// src/core/storage.js
var CUR_SCHEMA = SAVE_SCHEMA;
var LEGACY_MAX_VER = 4;
var ALL_KEYS = Object.values(SAVE_KEYS);
var MAX_SLOTS = 6;
var META_KEYS = { slot: "dale_slot", slots: "dale_slots" };
var available = true;
function isStorageAvailable() {
  return available;
}
var nowIso = () => new Date().toISOString();
function rawGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    available = false;
    return null;
  }
}
function rawSet(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch (e) {
    available = false;
    return false;
  }
}
function rawRemove(k) {
  try {
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    available = false;
    return false;
  }
}
function slotIndex() {
  const n = store.slot | 0;
  return n >= 0 && n < MAX_SLOTS ? n : 0;
}
function slotKey(n, k) {
  return n === 0 ? k : `dale_s${n}_${k}`;
}
function lsGet(k) {
  return rawGet(slotKey(slotIndex(), k));
}
function lsSet(k, v) {
  return rawSet(slotKey(slotIndex(), k), v);
}
function lsRemove(k) {
  return rawRemove(slotKey(slotIndex(), k));
}
function jsonOr(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function intOr(v) {
  if (typeof v === "boolean" || v === null || v === undefined)
    return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function strOr(v, fallback) {
  return typeof v === "string" && v ? v : fallback;
}
function objOr(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function clampLv(v, maxLv) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n))
    return 0;
  return Math.max(0, Math.min(maxLv || MAX_LV, n));
}
function clampStar(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(3, n) : 0;
}
function indexOfVeh(id) {
  return VEHICLES.findIndex((v) => v.id === id);
}
function blankVehMeta(id) {
  return { id, engine: 0, tire: 0, frame: 0, susp: 0, odometerM: 0, runs: 0 };
}
var LEGACY_VEHICLE_IDS = [
  "trail",
  "sport",
  "mud",
  "volt",
  "ghost",
  "fort",
  "photon",
  "singularity",
  "cv1",
  "cv2",
  "cv3",
  "cv4",
  "cv5",
  "cv6",
  "cv7",
  "commuter",
  "dirt",
  "storm",
  "reef",
  "canyon",
  "aurora",
  "sandstorm",
  "magma",
  "glacier",
  "monsoon",
  "obsidian",
  "titan",
  "solstice",
  "vanguard",
  "phantom",
  "eclipse",
  "nova",
  "oblivion"
];
function legacyIdAt(index) {
  const id = LEGACY_VEHICLE_IDS[intOr(index)];
  return id && indexOfVeh(id) >= 0 ? id : null;
}
function blankStoreState() {
  store.gold = 0;
  store.unlocked = 0;
  store.selLevel = 0;
  store.stars = new Array(LEVELS.length).fill(0);
  store.ownedVehicles = [0];
  store.currentVehicle = 0;
  store.upgrades = {};
  store.ultra = {};
  store.garageMeta = {};
  store.muted = false;
  store.achGot = [];
  store.createdAt = "";
  store.progress = {
    branchCleared: [],
    finaleDone: false,
    finaleSeg: 0,
    invited: false,
    rating: 0,
    wins: 0,
    losses: 0,
    peak: false,
    promoClaimed: 0,
    freeThemes: []
  };
  store.space = { rating: 0, records: {}, free: { runs: 0, bestMeters: 0, totalMeters: 0, bestAt: "" } };
  store.levelRecords = {};
  store.raceRecords = {};
  store.stat = {
    totalRuns: 0,
    totalMeters: 0,
    totalSeconds: 0,
    lastPlayed: "",
    byMode: {}
  };
}
function sanitizeVehicles(raw) {
  const out = {};
  const src = objOr(raw);
  if (!src)
    return out;
  for (const veh of VEHICLES) {
    const rec = objOr(src[veh.id]);
    if (!rec)
      continue;
    const ml = maxLvOf(veh);
    out[veh.id] = {
      ...blankVehMeta(veh.id),
      engine: clampLv(rec.engine, ml),
      tire: clampLv(rec.tire, ml),
      frame: clampLv(rec.frame, ml),
      susp: clampLv(rec.susp, ml),
      odometerM: Math.max(0, intOr(rec.odometerM)),
      runs: Math.max(0, intOr(rec.runs))
    };
  }
  return out;
}
function sanitizeByMode(raw) {
  const out = {};
  const src = objOr(raw);
  if (!src)
    return out;
  for (const key of ["level", "race", "ranked", "space", "free"]) {
    const o = objOr(src[key]);
    if (!o)
      continue;
    out[key] = {
      runs: Math.max(0, intOr(o.runs)),
      meters: Math.max(0, intOr(o.meters)),
      seconds: Math.max(0, intOr(o.seconds))
    };
  }
  return out;
}
function sanitizeRecords(raw) {
  const out = {};
  const src = objOr(raw);
  if (!src)
    return out;
  for (const key in src) {
    const o = objOr(src[key]);
    if (!o || !/^L\d+-[ABC]-\d+$/.test(key))
      continue;
    out[key] = { runs: Math.max(0, intOr(o.runs)), wins: Math.max(0, intOr(o.wins)), best: Math.max(0, intOr(o.best)), lastAt: strOr(o.lastAt, "") };
  }
  return out;
}
function buildDoc() {
  store.space.free = store.space.free || { runs: 0, bestMeters: 0, totalMeters: 0, bestAt: "" };
  store.space.free.bestMeters = Math.max(0, intOr(store.best), intOr(store.space.free.bestMeters));
  store.best = store.space.free.bestMeters;
  const vehicles = {};
  const owned = [];
  for (const index of store.ownedVehicles || []) {
    const veh = VEHICLES[index];
    if (!veh || owned.includes(veh.id))
      continue;
    owned.push(veh.id);
    const up = store.upgrades[veh.id] || {};
    const meta = store.garageMeta[veh.id] || {};
    vehicles[veh.id] = {
      ...blankVehMeta(veh.id),
      engine: clampLv(up.engine, maxLvOf(veh)),
      tire: clampLv(up.tire, maxLvOf(veh)),
      frame: clampLv(up.frame, maxLvOf(veh)),
      susp: clampLv(up.susp, maxLvOf(veh)),
      odometerM: Math.max(0, intOr(meta.odometerM)),
      runs: Math.max(0, intOr(meta.runs))
    };
  }
  const forms = {};
  for (const id in store.ultra || {}) {
    if (store.ultra[id] === true && indexOfVeh(id) >= 0)
      forms[id] = true;
  }
  const p = store.progress || {};
  const st = store.stat || {};
  const sp = store.space || {};
  const current = VEHICLES[store.currentVehicle];
  const cleared = (store.stars || []).reduce((n, v) => n + (v >= 1 ? 1 : 0), 0);
  const stars2 = (store.stars || []).reduce((n, v) => n + (v > 0 ? v : 0), 0);
  return {
    meta: {
      app: SAVE_APP,
      format: SAVE_FORMAT,
      schema: CUR_SCHEMA,
      savedAt: nowIso(),
      migratedFrom: store.migratedFrom > 0 ? store.migratedFrom : undefined
    },
    profile: {
      name: `存档${slotIndex() + 1}`,
      createdAt: strOr(store.createdAt, nowIso())
    },
    money: {
      gold: toPlainDecimal(store.gold)
    },
    garage: {
      current: current ? current.id : "",
      owned,
      forms,
      vehicles
    },
    campaign: {
      progress: {
        unlocked: Math.max(0, intOr(store.unlocked)),
        sel: Math.max(0, intOr(store.selLevel)),
        cleared,
        stars: stars2,
        finaleSeg: Math.max(0, Math.min(FINALE_SEGS, intOr(p.finaleSeg))),
        finaleDone: p.finaleDone === true,
        invited: p.invited === true
      },
      stars: (store.stars || []).map(clampStar),
      records: { ...store.levelRecords || {} }
    },
    ranked: {
      rating: Math.max(0, intOr(p.rating)),
      wins: Math.max(0, intOr(p.wins)),
      losses: Math.max(0, intOr(p.losses)),
      promoClaimed: Math.max(0, intOr(p.promoClaimed)),
      advanced: store.raceRanked === true || store.rankedAdvanced === true
    },
    space: {
      league: {
        rating: Math.max(0, intOr(sp.rating)),
        records: { ...sp.records || {} }
      },
      free: {
        bestMeters: Math.max(0, intOr(store.best), intOr((sp.free || {}).bestMeters)),
        bestAt: strOr((sp.free || {}).bestAt, "")
      }
    },
    races: { ...store.raceRecords || {} },
    lifetime: {
      totals: {
        runs: Math.max(0, intOr(st.totalRuns)),
        meters: Math.max(0, intOr(st.totalMeters)),
        seconds: Math.max(0, intOr(st.totalSeconds))
      },
      lastPlayed: strOr(st.lastPlayed, ""),
      byMode: sanitizeByMode(st.byMode)
    },
    achievements: Array.isArray(store.achGot) ? store.achGot.slice() : [],
    settings: { muted: store.muted === true }
  };
}
function applyDoc(doc) {
  blankStoreState();
  const d = objOr(doc);
  if (!d)
    return false;
  const g = objOr(d.garage) || {};
  const cp = objOr(objOr(d.campaign) || {});
  const c = objOr(cp.progress) || {};
  const r = objOr(d.ranked) || {};
  const lt = objOr(d.lifetime) || {};
  const ltTotal = objOr(lt.totals) || {};
  const sl = objOr(objOr(d.space) || {});
  const league = objOr(sl.league) || {};
  const free = objOr(sl.free) || {};
  store.createdAt = strOr((objOr(d.profile) || {}).createdAt, "");
  store.migratedFrom = intOr((objOr(d.meta) || {}).migratedFrom);
  store.gold = safeGold(fromPlainDecimal((objOr(d.money) || {}).gold));
  store.upgrades = sanitizeVehicles(g.vehicles);
  store.garageMeta = {};
  for (const id in store.upgrades) {
    const v = store.upgrades[id];
    store.garageMeta[id] = { odometerM: v.odometerM, runs: v.runs };
  }
  store.ownedVehicles = [];
  for (const id of Array.isArray(g.owned) ? g.owned : []) {
    const index = indexOfVeh(id);
    if (index >= 0 && !store.ownedVehicles.includes(index))
      store.ownedVehicles.push(index);
  }
  if (!store.ownedVehicles.length)
    store.ownedVehicles = [0];
  store.currentVehicle = indexOfVeh(strOr(g.current, ""));
  if (!store.ownedVehicles.includes(store.currentVehicle))
    store.currentVehicle = store.ownedVehicles[0];
  store.ultra = {};
  for (const id in objOr(g.forms) || {}) {
    if (g.forms[id] === true && indexOfVeh(id) >= 0)
      store.ultra[id] = true;
  }
  store.unlocked = Math.max(0, Math.min(LEVELS.length - 1, intOr(c.unlocked)));
  store.selLevel = Math.max(0, Math.min(LEVELS.length - 1, intOr(c.sel)));
  store.stars = (Array.isArray(cp.stars) ? cp.stars.map(clampStar) : []).concat(new Array(LEVELS.length).fill(0)).slice(0, LEVELS.length);
  store.levelRecords = sanitizeLevelRecords(cp.records);
  store.progress.finaleSeg = Math.max(0, Math.min(FINALE_SEGS, intOr(c.finaleSeg)));
  store.progress.finaleDone = c.finaleDone === true;
  store.progress.invited = c.invited === true;
  store.progress.rating = Math.max(0, intOr(r.rating));
  store.progress.wins = Math.max(0, intOr(r.wins));
  store.progress.losses = Math.max(0, intOr(r.losses));
  store.progress.promoClaimed = Math.max(0, intOr(r.promoClaimed));
  store.rankedAdvanced = r.advanced === true;
  store.stat.totalRuns = Math.max(0, intOr(ltTotal.runs));
  store.stat.totalMeters = Math.max(0, intOr(ltTotal.meters));
  store.stat.totalSeconds = Math.max(0, intOr(ltTotal.seconds));
  store.stat.lastPlayed = strOr(lt.lastPlayed, "");
  store.stat.byMode = sanitizeByMode(lt.byMode);
  store.space = {
    rating: Math.max(0, intOr(league.rating)),
    records: sanitizeRecords(league.records),
    free: {
      runs: Math.max(0, intOr(((store.stat.byMode || {}).free || {}).runs)),
      bestMeters: Math.max(0, intOr(free.bestMeters)),
      totalMeters: Math.max(0, intOr(((store.stat.byMode || {}).free || {}).meters)),
      bestAt: strOr(free.bestAt, "")
    }
  };
  store.best = store.space.free.bestMeters;
  store.raceRecords = sanitizeRaceRecords(d.races);
  store.achGot = Array.isArray(d.achievements) ? d.achievements.filter((x) => typeof x === "string") : [];
  store.muted = (objOr(d.settings) || {}).muted === true;
  return true;
}
function legacyLevelsOf(upRaw, id, veh) {
  const rec = objOr(upRaw) ? objOr(upRaw[id]) || upRaw : {};
  const ml = maxLvOf(veh);
  return {
    engine: clampLv(rec.engine, ml),
    tire: clampLv(rec.tire, ml),
    frame: clampLv(rec.frame, ml),
    susp: clampLv(rec.susp, ml)
  };
}
function legacyDocFrom(map) {
  const src = objOr(map);
  if (!src)
    return null;
  const keys = Object.keys(src).filter((k) => k.indexOf("bike_") === 0);
  if (!keys.length)
    return null;
  const ver = intOr(src[SAVE_KEYS.ver]);
  let gold = safeGold(fromPlainDecimal(src[SAVE_KEYS.gold]));
  if (ver < 2)
    gold *= 10;
  const ownedRaw = jsonOr(src[SAVE_KEYS.owned] || "[0]", [0]);
  const upRaw = jsonOr(src[SAVE_KEYS.up] || "{}", {});
  const owned = [];
  const vehicles = {};
  for (const index of (Array.isArray(ownedRaw) ? ownedRaw : [0]).map(intOr)) {
    const id = legacyIdAt(index);
    if (!id || owned.includes(id))
      continue;
    owned.push(id);
    vehicles[id] = { ...blankVehMeta(id), ...legacyLevelsOf(upRaw, id, VEHICLES[indexOfVeh(id)]) };
  }
  if (!owned.length)
    owned.push(VEHICLES[0].id);
  const forms = {};
  const ultraRaw = objOr(jsonOr(src[SAVE_KEYS.ultra] || "{}", {})) || {};
  for (const id in ultraRaw) {
    if (ultraRaw[id] === true && indexOfVeh(id) >= 0)
      forms[id] = true;
  }
  const starsRaw = jsonOr(src[SAVE_KEYS.stars] || "[]", []);
  const stars2 = (Array.isArray(starsRaw) ? starsRaw : []).map(clampStar).concat(new Array(LEVELS.length).fill(0)).slice(0, LEVELS.length);
  const prog = objOr(jsonOr(src[SAVE_KEYS.prog] || "{}", {})) || {};
  const stat = objOr(jsonOr(src[SAVE_KEYS.stat] || "{}", {})) || {};
  const current = legacyIdAt(src[SAVE_KEYS.veh]);
  const cleared = stars2.filter((v) => v >= 1).length;
  const starSum = stars2.reduce((n, v) => n + (v > 0 ? v : 0), 0);
  return {
    meta: {
      app: SAVE_APP,
      format: SAVE_FORMAT,
      schema: CUR_SCHEMA,
      savedAt: nowIso(),
      migratedFrom: ver > 0 ? ver : LEGACY_MAX_VER
    },
    profile: { name: `存档${slotIndex() + 1}`, createdAt: nowIso() },
    money: { gold: toPlainDecimal(gold) },
    garage: {
      current: current && owned.includes(current) ? current : owned[0],
      owned,
      forms,
      vehicles
    },
    campaign: {
      progress: {
        unlocked: Math.max(0, intOr(src[SAVE_KEYS.unlocked])),
        sel: Math.max(0, intOr(src[SAVE_KEYS.sel])),
        cleared,
        stars: starSum,
        finaleSeg: Math.max(0, intOr(prog.finaleSeg)),
        finaleDone: prog.finaleDone === true,
        invited: prog.invited === true
      },
      stars: stars2,
      records: {}
    },
    ranked: {
      rating: Math.max(0, intOr(src[SAVE_KEYS.rating] || prog.rating)),
      wins: Math.max(0, intOr(prog.wins)),
      losses: Math.max(0, intOr(prog.losses)),
      promoClaimed: Math.max(0, intOr(prog.promoClaimed)),
      advanced: false
    },
    space: {
      league: { rating: 0, records: {} },
      free: { bestMeters: Math.max(0, intOr(src[SAVE_KEYS.best])), bestAt: "" }
    },
    races: {},
    lifetime: {
      totals: {
        runs: Math.max(0, intOr(stat.totalRuns || stat.games)),
        meters: Math.max(0, intOr(stat.totalMeters || stat.dist)),
        seconds: Math.max(0, intOr(stat.totalSeconds || stat.time))
      },
      lastPlayed: strOr(stat.lastPlayed, ""),
      byMode: {}
    },
    achievements: Array.isArray(jsonOr(src[SAVE_KEYS.ach] || "[]", [])) ? jsonOr(src[SAVE_KEYS.ach] || "[]", []).filter((x) => typeof x === "string") : [],
    settings: { muted: src[SAVE_KEYS.mute] === "1" || src[SAVE_KEYS.mute] === 1 }
  };
}
function hasLegacyData() {
  for (const k of ALL_KEYS) {
    if (k === SAVE_KEYS.doc)
      continue;
    if (lsGet(k) !== null)
      return true;
  }
  return false;
}
function clearLegacyKeys() {
  for (const k of ALL_KEYS) {
    if (k === SAVE_KEYS.doc)
      continue;
    lsRemove(k);
  }
}
function sanitizeLevelRecords(raw) {
  const out = {};
  const src = objOr(raw);
  if (!src)
    return out;
  for (const k in src) {
    const gi = intOr(k);
    const o = objOr(src[k]);
    if (!o || gi < 0 || gi >= LEVELS.length)
      continue;
    out[gi] = {
      tries: Math.max(0, intOr(o.tries)),
      bestMs: Math.max(0, intOr(o.bestMs)),
      bestCoins: Math.max(0, intOr(o.bestCoins)),
      lastAt: strOr(o.lastAt, "")
    };
  }
  return out;
}
function sanitizeRaceRecords(raw) {
  const out = {};
  const src = objOr(raw);
  if (!src)
    return out;
  for (const k in src) {
    const o = objOr(src[k]);
    if (!o || !/^\d+-\d+$/.test(k))
      continue;
    out[k] = { runs: Math.max(0, intOr(o.runs)), wins: Math.max(0, intOr(o.wins)), best: Math.max(0, intOr(o.best)), lastAt: strOr(o.lastAt, "") };
  }
  return out;
}
function readDoc() {
  const d = objOr(jsonOr(lsGet(SAVE_KEYS.doc), null));
  if (!d)
    return null;
  const app = (objOr(d.meta) || {}).app || d.app;
  return app === SAVE_APP ? d : null;
}
function writeDoc(doc) {
  return lsSet(SAVE_KEYS.doc, JSON.stringify(doc));
}
function loadSave() {
  try {
    const persisted = parseInt(rawGet(META_KEYS.slot) || "0", 10);
    store.slot = Number.isFinite(persisted) && persisted >= 0 && persisted < MAX_SLOTS ? persisted : 0;
    if (lsGet("bike_trial") !== null)
      lsRemove("bike_trial");
    const doc = readDoc();
    if (doc) {
      applyDoc(doc);
    } else if (hasLegacyData()) {
      const legacy = {};
      for (const k of ALL_KEYS) {
        if (k === SAVE_KEYS.doc)
          continue;
        const v = lsGet(k);
        if (v !== null)
          legacy[k] = v;
      }
      const migrated = legacyDocFrom(legacy);
      if (migrated) {
        applyDoc(migrated);
        writeDoc(migrated);
        clearLegacyKeys();
      } else {
        resetSave();
      }
    } else {
      resetSave();
    }
    loadAchList();
    refreshProgress();
    touchSlotMeta(slotIndex(), clearedCountOfCurrent());
  } catch (e) {
    blankStoreState();
  }
}
function save() {
  const ok = writeDoc(buildDoc());
  if (ok)
    touchSlotMeta(slotIndex(), clearedCountOfCurrent());
  return ok;
}
function saveAll() {
  return save();
}
function saveStat() {
  return save();
}
function saveAchList() {
  return save();
}
function settleProgress() {
  refreshProgress();
  save();
  return store.progress;
}
function loadProgress() {
  return refreshProgress();
}
function deriveBranchCleared() {
  const out = [];
  for (let b = 0;b < BRANCHES.length; b++) {
    let all = true;
    for (let k = 0;k < LEVELS_PER_BRANCH; k++) {
      if (!(store.stars[b * LEVELS_PER_BRANCH + k] > 0)) {
        all = false;
        break;
      }
    }
    if (all)
      out.push(b);
  }
  return out;
}
function availableFreeThemes() {
  const out = [];
  for (const b of deriveBranchCleared()) {
    const t = BRANCHES[b] ? BRANCHES[b].theme : b;
    if (!out.includes(t))
      out.push(t);
  }
  return out;
}
function isAdvancedUnlocked(rating) {
  return (Number(rating) || 0) >= RATING_ADVANCED;
}
function deriveUnlocks(progress, stars2) {
  const p = objOr(progress) || {};
  const arr = Array.isArray(stars2) ? stars2 : [];
  const allCleared = LEVELS.length > 0 && arr.length >= LEVELS.length && arr.slice(0, LEVELS.length).every((s) => s >= 1);
  const rating = Math.max(0, intOr(p.rating));
  return {
    allCleared,
    finaleUnlocked: allCleared,
    finaleDone: p.finaleDone === true,
    invited: p.finaleDone === true || p.invited === true,
    advancedUnlocked: isAdvancedUnlocked(rating),
    peak: p.peak === true || rating >= RATING_PEAK
  };
}
function syncFreeThemes() {
  if (!store.progress.peak) {
    store.progress.freeThemes = [];
    return store.progress.freeThemes;
  }
  store.progress.freeThemes = availableFreeThemes();
  return store.progress.freeThemes;
}
function refreshProgress() {
  const d = deriveUnlocks(store.progress, store.stars);
  store.progress.branchCleared = deriveBranchCleared();
  if (d.finaleDone)
    store.progress.finaleDone = true;
  if (d.invited)
    store.progress.invited = true;
  if (d.peak)
    store.progress.peak = true;
  syncFreeThemes();
  return store.progress;
}
function addStat({ runs = 0, meters = 0, seconds = 0, mode = "" } = {}) {
  const st = store.stat;
  const r = Math.max(0, Number(runs) || 0);
  const m = Math.max(0, Number(meters) || 0);
  const s = Math.max(0, Number(seconds) || 0);
  st.totalRuns += r;
  st.totalMeters += m;
  st.totalSeconds += s;
  st.lastPlayed = nowIso();
  if (mode) {
    const b = st.byMode[mode] || (st.byMode[mode] = { runs: 0, meters: 0, seconds: 0 });
    b.runs += r;
    b.meters += m;
    b.seconds += s;
  }
  saveStat();
  return st;
}
function metaOf(id) {
  return store.garageMeta[id] || (store.garageMeta[id] = { odometerM: 0, runs: 0 });
}
function noteVehicleRun(id, meters) {
  const m = metaOf(id);
  m.runs += 1;
  m.odometerM += Math.max(0, Math.round(Number(meters) || 0));
  return m;
}
function noteSpaceResult(key, place, won) {
  const rec = store.space.records[key] || (store.space.records[key] = { runs: 0, wins: 0, best: 0, lastAt: "" });
  rec.runs += 1;
  rec.lastAt = nowIso();
  if (won)
    rec.wins += 1;
  if (place > 0 && (rec.best === 0 || place < rec.best))
    rec.best = place;
  return rec;
}
function noteLevelRun(gi, o) {
  const k = intOr(gi);
  if (k < 0 || k >= LEVELS.length)
    return null;
  const rec = store.levelRecords[k] || (store.levelRecords[k] = { tries: 0, bestMs: 0, bestCoins: 0, lastAt: "" });
  rec.tries += 1;
  rec.lastAt = nowIso();
  if (o && o.done) {
    const ms = Math.max(0, Math.round(Number(o.ms) || 0));
    if (ms > 0 && (rec.bestMs === 0 || ms < rec.bestMs))
      rec.bestMs = ms;
    rec.bestCoins = Math.max(rec.bestCoins, Math.max(0, intOr(o.coins)));
  }
  return rec;
}
function noteRaceRun(fmtIdx, ranked, place, won) {
  const k = intOr(fmtIdx) + "-" + (ranked ? 1 : 0);
  const rec = store.raceRecords[k] || (store.raceRecords[k] = { runs: 0, wins: 0, best: 0, lastAt: "" });
  rec.runs += 1;
  rec.lastAt = nowIso();
  if (won)
    rec.wins += 1;
  if (place > 0 && (rec.best === 0 || place < rec.best))
    rec.best = place;
  return rec;
}
function getUp() {
  const veh = VEHICLES[store.currentVehicle];
  const id = veh ? veh.id : VEHICLES[0].id;
  return store.upgrades[id] || (store.upgrades[id] = { engine: 0, tire: 0, frame: 0, susp: 0 });
}
function loadAchList() {
  if (Array.isArray(store.achGot))
    return;
  const v = jsonOr(lsGet(SAVE_KEYS.ach) || "[]", []);
  store.achGot = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
function readSlots() {
  const v = jsonOr(rawGet(META_KEYS.slots), []);
  return Array.isArray(v) ? v.slice(0, MAX_SLOTS) : [];
}
function writeSlots(v) {
  rawSet(META_KEYS.slots, JSON.stringify(v.slice(0, MAX_SLOTS)));
}
function slotUsed(n) {
  if (rawGet(slotKey(n, SAVE_KEYS.doc)) !== null)
    return true;
  for (const k of ALL_KEYS) {
    if (k === SAVE_KEYS.doc)
      continue;
    if (rawGet(slotKey(n, k)) !== null)
      return true;
  }
  return false;
}
function currentSlot() {
  return slotIndex();
}
function listSlots() {
  const meta = readSlots();
  const out = [];
  for (let n = 0;n < MAX_SLOTS; n++) {
    const used = slotUsed(n);
    const m = meta[n] || {};
    out.push({
      index: n,
      name: m.name || `存档${n + 1}`,
      used,
      active: n === slotIndex(),
      updatedAt: m.updatedAt || "",
      cleared: used ? m.cleared | 0 : 0
    });
  }
  return out;
}
function clearedCountOfCurrent() {
  let n = 0;
  for (const s of store.stars)
    if (s >= 1)
      n++;
  return n;
}
function touchSlotMeta(n, cleared) {
  const meta = readSlots();
  while (meta.length < MAX_SLOTS)
    meta.push({});
  meta[n] = {
    ...meta[n],
    name: meta[n] && meta[n].name ? meta[n].name : `存档${n + 1}`,
    updatedAt: new Date().toISOString().slice(0, 10),
    cleared: cleared | 0
  };
  writeSlots(meta);
}
function switchSlot(n) {
  n = n | 0;
  if (n < 0 || n >= MAX_SLOTS)
    return false;
  if (n === slotIndex())
    return true;
  try {
    save();
  } catch (e) {}
  rawSet(META_KEYS.slot, String(n));
  store.slot = n;
  loadSave();
  return true;
}
function createSlot() {
  if (listSlots().filter((s) => s.used).length >= MAX_SLOTS)
    return -1;
  const target = listSlots().findIndex((s) => !s.used);
  if (target < 0)
    return -1;
  switchSlot(target);
  resetSave();
  return target;
}
function deleteSlot(n) {
  n = n | 0;
  if (n < 0 || n >= MAX_SLOTS || n === slotIndex())
    return false;
  for (const k of ALL_KEYS)
    rawRemove(slotKey(n, k));
  if (n === 0) {
    try {
      const dead = [];
      for (let i = 0;i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.indexOf("bike_") === 0 || k === SAVE_KEYS.doc))
          dead.push(k);
      }
      for (const k of dead)
        rawRemove(k);
    } catch (e) {
      available = false;
    }
  }
  const meta = readSlots();
  while (meta.length < MAX_SLOTS)
    meta.push({});
  meta[n] = {};
  writeSlots(meta);
  return true;
}
function resetSave() {
  applyDoc(null);
  store.createdAt = nowIso();
  writeDoc(buildDoc());
  clearLegacyKeys();
  saveAchList();
  touchSlotMeta(slotIndex(), 0);
  return true;
}
function summarizeSave(doc) {
  const d = objOr(doc) || {};
  let total = 0;
  for (const s of stars) {
    const n = Number(s) || 0;
    if (n > 0)
      total += n;
  }
  const g = objOr(d.garage) || {};
  const league = objOr(objOr(d.space) || {}).league;
  return {
    cleared: stars.filter((s) => Number(s) > 0).length,
    stars: total,
    rating: Math.max(0, intOr((objOr(d.ranked) || {}).rating)),
    spaceRating: Math.max(0, intOr(objOr(league) || {}).rating),
    gold: safeGold(fromPlainDecimal((objOr(d.money) || {}).gold)),
    vehicles: Array.isArray(g.owned) ? g.owned.length : 0
  };
}
function parseSave(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "存档内容不是合法 JSON" };
  }
  if (!objOr(obj) || obj.app !== SAVE_APP) {
    return { ok: false, error: "不是本游戏的存档" };
  }
  let data = null;
  if (obj.format === SAVE_FORMAT)
    data = objOr(obj.doc) || objOr(obj.data);
  else if (obj.format === 1)
    data = legacyDocFrom(obj.data);
  if (!data)
    return { ok: false, error: "存档数据非法" };
  return { ok: true, data, summary: summarizeSave(data) };
}
function exportSave() {
  return JSON.stringify({ app: SAVE_APP, format: SAVE_FORMAT, doc: buildDoc() }, null, 2);
}
function downloadSave() {
  try {
    if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof document === "undefined") {
      return false;
    }
    const blob = new Blob([exportSave()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = saveFileName();
    if (typeof a.click === "function")
      a.click();
    if (typeof URL.revokeObjectURL === "function")
      URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    return false;
  }
}
function saveFileName(d = new Date) {
  const p = (n) => String(n).padStart(2, "0");
  return "dale-bike-save-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + ".json";
}
function importSave(data) {
  const doc = data && data.data ? data.data : data;
  if (!objOr(doc))
    return { ok: false, error: "存档数据非法" };
  applyDoc(doc);
  save();
  return { ok: true, data: doc };
}
function probeStorage() {
  const k = "__dale_probe__";
  try {
    const prev = localStorage.getItem(k);
    localStorage.setItem(k, "1");
    if (prev === null)
      localStorage.removeItem(k);
  } catch (e) {
    available = false;
  }
}
var autoSaveTimer = null;
function initAutoSave(intervalMs = 30000) {
  probeStorage();
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden)
        saveAll();
    });
  }
  if (typeof setInterval === "function" && autoSaveTimer === null) {
    autoSaveTimer = setInterval(() => {
      if (store.state === "play")
        saveAll();
    }, intervalMs);
    if (autoSaveTimer && typeof autoSaveTimer.unref === "function")
      autoSaveTimer.unref();
  }
  return autoSaveTimer;
}

// src/core/input.js
var key = { left: false, right: false, rev: false };
var touchWanted = false;
function modalOpen() {
  return ["settings", "shop", "donate"].some((id) => {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains("hidden");
  });
}
var escForModal = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && modalOpen())
    escForModal = true;
}, true);
var touchActive = false;
function syncTouchVisibility() {
  const el = document.getElementById("touch");
  if (!el)
    return;
  const playing = store.state === "play" || store.state === "pause";
  touchActive = !!(touchWanted && playing);
  el.classList.toggle("hidden", !touchActive);
}
function bind(e, down) {
  const k = (e.key || "").toLowerCase();
  let c = null;
  if (e.code === "ArrowRight" || e.key === "ArrowRight" || k === "d")
    c = "right";
  else if (e.code === "ArrowLeft" || e.key === "ArrowLeft" || k === "a")
    c = "left";
  else if (e.code === "ArrowDown" || e.key === "ArrowDown" || k === "s")
    c = "rev";
  if (c)
    key[c] = down;
}
function initInput(handlers = {}) {
  const H = handlers;
  window.addEventListener("keydown", (e) => {
    initAudio();
    if (e.code === "ArrowLeft" || e.code === "ArrowRight")
      e.preventDefault();
    const st = store.state;
    if (e.code === "KeyR" && (st === "play" || st === "pause" || st === "ended")) {
      e.preventDefault();
      if (H.restart)
        H.restart();
      showToast("\uD83D\uDD04 重新开始", 500);
      return;
    }
    if (e.code === "KeyU") {
      e.preventDefault();
      if (H.toggleShop)
        H.toggleShop();
      return;
    }
    if (e.code === "KeyM") {
      e.preventDefault();
      store.muted = !store.muted;
      save();
      showToast(store.muted ? "\uD83D\uDD07 已静音" : "\uD83D\uDD0A 声音开启", 600);
      return;
    }
    if (escForModal) {
      escForModal = false;
      return;
    }
    if ((e.code === "Escape" || e.code === "KeyP") && (st === "play" || st === "pause")) {
      e.preventDefault();
      if (H.togglePause)
        H.togglePause();
      return;
    }
    bind(e, true);
  });
  window.addEventListener("keyup", (e) => bind(e, false));
  window.addEventListener("blur", () => {
    key.left = false;
    key.right = false;
    key.rev = false;
    bike.angVel = 0;
  });
  const touchEl = document.getElementById("touch");
  const touchBtn = document.getElementById("touchBtn");
  let isTouch = false;
  try {
    isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window && (navigator.maxTouchPoints || 0) > 1;
  } catch (e) {
    isTouch = "ontouchstart" in window;
  }
  touchWanted = isTouch;
  syncTouchVisibility();
  if (touchBtn) {
    touchBtn.classList.toggle("on", touchWanted);
    touchBtn.addEventListener("click", () => {
      touchWanted = !touchWanted;
      touchBtn.classList.toggle("on", touchWanted);
      syncTouchVisibility();
    });
  }
  document.querySelectorAll(".tbtn[data-k]").forEach((b) => {
    const k = b.dataset.k;
    const on = (ev) => {
      ev.preventDefault();
      key[k] = true;
    };
    const off = (ev) => {
      ev.preventDefault();
      key[k] = false;
    };
    b.addEventListener("touchstart", on, { passive: false });
    b.addEventListener("touchend", off, { passive: false });
    b.addEventListener("touchcancel", off, { passive: false });
    b.addEventListener("mousedown", on);
    b.addEventListener("mouseup", off);
    b.addEventListener("mouseleave", off);
  });
  const fullBtn = document.getElementById("fullBtn");
  if (fullBtn) {
    fullBtn.addEventListener("click", () => {
      const d = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen)
          document.exitFullscreen();
        else if (document.webkitExitFullscreen)
          document.webkitExitFullscreen();
      } else if (d.requestFullscreen) {
        d.requestFullscreen();
      } else if (d.webkitRequestFullscreen) {
        d.webkitRequestFullscreen();
      }
    });
  }
}

// src/core/loop.js
class Stepper {
  constructor(step, fixed = DT, maxSteps = 15) {
    this.step = step;
    this.fixed = fixed;
    this.maxSteps = maxSteps;
    this.acc = 0;
    this.lastSteps = 0;
  }
  advance(dtSeconds) {
    if (!(dtSeconds > 0)) {
      this.lastSteps = 0;
      return 0;
    }
    this.acc += Math.min(dtSeconds, 0.25);
    let n = 0;
    while (this.acc >= this.fixed && n < this.maxSteps) {
      this.step(this.fixed);
      this.acc -= this.fixed;
      n++;
    }
    if (n >= this.maxSteps)
      this.acc = 0;
    this.lastSteps = n;
    return n;
  }
  reset() {
    this.acc = 0;
    this.lastSteps = 0;
  }
}
function startRaf(frame) {
  let last = 0;
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (!last) {
      last = t;
      frame(0);
      return;
    }
    const dt = (t - last) / 1000;
    last = t;
    frame(dt);
  };
  requestAnimationFrame(tick);
}

// src/config/ui-tokens.js
var TOKENS = Object.freeze({
  "surface-0": "#070f18",
  "surface-1": "#0d1b2a",
  "surface-2": "#14283b",
  "surface-3": "#1d3550",
  "glass-fill": "rgba(255,255,255,0.06)",
  "glass-fill-strong": "rgba(255,255,255,0.12)",
  "glass-border": "rgba(255,255,255,0.18)",
  "glass-highlight": "rgba(255,255,255,0.34)",
  "glass-blur": "14px",
  "glass-shadow-in": "inset 0 1px 0 rgba(255,255,255,0.16)",
  "glass-shadow-out": "0 10px 30px rgba(0,0,0,0.42)",
  accent: "#06d6a0",
  "accent-2": "#118ab2",
  "accent-grad": "linear-gradient(135deg, #06d6a0, #118ab2)",
  "accent-glow": "rgba(6,214,160,0.35)",
  success: "#4cff88",
  warn: "#ffba08",
  danger: "#e63946",
  gold: "#ffd166",
  info: "#7ce7ff",
  "text-hi": "#ffffff",
  "text-mid": "#dbe3ec",
  "text-lo": "#a9b6c6",
  "font-family": '"Segoe UI", system-ui, sans-serif',
  "font-mono": 'ui-monospace, "SFMono-Regular", Consolas, monospace',
  "font-display-size": "44px",
  "font-display-lh": "1.1",
  "font-display-weight": "800",
  "font-title-size": "20px",
  "font-title-lh": "1.25",
  "font-title-weight": "700",
  "font-body-size": "14px",
  "font-body-lh": "1.6",
  "font-body-weight": "400",
  "font-caption-size": "12px",
  "font-caption-lh": "1.45",
  "font-caption-weight": "600",
  "font-micro-size": "10px",
  "font-micro-lh": "1.3",
  "font-micro-weight": "700",
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "24px",
  "space-6": "32px",
  "radius-chip": "8px",
  "radius-card": "14px",
  "radius-sheet": "20px",
  "radius-pill": "999px",
  "dur-fast": "120ms",
  "dur-base": "200ms",
  "dur-slow": "320ms",
  "ease-std": "cubic-bezier(0.2, 0.7, 0.3, 1)",
  "ease-enter": "cubic-bezier(0, 0.6, 0.3, 1)",
  "ease-exit": "cubic-bezier(0.4, 0, 1, 1)",
  "obj-coin": "#ffd166",
  "obj-coin-dark": "#d9a400",
  "obj-canister": "#8a9098",
  "obj-canister-top": "#a9aeb6",
  "obj-boost": "#4cff88",
  "obj-hazard": "#e63946",
  "obj-hazard-soft": "rgba(255,72,60,0.16)",
  "obj-gate": "#7ce7ff",
  "obj-gate-passed": "#4cff88",
  "obj-finish": "#ee1111",
  "obj-bike-frame": "#1b1b1b",
  "obj-bike-metal": "#666666",
  "obj-bike-dark": "#161c22",
  "obj-rider-skin": "#e8a97e",
  "obj-rider-suit": "#e88c1f",
  "obj-dust-light": "rgba(255,255,255,0.6)",
  "obj-dust-heavy": "rgba(180,150,220,0.35)",
  "obj-shadow": "rgba(0,0,0,0.18)",
  "obj-shadow-soft": "rgba(0,0,0,0.12)",
  "obj-platform": "#2c3742",
  "obj-platform-dark": "#1d242b",
  "obj-glass-light": "rgba(255,255,255,0.12)",
  "obj-glass-mid": "rgba(255,255,255,0.6)",
  "obj-canister": "#e85d04",
  "obj-canister-dark": "#9c3d00",
  "obj-canister-glow": "rgba(255,160,20,0.16)",
  "obj-pole": "#555555",
  "obj-jump-base": "rgba(20,26,34,0.85)",
  "obj-jump-rim": "rgba(124,231,255,0.95)",
  "obj-jump-rim-used": "rgba(120,140,160,0.5)",
  "obj-jump-glow": "rgba(124,231,255,0.9)",
  "obj-hazard-fill": "rgba(18,18,22,0.85)",
  "obj-hazard-mark": "#ff5a4a",
  "obj-hazard-edge": "rgba(255,96,72,0.6)",
  "obj-gate-open": "rgba(90,225,140,0.9)",
  "obj-gate-pending": "rgba(255,208,80,0.92)",
  "obj-bike-tire": "#222222",
  "obj-bike-carbon": "#333333",
  "obj-bike-rim": "#2a2a2a",
  "obj-bike-hub": "#c0392b",
  "obj-bike-steel": "#555555",
  "obj-bike-gray": "#4a4a4a",
  "obj-helmet": "#212b34",
  "obj-goggle": "#8ad2ff",
  "obj-hair": "#3b2a20",
  "obj-rider-skin-2": "#f4a259",
  "obj-rider-skin-hi": "#ffcba5",
  "obj-rider-skin-sh": "#c98a5f",
  "obj-suit-far-dark": "#0d1116",
  "fx-halo-white": "rgba(255,255,255,0.40)",
  "fx-halo-warm": "rgba(255,140,60,0.45)",
  "fx-halo-warm-0": "rgba(255,140,60,0)",
  "fx-halo-sand": "rgba(255,208,138,0.6)",
  "fx-halo-none": "rgba(255,255,255,0)",
  "fx-cloud-green": "rgba(120,205,160,0.6)",
  "fx-cloud-white": "rgba(255,255,255,0.22)",
  "fx-ridge-white": "rgba(255,255,255,0.5)",
  "fx-shadow-soft": "rgba(0,0,0,0.15)",
  "fx-shadow-faint": "rgba(0,0,0,0.08)",
  "fx-none-dark": "rgba(0,0,0,0)",
  "fx-vignette-edge": "rgba(0,0,0,0.03)",
  "fx-lit-top": "rgba(255,248,222,1)",
  "fx-shade-top": "rgba(9,15,28,1)",
  "fx-vignette": "rgba(0,0,0,0.32)",
  "fx-fade-top": "rgba(255,255,255,0.015)",
  "fx-fade-hi-top": "rgba(255,255,255,0.05)",
  "fx-sun-warm": "rgba(255,248,222,0.32)",
  "fx-sun-none": "rgba(255,248,222,0)",
  "fx-fog-mist": "rgba(236,245,255,0.15)",
  "glass-hover": "rgba(255,255,255,0.2)",
  track: "rgba(255,255,255,0.2)",
  scrim: "rgba(8,20,32,0.74)",
  "scrim-menu": "rgba(8,20,32,0.60)",
  "hud-scrim": "rgba(6,14,24,0.55)",
  "scrim-strong": "rgba(8,20,32,0.88)",
  "scrim-solid": "rgba(8,20,32,0.97)",
  "success-soft": "rgba(80,255,150,0.16)",
  "gold-soft": "rgba(255,209,102,0.16)",
  "shadow-sm": "rgba(0,0,0,0.35)",
  "shadow-md": "rgba(0,0,0,0.42)",
  "shadow-text": "rgba(0,0,0,0.6)",
  "shadow-text-strong": "rgba(0,0,0,0.72)",
  muted: "#7a869a",
  ink: "#4a2b00",
  "gold-2": "#f0a83c",
  "gold-3": "#e08b22",
  "gold-glow": "rgba(255,205,90,0.4)",
  "gold-glow-strong": "rgba(255,215,110,0.75)",
  "info-glow": "rgba(124,231,255,0.4)",
  "grad-progress": "linear-gradient(90deg, #06d6a0, #ffd166)",
  "grad-fuel": "linear-gradient(90deg, #e85d04, #ffba08)",
  "grad-donate": "linear-gradient(135deg, #ffd166, #f0a83c 55%, #e08b22)",
  press: "rgba(255,255,255,0.42)",
  "toggle-on": "rgba(80,255,150,0.28)",
  "toggle-on-border": "rgba(120,255,170,0.65)"
});
var SEMANTIC = Object.freeze({
  info: "info",
  success: "success",
  warn: "warn",
  danger: "danger",
  gold: "gold",
  accent: "accent"
});
function token(name) {
  const v = TOKENS[name];
  return v === undefined ? "" : v;
}
function tokenNum(name, fallback = 0) {
  const n = parseFloat(TOKENS[name]);
  return Number.isFinite(n) ? n : fallback;
}
function fontOf(level = "body") {
  const size = TOKENS["font-" + level + "-size"] || TOKENS["font-body-size"];
  const weight = TOKENS["font-" + level + "-weight"] || TOKENS["font-body-weight"];
  return weight + " " + size + " " + TOKENS["font-family"];
}

// src/physics/terrain.js
function hillY(x) {
  if (store.mode === "free")
    return freeHill(x);
  return levelHillY(courseAt(store.selLevel, store.mode), x);
}
function groundY(x) {
  return hillY(x);
}
function groundInfo(x) {
  const e = 2;
  const y0 = groundY(x);
  const yL = groundY(x - e);
  const yR = groundY(x + e);
  if (!isFinite(y0) || !isFinite(yL) || !isFinite(yR)) {
    const safe = isFinite(y0) ? y0 : isFinite(yL) ? yL : isFinite(yR) ? yR : 0;
    return { y: safe, m: 0 };
  }
  return { y: y0, m: (yR - yL) / (2 * e) };
}
function groundSlope(x) {
  const e = 2;
  const yL = groundY(x - e);
  const yR = groundY(x + e);
  if (!isFinite(yL) || !isFinite(yR))
    return 0;
  return (yR - yL) / (2 * e);
}
function groundNormal(x) {
  const m = groundSlope(x);
  const d = Math.hypot(1, m) || 1;
  return { x: m / d, y: -1 / d };
}
function canSpot(len, xx) {
  let best2 = clamp(xx, 140, len - 140);
  let bm = 9;
  for (let d = -170;d <= 170; d += 10) {
    const tx = clamp(xx + d, 140, len - 140);
    const m = Math.abs(groundInfo(tx).m);
    if (m < bm) {
      bm = m;
      best2 = tx;
    }
  }
  return best2;
}
function safeSpot(x) {
  let bx = x;
  let bm = Math.abs(groundInfo(x).m);
  for (let d = -200;d <= 600; d += 20) {
    const xx = Math.max(24, x + d);
    const m = Math.abs(groundInfo(xx).m);
    if (m < bm) {
      bm = m;
      bx = xx;
    }
  }
  return bx;
}

// src/physics/events.js
var noop = () => {};
var hooks = { onCrash: noop, onLand: noop, onSlip: noop };
function initPhysicsEvents(h) {
  hooks = {
    onCrash: h && typeof h.onCrash === "function" ? h.onCrash : noop,
    onLand: h && typeof h.onLand === "function" ? h.onLand : noop,
    onSlip: h && typeof h.onSlip === "function" ? h.onSlip : noop
  };
  return hooks;
}
function physEvents() {
  return hooks;
}

// src/physics/bike.js
var TAU = Math.PI * 2;
var WHEELS = ["rear", "front"];
var numCapHits = 0;
function bikeVx() {
  return systemVel(bike).vx;
}
var WARP_ACC = 6.5;
var WARP_V_CAP = 90;
function activeMode(veh) {
  const v = veh || VEHICLES[store.currentVehicle];
  if (!v || !v.ultra || !v.ultra.mode)
    return "";
  if (v.ultra.builtin === true)
    return v.ultra.mode;
  return store.ultra[v.id] === true ? v.ultra.mode : "";
}
var MODE_FLAGS = {
  stable: { pinGround: true, noCrash: true },
  shield: { noCrash: true },
  phase: { noCrash: true, noFuel: true, noHazard: true },
  railgun: {},
  surge: {},
  warp: {},
  absolut: { noCrash: true, noFuel: true, noHazard: true },
  omega: { fly: true, noCrash: true, noFuel: true, noHazard: true }
};
function ultraFlags() {
  return MODE_FLAGS[activeMode()] || {};
}
function ultraFx() {
  const v = VEHICLES[store.currentVehicle];
  const m = activeMode(v);
  if (!m || !v.ultra)
    return {};
  return v.ultra.fx || {};
}
function isUltraStable() {
  return ultraFlags().pinGround === true;
}
function isFlighter() {
  if (ultraFlags().fly === true)
    return true;
  const v = VEHICLES[store.currentVehicle];
  return !!(v && v.hover);
}
function isCrashImmune() {
  return ultraFlags().noCrash === true;
}
function hasInfiniteFuel() {
  return ultraFlags().noFuel === true;
}
function ignoresHazardLimit() {
  return ultraFlags().noHazard === true;
}
function pinToGround() {
  const b = bike;
  for (const wk of WHEELS) {
    const W = b[wk];
    const g = groundInfo(W.x);
    if (!isFinite(g.y))
      continue;
    const n = groundNormal(W.x);
    const wheelY = g.y + n.y * WHEEL_R;
    W.y = wheelY;
    W.py = wheelY;
    W._vy = 0;
    const A = wk === "rear" ? b.axleRear : b.axleFront;
    A.y = wheelY;
    A.py = wheelY;
    A._vy = 0;
  }
  const midY = (b.axleRear.y + b.axleFront.y) * 0.5;
  b.head.y = midY - SEAT_H;
  b.head.py = midY - SEAT_H;
  b.head._vy = 0;
}
function wheelieExcessOf(P) {
  const flip = P.rb.mTot * P.gravity * WHEELBASE * 0.5;
  if (!(flip > 0))
    return 0;
  return wheelieTauOf(P.rb.mTot, P.gravity, P.wheelieMul) / flip;
}
var WHEELIE_SAFE_DEG = 8;
var WHEELIE_CUT_DEG = 30;
function wheelieGovernor(b, throttle, P) {
  if (!throttle)
    return 1;
  if (P && wheelieExcessOf(P) > ANTI_ENGAGE)
    return 1;
  if (Math.abs(systemVel(b).vx) < 200)
    return 1;
  const pitch = Math.atan2(b.rear.y - b.front.y, b.front.x - b.rear.x);
  if (pitch <= 0)
    return 1;
  const deg = pitch * 180 / Math.PI;
  if (deg <= WHEELIE_SAFE_DEG)
    return 1;
  if (deg >= WHEELIE_CUT_DEG)
    return 0;
  const t = (deg - WHEELIE_SAFE_DEG) / (WHEELIE_CUT_DEG - WHEELIE_SAFE_DEG);
  return 1 - t * t * (3 - 2 * t);
}
var ANTI_ENGAGE = 4;
var ANTI_SAFE_DEG = 10;
function antiWheelie(b, P, sub) {
  if (b.grounded <= 0)
    return;
  const excess = wheelieExcessOf(P);
  if (excess <= ANTI_ENGAGE)
    return;
  const pitch = Math.atan2(b.rear.y - b.front.y, b.front.x - b.rear.x);
  const safe = ANTI_SAFE_DEG * Math.max(0, 1 - (excess - ANTI_ENGAGE) / 6) * Math.PI / 180;
  if (pitch <= safe)
    return;
  const gain = Math.min(80, excess * 1.5);
  const maxRate = Math.min(5, 0.9 + Math.log10(excess) * 1.6);
  const rate = (b.rear._vy - b.front._vy) / WHEELBASE;
  const target = clamp(-(pitch - safe) * gain, -maxRate, maxRate);
  const dv = (target - rate) * WHEELBASE * 0.5;
  b.front._vy += dv;
  b.rear._vy -= dv;
  b.head._vy -= dv * 0.5;
}
function flightStep(P, dt, throttle, brk, rev) {
  const b = bike;
  const sv = systemVel(b);
  const vx = sv.vx;
  const base = P.baseTopSpeed || P.topSpeed;
  const cruise = activeMode() === "omega" ? P.topSpeed : P.baseTopSpeed || P.topSpeed;
  let target;
  if (rev)
    target = -base * REV_SPEED;
  else if (brk)
    target = 0;
  else if (throttle)
    target = cruise;
  else
    target = 0;
  const dragK = P.airDragK;
  const need = dragK * target * Math.abs(target) / P.rb.mTot;
  const cap = Math.max(P.mu * P.rb.mTot * P.gravity * REAR_LOAD * OMEGA_THRUST_K, Math.abs(target) * OMEGA_ACC_FRAC);
  const ff = need;
  const drag = dragK * vx * Math.abs(vx) / P.rb.mTot;
  const push = clamp((target - vx) * OMEGA_SERVO_ACC + ff - drag, -cap, cap);
  const nextVx = brk ? clamp(vx - P.brakePeak * 0.6 * dt, -base * REV_SPEED, base * REV_SPEED) : vx + push * dt;
  const midX = (b.rear.x + b.front.x) * 0.5;
  const g = groundInfo(midX);
  const n = groundNormal(midX);
  const restY = (isFinite(g.y) ? g.y : b.rear.y) + n.y * (FLIGHT_HOVER + WHEEL_R);
  const curY = (b.rear.y + b.front.y) * 0.5;
  b.hoverY += (restY - b.hoverY) * Math.min(1, dt * FLIGHT_HOVER_LP);
  const vTarget = clamp((b.hoverY - curY) * FLIGHT_HOVER_K, -1600, 1600);
  const nextVy = clamp(sv.vy + ((vTarget - sv.vy) * FLIGHT_HOVER_K - P.gravity) * dt, -2400, 2400);
  const surfAng = Math.atan2(n.x, -n.y);
  const curAng = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
  const dAng = wrapAngle(surfAng * FLIGHT_PITCH_K - curAng);
  rotateAroundMid(b, clamp(dAng, -0.08, 0.08));
  for (const p of b.pts) {
    p._vx = nextVx;
    p._vy = nextVy;
    p.px = p.x - nextVx * DT;
    p.py = p.y - nextVy * DT;
    p.x += nextVx * DT;
    p.y += nextVy * DT;
  }
  const w = nextVx / WHEEL_R;
  for (const wk of WHEELS) {
    b.wheelRot[wk] += (w - b.wheelRot[wk]) * Math.min(1, dt * 40);
  }
  b.grounded = 0;
}
function rotateAroundMid(b, ang) {
  if (!ang)
    return;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  let mx = 0, my = 0, mt = 0;
  for (const p of b.pts) {
    mx += p.x * p.m;
    my += p.y * p.m;
    mt += p.m;
  }
  if (!(mt > 0))
    return;
  mx /= mt;
  my /= mt;
  const sv = systemVel(b);
  const sub = DT;
  for (const p of b.pts) {
    const rx = p.x - mx;
    const ry = p.y - my;
    p.x = mx + rx * c - ry * s;
    p.y = my + rx * s + ry * c;
    const rvx = p._vx - sv.vx;
    const rvy = p._vy - sv.vy;
    p._vx = sv.vx + rvx * c - rvy * s;
    p._vy = sv.vy + rvx * s + rvy * c;
    p.px = p.x - p._vx * sub;
    p.py = p.y - p._vy * sub;
  }
  b.lastAng = wrapAngle(b.lastAng + ang);
}
function retuneTopSpeed(v, fx) {
  const base = wheelieMulOf(v, getUp());
  const n = fx.wheelieN != null ? fx.wheelieN : 1.8;
  store.phys.wheelieMul = base * n;
  if (!fx.dragK)
    store.phys.airDragK = AIR_DRAG_K * (fx.dragK0 != null ? fx.dragK0 : 0.35);
  store.phys.topSpeed = topSpeedOf(v, getUp(), {
    mu: store.phys.mu,
    airDragK: store.phys.airDragK,
    wheelieMul: store.phys.wheelieMul,
    rpmK: store.phys.rpmK
  });
}
function applyUpgrades() {
  const v = VEHICLES[store.currentVehicle];
  const up = getUp();
  Object.assign(store.phys, deriveHandling(v, up));
  const rb = deriveRigidBody(v);
  store.phys.rb = rb;
  store.phys.susp = deriveSuspension(v, up);
  store.phys.mu = deriveFriction(store.phys.traction, v, up);
  store.phys.wheelI = wheelInertia(rb.mW);
  store.phys.wheelieMul = wheelieMulOf(v, up);
  store.phys.baseTopSpeed = store.phys.topSpeed;
  store.phys.airDragK = AIR_DRAG_K;
  const fx = ultraFx();
  const mode = activeMode(v);
  if (mode === "surge") {
    store.phys.rpmK *= fx.rpmK || 1;
    if (fx.dragK)
      store.phys.airDragK = AIR_DRAG_K * fx.dragK;
    retuneTopSpeed(v, fx);
  } else if (mode === "railgun") {
    store.phys.rpmK *= fx.rpmK || 1;
    if (fx.dragK)
      store.phys.airDragK = AIR_DRAG_K * fx.dragK;
    retuneTopSpeed(v, fx);
  } else if (mode === "absolut") {
    store.phys.topSpeed = ABSOLUT_V;
    store.phys.airDragK = ABSOLUT_DRAG_K;
  } else if (mode === "omega") {
    const veh = VEHICLES[store.currentVehicle];
    const nominal = (veh && veh.nominalKmh || 1000) / 3.6 * PX_PER_M;
    const cruise = ultraCruiseOf(veh, getUp(), nominal);
    store.phys.topSpeed = cruise;
    const nominalV = nominal;
    store.phys.airDragK = cruise > 1 ? OMEGA_DRAG_K * (nominalV / cruise) * (nominalV / cruise) : OMEGA_DRAG_K;
    store.phys.omegaCruise = cruise;
  } else if (mode === "warp") {
    store.phys.rpmK *= 2;
    if (fx.dragK)
      store.phys.airDragK = AIR_DRAG_K * fx.dragK;
    retuneTopSpeed(v, fx);
  } else if (mode === "stable" || mode === "shield" || mode === "phase") {
    if (fx.gripK)
      store.phys.mu *= fx.gripK;
    retuneTopSpeed(v, fx);
  }
  bike.rb = rb;
  bindMasses(rb);
}
function bindMasses(rb) {
  const b = bike;
  b.rear.m = rb.mW;
  b.front.m = rb.mW;
  b.axleRear.m = rb.mR;
  b.axleFront.m = rb.mF;
  b.head.m = rb.mH;
  for (const p of b.pts)
    p.im = p.m > 0 ? 1 / p.m : 0;
}
function resetBike(x) {
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
    [b.axleFront, x + L, yF]
  ]) {
    p.x = px;
    p.y = py;
    p.px = px;
    p.py = py;
    p._vx = 0;
    p._vy = 0;
  }
  const hx = x + L / 2 + Math.sin(ang) * SEAT_H;
  const hy = (yR + yF) / 2 - Math.cos(ang) * SEAT_H;
  b.head.x = hx;
  b.head.y = hy;
  b.head.px = hx;
  b.head.py = hy;
  b.head._vx = 0;
  b.head._vy = 0;
  b.grounded = 0;
  b.speed = 0;
  b.wheelAngleRear = 0;
  b.wheelAngleFront = 0;
  b.wheelStepRear = 0;
  b.wheelStepFront = 0;
  b.squash = 0;
  b.squashVel = 0;
  b.angVel = 0;
  b.rotAcc = 0;
  b.lastAng = ang;
  b.penetration = 0;
  b._impactV = 0;
  const ux = b.axleFront.x - b.axleRear.x;
  const uy = b.axleFront.y - b.axleRear.y;
  const d = Math.hypot(ux, uy) || 0.0001;
  const cross = ux / d * (b.head.y - b.axleRear.y) - uy / d * (b.head.x - b.axleRear.x);
  b.headUp = Math.sign(cross) || -1;
  b.wheelRot.rear = 0;
  b.wheelRot.front = 0;
  b.wheelAcc.rear = 0;
  b.wheelAcc.front = 0;
  b.susp.rear.t = 0;
  b.susp.rear.v = 0;
  b.susp.front.t = 0;
  b.susp.front.v = 0;
  b.slip.rear = 0;
  b.slip.front = 0;
  b.fn.rear = 0;
  b.fn.front = 0;
  b.fricAcc.rear = 0;
  b.fricAcc.front = 0;
  b.boostT = 0;
  {
    const nx = x + L / 2;
    const ng = groundInfo(nx);
    const nn = groundNormal(nx);
    b.hoverY = (isFinite(ng.y) ? ng.y : yR) + nn.y * (FLIGHT_HOVER + WHEEL_R);
  }
  b.angRate = 0;
  b.rb = store.phys.rb;
  bindMasses(store.phys.rb);
}
function crash() {
  if (isCrashImmune())
    return;
  const run = store.run;
  if (run.crashed)
    return;
  run.crashed = true;
  run.hasCrashed = true;
  run.crashTimer = STUN_TIME;
  run.combo = 0;
  const P = store.phys;
  P.fuel = Math.max(0, P.fuel - CRASH_FUEL_LOSS * P.fuelMax);
  run.penaltyTime += CRASH_TIME_PENALTY;
  physEvents().onCrash({
    x: bike.head.x,
    y: bike.head.y,
    fuelLoss: CRASH_FUEL_LOSS,
    timePenalty: CRASH_TIME_PENALTY
  });
}
function syncVel(b, sub) {
  for (const p of b.pts) {
    p._vx = (p.x - p.px) / sub;
    p._vy = (p.y - p.py) / sub;
  }
}
function addVel(p, dvx, dvy) {
  p._vx += dvx;
  p._vy += dvy;
}
function integrate(b, sub) {
  for (const p of b.pts) {
    p.px = p.x;
    p.py = p.y;
    p.x += p._vx * sub;
    p.y += p._vy * sub;
  }
}
function frameOf(b) {
  const a = Math.atan2(b.axleFront.y - b.axleRear.y, b.axleFront.x - b.axleRear.x);
  return { a, tx: Math.cos(a), ty: Math.sin(a), dx: -Math.sin(a), dy: Math.cos(a) };
}
function bodyLow(b) {
  return b.head.y > (b.axleRear.y + b.axleFront.y) * 0.5;
}
function systemVel(b) {
  let vx = 0, vy = 0, mt = 0;
  for (const p of b.pts) {
    vx += p._vx * p.m;
    vy += p._vy * p.m;
    mt += p.m;
  }
  return { vx: vx / mt, vy: vy / mt, m: mt };
}
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
    const mRel = 1 / (W.im + A.im);
    const FdCap = Math.abs(cRate) * mRel / sub;
    let Fd = susp.c * cRate;
    if (Math.abs(Fd) > FdCap)
      Fd = Math.sign(Fd) * FdCap;
    F += Fd;
    if (F > FN_MAX)
      F = FN_MAX;
    else if (F < -FN_MAX)
      F = -FN_MAX;
    const jx = fr.dx * F * sub;
    const jy = fr.dy * F * sub;
    addVel(W, jx * W.im, jy * W.im);
    addVel(A, -jx * A.im, -jy * A.im);
    b.susp[wk].t = c;
    b.susp[wk].v = cRate;
  }
}
function applyDrive(b, P, sub, throttle, brk, rev) {
  if (isUltraStable()) {
    const sv = systemVel(b);
    const vx = sv.vx;
    let target = 0;
    if (rev)
      target = -(P.baseTopSpeed || P.topSpeed) * REV_SPEED;
    else if (throttle)
      target = P.topSpeed * 0.95;
    const maxAcc = P.topSpeed * 2;
    const dv = clamp(target - vx, -maxAcc * sub, maxAcc * sub);
    if (dv !== 0)
      for (const p of b.pts)
        p._vx += dv;
    const want = vx / WHEEL_R;
    b.wheelRot.rear += clamp(want - b.wheelRot.rear, -40, 40) * sub;
    b.wheelRot.front = b.wheelRot.rear;
    return;
  }
  const veh = VEHICLES[store.currentVehicle];
  const IW = P.wheelI || wheelInertia(P.rb.mW);
  const wheelieTau = wheelieTauOf(P.rb.mTot, P.gravity, P.wheelieMul);
  const driveK = wheelieGovernor(b, throttle, P);
  for (const wk of WHEELS) {
    let w = b.wheelRot[wk];
    let tau = 0;
    if (wk === "rear" && throttle)
      tau += clamp(torqueAt(veh, w, throttle, P.torquePeak, P.rpmK || 1) * driveK, -wheelieTau, wheelieTau);
    if (wk === "rear" && rev && !brk) {
      const base = P.baseTopSpeed || P.topSpeed;
      const wantW = -base * REV_SPEED / WHEEL_R;
      tau += clamp(clamp((wantW - w) * IW / sub, -wheelieTau, wheelieTau), -wheelieTau, wheelieTau);
    }
    if (brk) {
      const cap = Math.min(P.brakePeak, Math.abs(w) * IW / sub);
      tau -= Math.sign(w || 1) * cap * brk;
    }
    if (tau)
      w += tau / IW * sub;
    const Fn = b.fn[wk];
    if (Fn > 0 && w !== 0) {
      const dw = ROLL_RES_K * Fn * WHEEL_R * sub / IW;
      w -= Math.sign(w) * Math.min(dw, Math.abs(w));
    }
    b.wheelRot[wk] = w;
  }
}
function applyDrag(b, P, sub) {
  const sv = systemVel(b);
  const sp = Math.hypot(sv.vx, sv.vy);
  if (sp < 0.000001)
    return;
  const k = P.airDragK || AIR_DRAG_K;
  const decel = k * sp * sp + LINEAR_DRAG_K * sp;
  const ax = -sv.vx / sp * decel / sv.m;
  const ay = -sv.vy / sp * decel / sv.m;
  for (const p of b.pts)
    addVel(p, ax * sub, ay * sub);
}
function velDistance(a, b, L0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 0.000001;
  const nx = dx / d;
  const ny = dy / d;
  const vrel = (b._vx - a._vx) * nx + (b._vy - a._vy) * ny;
  const mEff = 1 / (a.im + b.im);
  const J = -vrel * mEff;
  addVel(a, -nx * J * a.im, -ny * J * a.im);
  addVel(b, nx * J * b.im, ny * J * b.im);
  return Math.abs(d - L0);
}
function velLateral(W, A, fr, sub) {
  const et = (W.x - A.x) * fr.tx + (W.y - A.y) * fr.ty;
  const vrel = (W._vx - A._vx) * fr.tx + (W._vy - A._vy) * fr.ty;
  const mEff = 1 / (W.im + A.im);
  const J = -(vrel + CONTACT_BIAS * et / sub) * mEff;
  addVel(W, fr.tx * J * W.im, fr.ty * J * W.im);
  addVel(A, -fr.tx * J * A.im, -fr.ty * J * A.im);
  return Math.abs(et);
}
function velTravel(W, A, fr, susp) {
  const s = (W.x - A.x) * fr.dx + (W.y - A.y) * fr.dy;
  const c = -s;
  const cRate = -((W._vx - A._vx) * fr.dx + (W._vy - A._vy) * fr.dy);
  let hit = false;
  if (c >= susp.travel && cRate > 0)
    hit = true;
  else if (c <= -susp.ext && cRate < 0)
    hit = true;
  if (hit) {
    const mEff = 1 / (W.im + A.im);
    const J = cRate * mEff;
    addVel(W, fr.dx * J * W.im, fr.dy * J * W.im);
    addVel(A, -fr.dx * J * A.im, -fr.dy * J * A.im);
  }
  return hit ? Math.abs(c > 0 ? c - susp.travel : c + susp.ext) : 0;
}
function solveContacts(b, P, mu, sub, first, geo) {
  const IW = P.wheelI || wheelInertia(P.rb.mW);
  const FN_MAX = FN_MAX_K * P.rb.mTot * P.gravity;
  if (first)
    b.grounded = 0;
  for (const wk of WHEELS) {
    const W = b[wk];
    const g = geo[wk].info;
    if (first) {
      b.fn[wk] = 0;
      b.slip[wk] = 0;
      b.fricAcc[wk] = 0;
    }
    if (!isFinite(g.y))
      continue;
    const n = geo[wk].norm;
    const cosT = -n.y;
    const tx = -n.y;
    const ty = n.x;
    const pen = WHEEL_R - (g.y - W.y) * cosT;
    if (pen > b.penetration)
      b.penetration = Math.max(0, pen);
    if (pen < -CONTACT_BAND)
      continue;
    const vn = W._vx * n.x + W._vy * n.y;
    const bias = Math.min(Math.max(0, pen - PEN_TOL) * CONTACT_BIAS / sub, BIAS_MAX_V);
    let Jn = (bias - vn) * W.m;
    if (Jn < 0)
      Jn = 0;
    if (Jn > FN_MAX * sub)
      Jn = FN_MAX * sub;
    if (Jn > 0) {
      addVel(W, n.x * Jn * W.im, n.y * Jn * W.im);
      if (first) {
        b.grounded++;
        if (vn < 0)
          b._impactV = Math.max(b._impactV, -vn);
      }
    }
    if (first)
      b.fn[wk] = Jn / sub;
    const vt = W._vx * tx + W._vy * ty;
    const w = b.wheelRot[wk];
    const slip = vt - w * WHEEL_R;
    let dJ = -slip / (W.im + WHEEL_R * WHEEL_R / IW);
    const Jmax = mu * Jn;
    const acc0 = b.fricAcc[wk];
    const lo = -Jmax;
    const hi = Jmax;
    if (acc0 + dJ < lo)
      dJ = lo - acc0;
    else if (acc0 + dJ > hi)
      dJ = hi - acc0;
    b.fricAcc[wk] = acc0 + dJ;
    if (dJ !== 0) {
      addVel(W, tx * dJ * W.im, ty * dJ * W.im);
      b.wheelRot[wk] = w - dJ * WHEEL_R / IW;
    }
    if (first) {
      const denom = Math.max(20, Math.abs(w * WHEEL_R));
      b.slip[wk] = clamp(slip / denom, -1, 1);
    }
  }
  solveBodyContact(b, FN_MAX, sub);
}
function solveBodyContact(b, FN_MAX, sub) {
  if (!bodyLow(b))
    return;
  const H = b.head;
  const g = groundInfo(H.x);
  if (!isFinite(g.y))
    return;
  const n = groundNormal(H.x);
  const cosT = -n.y;
  const pen = HEAD_R - (g.y - H.y) * cosT;
  if (pen < -CONTACT_BAND)
    return;
  const vn = H._vx * n.x + H._vy * n.y;
  const bias = Math.min(Math.max(0, pen - PEN_TOL) * CONTACT_BIAS / sub, BIAS_MAX_V);
  let Jn = (bias - vn) * H.m;
  if (Jn < 0)
    Jn = 0;
  const cap = FN_MAX * sub;
  if (Jn > cap)
    Jn = cap;
  if (Jn > 0)
    addVel(H, n.x * Jn * H.im, n.y * Jn * H.im);
}
function solveVelocityConstraints(b, P, susp, mu, sub) {
  const L = WHEELBASE;
  const Lr = Math.hypot(L * 0.5, SEAT_H);
  const fr = frameOf(b);
  const geo = {
    rear: { info: groundInfo(b.rear.x), norm: groundNormal(b.rear.x) },
    front: { info: groundInfo(b.front.x), norm: groundNormal(b.front.x) }
  };
  let resid = 0;
  let iters = 0;
  for (let it = 0;it < SOLVER_ITERS; it++) {
    let r = Math.max(velDistance(b.axleRear, b.axleFront, L), velDistance(b.axleRear, b.head, Lr), velDistance(b.axleFront, b.head, Lr));
    for (const wk of WHEELS) {
      const A = wk === "rear" ? b.axleRear : b.axleFront;
      r = Math.max(r, velLateral(b[wk], A, fr, sub), velTravel(b[wk], A, fr, susp));
    }
    solveContacts(b, P, mu, sub, it === 0, geo);
    iters = it + 1;
    resid = r;
    if (r < SOLVER_TOL)
      break;
  }
  b.solverIters = iters;
  b.solverResid = resid;
}
function projDistance(a, b, L0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 0.000001;
  const e = d - L0;
  if (e === 0)
    return 0;
  const nx = dx / d;
  const ny = dy / d;
  const ws = a.im + b.im;
  if (ws === 0)
    return Math.abs(e);
  const ka = a.im / ws * e;
  const kb = b.im / ws * e;
  a.x += nx * ka;
  a.y += ny * ka;
  a.px += nx * ka;
  a.py += ny * ka;
  b.x -= nx * kb;
  b.y -= ny * kb;
  b.px -= nx * kb;
  b.py -= ny * kb;
  return Math.abs(e);
}
function projHeadSide(b) {
  const dx = b.axleFront.x - b.axleRear.x;
  const dy = b.axleFront.y - b.axleRear.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  const ux = dx / d, uy = dy / d;
  const signed = ux * (b.head.y - b.axleRear.y) - uy * (b.head.x - b.axleRear.x);
  const want = b.headUp > 0 ? 1 : -1;
  if (signed * want >= 0)
    return 0;
  const need = want * SOLVER_TOL - signed;
  b.head.x += -uy * need;
  b.head.y += ux * need;
  b.head.px += -uy * need;
  b.head.py += ux * need;
  return Math.abs(need);
}
function projSuspension(W, A, fr, susp) {
  let err = 0;
  const et = (W.x - A.x) * fr.tx + (W.y - A.y) * fr.ty;
  if (et !== 0) {
    const ws = W.im + A.im;
    const kw = W.im / ws * et;
    const ka = A.im / ws * et;
    W.x -= fr.tx * kw;
    W.y -= fr.ty * kw;
    W.px -= fr.tx * kw;
    W.py -= fr.ty * kw;
    A.x += fr.tx * ka;
    A.y += fr.ty * ka;
    A.px += fr.tx * ka;
    A.py += fr.ty * ka;
    err = Math.abs(et);
  }
  const s = (W.x - A.x) * fr.dx + (W.y - A.y) * fr.dy;
  const c = -s;
  let over = 0;
  if (c > susp.travel)
    over = c - susp.travel;
  else if (c < -susp.ext)
    over = c + susp.ext;
  if (over !== 0) {
    const ws = W.im + A.im;
    const kw = W.im / ws * over;
    const ka = A.im / ws * over;
    W.x += fr.dx * kw;
    W.y += fr.dy * kw;
    W.px += fr.dx * kw;
    W.py += fr.dy * kw;
    A.x -= fr.dx * ka;
    A.y -= fr.dy * ka;
    A.px -= fr.dx * ka;
    A.py -= fr.dy * ka;
    err = Math.max(err, Math.abs(over));
  }
  return err;
}
function solvePositions(b, susp) {
  const L = WHEELBASE;
  const Lr = Math.hypot(L * 0.5, SEAT_H);
  const fr = frameOf(b);
  for (let it = 0;it < SOLVER_ITERS; it++) {
    let resid = Math.max(projDistance(b.axleRear, b.axleFront, L), projDistance(b.axleRear, b.head, Lr), projDistance(b.axleFront, b.head, Lr));
    resid = Math.max(resid, projHeadSide(b));
    for (const wk of WHEELS) {
      const A = wk === "rear" ? b.axleRear : b.axleFront;
      resid = Math.max(resid, projSuspension(b[wk], A, fr, susp));
    }
    if (resid < SOLVER_TOL)
      break;
  }
  for (const wk of WHEELS) {
    const W = b[wk];
    const g = groundInfo(W.x);
    if (!isFinite(g.y))
      continue;
    const n = groundNormal(W.x);
    const cosT = -n.y;
    const pen = WHEEL_R - (g.y - W.y) * cosT;
    if (pen > PEN_TOL) {
      const push = Math.min(pen - PEN_TOL, 4);
      W.x += n.x * push;
      W.y += n.y * push;
      W.px += n.x * push;
      W.py += n.y * push;
    }
  }
  if (bodyLow(b)) {
    const H = b.head;
    const g = groundInfo(H.x);
    if (isFinite(g.y)) {
      const n = groundNormal(H.x);
      const pen = HEAD_R - (g.y - H.y) * -n.y;
      if (pen > PEN_TOL) {
        const push = Math.min(pen - PEN_TOL, 4);
        H.x += n.x * push;
        H.y += n.y * push;
        H.px += n.x * push;
        H.py += n.y * push;
      }
    }
  }
}
function airControl(b, sub) {
  if (b.grounded > 0) {
    b.angVel = 0;
    return;
  }
  const inp = (key.right ? 1 : 0) - (key.left ? 1 : 0);
  const veh = VEHICLES[store.currentVehicle];
  const inv = veh.phys ? veh.phys.inertia : 1;
  if (inp) {
    const wMax = AIR_ROT_MAX * veh.airRot / inv;
    const a = AIR_ROT_ACC * veh.airRot / inv;
    b.angVel = clamp(b.angVel + inp * a * sub, -wMax, wMax);
  }
  if (!b.angVel)
    return;
  let mx = 0, my = 0, mt = 0;
  for (const p of b.pts) {
    mx += p.x * p.m;
    my += p.y * p.m;
    mt += p.m;
  }
  mx /= mt;
  my /= mt;
  const dth = b.angVel * sub;
  const co = Math.cos(dth);
  const si = Math.sin(dth);
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
function stepPhysics() {
  const P = store.phys;
  const run = store.run;
  const b = bike;
  const SUS = P.susp;
  const mu = P.mu;
  const crashTol = Math.max(8, 30 - (P.crashMargin - 4) * 1.4);
  const tiltMin = crashTiltDeg(P.crashMargin) * Math.PI / 180;
  const drvK = key.right && !run.crashed ? 1 : 0;
  const revK = key.rev && !run.crashed && (b.grounded > 0 || isFlighter()) ? 1 : 0;
  const revReady = revK && systemVel(b).vx < REV_ENTER_V;
  const brkK = (key.left || revK && !revReady) && !run.crashed ? 1 : 0;
  const rev = revReady ? 1 : 0;
  const mode0 = activeMode();
  const fx = ultraFx();
  const warp = mode0 === "warp";
  const absolut = mode0 === "absolut";
  const omega = mode0 === "omega";
  const hover = isFlighter();
  const ang0 = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
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
  for (let s = 0;s < SUB; s++) {
    const sub = SUB_DT;
    syncVel(b, sub);
    for (const p of b.pts)
      p._vy += P.gravity * sub;
    airControl(b, sub);
    applySuspension(b, SUS, sub);
    applyDrive(b, P, sub, drvK, brkK, rev);
    antiWheelie(b, P, sub);
    applyDrag(b, P, sub);
    if ((warp || absolut) && drvK && !run.crashed) {
      const svw = systemVel(b);
      let add;
      if (warp) {
        const acc = fx.accel || WARP_ACC;
        const cap = fx.vCap || WARP_V_CAP;
        add = clamp((P.topSpeed * 0.98 - svw.vx) * acc * sub, 0, cap * sub);
      } else {
        const grip = P.mu * P.rb.mTot * P.gravity * REAR_LOAD;
        const ff = P.airDragK * P.topSpeed * P.topSpeed / P.rb.mTot;
        add = clamp((P.topSpeed - svw.vx) * ABSOLUT_SERVO_ACC * sub + ff * sub, 0, grip * ABSOLUT_THRUST_K * sub);
      }
      for (const p of b.pts)
        p._vx += add;
    }
    solveVelocityConstraints(b, P, SUS, mu, sub);
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
    integrate(b, sub);
    solvePositions(b, SUS);
  }
  for (const wk of WHEELS)
    b.wheelAcc[wk] = (b.wheelRot[wk] - prevSpin[wk]) / DT;
  if (isUltraStable() && !run.crashed)
    pinToGround();
  if (prevGrounded === 0 && b.grounded > 0 && !run.crashed) {
    const vimp = b._impactV;
    b.squashVel = -clamp(vimp / LAND_REF, 0.6, 2.4);
    const midX = (b.rear.x + b.front.x) / 2;
    const gi = groundInfo(midX);
    physEvents().onLand({ x: midX, y: (b.rear.y + b.front.y) / 2, gy: gi.y, vimp });
  }
  const cAvg = (b.susp.rear.t + b.susp.front.t) * 0.5;
  const target = -clamp(cAvg / Math.max(1, SUS.travel), 0, 1);
  b.squash += (target - b.squash) * 0.4;
  if (Math.abs(b.squash) < 0.004)
    b.squash = 0;
  b.wheelStepRear = b.wheelRot.rear * DT;
  b.wheelStepFront = b.wheelRot.front * DT;
  b.wheelAngleRear = (b.wheelAngleRear + b.wheelStepRear) % TAU;
  b.wheelAngleFront = (b.wheelAngleFront + b.wheelStepFront) % TAU;
  b.speed = lerp(b.speed, systemVel(b).vx, 0.12);
  const ang1 = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
  b.angRate = wrapAngle(ang1 - ang0) / DT;
  const hgi = groundInfo(b.head.x);
  if (!run.crashed && isFinite(hgi.y)) {
    const gap = hgi.y - b.head.y;
    if (gap < Math.max(HEAD_R + CONTACT_BAND, crashTol) && Math.abs(wrapAngle(ang1)) > tiltMin)
      crash();
  }
}

// src/physics/fuel.js
function drainFuel(dt) {
  if (hasInfiniteFuel()) {
    store.phys.fuel = store.phys.fuelMax;
    return;
  }
  if (store.mode === "free") {
    const v = VEHICLES[store.currentVehicle];
    const use = 0.005 * v.weight + (key.right && !store.run.crashed ? 0.021 * v.weight : 0);
    store.phys.fuel = Math.max(0, store.phys.fuel - use * dt);
    return;
  }
  const v = VEHICLES[store.currentVehicle];
  const L = courseAt(store.selLevel, store.mode, store.phys.topSpeed);
  const fk = L ? L.fuelK : 1;
  const use = (0.005 * v.weight + (key.right && !store.run.crashed ? 0.021 * v.weight : 0)) * fk;
  store.phys.fuel = Math.max(0, store.phys.fuel - use * dt);
}
function refuel(frac) {
  const P = store.phys;
  P.fuel = Math.min(P.fuelMax, P.fuel + frac * P.fuelMax);
}
function setFuel(v) {
  store.phys.fuel = v;
}
function fuelRatio() {
  const P = store.phys;
  return P.fuelMax > 0 ? P.fuel / P.fuelMax : 0;
}

// src/render/particles.js
var MAX_PARTICLES = 600;
function emitParticles(x, y, count, cfg) {
  const arr = world.particles;
  const spd = Number.isFinite(cfg.spd) ? cfg.spd : 1;
  for (let i = 0;i < count; i++) {
    const a = Math.random() * 6.2832;
    const s = 0.5 + Math.random() * 1.5;
    arr.push({
      x,
      y,
      vx: Math.cos(a) * s * spd,
      vy: Math.sin(a) * s * spd - 0.5,
      life: cfg.life || 40,
      maxLife: cfg.life || 40,
      size: cfg.size || 2 + Math.random() * 2,
      color: cfg.color || token("text-hi"),
      decay: cfg.decay || 0.97,
      grav: cfg.grav || 0.04
    });
  }
  if (arr.length > MAX_PARTICLES)
    arr.splice(0, arr.length - MAX_PARTICLES);
}
function updateParticles() {
  const arr = world.particles;
  for (let i = arr.length - 1;i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.grav;
    p.vx *= p.decay;
    p.vy *= p.decay;
    p.life--;
    if (p.life <= 0)
      arr.splice(i, 1);
  }
}
function drawParticles(cx, cy) {
  for (const p of world.particles) {
    const sx = p.x - cx;
    const sy = p.y - cy;
    if (sx < -50 || sx > view.W + 50)
      continue;
    const a = p.life / p.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size * a, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// src/render/camera.js
function addShake(v) {
  store.cam.shake = Math.min(16, store.cam.shake + v);
}
var CAM_TAU = 0.11;
var CAM_ZOOM_REF = 700;
var CAM_ZOOM_GAMMA = 0.5;
var CAM_ZOOM_MIN = 0.32;
var CAM_FRAME_MARGIN = 1.6;
var CAM_ZOOM_ABS_MIN = 0.000000001;
var CAM_ZOOM_LERP = 0.05;
function speedOf() {
  let vx = 0;
  let mt = 0;
  for (const p of bike.pts) {
    vx += p._vx * p.m;
    mt += p.m;
  }
  return mt > 0 ? Math.abs(vx / mt) : 0;
}
function camZoomOf(v) {
  if (!(v > CAM_ZOOM_REF))
    return CAM_ZOOM_BASE;
  const k = Math.pow(CAM_ZOOM_REF / v, CAM_ZOOM_GAMMA);
  const halfW = (view.W || 960) * 0.5;
  const z = Math.max(CAM_ZOOM_MIN, CAM_ZOOM_BASE * k);
  const visCap = halfW * 60 / (v * CAM_FRAME_MARGIN);
  return Math.max(CAM_ZOOM_ABS_MIN, Math.min(z, visCap));
}
function updateCamera(dt) {
  if (store.state === "pause")
    return;
  const cam = store.cam;
  const mx = (bike.rear.x + bike.front.x) / 2;
  const my = (bike.rear.y + bike.front.y) / 2;
  const v = speedOf();
  const zTarget = camZoomOf(v);
  const zl = 1 - Math.pow(1 - CAM_ZOOM_LERP, dt * 60);
  cam.zoom = lerp(cam.zoom, zTarget, zl);
  const zoom = cam.zoom > 0.01 ? cam.zoom : 1;
  const worldW = view.W / zoom;
  const worldH = view.H / zoom;
  const spdN = clamp(v / Math.max(1, store.phys.topSpeed), 0, 1);
  const lead = Math.sign(bike.speed || 1) * spdN * worldW * 0.1 / 1;
  const maxX = store.mode === "free" ? Infinity : Math.max(0, store.finishX - worldW * 0.45);
  const targetX = clamp(mx + lead - worldW * 0.38, 0, maxX);
  const a = 1 - Math.exp(-dt / CAM_TAU);
  cam.x += (targetX - cam.x) * a + (bike.speed ? bike.speed : 0) * dt * (1 - a);
  const targetY = my - worldH * 0.55 + spdN * worldH * 0.02;
  const ay = 1 - Math.pow(1 - 0.3, dt * 60);
  cam.y = lerp(cam.y, targetY, ay);
  if (cam.shake > 0.06)
    cam.shake *= Math.pow(0.86, dt * 60);
  else
    cam.shake = 0;
}
var shPhase = 0;
function shakeOffset() {
  const s = store.cam.shake;
  if (s <= 0.06) {
    shPhase += 0.37;
    return { x: 0, y: 0 };
  }
  shPhase += 0.55;
  return { x: Math.sin(shPhase * 2.1) * s, y: Math.cos(shPhase * 3.3) * s * 0.7 };
}

// src/game/progress.js
function clearedCount() {
  let n = 0;
  for (let i = 0;i < LEVELS.length; i++)
    if ((store.stars[i] || 0) >= 1)
      n++;
  return n;
}
function hasAch(id) {
  return store.achGot.includes(id);
}
function addGold(n) {
  if (!n)
    return;
  store.gold = safeGold(store.gold + n);
  save();
  if (store.gold >= 5000)
    checkAch("rich");
}
function checkAch(id) {
  if (hasAch(id))
    return false;
  store.achGot.push(id);
  saveAchList();
  const a = ACHS.find((x) => x.id === id);
  if (a) {
    showToast("\uD83C\uDFC5 成就达成 · " + a.name, 1600);
    playAchSound();
  }
  return true;
}

// src/game/stats.js
var COMBO_WINDOW = 4;
function updateStats(dt) {
  const b = bike;
  const run = store.run;
  const fg = groundInfo(b.front.x);
  const frontOffGround = fg.y === Infinity || b.front.y < fg.y - WHEEL_R - 2;
  if (b.grounded > 0 && frontOffGround && !run.crashed) {
    run.wheelieDist += Math.abs(b.speed) * dt;
    run.maxWheelieDist = Math.max(run.maxWheelieDist, run.wheelieDist);
  } else if (!run.crashed) {
    run.wheelieDist = 0;
  }
  if (b.grounded === 0 && !run.crashed) {
    run.airTime += dt;
    run.landed = false;
  } else if (!run.landed && b.grounded > 0) {
    run.landed = true;
    if (run.airTime > 0.15)
      playLandSound();
    run.airTime = 0;
  }
}
function airScoreOf(airTime, combo) {
  const mul = 1 + Math.max(0, combo - 1) * 0.35;
  return airTime * mul;
}
function settleLanding() {
  const run = store.run;
  const flips = Math.round(bike.rotAcc / (2 * Math.PI));
  bike.rotAcc = 0;
  const msgs = [];
  if (flips !== 0) {
    if (store.time - run.comboStamp <= COMBO_WINDOW)
      run.combo++;
    else
      run.combo = 1;
    run.comboStamp = store.time;
    const reward = Math.round(Math.abs(flips) * 40 * run.combo);
    addGold(reward);
    msgs.push((flips > 0 ? "\uD83D\uDD03 前空翻" : "\uD83D\uDD04 后空翻") + "×" + Math.abs(flips) + " 连招x" + run.combo + " +" + reward);
    playFlipSound();
    checkAch("flip");
    if (run.combo >= 3)
      checkAch("combo3");
  } else {
    run.combo = 0;
  }
  if (run.airTime > 0.8) {
    const bonus = Math.round(run.airTime * 20);
    addGold(bonus);
    msgs.push("\uD83D\uDD50 空中 +" + bonus);
    checkAch("air");
  }
  if (run.airTime > 0.15) {
    world.airScore += airScoreOf(run.airTime, run.combo);
  }
  if (msgs.length)
    showCombo(msgs.join("   "));
}
function pickCanister(c) {
  c.taken = true;
  refuel(CAN_FUEL);
  emitParticles(c.x, c.y, 10, { color: token("warn"), spd: 1.4, life: 26, size: 3, grav: 0.02 });
  showToast(`⛽ +${Math.round(CAN_FUEL * 100)}%`, 650);
  playFuelSound();
}

// src/game/world.js
var GATE_START_ALLOW = 900;
var CAN_MIN_GAP = 2500;
var CAN_MAX = 6000;
var BOOST_HAZARD_GAP = 400;
var currentL = null;
function measureBottomY(L) {
  const step = Math.max(25, Math.round(L.len / 20000));
  let max = -Infinity;
  for (let x = 0;x <= L.len; x += step) {
    const y = levelHillY(L, x);
    if (y > max)
      max = y;
  }
  return isFinite(max) ? max : 300;
}
var CHUNK_W = 2000000;
var CHUNK_BACK = 2;
var CHUNK_AHEAD = 3;
function buildChunk(L, ci, withDeco) {
  const x0 = ci * CHUNK_W;
  const x1 = Math.min(L.len, x0 + CHUNK_W);
  const rng = mulberry32((L.seed ^ ci * 2654435761) >>> 0);
  const coins = [];
  const decoFore = [];
  const decoBack = [];
  const nChunks = Math.max(1, Math.ceil(L.len / CHUNK_W));
  const i0 = Math.max(0, Math.ceil(x0 / L.len * L.coinN - 0.5));
  const i1 = Math.min(L.coinN - 1, Math.ceil(x1 / L.len * L.coinN - 0.5));
  for (let i = i0;i <= i1; i++) {
    const x = L.len * (i + 0.5) / L.coinN;
    if (x < x0 || x >= x1)
      continue;
    const gy = groundY(x);
    if (gy === Infinity)
      continue;
    coins.push({ x, y: gy - 35, taken: false, ph: rng() * 6.28, coinVal: L.coinVal || 30 });
  }
  const T0 = THEMES[segmentThemeAt(L, x0)] || THEMES[0];
  for (let x = withDeco ? x0 + 220 : x1;x < x1 - 120; x += 175 + rng() * 490) {
    const gi = groundInfo(x);
    if (gi.y === Infinity)
      continue;
    if (Math.abs(gi.m) > 0.5)
      continue;
    const s = 0.7 + rng() * 0.7;
    const ph = rng() * 6.28;
    const T = THEMES[segmentThemeAt(L, x)] || T0;
    const di = pickDecoIndex(T.deco, rng());
    const item = { x, y: gi.y, kind: T.deco[di], s, ph };
    if (TALL_DECO.has(item.kind))
      decoFore.push(item);
    else
      decoBack.push(item);
  }
  return { coins, decoFore, decoBack, x0, x1 };
}
var lastLo = -1;
var lastHi = -1;
var lastCamX = 0;
function streamChunks() {
  const L = currentL;
  if (!L || !L.streaming)
    return;
  const camX = store.cam.x;
  const ci0 = Math.floor(camX / CHUNK_W);
  for (const k of world.chunks.keys()) {
    if (k < ci0 - CHUNK_BACK || k > ci0 + CHUNK_AHEAD + 1)
      world.chunks.delete(k);
  }
  const lo = Math.max(0, ci0 - CHUNK_BACK);
  const hi = Math.min(Math.ceil(L.len / CHUNK_W) - 1, ci0 + CHUNK_AHEAD);
  let grew = false;
  const perFrame = Math.abs(camX - lastCamX);
  const budget = Math.max(1, Math.min(8, Math.ceil(perFrame / CHUNK_W) + 1));
  lastCamX = camX;
  const withDeco = store.phys.topSpeed < CRUISE_V;
  let made = 0;
  for (let ci = lo;ci <= hi && made < budget; ci++) {
    if (world.chunks.has(ci))
      continue;
    world.chunks.set(ci, buildChunk(L, ci, withDeco));
    made++;
    grew = true;
  }
  if (lo === lastLo && hi === lastHi && !grew && !world.chunksDirty) {
    world.chunksDirty = false;
    return;
  }
  lastLo = lo;
  lastHi = hi;
  world.chunksDirty = false;
  const coins = [];
  const decoFore = [];
  const decoBack = [];
  for (let ci = lo;ci <= hi; ci++) {
    const c = world.chunks.get(ci);
    if (!c)
      continue;
    for (const o of c.coins)
      if (!world.takenX.has(o.x))
        coins.push(o);
    for (const o of c.decoFore)
      decoFore.push(o);
    for (const o of c.decoBack)
      decoBack.push(o);
  }
  world.coins = coins;
  world.decoFore = decoFore;
  world.decoBack = decoBack;
}
function pickDecoIndex(list, r) {
  let total = 0;
  for (let i = 0;i < list.length; i++)
    total += 1 / (i + 1);
  let x = r * total;
  for (let i = 0;i < list.length; i++) {
    x -= 1 / (i + 1);
    if (x <= 0)
      return i;
  }
  return list.length - 1;
}
var TALL_DECO = new Set([
  "tree",
  "snowtree",
  "cactus",
  "fern",
  "pine",
  "reed",
  "stump",
  "pillar",
  "ruin"
]);
function buildDeco(L, rng) {
  const T0 = THEMES[segmentThemeAt(L, 0)] || THEMES[0];
  const fore = [];
  const back = [];
  for (let x = 220;x < L.len - 120; x += 55 + rng() * 150) {
    const gi = groundInfo(x);
    if (gi.y === Infinity)
      continue;
    if (Math.abs(gi.m) > 0.5)
      continue;
    const s = 0.7 + rng() * 0.7;
    const ph = rng() * 6.28;
    const T = THEMES[segmentThemeAt(L, x)] || T0;
    const di = pickDecoIndex(T.deco, rng());
    const item = { x, y: gi.y, kind: T.deco[di], s, ph };
    if (TALL_DECO.has(item.kind))
      fore.push(item);
    else
      back.push(item);
  }
  return { fore, back };
}
function buildHazards(L, rng) {
  const out = [];
  const n = Math.round(L.hazardN * variantRule(L.variant).hazardK);
  const x0 = Math.max(760, L.len * 0.15);
  const x1 = L.len - 1000;
  if (n <= 0 || x1 <= x0)
    return out;
  const vmax = hazardSpeed(L.ramp);
  for (let i = 0;i < n; i++) {
    const cx = x0 + (x1 - x0) * (i + 0.5) / n + (rng() - 0.5) * 140;
    if (!isFinite(groundInfo(cx).y))
      continue;
    const w = Math.round(300 + L.ramp * 260);
    const a = clamp(cx - w / 2, 240, L.len - 900);
    const b = clamp(cx + w / 2, 340, L.len - 700);
    if (b <= a)
      continue;
    out.push({ x0: Math.round(a), x1: Math.round(b), vmax });
  }
  return out;
}
function buildGates(L) {
  const out = [];
  const n = L.gateN;
  if (n <= 0)
    return out;
  const r = variantRule(L.variant);
  const spd = gateSpeed(L.den3) * r.gateK;
  if (L.segments && L.segments.length) {
    const perSeg = Math.round(n / L.segments.length);
    for (let s = 0;s < L.segments.length; s++) {
      const sx = L.segments[s].x;
      const ex = s + 1 < L.segments.length ? L.segments[s + 1].x : L.len;
      for (let k = 1;k <= perSeg; k++) {
        const x = Math.round(sx + (ex - sx) * k / (perSeg + 1));
        out.push({ x, limit: (x + GATE_START_ALLOW) / spd, passed: false, seg: s });
      }
    }
  } else {
    const x0 = L.len * 0.22;
    const x1 = L.len * 0.94;
    for (let i = 0;i < n; i++) {
      const x = Math.round(x0 + (x1 - x0) * (i + 1) / n);
      out.push({ x, limit: (x + GATE_START_ALLOW) / spd, passed: false, seg: 0 });
    }
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}
function buildJumps(L) {
  const out = [];
  const n = variantRule(L.variant).jumpN;
  if (n <= 0)
    return out;
  const x0 = Math.max(700, L.len * 0.16);
  const x1 = L.len - 900;
  if (x1 <= x0)
    return out;
  for (let i = 0;i < n; i++) {
    const x = Math.round(x0 + (x1 - x0) * (i + 0.5) / n);
    const gy = groundY(x);
    if (!isFinite(gy))
      continue;
    out.push({ x, y: gy, used: false, boost: 0 });
  }
  return out;
}
function pickBoostSpot(L, hazards, seed, tooClose) {
  const inHazardZone = (x) => hazards.some((h) => x > h.x0 - BOOST_HAZARD_GAP && x < h.x1 + BOOST_HAZARD_GAP);
  let win = 120000;
  for (let attempt = 0;attempt < 3; attempt++, win *= 4) {
    const lo = Math.max(120, seed - win);
    const hi = Math.min(L.len - 320, seed + win);
    if (hi <= lo)
      return null;
    let bestSpot = null, bestSafe = null;
    for (let x = lo;x <= hi; x += 12) {
      if (inHazardZone(x) || tooClose(x))
        continue;
      if (bestSafe === null || Math.abs(x - seed) < Math.abs(bestSafe - seed))
        bestSafe = x;
      if (groundInfo(x).m < 0.25 && groundInfo(x + 240).m < -0.35) {
        if (bestSpot === null || Math.abs(x - seed) < Math.abs(bestSpot - seed))
          bestSpot = x;
      }
    }
    if (bestSpot !== null)
      return bestSpot;
    if (bestSafe !== null)
      return bestSafe;
  }
  return null;
}
function buildLevel() {
  const idx = store.selLevel;
  const L = courseAt(idx, store.mode, store.phys.topSpeed);
  const rng = mulberry32(1000 + idx * 97);
  currentL = L;
  world.chunks = new Map;
  world.takenX = new Set;
  world.chunksDirty = false;
  lastLo = -1;
  lastHi = -1;
  lastCamX = 0;
  store.finishX = L.len;
  const th0 = segmentThemeAt(L, 0);
  store.phys.theme = th0;
  store.phys.floorY = measureBottomY(L);
  const T = THEMES[th0] || THEMES[0];
  store.phys.gravity = T.g;
  store.phys.traction = T.traction;
  const coins = [];
  if (!L.streaming) {
    for (let i = 0;i < L.coinN; i++) {
      const cx = L.len * 0.15 + i * (L.len * 0.75) / (L.coinN - 1);
      coins.push({ x: cx, y: groundY(cx) - 35, taken: false, ph: rng() * 6.28, coinVal: L.coinVal || 30 });
    }
  }
  const vh = VEHICLES[store.currentVehicle];
  const up = getUp();
  const fMax = vh.fuel * (1 + 0.004 * up.frame);
  const kIdle = 0.005 * vh.weight / fMax * L.fuelK;
  const kFull = 0.021 * vh.weight / fMax * L.fuelK;
  const kAvg = kIdle + 0.62 * (kFull - kIdle);
  const vAvg = 0.78 * REF_SPEED * vh.speed;
  const range = vAvg / kAvg;
  const need = L.len / range;
  const M = 1.3 - 0.25 * L.ramp;
  const rawCans = Math.ceil((need * M - 1) / CAN_FUEL);
  const byGap = Math.ceil(L.len / CAN_MIN_GAP);
  const budgetCans = Math.max(1, Math.min(CAN_MAX, Math.min(rawCans, byGap)));
  const rule = variantRule(L.variant);
  const n = rule.canN === null ? budgetCans : Math.max(0, rule.canN);
  world.prepFuel = rule.prepFuel ? Math.max(0, budgetCans - n) * CAN_FUEL : 0;
  const canisters = [];
  if (n === 1) {
    const cx = canSpot(L.len, L.len * 0.5);
    canisters.push({ x: cx, y: groundY(cx) - 26, taken: false, ph: rng() * 6.28 });
  } else if (n > 1) {
    const x0 = L.len * 0.12;
    const x1 = L.len * 0.92;
    for (let i = 0;i < n; i++) {
      const x = canSpot(L.len, x0 + (x1 - x0) * i / (n - 1));
      canisters.push({ x, y: groundY(x) - 26, taken: false, ph: rng() * 6.28 });
    }
  }
  const hazards = buildHazards(L, mulberry32(9000 + idx * 173));
  const deco = L.streaming ? { fore: [], back: [] } : buildDeco(L, mulberry32(5000 + idx * 131));
  const boosts = [];
  const boostN = Math.max(1, 3 - Math.round(L.ramp * 2));
  const used = [];
  const tooClose = (x) => used.some((u) => Math.abs(u - x) < 600);
  for (let k = 1;k <= boostN; k++) {
    const seed = L.len * (0.12 + 0.76 * k / (boostN + 1));
    const bx = pickBoostSpot(L, hazards, seed, tooClose);
    if (bx === null)
      continue;
    used.push(bx);
    boosts.push({ x: bx, y: groundY(bx) - 4, taken: false, ph: rng() * 6.28 });
  }
  world.canisters = canisters;
  world.boosts = boosts;
  world.coins = coins;
  world.decoFore = L.streaming ? [] : deco.fore;
  world.decoBack = L.streaming ? [] : deco.back;
  world.hazards = hazards;
  world.gates = buildGates(L);
  world.jumps = buildJumps(L);
  if (L.streaming)
    streamChunks();
}
function syncSegmentTheme(L, x) {
  const th = segmentThemeAt(L, x);
  if (th === store.phys.theme)
    return false;
  const T = THEMES[th] || THEMES[0];
  store.phys.theme = th;
  store.phys.gravity = T.g;
  store.phys.traction = T.traction;
  return true;
}
function freeInit(theme) {
  store.mode = "free";
  store.finishX = Infinity;
  setFreeSeed(Math.random() * 4294967295 >>> 0);
  const picked = Number.isInteger(theme) ? freeThemeOf(theme) : rollFreeTheme();
  const th = picked;
  store.phys.theme = th;
  store.phys.floorY = 0;
  store.phys.gravity = (THEMES[th] || THEMES[0]).g;
  store.phys.traction = (THEMES[th] || THEMES[0]).traction;
  world.coins = [];
  world.canisters = [];
  world.boosts = [];
  world.decoFore = [];
  world.decoBack = [];
  world.hazards = [];
  world.gates = [];
  world.jumps = [];
  world.prepFuel = 0;
  world.freeGenX = 0;
}
function rollFreeTheme() {
  return THEMES.length ? Math.floor(Math.random() * THEMES.length) : 0;
}
function freeThemeOf(theme) {
  const P = store.progress || {};
  if (P.peak !== true)
    return 0;
  const n = Number(theme);
  if (!Number.isInteger(n) || n < 0 || n >= THEMES.length)
    return 0;
  return n;
}
function freeFill() {
  const rng = Math.random;
  const z = store.cam.zoom > 0.01 ? store.cam.zoom : 1;
  const viewR = store.cam.x + view.W / z * 2;
  let guard = 0;
  while (world.freeGenX < viewR && guard++ < 200) {
    const d = Math.max(0, world.freeGenX - 400);
    const diff = Math.min(1, d / 120000);
    const diffS = diff * diff * (3 - 2 * diff);
    const x = world.freeGenX;
    const gy = groundY(x);
    if (gy !== Infinity) {
      if (rng() < 0.85 - diffS * 0.4) {
        world.coins.push({
          x,
          y: gy - 30,
          taken: false,
          ph: rng() * 6.28,
          coinVal: Math.round(30 + 30 * diffS)
        });
      }
      if (rng() < 0.11) {
        world.canisters.push({ x, y: gy - 26, taken: false, ph: rng() * 6.28 });
      }
      const T = THEMES[store.phys.theme] || THEMES[0];
      const deco = T.deco && T.deco.length ? T.deco : THEMES[0].deco;
      if (rng() < 0.6) {
        world.decoFore.push({ x: x + 60, y: groundY(x + 60), kind: deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
      } else if (rng() < 0.3) {
        world.decoBack.push({ x: x + 90, y: groundY(x + 90), kind: deco[1] || deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
      }
    }
    world.freeGenX += Math.round(170 + diffS * 260 + rng() * 280);
  }
  world.coins = world.coins.filter((c) => c.x > store.cam.x - 400 && !c.taken);
  world.canisters = world.canisters.filter((c) => c.x > store.cam.x - 400 && !c.taken);
  world.decoFore = world.decoFore.filter((c) => c.x > store.cam.x - 500);
  world.decoBack = world.decoBack.filter((c) => c.x > store.cam.x - 500);
}
function emitRideDust() {
  const b = bike;
  if (b.grounded <= 0 || store.run.crashed)
    return;
  const T = THEMES[store.phys.theme] || THEMES[0];
  const spd = Math.abs(b.speed);
  if (spd > DUST_V) {
    for (const p of [b.rear, b.front]) {
      if (Math.random() < 0.35) {
        const gi = groundInfo(p.x);
        if (gi.y !== Infinity) {
          emitParticles(p.x + Math.random() * 4 - 2, gi.y - 2, 1, {
            color: T.dust.light,
            spd: 0.6,
            life: 18,
            size: 3,
            grav: 0.02
          });
        }
      }
    }
  }
  if (spd > DUST_HEAVY_V && Math.random() < 0.55) {
    const gi = groundInfo(b.rear.x);
    if (gi.y !== Infinity) {
      emitParticles(b.rear.x - 6, b.rear.y + 5, 1, {
        color: T.dust.heavy,
        spd: 1,
        life: 22,
        size: 4,
        grav: -0.01,
        decay: 0.95
      });
    }
  }
}
function updateCoins() {
  const mx = (bike.rear.x + bike.front.x) / 2;
  const my = (bike.rear.y + bike.front.y) / 2;
  for (const c of world.coins) {
    if (c.taken)
      continue;
    c.ph += 0.05;
    if (Math.hypot(c.x - mx, c.y - my) < 45) {
      c.taken = true;
      world.takenX.add(c.x);
      world.chunksDirty = true;
      store.run.coinGot++;
      addGold(c.coinVal || 30);
      playCoinSound();
      emitParticles(c.x, c.y, 12, { color: token("obj-coin"), spd: 2.5, life: 30, size: 3, grav: 0.03 });
    }
  }
}
function updateCanisters() {
  const mx = (bike.rear.x + bike.front.x) / 2;
  const my = (bike.rear.y + bike.front.y) / 2;
  for (const c of world.canisters) {
    if (c.taken)
      continue;
    c.ph += 0.05;
    if (Math.hypot(c.x - mx, c.y - my) < 45)
      pickCanister(c);
  }
}
var BOOST_DUR = 0.5;
var BOOST_IMP = 205;
function boostImpulse(dt) {
  if (bike.boostT <= 0)
    return;
  const t = 1 - bike.boostT / BOOST_DUR;
  const f = Math.sin(Math.PI * t);
  const dv = BOOST_IMP * (Math.PI / 2) * f * dt;
  for (const p of bike.pts)
    p.px -= dv * SUB_DT;
  bike.boostT -= dt;
}
function updateBoosts(dt) {
  if (bike.boostT > 0)
    boostImpulse(dt || DT);
  if (!world.boosts.length)
    return;
  const mx = (bike.rear.x + bike.front.x) / 2;
  for (const b of world.boosts) {
    if (b.taken || store.run.crashed || bike.grounded === 0)
      continue;
    if (Math.abs(mx - b.x) > 26)
      continue;
    b.taken = true;
    bike.boostT = BOOST_DUR;
    emitParticles(b.x, b.y - 4, 18, { color: token("obj-boost"), spd: 2.4, life: 24, size: 3, grav: -0.02 });
    addShakeLocal(3);
    showToast("⚡ 加速带！", 600);
    playBoostSound();
  }
}
var KICK_SPD_K = 0.15;
function updateJumps() {
  if (!world.jumps.length)
    return;
  const b = bike;
  const mx = (b.rear.x + b.front.x) / 2;
  for (const j of world.jumps) {
    if (j.used || store.run.crashed)
      continue;
    if (mx < j.x - 60 || mx > j.x + 60)
      continue;
    if (b.grounded === 0 && b.rear.y < j.y - 60)
      continue;
    const spd = Math.abs(b.speed);
    if (spd < KICK_MIN_V)
      continue;
    j.used = true;
    const up = KICK_V + spd * KICK_SPD_K;
    for (const p of b.pts)
      p.py += up * SUB_DT;
    emitParticles(j.x, j.y - 6, 14, { color: token("info"), spd: 2.2, life: 26, size: 3, grav: -0.02 });
    addShakeLocal(2.5);
    showToast("\uD83D\uDEEB 起飞台！", 600);
  }
}
function addShakeLocal(v) {
  store.cam.shake = Math.min(16, store.cam.shake + v);
}

// src/game/race.js
var RACE_PACE = 0.68;
var RANKED_BASE = 0.7;
var RANKED_GAIN = 0.2;
var RANKED_BASE_ADV = 0.95;
var RANKED_GAIN_ADV = 0.3;
var RANKED_TOP_EXTRA = 0.35;
function rankedAIScale(rating, advanced) {
  const r = Math.max(0, Number(rating) || 0);
  const t = Math.min(1, r / RATING_PEAK);
  const over = Math.min(1, Math.max(0, r - RATING_PEAK) / Math.max(1, RATING_TOP - RATING_PEAK));
  const k = t + RANKED_TOP_EXTRA * over;
  return advanced ? RANKED_BASE_ADV + RANKED_GAIN_ADV * k : RANKED_BASE + RANKED_GAIN * k;
}
var CATCHUP_SPAN = 2600;
var CATCHUP_K = 0.4;
var CATCHUP_MIN = 0.8;
var CATCHUP_MAX = 1.25;
function raceBaseSpeed(L, mult) {
  const den3 = L && L.den3 > 0 ? L.den3 : 0;
  return den3 * mult;
}
function catchupFactor(leadPx) {
  const k = 1 - leadPx / CATCHUP_SPAN * CATCHUP_K;
  return Math.max(CATCHUP_MIN, Math.min(CATCHUP_MAX, k));
}
function raceFormat() {
  const id = store.raceFormat;
  return id && RACE_FORMATS[id] || RACE_FORMATS.duel;
}
function raceFormatPick() {
  const id = store.raceFormatPick;
  return id && RACE_FORMATS[id] ? id : "duel";
}
function raceDecider(list) {
  const f = raceFormat();
  let best2 = null;
  for (const a of list || []) {
    if (f.team && a.team !== RIVAL_TEAM)
      continue;
    if (!best2 || a.x > best2.x)
      best2 = a;
  }
  return best2;
}
function racePlace(list, playerX) {
  return racePlaceOf(list, playerX, raceFormat());
}
function raceInit(format, keepFormat) {
  const f = format && RACE_FORMATS[format] ? format : "duel";
  store.raceFormat = f;
  if (!keepFormat)
    store.raceFormatPick = f;
  const built = buildRacers(f);
  store.racers = built.r;
  store.raceAI = raceDecider(store.racers);
}
function raceUpdate(dt) {
  const list = store.racers;
  if (!list || !list.length)
    return;
  const L = courseAt(store.selLevel, store.mode);
  const playerX = (bike.rear.x + bike.front.x) / 2;
  for (const ai of list) {
    if (ai.finish)
      continue;
    if (groundInfo(ai.x).y === Infinity)
      continue;
    let mult;
    if (store.raceRanked) {
      mult = rankedAIScale(store.progress.rating, store.rankedAdvanced) * ai.bias;
    } else {
      mult = RACE_PACE * catchupFactor(ai.x - playerX) * ai.bias;
    }
    const target = raceBaseSpeed(L, mult) * (1 + 0.06 * Math.sin(store.time * 0.9 + ai.x * 0.0007));
    ai.spd += (target - ai.spd) * Math.min(1, dt * 3);
    ai.x += ai.spd * dt;
    if (store.finishX !== Infinity && ai.x >= store.finishX) {
      ai.finish = true;
      const gy = groundInfo(store.finishX);
      if (gy.y !== Infinity) {
        emitParticles(store.finishX, gy.y - 20, 16, { color: token("danger"), spd: 2, life: 30, size: 3, grav: 0.03 });
      }
    }
  }
  store.raceAI = raceDecider(list);
}
var SPACE_AI_ACC = 0.6;
function spaceUpdate(dt) {
  const list = store.racers;
  if (!list || !list.length)
    return;
  const base = spaceDefOf().ai;
  const seed = store.run.seed || 0;
  for (const ai of list) {
    if (ai.finish)
      continue;
    if (groundInfo(ai.x).y === Infinity)
      continue;
    const want = spaceAIJitter(base, ai.ix || 0, seed) * ai.bias;
    ai.spd += (want - ai.spd) * Math.min(1, dt * SPACE_AI_ACC);
    ai.x += ai.spd * dt;
    if (store.finishX !== Infinity && ai.x >= store.finishX) {
      ai.finish = true;
      const gy = groundInfo(store.finishX);
      if (gy.y !== Infinity) {
        emitParticles(store.finishX, gy.y - 20, 16, { color: token("danger"), spd: 3, life: 30, size: 4, grav: 0.03 });
      }
    }
  }
  store.raceAI = raceDecider(list);
}

// src/game/game.js
var presenter = { hideOverlay() {}, toMenu() {} };
initPhysicsEvents({
  onCrash: (e) => {
    addShake(11);
    playCrashSound();
    emitParticles(e.x, e.y, 20, { color: token("danger"), spd: 2, life: 25, size: 3, grav: 0.06 });
    showToast("\uD83D\uDCA5 摔车！燃料 -" + Math.round(e.fuelLoss * 100) + "% · 计时 +" + e.timePenalty + "s", 900, "danger");
  },
  onLand: (e) => {
    addShake(clamp(e.vimp / LAND_REF * 3, 1, 7));
    const T = THEMES[store.phys.theme] || THEMES[0];
    if (isFinite(e.gy)) {
      emitParticles(e.x, e.gy - 2, 8, { color: T.dust.light, spd: 1.6, life: 20, size: 3, grav: 0.03 });
    }
    settleLanding();
  }
});
function initGame(p) {
  if (p)
    presenter = p;
}
function runGuard(fn) {
  const g = store.run.gen;
  return () => {
    if (g !== store.run.gen)
      return;
    fn();
  };
}
function hasUniverseVehicle() {
  const owned = store.ownedVehicles || [];
  for (const i of owned) {
    const v = VEHICLES[i];
    if (v && v.tier === "宇宙")
      return true;
  }
  return false;
}
function rankedCleared() {
  return (store.progress.wins || 0) > 0;
}
var QUEST_VEHICLE = "cv1";
function spaceQuestState() {
  const idx = VEHICLES.findIndex((v) => v.id === QUEST_VEHICLE);
  const owned = (store.ownedVehicles || []).includes(idx);
  const need = 30;
  let got = 0;
  for (let i = 0;i < store.stars.length; i++)
    if ((store.stars[i] || 0) >= 1)
      got++;
  return {
    done: owned,
    hasQuest: !owned,
    need,
    got: Math.min(got, need),
    progress: Math.max(0, Math.min(1, got / need))
  };
}
function claimSpaceQuest() {
  const st = spaceQuestState();
  if (!st.hasQuest)
    return false;
  if (st.got < st.need)
    return false;
  const idx = VEHICLES.findIndex((v) => v.id === QUEST_VEHICLE);
  if (!(idx >= 0) || (store.ownedVehicles || []).includes(idx))
    return false;
  if (!Array.isArray(store.ownedVehicles))
    store.ownedVehicles = [0];
  store.ownedVehicles.push(idx);
  save();
  return true;
}
function resetRunState() {
  const run = store.run;
  run.gen++;
  run.seed = (Math.imul(run.gen, 2654435761) ^ (store.selLevel + 1) * 2654435761) >>> 0;
  run.crashed = false;
  run.crashTimer = 0;
  run.settling = false;
  run.lastSafeX = START_X;
  run.hasCrashed = false;
  run.combo = 0;
  run.comboStamp = -99;
  run.wheelieDist = 0;
  run.maxWheelieDist = 0;
  run.airTime = 0;
  run.landed = false;
  run.levelStartTime = store.time;
  run.coinGot = 0;
  run.penaltyTime = 0;
  run.crashStall = 0;
  run.gateIdx = 0;
  run.failed = false;
  run.totalCoins = store.mode === "level" && levelAt(store.selLevel) ? levelAt(store.selLevel).coinN : 0;
  world.particles = [];
  world.airScore = 0;
  store.cam.shake = 0;
}
function pinBike() {
  bike.rear.x = bike.spawnX;
  bike.front.x = bike.spawnX + WHEELBASE;
  bike.head.x = bike.spawnX + WHEELBASE * 0.5;
}
function fillTank() {
  const pf = world.prepFuel || 0;
  if (pf > 0)
    store.phys.fuelMax *= 1 + pf;
  setFuel(store.phys.fuelMax);
}
function beginRun() {
  resetBike(START_X);
  resetRunState();
  store.cam.x = 0;
  fillTank();
  if (store.mode === "race")
    raceInit(store.raceFormat);
  else if (store.mode === MODE_SPACE)
    raceInit(spaceDefOf().fmt, true);
  resumeFinaleCheckpoint();
  store.state = "play";
  if (store.mode === "level" && store.selLevel < LEVELS.length) {
    noteLevelRun(store.selLevel, null);
    save();
  }
  presenter.hideOverlay();
}
function resumeFinaleCheckpoint() {
  if (store.mode !== "level" || store.selLevel !== FINALE_INDEX)
    return;
  const seg = store.progress.finaleSeg || 0;
  if (!(seg > 0))
    return;
  const L = FINALE;
  const segs = L.segments;
  const clamped = Math.min(seg, segs.length);
  const x = clamped < segs.length ? segs[clamped].x : L.len;
  resetBike(x);
  let idx = 0;
  for (const g of world.gates) {
    if (g.x <= x) {
      g.passed = true;
      idx++;
    } else
      break;
  }
  store.run.gateIdx = idx;
  store.cam.x = x;
  store.phys.theme = segmentThemeAt(L, x);
  const T = THEMES[store.phys.theme] || THEMES[0];
  store.phys.gravity = T.g;
  store.phys.traction = T.traction;
  showToast(`⏩ 从第 ${clamped + 1} / ${segs.length} 段继续（断点已恢复）`, 1800);
}
function checkpointFinale(g) {
  if (store.mode !== "level" || store.selLevel !== FINALE_INDEX)
    return;
  if (g.seg == null)
    return;
  const done = g.seg + 1;
  if (done <= (store.progress.finaleSeg || 0))
    return;
  store.progress.finaleSeg = Math.min(done, FINALE_SEGS);
  settleProgress();
}
function settleRanked(won) {
  const P = store.progress;
  const adv = store.rankedAdvanced === true;
  const before = P.rating;
  const delta = rankDelta(before, adv, won);
  P.rating = Math.max(RATING_MIN, before + delta);
  const applied = P.rating - before;
  if (won)
    P.wins++;
  else
    P.losses++;
  const claimed = P.promoClaimed || 0;
  const promo = rankPromoReward(before, P.rating, claimed);
  if (promo > 0)
    addGold(promo);
  if (P.rating > claimed)
    P.promoClaimed = P.rating;
  settleProgress();
  showToast((won ? "\uD83C\uDFC6 排位胜利" : "\uD83C\uDFF3 排位失利") + (adv ? " · 高级赛" : " · 排位赛") + " · 段位分 " + (applied > 0 ? "+" : "") + applied + " → " + P.rating + "（" + rankName(P.rating) + " " + "★".repeat(rankStars(P.rating)) + "☆".repeat(3 - rankStars(P.rating)) + "）" + " · " + P.wins + "胜" + P.losses + "负" + (promo > 0 ? " · 升段奖励 \uD83E\uDE99+" + promo.toLocaleString() : ""), promo > 0 ? 2400 : 1800);
  return P.rating;
}
function startGame(m, lv, opt) {
  try {
    const mode = m === "ranked" ? "race" : m || store.lastMode;
    const wantRanked = opt && opt.ranked !== undefined ? !!opt.ranked : store.raceRanked;
    if (wantRanked && mode === "race" && !store.progress.invited) {
      store.raceRanked = false;
      showToast("\uD83D\uDD12 排位档未解锁（通关最终任务后开放）· 本局按普通比赛进行", 1600);
    } else {
      store.raceRanked = wantRanked;
    }
    if (mode === MODE_SPACE) {
      if (!rankedCleared()) {
        store.pendingSpace = true;
        showToast("\uD83D\uDD12 宇宙场需要先赢下一场排位赛", 1800);
        return;
      }
      if (!hasUniverseVehicle()) {
        store.pendingSpace = true;
        showToast("\uD83D\uDD12 需要先完成宇宙场金币任务", 1500);
        return;
      }
    }
    store.mode = mode;
    const wantAdv = opt && opt.advanced !== undefined ? !!opt.advanced : store.rankedAdvanced === true;
    store.rankedAdvanced = store.raceRanked && wantAdv && isAdvancedUnlocked(store.progress.rating);
    store.selLevel = lv !== undefined ? lv : store.selLevel || 0;
    if (mode === "race" && opt && opt.format && RACE_FORMATS[opt.format]) {
      store.raceFormatPick = opt.format;
    }
    if (store.mode === "free")
      freeInit(opt && opt.theme);
    else {
      if (store.mode === MODE_SPACE) {
        setSpaceRace(opt && opt.league !== undefined ? opt.league : spaceLeagueOf(), opt && opt.div !== undefined ? opt.div : spaceDivOf(), opt && opt.race !== undefined ? opt.race : spaceRaceOf());
        applyUpgrades();
        pinSpaceCourse(spaceCourse(spaceLeagueOf(), spaceDivOf(), spaceRaceOf()));
      }
      buildLevel();
    }
    if (store.mode !== MODE_SPACE)
      applyUpgrades();
    beginRun();
  } catch (err) {
    console.error("startGame 错误:", err);
    showToast("⚠️ 出错了：" + err.message, 1500);
  }
}
function restart() {
  startGame();
}
function nextLevel() {
  if (store.mode === "level" && store.selLevel < LEVELS.length - 1) {
    store.selLevel++;
    buildLevel();
    applyUpgrades();
    resetBike(START_X);
    resetRunState();
    store.cam.x = 0;
    fillTank();
    const NL = levelAt(store.selLevel);
    const label = store.selLevel === FINALE_INDEX ? NL.name : "关卡 " + (store.selLevel + 1) + " · " + NL.name;
    showToast(label + " · " + (THEMES[segmentThemeAt(NL, 0)] || THEMES[0]).name, 800);
    store.state = "play";
    presenter.hideOverlay();
  } else {
    presenter.toMenu();
    if (store.mode === "level" && store.selLevel >= LEVELS.length - 1)
      showToast("\uD83C\uDF89 全部通关！");
  }
}
var DT_HINT = 1 / 60;
function respawn() {
  const prev = store.run.lastSafeX;
  let sx = safeSpot(prev);
  if (sx === prev)
    sx = Math.max(24, prev + 80);
  store.run.lastSafeX = sx;
  resetBike(sx);
  bike.locked = false;
  store.run.crashed = false;
  store.cam.x = sx - view.W * 0.35;
  showToast("! 回到安全点", 420);
}
function pitRewind() {
  const prev = store.run.lastSafeX;
  let sx = safeSpot(prev);
  if (sx === prev)
    sx = Math.max(24, prev + 80);
  store.run.lastSafeX = sx;
  resetBike(sx);
  bike.locked = false;
  store.run.crashed = false;
  store.cam.x = sx - view.W * 0.35;
  showToast("滑出地图，回到安全点重来", 600);
}
function handleFuelEmpty() {
  if (store.mode === "free") {
    endFreeRun("⛽ 燃料耗尽");
  } else {
    setFuel(store.phys.fuelMax * 0.3);
    respawn();
    showToast("⛽ 燃料耗尽！回到安全点", 900);
  }
}
function endFreeRun(reason) {
  const mx = (bike.rear.x + bike.front.x) / 2;
  const dist = Math.round(toM(mx));
  let record = false;
  if (dist > store.best) {
    store.best = dist;
    store.space.free.runs += 1;
    store.space.free.bestMeters = dist;
    store.space.free.bestAt = new Date().toISOString();
    save();
    record = true;
  } else {
    store.space.free.runs += 1;
  }
  store.state = "ended";
  store.run.settling = true;
  addStat({
    runs: 1,
    meters: dist,
    seconds: Math.max(0, store.time - store.run.levelStartTime),
    mode: "free"
  });
  const freeVeh = VEHICLES[store.currentVehicle];
  if (freeVeh)
    noteVehicleRun(freeVeh.id, dist);
  showToast(reason + " · 本次 " + dist + "m" + (record ? " \uD83C\uDFC5 新纪录！" : ""), 1600);
  setTimeout(runGuard(() => {
    store.state = "menu";
    presenter.toMenu();
    store.raceAI = null;
    store.racers = [];
  }), 1600);
}
function quitFreeRun() {
  if (store.mode !== "free" || store.state !== "play")
    return false;
  if (store.run.settling)
    return false;
  endFreeRun("\uD83C\uDFC1 主动结束");
  return true;
}
function finishLevel() {
  const run = store.run;
  const L = courseAt(store.selLevel, store.mode);
  run.settling = true;
  const result = {
    title: "\uD83C\uDFC1 本局结束",
    stars: undefined,
    goldGain: 0,
    goldTotal: 0,
    time: undefined,
    nextLabel: "下一关 →"
  };
  if (store.mode === "race" && !store.raceRanked) {
    const f = raceFormat();
    const won = !(store.raceAI && store.raceAI.finish);
    const place = racePlace(store.racers, bike.rear.x);
    const p = f.team ? place[0] : place;
    const total = f.team ? 2 : f.riders + 1;
    const gold = RACE_PLACE_GOLD[Math.min(p - 1, RACE_PLACE_GOLD.length - 1)];
    noteRaceRun(RACE_FORMAT_IDS.indexOf(store.raceFormatPick), store.raceRanked, p, won);
    addGold(gold);
    result.nextLabel = "继续 →";
    result.goldGain = gold;
    result.place = p;
    result.placeTotal = total;
    const tag = f.team ? "团队接力 · 我方" + (p === 1 ? "获胜" : "惜败") : f.riders > 1 ? "多人竞技 · 第 " + p + " / " + total + " 名" : "比赛" + (won ? "获胜" : "失利");
    showToast((won ? "\uD83C\uDFC6 抵达终点 · " : "\uD83C\uDFC1 抵达终点 · ") + tag + " · 名次奖金 \uD83E\uDE99+" + gold, 1100, won ? "success" : "warn");
    result.title = (won ? "\uD83C\uDFC6 " : "\uD83C\uDFC1 ") + tag;
  } else if (store.mode === "race" && store.raceRanked) {
    const won = !(store.raceAI && store.raceAI.finish);
    const before = store.progress.rating;
    const after = settleRanked(won);
    result.title = won ? "\uD83C\uDFC6 排位胜利" : "\uD83C\uDFF3 排位失利";
    const gain = rankGold(won, before);
    addGold(gain);
    result.goldGain = gain;
    result.ratingDelta = after - before;
    result.rating = after;
    showToast((won ? "\uD83C\uDFC6 排位胜利 \uD83E\uDE99+" : "\uD83C\uDFF3 排位失利 \uD83E\uDE99+") + gain, 900, won ? "success" : "warn");
    result.nextLabel = "继续 →";
  } else if (store.mode === MODE_SPACE) {
    const def = spaceDefOf();
    const fmt = RACE_FORMATS[def.fmt] || RACE_FORMATS.duel;
    const place = racePlace(store.racers, bike.rear.x);
    const p = fmt.team ? place[0] : place;
    const total = fmt.team ? 2 : fmt.riders + 1;
    const won = p === 1;
    addGold(def.gold);
    const delta = spaceRatingDelta(def.leagueIdx, def.divIdx, won);
    store.space.rating = Math.max(0, store.space.rating + delta);
    noteSpaceResult(def.key, p, won);
    settleProgress();
    result.goldGain = def.gold;
    result.place = p;
    result.placeTotal = total;
    result.title = `${def.icon} 宇宙联赛 · ${fmt.team ? "我方" + (won ? "获胜" : "惜败") : "第 " + p + " / " + total + " 名"}`;
    result.nextLabel = "继续 →";
    showToast(`\uD83C\uDF0C ${def.name} 完成 · 第 ${p}/${total} 名 · \uD83E\uDE99+${goldNum(def.gold)} · 联赛分 ${delta >= 0 ? "+" : ""}${delta} → ${store.space.rating}`, 1800, won ? "success" : "warn");
  } else if (store.mode === "level") {
    noteLevelRun(store.selLevel, { done: true, ms: elapsed * 1000, coins: run.coinGot });
    const elapsed = store.time - run.levelStartTime + run.penaltyTime;
    const ratio = run.totalCoins > 0 ? run.coinGot / run.totalCoins : 1;
    let s = 1;
    if (ratio >= 0.7)
      s = 2;
    if (elapsed < L.len / L.den3)
      s = 3;
    store.stars[store.selLevel] = Math.max(store.stars[store.selLevel] || 0, s);
    if (store.selLevel >= store.unlocked && store.selLevel < LEVELS.length - 1) {
      store.unlocked = store.selLevel + 1;
    }
    if (store.selLevel === FINALE_INDEX) {
      store.progress.finaleDone = true;
      showToast("\uD83C\uDFAF 通关「环大陆」！排位赛已解锁", 2200, "success");
    }
    addGold(L.goldBase);
    showToast("\uD83C\uDFC1 通关 " + "★".repeat(s) + "！\uD83E\uDE99+" + L.goldBase, 900, "success");
    result.title = "\uD83C\uDFC1 通关";
    result.stars = s;
    result.goldGain = L.goldBase;
    result.time = elapsed;
    result.nextLabel = store.selLevel < LEVELS.length - 1 ? "下一关 →" : "\uD83C\uDFE0 返回菜单";
    if (!run.hasCrashed)
      checkAch("noc");
    if (run.totalCoins > 0 && run.coinGot >= run.totalCoins)
      checkAch("coinall");
    if (store.stars.length >= LEVELS.length && store.stars.every((v) => v >= 3))
      checkAch("allstar");
    settleProgress();
  }
  const runMeters = toM(store.finishX);
  addStat({
    runs: 1,
    meters: runMeters,
    seconds: Math.max(0, store.time - run.levelStartTime),
    mode: store.mode
  });
  const curVeh = VEHICLES[store.currentVehicle];
  if (curVeh)
    noteVehicleRun(curVeh.id, runMeters);
  result.goldTotal = store.gold;
  if (typeof presenter.presentResult === "function")
    presenter.presentResult(result);
  else
    setTimeout(runGuard(() => nextLevel()), 800);
}
function crashWithReason(msg) {
  const was = store.run.crashed;
  crash();
  if (!was && store.run.crashed)
    showToast(msg, 1000);
}
function gateFail() {
  const run = store.run;
  run.settling = true;
  run.failed = true;
  showToast("⏱ 限时门超时！本关判负（不计星、不解锁）", 1800);
  setTimeout(runGuard(() => {
    store.state = "menu";
    presenter.toMenu();
  }), 1800);
}
function belowWorld(midX, midY, dt) {
  if (store.mode === MODE_SPACE) {
    const perFrame = Math.abs(bikeVx()) * (dt || DT_HINT);
    return midY > groundY(midX) + 800 + perFrame * 1.8;
  }
  const base = store.mode === "free" ? groundY(midX) + 800 : store.phys.floorY + 800;
  return midY > base;
}
function update(dt) {
  if (store.state === "pause")
    return;
  if (store.state !== "play") {
    store.time += dt;
    return;
  }
  if (store.shopOpen)
    return;
  const run = store.run;
  const b = bike;
  const P = store.phys;
  if (b.awaitingStart) {
    if (key.right || key.left) {
      b.awaitingStart = false;
    } else {
      pinBike();
      return;
    }
  }
  store.time += dt;
  stepPhysics();
  if (store.mode === "level" || store.mode === "race" || store.mode === MODE_SPACE) {
    syncSegmentTheme(courseAt(store.selLevel, store.mode), (b.rear.x + b.front.x) / 2);
  }
  streamChunks();
  updateParticles();
  emitRideDust();
  updateStats(dt);
  drainFuel(dt);
  const fuelOk = P.fuel > 0;
  if (run.crashed) {
    const stall = Math.min(dt, run.crashTimer);
    run.crashStall += stall;
    run.crashTimer -= dt;
    if (run.crashTimer <= 0)
      respawn();
  }
  const mid = (b.rear.x + b.front.x) / 2;
  const midY = (b.rear.y + b.front.y) / 2;
  if (!isFinite(mid) || !isFinite(midY)) {
    respawn();
  } else if (b.grounded >= 2 && !run.crashed && Math.abs(groundInfo(mid).m) <= 0.2) {
    run.lastSafeX = mid;
  }
  if (!run.crashed && belowWorld(mid, midY, dt))
    pitRewind();
  updateCoins();
  updateCanisters();
  updateBoosts(dt);
  updateJumps();
  if (!fuelOk)
    handleFuelEmpty();
  if (toKmh(Math.abs(b.speed)) >= 30)
    checkAch("fast");
  if ((store.mode === "level" || store.mode === MODE_SPACE) && !run.settling) {
    if (!run.crashed && world.hazards.length && !ignoresHazardLimit()) {
      const spd = Math.abs(bikeVx());
      for (const h of world.hazards) {
        if (mid >= h.x0 && mid <= h.x1 && spd > h.vmax) {
          crashWithReason("⚠️ 危险路段超速！燃料 -8% · 计时 +2s");
          break;
        }
      }
    }
    if (!run.failed && world.gates.length) {
      const g = world.gates[run.gateIdx];
      if (g && mid > g.x) {
        const rideTime = store.time - run.levelStartTime - run.crashStall;
        if (rideTime > g.limit) {
          gateFail();
        } else {
          g.passed = true;
          run.gateIdx++;
          showToast("⏱ 计时门 " + run.gateIdx + "/" + world.gates.length + " 通过", 600);
          checkpointFinale(g);
        }
      }
    }
  }
  if (store.mode === MODE_SPACE) {
    spaceUpdate(dt);
  } else if (store.mode === "race") {
    raceUpdate(dt);
    if (store.raceAI && store.raceAI.finish && !run.settling) {
      run.settling = true;
      if (store.raceRanked) {
        settleRanked(false);
      } else {
        showToast("\uD83D\uDE35 对手先到终点！");
      }
      setTimeout(runGuard(() => nextLevel()), 900);
    }
  }
  if (store.mode === "free") {
    freeFill();
  } else if (!run.settling && mid > store.finishX) {
    finishLevel();
  }
}

// src/render/light.js
var DEFAULT_CELESTIAL = { x: 0.85, y: 90 };
function getLight() {
  const T = THEMES[store.phys.theme] || THEMES[0];
  const c = T.bg && T.bg.celestial || DEFAULT_CELESTIAL;
  const nx = typeof c.x === "number" ? c.x : DEFAULT_CELESTIAL.x;
  const y = typeof c.y === "number" ? c.y : DEFAULT_CELESTIAL.y;
  const px = c.parallax || 0;
  return {
    x: wrapX(view.W * nx - store.cam.x * px, view.W),
    y,
    side: nx >= 0.5 ? 1 : -1,
    color: T.sun,
    isNight: y > 120
  };
}

// src/render/postfx.js
var QUALITY = ["low", "medium", "high"];
var QUALITY_LABEL = { low: "低", medium: "中", high: "高" };
var QKEY = "dale_quality";
var SKEY = "dale_scale";
var WEATHER_N = 64;
var weather = [];
for (let i = 0;i < WEATHER_N; i++) {
  weather.push({ x: 0, y: 0, s: 0, ph: 0, v: 0, a: 0, d: 0, seed: i / WEATHER_N });
}
var weatherSeeded = false;
var weatherSeededW = 0;
var weatherSeededH = 0;
var quality = "low";
var reduced = false;
var off = null;
var offCtx = null;
var offW = 0;
var offH = 0;
var fade = null;
var fadeHi = null;
var warmGlow = null;
var warmPosX = NaN;
var warmPosY = NaN;
var vignette = null;
var gradTheme = -1;
function lsGet2(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
function lsSet2(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {}
}
function initPostFx() {
  const saved = lsGet2(QKEY);
  const dpr = Math.min((typeof devicePixelRatio === "number" ? devicePixelRatio : 1) || 1, 2);
  const pixels = view.W * view.H * dpr * dpr;
  let weak = view.W < 560 || pixels > 1e6;
  try {
    const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency || 0;
    if (cores > 0 && cores <= 4)
      weak = true;
  } catch (e) {}
  quality = QUALITY.includes(saved) ? saved : weak ? "medium" : "high";
  const savedScale = parseFloat(lsGet2(SKEY));
  setRenderScale(Number.isFinite(savedScale) ? savedScale : 1);
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reduced = !!(mq && mq.matches);
      if (mq && typeof mq.addEventListener === "function") {
        mq.addEventListener("change", (e) => {
          reduced = !!e.matches;
        });
      }
    }
  } catch (e) {}
  applyCanvasLook();
  return quality;
}
function getQuality() {
  return quality;
}
function getRenderScale() {
  return view.RS;
}
function setRenderScalePersisted(s) {
  const v = setRenderScale(s);
  lsSet2(SKEY, String(v));
  invalidateOff();
  markManualRenderScale();
  return v;
}
function applyCanvasLook() {
  try {
    if (!cv || !cv.style)
      return;
    cv.style.filter = quality === "high" ? "saturate(1.16) contrast(1.12) brightness(1.02)" : quality === "medium" ? "saturate(1.06) contrast(1.03)" : "";
  } catch (e) {}
}
function setQuality(q) {
  if (!QUALITY.includes(q))
    return quality;
  quality = q;
  lsSet2(QKEY, q);
  applyCanvasLook();
  return quality;
}
function invalidateOff() {
  fade = null;
  fadeHi = null;
  warmGlow = null;
  warmPosX = NaN;
  warmPosY = NaN;
  vignette = null;
  gradTheme = -1;
}
function ensureOff(w, h) {
  if (!off) {
    off = document.createElement("canvas");
    offCtx = off.getContext("2d");
  }
  const k = view.k || view.DPR || 1;
  const pw = Math.max(1, Math.round(w * k));
  const ph = Math.max(1, Math.round(h * k));
  if (offW !== pw || offH !== ph) {
    off.width = pw;
    off.height = ph;
    offW = pw;
    offH = ph;
    invalidateOff();
  }
  offCtx.setTransform(k, 0, 0, k, 0, 0);
  return offCtx;
}
function gradeColor() {
  const th = THEMES[store.phys.theme] || THEMES[0];
  const sun = th && th.sun || token("text-hi");
  const r = parseInt(sun.substr(1, 2), 16) || 0;
  const b = parseInt(sun.substr(5, 2), 16) || 0;
  return r >= b ? token("warn") : token("info");
}
function seedWeather() {
  for (let i = 0;i < WEATHER_N; i++) {
    const p = weather[i];
    p.x = Math.random() * view.W;
    p.y = Math.random() * view.H;
    p.d = 0.2 + Math.random() * 0.8;
    p.s = 0.5 + p.d * 1.2;
    p.a = 0.1 + p.d * 0.34;
    p.v = 0.4 + Math.random() * 1.4;
    p.ph = Math.random() * 6.283;
  }
  weatherSeededW = view.W;
  weatherSeededH = view.H;
  weatherSeeded = true;
}
function drawWeather(amb, t, dt) {
  if (!amb || amb.type === "none")
    return;
  const moving = !reduced;
  const dtSec = dt;
  const n = Math.min(WEATHER_N, Math.round(WEATHER_N * clamp(amb.rate, 0, 1) * 1.4));
  ctx.fillStyle = amb.color;
  ctx.strokeStyle = amb.color;
  for (let i = 0;i < n; i++) {
    const p = weather[i];
    const sw = p.d * 0.45;
    if (moving) {
      if (amb.type === "snow") {
        p.y += p.v * amb.spd * 40 * dtSec * 2;
        p.x += Math.sin(t + p.ph) * 0.3 * sw * 2;
      } else if (amb.type === "rain") {
        p.y += p.v * 220 * dtSec * 2;
        p.x -= p.v * 30 * dtSec * 2;
      } else if (amb.type === "sand") {
        p.x -= p.v * 160 * dtSec * 2;
        p.y += Math.sin(t + p.ph) * 0.2 * sw * 2;
      } else if (amb.type === "ember") {
        p.y -= p.v * 40 * dtSec * 2;
        p.x += Math.sin(t * 1.3 + p.ph) * 0.5 * sw * 2;
      } else if (amb.type === "pollen") {
        p.x += Math.cos(t * 0.6 + p.ph) * 0.5 * sw * 2;
        p.y += Math.sin(t * 0.7 + p.ph) * 0.4 * sw * 2;
      } else if (amb.type === "mist") {
        p.x += p.v * 10 * dtSec;
      } else if (amb.type === "dust") {
        p.x += p.v * 90 * amb.spd * dtSec;
        p.y += Math.sin(t * 0.5 + p.ph) * 0.25 * sw * 2;
      }
    }
    if (p.x < -10)
      p.x = view.W + 10;
    if (p.x > view.W + 10)
      p.x = -10;
    if (p.y < -10)
      p.y = view.H + 10;
    if (p.y > view.H + 10)
      p.y = -10;
    if (amb.type === "rain") {
      ctx.globalAlpha = p.a * 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 2 - p.s, p.y + 8 + p.s * 4);
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (amb.type === "mist") {
      ctx.globalAlpha = 0.05 + p.s * 0.04;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 60 + p.s * 30, 12 + p.s * 4, 0, 0, 7);
      ctx.fill();
    } else {
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, 7);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function applyPostFx(t, dt = 1 / 60) {
  if (store.state !== "play")
    return;
  if (quality === "low")
    return;
  const W = view.W;
  const H = view.H;
  if (store.phys.theme !== gradTheme)
    invalidateOff();
  gradTheme = store.phys.theme;
  const oc = ensureOff(W, H);
  oc.clearRect(0, 0, W, H);
  const isHi = quality === "high";
  oc.globalAlpha = isHi ? 0.02 : 0.015;
  oc.fillStyle = gradeColor();
  oc.fillRect(0, 0, W, H);
  oc.globalAlpha = 1;
  if (!isHi && !fade) {
    fade = oc.createLinearGradient(0, 0, 0, H * 0.45);
    fade.addColorStop(0, token("fx-fade-top"));
    fade.addColorStop(1, token("fx-none-dark"));
  } else if (isHi && !fadeHi) {
    fadeHi = oc.createLinearGradient(0, 0, 0, H * 0.55);
    fadeHi.addColorStop(0, token("fx-fade-hi-top"));
    fadeHi.addColorStop(1, token("fx-none-dark"));
  }
  oc.fillStyle = isHi ? fadeHi || fade : fade;
  oc.fillRect(0, 0, W, H * (isHi ? 0.55 : 0.45));
  if (isHi) {
    const L = getLight();
    const sx = L.x;
    const sy = L.y;
    if (!warmGlow || Math.abs(sx - warmPosX) > 2 || Math.abs(sy - warmPosY) > 2) {
      warmPosX = sx;
      warmPosY = sy;
      warmGlow = oc.createRadialGradient(sx, sy, H * 0.05, sx, sy, H * 0.5);
      warmGlow.addColorStop(0, token("fx-sun-warm"));
      warmGlow.addColorStop(1, token("fx-sun-none"));
    }
    oc.fillStyle = warmGlow;
    oc.globalAlpha = 0.7;
    oc.fillRect(sx - H * 0.5, sy - H * 0.5, H, H);
    oc.globalAlpha = 1;
  }
  if (isHi) {
    if (!vignette) {
      vignette = oc.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.max(W, H) * 0.76);
      vignette.addColorStop(0, token("fx-none-dark"));
      vignette.addColorStop(1, token("fx-vignette"));
    }
    oc.fillStyle = vignette;
    oc.fillRect(0, 0, W, H);
  }
  ctx.drawImage(off, 0, 0, W, H);
  const th = THEMES[store.phys.theme] || THEMES[0];
  if (th && th.ambient) {
    if (!weatherSeeded || weatherSeededW !== view.W || weatherSeededH !== view.H)
      seedWeather();
    ctx.save();
    drawWeather(th.ambient, t || 0, dt);
    ctx.restore();
  }
}
var FRAME_BUDGET_MS = 22;
var DOWN_FRAMES = 45;
var UP_FRAMES = 600;
var slowRun = 0;
var fastRun = 0;
var autoScaleFrom = 1;
function autoTuneFrame(dtMs) {
  if (!(dtMs > 0) || dtMs > 400)
    return false;
  const cur = getRenderScale();
  if (cur < autoScaleFrom) {
    slowRun = 0;
    fastRun = 0;
    return false;
  }
  if (dtMs > FRAME_BUDGET_MS) {
    fastRun = 0;
    if (++slowRun >= DOWN_FRAMES) {
      slowRun = 0;
      const next = cur <= RENDER_SCALES[0] ? cur : Math.max(RENDER_SCALES[0], cur * 0.75);
      if (next < cur) {
        setRenderScale(next);
        return true;
      }
    }
  } else {
    slowRun = 0;
    if (dtMs < FRAME_BUDGET_MS * 0.6 && ++fastRun >= UP_FRAMES) {
      fastRun = 0;
      const next = Math.min(autoScaleFrom, cur * 4 / 3);
      if (next > cur) {
        setRenderScale(next);
        return true;
      }
    }
  }
  return false;
}
function markManualRenderScale() {
  autoScaleFrom = getRenderScale();
  slowRun = 0;
  fastRun = 0;
}

// src/render/background.js
var CELESTIAL_PAINTERS = {
  sun(c, cx, W) {
    const x = wrapX(W * c.x - cx * c.parallax, W);
    const y = c.y;
    const halo = ctx.createRadialGradient(x, y, 12, x, y, c.r * 4.2);
    halo.addColorStop(0, token("fx-halo-white"));
    halo.addColorStop(1, token("fx-halo-none"));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, c.r * 4.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, 7);
    ctx.fill();
  },
  moon(c, cx, W) {
    const x = wrapX(W * c.x - cx * c.parallax, W);
    const y = c.y;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.accent || token("fx-shadow-soft");
    ctx.beginPath();
    ctx.arc(x - c.r * 0.3, y - c.r * 0.2, c.r * 0.28, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + c.r * 0.35, y + c.r * 0.25, c.r * 0.18, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + c.r * 0.1, y - c.r * 0.45, c.r * 0.12, 0, 7);
    ctx.fill();
  },
  earth(c, cx, W) {
    const ex = wrapX(W * c.x - cx * c.parallax, W);
    const ey = c.y;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(ex, ey, c.r, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.accent || token("fx-cloud-green");
    ctx.beginPath();
    ctx.ellipse(ex - c.r * 0.24, ey - c.r * 0.24, c.r * 0.42, c.r * 0.24, 0.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = token("fx-cloud-white");
    ctx.beginPath();
    ctx.arc(ex, ey, c.r, 0, 7);
    ctx.fill();
  },
  ringed(c, cx, W) {
    const x = wrapX(W * c.x - cx * c.parallax, W);
    const y = c.y;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, 7);
    ctx.fill();
    ctx.strokeStyle = c.accent || token("fx-ridge-white");
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, c.r * 1.7, c.r * 0.5, -0.4, 0, 7);
    ctx.stroke();
  },
  redGiant(c, cx, W) {
    const x = wrapX(W * c.x - cx * c.parallax, W);
    const y = c.y;
    const halo = ctx.createRadialGradient(x, y, c.r * 0.4, x, y, c.r * 3.2);
    halo.addColorStop(0, token("fx-halo-warm"));
    halo.addColorStop(1, token("fx-halo-warm-0"));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, c.r * 3.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.accent || token("fx-halo-sand");
    ctx.beginPath();
    ctx.arc(x - c.r * 0.2, y - c.r * 0.15, c.r * 0.45, 0, 7);
    ctx.fill();
  }
};
var CLOUD_PAINTERS = {
  soft(cl, cx, W) {
    ctx.fillStyle = cl.color;
    ctx.globalAlpha = cl.alpha != null ? cl.alpha : 1;
    for (let i = 0;i < cl.count; i++) {
      const bw = cl.w + i % 3 * cl.wVar;
      const bx = wrapX(i * cl.spread - cx * cl.parallax, W);
      const by = cl.yBand[0] + i % 3 * cl.yBand[1];
      ctx.beginPath();
      ctx.ellipse(bx, by, bw, bw * 0.32, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  thin(cl, cx, W) {
    ctx.fillStyle = cl.color;
    ctx.globalAlpha = cl.alpha != null ? cl.alpha : 1;
    for (let i = 0;i < cl.count; i++) {
      const bw = cl.w + i % 3 * cl.wVar;
      const bx = wrapX(i * cl.spread - cx * cl.parallax, W);
      const by = cl.yBand[0] + i % 3 * cl.yBand[1];
      ctx.beginPath();
      ctx.ellipse(bx, by, bw, bw * 0.14, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  storm(cl, cx, W) {
    ctx.fillStyle = cl.color;
    ctx.globalAlpha = cl.alpha != null ? cl.alpha : 1;
    for (let i = 0;i < cl.count; i++) {
      const bw = cl.w + i % 3 * cl.wVar;
      const bx = wrapX(i * cl.spread - cx * cl.parallax, W);
      const by = cl.yBand[0] + i % 3 * cl.yBand[1];
      ctx.beginPath();
      ctx.ellipse(bx, by, bw, bw * 0.42, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
};
var RIDGE_SHAPES = {
  hills(wx, l) {
    return -Math.sin(wx * l.f1 + l.phase) * l.amp1 - Math.sin(wx * l.f2 + l.phase * 1.7) * l.amp2;
  },
  peaks(wx, l) {
    return -Math.abs(Math.sin(wx * l.f1 + l.phase)) * l.amp1 - Math.abs(Math.sin(wx * l.f2 + l.phase * 1.3)) * l.amp2;
  },
  dunes(wx, l) {
    return -Math.sin(wx * l.f1 + l.phase) * l.amp1 - Math.sin(wx * l.f2 + l.phase * 1.5) * l.amp2 * 0.6;
  },
  mesa(wx, l) {
    const t = Math.sin(wx * l.f1 + l.phase) * 0.5 + 0.5;
    return -(Math.floor(t * 3) / 3) * l.amp1 - Math.sin(wx * l.f2 + l.phase * 1.5) * l.amp2 * 0.5;
  },
  ruin(wx, l) {
    const t = Math.sin(wx * l.f1 + l.phase) * 0.5 + 0.5;
    return -(Math.floor(t * 5) / 5) * l.amp1 - Math.sin(wx * l.f2 + l.phase * 1.2) * l.amp2 * 0.4;
  },
  iceberg(wx, l) {
    return -Math.abs(Math.sin(wx * l.f1 + l.phase)) * l.amp1 - Math.abs(Math.sin(wx * l.f2 + l.phase * 1.2)) * l.amp2 * 0.8;
  },
  treeLine(wx, l) {
    return -Math.abs(Math.sin(wx * l.f1 * 3 + l.phase)) * l.amp1 * 0.55 - Math.abs(Math.sin(wx * l.f2 * 4 + l.phase)) * l.amp2 * 0.5 - Math.sin(wx * l.f1 + l.phase) * l.amp1 * 0.4;
  },
  island(wx, l) {
    return -Math.sin(wx * l.f1 + l.phase) * l.amp1 - Math.abs(Math.sin(wx * l.f2 + l.phase)) * l.amp2;
  }
};
function fillRidge(l, cx, W, H) {
  const shape = RIDGE_SHAPES[l.kind] || RIDGE_SHAPES.hills;
  ctx.fillStyle = l.color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0;x <= W; x += 8) {
    const wx = x + cx * l.parallax;
    ctx.lineTo(x, H * l.y + shape(wx, l));
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}
function drawStarLayer(l, cx, W, H) {
  const rnd = mulberry32(l.seed || 1234);
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = l.alpha != null ? l.alpha : 0.8;
  ctx.fillStyle = token("text-hi");
  for (let i = 0;i < l.count; i++) {
    const rx = rnd();
    const ry = rnd();
    const rr = rnd();
    const sx = wrapX(rx * W - cx * l.parallax, W);
    const sy = ry * H * 0.75;
    ctx.beginPath();
    ctx.arc(sx, sy, rr * l.rMax, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = prev;
}
function drawAurora(a, cx, W) {
  const prev = ctx.globalAlpha;
  ctx.fillStyle = a.color;
  for (let i = 0;i < a.count; i++) {
    const sx = wrapX(i * a.spread - cx * a.parallax, W + 240) - 120;
    const sy = a.y0 + i % a.rows * a.rowGap;
    ctx.beginPath();
    ctx.ellipse(sx, sy, a.w + i % 3 * a.wVar, a.h, 0, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = prev;
}
function drawHaze(hz, W, H) {
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, token("fx-none-dark"));
  grad.addColorStop(1, hz.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}
function drawBackground(cx, cy) {
  const T = THEMES[store.phys.theme] || THEMES[0];
  const W = view.W;
  const H = view.H;
  const bg = T.bg || {};
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, T.sky[0]);
  g.addColorStop(0.7, T.sky[1]);
  g.addColorStop(1, T.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const l of bg.starLayers || [])
    drawStarLayer(l, cx, W, H);
  if (bg.aurora)
    drawAurora(bg.aurora, cx, W);
  if (bg.celestial) {
    const p = CELESTIAL_PAINTERS[bg.celestial.type];
    if (p)
      p(bg.celestial, cx, W, H);
  }
  for (const cl of bg.cloudLayers || []) {
    const p = CLOUD_PAINTERS[cl.kind] || CLOUD_PAINTERS.soft;
    p(cl, cx, W, H);
  }
  if (bg.haze)
    drawHaze(bg.haze, W, H);
  for (const r of bg.ridges || [])
    fillRidge(r, cx, W, H);
  const q = getQuality();
  if (q !== "low") {
    ctx.save();
    ctx.globalAlpha = q === "high" ? 1 : 0.5;
    const fog = ctx.createLinearGradient(0, H * 0.36, 0, H * 0.72);
    fog.addColorStop(0, token("fx-none-dark"));
    fog.addColorStop(1, token("fx-fog-mist"));
    ctx.fillStyle = fog;
    ctx.fillRect(0, H * 0.36, W, H * 0.36);
    ctx.restore();
  }
  if (q === "high") {
    const gx = getLight().x;
    const gy = H * 0.52;
    const glow = ctx.createRadialGradient(gx, gy, H * 0.02, gx, gy, H * 0.32);
    glow.addColorStop(0, token("fx-sun-warm"));
    glow.addColorStop(1, token("fx-sun-none"));
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = glow;
    ctx.fillRect(gx - H * 0.32, gy - H * 0.32, H * 0.64, H * 0.64);
    ctx.restore();
  }
}

// src/render/terrain.js
function eachGround(cx, cy, step, fn) {
  const w = view.W / zoomNow();
  for (let x = 0;x <= w; x += step) {
    const wx = x + cx;
    const gy = groundY(wx);
    if (gy === Infinity)
      continue;
    fn(x, gy - cy, wx);
  }
}
var SURFACE_PAINTERS = {
  grass(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    eachGround(cx, cy, 20, (x, gy, wx) => {
      const h = 3 + Math.abs(Math.sin(wx * 0.37)) * 5;
      ctx.beginPath();
      ctx.moveTo(x, gy - 1);
      ctx.lineTo(x + 1.6, gy - 1 - h);
      ctx.stroke();
    });
  },
  snowpuff(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 14, (x, gy) => {
      ctx.beginPath();
      ctx.ellipse(x, gy - 4, 9, 3.5, 0, 0, 7);
      ctx.fill();
    });
    if (s.color2) {
      ctx.fillStyle = s.color2;
      eachGround(cx, cy, 24, (x, gy, wx) => {
        const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
        ctx.beginPath();
        ctx.arc(x + 6, gy - 8, r, 0, 7);
        ctx.fill();
      });
    }
  },
  sandripple(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    eachGround(cx, cy, 18, (x, gy) => {
      ctx.beginPath();
      ctx.moveTo(x, gy + 8);
      ctx.quadraticCurveTo(x + 9, gy + 4, x + 18, gy + 9);
      ctx.stroke();
    });
  },
  crater(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 22, (x, gy, wx) => {
      const r = 3 + Math.abs(Math.sin(wx * 0.21)) * 5;
      ctx.beginPath();
      ctx.ellipse(x, gy + 10, r, r * 0.4, 0, 0, 7);
      ctx.fill();
    });
  },
  moss(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 10, (x, gy, wx) => {
      const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
      ctx.beginPath();
      ctx.arc(x, gy - 2, r, Math.PI, 0);
      ctx.fill();
    });
  },
  lava(s, cx, cy) {
    ctx.strokeStyle = s.color2 || s.color;
    ctx.lineWidth = 2.5;
    eachGround(cx, cy, 20, (x, gy, wx) => {
      const d = 8 + Math.abs(Math.sin(wx * 0.3)) * 16;
      ctx.beginPath();
      ctx.moveTo(x, gy - 1);
      ctx.lineTo(x + 4, gy + d * 0.5);
      ctx.lineTo(x - 2, gy + d);
      ctx.stroke();
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 34, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.6)) * 3;
      ctx.beginPath();
      ctx.arc(x, gy - 2, r, 0, 7);
      ctx.fill();
    });
  },
  frost(s, cx, cy) {
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 12, (x, gy, wx) => {
      if (Math.abs(Math.sin(wx * 0.9)) < 0.5)
        return;
      ctx.fillRect(x, gy - 3, 5, 3);
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 18, (x, gy, wx) => {
      const r = 1.6 + Math.abs(Math.sin(wx * 0.7)) * 2;
      ctx.beginPath();
      ctx.arc(x + 4, gy - 8, r, 0, 7);
      ctx.fill();
    });
  },
  strata(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    const w = view.W / zoomNow();
    for (let dy = 12;dy <= 48; dy += 12) {
      ctx.beginPath();
      for (let x = 0;x <= w; x += 10) {
        const gy = groundY(x + cx);
        if (gy === Infinity)
          continue;
        ctx.lineTo(x, gy - cy + dy + Math.sin((x + cx) * 0.02 + dy) * 2);
      }
      ctx.stroke();
    }
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 20, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.4)) * 3;
      ctx.beginPath();
      ctx.arc(x, gy - 3, r, 0, 7);
      ctx.fill();
    });
  },
  puddle(s, cx, cy) {
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 30, (x, gy, wx) => {
      const r = 8 + Math.abs(Math.sin(wx * 0.25)) * 8;
      ctx.beginPath();
      ctx.ellipse(x, gy - 1, r, 2.5, 0, 0, 7);
      ctx.fill();
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 22, (x, gy) => {
      ctx.beginPath();
      ctx.ellipse(x + 4, gy + 12, 6, 2, 0, 0, 7);
      ctx.fill();
    });
  },
  debris(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 14, (x, gy, wx) => {
      const w = 3 + Math.abs(Math.sin(wx * 0.6)) * 5;
      ctx.fillRect(x, gy - 4, w, 4);
    });
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 26, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.35)) * 3;
      ctx.beginPath();
      ctx.ellipse(x, gy + 10, r, r * 0.5, 0, 0, 7);
      ctx.fill();
    });
  },
  cloudtuft(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 16, (x, gy, wx) => {
      const r = 6 + Math.abs(Math.sin(wx * 0.3)) * 7;
      ctx.beginPath();
      ctx.arc(x, gy - 5, r, 0, 7);
      ctx.fill();
    });
    if (s.color2) {
      ctx.fillStyle = s.color2;
      eachGround(cx, cy, 26, (x, gy, wx) => {
        const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
        ctx.beginPath();
        ctx.arc(x + 8, gy - 10, r, 0, 7);
        ctx.fill();
      });
    }
  },
  iceglow(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 16, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.55)) * 3.5;
      ctx.beginPath();
      ctx.arc(x, gy - 3, r, 0, 7);
      ctx.fill();
    });
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 22, (x, gy, wx) => {
      const r = 1.5 + Math.abs(Math.sin(wx * 0.8)) * 2.5;
      ctx.beginPath();
      ctx.arc(x + 6, gy - 9, r, 0, 7);
      ctx.fill();
    });
  }
};
var GS = 8;
var GBUF_MIN = 2048;
var GBUF_MAX = 16384;
var GBUF_N = GBUF_MIN;
var gBuf = new Float64Array(GBUF_MAX);
var gOk = new Uint8Array(GBUF_MAX);
var lBuf = new Float64Array(GBUF_MAX);
function ensureGBuf(need) {
  if (need <= GBUF_N)
    return;
  let cap = GBUF_N;
  while (cap < need && cap < GBUF_MAX)
    cap *= 2;
  GBUF_N = Math.min(cap, GBUF_MAX);
}
var CRUISE_BANDS = 26;
var CRUISE_BAND_PX = 46;
function drawCruiseBands(cx, cy, W, H, pal) {
  const z = zoomNow() || 1;
  ctx.save();
  ctx.scale(1 / z, 1 / z);
  const SW = view.W;
  const SH = view.H;
  ctx.fillStyle = pal[0];
  ctx.fillRect(0, 0, SW, SH);
  const bandW = SW / CRUISE_BANDS;
  for (let b = 0;b < CRUISE_BANDS; b++) {
    const a = [], x0 = b * bandW;
    for (const f of [0.15, 0.5, 0.85]) {
      const gy = groundY(cx + x0 * z + bandW * z * f);
      if (gy !== Infinity)
        a.push(gy);
    }
    if (!a.length)
      continue;
    a.sort((p, q) => p - q);
    const gy = (a[a.length >> 1] - cy) / z;
    const t = Math.max(0, Math.min(1, (gy + SH * 0.5) / (SH * 1.5)));
    ctx.fillStyle = t > 0.62 ? pal[1] : t > 0.34 ? pal[0] : pal[2] || pal[0];
    ctx.fillRect(x0, gy, bandW + 1, CRUISE_BAND_PX);
  }
  ctx.fillStyle = token("fx-lit-top");
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, 0, SW, 2);
  ctx.globalAlpha = 1;
  ctx.restore();
}
function zoomNow() {
  const z = store.cam.zoom;
  return z > 0.01 ? z : 1;
}
var gUsed = 0;
function invalidateGround() {
  gOk.fill(0, 0, gUsed);
}
function groundBuf(cx) {
  const need = Math.ceil(view.W / zoomNow() / GS) + 2 | 0;
  ensureGBuf(need);
  const n = Math.min(GBUF_N, need);
  for (let i = 0;i < n; i++) {
    if (!gOk[i]) {
      gBuf[i] = groundY(cx + i * GS);
      gOk[i] = 1;
    }
  }
  if (n > gUsed)
    gUsed = n;
  return n;
}
function drawTerrain(cx, cy) {
  const W = view.W / zoomNow();
  const H = view.H / zoomNow();
  const T = THEMES[store.phys.theme] || THEMES[0];
  const pal = T.pal;
  if (Math.abs(bikeVx()) > CRUISE_V) {
    drawCruiseBands(cx, cy, W, H, pal);
    return;
  }
  invalidateGround();
  const n = groundBuf(cx);
  ctx.fillStyle = pal[0];
  ctx.beginPath();
  ctx.moveTo(0, cy);
  let lastG = cy;
  for (let i = 0, x = 0;x <= W && i < n; x += GS, i++) {
    const gy = gBuf[i];
    if (gy === Infinity)
      ctx.lineTo(x, lastG);
    else {
      lastG = gy - cy;
      ctx.lineTo(x, gy - cy);
    }
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal[1];
  ctx.strokeStyle = pal[1];
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let i = 0, x = 0;x <= W && i < n; x += GS, i++) {
    const gy = gBuf[i];
    if (gy === Infinity)
      continue;
    ctx.lineTo(x, gy - cy - 8);
  }
  ctx.stroke();
  ctx.fillStyle = token("fx-shadow-faint");
  ctx.beginPath();
  ctx.moveTo(0, cy);
  for (let i = 0, x = 0;x <= W && i < n; x += GS, i++) {
    const gy = gBuf[i];
    if (gy === Infinity)
      ctx.lineTo(x, lastG);
    else
      ctx.lineTo(x, Math.min(gy + 40, cy + H) - cy);
  }
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  const sp = T.surface && SURFACE_PAINTERS[T.surface.type];
  if (sp)
    sp(T.surface, cx, cy);
  const q = getQuality();
  if (q !== "low") {
    const isHi = q === "high";
    const L = getLight();
    const gain = isHi ? 1.5 : 0.7;
    const depth = isHi ? 170 : 95;
    const maxA = isHi ? 0.4 : 0.15;
    const segs = Math.min(n - 1, Math.ceil(W / GS) + 1);
    for (let i = 0;i < segs; i++) {
      const a0 = gBuf[i];
      const b0 = gBuf[i + 1];
      if (a0 === Infinity || b0 === Infinity) {
        lBuf[i] = 0;
        continue;
      }
      lBuf[i] = clamp(-(b0 - a0) / GS * L.side * gain, -1, 1);
    }
    const gLit = ctx.createLinearGradient(0, 0, 0, depth);
    gLit.addColorStop(0, token("fx-lit-top"));
    gLit.addColorStop(1, token("fx-sun-none"));
    const gShd = ctx.createLinearGradient(0, 0, 0, depth);
    gShd.addColorStop(0, token("fx-shade-top"));
    gShd.addColorStop(1, token("fx-none-dark"));
    ctx.save();
    for (let i = 0;i < segs; i++) {
      const v = lBuf[i];
      const a = Math.abs(v) * maxA;
      const g0 = gBuf[i];
      if (a < 0.012 || g0 === Infinity)
        continue;
      const g1 = gBuf[i + 1];
      const x0 = i * GS;
      const x1 = Math.min(x0 + GS, W);
      if (x1 <= x0)
        continue;
      const y0 = g0 - cy;
      const dy = g1 === Infinity ? 0 : g1 - cy - y0;
      ctx.translate(x0, y0);
      ctx.globalAlpha = a;
      ctx.fillStyle = v > 0 ? gLit : gShd;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(x1 - x0, dy);
      ctx.lineTo(x1 - x0, dy + depth);
      ctx.lineTo(0, depth);
      ctx.closePath();
      ctx.fill();
      ctx.translate(-x0, -y0);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (isHi) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = token("fx-lit-top");
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let i = 0, x = 0;x <= W && i < n; x += GS, i++) {
        const gy = gBuf[i];
        ctx.lineTo(x, gy === Infinity ? H : gy - cy);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// src/render/entities.js
function visW() {
  const z = store.cam.zoom;
  return view.W / (z > 0.01 ? z : 1);
}
function drawDeco(cx, cy) {
  const q = getQuality();
  const shade = q === "medium" || q === "high";
  for (const t of world.decoFore) {
    const sx = t.x - cx;
    if (sx < -60 || sx > visW() + 60)
      continue;
    if (shade) {
      ctx.fillStyle = token("obj-shadow");
      ctx.beginPath();
      ctx.ellipse(sx + 2, t.y - cy + 3, 13 * t.s, 4.2 * t.s, 0, 0, 7);
      ctx.fill();
      if (q === "high") {
        ctx.beginPath();
        ctx.ellipse(sx + 1, t.y - cy + 2, 8 * t.s, 2.4 * t.s, 0, 0, 7);
        ctx.fill();
      }
    }
    drawDecoItem(sx, t.y - cy, t.kind, t.s, t.ph);
  }
  ctx.globalAlpha = 0.62;
  for (const r of world.decoBack) {
    const sx = r.x - cx;
    if (sx < -60 || sx > visW() + 60)
      continue;
    drawDecoItem(sx, r.y - cy, r.kind, r.s * 0.8, r.ph);
  }
  ctx.globalAlpha = 1;
}
function drawDecoItem(sx, y, kind, s, ph) {
  ctx.save();
  ctx.translate(sx, y);
  ctx.scale(s, s);
  const C = DECO_COLORS[kind] || DECO_COLORS.__default || [];
  switch (kind) {
    case "tree":
      ctx.fillStyle = C[0];
      ctx.fillRect(-3, -14, 6, 14);
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.quadraticCurveTo(-20, -14, 0, -4);
      ctx.quadraticCurveTo(20, -14, 0, -38);
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.ellipse(-5, -22, 6, 10, 0.4, 0, 7);
      ctx.fill();
      break;
    case "bush":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, -6, 11, 7, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-7, -4, 7, 5, 0, 0, 7);
      ctx.fill();
      break;
    case "snowman":
      ctx.fillStyle = C[0];
      ctx.strokeStyle = C[1];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, -8, 8, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -20, 5.5, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(6, -19);
      ctx.lineTo(0, -18);
      ctx.closePath();
      ctx.fill();
      break;
    case "icespike":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(6, 0);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      break;
    case "rock":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, -3, 9, 6, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(-2, -4, 5, 3, 0, 0, 7);
      ctx.fill();
      break;
    case "cactus":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.roundRect(-3.5, -24, 7, 24, 3);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-11, -18, 7, 5, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-11, -18, 5, 12, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(4, -14, 7, 5, 2.5);
      ctx.fill();
      break;
    case "crater":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, -2, 16, 5, 0, 0, 7);
      ctx.fill();
      break;
    case "moonrock":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-6, -11);
      ctx.lineTo(4, -13);
      ctx.lineTo(10, -4);
      ctx.lineTo(6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(-6, -11);
      ctx.lineTo(4, -13);
      ctx.lineTo(2, -7);
      ctx.closePath();
      ctx.fill();
      break;
    case "flower":
      ctx.strokeStyle = C[0];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -12);
      ctx.stroke();
      ctx.fillStyle = C[1];
      for (let i = 0;i < 5; i++) {
        const a = i / 5 * 6.2832;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 4, -14 + Math.sin(a) * 4, 3.4, 2.4, a, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.arc(0, -14, 2.4, 0, 7);
      ctx.fill();
      break;
    case "snowtree":
      ctx.fillStyle = C[0];
      ctx.fillRect(-2.5, -10, 5, 10);
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(12, -8);
      ctx.lineTo(-12, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(7, -20);
      ctx.lineTo(-7, -20);
      ctx.closePath();
      ctx.fill();
      break;
    case "pebble":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(1, 0, 8, 2.6, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, -2.5, 6.5, 4, 0, 0, 7);
      ctx.fill();
      break;
    case "fern":
      ctx.strokeStyle = C[0];
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      for (let i = -2;i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(i * 5, -12, i * 12, -20 - Math.abs(i) * -3);
        ctx.stroke();
      }
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 2, 0, 0, 7);
      ctx.fill();
      break;
    case "stump":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.roundRect(-7, -14, 14, 14, 2);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, -14, 7, 3, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = C[2];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -14, 4, 1.7, 0, 0, 7);
      ctx.stroke();
      break;
    case "lavarock":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-7, -10);
      ctx.lineTo(3, -13);
      ctx.lineTo(10, -3);
      ctx.lineTo(6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C[1];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(-1, -7);
      ctx.lineTo(3, -4);
      ctx.stroke();
      break;
    case "obsidian":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-4, -20);
      ctx.lineTo(6, -14);
      ctx.lineTo(8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(-4, -20);
      ctx.lineTo(6, -14);
      ctx.lineTo(0, -10);
      ctx.closePath();
      ctx.fill();
      break;
    case "iceberg":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 3, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-4, -22);
      ctx.lineTo(4, -12);
      ctx.lineTo(11, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.moveTo(-4, -22);
      ctx.lineTo(0, -10);
      ctx.lineTo(-8, -6);
      ctx.closePath();
      ctx.fill();
      break;
    case "crystal":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.arc(0, -8, 12, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(5, -8);
      ctx.lineTo(0, 0);
      ctx.lineTo(-5, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(5, -8);
      ctx.lineTo(0, -8);
      ctx.closePath();
      ctx.fill();
      break;
    case "mesarock":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(-9, -14);
      ctx.lineTo(9, -14);
      ctx.lineTo(11, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.fillRect(-9, -18, 18, 4);
      ctx.fillStyle = C[2];
      ctx.fillRect(-9, -9, 18, 2.4);
      break;
    case "reed":
      ctx.strokeStyle = C[0];
      ctx.lineWidth = 2;
      for (let i = -1;i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 4, 0);
        ctx.quadraticCurveTo(i * 7, -14, i * 5, -26);
        ctx.stroke();
      }
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(-5, -27, 3, 6.5, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(5, -27, 3, 6.5, 0, 0, 7);
      ctx.fill();
      break;
    case "ruin":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-12, -18);
      ctx.lineTo(-4, -18);
      ctx.lineTo(-4, -10);
      ctx.lineTo(3, -10);
      ctx.lineTo(3, -22);
      ctx.lineTo(12, -22);
      ctx.lineTo(12, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.fillRect(-8, -8, 4, 5);
      ctx.fillRect(6, -14, 4, 5);
      break;
    case "rubble":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 3, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.fillRect(-10, -7, 9, 7);
      ctx.fillRect(-2, -11, 8, 11);
      ctx.fillStyle = C[2];
      ctx.fillRect(5, -6, 7, 6);
      break;
    case "pillar":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(-6, -24);
      ctx.lineTo(6, -24);
      ctx.lineTo(7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, -24, 6.5, 2, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[2];
      ctx.fillRect(-5, -18, 10, 2);
      break;
    case "cloudpuff":
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.arc(-5, -8, 7, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5, -8, 7, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -13, 8, 0, 7);
      ctx.fill();
      ctx.fillStyle = C[1];
      ctx.beginPath();
      ctx.ellipse(0, -4, 11, 3, 0, 0, 7);
      ctx.fill();
      break;
    case "pine":
      ctx.fillStyle = C[0];
      ctx.fillRect(-2.5, -10, 5, 10);
      ctx.fillStyle = C[1];
      for (let i = 0;i < 3; i++) {
        const ty = -10 - i * 9;
        const tw = 13 - i * 3.5;
        ctx.beginPath();
        ctx.moveTo(0, ty - 11);
        ctx.lineTo(tw, ty);
        ctx.lineTo(-tw, ty);
        ctx.closePath();
        ctx.fill();
      }
      break;
    default:
      ctx.fillStyle = C[0];
      ctx.beginPath();
      ctx.ellipse(0, -3, 8, 5, 0, 0, 7);
      ctx.fill();
      break;
  }
  ctx.restore();
}
function drawCoins(cx, cy) {
  for (const c of world.coins) {
    if (c.taken)
      continue;
    const sx = c.x - cx;
    if (sx < -20 || sx > visW() + 20)
      continue;
    const y = c.y - cy;
    const sxr = Math.sin(c.ph) * 6;
    ctx.fillStyle = token("obj-coin");
    ctx.strokeStyle = token("obj-coin-dark");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, y, 7, Math.max(2, 7 - Math.abs(sxr) * 0.6), 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = token("obj-coin-dark");
    ctx.beginPath();
    ctx.arc(sx, y, 2, 0, 7);
    ctx.fill();
  }
}
function drawCanisters(cx, cy) {
  for (const c of world.canisters) {
    if (c.taken)
      continue;
    const sx = c.x - cx;
    if (sx < -30 || sx > visW() + 30)
      continue;
    const y = c.y - cy;
    const bob = Math.sin(c.ph) * 3;
    ctx.fillStyle = token("obj-canister-glow");
    ctx.beginPath();
    ctx.arc(sx, y + bob, 16, 0, 7);
    ctx.fill();
    ctx.fillStyle = token("obj-canister");
    ctx.strokeStyle = token("obj-canister-dark");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(sx - 8, y + bob - 7, 16, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = token("obj-coin");
    ctx.fillRect(sx - 4, y + bob - 5, 8, 10);
    ctx.fillStyle = token("text-hi");
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⛽", sx, y + bob - 10);
    ctx.textAlign = "left";
  }
}
function drawBoosts(cx, cy) {
  for (const b of world.boosts) {
    if (b.taken)
      continue;
    const sx = b.x - cx;
    if (sx < -60 || sx > visW() + 60)
      continue;
    const y = b.y - cy;
    const t = store.time * 3.2 + b.ph;
    ctx.save();
    ctx.translate(sx, y);
    ctx.scale(1, 0.42);
    ctx.fillStyle = token("success-soft");
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, 7);
    ctx.fill();
    ctx.strokeStyle = token("obj-boost");
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let i = 0;i < 3; i++) {
      const o = (t * 26 + i * 18) % 38 - 19;
      const al = 1 - Math.abs(o) / 24;
      ctx.globalAlpha = Math.max(0.15, Math.min(1, al));
      ctx.beginPath();
      ctx.moveTo(o - 9, -11);
      ctx.lineTo(o + 3, 0);
      ctx.lineTo(o - 9, 11);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
function drawFlag(cx, cy, finishX) {
  if (!isFinite(finishX))
    return;
  const sx = finishX - cx;
  if (sx < -20 || sx > visW() + 20)
    return;
  const gy = groundY(finishX);
  if (gy === Infinity)
    return;
  const y = gy - cy;
  const bottom = cy + view.H / store.cam.zoom;
  ctx.strokeStyle = token("obj-bike-steel");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, y - 120);
  ctx.lineTo(sx, bottom);
  ctx.stroke();
  ctx.fillStyle = token("obj-finish");
  ctx.beginPath();
  ctx.moveTo(sx, y - 120);
  ctx.lineTo(sx + 34, y - 108);
  ctx.lineTo(sx, y - 96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = token("text-hi");
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("终点", sx - 6, y - 118);
  ctx.textAlign = "left";
}
function drawJumps(cx, cy) {
  for (const j of world.jumps) {
    const sx = j.x - cx;
    if (sx < -90 || sx > visW() + 90)
      continue;
    const y = j.y - cy;
    if (!isFinite(y))
      continue;
    ctx.save();
    ctx.translate(sx, y);
    ctx.fillStyle = token("obj-jump-base");
    ctx.beginPath();
    ctx.moveTo(-46, 0);
    ctx.lineTo(-46, -6);
    ctx.lineTo(-12, -14);
    ctx.lineTo(24, -30);
    ctx.lineTo(30, -30);
    ctx.lineTo(30, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = token("fx-shadow-faint");
    ctx.beginPath();
    ctx.moveTo(24, -30);
    ctx.lineTo(30, -30);
    ctx.lineTo(30, -14);
    ctx.lineTo(24, -14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = j.used ? token("obj-jump-rim-used") : token("obj-jump-rim");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-46, -6);
    ctx.lineTo(-12, -14);
    ctx.lineTo(24, -30);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    for (let i = 0;i < 3; i++) {
      const t = 0.18 + i * 0.3;
      const gx = -46 + (-12 - -46) * t;
      const gy = -6 + (-14 - -6) * t;
      const dx = -12 - -46, dy = -14 - -6;
      const L = Math.hypot(dx, dy) || 1;
      const px = -dy / L, py = dx / L;
      if (t < 0.55) {
        ctx.strokeStyle = token("obj-jump-rim-used");
        ctx.beginPath();
        ctx.moveTo(gx + px * 2, gy + py * 2);
        ctx.lineTo(gx - px * 2, gy - py * 2);
        ctx.stroke();
      }
    }
    const a2 = [0.3, 0.65];
    for (const t of a2) {
      const gx = -12 + (24 - -12) * t;
      const gy = -14 + (-30 - -14) * t;
      const dx = 24 - -12, dy = -30 - -14;
      const L = Math.hypot(dx, dy) || 1;
      const px = -dy / L, py = dx / L;
      ctx.strokeStyle = token("obj-jump-rim-used");
      ctx.beginPath();
      ctx.moveTo(gx + px * 1.6, gy + py * 1.6);
      ctx.lineTo(gx - px * 1.6, gy - py * 1.6);
      ctx.stroke();
    }
    ctx.strokeStyle = j.used ? token("obj-jump-rim-used") : token("obj-jump-glow");
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(24, -30);
    ctx.lineTo(30, -30);
    ctx.stroke();
    if (!j.used) {
      const bob = Math.sin(store.time * 4 + j.x * 0.01) * 3;
      ctx.fillStyle = token("obj-jump-glow");
      ctx.beginPath();
      ctx.moveTo(-6, -40 + bob);
      ctx.lineTo(6, -40 + bob);
      ctx.lineTo(0, -52 + bob);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
function drawHazards(cx, cy) {
  for (const h of world.hazards) {
    const a = h.x0 - cx;
    const b = h.x1 - cx;
    if (b < -80 || a > visW() + 80)
      continue;
    const top = [];
    for (let x = h.x0;x <= h.x1; x += 22) {
      const y = groundY(x);
      if (!isFinite(y))
        continue;
      top.push([x - cx, y - cy]);
    }
    const ye = groundY(h.x1);
    if (isFinite(ye))
      top.push([h.x1 - cx, ye - cy]);
    if (top.length < 2)
      continue;
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1]);
    for (const p of top)
      ctx.lineTo(p[0], p[1]);
    for (let i = top.length - 1;i >= 0; i--)
      ctx.lineTo(top[i][0], top[i][1] + 130);
    ctx.closePath();
    ctx.fillStyle = token("obj-hazard-soft");
    ctx.fill();
    ctx.strokeStyle = token("obj-hazard-edge");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const flow = store.time * 34 % 22;
    for (const p of top) {
      const ox = p[0] + flow - 22;
      ctx.beginPath();
      ctx.moveTo(ox, p[1] + 4);
      ctx.lineTo(ox + 12, p[1] + 20);
      ctx.stroke();
    }
    const midX = (h.x0 + h.x1) / 2;
    const gy = groundY(midX);
    if (!isFinite(gy))
      continue;
    const px = midX - cx;
    const py = gy - cy;
    if (px < -80 || px > visW() + 80)
      continue;
    ctx.fillStyle = token("obj-hazard-fill");
    ctx.beginPath();
    ctx.roundRect(px - 4, py - 96, 96, 30, 7);
    ctx.fill();
    ctx.fillStyle = token("obj-hazard-mark");
    ctx.beginPath();
    ctx.arc(px + 14, py - 81, 9, 0, 7);
    ctx.fill();
    ctx.fillStyle = token("text-hi");
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(Math.round(toKmh(h.vmax)) + "", px + 14, py - 77);
    ctx.font = "10px sans-serif";
    ctx.fillText("限速 km/h", px + 62, py - 77);
    ctx.textAlign = "left";
  }
}
function drawGates(cx, cy) {
  for (const g of world.gates) {
    const sx = g.x - cx;
    if (sx < -80 || sx > visW() + 80)
      continue;
    const gy = groundY(g.x);
    if (!isFinite(gy))
      continue;
    const y = gy - cy;
    const col = g.passed ? token("obj-gate-open") : token("obj-gate-pending");
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash(g.passed ? [] : [7, 6]);
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx, y - 150);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(sx - 20, y - 168, 40, 22, 5);
    ctx.fill();
    ctx.fillStyle = token("obj-bike-frame");
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(g.passed ? "✔" : "⏱", sx, y - 152);
    ctx.textAlign = "left";
  }
}

// src/render/bike.js
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const m = (x, y) => Math.round(x + (y - x) * Math.max(0, Math.min(1, t)));
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}
function drawCoils(hw, hr, mdy, sq2, k) {
  ctx.strokeStyle = mixHex(token("warn"), token("danger"), Math.abs(sq2));
  ctx.globalAlpha = 0.35 + Math.abs(sq2) * 0.65;
  ctx.lineWidth = 2;
  for (const [ax, ay, bx, by] of [
    [-hw * 0.2, -hr * 0.72 + sq2 * 3, 0, -mdy],
    [hw * 0.5, -hr * 0.75 + sq2 * 3, 0, -mdy]
  ]) {
    const L = Math.hypot(bx - ax, by - ay) || 0.001;
    const coils = 2 + Math.abs(sq2) * 2.5;
    const nx = -(by - ay) / L;
    const ny = (bx - ax) / L;
    ctx.beginPath();
    for (let i = 0;i <= Math.round(coils * 10); i++) {
      const t = i / (coils * 10);
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const off = Math.sin(i * 0.63) * 2.2 * k;
      if (i === 0)
        ctx.moveTo(px, py);
      else
        ctx.lineTo(px + nx * off, py + ny * off);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
var CRANK_RATIO = 0.155;
var CRANK_FLOOR = 2.2;
var crank = 0;
function crankPhase(b, dt) {
  const wheelRps = Math.abs(b.wheelStepRear) / DT;
  crank += Math.max(wheelRps, CRANK_FLOOR) * CRANK_RATIO * dt;
  if (crank > 1e4)
    crank -= 1e4;
  return crank;
}
function drawBike(dt = 1 / 60) {
  const P = bike;
  const cxm = (P.rear.x + P.front.x) / 2;
  const cym = (P.rear.y + P.front.y) / 2;
  const ang = Math.atan2(P.front.y - P.rear.y, P.front.x - P.rear.x);
  ctx.save();
  ctx.translate(cxm - store.cam.x, cym - store.cam.y);
  ctx.rotate(ang);
  const hw = WHEELBASE * 0.5;
  const hr = SEAT_H;
  const sq2 = bike.squash || 0;
  const mdy = hr * 0.55 + sq2 * 4;
  const V = VEHICLES[store.currentVehicle];
  const vehCol = V.color;
  const A = V.art || {};
  const POSE = A.pose || {};
  const seatTopY = -hr * 0.72 + sq2 * 3;
  const headTopY = -hr * 0.75 + sq2 * 3;
  ctx.strokeStyle = vehCol;
  ctx.lineWidth = A.tube || 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-hw, 0);
  ctx.lineTo(0, -mdy);
  ctx.lineTo(hw, 0);
  ctx.moveTo(-hw, 0);
  ctx.lineTo(-hw * 0.2, seatTopY);
  ctx.moveTo(hw, 0);
  ctx.lineTo(hw * 0.5, headTopY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-hw * 0.2, seatTopY);
  ctx.lineTo(hw * 0.5, headTopY + (A.topDrop || 0));
  ctx.stroke();
  if (A.coil > 0)
    drawCoils(hw, hr, mdy, sq2, A.coil);
  const glyphY = -hr * 0.72 + sq2 * 3;
  const barX = hw * 0.5 + (POSE.barX || 0);
  const barY = glyphY - 8 + (POSE.barY || 0);
  ctx.fillStyle = token("obj-bike-tire");
  ctx.fillRect(-hw - 2, -hr * 0.8 - 4, A.saddleW || 10, 4);
  ctx.strokeStyle = token("obj-bike-carbon");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hw * 0.5, headTopY);
  ctx.lineTo(barX, barY);
  ctx.stroke();
  ctx.fillStyle = token("obj-rider-suit");
  if (A.bar === "drop") {
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.quadraticCurveTo(barX + 6.2, barY - 0.8, barX + 3.4, barY + 6.4);
    ctx.stroke();
    ctx.fillRect(barX - 5, barY - 1.6, 8.5, 3);
  } else if (A.bar === "wide") {
    ctx.fillRect(barX - 5, barY - 1.6, 16, 3.4);
  } else {
    ctx.fillRect(barX - 4.5, barY - 1.5, 12, 3);
  }
  const tire = A.tire || 3;
  const spokes = A.spokes || 6;
  const inner = WHEEL_R - tire * 0.5 - 1.2;
  for (const [off, spin, step] of [[-hw, P.wheelAngleRear, P.wheelStepRear], [hw, P.wheelAngleFront, P.wheelStepFront]]) {
    ctx.strokeStyle = token("obj-bike-tire");
    ctx.lineWidth = tire;
    ctx.beginPath();
    ctx.arc(off, 0, WHEEL_R, 0, 7);
    ctx.stroke();
    if (A.rim !== false) {
      ctx.strokeStyle = token("obj-bike-hub");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(off, 0, inner, 0, 7);
      ctx.stroke();
    }
    const halfPeriod = Math.PI / spokes;
    const blur = clamp((Math.abs(step) - halfPeriod * 0.4) / (halfPeriod * 1.2), 0, 1);
    const r = Math.max(2, inner - 1);
    ctx.globalAlpha = 1 - blur * 0.92;
    ctx.strokeStyle = token("obj-bike-metal");
    ctx.lineWidth = A.spokeW || 1.6;
    ctx.beginPath();
    for (let i = 0;i < spokes; i++) {
      const a = i / spokes * Math.PI * 2 + spin;
      ctx.moveTo(off, 0);
      ctx.lineTo(off + Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    if (blur > 0.25) {
      ctx.globalAlpha = blur * 0.26;
      ctx.strokeStyle = token("obj-bike-hub");
      ctx.lineWidth = (A.spokeW || 1.6) * 2.4;
      ctx.beginPath();
      ctx.arc(off, 0, r * 0.6, 0, 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = token("obj-bike-steel");
    ctx.beginPath();
    ctx.arc(off, 0, 2.6, 0, 7);
    ctx.fill();
  }
  const susY = sq2 * 3.5;
  const hipX = -12.5 + (POSE.shX || 0) * 0.42;
  const hipY = glyphY - 6.3 + susY + (POSE.shY || 0) * 0.5;
  const shX = 2.5 + (POSE.shX || 0);
  const shY = glyphY - 19.8 + susY + (POSE.shY || 0);
  ctx.strokeStyle = token("obj-rider-skin-2");
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hipX, hipY + 3);
  ctx.lineTo(shX, shY);
  ctx.stroke();
  const suitCol = token("obj-platform");
  const suitDark = token("obj-bike-dark");
  const suitFar = token("obj-platform-dark");
  const suitFarDark = token("obj-suit-far-dark");
  const bbX = -hw * 0.32;
  const bbY = -2.5 + susY;
  const cr = 5.8;
  const hdX = 5.6 + (POSE.hdX || 0);
  const hdY = glyphY - 22.8 + susY + (POSE.hdY || 0);
  const pda = crankPhase(bike, dt);
  const limb = (ax, ay, mx, my, bx, by, w1, w2, col, dark) => {
    ctx.lineCap = "round";
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(w1, w2) + 1.3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(mx, my);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.lineWidth = w2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };
  const L_THIGH = 15, L_SHIN = 15;
  const kneeOf = (hx, hy, fx, fy) => {
    let dx = fx - hx;
    let dy = fy - hy;
    const dRaw = Math.hypot(dx, dy) || 0.0001;
    const d = clamp(dRaw, Math.abs(L_THIGH - L_SHIN) + 0.001, (L_THIGH + L_SHIN) * 0.999);
    dx = dx / dRaw * d;
    dy = dy / dRaw * d;
    const a = (L_THIGH * L_THIGH - L_SHIN * L_SHIN + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L_THIGH * L_THIGH - a * a));
    const mx = hx + dx / d * a;
    const my = hy + dy / d * a;
    const px = -dy / d * h;
    const py = dx / d * h;
    return mx + px > mx - px ? [mx + px, my + py] : [mx - px, my - py];
  };
  const leg = (ph, w1, w2, col, dark) => {
    const fx = bbX + Math.cos(ph) * cr;
    const fy = bbY + Math.sin(ph) * cr;
    const [kx, ky] = kneeOf(hipX, hipY, fx, fy);
    limb(hipX, hipY, kx, ky, fx, fy, w1, w2, col, dark);
    ctx.fillStyle = token("obj-bike-frame");
    ctx.fillRect(fx - 2.6, fy - 0.8, 5.2, 1.7);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(fx + 1, fy - 0.5, 2.9, 1.8, 0, 0, 7);
    ctx.fill();
  };
  const arm = (w, col, dark) => {
    const ex = (shX + barX) / 2 + 0.8;
    const ey = (shY + barY) / 2 + 1.6;
    limb(shX + 0.8, shY + 0.8, ex, ey, barX - 0.8, barY + 0.6, w, w - 0.6, col, dark);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(barX - 0.8, barY + 0.6, 1.8, 0, 7);
    ctx.fill();
  };
  leg(pda + Math.PI, 3.2, 2.4, suitFar, suitFarDark);
  arm(2.5, suitFar, suitFarDark);
  ctx.fillStyle = token("obj-helmet");
  ctx.strokeStyle = suitDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse((hipX + shX) / 2 - 2.4, (hipY + shY) / 2 + 1, 2.9, 4, -0.72, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = token("obj-goggle");
  ctx.beginPath();
  ctx.arc((hipX + shX) / 2 - 2.6, (hipY + shY) / 2 - 0.6, 0.8, 0, 7);
  ctx.fill();
  ctx.fillStyle = suitCol;
  ctx.strokeStyle = suitDark;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(hipX - 2.6, hipY + 1.6);
  ctx.quadraticCurveTo(hipX - 4.4, hipY - 6, shX - 2.8, shY - 0.8);
  ctx.quadraticCurveTo(shX - 0.4, shY - 3.4, shX + 2.6, shY - 0.4);
  ctx.quadraticCurveTo(shX + 3.4, shY + 4, hipX + 2.4, hipY + 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = vehCol;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(hipX + 0.2, hipY + 0.4);
  ctx.lineTo(shX + 0.8, shY + 0.6);
  ctx.stroke();
  ctx.strokeStyle = token("obj-rider-skin");
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(shX + 1.2, shY - 0.6);
  ctx.lineTo(hdX - 1.2, hdY + 2.8);
  ctx.stroke();
  ctx.fillStyle = token("obj-rider-skin-hi");
  ctx.strokeStyle = token("obj-rider-skin-sh");
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(hdX, hdY, 3.4, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = token("obj-hair");
  ctx.beginPath();
  ctx.arc(hdX + 2, hdY + 0.4, 0.75, 0, 7);
  ctx.fill();
  ctx.fillStyle = token("obj-helmet");
  ctx.strokeStyle = token("obj-bike-frame");
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(hdX - 0.2, hdY - 0.7, A.helmR || 4.4, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (A.peak !== false) {
    ctx.beginPath();
    ctx.roundRect(hdX + 2.3, hdY - 2, 4.6, 1.9, 0.9);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = token("obj-glass-mid");
  ctx.lineWidth = 0.8;
  for (let v = 0, total = A.vents || 0;v < total; v++) {
    const a0 = Math.PI * (1.12 + v * 0.22);
    ctx.beginPath();
    ctx.arc(hdX - 0.2, hdY - 0.7, 2.5, a0, a0 + 0.6);
    ctx.stroke();
  }
  ctx.strokeStyle = token("obj-bike-carbon");
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(hdX + 1.1, hdY + 1.5);
  ctx.lineTo(hdX + 0.2, hdY + 3.2);
  ctx.stroke();
  ctx.strokeStyle = token("obj-bike-gray");
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bbX, bbY);
  ctx.lineTo(bbX + Math.cos(pda) * cr, bbY + Math.sin(pda) * cr);
  ctx.stroke();
  ctx.fillStyle = token("obj-bike-carbon");
  ctx.beginPath();
  ctx.arc(bbX, bbY, 1.8, 0, 7);
  ctx.fill();
  leg(pda, 4, 3, suitCol, suitDark);
  arm(3.2, suitCol, suitDark);
  ctx.restore();
}

// src/render/racers.js
var RIVAL_COLORS = [
  "#ff6b6b",
  "#ffd93d",
  "#6bcb77",
  "#4d96ff",
  "#c780e8",
  "#ff9f43"
];
var NAME_LIFT = 26;
function drawRacers(camX, camY) {
  const list = store.racers;
  if (!list || !list.length)
    return;
  const mode = store.mode;
  if (mode !== "race" && mode !== "ranked" && mode !== "space")
    return;
  const zoom = store.cam.zoom > 0.01 ? store.cam.zoom : 1;
  const visW = view.W / zoom;
  const margin = WHEELBASE * 2;
  const shadow = getQuality() !== "low";
  for (let i = 0;i < list.length; i++) {
    const ai = list[i];
    const sx = ai.x - camX;
    if (sx < -margin || sx > visW + margin)
      continue;
    const g = groundInfo(ai.x);
    if (!isFinite(g.y))
      continue;
    drawOne(sx, g.y - camY, Math.atan(g.m), RIVAL_COLORS[i % RIVAL_COLORS.length], ai.name, shadow, zoom);
  }
}
function drawOne(sx, gy, ang, color, name, shadow, zoom) {
  ctx.save();
  ctx.translate(sx, gy);
  ctx.rotate(ang);
  const wy = -WHEEL_R;
  if (shadow) {
    ctx.fillStyle = token("obj-shadow");
    ctx.beginPath();
    ctx.ellipse(0, 2, WHEELBASE * 0.62, 4, 0, 0, 7);
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  for (const dx of [-WHEELBASE / 2, WHEELBASE / 2]) {
    ctx.beginPath();
    ctx.arc(dx, wy, WHEEL_R, 0, 7);
    ctx.stroke();
  }
  const seatX = -WHEELBASE * 0.16;
  const seatY = wy - SEAT_H * 0.62;
  const headX = WHEELBASE * 0.34;
  const headY = wy - SEAT_H * 0.74;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-WHEELBASE / 2, wy);
  ctx.lineTo(seatX, seatY);
  ctx.lineTo(headX, headY);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(seatX, seatY);
  ctx.lineTo(seatX + 2, seatY - SEAT_H * 0.42);
  ctx.lineTo(headX + 1, headY);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(headX + 1, headY - 3.4, 3.4, 0, 7);
  ctx.fill();
  ctx.scale(1 / zoom, 1 / zoom);
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 3;
  ctx.strokeStyle = token("shadow-text-strong");
  ctx.strokeText(name || "AI", 0, -SEAT_H - NAME_LIFT / zoom);
  ctx.fillStyle = color;
  ctx.fillText(name || "AI", 0, -SEAT_H - NAME_LIFT / zoom);
  ctx.restore();
}

// src/render/cruise.js
var CRUISE_ZOOM = 0.05;
var inCruiseLayer = () => store.cam.zoom < CRUISE_ZOOM;
function drawCruiseBike() {
  const veh = VEHICLES[store.currentVehicle];
  const color = veh && veh.color || "#ffffff";
  const W = view.W;
  const H = view.H;
  const x = W * 0.38;
  const y = H * 0.62;
  const top = store.phys.topSpeed || 1;
  const spdN = Math.min(1, Math.abs(bike.speed) / Math.max(1, top));
  const r = 7 + spdN * 6;
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, 7);
  ctx.fill();
  if (spdN > 0.05) {
    const len = 40 + spdN * 150;
    ctx.globalAlpha = 0.28 * spdN;
    ctx.fillStyle = color;
    ctx.fillRect(x - len, y - r * 0.42, len, r * 0.84);
    ctx.globalAlpha = 0.5 * spdN;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - len * 0.45, y - r * 0.16, len * 0.45, r * 0.32);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawCruiseRacers() {
  const list = store.racers;
  if (!list || !list.length)
    return;
  const W = view.W;
  const H = view.H;
  const visW = W / store.cam.zoom;
  const base = store.cam.x + visW * 0.38;
  const COLORS = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c780e8", "#ff9f43"];
  ctx.save();
  for (let i = 0;i < list.length; i++) {
    const ai = list[i];
    const rel = (ai.x - base) / visW;
    if (rel < -0.6 || rel > 1.6)
      continue;
    const x = rel * W;
    const y = H * 0.62 + (i % 3 - 1) * 16;
    const color = COLORS[i % COLORS.length];
    const r = 4.5;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.9, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawCruiseGround() {
  const W = view.W;
  const H = view.H;
  const top = store.phys.topSpeed || 1;
  const spdN = Math.min(1, Math.abs(bike.speed) / Math.max(1, top));
  const T = THEMES[store.phys.theme] || THEMES[0];
  const pal = T.pal || ["#3f7d3a", "#58a24f", "#8b5e3c"];
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = pal[2];
  ctx.fillRect(0, H * 0.78, W, H * 0.22);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = pal[1];
  ctx.fillRect(0, H * 0.78, W, H * 0.07);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = token("text-hi");
  const gap = 60 - spdN * 40;
  const speed = 2 + spdN * 26;
  const offset = store.time * speed % gap;
  ctx.fillRect(0, H * 0.78 - 2, W, 3);
  ctx.globalAlpha = 0.35 * spdN + 0.1;
  for (let x = -offset;x < W; x += gap)
    ctx.fillRect(x, H * 0.78 - 14, gap * 0.45, 12);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// src/render/trail.js
var ph = 0;
var qFac = () => getQuality() === "low" ? 0.5 : getQuality() === "high" ? 1 : 0.78;
var nz = (x, s) => Math.sin(x * 1.7 + s) * 0.62 + Math.sin(x * 4.3 + s * 2.7) * 0.38;
function glowStroke(col, wGlow, aGlow, wCore, aCore) {
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(0.5, wGlow);
  ctx.globalAlpha = aGlow;
  ctx.stroke();
  ctx.lineWidth = Math.max(0.35, wCore);
  ctx.globalAlpha = aCore;
  ctx.stroke();
}
function velOf() {
  let vx = 0, vy = 0, mt = 0;
  for (const p of bike.pts) {
    vx += (p._vx || 0) * p.m;
    vy += (p._vy || 0) * p.m;
    mt += p.m;
  }
  return mt > 0 ? [vx / mt, vy / mt] : [0, 0];
}
function intensity(spd) {
  const top = store.phys && store.phys.topSpeed;
  if (!(top > 0) || !(spd > 0))
    return 0;
  const r = spd / top;
  if (r <= TRAIL_ON)
    return 0;
  return clamp(Math.log10(r / TRAIL_ON) / Math.log10(TRAIL_FULL / TRAIL_ON), 0, 1);
}
var meteorOf = (k) => clamp((k - TRAIL_METEOR_LO) / (TRAIL_METEOR_HI - TRAIL_METEOR_LO), 0, 1);
function drawArc(T, a, A, L, W, k, q) {
  const n = Math.max(2, Math.round(T.count * q));
  const steps = 9;
  for (let b = 0;b < n; b++) {
    const s = T.seed + b * 2.399;
    const off = (b - (n - 1) / 2) * W * 0.95;
    ctx.beginPath();
    for (let i = 0;i <= steps; i++) {
      const t = i / steps;
      const x = A - t * L;
      const y = off + nz(t * 3.1 + ph * 9, s) * W * 0.6 * t;
      if (i === 0)
        ctx.moveTo(x, y);
      else
        ctx.lineTo(x, y);
    }
    glowStroke(T.glow, W * 0.34, a * 0.16, W * 0.11, a * 0.6);
    glowStroke(T.core, W * 0.09, a * 0.28, W * 0.045, a * 0.85);
  }
}
function drawHelix(T, a, A, L, W, k, q) {
  const n = Math.max(2, Math.round(T.count * q));
  const steps = 16;
  for (let b = 0;b < n; b++) {
    const dir = b % 2 === 0 ? 1 : -1;
    const s = T.seed + b * 1.7;
    ctx.beginPath();
    for (let i = 0;i <= steps; i++) {
      const t = i / steps;
      const x = A - t * L;
      const env = 0.35 + 0.65 * Math.sin(t * Math.PI);
      const y = Math.sin(t * Math.PI * 2.5 * dir + ph * 3.4 + b) * W * 0.9 * env;
      if (i === 0)
        ctx.moveTo(x, y);
      else
        ctx.lineTo(x, y);
    }
    glowStroke(T.glow, W * 0.4, a * 0.15, W * 0.13, a * 0.55);
    glowStroke(T.core, W * 0.09, a * 0.26, W * 0.05, a * 0.8);
  }
}
function drawCorona(T, a, A, L, W, k, q) {
  const n = Math.max(4, Math.round(T.count * q));
  for (let i = 0;i < n; i++) {
    const s = T.seed + i * 1.31;
    const ang = -0.62 + 1.24 * i / Math.max(1, n - 1);
    const len = L * (0.32 + 0.68 * Math.abs(Math.sin(ph * 2.2 + s)));
    const ex = A - Math.cos(ang) * len;
    const ey = Math.sin(ang) * len * 0.75;
    ctx.beginPath();
    ctx.moveTo(A, 0);
    ctx.lineTo(ex, ey);
    glowStroke(T.glow, W * 0.42, a * 0.14, W * 0.14, a * 0.5);
    ctx.fillStyle = T.core;
    ctx.globalAlpha = a * 0.8;
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(0.5, W * 0.1), 0, 7);
    ctx.fill();
  }
}
function drawEmber(T, a, A, L, W, k, q) {
  const n = Math.max(4, Math.round(T.count * q));
  for (let i = 0;i < n; i++) {
    const s = T.seed + i * 2.11;
    const t = ((i * 0.618033 + ph * 0.16 + T.seed) % 1 + 1) % 1;
    const x = A - t * L;
    const y = -t * L * 0.22 + nz(t * 2 + ph * 3, s) * W * 0.55;
    const r = Math.max(0.5, W * (0.52 - 0.3 * t));
    ctx.fillStyle = T.glow;
    ctx.globalAlpha = a * (1 - t) * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1 + t * 1.8), r, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = T.core;
    ctx.globalAlpha = a * (1 - t) * 0.75;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.75 + t * 1.2), r * 0.6, 0, 0, 7);
    ctx.fill();
  }
}
function drawRipple(T, a, A, L, W, k, q) {
  const n = Math.max(3, Math.round(T.count * q));
  for (let i = 0;i < n; i++) {
    const s = T.seed + i * 1.9;
    const t = ((i / n + ph * 0.13 + T.seed) % 1 + 1) % 1;
    const x = A - t * L;
    const y = nz(t * 1.5 + ph * 2, s) * W * 0.3;
    const rx = Math.max(0.5, W * (0.35 + t * 1.6));
    const ry = rx * 0.42;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, 7);
    glowStroke(T.glow, W * 0.16, a * 0.14, W * 0.07, a * 0.55 * (1 - t * 0.7));
    glowStroke(T.core, W * 0.06, a * 0.16, W * 0.035, a * 0.5 * (1 - t * 0.8));
  }
}
function drawVortex(T, a, A, L, W, k, q) {
  const n = Math.max(3, Math.round(T.count * q));
  for (let i = 0;i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const s = T.seed + i * 0.9;
    const x = A - t * L;
    const y = nz(t * 1.2 + ph * 1.8, s) * W * 0.32;
    const rx = Math.max(0.5, W * (1.5 - t * 0.85));
    const ry = rx * 0.3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 1.5 + ph * 1.1);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, 7);
    glowStroke(T.glow, W * 0.2, a * 0.15, W * 0.08, a * 0.55);
    glowStroke(T.core, W * 0.07, a * 0.18, W * 0.04, a * 0.6);
    ctx.restore();
  }
}
function drawLance(T, a, A, L, W, k, q) {
  for (let i = 0;i < 2; i++) {
    const f = i === 0 ? 1 : 0.5;
    ctx.fillStyle = i === 0 ? T.glow : T.core;
    ctx.globalAlpha = a * (i === 0 ? 0.13 : 0.2);
    ctx.beginPath();
    ctx.moveTo(A, -W * 0.28 * f);
    ctx.lineTo(A - L * 0.34, -W * f);
    ctx.lineTo(A - L, -W * 0.05 * f);
    ctx.lineTo(A - L, W * 0.05 * f);
    ctx.lineTo(A - L * 0.34, W * f);
    ctx.lineTo(A, W * 0.28 * f);
    ctx.closePath();
    ctx.fill();
  }
  glowStroke(T.core, W * 0.34, a * 0.2, W * 0.11, a * 0.85);
  const n = Math.max(3, Math.round(T.count * q));
  for (let i = 0;i < n; i++) {
    const s = T.seed + i * 2.399;
    const t = ((i * 0.382 + ph * 0.22 + T.seed) % 1 + 1) % 1;
    const x = A - t * L;
    const y = nz(t * 2.4 + ph * 4, s) * W * 0.8;
    const r = Math.max(0.4, W * 0.09 * (1 - t * 0.5));
    ctx.fillStyle = T.core;
    ctx.globalAlpha = a * 0.7 * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  }
}
function drawCone(T, a, A, L, W, k, q) {
  const n = Math.max(3, Math.round(T.count * q));
  const steps = 12;
  for (let i = 0;i < n; i++) {
    const s = T.seed + i * 2.399;
    const ang = -0.5 + 1 * i / Math.max(1, n - 1);
    ctx.beginPath();
    for (let j = 0;j <= steps; j++) {
      const t = j / steps;
      const x = A - t * L;
      const w = W * (1 - 0.82 * t) * (0.9 + 0.1 * Math.sin(ph * 1.7 + s));
      const y = Math.tan(ang) * w + nz(t * 2 + ph * 2.4, s) * W * 0.12;
      if (j === 0)
        ctx.moveTo(x, y);
      else
        ctx.lineTo(x, y);
    }
    glowStroke(T.glow, W * 0.3, a * 0.13, W * 0.1, a * 0.5);
    glowStroke(T.core, W * 0.08, a * 0.3, W * 0.04, a * 0.9);
  }
}
function drawRift(T, a, A, L, W, k, q) {
  const n = Math.max(2, Math.round(T.count * q));
  const shear = Math.sin(ph * 0.9) * 0.6;
  for (let s = 0;s < 2; s++) {
    const off = (s === 0 ? -1 : 1) * W * 0.75 + shear * W * (s === 0 ? 1 : -1);
    ctx.beginPath();
    const steps = 10;
    for (let j = 0;j <= steps; j++) {
      const t = j / steps;
      const x = A - t * L;
      const y = off * (1 - t * 0.72) + nz(t * 1.6 + ph * 2 + s * 3, T.seed + s) * W * 0.22;
      if (j === 0)
        ctx.moveTo(x, y);
      else
        ctx.lineTo(x, y);
    }
    glowStroke(T.glow, W * 0.36, a * 0.15, W * 0.12, a * 0.55);
    glowStroke(T.core, W * 0.09, a * 0.26, W * 0.045, a * 0.85);
  }
  const m = Math.max(2, Math.round(n));
  for (let i = 0;i < m; i++) {
    const s = T.seed + i * 1.77;
    const t = ((i * 0.413 + ph * 0.19 + T.seed) % 1 + 1) % 1;
    const x = A - t * L;
    const y = nz(t * 2.2 + ph * 3, s) * W * 0.5 + shear * W * (1 - t) * 0.5;
    const r = Math.max(0.4, W * 0.1 * (1 - t * 0.55));
    ctx.fillStyle = T.core;
    ctx.globalAlpha = a * 0.65 * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  }
}
function drawMeteor(T, m, W, L) {
  if (m <= 0)
    return;
  const R = W * (0.9 + 1.25 * m);
  const TL = L * (1.15 + 0.7 * m);
  const widths = [1, 0.74, 0.52, 0.32, 0.15];
  for (let i = 0;i < 5; i++) {
    const w = W * 0.85 * widths[i];
    const inner = i === 4;
    const tail = TL * (inner ? 0.45 : 1);
    ctx.fillStyle = inner ? T.core : T.glow;
    ctx.globalAlpha = m * (inner ? 0.16 : 0.05 + i * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, -w);
    ctx.lineTo(-tail, -w * 0.03);
    ctx.lineTo(-tail, w * 0.03);
    ctx.lineTo(0, w);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 9;i >= 1; i--) {
    const t = i / 9;
    ctx.fillStyle = i <= 3 ? T.core : T.glow;
    ctx.globalAlpha = m * 0.075 * (1 - t) * (1 - t);
    ctx.beginPath();
    ctx.arc(0, 0, R * t, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = T.core;
  ctx.globalAlpha = m * 0.3;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 1.35, R * 0.085, 0, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.085, R * 0.8, 0, 0, 7);
  ctx.fill();
}
function drawTrail(dt = 1 / 60) {
  const veh = VEHICLES[store.currentVehicle];
  const T = veh && veh.trail;
  if (!T)
    return;
  if (store.run && store.run.crashed)
    return;
  const [vx, vy] = velOf();
  const spd = Math.hypot(vx, vy);
  if (!(spd > 0.000001))
    return;
  const k = intensity(spd);
  if (k <= 0)
    return;
  ph += dt;
  const cam = store.cam;
  const z = cam.zoom > 0.000001 ? cam.zoom : 1;
  const sw = (px) => px / z;
  const q = qFac();
  const m = meteorOf(k);
  const kE = k * (1 - 0.38 * m);
  const A = sw(16);
  const L = sw(T.len * (0.32 + 0.68 * k));
  const W = sw(T.width * (0.55 + 0.45 * k));
  const cxm = (bike.rear.x + bike.front.x) / 2;
  const cym = (bike.rear.y + bike.front.y) / 2;
  ctx.save();
  ctx.translate(cxm - cam.x, cym - cam.y);
  ctx.rotate(Math.atan2(vy, vx));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (T.style) {
    case "helix":
      drawHelix(T, kE, A, L, W, k, q);
      break;
    case "corona":
      drawCorona(T, kE, A, L, W, k, q);
      break;
    case "ember":
      drawEmber(T, kE, A, L, W, k, q);
      break;
    case "ripple":
      drawRipple(T, kE, A, L, W, k, q);
      break;
    case "vortex":
      drawVortex(T, kE, A, L, W, k, q);
      break;
    case "lance":
      drawLance(T, kE, A, L, W, k, q);
      break;
    case "cone":
      drawCone(T, kE, A, L, W, k, q);
      break;
    case "rift":
      drawRift(T, kE, A, L, W, k, q);
      break;
    default:
      drawArc(T, kE, A, L, W, k, q);
      break;
  }
  drawMeteor(T, m, W, L);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// src/render/hud.js
function placeTag() {
  if (store.mode !== "race" && store.mode !== "space")
    return "";
  const f = RACE_FORMATS[store.raceFormat] || RACE_FORMATS.duel;
  if (f.riders < 2)
    return "";
  const p = racePlaceOf(store.racers || [], (bike.rear.x + bike.front.x) / 2, f);
  if (f.team) {
    const [tp, ip] = p;
    return (tp === 1 ? "我方领先" : "我方落后") + " · 队内第 " + ip + " / " + f.teamSize;
  }
  return "第 " + p + " / " + (f.riders + 1) + " 名";
}
var WARN_H = 26;
function hudLayout(hasWarn = false, touch = false) {
  const W = view.W;
  const H = view.H;
  const compact = W < 520 || H < 480;
  const pad = tokenNum("space-2", 8);
  const gap = tokenNum("space-2", 8);
  const topBand = hasWarn ? WARN_H + gap : 0;
  const infoW = Math.min(compact ? 170 : 250, Math.max(120, W - pad * 2));
  const infoH = 52;
  const info = { x: pad, y: pad + topBand, w: infoW, h: infoH };
  const fuel = { x: pad, y: info.y + info.h + 6, w: infoW, h: 12 };
  const raceW = Math.min(W * 0.46, 300);
  const race = { x: (W - raceW) / 2, y: fuel.y + fuel.h + gap, w: raceW, h: 10 };
  const warnW = Math.min(320, Math.max(140, W - pad * 2));
  const warn = hasWarn ? { x: (W - warnW) / 2, y: pad, w: warnW, h: WARN_H } : null;
  const gr = compact ? 36 : 50;
  const TOUCH_KEY_ZONE = 90;
  const speed = {
    x: W - pad - gr * 2,
    y: H - pad - gr * 2 - (touch ? TOUCH_KEY_ZONE + gap * 2 : 0),
    w: gr * 2,
    h: gr * 2
  };
  const drive = touch ? null : { x: (W - 104) / 2, y: H - pad - 14, w: 104, h: 14 };
  const quit = store.mode === "free" ? { x: W / 2 - 62, y: H - pad - 30 - (touch ? 74 : 0), w: 124, h: 30 } : null;
  return { info, fuel, race, warn, speed, drive, quit };
}
function glassRect(r, radius) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius === undefined ? tokenNum("radius-card", 14) : radius);
  ctx.fillStyle = token("hud-scrim");
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = token("glass-border");
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, 1, 0.5);
  ctx.fillStyle = token("glass-highlight");
  ctx.fill();
}
function label(text, x, y, level, color, align) {
  ctx.font = fontOf(level);
  ctx.fillStyle = color;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}
function badgeText(text, x, y, bg, fg) {
  ctx.font = fontOf("micro");
  const w = ctx.measureText(text).width + tokenNum("space-3", 12);
  const h = 15;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, tokenNum("radius-chip", 8));
  ctx.fillStyle = bg;
  ctx.fill();
  label(text, x + tokenNum("space-2", 8) / 2 + 1, y + 11, "micro", fg);
  return w;
}
function activeWarning() {
  if (store.state !== "play")
    return null;
  const run = store.run;
  if (store.mode !== "level" || run.crashed)
    return null;
  const mx = (bike.rear.x + bike.front.x) / 2;
  const spd = Math.abs(bike.speed);
  const g = world.gates[run.gateIdx];
  if (g) {
    const ride = store.time - run.levelStartTime - run.crashStall;
    const rem = g.limit - ride;
    if (rem < 2.5)
      return { level: "warn", text: "⏱ 限时门 " + Math.max(0, rem).toFixed(1) + "s" };
  }
  if (ignoresHazardLimit())
    return null;
  for (const h of world.hazards) {
    if (mx > h.x1)
      continue;
    if (h.x0 - mx > 1000)
      continue;
    const lim = Math.round(toKmh(h.vmax));
    if (mx >= h.x0 && spd > h.vmax)
      return { level: "danger", text: "⚠️ 危险路段超速！" };
    if (spd > h.vmax) {
      return { level: "warn", text: "⚠️ 已超速 " + Math.round(toKmh(spd) - lim) + " · 限速 " + lim };
    }
    if (spd > h.vmax * 0.9) {
      return { level: "warn", text: "⚠️ 前方限速 " + lim + "km/h · 当前 " + Math.round(toKmh(spd)) };
    }
  }
  return null;
}
var WARN_BG = { danger: "danger", warn: "warn", info: "info", success: "success" };
function drawHud() {
  if (store.state === "menu")
    return;
  const w = activeWarning();
  const L = hudLayout(!!w, touchActive);
  drawInfoCard(L.info);
  drawFuelGauge(L.fuel);
  if (store.mode === "race" || store.mode === "space")
    drawRaceBar(L.race);
  drawSpeedGauge(L.speed);
  if (L.drive)
    drawDriveIndicator(L.drive);
  if (L.quit)
    drawQuitButton(L.quit);
  if (w)
    drawWarning(L.warn, w);
  drawSpeedLines();
}
function drawQuitButton(r) {
  const el = quitBtn();
  if (!el)
    return;
  el.style.left = r.x + "px";
  el.style.top = r.y + "px";
  el.style.width = r.w + "px";
  el.style.height = r.h + "px";
  if (el.style.display !== "flex")
    el.style.display = "flex";
}
var _quitEl = null;
function quitBtn() {
  if (_quitEl)
    return _quitEl;
  if (typeof document === "undefined" || !document.createElement)
    return null;
  const el = document.createElement("button");
  el.id = "btnQuitRun";
  el.type = "button";
  el.className = "hudQuit";
  el.textContent = "⏹ 结束本局";
  el.setAttribute("aria-label", "结束无限模式本局并结算里程");
  document.body.appendChild(el);
  _quitEl = el;
  return el;
}
function drawInfoCard(r) {
  const x = r.x;
  const L = courseAt(store.selLevel, store.mode) || LEVELS[0];
  const compact = view.W < 520 || view.H < 480;
  const isFinale = store.mode === "level" && store.selLevel === FINALE_INDEX;
  const title = store.mode === "free" ? "♾ 自由模式" : isFinale ? "\uD83C\uDFAF " + L.name : store.mode === "space" ? "\uD83C\uDF0C " + L.name : store.mode === "race" ? "\uD83C\uDFC6 " + (store.raceRanked ? "排位" : "比赛") + " 第" + (store.selLevel + 1) + "关" : "关卡 " + (store.selLevel + 1) + (compact ? "" : " · " + L.name);
  ctx.save();
  ctx.shadowColor = token("shadow-text-strong");
  ctx.shadowBlur = 6;
  label(title, x, r.y + 14, "title", token("text-hi"));
  let bx = x + ctx.measureText(title).width + 6;
  if (store.mode === "level" && L.variant !== "normal") {
    const vi = VARIANT_INFO[L.variant];
    if (vi)
      bx += badgeText(vi.icon + vi.name, bx, r.y + 1, token("glass-fill-strong"), token("info")) + 4;
  }
  if ((store.mode === "race" || store.mode === "space") && store.raceAI) {
    const lead = (bike.rear.x + bike.front.x) / 2 - store.raceAI.x;
    const txt = (lead >= 0 ? "领先 " : "落后 ") + abbrevNum(Math.round(toM(Math.abs(lead)))) + "m";
    bx += badgeText(txt, bx, r.y + 1, token("glass-fill-strong"), lead >= 0 ? token("success") : token("danger")) + 4;
    const ps = placeTag();
    if (ps)
      bx += badgeText(ps, bx, r.y + 1, token("glass-fill-strong"), token("gold")) + 4;
  }
  const info = [];
  if (store.mode === "free") {
    info.push("里程 " + Math.round(toM((bike.rear.x + bike.front.x) / 2)) + "m" + (store.best > 0 ? " · 最佳 " + store.best + "m" : ""));
  } else {
    const g = store.mode === "level" || store.mode === "space" ? world.gates[store.run.gateIdx] : null;
    if (g) {
      const ride = store.time - store.run.levelStartTime - store.run.crashStall;
      const rem = Math.max(0, g.limit - ride);
      const total = world.gates.length;
      const idxLabel = total > 20 ? `${store.run.gateIdx + 1}/${total}` : String(store.run.gateIdx + 1);
      info.push("⏱ 第" + idxLabel + "门 " + rem.toFixed(1) + "s");
    }
  }
  label(info.join("   "), x, r.y + 30, "caption", token("text-mid"));
  const mx = (bike.rear.x + bike.front.x) / 2;
  const pct = store.mode === "free" ? 1 : clamp(mx / Math.max(1, store.finishX), 0, 1);
  const barY = r.y + 35;
  ctx.beginPath();
  ctx.roundRect(x, barY, r.w, 5, 2.5);
  ctx.fillStyle = token("scrim");
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x, barY, Math.max(2, r.w * pct), 5, 2.5);
  ctx.fillStyle = token("accent");
  ctx.fill();
  drawBalance(x, r.y + 45, r.w, 4);
  ctx.restore();
}
function drawBalance(x, y, w, h) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = token("scrim");
  ctx.fill();
  const ang = Math.atan2(bike.front.y - bike.rear.y, bike.front.x - bike.rear.x);
  const norm = clamp(ang * 2.5, -1, 1);
  const cx = x + w / 2 + norm * (w / 2 - 3);
  ctx.beginPath();
  ctx.roundRect(cx - 3, y - 1, 6, h + 2, 2);
  ctx.fillStyle = Math.abs(norm) > 0.6 ? token("danger") : token("success");
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - 0.5, y - 1, 1, h + 2, 0.5);
  ctx.fillStyle = token("text-lo");
  ctx.fill();
}
function drawFuelGauge(r) {
  const ratio = fuelRatio();
  const labelW = 48;
  const inner = { x: r.x, y: r.y + 2, w: Math.max(24, r.w - labelW), h: r.h - 4 };
  ctx.save();
  ctx.shadowColor = token("shadow-text");
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w, inner.h, inner.h / 2);
  ctx.fillStyle = token("scrim");
  ctx.fill();
  const low = ratio < 0.25;
  const alpha = low ? 0.55 + 0.45 * Math.abs(Math.sin(store.time * 6)) : 1;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, Math.max(1, inner.w * ratio), inner.h, inner.h / 2);
  ctx.fillStyle = low ? token("danger") : token("warn");
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let i = 1;i < 10; i++) {
    const tx = inner.x + inner.w * i / 10;
    ctx.moveTo(tx, inner.y);
    ctx.lineTo(tx, inner.y + inner.h * 0.45);
  }
  ctx.strokeStyle = token("shadow-text");
  ctx.lineWidth = 1;
  ctx.stroke();
  label("⛽ " + Math.round(ratio * 100) + "%", r.x + r.w, r.y + r.h - 2, "micro", token("text-hi"), "right");
  ctx.restore();
}
function drawSpeedGauge(r) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = r.w / 2 - 4;
  const kmh = toKmh(Math.abs(bike.speed));
  const maxK = toKmh(store.phys.topSpeed) || 1;
  const frac = clamp(kmh / maxK, 0, 1);
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, r.w / 2);
  ctx.fillStyle = token("glass-fill");
  ctx.fill();
  ctx.strokeStyle = token("glass-border");
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, Math.PI * 0.75, Math.PI * 2.25);
  ctx.strokeStyle = token("track");
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * frac);
  ctx.strokeStyle = frac > 0.85 ? token("danger") : frac > 0.6 ? token("warn") : token("success");
  ctx.lineWidth = 7;
  ctx.stroke();
  const kmhText = kmh >= 1e4 ? abbrevNum(kmh) : String(Math.round(kmh));
  label(kmhText, cx, cy + 4, "display", token("text-hi"), "center");
  label("km/h", cx, cy + 18, "micro", token("text-lo"), "center");
}
function drawDriveIndicator(r) {
  glassRect(r, tokenNum("radius-chip", 8));
  const bh = r.h;
  label("◀ A", r.x + 16, r.y + bh - 4, "micro", key.left ? token("danger") : token("text-lo"), "center");
  label("\uD83D\uDEB2", r.x + r.w / 2, r.y + bh - 4, "micro", token("text-mid"), "center");
  label("D ▶", r.x + r.w - 16, r.y + bh - 4, "micro", key.right ? token("success") : token("text-lo"), "center");
}
function drawRaceBar(r) {
  glassRect(r, tokenNum("radius-chip", 8));
  const pad = tokenNum("space-2", 8) / 2;
  const inner = { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 };
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w, inner.h, 3);
  ctx.fillStyle = token("track");
  ctx.fill();
  const total = Math.max(1, store.finishX);
  const px = clamp((bike.rear.x + bike.front.x) / 2 / total, 0, 1);
  const ax = clamp(store.raceAI ? store.raceAI.x / total : 0, 0, 1);
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w * ax, inner.h, 3);
  ctx.fillStyle = token("danger");
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(inner.x, inner.y, inner.w * px, inner.h, 3);
  ctx.fillStyle = token("success");
  ctx.fill();
  if (store.raceAI) {
    const sx = store.raceAI.x - store.cam.x;
    if (sx > -40 && sx < view.W + 40) {
      const sy = r.y + r.h + 14;
      ctx.beginPath();
      ctx.arc(sx - 7, sy, 5, 0, 7);
      ctx.arc(sx + 7, sy, 5, 0, 7);
      ctx.fillStyle = token("danger");
      ctx.fill();
      label("AI", sx, sy - 8, "micro", token("danger"), "center");
    }
  }
}
function drawWarning(r, w) {
  const bg = token(WARN_BG[w.level] || "info");
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, tokenNum("radius-chip", 8));
  ctx.fillStyle = token("scrim-strong");
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = bg;
  ctx.stroke();
  label(w.text, r.x + r.w / 2, r.y + r.h - 8, "caption", bg, "center");
}
function drawSpeedLines() {
  const spd = Math.abs(bike.speed);
  if (spd < SPEEDLINE_V || store.run.crashed)
    return;
  const q = getQuality();
  const isHi = q === "high";
  let intens = clamp(spd / SPEEDLINE_REF, 0, 1) * (isHi ? 0.42 : 0.3);
  let n = isHi ? 16 : 12;
  let lMax = isHi ? 34 : 25;
  let lMin = 10;
  let lw = isHi ? 1.7 : 1.5;
  if (spd > SPEEDLINE_WARP_V) {
    const k = clamp(Math.log10(spd / SPEEDLINE_WARP_V) / Math.log10(SPEEDLINE_WARP_REF / SPEEDLINE_WARP_V), 0, 1);
    intens = clamp(intens + k * (isHi ? 0.43 : 0.35), 0, 0.85);
    n = Math.round(n + k * (isHi ? 68 : 52));
    lMax = isHi ? 34 + k * 300 : 25 + k * 240;
    lMin = 10 + k * 40;
    lw = isHi ? 1.7 + k * 1.6 : 1.5 + k * 1.2;
  }
  const dir = Math.sign(bike.speed || 1);
  ctx.strokeStyle = token("obj-glass-mid");
  ctx.globalAlpha = intens;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 0;i < n; i++) {
    const x = Math.random() * view.W;
    const y = Math.random() * view.H * 0.62;
    const l = lMin + Math.random() * (lMax - lMin);
    ctx.moveTo(x, y);
    ctx.lineTo(x - l * dir, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// src/render/scene.js
function drawScene(dt = 1 / 60) {
  const cam = store.cam;
  drawBackground(cam.x, cam.y);
  const off = shakeOffset();
  const bcx = cam.x;
  const bcy = cam.y;
  cam.x += off.x;
  cam.y += off.y;
  const cruise = inCruiseLayer();
  if (cruise) {
    drawCruiseGround();
    drawCruiseRacers();
    drawCruiseBike();
    drawSpeedLines();
    applyPostFx(store.time, dt);
    if (store.state === "play" || store.state === "pause" || store.state === "ended")
      drawHud();
    return;
  }
  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  drawParticles(cam.x, cam.y);
  drawDeco(cam.x, cam.y);
  drawTerrain(cam.x, cam.y);
  drawHazards(cam.x, cam.y);
  drawJumps(cam.x, cam.y);
  drawGates(cam.x, cam.y);
  drawBoosts(cam.x, cam.y);
  drawCoins(cam.x, cam.y);
  drawCanisters(cam.x, cam.y);
  drawFlag(cam.x, cam.y, store.finishX);
  drawRacers(cam.x, cam.y);
  drawBikeShadow();
  if (store.state === "play" || store.state === "ended" || store.state === "pause") {
    drawTrail(dt);
    drawBike(dt);
  }
  ctx.restore();
  cam.x = bcx;
  cam.y = bcy;
  applyPostFx(store.time, dt);
  if (store.state === "play" || store.state === "pause" || store.state === "ended") {
    drawHud();
  }
}
function drawBikeShadow() {
  if (getQuality() !== "high")
    return;
  const mx = (bike.rear.x + bike.front.x) / 2;
  const g = groundInfo(mx);
  if (!isFinite(g.y))
    return;
  const airFade = bike.grounded === 0 ? clamp(1 - Math.abs(bike.rear.y - g.y) / 90, 0, 1) : 1;
  if (airFade <= 0.05)
    return;
  const cam = store.cam;
  const spdN = clamp(Math.abs(bike.speed) / 320, 0, 1);
  const x = mx - cam.x;
  const y = g.y - cam.y + 4;
  const len = 22 + spdN * 20;
  ctx.fillStyle = token("obj-shadow");
  ctx.globalAlpha = airFade;
  ctx.beginPath();
  ctx.ellipse(x, y, len, 6, 0, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + 1, len * 0.72, 4, 0, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// src/ui/components.js
function esc(s) {
  return String(s === undefined || s === null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function plain(s) {
  return String(s === undefined || s === null ? "" : s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function card(o = {}) {
  const cls = ["card"];
  if (o.cls)
    cls.push(...String(o.cls).split(/\s+/).filter(Boolean));
  if (o.interactive)
    cls.push("interactive");
  if (o.selected)
    cls.push("selected");
  if (o.locked)
    cls.push("locked");
  const aria = o.locked ? ' aria-disabled="true"' : "";
  const st = o.styleVars ? ` style="${o.styleVars}"` : "";
  let a11y = "";
  if (o.interactive) {
    const name = plain([o.title, o.sub, o.meta].filter(Boolean).join(" · "));
    a11y = ` role="button" tabindex="0"` + (name ? ` aria-label="${esc(name)}"` : "");
  }
  const icon = o.icon ? `<div class="cardIcon">${o.icon}</div>` : "";
  const title = o.title ? `<div class="vname">${o.title}</div>` : "";
  const sub = o.sub ? `<div class="vdesc">${o.sub}</div>` : "";
  const meta = o.meta ? `<div class="vstat">${o.meta}</div>` : "";
  const right = o.right ? `<div class="cardRight">${o.right}</div>` : "";
  const inner = icon || title || sub || meta || right ? `<div class="cardHead">${icon}<div class="cardBody">${title}${sub}${meta}</div>${right}</div>` : "";
  return `<div class="${cls.join(" ")}"${o.attrs ? " " + o.attrs : ""}${aria}${st}${a11y}>${inner}${o.body || ""}</div>`;
}
function chip(text, level = "", o = {}) {
  const cls = ["chip"];
  if (level)
    cls.push(level);
  if (o.interactive)
    cls.push("interactive");
  const aria = o.interactive ? "" : "";
  return `<span class="${cls.join(" ")}"${o.attrs ? " " + o.attrs : ""}${aria}>${text}</span>`;
}
function badge(text, kind = "", o = {}) {
  const cls = ["badge"];
  if (kind)
    cls.push(kind);
  if (o.lg)
    cls.push("lg");
  return `<span class="${cls.join(" ")}"${o.attrs ? " " + o.attrs : ""}>${text}</span>`;
}
function statRow(items = []) {
  const body = items.map((it) => `<div class="stat${it.cls ? " " + it.cls : ""}"><span>${it.label}</span><b>${it.value}</b></div>`).join("");
  return `<div class="statGrid">${body}</div>`;
}
function emptyState(text) {
  return `<div class="empty">${text}</div>`;
}
function progress(pct, o = {}) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="progress"${o.attrs ? " " + o.attrs : ""}><i style="width:${v.toFixed(1)}%"></i></div>`;
}
function themeVars(th) {
  const pal = th && th.pal || [];
  const sky = th && th.sky || [];
  const accent = pal[0] || "";
  const parts = [];
  if (accent)
    parts.push("--theme-accent:" + accent);
  if (sky[0])
    parts.push("--theme-sky:" + sky[0]);
  if (sky[1])
    parts.push("--theme-sky-2:" + sky[1]);
  if (pal[1])
    parts.push("--theme-ground:" + pal[1]);
  return parts.join(";");
}

// src/ui/menu.js
var overlay = document.getElementById("overlay");
var ovTitle = document.getElementById("ovTitle");
var ovSub = document.getElementById("ovSub");
var heroSummary = document.getElementById("heroSummary");
var homeView = document.getElementById("homeView");
var modeTabs = document.getElementById("modeTabs");
var modePanel = document.getElementById("modePanel");
var pauseBar = document.createElement("div");
pauseBar.className = "pauseBar";
pauseBar.id = "pauseBar";
pauseBar.style.display = "none";
var resumeBtn = document.createElement("button");
resumeBtn.className = "btn lg";
resumeBtn.id = "btnResume";
resumeBtn.dataset.entry = "resume";
resumeBtn.textContent = "▶ 继续";
resumeBtn.addEventListener("click", () => {
  if (store.state === "pause")
    togglePause();
});
var homeBtn = document.createElement("button");
homeBtn.className = "btn ghost lg";
homeBtn.id = "btnHome";
homeBtn.dataset.entry = "home";
homeBtn.textContent = "\uD83C\uDFE0 返回主页";
homeBtn.addEventListener("click", () => {
  if (store.state === "pause" || store.state === "ended")
    showMenu();
});
pauseBar.appendChild(resumeBtn);
pauseBar.appendChild(homeBtn);
if (overlay && overlay.appendChild)
  overlay.appendChild(pauseBar);
var homeFloat = document.getElementById("btnHomeFloat");
if (homeFloat) {
  homeFloat.addEventListener("click", () => {
    if (store.state === "play" || store.state === "pause" || store.state === "ended")
      showMenu();
  });
}
document.addEventListener("click", (e) => {
  const el = e.target && e.target.closest ? e.target.closest(".hudQuit") : null;
  if (!el)
    return;
  e.preventDefault();
  quitFreeRun();
});
function renderHeroSummary() {
  if (!heroSummary)
    return;
  heroSummary.innerHTML = [
    chip("通关 " + clearedCount() + "/" + LEVELS.length),
    chip("\uD83E\uDE99 " + goldNum(store.gold), "gold")
  ].join("");
}
function setMenuGroupsVisible(v) {
  if (homeView)
    homeView.style.display = v ? "" : "none";
}
function refreshMenuButtons() {
  renderHeroSummary();
  const btnSave = document.getElementById("btnSave");
  if (btnSave) {
    const okSave = isStorageAvailable();
    btnSave.title = okSave ? "存档管理" : "存档（浏览器存储不可用）";
    btnSave.classList.toggle("lockedBtn", !okSave);
  }
}
function visibleEntries() {
  if (!homeView)
    return [];
  const btns = [];
  if (store.state === "pause" && pauseBar) {
    if (resumeBtn)
      btns.push(resumeBtn);
    if (homeBtn)
      btns.push(homeBtn);
    return btns;
  }
  if (resumeBtn.style.display !== "none")
    btns.push(resumeBtn);
  if (homeView.style.display === "none")
    return btns;
  for (const el of document.querySelectorAll(".mtab, .menuFoot button[data-entry]")) {
    if (el.disabled)
      continue;
    if (el.offsetParent === null)
      continue;
    btns.push(el);
  }
  return btns;
}
function onMenuKeydown(e) {
  if (!overlay || overlay.classList.contains("hidden"))
    return;
  if (store.state !== "menu" && store.state !== "pause")
    return;
  if (e.code === "Escape" && modePanel && !modePanel.classList.contains("hidden")) {
    e.preventDefault();
    hidePanel();
    return;
  }
  const btns = visibleEntries();
  if (!btns.length)
    return;
  const active = document.activeElement;
  const i = btns.indexOf(active);
  const move = (d) => {
    e.preventDefault();
    const next = i < 0 ? 0 : (i + d + btns.length) % btns.length;
    btns[next].focus();
  };
  if (e.code === "ArrowDown" || e.code === "ArrowRight")
    move(1);
  else if (e.code === "ArrowUp" || e.code === "ArrowLeft")
    move(-1);
}
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("keydown", onMenuKeydown);
}
function focusDefault() {
  const target = store.state === "pause" ? resumeBtn : modeTabs && modeTabs.querySelector(".mtab.is-on") || modeTabs;
  if (target && typeof target.focus === "function") {
    try {
      target.focus({ preventScroll: true });
    } catch (err) {
      target.focus();
    }
  }
}
function setMenuChrome() {
  ovTitle.textContent = "\uD83D\uDEB2 越野自行车";
  if (ovSub)
    ovSub.hidden = true;
  if (homeView)
    homeView.style.display = "";
  resumeBtn.style.display = "none";
  if (pauseBar)
    pauseBar.style.display = "none";
  refreshMenuButtons();
  if (uiHooks.onHome)
    uiHooks.onHome();
  focusDefault();
}
function hideOverlay() {
  overlay.classList.add("hidden");
  if (homeFloat)
    homeFloat.style.display = "flex";
  syncTouchVisibility();
}
var PANEL_BAR = '<div class="panelBar"><button class="btn sm panelBack" data-act="back" type="button">‹ 返回</button></div>';
function showPanel(html) {
  setMenuGroupsVisible(false);
  modePanel.innerHTML = PANEL_BAR + html;
  modePanel.classList.remove("hidden");
  modePanel.classList.add("enter");
  modePanel.offsetWidth;
  modePanel.classList.remove("enter");
  if (typeof modePanel.scrollIntoView === "function") {
    try {
      modePanel.scrollIntoView({ block: "nearest" });
    } catch (e) {
      modePanel.scrollIntoView();
    }
  }
}
function hidePanel() {
  modePanel.classList.add("hidden");
  modePanel.innerHTML = "";
  setMenuGroupsVisible(true);
}
function showMenu() {
  store.state = "menu";
  store.raceAI = null;
  store.racers = [];
  hidePanel();
  setMenuGroupsVisible(true);
  if (pauseBar)
    pauseBar.style.display = "none";
  if (homeFloat)
    homeFloat.style.display = "none";
  setMenuChrome();
  overlay.classList.remove("hidden");
  syncTouchVisibility();
}
function showResultCard(res = {}) {
  store.state = "ended";
  if (pauseBar)
    pauseBar.style.display = "none";
  overlay.classList.remove("hidden");
  setMenuGroupsVisible(false);
  renderHeroSummary();
  const stars2 = res.stars === undefined ? null : Math.max(0, Math.min(3, res.stars));
  const starHtml = stars2 === null ? "" : `<div class="resultStars">${[0, 1, 2].map((i) => badge(i < stars2 ? "★" : "☆", i < stars2 ? "star" : "lock", { lg: true, attrs: `style="--i:${i}"` })).join("")}</div>`;
  const items = [
    { label: "金币", value: `<b class="roll" data-roll="${res.goldTotal === undefined ? store.gold || 0 : res.goldTotal}">0</b>` },
    { label: "本局获得", value: "\uD83E\uDE99 +" + (res.goldGain || 0) },
    { label: "本局用时", value: res.time ? res.time.toFixed(1) + "s" : "—" }
  ];
  if (res.ratingDelta) {
    items.push({ label: "段位分", value: (res.ratingDelta > 0 ? "+" : "") + res.ratingDelta + " → " + res.rating });
  }
  showPanel(`<div class="resultCard">
  <div class="modeTitle">${res.title || "\uD83C\uDFC1 本局结束"}</div>
  ${res.sub ? `<div class="panelNote">${res.sub}</div>` : ""}
  ${starHtml}
  ${statRow(items)}
  <div class="row2">
    <button class="btn" data-act="resultNext" aria-label="${res.nextLabel || "下一关"}">${res.nextLabel || "下一关 →"}</button>
    <button class="btn ghost" data-act="resultMenu" aria-label="返回主菜单">\uD83C\uDFE0 返回菜单</button>
  </div>
</div>`);
  startGoldRoll();
}
function startGoldRoll() {
  const el = modePanel ? modePanel.querySelector(".roll") : null;
  if (!el)
    return;
  const target = Number(el.dataset.roll) || 0;
  if (reducedMotion() || typeof setInterval !== "function") {
    el.textContent = String(target);
    return;
  }
  let cur = 0;
  let steps = 0;
  const timer = setInterval(() => {
    steps++;
    cur = Math.round(target * Math.min(1, steps / 18));
    el.textContent = String(cur);
    if (steps >= 18) {
      el.textContent = String(target);
      clearInterval(timer);
    }
  }, 33);
}
function reducedMotion() {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" ? !!window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
  } catch (e) {
    return false;
  }
}
if (modePanel && typeof modePanel.addEventListener === "function") {
  modePanel.addEventListener("click", (e) => {
    const el = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el)
      return;
    if (el.dataset.act === "resultNext") {
      hidePanel();
      nextLevel();
    } else if (el.dataset.act === "resultMenu") {
      showMenu();
    }
  });
}
function togglePause() {
  if (store.state === "play") {
    store.state = "pause";
    ovTitle.textContent = "⏸ 已暂停";
    if (ovSub) {
      ovSub.hidden = false;
      ovSub.textContent = "休息一下，随时继续，或返回主页";
    }
    if (homeView)
      homeView.style.display = "none";
    if (homeFloat)
      homeFloat.style.display = "none";
    if (pauseBar)
      pauseBar.style.display = "";
    resumeBtn.style.display = "";
    homeBtn.style.display = "";
    overlay.classList.remove("hidden");
    focusDefault();
  } else if (store.state === "pause") {
    store.state = "play";
    overlay.classList.add("hidden");
    if (homeFloat)
      homeFloat.style.display = "flex";
  }
}

// src/ui/panels.js
var api = {};
var openBranch = -1;
var panelKind = "level";
var homeView2 = document.getElementById("homeView");
var inHomeView = true;
var lastTab = "level";
var openSpaceLeague = 0;
var saveView = { pending: null, summary: null, error: "", note: "", confirmReset: false };
function initPanels(a) {
  api = a || {};
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el)
      el.addEventListener("click", () => {
        initAudio();
        if (store.state === "menu")
          fn();
      });
  };
  bind("btnGarage", renderGaragePanel);
  bind("btnAch", renderAchPanel);
  bind("btnSave", openSavePanel);
  const tabs = document.getElementById("modeTabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-mode]") : null;
      if (!el)
        return;
      initAudio();
      if (store.state === "menu")
        selectMode(el.dataset.mode);
    });
  }
  const panel = document.getElementById("modePanel");
  if (panel) {
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("change", onPanelChange);
    panel.addEventListener("keydown", onPanelKeydown);
  }
  const home = document.getElementById("homeView");
  if (home) {
    home.addEventListener("click", onPanelClick);
    home.addEventListener("keydown", onPanelKeydown);
  }
  uiHooks.onHome = () => {
    openBranch = -1;
    selectMode(lastTab);
  };
  uiHooks.onHome();
  refreshMenuButtons();
}
function selectMode(mode) {
  const m = mode === "race" || mode === "free" || mode === "space" ? mode : "level";
  for (const b of document.querySelectorAll("#modeTabs .mtab")) {
    const on = b.dataset.mode === m;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  }
  lastTab = m;
  if (m === "race") {
    if (homeView2)
      homeView2.style.display = "none";
    renderRacePanel(openBranch);
  } else if (m === "level") {
    hidePanel();
    if (homeView2)
      homeView2.style.display = "";
    renderHomeView("level");
  } else {
    if (homeView2)
      homeView2.style.display = "none";
    if (m === "space")
      renderSpacePanel();
    else
      renderFreePanel();
  }
}
function renderHomeView(mode) {
  const host = document.getElementById("homeView");
  if (!host)
    return;
  inHomeView = true;
  panelKind = mode === "race" ? "race" : "level";
  if (openBranch < 0 || !branchOpen(openBranch)) {
    const cur = currentBranch();
    openBranch = cur >= 0 ? cur : frontierBranch();
  }
  host.innerHTML = finaleTile() + (openBranch >= 0 ? levelBlock() : "") + `<div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>`;
}
function branchCleared(bi) {
  let n = 0;
  for (let k = 0;k < LEVELS_PER_BRANCH; k++)
    if ((store.stars[globalIndexOf(bi, k)] || 0) >= 1)
      n++;
  return n;
}
function currentBranch() {
  const gi = store.selLevel;
  if (!Number.isInteger(gi) || gi < 0 || gi >= LEVELS.length)
    return -1;
  const bi = branchOfGlobal(gi);
  return branchOpen(bi) ? bi : -1;
}
function frontierBranch() {
  for (let i = 0;i < N_BRANCHES; i++) {
    if (branchOpen(i) && branchCleared(i) < LEVELS_PER_BRANCH)
      return i;
  }
  const last = Math.floor(unlockFrontier() / LEVELS_PER_BRANCH);
  return Math.max(0, Math.min(N_BRANCHES - 1, last));
}
function finaleTile() {
  const done = clearedCount();
  const total = LEVELS.length;
  const unlocked = done >= total;
  const cleared = store.progress.finaleDone === true;
  const seg = Math.max(0, Math.min(FINALE_SEGS, store.progress.finaleSeg || 0));
  const segTxt = cleared ? "36/36 段 ✅" : seg > 0 ? `⏩ 从第 ${seg + 1} / ${FINALE_SEGS} 段继续` : `0 / ${FINALE_SEGS} 段`;
  return card({
    cls: "vehCard finaleTile",
    icon: unlocked ? "\uD83C\uDFAF" : "\uD83D\uDD12",
    title: FINALE.name,
    sub: `${Math.round(toM(FINALE.len))}m · 依次穿越 ${FINALE_SEGS} 个场景 · ${FINALE.gateN} 个计时门 · 坡度 ${Math.round(FINALE.maxSlope)}°`,
    meta: (cleared ? "✅ 已通关，可重复挑战" : unlocked ? "已解锁 · 点击开始" : `通关全部 ${total} 关后解锁`) + " · " + segTxt,
    body: progress(seg / FINALE_SEGS * 100, { label: "环大陆进度" }),
    right: unlocked ? "▶" : `${done}/${total}`,
    interactive: unlocked,
    locked: !unlocked,
    attrs: unlocked ? 'data-act="finaleStart"' : ""
  });
}
function onPanelKeydown(e) {
  if (e.code !== "Enter" && e.code !== "Space")
    return;
  const el = e.target && e.target.closest ? e.target.closest('[role="button"][data-act]') : null;
  if (!el)
    return;
  if (e.preventDefault)
    e.preventDefault();
  if (el.getAttribute && el.getAttribute("aria-disabled") === "true")
    return;
  if (el.classList && el.classList.contains("locked"))
    return;
  el.click();
}
function onPanelClick(e) {
  const el = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
  if (!el)
    return;
  const act = el.dataset.act;
  switch (act) {
    case "back":
      showMenu();
      return;
    case "branch": {
      const bi = +el.dataset.bi;
      if (!branchOpen(bi)) {
        showToast("\uD83D\uDD12 支线「" + BRANCHES[bi].name + "」尚未开放：请先推进前面的支线", 900);
        return;
      }
      openBranch = openBranch === bi ? -1 : bi;
      rerender();
      return;
    }
    case "branchClose":
      openBranch = -1;
      rerender();
      return;
    case "play":
      playCell(+el.dataset.gi);
      return;
    case "veh":
      buyOrSelectVeh(+el.dataset.veh);
      return;
    case "buyUltra":
      buyUltra(+el.dataset.veh);
      return;
    case "buyVeh":
      buyVehicleNow(+el.dataset.veh);
      return;
    case "finaleStart":
      api.startGame("level", FINALE_INDEX);
      return;
    case "ranked":
      store.raceRanked = el.dataset.adv === "1";
      renderRacePanel(openBranch);
      return;
    case "raceFmt": {
      const id = el.dataset.fmt;
      if (RACE_FORMATS[id]) {
        store.raceFormatPick = id;
        renderRacePanel(openBranch);
      }
      return;
    }
    case "freeRandom":
      api.startGame("free");
      return;
    case "free":
      api.startGame("free", undefined, { theme: +el.dataset.theme });
      return;
    case "spaceLeague":
      openSpaceLeague = openSpaceLeague === +el.dataset.league ? -1 : +el.dataset.league;
      renderSpacePanel();
      return;
    case "spaceStart":
      openSpaceLeague = +el.dataset.league;
      api.startGame("space", undefined, {
        league: +el.dataset.league,
        div: +el.dataset.div,
        race: +el.dataset.race
      });
      return;
    case "spaceClaim":
      if (claimSpaceQuest()) {
        showToast("\uD83D\uDEF0️ 已获得「星环」！宇宙联赛向你开放", 2000, "success");
        renderSpacePanel();
      } else {
        showToast("金币任务还没完成", 1200);
      }
      return;
    case "quality":
      setQuality(el.dataset.q);
      renderSavePanel();
      showToast("\uD83C\uDF9A 画质已切到「" + QUALITY_LABEL[getQuality()] + "」", 800);
      return;
    case "scale":
      setRenderScalePersisted(el.dataset.s);
      renderSavePanel();
      showToast("\uD83D\uDD0D 锐度已切到「" + RENDER_SCALE_LABEL[getRenderScale()] + "」", 800);
      return;
    case "export":
      doExport();
      return;
    case "importPick":
      pickSaveFile();
      return;
    case "importConfirm":
      doImport();
      return;
    case "importCancel":
      saveView.pending = null;
      saveView.summary = null;
      renderSavePanel();
      return;
    case "resetAsk":
      saveView.confirmReset = true;
      renderSavePanel();
      return;
    case "resetCancel":
      saveView.confirmReset = false;
      renderSavePanel();
      return;
    case "resetConfirm":
      doReset();
      return;
    case "slotSwitch":
      doSwitchSlot(+el.dataset.slot);
      return;
    case "slotNew":
      doNewSlot();
      return;
    case "slotDelete":
      doDeleteSlot(+el.dataset.slot);
      return;
    default:
      return;
  }
}
function onPanelChange(e) {
  const input = e.target;
  if (!input || input.id !== "saveFile")
    return;
  const f = input.files && input.files[0];
  if (f)
    readSaveFile(f);
}
function rerender() {
  if (inHomeView)
    renderHomeView(panelKind === "race" ? "race" : "level");
  else if (panelKind === "race")
    renderRacePanel(openBranch);
  else
    renderLevelsPanel(openBranch);
}
function unlockFrontier() {
  let hi = -1;
  for (let i = 0;i < LEVELS.length; i++)
    if ((store.stars[i] || 0) > 0)
      hi = i;
  return Math.max(store.unlocked || 0, hi + 1);
}
function branchOpen(bi) {
  return bi >= 0 && bi < N_BRANCHES && bi * LEVELS_PER_BRANCH <= unlockFrontier();
}
function levelUnlocked(bi, k) {
  if (!branchOpen(bi))
    return false;
  for (let j = 0;j < k; j++) {
    if (!((store.stars[globalIndexOf(bi, j)] || 0) >= 1))
      return false;
  }
  return true;
}
function firstLockedK(bi) {
  for (let j = 0;j < LEVELS_PER_BRANCH; j++) {
    if (!((store.stars[globalIndexOf(bi, j)] || 0) >= 1))
      return j;
  }
  return LEVELS_PER_BRANCH - 1;
}
function fmtClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? m + ":" + String(s % 60).padStart(2, "0") : s + "s";
}
function fmtKm(m) {
  const km = (Number(m) || 0) / 1000;
  return (km >= 100 ? km.toFixed(0) : km.toFixed(2)) + " km";
}
function fmtHours(sec) {
  const h = (Number(sec) || 0) / 3600;
  return (h >= 10 ? h.toFixed(1) : h.toFixed(2)) + " h";
}
function fmtDate(iso) {
  if (!iso)
    return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime()))
    return "—";
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function branchCard(bi) {
  const b = BRANCHES[bi];
  const th = THEMES[b.theme] || THEMES[0];
  const open = branchOpen(bi);
  let stars2 = 0;
  for (let k = 0;k < LEVELS_PER_BRANCH; k++)
    stars2 += store.stars[globalIndexOf(bi, k)] || 0;
  const cleared = branchCleared(bi);
  const done = cleared >= LEVELS_PER_BRANCH;
  const nextK = firstLockedK(bi);
  const front = open && !done && nextK < LEVELS_PER_BRANCH;
  return card({
    cls: "branchCard" + (front ? " frontier" : ""),
    icon: `<div class="brThumb"></div>`,
    title: `${open ? "" : "\uD83D\uDD12 "}${b.name}`,
    sub: front ? `▶ 继续 第 ${nextK + 1} 关 · 场景「${th.name}」` : `场景「${th.name}」 · ${b.desc}`,
    meta: chip(`★ ${stars2}/${LEVELS_PER_BRANCH * 3}`, "gold") + (done ? " " + badge("已通关", "success") : ""),
    right: `<div class="brDone">${cleared}/${LEVELS_PER_BRANCH}${done ? "<br>✅" : ""}</div>`,
    interactive: true,
    selected: openBranch === bi,
    locked: !open,
    styleVars: themeVars(th),
    attrs: `data-act="branch" data-bi="${bi}"`
  });
}
function levelCell(bi, k) {
  const gi = globalIndexOf(bi, k);
  const L = branchLevel(bi, k);
  const v = VARIANT_INFO[L.variant] || VARIANT_INFO.normal;
  const locked = !levelUnlocked(bi, k);
  const st = store.stars[gi] || 0;
  const isNext = !locked && st === 0;
  const isCur = store.selLevel === gi;
  const stars2 = locked ? "\uD83D\uDD12 未解锁" : st > 0 ? "★".repeat(st) + "☆".repeat(3 - st) : "☆☆☆";
  const label = `${BRANCHES[bi].name} 第${k + 1}关 ${v.name} 坡度${Math.round(L.maxSlope)}度 三星时限${Math.round(starTime(L))}秒 ${locked ? "未解锁" : st + "星"}${isCur ? "，当前关卡" : isNext ? "，下一关" : ""}`;
  const cls = locked ? " locked" : isCur ? " cur" : st > 0 ? " done" : " next";
  const head = isCur ? '<span class="lvNext">\uD83D\uDCCD 当前关卡</span>' : isNext ? '<span class="lvNext">▶ 下一关</span>' : "第" + (k + 1) + "关";
  return `<div class="lvCell${cls}" data-act="play" data-gi="${gi}"
      role="button" tabindex="0" aria-label="${label}">
    <div>${head}</div>
    <div class="thm">${badge(v.icon + " " + v.name, "variant")}</div>
    <div class="thm">坡度 ${Math.round(L.maxSlope)}° · ${Math.round(toM(L.len))}m</div>
    <div class="thm">三星 ≤ ${fmtClock(starTime(L))}</div>
    <div class="stars">${stars2}</div>
    ${levelRecHtml(gi, L)}
  </div>`;
}
function levelRecHtml(gi, L) {
  const r = (store.levelRecords || {})[gi];
  if (!r || !r.tries)
    return "";
  const bits = ["试过 " + r.tries + " 次"];
  if (r.bestMs > 0)
    bits.push("最佳 " + (r.bestMs / 1000).toFixed(1) + "s");
  if (r.bestCoins > 0)
    bits.push("金币 " + r.bestCoins + "/" + L.coinN);
  if (r.lastAt)
    bits.push("上次 " + fmtDate(r.lastAt).slice(5, 16));
  return '<div class="lvRec">\uD83D\uDCCB ' + bits.join(" · ") + "</div>";
}
function levelBlock(withClose) {
  const b = BRANCHES[openBranch];
  const th = THEMES[b.theme] || THEMES[0];
  const cells = Array.from({ length: LEVELS_PER_BRANCH }, (_, k) => levelCell(openBranch, k)).join("");
  const note = withClose ? `${b.desc} · ${VARIANT_INFO.normal.icon} 常规关为 \uD83D\uDEA9；第 3、5 关为特殊变体` : b.desc;
  return `<div class="branchLevels">
    <div class="brHead">${b.name} · 场景「${th.name}」 · 6 关</div>
    <div class="lvGrid">${cells}</div>
    <div class="panelNote">${note}</div>
    ${withClose ? '<button class="btn sm ghost" data-act="branchClose">收起</button>' : ""}
  </div>`;
}
function renderLevelsPanel(openBi) {
  panelKind = "level";
  inHomeView = false;
  openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
  showPanel(`<div class="modeTitle">\uD83C\uDFC1 闯关模式 · 支线任务</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock(true) : ""}
  <div class="panelNote">星级：通关 1★ · 金币 70% 以上 2★ · 快速通关 3★ ｜ 支线内链式解锁，支线之间可并行推进</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}
function rankTierCard(advanced, label, desc, note, ok) {
  return card({
    cls: "vehCard",
    icon: store.raceRanked === advanced ? "◉" : "○",
    title: label + (store.raceRanked === advanced ? " · 已选" : ""),
    sub: desc,
    meta: note,
    interactive: ok,
    locked: !ok,
    selected: store.raceRanked === advanced,
    attrs: ok ? `data-act="ranked" data-adv="${advanced ? 1 : 0}"` : ""
  });
}
function renderRacePanel(openBi) {
  panelKind = "race";
  inHomeView = false;
  openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
  const cur = raceFormatPick();
  const P = store.progress;
  const rating = P.rating || 0;
  const invited = P.invited === true;
  const adv = isAdvancedUnlocked(rating);
  const curR = RANKS[rankIndexOf(rating)] || RANKS[0];
  const next = rankNextOf(rating);
  const curIdx = rankIndexOf(rating);
  const pct = next ? Math.max(0, Math.min(100, (rating - curR.min) / Math.max(1, next.min - curR.min) * 100)) : 100;
  const starOf = (r, i) => rating < r.min ? 0 : i < curIdx ? 3 : rankStars(rating);
  const hi = pct.toFixed(1);
  showPanel(`<div class="modeTitle">\uD83C\uDFC6 比赛 · 3 种赛制 × 2 个档位</div>
  <div class="brHead">① 选赛制</div>
  <div class="fmtRow">${RACE_FORMAT_IDS.map((id) => {
    const f = RACE_FORMATS[id];
    const on = id === cur;
    return `<button class="fmtBtn${on ? " on" : ""}" data-act="raceFmt" data-fmt="${id}"
      aria-pressed="${on}" title="${f.desc}">
      <span class="fmtIcon">${f.icon}</span><span class="fmtName">${f.name}</span>
      <span class="fmtDesc">${f.desc}</span>
      <span class="fmtGold">名次奖金 ${RACE_PLACE_GOLD[0]} / ${RACE_PLACE_GOLD[1]} / …</span>
    </button>`;
  }).join("")}</div>

  <div class="brHead">② 选档位 · 排位档会结算段位分，普通档只发名次奖金</div>
  <div class="rankBox">
    <div class="rankScore">${rating}</div>
    <div class="rankSub">${rankName(rating)}
      <span class="rankStars" aria-label="本段星数 ${rankStars(rating)} / 3">${"★".repeat(rankStars(rating))}<span class="dim">${"☆".repeat(3 - rankStars(rating))}</span></span>
      · 战绩 ${P.wins} 胜 ${P.losses} 负</div>
    <div class="rankBar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"
         aria-label="${rankName(rating)} 段内进度"><i style="width:${hi}%"></i></div>
    <div class="rankSub">${next ? `下一段「${next.name}」还差 <b>${next.min - rating}</b> 分 · 升段奖励 \uD83E\uDE99 ${goldNum(next.reward)}` : `段位表已刷满 · 累计升段奖励 \uD83E\uDE99 ${goldNum(RANKS.reduce((a, r) => a + r.reward, 0))}`}</div>
  </div>
  ${rankTierCard(false, "普通比赛", "AI 配速固定在三��节奏的 0.68 倍，带追赶修正 —— 输赢不影响段位分", `名次奖金 ${RACE_PLACE_GOLD[0]} → ${RACE_PLACE_GOLD[RACE_PLACE_GOLD.length - 1]} \uD83E\uDE99 · 段位分不变`, true)}
  ${rankTierCard(true, "排位比赛", `AI 配速随段位分提升（三星节奏的 ${paceRange(false)}）${adv ? ` · 高级排位可到 ${paceRange(true)}` : ""}`, !invited ? "\uD83D\uDD12 通关「最终任务」后解锁" : `胜 +${rankDelta(rating, false, true)} / 负 -${RATING_LOSS} 段位分` + (adv ? " · 已解锁高级排位" : ` · 段位分 ≥ ${RATING_ADVANCED} 开高级排位`), invited)}
  <details class="rankLadder"><summary>段位阶梯（${RANKS.length} 段 × 3 星）</summary>
    <ol class="rankList">${RANKS.map((r, i) => {
    const got = starOf(r, i);
    return `<li class="${rating >= r.min ? "on" : ""}${i === curIdx ? " cur" : ""}">
        <span class="rkMin">${r.min}</span>
        <span class="rkName">${r.name}</span>
        <span class="rkStar" aria-label="${got} 星">${i === 0 ? "" : "★".repeat(got) + "☆".repeat(3 - got)}</span>
        <span class="rkRew">${r.reward ? "\uD83E\uDE99 " + goldNum(r.reward) : "—"}</span>
      </li>`;
  }).join("")}</ol>
    <div class="panelNote">升段奖励只在首次跨过该段门槛时发一次（掉段再升回来不补发）；
      ★ 进段 · ★★ 段内过半 · ★★★ 段内 85%</div>
  </details>

  <div class="brHead">③ 选赛道</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock(true) : ""}
  <div class="panelNote">按名次发奖（第 1 名 ${RACE_PLACE_GOLD[0]} \uD83E\uDE99，完赛即有）· 赛道需已解锁</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}
function playCell(gi) {
  const { bi, k } = branchProgress(gi);
  if (!levelUnlocked(bi, k)) {
    if (!branchOpen(bi)) {
      showToast("\uD83D\uDD12 支线「" + BRANCHES[bi].name + "」尚未开放", 900);
    } else {
      const need = firstLockedK(bi);
      showToast("\uD83D\uDD12 先通关「" + branchLevel(bi, need).name + "」解锁", 900);
    }
    return;
  }
  if (panelKind === "race")
    api.startGame("race", gi, { format: raceFormatPick(), ranked: store.raceRanked });
  else
    api.startGame("level", gi);
}
function paceRange(advanced) {
  const lo = rankedAIScale(0, advanced).toFixed(2);
  const hi = rankedAIScale(RATING_TOP, advanced).toFixed(2);
  return `${lo}× → ${hi}×`;
}
function renderFreePanel() {
  panelKind = "free";
  inHomeView = false;
  const peak = store.progress.peak === true;
  const themes = peak ? availableFreeThemes(store.stars) : [];
  showPanel(`<div class="modeTitle">♾️ 无限模式</div>
  ${card({
    cls: "vehCard",
    icon: "\uD83C\uDFB2",
    title: "随机地形",
    sub: "随里程缓慢加难，无终点；燃料耗尽即结算",
    meta: "个人最佳 " + store.best + " m",
    interactive: true,
    attrs: 'data-act="freeRandom"'
  })}
  ${peak ? "" : `<div class="panelNote">登顶（段位分 ≥ ${RATING_PEAK}）后可自选已通关场景</div>`}
  ${peak ? themes.length ? `<div class="brHead">已通关场景 · 自选</div>
       <div class="branchWall">${themes.map((t) => {
    const th = THEMES[t] || THEMES[0];
    const b = BRANCHES[t];
    return card({
      cls: "branchCard",
      icon: "\uD83D\uDDFA",
      title: th.name,
      sub: b ? b.name + " · " + b.desc : "",
      interactive: true,
      styleVars: themeVars(th),
      attrs: `data-act="free" data-theme="${t}"`
    });
  }).join("")}</div>` : emptyState("还没有已通关的场景：把任一支线的 6 关全部通关即可解锁对应场景") : ""}
  <button class="btn backBtn" data-act="back">返回</button>`);
}
function abbrevLen(px) {
  const km = px / 1e5;
  if (km < 1000)
    return Math.round(km) + " km";
  if (km < 1e6)
    return Math.round(km / 1e4) + " 万 km";
  return abbrevNum(km) + " km";
}
function renderSpacePanel() {
  panelKind = "space";
  inHomeView = false;
  const q = spaceQuestState();
  const pending = store.pendingSpace;
  store.pendingSpace = false;
  if (!rankedCleared()) {
    showPanel(`<div class="modeTitle">\uD83C\uDF0C 宇宙场</div>
      ${card({
      cls: "vehCard",
      icon: "\uD83D\uDD12",
      title: "先赢下一场排位赛",
      sub: "宇宙场是 5 个难度分级的长程竞速，需要你先熟悉竞速玩法",
      meta: `排位战绩 ${store.progress.wins} 胜 ${store.progress.losses} 负`,
      locked: true,
      interactive: false
    })}
      <div class="panelNote">通关「最终任务」后解锁排位赛 → 赢一场即可开启宇宙场。</div>
      <button class="btn backBtn" data-act="back">返回</button>`);
    return;
  }
  if (q.hasQuest) {
    showPanel(`<div class="modeTitle">\uD83C\uDF0C 宇宙场 · 金币任务</div>
      ${pending ? `<div class="panelNote">完成下面的任务即可获得基础宇宙车「星环」</div>` : ""}
      ${card({
      cls: "vehCard",
      icon: "☄️",
      title: "通关主线 " + q.need + " 关",
      sub: "完成后可获得基础宇宙车「星环」（极速 28,440 km/h）",
      meta: `进度 ${q.got} / ${q.need} 关（${Math.round(q.progress * 100)}%）`,
      body: progress(q.progress * 100, { label: "金币任务" }),
      interactive: q.got >= q.need,
      locked: q.got < q.need,
      attrs: q.got >= q.need ? 'data-act="spaceClaim"' : ""
    })}
      ${q.got < q.need ? `<div class="panelNote">任意一次**首次通关**都算数；重玩已通关的关卡不再重复计数。${pending ? "点击下方返回可稍后再来。" : ""}</div>` : `<div class="panelNote">✅ 条件已达成，点击上方卡片领取「星环」</div>`}
      <button class="btn backBtn" data-act="back">返回</button>`);
    return;
  }
  const cur = VEHICLES[store.currentVehicle];
  const topPx = store.phys.topSpeed > 1 ? store.phys.topSpeed : 100;
  const rating = Math.max(0, store.space.rating || 0);
  const openLeague = openSpaceLeague;
  showPanel(`<div class="modeTitle">\uD83C\uDF0C 宇宙联赛</div>
    <div class="panelNote">${SPACE_LEAGUES.length} 个联赛 × 3 个分区 × 3 场赛事。<b>分区按联赛段位分解锁</b>，
      不按车 —— 买不起新车只是暂时跑不快，不会把整块玩法锁死在门外。
      对手配速是该联赛的<b>固定值</b>（不跟着你的车速变），赛道长度由配速 × 时长决定，
      所以任何车跑任何一场都是 <b>30~122 秒</b>。</div>
    <div class="rankBox">
      <div class="rankScore">${rating}</div>
      <div class="rankSub">宇宙联赛段位分 · 已解锁分区
        ${SPACE_DIVS.map((d) => `${d.name}${spaceDivOpen(0, SPACE_DIVS.indexOf(d), rating) ? "" : "\uD83D\uDD12"}`).join(" ")}
        （分区需求按联赛递增）</div>
    </div>
    <div class="brHead">联赛 · 选一个展开分区</div>
    <div class="branchWall">${SPACE_LEAGUES.map((L, li) => {
    const ref = spaceAIScale(li, 0) / (SPACE_DIVS[0].aiK || 1);
    const rec = leagueRecord(li);
    return card({
      cls: "branchCard" + (openLeague === li ? " frontier" : ""),
      icon: L.icon,
      title: `联赛 ${li + 1} · ${L.name}`,
      sub: `参考配速 ${abbrevNum(Math.round(toKmh(ref)))} km/h · ${L.segs} 段地形 · 坡度 ${L.slopeDeg}°` + (best ? ` · 已打过 ${best} 场` : ""),
      meta: best ? `最高分区 ${best}` : `起步分区 甲（段位分 ${spaceDivRatingNeed(li, 0)}）`,
      right: openLeague === li ? "▾" : "▸",
      interactive: true,
      selected: openLeague === li,
      styleVars: spaceThemeVars(L),
      attrs: `data-act="spaceLeague" data-league="${li}"`
    });
  }).join("")}</div>
    ${openLeague >= 0 ? spaceDivisionsHtml(openLeague, rating, topPx) : ""}
    <div class="panelNote">当前车辆：${cur ? cur.name : "—"} · 形态极速
      <b>${abbrevNum(Math.round(toKmh(topPx)))} km/h</b>。对面配速高于这个数就是跑不赢，
      面板会在每一场赛事上直接标出来。</div>
    <button class="btn backBtn" data-act="back">返回</button>`);
}
function spaceThemeVars(L) {
  const th = THEMES[L.themes[0]] || THEMES[0];
  return themeVars(th);
}
function leagueRecord(li) {
  const recs = store.space.records || {};
  const tag = SPACE_LEAGUES[li].id + "-";
  let runs = 0;
  let wins = 0;
  let top = "";
  for (const k in recs) {
    if (k.indexOf(tag) !== 0)
      continue;
    runs += recs[k].runs;
    wins += recs[k].wins;
    if (!top || SPACE_DIVS.findIndex((d) => d.id === k.split("-")[1]) > SPACE_DIVS.findIndex((d) => d.id === top))
      top = k.split("-")[1];
  }
  return { runs, wins, top };
}
function spaceRaceCell(li, di, ri, topPx) {
  const def = spaceRaceDef(li, di, ri);
  const fmt = RACE_FORMATS[def.fmt] || RACE_FORMATS.duel;
  const total = fmt.team ? 2 : fmt.riders + 1;
  const winnable = topPx >= def.ai;
  const rec = (store.space.records || {})[def.key];
  const aiKmh = abbrevNum(Math.round(toKmh(def.ai)));
  const label = def.name + "，" + fmt.name + "，" + abbrevLen(def.len) + "，" + def.dur + " 秒，" + "对手配速 " + aiKmh + " 千米每小时，奖金 " + goldNum(def.gold) + " 金币，" + (winnable ? "你的极速足够跑赢" : "当前极速跑不赢") + (rec ? "，最好第 " + rec.best + " 名，打过 " + rec.runs + " 场" : "");
  const verdict = winnable ? '<span style="color:var(--success)">✔ 你的极速足够</span>' : '<span style="color:var(--danger)">⚠ 配速高于你的极速</span>';
  const stars2 = rec ? '<div class="stars">最好第 ' + rec.best + " / " + total + " 名</div>" : "";
  return '<div class="lvCell' + (winnable ? " next" : " locked") + '" data-act="spaceStart"' + ' role="button" tabindex="0" data-league="' + li + '" data-div="' + di + '" data-race="' + ri + '"' + ' aria-label="' + label + '">' + "<div>" + SPACE_RACES[ri].icon + " " + SPACE_RACES[ri].name + "</div>" + '<div class="thm">' + badge(fmt.name, "variant") + "</div>" + '<div class="thm">' + abbrevLen(def.len) + " · " + def.dur + "s</div>" + '<div class="thm">\uD83E\uDE99 ' + goldNum(def.gold) + "</div>" + '<div class="thm">' + verdict + "</div>" + stars2 + "</div>";
}
function spaceDivisionsHtml(li, rating, topPx) {
  const L = SPACE_LEAGUES[li];
  const head = '<div class="branchLevels"><div class="brHead">' + L.name + " · 3 个分区</div>";
  const body = SPACE_DIVS.map((d, di) => {
    const open = spaceDivOpen(li, di, rating);
    const need = spaceDivRatingNeed(li, di);
    const pace = abbrevNum(Math.round(toKmh(spaceAIScale(li, di))));
    const title = (open ? "" : "\uD83D\uDD12 ") + d.name + "区 · 对手配速 " + pace + " km/h · 单场 " + spaceDurOf(di, 1) + " 秒" + (open ? "" : "（需联赛段位分 " + need + "，当前 " + rating + "）");
    if (!open)
      return '<div class="brHead">' + title + "</div>";
    const cells = SPACE_RACES.map((r, ri) => spaceRaceCell(li, di, ri, topPx)).join("");
    return '<div class="brHead">' + title + '</div><div class="lvGrid">' + cells + "</div>";
  }).join("");
  const note = '<div class="panelNote">甲区对手 60% 参考配速、乙区 74%、丙区 86% —— 全都低于 1，' + "所以只要你的形态极速达到该区配速就一定跑得过。差的那部分只能靠升级补。</div></div>";
  return head + body + note;
}
var MAXED_OF = (veh) => {
  const m = maxLvOf(veh);
  return { engine: m, tire: m, frame: m, susp: m };
};
var BY_PRICE = VEHICLES.map((v, i) => ({ v, i })).sort((a, b) => a.v.price - b.v.price || a.i - b.i);
function vehStatGrid(v) {
  const cell = (k, val, hi) => `<div class="vsCell${hi ? " hi" : ""}"><span>${k}</span><b>${val}</b></div>`;
  return `<div class="vsGrid">
    ${cell("极速", Math.round(toKmh(topSpeedOf(v, MAXED_OF(v)))) + " <i>km/h</i>", true)}
    ${cell("抓地", Math.round(v.grip * 100) + "%")}
    ${cell("驱动", Math.round(v.phys.torque * 100) + "%")}
    ${cell("油箱", Math.round(v.fuel * 100) + "%")}
    ${cell("重量", Math.round(v.weight * 100) + "%")}
    ${cell("旋转", Math.round(v.airRot * 100) + "%")}
  </div>`;
}
var TIER_CLS = {
  普通: "tier0",
  稀有: "tier1",
  史诗: "tier2",
  传说: "tier3",
  神话: "tier4",
  宇宙: "tier5"
};
function renderGaragePanel() {
  panelKind = "garage";
  inHomeView = false;
  const groups = [];
  for (const { v, i } of BY_PRICE) {
    let g = groups.find((x) => x.tier === v.tier);
    if (!g) {
      g = { tier: v.tier, items: [] };
      groups.push(g);
    }
    g.items.push({ v, i });
  }
  showPanel(`<div class="modeTitle">\uD83C\uDFCD️ 车库 · ${VEHICLES.length} 辆</div>
  ${groups.map((g) => {
    const prices = g.items.map((x) => x.v.price).filter((p) => p > 0);
    const lo = prices.length ? Math.min(...prices) : 0;
    const hi = prices.length ? Math.max(...prices) : 0;
    const owned = g.items.filter((x) => store.ownedVehicles.includes(x.i)).length;
    const range = lo === hi ? goldNum(lo) : goldNum(lo) + " → " + goldNum(hi);
    return `<section class="vehGroup">
      <h3 class="vehGroupHead ${TIER_CLS[g.tier] || ""}">
        <b>${g.tier}</b>
        <span class="vehGroupMeta">${g.items.length} 辆 · 已拥有 ${owned}/${g.items.length} · \uD83E\uDE99 ${range}</span>
      </h3>
      ${g.items.map(({ v, i }) => {
      const own = store.ownedVehicles.includes(i);
      const sel = i === store.currentVehicle;
      return card({
        cls: "vehCard" + (sel ? " isSel" : ""),
        icon: v.icon,
        title: v.name + `<span class="vehTier ${TIER_CLS[v.tier] || ""}">${v.tier}</span>`,
        sub: v.desc,
        body: vehStatGrid(v),
        right: sel ? "✅<br>使用中" : own ? "已<br>拥有" : "\uD83E\uDE99<br>" + goldNum(v.price),
        interactive: true,
        selected: sel,
        attrs: `data-act="veh" data-veh="${i}"`
      }) + ownDetail(v.id) + (own ? "" : buyBlock(v, i)) + (v.ultra ? ultraBlock(v, i) : "");
    }).join("")}
    </section>`;
  }).join("")}
  <div class="panelNote" id="pnNote"></div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}
function ownDetail(id) {
  const m = store.garageMeta[id];
  if (!m)
    return "";
  const parts = [];
  if (!m.runs)
    return "";
  return `<div class="ultraRow">\uD83D\uDCCB 骑过 ${m.runs} 局 · 累计 ${fmtKm(m.odometerM)}</div>`;
}
function buyBlock(v, i) {
  const lack = Math.max(0, v.price - store.gold);
  const afford = lack === 0;
  return `<div class="buyRow">
    <button class="btn buyNow${afford ? "" : " ghost"}" data-act="buyVeh" data-veh="${i}"
      ${afford ? "" : 'aria-disabled="true"'}>
      \uD83E\uDE99 立即购买并使用 · ${goldNum(v.price)}
    </button>
    <div class="buyHint">${afford ? "点击即可购买并切换到这台车" : "还差 " + goldNum(lack) + " 金币"}</div>
  </div>`;
}
function buyVehicleNow(i) {
  const note = () => document.getElementById("pnNote");
  const v = VEHICLES[i];
  if (store.ownedVehicles.includes(i)) {
    store.currentVehicle = i;
    save();
    renderGaragePanel();
    const n = note();
    if (n)
      n.textContent = "已切换到 " + v.name;
    api.applyVehicle();
    return;
  }
  const lack = Math.max(0, v.price - store.gold);
  if (lack > 0) {
    const n = note();
    if (n)
      n.textContent = "金币不足，还差 " + goldNum(lack) + " \uD83E\uDE99（需要 " + goldNum(v.price) + "）";
    showToast("\uD83E\uDE99 还差 " + goldNum(lack) + " 金币", 1100);
    return;
  }
  store.gold -= v.price;
  store.ownedVehicles.push(i);
  store.currentVehicle = i;
  save();
  renderGaragePanel();
  const n = note();
  if (n)
    n.textContent = "\uD83C\uDF89 购买并切换到 " + v.name;
  api.applyVehicle();
  showToast("\uD83C\uDF89 已购买 " + v.name + "！", 1200);
  playCoinSound();
}
function fxLine(v) {
  return v.ultra && v.ultra.fxText ? ` <b class="ultraFx">${v.ultra.fxText}</b>` : "";
}
function allMaxed(id) {
  const u = store.upgrades[id];
  if (!u)
    return false;
  const m = maxLvOf(VEHICLES.find((v) => v.id === id));
  return u.engine >= m && u.tire >= m && u.frame >= m && u.susp >= m;
}
function ultraBlock(v, i) {
  if (store.ultra[v.id] === true) {
    return `<div class="ultraRow got">${v.ultra.icon} 特殊模式「${v.ultra.name}」已开启 · ${v.ultra.desc}</div>`;
  }
  if (!allMaxed(v.id)) {
    return `<div class="ultraRow lock">\uD83D\uDD12 ${v.ultra.icon} ${v.ultra.name}：${v.ultra.desc}${fxLine(v)}（全部升级满级 Lv${maxLvOf(v)} 后解锁）</div>`;
  }
  return `<div class="ultraRow buy">
    <button class="btn sm" data-act="buyUltra" data-veh="${i}">${v.ultra.icon} 解锁「${v.ultra.name}」 · ${goldNum(v.ultra.cost)} \uD83E\uDE99</button>
    <div class="ultraDesc">${v.ultra.desc}${fxLine(v)}</div>
  </div>`;
}
function buyUltra(i) {
  const v = VEHICLES[i];
  if (!allMaxed(v.id)) {
    showToast("\uD83D\uDD12 先把这辆车的全部升级升到满级", 900);
    return;
  }
  if (store.ultra[v.id] === true) {
    showToast("\uD83C\uDFC6 已拥有该特殊模式", 700);
    return;
  }
  if (store.gold < v.ultra.cost) {
    showToast("\uD83E\uDE99 金币不足，需要 " + goldNum(v.ultra.cost), 900);
    return;
  }
  store.gold -= v.ultra.cost;
  store.ultra[v.id] = true;
  save();
  if (store.currentVehicle === i && api.applyVehicle)
    api.applyVehicle();
  renderGaragePanel();
  showToast("\uD83D\uDE80 已解锁「" + v.ultra.name + "」！", 1200);
}
function buyOrSelectVeh(i) {
  const note = () => document.getElementById("pnNote");
  if (store.ownedVehicles.includes(i)) {
    store.currentVehicle = i;
    save();
    renderGaragePanel();
    const n = note();
    if (n)
      n.textContent = "已切换到 " + VEHICLES[i].name;
    api.applyVehicle();
  } else {
    const v = VEHICLES[i];
    if (store.gold >= v.price) {
      store.gold -= v.price;
      store.ownedVehicles.push(i);
      store.currentVehicle = i;
      save();
      renderGaragePanel();
      const n = note();
      if (n)
        n.textContent = "\uD83C\uDF89 购买并切换到 " + v.name;
      api.applyVehicle();
    } else {
      const n = note();
      if (n)
        n.textContent = "金币不足，需要 " + v.price + " \uD83E\uDE99";
    }
  }
}
function renderAchPanel() {
  panelKind = "ach";
  inHomeView = false;
  showPanel(`<div class="modeTitle">\uD83C\uDFC5 成就 · 已达成 ${store.achGot.length}/${ACHS.length}</div>
  <div class="achList">${ACHS.map((a) => {
    const got = hasAch(a.id);
    return `<div class="achItm ${got ? "got" : ""}">
      <div class="achIcon">${got ? a.icon : "\uD83D\uDD12"}</div>
      <div class="cardBody"><div class="achName">${got ? a.name : "？？？"}</div><div class="achDesc">${a.desc}</div></div>
      <div class="cardRight">${badge(got ? "已达成" : "未达成", got ? "success" : "lock")}</div>
    </div>`;
  }).join("")}</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}
function openSavePanel() {
  panelKind = "save";
  inHomeView = false;
  saveView.pending = null;
  saveView.summary = null;
  saveView.error = "";
  saveView.note = "";
  saveView.confirmReset = false;
  renderSavePanel();
}
function currentSummary() {
  let cleared = 0;
  let stars2 = 0;
  for (let i = 0;i < LEVELS.length; i++) {
    const s = store.stars[i] || 0;
    if (s > 0) {
      cleared++;
      stars2 += s;
    }
  }
  return {
    cleared,
    stars: stars2,
    rating: store.progress.rating || 0,
    spaceRating: store.space.rating || 0,
    vehicles: (store.ownedVehicles || []).length,
    createdAt: store.createdAt || "",
    gold: store.gold || 0
  };
}
function dossierHtml() {
  const F = store.space.free || {};
  const lv = store.levelRecords || {};
  const race = store.raceRecords || {};
  const sp = store.space.records || {};
  let bestLv = null;
  let fastest = 0;
  let fewest = Infinity;
  for (let gi = 0;gi < LEVELS.length; gi++) {
    const r = lv[gi];
    if (!r || !r.tries)
      continue;
    if (r.bestMs > 0 && (fastest === 0 || r.bestMs < fastest)) {
      fastest = r.bestMs;
      bestLv = gi;
    }
    if (r.tries < fewest)
      fewest = r.tries;
  }
  const lvDone = Object.keys(lv).filter((k) => lv[k].bestMs > 0).length;
  const raceRows = Object.keys(race).map((k) => {
    const r = race[k];
    const [f, t] = k.split("-");
    const fName = (RACE_FORMATS[RACE_FORMAT_IDS[+f]] || {}).name || "赛制 " + f;
    return [
      fName + (t === "1" ? " · 排位" : ""),
      r.runs + " 局",
      r.best ? "最好第 " + r.best + " 名" : "未进过前三",
      r.wins + " 胜",
      r.lastAt ? fmtDate(r.lastAt).slice(5, 16) : "—"
    ];
  });
  const spaceRows = Object.keys(sp).slice(0, 6).map((k) => {
    const r = sp[k];
    const parts = k.split("-");
    const L = SPACE_LEAGUES.find((x) => x.id === parts[0]);
    const D = SPACE_DIVS.find((x) => x.id === parts[1]);
    const Ra = SPACE_RACES[+parts[2]];
    return [
      (L ? L.name : parts[0]) + " " + (D ? D.name : "") + "区 · " + (Ra ? Ra.name : ""),
      r.runs + " 局",
      r.best ? "最好第 " + r.best + " 名" : "—",
      r.wins + " 胜",
      r.lastAt ? fmtDate(r.lastAt).slice(5, 16) : "—"
    ];
  });
  const rows = [];
  rows.push([
    "∞ 无限模式",
    F.runs + " 局",
    F.bestMeters ? "最佳 " + fmtKm(F.bestMeters) : "尚无纪录",
    "累计 " + fmtKm(F.totalMeters),
    F.bestAt ? fmtDate(F.bestAt).slice(0, 10) : "—"
  ]);
  if (bestLv !== null) {
    rows.push([
      "⛳ 关卡最快三星",
      LEVELS[bestLv].name,
      (fastest / 1000).toFixed(1) + " 秒",
      "全 " + lvDone + " 关有记录",
      "—"
    ]);
  }
  rows.forEach((r) => raceRows.push(r));
  spaceRows.forEach((r) => rows.push(r));
  if (rows.length <= 1) {
    return '<div class="brHead">\uD83D\uDDC2 详细档案</div>' + '<div class="panelNote">还没有成绩记录 —— 跑一局闯关或无限模式，这里就会记下用时、里程与名次。</div>';
  }
  return '<div class="brHead">\uD83D\uDDC2 详细档案 · 成绩明细</div>' + '<table class="dossier"><thead><tr><th>项目</th><th>次数</th><th>最佳</th><th>补充</th><th>时间</th></tr></thead><tbody>' + rows.map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
}
var MODE_LABEL = { level: "闯关", race: "比赛", ranked: "排位", space: "宇宙联赛", free: "无限" };
function modeStatHtml(st) {
  const by = st.byMode || {};
  const keys = Object.keys(MODE_LABEL).filter((k) => by[k] && by[k].runs);
  if (!keys.length)
    return "";
  return '<div class="brHead">\uD83E\uDDED 分模式统计</div>' + statRow(keys.map((k) => ({
    label: MODE_LABEL[k],
    value: by[k].runs + " 局 · " + fmtHours(by[k].seconds) + " · " + fmtKm(by[k].meters)
  })));
}
function compareBox(cur, imp) {
  const row = (label, a, b) => `<div class="cmpRow"><span>${label}</span><b>${a} → ${b}</b></div>`;
  return `<div class="cmpBox">
    <div class="cmpRow" style="opacity:.7"><span>项目</span><b>当前 → 导入</b></div>
    ${row("已通关", cur.cleared, imp.cleared)}
    ${row("总星数", cur.stars, imp.stars)}
    ${row("段位分", cur.rating, imp.rating)}
    ${row("宇宙联赛分", cur.spaceRating, imp.spaceRating)}
    ${row("车辆", cur.vehicles, imp.vehicles)}
    ${row("金币", goldNum(cur.gold), goldNum(imp.gold))}
  </div>`;
}
function renderSavePanel() {
  const st = store.stat || {};
  const cur = currentSummary();
  const rating = store.progress.rating || 0;
  const stor = isStorageAvailable();
  const cmp = saveView.pending && saveView.summary ? `${compareBox(cur, saveView.summary)}
       <div class="panelNote">这份存档含 ${saveView.summary.vehicles} 辆车 · 宇宙联赛分 ${saveView.summary.spaceRating} · 建于 ${fmtDate(saveView.summary.createdAt)}</div>
       <div class="panelNote">⚠️ 导入将覆盖当前进度，且不可撤销</div>
       <div class="row2">
         <button class="btn sm" data-act="importConfirm">确认导入</button>
         <button class="btn sm ghost" data-act="importCancel">取消</button>
       </div>` : "";
  const askReset = saveView.confirmReset ? `<div class="panelNote">⚠️ 确认重置？全部进度（星级 / 解锁 / 段位 / 金币 / 成就 / 车库升级）将被清空，且不可撤销</div>
       <div class="row2">
         <button class="btn sm" data-act="resetConfirm">确认重置</button>
         <button class="btn sm ghost" data-act="resetCancel">取消</button>
       </div>` : "";
  showPanel(`<div class="modeTitle">\uD83D\uDCBE 存档 · 进度管理</div>
  ${slotListHtml()}
  ${statRow([
    { label: "已通关", value: `${cur.cleared}/${LEVELS.length}` },
    { label: "总星数", value: `${cur.stars}/${LEVELS.length * 3}` },
    { label: "段位分", value: `${rating} · ${rankName(rating)}` },
    { label: "成就", value: `${store.achGot.length}/${ACHS.length}` },
    { label: "金币", value: `\uD83E\uDE99 ${goldNum(store.gold)}` },
    { label: "累计里程", value: fmtKm(st.totalMeters) },
    { label: "累计时长", value: fmtHours(st.totalSeconds) },
    { label: "宇宙联赛分", value: `${store.space.rating || 0}` },
    { label: "最后游玩", value: fmtDate(st.lastPlayed) },
    { label: "存档建立", value: fmtDate(store.createdAt) }
  ])}
  ${dossierHtml()}${modeStatHtml(st)}
  ${stor ? "" : `<div class="panelNote">⚠️ 浏览器存储不可用（隐私模式 / 空间已满 / 被禁用）：本次无法保存进度，导出 / 导入 / 重置均不可用</div>`}
  <div class="brHead">\uD83C\uDF9A 画面设置 · 画质</div>
  <div class="tabs" role="tablist">${QUALITY.map((q) => `<button class="tab" role="tab" data-act="quality" data-q="${q}" aria-selected="${q === getQuality()}" aria-label="画质 ${QUALITY_LABEL[q]}">${QUALITY_LABEL[q]}</button>`).join("")}</div>
  <div class="panelNote">画质决定"画多少东西"（阴影 / 雾 / 辉光 / 天气粒子）；低档全部关闭、最省性能</div>
  <div class="brHead">\uD83D\uDD0D 画面设置 · 锐度</div>
  <div class="tabs" role="tablist">${RENDER_SCALES.map((s) => `<button class="tab" role="tab" data-act="scale" data-s="${s}" aria-selected="${Math.abs(s - getRenderScale()) < 0.01}" aria-label="锐度 ${RENDER_SCALE_LABEL[s]}">${RENDER_SCALE_LABEL[s]}</button>`).join("")}</div>
  <div class="panelNote">锐度决定"画在多少像素上"，与画质互不影响：省电 0.75×（56% 像素）/ 标准 1× / 锐利 1.25×（156% 像素）。两项设置都保存在浏览器本地（非存档键，导出存档不包含它们）</div>
  ${saveView.error ? `<div class="panelNote">${saveView.error}</div>` : ""}
  ${saveView.note ? `<div class="panelNote">${saveView.note}</div>` : ""}
  ${cmp}
  ${askReset}
  ${stor ? `<div class="row2" style="margin-top:10px">
    <button class="btn sm" data-act="export">导出存档</button>
    <button class="btn sm" data-act="importPick">导入存档</button>
    <button class="btn sm ghost" data-act="resetAsk">重置存档</button>
  </div>` : ""}
  <input type="file" id="saveFile" class="saveFileInput" accept=".json,application/json">
  <div class="panelNote">导出 = 把全部 bike_ 存档打包成一个 JSON 文件下载；导入 = 整体覆盖（不做字段合并）</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
}
function doExport() {
  const ok = downloadSave();
  saveView.error = "";
  saveView.note = ok ? "\uD83D\uDCBE 已导出存档文件（见浏览器下载）" : "⚠️ 导出失败：当前环境不支持文件下载";
  renderSavePanel();
}
function pickSaveFile() {
  const el = document.getElementById("saveFile");
  if (el && typeof el.click === "function") {
    el.click();
    return;
  }
  saveView.error = "";
  saveView.note = "⚠️ 当前环境无法打开文件选择框";
  renderSavePanel();
}
function readSaveFile(file) {
  const done = (text) => applyImportText(text);
  const fail = (e) => {
    saveView.pending = null;
    saveView.summary = null;
    saveView.note = "";
    saveView.error = "❌ 读取文件失败：" + (e && e.message ? e.message : e);
    renderSavePanel();
  };
  try {
    if (typeof file.text === "function") {
      file.text().then(done).catch(fail);
      return;
    }
    if (typeof FileReader === "undefined") {
      fail(new Error("浏览器不支持 FileReader"));
      return;
    }
    const fr = new FileReader;
    fr.onload = () => done(String(fr.result || ""));
    fr.onerror = () => fail(new Error("读取中断"));
    fr.readAsText(file);
  } catch (e) {
    fail(e);
  }
}
function applyImportText(text) {
  const res = parseSave(text);
  if (!res.ok) {
    saveView.pending = null;
    saveView.summary = null;
    saveView.note = "";
    saveView.error = "❌ 导入失败：" + res.error + "（现有存档未改动）";
    renderSavePanel();
    return;
  }
  saveView.pending = res.data;
  saveView.summary = res.summary;
  saveView.error = "";
  saveView.note = "";
  renderSavePanel();
}
function doImport() {
  if (!saveView.pending)
    return;
  const res = importSave(saveView.pending);
  if (!res.ok) {
    saveView.error = "❌ 导入失败：" + res.error + "（现有存档未改动）";
    renderSavePanel();
    return;
  }
  saveView.pending = null;
  saveView.summary = null;
  saveView.error = "";
  saveView.note = "✅ 存档已导入并生效";
  if (api.applyVehicle)
    api.applyVehicle();
  refreshMenuButtons();
  renderSavePanel();
}
function doReset() {
  resetSave();
  saveView.confirmReset = false;
  saveView.pending = null;
  saveView.summary = null;
  saveView.error = "";
  saveView.note = "♻️ 存档已重置：回到新玩家初始状态（仅支线 1 第 1 关解锁）";
  if (api.applyVehicle)
    api.applyVehicle();
  refreshMenuButtons();
  renderSavePanel();
}
function doSwitchSlot(n) {
  const before = currentSlot();
  if (n === before)
    return;
  if (!isStorageAvailable()) {
    saveView.error = "⚠️ 浏览器存储不可用，无法切换存档";
    renderSavePanel();
    return;
  }
  if (switchSlot(n)) {
    if (api.applyVehicle)
      api.applyVehicle();
    saveView.error = "";
    saveView.note = `✅ 已切换到「存档${n + 1}」`;
    refreshMenuButtons();
  }
  renderSavePanel();
}
function doNewSlot() {
  if (!isStorageAvailable()) {
    saveView.error = "⚠️ 浏览器存储不可用，无法新建存档";
    renderSavePanel();
    return;
  }
  const n = createSlot();
  if (n < 0) {
    saveView.error = "⚠️ 存档位已满，无法新建";
  } else {
    if (api.applyVehicle)
      api.applyVehicle();
    saveView.error = "";
    saveView.note = `✨ 已新建「存档${n + 1}」，从第 1 关重新开始`;
    refreshMenuButtons();
  }
  renderSavePanel();
}
function doDeleteSlot(n) {
  if (!isStorageAvailable()) {
    saveView.error = "⚠️ 浏览器存储不可用，无法删除存档";
    renderSavePanel();
    return;
  }
  if (deleteSlot(n))
    saveView.note = `\uD83D\uDDD1 已删除「存档${n + 1}」`;
  else
    saveView.error = "⚠️ 无法删除当前正在使用的存档";
  renderSavePanel();
}
function slotListHtml() {
  const slots = listSlots();
  const shown = [];
  for (const s of slots) {
    shown.push(s);
    if (!s.used)
      break;
  }
  const cells = shown.map((s) => {
    const cls = "lvCell slotCell" + (s.active ? " cur" : s.used ? " done" : "");
    const sub = s.active ? "\uD83D\uDCCD 当前" : s.used ? `已通关 ${s.cleared}/${LEVELS.length}` : "空存档位";
    return `<div class="${cls}" role="button" tabindex="0" data-act="slotSwitch" data-slot="${s.index}"
        aria-label="${s.name}${s.used ? `，已通关 ${s.cleared} 关` : "，空存档位"}${s.active ? "，当前使用中" : ""}">
      <div>${s.name}</div>
      <div class="thm">${sub}</div>
      ${s.used && !s.active ? `<button class="btn sm ghost slotDel" data-act="slotDelete" data-slot="${s.index}" aria-label="删除${s.name}">\uD83D\uDDD1</button>` : ""}
    </div>`;
  }).join("");
  const hasEmpty = listSlots().some((s) => !s.used);
  return `<div class="brHead">\uD83D\uDDC2 存档位</div>
    <div class="lvGrid slotGrid">${cells}</div>
    ${hasEmpty ? `<button class="btn sm ghost slotNew" data-act="slotNew">✨ 新建存档</button>` : `<div class="panelNote">存档位已满（上限 ${MAX_SLOTS} 个）</div>`}
    <div class="panelNote">切换存档位会各自保存独立的进度 / 星级 / 金币 / 车库。当前正在玩的存档位不能删除。</div>`;
}

// src/ui/shop.js
var shopEl = document.getElementById("shop");
var UP_LABEL = {
  engine: "引擎",
  tire: "轮胎",
  frame: "车架",
  susp: "减震"
};
function previewStats(veh, up) {
  const h = deriveHandling(veh, up);
  const s = deriveSuspension(veh, up);
  return {
    极速: Math.round(toKmh(h.topSpeed)),
    扭矩: Math.round(h.torquePeak / 1000),
    抓地: Math.round(deriveFriction(1, veh, up) * 100) / 100,
    抗摔: Math.round(crashTiltDeg(h.crashMargin)),
    悬挂: Math.round(s.travel * 10) / 10
  };
}
var UP_TOUCHES = {
  engine: ["极速", "扭矩"],
  tire: ["抓地", "极速"],
  frame: ["抗摔", "悬挂"],
  susp: ["悬挂"]
};
function fxLine2(v) {
  return v.ultra && v.ultra.fxText ? " · " + v.ultra.fxText : "";
}
function openShop() {
  store.shopOpen = true;
  renderShop();
  shopEl.classList.remove("hidden");
}
function closeShop() {
  store.shopOpen = false;
  shopEl.classList.add("hidden");
  if (store.state === "menu" || store.state === "ended")
    showMenu();
}
function toggleShop() {
  if (store.shopOpen)
    closeShop();
  else
    openShop();
}
function renderShop() {
  const ML = maxLvOf(VEHICLES[store.currentVehicle]);
  const goldEl = document.getElementById("shopGold");
  if (goldEl)
    goldEl.textContent = goldNum(store.gold);
  const vehNow = VEHICLES[store.currentVehicle];
  const st = document.getElementById("shopTitle");
  if (st)
    st.textContent = "\uD83D\uDEE0 升级 " + VEHICLES[store.currentVehicle].icon + " " + VEHICLES[store.currentVehicle].name;
  const u = getUp();
  const ultraEl = document.getElementById("shopUltra");
  if (ultraEl) {
    const v = VEHICLES[store.currentVehicle];
    if (v.ultra) {
      if (v.ultra.builtin === true) {
        ultraEl.className = "upUltra got";
        ultraEl.textContent = v.ultra.icon + " 「" + v.ultra.name + "」已内置生效 · " + v.ultra.desc + fxLine2(v);
      } else {
        const got = store.ultra[v.id] === true;
        const full4 = ["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= ML);
        ultraEl.className = "upUltra" + (got ? " got" : full4 ? " canBuy" : "");
        if (got) {
          ultraEl.textContent = v.ultra.icon + " 特殊模式「" + v.ultra.name + "」已开启 · " + v.ultra.desc + fxLine2(v);
        } else if (full4) {
          ultraEl.textContent = "⭐ 已全部升满！到车库花 " + goldNum(v.ultra.cost) + " \uD83E\uDE99 解锁「" + v.ultra.name + "」" + fxLine2(v);
        } else {
          ultraEl.textContent = "\uD83D\uDD12 全部升级升到 Lv" + ML + " 后可解锁特殊模式「" + v.ultra.name + "」：" + v.ultra.desc + fxLine2(v);
        }
      }
    } else {
      ultraEl.className = "upUltra";
      ultraEl.textContent = "\uD83D\uDCA1 除山地车外，每辆车都有专属特殊模式：四项升级全部升满后，到车库花金币解锁";
    }
  }
  for (const k of ["engine", "tire", "frame", "susp"]) {
    const lv = u[k] || 0;
    const lvEl = document.getElementById("lv-" + k);
    if (lvEl)
      lvEl.textContent = `Lv ${lv}/${ML}`;
    const barEl = document.getElementById("bar-" + k);
    if (barEl) {
      barEl.style.width = Math.min(100, lv / ML * 100).toFixed(2) + "%";
      barEl.parentElement.setAttribute("aria-valuenow", String(lv));
      barEl.parentElement.setAttribute("aria-valuemax", String(ML));
    }
    const btn = document.querySelector('[data-buy="' + k + '"]');
    if (!btn)
      continue;
    const dg = document.getElementById("dg-" + k);
    const now = previewStats(VEHICLES[store.currentVehicle], u);
    if (dg) {
      if (lv >= ML) {
        dg.textContent = UP_TOUCHES[k].map((n) => n + " " + now[n]).join(" · ") + " · 已满级";
        dg.className = "upDelta max";
      } else {
        const next = previewStats(VEHICLES[store.currentVehicle], { ...u, [k]: lv + 1 });
        const changed = UP_TOUCHES[k].filter((n) => next[n] !== now[n]);
        dg.textContent = changed.length ? changed.map((n) => n + " " + now[n] + " → " + next[n]).join(" · ") : "下一级已达该指标上限";
        dg.className = "upDelta";
      }
    }
    if (lv >= ML) {
      btn.textContent = "已满级";
      btn.disabled = true;
      btn.style.opacity = 0.5;
    } else {
      const c = upCostOf(VEHICLES[store.currentVehicle], lv + 1);
      btn.textContent = "升级 " + goldNum(c) + " \uD83E\uDE99";
      btn.disabled = store.gold < c;
      btn.style.opacity = 1;
    }
  }
  const allBtn = document.getElementById("btnUpAll");
  if (allBtn) {
    const full = ["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= ML);
    if (full) {
      allBtn.textContent = "✅ 四项已满级";
      allBtn.disabled = true;
      allBtn.classList.add("done");
    } else {
      let need = 0;
      for (const k of ["engine", "tire", "frame", "susp"]) {
        const lv = u[k] || 0;
        for (let i = lv + 1;i <= ML; i++)
          need += upCostOf(vehNow, i);
      }
      allBtn.textContent = "⚡ 一键升满（还需 " + goldNum(need) + " \uD83E\uDE99）";
      allBtn.disabled = store.gold < need;
      allBtn.classList.remove("done");
    }
  }
}
function applyUpgradeStep(k) {
  const u = getUp();
  const lv = u[k] || 0;
  if (lv >= maxLvOf(VEHICLES[store.currentVehicle]))
    return false;
  const c = upCostOf(VEHICLES[store.currentVehicle], lv + 1);
  if (store.gold < c)
    return false;
  store.gold -= c;
  u[k] = lv + 1;
  return true;
}
function buyUpgrade(k) {
  const u = getUp();
  const lv = u[k] || 0;
  const note = document.getElementById("shopNote");
  if (lv >= maxLvOf(VEHICLES[store.currentVehicle])) {
    if (note)
      note.textContent = "已经满级了";
    return;
  }
  if (!applyUpgradeStep(k)) {
    if (note)
      note.textContent = "金币不足，去关卡里收集吧！";
    showToast("\uD83E\uDE99 金币不足：" + UP_LABEL[k] + " Lv" + lv + " 升不到 Lv" + (lv + 1), 1200, "danger");
    return;
  }
  const before = previewStats(VEHICLES[store.currentVehicle], u);
  applyUpgrades();
  save();
  renderShop();
  const after = previewStats(VEHICLES[store.currentVehicle], u);
  const moved = Object.keys(after).filter((n) => after[n] !== before[n]);
  const msg = UP_LABEL[k] + " Lv" + lv + " → Lv" + (lv + 1) + (moved.length ? "：" + moved.map((n) => n + " +" + Math.round((after[n] - before[n]) * 100) / 100).join(" · ") : "");
  if (note)
    note.textContent = "升级成功！";
  showToast("\uD83D\uDD27 " + msg, 1600);
  playCoinSound();
}
function buyUpgradeAll() {
  const veh = VEHICLES[store.currentVehicle];
  const u = getUp();
  const before = previewStats(veh, u);
  const beforeLv = { engine: u.engine, tire: u.tire, frame: u.frame, susp: u.susp };
  let spent = 0;
  let bought = 0;
  const ML = maxLvOf(veh);
  let progress = true;
  while (progress) {
    progress = false;
    for (const k of ["engine", "tire", "frame", "susp"]) {
      const lv = u[k] || 0;
      if (lv >= ML)
        continue;
      const c = upCostOf(veh, lv + 1);
      if (store.gold < c)
        continue;
      store.gold -= c;
      u[k] = lv + 1;
      spent += c;
      bought++;
      progress = true;
    }
    if (["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= ML))
      break;
  }
  const note = document.getElementById("shopNote");
  if (!bought) {
    if (note)
      note.textContent = "金币不足，暂时升不了";
    showToast("\uD83E\uDE99 金币不足，无法升级", 1200, "danger");
    return;
  }
  applyUpgrades();
  save();
  renderShop();
  const after = previewStats(veh, u);
  const moved = Object.keys(after).filter((n) => after[n] !== before[n]);
  const gotFull = ["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= ML);
  const parts = ["买 " + bought + " 级 · \uD83E\uDE99-" + goldNum(spent)];
  for (const k of ["engine", "tire", "frame", "susp"]) {
    if (u[k] !== beforeLv[k])
      parts.push(UP_LABEL[k] + " Lv" + beforeLv[k] + "→Lv" + u[k]);
  }
  if (moved.length) {
    parts.push(moved.map((n) => n + " +" + Math.round((after[n] - before[n]) * 100) / 100).join(" · "));
  }
  if (note)
    note.textContent = gotFull ? "四项全部满级 \uD83C\uDF89" : "已升 " + bought + " 级";
  showToast((gotFull ? "⚡ 四项满级" : "⚡ 批量升级") + " · " + parts.join(" · "), 2600, "success");
  playCoinSound();
}
function initShop() {
  const btnShop = document.getElementById("btnShop");
  if (btnShop) {
    btnShop.addEventListener("click", () => {
      initAudio();
      if (store.state === "menu")
        openShop();
    });
  }
  const closeBtn = document.getElementById("closeShop");
  if (closeBtn)
    closeBtn.addEventListener("click", closeShop);
  const allBtn = document.getElementById("btnUpAll");
  if (allBtn)
    allBtn.addEventListener("click", buyUpgradeAll);
  for (const k of ["engine", "tire", "frame", "susp"]) {
    const btn = document.querySelector('[data-buy="' + k + '"]');
    if (btn)
      btn.addEventListener("click", () => buyUpgrade(k));
  }
}

// src/ui/donate.js
var donateEl = document.getElementById("donate");
var qrImg = document.getElementById("qrImg");
var qrBox = document.getElementById("qrBox");
function checkQr() {
  if (qrImg && qrBox && qrImg.complete && qrImg.naturalWidth > 0)
    qrBox.classList.add("filled");
}
function openDonate() {
  store.donateOpen = true;
  donateEl.classList.remove("hidden");
}
function closeDonate() {
  store.donateOpen = false;
  donateEl.classList.add("hidden");
}
function initDonate() {
  for (const id of ["btnCoffee", "btnDonate"]) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", () => {
        initAudio();
        openDonate();
      });
    }
  }
  const closeBtn = document.getElementById("closeDonate");
  if (closeBtn)
    closeBtn.addEventListener("click", closeDonate);
  if (qrImg) {
    qrImg.addEventListener("load", checkQr);
    qrImg.addEventListener("error", () => {});
  }
  checkQr();
}

// src/ui/settings.js
var DESC = {
  low: "性能最优：干净画面，任何设备都能流畅跑",
  medium: "增强：装饰投影 · 天气粒子 · 轻色调",
  high: "光影真实：坡面明暗 · 自行车投影 · 大气雾 · 太阳浸染"
};
var SCALE_DESC = {
  0.75: "省电：只画 56% 的像素，老旧设备 / 边充边玩最稳（画面略软）",
  1: "标准：与屏幕像素 1:1，绝大多数设备的推荐档",
  1.25: "锐利：1.25 倍超采样（156% 像素），高分屏最清晰，也最吃性能"
};
function initSettings() {
  const panel = document.getElementById("settings");
  const btn = document.getElementById("btnSettings");
  if (btn)
    btn.addEventListener("click", openSettings);
  if (!panel)
    return;
  const close = document.getElementById("closeSettings");
  if (close)
    close.addEventListener("click", closeSettings);
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Escape" || panel.classList.contains("hidden"))
      return;
    e.preventDefault();
    closeSettings();
  });
  const tabs = document.getElementById("qualityTabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-q]") : null;
      if (!el)
        return;
      applyQuality(el.dataset.q);
    });
  }
  const mute = document.getElementById("btnMute");
  if (mute)
    mute.addEventListener("click", toggleMute);
  const sTabs = document.getElementById("scaleTabs");
  if (sTabs) {
    sTabs.addEventListener("click", (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-s]") : null;
      if (!el)
        return;
      applyScale(el.dataset.s);
    });
  }
}
function openSettings() {
  renderQuality();
  renderScale();
  renderMute();
  const panel = document.getElementById("settings");
  if (!panel)
    return;
  panel.classList.remove("hidden");
  focusIn(panel.querySelector("button:not([disabled])"));
}
function closeSettings() {
  const panel = document.getElementById("settings");
  if (!panel)
    return;
  panel.classList.add("hidden");
  focusIn(document.getElementById("btnSettings"));
}
function focusIn(el) {
  if (!el || typeof el.focus !== "function")
    return;
  try {
    el.focus({ preventScroll: true });
  } catch (e) {
    el.focus();
  }
}
function applyQuality(q) {
  if (!QUALITY.includes(q))
    return;
  setQuality(q);
  renderQuality();
  showToast("\uD83C\uDF9A 画质已切到「" + QUALITY_LABEL[q] + "」", 800);
}
function renderQuality() {
  const q = getQuality();
  document.querySelectorAll("#qualityTabs .tab").forEach((b) => {
    const on = b.dataset.q === q;
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  const d = document.getElementById("qDesc");
  if (d)
    d.textContent = DESC[q] || "";
}
function applyScale(s) {
  const v = setRenderScalePersisted(s);
  renderScale();
  showToast("\uD83D\uDD0D 锐度已切到「" + (RENDER_SCALE_LABEL[v] || v) + "」", 800);
}
function renderScale() {
  const s = getRenderScale();
  document.querySelectorAll("#scaleTabs .tab").forEach((b) => {
    const on = Math.abs(Number(b.dataset.s) - s) < 0.01;
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  const d = document.getElementById("sDesc");
  if (d)
    d.textContent = SCALE_DESC[s] || "";
}
function toggleMute() {
  store.muted = !store.muted;
  try {
    save();
  } catch (e) {}
  renderMute();
  showToast(store.muted ? "\uD83D\uDD07 已静音" : "\uD83D\uDD0A 声音已开启", 700);
}
function renderMute() {
  const m = document.getElementById("btnMute");
  if (m)
    m.textContent = store.muted ? "\uD83D\uDD07 已静音" : "\uD83D\uDD0A 声音开启";
}

// src/main.js
if (typeof window !== "undefined")
  window.__daleBooted = true;
installRoundRect();
resize();
window.addEventListener("resize", resize);
loadSave();
loadAchList();
loadProgress();
initAutoSave();
initPostFx();
if (!isStorageAvailable())
  showToast("⚠️ 本次无法保存进度（浏览器存储不可用）", 2400);
initGame({ hideOverlay, toMenu: showMenu, presentResult: showResultCard });
initPanels({ startGame, applyVehicle: applyUpgrades });
initShop();
initDonate();
initSettings();
initInput({ restart, togglePause, toggleShop });
buildLevel();
applyUpgrades();
resetBike(START_X);
var stepper = new Stepper((dt) => {
  update(dt);
  updateCamera(dt);
});
startRaf((dt) => {
  if (dt > 0)
    autoTuneFrame(dt * 1000);
  stepper.advance(dt);
  drawScene(dt);
});
export {
  restart,
  startGame,
  stepper
};
