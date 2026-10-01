#!/usr/bin/env node
// ============================================================
//  一键跑全部测试套件（汇总器，不做任何断言）
//    依次执行：
//      1. tools/autotest.mjs  —— 功能与物理的**聚合**断言（慢、条数少）
//      2. tools/audit.mjs     —— 把同一批数据**逐项摊开**的深度体检（快、条数多）
//      3. tools/audit-*.mjs   —— 各深度体检模块（独立进程，逐域隔离）
//    最后打印一张总表；全绿 = 退出码 0，任一失败 = 1。
//
//  用法：
//    node tools/test-all.mjs              # 全量
//    node tools/test-all.mjs --quiet      # 只打总表（默认就只打总表，保留兼容）
//    node tools/test-all.mjs --verbose    # 额外打印每个套件的完整输出
//
//  容错：
//    · audit-<域>.mjs 由多个 agent 并行创建，尚不存在时**自动跳过**，不崩
//    · audit-ctx.mjs 是共享上下文（不是测试模块），恒不作为套件执行
//    · 任一套件崩溃 / 非零退出都记为失败项，不影响其余套件继续跑
// ============================================================
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS, "..");
const VERBOSE = process.argv.includes("--verbose");

/**
 * 用**当前解释器**再跑一个子脚本。
 * 不用硬编码的 "node"/bun 绝对路径：本文件用 node 跑就用 node，用 bun 跑就用 bun，
 * 免得换机器 / 换运行时（mutate.mjs 里写死 bun.exe 路径的老问题）。
 */
const INTERP = process.execPath;

/** 显示宽度：CJK 与全角符号按 2 列算，中文表格才能真对齐 */
const dw = (s) => {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    w += (c >= 0x1100 && (
      c <= 0x115f ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6)
    )) ? 2 : 1;
  }
  return w;
};
const pad = (s, n) => s + " ".repeat(Math.max(0, n - dw(s)));

/**
 * 解析 harness.mjs 的输出。
 *
 * ★ 计数**以套件自己打的汇总行为准**（"共 N 项检查，失败 M 项"），不靠数行：
 *   · autotest 的 results 里混有逐关用时表、星级对照表等缩进报告行，
 *     harness 按"以两空格开头"统计，会把它们一并算进去；
 *   · audit 的 detail 文案里本身含 ✅ / ❌ 字符，行扫描会多算。
 *   数行只用来挑失败明细给人看；崩溃（没打到汇总行）时才退回数行。
 */
function parse(out) {
  const s = String(out || "");
  const lines = s.split(/\r?\n/);
  const failed = lines.filter((l) => /^\s{2}❌/.test(l)).map((l) => l.trim());
  let linePass = 0;
  for (const l of lines) if (/^\s{2}✅/.test(l)) linePass++;

  const sums = [...s.matchAll(/共\s*(\d+)\s*项检查[，,]\s*失败\s*(\d+)\s*项/g)];
  const sum = sums.length ? sums[sums.length - 1] : null;
  if (sum) {
    const total = Number(sum[1]);
    const fail = Number(sum[2]);
    return { pass: total - fail, fail, failed, total, authoritative: true };
  }
  // 崩在 finish() 之前：退回数行，至少报得出"跑了多少、错了多少"
  return { pass: linePass, fail: failed.length, failed, total: linePass + failed.length, authoritative: false };
}

