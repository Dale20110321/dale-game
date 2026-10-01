// 变异测试：故意注入缺陷，验证 audit.mjs / autotest.mjs 真的抓得到（而不是恒绿）。
// 变异定义放在本文件内部：命令行传参会破坏含引号的锚点字符串。
// 文件读写一律走 node —— PowerShell 的 Get/Set-Content 会把 UTF-8 读成 ANSI 再写回，弄乱中文。
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";

// 解释器：优先环境变量 BUN，其次 PATH 上的 bun / node，最后回退到本机已知安装位置。
// 之前写死了绝对路径，换台机器就找不到 —— 变异测试本身变成"跑不起来"，等于没做。
function findRuntime() {
  const cands = [process.env.BUN, "bun", "node"].filter(Boolean);
  for (const c of cands) {
    try {
      execSync(process.platform === "win32" ? "where " + c : "command -v " + c, { stdio: "ignore" });
      return c;
    } catch { /* 试下一个 */ }
  }
  return "node";
}
const BUN = findRuntime();
const NL = "\n";

const MUTATIONS = [
  {
    name: "设计令牌取值被改（CSS 与 JS 不同步）",
    file: "styles/tokens.css",
    find: "--surface-1: #0d1b2a;",
    repl: "--surface-1: #ff0000;",
  },
  {
    name: "第 51 关长度突然变短（破坏难度单调）",
    file: "src/config/levels.js",
    find: "const len = Math.round(4200 + gN * 9000);",
    repl: "const len = Math.round(4200 + gN * 9000) * (gi === 50 ? 0.5 : 1);",
  },
  {
    name: "game/ 反向 import ui/（模块红线）",
    file: "src/game/game.js",
    find: 'import { showToast } from "../core/toast.js";',
    repl: 'import { showToast } from "../core/toast.js";' + NL + 'import { hideOverlay } from "../ui/menu.js";',
  },
  {
    name: "physics/ 反向 import render/（模块红线）",
    file: "src/physics/terrain.js",
    find: 'import { store } from "../core/store.js";',
    repl: 'import { store } from "../core/store.js";' + NL + 'import { groundY as _g } from "../render/terrain.js";',
  },
  {
    name: "目标坡度曲线改成非单调",
    file: "src/config/levels.js",
    find: "return 19.5 + 34.5 * Math.pow(gN, 1.1);",
    repl: "return gN > 0.5 ? 30 : 45;",
  },
  {
    // 真正把波长压到护栏以下（单纯调低 MIN_WAVELEN 不产生实际缺陷：体格基准波长本就 >400px）
    name: "把某体格的波长压到 150px（窄特征 → 曲率失控）",
    file: "src/config/levels.js",
    find: 'waves: [[2600, 56, 34], [1000, 14, 7], [420, 5, 2]]',
    repl: 'waves: [[2600, 56, 34], [1000, 14, 7], [150, 5, 2]]',
  },
  {
    // 真正把局部地貌压窄（单纯调低 MIN_FEAT_W 不产生实际缺陷：W[] 本身就 ≥640px）
    name: "把起跳唇压窄到 120px（窄陡特征）",
    file: "src/config/levels.js",
    find: "const W = { kicker: 760,",
    repl: "const W = { kicker: 120,",
  },
  {
    name: "局部地貌振幅失控（深坑吞车）",
    file: "src/config/levels.js",
    // 锚点跟着现值走：FEAT_AMP_MAX 现为 0（5 类非 ramp 地貌的振幅被标定为关闭，
    // 原因见 levels.js 注释）。之前的锚点写死 18，导致这条变异直接 SKIP、从未真正生效。
    // 这里改成 600：振幅失控会把累计爬升顶出预算，应当被 audit 抓到。
    find: "const FEAT_AMP_MAX = 0;",
    repl: "const FEAT_AMP_MAX = 600;",
  },
  {
    name: "index.html 内联 onclick",
    file: "index.html",
    find: "<canvas id=\"cv\"></canvas>",
    repl: "<canvas id=\"cv\" onclick=\"alert(1)\"></canvas>",
  },
  {
    name: "main.css 引入字面色值（脱离令牌）",
    file: "styles/main.css",
    find: "body {",
    repl: "body { color: #ff00ff;",
  },
  {
    name: "摔车惩罚被放宽（机制常量漂移）",
    file: "src/config/constants.js",
    find: "export const CRASH_FUEL_LOSS = 0.08;",
    repl: "export const CRASH_FUEL_LOSS = 0.02;",
  },
  {
    name: "地形换成硬切（破坏 C¹ 连续）",
    file: "src/config/levels.js",
    find: "return y + relief * ss((x - LAUNCH_PAD) / RUN_IN);",
    repl: "return y + relief * (x > LAUNCH_PAD + RUN_IN ? 1 : 0);",
  },
  {
    name: "去掉物理安全上限 NUM_CAP_V 的量级",
    file: "src/config/constants.js",
    find: "export const NUM_CAP_V = 6000;",
    repl: "export const NUM_CAP_V = 12;",
  },
];

const only = process.argv[2];
let caught = 0, missed = 0, skipped = 0;

for (const m of MUTATIONS) {
  if (only && !m.name.includes(only)) continue;
  const orig = readFileSync(m.file, "utf8");
  if (!orig.includes(m.find)) {
    console.log(`\n=== ${m.name} ===`);
    console.log(`  \u26A0 SKIP：锚点没找到，变异没生效，这次结果无效`);
    skipped++;
    continue;
  }
  writeFileSync(m.file, orig.replace(m.find, m.repl), "utf8");
  let out = "";
  try {
    out = execFileSync(BUN, ["tools/audit.mjs"], { encoding: "utf8", cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  } finally {
    writeFileSync(m.file, orig, "utf8"); // 还原
  }
  const fails = out.split("\n").filter((l) => l.includes("❌"));
  const summary = (out.split("\n").filter((l) => l.includes("项检查")).pop() || "").trim();
  // 崩溃也算"被抓到"—— 崩溃是响的，不是静悄悄放过
  const crashed = !summary && /error|Cannot find/i.test(out);
  console.log(`\n=== ${m.name} ===`);
  if (fails.length === 0 && crashed) {
    caught++;
    console.log(`  ✅ 抓到（模块加载即崩溃，缺陷同样暴露）`);
    console.log("     " + (out.split("\n").find((l) => /error/i.test(l)) || "").trim().slice(0, 100));
  } else if (fails.length === 0) {
    console.log(`  \u274C 未被抓到 —— 假绿！ ${summary}`);
    missed++;
  } else {
    caught++;
    console.log(`  \u2705 抓到 ${fails.length} 项  ${summary}`);
    for (const f of fails.slice(0, 3)) console.log("     " + f.trim().slice(0, 110));
  }
}

console.log(`\n──────── 变异测试汇总 ────────`);
console.log(`  抓到 ${caught} · 假绿 ${missed} · 跳过 ${skipped} · 合计 ${MUTATIONS.length}`);
process.exitCode = missed > 0 ? 1 : 0;
