// 一次性脚本：把各测试套件里与新段位表冲突的断言迁移过去
const fs = require("fs");
function edit(p, fn) {
  const raw = fs.readFileSync(p, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  const s = fn(raw.replace(/\r\n/g, "\n"));
  fs.writeFileSync(p, crlf ? s.replace(/\n/g, "\r\n") : s);
  console.log("patched", p);
}
const rep = (s, a, b) => {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error(`count=${n}: ${a.slice(0, 70)}`);
  return s.replace(a, b);
};

// ---------------- audit.mjs ----------------
edit("tools/audit.mjs", (s) => {
  s = rep(s,
    `  ck("rankName(3000+) = 传奇", rankName(99999) === "传奇", rankName(99999));`,
    `  ck("rankName(远超段位表) = 表尾段位名", rankName(99999) === RANKS[RANKS.length - 1].name, rankName(99999));`);
  // 免费车：VEHICLES[0]（驮马）是开局白送的，价格必须是 0
  s = rep(s,
    `  ck("【全局】至少一辆车免费可骑", VEHICLES.some((v) => v.price === 0), VEHICLES.map((v) => v.price).join(","));`,
    `  ck("【全局】开局白送的那辆车（index 0）价格为 0，其余全部 > 0",
    VEHICLES[0].price === 0 && VEHICLES.slice(1).every((v) => v.price > 0),
    "index0=" + VEHICLES[0].name + "(" + VEHICLES[0].price + ") · 其余 " + VEHICLES.slice(1).map((v) => v.price).join(","));
  ck("【全局】段位名与车辆名互不重名（玩家不会把段位和车搞混）",
    RANKS.every((r) => !VEHICLES.some((v) => v.name === r.name)),
    "段位：" + RANKS.map((r) => r.name).join(" ") + "；车辆：" + VEHICLES.map((v) => v.name).join(" "));`);
  return s;
});

// ---------------- audit-game.mjs ----------------
edit("tools/audit-game.mjs", (s) => {
  s = rep(s,
    `    var RANKED_BEFORE = store.progress.rating - C.RATING_WIN_GAIN;`,
    `    var RANKED_BEFORE = store.progress.rating - C.rankDelta(store.progress.rating, store.rankedAdvanced === true, true);`);
  s = rep(s,
    `      return win === C.RATING_WIN_GAIN && loss === -C.RATING_LOSS;
    })(), \`胜 +\${C.RATING_WIN_GAIN} / 负 \${C.RATING_LOSS}\`);`,
    `      return win === C.rankDelta(1000, false, true) && loss === -C.RATING_LOSS;
    })(), \`胜 +\${C.rankDelta(1000, false, true)} / 负 \${C.RATING_LOSS}\`);`);
  s = rep(s,
    `      return advanced === C.RATING_WIN_GAIN_ADVANCED && advanced > normal;
    })(), \`普通 +\${C.RATING_WIN_GAIN} / 高级 +\${C.RATING_WIN_GAIN_ADVANCED}\`);`,
    `      return advanced === C.rankDelta(afterNormal, true, true) && advanced > normal;
    })(), \`普通 +\${normal} / 高级 +\${advanced}（随段位高度递增）\`);`);
  s = rep(s,
    `    T('段位名覆盖全区间且非空', [0, 600, 1200, 1800, 2400, 3000].every((rating) => typeof rankName(rating) === 'string' && rankName(rating).length > 0), [0, 1200, 2400, 3000].map((rating) => rankName(rating)).join('/'));`,
    `    T('段位名覆盖全区间且非空', Array.from({ length: 100 }, (_, i) => i * (C.RATING_TOP / 99)).every((rating) => typeof rankName(rating) === 'string' && rankName(rating).length > 0), [0, C.RATING_ADVANCED, C.RATING_PEAK, C.RATING_TOP].map((rating) => rating + "→" + rankName(rating)).join(' / '));`);
  return s;
});

// ---------------- audit-a11y.mjs：transition 裸时长 ----------------
edit("styles/main.css", (s) =>
  rep(s,
    `.rankBox .rankBar > i { display: block; height: 100%; background: var(--gold); border-radius: 3px; transition: width .25s ease; }`,
    `.rankBox .rankBar > i { display: block; height: 100%; background: var(--gold); border-radius: 3px; }`));

// ---------------- audit-save.mjs ----------------
edit("tools/audit-save.mjs", (s) => {
  // 1200 仍是铂金，但 399 现在是白银（白银线 300）—— 换成 299 才有意义
  s = rep(s,
    `    check("rankName：字符串数字被正确解析（1200 判铂金，399 判青铜）",
      rankName("1200") === "铂金" && rankName("399") === "青铜",
      \`字符串 1200 → \${rankName("1200")} · 字符串 399 → \${rankName("399")}\`);`,
    `    check("rankName：字符串数字被正确解析（1200 判铂金，299 判青铜）",
      rankName("1200") === "铂金" && rankName("299") === "青铜",
      \`字符串 1200 → \${rankName("1200")} · 字符串 299 → \${rankName("299")}\`);`);
  // 跨层一致：段位 2000 → 钻石（不是星耀）
  s = rep(s, `      rX.sel === 11 && rX.rating === 2000 && rX.runs === 3 && rX.rank === "星耀",`,
    `      rX.sel === 11 && rX.rating === 2000 && rX.runs === 3 && rX.rank === RANKS.find((k) => k.min <= 2000 && (RANKS.indexOf(k) === RANKS.length - 1 || RANKS[RANKS.indexOf(k) + 1].min > 2000)).name,`);
  // 跨层一致：高级赛开局那条要验的是"准入 + 档位一致"，登顶另设一条
  s = rep(s,
    `      store.progress.rating = 2600; store.progress.peak = false;
      store.stars = new Array(LV).fill(3);
      st.settleProgress();
      gameM.startGame("ranked", 0, { advanced: true });
      return { adv: store.rankedAdvanced, mode: store.mode, state: store.state, peak: store.progress.peak };
    });
    check("跨层一致：段位 2600 时高级排位可开局（准入与开局档位一致）",
      !rX2.threw && rX2.adv === true && rX2.mode === "ranked" && rX2.state === "play" && rX2.peak === true,
      rX2.threw ? \`抛异常：\${rX2.threw}\` : \`rating=2600 → rankedAdvanced=\${rX2.adv} mode=\${rX2.mode} state=\${rX2.state} peak=\${rX2.peak}\`);`,
    `      store.progress.rating = C_RATING_X2; store.progress.peak = false;
      store.stars = new Array(LV).fill(3);
      st.settleProgress();
      gameM.startGame("ranked", 0, { advanced: true });
      return { adv: store.rankedAdvanced, mode: store.mode, state: store.state, peak: store.progress.peak };
    });
    check(\`跨层一致：段位 \${C_RATING_X2}（已过登顶线 \${RATING_PEAK}）时高级排位可开局且已登顶（准入与开局档位一致）\`,
      !rX2.threw && rX2.adv === true && rX2.mode === "ranked" && rX2.state === "play" && rX2.peak === true,
      rX2.threw ? \`抛异常：\${rX2.threw}\` : \`rating=\${C_RATING_X2} → rankedAdvanced=\${rX2.adv} mode=\${rX2.mode} state=\${rX2.state} peak=\${rX2.peak}\`);`);
  s = rep(s,
    `    const rX2 = run(() => {
      fresh(); loadAll();
      store.progress.invited = true;`,
    `    const C_RATING_X2 = RATING_PEAK + 200;
    const rX2 = run(() => {
      fresh(); loadAll();
      store.progress.invited = true;`);

  // rankStars：改成"段内跨度"口径后的断言
  s = rep(s,
    `    check("rankStars：每段门槛 = 1★、1.5× 门槛 = 2★、2× 门槛 = 3★，青铜恒 0 星",
      RANKS.every((k, i) => i === 0
        ? rankStars(k.min) === 0
        : rankStars(k.min) === 1 && rankStars(k.min * 1.5) === 2 && rankStars(k.min * 2) === 3 && rankStars(k.min - 1) === 0),
      RANKS.slice(1, 4).map((k) => k.name + " " + k.min + "/★1 · " + k.min * 1.5 + "/★★ · " + k.min * 2 + "/★★★").join(" · "));`,
    `    check("rankStars：每段都是「进段 1★ / 段内过半 2★ / 段内 85% 3★」，且**每一段的 3★ 都真的拿得到**",
      RANKS.every((k, i) => {
        if (i === 0) return rankStars(k.min) === 0;
        const span = rankNextOf(k.min) ? rankNextOf(k.min).min - k.min : Math.round(k.min * 0.2);
        return rankStars(k.min) === 1 &&
          rankStars(k.min + Math.ceil(span * 0.5)) === 2 &&
          rankStars(k.min + Math.ceil(span * 0.85)) === 3 &&
          rankStars(k.min - 1) === 0 &&
          // 关键不变式：3★ 门槛必须仍在本段内，不能被下一段吃掉
          rankNextOf(k.min) === null || k.min + Math.ceil(span * 0.85) < rankNextOf(k.min).min;
      }),
      RANKS.slice(1, 4).map((k) => {
        const span = rankNextOf(k.min).min - k.min;
        return k.name + " " + k.min + "/★1 · " + (k.min + Math.ceil(span * 0.5)) + "/★★ · " + (k.min + Math.ceil(span * 0.85)) + "/★★★";
      }).join(" · "));`);
  s = rep(s,
    `        const k = RANKS[rankIndexOf(r)];
        const exp = k.min <= 0 ? 0 : (r >= k.min * 2 ? 3 : r >= k.min * 1.5 ? 2 : r >= k.min ? 1 : 0);
        if (rankStars(r) !== exp) bad++;
        if (k.min > 0 && rankIndexOf(r) !== RANKS.indexOf(k)) cross++;`,
    `        const i = rankIndexOf(r);
        const k = RANKS[i];
        const span = rankNextOf(r) ? rankNextOf(r).min - k.min : Math.max(1, Math.round(k.min * 0.2));
        const t = (r - k.min) / span;
        const exp = k.min <= 0 ? 0 : (t >= 0.85 ? 3 : t >= 0.5 ? 2 : 1);
        if (rankStars(r) !== exp) bad++;
        if (k.min > 0 && rankIndexOf(r) !== i) cross++;`);

  // 降段再升回不补发：改成"先真的领过一次，再掉下去，再升回来"
  s = rep(s,
    `    const rNoPromo = run(() => {
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
        : "2000 段内：+" + (rNoPromo.g1 - rNoPromo.g0) + " · 回落再升：+" + (rNoPromo.g2 - rNoPromo.g1));`,
    `    // 关键用例：真的跨过一次 → 拿到钻石奖励 → 手动掉回铂金 → 再赢回钻石 → 必须一分不再发
    const rNoPromo = run(() => {
      fresh(); loadAll();
      store.rankedAdvanced = false;
      store.progress.rating = RANKS[4].min - 100;
      const g0 = store.gold;
      let g = g0;
      let crossed = null;
      for (let i = 0; i < 20 && !crossed; i++) {
        gameM.settleRanked(true);
        g = store.gold;
        if (store.progress.rating >= RANKS[4].min) crossed = { g, r: store.progress.rating };
      }
      const gotFirst = crossed ? crossed.g - g0 : -1;
      store.progress.rating = RANKS[4].min - 30;   // 掉回铂金
      const before2 = store.gold;
      for (let i = 0; i < 20 && store.progress.rating < RANKS[4].min; i++) gameM.settleRanked(true);
      return { g0, g1: crossed ? crossed.g : 0, gotFirst, g2: store.gold - before2, r2: store.progress.rating };
    });
    check("settleRanked：升段奖励只发一次 —— 真跨过钻石拿到奖励后，掉回铂金再赢回钻石不再补发",
      !rNoPromo.threw && rNoPromo.gotFirst === RANKS[4].reward && rNoPromo.g2 === 0 && rNoPromo.r2 >= RANKS[4].min,
      rNoPromo.threw ? "抛异常：" + rNoPromo.threw
        : "首次跨段：+" + rNoPromo.gotFirst + "（钻石 " + RANKS[4].reward + "）· 掉段后重登：+" + rNoPromo.g2);`);
  return s;
});