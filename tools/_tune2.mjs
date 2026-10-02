const C = await import("../src/config/constants.js");
const V = await import("../src/config/vehicles.js");
const M = { engine: 100, tire: 100, frame: 100, susp: 100 };
const clone = (v) => JSON.parse(JSON.stringify(v));
const sg = V.VEHICLES.find((v) => v.ultra && v.ultra.builtin);
console.log("奇点 grp 扫描（质量/扭矩都不影响，被抓地上限卡死）");
for (const g of [2.2, 2.4, 2.6, 2.8, 3.0, 3.2, 3.5, 4.0]) {
  const t = clone(sg); t.grp = g;
  console.log("  grp=" + g + " → 极速 " + C.toKmh(C.topSpeedOf(t, M)).toFixed(1) +
    " km/h · μ " + C.deriveFriction(1, t, M).toFixed(2) +
    " · 0级极速 " + C.toKmh(C.topSpeedOf(t, { engine: 0, tire: 0, frame: 0, susp: 0 })).toFixed(1));
}
console.log("\n奇点 grp=3.0 时质量的影响");
for (const m of [1.2, 1.8, 2.4, 3.0]) {
  const t = clone(sg); t.grp = 3.0; t.phys.mass = m; t.phys.torque = Math.max(1.2, 2.4 - m * 0.3);
  console.log("  mass=" + m + " → 极速 " + C.toKmh(C.topSpeedOf(t, M)).toFixed(1) + " km/h");
}
console.log("\n天蚀（当前最快 61.1）在 grp 3.0 下的极速对照");
const ec = V.VEHICLES.find((v) => v.id === "eclipse");
console.log("  天蚀 原 grp=" + ec.grp + " → " + C.toKmh(C.topSpeedOf(ec, M)).toFixed(1));
