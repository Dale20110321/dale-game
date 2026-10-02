// 一次性脚本：车价按**实测能力**排序重定，升级费与形态费由车价派生
const fs = require("fs");
const C = await import("../src/config/constants.js");
const V = await import("../src/config/vehicles.js");

const M = { engine: 100, tire: 100, frame: 100, susp: 100 };
const MAXED = C.deriveHandling;

/**
 * 综合能力分（越大越强）。四项等权取归一化后的和：
 *   极速 / 抓地 μ / 油箱 / 空中姿态
 * 奇点额外加权：它的 350 km/h 藏在「绝对形态」里，不看形态的话会被低估。
 */
function power(v) {
  const h = MAXED(v, M);
  return { vmax: C.toKmh(h.MAXV), mu: C.deriveFriction(1, v, M), tank: v.tank, air: v.air };
}
const stats = V.VEHICLES.map((v) => ({ v, ...power(v) }));
const mx = {
  vmax: Math.max(...stats.map((s) => s.vmax)),
  mu: Math.max(...stats.map((s) => s.mu)),
  tank: Math.max(...stats.map((s) => s.tank)),
  air: Math.max(...stats.map((s) => s.air)),
};
const score = (s) =>
  0.55 * (s.vmax / mx.vmax) + 0.2 * (s.mu / mx.mu) + 0.15 * (s.tank / mx.tank) + 0.1 * (s.air / mx.air);

// 奇点锁在最强（它的 350 km/h 来自形态，不看形态会被排到中游）
const ord = stats.slice().sort((a, b) => {
  if (a.v.ultra && a.v.ultra.builtin) return 1;
  if (b.v.ultra && b.v.ultra.builtin) return -1;
  return score(a) - score(b);
});
if (!ord[ord.length - 1].v.ultra.builtin) {
  const i = ord.findIndex((s) => s.v.ultra.builtin);
  if (i >= 0) ord.push(ord.splice(i, 1)[0]);
}

// 价格：几何阶梯 3,000 → 120,000（40 倍跨度）
// ★ 40 倍而不是原来的 200 倍 —— 极速差 2.2 倍、μ 差 3 倍、油箱差 3 倍，
//   综合能力差不到 4 倍，价格就该是几十倍量级，而不是几百倍。
//   真正的长线开销放在**升级**和**形态**上（那两项才随档位陡增）。
const N = ord.length;
const P_LO = 3000, P_HI = 120000;
const PLAN = {};
ord.forEach((s, i) => {
  const t = N === 1 ? 0 : i / (N - 1);
  PLAN[s.v.id] = Math.round(P_LO * Math.pow(P_HI / P_LO, t) / 500) * 500;
});

// 档位标签按能力排名重新分配（5/6/6/5/4），让档位与实际强弱一致
const TIERS = [
  ...Array(5).fill("普通"),
  ...Array(6).fill("稀有"),
  ...Array(6).fill("史诗"),
  ...Array(5).fill("传说"),
  ...Array(4).fill("神话"),
];
ord.forEach((s, i) => { PLAN[s.v.id].tier = TIERS[i]; });

// ---------- 写回 vehicles.js ----------
const p = "src/config/vehicles.js";
let src = fs.readFileSync(p, "utf8");
const anchors = [];
for (const m of src.matchAll(/\n\s*id: "([a-z0-9]+)"/g)) anchors.push({ id: m[1], start: m.index });

let out = src;
for (let i = anchors.length - 1; i >= 0; i--) {
  const a = anchors[i];
  const plan = PLAN[a.id];
  if (!plan) continue;
  const end = i + 1 < anchors.length ? anchors[i + 1].start : src.length;
  let b = out.slice(a.start, end);
  const price = plan;
  // 升满花费 = 28,240 × costK，**恒为车价的 1.15 倍** —— "升满 > 车价" 由构造保证
  const costK = Math.max(1, Math.ceil((price * 1.15) / 28240));
  const ultra = Math.round((Math.pow(price, 0.8) * 8) / 1000) * 1000;

  b = b.replace(/tier: "[^"]+"/, `tier: "${plan.tier}"`);
  b = b.replace(/(costK: )[\d.]+/, `$1${costK}`);
  b = b.replace(/(price: )[\d.]+/, `$1${price}`);
  if (/ultra: \{/.test(b)) b = b.replace(/(ultra: \{[^}]*?cost: )[\d.]+/, `$1${ultra}`);
  out = out.slice(0, a.start) + b + out.slice(end);
}
fs.writeFileSync(p, out);
console.log("repriced by measured capability");
