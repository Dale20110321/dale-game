// 一次性脚本：在 audit-save.mjs 里补 4.9「段位阶梯新接口」测试段
const fs = require("fs");
const p = "tools/audit-save.mjs";
const raw = fs.readFileSync(p, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let s = raw.replace(/\r\n/g, "\n");

const ANCHOR = `    // 4.9 未受邀无法开局排位`;
if (s.split(ANCHOR).length - 1 !== 1) throw new Error("anchor count != 1");

const NEW = `    // ---------- 4.9 段位阶梯（14 段 × 3 星 / 段位下标 / 下一段 / 升段奖励） ----------
    const PROMO_TOTAL = RANKS.reduce((a, k) => a + k.reward, 0);
    const RUN_GOLD = LEVELS.reduce((a, L) => a + (L.goldBase || 0) + (L.coinN || 0) * (L.coinVal || 0), 0);
    const peakName = RANKS.find((k) => k.min === RATING_PEAK).name;

    check("RANKS：段位数 ≥ 14（原来只有 8 段，按高级赛 +40/场一天就刷完了）",
      RANKS.length >= 14, RANKS.length + " 段：" + RANKS.map((k) => k.name).join(" → "));
    check("RANKS：min 严格递增、从 0 起步、末段门槛 === RATING_TOP（覆盖整条段位分轴）",
      RANKS[0].min === 0 && RANKS.every((k, i) => i === 0 || k.min > RANKS[i - 1].min) &&
      RANKS[RANKS.length - 1].min === RATING_TOP,
      RANKS[0].min + " … " + RANKS[RANKS.length - 1].min + "（RATING_TOP=" + RATING_TOP + "）");
    check("RANKS：升段奖励严格递增、青铜为 0（全表奖励合计有量级）",
      RANKS[0].reward === 0 && RANKS.every((k, i) => i === 0 || k.reward > RANKS[i - 1].reward),
      RANKS.map((k) => k.reward).join(" → ") + "，合计 " + PROMO_TOTAL.toLocaleString());
    check("RANKS：全表升段奖励占闯关一轮收入的 15%~40%（有存在意义，但不会盖过主线）",
      PROMO_TOTAL / RUN_GOLD > 0.15 && PROMO_TOTAL / RUN_GOLD < 0.40,
      "升段奖励 " + PROMO_TOTAL.toLocaleString() + " / 闯关一轮 " + RUN_GOLD.toLocaleString() +
      " = " + ((PROMO_TOTAL / RUN_GOLD) * 100).toFixed(1) + "%");

    check("rankIndexOf：每段门槛映射到自己的下标、门槛减 1 映射到上一段；负数与非法值 → 0",
      RANKS.every((k, i) => rankIndexOf(k.min) === i && (i === 0 || rankIndexOf(k.min - 1) === i - 1)) &&
      rankIndexOf(-1) === 0 && rankIndexOf(NaN) === 0 && rankIndexOf(1e9) === RANKS.length - 1,
      "青铜=0 … " + RANKS[RANKS.length - 1].name + "=" + (RANKS.length - 1) + "；负数 / NaN / 1e9 已覆盖");
    check("rankStars：每段门槛 = 1★、1.5× 门槛 = 2★、2× 门槛 = 3★，青铜恒 0 星",
      RANKS.every((k, i) => i === 0
        ? rankStars(k.min) === 0
        : rankStars(k.min) === 1 && rankStars(k.min * 1.5) === 2 && rankStars(k.min * 2) === 3 && rankStars(k.min - 1) === 0),
      RANKS.slice(1, 4).map((k) => k.name + " " + k.min + "/★1 · " + k.min * 1.5 + "/★★ · " + k.min * 2 + "/★★★").join(" · "));
    {
      let bad = 0, n = 0, cross = 0;
      for (let r = 0; r <= RATING_TOP + 5000; r += 13) {
        n++;
        const k = RANKS[rankIndexOf(r)];
        const exp = k.min <= 0 ? 0 : (r >= k.min * 2 ? 3 : r >= k.min * 1.5 ? 2 : r >= k.min ? 1 : 0);
        if (rankStars(r) !== exp) bad++;
        if (k.min > 0 && rankIndexOf(r) !== RANKS.indexOf(k)) cross++;
      }
      check("rankStars：0 到 " + (RATING_TOP + 5000) + " 每 13 分逐点比对，星数恒与「当前段位门槛公式」一致且落在 0~3",
        bad === 0 && n > 900 && cross === 0,
        n + " 个采样点全部命中（跨段后按新段位重算，不虚高）");
    }
    check("rankStars：非法与负数 rating 返回合法星数（不抛异常、不越界）",
      [-1, -1e9, NaN, null, undefined, "abc", 1e9].every((v) => {
        const n = rankStars(v);
        return isInt(n) && n >= 0 && n <= 3;
      }),
      "-1 / -1e9 / NaN / null / abc / 1e9 均落在 0~3");
    check("rankNextOf：逐段返回「下一段」，已封顶（" + RANKS[RANKS.length - 1].name + "）返回 null",
      RANKS.every((k, i) => {
        const nx = rankNextOf(k.min);
        return i + 1 < RANKS.length ? !!(nx && nx.name === RANKS[i + 1].name && nx.min === RANKS[i + 1].min) : nx === null;
      }),
      "黄金 → " + (rankNextOf(700) || {}).name + " … " + RANKS[RANKS.length - 1].name + " → null");

    check("rankPromoReward：只结算「本次向上新跨过」的段位，降段或原地不动都不发",
      rankPromoReward(0, 0) === 0 && rankPromoReward(700, 700) === 0 && rankPromoReward(1200, 700) === 0 &&
      rankPromoReward(299, 300) === RANKS[1].reward &&
      rankPromoReward(100, 1200) === RANKS[1].reward + RANKS[2].reward + RANKS[3].reward &&
      rankPromoReward(2000, 5200) === RANKS.slice(5, 9).reduce((a, k) => a + k.reward, 0),
      "299→300 = " + rankPromoReward(299, 300) + " · 100→1200 = " + rankPromoReward(100, 1200) +
      " · 2000→5200 = " + rankPromoReward(2000, 5200));
    check("rankPromoReward：负数 / NaN / 非法输入不抛异常且返回非负整数",
      [[-100, 500], [NaN, 500], ["abc", 500], [0, null], [500, undefined]].every(([a, b]) => {
        const n = rankPromoReward(a, b);
        return isInt(n) && n >= 0;
      }),
      "-100→500 / NaN→500 / abc→500 / 0→null / 500→undefined 均为非负整数");

    // ---- 4.9.1 升段奖励真的进了金币（结算层） ----
    const rPromo = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = RANKS[1].min - 5;
      const g0 = store.gold;
      gameM.settleRanked(true);
      return { g0, g1: store.gold, r: store.progress.rating };
    });
    check("settleRanked：跨段的当局立刻收到升段一次性金币（这一局只有这一笔）",
      !rPromo.threw && rPromo.g1 - rPromo.g0 === RANKS[1].reward && rPromo.r >= RANKS[1].min,
      rPromo.threw ? "抛异常：" + rPromo.threw
        : rPromo.g0 + " → " + rPromo.g1 + "（+" + (rPromo.g1 - rPromo.g0) + "，白银奖励 " + RANKS[1].reward + "）· rating=" + rPromo.r);
    const rNoPromo = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = 2000;
      const g0 = store.gold;
      gameM.settleRanked(true);
      const g1 = store.gold;
      store.progress.rating = RANKS[4].min - 30;   // 降到钻石线前 30 分
      gameM.settleRanked(true);
      return { g0, g1, g2: store.gold };
    });
    check("settleRanked：段位中段赢一局不发升段奖励；降段后再升回同段位也不补发（奖励只发一次）",
      !rNoPromo.threw && rNoPromo.g1 - rNoPromo.g0 === 0 && rNoPromo.g2 - rNoPromo.g1 === 0,
      rNoPromo.threw ? "抛异常：" + rNoPromo.threw
        : "2000 段内：+" + (rNoPromo.g1 - rNoPromo.g0) + " · 回落再升：+" + (rNoPromo.g2 - rNoPromo.g1));
    const rPromoAll = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = true;
      store.progress.rating = 0;
      const g0 = store.gold;
      let guard = 0;
      while (store.progress.rating < RATING_TOP && guard++ < 3000) gameM.settleRanked(true);
      return { g0, g1: store.gold, n: guard, r: store.progress.rating };
    });
    check("settleRanked：全胜刷满 14 段，升段奖励合计恰好 " + PROMO_TOTAL.toLocaleString() + "（不多不少）",
      !rPromoAll.threw && rPromoAll.g1 - rPromoAll.g0 === PROMO_TOTAL && rPromoAll.r >= RATING_TOP,
      rPromoAll.threw ? "抛异常：" + rPromoAll.threw
        : rPromoAll.n + " 场连胜刷满全表 · +" + (rPromoAll.g1 - rPromoAll.g0).toLocaleString() + " · 终值 " + rPromoAll.r);
    {
      const sim = (from) => {
        fresh(); loadAll();
        store.rankedAdvanced = from >= RATING_ADVANCED;
        store.progress.rating = from;
        let guard = 0;
        while (store.progress.rating < RATING_TOP && guard++ < 5000) gameM.settleRanked(true);
        return guard;
      };
      const nPeak = sim(0), nTop = sim(RATING_ADVANCED);
      check("比赛阶段长度：全胜从 0 刷到登顶「" + peakName + "」需 80~250 场，刷满全表需 100~400 场（不是一天就完）",
        nPeak >= 80 && nPeak <= 250 && nTop >= 100 && nTop <= 400,
        "从 0 → " + peakName + "：" + nPeak + " 场 · 从 " + RATING_ADVANCED + " → " +
        RANKS[RANKS.length - 1].name + "：" + nTop + " 场（每场约 1 分钟，即 " +
        (nPeak / 60).toFixed(1) + "~" + (nTop / 60).toFixed(1) + " 小时）");
    }

    // 4.10 未受邀无法开局排位`;

s = s.replace(ANCHOR, NEW);
fs.writeFileSync(p, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("4.9 section inserted");