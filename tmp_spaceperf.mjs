// 测量 spaceCourse 各分级的 buildLevel 开销（只跑到会卡住的那一步为止）
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

const L = await import("./src/config/levels.js");
const { levelHillY } = L;
const { SPACE_TIERS, spaceCourse } = L;

console.log("=== measureBottomY 的步长固定 25px → 500M px 要 2000 万次 levelHillY ===");
for (let i = 0; i < 5; i++) {
  const Lv = spaceCourse(i);
  const n = Math.floor(Lv.len / 25) + 1;
  // 只跑前 20 万次外推，避免真的跑几分钟
  const SAMPLE = 200000;
  const t0 = performance.now();
  for (let k = 0; k < SAMPLE; k++) levelHillY(Lv, k * 25);
  const per = (performance.now() - t0) / SAMPLE;
  console.log(`  ${SPACE_TIERS[i].name.padEnd(3)} len=${String(Lv.len).padStart(10)}  迭代 ${String(n).padStart(10)} 次 × ${(per * 1000).toFixed(2)}µs = ${(per * n / 1000).toFixed(1)}s`);
}

console.log("\n=== buildDeco 步长 ~130px → 500M px 要 385 万个实体 ===");
for (let i = 0; i < 5; i++) {
  const Lv = spaceCourse(i);
  console.log(`  ${SPACE_TIERS[i].name.padEnd(3)} len=${String(Lv.len).padStart(10)}  装饰实体 ≈ ${Math.round(Lv.len / 130).toLocaleString()} 个  危险段 ${Lv.hazardN}`);
}

console.log("\n=== 加速带选址：for x+=12 全程 × hazards.some() ===");
for (let i = 0; i < 5; i++) {
  const Lv = spaceCourse(i);
  const iters = Math.floor((Lv.len - 320) / 12);
  console.log(`  ${SPACE_TIERS[i].name.padEnd(3)} 外层 ${String(iters).padStart(10)} 次 × 危险段 ${String(Lv.hazardN).padStart(5)} = ${(iters * Lv.hazardN / 1e9).toFixed(1)}e9 次比较`);
}

console.log("\n=== 通关耗时（按各车实际极速）===");
const { VEHICLES } = await import("./src/config/vehicles.js");
for (const vh of VEHICLES.filter((v) => v.tier === "宇宙")) {
  const v = (vh.nominalKmh / 3.6) * 100;
  console.log(`  ${vh.name.padEnd(4)} 标称 ${String(vh.nominalKmh).padStart(6)} km/h:`);
  for (let i = 0; i < 5; i++) {
    const Lv = spaceCourse(i);
    const sec = Lv.len / v;
    const txt = sec < 90 ? `${sec.toFixed(0)}s` : sec < 5400 ? `${(sec / 60).toFixed(1)}min` : `${(sec / 3600).toFixed(1)}h`;
    console.log(`      ${SPACE_TIERS[i].name.padEnd(3)} ${txt.padStart(8)}`);
  }
}
