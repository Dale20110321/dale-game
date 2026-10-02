// 一次性脚本：按价格排序打印每辆车的实测能力，并检查「性能随价格递增」
const C = await import("../src/config/constants.js");
const V = await import("../src/config/vehicles.js");

const M = { engine: 100, tire: 100, frame: 100, susp: 100 };
const rows = V.VEHICLES.map((v, i) => {
  const h = C.deriveHandling(v, M);
  return {
    i, id: v.id, name: v.name, tier: v.tier, price: v.price, costK: v.costK,
    kmh: C.toKmh(h.MAXV),
    mu: +(C.deriveFriction(1, v, M)).toFixed(2),
    tank: v.tank, air: v.air, torque: v.phys.torque, rpm: v.phys.rpm,
    mode: v.ultra ? v.ultra.mode : "",
    upTotal: Array.from({ length: C.MAX_LV }, (_, l) => C.upCostOf(v, l)).reduce((a, b) => a + b, 0),
    formCost: v.ultra ? v.ultra.cost : 0,
  };
}).sort((a, b) => a.price - b.price);

console.log("价      名称    档     极速km/h  μ     油箱  空中  扭矩  转速  升满      形态费    形态");
for (const r of rows) {
  console.log(
    String(r.price).padStart(7),
    r.name.padEnd(5, "　"),
    (r.tier || "").padEnd(3, "　"),
    r.kmh.toFixed(1).padStart(8),
    String(r.mu).padStart(6),
    String(r.tank).padStart(5),
    String(r.air).padStart(5),
    String(r.torque).padStart(5),
    String(r.rpm).padStart(5),
    String(r.upTotal).padStart(9),
    String(r.formCost || "-").padStart(9),
    r.mode || "-");
}

const mono = (key, dir) => {
  const bad = [];
  for (let k = 1; k < rows.length; k++) {
    const a = rows[k - 1][key], b = rows[k][key];
    if (dir > 0 ? b < a - 1e-9 : b > a + 1e-9) bad.push(`${rows[k - 1].name}(${a})→${rows[k].name}(${b})`);
  }
  return bad;
};
console.log("\n单调性检查（按价格升序）");
for (const [k, d] of [["kmh", 1], ["mu", 1], ["tank", 1], ["torque", 1], ["upTotal", 1], ["formCost", 1]]) {
  const bad = mono(k, d);
  console.log(`  ${k.padEnd(9)} ${bad.length ? "✗ " + bad.length + " 处逆序: " + bad.slice(0, 6).join(" | ") : "✓"}`);
}
console.log("\n极速区间", Math.min(...rows.map(r => r.kmh)).toFixed(1), "~", Math.max(...rows.map(r => r.kmh)).toFixed(1),
  " 倍数", (Math.max(...rows.map(r => r.kmh)) / Math.min(...rows.map(r => r.kmh))).toFixed(2));
console.log("ABSOLUT_KMH =", C.ABSOLUT_KMH, " ABSOLUT_V =", C.ABSOLUT_V.toFixed(0), "px/s");
const sg = V.VEHICLES.find(v => v.ultra && v.ultra.builtin);
console.log("终局车", sg.name, "形态", sg.ultra.mode, "builtin", sg.ultra.builtin, "cost", sg.ultra.cost,
  "· 表盘极速", C.toKmh(C.topSpeedOf(sg, M)).toFixed(1), "km/h（形态未开时的 MAXV）");