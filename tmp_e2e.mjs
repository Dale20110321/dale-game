// 端到端：把宇宙场真的跑完
const noop = () => {};
const ctxStub = () => {
  const c = { canvas: { width: 1280, height: 720 }, globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "" };
  for (const m of ["save","restore","beginPath","closePath","moveTo","lineTo","arc","ellipse","rect","fill","stroke","fillRect","strokeRect","clearRect","fillText","translate","rotate","scale","setTransform","setLineDash","roundRect","clip","quadraticCurveTo"]) c[m] = noop;
  c.createLinearGradient = () => ({ addColorStop: noop });
  c.measureText = () => ({ width: 10 });
  return c;
};
const el = () => new Proxy({ style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, textContent: "", innerHTML: "", value: "", width: 1280, height: 720, getContext: () => ctxStub(), appendChild: noop, addEventListener: noop, querySelector: () => el(), querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) },
  { get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { getElementById: () => el(), createElement: () => el(), body: el(), addEventListener: noop, querySelectorAll: () => [], documentElement: { style: { setProperty: noop } } };
const ls = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
globalThis.localStorage = ls;
globalThis.window = { addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), localStorage: ls, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, requestAnimationFrame: () => 0, getComputedStyle: () => ({}) };
globalThis.navigator = { userAgent: "node" };
globalThis.AudioContext = function () { return { createOscillator: () => ({ connect: noop, start: noop, stop: noop, frequency: { value: 0 }, type: "" }), createGain: () => ({ connect: noop, gain: { value: 0 } }), destination: {}, currentTime: 0 }; };

const { store, world, bike } = await import("./src/core/store.js");
const { key } = await import("./src/core/input.js");
const G = await import("./src/game/game.js");
const L = await import("./src/config/levels.js");
const { VEHICLES } = await import("./src/config/vehicles.js");
const { DT } = await import("./src/config/constants.js");

let fails = 0;
const chk = (ok, label, extra) => { if (!ok) fails++; console.log(`  ${ok ? "✅" : "❌"} ${label}${extra !== undefined ? "  → " + extra : ""}`); };

const OMEGA = VEHICLES.findIndex((v) => v.nominalKmh === 1000);
const WX = VEHICLES.findIndex((v) => v.nominalKmh === 100000);
for (const vi of [OMEGA, WX]) {
  store.ownedVehicles = [OMEGA, WX, vi];
  store.upgrades[VEHICLES[vi].id] = { engine: 500, tire: 500, frame: 500, susp: 500 };
  store.ultra[VEHICLES[vi].id] = true;
}

function play(tier, veh, maxSec) {
  store.currentVehicle = veh;
  G.startGame("space", undefined, { tier });
  bike.awaitingStart = false;
  key.right = true;
  const target = store.finishX;
  let t = 0, nan = 0, sum = 0, worst = 0, maxCh = 0, maxEnt = 0;
  const themes = new Set();
  while (t < maxSec) {
    const f0 = performance.now();
    t += DT;
    G.update(DT);
    themes.add(store.phys.theme);
    for (const p of [bike.rear, bike.front, bike.head]) if (!isFinite(p.x) || !isFinite(p.y)) nan++;
    const ms = performance.now() - f0;
    sum += ms; if (ms > worst) worst = ms;
    if (world.chunks.size > maxCh) maxCh = world.chunks.size;
    const ent = world.coins.length + world.decoFore.length + world.decoBack.length;
    if (ent > maxEnt) maxEnt = ent;
    if (store.finishX !== Infinity && (bike.rear.x + bike.front.x) / 2 > store.finishX) break;
  }
  return { sec: t, x: (bike.rear.x + bike.front.x) / 2, target, nan, themes: themes.size,
    avg: sum / Math.round(t / DT), worst, maxCh, maxEnt, fuel: store.phys.fuel };
}

const rows = [];
console.log("=== 归墟满级 ===");
for (let t2 = 0; t2 < 5; t2++) {
  const r = play(t2, OMEGA, 420); rows.push(r);
  console.log(`  ${L.SPACE_TIERS[t2].name.padEnd(3)} ${r.sec.toFixed(0).padStart(4)}s  ${(r.x / 1e6).toFixed(1).padStart(6)}Mpx  主题${String(r.themes).padStart(3)}  均${r.avg.toFixed(2)}ms  坏${r.worst.toFixed(0).padStart(3)}ms  chunk≤${r.maxCh}  实体≤${r.maxEnt}  油${r.fuel.toFixed(2)}`);
}
console.log("=== 无相满级 ===");
for (let t2 = 0; t2 < 5; t2++) {
  const r = play(t2, WX, 420); rows.push(r);
  console.log(`  ${L.SPACE_TIERS[t2].name.padEnd(3)} ${r.sec.toFixed(0).padStart(4)}s  ${(r.x / 1e6).toFixed(1).padStart(6)}Mpx  主题${String(r.themes).padStart(3)}  均${r.avg.toFixed(2)}ms  坏${r.worst.toFixed(0).padStart(3)}ms  chunk≤${r.maxCh}  实体≤${r.maxEnt}  油${r.fuel.toFixed(2)}`);
}
console.log("\n=== 判定 ===");
chk(rows.every(r => r.nan === 0), "全程无 NaN");
chk(rows.every(r => r.avg < 16.7), "平均帧 <16.7ms", `最差 ${Math.max(...rows.map(r=>r.avg)).toFixed(2)}ms`);
chk(rows.every(r => r.maxCh <= 8), "chunk 受窗口限制", `最大 ${Math.max(...rows.map(r=>r.maxCh))}`);
chk(rows.every(r => r.maxEnt > 100), "实体持续供给", `最小 ${Math.min(...rows.map(r=>r.maxEnt))}`);
chk(rows.every(r => r.themes >= 2), "多场景切换生效", rows.map(r=>r.themes).join("/"));
chk(rows.every(r => r.fuel > 0.99), "不掉油（无补油死循环）", rows.map(r=>r.fuel.toFixed(2)).join(" "));
chk(rows.every(r => r.x > r.target * 0.9), "跑到终点", rows.map(r=>(100*r.x/r.target).toFixed(0)+"%").join(" "));
chk(rows.every(r => r.sec > 300 && r.sec < 430), "时长 300~430s", rows.map(r=>r.sec.toFixed(0)).join("/"));
console.log(fails === 0 ? "\n✅ 全部通过" : `\n❌ ${fails} 项未通过`);