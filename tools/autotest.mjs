#!/usr/bin/env node
// ============================================================
//  无头自动测试（不需要浏览器）
//    · 把 DOM / Canvas / localStorage 打桩后加载全部模块
//    · 全油门自动试跑 20 关，验证可通关
//    · 验证物理与刷新率无关、落地分级、空翻可达、AI 速度比、坡度精度等
//  用法：
//    node tools/autotest.mjs            # 跑全部测试
//    node tools/autotest.mjs --modules  # 只检查模块能否加载
// ============================================================
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ONLY_MODULES = process.argv.includes("--modules");
const DIAG = (() => {
  const a = process.argv.find((s) => s.startsWith("--diag="));
  return a ? Number(a.split("=")[1]) : -1;
})();
/** --levels：只跑"20 关可通关"并按紧凑格式输出（改地形难度后快速回归用） */
const ONLY_LEVELS = process.argv.includes("--levels");

// ------------------------------------------------------------
// 1. 浏览器环境打桩
// ------------------------------------------------------------
const noop = () => {};

/** Canvas 2D 上下文桩：任何方法都是空操作，渐变返回带 addColorStop 的对象 */
function makeCtx() {
  const target = {
    canvas: { width: 0, height: 0 },
    globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1,
    lineCap: "", lineJoin: "", font: "", textAlign: "", textBaseline: "",
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") {
          return { addColorStop: noop };
        }
        if (k === "measureText") return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

function makeEl(id) {
  return {
    id,
    style: {},
    dataset: {},
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    complete: true,
    naturalWidth: 1,
    children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) {
        if (on === undefined) this._s.has(c) ? this._s.delete(c) : this._s.add(c);
        else if (on) this._s.add(c);
        else this._s.delete(c);
      },
      contains(c) { return this._s.has(c); },
    },
    addEventListener: noop,
    removeEventListener: noop,
    insertBefore: noop,
    appendChild: noop,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => makeCtx(),
  };
}

const elCache = new Map();
const getEl = (id) => {
  if (!elCache.has(id)) elCache.set(id, makeEl(id));
  return elCache.get(id);
};

const winListeners = new Map();
globalThis.document = {
  getElementById: getEl,
  querySelector: (sel) => getEl("__sel" + sel),
  querySelectorAll: () => [],
  createElement: (tag) => makeEl("__new_" + tag),
  addEventListener: noop,
  documentElement: makeEl("__html"),
  body: makeEl("__body"),
  fullscreenElement: null,
  exitFullscreen: noop,
};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener: (type, fn) => {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  },
  removeEventListener: noop,
};
const defineGlobal = (name, value) => {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch (e) {
    globalThis[name] = value;
  }
};

defineGlobal("navigator", { maxTouchPoints: 0 });
defineGlobal("CanvasRenderingContext2D", class {});
defineGlobal("requestAnimationFrame", noop);
// 屏蔽所有定时器，避免测试被异步结算打断
defineGlobal("setTimeout", () => 0);
defineGlobal("clearTimeout", noop);

const memStore = new Map();
defineGlobal("localStorage", {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
  clear: () => memStore.clear(),
});

const dispatchWin = (type, ev) => {
  for (const fn of winListeners.get(type) || []) fn(ev);
};

