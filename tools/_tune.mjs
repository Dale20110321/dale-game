// 一次性脚本：车辆调参探索 —— 找 奇点（最高级车）「什么都最好」所需的参数
const C = await import("../src/config/constants.js");
const V = await import("../src/config/vehicles.js");

const M = { engine: 100, tire: 100, frame: 100, susp: 100 };
const clone = (v) => JSON.parse(JSON.stringify(v));

const sg = V.VEHICLES.find((v) => v.ultra && v.ultra.builtin);
console.log("奇点 原参数: grp=" + sg.grp + " rpm=" + sg.phys.rpm + " torque=" + sg.phys.torque +
  " mass=" + sg.phys.mass + " tank=" + sg.tank);
console.log("极速 " + C.toKmh(C.topSpeedOf(sg, M)).toFixed(1) + " km/h · μ " + C.deriveFriction(1, sg, M).toFixed(2));

console.log("\n扫描 grp × rpm（奇点）");
let hdr = "rpm\\grp ";
const grps = [1.9, 2.0, 2.1, 2.15, 2.2];
for (const g of grps) hdr += String(g).padStart(9);
console.log(hdr);
for (const rpm of [2.2, 2.6, 3.0, 3.4, 3.8, 4.2]) {
  let row = String(rpm).padStart(7) + " ";
  for (const g of grps) {
    const t = clone(sg);
    t.grp = g; t.phys.rpm = rpm;
    row += C.toKmh(C.topSpeedOf(t, M)).toFixed(1).padStart(9);
  }
  console.log(row);
}

console.log("\n扫描 grp × torque（rpm 固定 3.0）");
let hdr2 = "trq\\grp ";
for (const g of grps) hdr2 += String(g).padStart(9);
console.log(hdr2);
for (const trq of [2.0, 2.4, 2.8, 3.2]) {
  let row = String(trq).padStart(7) + " ";
  for (const g of grps) {
    const t = clone(sg);
    t.grp = g; t.phys.torque = trq; t.phys.rpm = 3.0;
    row += C.toKmh(C.topSpeedOf(t, M)).toFixed(1).padStart(9);
  }
  console.log(row);
}

// 起点车：驮马要当"最弱 + 免费"
const tr = V.VEHICLES[0];
console.log("\n驮马 原 grp=" + tr.grp + " 极速 " + C.toKmh(C.topSpeedOf(tr, M)).toFixed(1) + " km/h");
console.log("扫描 驮马 grp");
for (const g of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.85, 1.0]) {
  const t = clone(tr);
  t.grp = g;
  console.log("  grp=" + g + " → " + C.toKmh(C.topSpeedOf(t, M)).toFixed(1) + " km/h · μ " + C.deriveFriction(1, t, M).toFixed(2));
}
console.log("\nFRICTION_BASE 相关：0 级 μ(drive) =", C.deriveFriction(0, tr, { engine: 0, tire: 0, frame: 0, susp: 0 }).toFixed(3));