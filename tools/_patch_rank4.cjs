// 一次性脚本：把 promoClaimed（升段奖励水位线）接进存档
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

edit("src/core/storage.js", (s) => {
  s = rep(s,
`  P.peak = o.peak === true;
  P.rating = Math.max(0, intOr(lsGet(SAVE_KEYS.rating)));`,
`  P.peak = o.peak === true;
  P.rating = Math.max(0, intOr(lsGet(SAVE_KEYS.rating)));
  // 升段奖励的水位线：只涨不跌。老存档没有这个字段 → 0，表示"之前都没领过"，
  // 下一次跨段会把历史该拿的一次性奖励一次性补齐（而不是白送，是把欠的账结清）。
  P.promoClaimed = Math.max(0, intOr(o.promoClaimed));
  // 水位线不该低于当前段位分：否则老玩家每赢一局都会被判成"新跨段"反复领同一段的钱
  if (P.promoClaimed < P.rating) P.promoClaimed = P.rating;`);
  s = rep(s,
`    wins: 0,
    losses: 0,
    peak: false,
    freeThemes: [],`,
`    wins: 0,
    losses: 0,
    peak: false,
    promoClaimed: 0,
    freeThemes: [],`);
  return s;
});

// panels.js：星数口径改成跨度后，阶梯表的"已离开=满星"逻辑仍然成立，无需改；只需把说明文案对齐
edit("src/ui/panels.js", (s) =>
  rep(s,
    `    <div class="panelNote">升段奖励只在首次跨过该段门槛时发一次；★ 达门槛 · ★★ 1.5× · ★★★ 2×</div>`,
    `    <div class="panelNote">升段奖励只在首次跨过该段门槛时发一次（掉段再升回来不补发）；
      ★ 进段 · ★★ 段内过半 · ★★★ 段内 85%</div>`));