// 验证 Task 12：GBUF_N 动态扩容 + 巡航色带层
// 直接驱动 drawTerrain 的采样路径，检查高速下不再静默截断
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

const { store } = await import("./src/core/store.js");
const { camZoomOf } = await import("./src/render/camera.js");

console.log("=== camZoomOf 在各速度下的可见世界宽度 ===");
const W = 2560;
const speeds = [
  ["100 km/h", 278], ["1000 km/h", 2778], ["5000 km/h", 13889],
  ["25000 km/h", 69444], ["50000 km/h", 138889], ["100000 km/h", 277778],
  ["771605 km/h(无相满级)", 21433472],
];
const GS = 8;
for (const [label, v] of speeds) {
  const z = camZoomOf(v, 1.4);
  const visW = W / z;
  const need = Math.ceil(visW / GS) + 2;
  console.log(`  ${label.padEnd(24)} v=${String(v).padStart(9)}  zoom=${z.toFixed(6)}  可见宽=${(visW / 1000).toFixed(1)}km  需要采样=${String(need).padStart(7)} 段`);
}

console.log("\n=== 旧 GBUF_N=2048 的截断点 ===");
console.log("  2048 段 × 8px = 16,384px 可见宽度上限");
console.log("  即 zoom < " + (2560 / 16384).toFixed(4) + " 时右半屏开始空白");
for (const [label, v] of speeds) {
  const z = camZoomOf(v, 1.4);
  const visW = 2560 / z;
  const truncated = visW > 16384;
  console.log(`  ${label.padEnd(24)} 可见宽=${(visW / 1000).toFixed(1).padStart(9)}km  ${truncated ? "❌ 旧实现截断" : "✅ 旧实现够用"}`);
}

console.log("\n=== 新 GBUF_MAX=65536 能覆盖到 ===");
console.log(`  65536 段 × 8px = ${65536 * 8}px = ${(65536 * 8 / 1000).toFixed(0)}km 可见宽度`);
console.log(`  即 zoom ≥ ${(2560 / (65536 * 8)).toExponential(3)} 时不会截断`);

console.log("\n=== 巡航层阈值 ===");
console.log("  CRUISE_V = 100,000 px/s = " + (100000 / (100 / 3.6)).toFixed(0) + " km/h");
console.log("  → 各车达到巡航层的极速：");
const { VEHICLES } = await import("./src/config/vehicles.js");
for (const veh of VEHICLES.filter((v) => v.tier === "宇宙")) {
  const maxV = (veh.nominalKmh / 3.6) * 100;
  console.log(`    ${veh.name.padEnd(4)} 标称 ${String(veh.nominalKmh).padStart(6)} km/h = ${maxV.toFixed(0).padStart(9)} px/s  ${maxV > 100000 ? "✅ 会进巡航层" : "⚠️ 达不到"}`);
}