// 验证 abbrevNum：覆盖 spec 点名的全部量级 + 边界
const { abbrevNum } = await import("./src/core/utils.js");

console.log("=== spec R11.3 点名的例子 ===");
const cases = [
  [1.2e12, "1.2万亿（中文语境）→ 我们用 1.2e12"],
  [3.4e18, "3.4e18"],
  [1.5552e17, "无相车价"],
  [24259999999999998951424, "宇宙级资产合计 2.43e22"],
  [621200 * 10014166130071, "无相四项升满"],
  [1e24, "GOLD_MAX"],
  [28240, "普通车四项升满"],
  [800000000, "归墟车价 8 亿"],
  [5000, "成就阈值"],
  [0, "0"],
];
for (const [v, note] of cases) {
  console.log(`  ${String(v).padStart(24)} → ${abbrevNum(v).padEnd(12)} (${note})`);
}

console.log("\n=== with ¥ 前缀 ===");
for (const v of [28240, 8e8, 1.5552e17, 2.43e22, 1e24]) {
  console.log(`  ${abbrevNum(v, { yuan: true })}`);
}

console.log("\n=== 分档边界（不能出现 99999 → 10万 的跳变）===");
const edges = [9999, 1e4, 99999, 999999, 1e6, 1e7, 99999999, 1e8, 1e11, 999999999999, 1e12, 1e15, 1e21, 1e22, 1e24];
for (const v of edges) console.log(`  ${String(v).padStart(16)} → ${abbrevNum(v)}`);

console.log("\n=== 负数与非有限值 ===");
console.log("  -1234567 →", abbrevNum(-1234567));
console.log("  NaN →", abbrevNum(NaN));
console.log("  Infinity →", abbrevNum(Infinity));

console.log("\n=== 单调性：输入递增 → 输出的**量级**不得回退 ===");
// 注意：不能直接 parseFloat("1万")（=1），必须按该档的单位还原
function magnitude(s) {
  if (s.includes("e")) return parseFloat(s);
  if (s.endsWith("万")) return parseFloat(s) * 1e4;
  if (s.endsWith("亿")) return parseFloat(s) * 1e8;
  return parseFloat(s.replace(/,/g, ""));
}
let prev = -1, mono = true;
for (let e = 0; e <= 24; e += 0.05) {
  const v = Math.pow(10, e);
  const m = magnitude(abbrevNum(v));
  if (m < prev) { mono = false; console.log(`  ❌ 1e${e.toFixed(2)} → ${abbrevNum(v)} 量级 ${m} < 前一个 ${prev}`); break; }
  prev = m;
}
console.log(`  ${mono ? "✅ 1..1e24 量级全程单调不降" : "❌ 有回退"}`);

console.log("\n=== 长度上限：UI 不能被撑爆 ===");
const longest = Math.max(...Array.from({ length: 2000 }, (_, i) => abbrevNum(Math.pow(10, i / 12)).length));
console.log(`  最长输出 = ${longest} 字符 ${longest <= 10 ? "✅ 卡片放得下" : "❌ 仍然太长"}`);
console.log(`  对比 toLocaleString(1.5552e17) = ${(155520000000000000).toLocaleString("en-US").length} 字符`);