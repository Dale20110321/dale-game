// 基线：buildLevel 在各关卡上的耗时与实体数（改动前/后对照用）
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

const { store, world } = await import("./src/core/store.js");
const { buildLevel } = await import("./src/game/world.js");
const L = await import("./src/config/levels.js");

const rows = [];
function timed(label, mode, idx, opt) {
  if (opt && opt.tier !== undefined) L.setSpaceTier(opt.tier);
  store.mode = mode;
  store.selLevel = idx === undefined ? 0 : idx;
  const t0 = performance.now();
  buildLevel();
  const ms = performance.now() - t0;
  const n = (a) => (a ? a.length : 0);
  rows.push({
    label, len: store.finishX, ms,
    coins: n(world.coins), cans: n(world.canisters), boosts: n(world.boosts),
    decoF: n(world.decoFore), decoB: n(world.decoBack),
    haz: n(world.hazards), gates: n(world.gates),
    total: n(world.coins) + n(world.canisters) + n(world.boosts) + n(world.decoFore) + n(world.decoBack) + n(world.hazards) + n(world.gates),
  });
}

console.log("=== 现有普通关 / 终局关 ===");
timed("第 1 关", "level", 0);
timed("第 432 关", "level", L.LEVELS.length - 1);
timed("终局关", "level", L.FINALE_INDEX);

console.log("\n=== 宇宙场（当前实现：只有「易」能跑完）===");
for (let i = 0; i < 5; i++) timed(`宇宙场 ${L.SPACE_TIERS[i].name}`, "space", 0, { tier: i });

console.log("\n" + "关卡".padEnd(16) + "len".padStart(11) + "耗时".padStart(10) + "金币".padStart(8) + "油罐".padStart(7) + "加速带".padStart(8) + "装饰前".padStart(9) + "装饰后".padStart(9) + "危险段".padStart(8) + "实体合计".padStart(10));
for (const r of rows) {
  console.log(
    "  " + r.label.padEnd(14) + String(r.len).padStart(11) + (r.ms.toFixed(0) + "ms").padStart(10) +
    String(r.coins).padStart(8) + String(r.cans).padStart(7) + String(r.boosts).padStart(8) +
    String(r.decoF).padStart(9) + String(r.decoB).padStart(9) + String(r.haz).padStart(8) + String(r.total).padStart(10)
  );
}
console.log("\n注：单帧剔除要遍历 decoFore+decoBack+coins+canisters+boosts+hazards+gates 全量");
console.log("    终极级 385 万装饰 → 每帧 385 万次循环，60fps 即 2.3 亿次/秒");
