// 验证宇宙场：真实车速下的长度、流式生成、chunk 一致性、6 分钟时长
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

const { store, world, bike } = await import("./src/core/store.js");
const { key } = await import("./src/core/input.js");
const B = await import("./src/physics/bike.js");
const G = await import("./src/game/game.js");
const L = await import("./src/config/levels.js");
const { VEHICLES } = await import("./src/config/vehicles.js");
const { DT } = await import("./src/config/constants.js");

let fails = 0;
const chk = (ok, label, extra) => { if (!ok) fails++; console.log(`  ${ok ? "✅" : "❌"} ${label}${extra !== undefined ? "  → " + extra : ""}`); };

const WX = VEHICLES.findIndex((v) => v.nominalKmh === 100000);
const OMEGA = VEHICLES.findIndex((v) => v.nominalKmh === 1000);
store.ownedVehicles = [WX, OMEGA];
store.upgrades[VEHICLES[WX].id] = { engine: 500, tire: 500, frame: 500, susp: 500 };
store.upgrades[VEHICLES[OMEGA].id] = { engine: 500, tire: 500, frame: 500, susp: 500 };
store.ultra[VEHICLES[WX].id] = true;
store.ultra[VEHICLES[OMEGA].id] = true;

/** 开一局宇宙场，返回 buildLevel 耗时 */
function enter(tier, vehIdx) {
  store.currentVehicle = vehIdx;
  store.ownedVehicles = [WX, OMEGA, vehIdx];
  const t0 = performance.now();
  G.startGame("space", undefined, { tier });
  const ms = performance.now() - t0;
  bike.awaitingStart = false;
  key.right = true;
  return ms;
}

console.log("=== 真实车速下的开局耗时与长度 ===");
console.log("  车辆".padEnd(10) + "极速".padStart(12) + "len(px)".padStart(14) + "len(km)".padStart(12) + "开局".padStart(9) + "实体".padStart(8));
const rows = [];
for (const [name, vi, kmh] of [["归墟满级", OMEGA, 1000], ["无相满级", WX, 100000]]) {
  for (let tier = 0; tier < 5; tier++) {
    const ms = enter(tier, vi);
    const top = store.phys.topSpeed;
    const len = store.finishX;
    const ents = world.coins.length + world.decoFore.length + world.decoBack.length + world.canisters.length + world.boosts.length + world.hazards.length;
    rows.push({ name, vi, tier, ms, len, top, ents });
    console.log(`  ${(name + "·" + L.SPACE_TIERS[tier].name).padEnd(10)}${(kmh + " km/h").padStart(12)}${String(len).padStart(14)}${(len / 1e5).toFixed(0).padStart(12)}${(ms.toFixed(0) + "ms").padStart(9)}${String(ents).padStart(8)}`);
  }
}
console.log(`\n  最慢一局 ${Math.max(...rows.map((r) => r.ms)).toFixed(0)}ms`);

console.log("\n=== 全程实体供给（金币是否够 6 分钟）===");
for (const r of rows) {
  // L.coinN = SPACE_TARGET_SEC/20 = 18 枚 → 6 分钟只有 18 枚，太少
  chk(r.ents > 0, `${r.name}·${L.SPACE_TIERS[r.tier].name} 有实体`, r.ents);
}
console.log("  ⚠️ 上面只校验非零，逐档金币总数另算：");
for (let tier = 0; tier < 5; tier++) {
  const c = L.spaceCourse(tier, 27778);
  console.log(`    ${L.SPACE_TIERS[tier].name.padEnd(3)} coinN=${c.coinN} hazardN=${c.hazardN} coinVal=${c.coinVal}`);
}

console.log("\n=== R3.2 时长恒为 6 分钟 ===");
for (const r of rows) {
  const sec = r.len / r.top;
  chk(Math.abs(sec - 360) < 1, `${r.name}·${L.SPACE_TIERS[r.tier].name} 跑满 ${sec.toFixed(1)}s`, `${(r.len / 1e6).toFixed(1)} Mpx @ ${(r.top / (100 / 3.6)).toFixed(0)} km/h`);
}

console.log("\n=== 流式生成：相机前进时 chunk 跟随 ===");
enter(4, WX);   // 无相 + 终极
const firstChunk = world.chunks.get(0);
console.log(`  起始 chunk 数 = ${world.chunks.size}，装饰 ${world.decoFore.length + world.decoBack.length} 个`);
chk(world.chunks.size > 0, "开局已生成 chunk");
chk(world.decoFore.length + world.decoBack.length > 100, "第一屏有装饰");

