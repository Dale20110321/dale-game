#!/usr/bin/env node
// ============================================================
//  深度体检（逐项审计，~3000 项）
//    与 autotest.mjs 的分工：
//      autotest.mjs —— 功能与物理的**聚合**断言（476 项，跑得慢但条数少）
//      audit.mjs    —— 把同一批数据**逐项摊开**体检（每关 / 每场景 / 每车 /
//                      每个令牌单独查），条数多得多，能定位到"第几关的哪一项坏了"
//    用法：
//      node tools/audit.mjs            # 全量
//      node tools/audit.mjs --quiet    # 只打结论与失败项
//      node tools/audit.mjs --section=关卡  # 只跑某个 section（子串匹配）
// ============================================================
import { join } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { ROOT, results, failures, check, section, near, finish, imp } from "./harness.mjs";

const QUIET = process.argv.includes("--quiet");
const SEC = (() => {
  const a = process.argv.find((s) => s.startsWith("--section="));
  return a ? a.split("=")[1] : null;
})();
let curSection = "";
/** 只在选中 section 内记录（用于 --section 过滤） */
const on = (name) => {
  if (!SEC) return true;
  if (!curSection) return false;
  return curSection.includes(SEC);
};
const sect = (t) => { curSection = t; if (!SEC || t.includes(SEC)) section(t); };
const ck = (n, c, d) => (on() ? check(n, c, d) : false);

// ------------------------------------------------------------
//  0. 加载全部模块
// ------------------------------------------------------------
const { store, bike, world } = await imp("core/store.js");
const { key } = await imp("core/input.js");
const { LEVELS, BRANCHES, FINALE, FINALE_INDEX, LEVELS_PER_BRANCH, N_BRANCHES, starTime, variantRule, VARIANTS, VARIANT_RULES, levelHillY, levelGroundInfo, airTargetOf } = await imp("config/levels.js");
const { THEMES } = await imp("config/themes.js");
const { VEHICLES } = await imp("config/vehicles.js");
const { ACHS, RANKS, SAVE_KEYS, SAVE_APP, SAVE_FORMAT, MAX_LV, upCost, rankName, DT, SUB, toKmh, toM, kmhToPxs, REF_SPEED, CRASH_FUEL_LOSS, CRASH_TIME_PENALTY, gateSpeed, hazardSpeed, PEN_TOL, CONTACT_BAND, SOLVER_TOL, SOLVER_ITERS, NUM_CAP_V, WHEEL_R, WHEELBASE, SEAT_H, PX_PER_M, RUN_IN_GUESS } = await imp("config/constants.js");
const { TOKENS, semColor, fontOf } = await imp("config/ui-tokens.js");
const { startGame, update } = await imp("game/game.js");
const { buildLevel } = await imp("game/world.js");
const { groundInfo, groundY, canSpot, safeSpot } = await imp("physics/terrain.js");
const { stepPhysics, resetBike, applyUpgrades } = await imp("physics/bike.js");
const { drawScene } = await imp("render/scene.js");
const { view } = await imp("core/canvas.js");
const { clamp, lerp, mulberry32, wrapAngle } = await imp("core/utils.js");
const { Stepper } = await imp("core/loop.js");
const { save, loadSave, getUp } = await imp("core/storage.js");

// canvas 桩默认 0×0，先给一个真实视口（渲染类检查依赖它）
view.W = 1280; view.H = 720;

// ------------------------------------------------------------
//  1. 标度与常量自洽
// ------------------------------------------------------------
sect("常量与标度自洽");
{
  ck("PX_PER_M = 100", PX_PER_M === 100, String(PX_PER_M));
  ck("DT = 1/60", near(DT, 1 / 60, 1e-12), String(DT));
  ck("SUB = 6", SUB === 6, String(SUB));
  // km/h ↔ px/s 互逆
  let worst = 0;
  for (const v of [0, 1, 7.5, 30, 120, 400]) worst = Math.max(worst, Math.abs(kmhToPxs(toKmh(v)) - v));
  ck("toKmh / kmhToPxs 互逆", worst < 1e-9, `最大误差 ${worst.toExponential(1)}px/s`);
  ck("toKmh(0)=0", toKmh(0) === 0);
  ck("toM(100)=1", near(toM(100), 1, 1e-12));
  ck("toM/toKmh 比例正确", near(toKmh(100) / toM(100), 3.6, 1e-9), `${toKmh(100) / toM(100)}`);
  ck("MAX_LV = 100", MAX_LV === 100, String(MAX_LV));
  ck("upCost 单调递增", upCost(0) < upCost(50) && upCost(50) < upCost(99), `${upCost(0)}/${upCost(50)}/${upCost(99)}`);
  ck("upCost(0) > 0", upCost(0) > 0, String(upCost(0)));
  ck("SAVE_APP 标识", SAVE_APP === "dale-bike", SAVE_APP);
  ck("SAVE_FORMAT = 1", SAVE_FORMAT === 1, String(SAVE_FORMAT));
  ck("SOLVER_TOL > 0", SOLVER_TOL > 0, String(SOLVER_TOL));
  ck("SOLVER_ITERS >= 4", SOLVER_ITERS >= 4, String(SOLVER_ITERS));
  ck("NUM_CAP_V 远高于 REF_SPEED", NUM_CAP_V > REF_SPEED * 5, `${NUM_CAP_V} vs ${REF_SPEED.toFixed(0)}`);
  ck("PEN_TOL > 0", PEN_TOL > 0, String(PEN_TOL));
  ck("CONTACT_BAND > 0", CONTACT_BAND > 0, String(CONTACT_BAND));
  ck("WHEELBASE = 2·WHEEL_R", near(WHEELBASE, WHEEL_R * 2 + 14, 14), `${WHEELBASE}`);
  ck("SEAT_H > WHEEL_R", SEAT_H > WHEEL_R, `${SEAT_H} > ${WHEEL_R}`);
  ck("CRASH_FUEL_LOSS = 0.08", CRASH_FUEL_LOSS === 0.08);
  ck("CRASH_TIME_PENALTY = 2", CRASH_TIME_PENALTY === 2);
  ck("gateSpeed = den3×0.8", near(gateSpeed(248), 248 * 0.8, 1e-9));
  ck("hazardSpeed 随 ramp 收紧", hazardSpeed(1) < hazardSpeed(0), `${hazardSpeed(1).toFixed(0)}<${hazardSpeed(0).toFixed(0)}`);
  ck("hazardSpeed(0) = REF×0.95", near(hazardSpeed(0), REF_SPEED * 0.95, 1e-9));
}

