// 验证 Task 12.3：无相（100,000 km/h）跑完全部关卡 + 终局关，无 NaN、无位置跳变
//
// 驱动方式：直接调 stepPhysics()（跳过 rAF / DOM / 渲染），每帧全油门。
// 记录三项：数值兜底触发数 capHitCount、任何 NaN/Infinity、逐帧位移尖峰。
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

const { store, bike } = await import("./src/core/store.js");
const { key } = await import("./src/core/input.js");
const B = await import("./src/physics/bike.js");
const W = await import("./src/game/world.js");
const G = await import("./src/game/game.js");
const L = await import("./src/config/levels.js");
const { VEHICLES } = await import("./src/config/vehicles.js");
const { save, getUp } = await import("./src/core/storage.js");
const { DT, START_X, PEN_TOL } = await import("./src/config/constants.js");

// 无相的车辆下标
const WX = VEHICLES.findIndex((v) => v.id === "wuxiang" || (v.tier === "宇宙" && v.nominalKmh === 100000));
console.log(`无相车辆下标 = ${WX}（${VEHICLES[WX].name}，标称 ${VEHICLES[WX].nominalKmh} km/h）`);

// 给满级四项 + 开形态
store.ownedVehicles = [WX];
store.currentVehicle = WX;
// ★ 升级容器按**车 id** 键（storage.js 的 getUp 读 store.upgrades[veh.id]），
//   用下标写会被 sanitizeUpgrades 丢弃 —— 那样 applyUpgrades 拿到的是全 0 级
store.upgrades[VEHICLES[WX].id] = { engine: 500, tire: 500, frame: 500, susp: 500 };
console.log(`车辆 id = "${VEHICLES[WX].id}"，升级键写入成功`);

const bad = [];
let frames = 0;

/** 跑一关，返回统计 */
function runLevel(idx, label, maxSec) {
  store.mode = "level";
  store.selLevel = idx;
  store.ultra = store.ultra || {};
  store.ultra[VEHICLES[WX].id] = true;     // 开形态（store.ultra 按**车 id** 键，不是下标）
  G.startGame("level", idx);
  B.applyUpgrades();
  key.right = true;                        // 油门就是 key.right（stepPhysics 的 drvK）
  bike.awaitingStart = false;              // 绕过"等第一次按键才起步"的门（否则全程静止）

  const cap0 = B.capHitCount();
  let nan = 0, jumpMax = 0, jumpAt = -1, prevX = bike.rear.x, maxV = 0, minV = Infinity, vSum = 0, nV = 0;
  let lastX = bike.rear.x;
  const t0 = performance.now();
  for (let f = 0; f * DT < maxSec; f++) {
    store.time += DT;
    B.stepPhysics();
    frames++;
    const pts = [bike.rear, bike.front, bike.head, bike.axleRear, bike.axleFront];
    for (const p of pts) {
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p._vx) || !isFinite(p._vy)) {
        nan++;
        if (bad.length < 8) bad.push(`${label} 第${f}帧 NaN @${p.x},${p.y} v=${p._vx},${p._vy}`);
        return { nan, cap: B.capHitCount() - cap0, jumpMax, v: 0, sec: f * DT, ms: performance.now() - t0, done: false };
      }
    }
    const v = Math.abs(B.bikeVx());
    maxV = Math.max(maxV, v); minV = Math.min(minV, v); vSum += v; nV++;
    // 位移尖峰：相对本关均速的 3 倍（摔倒回卷会造成巨大的负向跳变）
    const d = Math.abs(bike.rear.x - lastX);
    lastX = bike.rear.x;
    const avg = nV ? vSum / nV : 1;
    if (avg > 1 && d > avg * DT * 3) { if (d > jumpMax) { jumpMax = d; jumpAt = f; } }
    if (store.run.crashed) { /* 摔车后 game 层会重生，这里只统计不干预 */ }
  }
  return { nan, cap: B.capHitCount() - cap0, jumpMax, jumpAt, vMax: maxV, vAvg: vSum / nV, sec: frames * DT, ms: performance.now() - t0 };
}

