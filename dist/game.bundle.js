(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  function __accessProp(key) {
    return this[key];
  }
  var __toCommonJS = (from) => {
    var entry = (__moduleCache ??= new WeakMap).get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function") {
      for (var key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(entry, key))
          __defProp(entry, key, {
            get: __accessProp.bind(from, key),
            enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
          });
    }
    __moduleCache.set(from, entry);
    return entry;
  };
  var __moduleCache;
  var __returnValue = (v) => v;
  function __exportSetter(name, newValue) {
    this[name] = __returnValue.bind(null, newValue);
  }
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: __exportSetter.bind(all, name)
      });
  };

  // src/main.js
  var exports_main = {};
  __export(exports_main, {
    restart: () => restart,
    startGame: () => startGame,
    stepper: () => stepper
  });

  // src/core/utils.js
  var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  var lerp = (a, b, t) => a + (b - a) * t;
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
  var GRAV_BASE = 750;
  var REAR_LOAD = 0.62;
  var TOP_SPEED_CAP = 6000;
  function topSpeedOf(veh, up) {
    const p = veh && veh.phys || {};
    const u = up || {};
    const eng = u.engine || 0;
    const tire = u.tire || 0;
    const k = p.mass || veh && veh.wgt || 1;
    const mTot = (M_TOT + 2 * M_W) * k;
    const peak = TORQUE_PEAK_BASE * (p.torque || 1) * (1 + ENGINE_TORQUE_UP * eng + TIRE_TORQUE_UP * tire);
    const rpmK = 1 + ENGINE_RPM_UP * eng;
    const mu = FRICTION_BASE * (veh && veh.grp || 1) * (1 + FRICTION_TIRE_UP * tire);
    const grip = mu * mTot * GRAV_BASE * REAR_LOAD;
    const roll = ROLL_RES_K * mTot * GRAV_BASE;
    const avail = (v) => Math.min(torqueAt(veh, v / WHEEL_R, 1, peak, rpmK) / WHEEL_R, grip);
    const loss = (v) => AIR_DRAG_K * v * v + roll;
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
      brakePeak: BRAKE_TORQUE_BASE * veh.grp * (1 + 0.016 * (u.tire || 0) + 0.01 * (u.frame || 0)),
      rpmK: 1 + ENGINE_RPM_UP * (u.engine || 0),
      MAXV: topSpeedOf(veh, up),
      crashMargin: Math.min(14, 2 + 0.1 * (u.frame || 0) + veh.wgt * 2),
      fuelMax: veh.tank * (1 + 0.004 * (u.frame || 0))
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
  var NUM_CAP_V = 6000;
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
  var CONTACT_BIAS = 0.25;
  var BIAS_MAX_V = 400;
  var CONTACT_BAND = 2;
  var c01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  function deriveRigidBody(veh) {
    const p = veh && veh.phys || {};
    const k = p.mass || veh && veh.wgt || 1;
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
    return FRICTION_BASE * (traction || 1) * (veh && veh.grp || 1) * (1 + FRICTION_TIRE_UP * t);
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
  var upCost = (lv) => Math.round(10 + 1.2 * lv);
  var CAN_FUEL = 0.6;
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
    sel: "bike_sel"
  };
  var RATING_ADVANCED = 1200;
  var RATING_PEAK = 2400;
  var RATING_MIN = 0;
  var RATING_WIN_GAIN = 25;
  var RATING_LOSS = 20;
  var RATING_WIN_GAIN_ADVANCED = 40;
  var RATING_LOSS_ADVANCED = 30;
  var RANKS = [
    { min: 0, name: "青铜" },
    { min: 400, name: "白银" },
    { min: 800, name: "黄金" },
    { min: 1200, name: "铂金" },
    { min: 1600, name: "钻石" },
    { min: 2000, name: "星耀" },
    { min: 2400, name: "王者" },
    { min: 3000, name: "传奇" }
  ];
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
  var SAVE_FORMAT = 1;

  // src/config/vehicles.js
  var P = (mass, inertia, suspK, suspC, travel, torque, rpm) => ({ mass, inertia, suspK, suspC, travel, torque, rpm });
  var POSE = (shX, shY, hdX, hdY, barX, barY) => ({ shX, shY, hdX, hdY, barX, barY });
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
  var VEHICLES = [
    {
      id: "trail",
      name: "山地车",
      icon: "\uD83D\uDEB2",
      desc: "均衡全能，新手之选",
      price: 0,
      drv: 1,
      spd: 1,
      grp: 1,
      wgt: 1,
      air: 1,
      tank: 1,
      color: "#314ccd",
      art: ART({}),
      phys: P(1, 1, 1, 1, 16, 1, 1)
    },
    {
      id: "sport",
      name: "竞速车",
      icon: "\uD83C\uDFCD️",
      desc: "极速快，空中旋转快，油箱小",
      price: 3000,
      drv: 1.35,
      spd: 1.4,
      grp: 0.72,
      wgt: 0.8,
      air: 1.4,
      tank: 0.75,
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
      phys: P(0.8, 0.7, 1.25, 1.1, 13, 1.35, 1.25),
      ultra: {
        name: "极速模式",
        icon: "\uD83D\uDE80",
        mode: "surge",
        cost: 80000,
        desc: "引擎过载：加速与极速大幅提升，风驰电掣"
      }
    },
    {
      id: "mud",
      name: "越野车",
      icon: "\uD83D\uDE9C",
      desc: "抓地强，耐撞，油箱大，旋转慢",
      price: 9000,
      drv: 1.12,
      spd: 0.7,
      grp: 1.45,
      wgt: 1.5,
      air: 0.75,
      tank: 1.45,
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
      phys: P(1.5, 1.35, 0.85, 0.9, 20, 1.12, 0.85),
      ultra: {
        name: "贴地模式",
        icon: "\uD83D\uDEE1️",
        mode: "stable",
        cost: 120000,
        desc: "磁悬浮贴地：始终贴地，永不翻车"
      }
    },
    {
      id: "volt",
      name: "电磁脉冲车",
      icon: "⚡",
      desc: "变态：满级极速是山地车的 2 倍，爬坡不喘",
      price: 32000,
      drv: 1.55,
      spd: 1.85,
      grp: 1.2,
      wgt: 0.85,
      air: 0.87,
      tank: 1.3,
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
      phys: P(0.85, 1.15, 1.35, 1.15, 14, 1.55, 1.3),
      ultra: {
        name: "电磁轨道炮",
        icon: "\uD83D\uDD0C",
        mode: "railgun",
        cost: 260000,
        desc: "电磁轨道炮：推力与红线同时暴涨，平地直接贴地飞行"
      }
    },
    {
      id: "ghost",
      name: "影行者",
      icon: "\uD83D\uDC7B",
      desc: "变态：摔不坏、油无限、危险段随便冲",
      price: 58000,
      drv: 1.4,
      spd: 1.6,
      grp: 1.55,
      wgt: 0.7,
      air: 1.62,
      tank: 2.2,
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
      phys: P(0.7, 0.62, 1.5, 1.2, 12, 1.2, 1.45),
      ultra: {
        name: "相位穿行",
        icon: "\uD83C\uDF00",
        mode: "phase",
        cost: 400000,
        desc: "相位穿行：永不摔车 + 燃料无限 + 危险段限速豁免"
      }
    },
    {
      id: "fort",
      name: "磁力堡垒",
      icon: "\uD83D\uDEE1️",
      desc: "变态：巨重巨稳，抓地碾压，翻过来也能爬起来",
      price: 96000,
      drv: 1.6,
      spd: 1.35,
      grp: 2.1,
      wgt: 2.4,
      air: 0.42,
      tank: 2.6,
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
      phys: P(2.4, 2.4, 0.72, 0.85, 24, 1.6, 1.9),
      ultra: {
        name: "磁力护盾",
        icon: "\uD83D\uDD30",
        mode: "shield",
        cost: 620000,
        desc: "磁力护盾：任何姿态都摔不下去，腾空与操控全部保留"
      }
    },
    {
      id: "photon",
      name: "光子摩托",
      icon: "\uD83D\uDCAB",
      desc: "变态：本项目最快的脚，0.7 秒冲到极速",
      price: 150000,
      drv: 1.9,
      spd: 2.1,
      grp: 1.35,
      wgt: 0.6,
      air: 0.95,
      tank: 1.6,
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
      phys: P(0.6, 1.05, 1.45, 1.25, 13, 1.15, 1.7),
      ultra: {
        name: "光子跃迁",
        icon: "\uD83C\uDF0C",
        mode: "warp",
        cost: 1e6,
        desc: "光子跃迁：踩住油门持续喷射，0.7 秒逼近极速"
      }
    }
  ];

  // src/core/store.js
  var store = {
    time: 0,
    state: "menu",
    mode: "level",
    lastMode: "level",
    rankedAdvanced: false,
    slot: 0,
    lvIdx: 0,
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
    progress: {
      branchCleared: [],
      finaleDone: false,
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
      lastPlayed: ""
    },
    shopOpen: false,
    donateOpen: false,
    cam: { x: 0, y: 0, zoom: 1.4, shake: 0 },
    phys: {
      theme: 0,
      minY: 0,
      GRAV: 750,
      TRACTION: 1,
      MAXV: topSpeedOf(VEHICLES[0], { engine: 0, tire: 0, frame: 0, susp: 0 }),
      crashMargin: 4,
      fuel: 1,
      fuelMax: 1,
      rb: null,
      susp: null,
      mu: 1
    },
    run: {
      gen: 0,
      crashed: false,
      crashTimer: 0,
      clearing: false,
      lastSafeX: START_X,
      runCrashed: false,
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
    raceAI: null
  };
  var bike = {
    rear: { x: 0, y: 0, px: 0, py: 0 },
    front: { x: 0, y: 0, px: 0, py: 0 },
    head: { x: 0, y: 0, px: 0, py: 0 },
    axleR: { x: 0, y: 0, px: 0, py: 0 },
    axleF: { x: 0, y: 0, px: 0, py: 0 },
    grounded: 0,
    speed: 0,
    boostT: 0,
    wheelRear: 0,
    wheelFront: 0,
    locked: true,
    spawnX: START_X,
    frontGr: false,
    rearGr: false,
    squash: 0,
    squashVel: 0,
    lastAng: 0,
    angVel: 0,
    angRate: 0,
    wheelStep: 0,
    wheelStepF: 0,
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
  bike.pts = [bike.rear, bike.front, bike.head, bike.axleR, bike.axleF];
  var world = {
    coins: [],
    canisters: [],
    boosts: [],
    decoTree: [],
    decoRock: [],
    particles: [],
    freeGenX: 0,
    prepFuel: 0,
    airScore: 0,
    hazards: [],
    gates: [],
    jumps: []
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
    const finish = () => {
      const i = live.indexOf(item);
      if (i >= 0)
        live.splice(i, 1);
      if (el.classList && el.classList.remove)
        el.classList.remove("show");
      if (typeof el.remove === "function")
        el.remove();
      const next = queue.shift();
      if (next)
        present(next);
    };
    if (typeof setTimeout === "function")
      setTimeout(finish, item.ms);
  }
  function showToast(txt, ms, level) {
    const lv = TOAST_LEVELS.includes(level) ? level : inferLevel(txt);
    const item = {
      txt: String(txt === undefined || txt === null ? "" : txt),
      ms: ms || 900,
      level: lv,
      el: null
    };
    if (live.length >= TOAST_MAX)
      queue.push(item);
    else
      present(item);
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

  // src/config/levels.js
  var STEP_W = 150;
  var RUN_IN = 430;
  var LEVELS_PER_BRANCH = 6;
  var N_BRANCHES = 12;
  var TOTAL = N_BRANCHES * LEVELS_PER_BRANCH;
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
  var BRANCHES = [
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
    let y = 300;
    let relief = 0;
    for (const w of L.waves)
      relief += w.amp * Math.sin(x * w.f + w.ph);
    for (const s of L.steps) {
      if (x > s.cx) {
        const t = clamp((x - s.cx) / STEP_W, 0, 1);
        relief += s.drop * (t * t * (3 - 2 * t));
      }
    }
    const feats = L.feats;
    if (feats) {
      for (let i = 0;i < feats.length; i++) {
        const f = feats[i];
        if (x <= f.x0)
          break;
        if (x >= f.x1)
          continue;
        relief += f.amp * featProfile(f.kind, (x - f.x0) / (f.x1 - f.x0), f.n);
      }
    }
    return y + relief * ss((x - LAUNCH_PAD) / RUN_IN);
  }
  function levelGroundInfo(L, x, e = 2) {
    const yL = levelHillY(L, x - e);
    const yR = levelHillY(L, x + e);
    return { y: levelHillY(L, x), m: (yR - yL) / (2 * e) };
  }
  function freeMoodOf(x) {
    const t = Math.floor(x / 3000);
    const h = Math.imul(t ^ 2654435769, 2246822507) >>> 0;
    return TERRAIN_MOODS[h % TERRAIN_MOODS.length];
  }
  function freeHill(x) {
    const d = Math.max(0, x - 400);
    const diff = Math.min(1, d / 120000);
    const diffS = diff * diff * (3 - 2 * diff);
    let y = 300;
    const ramp = ss((x - LAUNCH_PAD) / RUN_IN);
    const seg = Math.floor(x / 3000);
    const mood = freeMoodOf(x);
    const ph = seg * 2.399963 % 6.283185307;
    for (let i = 0;i < mood.waves.length; i++) {
      const w = mood.waves[i];
      const wl = Math.max(MIN_WAVELEN, w[0] * (0.85 + (seg * 7 + i * 13) % 31 / 31 * 0.3));
      y += Math.sin(x / wl * 6.283185307 + ph + i * 1.9) * (w[1] * 0.5 + w[1] * 0.5 * diffS + w[2] * diffS);
    }
    const stepGap = mood.stepGap;
    const stepDrop = (15 + diffS * 10) * mood.stepK;
    const segIdx = Math.floor(d / stepGap);
    y += stepDrop * segIdx;
    const cur = d % stepGap;
    if (cur > 0) {
      const t = clamp(cur / STEP_W, 0, 1);
      y += stepDrop * (t * t * (3 - 2 * t));
    }
    return 300 + (y - 300) * ramp;
  }
  function measureMaxSlopeTan(P, len) {
    let mx = 0;
    for (let x = 70;x <= len; x += 4) {
      const m = Math.abs(levelGroundInfo(P, x).m);
      if (m > mx)
        mx = m;
    }
    return mx;
  }
  function measureMaxSlope(L) {
    return Math.atan(measureMaxSlopeTan(L, L.len)) * 180 / Math.PI;
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
    L.maxSlope = measureMaxSlope(L);
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
    const nStep = nOverride != null ? nOverride : 1 + Math.floor(gN * 6);
    const steps = [];
    let cx = LAUNCH_PAD + RUN_IN + 200 + rng() * 400;
    const gap = mood.stepGap * (0.62 + len / 13200 * 0.38);
    for (let r = 0;r < nStep; r++) {
      steps.push({ cx: Math.round(cx), drop: 15 + gN * 76 + r * (2 + gN * 7) });
      cx += gap * (1 + (rng() * 2 - 1) * 0.18);
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
    const n = Math.max(3, Math.min(16, Math.round(total * span / 4200)));
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
    const variant = k === 2 ? SPECIALS[bi % SPECIALS.length] : k === 4 ? SPECIALS[(bi + 2) % SPECIALS.length] : "normal";
    const ramp = Math.pow(clamp(gN, 0, 1), 1.15);
    const len = Math.round(4200 + gN * 9000);
    const coinN = Math.round(16 + gN * 40);
    const mood = TERRAIN_MOODS[bi % TERRAIN_MOODS.length];
    const rng = mulberry32(20973 + gi * 2654435761);
    const L = {
      name: BRANCHES[bi].name + " " + (k + 1),
      len,
      waves: buildWaves(mood, ramp, rng),
      steps: buildSteps(mood, ramp, gN, len, rng),
      feats: buildFeats(mood, ramp, len, rng),
      coinN,
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
  var FINALE = (() => {
    const len = 22000;
    const rng = mulberry32(15825438);
    const segLen = 3600;
    const segs = 6;
    const waves = [];
    const steps = [];
    const feats = [];
    for (let s = 0;s < segs; s++) {
      const mood = TERRAIN_MOODS[(s * 5 + 3) % TERRAIN_MOODS.length];
      const w = buildWaves(mood, 1, rng)[0];
      w.ph += s * 2.399963;
      w.amp *= Math.pow(0.62, s);
      waves.push(w);
      for (const f of buildFeats(mood, 1, segLen, rng)) {
        feats.push({ ...f, x0: f.x0 + s * segLen, x1: f.x1 + s * segLen });
      }
    }
    {
      const first = LAUNCH_PAD + RUN_IN + 200;
      const sp = buildSteps(TERRAIN_MOODS[9], 1, 1, len, rng, 7);
      const k = (len - first - 800) / 7800;
      for (const st of sp)
        steps.push({ cx: Math.round(first + (st.cx - first) * k), drop: st.drop });
    }
    feats.sort((a, b) => a.x0 - b.x0);
    const L = {
      name: "终极远征 · 环大陆",
      len,
      waves,
      steps,
      feats,
      coinN: 90,
      ramp: 0.5,
      den3: REF_SPEED * (0.72 - 0.22),
      fuelK: 1 + 3.1,
      mech: 1.3,
      hazardN: 8,
      gateN: 6,
      variant: "normal",
      theme: 0,
      mood: "gauntlet",
      segments: [
        { x: 0, theme: 0 },
        { x: 3600, theme: 6 },
        { x: 7600, theme: 5 },
        { x: 11800, theme: 3 },
        { x: 16000, theme: 10 },
        { x: 19800, theme: 11 }
      ]
    };
    fitSlope(L, 54);
    return L;
  })();
  var FINALE_INDEX = LEVELS.length;
  function levelAt(idx) {
    return idx === FINALE_INDEX ? FINALE : LEVELS[idx];
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
  var CUR_VER = 3;
  var ALL_KEYS = Object.values(SAVE_KEYS);
  var available = true;
  function isStorageAvailable() {
    return available;
  }
  var MAX_SLOTS = 6;
  var META_KEYS = { slot: "dale_slot", slots: "dale_slots" };
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
    } catch (e) {
      available = false;
    }
  }
  function rawRemove(k) {
    try {
      localStorage.removeItem(k);
    } catch (e) {
      available = false;
    }
  }
  function slotIndex() {
    const n = store.slot | 0;
    return n >= 0 && n < MAX_SLOTS ? n : 0;
  }
  function slotKey(n, k) {
    return n === 0 ? k : `dale_s${n}_${k}`;
  }
  function sk(k) {
    return slotKey(slotIndex(), k);
  }
  function slotGet(n, k) {
    return rawGet(slotKey(n, k));
  }
  function readSlots() {
    const raw = rawGet(META_KEYS.slots);
    if (!raw)
      return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.slice(0, MAX_SLOTS) : [];
    } catch (e) {
      return [];
    }
  }
  function writeSlots(list) {
    rawSet(META_KEYS.slots, JSON.stringify(list.slice(0, MAX_SLOTS)));
  }
  function slotUsed(n) {
    return slotGet(n, SAVE_KEYS.gold) !== null || slotGet(n, SAVE_KEYS.stars) !== null;
  }
  function listSlots() {
    const meta = readSlots();
    const out = [];
    for (let n = 0;n < MAX_SLOTS; n++) {
      const used = slotUsed(n);
      const m = meta[n] || {};
      out.push({
        index: n,
        name: used ? m.name || `存档${n + 1}` : `存档${n + 1}`,
        used,
        active: n === slotIndex(),
        updatedAt: m.updatedAt || "",
        cleared: used ? m.cleared | 0 : 0
      });
    }
    return out;
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
  function currentSlot() {
    return slotIndex();
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
    loadAchList();
    loadProgress();
    touchSlotMeta(n, clearedCountOfCurrent());
    return true;
  }
  function createSlot() {
    const used = listSlots().filter((s) => s.used);
    if (used.length >= MAX_SLOTS)
      return -1;
    let target = -1;
    for (let n = 0;n < MAX_SLOTS; n++)
      if (!slotUsed(n)) {
        target = n;
        break;
      }
    if (target < 0)
      return -1;
    switchSlot(target);
    resetSave();
    const meta = readSlots();
    while (meta.length < MAX_SLOTS)
      meta.push({});
    meta[target] = { name: `存档${target + 1}`, updatedAt: new Date().toISOString().slice(0, 10), cleared: 0 };
    writeSlots(meta);
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
        if (typeof localStorage.length === "number" && typeof localStorage.key === "function") {
          const dead = [];
          for (let i = 0;i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf("bike_") === 0)
              dead.push(k);
          }
          for (const k of dead)
            rawRemove(k);
        }
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
  function clearedCountOfCurrent() {
    let n = 0;
    const raw = slotGet(slotIndex(), SAVE_KEYS.stars);
    try {
      const v = JSON.parse(raw || "[]");
      if (Array.isArray(v)) {
        for (const s of v)
          if (s >= 1)
            n++;
      }
    } catch (e) {}
    return n;
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
  function lsGet(k) {
    try {
      return localStorage.getItem(sk(k));
    } catch (e) {
      available = false;
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(sk(k), v);
      return true;
    } catch (e) {
      available = false;
      return false;
    }
  }
  function lsRemove(k) {
    try {
      localStorage.removeItem(sk(k));
      return true;
    } catch (e) {
      available = false;
      return false;
    }
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
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  function clampLv(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n))
      return 0;
    return Math.max(0, Math.min(MAX_LV, n));
  }
  function clampStar(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0)
      return 0;
    return Math.min(3, n);
  }
  function sanitizeUpgrades(u) {
    const out = {};
    if (!u || typeof u !== "object" || Array.isArray(u))
      return out;
    for (const veh of VEHICLES) {
      const rec = u[veh.id];
      if (!rec || typeof rec !== "object" || Array.isArray(rec))
        continue;
      out[veh.id] = {
        engine: clampLv(rec.engine),
        tire: clampLv(rec.tire),
        frame: clampLv(rec.frame),
        susp: clampLv(rec.susp)
      };
    }
    return out;
  }
  function getUp() {
    const id = VEHICLES[store.currentVehicle].id;
    if (!store.upgrades[id]) {
      store.upgrades[id] = { engine: 0, tire: 0, frame: 0, susp: 0 };
    }
    return store.upgrades[id];
  }
  function loadAchList() {
    const raw = lsGet(SAVE_KEYS.ach);
    const v = jsonOr(raw || "[]", []);
    store.achGot = Array.isArray(v) ? v : [];
  }
  function saveAchList() {
    lsSet(SAVE_KEYS.ach, JSON.stringify(store.achGot));
  }
  function save() {
    lsSet(SAVE_KEYS.gold, store.gold);
    lsSet(SAVE_KEYS.up, JSON.stringify(store.upgrades));
    lsSet(SAVE_KEYS.unlocked, store.unlocked);
    lsSet(SAVE_KEYS.stars, JSON.stringify(store.stars));
    lsSet(SAVE_KEYS.veh, store.currentVehicle);
    lsSet(SAVE_KEYS.owned, JSON.stringify(store.ownedVehicles));
    lsSet(SAVE_KEYS.mute, store.muted ? "1" : "0");
    lsSet(SAVE_KEYS.best, store.best);
    lsSet(SAVE_KEYS.ultra, JSON.stringify(store.ultra || {}));
    lsSet(SAVE_KEYS.sel, store.selLevel || 0);
    saveProgress();
    touchSlotMeta(slotIndex(), clearedCountOfCurrent());
  }
  function clearedBranchesOf(stars) {
    const arr = Array.isArray(stars) ? stars : [];
    const out = [];
    for (let bi = 0;bi < BRANCHES.length; bi++) {
      let all = true;
      for (let k = 0;k < LEVELS_PER_BRANCH; k++) {
        if (!(arr[bi * LEVELS_PER_BRANCH + k] > 0)) {
          all = false;
          break;
        }
      }
      if (all)
        out.push(bi);
    }
    return out;
  }
  function deriveBranchCleared() {
    return clearedBranchesOf(store.stars);
  }
  function availableFreeThemes(stars) {
    const out = [];
    for (const bi of clearedBranchesOf(stars)) {
      const b = BRANCHES[bi];
      const th = b ? b.theme : bi;
      if (!out.includes(th))
        out.push(th);
    }
    return out;
  }
  function isAdvancedUnlocked(rating) {
    return (Number(rating) || 0) >= RATING_ADVANCED;
  }
  function deriveUnlocks(progress, stars) {
    const p = progress && typeof progress === "object" ? progress : {};
    const arr = Array.isArray(stars) ? stars : [];
    let allCleared = LEVELS.length > 0;
    for (let i = 0;i < LEVELS.length; i++) {
      if (!(arr[i] >= 1)) {
        allCleared = false;
        break;
      }
    }
    const done = p.finaleDone === true;
    const rating = Math.max(0, intOr(p.rating));
    return {
      allCleared,
      finaleUnlocked: allCleared,
      finaleDone: done,
      invited: done || p.invited === true,
      advancedUnlocked: isAdvancedUnlocked(rating),
      peak: p.peak === true || rating >= RATING_PEAK
    };
  }
  function refreshProgress() {
    const P = store.progress;
    P.branchCleared = deriveBranchCleared();
    const d = deriveUnlocks(P, store.stars);
    if (d.finaleDone)
      P.finaleDone = true;
    if (d.invited)
      P.invited = true;
    if (d.peak)
      P.peak = true;
    syncFreeThemes();
    return P;
  }
  function syncFreeThemes() {
    const P = store.progress;
    if (!P.peak) {
      P.freeThemes = [];
      return P.freeThemes;
    }
    P.freeThemes = availableFreeThemes(store.stars);
    return P.freeThemes;
  }
  function loadStat() {
    const raw = lsGet(SAVE_KEYS.stat);
    const s = jsonOr(raw || "null", null);
    const o = s && typeof s === "object" && !Array.isArray(s) ? s : {};
    store.stat.totalRuns = Math.max(0, intOr(o.totalRuns !== undefined ? o.totalRuns : o.games));
    store.stat.totalMeters = Math.max(0, Number(o.totalMeters !== undefined ? o.totalMeters : o.dist) || 0);
    store.stat.totalSeconds = Math.max(0, Number(o.totalSeconds !== undefined ? o.totalSeconds : o.time) || 0);
    store.stat.lastPlayed = typeof o.lastPlayed === "string" ? o.lastPlayed : "";
    return store.stat;
  }
  function saveStat() {
    lsSet(SAVE_KEYS.stat, JSON.stringify(store.stat));
  }
  function saveProgress() {
    lsSet(SAVE_KEYS.prog, JSON.stringify(store.progress));
    lsSet(SAVE_KEYS.rating, String(store.progress.rating));
    saveStat();
  }
  function settleProgress() {
    refreshProgress();
    saveProgress();
    return store.progress;
  }
  function loadProgress() {
    const P = store.progress;
    const prog = jsonOr(lsGet(SAVE_KEYS.prog) || "null", null);
    const o = prog && typeof prog === "object" && !Array.isArray(prog) ? prog : {};
    P.finaleDone = o.finaleDone === true;
    P.invited = o.invited === true;
    P.wins = Math.max(0, intOr(o.wins));
    P.losses = Math.max(0, intOr(o.losses));
    P.peak = o.peak === true;
    P.rating = Math.max(0, intOr(lsGet(SAVE_KEYS.rating)));
    loadStat();
    P.branchCleared = deriveBranchCleared();
    const d = deriveUnlocks(P, store.stars);
    if (d.invited)
      P.invited = true;
    if (d.peak)
      P.peak = true;
    P.freeThemes = Array.isArray(o.freeThemes) ? o.freeThemes.filter((n) => Number.isInteger(n) && n >= 0) : [];
    syncFreeThemes();
    return P;
  }
  function addStat({ runs = 0, meters = 0, seconds = 0 } = {}) {
    const st = store.stat;
    st.totalRuns += Math.max(0, Number(runs) || 0);
    st.totalMeters += Math.max(0, Number(meters) || 0);
    st.totalSeconds += Math.max(0, Number(seconds) || 0);
    st.lastPlayed = new Date().toISOString();
    saveStat();
    return st;
  }
  function saveAll() {
    save();
    saveProgress();
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
  function isLegacy20(arr) {
    return Array.isArray(arr) && arr.length > 0 && arr.length < LEVELS.length && arr.length <= 20;
  }
  function highestStarred(arr) {
    let hi = -1;
    for (let i = 0;i < arr.length; i++)
      if (arr[i] > 0)
        hi = i;
    return hi;
  }
  function loadSave() {
    try {
      const persisted = parseInt(rawGet(META_KEYS.slot) || "0", 10);
      store.slot = Number.isFinite(persisted) && persisted >= 0 && persisted < MAX_SLOTS ? persisted : 0;
      store.gold = Math.max(0, intOr(lsGet(SAVE_KEYS.gold)));
      const u = jsonOr(lsGet(SAVE_KEYS.up) || "{}", {});
      if (u && u.engine !== undefined) {
        const id = VEHICLES[store.currentVehicle].id;
        store.upgrades = {};
        store.upgrades[id] = {
          engine: clampLv(u.engine),
          tire: clampLv(u.tire),
          frame: clampLv(u.frame),
          susp: clampLv(u.susp)
        };
      } else {
        store.upgrades = sanitizeUpgrades(u);
      }
      store.unlocked = Math.max(0, Math.min(LEVELS.length - 1, parseInt(lsGet(SAVE_KEYS.unlocked) || "0", 10) || 0));
      store.selLevel = Math.max(0, Math.min(LEVELS.length - 1, parseInt(lsGet(SAVE_KEYS.sel) || "0", 10) || 0));
      const rawStars = jsonOr(lsGet(SAVE_KEYS.stars) || "[]", []);
      const starsArr = (Array.isArray(rawStars) ? rawStars : []).map(clampStar);
      store.currentVehicle = parseInt(lsGet(SAVE_KEYS.veh) || "0", 10) || 0;
      const owned = jsonOr(lsGet(SAVE_KEYS.owned) || "[0]", [0]);
      store.ownedVehicles = (Array.isArray(owned) ? owned : [0]).map((i) => parseInt(i, 10)).filter((i) => Number.isInteger(i) && i >= 0 && i < VEHICLES.length);
      if (!store.ownedVehicles.length)
        store.ownedVehicles = [0];
      if (!store.ownedVehicles.includes(store.currentVehicle)) {
        store.currentVehicle = store.ownedVehicles[0];
      }
      if (!(store.currentVehicle >= 0 && store.currentVehicle < VEHICLES.length)) {
        store.currentVehicle = 0;
      }
      store.muted = lsGet(SAVE_KEYS.mute) === "1";
      store.best = parseInt(lsGet(SAVE_KEYS.best) || "0", 10) || 0;
      const ultraRaw = jsonOr(lsGet(SAVE_KEYS.ultra) || "{}", {});
      store.ultra = ultraRaw && typeof ultraRaw === "object" && !Array.isArray(ultraRaw) ? ultraRaw : {};
      const ver = parseInt(lsGet(SAVE_KEYS.ver) || "0", 10) || 0;
      if (ver < 2) {
        store.gold *= 10;
      }
      let migrated = false;
      let stars = starsArr;
      if (ver < 3 && isLegacy20(starsArr)) {
        migrated = true;
        stars = starsArr.slice(0, LEVELS.length);
        const hi = highestStarred(stars);
        if (store.unlocked < hi + 1) {
          store.unlocked = Math.min(LEVELS.length - 1, hi + 1);
        }
      }
      while (stars.length < LEVELS.length)
        stars.push(0);
      store.stars = stars;
      if (ver < CUR_VER) {
        if (migrated)
          store.progress.branchCleared = deriveBranchCleared();
        lsSet(SAVE_KEYS.ver, String(CUR_VER));
        save();
      }
      if (lsGet("bike_trial") === "1") {
        store.ownedVehicles = VEHICLES.map((v, i) => i);
        if (store.gold < 2000000)
          store.gold = 2000000;
        for (const v of VEHICLES) {
          if (!v.ultra)
            continue;
          const id = v.id;
          if (!store.upgrades[id])
            store.upgrades[id] = { engine: 0, tire: 0, frame: 0, susp: 0 };
          store.upgrades[id].engine = MAX_LV;
          store.upgrades[id].tire = MAX_LV;
          store.upgrades[id].frame = MAX_LV;
          store.upgrades[id].susp = MAX_LV;
          store.ultra[v.id] = true;
        }
        if (!store.ownedVehicles.includes(store.currentVehicle))
          store.currentVehicle = 1;
      }
    } catch (e) {}
  }
  function listSaveKeys() {
    const n = slotIndex();
    const set = new Set(ALL_KEYS);
    try {
      if (typeof localStorage.length === "number" && typeof localStorage.key === "function") {
        const prefix = n === 0 ? "bike_" : `dale_s${n}_bike_`;
        for (let i = 0;i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k)
            continue;
          if (n === 0) {
            if (k.indexOf("bike_") === 0)
              set.add(k);
          } else if (k.indexOf(prefix) === 0) {
            set.add(k.slice(`dale_s${n}_`.length));
          }
        }
      }
    } catch (e) {
      available = false;
    }
    return Array.from(set);
  }
  function exportSave() {
    const data = {};
    for (const k of listSaveKeys()) {
      const v = lsGet(k);
      if (v !== null && v !== undefined)
        data[k] = v;
    }
    return { app: SAVE_APP, format: SAVE_FORMAT, savedAt: new Date().toISOString(), data };
  }
  function saveFileName(d = new Date) {
    const p = (n) => String(n).padStart(2, "0");
    return "dale-bike-save-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + ".json";
  }
  function downloadSave() {
    try {
      if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof document === "undefined") {
        return false;
      }
      const blob = new Blob([JSON.stringify(exportSave(), null, 2)], { type: "application/json" });
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
  function hasBikeKey(obj) {
    return Object.keys(obj).some((k) => k.indexOf("bike_") === 0);
  }
  function pickDataMap(data) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      return {};
    if (data.data && typeof data.data === "object" && !Array.isArray(data.data) && !hasBikeKey(data)) {
      return data.data;
    }
    return data;
  }
  function parseSave(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: "存档内容不是合法 JSON" };
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { ok: false, error: "存档根对象非法" };
    }
    if (obj.app !== SAVE_APP) {
      return { ok: false, error: "不是本游戏的存档（app 不符）" };
    }
    if (obj.format !== SAVE_FORMAT) {
      return { ok: false, error: "不支持的存档格式：" + obj.format };
    }
    const data = obj.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "存档数据非法" };
    }
    return { ok: true, data, summary: summarizeSave(data) };
  }
  function summarizeSave(data) {
    const map = pickDataMap(data);
    const starsRaw = jsonOr(map[SAVE_KEYS.stars], []);
    const stars = Array.isArray(starsRaw) ? starsRaw : [];
    let cleared = 0;
    let totalStars = 0;
    for (const s of stars) {
      const n = Number(s) || 0;
      if (n > 0) {
        cleared++;
        totalStars += n;
      }
    }
    return {
      cleared,
      stars: totalStars,
      rating: Math.max(0, intOr(map[SAVE_KEYS.rating])),
      gold: Math.max(0, intOr(map[SAVE_KEYS.gold]))
    };
  }
  function importSave(data) {
    const map = pickDataMap(data);
    const entries = Object.entries(map).filter(([k, v]) => typeof k === "string" && k.indexOf("bike_") === 0 && v !== null && v !== undefined);
    if (!entries.length)
      return { ok: false, error: "存档不含任何 bike_ 键" };
    for (const k of listSaveKeys())
      lsRemove(k);
    for (const [k, v] of entries)
      lsSet(k, String(v));
    if (!Object.prototype.hasOwnProperty.call(map, SAVE_KEYS.ver)) {
      lsSet(SAVE_KEYS.ver, String(CUR_VER));
    }
    loadSave();
    loadAchList();
    loadProgress();
    return { ok: true, data: map };
  }
  function resetSave() {
    for (const k of listSaveKeys())
      lsRemove(k);
    store.gold = 0;
    store.unlocked = 0;
    store.selLevel = 0;
    store.stars = new Array(LEVELS.length).fill(0);
    store.best = 0;
    store.ownedVehicles = [0];
    store.currentVehicle = 0;
    store.upgrades = {};
    store.ultra = {};
    store.muted = false;
    store.achGot = [];
    store.progress = {
      branchCleared: [],
      finaleDone: false,
      invited: false,
      rating: 0,
      wins: 0,
      losses: 0,
      peak: false,
      freeThemes: []
    };
    store.stat = { totalRuns: 0, totalMeters: 0, totalSeconds: 0, lastPlayed: "" };
    save();
    saveAchList();
    lsSet(SAVE_KEYS.ver, String(CUR_VER));
    return true;
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
      if (e.code === "Minus" || e.code === "Equal") {
        e.preventDefault();
        const z = clamp(store.cam.zoom + (e.code === "Equal" ? 0.15 : -0.15), 0.6, 2.5);
        if (z !== store.cam.zoom) {
          store.cam.zoom = z;
          showToast("缩放 " + Math.round(store.cam.zoom * 100) + "%", 600);
        }
        return;
      }
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
    return levelHillY(levelAt(store.lvIdx), x);
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
    let best = clamp(xx, 140, len - 140);
    let bm = 9;
    for (let d = -170;d <= 170; d += 10) {
      const tx = clamp(xx + d, 140, len - 140);
      const m = Math.abs(groundInfo(tx).m);
      if (m < bm) {
        bm = m;
        best = tx;
      }
    }
    return best;
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
  var ULTRA_SPEED_N = 10;
  var ULTRA_RPM_N = 8;
  var WARP_ACC = 6.5;
  var WARP_V_CAP = 90;
  function activeMode(veh) {
    const v = veh || VEHICLES[store.currentVehicle];
    if (!v || !v.ultra || store.ultra[v.id] !== true)
      return "";
    return v.ultra.mode || "";
  }
  function isUltraStable() {
    return activeMode() === "stable";
  }
  function isCrashImmune() {
    const m = activeMode();
    return m === "shield" || m === "phase" || m === "stable";
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
      const A = wk === "rear" ? b.axleR : b.axleF;
      A.y = wheelY;
      A.py = wheelY;
      A._vy = 0;
    }
    const midY = (b.axleR.y + b.axleF.y) * 0.5;
    b.head.y = midY - SEAT_H;
    b.head.py = midY - SEAT_H;
    b.head._vy = 0;
  }
  function applyUpgrades() {
    const v = VEHICLES[store.currentVehicle];
    const up = getUp();
    Object.assign(store.phys, deriveHandling(v, up));
    const rb = deriveRigidBody(v);
    store.phys.rb = rb;
    store.phys.susp = deriveSuspension(v, up);
    store.phys.mu = deriveFriction(store.phys.TRACTION, v, up);
    store.phys.wheelI = wheelInertia(rb.mW);
    store.phys.MAXVPhys = store.phys.MAXV;
    const mode = activeMode(v);
    if (mode === "surge") {
      store.phys.rpmK *= ULTRA_RPM_N;
      store.phys.MAXV = Math.max(store.phys.MAXV, ULTRA_SPEED_N * REF_SPEED);
      store.phys.mu = Math.max(store.phys.mu, 4);
      store.phys.airDragK = AIR_DRAG_K * 0.1;
    } else if (mode === "railgun") {
      store.phys.torquePeak *= ULTRA_TORQUE_N;
      store.phys.rpmK *= ULTRA_RPM_N * 1.6;
      store.phys.mu = Math.max(store.phys.mu, 3.4);
      store.phys.airDragK = AIR_DRAG_K * 0.2;
      store.phys.MAXV = topSpeedOf(v, { engine: MAX_LV, tire: MAX_LV }) * ULTRA_SPEED_N;
    } else if (mode === "warp") {
      store.phys.MAXV = topSpeedOf(v, { engine: MAX_LV, tire: MAX_LV }) * ULTRA_SPEED_N * 1.6;
      store.phys.rpmK *= 2;
    }
    if (!mode || mode === "stable" || mode === "shield" || mode === "phase") {
      store.phys.airDragK = 0;
    }
    bike.rb = rb;
    bindMasses(rb);
  }
  function bindMasses(rb) {
    const b = bike;
    b.rear.m = rb.mW;
    b.front.m = rb.mW;
    b.axleR.m = rb.mR;
    b.axleF.m = rb.mF;
    b.head.m = rb.mH;
    for (const p of b.pts)
      p.im = p.m > 0 ? 1 / p.m : 0;
  }
  function resetBike(x) {
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
      [b.axleF, x + L, yF]
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
    b.wheelRear = 0;
    b.wheelFront = 0;
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
    const ux = b.axleF.x - b.axleR.x;
    const uy = b.axleF.y - b.axleR.y;
    const d = Math.hypot(ux, uy) || 0.0001;
    const cross = ux / d * (b.head.y - b.axleR.y) - uy / d * (b.head.x - b.axleR.x);
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
    run.runCrashed = true;
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
    const a = Math.atan2(b.axleF.y - b.axleR.y, b.axleF.x - b.axleR.x);
    return { a, tx: Math.cos(a), ty: Math.sin(a), dx: -Math.sin(a), dy: Math.cos(a) };
  }
  function bodyLow(b) {
    return b.head.y > (b.axleR.y + b.axleF.y) * 0.5;
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
    const FN_MAX = FN_MAX_K * store.phys.rb.mTot * store.phys.GRAV;
    for (const wk of WHEELS) {
      const W = b[wk];
      const A = wk === "rear" ? b.axleR : b.axleF;
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
  function applyDrive(b, P, sub, drv, brk, rev) {
    if (isUltraStable()) {
      const sv = systemVel(b);
      const vx = sv.vx;
      let target = 0;
      if (rev)
        target = -(P.MAXVPhys || P.MAXV) * REV_SPEED;
      else if (drv)
        target = P.MAXV * 0.95;
      const maxAcc = P.MAXV * 2;
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
    const wheelieTau = P.rb.mTot * P.GRAV * WHEELBASE * 0.5;
    for (const wk of WHEELS) {
      let w = b.wheelRot[wk];
      let tau = 0;
      if (wk === "rear" && drv)
        tau += clamp(torqueAt(veh, w, drv, P.torquePeak, P.rpmK || 1), -wheelieTau, wheelieTau);
      if (wk === "rear" && rev && !brk) {
        const base = P.MAXVPhys || P.MAXV;
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
    const ax = -sv.vx / sp * (k * sp * sp) / sv.m;
    const ay = -sv.vy / sp * (k * sp * sp) / sv.m;
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
    const FN_MAX = FN_MAX_K * P.rb.mTot * P.GRAV;
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
      let r = Math.max(velDistance(b.axleR, b.axleF, L), velDistance(b.axleR, b.head, Lr), velDistance(b.axleF, b.head, Lr));
      for (const wk of WHEELS) {
        const A = wk === "rear" ? b.axleR : b.axleF;
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
    const dx = b.axleF.x - b.axleR.x;
    const dy = b.axleF.y - b.axleR.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    const ux = dx / d, uy = dy / d;
    const signed = ux * (b.head.y - b.axleR.y) - uy * (b.head.x - b.axleR.x);
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
      let resid = Math.max(projDistance(b.axleR, b.axleF, L), projDistance(b.axleR, b.head, Lr), projDistance(b.axleF, b.head, Lr));
      resid = Math.max(resid, projHeadSide(b));
      for (const wk of WHEELS) {
        const A = wk === "rear" ? b.axleR : b.axleF;
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
      const wMax = AIR_ROT_MAX * veh.air / inv;
      const a = AIR_ROT_ACC * veh.air / inv;
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
    const revK = key.rev && !run.crashed && b.grounded > 0 ? 1 : 0;
    const revReady = revK && systemVel(b).vx < REV_ENTER_V;
    const brkK = (key.left || revK && !revReady) && !run.crashed ? 1 : 0;
    const rev = revReady ? 1 : 0;
    const warp = activeMode() === "warp";
    const prevGrounded = b.grounded;
    const prevSpin = { rear: b.wheelRot.rear, front: b.wheelRot.front };
    const ang0 = Math.atan2(b.front.y - b.rear.y, b.front.x - b.rear.x);
    b._impactV = 0;
    b.penetration = 0;
    b.solverIters = 0;
    b.solverResid = 0;
    for (let s = 0;s < SUB; s++) {
      const sub = SUB_DT;
      syncVel(b, sub);
      for (const p of b.pts)
        p._vy += P.GRAV * sub;
      airControl(b, sub);
      applySuspension(b, SUS, sub);
      applyDrive(b, P, sub, drvK, brkK, rev);
      applyDrag(b, P, sub);
      if (warp && drvK && !run.crashed) {
        const tgt = P.MAXV * 0.98;
        const svw = systemVel(b);
        const add = clamp((tgt - svw.vx) * WARP_ACC * sub, 0, WARP_V_CAP * sub);
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
    b.rearGr = b.fn.rear > 0;
    b.frontGr = b.fn.front > 0;
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
    b.wheelStep = b.wheelRot.rear * DT;
    b.wheelStepF = b.wheelRot.front * DT;
    b.wheelRear = (b.wheelRear + b.wheelStep) % TAU;
    b.wheelFront = (b.wheelFront + b.wheelStepF) % TAU;
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
    const v = VEHICLES[store.currentVehicle];
    const L = store.mode === "level" ? levelAt(store.lvIdx) : null;
    const fk = L ? L.fuelK : 1;
    const use = (0.005 * v.wgt + (key.right && !store.run.crashed ? 0.021 * v.wgt : 0)) * fk;
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
  function updateCamera(dt) {
    if (store.state === "pause")
      return;
    const cam = store.cam;
    const mx = (bike.rear.x + bike.front.x) / 2;
    const my = (bike.rear.y + bike.front.y) / 2;
    const zoom = cam.zoom;
    const spdN = clamp(Math.abs(bike.speed) / Math.max(1, store.phys.MAXV), 0, 1);
    const lead = Math.sign(bike.speed) * spdN * view.W * 0.055 / zoom;
    const maxX = store.mode === "free" ? Infinity : Math.max(0, store.finishX - view.W * 0.45 / zoom);
    const targetX = clamp(mx + lead - view.W * 0.38 / zoom, 0, maxX);
    const targetY = my - view.H * 0.55 / zoom + spdN * view.H * 0.02;
    cam.x = lerp(cam.x, targetX, 0.1);
    cam.y = lerp(cam.y, targetY, 0.3);
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
  function hasAch(id) {
    return store.achGot.includes(id);
  }
  function addGold(n) {
    if (!n)
      return;
    store.gold += n;
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
  var BOOST_HAZARD_GAP = 400;
  function measureBottomY(L) {
    let max = -Infinity;
    for (let x = 0;x <= L.len; x += 25) {
      const y = levelHillY(L, x);
      if (y > max)
        max = y;
    }
    return isFinite(max) ? max : 300;
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
    const trees = [];
    const rocks = [];
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
        trees.push(item);
      else
        rocks.push(item);
    }
    return { trees, rocks };
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
    const x0 = L.len * 0.22;
    const x1 = L.len * 0.94;
    for (let i = 0;i < n; i++) {
      const x = Math.round(x0 + (x1 - x0) * (i + 1) / n);
      out.push({ x, limit: (x + GATE_START_ALLOW) / spd, passed: false });
    }
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
  function buildLevel(idx) {
    store.lvIdx = idx;
    const L = levelAt(idx);
    const rng = mulberry32(1000 + idx * 97);
    store.finishX = L.len;
    const th0 = segmentThemeAt(L, 0);
    store.phys.theme = th0;
    store.phys.minY = measureBottomY(L);
    const T = THEMES[th0] || THEMES[0];
    store.phys.GRAV = T.g;
    store.phys.TRACTION = T.traction;
    const coins = [];
    for (let i = 0;i < L.coinN; i++) {
      const cx = L.len * 0.15 + i * (L.len * 0.75) / (L.coinN - 1);
      coins.push({ x: cx, y: groundY(cx) - 35, taken: false, ph: rng() * 6.28 });
    }
    const vh = VEHICLES[store.currentVehicle];
    const up = getUp();
    const fMax = vh.tank * (1 + 0.004 * up.frame);
    const kIdle = 0.005 * vh.wgt / fMax * L.fuelK;
    const kFull = 0.021 * vh.wgt / fMax * L.fuelK;
    const kAvg = kIdle + 0.62 * (kFull - kIdle);
    const vAvg = 0.78 * REF_SPEED * vh.spd;
    const range = vAvg / kAvg;
    const need = L.len / range;
    const M = 1.3 - 0.25 * L.ramp;
    const budgetCans = Math.max(1, Math.min(6, Math.ceil((need * M - 1) / CAN_FUEL)));
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
    const boosts = [];
    const boostN = Math.max(1, 3 - Math.round(L.ramp * 2));
    const inHazardZone = (x) => hazards.some((h) => x > h.x0 - BOOST_HAZARD_GAP && x < h.x1 + BOOST_HAZARD_GAP);
    const spots = [];
    const safe = [];
    for (let x = 120;x <= L.len - 320; x += 12) {
      if (inHazardZone(x))
        continue;
      safe.push(x);
      if (groundInfo(x).m < 0.25 && groundInfo(x + 240).m < -0.35)
        spots.push(x);
    }
    const used = [];
    const pick = (list, seed) => {
      let best = null;
      for (const x of list) {
        if (used.some((u) => Math.abs(u - x) < 600))
          continue;
        if (best === null || Math.abs(x - seed) < Math.abs(best - seed))
          best = x;
      }
      return best;
    };
    for (let k = 1;k <= boostN; k++) {
      const seed = L.len * (0.12 + 0.76 * k / (boostN + 1));
      let bx = pick(spots, seed);
      if (bx === null)
        bx = pick(safe, seed);
      if (bx === null)
        continue;
      used.push(bx);
      boosts.push({ x: bx, y: groundY(bx) - 4, taken: false, ph: rng() * 6.28 });
    }
    const deco = buildDeco(L, mulberry32(5000 + idx * 131));
    world.coins = coins;
    world.canisters = canisters;
    world.boosts = boosts;
    world.decoTree = deco.trees;
    world.decoRock = deco.rocks;
    world.hazards = hazards;
    world.gates = buildGates(L);
    world.jumps = buildJumps(L);
  }
  function syncSegmentTheme(L, x) {
    const th = segmentThemeAt(L, x);
    if (th === store.phys.theme)
      return false;
    const T = THEMES[th] || THEMES[0];
    store.phys.theme = th;
    store.phys.GRAV = T.g;
    store.phys.TRACTION = T.traction;
    return true;
  }
  function freeInit(theme) {
    store.mode = "free";
    store.lvIdx = 0;
    store.finishX = Infinity;
    const th = freeThemeOf(theme);
    store.phys.theme = th;
    store.phys.minY = 0;
    store.phys.GRAV = (THEMES[th] || THEMES[0]).g;
    store.phys.TRACTION = (THEMES[th] || THEMES[0]).traction;
    world.coins = [];
    world.canisters = [];
    world.boosts = [];
    world.decoTree = [];
    world.decoRock = [];
    world.hazards = [];
    world.gates = [];
    world.jumps = [];
    world.prepFuel = 0;
    world.freeGenX = 0;
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
    const viewR = store.cam.x + view.W * 2;
    let guard = 0;
    while (world.freeGenX < viewR && guard++ < 200) {
      const d = Math.max(0, world.freeGenX - 400);
      const diff = Math.min(1, d / 120000);
      const diffS = diff * diff * (3 - 2 * diff);
      const x = world.freeGenX;
      const gy = groundY(x);
      if (gy !== Infinity) {
        if (rng() < 0.85 - diffS * 0.4) {
          world.coins.push({ x, y: gy - 30, taken: false, ph: rng() * 6.28 });
        }
        if (rng() < 0.11) {
          world.canisters.push({ x, y: gy - 26, taken: false, ph: rng() * 6.28 });
        }
        const T = THEMES[store.phys.theme] || THEMES[0];
        const deco = T.deco && T.deco.length ? T.deco : THEMES[0].deco;
        if (rng() < 0.6) {
          world.decoTree.push({ x: x + 60, y: groundY(x + 60), kind: deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
        } else if (rng() < 0.3) {
          world.decoRock.push({ x: x + 90, y: groundY(x + 90), kind: deco[1] || deco[0], s: 0.7 + rng() * 0.7, ph: rng() * 6.28 });
        }
      }
      world.freeGenX += Math.round(170 + diffS * 260 + rng() * 280);
    }
    world.coins = world.coins.filter((c) => c.x > store.cam.x - 400 && !c.taken);
    world.canisters = world.canisters.filter((c) => c.x > store.cam.x - 400 && !c.taken);
    world.decoTree = world.decoTree.filter((c) => c.x > store.cam.x - 500);
    world.decoRock = world.decoRock.filter((c) => c.x > store.cam.x - 500);
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
        store.run.coinGot++;
        addGold(30);
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
  function rankedAIScale(rating, advanced) {
    const r = Math.max(0, Number(rating) || 0);
    const t = Math.min(1, r / RATING_PEAK);
    return advanced ? RANKED_BASE_ADV + RANKED_GAIN_ADV * t : RANKED_BASE + RANKED_GAIN * t;
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
  function raceInit() {
    store.raceAI = { x: START_X, spd: 0, finish: false };
  }
  function raceUpdate(dt) {
    const ai = store.raceAI;
    if (!ai || ai.finish)
      return;
    const gi = groundInfo(ai.x);
    if (gi.y === Infinity)
      return;
    const L = levelAt(store.lvIdx);
    let mult;
    if (store.mode === "ranked") {
      mult = rankedAIScale(store.progress.rating, store.rankedAdvanced);
    } else {
      const playerX = (bike.rear.x + bike.front.x) / 2;
      mult = RACE_PACE * catchupFactor(ai.x - playerX);
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
  function resetRunState() {
    const run = store.run;
    run.gen++;
    run.crashed = false;
    run.crashTimer = 0;
    run.clearing = false;
    run.lastSafeX = START_X;
    run.runCrashed = false;
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
    if (store.mode === "race" || store.mode === "ranked")
      raceInit();
    store.state = "play";
    presenter.hideOverlay();
  }
  function settleRanked(won) {
    const P = store.progress;
    const adv = store.rankedAdvanced === true;
    const before = P.rating;
    const delta = won ? adv ? RATING_WIN_GAIN_ADVANCED : RATING_WIN_GAIN : -(adv ? RATING_LOSS_ADVANCED : RATING_LOSS);
    P.rating = Math.max(RATING_MIN, before + delta);
    const applied = P.rating - before;
    if (won)
      P.wins++;
    else
      P.losses++;
    settleProgress();
    showToast((won ? "\uD83C\uDFC6 排位胜利" : "\uD83C\uDFF3 排位失利") + (adv ? " · 高级赛" : " · 排位赛") + " · 段位分 " + (applied > 0 ? "+" : "") + applied + " → " + P.rating + "（" + rankName(P.rating) + "）" + " · " + P.wins + "胜" + P.losses + "负", 1800);
    return P.rating;
  }
  function startGame(m, lv, opt) {
    try {
      const mode = m || store.lastMode;
      if (mode === "ranked" && !store.progress.invited) {
        showToast("\uD83D\uDD12 尚未收到排位赛邀请（通关最终任务后解锁）", 1500);
        return;
      }
      store.lastMode = mode;
      store.mode = mode;
      const wantAdv = opt && opt.advanced !== undefined ? !!opt.advanced : store.rankedAdvanced === true;
      store.rankedAdvanced = mode === "ranked" && wantAdv && isAdvancedUnlocked(store.progress.rating);
      store.selLevel = lv !== undefined ? lv : store.selLevel || 0;
      if (store.mode === "free")
        freeInit(opt && opt.theme);
      else
        buildLevel(store.selLevel);
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
      buildLevel(store.selLevel);
      applyUpgrades();
      resetBike(START_X);
      resetRunState();
      store.cam.x = 0;
      fillTank();
      const NL = levelAt(store.selLevel);
      showToast("关卡 " + (store.selLevel + 1) + " · " + NL.name + " · " + (THEMES[segmentThemeAt(NL, 0)] || THEMES[0]).name, 800);
      store.state = "play";
      presenter.hideOverlay();
    } else {
      presenter.toMenu();
      if (store.mode === "level" && store.selLevel >= LEVELS.length - 1)
        showToast("\uD83C\uDF89 全部通关！");
    }
  }
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
      const mx = (bike.rear.x + bike.front.x) / 2;
      const dist = Math.round(toM(mx));
      let record = false;
      if (dist > store.best) {
        store.best = dist;
        save();
        record = true;
      }
      store.state = "ended";
      addStat({
        runs: 1,
        meters: dist,
        seconds: Math.max(0, store.time - store.run.levelStartTime)
      });
      showToast("⛽ 燃料耗尽 · 本次 " + dist + "m" + (record ? " \uD83C\uDFC5 新纪录！" : ""), 1600);
      setTimeout(runGuard(() => {
        store.state = "menu";
        presenter.toMenu();
        store.raceAI = null;
      }), 1600);
    } else {
      setFuel(store.phys.fuelMax * 0.3);
      respawn();
      showToast("⛽ 燃料耗尽！回到安全点", 900);
    }
  }
  function finishLevel() {
    const run = store.run;
    const L = levelAt(store.selLevel);
    run.clearing = true;
    const result = {
      title: "\uD83C\uDFC1 本局结束",
      stars: undefined,
      goldGain: 0,
      goldTotal: 0,
      time: undefined,
      nextLabel: "下一关 →"
    };
    if (store.mode === "race") {
      const won = !(store.raceAI && store.raceAI.finish);
      result.nextLabel = "继续 →";
      if (won) {
        addGold(300);
        showToast("\uD83C\uDFC6 比赛获胜！\uD83E\uDE99+300", 900, "success");
        result.title = "\uD83C\uDFC6 比赛获胜！";
        result.goldGain = 300;
      } else {
        showToast("\uD83C\uDFC1 抵达终点（对手更快）", 900, "warn");
        result.title = "\uD83C\uDFC1 抵达终点（对手更快）";
      }
    } else if (store.mode === "ranked") {
      const won = !(store.raceAI && store.raceAI.finish);
      const before = store.progress.rating;
      const after = settleRanked(won);
      result.title = won ? "\uD83C\uDFC6 排位胜利" : "\uD83C\uDFF3 排位失利";
      result.ratingDelta = after - before;
      result.rating = after;
      result.nextLabel = "继续 →";
    } else if (store.mode === "level") {
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
      addGold(200);
      showToast("\uD83C\uDFC1 通关 " + "★".repeat(s) + "！\uD83E\uDE99+200", 900, "success");
      result.title = "\uD83C\uDFC1 通关";
      result.stars = s;
      result.goldGain = 200;
      result.time = elapsed;
      result.nextLabel = store.selLevel < LEVELS.length - 1 ? "下一关 →" : "\uD83C\uDFE0 返回菜单";
      if (!run.runCrashed)
        checkAch("noc");
      if (run.totalCoins > 0 && run.coinGot >= run.totalCoins)
        checkAch("coinall");
      if (store.stars.length >= LEVELS.length && store.stars.every((v) => v >= 3))
        checkAch("allstar");
      settleProgress();
    }
    addStat({
      runs: 1,
      meters: toM(store.finishX),
      seconds: Math.max(0, store.time - run.levelStartTime)
    });
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
    run.clearing = true;
    run.failed = true;
    showToast("⏱ 限时门超时！本关判负（不计星、不解锁）", 1800);
    setTimeout(runGuard(() => {
      store.state = "menu";
      presenter.toMenu();
    }), 1800);
  }
  function belowWorld(midX, midY) {
    const base = store.mode === "free" ? groundY(midX) + 800 : store.phys.minY + 800;
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
    if (b.locked) {
      if (key.right || key.left) {
        b.locked = false;
      } else {
        pinBike();
        return;
      }
    }
    store.time += dt;
    stepPhysics();
    if (store.mode === "level") {
      syncSegmentTheme(levelAt(store.lvIdx), (b.rear.x + b.front.x) / 2);
    }
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
    if (!run.crashed && belowWorld(mid, midY))
      pitRewind();
    updateCoins();
    updateCanisters();
    updateBoosts(dt);
    updateJumps();
    if (!fuelOk)
      handleFuelEmpty();
    if (toKmh(Math.abs(b.speed)) >= 30)
      checkAch("fast");
    if (store.mode === "level" && !run.clearing) {
      if (!run.crashed && world.hazards.length) {
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
          }
        }
      }
    }
    if (store.mode === "race" || store.mode === "ranked") {
      raceUpdate(dt);
      if (store.raceAI && store.raceAI.finish && !run.clearing) {
        run.clearing = true;
        if (store.mode === "ranked") {
          settleRanked(false);
        } else {
          showToast("\uD83D\uDE35 对手先到终点！");
        }
        setTimeout(runGuard(() => nextLevel()), 900);
      }
    }
    if (store.mode === "free") {
      freeFill();
    } else if (!run.clearing && mid > store.finishX) {
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
    let weak = view.W < 560;
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
    for (let x = 0;x <= view.W; x += step) {
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
      for (let dy = 12;dy <= 48; dy += 12) {
        ctx.beginPath();
        for (let x = 0;x <= view.W; x += 10) {
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
  var gBuf = new Float64Array(4096);
  var gOk = new Uint8Array(4096);
  var lBuf = new Float64Array(4096);
  function invalidateGround() {
    gOk.fill(0);
  }
  function groundBuf(cx) {
    const n = Math.min(4096, Math.ceil(view.W / GS) + 2 | 0);
    for (let i = 0;i < n; i++) {
      if (!gOk[i]) {
        gBuf[i] = groundY(cx + i * GS);
        gOk[i] = 1;
      }
    }
    return n;
  }
  function drawTerrain(cx, cy) {
    const W = view.W;
    const H = view.H;
    const T = THEMES[store.phys.theme] || THEMES[0];
    const pal = T.pal;
    invalidateGround();
    const n = groundBuf(cx);
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    ctx.moveTo(0, cy);
    let lastG = cy;
    for (let i = 0, x = 0;x <= W; x += GS, i++) {
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
    for (let i = 0, x = 0;x <= W; x += GS, i++) {
      const gy = gBuf[i];
      if (gy === Infinity)
        continue;
      ctx.lineTo(x, gy - cy - 8);
    }
    ctx.stroke();
    ctx.fillStyle = token("fx-shadow-faint");
    ctx.beginPath();
    ctx.moveTo(0, cy);
    for (let i = 0, x = 0;x <= W; x += GS, i++) {
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
      const segs = Math.ceil(W / GS) + 1;
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
        for (let i = 0, x = 0;x <= W; x += GS, i++) {
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
  function drawDeco(cx, cy) {
    const q = getQuality();
    const shade = q === "medium" || q === "high";
    for (const t of world.decoTree) {
      const sx = t.x - cx;
      if (sx < -60 || sx > view.W + 60)
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
    for (const r of world.decoRock) {
      const sx = r.x - cx;
      if (sx < -60 || sx > view.W + 60)
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
      if (sx < -20 || sx > view.W + 20)
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
      if (sx < -30 || sx > view.W + 30)
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
      if (sx < -60 || sx > view.W + 60)
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
    if (sx < -20 || sx > view.W + 20)
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
      if (sx < -90 || sx > view.W + 90)
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
      if (b < -80 || a > view.W + 80)
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
      if (px < -80 || px > view.W + 80)
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
      if (sx < -80 || sx > view.W + 80)
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
    const wheelRps = Math.abs(b.wheelStep) / DT;
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
    for (const [off, spin, step] of [[-hw, P.wheelRear, P.wheelStep], [hw, P.wheelFront, P.wheelStepF]]) {
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
    ctx.strokeStyle = token("obj-rider-skin-2");
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-hw * 0.2, glyphY);
    ctx.lineTo(hw * 0.5, glyphY - 8);
    ctx.stroke();
    const susY = sq2 * 3.5;
    const suitCol = token("obj-platform");
    const suitDark = token("obj-bike-dark");
    const suitFar = token("obj-platform-dark");
    const suitFarDark = token("obj-suit-far-dark");
    const bbX = -hw * 0.32;
    const bbY = -2.5 + susY;
    const cr = 5.8;
    const hipX = -12.5;
    const hipY = glyphY - 6.3 + susY;
    const shX = 2.5 + (POSE.shX || 0);
    const shY = glyphY - 19.8 + susY + (POSE.shY || 0);
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

  // src/render/hud.js
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
    return { info, fuel, race, warn, speed, drive };
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
    if (store.mode === "race" || store.mode === "ranked")
      drawRaceBar(L.race);
    drawSpeedGauge(L.speed);
    if (L.drive)
      drawDriveIndicator(L.drive);
    if (w)
      drawWarning(L.warn, w);
    drawSpeedLines();
  }
  function drawInfoCard(r) {
    const x = r.x;
    const L = levelAt(store.selLevel) || LEVELS[0];
    const compact = view.W < 520 || view.H < 480;
    const title = store.mode === "free" ? "♾ 自由模式" : store.mode === "race" || store.mode === "ranked" ? "\uD83C\uDFC6 " + (store.mode === "ranked" ? "排位赛" : "比赛") + " 第" + (store.selLevel + 1) + "关" : "关卡 " + (store.selLevel + 1) + (compact ? "" : " · " + L.name);
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
    if ((store.mode === "race" || store.mode === "ranked") && store.raceAI) {
      const lead = (bike.rear.x + bike.front.x) / 2 - store.raceAI.x;
      const txt = lead >= 0 ? "领先 " + Math.round(toM(lead)) + "m" : "落后 " + Math.round(toM(-lead)) + "m";
      badgeText(txt, bx, r.y + 1, token("glass-fill-strong"), lead >= 0 ? token("success") : token("danger"));
    }
    const info = [];
    if (store.mode === "free") {
      info.push("里程 " + Math.round(toM((bike.rear.x + bike.front.x) / 2)) + "m" + (store.best > 0 ? " · 最佳 " + store.best + "m" : ""));
    } else {
      const g = store.mode === "level" ? world.gates[store.run.gateIdx] : null;
      if (g) {
        const ride = store.time - store.run.levelStartTime - store.run.crashStall;
        const rem = Math.max(0, g.limit - ride);
        info.push("⏱ 第" + (store.run.gateIdx + 1) + "门 " + rem.toFixed(1) + "s");
      }
      if (!info.length)
        info.push("缩放 " + Math.round(store.cam.zoom * 100) + "% · R 重启 · +/- 缩放");
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
    const maxK = toKmh(store.phys.MAXV) || 1;
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
    label(String(Math.round(kmh)), cx, cy + 4, "display", token("text-hi"), "center");
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
    const intensBase = q === "high" ? 0.42 : 0.3;
    const intens = clamp(spd / SPEEDLINE_REF, 0, 1) * intensBase;
    const n = q === "high" ? 16 : 12;
    ctx.strokeStyle = token("obj-glass-mid");
    ctx.globalAlpha = intens;
    ctx.lineWidth = q === "high" ? 1.7 : 1.5;
    for (let i = 0;i < n; i++) {
      const x = Math.random() * view.W;
      const y = Math.random() * view.H * 0.62;
      const l = 10 + Math.random() * (q === "high" ? 34 : 25);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - l * Math.sign(bike.speed || 1), y);
      ctx.stroke();
    }
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
    drawBikeShadow();
    if (store.state === "play" || store.state === "ended" || store.state === "pause")
      drawBike(dt);
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
  function clearedCount() {
    let n = 0;
    for (let i = 0;i < LEVELS.length; i++)
      if ((store.stars[i] || 0) >= 1)
        n++;
    return n;
  }
  function renderHeroSummary() {
    if (!heroSummary)
      return;
    heroSummary.innerHTML = [
      chip("通关 " + clearedCount() + "/" + LEVELS.length),
      chip("\uD83E\uDE99 " + store.gold, "gold")
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
  function showPanel(html) {
    setMenuGroupsVisible(false);
    modePanel.innerHTML = html;
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
    const stars = res.stars === undefined ? null : Math.max(0, Math.min(3, res.stars));
    const starHtml = stars === null ? "" : `<div class="resultStars">${[0, 1, 2].map((i) => badge(i < stars ? "★" : "☆", i < stars ? "star" : "lock", { lg: true, attrs: `style="--i:${i}"` })).join("")}</div>`;
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
      selectMode("level");
    };
    uiHooks.onHome();
    refreshMenuButtons();
  }
  function selectMode(mode) {
    const m = mode === "race" || mode === "ranked" || mode === "free" ? mode : "level";
    for (const b of document.querySelectorAll("#modeTabs .mtab")) {
      const on = b.dataset.mode === m;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    }
    if (m === "level" || m === "race") {
      hidePanel();
      if (homeView2)
        homeView2.style.display = "";
      renderHomeView(m);
    } else {
      if (homeView2)
        homeView2.style.display = "none";
      if (m === "ranked")
        renderRankedPanel();
      else
        renderFreePanel();
    }
  }
  function renderHomeView(mode) {
    const host = document.getElementById("homeView");
    if (!host)
      return;
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
    const done = clearedCount2();
    const total = LEVELS.length;
    const unlocked = done >= total;
    const cleared = store.progress.finaleDone === true;
    return card({
      cls: "vehCard finaleTile",
      icon: unlocked ? "\uD83C\uDFAF" : "\uD83D\uDD12",
      title: FINALE.name,
      sub: `${Math.round(toM(FINALE.len))}m · 依次穿越 6 个场景 · 坡度 ${Math.round(FINALE.maxSlope)}°`,
      meta: cleared ? "✅ 已通关，可重复挑战" : unlocked ? "已解锁 · 点击开始" : `通关全部 ${total} 关后解锁`,
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
      case "finaleStart":
        api.startGame("level", FINALE_INDEX);
        return;
      case "ranked":
        api.startGame("ranked", store.selLevel || 0, { advanced: el.dataset.adv === "1" });
        return;
      case "freeRandom":
        api.startGame("free");
        return;
      case "free":
        api.startGame("free", undefined, { theme: +el.dataset.theme });
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
    const home = document.getElementById("homeView");
    if (home && home.innerHTML) {
      renderHomeView(panelKind === "race" ? "race" : "level");
      return;
    }
    if (panelKind === "race")
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
  function clearedCount2() {
    let n = 0;
    for (let i = 0;i < LEVELS.length; i++)
      if ((store.stars[i] || 0) >= 1)
        n++;
    return n;
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
    let stars = 0;
    for (let k = 0;k < LEVELS_PER_BRANCH; k++)
      stars += store.stars[globalIndexOf(bi, k)] || 0;
    const cleared = branchCleared(bi);
    const done = cleared >= LEVELS_PER_BRANCH;
    const nextK = firstLockedK(bi);
    const front = open && !done && nextK < LEVELS_PER_BRANCH;
    return card({
      cls: "branchCard" + (front ? " frontier" : ""),
      icon: `<div class="brThumb"></div>`,
      title: `${open ? "" : "\uD83D\uDD12 "}${b.name}`,
      sub: front ? `▶ 继续 第 ${nextK + 1} 关 · 场景「${th.name}」` : `场景「${th.name}」 · ${b.desc}`,
      meta: chip(`★ ${stars}/${LEVELS_PER_BRANCH * 3}`, "gold") + (done ? " " + badge("已通关", "success") : ""),
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
    const stars = locked ? "\uD83D\uDD12 未解锁" : st > 0 ? "★".repeat(st) + "☆".repeat(3 - st) : "☆☆☆";
    const label = `${BRANCHES[bi].name} 第${k + 1}关 ${v.name} 坡度${Math.round(L.maxSlope)}度 三星时限${Math.round(starTime(L))}秒 ${locked ? "未解锁" : st + "星"}${isCur ? "，当前关卡" : isNext ? "，下一关" : ""}`;
    const cls = locked ? " locked" : isCur ? " cur" : st > 0 ? " done" : " next";
    const head = isCur ? '<span class="lvNext">\uD83D\uDCCD 当前关卡</span>' : isNext ? '<span class="lvNext">▶ 下一关</span>' : "第" + (k + 1) + "关";
    return `<div class="lvCell${cls}" data-act="play" data-gi="${gi}"
      role="button" tabindex="0" aria-label="${label}">
    <div>${head}</div>
    <div class="thm">${badge(v.icon + " " + v.name, "variant")}</div>
    <div class="thm">坡度 ${Math.round(L.maxSlope)}° · ${Math.round(toM(L.len))}m</div>
    <div class="thm">三星 ≤ ${fmtClock(starTime(L))}</div>
    <div class="stars">${stars}</div>
  </div>`;
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
    openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
    showPanel(`<div class="modeTitle">\uD83C\uDFC1 闯关模式 · 支线任务</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock(true) : ""}
  <div class="panelNote">星级：通关 1★ · 金币 70% 以上 2★ · 快速通关 3★ ｜ 支线内链式解锁，支线之间可并行推进</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
  }
  function renderRacePanel(openBi) {
    panelKind = "race";
    openBranch = Number.isInteger(openBi) && branchOpen(openBi) ? openBi : -1;
    showPanel(`<div class="modeTitle">\uD83C\uDFC6 比赛模式 · 与 AI 竞速</div>
  <div class="branchWall">${BRANCHES.map((_, i) => branchCard(i)).join("")}</div>
  ${openBranch >= 0 ? levelBlock(true) : ""}
  <div class="panelNote">先到终点赢 300 \uD83E\uDE99（赛道需已解锁）</div>
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
    api.startGame(panelKind === "race" ? "race" : "level", gi);
  }
  function rankedTier(advanced, label, desc, ok, note) {
    return card({
      cls: "vehCard",
      icon: ok ? advanced ? "\uD83D\uDD25" : "\uD83C\uDFC6" : "\uD83D\uDD12",
      title: label,
      sub: desc,
      meta: note,
      interactive: ok,
      locked: !ok,
      attrs: ok ? `data-act="ranked" data-adv="${advanced ? 1 : 0}"` : ""
    });
  }
  function renderRankedPanel() {
    const P = store.progress;
    const rating = P.rating || 0;
    const invited = P.invited === true;
    const adv = isAdvancedUnlocked(rating);
    const segIdx = Number.isInteger(store.selLevel) ? store.selLevel : 0;
    const seg = LEVELS[segIdx] || LEVELS[0];
    showPanel(`<div class="modeTitle">\uD83C\uDFC6 排位赛${P.peak ? " · 已登顶" : ""}</div>
  <div class="rankBox">
    <div class="rankScore">${rating}</div>
    <div class="rankSub">段位：${rankName(rating)} · 战绩 ${P.wins} 胜 ${P.losses} 负</div>
  </div>
  ${invited ? "" : `<div class="panelNote">\uD83D\uDD12 尚未收到排位赛邀请：通关「最终任务」后解锁</div>`}
  ${rankedTier(false, "普通排位赛", "AI 配速随段位分提升（三星节奏的 0.70× → 0.90×）", invited, invited ? `胜 +${RATING_WIN_GAIN} / 负 -${RATING_LOSS}` : "未解锁")}
  ${rankedTier(true, "高级排位赛", "AI 配速显著更高，可超过三星节奏（0.95× → 1.25×）", invited && adv, !invited ? "未解锁" : adv ? `胜 +${RATING_WIN_GAIN_ADVANCED} / 负 -${RATING_LOSS_ADVANCED}` : `段位分 ≥ ${RATING_ADVANCED} 解锁（当前 ${rating}）`)}
  <div class="panelNote">赛道：第 ${segIdx + 1} 关 · ${seg.name}（随你最近选择的关卡）</div>
  <div class="panelNote">登顶（段位分 ≥ ${RATING_PEAK}）解锁无限模式自由选图${P.peak ? " · 已达成" : ""}</div>
  <button class="btn backBtn" data-act="back">返回</button>`);
  }
  function renderFreePanel() {
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
  var MAXED = { engine: MAX_LV, tire: MAX_LV, frame: MAX_LV, susp: MAX_LV };
  function renderGaragePanel() {
    panelKind = "garage";
    showPanel(`<div class="modeTitle">\uD83C\uDFCD️ 车库</div>
  ${VEHICLES.map((v, i) => {
      const own = store.ownedVehicles.includes(i);
      const sel = i === store.currentVehicle;
      return card({
        cls: "vehCard",
        icon: v.icon,
        title: v.name,
        sub: v.desc,
        meta: `速度${Math.round(v.spd * 100)}% · 驱动${Math.round(v.drv * 100)}% · 抓地${Math.round(v.grp * 100)}% · 旋转${Math.round(v.air * 100)}% · 油箱${Math.round(v.tank * 100)}% · 满级极速 <b>${Math.round(toKmh(topSpeedOf(v, MAXED)))} km/h</b>`,
        right: sel ? "✅ 使用中" : own ? "已拥有" : "\uD83E\uDE99 " + v.price.toLocaleString(),
        interactive: true,
        selected: sel,
        attrs: `data-act="veh" data-veh="${i}"`
      }) + (v.ultra ? ultraBlock(v, i) : "");
    }).join("")}
  <div class="panelNote" id="pnNote"></div>
  <button class="btn backBtn" data-act="back">返回</button>`);
  }
  function allMaxed(id) {
    const u = store.upgrades[id];
    return !!u && u.engine >= MAX_LV && u.tire >= MAX_LV && u.frame >= MAX_LV && u.susp >= MAX_LV;
  }
  function ultraBlock(v, i) {
    if (store.ultra[v.id] === true) {
      return `<div class="ultraRow got">${v.ultra.icon} 特殊模式「${v.ultra.name}」已开启 · ${v.ultra.desc}</div>`;
    }
    if (!allMaxed(v.id)) {
      return `<div class="ultraRow lock">\uD83D\uDD12 ${v.ultra.icon} ${v.ultra.name}：${v.ultra.desc}（全部升级满级 Lv${MAX_LV} 后解锁）</div>`;
    }
    return `<div class="ultraRow buy">
    <button class="btn sm" data-act="buyUltra" data-veh="${i}">${v.ultra.icon} 解锁「${v.ultra.name}」 · ${v.ultra.cost.toLocaleString()} \uD83E\uDE99</button>
    <div class="ultraDesc">${v.ultra.desc}</div>
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
      showToast("\uD83E\uDE99 金币不足，需要 " + v.ultra.cost.toLocaleString(), 900);
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
    saveView.pending = null;
    saveView.summary = null;
    saveView.error = "";
    saveView.note = "";
    saveView.confirmReset = false;
    renderSavePanel();
  }
  function currentSummary() {
    let cleared = 0;
    let stars = 0;
    for (let i = 0;i < LEVELS.length; i++) {
      const s = store.stars[i] || 0;
      if (s > 0) {
        cleared++;
        stars += s;
      }
    }
    return { cleared, stars, rating: store.progress.rating || 0, gold: store.gold || 0 };
  }
  function compareBox(cur, imp) {
    const row = (label, a, b) => `<div class="cmpRow"><span>${label}</span><b>${a} → ${b}</b></div>`;
    return `<div class="cmpBox">
    <div class="cmpRow" style="opacity:.7"><span>项目</span><b>当前 → 导入</b></div>
    ${row("已通关", cur.cleared, imp.cleared)}
    ${row("总星数", cur.stars, imp.stars)}
    ${row("段位分", cur.rating, imp.rating)}
    ${row("金币", cur.gold, imp.gold)}
  </div>`;
  }
  function renderSavePanel() {
    const st = store.stat || {};
    const cur = currentSummary();
    const rating = store.progress.rating || 0;
    const stor = isStorageAvailable();
    const cmp = saveView.pending && saveView.summary ? `${compareBox(cur, saveView.summary)}
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
      { label: "金币", value: `\uD83E\uDE99 ${store.gold}` },
      { label: "累计里程", value: fmtKm(st.totalMeters) },
      { label: "累计时长", value: fmtHours(st.totalSeconds) },
      { label: "最后游玩", value: fmtDate(st.lastPlayed) }
    ])}
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
      极速: Math.round(toKmh(h.MAXV)),
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
    const goldEl = document.getElementById("shopGold");
    if (goldEl)
      goldEl.textContent = store.gold;
    const st = document.getElementById("shopTitle");
    if (st)
      st.textContent = "\uD83D\uDEE0 升级 " + VEHICLES[store.currentVehicle].icon + " " + VEHICLES[store.currentVehicle].name;
    const u = getUp();
    const ultraEl = document.getElementById("shopUltra");
    if (ultraEl) {
      const v = VEHICLES[store.currentVehicle];
      if (v.ultra) {
        const got = store.ultra[v.id] === true;
        const full4 = ["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= MAX_LV);
        ultraEl.className = "upUltra" + (got ? " got" : full4 ? " canBuy" : "");
        if (got) {
          ultraEl.textContent = v.ultra.icon + " 特殊模式「" + v.ultra.name + "」已开启 · " + v.ultra.desc;
        } else if (full4) {
          ultraEl.textContent = "⭐ 已全部升满！到车库花 " + v.ultra.cost.toLocaleString() + " \uD83E\uDE99 解锁「" + v.ultra.name + "」";
        } else {
          ultraEl.textContent = "\uD83D\uDD12 全部升级升到 Lv" + MAX_LV + " 后可解锁特殊模式「" + v.ultra.name + "」：" + v.ultra.desc;
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
        lvEl.textContent = "Lv " + lv;
      const btn = document.querySelector('[data-buy="' + k + '"]');
      if (!btn)
        continue;
      const dg = document.getElementById("dg-" + k);
      const now = previewStats(VEHICLES[store.currentVehicle], u);
      if (dg) {
        if (lv >= MAX_LV) {
          dg.textContent = UP_TOUCHES[k].map((n) => n + " " + now[n]).join(" · ") + " · 已满级";
          dg.className = "upDelta max";
        } else {
          const next = previewStats(VEHICLES[store.currentVehicle], { ...u, [k]: lv + 1 });
          const changed = UP_TOUCHES[k].filter((n) => next[n] !== now[n]);
          dg.textContent = changed.length ? changed.map((n) => n + " " + now[n] + " → " + next[n]).join(" · ") : "下一级已达该指标上限";
          dg.className = "upDelta";
        }
      }
      if (lv >= MAX_LV) {
        btn.textContent = "已满级";
        btn.disabled = true;
        btn.style.opacity = 0.5;
      } else {
        const c = upCost(lv + 1);
        btn.textContent = "升级 " + c + " \uD83E\uDE99";
        btn.disabled = store.gold < c;
        btn.style.opacity = 1;
      }
    }
  }
  function buyUpgrade(k) {
    const u = getUp();
    const lv = u[k] || 0;
    if (lv >= MAX_LV)
      return;
    const c = upCost(lv + 1);
    const note = document.getElementById("shopNote");
    if (store.gold < c) {
      if (note)
        note.textContent = "金币不足，去关卡里收集吧！";
      return;
    }
    const before = previewStats(VEHICLES[store.currentVehicle], u);
    store.gold -= c;
    u[k] = lv + 1;
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
  buildLevel(0);
  applyUpgrades();
  resetBike(START_X);
  var stepper = new Stepper((dt) => {
    update(dt);
    updateCamera(dt);
  });
  startRaf((dt) => {
    stepper.advance(dt);
    drawScene(dt);
  });
})();