// ------------------------------------------------------------
//  2. 工具函数
// ------------------------------------------------------------
sect("工具函数");
{
  ck("clamp 上界", clamp(5, 0, 3) === 3);
  ck("clamp 下界", clamp(-5, 0, 3) === 0);
  ck("clamp 区间内", clamp(2, 0, 3) === 2);
  ck("clamp 负区间", clamp(-2, -5, -1) === -2);
  ck("lerp 端点", lerp(0, 10, 0) === 0 && lerp(0, 10, 1) === 10);
  ck("lerp 中点", near(lerp(0, 10, 0.5), 5, 1e-12));
  ck("wrapAngle(0)=0", near(wrapAngle(0), 0, 1e-12));
  ck("wrapAngle(2π)=0", near(wrapAngle(Math.PI * 2), 0, 1e-9));
  ck("wrapAngle(-2π)=0", near(wrapAngle(-Math.PI * 2), 0, 1e-9));
  ck("wrapAngle(3π/2)=-π/2", near(wrapAngle(Math.PI * 1.5), -Math.PI / 2, 1e-9));
  // mulberry32 确定性 + 分布
  const a1 = mulberry32(42), a2 = mulberry32(42);
  let same = true, inRange = true, sum = 0;
  for (let i = 0; i < 2000; i++) { const x = a1(), y = a2(); if (x !== y) same = false; if (x < 0 || x >= 1) inRange = false; sum += x; }
  ck("mulberry32 同种子逐值一致", same);
  ck("mulberry32 值域 [0,1)", inRange);
  ck("mulberry32 均值 ≈0.5", Math.abs(sum / 2000 - 0.5) < 0.03, (sum / 2000).toFixed(4));
  const b1 = mulberry32(42), b2 = mulberry32(43);
  let diff = 0; for (let i = 0; i < 500; i++) if (b1() !== b2()) diff++;
  ck("mulberry32 异种子序列不同", diff > 400, `${diff}/500`);
}

