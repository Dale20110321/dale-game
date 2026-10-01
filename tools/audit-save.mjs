// ============================================================
//  存档 / 进度 / 排位 / 导入导出 —— 深度体检
//
//  契约：
//    · 本文件不 import 任何 harness；断言与分区全部来自 ctx
//    · 每个用例前后清理 localStorage（try/finally），用例之间零污染
//    · 允许 try/catch 捕获异常并作为失败项报告，绝不让脚本崩掉
//    · UTF-8 无 BOM
//
//  本文件刻意不修改任何其它文件：发现的缺陷只作为失败项报告，由调用方决定是否修复。
// ============================================================

export default async function (ctx) {
  const { check, section, imp } = ctx;

  // ---------------- 依赖（全部走 ctx.imp，路径相对 src/） ----------------
  const { store, bike } = await imp("core/store.js");
  const { key } = await imp("core/input.js");
  const st = await imp("core/storage.js");
  const gameM = await imp("game/game.js");
  const progM = await imp("game/progress.js");
  const raceM = await imp("game/race.js");
  const { LEVELS, BRANCHES, LEVELS_PER_BRANCH, N_BRANCHES } = await imp("config/levels.js");
  const { VEHICLES } = await imp("config/vehicles.js");
  const {
    ACHS, RANKS, MAX_LV, DT,
    RATING_ADVANCED, RATING_PEAK, RATING_MIN,
    RATING_WIN_GAIN, RATING_LOSS, RATING_WIN_GAIN_ADVANCED, RATING_LOSS_ADVANCED,
    rankName, SAVE_APP, SAVE_FORMAT, SAVE_KEYS,
  } = await imp("config/constants.js");

  const LV = LEVELS.length;
  const NV = VEHICLES.length;
  const LS = globalThis.localStorage;

  // ---------------- 本文件自带的零依赖小工具 ----------------
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const isInt = (v) => typeof v === "number" && Number.isInteger(v);
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const near = (a, b, tol) => typeof a === "number" && Math.abs(a - b) <= tol;
  const j = (v) => { try { return JSON.stringify(v); } catch (e) { return "«不可序列化»"; } };
  const sum = (a) => (Array.isArray(a) ? a.reduce((x, y) => x + (Number(y) || 0), 0) : -1);

  /** localStorage 中全部 bike_ 前缀键的原文快照 */
  const snapRaw = () => {
    const o = {};
    for (let i = 0; i < LS.length; i++) {
      const k = LS.key(i);
      if (k && k.indexOf("bike_") === 0) o[k] = LS.getItem(k);
    }
    return o;
  };
  /** 覆盖 localStorage 中全部 bike_ 前缀键（先删后写，保证快照可控） */
  const putAll = (map) => {
    for (const k of Object.keys(snapRaw())) LS.removeItem(k);
    for (const [k, v] of Object.entries(map)) LS.setItem(k, v);
  };
  /** 干净基线：清空 → resetSave()（写入 15 个合法默认键并把 store 一并复位）→ 状态回菜单 */
  const fresh = () => {
    LS.clear();
    st.resetSave();
    store.state = "menu";
    store.lvIdx = 0;
  };
  /** 完整读档（与 main.js 首屏顺序一致：loadSave → loadAchList → loadProgress） */
  const loadAll = () => { st.loadSave(); st.loadAchList(); st.loadProgress(); };
  /** 单个用例：前置清场 → 执行 fn → 无论成败都还原干净基线 */
  const run = (fn) => {
    fresh();
    try { return fn(); }
    catch (e) { return { threw: e && e.message ? e.message : String(e) }; }
    finally { fresh(); }
  };
  /** 物理层派生量是否全部有限（NaN 传播的探针） */
  const physFinite = () =>
    isNum(store.phys.MAXV) && isNum(store.phys.torquePeak) && isNum(store.phys.brakePeak) &&
    isObj(store.phys.rb) && isNum(store.phys.rb.mTot) && isNum(store.phys.rb.iBody) &&
    isObj(store.phys.susp) && isNum(store.phys.susp.k) && isNum(store.phys.susp.travel) &&
    isNum(store.phys.mu);

  // ============================================================
  //  0. 基线夹具：一份"全 15 键皆有区分度哨兵值"的自洽存档
  // ============================================================
  // 星级：全 3 星，唯独倒数第 2 关留 0 → 12 条支线里恰好 11 条通关（第 12 条缺 1 关）
  const BASE_STARS = new Array(LV).fill(3);
  BASE_STARS[LV - 2] = 0;
  const BASE_STAT = {
    totalRuns: 11, totalMeters: 12345.6, totalSeconds: 678.9, lastPlayed: "2021-06-07T08:09:10.000Z",
  };
  const BASE_RAW = {
    [SAVE_KEYS.gold]: "1234",
    [SAVE_KEYS.up]: j({
      trail: { engine: 1, tire: 2, frame: 3, susp: 4 },
      sport: { engine: 5, tire: 6, frame: 7, susp: 8 },
    }),
    [SAVE_KEYS.unlocked]: "17",
    [SAVE_KEYS.stars]: j(BASE_STARS),
    [SAVE_KEYS.veh]: "1",
    [SAVE_KEYS.owned]: "[0,1]",
    [SAVE_KEYS.mute]: "1",
    [SAVE_KEYS.best]: "4321",
    [SAVE_KEYS.ach]: j(["air", "flip"]),
    [SAVE_KEYS.ver]: "3",
    [SAVE_KEYS.prog]: j({ finaleDone: true, invited: true, wins: 3, losses: 4, peak: true, freeThemes: [0, 1] }),
    [SAVE_KEYS.rating]: "1350",
    [SAVE_KEYS.stat]: j(BASE_STAT),
    [SAVE_KEYS.ultra]: j({ sport: true }),
    [SAVE_KEYS.sel]: "23",
  };
  const ALL_KEY_FIELDS = Object.values(SAVE_KEYS);
  const loadBaseline = () => { putAll(BASE_RAW); loadAll(); };
  const ZERO_STAT = j({ totalRuns: 0, totalMeters: 0, totalSeconds: 0, lastPlayed: "" });

  // 每个键的：合法写入 → store 读回值 / 合法性判据 / 损坏后的合法默认值判据
  const KEY_TABLE = [
    {
      name: "gold", label: "金币",
      field: () => store.gold,
      valid: (v) => v === 1234,
      legal: (v) => isInt(v) && v >= 0,
      dft: (v) => v === 0,
    },
    {
      name: "up", label: "升级表",
      field: () => store.upgrades,
      valid: (v) => isObj(v) && isObj(v.sport) && v.sport.engine === 5 && v.sport.susp === 8 &&
        isObj(v.trail) && v.trail.engine === 1 && isObj(st.getUp()) && isNum(st.getUp().engine),
      legal: (v) => isObj(v) && isObj(st.getUp()) &&
        ["engine", "tire", "frame", "susp"].every((f) => isNum(st.getUp()[f]) && st.getUp()[f] >= 0),
      dft: () => true,
    },
    {
      name: "unlocked", label: "已解锁关卡下标",
      field: () => store.unlocked,
      valid: (v) => v === 17,
      legal: (v) => isInt(v) && v >= 0 && v <= LV - 1,
      dft: (v) => v === 0,
    },
    {
      name: "stars", label: "星级数组",
      field: () => store.stars,
      valid: (v) => Array.isArray(v) && v.length === LV && v[0] === 3 && v[LV - 2] === 0 && v[LV - 1] === 3 && sum(v) === (LV - 1) * 3,
      legal: (v) => Array.isArray(v) && v.length === LV && v.every((s) => isNum(s) && s >= 0),
      dft: (v) => Array.isArray(v) && v.length === LV && v.every((s) => s === 0),
    },
    {
      name: "veh", label: "当前车辆下标",
      field: () => store.currentVehicle,
      valid: (v) => v === 1 && VEHICLES[v].id === "sport",
      legal: (v) => isInt(v) && v >= 0 && v < NV,
      dft: (v) => v === 0,
    },
    {
      name: "owned", label: "已拥有车辆下标",
      field: () => store.ownedVehicles,
      valid: (v) => Array.isArray(v) && v.length === 2 && v[0] === 0 && v[1] === 1,
      legal: (v) => Array.isArray(v) && v.length > 0 && v.every((i) => isInt(i) && i >= 0 && i < NV),
      dft: (v) => Array.isArray(v) && v.length > 0 && v.every((i) => isInt(i) && i >= 0 && i < NV),
    },
    {
      name: "mute", label: "静音开关",
      field: () => store.muted,
      valid: (v) => v === true,
      legal: (v) => typeof v === "boolean",
      dft: (v) => v === false,
    },
    {
      name: "best", label: "最佳里程",
      field: () => store.best,
      valid: (v) => v === 4321,
      legal: (v) => isInt(v) && v >= 0,
      dft: (v) => v === 0,
    },
    {
      name: "ach", label: "成就列表",
      field: () => store.achGot,
      valid: (v) => Array.isArray(v) && v.length === 2 && v[0] === "air" && v[1] === "flip",
      legal: (v) => Array.isArray(v) && v.every((id) => ACHS.some((a) => a.id === id)),
      dft: (v) => Array.isArray(v) && v.length === 0,
    },
    {
      name: "ver", label: "存档版本号",
      // ver 没有 store 字段，用落盘后的原文作为读回值
      field: () => LS.getItem(SAVE_KEYS.ver),
      valid: (v) => v === "3",
      legal: (v) => isInt(parseInt(v, 10)) && parseInt(v, 10) >= 3,
      dft: (v) => v === "3",
    },
    {
      name: "prog", label: "进度阶梯",
      field: () => store.progress,
      valid: (v) => v.finaleDone === true && v.invited === true && v.wins === 3 && v.losses === 4 && v.peak === true,
      legal: (v) => typeof v.finaleDone === "boolean" && typeof v.invited === "boolean" &&
        typeof v.peak === "boolean" && isInt(v.wins) && v.wins >= 0 && isInt(v.losses) && v.losses >= 0 &&
        isInt(v.rating) && v.rating >= 0 && Array.isArray(v.freeThemes),
      dft: (v) => v.finaleDone === false && v.invited === false && v.wins === 0 && v.losses === 0 && v.peak === false,
    },
    {
      name: "rating", label: "排位段位分",
      field: () => store.progress.rating,
      valid: (v) => v === 1350 && rankName(v) === "铂金",
      legal: (v) => isInt(v) && v >= 0,
      dft: (v) => v === 0,
    },
    {
      name: "stat", label: "累计统计",
      field: () => store.stat,
      valid: (v) => v.totalRuns === 11 && near(v.totalMeters, 12345.6, 1e-9) && near(v.totalSeconds, 678.9, 1e-9) && v.lastPlayed === BASE_STAT.lastPlayed,
      legal: (v) => isNum(v.totalRuns) && v.totalRuns >= 0 && isNum(v.totalMeters) && v.totalMeters >= 0 &&
        isNum(v.totalSeconds) && v.totalSeconds >= 0 && typeof v.lastPlayed === "string",
      dft: (v) => v.totalRuns === 0 && v.totalMeters === 0 && v.totalSeconds === 0 && v.lastPlayed === "",
    },
    {
      name: "ultra", label: "终极模式解锁",
      field: () => store.ultra,
      valid: (v) => isObj(v) && v.sport === true,
      legal: (v) => isObj(v) && Object.values(v).every((x) => typeof x === "boolean"),
      dft: (v) => isObj(v) && Object.keys(v).length === 0,
    },
    {
      name: "sel", label: "当前选中关卡",
      field: () => store.selLevel,
      valid: (v) => v === 23,
      legal: (v) => isInt(v) && v >= 0 && v <= LV - 1,
      dft: (v) => v === 0,
    },
  ];

  // ============================================================
  //  1. 逐存档键体检（15 键 × 8 项）
  // ============================================================
  section(`逐存档键（SAVE_KEYS 共 ${ALL_KEY_FIELDS.length} 键，每键 8 项）`);
  {
    check("SAVE_KEYS 键名与历史版本完全一致（无改名 / 无新增 / 无遗漏）",
      ALL_KEY_FIELDS.length === 15 &&
      new Set(ALL_KEY_FIELDS).size === 15 &&
      ALL_KEY_FIELDS.every((k) => k.indexOf("bike_") === 0) &&
      ALL_KEY_FIELDS.includes(SAVE_KEYS.ver) && SAVE_KEYS.ver === "bike_v",
      `${ALL_KEY_FIELDS.length} 键：${ALL_KEY_FIELDS.join(" ")}`);

    for (const K of KEY_TABLE) {
      // 1) 合法写入 → 读回
      const r1 = run(() => {
        loadBaseline();
        return { v: K.field() };
      });
      check(`${K.label} bike_ 合法值写入后能原样读回（${K.name}）`,
        !r1.threw && K.valid(r1.v), r1.threw ? `抛异常：${r1.threw}` : `读回 ${j(r1.v).slice(0, 70)}`);

      // 2) 类型正确
      check(`${K.label} 读回后类型正确（${K.name}）`,
        !r1.threw && K.legal(r1.v),
        r1.threw ? `抛异常：${r1.threw}` : `${K.name} 读回类型：${Array.isArray(r1.v) ? "array" : typeof r1.v}`);

      // 3) 原文确实落盘
      const r2 = run(() => {
        loadBaseline();
        return { raw: LS.getItem(SAVE_KEYS[K.name]) };
      });
      check(`${K.label} 原文按写入值落盘且可再次读出（${K.name}）`,
        !r2.threw && r2.raw === BASE_RAW[SAVE_KEYS[K.name]],
        r2.threw ? `抛异常：${r2.threw}` : `落盘 ${String(r2.raw).slice(0, 46)}（期望 ${String(BASE_RAW[SAVE_KEYS[K.name]]).slice(0, 46)}）`);

      // 4) 导出时逐字节包含该键
      const r3 = run(() => {
        loadBaseline();
        return { d: st.exportSave() };
      });
      check(`${K.label} 导出 data 含该键且与 localStorage 原文一致（${K.name}）`,
        !r3.threw && isObj(r3.d.data) && r3.d.data[SAVE_KEYS[K.name]] === BASE_RAW[SAVE_KEYS[K.name]],
        r3.threw ? `抛异常：${r3.threw}` : `data.${SAVE_KEYS[K.name]} = ${String(r3.d.data[SAVE_KEYS[K.name]]).slice(0, 46)}`);

      // 5) 删除该键 → 自身回退到合法默认值
      const r4 = run(() => {
        loadBaseline();
        LS.removeItem(SAVE_KEYS[K.name]);
        loadAll();
        return { v: K.field() };
      });
      check(`${K.label} 删除该键后回退到合法默认值（${K.name}）`,
        !r4.threw && K.dft(r4.v) && K.legal(r4.v),
        r4.threw ? `抛异常：${r4.threw}` : `删除后读回 ${j(r4.v).slice(0, 62)}`);

      // 6) 删除该键 → 其余键落盘原文逐字节不变（ver 走迁移分支，单独在第 7 项断言）
      const r5 = run(() => {
        loadBaseline();
        const before = snapRaw();
        LS.removeItem(SAVE_KEYS[K.name]);
        loadAll();
        const after = snapRaw();
        if (K.name === "ver") return { skip: true, after };
        const changed = Object.keys(before).filter((k) => k !== SAVE_KEYS[K.name] && after[k] !== before[k]);
        const lost = Object.keys(before).filter((k) => k !== SAVE_KEYS[K.name] && after[k] === undefined);
        return { changed, lost, skip: false };
      });
      if (K.name === "ver") {
        check(`${K.label} 删除该键走独立的迁移分支（迁移口径在下一项断言，不参与「其它键不变」比对）（${K.name}）`,
          !r5.threw && r5.skip === true,
          r5.threw ? `抛异常：${r5.threw}` : "已分流到下一项的迁移断言（ver 缺失会导致金币乘 10 并重写全部键）");
      } else {
        check(`${K.label} 删除该键不改动其它 ${ALL_KEY_FIELDS.length - 1} 个键的落盘原文（${K.name}）`,
          !r5.threw && r5.changed.length === 0 && r5.lost.length === 0,
          r5.threw ? `抛异常：${r5.threw}` : `被改动：${r5.changed.join(",") || "无"} · 被丢失：${r5.lost.join(",") || "无"}`);
      }

      // 7) ver 缺失 → 一次性迁移（金币乘 10，其余键被规范化为当前版本）
      if (K.name === "ver") {
        check(`${K.label} 删除该键触发一次性版本迁移（金币乘 10、ver 提升到 3、其余键重写为规范值）（${K.name}）`,
          !r5.threw && isObj(r5.after) && r5.after[SAVE_KEYS.gold] === "12340" &&
          r5.after[SAVE_KEYS.ver] === "3" && ALL_KEY_FIELDS.every((k) => k === SAVE_KEYS.ver || r5.after[k] !== undefined),
          r5.threw ? `抛异常：${r5.threw}` : `gold 1234 → ${r5.after && r5.after[SAVE_KEYS.gold]} · ver → ${r5.after && r5.after[SAVE_KEYS.ver]} · 重写键数 ${r5.after ? Object.keys(r5.after).length : 0}`);
      }

      // 8) 幂等：连续两次完整读档，字段完全一致（迁移只跑一次）
      const r6 = run(() => {
        loadBaseline();
        const a = K.field();
        loadAll();
        const b = K.field();
        loadAll();
        const c = K.field();
        return { a, b, c };
      });
      check(`${K.label} 连续读档幂等（迁移只执行一次，结果稳定）（${K.name}）`,
        !r6.threw && j(r6.a) === j(r6.b) && j(r6.b) === j(r6.c),
        r6.threw ? `抛异常：${r6.threw}` : `三次读档 ${j(r6.a).slice(0, 34)} / ${j(r6.b).slice(0, 34)} / ${j(r6.c).slice(0, 34)}`);
    }
  }

  // ============================================================
  //  2. 损坏矩阵（15 键 × 5 种损坏值 + 15 项"损坏后仍能开局"）
  // ============================================================
  section(`逐键损坏矩阵（${KEY_TABLE.length} 键 × 5 种损坏值）`);
  {
    // 每个键的 5 种损坏值：null / 空串 / 花括号对象 / 非法 JSON / 类型不符
    const CORRUPT = {
      gold: ["null", "", "{}", "@@非法JSON@@", "[1,2,3]"],
      up: ["null", "", "{}", "@@非法JSON@@", '"一个字符串"'],
      unlocked: ["null", "", "{}", "@@非法JSON@@", '"17"'],
      stars: ["null", "", "{}", "@@非法JSON@@", "123"],
      veh: ["null", "", "{}", "@@非法JSON@@", "true"],
      owned: ["null", "", "{}", "@@非法JSON@@", '{"a":1}'],
      mute: ["null", "", "{}", "@@非法JSON@@", "yes"],
      best: ["null", "", "{}", "@@非法JSON@@", '"4321"'],
      ach: ["null", "", "{}", "@@非法JSON@@", '{"air":true}'],
      ver: ["null", "", "{}", "@@非法JSON@@", '"3"'],
      prog: ["null", "", "{}", "@@非法JSON@@", "[1,2]"],
      rating: ["null", "", "{}", "@@非法JSON@@", '"1350"'],
      stat: ["null", "", "{}", "@@非法JSON@@", "[1,2,3]"],
      ultra: ["null", "", "{}", "@@非法JSON@@", "[1,2]"],
      sel: ["null", "", "{}", "@@非法JSON@@", "true"],
    };
    const KIND = ["null", "空串", "花括号对象", "非法 JSON", "类型不符"];

    for (const K of KEY_TABLE) {
      const raws = CORRUPT[K.name];
      for (let i = 0; i < raws.length; i++) {
        const raw = raws[i];
        const kind = KIND[i];
        const r = run(() => {
          loadBaseline();
          LS.setItem(SAVE_KEYS[K.name], raw);
          let threw = null;
          try { loadAll(); } catch (e) { threw = e.message; }
          const v = K.field();
          return { threw, v };
        });
        check(`${K.label} 注入「${kind}」（${JSON.stringify(raw).slice(0, 14)}）后 loadSave 不抛且该字段为合法默认值`,
          !r.threw && r.threw === null && K.legal(r.v) && K.dft(r.v),
          r.threw ? `抛异常：${r.threw}` : `读回 ${j(r.v).slice(0, 48)} · 合法=${K.legal(r.v)} · 合法默认=${K.dft(r.v)}`);
      }

      // 损坏该键之后游戏仍能正常开局（派生量必须全部有限）
      const rs = run(() => {
        loadBaseline();
        LS.setItem(SAVE_KEYS[K.name], CORRUPT[K.name][3]);
        loadAll();
        store.state = "menu";
        gameM.startGame("level", 0);
        return { state: store.state, lv: store.lvIdx, finite: physFinite() };
      });
      check(`${K.label} 注入「非法 JSON」后游戏仍能正常开局（state=play、关卡已构建、物理派生量全部有限）（${K.name}）`,
        !rs.threw && rs.state === "play" && rs.lv === 0 && rs.finite,
        rs.threw ? `抛异常：${rs.threw}` : `state=${rs.state} lvIdx=${rs.lv} MAXV=${store.phys.MAXV} torquePeak=${store.phys.torquePeak} mTot=${store.phys.rb && store.phys.rb.mTot}`);
    }

    // 15 键同时损坏
    const rall = run(() => {
      fresh();
      for (const k of ALL_KEY_FIELDS) LS.setItem(k, "@@全损坏@@");
      let threw = null;
      try { loadAll(); } catch (e) { threw = e.message; }
      return { threw };
    });
    check("15 个存档键同时写入非法 JSON：loadSave/loadProgress/loadAchList 全部不抛",
      !rall.threw && rall.threw === null, rall.threw ? `抛异常：${rall.threw}` : "全键损坏仍正常返回");
    const rall2 = run(() => {
      fresh();
      for (const k of ALL_KEY_FIELDS) LS.setItem(k, "@@全损坏@@");
      loadAll();
      store.state = "menu";
      gameM.startGame("level", 0);
      return { state: store.state, finite: physFinite(), gold: store.gold, stars: store.stars.length };
    });
    check("15 键全损坏后仍能开局且派生量有限（金币归 0、星级补齐 72 项）",
      !rall2.threw && rall2.state === "play" && rall2.finite && rall2.gold === 0 && rall2.stars === LV,
      rall2.threw ? `抛异常：${rall2.threw}` : `state=${rall2.state} gold=${rall2.gold} stars.length=${rall2.stars} MAXV=${store.phys.MAXV}`);
  }

  // ============================================================
  //  3. 进度阶梯（deriveUnlocks / isAdvancedUnlocked / availableFreeThemes）
  // ============================================================
  section("进度阶梯（解锁阶梯 / 阈值边界 / 自由选图）");
  {
    const mkProg = (o) => Object.assign({
      branchCleared: [], finaleDone: false, invited: false, rating: 0, wins: 0, losses: 0, peak: false, freeThemes: [],
    }, o);
    const mkStars = (n, v = 3) => {
      const a = new Array(LV).fill(0);
      for (let i = 0; i < n; i++) a[i] = v;
      return a;
    };

    // 3.1 通关数量阶梯 0 / 1 / 71 / 72
    for (const n of [0, 1, 71, 72]) {
      const u = st.deriveUnlocks(mkProg(), mkStars(n));
      const exp = n >= LV;
      check(`deriveUnlocks：已通 ${n}/${LV} 关 → allCleared 与 finaleUnlocked 均为 ${exp}`,
        u.allCleared === exp && u.finaleUnlocked === exp,
        `allCleared=${u.allCleared} finaleUnlocked=${u.finaleUnlocked}（期望 ${exp}）`);
    }
    // 3.2 星级高度
    check("deriveUnlocks：allCleared 只看「每关至少 1 星」，1 星与 3 星结果一致",
      st.deriveUnlocks(mkProg(), mkStars(LV, 1)).allCleared === true &&
      st.deriveUnlocks(mkProg(), mkStars(LV, 3)).allCleared === true &&
      st.deriveUnlocks(mkProg(), mkStars(LV - 1, 1)).allCleared === false,
      `1 星全通=${st.deriveUnlocks(mkProg(), mkStars(LV, 1)).allCleared} 3 星全通=${st.deriveUnlocks(mkProg(), mkStars(LV, 3)).allCleared} 缺 1 关=${st.deriveUnlocks(mkProg(), mkStars(LV - 1, 1)).allCleared}`);
    // 3.3 星级数组非规整时的容错
    check("deriveUnlocks：星级数组短于 72 时不误判全通（短数组按缺关处理）",
      st.deriveUnlocks(mkProg(), mkStars(20)).allCleared === false,
      `20 关星级 → allCleared=${st.deriveUnlocks(mkProg(), mkStars(20)).allCleared}`);
    check("deriveUnlocks：星级入参非法（null / 数字 / 字符串 / undefined）不抛且全为 false",
      [null, 5, "x", undefined].every((s) => {
        const u = st.deriveUnlocks(mkProg(), s);
        return u.allCleared === false && u.peak === false;
      }),
      "null / 5 / x / undefined 均回退为 allCleared=false");
    check("deriveUnlocks：progress 入参非法（null / 字符串 / 数字 / 0）不抛且不崩",
      [null, "x", 5, 0].every((p) => st.deriveUnlocks(p, mkStars(LV)).allCleared === true),
      "progress 非法时仍能判定 allCleared（该判定只依赖星级）");
    check("deriveUnlocks：入参不被修改（纯函数）",
      (() => {
        const p = mkProg({ rating: 100 }), s = mkStars(10);
        const ps = j(p), ss = j(s);
        st.deriveUnlocks(p, s);
        return j(p) === ps && j(s) === ss;
      })(),
      "调用前后 progress 与 stars 的序列化结果完全一致");

    // 3.4 finaleDone / invited
    check("deriveUnlocks：finaleDone 为 true 时 finaleDone 与 invited 同时为 true",
      st.deriveUnlocks(mkProg({ finaleDone: true }), mkStars(0)).finaleDone === true &&
      st.deriveUnlocks(mkProg({ finaleDone: true }), mkStars(0)).invited === true,
      "最终任务通关 → 收到排位赛邀请");
    check("deriveUnlocks：finaleDone 为 false 但 invited 为 true → 邀请保留、finaleDone 不回退",
      (() => { const u = st.deriveUnlocks(mkProg({ finaleDone: false, invited: true }), mkStars(0)); return u.invited === true && u.finaleDone === false; })(),
      "invited 是单向闩锁，不因 finaleDone 为 false 被清");
    check("deriveUnlocks：finaleDone 与 invited 只接受严格 true（yes 与 1 均视为否）",
      st.deriveUnlocks(mkProg({ finaleDone: "yes", invited: 1 }), mkStars(0)).finaleDone === false &&
      st.deriveUnlocks(mkProg({ finaleDone: "yes", invited: 1 }), mkStars(0)).invited === false,
      "yes → false，1 → false（防脏档伪造解锁）");

    // 3.5 rating 阈值：1190 / 1199 / 1200 / 1201 / 1210
    for (const r of [RATING_ADVANCED - 10, RATING_ADVANCED - 1, RATING_ADVANCED, RATING_ADVANCED + 1, RATING_ADVANCED + 10]) {
      const u = st.deriveUnlocks(mkProg({ rating: r }), mkStars(0));
      const exp = r >= RATING_ADVANCED;
      check(`deriveUnlocks：rating ${r} → advancedUnlocked 为 ${exp}（阈值 ${RATING_ADVANCED}）`,
        u.advancedUnlocked === exp && st.isAdvancedUnlocked(r) === exp,
        `advancedUnlocked=${u.advancedUnlocked} isAdvancedUnlocked=${st.isAdvancedUnlocked(r)}`);
    }
    // 3.6 peak 阈值：2390 / 2399 / 2400 / 2401 / 2410
    for (const r of [RATING_PEAK - 10, RATING_PEAK - 1, RATING_PEAK, RATING_PEAK + 1, RATING_PEAK + 10]) {
      const u = st.deriveUnlocks(mkProg({ rating: r }), mkStars(LV));
      const exp = r >= RATING_PEAK;
      check(`deriveUnlocks：rating ${r} → peak 为 ${exp}（登顶阈值 ${RATING_PEAK}）`,
        u.peak === exp, `peak=${u.peak}（期望 ${exp}）`);
    }
    check("deriveUnlocks：peak 为单向闩锁（peak 为 true 后 rating 归 0 仍保持登顶）",
      st.deriveUnlocks(mkProg({ peak: true, rating: 0 }), mkStars(LV)).peak === true,
      "登顶后永久保持，不因段位分回落而丢失");
    check("deriveUnlocks：rating 负值与非法值被夹到 0（不进高级赛、不登顶）",
      [-5, -1e9, NaN, "abc", null, undefined].every((r) => {
        const u = st.deriveUnlocks(mkProg({ rating: r }), mkStars(LV));
        return u.advancedUnlocked === false && u.peak === false;
      }),
      "-5 / -1e9 / NaN / abc / null / undefined 全部 advancedUnlocked=false, peak=false");
    check("deriveUnlocks：rating 为字符串数字时正确解析（1500 → 进高级赛）",
      st.deriveUnlocks(mkProg({ rating: "1500" }), mkStars(0)).advancedUnlocked === true,
      `字符串 1500 不小于 ${RATING_ADVANCED} → advancedUnlocked=true`);
    check("deriveUnlocks：rating 为小数时截断而非四舍五入（1199.9 不进高级赛）",
      st.deriveUnlocks(mkProg({ rating: RATING_ADVANCED - 0.1 }), mkStars(0)).advancedUnlocked === false,
      `1199.9 → advancedUnlocked=${st.deriveUnlocks(mkProg({ rating: 1199.9 }), mkStars(0)).advancedUnlocked}`);

    // 3.7 availableFreeThemes
    const branchStars = (doneBranches) => {
      const a = new Array(LV).fill(0);
      for (const b of doneBranches) for (let k = 0; k < LEVELS_PER_BRANCH; k++) a[b * LEVELS_PER_BRANCH + k] = 3;
      return a;
    };
    check("availableFreeThemes：无支线通关时为空数组",
      st.availableFreeThemes(new Array(LV).fill(0)).length === 0, "全 0 星级 → 空数组");
    check("availableFreeThemes：单支线 6 关全通才解锁该场景，缺 1 关则不解锁",
      st.availableFreeThemes(branchStars([0])).includes(0) &&
      !st.availableFreeThemes(branchStars([0]).map((s, i) => (i === 3 ? 0 : s))).includes(0) &&
      st.availableFreeThemes(branchStars([0])).length === 1,
      "支线 1 全通 → 场景 [0]；第 4 关留 0 → 空数组");
    let prog = true;
    const progRows = [];
    for (let b = 0; b < N_BRANCHES; b++) {
      const arr = [];
      for (let k = 0; k <= b; k++) arr.push(k);
      const got = st.availableFreeThemes(branchStars(arr));
      progRows.push(`${b + 1} 支线→${got.length} 场景`);
      if (got.length !== b + 1) prog = false;
    }
    check(`availableFreeThemes：逐支线解锁单调递增（${N_BRANCHES} 条支线逐一验证）`,
      prog, progRows.join(" · "));
    check("availableFreeThemes：12 条支线全通时恰好 12 个场景且无重复",
      st.availableFreeThemes(new Array(LV).fill(3)).length === N_BRANCHES &&
      new Set(st.availableFreeThemes(new Array(LV).fill(3))).size === N_BRANCHES,
      `场景数 ${st.availableFreeThemes(new Array(LV).fill(3)).length} · 去重后 ${new Set(st.availableFreeThemes(new Array(LV).fill(3))).size}`);
    check("availableFreeThemes：返回的场景下标与 BRANCHES 的 theme 字段一一对应",
      st.availableFreeThemes(new Array(LV).fill(3)).every((t, i) => BRANCHES[i] && BRANCHES[i].theme === t),
      `BRANCHES.theme = ${BRANCHES.map((b) => b.theme).join(",")}`);
    check("availableFreeThemes：入参非法（null / 数字 / 字符串 / undefined）回退为空数组",
      [null, 5, "x", undefined].every((s) => st.availableFreeThemes(s).length === 0),
      "null / 5 / x / undefined → 空数组");
    check("availableFreeThemes：星级为 0 的关卡不算通关（只有大于 0 才计入）",
      st.availableFreeThemes(branchStars([0])).length === 1,
      "0 星不计入，1 星即计入");

    // 3.8 deriveBranchCleared / refreshProgress / syncFreeThemes
    const r = run(() => {
      loadBaseline();
      store.stars = new Array(LV).fill(3);
      store.progress.peak = false;
      const rp = st.refreshProgress();
      return { branch: rp.branchCleared.length, peak: rp.peak, ft: rp.freeThemes.length };
    });
    check("refreshProgress：全通时派生 12 条已通关支线、peak 保持 false、freeThemes 清空",
      !r.threw && r.branch === N_BRANCHES && r.peak === false && r.ft === 0,
      r.threw ? `抛异常：${r.threw}` : `branchCleared=${r.branch} peak=${r.peak} freeThemes=${r.ft}`);
    const r2 = run(() => {
      loadBaseline();
      store.stars = new Array(LV).fill(3);
      store.progress.peak = true;
      const ft = st.syncFreeThemes();
      store.stars = new Array(LV).fill(0);
      const ft2 = st.syncFreeThemes();
      return { ft: ft.length, ft2: ft2.length, peak: store.progress.peak };
    });
    check("syncFreeThemes：登顶后按星级开放场景；星级清空后回收但 peak 保持（登顶不可逆）",
      !r2.threw && r2.ft === N_BRANCHES && r2.ft2 === 0 && r2.peak === true,
      r2.threw ? `抛异常：${r2.threw}` : `全通 → ${r2.ft} 场景 · 清空 → ${r2.ft2} 场景 · peak 仍为 ${r2.peak}`);
    const r3 = run(() => {
      loadBaseline();
      store.stars = new Array(LV).fill(3);
      store.progress.invited = false;
      store.progress.rating = RATING_PEAK;
      const rp = st.refreshProgress();
      return { peak: rp.peak };
    });
    check("refreshProgress：rating 达标即使 invited 为 false 也会由派生态把 peak 置 true",
      !r3.threw && r3.peak === true, r3.threw ? `抛异常：${r3.threw}` : `rating=${RATING_PEAK} → peak=${r3.peak}`);

    // 3.9 loadProgress 的落盘往返
    const r4 = run(() => {
      loadBaseline();
      const before = LS.getItem(SAVE_KEYS.rating);
      store.progress.rating = 1875; store.progress.wins = 7; store.progress.losses = 8;
      store.stars = new Array(LV).fill(3);
      st.settleProgress();
      const mid = { p: LS.getItem(SAVE_KEYS.prog), r: LS.getItem(SAVE_KEYS.rating) };
      store.progress = { branchCleared: [], finaleDone: false, invited: false, rating: 0, wins: 0, losses: 0, peak: false, freeThemes: [] };
      st.loadProgress();
      return { before, mid, after: { r: store.progress.rating, w: store.progress.wins, l: store.progress.losses } };
    });
    check("settleProgress 与 loadProgress 往返：rating、wins、losses 精确一致",
      !r4.threw && r4.after.r === 1875 && r4.after.w === 7 && r4.after.l === 8 &&
      r4.mid.r === "1875" && r4.before === "1350",
      r4.threw ? `抛异常：${r4.threw}` : `rating 1350 → 落盘 ${r4.mid.r} → 读回 ${r4.after.r}；wins=${r4.after.w} losses=${r4.after.l}`);
    check("settleProgress：派生出的 branchCleared 同步落盘到 bike_prog",
      !r4.threw && r4.mid.p.indexOf('"branchCleared":[0,1,2') > 0,
      r4.threw ? `抛异常：${r4.threw}` : `bike_prog 开头 ${String(r4.mid.p).slice(0, 48)}`);
    check("loadProgress：wins 与 losses 负值夹到 0、小数截断、字符串数字可解析",
      (() => {
        const cases = [['{"wins":-5,"losses":-2}', 0, 0], ['{"wins":2.7,"losses":"3"}', 2, 3], ['{"wins":true,"losses":[]}', 0, 0]];
        return cases.every(([raw, w, l]) => {
          fresh(); LS.setItem(SAVE_KEYS.ver, "3"); LS.setItem(SAVE_KEYS.prog, raw);
          st.loadProgress();
          return store.progress.wins === w && store.progress.losses === l;
        });
      })(),
      "-5→0 / 2.7→2 / 字符串 3→3 / true→0 / 空数组→0");

    // 3.10 freeThemes 的落盘过滤与派生覆盖
    const r5 = run(() => {
      fresh(); LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.prog, j({ peak: false, freeThemes: [1, 2] }));
      LS.setItem(SAVE_KEYS.stars, j(new Array(LV).fill(3)));
      loadAll();
      return { peak: store.progress.peak, ft: store.progress.freeThemes.length };
    });
    check("loadProgress：未登顶时忽略 bike_prog 里的 freeThemes（不白给无限模式选图）",
      !r5.threw && r5.peak === false && r5.ft === 0, r5.threw ? `抛异常：${r5.threw}` : `peak=${r5.peak} freeThemes=${r5.ft}`);
    const r6 = run(() => {
      fresh(); LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.prog, j({ peak: true, freeThemes: [1, 2] }));
      LS.setItem(SAVE_KEYS.stars, j(BASE_STARS));
      loadAll();
      return { ft: store.progress.freeThemes };
    });
    check("loadProgress：登顶后 freeThemes 由星级重算（磁盘值只作参考，不直接采信）",
      !r6.threw && r6.ft.length === N_BRANCHES - 1 && r6.ft[0] === 0,
      r6.threw ? `抛异常：${r6.threw}` : `磁盘写 [1,2] → 实际按星级重算为 ${r6.ft.length} 个场景 [${(r6.ft || []).slice(0, 3).join(",")}...]`);
    const r7 = run(() => {
      fresh(); LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.prog, j({ peak: true, freeThemes: [1, 2, -1, 2.5, "9", null, 0] }));
      loadAll();
      return { ft: store.progress.freeThemes };
    });
    check("loadProgress：freeThemes 过滤负数、小数、字符串、null，只留非负整数",
      !r7.threw && Array.isArray(r7.ft) && r7.ft.every((x) => isInt(x) && x >= 0),
      r7.threw ? `抛异常：${r7.threw}` : `过滤后 ${j(r7.ft)}（非负整数且来自 availableFreeThemes 重算）`);
  }

  // ============================================================
  //  4. 排位（settleRanked / rankName / rankedAIScale）
  // ============================================================
  section("排位赛（结算加减分 / 段位映射 / 连续对局）");
  {
    const settle = (adv, won, from) => run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = adv;
      store.progress.rating = from;
      const out = gameM.settleRanked(won);
      return { out, p: store.progress };
    });

    // 4.1 四种组合的精确加减分
    const combos = [
      { adv: false, won: true, from: 100, delta: RATING_WIN_GAIN, tag: "普通排位 · 胜" },
      { adv: false, won: false, from: 100, delta: -RATING_LOSS, tag: "普通排位 · 负" },
      { adv: true, won: true, from: 100, delta: RATING_WIN_GAIN_ADVANCED, tag: "高级排位 · 胜" },
      { adv: true, won: false, from: 100, delta: -RATING_LOSS_ADVANCED, tag: "高级排位 · 负" },
    ];
    for (const c of combos) {
      const r = settle(c.adv, c.won, c.from);
      const exp = c.from + c.delta;
      check(`settleRanked：${c.tag} 段位分 ${c.from} 变为 ${exp}（增量 ${c.delta > 0 ? "+" : ""}${c.delta}）`,
        !r.threw && r.out === exp && r.p.rating === exp,
        r.threw ? `抛异常：${r.threw}` : `实际 ${r.out}（期望 ${exp}）`);
    }
    check("排位数值常量自洽：高级赛的收益与风险都严格高于普通赛",
      RATING_WIN_GAIN_ADVANCED > RATING_WIN_GAIN && RATING_LOSS_ADVANCED > RATING_LOSS,
      `胜 +${RATING_WIN_GAIN} / +${RATING_WIN_GAIN_ADVANCED} · 负 -${RATING_LOSS} / -${RATING_LOSS_ADVANCED}`);

    // 4.2 下限 0
    for (const [adv, from, tag] of [[false, 5, "普通"], [true, 10, "高级"], [false, RATING_LOSS, "普通恰好等于扣分"], [true, RATING_LOSS_ADVANCED, "高级恰好等于扣分"]]) {
      const r = settle(adv, false, from);
      check(`settleRanked：${tag}排位在 ${from} 分判负 → 精确落在下限 ${RATING_MIN}（不出现负数）`,
        !r.threw && r.p.rating === RATING_MIN,
        r.threw ? `抛异常：${r.threw}` : `${from} 减 ${adv ? RATING_LOSS_ADVANCED : RATING_LOSS} = ${r.p.rating}`);
    }
    const rFloor = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = true;
      store.progress.rating = 0;
      let min = Infinity;
      for (let i = 0; i < 60; i++) { gameM.settleRanked(false); min = Math.min(min, store.progress.rating); }
      return { min, l: store.progress.losses, w: store.progress.wins, r: store.progress.rating };
    });
    check("settleRanked：高级排位连输 60 局，段位分始终大于等于 0 且下限精确为 0",
      !rFloor.threw && rFloor.min === RATING_MIN && rFloor.l === 60,
      rFloor.threw ? `抛异常：${rFloor.threw}` : `最低 ${rFloor.min} · 终值 ${rFloor.r} · 战绩 ${rFloor.w} 胜 ${rFloor.l} 负`);
    const rFloorW = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = true;
      store.progress.rating = 0;
      for (let i = 0; i < 100; i++) gameM.settleRanked(false);
      gameM.settleRanked(true);
      return { r: store.progress.rating };
    });
    check("settleRanked：触底后首次获胜只加当局增量（不回血式叠加）",
      !rFloorW.threw && rFloorW.r === RATING_WIN_GAIN_ADVANCED,
      rFloorW.threw ? `抛异常：${rFloorW.threw}` : `0 → 胜 → ${rFloorW.r}（等于 +${RATING_WIN_GAIN_ADVANCED}）`);

    // 4.3 战绩计数
    for (const c of combos) {
      const r = settle(c.adv, c.won, 500);
      check(`settleRanked：${c.tag} 战绩计数正确（wins 与 losses 各自加 1）`,
        !r.threw && r.p.wins === (c.won ? 1 : 0) && r.p.losses === (c.won ? 0 : 1),
        r.threw ? `抛异常：${r.threw}` : `${r.p.wins} 胜 ${r.p.losses} 负`);
    }

    // 4.4 落盘
    const rP = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = 300;
      gameM.settleRanked(true);
      return { raw: LS.getItem(SAVE_KEYS.rating), prog: LS.getItem(SAVE_KEYS.prog), r: store.progress.rating };
    });
    check("settleRanked：结算后段位分立即落盘（bike_rating 与 store 一致）",
      !rP.threw && rP.raw === String(rP.r) && rP.raw === "325" && rP.prog.indexOf('"rating":325') > 0,
      rP.threw ? `抛异常：${rP.threw}` : `bike_rating="${rP.raw}" · bike_prog 含 ${rP.prog.indexOf('"rating":325') > 0 ? "rating 字段 325" : "缺 rating 字段"}`);
    const rP2 = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = 300; store.progress.wins = 11; store.progress.losses = 12;
      gameM.settleRanked(false);
      store.progress = { branchCleared: [], finaleDone: false, invited: false, rating: 0, wins: 0, losses: 0, peak: false, freeThemes: [] };
      st.loadProgress();
      return { p: store.progress };
    });
    check("settleRanked：战绩经 bike_prog 落盘并在重读后完整恢复",
      !rP2.threw && rP2.p.rating === 280 && rP2.p.wins === 11 && rP2.p.losses === 13,
      rP2.threw ? `抛异常：${rP2.threw}` : `rating=${rP2.p.rating} ${rP2.p.wins} 胜 ${rP2.p.losses} 负`);

    // 4.5 跨阈值：高级赛准入 / 登顶
    const rX1 = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = RATING_ADVANCED - 10;
      const before = st.isAdvancedUnlocked(store.progress.rating);
      gameM.settleRanked(true);
      return { before, after: store.progress.rating, unlocked: st.isAdvancedUnlocked(store.progress.rating) };
    });
    check(`settleRanked：rating ${RATING_ADVANCED - 10} 判胜后跨过 ${RATING_ADVANCED} → 高级排位准入翻转`,
      !rX1.threw && rX1.before === false && rX1.after === RATING_ADVANCED + RATING_WIN_GAIN - 10 && rX1.unlocked === true,
      rX1.threw ? `抛异常：${rX1.threw}` : `${RATING_ADVANCED - 10} → ${rX1.after}，准入 ${rX1.before} → ${rX1.unlocked}`);
    const rX2 = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = RATING_PEAK - 25;
      const before = store.progress.peak;
      const out = gameM.settleRanked(true);
      return { before, out, after: store.progress.peak, ft: store.progress.freeThemes.length };
    });
    check(`settleRanked：rating ${RATING_PEAK - 25} 判胜后精确落到 ${RATING_PEAK} → 登顶并永久化`,
      !rX2.threw && rX2.before === false && rX2.out === RATING_PEAK && rX2.after === true,
      rX2.threw ? `抛异常：${rX2.threw}` : `${RATING_PEAK - 25} → ${rX2.out}，peak ${rX2.before} → ${rX2.after}（freeThemes=${rX2.ft}，无星级故为 0）`);
    const rX3 = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = RATING_PEAK - 26;
      gameM.settleRanked(true);
      return { out: store.progress.rating, peak: store.progress.peak };
    });
    check(`settleRanked：rating ${RATING_PEAK - 26} 判胜后停在 ${RATING_PEAK - 1} → 不误登顶`,
      !rX3.threw && rX3.out === RATING_PEAK - 1 && rX3.peak === false,
      rX3.threw ? `抛异常：${rX3.threw}` : `${RATING_PEAK - 26} → ${rX3.out}，peak=${rX3.peak}`);
    const rX4 = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = 3000; store.progress.peak = true;
      gameM.settleRanked(false);
      const a = store.progress.peak;
      store.progress.rating = 0;
      return { a, b: st.deriveUnlocks(store.progress, store.stars).peak };
    });
    check("settleRanked：段位分从 3000 掉到低位，peak 依然为 true（登顶不可逆）",
      !rX4.threw && rX4.a === true && rX4.b === true,
      rX4.threw ? `抛异常：${rX4.threw}` : `peak=${rX4.a} → 再次派生仍为 ${rX4.b}`);

    // 4.6 连续多局
    const rSeq = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      let prev = store.progress.rating;
      const seq = [];
      let badDelta = 0, neg = 0, floor = 0;
      for (let i = 0; i < 60; i++) {
        const won = i % 3 !== 0;
        const r = gameM.settleRanked(won);
        const d = r - prev;
        if (won) { if (d !== RATING_WIN_GAIN) badDelta++; }
        else if (d === -RATING_LOSS) { /* 正常扣分 */ }
        else if (d === 0 && prev < RATING_LOSS) floor++; // 触底：扣分被下限截断，属设计
        else badDelta++;
        if (r < 0) neg++;
        prev = r; seq.push(r);
      }
      return { seq, badDelta, neg, floor, p: store.progress };
    });
    check("settleRanked：连打 60 局（2 胜 1 负循环）每局增量精确且段位分始终大于等于 0",
      !rSeq.threw && rSeq.badDelta === 0 && rSeq.neg === 0,
      rSeq.threw ? `抛异常：${rSeq.threw}` : `60 局全对（增量异常 ${rSeq.badDelta} 次，负分 ${rSeq.neg} 次，首局触底截断 ${rSeq.floor} 次）· 终值 ${rSeq.seq[rSeq.seq.length - 1]}`);
    check("settleRanked：60 局后战绩与实际胜负总数严格相等（wins 加 losses 等于 60）",
      !rSeq.threw && rSeq.p.wins + rSeq.p.losses === 60 && rSeq.p.wins === 40 && rSeq.p.losses === 20,
      rSeq.threw ? `抛异常：${rSeq.threw}` : `${rSeq.p.wins} 胜 ${rSeq.p.losses} 负 · rating=${rSeq.p.rating}（起始 0，40×25-20×20=${40 * RATING_WIN_GAIN - 20 * RATING_LOSS}，首局触底扣 0）`);
    const rSeq2 = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = true;
      let prev = 0, bad = 0, neg = 0;
      const names = new Set();
      for (let i = 0; i < 60; i++) {
        const won = i % 2 === 0;
        const r = gameM.settleRanked(won);
        const d = r - prev;
        if (won ? d !== RATING_WIN_GAIN_ADVANCED : d !== -RATING_LOSS_ADVANCED) bad++;
        if (r < 0) neg++;
        names.add(rankName(r));
        prev = r;
      }
      return { bad, neg, names: Array.from(names), r: prev };
    });
    check("settleRanked：高级排位 60 局（胜负交替）增量精确、不过零，且段位名全程可解析",
      !rSeq2.threw && rSeq2.bad === 0 && rSeq2.neg === 0 && rSeq2.names.every((n) => typeof n === "string" && n.length > 0),
      rSeq2.threw ? `抛异常：${rSeq2.threw}` : `终值 ${rSeq2.r} · 途经段位 ${rSeq2.names.join(" → ")}`);
    const rSeq3 = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      let mism = 0;
      for (let i = 0; i < 60; i++) {
        const r = gameM.settleRanked(i % 3 !== 0);
        let exp = "青铜";
        for (const k of RANKS) { if (r >= k.min) exp = k.name; else break; }
        if (exp !== rankName(r)) mism++;
      }
      return { mism };
    });
    check("settleRanked：60 局中每次结算后的段位名与 RANKS 表逐档一致",
      !rSeq3.threw && rSeq3.mism === 0, rSeq3.threw ? `抛异常：${rSeq3.threw}` : "60 次比对全部一致");

    // 4.7 rankName 全区间
    const nameRows = [];
    let mism = 0, nonEmpty = 0, total = 0;
    for (let r = 0; r <= 3400; r += 7) {
      let exp = RANKS[0].name;
      for (const k of RANKS) { if (r >= k.min) exp = k.name; else break; }
      const got = rankName(r);
      total++;
      if (got !== exp) { mism++; nameRows.push(`${r}→${got}(应 ${exp})`); }
      if (typeof got === "string" && got.length > 0) nonEmpty++;
    }
    check(`rankName：0 到 3400 每 7 分逐点比对全区间（${total} 个采样点）无一处错档`,
      mism === 0 && nonEmpty === total,
      mism === 0 ? `${total} 个采样点全部命中正确段位（${RANKS.map((k) => `${k.min}+${k.name}`).join(" ")}）` : nameRows.slice(0, 4).join(" "));
    for (const k of RANKS) {
      const at = rankName(k.min), below = rankName(k.min - 1);
      const expBelow = RANKS[RANKS.indexOf(k) - 1];
      check(`rankName：边界 min=${k.min} 判为「${k.name}」，min 减 1 即 ${k.min - 1} 判为「${expBelow ? expBelow.name : "青铜"}」`,
        at === k.name && below === (expBelow ? expBelow.name : RANKS[0].name),
        `rankName(${k.min})="${at}" · rankName(${k.min - 1})="${below}"`);
    }
    check("rankName：负数、超大值、非法值都返回非空合法段位名（负数与非法值归青铜）",
      [[-1, "青铜"], [-1e9, "青铜"], [NaN, "青铜"], ["abc", "青铜"], [null, "青铜"], [undefined, "青铜"], [true, "青铜"],
        [1e9, "传奇"], [Infinity, "传奇"]].every(([v, exp]) => rankName(v) === exp),
      "-1 / -1e9 / NaN / abc / null / undefined / true → 青铜；1e9 与 Infinity → 传奇");
    check("rankName：字符串数字被正确解析（1200 判铂金，399 判青铜）",
      rankName("1200") === "铂金" && rankName("399") === "青铜",
      `字符串 1200 → ${rankName("1200")} · 字符串 399 → ${rankName("399")}`);
    check("rankName：段位名非空且互不重复（段位表本身自洽）",
      new Set(RANKS.map((k) => k.name)).size === RANKS.length &&
      RANKS.every((k) => typeof k.name === "string" && k.name.length > 0),
      RANKS.map((k) => `${k.min}=${k.name}`).join(" "));
    check("RANKS：min 严格递增、从 0 起步、且含高级赛与登顶两个门槛",
      RANKS[0].min === 0 && RANKS.every((k, i) => i === 0 || k.min > RANKS[i - 1].min) &&
      RANKS.some((k) => k.min === RATING_ADVANCED) && RANKS.some((k) => k.min === RATING_PEAK),
      `min 序列 ${RANKS.map((k) => k.min).join(",")}（含 ${RATING_ADVANCED} 与 ${RATING_PEAK}）`);
    check("rankName：constants 与 race.js 转出的同名函数行为一致（无重复实现漂移）",
      rankName(1500) === raceM.rankName(1500) && rankName(-5) === raceM.rankName(-5),
      `1500 → constants:${rankName(1500)} / race.js:${raceM.rankName(1500)}`);

    // 4.8 rankedAIScale
    const aiRows = [];
    let aiMono = true, aiAdv = true, aiBound = true;
    for (let r = 0; r <= 3000; r += 25) {
      const n = raceM.rankedAIScale(r, false), a = raceM.rankedAIScale(r, true);
      if (r > 0) {
        const pn = raceM.rankedAIScale(r - 25, false), pa = raceM.rankedAIScale(r - 25, true);
        if (n < pn - 1e-12 || a < pa - 1e-12) aiMono = false;
      }
      if (!(a > n)) aiAdv = false;
      if (!(n >= 0.70 - 1e-9 && n <= 0.90 + 1e-9 && a >= 0.95 - 1e-9 && a <= 1.25 + 1e-9)) aiBound = false;
      aiRows.push(r);
    }
    check(`rankedAIScale：0 到 3000 段位分越高 AI 配速越快（${aiRows.length} 个采样点两档都单调不减）`,
      aiMono, `${aiRows.length} 个采样点全部单调不减`);
    check("rankedAIScale：高级档 AI 始终严格快于普通档（段位赛风险与难度匹配）",
      aiAdv, `rating=0 时 ${raceM.rankedAIScale(0, false).toFixed(2)} vs ${raceM.rankedAIScale(0, true).toFixed(2)}；rating=2400 时 ${raceM.rankedAIScale(2400, false).toFixed(2)} vs ${raceM.rankedAIScale(2400, true).toFixed(2)}`);
    check("rankedAIScale：普通档夹在 0.70 到 0.90、高级档夹在 0.95 到 1.25（不越界）",
      aiBound, `普通档 ${raceM.rankedAIScale(0, false)} 到 ${raceM.rankedAIScale(3000, false).toFixed(2)} · 高级档 ${raceM.rankedAIScale(0, true)} 到 ${raceM.rankedAIScale(3000, true).toFixed(2)}`);
    check("rankedAIScale：rating 超过登顶阈值后 AI 强度封顶（不再无限增强）",
      raceM.rankedAIScale(RATING_PEAK, false) === raceM.rankedAIScale(RATING_PEAK * 10, false) &&
      raceM.rankedAIScale(RATING_PEAK, true) === raceM.rankedAIScale(RATING_PEAK * 10, true),
      `rating=${RATING_PEAK} 与 rating=${RATING_PEAK * 10} 均为 ${raceM.rankedAIScale(RATING_PEAK, false).toFixed(2)} / ${raceM.rankedAIScale(RATING_PEAK, true).toFixed(2)}`);
    check("rankedAIScale：负数与非法 rating 夹到 0 档（不产生负倍率或 NaN）",
      [-10, -1e9, NaN, null, undefined, "abc"].every((r) => {
        const n = raceM.rankedAIScale(r, false), a = raceM.rankedAIScale(r, true);
        return isNum(n) && isNum(a) && n > 0 && a > 0;
      }),
      `负数与非法值均回退为 rating=0 的倍率（${raceM.rankedAIScale(-10, false)} / ${raceM.rankedAIScale(NaN, true)}）`);

    // 4.9 未受邀无法开局排位
    const rInv = run(() => {
      fresh(); loadAll();
      store.progress.invited = false;
      gameM.startGame("ranked", 0);
      const blocked = store.mode !== "ranked";
      store.progress.invited = true;
      gameM.startGame("ranked", 0);
      return { blocked, mode: store.mode, state: store.state };
    });
    check("排位准入：未收到邀请时 startGame 拒绝进入且不改动模式；受邀后可进入",
      !rInv.threw && rInv.blocked && rInv.mode === "ranked" && rInv.state === "play",
      rInv.threw ? `抛异常：${rInv.threw}` : `未受邀时 mode 保持非 ranked · 受邀后 mode=${rInv.mode} state=${rInv.state}`);
  }

  // ============================================================
  //  5. 导入 / 导出
  // ============================================================
  section("导入 / 导出（覆盖度 / 校验 / 往返 / 特殊字符）");
  {
    // 5.1 导出覆盖度：15 键逐键
    const cov = run(() => { loadBaseline(); return { d: st.exportSave() }; });
    for (const K of KEY_TABLE) {
      const k = SAVE_KEYS[K.name];
      check(`导出：data 逐字节含 ${k}（${K.label}）`,
        !cov.threw && isObj(cov.d.data) && cov.d.data[k] === BASE_RAW[k],
        cov.threw ? `抛异常：${cov.threw}` : `data.${k} = ${String(cov.d.data[k]).slice(0, 40)}`);
    }
    check("导出：外层信封含 app、format、savedAt、data 四字段且取值合法",
      !cov.threw && cov.d.app === SAVE_APP && cov.d.format === SAVE_FORMAT &&
      typeof cov.d.savedAt === "string" && !isNaN(Date.parse(cov.d.savedAt)) && isObj(cov.d.data),
      cov.threw ? `抛异常：${cov.threw}` : `app="${cov.d.app}" format=${cov.d.format} savedAt=${cov.d.savedAt}`);
    check("导出：savedAt 是可解析的 ISO 时间戳",
      !cov.threw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(cov.d.savedAt) && !isNaN(Date.parse(cov.d.savedAt)),
      cov.threw ? `抛异常：${cov.threw}` : cov.d.savedAt);
    const covAll = run(() => {
      loadBaseline();
      const d = st.exportSave();
      return { n: Object.keys(d.data).length, miss: Object.keys(snapRaw()).filter((k) => !(k in d.data)) };
    });
    check("导出：localStorage 里每个 bike_ 键都能在 data 中找到（无遗漏）",
      !covAll.threw && covAll.miss.length === 0,
      covAll.threw ? `抛异常：${covAll.threw}` : `data 含 ${covAll.n} 键 · 遗漏 ${covAll.miss.join(",") || "无"}`);
    const covExtra = run(() => {
      loadBaseline();
      LS.setItem("bike_future_2099", "保留我");
      LS.setItem("other_not_bike", "不该出现");
      LS.setItem("dale_quality", "low");
      const d = st.exportSave();
      return { d };
    });
    check("导出：纳入任何 bike_ 前缀键（含未来新增键），排除非 bike_ 键",
      !covExtra.threw && covExtra.d.data.bike_future_2099 === "保留我" &&
      !("other_not_bike" in covExtra.d.data) && !("dale_quality" in covExtra.d.data),
      covExtra.threw ? `抛异常：${covExtra.threw}` : "含 bike_future_2099 · 排除 other_not_bike 与 dale_quality");
    const covProbe = run(() => {
      fresh();
      st.resetSave();
      LS.setItem("__dale_probe__", "1");
      loadAll();
      return { d: st.exportSave() };
    });
    check("导出：探测键 __dale_probe__ 刻意不以 bike_ 开头，不混入存档文件",
      !covProbe.threw && !("__dale_probe__" in covProbe.d.data),
      covProbe.threw ? `抛异常：${covProbe.threw}` : `data 键数 ${Object.keys(covProbe.d.data).length} · 探测键未混入`);

    // 5.2 非法文件被拒且现有存档逐键不变
    const badFiles = [
      ["非法 JSON", "{ not json", "存档内容不是合法 JSON"],
      ["空文件", "", "存档内容不是合法 JSON"],
      ["根为 null", "null", "存档根对象非法"],
      ["根为数组", "[]", "存档根对象非法"],
      ["根为数字", "5", "存档根对象非法"],
      ["根为字符串", '"s"', "存档根对象非法"],
      ["空对象", "{}", "app 不符"],
      ["app 不符", j({ app: "other-game", format: SAVE_FORMAT, data: { bike_gold: "999999" } }), "app 不符"],
      ["format 不支持", j({ app: SAVE_APP, format: 99, data: { bike_gold: "999999" } }), "不支持的存档格式"],
      ["data 非对象（数组）", j({ app: SAVE_APP, format: SAVE_FORMAT, data: [1, 2, 3] }), "存档数据非法"],
      ["data 为 null", j({ app: SAVE_APP, format: SAVE_FORMAT, data: null }), "存档数据非法"],
      ["data 缺失", j({ app: SAVE_APP, format: SAVE_FORMAT }), "存档数据非法"],
      ["data 为字符串", j({ app: SAVE_APP, format: SAVE_FORMAT, data: "x" }), "存档数据非法"],
    ];
    for (const [label, txt, errPart] of badFiles) {
      const r = run(() => {
        loadBaseline();
        const before = snapRaw();
        const p = st.parseSave(txt);
        if (p.ok) st.importSave(p.data);
        const after = snapRaw();
        const changed = Object.keys(before).filter((k) => after[k] !== before[k]);
        const added = Object.keys(after).filter((k) => before[k] === undefined);
        return { p, changed, added };
      });
      check(`导入拒绝：${label} → ok=false（错误含「${errPart}」）且现有存档逐键不变`,
        !r.threw && r.p.ok === false && String(r.p.error).indexOf(errPart) >= 0 &&
        r.changed.length === 0 && r.added.length === 0,
        r.threw ? `抛异常：${r.threw}` : `ok=${r.p.ok} error="${r.p.error}" · 改动 ${r.changed.length} 键 · 新增 ${r.added.length} 键`);
    }

    // 5.3 importSave 的入参防御
    const badImport = [
      ["空对象", {}, "存档不含任何 bike_ 键"],
      ["null", null, "存档不含任何 bike_ 键"],
      ["数组", [1, 2, 3], "存档不含任何 bike_ 键"],
      ["字符串", "hello", "存档不含任何 bike_ 键"],
      ["数字", 42, "存档不含任何 bike_ 键"],
      ["非 bike_ 前缀", { gold: "5", level: "3" }, "存档不含任何 bike_ 键"],
      ["全为 null 值", { bike_gold: null, bike_best: undefined }, "存档不含任何 bike_ 键"],
    ];
    for (const [label, inp, errPart] of badImport) {
      const r = run(() => {
        loadBaseline();
        const before = snapRaw();
        const res = st.importSave(inp);
        const after = snapRaw();
        return { res, changed: Object.keys(before).filter((k) => after[k] !== before[k]) };
      });
      check(`importSave 拒绝：${label} → ok=false 且现有存档逐键不变`,
        !r.threw && r.res.ok === false && String(r.res.error).indexOf(errPart) >= 0 && r.changed.length === 0,
        r.threw ? `抛异常：${r.threw}` : `ok=${r.res.ok} error="${r.res.error}" · 改动 ${r.changed.length} 键`);
    }

    // 5.4 导出、重置、导入：逐键一致
    const rt = run(() => {
      loadBaseline();
      const dump = st.exportSave();
      const before = snapRaw();
      st.resetSave();
      const afterReset = snapRaw();
      const resetChanged = Object.keys(before).filter((k) => afterReset[k] !== before[k]);
      const p = st.parseSave(JSON.stringify(dump));
      st.importSave(p.data);
      const after = snapRaw();
      return { p, before, after, afterReset, resetChanged };
    });
    check("往返：合法导出文件可被 parseSave 接受（ok=true 且带 summary）",
      !rt.threw && rt.p.ok === true && isObj(rt.p.data) && isObj(rt.p.summary),
      rt.threw ? `抛异常：${rt.threw}` : `summary=${j(rt.p.summary)}`);
    const rtUnchanged = rt.threw ? [] : Object.keys(rt.before).filter((k) => rt.afterReset[k] === rt.before[k]);
    // 基线里 15 个键都写了哨兵值，只有 bike_v 在重置前后都是 "3"（重置写入的值与原值相同），
    // 所以"确实被清空"的正确口径是 14/15 个键的值发生变化，且未变集合恰好只有 bike_v。
    check("往返：resetSave 之后存档确实被清空（15 键里 14 键的值被改写，未变的只有 bike_v）",
      !rt.threw && rt.resetChanged.length === ALL_KEY_FIELDS.length - 1 &&
      rtUnchanged.length === 1 && rtUnchanged[0] === SAVE_KEYS.ver,
      rt.threw ? `抛异常：${rt.threw}` : `改写 ${rt.resetChanged.length}/${ALL_KEY_FIELDS.length} 键 · 未变 ${rtUnchanged.join(",") || "无"}（bike_v 重置前后都是 "3"，故值相同而非未被重置）`);
    const rtDiff = rt.threw ? ["抛异常"] : Object.keys(rt.before).filter((k) => rt.after[k] !== rt.before[k]);
    check(`往返：导入后 ${Object.keys(rt.before || {}).length} 个键逐字节与导出前完全一致`,
      !rt.threw && rtDiff.length === 0,
      rt.threw ? `抛异常：${rt.threw}` : `差异键 ${rtDiff.join(",") || "无"}（逐键比对 ${Object.keys(rt.before || {}).length} 项）`);
    const rtStore = run(() => {
      loadBaseline();
      const dump = st.exportSave();
      st.resetSave();
      st.importSave(dump.data);
      return {
        gold: store.gold, unlocked: store.unlocked, best: store.best, veh: store.currentVehicle,
        owned: store.ownedVehicles, ach: store.achGot, sel: store.selLevel, ultra: store.ultra,
        up: store.upgrades, rating: store.progress.rating, wins: store.progress.wins, losses: store.progress.losses,
        peak: store.progress.peak, stat: store.stat, starSum: sum(store.stars), starLen: store.stars.length,
      };
    });
    const rtBad = [];
    if (!rtStore.threw) {
      if (rtStore.gold !== 1234) rtBad.push(`gold=${rtStore.gold}`);
      if (rtStore.unlocked !== 17) rtBad.push(`unlocked=${rtStore.unlocked}`);
      if (rtStore.best !== 4321) rtBad.push(`best=${rtStore.best}`);
      if (rtStore.veh !== 1) rtBad.push(`veh=${rtStore.veh}`);
      if (j(rtStore.owned) !== "[0,1]") rtBad.push(`owned=${j(rtStore.owned)}`);
      if (j(rtStore.ach) !== '["air","flip"]') rtBad.push(`ach=${j(rtStore.ach)}`);
      if (rtStore.sel !== 23) rtBad.push(`sel=${rtStore.sel}`);
      if (rtStore.ultra.sport !== true) rtBad.push(`ultra=${j(rtStore.ultra)}`);
      if (!rtStore.up.sport || rtStore.up.sport.engine !== 5) rtBad.push(`up=${j(rtStore.up)}`);
      if (rtStore.rating !== 1350) rtBad.push(`rating=${rtStore.rating}`);
      if (rtStore.wins !== 3 || rtStore.losses !== 4) rtBad.push(`战绩=${rtStore.wins}胜${rtStore.losses}负`);
      if (rtStore.peak !== true) rtBad.push(`peak=${rtStore.peak}`);
      if (rtStore.starSum !== (LV - 1) * 3 || rtStore.starLen !== LV) rtBad.push(`stars=${rtStore.starLen}项/和${rtStore.starSum}`);
      if (rtStore.stat.totalRuns !== 11 || !near(rtStore.stat.totalMeters, 12345.6, 1e-9)) rtBad.push(`stat=${j(rtStore.stat)}`);
    }
    check("往返：导入后 store 内存态与导出前逐字段一致（15 键全覆盖）",
      !rtStore.threw && rtBad.length === 0,
      rtStore.threw ? `抛异常：${rtStore.threw}` : `偏差：${rtBad.join(" · ") || "无"}（金币 1234 / 段位 1350 / 战绩 3 胜 4 负 / 统计 11 局）`);

    // 5.4b 导出文本的两条真实通路：紧凑 JSON（面板 paste）与缩进 JSON（downloadSave）
    const rtText = run(() => {
      loadBaseline();
      const dump = st.exportSave();
      const compact = JSON.stringify(dump);
      const indented = JSON.stringify(dump, null, 2);
      st.resetSave();
      const pa = st.parseSave(compact);
      st.importSave(pa.data);
      const a = j(store.gold) + "|" + j(store.progress.rating) + "|" + j(store.stars.slice(0, 3));
      st.resetSave();
      const pb = st.parseSave(indented);
      st.importSave(pb.data);
      return { a, b: j(store.gold) + "|" + j(store.progress.rating) + "|" + j(store.stars.slice(0, 3)), ca: compact.length, cb: indented.length };
    });
    check("往返：紧凑 JSON 与缩进 JSON 两条文本通路解析结果完全相同",
      !rtText.threw && rtText.a === rtText.b && rtText.a.indexOf("1234|1350") === 0,
      rtText.threw ? `抛异常：${rtText.threw}` : `紧凑 ${rtText.ca} 字符 / 缩进 ${rtText.cb} 字符 → 两者均还原为 ${rtText.a}`);
    const rtEmpty = run(() => {
      LS.clear();
      const d = st.exportSave();
      return { n: Object.keys(d.data).length, keys: Object.keys(d.data) };
    });
    check("导出：localStorage 完全为空时 data 为空对象（缺失键不写成 null）",
      !rtEmpty.threw && rtEmpty.n === 0,
      rtEmpty.threw ? `抛异常：${rtEmpty.threw}` : `data 键数 ${rtEmpty.n} · 键 ${rtEmpty.keys.join(",") || "无"}`);
    const rtRef = run(() => {
      fresh(); loadAll();
      const ref = store.stars;
      st.loadSave();
      return { same: ref === store.stars, len: store.stars.length };
    });
    check("loadSave：store.stars 被整体替换为新数组（不原地改写旧引用）",
      !rtRef.threw && rtRef.same === false && rtRef.len === LV,
      rtRef.threw ? `抛异常：${rtRef.threw}` : `两次读档得到不同数组引用 · 长度 ${rtRef.len}`);
    const rtProg = run(() => {
      fresh(); loadAll();
      const ref = store.progress;
      st.loadProgress();
      return { same: ref === store.progress, keys: Object.keys(store.progress).join(",") };
    });
    check("loadProgress：store.progress 保持同一对象引用并就地补齐 8 个字段（不破坏外部引用）",
      !rtProg.threw && rtProg.same === true && rtProg.keys.split(",").length === 8,
      rtProg.threw ? `抛异常：${rtProg.threw}` : `引用不变=${rtProg.same} · 字段 ${rtProg.keys}`);
    const rtRating = run(() => {
      fresh(); loadAll();
      store.progress.rating = 1234;
      st.saveProgress();
      return { raw: LS.getItem(SAVE_KEYS.rating) };
    });
    check("saveProgress：bike_rating 以纯十进制字符串落盘（不带 JSON 包装）",
      !rtRating.threw && rtRating.raw === "1234",
      rtRating.threw ? `抛异常：${rtRating.threw}` : `bike_rating="${rtRating.raw}"`);
    const rtRet = run(() => {
      loadBaseline();
      const d = st.exportSave().data;
      const res = st.importSave(d);
      return { ok: res.ok, has: res.data !== null && typeof res.data === "object", n: Object.keys(res.data || {}).length };
    });
    check("importSave：成功时返回 ok=true 且回传原始 data 映射（便于界面刷新）",
      !rtRet.threw && rtRet.ok === true && rtRet.has === true && rtRet.n >= ALL_KEY_FIELDS.length,
      rtRet.threw ? `抛异常：${rtRet.threw}` : `返回 data 含 ${rtRet.n} 个键`);

    // 5.5 特殊字符往返
    const uni = "中文·测试 🚴 «引号» \\反斜杠\\ \"双引号\" '单引号'\n换行\t制表符 😀🎉 <script>alert(1)</script> %s %d {花括号} [方括号] 末尾";
    const rUni = run(() => {
      loadBaseline();
      LS.setItem("bike_unicode_field", uni);
      const dump = st.exportSave();
      const p = st.parseSave(JSON.stringify(dump));
      st.importSave(p.data);
      return { got: LS.getItem("bike_unicode_field"), exported: dump.data.bike_unicode_field };
    });
    check("特殊字符：含中文、emoji、引号、反斜杠、换行制表、尖括号的字段导出后逐字节不变",
      !rUni.threw && rUni.exported === uni, rUni.threw ? `抛异常：${rUni.threw}` : `导出往返一致（${rUni.exported ? rUni.exported.length : 0} 字符）`);
    check("特殊字符：该字段经 parseSave 与 importSave 全链路后仍逐字节还原",
      !rUni.threw && rUni.got === uni,
      rUni.threw ? `抛异常：${rUni.threw}` : `还原 ${rUni.got === uni ? "完全一致" : "不一致：期望 " + JSON.stringify(uni) + " 实际 " + JSON.stringify(rUni.got)}`);
    const rUni2 = run(() => {
      loadBaseline();
      LS.setItem("bike_unicode_field", "🚴");
      const d1 = st.exportSave();
      const d2 = st.exportSave();
      return { a: d1.data.bike_unicode_field, b: d2.data.bike_unicode_field };
    });
    check("特殊字符：4 字节代理对（emoji）不被 UTF-16 截断成乱码",
      !rUni2.threw && rUni2.a === "🚴" && rUni2.b === "🚴",
      rUni2.threw ? `抛异常：${rUni2.threw}` : `两次导出均为 ${j(rUni2.a)}`);
    const SPACED = "a" + " " + "b" + " " + "c";
    const rUni3 = run(() => {
      loadBaseline();
      LS.setItem("bike_unicode_field", SPACED);
      const d = st.exportSave();
      st.resetSave();
      st.importSave(d.data);
      return { got: LS.getItem("bike_unicode_field") };
    });
    check("特殊字符：含内部空格的字符串经重置与导入后不丢不增",
      !rUni3.threw && rUni3.got === SPACED, rUni3.threw ? `抛异常：${rUni3.threw}` : `还原为 ${j(rUni3.got)}`);

    // 5.6 summarizeSave
    const rSum = run(() => {
      loadBaseline();
      return { s: st.summarizeSave(st.exportSave().data) };
    });
    const expCleared = BASE_STARS.filter((s) => s > 0).length;
    check("summarizeSave：cleared 等于有星关卡数、stars 等于星级总和、rating 与 gold 与存档一致",
      !rSum.threw && rSum.s.cleared === expCleared && rSum.s.stars === (LV - 1) * 3 &&
      rSum.s.rating === 1350 && rSum.s.gold === 1234,
      rSum.threw ? `抛异常：${rSum.threw}` : `通关 ${rSum.s.cleared}/${expCleared} · 星总和 ${rSum.s.stars}/${(LV - 1) * 3} · 段位 ${rSum.s.rating} · 金币 ${rSum.s.gold}`);
    check("summarizeSave：入参非法（null / 数组 / 空对象 / 数字 / 字符串）回退为全 0 概览且不抛",
      !rSum.threw && [null, [], {}, 5, "x"].every((x) => {
        const s = st.summarizeSave(x);
        return s.cleared === 0 && s.stars === 0 && s.rating === 0 && s.gold === 0;
      }),
      "null / [] / {} / 5 / x → 全 0");
    const rSum2 = run(() => {
      loadBaseline();
      return {
        neg: st.summarizeSave({ bike_stars: "[]", bike_rating: "-5", bike_gold: "abc" }),
        full: st.summarizeSave(st.exportSave()),
        fullObj: st.summarizeSave(st.exportSave()),
      };
    });
    check("summarizeSave：负段位分与非数字金币夹到 0（概览不出现负数或 NaN）",
      !rSum2.threw && rSum2.neg.rating === 0 && rSum2.neg.gold === 0 && rSum2.neg.cleared === 0,
      rSum2.threw ? `抛异常：${rSum2.threw}` : `rating="-5" → ${rSum2.neg.rating} · gold="abc" → ${rSum2.neg.gold}`);
    check("summarizeSave：可同时接受完整导出对象与裸 data 映射（两种入参结果一致）",
      !rSum2.threw && j(rSum2.full) === j(rSum2.fullObj),
      rSum2.threw ? `抛异常：${rSum2.threw}` : `两种入参均得到 ${j(rSum2.full)}`);

    // 5.7 importSave 的全量覆盖语义
    const rCov = run(() => {
      loadBaseline();
      const d = st.exportSave().data;
      d[SAVE_KEYS.gold] = "777";
      d[SAVE_KEYS.best] = "888";
      const res = st.importSave(d);
      return { res, gold: store.gold, best: store.best };
    });
    check("importSave：写入的键立即生效于 store（导入后金币 777、最佳里程 888）",
      !rCov.threw && rCov.res.ok === true && rCov.gold === 777 && rCov.best === 888,
      rCov.threw ? `抛异常：${rCov.threw}` : `gold=${rCov.gold} best=${rCov.best}`);
    const rCov2 = run(() => {
      loadBaseline();
      const d = st.exportSave().data;
      delete d[SAVE_KEYS.ach];
      st.importSave(d);
      return { ach: store.achGot, raw: LS.getItem(SAVE_KEYS.ach) };
    });
    check("importSave：整体覆盖语义 —— 未出现在文件里的键被清除并回退默认（ach 被移除，loadAchList 给出空数组）",
      !rCov2.threw && rCov2.ach.length === 0 && rCov2.raw === null,
      rCov2.threw ? `抛异常：${rCov2.threw}` : `achGot=${j(rCov2.ach)} · 落盘 bike_ach=${rCov2.raw === null ? "已移除" : rCov2.raw}`);
    const rCov3 = run(() => {
      loadBaseline();
      LS.setItem("dale_quality", "low");
      st.importSave(st.exportSave().data);
      return { q: LS.getItem("dale_quality") };
    });
    check("importSave：只动 bike_ 前缀键，非存档键 dale_quality 保持不变",
      !rCov3.threw && rCov3.q === "low", rCov3.threw ? `抛异常：${rCov3.threw}` : `dale_quality 仍为 "${rCov3.q}"`);
    const rCov4 = run(() => {
      loadBaseline();
      LS.setItem("bike_future_2099", "会被保留");
      const d = st.exportSave().data;
      st.resetSave();
      st.importSave(d);
      return { f: LS.getItem("bike_future_2099") };
    });
    check("importSave：文件内自带的 bike_ 前缀扩展键被一并恢复（未来格式兼容）",
      !rCov4.threw && rCov4.f === "会被保留", rCov4.threw ? `抛异常：${rCov4.threw}` : `bike_future_2099 → ${j(rCov4.f)}`);
    const rCov5 = run(() => {
      loadBaseline();
      const d = st.exportSave().data;
      d[SAVE_KEYS.gold] = 500;
      const res = st.importSave(d);
      return { res, raw: LS.getItem(SAVE_KEYS.gold), g: store.gold };
    });
    check("importSave：非字符串值（数字）被 String 规范化后写入，读取正常",
      !rCov5.threw && rCov5.res.ok === true && rCov5.raw === "500" && rCov5.g === 500,
      rCov5.threw ? `抛异常：${rCov5.threw}` : `写入数字 500 → 落盘 "${rCov5.raw}" → 读回 ${rCov5.g}`);

    // 5.8 resetSave 的清场彻底性
    const rRst = run(() => {
      fresh();
      LS.setItem("bike_future_2099", "残留");
      LS.setItem("dale_quality", "low");
      LS.setItem("non_bike", "保留");
      st.resetSave();
      return { left: snapRaw(), quality: LS.getItem("dale_quality"), non: LS.getItem("non_bike") };
    });
    check("resetSave：清空全部 bike_ 键（含未来扩展键）并重写 15 个受管理键",
      !rRst.threw && !("bike_future_2099" in rRst.left) && Object.keys(rRst.left).length === ALL_KEY_FIELDS.length,
      rRst.threw ? `抛异常：${rRst.threw}` : `残留键 ${Object.keys(rRst.left).length} 个（应为 ${ALL_KEY_FIELDS.length}）· 扩展键已清 · 非存档键保留（dale_quality="${rRst.quality}" non_bike="${rRst.non}"）`);
    const rRst2 = run(() => {
      fresh();
      st.resetSave();
      return {
        gold: store.gold, unlocked: store.unlocked, best: store.best, veh: store.currentVehicle,
        owned: store.ownedVehicles, ach: store.achGot, muted: store.muted, ultra: store.ultra,
        up: store.upgrades, starLen: store.stars.length, starSum: sum(store.stars),
        p: store.progress, s: store.stat,
      };
    });
    const rstBad = [];
    if (!rRst2.threw) {
      if (rRst2.gold !== 0) rstBad.push(`gold=${rRst2.gold}`);
      if (rRst2.unlocked !== 0) rstBad.push(`unlocked=${rRst2.unlocked}`);
      if (rRst2.best !== 0) rstBad.push(`best=${rRst2.best}`);
      if (rRst2.veh !== 0) rstBad.push(`veh=${rRst2.veh}`);
      if (j(rRst2.owned) !== "[0]") rstBad.push(`owned=${j(rRst2.owned)}`);
      if (rRst2.ach.length !== 0) rstBad.push(`ach=${j(rRst2.ach)}`);
      if (rRst2.muted !== false) rstBad.push(`muted=${rRst2.muted}`);
      if (Object.keys(rRst2.ultra).length !== 0) rstBad.push(`ultra=${j(rRst2.ultra)}`);
      if (Object.keys(rRst2.up).length !== 0) rstBad.push(`up=${j(rRst2.up)}`);
      if (rRst2.starLen !== LV || rRst2.starSum !== 0) rstBad.push(`stars=${rRst2.starLen}项/和${rRst2.starSum}`);
      if (rRst2.p.finaleDone !== false || rRst2.p.invited !== false || rRst2.p.rating !== 0 ||
        rRst2.p.wins !== 0 || rRst2.p.losses !== 0 || rRst2.p.peak !== false) rstBad.push(`progress=${j(rRst2.p)}`);
      if (rRst2.s.totalRuns !== 0 || rRst2.s.totalMeters !== 0 || rRst2.s.totalSeconds !== 0 || rRst2.s.lastPlayed !== "") rstBad.push(`stat=${j(rRst2.s)}`);
    }
    check("resetSave：store 内存态被完全复位（仅第 1 关解锁、0 金币、0 成就、段位归零）",
      !rRst2.threw && rstBad.length === 0,
      rRst2.threw ? `抛异常：${rRst2.threw}` : `偏差：${rstBad.join(" · ") || "无"}`);
    const rSel = run(() => {
      loadBaseline();
      const before = store.selLevel;
      st.resetSave();
      return { before, after: store.selLevel, raw: LS.getItem(SAVE_KEYS.sel) };
    });
    check("resetSave：选中关卡也归位到第 1 关（selLevel 归 0）",
      !rSel.threw && rSel.after === 0,
      rSel.threw ? `抛异常：${rSel.threw}` : `重置前 selLevel=${rSel.before} → 重置后 selLevel=${rSel.after}（bike_sel="${rSel.raw}"）：resetSave 的复位字段清单里没有 selLevel，故上局的选关被保留`);
    const rRst3 = run(() => { fresh(); st.resetSave(); loadAll(); return { g: store.gold, b: store.best, len: store.stars.length }; });
    check("resetSave：重置后再次完整读档仍得到干净状态（落盘与内存自洽）",
      !rRst3.threw && rRst3.g === 0 && rRst3.b === 0 && rRst3.len === LV,
      rRst3.threw ? `抛异常：${rRst3.threw}` : `重读后 gold=${rRst3.g} best=${rRst3.b} stars=${rRst3.len} 项`);

    // 5.9 downloadSave 优雅降级
    const rDl = run(() => {
      loadBaseline();
      let threw = null, ok = null;
      try { ok = st.downloadSave(); } catch (e) { threw = e.message; }
      return { threw, ok, gold: store.gold };
    });
    check("downloadSave：无浏览器下载环境时不抛异常（优雅降级返回布尔）",
      !rDl.threw && rDl.threw === null && typeof rDl.ok === "boolean" && rDl.gold === 1234,
      rDl.threw ? `抛异常：${rDl.threw}` : `返回 ${rDl.ok} · 存档未受影响（gold=${rDl.gold}）`);

    // 5.10 存储不可用降级
    const rAvail = run(() => {
      loadBaseline();
      const realGet = LS.getItem, realSet = LS.setItem;
      LS.getItem = () => { throw new Error("blocked"); };
      LS.setItem = () => { throw new Error("blocked"); };
      let threw = null;
      try { loadAll(); st.save(); st.saveProgress(); st.saveAchList(); } catch (e) { threw = e.message; }
      const avail = st.isStorageAvailable();
      LS.getItem = realGet; LS.setItem = realSet;
      return { threw, avail };
    });
    check("存储不可用：读写全抛时 loadSave/save/loadProgress 不崩且标记为不可用",
      !rAvail.threw && rAvail.threw === null && rAvail.avail === false,
      rAvail.threw ? `抛异常：${rAvail.threw}` : `未中断，isStorageAvailable=${rAvail.avail}`);
    const rAvail2 = run(() => {
      loadBaseline();
      loadAll();
      return { avail: st.isStorageAvailable(), gold: store.gold };
    });
    check("存储不可用：读写恢复后读档正常（不可用标记不阻断后续读取）",
      !rAvail2.threw && rAvail2.gold === 1234,
      rAvail2.threw ? `抛异常：${rAvail2.threw}` : `gold=${rAvail2.gold} · isStorageAvailable=${rAvail2.avail}`);

    // 5.11 导入视图与实际结果的差异
    const rView = run(() => {
      fresh(); loadAll();
      const d = st.exportSave().data;
      d[SAVE_KEYS.gold] = "500";
      const p = st.parseSave(j({ app: SAVE_APP, format: SAVE_FORMAT, data: d }));
      st.importSave(p.data);
      return { preview: p.summary.gold, stored: store.gold, raw: LS.getItem(SAVE_KEYS.gold) };
    });
    check("导入预览与落库一致：自产文件（含 bike_v=3）预览金币等于导入后金币",
      !rView.threw && rView.preview === rView.stored,
      rView.threw ? `抛异常：${rView.threw}` : `预览 ${rView.preview} · 落库 ${rView.stored} · 落盘 "${rView.raw}"`);
    const rView2 = run(() => {
      fresh(); loadAll();
      const d = st.exportSave().data;
      d[SAVE_KEYS.gold] = "500";
      delete d[SAVE_KEYS.ver];
      const p = st.parseSave(j({ app: SAVE_APP, format: SAVE_FORMAT, data: d }));
      st.importSave(p.data);
      return { preview: p.summary.gold, stored: store.gold, raw: LS.getItem(SAVE_KEYS.gold), ver: LS.getItem(SAVE_KEYS.ver) };
    });
    // 预览值与落库值都是 **数字**（summarizeSave / store.gold 都已解析），
    // 这里必须与 500 比数字；早前版本误写成字符串 "500" 而恒为 false。
    check("导入预览与落库一致：缺少 bike_v 的文件不会让金币被版本迁移放大 10 倍",
      !rView2.threw && rView2.preview === 500 && rView2.stored === 500 && rView2.raw === "500",
      rView2.threw ? `抛异常：${rView2.threw}` : `文件写 500 / 预览 ${rView2.preview} / 落库 ${rView2.stored} · 落盘 "${rView2.raw}" · 导入后 bike_v=${rView2.ver}（缺 ver 的自产文件不得被当成 v1 老档而重跑货币迁移）`);
  }

  // ============================================================
  //  6. 成就（hasAch / checkAch / bike_ach）
  // ============================================================
  section("成就（8 个 id 的判定 / 落盘 / 幂等）");
  {
    check("ACHS：8 个成就 id 唯一、非空、且每个都带名称与描述",
      ACHS.length === 8 && new Set(ACHS.map((a) => a.id)).size === 8 && ACHS.every((a) => a.id && a.name && a.desc),
      ACHS.map((a) => `${a.id}(${a.name})`).join(" "));

    // 6.1 初始 8 个 id 全部未解锁
    const r0 = run(() => { fresh(); loadAll(); return { ids: ACHS.map((a) => progM.hasAch(a.id)), got: store.achGot }; });
    for (let i = 0; i < ACHS.length; i++) {
      const a = ACHS[i];
      check(`hasAch：初始状态下「${a.name}」（${a.id}）为 false`,
        !r0.threw && r0.ids[i] === false && r0.got.length === 0,
        r0.threw ? `抛异常：${r0.threw}` : `achGot=${j(r0.got)}`);
    }

    // 6.2 逐个解锁 → 写入 bike_ach
    for (const a of ACHS) {
      const r = run(() => {
        fresh(); loadAll();
        const before = progM.hasAch(a.id);
        const ret = progM.checkAch(a.id);
        return { before, ret, after: progM.hasAch(a.id), got: store.achGot, raw: LS.getItem(SAVE_KEYS.ach), n: store.achGot.length };
      });
      check(`checkAch：解锁「${a.name}」（${a.id}）返回 true、hasAch 翻转为 true、bike_ach 落盘`,
        !r.threw && r.before === false && r.ret === true && r.after === true && r.n === 1 && r.raw === j([a.id]),
        r.threw ? `抛异常：${r.threw}` : `返回 ${r.ret} · hasAch ${r.before} → ${r.after} · 落盘 ${r.raw}`);
    }

    // 6.3 重复解锁不重复计数
    for (const a of ACHS) {
      const r = run(() => {
        fresh(); loadAll();
        progM.checkAch(a.id);
        const r2 = progM.checkAch(a.id);
        const r3 = progM.checkAch(a.id);
        return { r2, r3, n: store.achGot.length, raw: LS.getItem(SAVE_KEYS.ach) };
      });
      check(`checkAch：「${a.name}」（${a.id}）重复解锁返回 false 且不重复计数`,
        !r.threw && r.r2 === false && r.r3 === false && r.n === 1 && r.raw === j([a.id]),
        r.threw ? `抛异常：${r.threw}` : `第 2 次=${r.r2} 第 3 次=${r.r3} · achGot 长度 ${r.n} · 落盘 ${r.raw}`);
    }

    // 6.4 全解锁后的整体状态
    const rAll = run(() => {
      fresh(); loadAll();
      const firsts = ACHS.map((a) => progM.checkAch(a.id));
      const seconds = ACHS.map((a) => progM.checkAch(a.id));
      return { firsts, seconds, n: store.achGot.length, raw: LS.getItem(SAVE_KEYS.ach), all: ACHS.map((a) => progM.hasAch(a.id)) };
    });
    check("checkAch：8 个成就各解锁一次全部返回 true，achGot 长度精确为 8 且顺序与 ACHS 表一致",
      !rAll.threw && rAll.firsts.every(Boolean) && rAll.n === 8 &&
      rAll.raw === j(ACHS.map((a) => a.id)) && rAll.all.every(Boolean),
      rAll.threw ? `抛异常：${rAll.threw}` : `bike_ach=${String(rAll.raw).slice(0, 74)}`);
    check("checkAch：全部再解锁一遍返回 8 个 false（无重复计数）",
      !rAll.threw && rAll.seconds.every((x) => x === false) && rAll.n === 8,
      rAll.threw ? `抛异常：${rAll.threw}` : `二次解锁返回 ${j(rAll.seconds)} · achGot 仍为 ${rAll.n} 项`);

    // 6.5 落盘往返
    const rRt = run(() => {
      fresh(); loadAll();
      for (const a of ACHS) progM.checkAch(a.id);
      const raw = LS.getItem(SAVE_KEYS.ach);
      store.achGot = [];
      st.loadAchList();
      return { got: store.achGot, all: ACHS.map((a) => progM.hasAch(a.id)) };
    });
    check("loadAchList：bike_ach 落盘往返后 8 个 id 全部还原",
      !rRt.threw && rRt.got.length === 8 && rRt.all.every(Boolean) && j(rRt.got) === j(ACHS.map((a) => a.id)),
      rRt.threw ? `抛异常：${rRt.threw}` : `重读后 achGot=${String(j(rRt.got)).slice(0, 74)}`);

    // 6.6 非表内 id 与脏值
    const rUnknown = run(() => {
      fresh(); loadAll();
      const ret = progM.checkAch("no-such-achievement");
      return { ret, got: store.achGot, raw: LS.getItem(SAVE_KEYS.ach), has: progM.hasAch("no-such-achievement") };
    });
    check("checkAch：非 ACHS 表内的 id 仍被记录且 hasAch 可判定（不静默丢弃玩家的解锁）",
      !rUnknown.threw && rUnknown.ret === true && rUnknown.got.length === 1 && rUnknown.has === true && rUnknown.raw === j(["no-such-achievement"]),
      rUnknown.threw ? `抛异常：${rUnknown.threw}` : `返回 ${rUnknown.ret} · achGot=${j(rUnknown.got)} · 落盘 ${rUnknown.raw}`);
    const rJunk = run(() => {
      const rows = [];
      // 只取非数组的损坏值：数组是合法形态（元素合法性由下一项单独覆盖）
      for (const raw of ['{"air":true}', "5", "@@", '"abc"', "null", "true", "[]"]) {
        fresh();
        LS.setItem(SAVE_KEYS.ach, raw);
        st.loadAchList();
        rows.push(`${raw} → ${j(store.achGot)}`);
      }
      return { rows };
    });
    check("loadAchList：非数组内容（对象 / 数字 / 字符串 / 布尔 / 非法 JSON / null / 空数组）全部回退为空数组",
      !rJunk.threw && rJunk.rows.every((s) => s.endsWith("[]")),
      rJunk.threw ? `抛异常：${rJunk.threw}` : rJunk.rows.join(" · "));
    const rNonStr = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ach, j(["air", 1, null, "flip"]));
      st.loadAchList();
      return { got: store.achGot, hasAir: progM.hasAch("air"), hasNum: progM.hasAch(1) };
    });
    check("loadAchList：数组内的非字符串元素不被过滤（hasAch 对数字 id 也返回 true）",
      !rNonStr.threw && rNonStr.got.length === 4 && rNonStr.hasAir === true && rNonStr.hasNum === true,
      rNonStr.threw ? `抛异常：${rNonStr.threw}` : `achGot=${j(rNonStr.got)} · hasAch("air")=${rNonStr.hasAir} hasAch(1)=${rNonStr.hasNum}`);

    // 6.7 addGold 触发 rich
    const rGold = run(() => {
      fresh(); loadAll();
      progM.addGold(4999);
      const before = progM.hasAch("rich");
      progM.addGold(1);
      return { before, after: progM.hasAch("rich"), gold: store.gold, raw: LS.getItem(SAVE_KEYS.ach) };
    });
    check("addGold：金币跨过 5000 时自动解锁「小康之家」（rich）",
      !rGold.threw && rGold.gold === 5000 && rGold.before === false && rGold.after === true && rGold.raw === j(["rich"]),
      rGold.threw ? `抛异常：${rGold.threw}` : `4999 时 rich=${rGold.before} · 5000 时 rich=${rGold.after} · 落盘 ${rGold.raw}`);
    const rGold0 = run(() => {
      fresh(); loadAll();
      progM.addGold(0);
      progM.addGold(0);
      return { gold: store.gold, rich: progM.hasAch("rich") };
    });
    check("addGold：增量为 0 时是空操作（不落盘、不误触成就）",
      !rGold0.threw && rGold0.gold === 0 && rGold0.rich === false,
      rGold0.threw ? `抛异常：${rGold0.threw}` : `gold=${rGold0.gold} rich=${rGold0.rich}`);
    const rGold1 = run(() => {
      fresh(); loadAll();
      progM.addGold(1);
      return { gold: store.gold, rich: progM.hasAch("rich") };
    });
    check("addGold：金币远低于阈值时不触发 rich",
      !rGold1.threw && rGold1.gold === 1 && rGold1.rich === false,
      rGold1.threw ? `抛异常：${rGold1.threw}` : `gold=${rGold1.gold} rich=${rGold1.rich}`);

    // 6.8 resetSave 清空成就
    const rRst = run(() => {
      fresh(); loadAll();
      for (const a of ACHS) progM.checkAch(a.id);
      st.resetSave();
      st.loadAchList();
      return { any: ACHS.some((a) => progM.hasAch(a.id)), raw: LS.getItem(SAVE_KEYS.ach) };
    });
    check("resetSave：8 个成就全部被清空（hasAch 全部 false，bike_ach 落盘空数组）",
      !rRst.threw && rRst.any === false && rRst.raw === "[]",
      rRst.threw ? `抛异常：${rRst.threw}` : `仍有已解锁成就=${rRst.any} · 落盘 ${rRst.raw}`);

    // 6.9 逐 id 隔离
    const rIso = run(() => {
      loadBaseline();
      const out = [];
      let gold = 0, rating = 0;
      for (const a of ACHS) {
        loadBaseline();
        LS.removeItem(SAVE_KEYS.ach);
        st.loadAchList();
        out.push([a.id, store.achGot.length]);
        gold = store.gold; rating = store.progress.rating;
      }
      return { out, gold, rating };
    });
    check("删除 bike_ach 键：只清成就，8 个 id 全部变 false 且金币与段位等其它键不受影响",
      !rIso.threw && rIso.out.every(([, n]) => n === 0) && rIso.gold === 1234 && rIso.rating === 1350,
      rIso.threw ? `抛异常：${rIso.threw}` : `8 个 id 逐一验证均为 0 项 · 末轮同帧内 gold=${rIso.gold} rating=${rIso.rating}`);

    // 6.10 导入导出的成就往返
    const rRt2 = run(() => {
      fresh(); loadAll();
      for (const a of ACHS) progM.checkAch(a.id);
      const d = st.exportSave().data;
      st.resetSave();
      st.loadAchList();
      const mid = store.achGot.length;
      st.importSave(d);
      return { mid, got: store.achGot, all: ACHS.every((a) => progM.hasAch(a.id)) };
    });
    check("成就经导出、重置、导入完整还原（重置后 0 项，导入后 8 项全回）",
      !rRt2.threw && rRt2.mid === 0 && rRt2.got.length === 8 && rRt2.all === true,
      rRt2.threw ? `抛异常：${rRt2.threw}` : `重置后 ${rRt2.mid} 项 → 导入后 ${rRt2.got.length} 项 · 全部命中=${rRt2.all}`);
  }

  // ============================================================
  //  7. 累计统计（bike_stat）
  // ============================================================
  section("累计统计（bike_stat 的累加 / 序列化 / 兼容）");
  {
    check("store.stat：4 个字段齐全且类型正确",
      isObj(store.stat) && isNum(store.stat.totalRuns) && isNum(store.stat.totalMeters) &&
      isNum(store.stat.totalSeconds) && typeof store.stat.lastPlayed === "string",
      `字段 ${Object.keys(store.stat).join(",")}`);

    // 7.1 累加
    const r1 = run(() => {
      fresh(); loadAll();
      st.addStat({ runs: 3, meters: 120.5, seconds: 45 });
      const a = j(store.stat);
      st.addStat({ runs: 2, meters: 79.5, seconds: 15 });
      return { a, b: store.stat, raw: LS.getItem(SAVE_KEYS.stat) };
    });
    check("addStat：多次累加后 4 个字段精确求和（5 局 / 200 米 / 60 秒）",
      !r1.threw && r1.b.totalRuns === 5 && near(r1.b.totalMeters, 200, 1e-9) && near(r1.b.totalSeconds, 60, 1e-9),
      r1.threw ? `抛异常：${r1.threw}` : `第 1 次后 ${r1.a} → 第 2 次后 totalRuns=${r1.b.totalRuns} totalMeters=${r1.b.totalMeters} totalSeconds=${r1.b.totalSeconds}`);
    check("addStat：累加后立即落盘且落盘值与内存一致（逐字节）",
      !r1.threw && r1.raw === j({ totalRuns: 5, totalMeters: 200, totalSeconds: 60, lastPlayed: r1.b.lastPlayed }),
      r1.threw ? `抛异常：${r1.threw}` : `bike_stat=${String(r1.raw).slice(0, 80)}`);
    check("addStat：lastPlayed 被刷新为可解析的 ISO 时间戳",
      !r1.threw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r1.b.lastPlayed) && !isNaN(Date.parse(r1.b.lastPlayed)),
      r1.threw ? `抛异常：${r1.threw}` : r1.b.lastPlayed);
    const r2 = run(() => {
      fresh(); loadAll();
      st.addStat({ runs: 1, meters: 1, seconds: 1 });
      const t1 = store.stat.lastPlayed;
      st.addStat({ runs: 1, meters: 1, seconds: 1 });
      const t2 = store.stat.lastPlayed;
      return { t1, t2, mono: Date.parse(t2) >= Date.parse(t1) };
    });
    check("addStat：连续两次调用 lastPlayed 单调不减（不倒退）",
      !r2.threw && r2.mono, r2.threw ? `抛异常：${r2.threw}` : `${r2.t1} → ${r2.t2}`);
    const r3 = run(() => {
      fresh(); loadAll();
      st.addStat({});
      return { s: store.stat };
    });
    check("addStat：入参为空对象时数值不变、只刷新 lastPlayed（不产生幽灵局数）",
      !r3.threw && r3.s.totalRuns === 0 && r3.s.totalMeters === 0 && r3.s.totalSeconds === 0 && r3.s.lastPlayed !== "",
      r3.threw ? `抛异常：${r3.threw}` : `数值字段保持 0，lastPlayed 刷新为 ${r3.s.lastPlayed}`);
    const r4 = run(() => {
      fresh(); loadAll();
      st.addStat({ runs: -5, meters: -10, seconds: -1 });
      st.addStat({ runs: NaN, meters: "abc", seconds: null });
      return { s: store.stat };
    });
    check("addStat：负数、NaN、非数字增量被夹为 0（累计统计不回退）",
      !r4.threw && r4.s.totalRuns === 0 && r4.s.totalMeters === 0 && r4.s.totalSeconds === 0,
      r4.threw ? `抛异常：${r4.threw}` : `增量 -5/-10/-1 与 NaN/abc/null 之后仍为 ${j(r4.s)}`);
    const r5 = run(() => {
      fresh(); loadAll();
      st.addStat({ runs: 1.9, meters: 0.1, seconds: 0.2 });
      st.addStat({ runs: 1, meters: 0.2, seconds: 0.2 });
      return { s: store.stat };
    });
    check("addStat：小数增量按浮点累加不丢精度（0.1 加 0.2 与 1.9 加 1）",
      !r5.threw && near(r5.s.totalMeters, 0.3, 1e-9) && near(r5.s.totalSeconds, 0.4, 1e-9) && r5.s.totalRuns === 2.9,
      r5.threw ? `抛异常：${r5.threw}` : `totalRuns=${r5.s.totalRuns} totalMeters=${r5.s.totalMeters} totalSeconds=${r5.s.totalSeconds}`);
    const r6 = run(() => {
      fresh(); loadAll();
      st.addStat({ runs: 1, meters: 0.1, seconds: 0.2 });
      const raw = LS.getItem(SAVE_KEYS.stat);
      store.stat = { totalRuns: 0, totalMeters: 0, totalSeconds: 0, lastPlayed: "" };
      st.loadStat();
      return { raw, s: store.stat };
    });
    check("loadStat：落盘后重读逐字节一致（含小数累加结果）",
      !r6.threw && j(r6.s) === j(JSON.parse(r6.raw)),
      r6.threw ? `抛异常：${r6.threw}` : `落盘 ${r6.raw} → 重读 ${j(r6.s)}`);

    // 7.2 兼容旧字段名
    const rLegacy = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.stat, j({ games: 7, dist: 100.5, time: 20, lastPlayed: 123 }));
      st.loadStat();
      return { s: store.stat };
    });
    check("loadStat：旧字段名 games、dist、time 被映射到 totalRuns、totalMeters、totalSeconds",
      !rLegacy.threw && rLegacy.s.totalRuns === 7 && near(rLegacy.s.totalMeters, 100.5, 1e-9) && rLegacy.s.totalSeconds === 20,
      rLegacy.threw ? `抛异常：${rLegacy.threw}` : `games=7,dist=100.5,time=20 → ${j(rLegacy.s)}`);
    check("loadStat：lastPlayed 非字符串时回退空串（不把数字塞进时间字段）",
      !rLegacy.threw && rLegacy.s.lastPlayed === "",
      rLegacy.threw ? `抛异常：${rLegacy.threw}` : `lastPlayed=123 → ${j(rLegacy.s.lastPlayed)}`);
    const rLegacy2 = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.stat, j({ totalRuns: 3, games: 99 }));
      st.loadStat();
      return { r: store.stat.totalRuns };
    });
    check("loadStat：新字段名优先于旧字段名（同时存在时以 totalRuns 为准）",
      !rLegacy2.threw && rLegacy2.r === 3, rLegacy2.threw ? `抛异常：${rLegacy2.threw}` : `totalRuns=3 与 games=99 并存 → totalRuns=${rLegacy2.r}`);

    // 7.3 损坏与负值
    const rBad = run(() => {
      const rows = [];
      for (const raw of ["null", "[]", "{}", "@@非法@@", '"abc"', "5", "true"]) {
        fresh();
        LS.setItem(SAVE_KEYS.ver, "3");
        LS.setItem(SAVE_KEYS.stat, raw);
        st.loadStat();
        rows.push(`${raw} → ${j(store.stat)}`);
      }
      return { rows };
    });
    check("loadStat：7 种非法内容（非对象 / 数组 / 字符串 / 数字 / 布尔 / 非法 JSON / null）全部回退为全 0 空统计",
      !rBad.threw && rBad.rows.length === 7 && rBad.rows.every((s) => s.endsWith(ZERO_STAT)),
      rBad.threw ? `抛异常：${rBad.threw}` : rBad.rows.join(" · "));
    const rNeg = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.stat, j({ totalRuns: -5, totalMeters: -100.5, totalSeconds: -30, lastPlayed: "x" }));
      st.loadStat();
      return { s: store.stat };
    });
    check("loadStat：负值统计被夹到 0（脏档不能让累计面板显示负里程）",
      !rNeg.threw && rNeg.s.totalRuns === 0 && rNeg.s.totalMeters === 0 && rNeg.s.totalSeconds === 0,
      rNeg.threw ? `抛异常：${rNeg.threw}` : `totalRuns=-5,totalMeters=-100.5,totalSeconds=-30 → ${j(rNeg.s)}`);
    const rNaN = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.stat, j({ totalRuns: "abc", totalMeters: "xyz", totalSeconds: "12abc" }));
      st.loadStat();
      return { s: store.stat };
    });
    check("loadStat：非数字统计值回退 0（面板不出现 NaN）",
      !rNaN.threw && rNaN.s.totalRuns === 0 && rNaN.s.totalMeters === 0 && rNaN.s.totalSeconds === 0,
      rNaN.threw ? `抛异常：${rNaN.threw}` : `totalRuns=abc,totalMeters=xyz,totalSeconds=12abc → ${j(rNaN.s)}`);
    const rStr = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.stat, j({ totalRuns: "7", totalMeters: "12.5" }));
      st.loadStat();
      return { s: store.stat };
    });
    check("loadStat：数字字符串被正确解析（7 判为 7，12.5 判为 12.5）",
      !rStr.threw && rStr.s.totalRuns === 7 && near(rStr.s.totalMeters, 12.5, 1e-9),
      rStr.threw ? `抛异常：${rStr.threw}` : j(rStr.s));
    const rDel = run(() => {
      loadBaseline();
      LS.removeItem(SAVE_KEYS.stat);
      st.loadStat();
      return { s: store.stat, gold: store.gold, r: store.progress.rating };
    });
    check("删除 bike_stat 键：统计清零且不影响金币与段位等其它键",
      !rDel.threw && rDel.s.totalRuns === 0 && rDel.s.lastPlayed === "" && rDel.gold === 1234 && rDel.r === 1350,
      rDel.threw ? `抛异常：${rDel.threw}` : `stat=${j(rDel.s)} · 其它键未动（gold=${rDel.g} rating=${rDel.r}）`);

    // 7.4 与 saveProgress、saveAll 的联动
    const rLink = run(() => {
      fresh(); loadAll();
      store.stat.totalRuns = 42; store.stat.totalMeters = 4200; store.stat.totalSeconds = 3600;
      store.stat.lastPlayed = "2022-02-02T02:02:02.000Z";
      st.saveProgress();
      const a = LS.getItem(SAVE_KEYS.stat);
      st.saveAll();
      return { a, b: LS.getItem(SAVE_KEYS.stat) };
    });
    check("saveProgress：顺带把 bike_stat 落盘（进度与统计由同一入口写）",
      !rLink.threw && JSON.parse(rLink.a).totalRuns === 42 && JSON.parse(rLink.a).lastPlayed === "2022-02-02T02:02:02.000Z",
      rLink.threw ? `抛异常：${rLink.threw}` : String(rLink.a));
    check("saveAll：再次全量写盘不改变已落盘的统计值（幂等）",
      !rLink.threw && rLink.a === rLink.b, rLink.threw ? `抛异常：${rLink.threw}` : "saveProgress 与 saveAll 之后逐字节一致");
    const rSettle = run(() => {
      fresh(); loadAll();
      st.addStat({ runs: 4, meters: 400, seconds: 240 });
      st.settleProgress();
      return { raw: LS.getItem(SAVE_KEYS.stat) };
    });
    check("settleProgress：不覆盖已累加的统计值（结算不会清零累计数据）",
      !rSettle.threw && JSON.parse(rSettle.raw).totalRuns === 4,
      rSettle.threw ? `抛异常：${rSettle.threw}` : `bike_stat=${rSettle.raw}`);

    // 7.5 导入导出往返
    const rRt = run(() => {
      fresh(); loadAll();
      st.addStat({ runs: 12, meters: 12345.6, seconds: 987.6 });
      const before = j(store.stat);
      const d = st.exportSave().data;
      st.resetSave();
      const mid = j(store.stat);
      st.importSave(d);
      return { before, mid, after: j(store.stat) };
    });
    check("统计经导出、重置、导入完整往返（重置为 0，导入后逐字节还原）",
      !rRt.threw && rRt.mid === ZERO_STAT && rRt.after === rRt.before,
      rRt.threw ? `抛异常：${rRt.threw}` : `导出前 ${rRt.before} · 重置后 ${rRt.mid} · 导入后 ${rRt.after}`);

    // 7.6 逐字段隔离
    const rField = run(() => {
      loadBaseline();
      const rows = [];
      const probes = [
        ["totalRuns", j({ ...BASE_STAT, totalRuns: 777 })],
        ["totalMeters", j({ ...BASE_STAT, totalMeters: 888.5 })],
        ["totalSeconds", j({ ...BASE_STAT, totalSeconds: 999.5 })],
        ["lastPlayed", j({ ...BASE_STAT, lastPlayed: "2030-12-31T23:59:59.000Z" })],
      ];
      for (const [f, raw] of probes) {
        loadBaseline();
        LS.setItem(SAVE_KEYS.stat, raw);
        st.loadStat();
        rows.push([f, store.stat[f] === JSON.parse(raw)[f], j(store.stat)]);
      }
      return { rows };
    });
    check("bike_stat：4 个字段各自可被单独改写且互不干扰（逐字段独立生效）",
      !rField.threw && rField.rows.every(([, ok]) => ok),
      rField.threw ? `抛异常：${rField.threw}` : rField.rows.map(([f, ok, v]) => `${f}:${ok ? "生效" : "未生效"}(${v.slice(0, 36)})`).join(" · "));
    const rInt = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.stat, j({ totalRuns: "12.9", totalMeters: "12.9", totalSeconds: "12.9" }));
      st.loadStat();
      return { s: store.stat };
    });
    check("loadStat：局数用 parseInt 截断为整数，里程与时长用 Number 保留小数（两者语义不同）",
      !rInt.threw && rInt.s.totalRuns === 12 && near(rInt.s.totalMeters, 12.9, 1e-9) && near(rInt.s.totalSeconds, 12.9, 1e-9),
      rInt.threw ? `抛异常：${rInt.threw}` : `字符串 12.9 → totalRuns=${rInt.s.totalRuns}（parseInt 截断）· totalMeters=${rInt.s.totalMeters}（Number 保留）`);
    const rRound = run(() => {
      fresh(); loadAll();
      for (let i = 0; i < 25; i++) st.addStat({ runs: 1, meters: 1, seconds: 1 });
      return { s: store.stat, raw: LS.getItem(SAVE_KEYS.stat) };
    });
    check("addStat：连打 25 局后累计精确等于 25 / 25 米 / 25 秒（无浮点漂移）",
      !rRound.threw && rRound.s.totalRuns === 25 && rRound.s.totalMeters === 25 && rRound.s.totalSeconds === 25,
      rRound.threw ? `抛异常：${rRound.threw}` : `totalRuns=${rRound.s.totalRuns} totalMeters=${rRound.s.totalMeters} totalSeconds=${rRound.s.totalSeconds}`);
    const rIso2 = run(() => {
      loadBaseline();
      LS.removeItem(SAVE_KEYS.stat);
      loadAll();
      return { g: store.gold, b: store.best, r: store.progress.rating, u: store.unlocked };
    });
    check("删除 bike_stat 后走完整读档链路，其它 4 类字段全部不受影响",
      !rIso2.threw && rIso2.g === 1234 && rIso2.b === 4321 && rIso2.r === 1350 && rIso2.u === 17,
      rIso2.threw ? `抛异常：${rIso2.threw}` : `gold=${rIso2.g} best=${rIso2.b} rating=${rIso2.r} unlocked=${rIso2.u}`);
    const rExp2 = run(() => {
      loadBaseline();
      const d = st.exportSave();
      const keys = Object.keys(d.data);
      st.resetSave();
      st.importSave(d.data);
      return { keys, stat: LS.getItem(SAVE_KEYS.stat), loaded: j(store.stat) };
    });
    check("bike_stat 在导出 data 中以原始 JSON 字符串形式出现（导入后逐字节还原）",
      !rExp2.threw && rExp2.keys.includes(SAVE_KEYS.stat) && rExp2.stat === BASE_RAW[SAVE_KEYS.stat] && rExp2.loaded === BASE_RAW[SAVE_KEYS.stat],
      rExp2.threw ? `抛异常：${rExp2.threw}` : `导出前 ${rExp2.stat} → 导入后 ${rExp2.stat}`);
  }

  // ============================================================
  //  8. 交叉场景：脏档共存 / 嵌套类型 / 跨层一致性
  // ============================================================
  section("交叉场景（脏档共存 / 嵌套类型缺陷 / 跨层一致性）");
  {
    // 8.1 嵌套脏值：升级表内的每车数值类型不符
    const nested = [
      ["数字", { trail: 5 }],
      ["字符串", { trail: "x" }],
      ["数组", { trail: [1, 2] }],
      ["升级项为字符串", { trail: { engine: "a", tire: null, frame: 1, susp: 2 } }],
      ["字段缺失", { trail: { engine: 3 } }],
    ];
    for (const [label, up] of nested) {
      const r = run(() => {
        fresh();
        LS.setItem(SAVE_KEYS.ver, "3");
        LS.setItem(SAVE_KEYS.up, j(up));
        loadAll();
        const upVal = st.getUp();
        store.state = "menu";
        gameM.startGame("level", 0);
        let moved = NaN;
        if (store.state === "play") {
          const x0 = bike.rear.x;
          key.right = true; key.left = false;
          for (let i = 0; i < 240; i++) gameM.update(DT);
          moved = Math.round(bike.rear.x - x0);
        }
        return { upType: Array.isArray(upVal) ? "array" : typeof upVal, finite: physFinite(), MAXV: String(store.phys.MAXV), torque: String(store.phys.torquePeak), state: store.state, moved };
      });
      check(`嵌套脏值：bike_up 的每车升级为「${label}」时物理派生量仍全部有限`,
        !r.threw && r.finite === true,
        r.threw ? `抛异常：${r.threw}` : `getUp() 返回 ${r.upType}（未回退为 4 项 0 级）→ deriveHandling 读到 undefined → MAXV=${r.MAXV} torquePeak=${r.torque}（对照组 520 与 18000）· 4 秒全油门仅前进 ${r.moved}px（对照组约 1600px）`);
    }
    const rCtl = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.up, j({ trail: { engine: 0, tire: 0, frame: 0, susp: 0 } }));
      loadAll();
      store.state = "menu";
      gameM.startGame("level", 0);
      const x0 = bike.rear.x;
      key.right = true; key.left = false;
      for (let i = 0; i < 240; i++) gameM.update(DT);
      return { finite: physFinite(), MAXV: store.phys.MAXV, moved: Math.round(bike.rear.x - x0) };
    });
    check("对照：合法 0 级升级时 MAXV 等于 520、派生量有限且 4 秒能跑约 1600px（证明上组断言有区分度）",
      !rCtl.threw && rCtl.finite && rCtl.MAXV === 520 && rCtl.moved > 1200,
      rCtl.threw ? `抛异常：${rCtl.threw}` : `MAXV=${rCtl.MAXV} · 4 秒前进 ${rCtl.moved}px`);

    // 8.2 负数与超上限升级
    // ★ 判据必须是 **store 内存态**，不是落盘原文：loadSave 只把清洗后的值写进 store，
    //   并不回写 bike_up（回写要等一次显式 save）。所以拿 LS.getItem("bike_up") 当判据
    //   必然读到未经清洗的脏值而误判。真正的不变量是"脏档读进来后，派生物理量与
    //   同等级的**合法档**逐项相同"——直接与合法 0 级 / 合法 MAX_LV 档对比，
    //   比硬编码阈值更强，也不依赖任何魔法数字。
    const physOf = (up) => run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.up, j(up));
      loadAll();
      const mem = JSON.parse(JSON.stringify(st.getUp()));
      store.state = "menu";
      gameM.startGame("level", 0);
      return {
        mem, MAXV: store.phys.MAXV, torque: store.phys.torquePeak,
        travel: store.phys.susp.travel, mu: store.phys.mu, finite: physFinite(),
      };
    });
    /** 两个工况的派生物理量逐项相同（内存升级表单独比，因为脏档与合法档本来就该不同） */
    const samePhys = (a, b) => !a.threw && !b.threw && a.finite === true &&
      a.MAXV === b.MAXV && a.torque === b.torque && a.travel === b.travel && a.mu === b.mu;
    const refZero = physOf({ trail: { engine: 0, tire: 0, frame: 0, susp: 0 } });
    const refMax = physOf({ trail: { engine: MAX_LV, tire: MAX_LV, frame: MAX_LV, susp: MAX_LV } });
    const FIELDS = ["engine", "tire", "frame", "susp"];

    const rNeg = physOf({ trail: { engine: -50, tire: -50, frame: -50, susp: -50 } });
    check("负数升级被夹到 0 级（不出现负极速，且派生量与合法 0 级档逐项相同）",
      !rNeg.threw && rNeg.MAXV > 0 &&
      FIELDS.every((f) => rNeg.mem[f] === 0) && samePhys(rNeg, refZero),
      rNeg.threw ? `抛异常：${rNeg.threw}` : `内存升级=${j(rNeg.mem)} → MAXV=${rNeg.MAXV}（负值即车会倒着跑）· 悬挂行程=${rNeg.travel}；与合法 0 级档${samePhys(rNeg, refZero) ? "完全一致" : "不一致"}`);
    const rOver = physOf({ trail: { engine: 999, tire: 999, frame: 999, susp: 999 } });
    check(`超上限升级被夹到 MAX_LV 等于 ${MAX_LV}（脏档不能造出满级超能力车）`,
      !rOver.threw && FIELDS.every((f) => rOver.mem[f] === MAX_LV) && samePhys(rOver, refMax),
      rOver.threw ? `抛异常：${rOver.threw}` : `内存升级=${j(rOver.mem)} → MAXV=${rOver.MAXV} · 悬挂行程=${rOver.travel}；与合法满级档${samePhys(rOver, refMax) ? "完全一致" : "不一致"}`);

    // 8.3 负金币
    const rNG = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.gold, "-500");
      loadAll();
      return { gold: store.gold };
    });
    check("负金币被夹到 0（脏档不能让商店余额为负）",
      !rNG.threw && rNG.gold === 0, rNG.threw ? `抛异常：${rNG.threw}` : `bike_gold="-500" → store.gold=${rNG.gold}：loadSave 用的是 intOr(值) 或 0，没有 Math.max(0, ...)`);

    // 8.4 星级脏值
    const rSt = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.stars, j(["a", 1, -1, 1.5, 99].concat(new Array(LV - 5).fill(0))));
      loadAll();
      return { head: store.stars.slice(0, 5), allCleared: st.deriveUnlocks(store.progress, store.stars).allCleared, sum: sum(store.stars) };
    });
    check("星级数组被规整为 0 到 3 的整数（脏星级不能让 99 星进入星级统计）",
      !rSt.threw && Array.isArray(rSt.head) && rSt.head.every((s) => isInt(s) && s >= 0 && s <= 3),
      rSt.threw ? `抛异常：${rSt.threw}` : `注入 a,1,-1,1.5,99 → 读回 ${j(rSt.head)}（和 ${rSt.sum}）：loadSave 只对数组整体做 Array.isArray 判断，不校验元素`);

    // 8.5 多键共存脏值
    const rMix = run(() => {
      fresh();
      LS.setItem(SAVE_KEYS.ver, "3");
      LS.setItem(SAVE_KEYS.gold, "@@");
      LS.setItem(SAVE_KEYS.stars, "[]");
      LS.setItem(SAVE_KEYS.owned, "[99]");
      LS.setItem(SAVE_KEYS.veh, "99");
      LS.setItem(SAVE_KEYS.prog, "@@");
      LS.setItem(SAVE_KEYS.rating, "abc");
      LS.setItem(SAVE_KEYS.stat, "@@");
      LS.setItem(SAVE_KEYS.ach, "{}");
      LS.setItem(SAVE_KEYS.ultra, "[]");
      loadAll();
      store.state = "menu";
      gameM.startGame("level", 0);
      return { state: store.state, finite: physFinite(), gold: store.gold, owned: store.ownedVehicles, veh: store.currentVehicle, rating: store.progress.rating };
    });
    check("8 键同时脏值：仍能完整读档并开局（金币 0、车辆回退 0 号、段位 0、派生量有限）",
      !rMix.threw && rMix.state === "play" && rMix.finite && rMix.gold === 0 &&
      j(rMix.owned) === "[0]" && rMix.veh === 0 && rMix.rating === 0,
      rMix.threw ? `抛异常：${rMix.threw}` : `state=${rMix.state} gold=${rMix.gold} owned=${j(rMix.owned)} veh=${rMix.veh} rating=${rMix.rating} MAXV=${store.phys.MAXV}`);

    // 8.6 跨层一致性
    const rX = run(() => {
      fresh(); loadAll();
      store.gold = 654; store.best = 321; store.unlocked = 9; store.selLevel = 11;
      store.progress.rating = 2000;
      st.addStat({ runs: 3, meters: 300, seconds: 30 });
      st.save();
      const rawGold = LS.getItem(SAVE_KEYS.gold);
      store.gold = 0; store.best = 0; store.unlocked = 0; store.selLevel = 0;
      store.progress.rating = 0;
      loadAll();
      return { rawGold, gold: store.gold, best: store.best, unlocked: store.unlocked, sel: store.selLevel, rating: store.progress.rating, runs: store.stat.totalRuns, rank: rankName(store.progress.rating) };
    });
    check("跨层一致：save() 落盘后重读，金币、最佳、解锁、选关、段位、统计全部还原",
      !rX.threw && rX.rawGold === "654" && rX.gold === 654 && rX.best === 321 && rX.unlocked === 9 &&
      rX.sel === 11 && rX.rating === 2000 && rX.runs === 3 && rX.rank === "星耀",
      rX.threw ? `抛异常：${rX.threw}` : `gold=${rX.gold} best=${rX.best} unlocked=${rX.unlocked} sel=${rX.sel} rating=${rX.rating}（${rX.rank}）totalRuns=${rX.runs}`);
    const rX2 = run(() => {
      fresh(); loadAll();
      store.progress.invited = true;
      store.progress.rating = 2600; store.progress.peak = false;
      store.stars = new Array(LV).fill(3);
      st.settleProgress();
      gameM.startGame("ranked", 0, { advanced: true });
      return { adv: store.rankedAdvanced, mode: store.mode, state: store.state, peak: store.progress.peak };
    });
    check("跨层一致：段位 2600 时高级排位可开局（准入与开局档位一致）",
      !rX2.threw && rX2.adv === true && rX2.mode === "ranked" && rX2.state === "play" && rX2.peak === true,
      rX2.threw ? `抛异常：${rX2.threw}` : `rating=2600 → rankedAdvanced=${rX2.adv} mode=${rX2.mode} state=${rX2.state} peak=${rX2.peak}`);
    const rX3 = run(() => {
      fresh(); loadAll();
      store.progress.invited = true;
      store.progress.rating = RATING_ADVANCED - 1;
      gameM.startGame("ranked", 0, { advanced: true });
      return { adv: store.rankedAdvanced, mode: store.mode };
    });
    check("跨层一致：段位未达 1200 时请求高级赛被降级为普通赛（不静默放行）",
      !rX3.threw && rX3.adv === false && rX3.mode === "ranked",
      rX3.threw ? `抛异常：${rX3.threw}` : `rating=${RATING_ADVANCED - 1} 请求高级 → rankedAdvanced=${rX3.adv}（已降级）mode=${rX3.mode}`);

    // 8.7 版本迁移
    const mig = run(() => {
      const rows = [];
      const cases = [
        ["ver=1（最老）", "1", 1234, 12340],
        ["ver=2（20 关结构）", "2", 500, 500],
        ["ver=3（当前）", "3", 500, 500],
        ["ver=99（未来）", "99", 500, 500],
        ["ver 缺失", null, 1234, 12340],
        ["ver 非法", "@@", 1234, 12340],
      ];
      for (const [label, v, put, exp] of cases) {
        fresh();
        // fresh() 里的 resetSave() 会写回 bike_v=3，"ver 缺失" 必须显式移除
        if (v === null) LS.removeItem(SAVE_KEYS.ver);
        else LS.setItem(SAVE_KEYS.ver, v);
        LS.setItem(SAVE_KEYS.gold, String(put));
        LS.setItem(SAVE_KEYS.stars, j(BASE_STARS));
        st.loadSave();
        rows.push([label, store.gold, exp, LS.getItem(SAVE_KEYS.ver)]);
      }
      return { rows };
    });
    for (const [label, got, exp, verNow] of (mig.threw ? [] : mig.rows)) {
      check(`版本迁移：${label} → 金币 ${exp}（不重复放大、ver 归一到 3）`,
        got === exp, `实际 ${got}（期望 ${exp}）· 迁移后 bike_v="${verNow}"`);
    }
    const mig2 = run(() => {
      const rows = [];
      // isLegacy20 要求长度在 1 到 20 之间且小于 72。全 3 星时 highestStarred = len-1，unlocked 提升到 len。
      for (const [label, len, expUnlocked] of [["6 关（1 到 20 代）", 6, 6], ["20 关（1 到 20 代）", 20, 20], ["21 关（超出 1 到 20 代）", 21, 0], ["72 关（当前）", 72, 0]]) {
        fresh();
        LS.setItem(SAVE_KEYS.gold, "500");
        LS.setItem(SAVE_KEYS.ver, "2");
        LS.setItem(SAVE_KEYS.unlocked, "0");
        LS.setItem(SAVE_KEYS.stars, j(new Array(len).fill(3)));
        st.loadSave();
        rows.push([label, store.stars.length, store.unlocked, expUnlocked]);
      }
      return { rows };
    });
    for (const [label, len, unlocked, exp] of (mig2.threw ? [] : mig2.rows)) {
      check(`星级迁移：ver=2 且星级数组为 ${label} → 补齐到 ${LV} 项、unlocked 等于 ${exp}`,
        len === LV && unlocked === exp, `补齐后 ${len} 项 · unlocked=${unlocked}（期望 ${exp}）`);
    }
    const mig3 = run(() => {
      // 1 到 20 代存档里玩家只打到第 3 关：unlocked 应止步于 3，不得按数组长度 6 跳关
      fresh();
      LS.setItem(SAVE_KEYS.gold, "500");
      LS.setItem(SAVE_KEYS.ver, "2");
      LS.setItem(SAVE_KEYS.unlocked, "0");
      LS.setItem(SAVE_KEYS.stars, j([3, 3, 3, 0, 0, 0]));
      st.loadSave();
      return { unlocked: store.unlocked, len: store.stars.length, head: store.stars.slice(0, 6) };
    });
    check("星级迁移：1 到 20 代存档按最后一个有星的下标解锁（3,3,3,0,0,0 → unlocked=3，不按数组长度 6 跳关）",
      !mig3.threw && mig3.unlocked === 3 && mig3.len === LV && mig3.head[2] === 3 && mig3.head[3] === 0,
      mig3.threw ? `抛异常：${mig3.threw}` : `unlocked=${mig3.unlocked} · 星级补齐到 ${mig3.len} 项 · 前 6 项 ${j(mig3.head)}`);

    // 8.8 试用包旁路键
    const rTrial = run(() => {
      fresh();
      st.resetSave();
      LS.setItem("bike_trial", "1");
      loadAll();
      const on = { gold: store.gold, owned: store.ownedVehicles, ultra: store.ultra, up: store.upgrades };
      LS.removeItem("bike_trial");
      loadAll();
      return { on, off: { gold: store.gold, owned: store.ownedVehicles } };
    });
    check("bike_trial 等于 1：装载时备好 200 万金币、三辆车、满级升级、两个终极模式",
      !rTrial.threw && rTrial.on.gold >= 2000000 && rTrial.on.owned.length === NV &&
      rTrial.on.ultra.sport === true && rTrial.on.ultra.mud === true &&
      rTrial.on.up.sport.engine === MAX_LV,
      rTrial.threw ? `抛异常：${rTrial.threw}` : `gold=${rTrial.on.gold} owned=${j(rTrial.on.owned)} ultra=${j(rTrial.on.ultra)} sport.engine=${rTrial.on.up.sport && rTrial.on.up.sport.engine}`);
    check("删除 bike_trial：立刻回归正常规则（0 金币、仅 0 号车）",
      !rTrial.threw && rTrial.off.gold === 0 && j(rTrial.off.owned) === "[0]",
      rTrial.threw ? `抛异常：${rTrial.threw}` : `gold=${rTrial.off.gold} owned=${j(rTrial.off.owned)}`);

    // 8.9 getUp 的惰性初始化
    const rGetUp = run(() => {
      fresh(); loadAll();
      store.upgrades = {};
      const u1 = st.getUp();
      const written = j(store.upgrades);
      const u2 = st.getUp();
      return { u1, written, same: u1 === u2, veh: VEHICLES[store.currentVehicle].id };
    });
    check("getUp：升级表缺失时惰性初始化当前车辆的 4 项 0 级并写回 store",
      !rGetUp.threw && rGetUp.u1.engine === 0 && rGetUp.u1.tire === 0 && rGetUp.u1.frame === 0 && rGetUp.u1.susp === 0 &&
      rGetUp.veh === "trail" && rGetUp.written === j({ trail: { engine: 0, tire: 0, frame: 0, susp: 0 } }) && rGetUp.same === true,
      rGetUp.threw ? `抛异常：${rGetUp.threw}` : `当前车 ${rGetUp.veh} → 写入 ${rGetUp.written} · 二次调用返回同一引用=${rGetUp.same}`);
    const rGetUp2 = run(() => {
      const rows = [];
      for (let v = 0; v < NV; v++) {
        fresh(); loadAll();
        store.currentVehicle = v;
        store.upgrades = {};
        st.getUp();
        rows.push(VEHICLES[v].id);
      }
      return { rows };
    });
    check("getUp：3 辆车各自惰性初始化到自己名下（不串档）",
      !rGetUp2.threw && j(rGetUp2.rows) === j(VEHICLES.map((v) => v.id)),
      rGetUp2.threw ? `抛异常：${rGetUp2.threw}` : `依次初始化 ${rGetUp2.rows.join(" / ")}`);

    // 8.10 用例间零污染
    const rIso = run(() => {
      loadBaseline();
      const a = j(snapRaw());
      fresh(); loadBaseline();
      const b = j(snapRaw());
      fresh(); loadBaseline();
      const c = j(snapRaw());
      return { same: a === b && b === c, n: Object.keys(JSON.parse(c)).length };
    });
    check("用例隔离：反复清场后基线快照逐字节一致（用例之间无互相污染）",
      !rIso.threw && rIso.same && rIso.n === ALL_KEY_FIELDS.length,
      rIso.threw ? `抛异常：${rIso.threw}` : `3 次清场快照全等 · 每次 ${rIso.n} 键`);
    const rIso2 = run(() => { loadBaseline(); return { g: store.gold, r: store.progress.rating }; });
    check("用例隔离：紧接上一个破坏性用例之后读档仍是干净基线（金币 1234、段位 1350）",
      !rIso2.threw && rIso2.g === 1234 && rIso2.r === 1350,
      rIso2.threw ? `抛异常：${rIso2.threw}` : `gold=${rIso2.g} rating=${rIso2.r}`);
    const rFinal = run(() => { loadBaseline(); return { g: store.gold }; });
    check("收尾：本体检自身不污染环境（最后清场后基线金币为 1234）",
      !rFinal.threw && rFinal.g === 1234, rFinal.threw ? `抛异常：${rFinal.threw}` : `gold=${rFinal.g}`);
  }

  // ============================================================
  //  9. 多存档槽（存档1 / 存档2 …）
  // ============================================================
  section(`多存档槽（上限 ${st.MAX_SLOTS} 个 / 新建 · 切换 · 删除 · 互相隔离）`);

  /**
   * 槽位用例的统一清场：抹掉**所有**槽的键与槽位元数据，并把 store 复位回槽 0。
   *
   * ★ 为什么不复用 run()/fresh()：fresh() 只调 resetSave()，而 resetSave() 是
   *   **按当前槽**写键的。停在槽 1 时它会把"基线"写进槽 1，而后面的基线用例
   *   （putAll 写裸 bike_* 键）读的是槽 0 —— 于是基线静默丢失、失败项指向错误的用例。
   */
  const slotFresh = () => {
    LS.clear();
    store.slot = 0;
    st.resetSave();
    store.state = "menu";
    store.lvIdx = 0;
  };
  const slotRun = (fn) => {
    slotFresh();
    try { return fn(); }
    catch (e) { return { threw: e && e.message ? e.message : String(e) }; }
    finally { slotFresh(); }
  };
  /** 某槽真实占用的存档键数（按该槽的前缀规则统计，槽 0 无前缀） */
  const slotKeyCount = (n) => {
    const pre = n === 0 ? "bike_" : `dale_s${n}_bike_`;
    let c = 0;
    for (let i = 0; i < LS.length; i++) {
      const k = LS.key(i);
      if (k && k.indexOf(pre) === 0) c++;
    }
    return c;
  };
  /** 某槽某键的原文（不依赖当前槽，直接按前缀取） */
  const slotRawOf = (n, k) => LS.getItem(n === 0 ? k : `dale_s${n}_${k}`);

  // 9.1 老存档兼容：裸 bike_* 键原地变成「存档1」
  const rS1 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    const s0 = st.listSlots()[0];
    return { used: s0.used, name: s0.name, active: s0.active, gold: store.gold, max: st.MAX_SLOTS };
  });
  check("存档槽：老存档（裸 bike_* 键）原地成为「存档1」，无需任何迁移",
    !rS1.threw && rS1.used && rS1.name === "存档1" && rS1.active && rS1.gold === 1234 && rS1.max === 6,
    rS1.threw ? `抛异常：${rS1.threw}` : `存档1 used=${rS1.used} name=${rS1.name} gold=${rS1.gold} · 上限 ${rS1.max} 个`);

  // 9.2 新建存档：占用下一个空槽并切入
  const rS2 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    const n = st.createSlot();
    const slots = st.listSlots();
    return {
      n, cur: st.currentSlot(), slot: store.slot,
      s1name: slots[1] && slots[1].name, s1used: slots[1] && slots[1].used, s1active: slots[1] && slots[1].active,
      s0active: slots[0].active, g1: store.gold, u1: store.unlocked,
    };
  });
  check("存档槽：新建存档占用下一个空槽（存档2）并切入，且是全新初始状态",
    !rS2.threw && rS2.n === 1 && rS2.cur === 1 && rS2.slot === 1 &&
    rS2.s1name === "存档2" && rS2.s1used && rS2.s1active && !rS2.s0active && rS2.g1 === 0 && rS2.u1 === 0,
    rS2.threw ? `抛异常：${rS2.threw}` : `createSlot → 存档${rS2.n + 1}（当前=${rS2.s1active}）· 新档 gold=${rS2.g1} unlocked=${rS2.u1} · 存档1 不再是当前=${!rS2.s0active}`);

  // 9.3 各槽数据互相隔离
  const rS3 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    st.createSlot();
    store.gold = 999; store.unlocked = 5; st.save();
    st.switchSlot(0);
    const g0 = store.gold, u0 = store.unlocked, r0 = store.progress.rating;
    st.switchSlot(1);
    return { g0, u0, r0, g1: store.gold, u1: store.unlocked, r1: store.progress.rating };
  });
  check("存档槽：两个存档位的金币 / 解锁 / 段位互相独立，来回切换不串档",
    !rS3.threw && rS3.g0 === 1234 && rS3.u0 === 17 && rS3.r0 === 1350 &&
    rS3.g1 === 999 && rS3.u1 === 5 && rS3.r1 === 0,
    rS3.threw ? `抛异常：${rS3.threw}` : `存档1 gold=${rS3.g0} unlocked=${rS3.u0} rating=${rS3.r0} ｜ 存档2 gold=${rS3.g1} unlocked=${rS3.u1} rating=${rS3.r1}`);

  // 9.4 切换前先落盘当前槽（否则存档1 的进度会被新槽覆盖）
  const rS4 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    store.gold = 4321; st.save();       // 存档1 改金币后不切走，直接新建
    st.createSlot();
    st.switchSlot(0);
    return { g0: store.gold, raw: slotRawOf(0, SAVE_KEYS.gold) };
  });
  check("存档槽：新建 / 切换前先把当前存档位落盘，存档1 的进度不被覆盖",
    !rS4.threw && rS4.g0 === 4321 && rS4.raw === "4321",
    rS4.threw ? `抛异常：${rS4.threw}` : `存档1 gold=${rS4.g0} · 盘上 bike_gold=${rS4.raw}`);

  // 9.5 删除「存档1」（回归：槽 0 是裸键，修复前只删 dale_s0_* → 删不掉）
  const rS5 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    st.createSlot();
    st.switchSlot(1);                    // 站在存档2 上删存档1
    const ok = st.deleteSlot(0);
    return { ok, left: slotKeyCount(0), used: st.listSlots()[0].used, keep: slotKeyCount(1) };
  });
  check("存档槽：删除「存档1」真正清空其数据（裸 bike_* 键一并扫掉），且不影响存档2",
    !rS5.threw && rS5.ok && rS5.left === 0 && rS5.used === false && rS5.keep > 0,
    rS5.threw ? `抛异常：${rS5.threw}` : `deleteSlot(0)=${rS5.ok} · 存档1 残留键=${rS5.left}（used=${rS5.used}）· 存档2 仍有 ${rS5.keep} 键`);

  // 9.6 删除的边界：当前槽不可删、越界不可删
  const rS6 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    st.createSlot();
    return {
      self: st.deleteSlot(st.currentSlot()),
      neg: st.deleteSlot(-1),
      big: st.deleteSlot(st.MAX_SLOTS),
      n0: slotKeyCount(0), n1: slotKeyCount(1),
    };
  });
  check("存档槽：当前存档位与越界下标都删不掉（不会误删正在玩的存档）",
    !rS6.threw && rS6.self === false && rS6.neg === false && rS6.big === false && rS6.n0 > 0 && rS6.n1 > 0,
    rS6.threw ? `抛异常：${rS6.threw}` : `删当前=${rS6.self} 删-1=${rS6.neg} 删${st.MAX_SLOTS}=${rS6.big} · 两档数据均健在（${rS6.n0} / ${rS6.n1} 键）`);

  // 9.7 槽位上限
  const rS7 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    const made = [];
    for (let i = 0; i < 8; i++) made.push(st.createSlot());
    return { made, used: st.listSlots().filter((s) => s.used).length, max: st.MAX_SLOTS };
  });
  check("存档槽：最多 6 个存档位，用满后 createSlot 返回 -1（不越界写盘）",
    !rS7.threw && j(rS7.made) === j([1, 2, 3, 4, 5, -1, -1, -1]) && rS7.used === 6,
    rS7.threw ? `抛异常：${rS7.threw}` : `连续新建返回 [${rS7.made.join(", ")}] · 已用 ${rS7.used}/${rS7.max}`);

  // 9.8 刷新后回到上次在玩的存档
  const rS8 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    st.createSlot();
    st.switchSlot(0);
    st.switchSlot(1);                    // 最后停在存档2
    loadAll();                           // 模拟刷新：整条读档链路重跑
    return { cur: st.currentSlot(), slot: store.slot, persisted: LS.getItem("dale_slot") };
  });
  check("存档槽：刷新页面后自动回到上次在玩的存档（不每次弹回存档1）",
    !rS8.threw && rS8.cur === 1 && rS8.slot === 1 && rS8.persisted === "1",
    rS8.threw ? `抛异常：${rS8.threw}` : `重读后 currentSlot=${rS8.cur}（dale_slot=${rS8.persisted}）`);

  // 9.9 导出只打包当前存档位，且不含槽位元数据
  const rS9 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    st.createSlot();
    store.gold = 555; st.save();         // 停在存档2 上导出
    const dump = st.exportSave();
    const keys = Object.keys(dump.data);
    return {
      keys, n: keys.length,
      leak: keys.filter((k) => k.indexOf("dale_") === 0),
      gold: dump.data[SAVE_KEYS.gold],
    };
  });
  check("存档槽：导出只打包当前存档位的键，不含其它存档位与槽位元数据",
    !rS9.threw && rS9.n === ALL_KEY_FIELDS.length && rS9.leak.length === 0 && rS9.gold === "555",
    rS9.threw ? `抛异常：${rS9.threw}` : `导出 ${rS9.n} 键（全为 bike_*）· 泄漏的槽位元数据 ${rS9.leak.length} 个 · gold=${rS9.gold}`);

  // 9.10 重置只清当前存档位
  const rS10 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    st.createSlot();
    store.gold = 555; st.save();
    st.resetSave();                      // 重置存档2
    const g1 = store.gold;
    st.switchSlot(0);
    return { g1, g0: store.gold, u0: store.unlocked };
  });
  check("存档槽：重置存档只清空当前存档位，另一个存档位的进度保留",
    !rS10.threw && rS10.g1 === 0 && rS10.g0 === 1234 && rS10.u0 === 17,
    rS10.threw ? `抛异常：${rS10.threw}` : `重置后存档2 gold=${rS10.g1} ｜ 存档1 gold=${rS10.g0} unlocked=${rS10.u0}（未受影响）`);

  // 9.11 槽位卡片的通关数
  const rS11 = slotRun(() => {
    putAll(BASE_RAW); loadAll();         // 星级全 3 星、唯独倒数第 2 关为 0 → 通关 LV-1
    st.save();
    return { cleared: st.listSlots()[0].cleared, lv: LV };
  });
  check("存档槽：槽位卡片显示的通关数与实际星级一致",
    !rS11.threw && rS11.cleared === rS11.lv - 1,
    rS11.threw ? `抛异常：${rS11.threw}` : `卡片显示已通关 ${rS11.cleared}/${rS11.lv}`);

  // 9.12 槽位元数据不参与存档数据的采集（否则会被导出 / 重置误伤）
  const rS12 = slotRun(() => {
    putAll(BASE_RAW); loadAll();
    st.createSlot();
    st.switchSlot(0);
    st.resetSave();                      // 重置会扫当前槽的全部 bike_ 键
    return { meta: LS.getItem("dale_slot"), slots: LS.getItem("dale_slots") !== null };
  });
  check("存档槽：重置存档不会误删槽位元数据（dale_slot / dale_slots 不以 bike_ 开头）",
    !rS12.threw && rS12.meta === "0" && rS12.slots === true,
    rS12.threw ? `抛异常：${rS12.threw}` : `重置后 dale_slot=${rS12.meta} · dale_slots 健在=${rS12.slots}`);

  // 9.13 收尾：槽位用例自身不污染环境
  const rS13 = slotRun(() => { loadBaseline(); return { g: store.gold, cur: st.currentSlot() }; });
  check("收尾：多存档位用例不污染后续环境（清场后回到槽 0 的干净基线）",
    !rS13.threw && rS13.g === 1234 && rS13.cur === 0,
    rS13.threw ? `抛异常：${rS13.threw}` : `gold=${rS13.g} currentSlot=${rS13.cur}`);
}
