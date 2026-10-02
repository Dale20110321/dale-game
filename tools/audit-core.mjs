// ============================================================
//  核心运行时深度体检（src/core/**）
//  契约：export default async function (ctx)
//    ctx.check(name, cond, detail) - 断言
//    ctx.section(title)             - 分区
//    ctx.imp(relativePath)          - 按 src/ 相对路径动态导入
//  本文件不 import 任何 harness。
//
//  覆盖：Stepper 固定步长累加器 / canvas·DPR / input 键鼠触摸全屏 /
//        toast 四型分级与排队 / audio 合成与降级 / store 初值与结构 /
//        utils 边界与代数性质。
//
//  ⚠ harness 的三个已知打桩（决定本文件所有取巧手法）：
//    1) globalThis.setTimeout 被换成 () => 0（永不回调）→ toast 延时、音效
//       叠音**不能靠等待验证**，必须自行劫持 setTimeout 抓回调；
//    2) harness 的 dispatchWin 未导出到 ctx → window 监听器靠**临时替换
//       globalThis.window.addEventListener 为收集器**再调用 initInput 取得；
//    3) document.querySelectorAll 恒返回 [] → .tbtn[data-k] 绑定需临时
//       伪造按钮列表，否则那 6 个监听器一条都装不上。
//  所有替换在各自小节结束时原样还原，并额外做"还原后行为复原"的自检。
// ============================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";

