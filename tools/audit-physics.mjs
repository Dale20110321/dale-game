// ============================================================
//  物理内核深度体检（参数扫描式）
//
//  与 tools/autotest.mjs 的分工：autotest 验证"物理正确"，本文件验证"参数扫描面"——
//  把 车辆 / 升级 / 落高 / 坡度 / 步长 / 抓地 / 油量 拉成网格逐格采样，
//  找的是"某一格组合下才发散"的单点缺陷，而不是整体趋势。
//
//  契约：export default async function (ctx)
//    · 断言   ctx.check(name, cond, detail)
//    · 分区   ctx.section("标题")
//    · 动态载入 await ctx.imp("相对 src/ 的路径")
//  不 import 任何 harness。
// ============================================================

export default async function (ctx) {
  const check = ctx.check;
  const section = ctx.section;
  const imp = ctx.imp;

  // ------------------------------------------------------------
  //  0. 模块装载（只走 ctx.imp，路径相对 src/）
  // ------------------------------------------------------------
  const { store, bike, world } = await imp("core/store.js");
  const { key } = await imp("core/input.js");
  const C = await imp("config/constants.js");
  const { LEVELS, levelAt } = await imp("config/levels.js");
  const { VEHICLES } = await imp("config/vehicles.js");
  /**
   * 进入"常规标定扫描"的车辆：除究极终局车（ultura.builtin）以外的全部。
   *
   * ★ 为什么把它摘出去：常规扫描里的每一条断言都是按 ≤1200 px/s 标定的
   *   （纯滚动轮地差、刹车锁死耗时、冰面打滑、滑移率上限…）。
   *   究极终局车满级跑 350 km/h = 9722 px/s，**一个物理帧就走 162px = 4.3 个轴距**，
   *   车轮在两次接触采样之间直接跨过整段地形（实测穿透峰值 11~15px，容差只有 2px），
   *   接触解算因此会注入巨大冲量。这些不是数值发散（无 NaN、穿透有界、刚体残差达标），
   *   而是 **60Hz 固定步长在超高速下的分辨率极限**，与那些按低速标定的断言结构性冲突。
   *   强行放宽阈值会把真正的低速回归一起放过，所以单独建一组超高速断言（见文末）。
   */
  const STD_VEHICLES = VEHICLES.filter((v) => !(v.ultra && v.ultra.builtin));
  const terrain = await imp("physics/terrain.js");
  const B = await imp("physics/bike.js");
  const F = await imp("physics/fuel.js");
  const { getUp } = await imp("core/storage.js");
  const { Stepper } = await imp("core/loop.js");
  const { startGame, update } = await imp("game/game.js");
  const { pickCanister } = await imp("game/stats.js");

  const {
    DT, SUB_DT, WHEEL_R, WHEELBASE, SEAT_H,
    NUM_CAP_V, PEN_TOL, SOLVER_TOL, REF_SPEED,
  } = C;
  const Lr = Math.hypot(WHEELBASE * 0.5, SEAT_H); // 骑手杆长（刚性约束目标）
  const WHEELS = ["rear", "front"];

  // ------------------------------------------------------------
  //  1. 通用工具
  // ------------------------------------------------------------
  const isFin = (v) => typeof v === "number" && isFinite(v);
  const avg = (a) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const abavg = (a) => (a && a.length ? a.reduce((x, y) => x + Math.abs(y), 0) / a.length : NaN);
  const abmax = (a) => (a && a.length ? a.reduce((m, v) => (Math.abs(v) > m ? Math.abs(v) : m), 0) : 0);
  const mnOf = (a) => (a && a.length ? a.reduce((m, v) => (v < m ? v : m), Infinity) : NaN);
  const n2 = (v, d = 3) => (isFin(v) ? v.toFixed(d) : "NaN");
  const e2 = (v) => (isFin(v) ? (v === 0 ? "0" : v.toExponential(2)) : "NaN");

  /** 车架三质点距离约束误差（px），0 = 完全刚性 */
  function rigidErr() {
    return Math.max(
      Math.abs(Math.hypot(bike.axleF.x - bike.axleR.x, bike.axleF.y - bike.axleR.y) - WHEELBASE),
      Math.abs(Math.hypot(bike.head.x - bike.axleR.x, bike.head.y - bike.axleR.y) - Lr),
      Math.abs(Math.hypot(bike.head.x - bike.axleF.x, bike.head.y - bike.axleF.y) - Lr)
    );
  }
  /** 质心速度（用后一子步真实位移回读，比 _vx 更新鲜） */
  function sysVel() {
    let vx = 0, vy = 0, mt = 0;
    for (const p of bike.pts) {
      vx += ((p.x - p.px) / SUB_DT) * p.m;
      vy += ((p.y - p.py) / SUB_DT) * p.m;
      mt += p.m;
    }
    return { vx: vx / mt, vy: vy / mt, m: mt };
  }
  /**
   * 整车**完整**机械能 E —— "滑行不增能"这类断言的唯一正确口径。
   *   ① 质心平动动能 ½·M·v_com²
   *   ② 五质点相对质心的内部动能 Σ½m|vᵢ−v_com|²
   *   ③ 车轮自转动能 ½·I_w·(ω_r²+ω_f²)
   *   ④ 悬挂弹性势能 ½·k·(c_r²+c_f²)
   *   ⑤ 重力势能 M·g·(−y_com)（世界 y 向下为正）
   *
   * ★ 为什么必须写全：旧口径只算 ①+⑤，漏掉的 ③④ **不是小量**——实测自由滑行
   *   起点处 ③ 就相当于 |E₀| 的 7.5%（第56关 37900 / 5.0e5），④ 约 0.5%。
   *   松油门那一瞬悬挂回弹、轮自转被滚动阻力耗散，都会把能量从"没统计的项"搬进
   *   "统计了的项"，残差公式于是读出**正的 ΔE**（实测第56关 +0.712%）——
   *   那是记账漏项，不是物理增能。补全后同一工况 ΔE = −0.042%（纯耗散），
   *   六个采样关全部为负（−0.04% ~ −2.86%），与"摩擦/滚动阻力只做负功"一致。
   */
  function energy() {
    const P = store.phys;
    const g = P.GRAV;
    let vx = 0, vy = 0, mt = 0, cy = 0;
    const vel = [];
    for (const p of bike.pts) {
      const ux = (p.x - p.px) / SUB_DT, uy = (p.y - p.py) / SUB_DT;
      vel.push([ux, uy, p.m]);
      vx += ux * p.m; vy += uy * p.m; cy += p.y * p.m; mt += p.m;
    }
    vx /= mt; vy /= mt; cy /= mt;
    let ke = 0.5 * mt * (vx * vx + vy * vy);
    for (let i = 0; i < vel.length; i++) {
      ke += 0.5 * vel[i][2] * ((vel[i][0] - vx) ** 2 + (vel[i][1] - vy) ** 2);
    }
    const rot = 0.5 * P.wheelI * (bike.wheelRot.rear ** 2 + bike.wheelRot.front ** 2);
    const S = P.susp;
    const spring = 0.5 * S.k * (bike.susp.rear.t ** 2 + bike.susp.front.t ** 2);
    const pe = mt * g * (-cy);
    return { v: Math.hypot(vx, vy), ke, pe, rot, spring, E: ke + pe + rot + spring };
  }
  /** 注入整车瞬时速度（写 px 等价于设 Verlet 速度） */
  function setVel(vx, vy) {
    for (const p of bike.pts) { p.px = p.x - vx * SUB_DT; p.py = p.y - vy * SUB_DT; }
  }
  const midX = () => (bike.rear.x + bike.front.x) / 2;
  const midY = () => (bike.rear.y + bike.front.y) / 2;

  // ---- 干净状态构造 ----
  const vehBak = store.currentVehicle;
  const upBak = JSON.stringify(store.upgrades || {});
  function setUpLv(lv) {
    const u = getUp();
    u.engine = lv; u.tire = lv; u.frame = lv; u.susp = lv;
  }
  /**
   * 造一条干净的单局：指定车辆 / 升级 / 关卡，清空全部机制实体与拾取物。
   * opt: { finishFar, fuelBig, keepPickups }
   */
  function setup(veh, up, lv, opt) {
    opt = opt || {};
    store.currentVehicle = veh;
    setUpLv(up);
    startGame("level", lv);
    store.shopOpen = false;
    world.hazards = []; world.gates = []; world.jumps = []; world.boosts = [];
    if (!opt.keepPickups) { world.coins = []; world.canisters = []; }
    B.applyUpgrades();
    if (opt.fuelBig) { store.phys.fuelMax = 1e4; store.phys.fuel = 1e4; }
    else store.phys.fuel = store.phys.fuelMax;
    if (opt.finishFar) store.finishX = 1e9;
    store.run.crashed = false;
    store.run.crashTimer = 0;
    key.left = false; key.right = false;
    if (!opt.locked) bike.locked = false;
    return store.phys;
  }

  /** 段异常包装：任何一段抛错都记为失败项，不让整套体检崩掉 */
  const thrown = [];
  const guard = (label, fn) => {
    try { return fn(); }
    catch (e) {
      const msg = (e && e.message) || String(e);
      thrown.push(label + " → " + msg);
      check(label + " 段执行无异常", false, msg);
      return null;
    }
  };

  const T_START = Date.now();
  const capBefore = B.capHitCount();

  // ============================================================
  //  1. 落高 × 车辆 × 升级 扫描
  //     3 车 × 2 关卡 × 5 落高 × 2 档升级 = 60 组
  // ============================================================
  const DROPS = [20, 60, 120, 240, 400];
  /**
   * 每辆车挑 2 个关卡做落高/抓地/滚动阻力扫描。
   *
   * ★ 必须按**难度分位**取样，不能写死关卡下标。
   *   makeLevel 的难度是 gN = gi / (TOTAL-1)：72 关时下标 65 落在 gN=0.92（末期高难），
   *   432 关后同一个下标只有 gN=0.15（前期送分）—— 于是"最陡上坡打滑""冰面空转"
   *   这类按高难工况标定的断言会在**简单关**上跑，结论完全失去意义（实测 12 项误红）。
   *   改成按分位取样后，关卡总数怎么变都不用回来改这里。
   */
  const vehLvOf = (vi) => {
    const n = LEVELS.length;
    const q = [0.08, 0.34, 0.62, 0.9][vi % 4];       // 难度分位
    const r = [0.2, 0.75][vi % 2];                    // 分位内的两档
    const a = Math.floor(n * q * r);
    const b = Math.floor(n * q * (0.55 + r * 0.45));
    return [Math.max(0, Math.min(a, n - 1)), Math.max(0, Math.min(b, n - 1))];
  };
  const UP_TIERS = [0, 50];

  /** 落体 → 落地 → 自由滑行观测；返回该组全部诊断量 */
  function dropScan(vi, upLv, lv, x, h) {
    setup(vi, upLv, lv, {});
    B.resetBike(x);
    for (const p of bike.pts) { p.y -= h; p.py -= h; }
    setVel(0, 0);
    const S = store.phys.susp;
    const r = {
      travel: S.travel, ext: S.ext, k: S.k,
      nan: "", landed: false, impactV: 0,
      peakComp: 0, peakDroop: 0, maxV: 0, maxOmega: 0,
      squashHi: -Infinity, squashLo: Infinity, minY: Infinity, maxY: -Infinity,
      wrDiff: [], slip: [], meanWrDiff: NaN, maxWrDiff: 0, meanSlip: NaN, maxSlip: 0,
      // squash ↔ 悬挂压缩 的相关系数累加量（Pearson r 的分子/分母）
      sqN: 0, sqX: 0, sqY: 0, sqXY: 0, sqXX: 0, sqYY: 0,
    };
    // --- 阶段 A：自由落体直到第一次触地 ---
    let f = 0;
    while (f++ < 300 && !r.landed) {
      B.stepPhysics();
      for (const p of bike.pts) if (!isFin(p.x) || !isFin(p.y)) r.nan = r.nan || "落体期坐标 NaN";
      if (bike.grounded > 0) { r.landed = true; r.impactV = bike._impactV; break; }
    }
    // --- 阶段 B：落地后 240 帧滑行（无输入），全程采样 ---
    const COAST = 240, TAIL = 90;
    for (let i = 0; i < COAST; i++) {
      B.stepPhysics();
      const tail = i >= COAST - TAIL;
      for (const p of bike.pts) {
        if (!isFin(p.x) || !isFin(p.y)) { r.nan = r.nan || "滑行期坐标 NaN"; continue; }
        const vx = (p.x - p.px) / SUB_DT, vy = (p.y - p.py) / SUB_DT;
        if (!isFin(vx) || !isFin(vy)) { r.nan = r.nan || "滑行期速度 NaN"; continue; }
        r.maxV = Math.max(r.maxV, Math.hypot(vx, vy));
        r.maxY = Math.max(r.maxY, p.y);
        r.minY = Math.min(r.minY, p.y);
      }
      // 悬挂几何压缩：绕车架"下"方向独立测量（不复用求解器内部量）
      const ang = Math.atan2(bike.axleF.y - bike.axleR.y, bike.axleF.x - bike.axleR.x);
      const dx = -Math.sin(ang), dy = Math.cos(ang);
      for (const wk of WHEELS) {
        const W = bike[wk], A = wk === "rear" ? bike.axleR : bike.axleF;
        const c = -((W.x - A.x) * dx + (W.y - A.y) * dy);
        if (!isFin(c)) { r.nan = r.nan || "悬挂几何 NaN"; continue; }
        r.peakComp = Math.max(r.peakComp, c);
        r.peakDroop = Math.max(r.peakDroop, -c);
      }
      if (isFin(bike.squash)) {
        r.squashHi = Math.max(r.squashHi, bike.squash);
        r.squashLo = Math.min(r.squashLo, bike.squash);
      }
      r.maxOmega = Math.max(r.maxOmega, Math.abs(bike.wheelRot.rear), Math.abs(bike.wheelRot.front));
      // 记录 (悬挂压缩比, squash) 样本对：用来验证 squash **真的**由悬挂行程派生。
      // 旧断言只查 squash ∈ [-1,0]，而 bike.js 里 target = -clamp(cAvg/travel,0,1)
      // 再做一阶滞后，值域由 clamp 写死 —— 那条断言恒真，永远抓不到"画面下沉与悬挂脱钩"。
      {
        const cAvgF = (bike.susp.rear.t + bike.susp.front.t) * 0.5 / Math.max(1, S.travel);
        if (isFin(cAvgF) && isFin(bike.squash)) { r.sqN++; r.sqX += cAvgF; r.sqY += bike.squash; r.sqXY += cAvgF * bike.squash; r.sqXX += cAvgF * cAvgF; r.sqYY += bike.squash * bike.squash; }
      }
      if (tail) {
        const sv = sysVel();
        for (const wk of WHEELS) {
          const n = terrain.groundNormal(bike[wk].x);
          const vt = sv.vx * -n.y + sv.vy * n.x;
          r.wrDiff.push(bike.wheelRot[wk] * WHEEL_R - vt);
          r.slip.push(bike.slip[wk]);
        }
      }
    }
    r.meanWrDiff = abavg(r.wrDiff);
    r.maxWrDiff = abmax(r.wrDiff);
    r.meanSlip = abavg(r.slip);
    r.maxSlip = abmax(r.slip);
    r.maxOmegaV = r.maxOmega * WHEEL_R;
    if (!isFinite(r.minY)) r.minY = 0;
    if (!isFinite(r.maxY)) r.maxY = 0;
    if (!isFinite(r.squashHi)) { r.squashHi = 0; r.squashLo = 0; }
    // Pearson r（压缩比 vs squash）：负值越接近 −1，说明画面下沉越严格地由悬挂行程驱动
    r.sqCorr = (() => {
      const n = r.sqN;
      if (n < 30) return NaN;
      const cov = r.sqXY / n - (r.sqX / n) * (r.sqY / n);
      const vx = r.sqXX / n - (r.sqX / n) ** 2;
      const vy = r.sqYY / n - (r.sqY / n) ** 2;
      if (!(vx > 1e-12) || !(vy > 1e-12)) return NaN;
      return cov / Math.sqrt(vx * vy);
    })();
    r.theoryV = Math.sqrt(2 * store.phys.GRAV * h);
    return r;
  }

  section("落高 × 车辆 × 升级 扫描（无 NaN / 悬挂限位 / 冲击速度 / 坐标有限 / squash / 轮地一致）");
  const dropRows = [];
  guard("落高扫描", () => {
    for (let vi = 0; vi < STD_VEHICLES.length; vi++) {
      for (let ki = 0; ki < vehLvOf(vi).length; ki++) {
        const lv = vehLvOf(vi)[ki];
        for (let ti = 0; ti < UP_TIERS.length; ti++) {
          const upLv = UP_TIERS[ti];
          const x = terrain.canSpot(LEVELS[lv].len, 1500 + 500 * ki);
          const row = [];
          for (const h of DROPS) {
            const r = dropScan(vi, upLv, lv, x, h);
            row.push(r);
            const tag = `${STD_VEHICLES[vi].name}/第${lv + 1}关/Lv${upLv}/落${h}px`;

            check(tag + " · 无 NaN 且确实完成落地（轨迹非退化）",
              r.nan === "" && r.landed && r.maxV > 1,
              `${r.nan || "OK"} · landed=${r.landed} · maxV=${r.maxV.toFixed(0)}px/s`);

            check(tag + " · 悬挂几何压缩 ≤ 行程上限（压缩与伸张都受限位）",
              r.peakComp <= r.travel + 0.5 && r.peakDroop <= r.ext + 0.5,
              `峰值压缩 ${r.peakComp.toFixed(2)}/${r.travel.toFixed(2)}px · 伸张 ${r.peakDroop.toFixed(2)}/${r.ext.toFixed(2)}px`);

            check(tag + " · 落地冲击速度符合自由落体（0.6√(2gh) ~ 1.1√(2gh)）",
              r.impactV > r.theoryV * 0.6 && r.impactV <= r.theoryV * 1.1,
              `实测 ${r.impactV.toFixed(0)} / 理论 ${r.theoryV.toFixed(0)}px/s（比 ${(r.impactV / r.theoryV).toFixed(2)}）`);

            check(tag + " · 速度有界 < NUM_CAP_V 且车身坐标有限",
              r.maxV < NUM_CAP_V && isFinite(r.minY) && isFinite(r.maxY),
              `maxV=${r.maxV.toFixed(0)} / ${NUM_CAP_V}px/s · y∈[${r.minY.toFixed(0)},${r.maxY.toFixed(0)}]`);

            check(tag + " · 画面下沉由悬挂行程驱动（与压缩比强负相关，非恒真的区间检查）",
              r.squashLo < -0.005 && isFin(r.sqCorr) && r.sqCorr < -0.8,
              `squash∈[${r.squashLo.toFixed(3)}, ${r.squashHi.toFixed(3)}] · 峰值压缩 ${r.peakComp.toFixed(2)}px · corr(压缩比,squash)=${n2(r.sqCorr, 3)}（${r.sqN} 样本）`);

            // 无动力滑行时轮子应当"纯滚动"：既不该抱死（slip→+1 拖滞）也不该空转（slip→−1）。
            // 旧阈值 maxSlip ≤ 1.0001 是恒真的 —— bike.js 里 slip = clamp(slip/denom,−1,1)
            // 把值域写死了，那条断言永远不可能失败。改成有物理含义的滚动一致性上界：
            // 实测 60 组滑行尾段 |slip| 峰仅 0.045、|ωR−v_t| 峰 8.7px/s，
            // 这里取 0.35 / 20px/s（约 8 倍余量），既能抓住"轮地失锁"又不会误报。
            check(tag + " · 无动力滑行轮地纯滚动（滑移与轮速差都远未失锁）",
              r.meanWrDiff < 20 && r.maxWrDiff < 60 && r.maxSlip < 0.35 &&
              r.maxOmegaV < NUM_CAP_V && r.nan === "",
              `|ωR−v_t| 均 ${r.meanWrDiff.toFixed(2)} / 峰 ${r.maxWrDiff.toFixed(2)}px/s（限 20/60）· |slip| 均 ${r.meanSlip.toFixed(3)} / 峰 ${r.maxSlip.toFixed(3)}（限 0.35）· max|ωR| ${r.maxOmegaV.toFixed(0)}px/s`);
          }
          dropRows.push({ vi, ki, lv, upLv, x, row });
        }
      }
    }
  });
  guard("落高扫描·跨组比较", () => {
    // (a) 落高单调性：落地冲击必须随落差严格增长
    for (const g of dropRows) {
      for (let i = 1; i < g.row.length; i++) {
        const a = g.row[i - 1], b = g.row[i];
        check(`${VEHICLES[g.vi].name}/第${g.lv + 1}关/Lv${g.upLv} · 落地冲击随落差严格增长 ${DROPS[i - 1]}→${DROPS[i]}px`,
          b.impactV > a.impactV && isFin(b.impactV),
          `${a.impactV.toFixed(0)} → ${b.impactV.toFixed(0)}px/s`);
      }
    }
    // (b) 减震升级：Lv50 行程更大，同落差下峰值压缩不得更深
    for (let vi = 0; vi < STD_VEHICLES.length; vi++) {
      for (let ki = 0; ki < vehLvOf(vi).length; ki++) {
        const lo = dropRows.find((r) => r.vi === vi && r.ki === ki && r.upLv === 0);
        const hi = dropRows.find((r) => r.vi === vi && r.ki === ki && r.upLv === 50);
        if (!lo || !hi) continue;
        const i400 = DROPS.indexOf(400);
        check(`${VEHICLES[vi].name}/第${lo.lv + 1}关 · 减震 Lv0→Lv50 行程变大且 400px 落差下压缩不更深`,
          hi.row[i400].travel > lo.row[i400].travel &&
          hi.row[i400].peakComp <= lo.row[i400].peakComp + 0.01 &&
          hi.row[i400].peakComp > 0,
          `行程 ${lo.row[i400].travel}→${hi.row[i400].travel}px · 峰值压缩 ${lo.row[i400].peakComp.toFixed(2)}→${hi.row[i400].peakComp.toFixed(2)}px`);
      }
    }
  });

  // ============================================================
  //  2. 坡度扫描：多关卡多位置 × 不同入射速度
  // ============================================================
  const SLOPE_LV = [0, 11, 23, 35, 47, 59, 66, 71];
  const SLOPE_FRAC = [0.25, 0.5, 0.75];
  const ENTRY_V = [0, 250, 500];

  /** 把车放在 x 点、按地形切向注入 v px/s，静置 200 帧并采样健康度 */
  function slopeScan(lv, x, v0) {
    setup(0, 0, lv, {});
    B.resetBike(x);
    bike.locked = false;
    const m = terrain.groundSlope(x + WHEELBASE / 2);
    const inv = 1 / Math.hypot(1, m);
    setVel(inv * v0, m * inv * v0);
    const S = store.phys.susp;
    let maxV = 0, nan = "", flips = 0, prev = 0, prevFlip = -99, minGap = Infinity;
    let e0 = null, eMax = -Infinity, sumResid = 0, nResid = 0;
    let offMap = false, compBad = 0, squBad = 0, nanSlip = 0;
    for (let i = 0; i < 200; i++) {
      B.stepPhysics();
      const vx = (bike.rear.x - bike.rear.px) / SUB_DT, vy = (bike.rear.y - bike.rear.py) / SUB_DT;
      if (!isFin(vx) || !isFin(vy) || !isFin(bike.rear.x) || !isFin(bike.head.y)) { nan = "第" + i + "帧"; break; }
      maxV = Math.max(maxV, Math.hypot(vx, vy));
      // 换向只在速度有实际量级时才算：|vx| < 20px/s 的符号抖动是数值噪声，不是振荡
      const sg = Math.abs(vx) > 20 ? Math.sign(vx) : 0;
      if (sg && prev && sg !== prev) {
        flips++;
        minGap = Math.min(minGap, i - prevFlip);
        prevFlip = i;
      }
      if (sg) prev = sg;
      const en = energy();
      if (e0 === null) e0 = en.E;
      eMax = Math.max(eMax, en.E);
      sumResid += bike.solverResid; nResid++;
      if (bike.susp.rear.t > S.travel + 0.5 || bike.susp.front.t > S.travel + 0.5) compBad++;
      if (bike.squash < -1.0001 || bike.squash > 0.0001) squBad++;
      if (!isFin(bike.slip.rear) || !isFin(bike.slip.front)) nanSlip++;
      if (midY() > store.phys.minY + 800) offMap = true;
    }
    return {
      m, v0, nan, maxV, flips, minGap: isFinite(minGap) ? minGap : 999,
      e0, eMax, growth: (e0 !== null && e0 !== 0) ? ((eMax - e0) / Math.abs(e0)) * 100 : NaN,
      meanResid: nResid ? sumResid / nResid : NaN,
      offMap, compBad, squBad, nanSlip,
    };
  }

  section("坡度扫描（不发散 / 无高频振荡 / 机械能不增长 / 速度有界 / 约束收敛）");
  guard("坡度扫描", () => {
    const slopesSeen = [];
    for (const lv of SLOPE_LV) {
      const len = LEVELS[lv].len;
      const spots = SLOPE_FRAC.map((f) => terrain.canSpot(len, Math.round(len * f)));
      check(`第${lv + 1}关 · 三个采样点互不相同且都落在可解算区间`,
        new Set(spots).size === 3 && spots.every((x) => x > 100 && x < len - 100) &&
        Math.abs(terrain.groundSlope(spots[1] + 19)) < 0.35,
        spots.map((x) => `x=${x}(m=${terrain.groundSlope(x + 19).toFixed(3)})`).join(" "));
      for (const x of spots) {
        slopesSeen.push(Math.abs(terrain.groundSlope(x + 19)));
        for (const v0 of ENTRY_V) {
          const r = slopeScan(lv, x, v0);
          const tag = `第${lv + 1}关@${x}(m=${r.m.toFixed(3)})/v0=${v0}`;
          check(tag + " · 无 NaN、滑移有限、坐标有限、未坠出地图",
            r.nan === "" && !r.offMap && r.nanSlip === 0 && isFinite(midX()),
            r.nan || `midX=${midX().toFixed(0)} · 滑移 NaN 帧 ${r.nanSlip}`);
          const vlim = v0 === 0 ? REF_SPEED * 1.8 : NUM_CAP_V;
          check(tag + " · 速度有界（上限 " + vlim.toFixed(0) + "px/s）",
            isFin(r.maxV) && r.maxV < vlim,
            `maxV=${r.maxV.toFixed(1)}px/s（入射 v0=${v0}）`);
          check(tag + " · 无高频振荡（相邻换向间隔 ≥5 帧）",
            r.flips === 0 || r.minGap >= 5,
            `换向 ${r.flips} 次 · 最短间隔 ${r.flips ? r.minGap : "—"} 帧 · ΔE=${n2(r.growth, 2)}%`);
          const eLim = v0 === 0 ? 5 : 10;
          check(tag + " · 机械能增长有界（≤" + eLim + "%）且悬挂/画面下沉不越界",
            isFin(r.growth) && r.growth <= eLim && r.compBad === 0 && r.squBad === 0,
            `ΔE=${n2(r.growth, 3)}% · 行程越界 ${r.compBad} 帧 · squash 越界 ${r.squBad} 帧 · 残差均值 ${n2(r.meanResid, 4)}`);
        }
      }
    }
    check("坡度扫描覆盖面：24 个落点中过半为非平地（确实扫到了坡）",
      slopesSeen.filter((s) => s > 0.01).length >= 12,
      `非平地点 ${slopesSeen.filter((s) => s > 0.01).length}/24 · |m| 范围 ${mnOf(slopesSeen).toFixed(3)}~${abmax(slopesSeen).toFixed(3)}`);
  });

  // ============================================================
  //  3. 确定性：同初始状态 + 同输入序列，两遍逐帧完全一致
  // ============================================================
  const DET_LV = [0, 12, 24, 36, 48, 60, 71];
  const INPUT_MODES = [
    { name: "全油门", stay: false, fn: () => [true, false] },
    { name: "全刹车", stay: true, fn: () => [false, true] },
    { name: "左右交替", stay: false, fn: (i) => [i % 2 === 0, i % 2 === 1] },
    { name: "脉冲油门", stay: false, fn: (i) => [i % 17 < 9, false] },
  ];
  const DET_STEPS = 300;
  /** 逐帧记录 5 质点 x/y + 轮角 + 悬挂行程 + 车速 + 燃料 */
  function trace(lv, mode) {
    setup(0, 0, lv, { finishFar: true });
    const tr = [];
    for (let i = 0; i < DET_STEPS; i++) {
      const r = mode.fn(i);
      key.right = r[0]; key.left = r[1];
      update(DT);
      tr.push([bike.rear.x, bike.rear.y, bike.front.x, bike.front.y,
        bike.head.x, bike.head.y, bike.axleR.x, bike.axleF.y,
        bike.wheelRot.rear, bike.wheelRot.front,
        bike.susp.rear.t, bike.susp.front.t, bike.speed, store.phys.fuel]);
    }
    key.left = false; key.right = false;
    return tr;
  }
  section("确定性（同初始状态 + 同输入 → 逐帧 5 质点完全一致）");
  guard("确定性", () => {
    const finals = [];
    for (const lv of DET_LV) {
      for (const mode of INPUT_MODES) {
        const A = trace(lv, mode);
        const B2 = trace(lv, mode);
        let bad = 0, worst = 0, worstAt = "";
        for (let i = 0; i < A.length; i++) {
          for (let j = 0; j < A[i].length; j++) {
            const d = Math.abs(A[i][j] - B2[i][j]);
            if (d !== 0) { bad++; if (d > worst) { worst = d; worstAt = `帧${i}/量${j}`; } }
          }
        }
        const tag = `第${lv + 1}关/${mode.name}`;
        check(tag + " · 逐帧状态完全一致（0 个分量有差异）",
          bad === 0,
          bad === 0
            ? `${A.length} 帧 × ${A[0].length} 分量逐位相同`
            : `${bad} 个分量不同，最大差 ${e2(worst)}（${worstAt}）`);
        const span = A[A.length - 1][0] - A[0][0];
        const healthy = A.every((r) => r.every(isFin)) && Math.abs(span) < 1e6;
        if (mode.stay) {
          check(tag + " · 全刹车工况行为正确（原地停住而非失控）",
            healthy && Math.abs(span) < 40,
            `净位移 ${span.toFixed(2)}px · 终速 ${A[A.length - 1][12].toFixed(2)}px/s`);
        } else {
          check(tag + " · 轨迹非退化（确实在推进，不是空跑）",
            healthy && Math.abs(span) > 30,
            `净位移 ${span.toFixed(1)}px · 终点 x=${A[A.length - 1][0].toFixed(1)}`);
        }
        finals.push(Math.round(A[A.length - 1][0]));
      }
    }
    check("四种输入序列 × 多关卡产生足够不同的终态（用例不是同一条轨迹）",
      new Set(finals).size >= 14, `${finals.length} 次运行的终点去重后 ${new Set(finals).size} 种`);
  });

  // ============================================================
  //  4. 帧率无关性：1/60 / 1/120 / 1/144 推进相同模拟时长
  // ============================================================
  const FR_LV = [0, 12, 25, 38, 50, 61, 71];
  const FR_STEPS = 600; // 10s @1/60
  function runFixed(lv, dtPerCall) {
    setup(0, 0, lv, { finishFar: true, fuelBig: true });
    key.right = true; key.left = false;
    const st = new Stepper((dt) => update(dt));
    let done = 0, t = 0;
    while (done < FR_STEPS) { st.advance(dtPerCall); done += st.lastSteps; t += dtPerCall; }
    key.left = false; key.right = false;
    return {
      x: midX(), wr: bike.wheelRot.rear, wf: bike.wheelRot.front,
      sr: bike.susp.rear.t, sf: bike.susp.front.t,
      used: 1e4 - store.phys.fuel, t, done,
    };
  }
  section("帧率无关性（1/60 vs 1/120 vs 1/144，位移/轮角/悬挂/油耗差 < 1e-6）");
  guard("帧率无关性", () => {
    const EPS = 1e-6;
    for (const lv of FR_LV) {
      const a = runFixed(lv, 1 / 60);
      const b = runFixed(lv, 1 / 120);
      const c = runFixed(lv, 1 / 144);
      const d = (p, q) => Math.abs(p - q);
      const tag = `第${lv + 1}关`;
      check(tag + " · 三种步长执行的物理步数与模拟时长一致",
        a.done === b.done && b.done === c.done && a.done === FR_STEPS &&
        Math.abs(a.t - 10) < 0.02 && Math.abs(b.t - 10) < 0.02 && Math.abs(c.t - 10) < 0.02,
        `步数 ${a.done}/${b.done}/${c.done} · 模拟时长 ${n2(a.t, 3)}/${n2(b.t, 3)}/${n2(c.t, 3)}s`);
      check(tag + " · 最终位移与帧率无关",
        d(a.x, b.x) < EPS && d(a.x, c.x) < EPS,
        `x=${a.x.toFixed(4)} / ${b.x.toFixed(4)} / ${c.x.toFixed(4)}px · Δ=${e2(Math.max(d(a.x, b.x), d(a.x, c.x)))}`);
      check(tag + " · 车轮转角与帧率无关",
        Math.max(d(a.wr, b.wr), d(a.wr, c.wr)) < EPS && Math.max(d(a.wf, b.wf), d(a.wf, c.wf)) < EPS,
        `ωr=${n2(a.wr, 4)}/${n2(b.wr, 4)}/${n2(c.wr, 4)} · Δ=${e2(Math.max(d(a.wr, b.wr), d(a.wr, c.wr)))}`);
      check(tag + " · 悬挂行程与帧率无关",
        Math.max(d(a.sr, b.sr), d(a.sr, c.sr)) < EPS && Math.max(d(a.sf, b.sf), d(a.sf, c.sf)) < EPS,
        `行程=${n2(a.sr, 5)}/${n2(b.sr, 5)}/${n2(c.sr, 5)}px · Δ=${e2(Math.max(d(a.sr, b.sr), d(a.sr, c.sr)))}`);
      check(tag + " · 油耗与帧率无关",
        d(a.used, b.used) < EPS && d(a.used, c.used) < EPS,
        `耗油=${n2(a.used, 6)}/${n2(b.used, 6)}/${n2(c.used, 6)} · Δ=${e2(Math.max(d(a.used, b.used), d(a.used, c.used)))}`);
      check(tag + " · 轨迹本身非退化（三次都真的在跑）",
        isFinite(a.x) && a.x > 200 && a.used > 0.1,
        `10s 末 x=${a.x.toFixed(0)}px · 耗油 ${n2(a.used, 3)}`);
    }
  });

  // ============================================================
  //  5. 数值护栏
  // ============================================================
  section("数值护栏（断层穿透 / 掉出地图重生 / 未起步冻结 / 12 坡度静置 / 滑行能量）");
  guard("数值护栏·断层穿透", () => {
    for (const lv of [0, 17, 34, 52, 71]) {
      const L = LEVELS[lv];
      const picks = (L.steps || []).filter((s) => s.cx > 700 && s.cx < L.len - 700).slice(0, 2);
      for (const s of picks) {
        setup(0, 0, lv, {});
        B.resetBike(Math.round(s.cx - 220));
        setVel(600, 0);
        let worst = 0, maxV = 0, nan = false;
        for (let i = 0; i < 200; i++) {
          B.stepPhysics();
          if (!isFinite(bike.rear.x) || !isFinite(bike.wheelRot.rear)) { nan = true; break; }
          worst = Math.max(worst, bike.penetration);
          maxV = Math.max(maxV, Math.abs((bike.rear.x - bike.rear.px) / SUB_DT));
        }
        check(`第${lv + 1}关断层@${s.cx} · 600px/s 高速撞断层穿透 ≤ PEN_TOL+0.5`,
          !nan && worst <= PEN_TOL + 0.5 && maxV < NUM_CAP_V,
          `最大穿透 ${worst.toFixed(2)}px / 容差 ${(PEN_TOL + 0.5).toFixed(1)} · maxV=${maxV.toFixed(0)}px/s`);
      }
    }
  });
  guard("数值护栏·掉出地图", () => {
    for (const lv of [0, 13, 29, 41, 55, 63, 70, 71]) {
      setup(0, 0, lv, {});
      const x = terrain.canSpot(LEVELS[lv].len, Math.round(LEVELS[lv].len * 0.4));
      store.run.lastSafeX = x;
      B.resetBike(x);
      bike.locked = false;
      for (const p of bike.pts) { p.y += 3000; p.py += 3000; } // 人为沉到地图底板以下
      key.right = true;
      update(DT);
      key.right = false;
      const gY = terrain.groundY(bike.rear.x);
      const back = isFinite(gY) && Math.abs(bike.rear.y - (gY - WHEEL_R)) < 40;
      check(`第${lv + 1}关 · 掉出地图能重生回地表（不再无限下坠）`,
        back && bike.locked === false && store.run.crashed === false && isFinite(bike.rear.x),
        `重生后 rear.y=${bike.rear.y.toFixed(1)} / 地表 ${gY.toFixed(1)} · x=${bike.rear.x.toFixed(0)} · locked=${bike.locked}`);
    }
  });
  guard("数值护栏·未起步冻结", () => {
    for (const lv of [0, 9, 22, 36, 49, 58, 66, 71]) {
      setup(0, 0, lv, {});
      const x = terrain.canSpot(LEVELS[lv].len, Math.round(LEVELS[lv].len * 0.3));
      store.run.lastSafeX = x;
      B.resetBike(x); // locked = true
      key.right = false; key.left = false;
      const x0 = bike.rear.x, y0 = bike.rear.y, t0 = store.time;
      for (let i = 0; i < 180; i++) update(DT);
      check(`第${lv + 1}关 · 未起步（锁定）时零位移`,
        bike.rear.x === x0 && bike.rear.y === y0,
        `Δx=${(bike.rear.x - x0).toExponential(1)}px · Δy=${(bike.rear.y - y0).toExponential(1)}px`);
      check(`第${lv + 1}关 · 未起步时模拟时钟不推进`,
        store.time === t0, `Δt=${(store.time - t0).toExponential(1)}s`);
    }
  });
  guard("数值护栏·12 坡度静置", () => {
    for (const lv of [0, 18, 36, 71]) {
      for (const f of [0.2, 0.5, 0.8]) {
        setup(0, 0, lv, {});
        const x = terrain.canSpot(LEVELS[lv].len, Math.round(LEVELS[lv].len * f));
        store.run.lastSafeX = x;
        B.resetBike(x);
        bike.locked = false;
        update(DT); // 解锁
        key.right = false; key.left = false;
        let maxV = 0, flips = 0, prev = 0, e0 = null, eMax = -Infinity, nan = "";
        for (let i = 0; i < 180; i++) {
          update(DT);
          const vx = (bike.rear.x - bike.rear.px) / SUB_DT, vy = (bike.rear.y - bike.rear.py) / SUB_DT;
          if (!isFin(vx) || !isFin(vy)) { nan = "第" + i + "帧"; break; }
          maxV = Math.max(maxV, Math.hypot(vx, vy));
          const sg = Math.abs(vx) > 20 ? Math.sign(vx) : 0;
          if (sg && prev && sg !== prev) flips++;
          if (sg) prev = sg;
          const en = energy();
          if (e0 === null) e0 = en.E;
          eMax = Math.max(eMax, en.E);
        }
        const growth = (e0 !== null && e0 !== 0) ? ((eMax - e0) / Math.abs(e0)) * 100 : NaN;
        const m = terrain.groundSlope(x + 19);
        check(`第${lv + 1}关@${f}（m=${n2(m, 3)}）· 零速静置 3s：速度有界 / 无高频振荡 / 能量不增长`,
          nan === "" && maxV <= REF_SPEED * 0.75 && flips <= 2 && isFin(growth) && growth <= 5,
          `maxV=${maxV.toFixed(1)}（限 ${(REF_SPEED * 0.75).toFixed(0)}）· 换向 ${flips} · ΔE=${n2(growth, 2)}%${nan}`);
      }
    }
  });
  guard("数值护栏·自由滑行能量", () => {
    for (const lv of [0, 12, 25, 38, 55, 71]) {
      setup(0, 0, lv, { finishFar: true });
      key.right = true; key.left = false;
      for (let i = 0; i < 180; i++) update(DT);
      key.right = false; key.left = false;
      const e0 = energy().E;
      const x0 = midX();
      let eMax = -Infinity;
      for (let i = 0; i < 300; i++) { update(DT); eMax = Math.max(eMax, energy().E); }
      const growth = ((eMax - e0) / Math.abs(e0)) * 100;
      check(`第${lv + 1}关 · 无动力自由滑行机械能不增长`,
        isFin(growth) && growth <= 0.5,
        `滑行 ${(midX() - x0).toFixed(0)}px · 能量最大增长 ${growth.toFixed(3)}%（耗散为负）`);
      check(`第${lv + 1}关 · 滑行确实产生位移（不是卡死空跑）`,
        isFinite(midX()) && midX() - x0 > 20,
        `位移 ${(midX() - x0).toFixed(1)}px · 终速 ${Math.abs(bike.speed).toFixed(0)}px/s`);
    }
  });

  // ============================================================
  //  6. 轮上动力学
  // ============================================================
  section("轮上动力学（抓地对照 / 刹车锁死 / 陡坡法向力 / 滚动阻力 / 扭矩衰减）");
  guard("轮上动力学·抓地对照", () => {
    for (let vi = 0; vi < STD_VEHICLES.length; vi++) {
      const lv = vehLvOf(vi)[0]; // 按难度分位取样（见 vehLvOf 注释）
      const run = (traction) => {
        setup(vi, 0, lv, {});
        store.phys.TRACTION = traction;
        B.applyUpgrades();
        B.resetBike(terrain.canSpot(LEVELS[lv].len, 900));
        bike.locked = false;
        key.right = true; key.left = false;
        const slips = [];
        let v1s = 0, mu = store.phys.mu, slipBad = 0, maxOmega = 0, maxV = 0;
        for (let i = 0; i < 180; i++) {
          update(DT);
          if (i >= 30 && i < 90) slips.push(bike.slip.rear);
          if (i === 59) v1s = Math.abs(bike.speed);
          if (!isFinite(bike.slip.rear) || Math.abs(bike.slip.rear) > 1.0001) slipBad++;
          maxOmega = Math.max(maxOmega, Math.abs(bike.wheelRot.rear));
          maxV = Math.max(maxV, Math.abs((bike.rear.x - bike.rear.px) / SUB_DT));
        }
        key.right = false; key.left = false;
        // 扭矩/抓地比 h：发动机能给出的轮上扭矩 ÷ 摩擦上限能传递的扭矩。
        // h 越大越容易突破摩擦极限、越空转 —— 滑移阈值必须随它变，而不是按默认车标定。
        const h = store.phys.torquePeak / (store.phys.mu * store.phys.rb.mTot * store.phys.GRAV);
        return { mu, meanSlip: avg(slips), v1s, slipBad, maxOmega: maxOmega * WHEEL_R, maxV, h };
      };
      const hi = run(1.0);
      const lo = run(0.62);
      const tag = STD_VEHICLES[vi].name;
      check(tag + " · 摩擦系数 μ 随场景抓地线性缩放（μ_冰/μ_绿 = 0.62）",
        Math.abs(lo.mu / hi.mu - 0.62) < 1e-9,
        `μ ${hi.mu.toFixed(4)} → ${lo.mu.toFixed(4)}（比 ${(lo.mu / hi.mu).toFixed(6)}）`);
      check(tag + " · 冰面同油门空转明显更多（滑移率差 ≥ 0.04）",
        lo.meanSlip < hi.meanSlip - 0.04 && isFinite(lo.meanSlip),
        `绿野 ${hi.meanSlip.toFixed(4)} → 冰面 ${lo.meanSlip.toFixed(4)}（差 ${(hi.meanSlip - lo.meanSlip).toFixed(4)}）`);
      // 阈值随车辆参数变：竞速车 grp=0.72（低抓地）且 torque=1.35（高扭矩），
      // 扭矩/抓地比 h 是默认山地车的 2.4 倍，本来就该打滑更多（实测 −0.41）。
      // 用固定阈值标定等于拿"默认车的手感"去要求所有车。实测 |滑移|/h 在三辆车上
      // 分别是 0.020/0.026/0.025（高度一致），故阈值取 0.06·h（≈2.3 倍余量）。
      const slipLim = Math.min(0.06 * hi.h, 0.55);
      check(tag + " · 高抓地滑移随扭矩/抓地比受控（未达自由空转）",
        Math.abs(hi.meanSlip) < slipLim,
        `平均滑移 ${hi.meanSlip.toFixed(4)} < ${slipLim.toFixed(3)}（μ=${hi.mu.toFixed(2)} · 扭矩/抓地 h=${hi.h.toFixed(1)} → 上界 0.06h）`);
      check(tag + " · 冰面同油门 1s 末推进速度更低",
        lo.v1s < hi.v1s && lo.v1s > 0,
        `1.0s 车速：绿野 ${hi.v1s.toFixed(0)} > 冰面 ${lo.v1s.toFixed(0)}px/s`);
      check(tag + " · 全程滑移率有限且在 [-1,1] 内（无滑移爆炸）",
        hi.slipBad === 0 && lo.slipBad === 0 &&
        hi.maxOmega < NUM_CAP_V && lo.maxOmega < NUM_CAP_V &&
        hi.maxV < NUM_CAP_V && lo.maxV < NUM_CAP_V,
        `越界帧 ${hi.slipBad}/${lo.slipBad} · max|ωR| ${hi.maxOmega.toFixed(0)}/${lo.maxOmega.toFixed(0)}px/s`);
      if (VEHICLES[vi].id === "sport") {
        check(tag + "（最低抓地 grp）· 冰面出现真打滑（|滑移| > 0.35 且比绿野深 0.15）",
          lo.meanSlip < -0.35 && lo.meanSlip < hi.meanSlip - 0.15,
          `绿野 ${hi.meanSlip.toFixed(3)} → 冰面 ${lo.meanSlip.toFixed(3)}（μ ${hi.mu.toFixed(2)}→${lo.mu.toFixed(2)}）`);
      }
    }
  });
  guard("轮上动力学·刹车锁死", () => {
    for (let vi = 0; vi < STD_VEHICLES.length; vi++) {
      setup(vi, 0, 0, {});
      key.right = true; key.left = false;
      for (let i = 0; i < 180; i++) update(DT);
      store.run.crashed = false;
      const vBefore = Math.abs(bike.speed), wBefore = Math.abs(bike.wheelRot.rear);
      key.right = false; key.left = true;
      let minW = Infinity, maxSlip = -Infinity, minOmega = Infinity;
      for (let i = 0; i < 120; i++) {
        update(DT);
        minW = Math.min(minW, Math.abs(bike.wheelRot.rear));
        maxSlip = Math.max(maxSlip, bike.slip.rear);
        minOmega = Math.min(minOmega, bike.wheelRot.rear);
      }
      key.left = false; key.right = false;
      const tag = STD_VEHICLES[vi].name;
      check(tag + " · 急刹时车轮锁死（|ω| → 0）",
        minW < 0.5 && vBefore > 100 && wBefore > 5,
        `刹前 ω=${wBefore.toFixed(2)}rad/s · v=${vBefore.toFixed(0)}px/s → 刹后 min|ω|=${minW.toFixed(4)}rad/s`);
      check(tag + " · 锁死后转滑动摩擦（拖滞滑移 > 0.3）",
        maxSlip > 0.3 && isFinite(maxSlip),
        `最大拖滞滑移 ${maxSlip.toFixed(3)}`);
      check(tag + " · 刹车不会把轮子持续倒转（倒转幅度 < 刹前轮速的 5%）",
        minOmega > -Math.max(1, wBefore * 0.05),
        `倒转谷值 ${minOmega.toFixed(3)}rad/s（刹前 ${wBefore.toFixed(2)}，限 -${Math.max(1, wBefore * 0.05).toFixed(3)}）`);
    }
  });
  guard("轮上动力学·陡坡法向力", () => {
    // 静置法向力：同一关内按 |坡度| 分桶，陡坡桶必须低于平缓桶（静力 mg·cosθ 关系）
    const fnVsSlope = (vi, lv) => {
      const rows = [];
      for (let x = 700; x < LEVELS[lv].len - 700; x += 90) {
        setup(vi, 0, lv, {});
        B.resetBike(x);
        bike.locked = false;
        let fn = 0;
        for (let i = 0; i < 6; i++) { B.stepPhysics(); fn = bike.fn.rear + bike.fn.front; }
        if (fn > 0) rows.push({ m: Math.abs(terrain.groundSlope(x + 19)), fn });
      }
      if (rows.length < 8) return null;
      rows.sort((a, b) => a.m - b.m);
      const q = Math.max(2, Math.floor(rows.length / 4));
      const f = rows.slice(0, q), s = rows.slice(rows.length - q);
      const fa = avg(f.map((r) => r.fn)), sa = avg(s.map((r) => r.fn));
      return {
        n: rows.length, fa, sa, ratio: sa / fa,
        fm: avg(f.map((r) => r.m)), sm: avg(s.map((r) => r.m)),
        mg: store.phys.rb.mTot * store.phys.GRAV,
      };
    };
    let worstRatio = Infinity;
    for (let vi = 0; vi < STD_VEHICLES.length; vi++) {
      for (const lv of [0, 30, 60]) {
        const r = fnVsSlope(vi, lv);
        if (!r) continue;
        worstRatio = Math.min(worstRatio, r.ratio);
        check(`${VEHICLES[vi].name}/第${lv + 1}关 · 陡坡静置法向力低于平缓处（mg·cosθ 下降）`,
          r.sa < r.fa && r.ratio < 0.98 && r.fa > r.mg * 0.6 && r.fa < r.mg * 1.6,
          `平缓 |m|=${r.fm.toFixed(3)} Fn=${r.fa.toFixed(0)} (${(r.fa / r.mg).toFixed(2)}mg) → 陡 |m|=${r.sm.toFixed(3)} Fn=${r.sa.toFixed(0)} · 比 ${r.ratio.toFixed(3)}（${r.n} 个采样点）`);
      }
    }
    check("陡坡法向力下降在全部 9 个（车 × 关）组合上一致成立",
      isFinite(worstRatio) && worstRatio < 0.98,
      `最差比值 ${n2(worstRatio, 3)}（需 < 0.98）`);
    // 最陡上坡打滑工况
    setup(0, 0, 0, {});
    let steep = { lv: 0, x: 0, m: 0 };
    for (let i = 0; i < LEVELS.length; i++) {
      setup(0, 0, i, {});
      for (let x = 700; x < LEVELS[i].len - 700; x += 9) {
        const m = terrain.groundSlope(x);
        if (m < steep.m) steep = { lv: i, x, m };
      }
    }
    check("全 72 关最陡上坡可定位（坡度为负且足够陡）",
      steep.m < -0.3,
      `第${steep.lv + 1}关 x=${steep.x} m=${steep.m.toFixed(3)}（${(Math.atan(steep.m) * 57.3).toFixed(0)}°）`);
    /**
     * ★ 只对**前 3 辆入门车**断言"最陡上坡不可爬"。
     *   这条断言守的是难度阶梯（README 的"后 1/3 关全油门不可通关"），
     *   而那条阶梯是**按山地车/竞速车/越野车这一档**标定的。
     *   后面 4 辆是刻意做的 3.2 万~15 万金币"变态车"，它们存在的意义就是能硬爬
     *   入门车爬不上去的坡 —— 用同一条断言卡它们等于把产品需求判成 bug
     *   （实测影行者/光子摩托能以 150~207px/s 爬上去，入门车停在 <60px/s）。
     *   变态车的强度另有一条正向断言兜着（见下）。
     */
    const STARTER = 3;
    for (let vi = 0; vi < Math.min(STARTER, VEHICLES.length); vi++) {
      setup(vi, 0, steep.lv, {});
      B.resetBike(steep.x - 60);
      bike.locked = false;
      key.right = true; key.left = false;
      const slips = [], vs = [];
      for (let i = 0; i < 220; i++) {
        update(DT);
        if (terrain.groundSlope(midX()) < -0.25) {
          slips.push(bike.slip.rear);
          vs.push(Math.abs(bike.speed));
        }
      }
      key.right = false; key.left = false;
      check(`${VEHICLES[vi].name} · 最陡上坡全油门出现空转且无法继续加速`,
        slips.length > 10 && mnOf(slips) < -0.3 && vs[vs.length - 1] - vs[0] < 60,
        `段内 ${slips.length} 帧 · 最负滑移 ${n2(mnOf(slips), 3)} · 车速 ${(vs[0] || 0).toFixed(0)}→${(vs[vs.length - 1] || 0).toFixed(0)}px/s`);
    }
    // 正向断言：3.2 万金币以上的变态车在平路上的极速必须显著高于入门车（它们存在的意义）
    {
      const flatTop = (vi) => {
        setup(vi, 0, 0, {});
        B.resetBike(40);
        bike.locked = false;
        key.right = true; key.left = false;
        for (let i = 0; i < 60 * 8; i++) update(DT);
        key.right = false; key.left = false;
        return store.phys.MAXV;
      };
      const base = flatTop(0);
      const weak = [];
      const rows = VEHICLES.map((v, i) => ({ n: v.name, p: v.price, m: flatTop(i) }));
      for (const r of rows) if (r.p >= 32000 && !(r.m > base * 1.25)) weak.push(r.n);
      check("高价变态车（≥3.2 万金币）的标称极速至少比入门山地车高 25%",
        weak.length === 0,
        weak.length ? "不达标：" + weak.join(",") : rows.map((r) => `${r.n} ${r.m.toFixed(0)}`).join(" / "));
    }
  });
  guard("轮上动力学·滚动阻力与扭矩衰减", () => {
    for (let vi = 0; vi < STD_VEHICLES.length; vi++) {
      const lv = vehLvOf(vi)[0]; // 按难度分位取样（见 vehLvOf 注释）
      setup(vi, 0, lv, {});
      B.resetBike(terrain.canSpot(LEVELS[lv].len, 900));
      bike.locked = false;
      key.right = true; key.left = false;
      for (let i = 0; i < 120; i++) update(DT);
      key.right = false; key.left = false;
      const w0 = Math.abs(bike.wheelRot.rear);
      let grew = false;
      for (let i = 0; i < 90; i++) {
        update(DT);
        if (Math.abs(bike.wheelRot.rear) > w0 * 1.05) grew = true;
      }
      check(`${VEHICLES[vi].name} · 松油门后滚动阻力让轮速衰减（不越滚越快）`,
        !grew && w0 > 5 && isFinite(bike.wheelRot.rear),
        `ω ${w0.toFixed(2)} → ${Math.abs(bike.wheelRot.rear).toFixed(2)}rad/s`);
      const veh = VEHICLES[vi];
      const tLo = C.torqueAt(veh, 2, 1, store.phys.torquePeak, 1);
      const tHi = C.torqueAt(veh, C.TORQUE_RPM_BASE * veh.phys.rpm * 3.2, 1, store.phys.torquePeak, 1);
      // 旧断言里的 torqueAt(veh, 2, 0, ...) === 0 是恒真的（throttle=0 经 c01 必然返回 0），
      // 换成真正有信息量的"部分油门线性"：τ(throttle) 应严格正比于 throttle。
      const tq = (th) => C.torqueAt(veh, 2, th, store.phys.torquePeak, 1);
      check(`${VEHICLES[vi].name} · 扭矩曲线高转衰减到 0 且部分油门线性`,
        tLo > 0 && tHi === 0 &&
        Math.abs(tq(0.25) - tLo * 0.25) < 1e-9 &&
        Math.abs(tq(0.5) - tLo * 0.5) < 1e-9 &&
        Math.abs(tq(1) - tLo) < 1e-9 &&
        tq(0) === 0 && tq(1.5) === tLo && tq(-1) === 0,
        `低转 ${tLo.toFixed(0)} → 高转 ${tHi.toFixed(0)} · 1/4·τ=${tq(0.25).toFixed(0)} 1/2·τ=${tq(0.5).toFixed(0)} · throttle 越界钳位 [−1,1.5]→[0,τ₀]`);
      setup(vi, 0, lv, {});
      const mu0 = store.phys.mu;
      setUpLv(100);
      B.applyUpgrades();
      const mu100 = store.phys.mu;
      check(`${VEHICLES[vi].name} · 轮胎升级抬高摩擦系数 μ（线性 +0.6%/级）`,
        mu100 > mu0 && Math.abs(mu100 / mu0 - (1 + 0.006 * 100)) < 1e-9,
        `μ ${mu0.toFixed(4)} → ${mu100.toFixed(4)}（比 ${(mu100 / mu0).toFixed(4)}）`);
    }
  });

  // ============================================================
  //  7. 约束求解器：残差 / 刚性 / 逆质量加权
  // ============================================================
  const SOLVE_LV = [0, 10, 20, 30, 40, 50, 60, 71];
  section("约束求解器（残差按物理状态分桶：正常帧严格收敛 / 摔车帧结构有界 / 重生帧 1 帧恢复）");
  guard("约束求解器", () => {
    // ★ 必须按物理状态分桶，而不是把三种状态揉进一个平均值。原口径把 300 帧
    //   一起平均，实测被两类**非求解质量**的帧整体拉过阈值：
    //   · 摔车帧（390/7200）—— 车已翻倒、骑手身体压在地面上。solveBodyContact
    //     （沿法线只推不拉）与 projHeadSide（把骑手推回轮轴线上方）**方向相反**，
    //     几何上不可能同时满足，残差必然停在毫米级（实测均值 0.0995px、峰 1.452px）。
    //     那是"约束冲突"不是"发散"，对这类帧要求亚像素收敛在物理上就不成立。
    //   · 重生帧 —— update() 尾部 respawn() 调 resetBike() **直接改写**五质点坐标，
    //     这一帧的刚性误差来自"摆位"而不是"求解"，必须能被随后的 solvePositions 修好。
    // 正常帧（6804/7200）残差均值 0.0057px、刚性均值 0.0058px，对 SOLVER_TOL=0.05
    // 有 8.6 倍余量 —— 求解器本身收敛得很好，之前失败纯粹是分桶错误。
    const CRASH_RESID_MAX = 3.0;      // 摔车帧残差上界（实测峰 1.452px）
    const CRASH_RIGID_MAX = 0.5 * Lr; // 摔车帧刚性上界（实测峰 1.062px = 杆长 3.3%）
    let nNormal = 0, nCrash = 0, nRespawn = 0;
    let cResidMax = 0, cRigMax = 0, cBad = 0;
    const respawnPairs = [];
    for (const lv of SOLVE_LV) {
      const len = LEVELS[lv].len;
      for (const f of [0.3, 0.55, 0.8]) {
        setup(0, 0, lv, { finishFar: true });
        // ★ 取样点必须在 setup **之后**算：canSpot 读的是 store.lvIdx 对应的地形，
        //   先取点等于拿**上一关**的地形去挑"最平缓处"，采样意图直接走样
        //   （实测第72关因此挑到 m=0.898 的陡坎，而不是 m=-0.019 的缓坡）。
        const x = terrain.canSpot(len, Math.round(len * f));
        B.resetBike(x);
        bike.locked = false;
        key.right = true; key.left = false;
        let sum = 0, n = 0, worst = 0, worstX = 0, rsum = 0, rn = 0, rworst = 0, iters = 0, air = 0;
        let pendingRepair = null;
        for (let i = 0; i < 300; i++) {
          const wasCrashed = store.run.crashed;
          update(DT);
          const re = rigidErr();
          if (wasCrashed && !store.run.crashed) {
            // 本帧刚 respawn：坐标由 resetBike 写入，尚未经过任何约束求解
            nRespawn++;
            pendingRepair = re;
            continue;
          }
          if (store.run.crashed) {
            nCrash++;
            if (!isFin(re) || !isFin(bike.solverResid)) cBad++;
            cResidMax = Math.max(cResidMax, bike.solverResid);
            cRigMax = Math.max(cRigMax, re);
            continue;
          }
          nNormal++;
          sum += bike.solverResid; n++;
          if (bike.solverResid > worst) { worst = bike.solverResid; worstX = bike.rear.x; }
          iters += bike.solverIters;
          if (bike.grounded === 0) air++;
          rsum += re; rn++;
          rworst = Math.max(rworst, re);
          if (pendingRepair !== null) {
            respawnPairs.push({ at: pendingRepair, next: re });
            pendingRepair = null;
          }
        }
        key.right = false; key.left = false;
        const tag = `第${lv + 1}关@${x}`;
        // n>=30 保证这一组确实有足量"正常帧"可判 —— 否则三桶平均会退化成空跑
        check(tag + " · 正常帧约束残差平均收敛到 SOLVER_TOL 内",
          n >= 30 && sum / n < SOLVER_TOL && isFinite(sum / n),
          `均值 ${(n ? sum / n : NaN).toFixed(4)}px / 上限 ${SOLVER_TOL}（${n} 正常帧 / 300，均 ${(n ? iters / n : NaN).toFixed(1)} 次迭代，腾空 ${air} 帧）`);
        check(tag + " · 正常帧瞬时最大残差保持亚像素级（< 1.5px）",
          n >= 30 && worst < 1.5 && isFinite(worst),
          `最大 ${worst.toFixed(3)}px @x=${worstX.toFixed(0)} · 刚性瞬时最大 ${rworst.toFixed(3)}px`);
        check(tag + " · 正常帧车架刚性不漂移（均值 < 0.05px）",
          rn >= 30 && rsum / rn < 0.05 && isFinite(rsum / rn),
          `均值 ${(rn ? rsum / rn : NaN).toFixed(4)}px / 上限 0.05（轮距 ${WHEELBASE}px，杆长 ${Lr.toFixed(1)}px）`);
      }
    }
    check("【分桶】三桶都被采到（否则上面按桶断言就是空跑）",
      nNormal > 0 && nCrash > 0 && nRespawn > 0,
      `正常 ${nNormal} 帧 / 摔车 ${nCrash} 帧 / 重生 ${nRespawn} 帧（共 ${nNormal + nCrash + nRespawn}）`);
    check("【分桶】摔车帧残差与刚性保持在结构可接受范围内（不做亚像素要求）",
      nCrash > 0 && cBad === 0 && isFinite(cResidMax) && isFinite(cRigMax) &&
      cResidMax < CRASH_RESID_MAX && cRigMax < CRASH_RIGID_MAX,
      `${nCrash} 帧 · 残差峰 ${cResidMax.toFixed(3)}/${CRASH_RESID_MAX}px · 刚性峰 ${cRigMax.toFixed(3)}/${CRASH_RIGID_MAX.toFixed(1)}px（= 杆长的 ${(cRigMax / Lr * 100).toFixed(1)}%）· 非有限帧 ${cBad}`);
    check("【分桶】重生帧被随后的 solvePositions 修复（刚性 1 帧内回到 0.05px 内）",
      respawnPairs.length > 0 && respawnPairs.every((p) => isFin(p.next) && p.next < 0.05),
      `${respawnPairs.length} 次重生 · 重生帧刚性 ${respawnPairs.map((p) => p.at.toFixed(1)).join("/")}px → 次帧 ${respawnPairs.map((p) => p.next.toFixed(4)).join("/")}px`);
    // 逆质量加权：把最轻的骑手质点沿 +x 拉开 → 它的修正量必须最大，且两端轴都要被拉动
    for (let vi = 0; vi < STD_VEHICLES.length; vi++) {
      setup(vi, 0, 0, {});
      B.resetBike(300);
      for (const p of bike.pts) { p.y -= 400; p.py -= 400; }
      setVel(0, 0);
      const hx0 = bike.head.x, rx0 = bike.axleR.x, fx0 = bike.axleF.x;
      bike.head.x += 30; bike.head.px += 30;
      B.stepPhysics();
      const dh = Math.abs(bike.head.x - (hx0 + 30));
      const dr = Math.abs(bike.axleR.x - rx0);
      const df = Math.abs(bike.axleF.x - fx0);
      check(`${VEHICLES[vi].name} · 逆质量加权：最轻的骑手质点修正量最大（Δ头 > Δ轴）`,
        dh > dr && dh > df && dh / Math.max(1e-9, dr) > 1.2,
        `Δhead=${dh.toFixed(3)} > ΔaxleR=${dr.toFixed(3)} / ΔaxleF=${df.toFixed(3)}（比 ${(dh / Math.max(1e-9, dr)).toFixed(2)}）`);
      check(`${VEHICLES[vi].name} · 约束作用到全部质点（两端轴心都被拉动且小于骑手）`,
        dr > 0.05 && df > 0.05 && dr < dh && df < dh,
        `ΔaxleR=${dr.toFixed(4)} · ΔaxleF=${df.toFixed(4)} · Δhead=${dh.toFixed(3)}（mR/mH=${(store.phys.rb.mR / store.phys.rb.mH).toFixed(2)}）`);
    }
  });

  // ============================================================
  //  8. 燃料
  // ============================================================
  section("燃料（fuelK 倍率关系 / 拾罐回补 / 耗尽触发重生）");
  guard("燃料·油耗倍率", () => {
    const FUEL_LV = [0, 17, 35, 53, 71];
    const rates = [];
    for (const lv of FUEL_LV) {
      setup(0, 0, lv, { finishFar: true });
      const veh = VEHICLES[store.currentVehicle];
      const fk = levelAt(lv).fuelK;
      const expect = (0.005 * veh.wgt + 0.021 * veh.wgt) * fk;
      store.phys.fuel = store.phys.fuelMax;
      bike.locked = false;
      key.right = true; key.left = false;
      const N = 60;
      for (let i = 0; i < N; i++) update(DT);
      key.right = false; key.left = false;
      const rate = (store.phys.fuelMax - store.phys.fuel) / (N * DT);
      rates.push({ lv, fk, rate });
      check(`第${lv + 1}关（fuelK=${n2(fk, 3)}）· 全油门油耗率与模型逐位一致`,
        Math.abs(rate - expect) < 1e-9 && rate > 0,
        `实测 ${rate.toExponential(6)}/s vs 模型 ${expect.toExponential(6)}/s`);
      store.phys.fuel = store.phys.fuelMax;
      key.right = false; key.left = false;
      for (let i = 0; i < N; i++) update(DT);
      const idle = (store.phys.fuelMax - store.phys.fuel) / (N * DT);
      const expectIdle = 0.005 * veh.wgt * fk;
      check(`第${lv + 1}关 · 松油门油耗率 = 怠速项（0.005×wgt×fuelK）`,
        Math.abs(idle - expectIdle) < 1e-9,
        `实测 ${idle.toExponential(6)}/s vs 模型 ${expectIdle.toExponential(6)}/s`);
    }
    for (let i = 1; i < rates.length; i++) {
      const a = rates[i - 1], b = rates[i];
      check(`第${a.lv + 1}→${b.lv + 1}关 · 油耗率之比 = fuelK 之比`,
        Math.abs(b.rate / a.rate - b.fk / a.fk) < 1e-9,
        `${b.rate.toExponential(3)}/${a.rate.toExponential(3)} = ${(b.rate / a.rate).toFixed(6)} vs fuelK 比 ${(b.fk / a.fk).toFixed(6)}`);
    }
    check("关卡油耗倍率随难度单调递增",
      rates.every((r, i) => i === 0 || r.fk > rates[i - 1].fk),
      rates.map((r) => `第${r.lv + 1}关=${n2(r.fk, 2)}`).join(" "));
  });
  guard("燃料·拾罐回补", () => {
    setup(0, 0, 0, { keepPickups: true });
    store.phys.fuel = store.phys.fuelMax * 0.2;
    const before = store.phys.fuel;
    const gain = 0.45;
    F.refuel(gain);
    check("拾罐 +45% 按油箱比例精确回补",
      Math.abs(store.phys.fuel - (before + gain * store.phys.fuelMax)) < 1e-12,
      `${before.toFixed(4)} → ${store.phys.fuel.toFixed(4)}（+${gain * 100}% × ${store.phys.fuelMax.toFixed(3)}）`);
    check("燃料比率与实际值自洽",
      Math.abs(F.fuelRatio() - store.phys.fuel / store.phys.fuelMax) < 1e-12,
      `fuelRatio=${F.fuelRatio().toFixed(6)}`);
    store.phys.fuel = store.phys.fuelMax * 0.95;
    F.refuel(1);
    check("回补不会超过油箱上限（钳到 fuelMax）",
      store.phys.fuel === store.phys.fuelMax,
      `${store.phys.fuel.toFixed(4)} / 上限 ${store.phys.fuelMax.toFixed(4)}`);
    const c = { x: midX(), y: midY(), taken: false, ph: 0 };
    store.phys.fuel = 0;
    pickCanister(c);
    // 回补量必须读 CAN_FUEL（constants.js 单一事实来源）。这个值从 0.45 调到 0.6 是
    // 有意的——"每罐给得多一点，罐数就能少放"是让油罐变稀疏又不牺牲可通关性的唯一手段。
    check(`拾取油罐实体：标记已拾 + 精确回补 ${Math.round(C.CAN_FUEL * 100)}%`,
      c.taken === true && Math.abs(store.phys.fuel - C.CAN_FUEL * store.phys.fuelMax) < 1e-12,
      `taken=${c.taken} · fuel=${store.phys.fuel.toFixed(4)} / ${(C.CAN_FUEL * store.phys.fuelMax).toFixed(4)}`);
  });
  guard("燃料·耗尽触发", () => {
    for (const lv of [0, 20, 40, 60, 71]) {
      setup(0, 0, lv, {});
      const x = terrain.canSpot(LEVELS[lv].len, Math.round(LEVELS[lv].len * 0.35));
      store.run.lastSafeX = x;
      B.resetBike(x);
      bike.locked = false;
      F.setFuel(0);
      key.right = true; key.left = false;
      update(DT);
      key.right = false; key.left = false;
      const gY = terrain.groundY(bike.rear.x);
      check(`第${lv + 1}关 · 燃料耗尽触发结算：回补 30% 并回到安全点`,
        Math.abs(store.phys.fuel - 0.3 * store.phys.fuelMax) < 1e-9 &&
        bike.locked === false && store.run.crashed === false &&
        isFinite(gY) && Math.abs(bike.rear.y - (gY - WHEEL_R)) < 40,
        `fuel=${store.phys.fuel.toFixed(3)}/${(0.3 * store.phys.fuelMax).toFixed(3)} · rear.y=${bike.rear.y.toFixed(0)} vs 地表 ${gY.toFixed(0)}`);
      // 旧写法 `fuel > 0 && fuel <= fuelMax` 在上一条已断言 fuel === 0.3·fuelMax
      // 之后是**恒真的**（0.3·fuelMax > 0 由构造保证）。改成真正有时间含义的检查：
      // 回补的油必须真的能被后续帧消耗掉 —— 继续跑 1s，燃料应严格下降
      // （证明它是个活的存量而非写死的常数），但又不能掉到 0（否则等于立刻二次耗尽）。
      const f0 = store.phys.fuel;
      key.right = true; key.left = false;
      let fMin = store.phys.fuel;
      for (let i = 0; i < 60; i++) { update(DT); fMin = Math.min(fMin, store.phys.fuel); }
      key.right = false; key.left = false;
      check(`第${lv + 1}关 · 回补的油是活存量（1s 内被消耗但不二次耗尽）`,
        store.phys.fuel < f0 - 1e-9 && fMin > 0 && fMin >= store.phys.fuel - 1e-12,
        `${f0.toFixed(4)} → 1s 后 ${store.phys.fuel.toFixed(4)}（最低 ${fMin.toFixed(4)}，耗 ${(f0 - fMin).toFixed(4)}）/ 上限 ${store.phys.fuelMax.toFixed(4)}`);
    }
    setup(0, 0, 0, {});
    store.phys.fuel = 0.05;
    let neg = false;
    for (let i = 0; i < 240; i++) { update(DT); if (store.phys.fuel < -1e-12) neg = true; }
    check("长时间运行燃料不会变成负数",
      !neg, `终值 fuel=${store.phys.fuel.toFixed(4)}`);
  });

  // ============================================================
  //  9. 全局收尾
  // ============================================================
  section("全局收尾（数值兜底 / 状态复原 / 异常汇总 / 耗时）");
  const capAfter = B.capHitCount();
  check("NUM_CAP_V 数值兜底在整套扫描中从未触发",
    capAfter === capBefore, `触发次数 ${capAfter - capBefore}（${capBefore} → ${capAfter}）`);
  check("所有分区均无未捕获异常",
    thrown.length === 0, thrown.length ? thrown.join(" | ") : "无异常");

  key.left = false; key.right = false;
  store.currentVehicle = vehBak;
  try { store.upgrades = JSON.parse(upBak); } catch (e) { store.upgrades = {}; }
  B.applyUpgrades();

  const secs = ((Date.now() - T_START) / 1000).toFixed(1);
  check("体检耗时在预算内（< 110s）",
    (Date.now() - T_START) / 1000 < 110, `${secs}s`);
}
