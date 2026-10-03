// 验证 Task 12.1.3：速度线高速档
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

const { SPEEDLINE_V, SPEEDLINE_REF, SPEEDLINE_WARP_V, SPEEDLINE_WARP_REF, toKmh } = await import("./src/config/constants.js");
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 复刻 drawSpeedLines 的参数解算（纯函数，不依赖 canvas）
function params(spd, isHi) {
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
  return { intens, n, lMin, lMax, lw };
}

let fails = 0;
const chk = (ok, label, extra) => { if (!ok) fails++; console.log(`  ${ok ? "✅" : "❌"} ${label}${extra !== undefined ? "  → " + extra : ""}`); };

console.log("=== 各档位的速度线参数（高档画质）===");
const speeds = [
  ["20 km/h（旧满档点）", 556],
  ["100 km/h", 2778],
  ["1000 km/h", 27778],
  ["3600 km/h（高速档门槛）", 100000],
  ["10000 km/h", 277778],
  ["50000 km/h", 1388889],
  ["100000 km/h", 2777778],
  ["771605 km/h（无相满级）", 21433472],
];
console.log("  速度".padEnd(28) + "强度".padStart(7) + "线数".padStart(7) + "线长".padStart(14) + "线宽".padStart(7));
let prev = null;
for (const [label, v] of speeds) {
  const p = params(v, true);
  console.log(`  ${label.padEnd(26)}${p.intens.toFixed(3).padStart(7)}${String(p.n).padStart(7)}${(p.lMin.toFixed(0) + "~" + p.lMax.toFixed(0)).padStart(14)}${p.lw.toFixed(2).padStart(7)}`);
  if (prev) {
    chk(p.intens >= prev.intens - 1e-9, `  强度单调不降 @${label}`, `${prev.intens.toFixed(3)} → ${p.intens.toFixed(3)}`);
    chk(p.n >= prev.n, `  线数单调不减 @${label}`, `${prev.n} → ${p.n}`);
    chk(p.lMax >= prev.lMax - 1e-9, `  线长单调不减 @${label}`);
  }
  prev = p;
}

console.log("\n=== 关键判定 ===");
const hiRef = params(SPEEDLINE_REF, true);       // 恰好 = SPEEDLINE_REF，旧公式的满档点
const hi20 = params(556, true);                  // 20 km/h 实际值（略低于 SPEEDLINE_REF）
const hi100k = params(2777778, true);
const hiMax = params(21433472, true);
chk(hiRef.intens === 0.42, "普通档在 SPEEDLINE_REF 处仍是 0.42（逐位保持原观感）", hiRef.intens.toFixed(3));
chk(hi20.intens === Math.min(556 / SPEEDLINE_REF, 1) * 0.42, "20 km/h 强度 = 旧公式原值", hi20.intens.toFixed(4));
chk(hi20.n === 16 && hi20.lMax === 34 && hi20.lw === 1.7, "普通档线数/线长/线宽逐位不变", `${hi20.n} / ${hi20.lMax} / ${hi20.lw}`);
chk(hi100k.intens > hi20.intens * 1.5, "100,000 km/h 的强度 ≥1.5× 普通档", `${hi20.intens.toFixed(2)} → ${hi100k.intens.toFixed(2)}`);
chk(hi100k.n >= hi20.n * 3, "100,000 km/h 的线数 ≥3×", `${hi20.n} → ${hi100k.n}`);
chk(hi100k.lMax >= 200, "100,000 km/h 的最长线 ≥200px", hi100k.lMax.toFixed(0));
chk(hi100k.lw > hi20.lw, "100,000 km/h 的线更粗", `${hi20.lw} → ${hi100k.lw.toFixed(2)}`);
chk(hiMax.intens > hi100k.intens, "无相满级的强度仍高于 10 万 km/h（未提前饱和）", `${hi100k.intens.toFixed(3)} → ${hiMax.intens.toFixed(3)}`);
chk(hiMax.n > hi100k.n, "无相满级的线数仍高于 10 万 km/h", `${hi100k.n} → ${hiMax.n}`);
chk(hiMax.intens <= 0.85, "强度上限 ≤0.85（不糊成白屏）", hiMax.intens.toFixed(3));
chk(hiMax.n <= 90, "线数上限 ≤90（单帧 stroke 预算）", hiMax.n);
chk(hiMax.lMax <= 340, "线长上限 ≤340px", hiMax.lMax.toFixed(0));

console.log("\n=== 中档画质同样单调 ===");
let pm = null, mono = true;
for (let e = 2.7; e <= 7.5; e += 0.1) {
  const p = params(Math.pow(10, e), false);
  if (pm && (p.intens < pm.intens - 1e-9 || p.n < pm.n)) { mono = false; console.log(`    ❌ 1e${e.toFixed(1)} 回退`); break; }
  pm = p;
}
chk(mono, "中档 500 → 3e7 px/s 全程单调");

console.log("\n=== 与 CRUISE_V（地形巡航层）对齐 ===");
chk(SPEEDLINE_WARP_V === 100000, "SPEEDLINE_WARP_V === 100,000 px/s（= CRUISE_V）", SPEEDLINE_WARP_V);
console.log(`  → ${(SPEEDLINE_WARP_V / (100 / 3.6)).toFixed(0)} km/h 起进入高速档`);
console.log(`  参照：归墟 1000 km/h 达不到该档；星殒 5000 km/h 起进入`);

console.log(`\n${fails === 0 ? "✅ 全部通过" : `❌ ${fails} 项未通过`}`);
