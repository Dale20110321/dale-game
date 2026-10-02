// 一次性脚本：把测试套件里的排位赛断言迁移到新的 14 段阶梯 + 随高度递增的段位分
const fs = require("fs");
const p = "tools/audit-save.mjs";
// 仓库统一 CRLF：先归一到 LF 做替换，最后写回时还原（否则所有 pattern 都匹配不上）
const raw = fs.readFileSync(p, "utf8");
const crlf = raw.indexOf("\r\n") >= 0;
let s = raw.replace(/\r\n/g, "\n");
function rep(a, b) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error(`count=${n} for: ${a.slice(0, 80)}`);
  s = s.replace(a, b);
}

rep(`    ACHS, RANKS, MAX_LV, DT,
    RATING_ADVANCED, RATING_PEAK, RATING_MIN,
    RATING_WIN_GAIN, RATING_LOSS, RATING_WIN_GAIN_ADVANCED, RATING_LOSS_ADVANCED,
    rankName, SAVE_APP, SAVE_FORMAT, SAVE_KEYS,
  } = await imp("config/constants.js");`,
`    ACHS, RANKS, MAX_LV, DT,
    RATING_ADVANCED, RATING_PEAK, RATING_TOP, RATING_MIN,
    RATING_LOSS, RATING_LOSS_ADVANCED, RANK_GAIN_BASE, RANK_GAIN_STEP,
    RANK_GAIN_BASE_ADV, RANK_GAIN_STEP_ADV,
    rankName, rankStars, rankIndexOf, rankNextOf, rankDelta, rankPromoReward,
    SAVE_APP, SAVE_FORMAT, SAVE_KEYS,
  } = await imp("config/constants.js");`);

rep(`      { adv: false, won: true, from: 100, delta: RATING_WIN_GAIN, tag: "普通排位 · 胜" },
      { adv: false, won: false, from: 100, delta: -RATING_LOSS, tag: "普通排位 · 负" },
      { adv: true, won: true, from: 100, delta: RATING_WIN_GAIN_ADVANCED, tag: "高级排位 · 胜" },
      { adv: true, won: false, from: 100, delta: -RATING_LOSS_ADVANCED, tag: "高级排位 · 负" },`,
`      { adv: false, won: true, from: 100, delta: rankDelta(100, false, true), tag: "普通排位 · 胜" },
      { adv: false, won: false, from: 100, delta: -RATING_LOSS, tag: "普通排位 · 负" },
      { adv: true, won: true, from: 100, delta: rankDelta(100, true, true), tag: "高级排位 · 胜" },
      { adv: true, won: false, from: 100, delta: -RATING_LOSS_ADVANCED, tag: "高级排位 · 负" },
      // 高段位单场收益是「基数 + 系数 × floor(rating/1000)」而不是常数 —— 这两条把它钉死
      { adv: false, won: true, from: 3400, delta: rankDelta(3400, false, true), tag: "普通排位 · 胜（大师段）" },
      { adv: true, won: true, from: 8600, delta: rankDelta(8600, true, true), tag: "高级排位 · 胜（虚空段）" },`);

rep(`    check("排位数值常量自洽：高级赛的收益与风险都严格高于普通赛",
      RATING_WIN_GAIN_ADVANCED > RATING_WIN_GAIN && RATING_LOSS_ADVANCED > RATING_LOSS,
      \`胜 +\${RATING_WIN_GAIN} / +\${RATING_WIN_GAIN_ADVANCED} · 负 -\${RATING_LOSS} / -\${RATING_LOSS_ADVANCED}\`);`,
`    // 逐段位比对（每 1000 分一档），而不只看 0 分那一档 —— 只验常数会漏掉「随高度递增」这个核心改动
    const gainOk = [0, 999, 1000, 2500, 3300, 5200, 7500, 11999].every((r) =>
      rankDelta(r, true, true) > rankDelta(r, false, true) &&
      rankDelta(r, false, true) === RANK_GAIN_BASE + RANK_GAIN_STEP * Math.floor(r / 1000) &&
      rankDelta(r, true, true) === RANK_GAIN_BASE_ADV + RANK_GAIN_STEP_ADV * Math.floor(r / 1000));
    check("排位数值常量自洽：高级赛收益始终高于普通赛，且两者都随段位高度递增（每 1000 分 +8 / +12）",
      gainOk && RATING_LOSS_ADVANCED > RATING_LOSS,
      \`0 分 +\${rankDelta(0, false, true)} / +\${rankDelta(0, true, true)} · 9000 分 +\${rankDelta(9000, false, true)} / +\${rankDelta(9000, true, true)} · 负分恒为 -\${RATING_LOSS} / -\${RATING_LOSS_ADVANCED}\`);
    check("rankDelta：判负恒为负且不随高度变化（高分段位一次失误不至于跌段）",
      [0, 2000, 6000, 12000].every((r) => rankDelta(r, false, false) === -RATING_LOSS && rankDelta(r, true, false) === -RATING_LOSS_ADVANCED),
      \`-\${RATING_LOSS} / -\${RATING_LOSS_ADVANCED}（与 rating 无关）\`);`);