// ------------------------------------------------------------
// 2. 极简断言框架
// ------------------------------------------------------------
const results = [];
let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures++;
  results.push(`${ok ? "  ✅" : "  ❌"} ${name}${detail ? "  → " + detail : ""}`);
  return ok;
}
function section(t) {
  results.push(`\n──────── ${t} ────────`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------
// 3. 加载全部模块（模块清单检查）
// ------------------------------------------------------------
const MODULE_LIST = [
  "config/constants.js", "config/themes.js", "config/vehicles.js", "config/levels.js",
  "core/utils.js", "core/canvas.js", "core/store.js", "core/audio.js", "core/storage.js",
  "core/input.js", "core/loop.js", "core/toast.js",
  "physics/terrain.js", "physics/bike.js", "physics/fuel.js",
  "game/progress.js", "game/stats.js", "game/world.js", "game/race.js", "game/game.js",
  "render/particles.js", "render/camera.js", "render/background.js", "render/terrain.js",
  "render/bike.js", "render/entities.js", "render/hud.js", "render/scene.js",
  "ui/menu.js", "ui/panels.js", "ui/shop.js", "ui/donate.js",
  "main.js",
];

section("模块加载");
let loaded = 0;
for (const f of MODULE_LIST) {
  try {
    await import(new URL("../src/" + f, import.meta.url).href);
    loaded++;
  } catch (e) {
    check("加载 " + f, false, e.message);
  }
}
check(`全部 ${MODULE_LIST.length} 个模块可加载`, loaded === MODULE_LIST.length, `成功 ${loaded}/${MODULE_LIST.length}`);

if (ONLY_MODULES) {
  console.log(results.join("\n"));
  process.exitCode = failures ? 1 : 0;
} else {
  // ----------------------------------------------------------
  // 4. 功能测试
  // ----------------------------------------------------------
  const { store, bike, world } = await import(new URL("../src/core/store.js", import.meta.url).href);
  const { key } = await import(new URL("../src/core/input.js", import.meta.url).href);
  const { LEVELS } = await import(new URL("../src/config/levels.js", import.meta.url).href);
  const { Stepper } = await import(new URL("../src/core/loop.js", import.meta.url).href);
  const { groundInfo, groundY } = await import(new URL("../src/physics/terrain.js", import.meta.url).href);
  const { stepPhysics, resetBike, rotateBikeAround } = await import(new URL("../src/physics/bike.js", import.meta.url).href);
  const { updateStats } = await import(new URL("../src/game/stats.js", import.meta.url).href);
  const { startGame, update } = await import(new URL("../src/game/game.js", import.meta.url).href);
  const { SUBV, SUB_DT, DT, toM } = await import(
    new URL("../src/config/constants.js", import.meta.url).href
  );
  const { hasAch } = await import(new URL("../src/game/progress.js", import.meta.url).href);
  const { save, loadSave, loadAchList, getUp } = await import(new URL("../src/core/storage.js", import.meta.url).href);

  const midX = () => (bike.rear.x + bike.front.x) / 2;
  const mx_of = () => (bike.rear.x + bike.front.x) / 2;

  /**
   * 自动骑手策略：全油门 + 空中姿态修正
   *  · 贴地：按住加速
   *  · 腾空：用左右键把车身姿态往水平修（避免全程按键翻车导致无限摔车）
   * 这是"合理玩家"的下限，用来验证关卡本身可通关，而不是考验 AI 会不会玩。
   */
  function autoInput() {
    // 起步：锁定时必须按键才会解锁
    if (bike.locked) {
      key.right = true;
      key.left = false;
      return;
    }
    const ang = Math.atan2(bike.front.y - bike.rear.y, bike.front.x - bike.rear.x);
    if (bike.grounded === 0) {
      key.right = ang < -0.05;
      key.left = ang > 0.05;
    } else {
      key.right = true;
      key.left = false;
    }
  }

  /** 设定整车瞬时速度（px/s） */
  function setVelocity(vx, vy) {
    for (const p of [bike.rear, bike.front, bike.head]) {
      p.px = p.x - vx * SUB_DT;
      p.py = p.y - vy * SUB_DT;
    }
  }

  // ---------------- 20 关自动试跑 ----------------
  section("20 关全油门自动试跑");
  const CAP_SECONDS = 150;
  const levelReport = [];
  const levelTimes = [];
  const levelFail = [];
  for (let i = 0; i < LEVELS.length; i++) {
    startGame("level", i);
    let t = 0;
    let done = false;
    let nan = false;
    while (t < CAP_SECONDS && !done) {
      autoInput();
      update(DT);
      t += DT;
      const mx = midX();
      if (!isFinite(mx) || !isFinite(bike.rear.y)) { nan = true; break; }
      if (mx > store.finishX) done = true;
      if (store.state !== "play") break;
    }
    const L = LEVELS[i];
    levelTimes.push(t);
    if (!done || nan) levelFail.push(i + 1);
    levelReport.push(
      `第${String(i + 1).padStart(2)}关 ${L.name.padEnd(4)} ${done ? "✅" : "❌"} ${t.toFixed(1)}s 坡度${Math.round(L.maxSlope)}°`
    );
    if (!ONLY_LEVELS) check(`第${i + 1}关可通关`, done && !nan, `${t.toFixed(1)}s${nan ? " (NaN!)" : ""}`);
  }
  if (ONLY_LEVELS) {
    console.log(
      `20 关自动试跑：通过 ${LEVELS.length - levelFail.length}/${LEVELS.length}` +
        (levelFail.length ? `\n未通过：第 ${levelFail.join(", ")} 关` : "") +
        `\n用时(s)：${levelTimes.map((x) => x.toFixed(0)).join(" ")}`
    );
    process.exit(levelFail.length ? 1 : 0);
  }
  results.push("  ── 逐关用时 ──");
  for (const r of levelReport) results.push("    " + r);

  // ---------------- 单关诊断（--diag=<关卡序号，0 起>）：排查卡死/摔车分布用 ----------------
  if (DIAG >= 0) {
    startGame("level", DIAG);
    const L = LEVELS[DIAG];
    results.push(
      `
──── 诊断：第${DIAG + 1}关 ${L.name} · 主题${L.theme} · 重力${store.phys.GRAV} · MAXV=${store.phys.MAXV.toFixed(0)} · DRIVE=${store.phys.DRIVE.toFixed(0)} ────`
    );
    let line = "    坡度剖面(°): ";
    for (let x = 0; x <= L.len; x += Math.max(400, Math.round(L.len / 24))) {
      line += `${x}:${((Math.atan(groundInfo(x).m) * 180) / Math.PI).toFixed(0)} `;
    }
    results.push(line);

    let t = 0;
    let nextLog = 0;
    let crashes = 0;
    let airSteps = 0;
    let lastCrashed = false;
    while (t < 300) {
      autoInput();
      update(DT);
      t += DT;
      if (bike.grounded === 0) airSteps++;
      if (store.run.crashed && !lastCrashed) crashes++;
      lastCrashed = store.run.crashed;
      if (t >= nextLog) {
        nextLog += 5;
        const mx = midX();
        results.push(
          `    t=${t.toFixed(0)}s x=${mx.toFixed(0)}/${L.len} 速度=${bike.speed.toFixed(0)} 坡度=${((Math.atan(groundInfo(mx).m) * 180) / Math.PI).toFixed(0)}° 摔车=${crashes} 空中占比=${((airSteps / (t * 60)) * 100).toFixed(0)}%`
        );
      }
      if (midX() > store.finishX) {
        results.push(`    ✅ 到达 t=${t.toFixed(1)}s 摔车${crashes}次`);
        break;
      }
    }
    console.log(results.join("\n"));
    process.exit(0);
  }

  // ---------------- 帧率无关 ----------------
  section("帧率无关（物理/油耗/计时）");
  function runFixed(steps, dtPerCall) {
    startGame("level", 0);
    key.right = true;
    let acc = 0;
    let t = 0;
    let done = 0;
    const stepper = new Stepper((dt) => update(dt));
    while (done < steps) {
      stepper.advance(dtPerCall);
      acc += dtPerCall;
      t += dtPerCall;
      done += stepper.lastSteps;
    }
    return { x: midX(), fuel: store.phys.fuel, simTime: store.time, consumed: t, steps: done };
  }
  const r60 = runFixed(1200, 1 / 60);
  const r120 = runFixed(1200, 1 / 120);
  const r144 = runFixed(1200, 1 / 144);
  const dpx = (a, b) => Math.abs(a.x - b.x);
  check("1/60 与 1/120 同帧数位移一致", dpx(r60, r120) < 1, `Δ=${dpx(r60, r120).toFixed(4)}px`);
  check("1/60 与 1/144 同帧数位移一致", dpx(r60, r144) < 1, `Δ=${dpx(r60, r144).toFixed(4)}px`);
  check("油耗与帧率无关", near(r60.fuel, r144.fuel, 1e-9), `Δ=${Math.abs(r60.fuel - r144.fuel).toExponential(2)}`);
  check(
    "20 秒（1200 步）实际消耗时间一致",
    near(r60.consumed, 20, 0.02) && near(r120.consumed, 20, 0.02) && near(r144.consumed, 20, 0.02),
    `${r60.consumed.toFixed(3)}s / ${r120.consumed.toFixed(3)}s / ${r144.consumed.toFixed(3)}s`
  );

  // ---------------- 落地分级 ----------------
  section("落地冲击分级");
  function dropTest(vy) {
    startGame("level", 0);
    key.right = false;
    const x = 220;
    resetBike(x);
    const lift = 160;
    for (const p of [bike.rear, bike.front, bike.head]) p.y -= lift;
    setVelocity(0, vy);
    let guard = 0;
    let prevRot = 0;
    while (guard++ < 600) {
      prevRot = bike.rotAcc;
      stepPhysics();
      if (bike.grounded > 0) break;
    }
    return { squash: Math.abs(bike.squashVel), shake: store.cam.shake, rot: prevRot, guard };
  }
  const d200 = dropTest(200);
  const d400 = dropTest(400);
  const d600 = dropTest(600);
  check(
    "落地压缩量随冲击单调递增",
    d200.squash < d400.squash && d400.squash < d600.squash,
    `${d200.squash.toFixed(2)} < ${d400.squash.toFixed(2)} < ${d600.squash.toFixed(2)}`
  );
  check(
    "落地震屏随冲击单调递增",
    d200.shake <= d400.shake && d400.shake <= d600.shake,
    `${d200.shake.toFixed(2)} / ${d400.shake.toFixed(2)} / ${d600.shake.toFixed(2)}`
  );

  // ---------------- 空翻可达性 ----------------
  section("空翻可达性（≥0.9s 滞空）");
  startGame("level", 0);
  key.right = true;
  key.left = false;
  {
    const x = 220;
    resetBike(x);
    const lift = 500; // 自由落体 500px ≈ 1.15s 滞空
    for (const p of [bike.rear, bike.front, bike.head]) p.y -= lift;
    setVelocity(0, 0);
    let guard = 0;
    let lastRot = 0;
    let air = 0;
    let landed = false;
    while (guard++ < 3000) {
      lastRot = bike.rotAcc;
      const wasAir = bike.grounded === 0;
      stepPhysics();
      if (wasAir) air += DT;
      if (bike.grounded > 0) { landed = true; break; }
    }
    const flips = Math.abs(lastRot) / (2 * Math.PI);
    check("滞空 ≥0.9s", air >= 0.9, air.toFixed(2) + "s");
    check("按住方向键可完成 ≥1 圈空翻", landed && flips >= 1, flips.toFixed(2) + " 圈");
  }

  // ---------------- 倒立落地必须摔车（刚体保护不能误放行） ----------------
  section("倒立落地判定");
  {
    startGame("level", 0);
    key.right = false;
    key.left = false;
    resetBike(300);
    const mx = (bike.rear.x + bike.front.x) / 2;
    const my = (bike.rear.y + bike.front.y) / 2;
    rotateBikeAround(mx, my, (160 * Math.PI) / 180);
    for (const p of [bike.rear, bike.front, bike.head]) p.y -= 220;
    setVelocity(0, 0);
    let guard = 0;
    while (guard++ < 900 && !store.run.crashed) stepPhysics();
    check("空中倒立落地会摔车", store.run.crashed === true, store.run.crashed ? "已摔车" : "未摔车（刚体保护可能误放行）");
  }

  // ---------------- 翘头里程单位 ----------------
  section("翘头里程单位（100px = 1m）");
  {
    startGame("level", 0);
    key.right = false;
    resetBike(300);
    bike.speed = 400; // px/s
    bike.grounded = 2;
    const gy = groundY(300);
    bike.front.y = gy - 120; // 前轮离地
    for (let i = 0; i < 120; i++) {
      bike.speed = 400;
      bike.grounded = 2;
      bike.front.y = gy - 120;
      updateStats(DT);
    }
    const meters = toM(store.run.maxWheelieDist);
    check("翘头 2s @400px/s ≈ 8m", near(meters, 8, 1), meters.toFixed(2) + "m");
  }

  // ---------------- AI 速度比 ----------------
  section("比赛 AI 速度");
  {
    startGame("race", 0);
    let t = 0;
    let playerTime = 0;
    let aiTime = 0;
    while (t < 300 && (!playerTime || !aiTime)) {
      autoInput();
      update(DT);
      t += DT;
      if (!playerTime && midX() > store.finishX) playerTime = t;
      if (!aiTime && store.raceAI && store.raceAI.finish) aiTime = t;
    }
    const ratio = aiTime > 0 ? playerTime / aiTime : 0;
    check("AI 与玩家速度同量级（0.85~1.15）", ratio > 0.85 && ratio < 1.15,
      `玩家 ${playerTime.toFixed(1)}s / AI ${aiTime.toFixed(1)}s → 比值 ${ratio.toFixed(3)}`);
  }

  // ---------------- 下坡超速（真实跑一段，看峰值是否超过平路极速） ----------------
  section("下坡超速");
  {
    startGame("level", LEVELS.length - 1);
    let maxSpd = 0;
    let t = 0;
    while (t < 60 && store.state === "play") {
      autoInput();
      update(DT);
      t += DT;
      if (!store.run.crashed) maxSpd = Math.max(maxSpd, Math.abs(bike.speed));
    }
    const MAXV = store.phys.MAXV;
    results.push(`    平路极速 MAXV=${MAXV.toFixed(0)}px/s，第20关全程峰值=${maxSpd.toFixed(0)}px/s`);
    check("下坡可超过平路极速", maxSpd > MAXV * 1.02,
      `峰值 ${(maxSpd / MAXV).toFixed(2)}×MAXV`);
    check("但不超过 1.35×MAXV", maxSpd <= MAXV * 1.36,
      `${(maxSpd / MAXV).toFixed(3)}×`);
  }

  // ---------------- 坡度显示精度 ----------------
  section("坡度显示精度");
  {
    let worst = 0;
    for (const L of LEVELS) {
      let mx = 0;
      for (let x = 70; x <= L.len; x += 5) {
        const m = Math.abs(groundInfo0(L, x));
        if (m > mx) mx = m;
      }
      const real = (Math.atan(mx) * 180) / Math.PI;
      worst = Math.max(worst, Math.abs(real - L.maxSlope));
    }
    check("面板坡度与实际采样偏差 ≤3°", worst <= 3, `最大偏差 ${worst.toFixed(2)}°`);
  }

  // ---------------- 装饰生成 ----------------
  section("场景装饰");
  {
    let minDeco = Infinity;
    for (let i = 0; i < LEVELS.length; i++) {
      startGame("level", i);
      const n = world.decoTree.length + world.decoRock.length;
      minDeco = Math.min(minDeco, n);
    }
    check("每关都有装饰物生成", minDeco > 0, `最少 ${minDeco} 个`);
    startGame("free");
    for (let i = 0; i < 300; i++) {
      autoInput();
      update(DT);
    }
    check("无限模式也有装饰物", world.decoTree.length + world.decoRock.length > 0,
      `${world.decoTree.length + world.decoRock.length} 个`);
  }

  // ---------------- 存档兼容 ----------------
  section("存档兼容");
  {
    save();
    const need = ["bike_gold", "bike_up", "bike_unlocked", "bike_stars", "bike_veh", "bike_owned", "bike_mute", "bike_best"];
    const missing = need.filter((k) => localStorage.getItem(k) === null);
    check("localStorage 键名与历史版本一致", missing.length === 0, missing.join(",") || "全部存在");

    // 旧格式（全局单一升级）存档迁移
    localStorage.setItem("bike_up", JSON.stringify({ engine: 3, tire: 2, frame: 1, susp: 4 }));
    localStorage.setItem("bike_veh", "0");
    localStorage.setItem("bike_gold", "100");
    localStorage.setItem("bike_v", "2");
    localStorage.removeItem("bike_ach");
    loadSave();
    const up = getUp();
    check(
      "旧格式存档可迁移为按车存储",
      up.engine === 3 && up.tire === 2 && up.frame === 1 && up.susp === 4 && store.gold === 100,
      JSON.stringify(up) + " gold=" + store.gold
    );
    loadAchList();
  }

  // ---------------- 无限模式结算 ----------------
  section("无限模式");
  {
    startGame("free");
    for (let i = 0; i < 90; i++) {
      autoInput();
      update(DT);
    }
    store.phys.fuel = 0.0001; // 强制瞬间耗尽
    autoInput();
    update(DT);
    check(
      "燃料耗尽后结算并记录最佳里程",
      store.state === "ended" && store.best > 0,
      `state=${store.state} best=${store.best}m`
    );
  }

  // ---------------- 达成度：解锁与星级 ----------------
  section("进度写入");
  check("打通后解锁到最后一关", store.unlocked >= 18, "unlocked=" + store.unlocked);
  check("20 关星级已写入", store.stars.filter((s) => s > 0).length === 20, store.stars.join(""));

  // ---------------- 输入：T 已移除 / R 可用 ----------------
  section("输入行为");
  {
    const srcInput = readFileSync(join(ROOT, "src", "core", "input.js"), "utf8");
    check("作弊键 T 已移除", !srcInput.includes("KeyT"), "input.js 中无 KeyT");
    const { initInput } = await import(new URL("../src/core/input.js", import.meta.url).href);
    let pauses = 0;
    let restarts = 0;
    initInput({ restart: () => restarts++, togglePause: () => pauses++ });
    startGame("level", 0);
    dispatchWin("keydown", { code: "KeyP", preventDefault: noop });
    check("P 可暂停", pauses > 0, "togglePause 调用 " + pauses + " 次");
    const before = store.state;
    dispatchWin("keydown", { code: "KeyT", preventDefault: noop });
    check("按 T 不改变游戏状态", store.state === before && before === "pause");
    dispatchWin("keydown", { code: "KeyR", preventDefault: noop });
    check("暂停时 R 可重开", restarts > 0 && store.state === "play", "restart 调用 " + restarts + " 次");
  }

  // ---------------- 静态检查（死代码 / 裸换算 / 导入导出一致） ----------------
  section("静态检查");
  {
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = dir + "/" + e.name;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith(".js")) files.push(rel);
      }
    };
    walk("src");

    // 1) 死代码 / 历史遗留常量
    const banned = ["SUS_K", "SUS_C", "SUS_MAX", "SEP_V", "ROLL_DRAG", "MAXV_CAP", "bike.impact", "freeFeat", "freeCum", "bikeAngle", "bike_impact"];
    const bannedHits = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const b of banned) if (src.includes(b)) bannedHits.push(f + ":" + b);
    }
    check("无历史遗留死代码", bannedHits.length === 0, bannedHits.join(",") || "无");

    // 2) 半标度裸换算（*SUB / /SUB）只允许出现在 constants.js；注释里的提及不算
    const naked = [];
    for (const f of files) {
      if (f === "src/config/constants.js") continue;
      const raw = readFileSync(join(ROOT, f), "utf8");
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      const m = src.match(/\*\s*SUB\b|\/\s*SUB\b/g);
      if (m) naked.push(f + "(" + m.join(" ") + ")");
    }
    check("无裸半标度换算（*SUB / /SUB，*SUBV 合法）", naked.length === 0, naked.join(", ") || "无");

    // 3) import 的名字在目标模块里确实有 export（防拼写/改名残漏）
    const missing = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), "utf8");
      const dir = f.slice(0, f.lastIndexOf("/"));
      const re = /import\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(src))) {
        const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        let target = m[2];
        if (!target.startsWith(".")) continue;
        target = join(ROOT, dir, target).replace(/\\/g, "/");
        let ts;
        try {
          ts = readFileSync(target, "utf8");
        } catch (e) {
          missing.push(f + " → " + m[2] + "(文件不存在)");
          continue;
        }
        for (const n of names) {
          const re2 = new RegExp(
            "export\\s+(?:const|let|var|function|class)\\s+" + n + "\\b|export\\s*\\{[^}]*\\b" + n + "\\b"
          );
          if (!re2.test(ts)) missing.push(f + " → " + n);
        }
      }
    }
    check("import/export 完全对应", missing.length === 0, missing.slice(0, 6).join(", ") || "无");

    // 4) index.html 保持轻量：无内联样式/脚本/onclick
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const lines = html.split("\n").length;
    check("index.html ≤ 200 行", lines <= 200, lines + " 行");
    check("index.html 无 <style> 块", !/<style[\s>]/.test(html));
    check("index.html 无内联 onclick", !/onclick\s*=/.test(html));
    check("模块入口正确", /<script type="module" src="src\/main\.js"><\/script>/.test(html));

    // 5) 打赏二维码已移至 assets/ 且被引用
    check("二维码路径为 assets/qr.png", html.includes('src="assets/qr.png"'));
    check("assets/qr.png 存在", existsSync(join(ROOT, "assets/qr.png")));
    check("旧版 qr.png 已移除", !existsSync(join(ROOT, "qr.png")));
  }

  // ----------------------------------------------------------
  console.log(results.join("\n"));
  console.log(`\n${failures ? "❌" : "✅"} 共 ${results.filter((r) => r.startsWith("  ")).length} 项检查，失败 ${failures} 项`);
  process.exitCode = failures ? 1 : 0;
}

// 测试内部用的坡度辅助（基于纯地形函数，避免依赖当前 lvIdx）
function groundInfo0(L, x) {
  const h = (xx) => {
    let y = 300;
    let relief = 0;
    for (const w of L.waves) relief += w.amp * Math.sin(xx * w.f + w.ph);
    for (const s of L.steps) {
      if (xx > s.cx) {
        const t = Math.min(1, Math.max(0, (xx - s.cx) / 150));
        relief += s.drop * (t * t * (3 - 2 * t));
      }
    }
    return y + relief * Math.min(1, Math.max(0, (xx - 60) / 520));
  };
  return (h(x + 2) - h(x - 2)) / 4;
}