// 按**真实帧率**前进：无相满级 2,777,778 px/s ÷ 60fps = 46,296 px/帧，
// chunk 宽 2,000,000px → 每 ~43 帧才跨一次块。这才是真实的最坏/平均分布。
const W = await import("./src/game/world.js");
const PX_PER_FRAME = 2777778 * DT;
console.log(`  真实每帧位移 ${PX_PER_FRAME.toFixed(0)}px，chunk 宽 2,000,000px → 每 ${(2000000 / PX_PER_FRAME).toFixed(0)} 帧跨一次块`);
const N = 600;
let worst = 0, sum = 0, crossings = 0, over16 = 0;
const samples = [];
for (let f = 0; f < N; f++) {
  store.cam.x += PX_PER_FRAME;
  const t0 = performance.now();
  store.time += DT;
  B.stepPhysics();
  W.streamChunks();
  const ms = performance.now() - t0;
  sum += ms; samples.push(ms);
  if (ms > worst) worst = ms;
  if (ms > 8) crossings++;     // 明显是跨块帧
  if (ms > 16.7) over16++;
  if (world.decoFore.length + world.decoBack.length < 100) { console.log(`    ❌ 第 ${f} 帧装饰归零`); fails++; break; }
}
samples.sort((a, b) => a - b);
const p50 = samples[Math.floor(N * 0.5)], p95 = samples[Math.floor(N * 0.95)], p99 = samples[Math.floor(N * 0.99)];
console.log(`  ${N} 帧：p50=${p50.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  p99=${p99.toFixed(2)}ms  最坏=${worst.toFixed(1)}ms  均值=${(sum / N).toFixed(2)}ms`);
console.log(`  超过 8ms 的帧：${crossings}（跨块帧）· 超过 16.7ms 的帧：${over16}`);
console.log(`  前进 ${(N * PX_PER_FRAME / 1e6).toFixed(0)} Mpx 后：chunk=${world.chunks.size} 装饰=${world.decoFore.length + world.decoBack.length}`);
chk(world.chunks.size <= 8, "chunk 数被窗口限制住（不随里程增长）", world.chunks.size);
chk(p95 < 16.7, "p95 帧耗时 < 16.7ms（60fps 预算）", p95.toFixed(2) + "ms");
chk(sum / N < 4, "平均帧耗时 < 4ms", (sum / N).toFixed(2) + "ms");
chk(world.decoFore.length + world.decoBack.length > 100, "前进后装饰仍在（流式持续供给）");

console.log("\n=== chunk 生成是纯函数（倒车回来看到同一条路）===");
{
  enter(4, WX);
  store.cam.x = 10 * 2000000;
  (await import("./src/game/world.js")).streamChunks();
  const a = world.decoFore.slice(0, 40).map((d) => d.x + ":" + d.kind + ":" + d.s.toFixed(4));
  // 跑远，再回来
  store.cam.x = 30 * 2000000;
  (await import("./src/game/world.js")).streamChunks();
  store.cam.x = 10 * 2000000;
  (await import("./src/game/world.js")).streamChunks();
  const b = world.decoFore.slice(0, 40).map((d) => d.x + ":" + d.kind + ":" + d.s.toFixed(4));
  let same = a.length === b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) { same = false; console.log(`    差异 @${i}: ${a[i]} vs ${b[i]}`); break; }
  chk(same, "同一 chunk 重新生成后实体逐位相同", `${a.length} 个样本`);
}

console.log("\n=== 金币不会重复出现 ===");
{
  enter(4, WX);
  const W = await import("./src/game/world.js");
  const before = world.coins.map((c) => c.x);
  // 模拟全部吃光
  for (const c of world.coins) { c.taken = true; world.takenX.add(c.x); }
  store.cam.x = 3 * 2000000;
  W.streamChunks();
  const after = world.coins.filter((c) => before.includes(c.x)).length;
  chk(after === 0, "已吃的金币重新生成后不回来", `重叠 ${after} 枚 / 吃前 ${before.length} 枚`);
}

console.log("\n=== 危险段在 space 下真的判负（不再是纯装饰）===");
{
  enter(2, OMEGA);
  chk(world.hazards.length > 0, "space 关卡生成了危险段", world.hazards.length);
  chk(L.courseAt(0, "space", store.phys.topSpeed).fuelK === 0, "宇宙场 fuelK = 0（不耗油，不会陷入补油重生循环）");
}

console.log(`\n${fails === 0 ? "✅ 全部通过" : `❌ ${fails} 项未通过`}`);