rep(`      !rFloorW.threw && rFloorW.r === RATING_WIN_GAIN_ADVANCED,
      rFloorW.threw ? \`抛异常：\${rFloorW.threw}\` : \`0 → 胜 → \${rFloorW.r}（等于 +\${RATING_WIN_GAIN_ADVANCED}）\`);`,
`      !rFloorW.threw && rFloorW.r === rankDelta(0, true, true),
      rFloorW.threw ? \`抛异常：\${rFloorW.threw}\` : \`0 → 胜 → \${rFloorW.r}（等于 +\${rankDelta(0, true, true)}）\`);`);

rep(`      !rX1.threw && rX1.before === false && rX1.after === RATING_ADVANCED + RATING_WIN_GAIN - 10 && rX1.unlocked === true,`,
`      !rX1.threw && rX1.before === false &&
      rX1.after === RATING_ADVANCED - 10 + rankDelta(RATING_ADVANCED - 10, false, true) && rX1.unlocked === true,`);

// rX2 / rX3：登顶阈值边界 —— 起点按「当局增量」反推，而不是写死 −25 / −26（增量现在随高度变）
const PEAK_FROM = "RATING_PEAK - rankDelta(RATING_PEAK - 1, false, true)";
rep(`      store.progress.rating = RATING_PEAK - 25;`, `      store.progress.rating = ${PEAK_FROM};`);
rep(`    check(\`settleRanked：rating \${RATING_PEAK - 25} 判胜后精确落到 \${RATING_PEAK} → 登顶并永久化\`,`,
  `    check(\`settleRanked：rating \${${PEAK_FROM}} 判胜后精确落到 \${RATING_PEAK} → 登顶并永久化\`,`);
rep(`      rX2.threw ? \`抛异常：\${rX2.threw}\` : \`\${RATING_PEAK - 25} → \${rX2.out}，`,
  `      rX2.threw ? \`抛异常：\${rX2.threw}\` : \`\${${PEAK_FROM}} → \${rX2.out}，`);
rep(`      store.progress.rating = RATING_PEAK - 26;`, `      store.progress.rating = ${PEAK_FROM} - 1;`);
rep(`    check(\`settleRanked：rating \${RATING_PEAK - 26} 判胜后停在 \${RATING_PEAK - 1} → 不误登顶\`,
      !rX3.threw && rX3.out === RATING_PEAK - 1 && rX3.peak === false,
      rX3.threw ? \`抛异常：\${rX3.threw}\` : \`\${RATING_PEAK - 26} → \${rX3.out}，peak=\${rX3.peak}\`);`,
`    check(\`settleRanked：rating \${${PEAK_FROM} - 1} 判胜后停在 \${RATING_PEAK - 1} → 不误登顶\`,
      !rX3.threw && rX3.out === RATING_PEAK - 1 && rX3.peak === false,
      rX3.threw ? \`抛异常：\${rX3.threw}\` : \`\${${PEAK_FROM} - 1} → \${rX3.out}，peak=\${rX3.peak}\`);`);

rep(`      store.progress.rating = 3000; store.progress.peak = true;`,
  `      store.progress.rating = RATING_PEAK + 500; store.progress.peak = true;`);
rep(`    check("settleRanked：段位分从 3000 掉到低位，peak 依然为 true（登顶不可逆）",`,
  `    check("settleRanked：段位分从登顶之上掉到低位，peak 依然为 true（登顶不可逆）",`);