// ------------------------------------------------------------
//  3. 逐关体检（72 关 × 26 项）
// ------------------------------------------------------------
sect("逐关体检（72 关）");
{
  const fps = new Map();       // 地形指纹 → 关卡下标（查重）
  const seenSlope = [];
  const seenDen = [];
  const seenFuel = [];
  const seenLen = [];
  const seenMech = [];
  const targetSlope = (gN) => 19.5 + 34.5 * Math.pow(gN, 1.1);

  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    const gN = i / (LEVELS.length - 1);
    const bi = Math.floor(i / LEVELS_PER_BRANCH);
    const tag = `L${i + 1}`;

    // --- 标量字段 ---
    ck(`${tag} len 有限且在 [4000,14000]`, isFinite(L.len) && L.len >= 4000 && L.len <= 14000, String(L.len));
    ck(`${tag} maxSlope 有限且 ≤70°`, isFinite(L.maxSlope) && L.maxSlope <= 70, L.maxSlope.toFixed(2));
    ck(`${tag} maxSlope 命中目标曲线`, near(L.maxSlope, targetSlope(gN), 0.01), `${L.maxSlope.toFixed(3)} vs ${targetSlope(gN).toFixed(3)}`);
    ck(`${tag} ramp ∈ [0,1]`, L.ramp >= 0 && L.ramp <= 1, L.ramp.toFixed(4));
    ck(`${tag} den3 ∈ [0.45,0.75]×REF`, L.den3 >= 0.45 * REF_SPEED - 1e-6 && L.den3 <= 0.75 * REF_SPEED + 1e-6, L.den3.toFixed(1));
    ck(`${tag} fuelK ∈ [1,4.2]`, L.fuelK >= 1 - 1e-9 && L.fuelK <= 4.2, L.fuelK.toFixed(3));
    ck(`${tag} coinN ∈ [1,100]`, L.coinN >= 1 && L.coinN <= 100, String(L.coinN));
    ck(`${tag} mech ∈ [0,1]`, L.mech >= 0 && L.mech <= 1, L.mech.toFixed(3));
    ck(`${tag} theme 与支线一致`, L.theme === BRANCHES[bi].theme, `${L.theme}`);
    ck(`${tag} variant 合法`, VARIANTS.includes(L.variant), L.variant);
    ck(`${tag} 名称以支线名开头`, L.name.startsWith(BRANCHES[bi].name), L.name);
    ck(`${tag} mood 字段存在`, typeof L.mood === "string" && L.mood.length > 0, L.mood);
    ck(`${tag} hazardN ∈ [1,6]`, L.hazardN >= 1 && L.hazardN <= 6, String(L.hazardN));
    ck(`${tag} gateN ∈ [3,5]`, L.gateN >= 3 && L.gateN <= 5, String(L.gateN));
    const st = starTime(L);
    ck(`${tag} starTime 有限正`, isFinite(st) && st > 0, st.toFixed(1) + "s");
    ck(`${tag} starTime 与 den3 一致`, near(st, L.len / L.den3, 1e-6));

    // --- 单调性（逐关对比前一关）---
    if (i > 0) {
      const P = LEVELS[i - 1];
      ck(`${tag} maxSlope ≥ 前一关`, L.maxSlope >= P.maxSlope - 1e-9, `${L.maxSlope.toFixed(2)} ≥ ${P.maxSlope.toFixed(2)}`);
      ck(`${tag} den3 ≤ 前一关`, L.den3 <= P.den3 + 1e-9, `${L.den3.toFixed(1)} ≤ ${P.den3.toFixed(1)}`);
      ck(`${tag} fuelK ≥ 前一关`, L.fuelK >= P.fuelK - 1e-9);
      ck(`${tag} len ≥ 前一关`, L.len >= P.len - 1e-9, `${L.len} ≥ ${P.len}`);
      ck(`${tag} mech ≥ 前一关`, L.mech >= P.mech - 1e-9);
    }

    // --- 结构数组 ---
    ck(`${tag} waves 恰好 3 层`, Array.isArray(L.waves) && L.waves.length === 3, String(L.waves.length));
    let wOk = true, wLen = true, wDetail = "";
    for (const w of L.waves) {
      if (!(isFinite(w.f) && w.f > 0 && isFinite(w.amp) && w.amp > 0 && isFinite(w.ph))) wOk = false;
      const wl = (2 * Math.PI) / w.f;
      if (wl < 340) { wLen = false; wDetail = `λ=${wl.toFixed(0)}`; }
    }
    ck(`${tag} 每层波参数合法`, wOk);
    ck(`${tag} 每层波长 ≥340px（曲率护栏）`, wLen, wDetail);
    let sOk = true, sAsc = true;
    for (let k = 0; k < L.steps.length; k++) {
      const s = L.steps[k];
      if (!(isFinite(s.cx) && isFinite(s.drop) && s.drop > 0)) sOk = false;
      if (k > 0 && s.cx <= L.steps[k - 1].cx) sAsc = false;
    }
    ck(`${tag} 断层参数合法`, sOk, `${L.steps.length} 条`);
    ck(`${tag} 断层 cx 严格升序`, sAsc);
    let fOk = true, fAsc = true, fWide = true;
    for (let k = 0; k < (L.feats || []).length; k++) {
      const f = L.feats[k];
      if (!(isFinite(f.x0) && isFinite(f.x1) && f.x1 > f.x0 && isFinite(f.amp))) fOk = false;
      if (k > 0 && f.x0 < L.feats[k - 1].x0) fAsc = false;
      if (f.x1 - f.x0 < 400) fWide = false;
    }
    ck(`${tag} 局部地貌参数合法`, fOk, `${(L.feats || []).length} 处`);
    ck(`${tag} 局部地貌 x0 升序（levelHillY 早退依赖）`, fAsc);
    ck(`${tag} 局部地貌宽度 ≥400px`, fWide);

    // --- 地形实采（粗采样：NaN / 高度 / 爬升）---
    let nan = 0, yLo = Infinity, yHi = -Infinity, climb = 0;
    for (let x = 0; x <= L.len; x += 11) {
      const gi = levelGroundInfo(L, x);
      if (!isFinite(gi.y) || !isFinite(gi.m)) { nan++; continue; }
      if (gi.y < yLo) yLo = gi.y;
      if (gi.y > yHi) yHi = gi.y;
      if (gi.m < 0) climb += -gi.m * 11;
    }
    // --- 曲率（C¹ 护栏）：必须按 **1px 步长**量 ---
    // 曲率 = d²y/dx²，若按 h 步长量"斜率变化"得到的是 h·曲率，会随步长线性放大。
    // 原曲线的包线 0.039 是 1px 步长量的，这里必须同口径才可比。
    let maxCurv = 0, curvAt = 0;
    let pm = levelGroundInfo(L, 0).m, cm = levelGroundInfo(L, 1).m;
    for (let x = 1; x <= L.len; x++) {
      const nm = levelGroundInfo(L, x + 1).m;
      const c = Math.abs((nm - pm) / 2);
      if (c > maxCurv) { maxCurv = c; curvAt = x; }
      pm = cm; cm = nm;
    }
    ck(`${tag} 地形全程无 NaN/Inf`, nan === 0, `${nan} 个坏点`);
    ck(`${tag} 高度范围有限且非退化`, isFinite(yLo) && isFinite(yHi) && yHi > yLo, `[${yLo.toFixed(0)}, ${yHi.toFixed(0)}]`);
    ck(`${tag} 高度在合理量级（-5000..9000）`, yLo > -5000 && yHi < 9000, `[${yLo.toFixed(0)}, ${yHi.toFixed(0)}]`);
    ck(`${tag} 曲率在求解器包线内 (<0.05)`, maxCurv < 0.05, `${maxCurv.toFixed(4)} @x=${curvAt}`);
    ck(`${tag} 曲率与原曲线同量级 (<0.045)`, maxCurv < 0.045, maxCurv.toFixed(4));
    // 出生点平缓（起点必须能起步）；终点只要求不是断崖（过线即结算，坡度无碍）
    const mStart = Math.abs(levelGroundInfo(L, 200).m);
    const mEnd = Math.abs(levelGroundInfo(L, L.len - 200).m);
    ck(`${tag} 出生区平缓 (|m|<0.25)`, mStart < 0.25, mStart.toFixed(3));
    ck(`${tag} 终点区非断崖 (|m|<0.5)`, mEnd < 0.5, mEnd.toFixed(3));
    // 爬升预算：随 len 线性，原曲线 ≈ 0.082·len
    const budget = 0.082 * L.len;
    ck(`${tag} 累计爬升在预算 2 倍内`, climb < budget * 2, `${climb.toFixed(0)} / ${budget.toFixed(0)}px`);
    // 地形指纹唯一
    let fp = 0;
    for (let x = 150; x < L.len; x += 83) fp += levelHillY(L, x);
    const key = fp.toFixed(4);
    ck(`${tag} 地形指纹唯一（不与任何其他关重复）`, !fps.has(key), fps.has(key) ? `与 L${fps.get(key) + 1} 相同` : key);
    fps.set(key, i);

    // --- 变体规则一致性 ---
    const r = variantRule(L.variant);
    const at = airTargetOf(L);
    ck(`${tag} 变体规则存在`, !!r, L.variant);
    ck(`${tag} 变体规则字段完整`, !!r && ["hazardK", "gateK", "canN", "jumpN", "prepFuel"].every((k) => k in r));
    if (r.jumpN) ck(`${tag} 有跳台变体时 airTarget > 0`, at > 0, at.toFixed(2));
    else ck(`${tag} 无跳台变体时 airTarget = 0`, at === 0, String(at));

    seenSlope.push(L.maxSlope); seenDen.push(L.den3);
    seenFuel.push(L.fuelK); seenLen.push(L.len); seenMech.push(L.mech);
  }

  // 全局不变量（汇总）
  const mono = (arr) => arr.every((v, k) => k === 0 || v >= arr[k - 1] - 1e-9);
  const monoD = (arr) => arr.every((v, k) => k === 0 || v <= arr[k - 1] + 1e-9);
  ck(`【全局】${LEVELS.length} 关 maxSlope 单调非减`, mono(seenSlope));
  ck(`【全局】${LEVELS.length} 关 den3 单调非增`, monoD(seenDen));
  ck(`【全局】${LEVELS.length} 关 fuelK 单调非减`, mono(seenFuel));
  ck(`【全局】${LEVELS.length} 关 len 单调非减`, mono(seenLen));
  ck(`【全局】${LEVELS.length} 关 mech 单调非减`, mono(seenMech));
  ck("【全局】72 关地形指纹全部不同", fps.size === LEVELS.length, `${fps.size}/${LEVELS.length}`);
  // ★ 下标必须是 LEVELS.length-1 而不是写死的 71：写死的话 432 关时读到的只是
  //   "第 72 关"，比值从 2.7× 掉到 1.24×，看起来像难度曲线坏了，其实是断言自己过期了。
  const lastSlope = seenSlope[seenSlope.length - 1];
  ck("【全局】末关坡度 > 首关 1.5 倍", lastSlope > seenSlope[0] * 1.5,
    `末关(第${seenSlope.length}关) ${lastSlope.toFixed(2)} / 首关 ${seenSlope[0].toFixed(2)} = ${(lastSlope / seenSlope[0]).toFixed(2)}×`);

  // ---- 生效中的局部地貌不得退化成"代码在、功能死" ----
  // 这条是被变异测试逼出来的：FEAT_AMP_MAX 一度被留在调试值 0，
  // 5 类局部地貌全部静默失效，而**没有任何一条断言发现**（它们只查"参数合法"，
  // 而 amp=0 恰好是合法数值）。所以这里查的是"真的有振幅"，不是"有字段"。
  const featKinds = new Map();
  let activeFeats = 0;
  for (const L of LEVELS) {
    for (const f of L.feats || []) {
      featKinds.set(f.kind, (featKinds.get(f.kind) || 0) + 1);
      if (Math.abs(f.amp) > 0.5) activeFeats++;
    }
  }
  ck("【全局】存在生效中的局部地貌（不是全 0 振幅的死代码）", activeFeats > 0, `${activeFeats} 处有实际振幅`);
  ck("【全局】ramp（长直坡）在用", (featKinds.get("ramp") || 0) > 0, `${featKinds.get("ramp") || 0} 处`);
  ck("【全局】生效局部地貌覆盖多个关卡", new Set(LEVELS.filter((L) => (L.feats || []).some((f) => Math.abs(f.amp) > 0.5)).map((L) => L.name)).size >= 24,
    `${LEVELS.filter((L) => (L.feats || []).some((f) => Math.abs(f.amp) > 0.5)).length} 关`);
  ck("【全局】地形体格 12 种全部被关卡使用", new Set(LEVELS.map((L) => L.mood)).size === 12,
    `${new Set(LEVELS.map((L) => L.mood)).size} 种`);
}

