// ============================================================
//  UI 回归体检：主页面关卡地图 / 关卡格状态 / 打赏入口 / 组件库
//  聚焦**本轮改动过、且此前无覆盖**的面：
//    · currentBranch() —— 返回首页回到当前关卡（修过"前沿被钉死在第一条支线"的 bug）
//    · 关卡格四态 .cur / .next / .done / .locked
//    · hero 打赏按钮 #btnCoffee 与设置面板 #btnDonate 双入口
//  组件库/面板的通用覆盖已在 audit.mjs 的「组件库 / 面板交互」两节里，此处不重复。
// ============================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";

export default async function (ctx) {
  const { check, section, imp } = ctx;
  const { store } = await imp("core/store.js");
  const panels = await imp("ui/panels.js");
  const menu = await imp("ui/menu.js");
  const donate = await imp("ui/donate.js");
  const comp = await imp("ui/components.js");
  const { LEVELS_PER_BRANCH, LEVELS } = await imp("config/levels.js");
  const { BRANCHES } = await imp("config/levels.js");

  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
  const css = readFileSync(join(process.cwd(), "styles", "main.css"), "utf8");
  const tokens = readFileSync(join(process.cwd(), "styles", "tokens.css"), "utf8");

  const homeHtml = () => (document.getElementById("homeView").innerHTML || "");
  panels.initPanels({ startGame: () => {}, applyVehicle: () => {} });
  donate.initDonate();

  /** 设置一个"已通关 starred 集合 + 当前关 sel"，返回该关所在支线 */
  function scenario(starredIdx, sel) {
    store.stars = new Array(LEVELS_PER_BRANCH * BRANCHES.length).fill(0);
    for (const i of starredIdx) store.stars[i] = 3;
    store.unlocked = starredIdx.length ? Math.max(...starredIdx) + 1 : 0;
    store.selLevel = sel;
    menu.showMenu(); // 走真实"返回首页"路径：showMenu → uiHooks.onHome → renderHomeView
  }
  const branchOfSel = () => Math.floor(store.selLevel / LEVELS_PER_BRANCH);
  const expandedName = () => {
    const m = homeHtml().match(/<div class="brHead">([^<]+)/);
    return m ? m[1] : "";
  };
  const frontierBrs = () => {
    // 支线卡的 class 由 card() 统一拼装，实际是 "card branchCard frontier interactive selected"，
    // 所以不能用 /class="branchCard frontier"/ —— 那种正则要求 class 属性**以**它开头。
    // 改成"先取出所有支线卡元素，再看哪一张带 frontier 标记"，与真实 DOM 结构解耦。
    const cards = [...homeHtml().matchAll(/<div class="[^"]*branchCard[^"]*"[^>]*data-bi="(\d+)"/g)];
    const hit = cards.find((m) => /\bfrontier\b/.test(m[0]));
    return hit ? +hit[1] : -1;
  };

  // ---------------- 1. 返回首页落到当前关卡 ----------------
  section("返回首页 → 展开当前关卡所在支线");
  {
    const CASES = [
      ["全新存档", [], 0],
      ["首支线第 4 关", [0, 1, 2], 3],
      ["首支线全通，当前关仍在首支线末关", [0, 1, 2, 3, 4], 5],
      ["首支线全通 + 第二支线第 3 关", [0, 1, 2, 3, 4, 5, 6, 7], 8],
      ["前三支线全通 + 第四支线第 2 关", [...Array(19).keys()], 19],
      ["全部 72 关通关，当前关 = 末关", [...Array(72).keys()], 71],
    ];
    for (const [name, starred, sel] of CASES) {
      scenario(starred, sel);
      const want = BRANCHES[branchOfSel()].name;
      const got = expandedName();
      check(`支线展开正确 · ${name}`, got.startsWith(want), `期望「${want}」实际「${got}」`);
      // 当前关必须恰好被标一格
      const cur = (homeHtml().match(/class="lvCell cur"/g) || []).length;
      check(`当前关唯一标记 · ${name}`, cur === 1, `lvCell cur 出现 ${cur} 次`);
      // 且标记的下标必须就是 store.selLevel
      const m = homeHtml().match(/class="lvCell cur" data-act="play" data-gi="(\d+)"/);
      check(`当前关下标一致 · ${name}`, m && +m[1] === sel, `标记 gi=${m ? m[1] : "无"} 期望 ${sel}`);
    }
  }

  // ---------------- 2. 前沿不再被钉死在第一条支线 ----------------
  section("前沿支线判定（修 bug：已全通的支线不算前沿）");
  {
    scenario([], 0);
    check("全新存档：前沿 = 第 1 条支线", frontierBrs() === 0, `前沿 = #${frontierBrs()}`);

    // ★ 全部按 LEVELS_PER_BRANCH / LEVELS.length 派生，不再写死 6/12/72/11：
    //   每支线 6→12 关、支线 12→36 条之后，这些魔法数字会集体变红，
    //   而失败原因与"前沿判定"本身无关（是断言自己过期了）。
    const LPB = LEVELS_PER_BRANCH;
    const NT = LEVELS.length;

    // 首支线全通、第二支线打了 2 关 → 前沿必须落在第二支线
    // ★ 星级个数必须跟着 LEVELS_PER_BRANCH 走：6→12 之后"打 8 关"根本填不满第一条支线，
    //   前沿自然停在 #0（实测前沿 = #0）。
    scenario([...Array(LPB).keys(), LPB, LPB + 1], LPB + 1);
    check("首支线已全通：前沿推进到第 2 条支线", frontierBrs() === 1, `前沿 = #${frontierBrs()}`);

    // 前两支线全通
    scenario([...Array(LPB * 2).keys()], LPB * 2);
    check("前两支线全通：前沿推进到第 3 条支线", frontierBrs() === 2, `前沿 = #${frontierBrs()}`);

    // 全部通关：不应再有前沿（front 为 false），但仍不得指向第 1 条
    scenario([...Array(NT).keys()], NT - 1);
    check("全通关：不再有前沿标记", frontierBrs() === -1, `前沿 = #${frontierBrs()}`);
    check("全通关：仍展开当前关卡所在支线",
      expandedName().startsWith(BRANCHES[BRANCHES.length - 1].name), expandedName());
  }

  // ---------------- 3. 关卡格四态 ----------------
  section("关卡格四态（当前 / 下一关 / 已通关 / 未解锁）");
  {
    // 一条支线：0-1 通关、2 未通关(下一关)、3+ 未解锁；sel 落在 1
    scenario([0, 1], 1);
    const cells = [...homeHtml().matchAll(/class="lvCell([^"]*)" data-act="play" data-gi="(\d+)"/g)];
    check("展开 6 个关卡格", cells.length === LEVELS_PER_BRANCH, `${cells.length} 格`);
    const byGi = new Map(cells.map((m) => [+m[2], m[1].trim()]));
    check("gi=0 已通关 → done", byGi.get(0) === "done", byGi.get(0));
    check("gi=1 当前关 → cur", byGi.get(1) === "cur", byGi.get(1));
    check("gi=2 未通关未选 → next", byGi.get(2) === "next", byGi.get(2));
    check("gi=3 未解锁 → locked", byGi.get(3) === "locked", byGi.get(3));
    check("gi=5 未解锁 → locked", byGi.get(5) === "locked", byGi.get(5));
    // 文案
    check("当前关文案为「📍 当前关卡」", /📍 当前关卡/.test(homeHtml()));
    check("下一关文案为「▶ 下一关」", /▶ 下一关/.test(homeHtml()));
    // 无障碍：aria-label 要带上"当前关卡"
    const curLabel = (homeHtml().match(/class="lvCell cur"[\s\S]*?aria-label="([^"]*)"/) || [])[1] || "";
    check("当前关 aria-label 含「当前关卡」", curLabel.includes("当前关卡"), curLabel.slice(0, 60));
    // 互斥：任一格不能同时是 cur 和 next。
    // 直接扫所有关卡格的 class 列表，而不是靠 "branchLevels 紧邻 branchWall" 这种
    // DOM 邻接假设去切子串 —— 结构调整一改就会静默失配。
    const cellCls = [...homeHtml().matchAll(/class="lvCell([^"]*)"/g)].map((m) => m[1]);
    check(
      "cur 与 next 互斥",
      cellCls.length > 0 && !cellCls.some((c) => /\bcur\b/.test(c) && /\bnext\b/.test(c)),
      cellCls.join(" | ")
    );
  }

  // ---------------- 4. 打赏双入口 ----------------
  section("打赏入口（主页面 + 设置面板）");
  {
    const coffee = document.getElementById("btnCoffee");
    const legacy = document.getElementById("btnDonate");
    const panel = document.getElementById("donate");
    check("主页面按钮 #btnCoffee 存在", !!coffee);
    check("设置面板按钮 #btnDonate 存在（向后兼容）", !!legacy);
    check("打赏面板 #donate 存在", !!panel);
    // 点击主页面入口
    store.donateOpen = false;
    panel.classList.add("hidden");
    coffee.dispatchEvent({ type: "click" });
    check("点主页面入口能打开面板", !panel.classList.contains("hidden") && store.donateOpen === true);
    // 关闭
    document.getElementById("closeDonate").dispatchEvent({ type: "click" });
    check("关闭按钮能关掉面板", panel.classList.contains("hidden") && store.donateOpen === false);
    // 设置面板入口
    legacy.dispatchEvent({ type: "click" });
    check("点设置入口也能打开面板", !panel.classList.contains("hidden") && store.donateOpen === true);
    donate.closeDonate();
    // 静态：按钮在 hero 内但不在会被重写的 #heroSummary 内
    check("按钮在 hero 区内", /<div class="hero">[\s\S]*?id="btnCoffee"[\s\S]*?<\/div>/.test(html));
    const sumInner = (html.match(/<div class="heroStat" id="heroSummary"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
    check("按钮不在 #heroSummary 内（其 innerHTML 会被重写）", !sumInner.includes("btnCoffee"), `内容="${sumInner.trim()}"`);
    check("按钮用原生 <button type=button>", /<button[^>]*id="btnCoffee"[^>]*type="button"/.test(html));
    check("按钮有非空 aria-label", /id="btnCoffee"[\s\S]{0,160}aria-label="[^"]{4,}"/.test(html));
    // 样式：不得有裸色值
    const coffeeRule = (css.match(/\.heroCoffee \{[\s\S]*?\}/) || [""])[0];
    check(".heroCoffee 规则存在", coffeeRule.length > 20);
    check(".heroCoffee 无裸色值（全部 var(--…)）", !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(coffeeRule));
    check(".heroCoffee 用的每个令牌都在 tokens.css 里",
      [...coffeeRule.matchAll(/var\(--([a-z0-9-]+)\)/g)].every((m) => tokens.includes(`--${m[1]}:`)),
      [...coffeeRule.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]).join(","));
    check(".heroCoffee 有 hover/focus-visible 态", /\.heroCoffee:hover[^{]*\{|\.heroCoffee:focus-visible[^{]*\{/.test(css));
    check("触屏下可点区域 ≥44px", /@media \(pointer: coarse\)[\s\S]*?\.heroCoffee[\s\S]*?min-height: 44px/.test(css));
  }

  // ---------------- 5. 组件库纯函数（快速面） ----------------
  section("组件库纯函数");
  {
    const fns = Object.keys(comp).filter((k) => typeof comp[k] === "function" && k !== "default");
    check("components.js 至少导出 5 个函数", fns.length >= 5, `${fns.length} 个: ${fns.join(",")}`);
    let bad = [];
    for (const k of fns) {
      let out;
      // 各组件**真实签名**不同：card / grid / statRow / themeVars 收对象或数组。
      // 统一用 ("标题","副标题",{}) 去调它们，statRow 收到字符串会在 items.map 上抛错
      // ——那是断言喂错了参数，不是组件坏了。这里按签名各给一份最小合法样例。
      const SAMPLE = {
        card: [{ cls: "demo" }],
        grid: [["甲", "乙"]],
        statRow: [[{ label: "标签", value: "值" }]],
        themeVars: [{ pal: ["#123456", "#234567", "#345678"], sky: ["#abcdef", "#bcdefa", "#cdefab"] }],
        progress: [42],
      };
      try { out = comp[k](...(SAMPLE[k] || ["标题", "副标题", {}])); } catch (e) { bad.push(`${k} 抛错 ${e.message}`); continue; }
      if (out === undefined || out === null) { bad.push(`${k} 返回空`); continue; }
      const s = String(out);
      if (/undefined|NaN|\[object Object\]/.test(s)) bad.push(`${k} 输出含 undefined/NaN/[object Object]`);
      if (/style="[^"]*(color|background)\s*:\s*#|style="[^"]*rgba?\(/i.test(s)) bad.push(`${k} 输出含内联色值`);
    }
    check("所有组件纯函数调用正常且输出干净", bad.length === 0, bad.slice(0, 3).join("; "));
  }
}