rep(`        if (won) { if (d !== RATING_WIN_GAIN) badDelta++; }`,
  `        if (won) { if (d !== rankDelta(prev, false, true)) badDelta++; }`);
rep(`      rSeq.threw ? \`抛异常：\${rSeq.threw}\` : \`\${rSeq.p.wins} 胜 \${rSeq.p.losses} 负 · rating=\${rSeq.p.rating}（起始 0，40×25-20×20=\${40 * RATING_WIN_GAIN - 20 * RATING_LOSS}，首局触底扣 0）\`);`,
  `      rSeq.threw ? \`抛异常：\${rSeq.threw}\` : \`\${rSeq.p.wins} 胜 \${rSeq.p.losses} 负 · rating=\${rSeq.p.rating}（起始 0，增益随高度递增；首局触底扣 0）\`);`);
rep(`        if (won ? d !== RATING_WIN_GAIN_ADVANCED : d !== -RATING_LOSS_ADVANCED) bad++;`,
  `        if (won ? d !== rankDelta(prev, true, true) : d !== -RATING_LOSS_ADVANCED) bad++;`);

rep(`    for (let r = 0; r <= 3400; r += 7) {`, `    for (let r = 0; r <= RATING_TOP + 200; r += 7) {`);
rep(`    check(\`rankName：0 到 3400 每 7 分逐点比对全区间（\${total} 个采样点）无一处错档\`,`,
  `    check(\`rankName：0 到 \${RATING_TOP + 200} 每 7 分逐点比对全区间（\${total} 个采样点）无一处错档\`,`);
rep(`        [1e9, "传奇"], [Infinity, "传奇"]].every(([v, exp]) => rankName(v) === exp),
      "-1 / -1e9 / NaN / abc / null / undefined / true → 青铜；1e9 与 Infinity → 传奇");`,
  `        [1e9, RANKS[RANKS.length - 1].name], [Infinity, RANKS[RANKS.length - 1].name]].every(([v, exp]) => rankName(v) === exp),
      \`-1 / -1e9 / NaN / abc / null / undefined / true → 青铜；1e9 与 Infinity → \${RANKS[RANKS.length - 1].name}\`);`);

// 4.8 rankedAIScale
rep(`    for (let r = 0; r <= 3000; r += 25) {
      const n = raceM.rankedAIScale(r, false), a = raceM.rankedAIScale(r, true);
      if (r > 0) {
        const pn = raceM.rankedAIScale(r - 25, false), pa = raceM.rankedAIScale(r - 25, true);
        if (n < pn - 1e-12 || a < pa - 1e-12) aiMono = false;
      }
      if (!(a > n)) aiAdv = false;
      if (!(n >= 0.70 - 1e-9 && n <= 0.90 + 1e-9 && a >= 0.95 - 1e-9 && a <= 1.25 + 1e-9)) aiBound = false;
      aiRows.push(r);
    }
    check(\`rankedAIScale：0 到 3000 段位分越高 AI 配速越快（\${aiRows.length} 个采样点两档都单调不减）\`,
      aiMono, \`\${aiRows.length} 个采样点全部单调不减\`);`,
`    // ★ 采样一路走到段位表顶端 RATING_TOP：登顶之后还有 5 个段位，
    //   只验到 3000 就验不到「AI 在登顶后仍继续变强」这条最关键的不变式。
    const AI_TOP_N = 0.97;   // 普通档上界 = 0.70 + 0.20 × (1 + 0.35)
    const AI_TOP_A = 1.36;   // 高级档上界 = 0.95 + 0.30 × (1 + 0.35)
    for (let r = 0; r <= RATING_TOP; r += 25) {
      const n = raceM.rankedAIScale(r, false), a = raceM.rankedAIScale(r, true);
      if (r > 0) {
        const pn = raceM.rankedAIScale(r - 25, false), pa = raceM.rankedAIScale(r - 25, true);
        if (n < pn - 1e-12 || a < pa - 1e-12) aiMono = false;
      }
      if (!(a > n)) aiAdv = false;
      if (!(n >= 0.70 - 1e-9 && n <= AI_TOP_N + 1e-9 && a >= 0.95 - 1e-9 && a <= AI_TOP_A + 1e-9)) aiBound = false;
      aiRows.push(r);
    }
    check(\`rankedAIScale：0 到 \${RATING_TOP} 段位分越高 AI 配速越快（\${aiRows.length} 个采样点两档都单调不减，含登顶之后的 5 段）\`,
      aiMono, \`\${aiRows.length} 个采样点全部单调不减\`);`);