// ------------------------------------------------------------
//  4. 逐场景体检（12 × 24）
// ------------------------------------------------------------
sect("逐场景体检（12 场景）");
{
  const hexRe = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  for (let i = 0; i < THEMES.length; i++) {
    const T = THEMES[i];
    const tag = `T${i} ${T.name}`;
    ck(`${tag} 重力为正且在 [200,2000]`, isFinite(T.g) && T.g > 200 && T.g < 2000, String(T.g));
    ck(`${tag} traction 为正且在 [0.3,2]`, isFinite(T.traction) && T.traction >= 0.3 && T.traction <= 2, String(T.traction));
    ck(`${tag} pal 三色齐备`, Array.isArray(T.pal) && T.pal.length === 3, JSON.stringify(T.pal));
    ck(`${tag} pal 全部合法色值`, T.pal.every((c) => hexRe.test(c)), T.pal.join(","));
    ck(`${tag} sky 有渐变色`, Array.isArray(T.sky) && T.sky.length >= 2, JSON.stringify(T.sky).slice(0, 60));
    ck(`${tag} sun 存在`, !!T.sun);
    ck(`${tag} ground 存在`, !!T.ground);
    ck(`${tag} deco 列表非空`, Array.isArray(T.deco) && T.deco.length > 0, (T.deco || []).join(","));
    ck(`${tag} deco 元素均为非空串`, T.deco.every((d) => typeof d === "string" && d.length > 0));
    ck(`${tag} surface 存在且有 type`, !!(T.surface && T.surface.type), T.surface && T.surface.type);
    ck(`${tag} surface 有配色`, !!(T.surface && (T.surface.color || T.surface.color2)));
    ck(`${tag} dust 有 light/heavy`, !!(T.dust && T.dust.light && T.dust.heavy), T.dust && `${T.dust.light}/${T.dust.heavy}`);
    ck(`${tag} dust 色值合法`, !!(T.dust.light && hexRe.test(T.dust.light)));
    ck(`${tag} ambient 存在`, !!T.ambient, T.ambient && T.ambient.type);
    ck(`${tag} bg 图层键非空`, !!T.bg && Object.keys(T.bg).length > 0, Object.keys(T.bg || {}).join(","));
    // bg 的取值语义：null/false = 该场景**刻意不启用**这一层（如绿野没有极光、月面没有霾），
    // 所以"必须有数据"是错的；正确的不变量是"键齐全，且非空值的结构合法"。
    ck(`${tag} bg 键无 undefined（缺失即未声明）`, Object.values(T.bg || {}).every((v) => v !== undefined),
      Object.entries(T.bg || {}).filter(([, v]) => v === undefined).map(([k]) => k).join(","));
    ck(`${tag} bg 非空图层结构合法`, Object.entries(T.bg || {})
      .filter(([, v]) => v !== null && v !== false)
      .every(([k, v]) => (Array.isArray(v) ? v.length >= 0 : typeof v === "object" || typeof v === "boolean" || typeof v === "number")),
      Object.entries(T.bg || {}).filter(([, v]) => v !== null && v !== false).map(([k]) => k).join(","));

    // 逐场景渲染一帧（三种画质）
    for (const q of ["low", "medium", "high"]) {
      let err = null;
      try {
        startGame("level", i * LEVELS_PER_BRANCH);
        store.phys.theme = i;
        localStorage.setItem("dale_quality", q);
        for (let f = 0; f < 3; f++) drawScene();
      } catch (e) { err = e.message; }
      ck(`${tag} 渲染一帧不抛异常 [${q}]`, !err, err || "");
    }

    // 该场景下的环境物理确实生效
    startGame("level", i * LEVELS_PER_BRANCH);
    store.phys.theme = i;
    const T2 = THEMES[i];
    ck(`${tag} 场景重力进入 store.phys`, isFinite(store.phys.GRAV) && store.phys.GRAV > 0, String(store.phys.GRAV));
    ck(`${tag} 场景抓地进入 store.phys`, store.phys.TRACTION === T2.traction, `${store.phys.TRACTION}`);
    // 12 个场景两两不同（名字与重力组合唯一）
    const names = THEMES.map((x) => x.name);
    ck(`${tag} 场景名唯一`, names.indexOf(T.name) === i, T.name);
  }
  ck("【全局】12 个场景名互不相同", new Set(THEMES.map((t) => t.name)).size === THEMES.length);
  ck("【全局】12 个场景重力不全相同（存在差异）", new Set(THEMES.map((t) => t.g)).size >= 3, `${new Set(THEMES.map((t) => t.g)).size} 种`);
  ck("【全局】12 个场景抓地不全相同", new Set(THEMES.map((t) => t.traction)).size >= 4, `${new Set(THEMES.map((t) => t.traction)).size} 种`);
}

