import { readFileSync } from "fs";
const s = readFileSync("C:/1/index.html", "utf8");
const m = s.match(/<script>([\s\S]*?)<\/script>/);
try { new Function(m[1]); console.log("✅ JS 语法通过"); }
catch (e) { console.log("❌ 语法错误:", e.message); process.exit(1); }
const must = ["引擎刹车","dec=0.12","depth<-8","MAXDA=0.035","upgrades.susp","Math.cos(d/(o.w/2)*Math.PI/2)","data-buy=\"susp\""];
let miss = 0;
for (const k of must) if (!s.includes(k)) { console.log("❌ 缺:", k); miss++; }
console.log(miss === 0 ? "✅ 所有关键修复在位" : "⚠️ 有缺失");