/** 跑一个子脚本，返回 { ok, pass, fail, failed, ms, crashed, missing, note } */
function runSuite(script, args = [], label = "", role = "") {
  const abs = join(TOOLS, script);
  if (!existsSync(abs)) {
    return { name: script, label, role, ok: false, pass: 0, fail: 0, failed: [], ms: 0, missing: true, crashed: false, note: "文件不存在，已跳过" };
  }
  const t0 = Date.now();
  let out = "";
  let crashed = false;
  let note = "";
  try {
    out = execFileSync(INTERP, [abs, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    // 非零退出 = 套件自己判了红；崩溃也是"响"，同样算失败
    out = (e.stdout || "") + (e.stderr || "");
    if (e.status == null) { crashed = true; note = "进程异常终止（崩溃）"; }
  }
  const ms = Date.now() - t0;
  const p = parse(out);
  if (VERBOSE) {
    console.log(`\n──────── ${script} 原始输出 ────────`);
    console.log(out);
  }
  // 崩在 finish() 之前 ⇒ 拿不到权威汇总行，且一项检查都没跑出来
  if (!p.authoritative && p.total === 0 && !note) { crashed = true; note = "没有产出任何检查项"; }
  return {
    // 体检模块是自举跑的（--module=），报模块名而不是本文件的名字
    name: args[0]?.startsWith("--module=") ? args[0].slice("--module=".length) : script,
    label, role, ms, failed: p.failed, crashed, note,
    pass: p.pass, fail: p.fail,
    ok: !crashed && p.fail === 0 && p.total > 0,
  };
}

/** 自举模式：--module=<audit-xxx> 时，本进程只跑那一个体检模块 */
async function runOneModule(moduleFile) {
  const { finish } = await import("./harness.mjs");
  const { ctx } = await import("./audit-ctx.mjs");
  const mod = await import(new URL("./" + moduleFile, import.meta.url).href);
  if (typeof mod.default !== "function") {
    console.log(`  ❌ ${moduleFile} 未导出 default async function (ctx)`);
    process.exitCode = 1;
    return;
  }
  await mod.default(ctx);
  finish();
}

// ------------------------------------------------------------
//  主流程
// ------------------------------------------------------------
const moduleArg = process.argv.find((s) => s.startsWith("--module="));
if (moduleArg) {
  await runOneModule(moduleArg.slice("--module=".length).trim());
} else {
  // 1) 固定的两个整包套件
  const suites = [
    runSuite("autotest.mjs", [], "autotest", "聚合断言（慢·条数少）"),
    runSuite("audit.mjs", [], "audit", "逐项深度体检（快·条数多）"),
  ];

  // 2) 并行创建中的 audit-<域>.mjs：存在才跑，不存在静默跳过
  const mods = existsSync(TOOLS)
    ? readdirSync(TOOLS)
        .filter((f) => /^audit-.+\.mjs$/.test(f) && f !== "audit-ctx.mjs")
        .sort()
    : [];
  for (const m of mods) {
    suites.push(runSuite("test-all.mjs", [`--module=${m}`], m.replace(/\.mjs$/, ""), "体检模块"));
  }

  // ---------------- 总表 ----------------
  const HEAD = ["套件", "分工", "通过", "失败", "合计", "耗时", "结论"];
  const rows = suites.map((s) => {
    const verdict = s.missing ? "跳过" : s.crashed ? "崩溃" : s.fail > 0 ? "失败" : "通过";
    return [s.label, s.role, String(s.pass), String(s.fail), String(s.pass + s.fail), (s.ms / 1000).toFixed(1) + "s", verdict];
  });

  const W = HEAD.map((h, i) => Math.max(dw(h), ...rows.map((r) => dw(r[i]))));
  const line = (cells) => "│ " + cells.map((c, i) => pad(c, W[i])).join(" │ ") + " │";
  const rule = "├" + W.map((w) => "─".repeat(w + 2)).join("┼") + "┤";

  console.log("\n════════ 一键测试总表 ════════");
  console.log(line(HEAD));
  console.log(rule);
  for (const r of rows) console.log(line(r));

  const ran = suites.filter((s) => !s.missing);
  const bad = ran.filter((s) => !s.ok);
  const tp = ran.reduce((a, s) => a + s.pass, 0);
  const tf = ran.reduce((a, s) => a + s.fail, 0);
  const tms = ran.reduce((a, s) => a + s.ms, 0);

  console.log(rule);
  console.log(`合计 ${tp} 项通过 · ${tf} 项失败 · ${(tms / 1000).toFixed(1)}s · ${ran.length} 个套件`);
  if (!mods.length) {
    console.log("体检模块：暂无 tools/audit-<域>.mjs（共享上下文 audit-ctx.mjs 恒不单独执行）");
  } else {
    console.log(`体检模块：${mods.length} 个（${mods.map((m) => m.replace(/\.mjs$/, "")).join(" / ")}）`);
  }
  if (skippedNote(mods)) console.log(skippedNote(mods));

  // 失败明细：只列失败断言，避免刷屏
  for (const s of bad) {
    const head = s.missing ? "跳过" : s.crashed ? "崩溃" : `${s.fail} 项失败`;
    console.log(`\n❌ ${s.name} —— ${head}${s.note ? "（" + s.note + "）" : ""}`);
    for (const f of s.failed.slice(0, 12)) console.log("   " + f);
    if (s.failed.length > 12) console.log(`   …… 另有 ${s.failed.length - 12} 项`);
    if (s.crashed) console.log("   （没跑到收尾输出，建议直接单独跑这个套件看报错）");
  }

  console.log(`\n${bad.length ? "❌" : "✅"} ${bad.length ? bad.length + " 个套件未全绿" : "全部套件全绿"}`);
  process.exitCode = bad.length ? 1 : 0;
}

function skippedNote(mods) {
  return mods.length ? null : "（audit-<域>.mjs 尚未创建，本次只跑整包套件；文件出现后会自动纳入总表）";
}