rep(`      aiAdv, \`rating=0 时 \${raceM.rankedAIScale(0, false).toFixed(2)} vs \${raceM.rankedAIScale(0, true).toFixed(2)}；rating=2400 时 \${raceM.rankedAIScale(2400, false).toFixed(2)} vs \${raceM.rankedAIScale(2400, true).toFixed(2)}\`);`,
  `      aiAdv, \`rating=0 时 \${raceM.rankedAIScale(0, false).toFixed(2)} vs \${raceM.rankedAIScale(0, true).toFixed(2)}；rating=\${RATING_TOP} 时 \${raceM.rankedAIScale(RATING_TOP, false).toFixed(2)} vs \${raceM.rankedAIScale(RATING_TOP, true).toFixed(2)}\`);`);

rep(`    check("rankedAIScale：普通档夹在 0.70 到 0.90、高级档夹在 0.95 到 1.25（不越界）",
      aiBound, \`普通档 \${raceM.rankedAIScale(0, false)} 到 \${raceM.rankedAIScale(3000, false).toFixed(2)} · 高级档 \${raceM.rankedAIScale(0, true)} 到 \${raceM.rankedAIScale(3000, true).toFixed(2)}\`);
    check("rankedAIScale：rating 超过登顶阈值后 AI 强度封顶（不再无限增强）",
      raceM.rankedAIScale(RATING_PEAK, false) === raceM.rankedAIScale(RATING_PEAK * 10, false) &&
      raceM.rankedAIScale(RATING_PEAK, true) === raceM.rankedAIScale(RATING_PEAK * 10, true),
      \`rating=\${RATING_PEAK} 与 rating=\${RATING_PEAK * 10} 均为 \${raceM.rankedAIScale(RATING_PEAK, false).toFixed(2)} / \${raceM.rankedAIScale(RATING_PEAK, true).toFixed(2)}\`);`,
`    check(\`rankedAIScale：普通档夹在 0.70 到 \${AI_TOP_N}、高级档夹在 0.95 到 \${AI_TOP_A}（不越界）\`,
      aiBound, \`普通档 \${raceM.rankedAIScale(0, false)} 到 \${raceM.rankedAIScale(RATING_TOP, false).toFixed(2)} · 高级档 \${raceM.rankedAIScale(0, true)} 到 \${raceM.rankedAIScale(RATING_TOP, true).toFixed(2)}\`);
    check("rankedAIScale：登顶（RATING_PEAK）之后仍随段位继续增强，直到 RATING_TOP 才封顶",
      raceM.rankedAIScale(RATING_TOP, false) > raceM.rankedAIScale(RATING_PEAK, false) &&
      raceM.rankedAIScale(RATING_TOP, true) > raceM.rankedAIScale(RATING_PEAK, true),
      \`登顶 \${raceM.rankedAIScale(RATING_PEAK, false).toFixed(2)} / \${raceM.rankedAIScale(RATING_PEAK, true).toFixed(2)} → 顶端 \${raceM.rankedAIScale(RATING_TOP, false).toFixed(2)} / \${raceM.rankedAIScale(RATING_TOP, true).toFixed(2)}\`);
    check("rankedAIScale：rating 超过段位表顶端后 AI 强度封顶（不再无限增强）",
      raceM.rankedAIScale(RATING_TOP, false) === raceM.rankedAIScale(RATING_TOP * 10, false) &&
      raceM.rankedAIScale(RATING_TOP, true) === raceM.rankedAIScale(RATING_TOP * 10, true),
      \`rating=\${RATING_TOP} 与 rating=\${RATING_TOP * 10} 均为 \${raceM.rankedAIScale(RATING_TOP, false).toFixed(2)} / \${raceM.rankedAIScale(RATING_TOP, true).toFixed(2)}\`);`);

fs.writeFileSync(p, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("audit-save.mjs patched");