console.log("\n=== 无相满级形态：跨地形抽样 12 关 + 终局关 ===");
const total = L.LEVELS.length;
const sample = [0, 1, 35, 36, 71, 108, 179, 216, 287, 323, 395, 431].map((i) => Math.min(i, total - 1));
console.log("  关卡".padEnd(10) + "len".padStart(10) + "极速(km/h)".padStart(12) + "均值".padStart(10) + "位移尖峰".padStart(11) + "兜底".padStart(6) + "NaN".padStart(6) + "耗时".padStart(8));
let worstJump = 0, totalCap = 0, totalNaN = 0;
for (const i of sample) {
  const lv = L.levelAt(i);
  // 无相在超短关卡会立刻冲过终点，给足时间
  const r = runLevel(i, `第${i + 1}关`, 40);
  totalCap += r.cap; totalNaN += r.nan;
  worstJump = Math.max(worstJump, r.jumpMax);
  const kmh = (v) => (v / 100) * 3.6;
  console.log(`  第${String(i + 1).padStart(4)}关  ${String(lv.len).padStart(9)} ${kmh(r.vMax || 0).toFixed(0).padStart(12)} ${kmh(r.vAvg || 0).toFixed(0).padStart(10)} ${r.jumpMax.toFixed(0).padStart(11)} ${String(r.cap).padStart(6)} ${String(r.nan).padStart(6)} ${r.ms.toFixed(0).padStart(7)}ms`);
}

console.log("\n=== 终局关（167km / 36 段）===");
{
  const t0 = performance.now();
  store.mode = "level";
  store.selLevel = L.FINALE_INDEX;
  G.startGame("level", L.FINALE_INDEX);
  B.applyUpgrades();
  key.right = true;
  bike.awaitingStart = false;
  const cap0 = B.capHitCount();
  let nan = 0, jumpMax = 0, maxV = 0, vSum = 0, nV = 0, lastX = bike.rear.x, themes = new Set();
  const { THEMES } = await import("./src/config/themes.js");
  for (let f = 0; f * DT < 120; f++) {
    store.time += DT;
    B.stepPhysics();
    frames++;
    themes.add(store.phys.theme);
    for (const p of [bike.rear, bike.front, bike.head, bike.axleRear, bike.axleFront]) {
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p._vx) || !isFinite(p._vy)) {
        nan++;
        if (bad.length < 8) bad.push(`终局关 第${f}帧 NaN`);
        break;
      }
    }
    const v = Math.abs(B.bikeVx());
    maxV = Math.max(maxV, v); vSum += v; nV++;
    const d = Math.abs(bike.rear.x - lastX); lastX = bike.rear.x;
    const avg = nV ? vSum / nV : 1;
    if (avg > 1 && d > avg * DT * 3 && d > jumpMax) jumpMax = d;
    if (nan) break;
  }
  const sec = nV * DT;
  const kmh = (v) => (v / 100) * 3.6;
  console.log(`  跑了 ${sec.toFixed(0)}s（${nV} 帧），极速 ${kmh(maxV).toFixed(0)} km/h，位移尖峰 ${jumpMax.toFixed(0)}px，兜底 ${B.capHitCount() - cap0}，NaN ${nan}`);
  console.log(`  途经场景主题 ${themes.size} 种：${[...themes].sort((a, b) => a - b).join(",")}`);
  console.log(`  穿越里程 ${((bike.rear.x - START_X) / 1000).toFixed(1)} km / 全长 ${(L.FINALE.len / 1000).toFixed(1)} km`);
  totalCap += B.capHitCount() - cap0; totalNaN += nan;
  worstJump = Math.max(worstJump, jumpMax);
  void t0;
}

console.log("\n=== 判定 ===");
let fails = 0;
const chk = (ok, label, extra) => { if (!ok) fails++; console.log(`  ${ok ? "✅" : "❌"} ${label}${extra !== undefined ? "  → " + extra : ""}`); };
chk(totalNaN === 0, "全程无 NaN / Infinity", `${totalNaN} 次`);
chk(totalCap === 0, "数值兜底（NUM_CAP_V / TOP_SPEED_CAP）零触发", `${totalCap} 次`);
chk(worstJump < 1e6, "无位置跳变（尖峰受控）", `最大 ${worstJump.toFixed(0)}px`);
for (const b of bad) console.log("    " + b);

console.log(`\n共驱动 ${frames} 帧物理`);
console.log(fails === 0 ? "✅ 全部通过" : `❌ ${fails} 项未通过`);