export default async function (ctx) {
  const {
    check, section, imp, store, bike, world, key, view,
  } = ctx;

  // ---------------- 常用断言助手（全部对异常免疫） ----------------
  const S = (t) => ctx.section(t);
  const T = (name, cond, detail = "") => {
    try {
      return ctx.check(name, !!cond, detail);
    } catch (e) {
      return ctx.check(name, false, `抛错：${(e && e.message) || String(e)}`);
    }
  };
  /** 跑一段可能抛异常的代码，返回错误串（不抛） */
  const attempt = (fn) => {
    try { fn(); return null; } catch (e) { return (e && e.message) || String(e); }
  };
  const isFinite_ = (v) => typeof v === "number" && Number.isFinite(v);
  const near = (a, b, tol) => isFinite_(a) && isFinite_(b) && Math.abs(a - b) <= tol;
  /** 千分位，便于 detail 读数 */
  const num = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toPrecision(10)) : String(v));
  const j = (a) => JSON.stringify(a);

  // ---------------- 载入被测模块 ----------------
  const utilsM = await imp("core/utils.js");
  const loopM = await imp("core/loop.js");
  const canvasM = await imp("core/canvas.js");
  const storeM = await imp("core/store.js");
  const inputM = await imp("core/input.js");
  const toastM = await imp("core/toast.js");
  const audioM = await imp("core/audio.js");
  const constM = await imp("config/constants.js");
  const { clamp, lerp, mulberry32, wrapAngle, installRoundRect } = utilsM;
  const { Stepper, startRaf } = loopM;
  const DT = constM.DT;
  const VEHICLES = (await imp("config/vehicles.js")).VEHICLES;
  /** 0 级山地车的真实可达极速（MAXV 的基线，见 constants.topSpeedOf） */
  const ZERO_MAXV = constM.topSpeedOf(VEHICLES[0], { engine: 0, tire: 0, frame: 0, susp: 0 });

  const win = globalThis.window;
  const cv = canvasM.cv; // canvas 的 DOM 桩（小节间复用）

  // ★ 在任何自测动手之前抓一份"出厂快照"，用于证明本文件不污染全局状态
  const PRISTINE = {
    store: j({ ...store, cam: { ...store.cam }, run: { ...store.run } }),
    worldLen: Object.keys(world).map((k) => (Array.isArray(world[k]) ? world[k].length : world[k])),
    key: { ...key },
    view: [view.W, view.H, view.DPR],
    winWH: [win.innerWidth, win.innerHeight, win.devicePixelRatio],
  };

  // ================================================================
  //  1. utils —— 边界与代数性质
  // ================================================================
  S("utils：clamp / lerp");
  {
    // clamp：值域 / 单调 / 端点
    T("clamp 区间内取原值", clamp(2, 0, 3) === 2, num(clamp(2, 0, 3)));
    T("clamp 上界收敛", clamp(5, 0, 3) === 3, num(clamp(5, 0, 3)));
    T("clamp 下界收敛", clamp(-5, 0, 3) === 0, num(clamp(-5, 0, 3)));
    T("clamp 上界端点自身", clamp(3, 0, 3) === 3);
    T("clamp 下界端点自身", clamp(0, 0, 3) === 0);
    T("clamp 负区间", clamp(-2, -5, -1) === -2, num(clamp(-2, -5, -1)));
    T("clamp 负区间上界", clamp(0, -5, -1) === -1, num(clamp(0, -5, -1)));
    T("clamp 退化区间 a===b", clamp(99, 7, 7) === 7, num(clamp(99, 7, 7)));
    T("clamp 退化区间负", clamp(-99, 7, 7) === 7, num(clamp(-99, 7, 7)));
    T("clamp 不改 ±Infinity（上）", clamp(Infinity, 0, 3) === 3, num(clamp(Infinity, 0, 3)));
    T("clamp 不改 -Infinity", clamp(-Infinity, 0, 3) === 0, num(clamp(-Infinity, 0, 3)));
    T("clamp 恒等（v 恰在界上）", clamp(0, 0, 3) === 0 && clamp(3, 0, 3) === 3);
    // clamp 单调性：对 v 非降
    {
      let mono = true;
      for (let a = 0; a < 200; a++) {
        let prev = -Infinity;
        for (let k = 0; k <= 40; k++) {
          const v = -10 + k * 0.5;
          const c = clamp(v, 0, 3);
          if (c < prev) mono = false;
          prev = c;
        }
      }
      T("clamp 对入参单调非降（200×41 采样）", mono);
    }
    // clamp 幂等（在值域内再夹一次不变）
    {
      let idem = true;
      for (const [v, a, b] of [[2, 0, 3], [0, 0, 3], [3, 0, 3], [-9, -4, 9], [1e9, 0, 1]]) {
        if (clamp(clamp(v, a, b), a, b) !== clamp(v, a, b)) idem = false;
      }
      T("clamp 幂等", idem);
    }

    // lerp：端点 / 交换 / 线性 / 外推
    T("lerp t=0 → a", lerp(3, 11, 0) === 3, num(lerp(3, 11, 0)));
    T("lerp t=1 → b", lerp(3, 11, 1) === 11, num(lerp(3, 11, 1)));
    T("lerp t=0.5 → 中点", near(lerp(0, 10, 0.5), 5, 0), num(lerp(0, 10, 0.5)));
    T("lerp 负区间中点", near(lerp(-10, 10, 0.5), 0, 0), num(lerp(-10, 10, 0.5)));
    T("lerp a===b 恒定", lerp(7, 7, 0.37) === 7, num(lerp(7, 7, 0.37)));
    T("lerp t=2 外推", lerp(0, 10, 2) === 20, num(lerp(0, 10, 2)));
    T("lerp t=-1 外推", lerp(0, 10, -1) === -10, num(lerp(0, 10, -1)));
    T("lerp 对称 t↔1-t", near(lerp(2, 5, 0.3), lerp(5, 2, 0.7), 1e-12), `${num(lerp(2, 5, 0.3))} vs ${num(lerp(5, 2, 0.7))}`);
    T("lerp 线性（t=0.25 四分之三）", near(lerp(0, 8, 0.25), 2, 0), num(lerp(0, 8, 0.25)));
    T("lerp 公式一致（a+(b-a)t）", (() => { let ok = true; for (let k = 0; k <= 100; k++) { const t = k / 100; if (lerp(-3, 8, t) !== -3 + 11 * t) ok = false; } return ok; })());
    T("lerp 对 t 单调（b>a）", (() => { let m = true; for (let k = 1; k <= 100; k++) if (lerp(0, 1, k / 100) < lerp(0, 1, (k - 1) / 100)) m = false; return m; })());
    T("lerp 对 t 单调（b<a 反向）", (() => { let m = true; for (let k = 1; k <= 100; k++) if (lerp(0, -1, k / 100) > lerp(0, -1, (k - 1) / 100)) m = false; return m; })());
    T("lerp t=NaN 传播为 NaN", Number.isNaN(lerp(0, 1, NaN)), num(lerp(0, 1, NaN)));
  }

  S("utils：mulberry32 种子确定性与分布");
  {
    // 已知值（跨平台逐位一致，锁死算法不被悄悄换掉）
    const g42 = mulberry32(42);
    const v42 = [g42(), g42(), g42()];
    T("mulberry32(42) 前 3 值与基准一致",
      v42[0] === 0.6011037519201636 && v42[1] === 0.44829055899754167 && v42[2] === 0.8524657934904099,
      j(v42));
    const g1 = mulberry32(1);
    T("mulberry32(1) 首值与基准一致", g1() === 0.6270739405881613, num(g1()));

    // 种子相同 → 序列逐值相同
    {
      const a = mulberry32(12345), b = mulberry32(12345);
      let same = true;
      for (let i = 0; i < 2000; i++) if (a() !== b()) same = false;
      T("同种子 2000 值逐值相同", same);
    }
    // 种子不同 → 序列不同
    {
      const a = mulberry32(42), b = mulberry32(43);
      let diff = 0;
      for (let i = 0; i < 500; i++) if (a() !== b()) diff++;
      T("异种子 500 值几乎全不同（>400）", diff > 400, `${diff}/500`);
    }
    // 种子被 |0 截断（1.9 ≡ 1）
    T("mulberry32(1.9) ≡ mulberry32(1)（种子 a|=0 截断取整）", mulberry32(1.9)() === mulberry32(1)(), num(mulberry32(1.9)()));
    T("mulberry32(2.7) ≡ mulberry32(2)（截断向零，非四舍五入到 3）", mulberry32(2.7)() === mulberry32(2)(), num(mulberry32(2.7)()));
    T("mulberry32(0) 合法", isFinite_(mulberry32(0)()), num(mulberry32(0)()));
    T("mulberry32(-1) 合法", isFinite_(mulberry32(-1)()), num(mulberry32(-1)()));
    T("mulberry32(2^31) 合法（a|=0 溢出回绕）", isFinite_(mulberry32(2147483648)()), num(mulberry32(2147483648)()));
    T("mulberry32(NaN 种子) 不抛", isFinite_(mulberry32(NaN)()), num(mulberry32(NaN)()));
    T("mulberry32(大种子 1e9) 合法", isFinite_(mulberry32(1e9)()));
    T("mulberry32(小数种子 0.5) 合法", isFinite_(mulberry32(0.5)()));

    // 值域 / 均值 / 连续性
    {
      const g = mulberry32(777);
      let lo = Infinity, hi = -Infinity, sum = 0, buckets = new Array(10).fill(0), n = 20000;
      for (let i = 0; i < n; i++) {
        const x = g();
        lo = Math.min(lo, x); hi = Math.max(hi, x); sum += x;
        buckets[Math.min(9, Math.floor(x * 10))]++;
      }
      T("值域 ⊂ [0,1)", lo >= 0 && hi < 1, `[${lo}, ${hi}]`);
      T("均值 ≈ 0.5（±0.02）", Math.abs(sum / n - 0.5) < 0.02, (sum / n).toFixed(5));
      T("10 个等宽桶全部命中（分布无空洞）", buckets.every((c) => c > n / 20), j(buckets));
      T("各桶占比都接近 10%（±3%）", buckets.every((c) => Math.abs(c / n - 0.1) < 0.03), buckets.map((c) => (c / n).toFixed(3)).join(" "));
    }
    {
      const g = mulberry32(31337);
      let dup = 0, prev = g();
      for (let i = 0; i < 5000; i++) { const x = g(); if (x === prev) dup++; prev = x; }
      T("相邻值几乎不重复（<10）", dup < 10, `${dup}/5000`);
    }
    {
      const g = mulberry32(5);
      const a = g(), b = g();
      T("同实例连续两次不同", a !== b, `${num(a)} ${num(b)}`);
      T("同种子新实例首值相同（无隐藏全局状态）", mulberry32(5)() === a, num(a));
    }
    // 地形/金币相位用的低频调用不应退化
    {
      const g = mulberry32(2024);
      const firsts = [];
      for (let s = 0; s < 50; s++) firsts.push(mulberry32(s)());
      T("50 个连续种子的首值互不相同", new Set(firsts).size === 50, `${new Set(firsts).size}/50`);
    }
  }

  S("utils：wrapAngle 值域与性质");
  {
    T("wrapAngle(0) = 0", wrapAngle(0) === 0, num(wrapAngle(0)));
    T("wrapAngle(π) = π（上界闭）", wrapAngle(Math.PI) === Math.PI, num(wrapAngle(Math.PI)));
    T("wrapAngle(-π) = -π（下界闭）", wrapAngle(-Math.PI) === -Math.PI, num(wrapAngle(-Math.PI)));
    T("wrapAngle(2π) ≈ 0", near(wrapAngle(2 * Math.PI), 0, 1e-12), num(wrapAngle(2 * Math.PI)));
    T("wrapAngle(-2π) ≈ 0", near(wrapAngle(-2 * Math.PI), 0, 1e-12), num(wrapAngle(-2 * Math.PI)));
    T("wrapAngle(1.5π) = -0.5π", near(wrapAngle(1.5 * Math.PI), -0.5 * Math.PI, 1e-12), num(wrapAngle(1.5 * Math.PI)));
    T("wrapAngle(-1.5π) = 0.5π", near(wrapAngle(-1.5 * Math.PI), 0.5 * Math.PI, 1e-12), num(wrapAngle(-1.5 * Math.PI)));
    T("wrapAngle(3π) = π", near(wrapAngle(3 * Math.PI), Math.PI, 1e-12), num(wrapAngle(3 * Math.PI)));
    T("wrapAngle(100π) ≈ 0（50 个整周）", near(wrapAngle(100 * Math.PI), 0, 1e-9), num(wrapAngle(100 * Math.PI)));
    T("wrapAngle(100.5π) ≈ +π/2（50 整周 + 半周）", near(wrapAngle(100.5 * Math.PI), Math.PI / 2, 1e-9), num(wrapAngle(100.5 * Math.PI)));
    T("wrapAngle(1e6) 有限", isFinite_(wrapAngle(1e6)), num(wrapAngle(1e6)));
    T("wrapAngle(-1e6) 有限", isFinite_(wrapAngle(-1e6)), num(wrapAngle(-1e6)));
    T("wrapAngle(NaN) = NaN（不静默造值）", Number.isNaN(wrapAngle(NaN)), num(wrapAngle(NaN)));
    // 性质扫描
    {
      let inRange = true, idem = true, odd = true, period = true, cont = true, prev = wrapAngle(-20);
      for (let k = 0; k < 5000; k++) {
        const x = -1000 + k * 0.4;
        const wv = wrapAngle(x);
        if (!(wv >= -Math.PI && wv <= Math.PI)) inRange = false;
        if (Math.abs(wrapAngle(wv) - wv) > 1e-12) idem = false;
        if (Math.abs(wrapAngle(-x) + wv) > 1e-9) odd = false;
        if (Math.abs(wrapAngle(x + 2 * Math.PI * 11) - wv) > 1e-9) period = false;
        if (wv - prev > 2 * Math.PI + 1e-9) cont = false; // 不得出现 >2π 的跳变
        prev = wv;
      }
      T("值域 ⊂ [-π, π]（5000 采样）", inRange);
      T("幂等 wrapAngle∘wrapAngle = wrapAngle", idem);
      T("奇函数 wrapAngle(-x) = -wrapAngle(x)", odd);
      T("2π 周期（平移 22π 不变）", period);
      T("沿 x 单调扫过时无 >2π 的跳变（折返只在 ±π 边界）", cont);
    }
    // 与最短弧的语义一致：wrapAngle 后两端点夹角 ≤ π
    {
      let ok = true;
      for (let k = 1; k <= 1000; k++) {
        const a = k * 0.37, b = a + 1.9;
        const d = wrapAngle(b - a);
        if (Math.abs(d) > Math.PI + 1e-12) ok = false;
      }
      T("任意差值归一后 |d| ≤ π", ok);
    }
  }

  S("utils：installRoundRect polyfill");
  {
    const P = globalThis.CanvasRenderingContext2D && globalThis.CanvasRenderingContext2D.prototype;
    T("CanvasRenderingContext2D 存在（harness 提供）", !!P, typeof P);
    T("初始无 roundRect（polyfill 尚未安装）", P && P.roundRect === undefined, typeof (P && P.roundRect));
    installRoundRect();
    T("安装后 roundRect 为函数", typeof P.roundRect === "function", typeof P.roundRect);
    const installed = P.roundRect;
    installRoundRect();
    T("重复安装不覆盖（幂等）", P.roundRect === installed);

    // 路径序列
    const trace = (x, y, w, h, r) => {
      const rec = [];
      const fake = {
        moveTo: (a, b) => rec.push(["moveTo", a, b]),
        arcTo: (a, b, c, d, rr) => rec.push(["arcTo", a, b, c, d, rr]),
        closePath: () => rec.push(["closePath"]),
      };
      P.roundRect.call(fake, x, y, w, h, r);
      return rec;
    };
    const r1 = trace(0, 0, 100, 50, 999);
    T("首点 moveTo(x+min(r,w/2,h/2), y)", r1[0][0] === "moveTo" && r1[0][1] === 25 && r1[0][2] === 0, j(r1[0]));
    T("恰好 4 个 arcTo", r1.filter((e) => e[0] === "arcTo").length === 4, String(r1.filter((e) => e[0] === "arcTo").length));
    T("以 closePath 收尾", r1[r1.length - 1][0] === "closePath", j(r1[r1.length - 1]));
    T("arcTo 角点顺序：右上→右下→左下→左上",
      j(r1.filter((e) => e[0] === "arcTo").map((e) => [e[1], e[2], e[3], e[4]])) ===
      j([[100, 0, 100, 50], [100, 50, 0, 50], [0, 50, 0, 0], [0, 0, 100, 0]]),
      j(r1.filter((e) => e[0] === "arcTo").map((e) => [e[1], e[2], e[3], e[4]])));
    T("半径统一被夹到 min(999, w/2, h/2) = 25", r1.every((e) => e[0] !== "arcTo" || e[5] === 25), j(r1.filter((e) => e[0] === "arcTo").map((e) => e[5])));
    T("无参数 r → 0", (() => { const r = trace(0, 0, 100, 50); return r[0][1] === 0 && r.filter((e) => e[0] === "arcTo").every((e) => e[5] === 0); })(), j(trace(0, 0, 100, 50)[0]));
    // 负半径的真实行为：`r || 0` 拦不住 -8（-8 是真值），Math.min 只会取更小者，
    // 于是负半径原样传给 arcTo。原生 arcTo 对负半径抛 IndexSizeError ——
    // 属"前提不成立"（游戏内所有调用点都传正半径），故只记录行为、不判失败。
    T("负半径不会被夹成 0（r||0 拦不住负数，原样下传 —— 见报告）",
      (() => { const r = trace(0, 0, 100, 50, -8); return r[0][1] === -8 && r.filter((e) => e[0] === "arcTo").every((e) => e[5] === -8); })(),
      j(trace(0, 0, 100, 50, -8)));
    T("半径小于 w/2,h/2 时不夹", (() => { const r = trace(0, 0, 100, 50, 7); return r[0][1] === 7 && r.filter((e) => e[0] === "arcTo").every((e) => e[5] === 7); })());
    T("宽扁矩形按 h/2 夹", (() => { const r = trace(0, 0, 200, 20, 999); return r[0][1] === 10; })(), j(trace(0, 0, 200, 20, 999)[0]));
    T("窄高矩形按 w/2 夹", (() => { const r = trace(0, 0, 20, 200, 999); return r[0][1] === 10; })());
    T("正方形按半边夹", (() => { const r = trace(5, 5, 60, 60, 40); return r[0][1] === 35 && r[0][2] === 5; })(), j(trace(5, 5, 60, 60, 40)[0]));
    T("offset 生效（moveTo 用绝对 x,y）", (() => { const r = trace(10, 20, 100, 50, 5); return r[0][1] === 15 && r[0][2] === 20; })());
    T("零尺寸矩形不抛", (() => { const e = attempt(() => trace(0, 0, 0, 0, 5)); return e === null; })());
    T("负尺寸矩形不抛", (() => { const e = attempt(() => trace(0, 0, -10, -10, 5)); return e === null; })());
    T("NaN 参数不抛", (() => { const e = attempt(() => trace(NaN, NaN, NaN, NaN, NaN)); return e === null; })());

    // 缺构造器时早退
    {
      const saved = globalThis.CanvasRenderingContext2D;
      delete globalThis.CanvasRenderingContext2D;
      const e = attempt(() => installRoundRect());
      T("CanvasRenderingContext2D 缺失时早退不抛", e === null, String(e));
      globalThis.CanvasRenderingContext2D = saved;
    }
    T("早退后还原仍持有 polyfill", typeof globalThis.CanvasRenderingContext2D.prototype.roundRect === "function");
    // 自检：polyfill 必须真的被用上（不是恒真的空转）
    T("【自检】polyfill 可被取出并独立调用", typeof installed === "function" && installed.length === 5, `arity=${installed && installed.length}`);
  }

  // ================================================================
  //  2. Stepper —— 固定步长累加器
  // ================================================================
  S("Stepper：构造与基本推进");
  {
    let n = 0;
    const s = new Stepper(() => { n++; });
    T("构造后 acc = 0", s.acc === 0, num(s.acc));
    T("构造后 lastSteps = 0", s.lastSteps === 0, num(s.lastSteps));
    T("构造后 fixed = DT", s.fixed === DT, `${num(s.fixed)} vs ${num(DT)}`);
    T("构造后 maxSteps = 15", s.maxSteps === 15, String(s.maxSteps));
    T("构造后 step 已保存", typeof s.step === "function");
    T("advance(DT) → 1 步", s.advance(DT) === 1, String(s.advance(DT)));
    T("回调被调用 1 次", n === 2, String(n)); // 上一次调用也算进来
    T("lastSteps 与返回值一致", s.lastSteps === 1, String(s.lastSteps));
    T("推进整步后 acc = 0", s.acc === 0, num(s.acc));

    const c = new Stepper(() => {}, 0.01, 7);
    T("自定义 fixed = 0.01", c.fixed === 0.01, num(c.fixed));
    T("自定义 maxSteps = 7", c.maxSteps === 7, String(c.maxSteps));
    T("自定义 fixed 时按 0.01 切步", c.advance(0.1) === 7, String(c.advance(0.1))); // 封顶 7
    T("封顶后 acc 归零", c.acc === 0, num(c.acc));
  }

  S("Stepper：非法 dt 一律 0 步且不吞掉余量");
  {
    const bad = [
      ["dt=0", 0], ["dt=-0.016", -0.016], ["dt=-1", -1], ["dt=NaN", NaN],
      ["dt=undefined", undefined], ["dt=null", null], ["dt=''", ""],
      ["dt=-Infinity", -Infinity], ["dt=-0", -0],
    ];
    for (const [label, dt] of bad) {
      let fired = 0;
      const s = new Stepper(() => { fired++; });
      const r = s.advance(dt);
      T(`${label} → 0 步`, r === 0, String(r));
      T(`${label} 不触发回调`, fired === 0, String(fired));
      T(`${label} 后 lastSteps = 0`, s.lastSteps === 0, String(s.lastSteps));
      T(`${label} 后 acc 仍为 0`, s.acc === 0, num(s.acc));
    }
    // 有余量时非法 dt 不能把余量吃掉
    {
      const s = new Stepper(() => {});
      s.advance(0.01);
      const before = s.acc;
      s.advance(-1); s.advance(NaN); s.advance(0);
      T("非法 dt 序列不消耗已有余量", s.acc === before, `${num(before)} → ${num(s.acc)}`);
    }
    {
      const s = new Stepper(() => {});
      const r = s.advance(Infinity);
      T("dt=Infinity 被夹到 0.25 → 15 步", r === 15, String(r));
      T("dt=Infinity 后 acc = 0（丢弃积压兜底生效）", s.acc === 0, num(s.acc));
    }
    {
      const s = new Stepper(() => {});
      T("dt=1e-9 太小 → 0 步但余量累加", s.advance(1e-9) === 0 && near(s.acc, 1e-9, 1e-18), num(s.acc));
    }
  }

  S("Stepper：单帧步数切分（余数保留）");
  {
    const cases = [
      [DT * 0.5, 0], [DT * 0.99, 0], [DT, 1], [DT * 1.5, 1],
      [DT * 2, 2], [DT * 3.5, 3], [0.05, 3], [0.02, 1],
      [0.1, 6], [0.2, 12], [0.25, 15], [0.3, 15], [1, 15], [1e6, 15],
    ];
    for (const [dt, expect] of cases) {
      let fired = 0;
      const s = new Stepper(() => { fired++; });
      const r = s.advance(dt);
      T(`dt=${num(dt)} → ${expect} 步`, r === expect, String(r));
      T(`dt=${num(dt)} 回调次数 = 返回值`, fired === r, `${fired} vs ${r}`);
      if (expect < 15) {
        T(`dt=${num(dt)} 余量 < DT 且非负`, s.acc >= 0 && s.acc < DT, num(s.acc));
        T(`dt=${num(dt)} 时间守恒 Σdt = n·DT + acc`, near(Math.min(dt, 0.25), r * DT + s.acc, 1e-12), `${num(Math.min(dt, 0.25))} vs ${num(r * DT + s.acc)}`);
      } else {
        T(`dt=${num(dt)} 触发 maxSteps 兜底 → acc 归零`, s.acc === 0, num(s.acc));
      }
    }
    // 分两次喂入的半步
    {
      const s = new Stepper(() => {});
      T("半步 ×2：第一次 0 步", s.advance(DT / 2) === 0, num(s.acc));
      T("半步 ×2：余量恰为 DT/2", near(s.acc, DT / 2, 1e-18), num(s.acc));
      const n = s.advance(DT / 2);
      T("半步 ×2：第二次触发 1 步", n === 1, String(n));
      T("半步 ×2：余量归零", s.acc === 0, num(s.acc));
    }
    // 交替 DT / 0
    {
      const s = new Stepper(() => {});
      let steps = 0, nonZero = 0;
      for (let i = 0; i < 6000; i++) { const r = s.advance(i % 2 === 0 ? DT : 0); steps += r; if (r > 0) nonZero++; }
      T("DT/0 交替 6000 帧 → 3000 步", steps === 3000, String(steps));
      T("DT/0 交替：恰好 3000 帧触发步进", nonZero === 3000, String(nonZero));
      T("DT/0 交替：acc 归零", s.acc === 0, num(s.acc));
    }
    // reset
    {
      const s = new Stepper(() => {});
      s.advance(0.01);
      s.reset();
      T("reset() 清 acc", s.acc === 0, num(s.acc));
      T("reset() 清 lastSteps", s.lastSteps === 0, String(s.lastSteps));
    }
    // 回调实参恒为 fixed（不是 dt）
    {
      const got = new Set();
      const s = new Stepper((d) => got.add(d), 1 / 30);
      s.advance(0.5); s.advance(0.01); s.advance(0.07);
      T("回调实参恒等于 fixed（与 dt 无关）", got.size === 1 && got.has(1 / 30), [...got].map(num).join(" "));
    }
    // 封顶后自愈（不死循环）
    {
      const s = new Stepper(() => {});
      s.advance(5);
      const r = s.advance(DT);
      T("封顶帧后正常帧立刻恢复 1 步（自愈）", r === 1, String(r));
      T("恢复后 acc 归零", s.acc === 0, num(s.acc));
    }
    {
      const s = new Stepper(() => {}, DT, 1);
      T("maxSteps=1：dt=0.1 只跑 1 步", s.advance(0.1) === 1, String(s.advance(0.1)));
      T("maxSteps=1：积压被丢弃（acc=0）", s.acc === 0, num(s.acc));
      const s2 = new Stepper(() => {}, DT, 0);
      T("maxSteps=0：退化配置不跑步也不卡死", s2.advance(0.1) === 0, String(s2.advance(0.1)));
    }
    // acc 恒 < DT 性质扫描（50000 随机 dt）
    {
      const rnd = mulberry32(90210);
      let bad = 0, worst = -Infinity;
      for (let i = 0; i < 50000; i++) {
        const s = new Stepper(() => {});
        s.advance(Math.abs(rnd()) * 0.25);
        if (s.acc < 0 || s.acc >= DT) bad++;
        worst = Math.max(worst, s.acc);
      }
      T("50000 次随机 dt 后 acc 恒 ∈ [0, DT)", bad === 0, `${bad} 次越界，最大 ${num(worst)}`);
    }
  }

  S("Stepper：11 组 dt 序列 —— 固定步数与真实时间一致");
  {
    // 每条序列统一验证：步数守恒 / 无漂移 / 回调一致 / lastSteps 一致
    const SEQ = [
      { name: "60Hz 固定 60s", dt: () => 1 / 60, frames: 3600, steps: 3600 },
      { name: "120Hz 固定 60s", dt: () => 1 / 120, frames: 7200, steps: 3600 },
      { name: "144Hz 固定 60s", dt: () => 1 / 144, frames: 8640, steps: 3599 },
      { name: "240Hz 固定 60s", dt: () => 1 / 240, frames: 14400, steps: 3600 },
      { name: "30Hz 固定 60s", dt: () => 1 / 30, frames: 1800, steps: 3600 },
      { name: "20Hz 固定 60s", dt: () => 0.05, frames: 1200, steps: 3600 },
      { name: "10Hz 固定 60s", dt: () => 0.1, frames: 600, steps: 3600 },
      { name: "半步 DT/2 固定 100s", dt: () => DT / 2, frames: 12000, steps: 6000 },
      { name: "大帧 0.2s 固定 100s", dt: () => 0.2, frames: 500, steps: 6000 },
      { name: "封顶帧 0.25s 固定 25s", dt: () => 0.25, frames: 100, steps: 1500 },
      { name: "超封顶 0.3s 固定 30s", dt: () => 0.3, frames: 100, steps: 1500 },
    ];
    for (const q of SEQ) {
      let fired = 0, badArg = 0, badLast = 0, maxN = 0, sum = 0;
      const s = new Stepper((d) => { fired++; if (d !== DT) badArg++; });
      for (let i = 0; i < q.frames; i++) {
        const dt = q.dt();
        const r = s.advance(dt);
        if (r !== s.lastSteps) badLast++;
        maxN = Math.max(maxN, r);
        sum += Math.min(dt, 0.25);
      }
      T(`${q.name}：回调次数 = 返回值之和`, fired === q.steps, `${fired} vs ${q.steps}`);
      T(`${q.name}：步数 = ${q.steps}`, fired === q.steps, String(fired));
      T(`${q.name}：回调实参恒为 DT`, badArg === 0, `${badArg} 次异常`);
      T(`${q.name}：每帧 lastSteps = 返回值`, badLast === 0, `${badLast} 帧不一致`);
      T(`${q.name}：单帧步数 ≤ maxSteps`, maxN <= 15, String(maxN));
      T(`${q.name}：acc ∈ [0, DT)`, s.acc >= 0 && s.acc < DT, num(s.acc));
      T(`${q.name}：模拟时长与真实时长偏差 < 1 步（无漂移）`,
        Math.abs(fired * DT - sum) < DT, `模拟 ${num(fired * DT)}s vs 真实 ${num(sum)}s`);
      if (q.dt() <= 0.25) {
        T(`${q.name}：时间守恒（无丢失无重复）`, near(sum, fired * DT + s.acc, 1e-9),
          `残差 ${(sum - fired * DT - s.acc).toExponential(2)}s`);
      } else {
        T(`${q.name}：超封顶时间被显式丢弃（acc=0）`, s.acc === 0, num(s.acc));
      }
    }
  }

  S("Stepper：抖动 dt 与长时间无漂移");
  {
    const JIT = [
      { seed: 2024, frames: 20000, amp: 0.01, steps: 20002 },
      { seed: 7, frames: 20000, amp: 0.01, steps: 19956 },
      { seed: 99991, frames: 20000, amp: 0.01, steps: 19979 },
      { seed: 5150, frames: 30000, amp: 0.008, steps: null },
      { seed: 424242, frames: 12000, amp: 0.03, steps: null },
      { seed: 88, frames: 30000, amp: 0.002, steps: null },
    ];
    for (const q of JIT) {
      const rnd = mulberry32(q.seed);
      let fired = 0, sum = 0, badLast = 0, maxN = 0;
      const s = new Stepper(() => { fired++; });
      for (let i = 0; i < q.frames; i++) {
        const dt = 1 / 60 + (rnd() - 0.5) * q.amp;
        const r = s.advance(dt);
        if (r !== s.lastSteps) badLast++;
        maxN = Math.max(maxN, r);
        sum += dt;
      }
      T(`抖动 seed=${q.seed} ±${q.amp * 1000}ms：步数守恒到 <1 步`,
        Math.abs(fired - sum / DT) < 1, `${fired} 步 vs 期望 ${num(sum / DT)}`);
      T(`抖动 seed=${q.seed}：acc ∈ [0, DT)`, s.acc >= 0 && s.acc < DT, num(s.acc));
      T(`抖动 seed=${q.seed}：时间守恒无丢失`, near(sum, fired * DT + s.acc, 1e-9),
        `残差 ${(sum - fired * DT - s.acc).toExponential(2)}s`);
      T(`抖动 seed=${q.seed}：lastSteps 每帧一致`, badLast === 0, `${badLast} 帧`);
      T(`抖动 seed=${q.seed}：单帧步数 ≤ 15`, maxN <= 15, String(maxN));
      if (q.steps !== null) {
        T(`抖动 seed=${q.seed}：步数与基准一致`, fired === q.steps, `${fired} vs ${q.steps}`);
      }
    }
    // 长时间
    {
      let steps = 0;
      const s = new Stepper(() => { steps++; });
      for (let i = 0; i < 36000; i++) s.advance(1 / 60); // 600s
      T("600s @60Hz：每帧恰好 1 步", s.lastSteps === 1, String(s.lastSteps));
      T("600s @60Hz：总 36000 步", steps === 36000, String(steps));
      T("600s @60Hz：acc 归零（零漂移）", s.acc === 0, num(s.acc));
    }
    {
      let steps = 0;
      const s = new Stepper(() => { steps++; });
      for (let i = 0; i < 3600 * 144; i++) steps += s.advance(1 / 144); // 1h
      T("1h @144Hz：步数与 216000 相差 ≤1（长时间不累积漂移）",
        Math.abs(steps - 216000) <= 1, String(steps));
      T("1h @144Hz：acc 恒 < DT", s.acc >= 0 && s.acc < DT, num(s.acc));
    }
    {
      let steps = 0;
      const s = new Stepper(() => { steps++; });
      for (let i = 0; i < 3600 * 240; i++) steps += s.advance(1 / 240); // 1h = 216000 固定步
      T("1h @240Hz：总 216000 步（3600s ÷ DT）", steps === 216000, String(steps));
      T("1h @240Hz：acc 归零", s.acc === 0, num(s.acc));
    }
  }

  S("Stepper：startRaf 帧时间派生");
  {
    const origRaf = globalThis.requestAnimationFrame;
    const queue = [];
    globalThis.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
    const frames = [];
    startRaf((dt) => frames.push(dt));
    T("startRaf 立即排 1 个 rAF", queue.length === 1, String(queue.length));
    queue[0](1000);
    T("首帧 dt = 0（只渲染不推进）", frames.length === 1 && frames[0] === 0, j(frames));
    T("首帧后已重排下一帧（自续）", queue.length === 2, String(queue.length));
    queue[1](1000 + 1000 / 60);
    T("第 2 帧 dt ≈ 1/60", near(frames[1], 1 / 60, 1e-9), num(frames[1]));
    T("第 2 帧后继续重排", queue.length === 3, String(queue.length));
    queue[2](1000 + 2 * (1000 / 60));
    T("第 3 帧 dt ≈ 1/60", near(frames[2], 1 / 60, 1e-9), num(frames[2]));
    queue[3](1000 + 2 * (1000 / 60) + 500);
    T("长时间隔 dt = 0.5（不丢帧差）", near(frames[3], 0.5, 1e-9), num(frames[3]));
    T("累计帧数正确", frames.length === 4, String(frames.length));
    globalThis.requestAnimationFrame = origRaf;
    T("还原 rAF 后 harness 桩恢复为 noop", globalThis.requestAnimationFrame() === undefined);
  }

  // ================================================================
  //  3. canvas —— 视口与 DPR
  // ================================================================
  S("canvas：view / cv 结构与 resize 写入");
  {
    T("cv 存在且为 canvas 桩", !!cv && cv.id === "cv", cv && cv.id);
    T("canvasM.ctx 存在", !!canvasM.ctx);
    T("view 是可变对象（导出 const 但内容可写）", typeof canvasM.view === "object" && canvasM.view !== null);
    T("view 初始三键齐备", ["W", "H", "DPR"].every((k) => k in canvasM.view), Object.keys(canvasM.view).join());
    T("view.DPR 初值 1", canvasM.view.DPR === 1, num(canvasM.view.DPR));
    T("ctx 桩的 setTransform 存在", typeof canvasM.ctx.setTransform === "function");

    // setTransform 间谍
    {
      const calls = [];
      canvasM.ctx.setTransform = (...a) => calls.push(a);
      win.innerWidth = 1280; win.innerHeight = 720; win.devicePixelRatio = 2;
      canvasM.resize();
      T("resize 调用 setTransform 一次", calls.length === 1, j(calls));
      T("setTransform 实参 = [DPR,0,0,DPR,0,0]", j(calls[0]) === j([2, 0, 0, 2, 0, 0]), j(calls[0]));
      win.devicePixelRatio = 1.5;
      canvasM.resize();
      T("DPR=1.5 时 setTransform 用 1.5", j(calls[1]) === j([1.5, 0, 0, 1.5, 0, 0]), j(calls[1]));
      delete canvasM.ctx.setTransform;
    }
    T("删除间谍后 resize 仍不抛", attempt(() => canvasM.resize()) === null);
    T("删除间谍后 setTransform 回到桩 noop", canvasM.ctx.setTransform(9, 9, 9, 9, 9, 9) === undefined);
  }

  S("canvas：DPR × 视口矩阵");
  {
    // DPR 公式：min(devicePixelRatio || 1, W<700 || H<480 ? 1.6 : 2)
    const expectDpr = (iw, ih, dp) => {
      const d = dp || 1;
      return Math.min(d, iw < 700 || ih < 480 ? 1.6 : 2);
    };
    const ROWS = [
      [1280, 720, 1], [1280, 720, 1.5], [1280, 720, 2], [1280, 720, 3],
      [1920, 1080, 1], [1920, 1080, 2], [1920, 1080, 3], [1920, 1080, 4],
      [2560, 1440, 3], [800, 600, 2], [800, 600, 3], [1024, 768, 2.5],
      [699, 720, 2], [700, 720, 2], [701, 720, 2], [1280, 479, 2],
      [1280, 480, 2], [1280, 481, 2], [360, 640, 3], [414, 896, 3],
      [320, 568, 1], [1, 1, 3], [1e9, 1e9, 4],
    ];
    for (const [iw, ih, dp] of ROWS) {
      const tag = `${iw}×${ih}@${dp}`;
      win.innerWidth = iw; win.innerHeight = ih; win.devicePixelRatio = dp;
      const err = attempt(() => canvasM.resize());
      T(`${tag}：resize 不抛`, err === null, String(err));
      T(`${tag}：view.W 写入 innerWidth`, canvasM.view.W === iw, `${num(canvasM.view.W)} vs ${num(iw)}`);
      T(`${tag}：view.H 写入 innerHeight`, canvasM.view.H === ih, `${num(canvasM.view.H)} vs ${num(ih)}`);
      const d = expectDpr(iw, ih, dp);
      T(`${tag}：view.DPR = ${d}`, canvasM.view.DPR === d, `${num(canvasM.view.DPR)} vs ${d}`);
      T(`${tag}：DPR ∈ (0, 2] 且有限`, isFinite_(canvasM.view.DPR) && canvasM.view.DPR > 0 && canvasM.view.DPR <= 2, num(canvasM.view.DPR));
      T(`${tag}：cv.width = W·DPR 有限`, isFinite_(cv.width), num(cv.width));
      T(`${tag}：cv.height = H·DPR 有限`, isFinite_(cv.height), num(cv.height));
      T(`${tag}：cv.width > 0`, cv.width > 0, num(cv.width));
      T(`${tag}：cv.height > 0`, cv.height > 0, num(cv.height));
      T(`${tag}：cv.width = round(W·DPR·RS) 且 ≥1`, cv.width === Math.max(1, Math.round(iw * d * canvasM.view.RS)), `${num(cv.width)} vs ${num(Math.max(1, Math.round(iw * d * canvasM.view.RS)))}`);
      T(`${tag}：cv.style.width = "${iw}px"（CSS 像素，不含 DPR）`, cv.style.width === iw + "px", String(cv.style.width));
      T(`${tag}：cv.style.height = "${ih}px"`, cv.style.height === ih + "px", String(cv.style.height));
    }
  }

  S("canvas：DPR 与视口的退化边界");
  {
    // 0 → 回退 1（`|| 1`）
    win.innerWidth = 1280; win.innerHeight = 720; win.devicePixelRatio = 0;
    canvasM.resize();
    T("DPR=0 回退为 1（|| 1 兜底）", canvasM.view.DPR === 1, num(canvasM.view.DPR));
    T("DPR=0 时 cv.width = W", canvasM.cv.width === 1280, num(canvasM.cv.width));
    // undefined / NaN DPR
    win.devicePixelRatio = undefined;
    canvasM.resize();
    T("DPR=undefined 回退为 1", canvasM.view.DPR === 1, num(canvasM.view.DPR));
    win.devicePixelRatio = NaN;
    canvasM.resize();
    T("DPR=NaN 回退为 1（NaN 假值）", canvasM.view.DPR === 1, num(canvasM.view.DPR));
    T("DPR=NaN 时 cv.width 有限", isFinite_(canvasM.cv.width), num(canvasM.cv.width));
    // 负 DPR：浏览器不会产生，代码也不防 → 只断言"不抛 + 结果有限可解释"
    win.devicePixelRatio = -1;
    canvasM.resize();
    T("DPR=-1 不抛", canvasM.view.DPR === -1, num(canvasM.view.DPR));
    T("DPR=-1 时结果有限（负宽，非 NaN/Inf）", isFinite_(canvasM.view.DPR) && isFinite_(canvasM.cv.width), num(canvasM.cv.width));
    T("DPR=-1 时 CSS 尺寸仍为正（只有位图宽为负）", canvasM.cv.style.width === "1280px", String(canvasM.cv.style.width));
    // 0 视口
    win.innerWidth = 0; win.innerHeight = 0; win.devicePixelRatio = 2;
    canvasM.resize();
    T("0×0 视口不抛", canvasM.view.W === 0 && canvasM.view.H === 0);
    T("0 视口按窄屏规则取 1.6 上限", canvasM.view.DPR === 1.6, num(canvasM.view.DPR));
    // 位图宽高取 max(1, ·)：0 宽位图虽然合法，但部分浏览器上 getImageData 会抛，
    // 所以宁可给 1px 也不落 0。契约因此不再是"W·DPR 恰好为 0"。
    T("0×0 时 cv 位图为 1×1（非 NaN，且不落 0 宽位图）", canvasM.cv.width === 1 && canvasM.cv.height === 1, `${num(canvasM.cv.width)}×${num(canvasM.cv.height)}`);
    T("0×0 时 style 为 0px", canvasM.cv.style.width === "0px" && canvasM.cv.style.height === "0px");
    // 负视口
    win.innerWidth = -100; win.innerHeight = 720; win.devicePixelRatio = 2;
    canvasM.resize();
    T("负 innerWidth 不抛且结果有限", isFinite_(canvasM.view.DPR) && isFinite_(canvasM.cv.width), num(canvasM.cv.width));
    win.innerWidth = 1280; win.innerHeight = -720;
    canvasM.resize();
    T("负 innerHeight 不抛且结果有限", isFinite_(canvasM.view.DPR) && isFinite_(canvasM.cv.height), num(canvasM.cv.height));
    // undefined 视口
    win.innerWidth = undefined; win.innerHeight = 720;
    canvasM.resize();
    T("innerWidth=undefined 不抛", attempt(() => canvasM.resize()) === null);
    T("innerWidth=undefined → style 为 'undefinedpx'（无防护，见报告）",
      canvasM.cv.style.width === "undefinedpx", String(canvasM.cv.style.width));
    win.innerWidth = 1280; win.innerHeight = undefined;
    canvasM.resize();
    T("innerHeight=undefined 不抛", attempt(() => canvasM.resize()) === null);
    win.innerWidth = NaN; win.innerHeight = 720; win.devicePixelRatio = 2;
    canvasM.resize();
    T("innerWidth=NaN 不抛", attempt(() => canvasM.resize()) === null);
    T("innerWidth=NaN → cv.width 为 NaN（未做 isFinite 防护，见报告）",
      Number.isNaN(canvasM.cv.width), String(canvasM.cv.width));
    // 幂等 / 连续调用
    win.innerWidth = 1280; win.innerHeight = 720; win.devicePixelRatio = 2;
    canvasM.resize();
    const snap = [canvasM.view.DPR, canvasM.cv.width, canvasM.cv.height, canvasM.cv.style.width];
    canvasM.resize(); canvasM.resize();
    T("同参数连续 resize 结果幂等",
      j(snap) === j([canvasM.view.DPR, canvasM.cv.width, canvasM.cv.height, canvasM.cv.style.width]), j(snap));
    T("resize 返回 undefined（无副作用返回值）", canvasM.resize() === undefined);
    // 复原
    win.innerWidth = PRISTINE.winWH[0]; win.innerHeight = PRISTINE.winWH[1]; win.devicePixelRatio = PRISTINE.winWH[2];
    canvasM.resize();
    T("复原到 1280×720@1 后 view 正确",
      canvasM.view.W === 1280 && canvasM.view.H === 720 && canvasM.view.DPR === 1,
      `${canvasM.view.W}×${canvasM.view.H}@${num(canvasM.view.DPR)}`);
  }

  // ================================================================
  //  4. store —— 初值与结构
  // ================================================================
  S("store：容器与流程状态初值");
  {
    T("store 是导出对象", typeof store === "object" && store !== null);
    // 29 = 原 27 + raceFormat / racers（比赛赛制：1V1 / 多人竞技 / 团赛）
    T("顶层字段数 = 29", Object.keys(store).length === 29, String(Object.keys(store).length));
    T("slot = 0（默认存档1）", store.slot === 0, String(store.slot));
    T("顶层字段与出厂快照一致（本节未改动）", j({ ...store, cam: { ...store.cam }, run: { ...store.run } }) === PRISTINE.store);
    T("state = 'menu'", store.state === "menu", String(store.state));
    T("mode = 'level'", store.mode === "level", String(store.mode));
    T("lastMode = 'level'", store.lastMode === "level", String(store.lastMode));
    T("rankedAdvanced = false", store.rankedAdvanced === false, String(store.rankedAdvanced));
    T("time = 0", store.time === 0, num(store.time));
    T("lvIdx = 0", store.lvIdx === 0, String(store.lvIdx));
    T("selLevel = 0", store.selLevel === 0, String(store.selLevel));
    T("unlocked = 0（仅第 1 关解锁）", store.unlocked === 0, String(store.unlocked));
    T("finishX = 0", store.finishX === 0, num(store.finishX));
    T("gold = 0", store.gold === 0, String(store.gold));
    T("best = 0", store.best === 0, String(store.best));
    T("muted = false", store.muted === false, String(store.muted));
    T("shopOpen = false", store.shopOpen === false, String(store.shopOpen));
    T("donateOpen = false", store.donateOpen === false, String(store.donateOpen));
    T("raceAI = null（未开局）", store.raceAI === null, String(store.raceAI));
    T("stars = []（未读档，尚未补齐到 72）", Array.isArray(store.stars) && store.stars.length === 0, j(store.stars));
    T("achGot = []", Array.isArray(store.achGot) && store.achGot.length === 0, j(store.achGot));
    T("ownedVehicles = [0]（仅默认车）", j(store.ownedVehicles) === j([0]), j(store.ownedVehicles));
    T("currentVehicle = 0（在已拥有列表内）",
      store.currentVehicle === 0 && store.ownedVehicles.includes(store.currentVehicle), String(store.currentVehicle));
    T("upgrades = {}（未读档）", j(store.upgrades) === "{}", j(store.upgrades));
    T("ultra = {}", j(store.ultra) === "{}", j(store.ultra));
    T("state ∈ 合法流程集合", ["menu", "play", "pause", "ended"].includes(store.state), store.state);
    T("mode ∈ 合法模式集合", ["level", "race", "free", "ranked"].includes(store.mode), store.mode);
  }

  S("store：cam / phys / run / progress / stat 子容器");
  {
    T("cam 四键齐备", j(Object.keys(store.cam).sort()) === j(["shake", "x", "y", "zoom"]), Object.keys(store.cam).join());
    T("cam.zoom = 1.4（默认跟车视野）", store.cam.zoom === 1.4, num(store.cam.zoom));
    T("cam.zoom ∈ [0.6, 2.5]（±/ 缩放钳制域内）", store.cam.zoom >= 0.6 && store.cam.zoom <= 2.5, num(store.cam.zoom));
    T("cam.x = 0", store.cam.x === 0, num(store.cam.x));
    T("cam.y = 0", store.cam.y === 0, num(store.cam.y));
    T("cam.shake = 0", store.cam.shake === 0, num(store.cam.shake));

    T("phys 十一键齐备", Object.keys(store.phys).length === 11, `${Object.keys(store.phys).length} 个`);
    T("phys.GRAV = 750", store.phys.GRAV === 750, num(store.phys.GRAV));
    T("phys.GRAV > 0（重力方向正确）", store.phys.GRAV > 0, num(store.phys.GRAV));
    T("phys.TRACTION = 1", store.phys.TRACTION === 1, num(store.phys.TRACTION));
    // ★ 不再硬编码 520：MAXV 现在是"平路真实可达极速"，由 topSpeedOf 解算得出
    //   （旧公式 MAXV_BASE+2.5·engine 与真实速度脱节，满级虚标 2.7 倍）。
    //   判据改成"等于 0 级山地车的解算值"，基线变了也不用再回来改魔法数字。
    T("phys.MAXV = 0 级山地车的真实可达极速", store.phys.MAXV === ZERO_MAXV, num(store.phys.MAXV) + " / 期望 " + num(ZERO_MAXV));
    T("phys.MAXV > 0", store.phys.MAXV > 0, num(store.phys.MAXV));
    T("phys.crashMargin = 4", store.phys.crashMargin === 4, num(store.phys.crashMargin));
    T("phys.crashMargin > 0（正容忍度）", store.phys.crashMargin > 0, num(store.phys.crashMargin));
    T("phys.fuel = 1（满油）", store.phys.fuel === 1, num(store.phys.fuel));
    T("phys.fuelMax = 1", store.phys.fuelMax === 1, num(store.phys.fuelMax));
    T("phys.fuel ≤ fuelMax", store.phys.fuel <= store.phys.fuelMax, `${num(store.phys.fuel)} ≤ ${num(store.phys.fuelMax)}`);
    T("phys.theme = 0", store.phys.theme === 0, String(store.phys.theme));
    T("phys.minY = 0", store.phys.minY === 0, num(store.phys.minY));
    T("phys.rb = null（未 applyUpgrades）", store.phys.rb === null, String(store.phys.rb));
    T("phys.susp = null", store.phys.susp === null, String(store.phys.susp));
    T("phys.mu = 1", store.phys.mu === 1, num(store.phys.mu));

    const RUN_INIT = {
      gen: 0, crashed: false, crashTimer: 0, clearing: false, lastSafeX: constM.START_X,
      runCrashed: false, combo: 0, comboStamp: -99, wheelieDist: 0, maxWheelieDist: 0,
      airTime: 0, landed: false, levelStartTime: 0, coinGot: 0, totalCoins: 0,
      penaltyTime: 0, crashStall: 0, gateIdx: 0, failed: false,
    };
    const runKeys = Object.keys(store.run);
    T(`run 字段数 = ${Object.keys(RUN_INIT).length}`, runKeys.length === Object.keys(RUN_INIT).length, String(runKeys.length));
    T("run 字段名集合与设计一致（无遗漏/无多余）", j(runKeys.sort()) === j(Object.keys(RUN_INIT).sort()), j(runKeys.sort()));
    for (const k of Object.keys(RUN_INIT)) {
      T(`run.${k} 初值 = ${j(RUN_INIT[k])}`, store.run[k] === RUN_INIT[k], `${j(store.run[k])} vs ${j(RUN_INIT[k])}`);
    }
    T("run.lastSafeX = START_X（出生点）", store.run.lastSafeX === constM.START_X, `${store.run.lastSafeX} vs ${constM.START_X}`);
    T("run.comboStamp = -99（首帧前无连招）", store.run.comboStamp === -99, num(store.run.comboStamp));
    T("run.crashTimer ≥ 0", store.run.crashTimer >= 0, num(store.run.crashTimer));
    T("run.penaltyTime = 0", store.run.penaltyTime === 0, num(store.run.penaltyTime));
    T("run.crashStall = 0", store.run.crashStall === 0, num(store.run.crashStall));
    T("run.coinGot ≤ totalCoins", store.run.coinGot <= store.run.totalCoins, `${store.run.coinGot} ≤ ${store.run.totalCoins}`);
    T("run.gateIdx = 0（未过门）", store.run.gateIdx === 0, String(store.run.gateIdx));

    T("progress 八键齐备", j(Object.keys(store.progress).sort()) ===
      j(["branchCleared", "finaleDone", "freeThemes", "invited", "losses", "peak", "rating", "wins"].sort()),
      Object.keys(store.progress).join());
    T("progress.branchCleared = []", j(store.progress.branchCleared) === "[]", j(store.progress.branchCleared));
    T("progress.freeThemes = []", j(store.progress.freeThemes) === "[]", j(store.progress.freeThemes));
    T("progress.finaleDone = false", store.progress.finaleDone === false, String(store.progress.finaleDone));
    T("progress.invited = false", store.progress.invited === false, String(store.progress.invited));
    T("progress.peak = false", store.progress.peak === false, String(store.progress.peak));
    T("progress.rating = 0", store.progress.rating === 0, String(store.progress.rating));
    T("progress.wins = 0", store.progress.wins === 0, String(store.progress.wins));
    T("progress.losses = 0", store.progress.losses === 0, String(store.progress.losses));
    T("progress.peak=false ⇒ freeThemes 必空（准入不变量）",
      store.progress.peak || store.progress.freeThemes.length === 0, j(store.progress.freeThemes));

    T("stat 四键齐备", j(Object.keys(store.stat).sort()) === j(["lastPlayed", "totalMeters", "totalRuns", "totalSeconds"].sort()),
      Object.keys(store.stat).join());
    T("stat.totalRuns = 0", store.stat.totalRuns === 0, String(store.stat.totalRuns));
    T("stat.totalMeters = 0", store.stat.totalMeters === 0, num(store.stat.totalMeters));
    T("stat.totalSeconds = 0", store.stat.totalSeconds === 0, num(store.stat.totalSeconds));
    T("stat.lastPlayed = ''（尚未游玩）", store.stat.lastPlayed === "", j(store.stat.lastPlayed));
    T("累计值均非负", [store.stat.totalRuns, store.stat.totalMeters, store.stat.totalSeconds].every((v) => v >= 0));
  }

  S("store：bike 五质点与同一批对象引用");
  {
    T("bike.rear/front/head/axleR/axleF 都是对象", ["rear", "front", "head", "axleR", "axleF"].every((k) => bike[k] && typeof bike[k] === "object"));
    T("pts 是数组", Array.isArray(bike.pts));
    T("pts 长度 = 5", bike.pts.length === 5, String(bike.pts.length));
    T("pts[0] === bike.rear（同一引用）", bike.pts[0] === bike.rear);
    T("pts[1] === bike.front（同一引用）", bike.pts[1] === bike.front);
    T("pts[2] === bike.head（同一引用）", bike.pts[2] === bike.head);
    T("pts[3] === bike.axleR（同一引用）", bike.pts[3] === bike.axleR);
    T("pts[4] === bike.axleF（同一引用）", bike.pts[4] === bike.axleF);
    T("pts 内 5 个元素互不相同（无别名重复）", new Set(bike.pts).size === 5, `${new Set(bike.pts).size} 个不同对象`);
    T("pts 顺序 = [rear, front, head, axleR, axleF]",
      j(bike.pts) === j([bike.rear, bike.front, bike.head, bike.axleR, bike.axleF]));
    T("pts 顺序与文档注释一致（后轮→前轮→骑手→后轴→前轴）",
      bike.pts[0].x === bike.rear.x && bike.pts[1] === bike.front && bike.pts[2] === bike.head);
    // 每个质点四元组齐备
    for (const [i, name] of ["rear", "front", "head", "axleR", "axleF"].entries()) {
      const p = bike.pts[i];
      T(`pts[${i}] (${name}) 四元组 x/y/px/py 齐备且为有限数`,
        ["x", "y", "px", "py"].every((k) => isFinite_(p[k])), j(p));
    }
    T("五质点初始坐标全为 0", bike.pts.every((p) => p.x === 0 && p.y === 0 && p.px === 0 && p.py === 0),
      j(bike.pts.map((p) => [p.x, p.y])));
    // 引用同一性证明：改 pts[0] 的属性，bike.rear 同步可见
    {
      const p = bike.pts[0];
      const bx = p.x;
      p.x = 12345;
      T("写 pts[0].x 后 bike.rear.x 同步（确为同一对象）", bike.rear.x === 12345, num(bike.rear.x));
      p.x = bx;
      T("还原后 bike.rear.x 复原", bike.rear.x === bx, num(bike.rear.x));
    }
    // 其余字段
    T("bike.grounded = 0（未触地）", bike.grounded === 0, num(bike.grounded));
    T("bike.speed = 0", bike.speed === 0, num(bike.speed));
    T("bike.boostT = 0", bike.boostT === 0, num(bike.boostT));
    T("bike.wheelRear = 0（视觉角）", bike.wheelRear === 0, num(bike.wheelRear));
    T("bike.wheelFront = 0", bike.wheelFront === 0, num(bike.wheelFront));
    T("bike.locked = true（未解锁输入）", bike.locked === true, String(bike.locked));
    T("bike.spawnX = START_X", bike.spawnX === constM.START_X, `${bike.spawnX} vs ${constM.START_X}`);
    T("bike.frontGr = false", bike.frontGr === false, String(bike.frontGr));
    T("bike.rearGr = false", bike.rearGr === false, String(bike.rearGr));
    T("bike.squash = 0", bike.squash === 0, num(bike.squash));
    T("bike.squashVel = 0", bike.squashVel === 0, num(bike.squashVel));
    T("bike.lastAng = 0", bike.lastAng === 0, num(bike.lastAng));
    T("bike.angVel = 0", bike.angVel === 0, num(bike.angVel));
    T("bike.angRate = 0", bike.angRate === 0, num(bike.angRate));
    T("bike.rotAcc = 0", bike.rotAcc === 0, num(bike.rotAcc));
    T("bike.headUp = -1（骑手在轴线上方）", bike.headUp === -1, String(bike.headUp));
    T("bike.wheelRot = {rear:0, front:0}", j(bike.wheelRot) === j({ rear: 0, front: 0 }), j(bike.wheelRot));
    T("bike.wheelAcc = {rear:0, front:0}", j(bike.wheelAcc) === j({ rear: 0, front: 0 }), j(bike.wheelAcc));
    T("bike.susp = {rear:{t:0,v:0}, front:{t:0,v:0}}",
      j(bike.susp) === j({ rear: { t: 0, v: 0 }, front: { t: 0, v: 0 } }), j(bike.susp));
    T("bike.slip = {rear:0, front:0}", j(bike.slip) === j({ rear: 0, front: 0 }), j(bike.slip));
    T("bike.fn = {rear:0, front:0}", j(bike.fn) === j({ rear: 0, front: 0 }), j(bike.fn));
    T("bike.solverIters = 0", bike.solverIters === 0, String(bike.solverIters));
    T("bike.solverResid = 0", bike.solverResid === 0, num(bike.solverResid));
    T("bike.penetration = 0", bike.penetration === 0, num(bike.penetration));
    T("五质点恰好被 4 个具名槽 + pts 覆盖（不多不少）",
      new Set([...bike.pts, bike.rear, bike.front, bike.head, bike.axleR, bike.axleF]).size === 5);
  }

  S("store：world 数组与 uiHooks 机制");
  {
    T("world 十二键齐备", Object.keys(world).length === 12, `${Object.keys(world).length} 个`);
    const ARRS = ["coins", "canisters", "boosts", "decoTree", "decoRock", "particles", "hazards", "gates", "jumps"];
    for (const k of ARRS) {
      T(`world.${k} 是数组`, Array.isArray(world[k]), typeof world[k]);
      T(`world.${k} 初始为空`, world[k].length === 0, String(world[k].length));
    }
    T("world 另有 3 个标量 freeGenX/prepFuel/airScore",
      ARRS.length === 9 && Object.keys(world).length === 12, Object.keys(world).length + " 键");
    T("world.freeGenX = 0（无限模式尚未生成）", world.freeGenX === 0, num(world.freeGenX));
    T("world.prepFuel = 0（变体未构建）", world.prepFuel === 0, num(world.prepFuel));
    T("world.airScore = 0", world.airScore === 0, num(world.airScore));
    T("world 各数组为彼此独立的实例（无共享别名）",
      new Set(ARRS.map((k) => world[k])).size === ARRS.length, `${new Set(ARRS.map((k) => world[k])).size}/${ARRS.length}`);
    T("本节未改动 world（与快照一致）",
      j(Object.keys(world).map((k) => (Array.isArray(world[k]) ? world[k].length : world[k]))) === j(PRISTINE.worldLen));

    const { uiHooks } = storeM;
    T("uiHooks 是对象", typeof uiHooks === "object" && uiHooks !== null);
    T("uiHooks 只有一个键 onHome", Object.keys(uiHooks).length === 1, Object.keys(uiHooks).join());
    T("uiHooks.onHome 初值 null（未接线）", uiHooks.onHome === null, String(uiHooks.onHome));
    T("uiHooks.onHome 可写（单接线槽位，非只读）",
      (() => { const s = uiHooks.onHome; uiHooks.onHome = () => 42; const ok = uiHooks.onHome() === 42; uiHooks.onHome = s; return ok; })());
    // 真的接一次线（initPanels 装的钩子），证明机制可用
    {
      const panelsM = await imp("ui/panels.js");
      const err = attempt(() => panelsM.initPanels({}));
      T("initPanels 不抛（可完成接线）", err === null, String(err));
      T("initPanels 后 uiHooks.onHome 变为函数", typeof uiHooks.onHome === "function", typeof uiHooks.onHome);
      T("接线后的 onHome 可被调用且不抛", attempt(() => uiHooks.onHome()) === null);
      T("onHome 把模式切回 level（钩子语义正确）", store.mode === "level", store.mode);
    }
  }

  // ================================================================
  //  5. toast —— 四型分级 / 排队 / 超时移除 / 降级
  // ================================================================
  S("toast：分级常量与文案推断");
  {
    T("TOAST_LEVELS 四型", j(toastM.TOAST_LEVELS) === j(["info", "success", "warn", "danger"]), j(toastM.TOAST_LEVELS));
    T("TOAST_MAX = 2（同屏上限）", toastM.TOAST_MAX === 2, String(toastM.TOAST_MAX));
    T("TOAST_ICON 四键齐备", j(Object.keys(toastM.TOAST_ICON).sort()) === j(toastM.TOAST_LEVELS.slice().sort()),
      Object.keys(toastM.TOAST_ICON).join());
    T("TOAST_ICON 值均为非空串", Object.values(toastM.TOAST_ICON).every((v) => typeof v === "string" && v.length > 0),
      j(toastM.TOAST_ICON));
    T("TOAST_ICON 四图标互不相同", new Set(Object.values(toastM.TOAST_ICON)).size === 4, j(toastM.TOAST_ICON));

    const CASES = [
      ["⛔ 失败", "danger"], ["❌ 出错", "danger"], ["😵 摔了", "danger"],
      ["燃料不足", "danger"], ["功能不可用", "danger"],
      ["⚠️ 超速", "warn"], ["🔒 未解锁", "warn"], ["即将耗尽", "warn"],
      ["时间紧张", "warn"],
      ["🏆 获胜", "success"], ["🎉 达成", "success"], ["✅ 通过", "success"],
      ["已解锁", "success"], ["已切换", "success"], ["已导入", "success"],
      ["已导出", "success"], ["已重置", "success"], ["新纪录", "success"],
      ["随便一条提示", "info"], ["", "info"], ["缩放 100%", "info"],
    ];
    for (const [txt, lv] of CASES) {
      T(`inferLevel(${j(txt)}) = ${lv}`, toastM.inferLevel(txt) === lv, toastM.inferLevel(txt));
    }
    T("inferLevel(null) = info（不抛）", toastM.inferLevel(null) === "info", toastM.inferLevel(null));
    T("inferLevel(undefined) = info（不抛）", toastM.inferLevel(undefined) === "info", toastM.inferLevel(undefined));
    T("inferLevel(数字) = info（转字符串）", toastM.inferLevel(123) === "info", toastM.inferLevel(123));
    T("inferLevel(对象) = info（不抛）", toastM.inferLevel({ a: 1 }) === "info");
    T("关键词优先级：danger 压过 success", toastM.inferLevel("⛔ 🏆 失败又获胜") === "danger", toastM.inferLevel("⛔ 🏆 失败又获胜"));
    T("关键词优先级：warn 压过 success", toastM.inferLevel("⚠️ 🏆 超速但获胜") === "warn", toastM.inferLevel("⚠️ 🏆 超速但获胜"));
    T("关键词优先级：danger 压过 warn", toastM.inferLevel("⛔ ⚠️ 失败且超速") === "danger", toastM.inferLevel("⛔ ⚠️ 失败且超速"));
    T("关键词优先于图标（success 图标 + 危险词 → danger）", toastM.inferLevel("🏆 失败") === "danger", toastM.inferLevel("🏆 失败"));
    const byLv = (lv) => CASES.filter(([, l]) => l === lv).length;
    T("四型各有 ≥3 条可推断文案", toastM.TOAST_LEVELS.every((lv) => byLv(lv) >= 3),
      toastM.TOAST_LEVELS.map((lv) => `${lv}:${byLv(lv)}`).join(" "));
    T("21 条样例全部通过推断（无自相矛盾）", CASES.length === 21 &&
      CASES.every(([txt, lv]) => toastM.inferLevel(txt) === lv), String(CASES.length));
  }

  S("toast：入队 / 同屏上限 / 排队顺序 / 超时移除");
  {
    // ★ harness 把 setTimeout 打成永不回调的 () => 0，故必须自行劫持才能验"超时移除"
    const origRaf = globalThis.requestAnimationFrame;
    const origTo = globalThis.setTimeout;
    const rafQ = [];
    const toQ = [];
    const origCreate = globalThis.document.createElement;
    const created = [];
    globalThis.requestAnimationFrame = (fn) => { rafQ.push(fn); return rafQ.length; };
    globalThis.setTimeout = (fn, ms) => { toQ.push([fn, ms]); return toQ.length; };
    globalThis.document.createElement = (tag) => { const e = origCreate(tag); created.push(e); return e; };
    const fireAll = () => { let guard = toQ.length + 4; while (toQ.length && guard-- > 0) toQ.shift()[0](); };
    // ★ 必须 shift 后再调，否则会重复触发同一个 finish（live 被重复补位成 3 条）
    const fireNext = () => { const t = toQ.shift(); if (t) t[0](); return !!t; };
    const lastMs = () => (toQ.length ? toQ[toQ.length - 1][1] : null);

    try {
      toastM.clearToasts();
      T("clearToasts 后 live/queue 均空", j(toastM.toastState()) === j({ live: [], queue: [] }), j(toastM.toastState()));

      // 首条：直接上屏
      let lv = toastM.showToast("测试信息", 700);
      T("showToast 返回实际级别", lv === "info", lv);
      T("首条进 live", toastM.toastState().live.length === 1, j(toastM.toastState()));
      T("首条不进 queue", toastM.toastState().queue.length === 0, j(toastM.toastState()));
      T("创建了 1 个 DOM 节点", created.length === 1, String(created.length));
      T("节点标签为 div", created[0].id === "__new_div", created[0].id);
      T("节点 className = 'toastItm info'", created[0].className === "toastItm info", created[0].className);
      T("节点 textContent = 图标 + 全角空格 + 文案",
        created[0].textContent === "ℹ️　测试信息", j(created[0].textContent));
      T("节点 role=status（供读屏）", created[0].getAttribute("role") === "status", String(created[0].getAttribute("role")));
      T("节点 aria-label = '<级别> 提示：<文案>'",
        created[0].getAttribute("aria-label") === "info 提示：测试信息", String(created[0].getAttribute("aria-label")));
      T("排了 1 个进出场 rAF", rafQ.length === 1, String(rafQ.length));
      T("排了 1 个超时定时器", toQ.length === 1, String(toQ.length));
      T("超时时长 = 传入的 700ms", toQ[0][1] === 700, String(toQ[0][1]));
      T("未触发 rAF 前无 show 类（入场动画未播）", !created[0].classList.contains("show"));
      rafQ[0]();
      T("触发 rAF 后加 show 类（入场动画播放）", created[0].classList.contains("show"));

      // 显式级别覆盖推断
      {
        toastM.clearToasts();
        T("显式 info 覆盖 danger 文案", toastM.showToast("⛔ 失败", 500, "info") === "info");
        fireAll();
        toastM.clearToasts();
        T("显式 danger 覆盖 info 文案", toastM.showToast("普通提示", 500, "danger") === "danger");
        fireAll();
        toastM.clearToasts();
        T("非法级别串回落为推断值", toastM.showToast("🏆 获胜", 500, "bogus") === "success");
        fireAll();
        toastM.clearToasts();
        T("非法级别 null 回落为推断值", toastM.showToast("⛔ 失败", 500, null) === "danger");
        fireAll();
        toastM.clearToasts();
        T("不传级别时按文案推断", toastM.showToast("⚠️ 超速", 500) === "warn");
        fireAll();
      }

      // 默认时长
      {
        toastM.clearToasts();
        toastM.showToast("默认时长", undefined);
        T("ms 缺省 → 900ms", lastMs() === 900, String(lastMs()));
        fireAll();
        toastM.clearToasts();
        toastM.showToast("零时长", 0);
        T("ms=0 被 || 兜底为 900", lastMs() === 900, String(lastMs()));
        fireAll();
        toastM.clearToasts();
        // ms=-100 是真值 → `ms || 900` 拦不住，原样下传给 setTimeout
        // （浏览器里等价 0ms = 立即消失）。前提不成立（无调用点传负值），只记录行为。
        toastM.showToast("负时长", -100);
        T("ms=-100 真值不被 || 兜底，原样下传（等价浏览器 0ms，见报告）", lastMs() === -100, String(lastMs()));
        fireAll();
        toastM.clearToasts();
        toastM.showToast("长时长", 5000);
        T("ms=5000 原样使用", lastMs() === 5000, String(lastMs()));
        fireAll();
        toastM.clearToasts();
        T("文案 null 不抛", toastM.showToast(null) === "info");
        fireAll();
        toastM.clearToasts();
        T("文案 undefined 不抛", toastM.showToast(undefined) === "info");
        fireAll();
        toastM.clearToasts();
        T("文案数字不抛（转字符串）", toastM.showToast(42) === "info");
        fireAll();
      }

      // 同屏上限 + 排队顺序
      {
        toastM.clearToasts();
        rafQ.length = 0; toQ.length = 0; created.length = 0;
        toastM.showToast("①", 1000, "info");
        toastM.showToast("②", 1000, "success");
        toastM.showToast("③", 1000, "warn");
        toastM.showToast("④", 1000, "danger");
        toastM.showToast("⑤", 1000, "info");
        const st = toastM.toastState();
        T("连发 5 条：live 封顶 2", st.live.length === 2, j(st));
        T("连发 5 条：queue 3", st.queue.length === 3, j(st));
        T("live 顺序 = 前两条", j(st.live) === j(["info", "success"]), j(st.live));
        T("queue 保持入队先后（FIFO）", j(st.queue) === j(["warn", "danger", "info"]), j(st.queue));
        T("只有 2 个 DOM 节点（排队中的不建节点）", created.length === 2, String(created.length));
        T("只有 2 个超时定时器", toQ.length === 2, String(toQ.length));

        // 超时移除 + 自动补位（每次 fireNext 消耗一个定时器，与浏览器一致）
        T("① 超时触发返回 true", fireNext());
        const st2 = toastM.toastState();
        T("首条超时后 live 仍为 2（补位顶上）", st2.live.length === 2, j(st2));
        T("首条超时后 queue 减为 2", st2.queue.length === 2, j(st2));
        T("补位进来的是队首 ③(warn)", j(st2.live) === j(["success", "warn"]), j(st2.live));
        T("补位项也建了节点", created.length === 3, String(created.length));
        T("补位项 className = 'toastItm warn'", created[2].className === "toastItm warn", created[2].className);
        T("补位项也在等自己的超时（定时器净 +1）", toQ.length === 2, String(toQ.length));
        T("补位项超时时长沿用 1000ms", toQ[toQ.length - 1][1] === 1000, String(toQ[toQ.length - 1][1]));

        fireNext(); // ② 超时 → ④ 补位
        T("第二条超时后 ④ 补位", j(toastM.toastState().live) === j(["warn", "danger"]), j(toastM.toastState()));
        T("第二条超时后 queue 减为 1", toastM.toastState().queue.length === 1, j(toastM.toastState().queue));
        fireNext(); // ③ 超时 → ⑤ 补位
        T("第三条超时后 ⑤ 补位", j(toastM.toastState().live) === j(["danger", "info"]), j(toastM.toastState()));
        T("第三条超时后 queue 排空", toastM.toastState().queue.length === 0, j(toastM.toastState().queue));
        fireNext(); // ④ 超时，无可补
        T("第四条超时后 live 只剩 ⑤", j(toastM.toastState().live) === j(["info"]), j(toastM.toastState()));
        T("队列已排空", toastM.toastState().queue.length === 0, j(toastM.toastState().queue));
        fireNext(); // ⑤ 超时
        T("最后一条超时后 live 清空", toastM.toastState().live.length === 0, j(toastM.toastState()));
        T("排空后不再补位（无残留定时器）", toQ.length === 0, String(toQ.length));
        T("5 条共建 5 个 DOM 节点", created.length === 5, String(created.length));
        T("定时器队列耗尽后 fireNext 返回 false", fireNext() === false);

        // 满屏时新条目继续按 FIFO 排
        toastM.clearToasts();
        rafQ.length = 0; toQ.length = 0; created.length = 0;
        toastM.showToast("A", 900, "info");
        toastM.showToast("B", 900, "warn");
        toastM.showToast("C", 900, "danger");
        toastM.showToast("D", 900, "success");
        T("满屏后再加：live 仍 2 / queue 2",
          j(toastM.toastState()) === j({ live: ["info", "warn"], queue: ["danger", "success"] }), j(toastM.toastState()));
        toastM.clearToasts();
        T("clearToasts 后 live/queue 全空", j(toastM.toastState()) === j({ live: [], queue: [] }), j(toastM.toastState()));
        // clearToasts 之后旧定时器回调不得复活条目
        const stale = toQ.slice();
        toastM.showToast("新提示", 900, "info");
        const before = toastM.toastState().live.length;
        stale.forEach(([fn]) => fn());
        T("clearToasts 前遗留的回调不会复活已清条目", toastM.toastState().live.length === before,
          `${before} → ${toastM.toastState().live.length}`);
        fireAll();
        toastM.clearToasts();
      }

      // showCombo
      {
        const comboEl = document.getElementById("comboTag");
        toastM.clearToasts();
        toQ.length = 0;
        toastM.showCombo("连招 ×3");
        T("showCombo 写 textContent", comboEl.textContent === "连招 ×3", String(comboEl.textContent));
        T("showCombo 置 opacity=1", comboEl.style.opacity === 1, String(comboEl.style.opacity));
        T("showCombo 置居中缩放 1", comboEl.style.transform === "translate(-50%,-50%) scale(1)", String(comboEl.style.transform));
        T("showCombo 排了 1400ms 收起定时器", toQ.length === 1 && toQ[0][1] === 1400, j(toQ.map((x) => x[1])));
        toQ[0][0]();
        T("定时器到点后 opacity 归 0", comboEl.style.opacity === 0, String(comboEl.style.opacity));
        T("定时器到点后放大淡出", comboEl.style.transform === "translate(-50%,-50%) scale(1.35)", String(comboEl.style.transform));
        // 重复调用应重置计时（clearTimeout + 新建）
        toQ.length = 0;
        toastM.showCombo("连招 ×4");
        toastM.showCombo("连招 ×5");
        T("连续两次 showCombo 只留一个有效定时器（clearTimeout 生效）", toQ.length === 2, String(toQ.length));
        T("后一次的文案覆盖前一次", comboEl.textContent === "连招 ×5", String(comboEl.textContent));
        fireAll();
      }
    } finally {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.setTimeout = origTo;
      globalThis.document.createElement = origCreate;
      toastM.clearToasts();
    }
    T("还原后 requestAnimationFrame 恢复为 noop", globalThis.requestAnimationFrame() === undefined);
    T("还原后 setTimeout 恢复为桩（立即返回 0）", globalThis.setTimeout(() => 1, 1) === 0);
  }

  S("toast：reduced-motion 降级（CSS 侧）");
  {
    // toast 条目自身不做动画：present() 只切 show 类，位移/时长全在 CSS。
    // showCombo 是另一条路径（连招大字，#comboTag），它确实写 style —— 故只查 present()。
    const src = readFileSync(join(process.cwd(), "src", "core", "toast.js"), "utf8");
    const presentSrc = (src.match(/function present\(item\)\s*\{[\s\S]*?\n\}/) || ["", ""])[0];
    T("present() 函数体可被定位（自检：规则不是空转）", presentSrc.length > 50, `${presentSrc.length} 字符`);
    T("present() 不写 style（条目动效不落在 JS）", !/\.style\./.test(presentSrc));
    T("present() 只通过 show 类驱动动画", /classList\.add\("show"\)/.test(presentSrc) && /classList\.remove\("show"\)/.test(presentSrc));
    T("present() 里出现 show 类 = 动画钩子（防止规则写错而恒真）", (presentSrc.match(/classList\./g) || []).length >= 2);
    const css = readFileSync(join(process.cwd(), "styles", "main.css"), "utf8");
    const rm = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
    T("main.css 存在 prefers-reduced-motion: reduce 块", !!rm);
    T("减少动效块内停用 toast 位移（#toast .toastItm { transform: none }）",
      !!rm && /#toast\s+\.toastItm\s*\{\s*transform:\s*none;?\s*\}/.test(rm[1]), rm ? rm[1].trim().slice(0, 120) : "");
    T("减少动效块内统一压掉 transition 时长",
      !!rm && /transition-duration:\s*\.001ms\s*!important/.test(rm[1]));
    T("常态下 .toastItm 有入场位移（否则降级无意义）",
      /#toast\s+\.toastItm\s*\{[^}]*transform:\s*translateY\(6px\)/.test(css));
    T("常态下 .toastItm.show 复位到 translateY(0)",
      /#toast\s+\.toastItm\.show\s*\{[^}]*transform:\s*translateY\(0\)/.test(css));
    T("四型各有一条配色规则（info/success/warn/danger）",
      ["info", "success", "warn", "danger"].every((lv) => new RegExp(`#toast \\.toastItm\\.${lv}\\s*\\{`).test(css)),
      ["info", "success", "warn", "danger"].map((lv) => (new RegExp(`#toast \\.toastItm\\.${lv}\\s*\\{`).test(css) ? lv : `缺${lv}`)).join(" "));
  }

  // ================================================================
  //  6. audio —— 合成 / 静音门 / 降级
  // ================================================================
  S("audio：无 WebAudio 时降级不崩");
  {
    T("initAudio 在无 AudioContext 时不抛", attempt(() => audioM.initAudio()) === null);
    T("window 上确无 AudioContext（前提成立）",
      !win.AudioContext && !win.webkitAudioContext, j([win.AudioContext, win.webkitAudioContext]));
    const SOUNDS = ["playCoinSound", "playCrashSound", "playLandSound", "playFlipSound", "playFuelSound", "playBoostSound", "playAchSound"];
    for (const n of SOUNDS) {
      T(`${n} 无 AudioContext 时不抛（降级静默）`, attempt(() => audioM[n]()) === null);
    }
    T("initAudio 重复调用仍不抛", attempt(() => { audioM.initAudio(); audioM.initAudio(); }) === null);
  }

  S("audio：合成调用链与静音门");
  {
    // 装可控的假 WebAudio，逐节点记录（harness 没有真 AudioContext）
    const made = [];
    class FakeOsc {
      constructor() { this.type = ""; this.frequency = { setValueAtTime: (v) => { this.f0 = v; } }; this.connects = []; this.started = 0; this.stops = []; made.push(this); }
      connect(g) { this.connects.push(g); return g; }
      start(t) { this.started++; this.startT = t; }
      stop(t) { this.stops.push(t); }
    }
    class FakeGain {
      constructor() { this.gain = { setValueAtTime: (v) => { this.g0 = v; }, exponentialRampToValueAtTime: (v, t) => { this.ramp = [v, t]; } }; this.connects = []; made.push(this); }
      connect(d) { this.connects.push(d); return d; }
    }
    const ctxs = [];
    class FakeAC {
      constructor() { this.currentTime = 1.5; this.destination = { name: "destination" }; this.state = "running"; this.resumes = 0; ctxs.push(this); }
      createOscillator() { return new FakeOsc(); }
      createGain() { return new FakeGain(); }
      resume() { this.resumes++; this.state = "running"; return Promise.resolve(); }
    }
    const origTo = globalThis.setTimeout;
    const toQ = [];
    globalThis.setTimeout = (fn, ms) => { toQ.push([fn, ms]); return toQ.length; };
    // 放行所有排好的叠音延时（harness 桩永不回调，只能自己驱动）
    const fireTo = () => { let g = toQ.length + 4; while (toQ.length && g-- > 0) toQ.shift()[0](); };
    win.AudioContext = FakeAC;
    const SOUNDS = ["playCoinSound", "playCrashSound", "playLandSound", "playFlipSound", "playFuelSound", "playBoostSound", "playAchSound"];
    const EXPECT = {
      playCoinSound: { n: 2, freq: [880, 1320], delay: [80] },
      playCrashSound: { n: 2, freq: [120, 80], delay: [] },
      playLandSound: { n: 1, freq: [200], delay: [] },
      playFlipSound: { n: 2, freq: [660, 990], delay: [70] },
      playFuelSound: { n: 2, freq: [320, 480], delay: [60] },
      playBoostSound: { n: 2, freq: [520, 900], delay: [60] },
      playAchSound: { n: 3, freq: [784, 1046, 1318], delay: [110, 220] },
    };
    try {
      store.muted = false;
      audioM.initAudio();
      T("initAudio 创建了恰好 1 个 AudioContext", ctxs.length === 1, String(ctxs.length));
      audioM.initAudio();
      T("二次 initAudio 不重复创建（audioInit 幂等）", ctxs.length === 1, String(ctxs.length));
      ctxs[0].state = "suspended";
      audioM.initAudio();
      T("suspended 状态下 initAudio 触发 resume（切标签页回来自愈）", ctxs[0].resumes === 1, String(ctxs[0].resumes));
      T("resume 后状态转 running", ctxs[0].state === "running", ctxs[0].state);
      audioM.initAudio();
      T("running 状态下不重复 resume", ctxs[0].resumes === 1, String(ctxs[0].resumes));

      for (const n of SOUNDS) {
        made.length = 0; toQ.length = 0;
        audioM[n]();
        const sync = made.filter((m) => m instanceof FakeOsc);
        const nDelays = toQ.length;
        fireTo(); // ★ 自行触发叠音延时
        const all = made.filter((m) => m instanceof FakeOsc);
        const e = EXPECT[n];
        T(`${n}：共合成 ${e.n} 个振荡器`, all.length === e.n, `${all.length} vs ${e.n}`);
        T(`${n}：频率序列 ${j(e.freq)}`, j(all.map((o) => o.f0)) === j(e.freq), j(all.map((o) => o.f0)));
        T(`${n}：同步发声 ${e.n - e.delay.length} 个（余下靠延时叠音）`, sync.length === e.n - e.delay.length, String(sync.length));
        T(`${n}：恰好排了 ${e.delay.length} 个叠音延时`, nDelays === e.delay.length, String(nDelays));
        T(`${n}：波形 ∈ {sine,square,sawtooth,triangle}`,
          all.every((o) => ["sine", "square", "sawtooth", "triangle"].includes(o.type)), all.map((o) => o.type).join());
        T(`${n}：每个振荡器都接了增益节点`, all.every((o) => o.connects.length === 1 && o.connects[0] instanceof FakeGain));
        const gains = made.filter((m) => m instanceof FakeGain);
        T(`${n}：增益节点数 = 振荡器数`, gains.length === all.length, `${gains.length}/${all.length}`);
        T(`${n}：每个增益都接 destination`, gains.every((g) => g.connects[0] === ctxs[0].destination));
        T(`${n}：每个振荡器都 start() 一次`, all.every((o) => o.started === 1));
        T(`${n}：每个振荡器都 stop() 一次`, all.every((o) => o.stops.length === 1));
        T(`${n}：stop 时间 = currentTime + 时长（有限且晚于起点）`,
          all.every((o) => isFinite_(o.stops[0]) && o.stops[0] > ctxs[0].currentTime),
          all.map((o) => o.stops[0]).join(" "));
        T(`${n}：增益指数衰减到 0.001（防爆音）`, gains.every((g) => g.ramp && g.ramp[0] === 0.001),
          gains.map((g) => j(g.ramp)).join(" "));
        T(`${n}：起始增益为正`, gains.every((g) => g.g0 > 0 && g.g0 <= 1), gains.map((g) => num(g.g0)).join(" "));
      }

      // 静音门
      store.muted = true;
      T("前置：store.muted = true", store.muted === true, String(store.muted));
      for (const n of SOUNDS) {
        made.length = 0; toQ.length = 0;
        audioM[n]();
        // ★ 必须把延时叠音也放出来验：静音门在 playTone 内部，
        //   而 setTimeout 是在 playTone 之外排的，叠音同样要一个都不发声。
        fireTo();
        const all = made.filter((m) => m instanceof FakeOsc);
        T(`${n} 静音时不建任何振荡器（含延时叠音）`, all.length === 0, String(all.length));
        T(`${n} 静音时不排任何增益节点`, made.filter((m) => m instanceof FakeGain).length === 0,
          String(made.filter((m) => m instanceof FakeGain).length));
      }
      store.muted = false;
      made.length = 0; toQ.length = 0;
      audioM.playLandSound();
      T("取消静音后立即恢复发声", made.filter((m) => m instanceof FakeOsc).length === 1,
        String(made.filter((m) => m instanceof FakeOsc).length));
      // 静音门必须在 playTone 内部（而非每个 play* 外层）——用"整段静音 + 全量放行"证
      made.length = 0; toQ.length = 0;
      store.muted = true;
      audioM.playCoinSound();
      fireTo();
      T("静音门覆盖同步音与叠音两条路径（playCoinSound 全静）",
        made.filter((m) => m instanceof FakeOsc).length === 0, String(made.filter((m) => m instanceof FakeOsc).length));
      store.muted = false;
    } finally {
      globalThis.setTimeout = origTo;
      delete win.AudioContext;
      store.muted = false;
    }
    T("还原后 window 上无 AudioContext", !win.AudioContext);
    T("还原后 setTimeout 恢复为桩", globalThis.setTimeout(() => 1, 1) === 0);
    T("清理后 store.muted 复位 false", store.muted === false, String(store.muted));
  }

  // ================================================================
  //  7. input —— 键鼠 / 触摸 / 全屏
  // ================================================================
  S("input：window 监听器接线");
  {
    // ★ harness 的 dispatchWin 未导出到 ctx：临时把 window.addEventListener 换成
    //   收集器再调 initInput，就能拿到真实回调引用并直接回放。
    const origAdd = win.addEventListener;
    const captured = [];
    win.addEventListener = (type, fn) => { captured.push([type, fn]); };
    const origQS = globalThis.document.querySelectorAll;
    // ★ harness 的 querySelectorAll 恒返回 []：伪造 .tbtn[data-k] 才能装上触摸键监听
    const mkTbtn = (k) => {
      const b = { dataset: { k }, _l: [], addEventListener(type, fn) { b._l.push([type, fn]); } };
      return b;
    };
    const tbtnL = mkTbtn("left");
    const tbtnR = mkTbtn("right");
    globalThis.document.querySelectorAll = (sel) => (sel === ".tbtn[data-k]" ? [tbtnL, tbtnR] : origQS(sel));
    const calls = { restart: 0, togglePause: 0, toggleShop: 0 };
    const H = {
      restart: () => { calls.restart++; },
      togglePause: () => { calls.togglePause++; },
      toggleShop: () => { calls.toggleShop++; },
    };
    try {
      inputM.initInput(H);
    } finally {
      win.addEventListener = origAdd;
      globalThis.document.querySelectorAll = origQS;
    }
    const find = (t) => { const e = captured.find((c) => c[0] === t); return e && e[1]; };
    const kd = find("keydown"), ku = find("keyup"), blur = find("blur");
    T("initInput 装上 keydown 监听", !!kd);
    T("initInput 装上 keyup 监听", !!ku);
    T("initInput 装上 blur 监听（切窗清按键）", !!blur);
    T("window 监听器恰好 3 个（无多余全局监听）", captured.length === 3, captured.map((c) => c[0]).join());
    T("触摸键各装 6 个监听（touchstart/end/cancel + mousedown/up/mouseleave）",
      tbtnL._l.length === 6 && tbtnR._l.length === 6, `${tbtnL._l.length}/${tbtnR._l.length}`);

    // ---- 键盘：左右键状态映射 ----
    S("input：左右方向键状态映射");
    {
      let pd = 0;
      const ev = (o) => ({ preventDefault: () => { pd++; }, ...o });
      // left：5 种写法
      const LEFT = [
        ["code=ArrowLeft", { code: "ArrowLeft", key: "ArrowLeft" }],
        ["key=ArrowLeft（无 code）", { key: "ArrowLeft" }],
        ["code=KeyA + key=a", { code: "KeyA", key: "a" }],
        ["key=a（无 code）", { key: "a" }],
        ["key=A（大写，经 toLowerCase）", { key: "A" }],
      ];
      for (const [label, e] of LEFT) {
        key.left = false; key.right = false;
        kd(ev(e));
        T(`左：${label} → key.left = true`, key.left === true, String(key.left));
        T(`左：${label} 不误触 key.right`, key.right === false, String(key.right));
        ku(ev(e));
        T(`左：${label} keyup → key.left = false`, key.left === false, String(key.left));
      }
      const RIGHT = [
        ["code=ArrowRight", { code: "ArrowRight", key: "ArrowRight" }],
        ["key=ArrowRight（无 code）", { key: "ArrowRight" }],
        ["code=KeyD + key=d", { code: "KeyD", key: "d" }],
        ["key=d（无 code）", { key: "d" }],
        ["key=D（大写）", { key: "D" }],
      ];
      for (const [label, e] of RIGHT) {
        key.left = false; key.right = false;
        kd(ev(e));
        T(`右：${label} → key.right = true`, key.right === true, String(key.right));
        T(`右：${label} 不误触 key.left`, key.left === false, String(key.left));
        ku(ev(e));
        T(`右：${label} keyup → key.right = false`, key.right === false, String(key.right));
      }
      // 非方向键不改变状态
      const NEUTRAL = [
        ["KeyW/w", { code: "KeyW", key: "w" }],
        ["Space", { code: "Space", key: " " }],
        ["ArrowUp", { code: "ArrowUp", key: "ArrowUp" }],
        ["ArrowDown", { code: "ArrowDown", key: "ArrowDown" }],
        ["数字 1", { code: "Digit1", key: "1" }],
        ["空事件（无 key）", {}],
      ];
      for (const [label, e] of NEUTRAL) {
        key.left = true; key.right = true;
        kd(ev(e));
        T(`中性键 ${label} keydown 不改状态`, key.left === true && key.right === true, j(key));
        ku(ev(e));
        T(`中性键 ${label} keyup 不改状态`, key.left === true && key.right === true, j(key));
      }
      key.left = false; key.right = false;
      // 同按左右（空翻用）
      kd(ev({ code: "ArrowLeft", key: "ArrowLeft" }));
      kd(ev({ code: "ArrowRight", key: "ArrowRight" }));
      T("左右同按：两键同时为 true（空中转体条件）", key.left === true && key.right === true, j(key));
      ku(ev({ code: "ArrowLeft", key: "ArrowLeft" }));
      T("松开左：仅剩右", key.left === false && key.right === true, j(key));
      ku(ev({ code: "ArrowRight", key: "ArrowRight" }));
      T("松开右：全空", key.left === false && key.right === false, j(key));
      // 未按过的键 keyup 不报错
      T("未按下即 keyup 不抛", attempt(() => ku(ev({ code: "ArrowLeft", key: "ArrowLeft" }))) === null);
      T("keyup 无 key/code 不抛", attempt(() => ku(ev({}))) === null);
      // preventDefault
      pd = 0;
      kd(ev({ code: "ArrowLeft", key: "ArrowLeft" }));
      T("ArrowLeft keydown 阻止默认（防页面滚动）", pd === 1, String(pd));
      pd = 0;
      kd(ev({ code: "ArrowRight", key: "ArrowRight" }));
      T("ArrowRight keydown 阻止默认", pd === 1, String(pd));
      pd = 0;
      kd(ev({ code: "ArrowUp", key: "ArrowUp" }));
      T("ArrowUp 不阻止默认（未被 bind 接管）", pd === 0, String(pd));
      key.left = false; key.right = false;
      // blur 清键
      key.left = true; key.right = true;
      bike.angVel = 7.5;
      blur();
      T("blur 后左右键全清（切窗不卡住油门）", key.left === false && key.right === false, j(key));
      T("blur 后 angVel 归零（切窗不空翻）", bike.angVel === 0, num(bike.angVel));
      T("blur 幂等（再调一次不抛）", attempt(() => blur()) === null);
    }

    // ---- 键盘：P / Esc / R / U / M / 缩放 ----
    S("input：P / Esc 暂停（按流程状态门控）");
    {
      const ev = (o) => ({ preventDefault: () => { ev._pd = (ev._pd || 0) + 1; }, ...o });
      for (const [state, shouldWork, label] of [
        ["play", true, "play"],
        ["pause", true, "pause"],
        ["menu", false, "menu"],
        ["ended", false, "ended"],
      ]) {
        for (const [code, name] of [["KeyP", "P"], ["Escape", "Esc"]]) {
          store.state = state;
          const before = calls.togglePause;
          kd(ev({ code, key: name === "P" ? "p" : "Escape" }));
          const fired = calls.togglePause > before;
          T(`${label} 态按 ${name} ${shouldWork ? "触发" : "不触发"} togglePause`, fired === shouldWork, `${before} → ${calls.togglePause}`);
          T(`${label} 态按 ${name} 不改方向键`, key.left === false && key.right === false, j(key));
        }
      }
      store.state = "play";
      const b0 = calls.togglePause;
      kd(ev({ code: "KeyP", key: "p" }));
      kd(ev({ code: "KeyP", key: "p" }));
      T("连续两次 P 切换两次（不吞事件）", calls.togglePause === b0 + 2, String(calls.togglePause));
    }

    S("input：R 重开（play/pause/ended 有效，menu 无效）");
    {
      const ev = (o) => ({ preventDefault: () => {}, ...o });
      for (const [state, shouldWork] of [["play", true], ["pause", true], ["ended", true], ["menu", false]]) {
        store.state = state;
        const before = calls.restart;
        toastM.clearToasts();
        kd(ev({ code: "KeyR", key: "r" }));
        T(`${state} 态按 R ${shouldWork ? "触发" : "不触发"} restart`, (calls.restart > before) === shouldWork,
          `${before} → ${calls.restart}`);
        if (shouldWork) {
          T(`${state} 态按 R 弹出「重新开始」提示`, toastM.toastState().live.length === 1, j(toastM.toastState()));
        }
      }
      store.state = "play";
      T("R 不改方向键", key.left === false && key.right === false, j(key));
      toastM.clearToasts();
    }

    S("input：U 车间（与流程状态无关，任何态都开）");
    {
      const ev = (o) => ({ preventDefault: () => {}, ...o });
      for (const state of ["menu", "play", "pause", "ended"]) {
        store.state = state;
        const before = calls.toggleShop;
        kd(ev({ code: "KeyU", key: "u" }));
        T(`${state} 态按 U 都触发 toggleShop`, calls.toggleShop === before + 1, `${before} → ${calls.toggleShop}`);
      }
      T("U 不改方向键", key.left === false && key.right === false, j(key));
    }

    S("input：M 静音开关（写盘 + 提示）");
    {
      const ev = (o) => ({ preventDefault: () => {}, ...o });
      const snap = {};
      for (const k of Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))) {
        snap[k] = localStorage.getItem(k);
      }
      const m0 = store.muted;
      store.muted = false;
      toastM.clearToasts();
      kd(ev({ code: "KeyM", key: "m" }));
      T("按 M → store.muted = true", store.muted === true, String(store.muted));
      T("按 M 弹出「已静音」提示", toastM.toastState().live.length === 1, j(toastM.toastState()));
      T("按 M 后 localStorage.bike_mute = '1'（已落盘）",
        localStorage.getItem("bike_mute") === "1", String(localStorage.getItem("bike_mute")));
      toastM.clearToasts();
      kd(ev({ code: "KeyM", key: "m" }));
      T("再按 M → store.muted = false", store.muted === false, String(store.muted));
      T("再按 M 后 localStorage.bike_mute = '0'",
        localStorage.getItem("bike_mute") === "0", String(localStorage.getItem("bike_mute")));
      T("连续三次 M 回到原状态", (() => { kd(ev({ code: "KeyM", key: "m" })); const x = store.muted; kd(ev({ code: "KeyM", key: "m" })); return x === true && store.muted === false; })());
      toastM.clearToasts();
      store.muted = m0;
      for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
      for (const k of Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))) {
        if (!(k in snap)) localStorage.removeItem(k);
      }
      T("M 快捷键写盘后已把 localStorage 还原", localStorage.length === Object.keys(snap).length,
        `${localStorage.length} vs ${Object.keys(snap).length}`);
    }

    S("input：+ / − 缩放（0.6~2.5 钳制）");
    {
      const ev = (o) => ({ preventDefault: () => {}, ...o });
      const z0 = store.cam.zoom;
      store.cam.zoom = 1.4;
      kd(ev({ code: "Equal", key: "+" }));
      T("Equal → zoom +0.15", near(store.cam.zoom, 1.55, 1e-12), num(store.cam.zoom));
      kd(ev({ code: "Minus", key: "-" }));
      T("Minus → zoom −0.15（回到 1.4）", near(store.cam.zoom, 1.4, 1e-12), num(store.cam.zoom));
      for (let i = 0; i < 20; i++) kd(ev({ code: "Equal", key: "+" }));
      T("连按 Equal 20 次 → 收敛到上界 2.5", near(store.cam.zoom, 2.5, 1e-12), num(store.cam.zoom));
      kd(ev({ code: "Equal", key: "+" }));
      T("上界再按 Equal 不越界", store.cam.zoom === 2.5, num(store.cam.zoom));
      for (let i = 0; i < 40; i++) kd(ev({ code: "Minus", key: "-" }));
      T("连按 Minus 40 次 → 收敛到下界 0.6", near(store.cam.zoom, 0.6, 1e-12), num(store.cam.zoom));
      kd(ev({ code: "Minus", key: "-" }));
      T("下界再按 Minus 不越界", store.cam.zoom === 0.6, num(store.cam.zoom));
      T("缩放全程不越 [0.6, 2.5]", store.cam.zoom >= 0.6 && store.cam.zoom <= 2.5, num(store.cam.zoom));
      T("缩放键不改方向键", key.left === false && key.right === false, j(key));
      store.cam.zoom = z0;
    }

    // ---- 触摸键 ----
    S("input：触摸方向键（6 种事件全绑定）");
    {
      // ★ 计数器挂在闭包外的对象上：写在 ev（工厂函数）上的属性每次调用都会被重置
      const pd = { n: 0 };
      const ev = (type) => ({ type, preventDefault: () => { pd.n++; } });
      const L = tbtnL._l, R = tbtnR._l;
      const get = (btn, type) => btn._l.find((x) => x[0] === type)[1];
      T("左键 touchstart → key.left = true",
        (() => { key.left = false; get(tbtnL, "touchstart")(ev("touchstart")); return key.left === true; })(), String(key.left));
      T("左键 touchend → key.left = false",
        (() => { get(tbtnL, "touchend")(ev("touchend")); return key.left === false; })(), String(key.left));
      T("左键 touchcancel → key.left = false（滑出按钮也要松）",
        (() => { key.left = true; get(tbtnL, "touchcancel")(ev("touchcancel")); return key.left === false; })());
      T("左键 mousedown → key.left = true",
        (() => { key.left = false; get(tbtnL, "mousedown")(ev("mousedown")); return key.left === true; })());
      T("左键 mouseup → key.left = false",
        (() => { get(tbtnL, "mouseup")(ev("mouseup")); return key.left === false; })());
      T("左键 mouseleave → key.left = false",
        (() => { key.left = true; get(tbtnL, "mouseleave")(ev("mouseleave")); return key.left === false; })());
      T("右键 touchstart → key.right = true",
        (() => { key.right = false; get(tbtnR, "touchstart")(ev("touchstart")); return key.right === true; })());
      T("右键 touchend → key.right = false",
        (() => { get(tbtnR, "touchend")(ev("touchend")); return key.right === false; })());
      T("右键 touchcancel → key.right = false",
        (() => { key.right = true; get(tbtnR, "touchcancel")(ev("touchcancel")); return key.right === false; })());
      T("右键 mousedown → key.right = true",
        (() => { key.right = false; get(tbtnR, "mousedown")(ev("mousedown")); return key.right === true; })());
      T("右键 mouseup → key.right = false",
        (() => { get(tbtnR, "mouseup")(ev("mouseup")); return key.right === false; })());
      T("右键 mouseleave → key.right = false",
        (() => { key.right = true; get(tbtnR, "mouseleave")(ev("mouseleave")); return key.right === false; })());
      T("触摸与鼠标可同时驱动（模拟器双报）",
        (() => { key.left = key.right = false; get(tbtnL, "touchstart")(ev("touchstart")); get(tbtnR, "mousedown")(ev("mousedown")); const both = key.left && key.right; get(tbtnL, "touchend")(ev("touchend")); get(tbtnR, "mouseup")(ev("mouseup")); return both && !key.left && !key.right; })());
      // 6 个事件复用 on/off 两个处理器，两者都调 preventDefault
      // （mousedown 复用 on、mouseleave 复用 off），所以 12 条全都要阻止默认。
      const pe = ev("x");
      pd.n = 0;
      for (const b of [tbtnL, tbtnR]) {
        for (const type of ["touchstart", "touchend", "touchcancel", "mousedown", "mouseup", "mouseleave"]) {
          get(b, type)(pe);
        }
      }
      T("12 个触摸/鼠标事件全部 preventDefault（防选字/拖拽/滚动）", pd.n === 12, String(pd.n));
      get(tbtnL, "mouseup")(pe); get(tbtnR, "mouseup")(pe);
      T("触摸键 up 后左右皆空", key.left === false && key.right === false, j(key));
    }

    // ---- 触摸可见性（🎮 手动开关 × 是否在游戏中）----
    S("input：触摸键可见性 —— 桌面端恒不显示");
    {
      // 本小节跑的 initInput 是在**无 matchMedia、maxTouchPoints=0** 下调用的
      // → isTouch=false → touchWanted=false。故可见性在所有流程态下都应为 false：
      // 这正是"桌面端不凭空冒出方向键"的回归点。
      const touchEl = document.getElementById("touch");
      const touchBtn = document.getElementById("touchBtn");
      T("桌面端 initInput 后 🎮 未打 on（用户开关默认关）",
        touchBtn.classList.contains("on") === false, String(touchBtn.classList.contains("on")));
      for (const state of ["menu", "play", "pause", "ended", "race"]) {
        store.state = state;
        inputM.syncTouchVisibility();
        T(`桌面端 ${state} 态：touchActive = false（不凭空冒出方向键）`,
          inputM.touchActive === false, String(inputM.touchActive));
        T(`桌面端 ${state} 态：#touch 带 hidden`, touchEl.classList.contains("hidden") === true,
          String(touchEl.classList.contains("hidden")));
      }
      store.state = "play";
      inputM.syncTouchVisibility();
      T("桌面端即使在游戏中也不显示触摸键", inputM.touchActive === false, String(inputM.touchActive));
      store.state = "menu";
      T("syncTouchVisibility 反复调用不抛（幂等）",
        attempt(() => { inputM.syncTouchVisibility(); inputM.syncTouchVisibility(); }) === null);
    }
    S("input：触屏设备判定（pointer:coarse）与 🎮 手动开关");
    {
      const touchEl = document.getElementById("touch");
      const touchBtn = document.getElementById("touchBtn");
      const origAdd = win.addEventListener;
      const origQS = globalThis.document.querySelectorAll;
      const captured = [];
      win.addEventListener = (type, fn) => { captured.push([type, fn]); };
      globalThis.document.querySelectorAll = () => [];
      const savedMM = win.matchMedia;
      win.matchMedia = (q) => ({ matches: true, media: q, addEventListener: () => {} });
      const savedTP = globalThis.navigator.maxTouchPoints;
      try { globalThis.navigator.maxTouchPoints = 5; } catch (e) { /* 只读则忽略 */ }
      try {
        inputM.initInput({});
      } finally {
        win.addEventListener = origAdd;
        globalThis.document.querySelectorAll = origQS;
      }
      T("触屏判定后 initInput 仍只装 3 个 window 监听", captured.length === 3, String(captured.length));
      T("🎮 按钮被打上 on 类（用户开关默认开）", touchBtn.classList.contains("on"), String(touchBtn.classList.contains("on")));
      store.state = "menu";
      inputM.syncTouchVisibility();
      T("触屏 + menu 态：仍不显示触摸键（不挡主菜单）", inputM.touchActive === false, String(inputM.touchActive));
      store.state = "play";
      inputM.syncTouchVisibility();
      T("触屏 + play 态：显示触摸键", inputM.touchActive === true, String(inputM.touchActive));
      T("触屏 + play 态：#touch 移除 hidden", !touchEl.classList.contains("hidden"));
      const click = touchBtn._listeners.get("click");
      T("🎮 按钮装了 click 监听", !!click && click.length === 2, String(click && click.length));
      // 两次 initInput 叠加了两份 click，用最后一份
      const on = click[click.length - 1];
      on({});
      T("🎮 点一下 → 用户关掉触摸键", touchBtn.classList.contains("on") === false, String(touchBtn.classList.contains("on")));
      inputM.syncTouchVisibility();
      T("手动关掉后 play 态也不显示", inputM.touchActive === false, String(inputM.touchActive));
      T("手动关掉后 #touch 恢复 hidden", touchEl.classList.contains("hidden"));
      on({});
      T("🎮 再点一下 → 重新打开", touchBtn.classList.contains("on") === true, String(touchBtn.classList.contains("on")));
      inputM.syncTouchVisibility();
      T("重新打开后 play 态恢复显示", inputM.touchActive === true, String(inputM.touchActive));
      T("重新打开后 #touch 移除 hidden", !touchEl.classList.contains("hidden"));
      store.state = "pause";
      inputM.syncTouchVisibility();
      T("暂停时触摸键仍在（要能继续开）", inputM.touchActive === true, String(inputM.touchActive));
      store.state = "menu";
      inputM.syncTouchVisibility();
      T("回菜单时触摸键消失", inputM.touchActive === false, String(inputM.touchActive));
      if (savedMM === undefined) delete win.matchMedia; else win.matchMedia = savedMM;
      try { globalThis.navigator.maxTouchPoints = savedTP; } catch (e) { /* 忽略 */ }
      // 复位成桌面端默认
      on({});
      on({});
      store.state = "menu";
      inputM.syncTouchVisibility();
    }

    // ---- 全屏 ----
    S("input：全屏切换");
    {
      const fullBtn = document.getElementById("fullBtn");
      const lst = fullBtn._listeners.get("click");
      T("#fullBtn 装了 click 监听", !!lst, String(lst && lst.length));
      const on = lst[lst.length - 1];
      const doc = globalThis.document;
      const origExit = doc.exitFullscreen;
      const origReq = doc.documentElement.requestFullscreen;
      const origWebkitExit = doc.webkitExitFullscreen;
      const origWebkitReq = doc.documentElement.webkitRequestFullscreen;
      const origFsEl = doc.fullscreenElement;
      const origWebkitFsEl = doc.webkitFullscreenElement;
      let reqN = 0, exitN = 0, wreqN = 0, wexitN = 0;
      doc.documentElement.requestFullscreen = () => { reqN++; return Promise.resolve(); };
      doc.documentElement.webkitRequestFullscreen = () => { wreqN++; return Promise.resolve(); };
      doc.exitFullscreen = () => { exitN++; return Promise.resolve(); };
      doc.webkitExitFullscreen = () => { wexitN++; return Promise.resolve(); };
      try {
        doc.fullscreenElement = null; doc.webkitFullscreenElement = null;
        on({});
        T("非全屏时点击 → requestFullscreen", reqN === 1, String(reqN));
        T("非全屏时不调 exitFullscreen", exitN === 0, String(exitN));
        doc.fullscreenElement = {};
        on({});
        T("全屏中点击 → exitFullscreen", exitN === 1, String(exitN));
        T("全屏中不再 requestFullscreen", reqN === 1, String(reqN));
        // webkit 前缀路径：必须先删掉标准 exitFullscreen，否则永远走不到 webkit 分支
        doc.fullscreenElement = null;
        doc.webkitFullscreenElement = {};
        delete doc.exitFullscreen;
        on({});
        T("webkitFullscreenElement 也算" + "在" + "全屏中 → 回落 webkitExitFullscreen", wexitN === 1, String(wexitN));
        T("无标准 exit 接口时不误调它", exitN === 1, String(exitN));
        doc.webkitFullscreenElement = null;
        // 只有 webkit 请求接口时
        doc.documentElement.requestFullscreen = undefined;
        on({});
        T("无标准请求接口时回落 webkitRequestFullscreen", wreqN === 1, String(wreqN));
        // 两者皆无时优雅降级
        doc.documentElement.webkitRequestFullscreen = undefined;
        const err = attempt(() => on({}));
        T("两种全屏接口都缺时不抛（优雅降级）", err === null, String(err));
        doc.fullscreenElement = null; doc.webkitFullscreenElement = null;
      } finally {
        doc.exitFullscreen = origExit;
        doc.webkitExitFullscreen = origWebkitExit;
        doc.fullscreenElement = origFsEl;
        doc.webkitFullscreenElement = origWebkitFsEl;
        if (origReq === undefined) delete doc.documentElement.requestFullscreen;
        else doc.documentElement.requestFullscreen = origReq;
        if (origWebkitReq === undefined) delete doc.documentElement.webkitRequestFullscreen;
        else doc.documentElement.webkitRequestFullscreen = origWebkitReq;
      }
      T("全屏相关接口已还原", doc.exitFullscreen === origExit && doc.fullscreenElement === origFsEl);
    }
  }

  // ================================================================
  //  8. 自检：本文件没有污染全局状态
  // ================================================================
  S("自检：全局状态零污染");
  {
    key.left = false; key.right = false;
    T("key 复位", j(key) === j(PRISTINE.key), j(key));
    T("window 视口/DPR 复原", j([win.innerWidth, win.innerHeight, win.devicePixelRatio]) === j(PRISTINE.winWH),
      j([win.innerWidth, win.innerHeight, win.devicePixelRatio]));
    T("view 复原到 1280×720", view.W === 1280 && view.H === 720, `${view.W}×${view.H}`);
    T("store 顶层数值未被本文件改写",
      j({ ...store, cam: { ...store.cam }, run: { ...store.run } }) === PRISTINE.store);
    T("store.state 复位 menu", store.state === "menu", store.state);
    T("store.cam.zoom 复位 1.4", store.cam.zoom === 1.4, num(store.cam.zoom));
    T("store.muted 复位 false", store.muted === false, String(store.muted));
    T("world 数组长度未被本文件改写",
      j(Object.keys(world).map((k) => (Array.isArray(world[k]) ? world[k].length : world[k]))) === j(PRISTINE.worldLen));
    // input 小节的 R/M/缩放 键都会弹提示（setTimeout 是桩，永不移除）→ 收尾清一次
    toastM.clearToasts();
    T("toast 已清空", j(toastM.toastState()) === j({ live: [], queue: [] }), j(toastM.toastState()));
    T("setTimeout 恢复为 harness 桩", globalThis.setTimeout(() => 1, 1) === 0);
    T("requestAnimationFrame 恢复为 noop", globalThis.requestAnimationFrame() === undefined);
    T("window.addEventListener 恢复收集器", typeof win.addEventListener === "function");
    T("window 上无残留 matchMedia/AudioContext", !win.matchMedia && !win.AudioContext);
    T("document.querySelectorAll 恢复原桩（返回 []）", globalThis.document.querySelectorAll(".tbtn[data-k]").length === 0);
    T("document.fullscreenElement 复位 null", globalThis.document.fullscreenElement === null, String(globalThis.document.fullscreenElement));
  }
}
