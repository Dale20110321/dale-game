// 验证 Task 10：宇宙场 5 分级 / 长度 / AI 自适应 / 收益曲线
import { performance } from "node:perf_hooks";
const M = await import("./src/config/levels.js");
const { THEMES } = await import("./src/config/themes.js");

console.log("=== R3.2 五个分级的长度 ===");
const KM = (v) => (v / 3.6) * 100;
const want = [10e6, 50e6, 100e6, 250e6, 500e6];
let allOk = true;
for (let i = 0; i < M.SPACE_TIERS.length; i++) {
  const t = M.SPACE_TIERS[i];
  const len = M.spaceLenOf(t);
  const ok = Math.abs(len - want[i]) / want[i] < 0.001;
  if (!ok) allOk = false;
  console.log(`  ${t.icon} ${t.name.padEnd(3)} kmh=${String(t.kmh).padStart(5)}  len=${String(len).padStart(9)}  (${(len / 1e6).toFixed(0)} Mpx / ${(len / 1e5).toFixed(0)} km)  ${ok ? "✅" : "❌ 期望 " + want[i]}`);
}
console.log(`  ${allOk ? "✅ 五档长度全部命中" : "❌"}`);

console.log("\n=== R3.1 太空场景（themes.js 里 space:true 的）===");
const spaceThemes = THEMES.map((t, i) => (t.bg && t.bg.space ? i : -1)).filter((i) => i >= 0);
console.log(`  space:true 的场景下标 = [${spaceThemes}]  名称 = ${spaceThemes.map((i) => THEMES[i].name).join(" / ")}`);
console.log(`  每个都带视差天体: ${spaceThemes.map((i) => `${THEMES[i].name}=${THEMES[i].bg.celestial.type}(parallax ${THEMES[i].bg.celestial.parallax})`).join(", ")}`);
const used = new Set(M.SPACE_TIERS.flatMap((t) => t.themes));
console.log(`  宇宙场引用的场景 = [${[...used]}]，全部是 space:true? ${[...used].every((i) => spaceThemes.includes(i)) ? "✅" : "❌"}`);

console.log("\n=== 各分级的赛道构建耗时与规模 ===");
for (let i = 0; i < M.SPACE_TIERS.length; i++) {
  const t = performance.now();
  const L = M.spaceCourse(i);
  const dt = performance.now() - t;
  console.log(`  ${M.SPACE_TIERS[i].name.padEnd(3)} 构建 ${dt.toFixed(0).padStart(5)}ms  len=${L.len}  segs=${L.segments.length} waves=${L.waves.length} steps=${L.steps.length} feats=${L.feats.length} coins=${L.coinN} hazards=${L.hazardN} slope=${L.maxSlope.toFixed(1)}°`);
}

console.log("\n=== R3.3 AI 配速随玩家实际极速自适应 ===");
const tiers = M.SPACE_TIERS;
console.log("玩家极速      | " + tiers.map((t) => t.name.padStart(8)).join(" |"));
const rows = [
  ["Lv0 归墟 90km/h", KM(90)],
  ["Lv100 归墟 233km/h", KM(233)],
  ["Lv500 归墟 1000km/h", KM(1000)],
  ["星殒 5000km/h", KM(5000)],
  ["无相 100000km/h", KM(100000)],
];
for (const [label, top] of rows) {
  const cells = tiers.map((t) => (M.spaceAIScale(top, t) / KM(1)).toFixed(0).padStart(8));
  console.log(`${label.padEnd(14)} | ${cells.join(" | ")} km/h`);
}

console.log("\n=== R3.4 AI 配速上限钳在 50000 km/h ===");
let capOk = true;
for (let i = 0; i < tiers.length; i++) {
  for (const top of [KM(90), KM(1000), KM(50000), KM(100000), KM(1000000)]) {
    const ai = M.spaceAIScale(top, tiers[i]);
    if (ai > KM(50000) + 1e-6) { capOk = false; console.log(`  ❌ ${tiers[i].name}: top=${top} → ai=${ai}`); }
  }
}
console.log(`  ${capOk ? "✅ 全部 ≤50000 km/h" : "❌"}`);

console.log("\n=== R3.4 无相(100000km/h)必须稳赢：AI 配速 vs 玩家极速 ===");
const formless = KM(100000);
for (let i = 0; i < tiers.length; i++) {
  const ai = M.spaceAIScale(formless, tiers[i]);
  const ratio = ai / formless;
  console.log(`  ${tiers[i].name.padEnd(3)}: AI=${(ai / KM(1)).toFixed(0)} km/h = 玩家的 ${(ratio * 100).toFixed(0)}%  ${ratio < 1 ? "✅ 玩家更快" : "❌"}`);
}

console.log("\n=== R3.3 Lv0 玩家不被必胜：AI 应有可战胜的档位 ===");
for (let i = 0; i < tiers.length; i++) {
  const ai = M.spaceAIScale(KM(90), tiers[i]);
  const kmh = ai / KM(1);
  console.log(`  ${tiers[i].name.padEnd(3)}: Lv0 归墟(90km/h) 参赛 → AI=${kmh.toFixed(0)} km/h  ${kmh < 90 ? "✅ AI 更慢，玩家能赢" : "⚠️ AI 更快"}`);
}

console.log("\n=== R3.6 收益随分级递增 ===");
let goldMono = true;
for (let i = 1; i < tiers.length; i++) if (!(tiers[i].gold > tiers[i - 1].gold)) goldMono = false;
for (const t of tiers) console.log(`  ${t.name.padEnd(3)} ¥${t.gold.toExponential(2)}`);
console.log(`  ${goldMono ? "✅ 严格递增" : "❌"}  与归墟车价 8e8 的比: ${tiers.map((t) => (t.gold / 8e8).toFixed(0) + "x").join(", ")}`);

console.log("\n=== fuelK=0.02 下的燃料需求 ===");
const CAN_FUEL = 0.6, REF = 520;
for (let i = 0; i < tiers.length; i++) {
  const L = M.spaceCourse(i);
  const fuelK = L.fuelK;
  const kAvg = ((0.005 * 1.0) / 1 + 0.62 * (((0.021 * 1.0) / 1) - ((0.005 * 1.0) / 1))) * fuelK;
  const vAvg = 0.78 * REF;
  const range = vAvg / kAvg;
  console.log(`  ${tiers[i].name.padEnd(3)} fuelK=${fuelK}  续航=${(range / 1e5).toFixed(1)} 万km  需求=${(L.len / range).toFixed(2)} 箱  ${L.len / range < 1 ? "✅ 一箱够跑完全程" : "❌ 仍需补油"}`);
}