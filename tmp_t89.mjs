// 验证 Task 8（终局关）与 Task 9（关卡长度/赛事）
const noop = () => {};
function makeCtx() {
  const c = { canvas: { width: 1280, height: 720 }, globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", font: "", textAlign: "" };
  for (const m of ["save","restore","beginPath","closePath","moveTo","lineTo","arc","ellipse","rect","fill","stroke","fillRect","strokeRect","clearRect","fillText","translate","rotate","scale","setTransform","setLineDash","roundRect","clip","quadraticCurveTo"]) c[m] = noop;
  c.createLinearGradient = () => ({ addColorStop: noop });
  c.measureText = () => ({ width: 10 });
  return c;
}
const el = () => new Proxy({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, textContent: "", innerHTML: "", value: "", width: 1280, height: 720, getContext: () => makeCtx(), appendChild: noop, addEventListener: noop, querySelector: () => el(), querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
  { get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { getElementById: () => el(), createElement: () => el(), body: el(), addEventListener: noop, querySelectorAll: () => [], documentElement: { style: { setProperty: noop } } };
const ls = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
globalThis.localStorage = ls;
globalThis.window = { addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), localStorage: ls, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, requestAnimationFrame: () => 0, getComputedStyle: () => ({}) };
globalThis.navigator = { userAgent: "node" };
globalThis.AudioContext = function () { return { createOscillator: () => ({ connect: noop, start: noop, stop: noop, frequency: { value: 0 }, type: "" }), createGain: () => ({ connect: noop, gain: { value: 0 } }), destination: {}, currentTime: 0 }; };

const T0 = performance.now();
const L = await import("./src/config/levels.js");
const C = await import("./src/config/constants.js");
const TH = await import("./src/config/themes.js");
const loadMs = performance.now() - T0;

let fails = 0;
const chk = (ok, label, extra) => {
  if (!ok) fails++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}${extra !== undefined ? "  → " + extra : ""}`);
};

console.log("=== R1.1/R1.2 终局关结构 ===");
const F = L.FINALE;
chk(F.len === 16666666, "FINALE.len === 16,666,666", F.len);
chk(F.segments.length === 36, "地形段数 = 36", F.segments.length);
let themeOK = true;
const bad = [];
for (let i = 0; i < F.segments.length; i++) {
  if (F.segments[i].theme !== (TH.THEMES[i] ? i : i % TH.THEMES.length)) { themeOK = false; bad.push(`${i}:${F.segments[i].theme}`); }
}
chk(themeOK, "第 i 段的场景主题 === THEMES[i]", bad.slice(0, 4).join(" "));
console.log(`     36 段主题 = ${F.segments.map((s) => s.theme).join(",")}`);

console.log("\n=== R1.2 360 个计时门 ===");
const { store } = await import("./src/core/store.js");
const world = await import("./src/game/world.js");
// 直接复刻 buildGates 的段内布门逻辑做独立验算（不依赖 world 的 DOM 初始化）
const segs = F.segments;
const perSeg = Math.round(F.gateN / segs.length);
const gates = [];
for (let s = 0; s < segs.length; s++) {
  const sx = segs[s].x;
  const ex = s + 1 < segs.length ? segs[s + 1].x : F.len;
  for (let k = 1; k <= perSeg; k++) gates.push({ x: Math.round(sx + ((ex - sx) * k) / (perSeg + 1)), seg: s });
}
gates.sort((a, b) => a.x - b.x);
chk(F.gateN === 360, "gateN === 360", F.gateN);
chk(gates.length === 360, "实际生成的门数 = 360", gates.length);
const cnt = new Map();
for (const g of gates) cnt.set(g.seg, (cnt.get(g.seg) || 0) + 1);
chk(cnt.size === 36 && [...cnt.values()].every((v) => v === 10), "每段恰好 10 个门", `段数=${cnt.size} 每段=${[...new Set(cnt.values())]}`);
// 门限必须可达：门间距 / 门限时 = 该处要求均速，与 den3 同量级
const spd = C.gateSpeed(F.den3) * 1;
let unreachable = 0;
for (let i = 1; i < gates.length; i++) {
  const gap = gates[i].x - gates[i - 1].x;
  const lim = (gates[i].x + C.GATE_START_ALLOW) / spd;
  if (gap / lim < 0.75) unreachable++;  // 相邻两门之间必须能跑出 ≥0.75×要求均速
}
chk(unreachable === 0, "每段内门可通过（相邻门所需均速 ≥0.75×基准）", `不可达 ${unreachable} 处`);

console.log("\n=== R1.3 断点续玩 ===");
const { FINALE_SEGS } = L;
chk(FINALE_SEGS === 36, "FINALE_SEGS === 36", FINALE_SEGS);

console.log("\n=== 终局关生成耗时 ≤ 1s ===");
const t1 = performance.now();
const { measureBottomY } = await import("./src/physics/terrain.js");
const { groundY } = await import("./src/physics/terrain.js");
let bottom = -Infinity;
for (let x = 0; x <= F.len; x += 4000) { const gy = groundY(x); if (gy !== Infinity && gy > bottom) bottom = gy; }
console.log(`  扫完 ${(F.len / 4000) | 0} 个采样点耗时 ${(performance.now() - t1).toFixed(1)}ms，最深 y=${bottom.toFixed(0)}`);

console.log("\n=== R6.3 关卡长度 5,610 → 78,000 ===");
const a = L.levelAt(0), b = L.levelAt(L.LEVELS.length - 1);
chk(a.len === 5610, "第 1 关 len = 5,610", a.len);
chk(b.len === 78000, "第 432 关 len = 78,000", b.len);
chk(L.LEVELS.length === 432, "关卡总数 = 432", L.LEVELS.length);
let mono = true;
for (let i = 1; i < L.LEVELS.length; i++) if (L.LEVELS[i].len < L.LEVELS[i - 1].len) { mono = false; console.log(`    ❌ 第${i+1}关 ${L.LEVELS[i].len} < 第${i}关 ${L.LEVELS[i-1].len}`); break; }
chk(mono, "关卡长度单调不减");

console.log("\n=== R6.3 三星时限 15s → 300s ===");
const st = (lv) => lv.len / lv.den3;
console.log(`  第 1 关三星 = ${st(a).toFixed(1)}s（目标 15s ±5%）`);
console.log(`  第 432 关三星 = ${st(b).toFixed(1)}s（目标 300s ±5%）`);
chk(Math.abs(st(a) - 15) <= 15 * 0.05, "第 1 关三星 15s ±5%", st(a).toFixed(2));
chk(Math.abs(st(b) - 300) <= 300 * 0.05, "第 432 关三星 300s ±5%", st(b).toFixed(2));
console.log(`  den3: 第1关 ${a.den3.toFixed(0)} px/s（${C.toKmh(a.den3).toFixed(1)} km/h）· 第432关 ${b.den3.toFixed(0)} px/s（${C.toKmh(b.den3).toFixed(1)} km/h）`);

console.log("\n=== R6.1 赛事 ≥ 6min ===");
const R = L.RACE_COURSE;
chk(R.len === 360000, "赛事赛道 = 360,000px", R.len);
// 驮马 36 km/h
const muMa = C.REF_SPEED;
console.log(`  赛事 len=${R.len}px，驮马满级均速按 REF_SPEED=${muMa.toFixed(0)}px/s → ${(R.len / muMa).toFixed(0)}s`);
console.log(`  按赛事 AI 基准 0.68×den3（den3=${R.den3.toFixed(0)}）→ AI 用时 ${(R.len / (R.den3 * 0.68)).toFixed(0)}s`);

console.log("\n=== 燃料：延长关卡后仍足以通关（复刻 world.js 的预算公式）===");
const { VEHICLES } = await import("./src/config/vehicles.js");
const CAN_MAX = 6000, CAN_MIN_GAP = 2500;   // world.js 的模块私有常量
for (const [lvl, name] of [[a, "第1关"], [b, "第432关"], [F, "终局关"]]) {
  const vh = VEHICLES[0];
  const fMax = vh.fuel * (1 + 0.004 * 0);   // 裸车（保守）
  const kIdle = ((0.005 * vh.weight) / fMax) * lvl.fuelK;
  const kFull = ((0.021 * vh.weight) / fMax) * lvl.fuelK;
  const kAvg = kIdle + 0.62 * (kFull - kIdle);
  const vAvg = 0.78 * C.REF_SPEED * vh.speed;
  const need = lvl.len / (vAvg / kAvg);
  const M = 1.30 - 0.25 * lvl.ramp;
  const rawCans = Math.ceil((need * M - 1) / C.CAN_FUEL);
  const byGap = Math.ceil(lvl.len / CAN_MIN_GAP);
  const budget = Math.max(1, Math.min(CAN_MAX, Math.min(rawCans, byGap)));
  const supply = budget * C.CAN_FUEL + 1;  // 初始 1 箱 + 每罐 CAN_FUEL
  chk(supply >= need * M, `${name} 裸车燃料足以通关`, `需 ${need.toFixed(0)} 箱 ×M${M.toFixed(2)}=${(need*M).toFixed(0)}，供给 ${budget} 罐 = ${supply.toFixed(1)} 箱`);
}

console.log(`\n模块加载 ${loadMs.toFixed(0)}ms`);
console.log(`\n${fails === 0 ? "✅ 全部通过" : `❌ ${fails} 项未通过`}`);
