// 一次性脚本：车辆阶梯重排 —— ① 驮马当免费最弱起点  ② 奇点「什么都最好」
//                ③ 价格严格按实测综合能力递增
import fs from "node:fs";
const C = await import("../src/config/constants.js");
const V = await import("../src/config/vehicles.js");

const M = { engine: 100, tire: 100, frame: 100, susp: 100 };
const ZERO = { engine: 0, tire: 0, frame: 0, susp: 0 };

/** 综合能力分（越大越强）：极速 40% + 抓地 25% + 油箱 20% + 扭矩 15% */
function score(v) {
  const s = {
    kmh: C.toKmh(C.topSpeedOf(v, M)),
    mu: C.deriveFriction(1, v, M),
    tank: v.tank,
    torque: v.phys.torque,
  };
  return s;
}

// ---------------- ① 起点车：驮马必须是全场最弱 ----------------
const trail = V.VEHICLES[0];
trail.grp = 0.5;                       // 抓地下限 → 极速 / μ 全场垫底

// ---------------- ② 终局车：奇点必须什么都最好 ----------------
const sg = V.VEHICLES.find((v) => v.ultra && v.ultra.builtin);
sg.grp = 3.0;                          // 最高抓地
sg.phys.rpm = 3.6;                     // 转速域拉开 → 抓地上限之外还能再快
sg.tank = 3.4;                         // 最大油箱（原本就是最大，再抬一点拉开差距）

// ---------------- ③ 按综合能力排序 → 几何阶梯定价 ----------------
const all = V.VEHICLES;
const mx = (() => {
  const s = all.map(score);
  return {
    kmh: Math.max(...s.map((x) => x.kmh)),
    mu: Math.max(...s.map((x) => x.mu)),
    tank: Math.max(...s.map((x) => x.tank)),
    torque: Math.max(...s.map((x) => x.torque)),
  };
})();
const raw = (v) => {
  const s = score(v);
  return 0.40 * (s.kmh / mx.kmh) + 0.25 * (s.mu / mx.mu) + 0.20 * (s.tank / mx.tank) + 0.15 * (s.torque / mx.torque);
};

// 起点车锁死最末位（免费），终局车锁死首位
const ord = all.filter((v) => v !== trail && v !== sg).sort((a, b) => raw(a) - raw(b));
ord.unshift(sg);
ord.push(trail);

const P_LO = 3000, P_HI = 120000;
const TIERS = [...Array(5).fill("普通"), ...Array(6).fill("稀有"), ...Array(6).fill("史诗"), ...Array(5).fill("传说"), ...Array(4).fill("神话")];
const PLAN = {};
ord.forEach((v, i) => {
  const t = (ord.length - 1 - i) / (ord.length - 1);          // 1 = 最强
  const price = i === ord.length - 1 ? 0 : Math.round(P_LO * Math.pow(P_HI / P_LO, t) / 500) * 500;
  PLAN[v.id] = { price, tier: TIERS[i] };
});

// ---------------- 写回 vehicles.js（按 id 锚定整块替换） ----------------
const p = "src/config/vehicles.js";
const raw2 = fs.readFileSync(p, "utf8");
const crlf = raw2.indexOf("\r\n") >= 0;
let src = crlf ? raw2.replace(/\r\n/g, "\n") : raw2;

const anchors = [];
for (const m of src.matchAll(/\n\s*id: "([a-z0-9]+)"/g)) anchors.push({ id: m[1], start: m.index });
if (anchors.length !== all.length) throw new Error(`锚点数 ${anchors.length} ≠ 车辆数 ${all.length}`);

for (let i = anchors.length - 1; i >= 0; i--) {
  const a = anchors[i];
  const plan = PLAN[a.id];
  if (!plan) continue;
  const end = i + 1 < anchors.length ? anchors[i + 1].start : src.length;
  let b = src.slice(a.start, end);
  const price = plan.price;
  // 升满花费 = 28,240 × costK，恒为车价的 1.15 倍（免费车 costK 取 1，例外）
  const costK = price === 0 ? 1 : Math.max(1, Math.ceil((price * 1.15) / 28240));
  const ultra = price === 0 ? 0 : Math.round((Math.pow(price, 0.8) * 8) / 1000) * 1000;

  b = b.replace(/tier: "[^"]+"/, `tier: "${plan.tier}"`);
  b = b.replace(/(costK: )[\d.]+/, `$1${costK}`);
  b = b.replace(/(price: )[\d.]+/, `$1${price}`);
  if (ultra > 0 && /ultra: \{/.test(b)) b = b.replace(/(ultra: \{[^}]*?cost: )[\d.]+/, `$1${ultra}`);
  src = src.slice(0, a.start) + b + src.slice(end);
}
fs.writeFileSync(p, crlf ? src.replace(/\n/g, "\r\n") : src);
console.log("vehicles.js rewritten");

// ---------------- 校验 ----------------
const after = V.VEHICLES.map((v) => ({ v, ...score(v) })).sort((a, b) => a.v.price - b.v.price);
console.log("\n价格  名称   档     极速    μ     油箱  扭矩  升满     形态费   综合分");
for (const r of after) {
  const up = Array.from({ length: C.MAX_LV }, (_, l) => C.upCostOf(r.v, l)).reduce((x, y) => x + y, 0);
  const mxRaw = mx;
  const sc = 0.40 * (r.kmh / mxRaw.kmh) + 0.25 * (r.mu / mxRaw.mu) + 0.20 * (r.tank / mxRaw.tank) + 0.15 * (r.torque / mxRaw.torque);
  console.log(String(r.v.price).padStart(7), r.v.name.padEnd(4, "　"), (r.v.tier || "").padEnd(3, "　"),
    r.kmh.toFixed(1).padStart(7), r.mu.toFixed(2).padStart(6), String(r.tank).padStart(6),
    String(r.torque).padStart(5), String(up).padStart(9), String(r.v.ultra ? r.v.ultra.cost : 0).padStart(9),
    sc.toFixed(3).padStart(7));
}
const mono = (key) => {
  const bad = [];
  for (let k = 1; k < after.length; k++) {
    if (after[k][key] < after[k - 1][key] - 1e-9) bad.push(`${after[k - 1].v.name}→${after[k].v.name}`);
  }
  return bad;
};
console.log("\n单调性（按价格升序）");
for (const k of ["kmh", "mu", "tank", "torque"]) {
  const bad = mono(k);
  console.log("  " + k.padEnd(7) + (bad.length ? "✗ " + bad.length + " 处: " + bad.join(" ") : "✓"));
}
const scs = after.map((r) => 0.40 * (r.kmh / mx.kmh) + 0.25 * (r.mu / mx.mu) + 0.20 * (r.tank / mx.tank) + 0.15 * (r.torque / mx.torque));
let scBad = [];
for (let k = 1; k < scs.length; k++) if (scs[k] < scs[k - 1] - 1e-9) scBad.push(after[k].v.name);
console.log("  综合分   " + (scBad.length ? "✗ " + scBad.join(" ") : "✓ 严格递增"));
console.log("\n极速区间 " + Math.min(...after.map(r => r.kmh)).toFixed(1) + "~" + Math.max(...after.map(r => r.kmh)).toFixed(1) +
  "（" + (Math.max(...after.map(r => r.kmh)) / Math.min(...after.map(r => r.kmh))).toFixed(2) + " 倍）");
console.log("升满 > 车价：" + after.filter(r => r.v.price > 0 && Array.from({ length: C.MAX_LV }, (_, l) => C.upCostOf(r.v, l)).reduce((x, y) => x + y, 0) > r.v.price).length + "/" + after.filter(r => r.v.price > 0).length);