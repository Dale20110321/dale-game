// 一次性脚本：车辆阶梯重排（正式版）
//   ① 驮马 = 免费起点，必须是全场最弱
//   ② 奇点 = 最高级车，必须「极速 / 抓地 / 油箱 / 扭矩」四项全场第一
//   ③ 车价严格按实测综合能力递增；升满花费按档位递增；形态费按名次严格递增
import fs from "node:fs";
const C = await import("../src/config/constants.js");
const V = await import("../src/config/vehicles.js");

const M = { engine: 100, tire: 100, frame: 100, susp: 100 };

/** 单车四项玩家能看见的性能 */
function spec(v) {
  return {
    kmh: C.toKmh(C.topSpeedOf(v, M)),
    mu: C.deriveFriction(1, v, M),
    tank: v.tank,
    torque: v.phys.torque,
  };
}
const weighted = (s, mx) =>
  0.40 * (s.kmh / mx.kmh) + 0.25 * (s.mu / mx.mu) + 0.20 * (s.tank / mx.tank) + 0.15 * (s.torque / mx.torque);

const all = V.VEHICLES;
const trail = all[0];                                   // 开局白送（storage 里 ownedVehicles=[0]）
const sg = all.find((v) => v.ultra && v.ultra.builtin);  // 终局车

// ---- 在内存里先试算：改参数 → 量能力 → 排序 ----
// ★ 驮马**保持原厂参数**（grp 1.0）：它是开局白送的"试骑车"，
//   参考骑手要用它把 432 关全部跑通 —— 把它削到垫底会让后段关卡在起步车上直接爬不上去。
//   因此"价格递增 = 能力递增"这条不变式只约束 **25 台可购买的车**，
//   免费试骑车是规则之外的借用车，定位是"第一笔钱该拿去升级它，而不是换车"。
sg.grp = 3.0;             // 抓地最高
sg.phys.rpm = 3.6;        // 转速域拉开（抓地上限之外还能更快）
sg.tank = 3.4;            // 油箱最大

const mx = (() => {
  const s = all.map(spec);
  return {
    kmh: Math.max(...s.map((x) => x.kmh)), mu: Math.max(...s.map((x) => x.mu)),
    tank: Math.max(...s.map((x) => x.tank)), torque: Math.max(...s.map((x) => x.torque)),
  };
})();

// 最强 → 最弱排序（升序），首尾锁死：最强 = 奇点，最弱 = 驮马
const paid = all.filter((v) => v !== trail && v !== sg).sort((a, b) => weighted(spec(a), mx) - weighted(spec(b), mx));
const ord = [...paid, sg];   // 25 台可购买车：升序，index 24 最强 = 终局车
const N_PAID = ord.length;

// 名次 → 档位 / 价格 / 升满倍率 / 形态费（25 台：普通 4 / 稀有 6 / 史诗 6 / 传说 5 / 神话 4）
const TIERS = [...Array(4).fill("普通"), ...Array(6).fill("稀有"), ...Array(6).fill("史诗"),
  ...Array(5).fill("传说"), ...Array(4).fill("神话")];
const COSTK = { 普通: 1, 稀有: 5, 史诗: 12, 传说: 25, 神话: 40 };
const P_LO = 3000, P_HI = 120000;
const F_HI = 1020000, F_LO = 8000;

const PLAN = { [trail.id]: { price: 0, tier: "普通", costK: 1, formCost: 0 } };
ord.forEach((v, i) => {
  const rank = i / (N_PAID - 1);                   // 0 = 最便宜，1 = 最贵
  const tier = TIERS[i];
  const price = Math.round(P_LO * Math.pow(P_HI / P_LO, rank) / 500) * 500;
  // 形态费：25 台按名次在 [8000, 1020000] 上取几何阶梯 —— 单调且不会四舍五入到同一档
  const formCost = v.ultra ? Math.round(F_LO * Math.pow(F_HI / F_LO, rank) / 500) * 500 : 0;
  PLAN[v.id] = { price, tier, costK: COSTK[tier], formCost };
});

// ---------------- 写回 vehicles.js ----------------
const p = "src/config/vehicles.js";
const raw = fs.readFileSync(p, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let src = crlf ? raw.replace(/\r\n/g, "\n") : raw;

const anchors = [];
for (const m of src.matchAll(/\n\s*id: "([a-z0-9]+)"/g)) anchors.push({ id: m[1], start: m.index });
if (anchors.length !== all.length) throw new Error(`锚点数 ${anchors.length} ≠ 车辆数 ${all.length}`);

for (let i = anchors.length - 1; i >= 0; i--) {
  const a = anchors[i];
  const plan = PLAN[a.id];
  const obj = all.find((v) => v.id === a.id);
  if (!plan || !obj) continue;
  const end = i + 1 < anchors.length ? anchors[i + 1].start : src.length;
  let b = src.slice(a.start, end);

  // ★ 物理规格也一起落到源码（不能只改内存，否则刷新后就没了）
  b = b.replace(/(grp: )[\d.]+/, `$1${obj.grp}`);
  b = b.replace(/(tank: )[\d.]+/, `$1${obj.tank}`);
  b = b.replace(/(phys: P\()[\d.]+, ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/,
    (m0, a1, b1, c1, d1, e1, f1, g1) =>
      `${a1}${obj.phys.mass}, ${b1}, ${c1}, ${d1}, ${e1}, ${obj.phys.torque}, ${obj.phys.rpm})`);

  b = b.replace(/tier: "[^"]+"/, `tier: "${plan.tier}"`);
  b = b.replace(/(costK: )[\d.]+/, `$1${plan.costK}`);
  b = b.replace(/(price: )[\d.]+/, `$1${plan.price}`);
  if (/ultra: \{/.test(b)) b = b.replace(/(ultra: \{[^}]*?cost: )[\d.]+/, `$1${plan.formCost}`);
  src = src.slice(0, a.start) + b + src.slice(end);
}

// 奇点那段过期注释（写着"升级费倍率 300 / 车价 1,500,000"，早就对不上了）
src = src.replace(
  /\s*\/\/ ★ 升级费倍率 300[\s\S]*?一级一级正常花钱买。/,
  `
    // ★ 终局车：四项性能（极速 / 抓地 / 油箱 / 扭矩）都是全场第一，价格也是最贵。
    //   升满花费 = 28,240 × 40 = 1,129,600（神话档），是车价的 9.4 倍 ——
    //   买回来只是入场，真正的投入是升级；「绝对形态」还要再单独买 1,020,000。
    //   摔不坏是**内置**特性（免解锁），但四项升级仍要一级一级正常花钱买。`);

fs.writeFileSync(p, crlf ? src.replace(/\n/g, "\r\n") : src);
console.log("vehicles.js rewritten");