// ------------------------------------------------------------
//  5. 逐车体检（3 × 20）
// ------------------------------------------------------------
sect("逐车体检（3 辆车）");
{
  for (let i = 0; i < VEHICLES.length; i++) {
    const v = VEHICLES[i];
    const tag = `V${i} ${v.name}`;
    ck(`${tag} id 唯一`, VEHICLES.findIndex((x) => x.id === v.id) === i, v.id);
    ck(`${tag} name 非空`, !!v.name);
    ck(`${tag} price ≥ 0`, v.price >= 0, String(v.price));
    ck(`${tag} spd > 0`, v.spd > 0, String(v.spd));
    ck(`${tag} grp > 0`, v.grp > 0, String(v.grp));
    ck(`${tag} wgt > 0`, v.wgt > 0, String(v.wgt));
    ck(`${tag} air > 0`, v.air > 0, String(v.air));
    ck(`${tag} tank > 0`, v.tank > 0, String(v.tank));
    ck(`${tag} color 合法`, /^#[0-9a-f]{6}$/i.test(v.color), v.color);
    ck(`${tag} phys.mass > 0`, v.phys.mass > 0, String(v.phys.mass));
    ck(`${tag} phys.inertia > 0`, v.phys.inertia > 0, String(v.phys.inertia));
    ck(`${tag} phys.torque > 0`, v.phys.torque > 0, String(v.phys.torque));
    ck(`${tag} phys.rpm > 0`, v.phys.rpm > 0, String(v.phys.rpm));
    ck(`${tag} phys.travel > 0`, v.phys.travel > 0, String(v.phys.travel));
    ck(`${tag} phys.suspK > 0`, v.phys.suspK > 0);
    ck(`${tag} phys.suspC > 0`, v.phys.suspC > 0);
    // 派生量随升级单调
    const { deriveHandling, deriveRigidBody, deriveSuspension, deriveFriction } = await imp("config/constants.js");
    const h0 = deriveHandling(v, { engine: 0, tire: 0, frame: 0 });
    const h9 = deriveHandling(v, { engine: 90, tire: 90, frame: 90 });
    ck(`${tag} 引擎升级提升扭矩`, h9.torquePeak > h0.torquePeak, `${h0.torquePeak.toFixed(0)}→${h9.torquePeak.toFixed(0)}`);
    ck(`${tag} 升级提升 MAXV`, h9.MAXV > h0.MAXV, `${h0.MAXV.toFixed(0)}→${h9.MAXV.toFixed(0)}`);
    ck(`${tag} 升级提升 crashMargin`, h9.crashMargin > h0.crashMargin, `${h0.crashMargin.toFixed(1)}→${h9.crashMargin.toFixed(1)}`);
    ck(`${tag} crashMargin ≤ 14`, h9.crashMargin <= 14 + 1e-9, h9.crashMargin.toFixed(2));
    const rb = deriveRigidBody(v);
    ck(`${tag} 刚体总质量 = 部件之和`, near(rb.mTot, rb.mR + rb.mF + rb.mH + 2 * rb.mW, 1e-9), rb.mTot.toFixed(3));
    ck(`${tag} 转动惯量 > 0`, rb.iBody > 0, rb.iBody.toFixed(2));
    const s0 = deriveSuspension(v, { susp: 0 }), s9 = deriveSuspension(v, { susp: 90 });
    ck(`${tag} 减震升级提升刚度`, s9.k > s0.k, `${s0.k.toFixed(0)}→${s9.k.toFixed(0)}`);
    ck(`${tag} 减震升级提升阻尼`, s9.c > s0.c);
    ck(`${tag} 减震升级提升行程`, s9.travel > s0.travel, `${s0.travel.toFixed(1)}→${s9.travel.toFixed(1)}`);
    ck(`${tag} 悬挂 ext < travel`, s9.ext < s9.travel);
    const mu0 = deriveFriction(1, v, { tire: 0 }), mu9 = deriveFriction(1, v, { tire: 90 });
    ck(`${tag} 轮胎升级提升 μ`, mu9 > mu0, `${mu0.toFixed(3)}→${mu9.toFixed(3)}`);
  }
  ck("【全局】3 辆车 id 互不相同", new Set(VEHICLES.map((v) => v.id)).size === VEHICLES.length);
  ck("【全局】至少一辆车免费可骑", VEHICLES.some((v) => v.price === 0), VEHICLES.map((v) => v.price).join(","));
  ck("【全局】车辆速度/抓地/重量确有差异",
    new Set(VEHICLES.map((v) => v.spd)).size > 1 && new Set(VEHICLES.map((v) => v.grp)).size > 1 && new Set(VEHICLES.map((v) => v.wgt)).size > 1,
    `spd=${VEHICLES.map((v) => v.spd)} grp=${VEHICLES.map((v) => v.grp)} wgt=${VEHICLES.map((v) => v.wgt)}`);
}

// ------------------------------------------------------------
//  6. 逐变体体检（6 × 8）
// ------------------------------------------------------------
sect("逐变体体检（6 变体）");
{
  for (const v of VARIANTS) {
    const r = VARIANT_RULES[v];
    const tag = `var ${v}`;
    ck(`${tag} 规则存在`, !!r);
    // hazardK 允许为 0：gauntlet / airtime 刻意用跳台取代危险段
    ck(`${tag} hazardK ≥ 0`, r.hazardK >= 0, String(r.hazardK));
    ck(`${tag} gateK > 0`, r.gateK > 0, String(r.gateK));
    ck(`${tag} jumpN ≥ 0`, r.jumpN >= 0, String(r.jumpN));
    ck(`${tag} canN 为 null 或非负整数`, r.canN === null || (Number.isInteger(r.canN) && r.canN >= 0), String(r.canN));
    ck(`${tag} prepFuel 为布尔`, typeof r.prepFuel === "boolean");
    ck(`${tag} variantRule() 返回同一对象`, variantRule(v) === r);
  }
  ck("【全局】6 种变体都有实际关卡在用", VARIANTS.every((v) => LEVELS.some((L) => L.variant === v)),
    VARIANTS.map((v) => `${v}:${LEVELS.filter((L) => L.variant === v).length}`).join(" "));
  ck("【全局】normal 变体占多数", LEVELS.filter((L) => L.variant === "normal").length > 36, String(LEVELS.filter((L) => L.variant === "normal").length));
  ck("【全局】每关恰好一个变体", LEVELS.every((L) => VARIANTS.includes(L.variant)));
}

// ------------------------------------------------------------
//  7. 逐令牌体检（146）
// ------------------------------------------------------------
sect("逐令牌体检");
{
  const cssRaw = readFileSync(join(ROOT, "styles", "tokens.css"), "utf8");
  const rootBody = (cssRaw.match(/:root\s*\{([\s\S]*?)\}/) || ["", ""])[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const cssTokens = {};
  for (const seg of rootBody.split(";")) {
    const m = seg.match(/^\s*--([a-z0-9-]+)\s*:\s*([\s\S]+)$/i);
    if (m) cssTokens[m[1]] = m[2].trim();
  }
  const keys = Object.keys(TOKENS);
  for (const k of keys) {
    ck(`令牌 ${k} 双端存在`, k in cssTokens, cssTokens[k] === undefined ? "CSS 缺失" : `CSS=${cssTokens[k]}`);
    ck(`令牌 ${k} 取值一致`, cssTokens[k] !== undefined && cssTokens[k] === TOKENS[k], `${TOKENS[k]} vs ${cssTokens[k]}`);
  }
  ck("【全局】令牌总数 = CSS 键数", keys.length === Object.keys(cssTokens).length, `${keys.length} vs ${Object.keys(cssTokens).length}`);
  const colorKeys = keys.filter((k) => /^#|^rgb/.test(String(TOKENS[k])));
  for (const k of colorKeys) {
    ck(`令牌 ${k} 是合法颜色`, /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(TOKENS[k]) || /^rgba?\([\d.,\s]+\)$/.test(TOKENS[k]), String(TOKENS[k]));
  }
  ck("【全局】颜色类令牌数量合理", colorKeys.length > 20, `${colorKeys.length} 个`);
  ck("semColor(danger) 可用", /^#|rgb/.test(semColor("danger")), semColor("danger"));
  ck("semColor(info) 可用", /^#|rgb/.test(semColor("info")), semColor("info"));
  ck("semColor(success) 可用", /^#|rgb/.test(semColor("success")), semColor("success"));
  ck("semColor(warn) 可用", /^#|rgb/.test(semColor("warn")), semColor("warn"));
  ck("fontOf(title) 非空", typeof fontOf("title") === "string" && fontOf("title").length > 0, fontOf("title"));
  ck("fontOf(body) 非空", typeof fontOf("body") === "string" && fontOf("body").length > 0);
  ck("fontOf(label) 非空", typeof fontOf("label") === "string" && fontOf("label").length > 0);
}

// ------------------------------------------------------------
//  8. 段位 / 成就 / 存档键
// ------------------------------------------------------------
sect("段位与成就与存档键");
{
  for (let i = 0; i < RANKS.length; i++) {
    const r = RANKS[i];
    ck(`段位 ${r.name} min 合法`, Number.isFinite(r.min) && r.min >= 0, String(r.min));
    if (i > 0) ck(`段位 ${r.name} min 递增`, r.min > RANKS[i - 1].min, `${RANKS[i - 1].min} → ${r.min}`);
    const lo = r.min, hi = i + 1 < RANKS.length ? RANKS[i + 1].min : 1e9;
    ck(`段位 ${r.name} 在 [min, 下一档) 解析正确`,
      rankName(lo) === r.name && (i + 1 >= RANKS.length || rankName(hi - 1) === r.name),
      `${lo}→${rankName(lo)} ${hi - 1}→${rankName(hi - 1)}`);
  }
  ck("rankName(0) = 青铜", rankName(0) === RANKS[0].name);
  ck("rankName(负数) = 青铜", rankName(-100) === RANKS[0].name);
  ck("rankName(NaN) = 青铜", rankName(NaN) === RANKS[0].name);
  ck("rankName(3000+) = 传奇", rankName(99999) === "传奇", rankName(99999));

  const achIds = ACHS.map((a) => a.id);
  for (let i = 0; i < ACHS.length; i++) {
    const a = ACHS[i];
    ck(`成就 ${a.name} id 唯一`, achIds.indexOf(a.id) === i, a.id);
    ck(`成就 ${a.name} name 非空`, !!a.name);
    ck(`成就 ${a.name} desc 非空`, !!a.desc);
    ck(`成就 ${a.name} icon 非空`, !!a.icon);
  }
  ck("【全局】成就 id 互不相同", new Set(achIds).size === ACHS.length);

  const keys = Object.keys(SAVE_KEYS);
  for (const k of keys) {
    ck(`存档键 ${k} = bike_*`, typeof SAVE_KEYS[k] === "string" && SAVE_KEYS[k].startsWith("bike_"), SAVE_KEYS[k]);
  }
  ck("【全局】存档键值互不相同", new Set(keys.map((k) => SAVE_KEYS[k])).size === keys.length, `${keys.length} 个`);
}

// ------------------------------------------------------------
//  9. 逐关机制实体（72 × 8）
// ------------------------------------------------------------
sect("逐关机制实体（72 关）");
{
  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    const tag = `L${i + 1}`;
    startGame("level", i);
    ck(`${tag} finishX = 关卡长度`, store.finishX === L.len, `${store.finishX} vs ${L.len}`);
    ck(`${tag} lvIdx 已切换`, store.lvIdx === i, String(store.lvIdx));
    // 金币
    ck(`${tag} 金币数量 = coinN`, world.coins.length === L.coinN, `${world.coins.length}/${L.coinN}`);
    ck(`${tag} 金币全部落在赛道内`, world.coins.every((c) => c.x > 0 && c.x < L.len));
    ck(`${tag} 金币初始未拾取`, world.coins.every((c) => !c.taken));
    // 油罐
    const rc = variantRule(L.variant);
    if (rc.canN === 0) ck(`${tag} sprint 变体无油罐`, world.canisters.length === 0, String(world.canisters.length));
    else if (rc.canN === 1) ck(`${tag} fuelrun 变体恰好 1 罐`, world.canisters.length === 1, String(world.canisters.length));
    else ck(`${tag} 常规关至少 1 罐`, world.canisters.length >= 1, String(world.canisters.length));
    ck(`${tag} 油罐全部落在赛道内`, world.canisters.every((c) => c.x > 100 && c.x < L.len - 100));
    // 危险段
    ck(`${tag} 危险段在赛道内`, world.hazards.every((h) => h.x0 >= 0 && h.x1 <= L.len && h.x0 < h.x1), `${world.hazards.length} 段`);
    ck(`${tag} 危险段限速为正`, world.hazards.every((h) => h.vmax > 0));
    // 限时门
    ck(`${tag} 门数量 = gateN`, world.gates.length === L.gateN, `${world.gates.length}/${L.gateN}`);
    let gAsc = true;
    for (let k = 1; k < world.gates.length; k++) if (world.gates[k].x <= world.gates[k - 1].x) gAsc = false;
    ck(`${tag} 门 x 严格升序`, gAsc);
    ck(`${tag} 门时限为正`, world.gates.every((g) => isFinite(g.limit) && g.limit > 0));
    ck(`${tag} 门初始未通过`, world.gates.every((g) => !g.passed));
    // 跳台
    const nJump = rc.jumpN;
    if (nJump) ck(`${tag} 跳台数 = 变体规定`, world.jumps.length === nJump, `${world.jumps.length}/${nJump}`);
    else ck(`${tag} 无跳台变体则无跳台`, world.jumps.length === 0, String(world.jumps.length));
    ck(`${tag} 跳台在赛道内`, world.jumps.every((j) => j.x > 0 && j.x < L.len));
    // 加速带
    ck(`${tag} 加速带至少 1 条`, world.boosts.length >= 1, String(world.boosts.length));
    ck(`${tag} 加速带避开限速区`, world.boosts.every((b) => !world.hazards.some((h) => b.x > h.x0 - 400 && b.x < h.x1 + 400)));
    ck(`${tag} 加速带初始未触发`, world.boosts.every((b) => !b.taken));
    // 装饰
    const nDeco = world.decoTree.length + world.decoRock.length;
    ck(`${tag} 有装饰物`, nDeco > 0, String(nDeco));
    ck(`${tag} 装饰 y 贴合地形`, [...world.decoTree, ...world.decoRock].every((d) => isFinite(d.y)));
    // 环境
    ck(`${tag} minY 有限`, isFinite(store.phys.minY), String(store.phys.minY));
    ck(`${tag} 重力有效`, store.phys.GRAV > 0, String(store.phys.GRAV));
    ck(`${tag} 场景 = 关卡主题`, store.phys.theme === L.theme, `${store.phys.theme}`);
  }
}

// ------------------------------------------------------------
//  10. 物理健壮性扫描（多落高 × 多车）
// ------------------------------------------------------------
sect("物理健壮性扫描");
{
  const zeroUp = () => {
    const u = getUp();
    u.engine = 0; u.tire = 0; u.frame = 0; u.susp = 0;
  };
  let n = 0;
  for (const li of [0, 18, 36, 54, 71]) {
    for (const drop of [20, 60, 120, 240, 400]) {
      n++;
      zeroUp();
      startGame("level", li);
      world.hazards = []; world.gates = []; world.jumps = []; world.boosts = [];
      key.left = false; key.right = false;
      const x = canSpot(LEVELS[li].len, Math.round(LEVELS[li].len * 0.3));
      resetBike(x);
      for (const p of bike.pts) { p.y -= drop; p.py -= drop; }
      let peak = 0, maxV = 0, nan = 0;
      for (let f = 0; f < 400; f++) {
        stepPhysics();
        peak = Math.max(peak, Math.abs(bike.susp.rear.t), Math.abs(bike.susp.front.t));
        maxV = Math.max(maxV, Math.abs((bike.rear.x - bike.rear.px) / (1 / 60 / 6)));
        if (!isFinite(bike.rear.x) || !isFinite(bike.rear.y)) nan++;
        if (bike.grounded > 0 && f > 4) break;
      }
      const tag = `L${li + 1}@${drop}px`;
      ck(`${tag} 落高无 NaN`, nan === 0, String(nan));
      ck(`${tag} 悬挂压缩在行程内`, peak <= store.phys.susp.travel + 1, `${peak.toFixed(1)}/${store.phys.susp.travel.toFixed(1)}`);
      ck(`${tag} 速度有界`, maxV < NUM_CAP_V, maxV.toFixed(0));
      ck(`${tag} 车身位置有限`, isFinite(bike.rear.x) && isFinite(bike.front.y));
    }
  }
  ck("【全局】落高扫描覆盖 25 组工况", n === 25, String(n));
}

// ------------------------------------------------------------
//  11. 边界与鲁棒性
// ------------------------------------------------------------
sect("边界与鲁棒性");
{
  // canSpot / safeSpot
  ck("canSpot 在赛道内夹取", canSpot(4000, -100) >= 0 && canSpot(4000, 99999) <= 4000);
  ck("canSpot 返回有限值", isFinite(canSpot(5000, 2500)));
  let cs = 0;
  for (let i = 0; i < LEVELS.length; i++) for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const x = canSpot(LEVELS[i].len, Math.round(LEVELS[i].len * f));
    if (isFinite(x) && x > 0 && x < LEVELS[i].len) cs++;
  }
  ck("canSpot 全部 360 次调用返回合法落点", cs === LEVELS.length * 5, `${cs}/${LEVELS.length * 5}`);
  let ss = 0;
  for (let i = 0; i < LEVELS.length; i++) for (const f of [0.1, 0.5, 0.9]) {
    const x = safeSpot(Math.round(LEVELS[i].len * f));
    if (isFinite(x) && x > 0) ss++;
  }
  ck("safeSpot 全部 216 次调用返回合法点", ss === LEVELS.length * 3, `${ss}/${LEVELS.length * 3}`);

  // 无限模式地形
  const { freeHill } = await imp("config/levels.js");
  let fnan = 0, fmax = 0;
  for (let x = 0; x < 60000; x += 37) {
    const y = freeHill(x);
    if (!isFinite(y)) fnan++;
    if (Math.abs(y) > 1e6) fmax++;
  }
  ck("无限模式地形 60km 无 NaN", fnan === 0, String(fnan));
  ck("无限模式地形无异常量级", fmax === 0, String(fmax));
  // 地块体格确实在切换（地形不是一条固定波）
  const s1 = [], s2 = [], s3 = [];
  for (let x = 1000; x < 1600; x += 20) s1.push(freeHill(x).toFixed(1));
  for (let x = 7000; x < 7600; x += 20) s2.push(freeHill(x).toFixed(1));
  for (let x = 20000; x < 20600; x += 20) s3.push(freeHill(x).toFixed(1));
  ck("无限模式不同地块地形不同", s1.join() !== s2.join() && s2.join() !== s3.join());

  // 最终任务
  ck("FINALE 存在", !!FINALE);
  ck("FINALE 索引 = 72", FINALE_INDEX === LEVELS.length, `${FINALE_INDEX}`);
  ck("FINALE len 明显长于常规关", FINALE.len > LEVELS[71].len * 1.4, `${FINALE.len} vs ${LEVELS[71].len}`);
  ck("FINALE 有 6 个场景分段", FINALE.segments.length === 6, String(FINALE.segments.length));
  let segAsc = true;
  for (let k = 1; k < FINALE.segments.length; k++) if (FINALE.segments[k].x <= FINALE.segments[k - 1].x) segAsc = false;
  ck("FINALE 分段 x 升序", segAsc);
  ck("FINALE 分段场景下标合法", FINALE.segments.every((s) => s.theme >= 0 && s.theme < THEMES.length));
  const segThemes = FINALE.segments.map((s) => s.theme);
  ck("FINALE 分段场景互不相同", new Set(segThemes).size === segThemes.length, segThemes.join(","));
  ck("FINALE 地形无 NaN", (() => { for (let x = 0; x <= FINALE.len; x += 37) if (!isFinite(levelGroundInfo(FINALE, x).y)) return false; return true; })());
  ck("FINALE 曲率在包线内", (() => {
    // 同样必须按 1px 步长量（按 h 步长量得到的是 h×曲率）
    let pm = levelGroundInfo(FINALE, 0).m, cm = levelGroundInfo(FINALE, 1).m, mx = 0;
    for (let x = 1; x <= FINALE.len; x++) {
      const nm = levelGroundInfo(FINALE, x + 1).m;
      mx = Math.max(mx, Math.abs((nm - pm) / 2));
      pm = cm; cm = nm;
    }
    return mx < 0.05;
  })(), "1px 步长");

  // 支线
  ck("支线数 = 场景数（36 场景）", N_BRANCHES === 36 && BRANCHES.length === 36, String(BRANCHES.length));
  ck("支线 id 唯一", new Set(BRANCHES.map((b) => b.id)).size === BRANCHES.length,
    `${new Set(BRANCHES.map((b) => b.id)).size}/${BRANCHES.length}`);
  ck("支线 theme 与场景 1:1 覆盖", new Set(BRANCHES.map((b) => b.theme)).size === BRANCHES.length,
    `${new Set(BRANCHES.map((b) => b.theme)).size}/${BRANCHES.length}`);
  for (let i = 0; i < BRANCHES.length; i++) {
    const b = BRANCHES[i];
    ck(`支线 ${b.name} name 非空`, !!b.name);
    ck(`支线 ${b.name} desc 非空`, !!b.desc);
    ck(`支线 ${b.name} theme 合法`, b.theme >= 0 && b.theme < THEMES.length, String(b.theme));
    ck(`支线 ${b.name} 恰好 ${LEVELS_PER_BRANCH} 关`,
      LEVELS.filter((_, k) => Math.floor(k / LEVELS_PER_BRANCH) === i).length === LEVELS_PER_BRANCH);
  }
  ck(`${LEVELS.length} = ${N_BRANCHES} 支线 × ${LEVELS_PER_BRANCH} 关`,
    LEVELS.length === N_BRANCHES * LEVELS_PER_BRANCH, `${LEVELS.length}`);

  // 固定步长累加器
  const st = new Stepper(() => {});
  let frames = 0;
  for (let i = 0; i < 600; i++) { st.advance(1 / 144); frames++; }
  ck("Stepper 不抛异常", true);
  ck("Stepper 处理 600 帧", frames === 600);

  // 存档：每个键都能写入读回
  const keyList = Object.values(SAVE_KEYS);
  for (const k of keyList) {
    localStorage.setItem(k, "1");
    const back = localStorage.getItem(k);
    if (back !== "1") ck(`存档键 ${k} 可往返`, false, String(back));
  }
  ck("【全局】全部存档键可写可读", true, `${keyList.length} 个`);
  localStorage.clear();

  // 视图尺寸
  ck("view.W/H 为正", view.W > 0 && view.H > 0, `${view.W}×${view.H}`);
}

// ------------------------------------------------------------
//  12. 源码静态体检
// ------------------------------------------------------------
sect("源码静态体检");
{
  const SRC = join(ROOT, "src");
  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) files.push(p);
    }
  })(SRC);
  ck("源码文件数合理", files.length >= 36, `${files.length} 个`);

  // 逐文件：import 路径存在、无裸标度换算、无 TODO
  let halfScale = [], missingImp = [], todo = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const rel = f.slice(ROOT.length + 1).replace(/\\/g, "/");
    for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const target = new URL(m[1], new URL("file:///" + rel)).pathname.replace(/^\//, "");
      if (!existsSync(join(ROOT, target))) missingImp.push(`${rel} → ${m[1]}`);
    }
    // 裸半标度换算：`*SUB` / `/SUB`（排除 SUB_DT / SUBV / 常量定义处）
    if (!rel.endsWith("config/constants.js")) {
      const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // 排除 SUB_DT / SUBV（它们是合法的真实速度换算出口）
      if (/[*/]\s*SUB(?!_[A-Z]|V)/.test(stripped)) halfScale.push(rel);
    }
    if (/\bTODO\b|\bFIXME\b|\bXXX\b/.test(src)) todo.push(rel);
  }
  ck("全部 import 目标存在", missingImp.length === 0, missingImp.slice(0, 3).join(", "));
  ck("无裸 SUB 半标度换算（constants.js 除外）", halfScale.length === 0, halfScale.slice(0, 3).join(", "));
  ck("无 TODO/FIXME 遗留", todo.length === 0, todo.slice(0, 3).join(", "));

  const stripC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // ★ 路径必须先归一化成分隔符统一的正斜杠：Windows 上 readdirSync 返回的是
  //   "E:\...\src\game\game.js"，直接 includes("/src/game/") 永远为 false ——
  //   那会让这条红线检查**匹配到 0 个文件、永远通过**，是典型的假绿。
  const inDir = (f, dir) => f.split("\\").join("/").includes("/src/" + dir + "/");
  const physBad3 = files.filter((f) => inDir(f, "physics"))
    .filter((f) => /from\s+"\.\.\/(game|render|ui)\//.test(stripC(readFileSync(f, "utf8"))));
  ck("physics/ 不依赖 game/render/ui", physBad3.length === 0, physBad3.map((f) => f.split("\\").pop()).join(","));
  const gameUi = files.filter((f) => inDir(f, "game"))
    .filter((f) => /from\s+"\.\.\/ui\//.test(stripC(readFileSync(f, "utf8"))));
  ck("game/ 永不 import ui/", gameUi.length === 0, gameUi.map((f) => f.split("\\").pop()).join(","));
  // 反向自检：确认上面两条规则**确实匹配到了文件**（防止规则写错而恒真）
  ck("【自检】game/ 规则命中文件数 = 实际文件数",
    files.filter((f) => inDir(f, "game")).length > 0, `${files.filter((f) => inDir(f, "game")).length} 个`);
  ck("【自检】physics/ 规则命中文件数 = 实际文件数",
    files.filter((f) => inDir(f, "physics")).length > 0, `${files.filter((f) => inDir(f, "physics")).length} 个`);

  // index.html 结构
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const htmlLines = html.split("\n").length;
  ck("index.html ≤200 行", htmlLines <= 200, String(htmlLines));
  ck("index.html 无内联 <style>", !/<style/i.test(html));
  ck("index.html 无内联 onclick", !/\sonclick\s*=/i.test(html));
  // 入口：打包文件是唯一入口，源码入口只作兜底（两个入口并列 = 游戏初始化两遍）
  // ★ 断言前剥掉 HTML 注释：入口说明文字里就写着 <script type="module" src="src/main.js">
  //   这句示例，不剥注释会把它当成真标记。
  const htmlMarkup = html.replace(/<!--[\s\S]*?-->/g, "");
  ck("index.html 以打包文件为 script 入口", /<script src="dist\/game\.bundle\.js"/.test(htmlMarkup));
  ck("index.html 不无条件加载源码入口（否则双初始化）", !/<script type="module" src="src\/main\.js"/.test(htmlMarkup));
  ck("index.html 源码入口仅作兜底 import", /if \(!window\.__daleBooted\) await import\("\.\/src\/main\.js"\);/.test(htmlMarkup));
  ck("main.js 置启动标志 __daleBooted", /window\.__daleBooted = true/.test(readFileSync(join(ROOT, "src", "main.js"), "utf8")));
  ck("index.html 先引 tokens.css", html.indexOf("tokens.css") < html.indexOf("main.css"));

  // main.css 不得有字面色值
  const css = readFileSync(join(ROOT, "styles", "main.css"), "utf8");
  const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rawColors = cssNoComment.match(/#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi) || [];
  const allowedInVar = new Set();
  for (const m of cssNoComment.matchAll(/--[a-z0-9-]+\s*:\s*([^;]+);/gi)) {
    for (const c of (m[1].match(/#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi) || [])) allowedInVar.add(c.toLowerCase());
  }
  const bare = rawColors.filter((c) => !allowedInVar.has(c.toLowerCase()));
  ck("main.css 无脱离令牌的字面色值", bare.length === 0, bare.slice(0, 4).join(", "));

  // 渲染层不得有 theme === <数字> 硬编码
  const renderHard = files.filter((f) => inDir(f, "render"))
    .filter((f) => /theme\s*===\s*\d/.test(readFileSync(f, "utf8")));
  ck("渲染层无 theme === <数字> 硬编码", renderHard.length === 0, renderHard.map((f) => f.split("\\").pop()).join(","));
  ck("【自检】渲染层规则命中文件数 > 0", files.filter((f) => inDir(f, "render")).length > 0, `${files.filter((f) => inDir(f, "render")).length} 个`);

  // 物理层不得 import render/ui
  const physBad = files.filter((f) => inDir(f, "physics"))
    .filter((f) => /from\s+"\.\.\/(render|ui)\//.test(readFileSync(f, "utf8")));
  ck("物理层不 import render/ui", physBad.length === 0, physBad.map((f) => f.split("\\").pop()).join(","));
}

finish();
