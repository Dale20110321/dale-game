// 一次性脚本：段位阶梯收尾修正
//  1) 段位名「奇点」与终局车「奇点」重名 → 改名「凌驾」
//  2) rankStars 改成"段内跨度"口径（原先 1.5×/2× 门槛会跨进下一段，导致多数段位拿不到 3★）
//  3) 升段奖励加 promoClaimed 记忆位：降段再升回来不重复发（兑现注释里写的那条承诺）
const fs = require("fs");
function edit(p, fn) {
  const raw = fs.readFileSync(p, "utf8");
  const crlf = raw.indexOf("\r\n") >= 0;
  let s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (typeof out !== "string") throw new Error(p + ": fn 未返回字符串");
  fs.writeFileSync(p, crlf ? out.replace(/\n/g, "\r\n") : out);
  console.log("patched", p);
}
const rep = (s, a, b) => {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error(`count=${n}: ${a.slice(0, 70)}`);
  return s.replace(a, b);
};

// ---------------- constants.js ----------------
edit("src/config/constants.js", (s) => {
  // 1) 段位名去重
  s = rep(s, `  { min: 10200, name: "奇点", reward: 100000 },`,
    `  { min: 10200, name: "凌驾", reward: 100000 },`);

  // 段位名不得与车辆名重复（用户明确要求）——写在表头注释里，避免以后加车时又撞上
  s = rep(s,
` * 每段 3 星：★ = 达门槛，★★ = 1.5× 门槛，★★★ = 2× 门槛（青铜恒为 0 星）。`,
` * 每段 3 星：★ = 进段，★★ = 段内过半，★★★ = 段内 85%（青铜恒为 0 星）。
 *   ★ 星数按**段内跨度**（下一段门槛 − 本段门槛）算，不按本段门槛的倍数算：
 *     门槛倍数口径在 14 段表里大多数段位根本够不到 3★（1.5× 门槛会先跨进下一段），
 *     等于把 3★ 设成不可达。跨度口径保证每一段的 3★ 都能拿到，"还差一格"始终可见。
 *
 * ★ 段位名**不得与车辆名重复**（「奇点」曾是段位名，也是一台车的名字，玩家会分不清）。`);

  // 2) rankStars：段内跨度口径
  s = rep(s,
`/**
 * 段位星数（0~3）：门槛 1★、1.5× 门槛 2★、2× 门槛 3★（青铜恒为 0 星）。
 * ★ 用**当前所在段位**的门槛来算，而不是全局某一段 —— 升段后星数自然从 1★ 重算，
 *   玩家每次升段都能看到"这格还没点满"，有继续往上打的动机。
 */
export function rankStars(rating) {
  const r = RANKS[rankIndexOf(rating)];
  if (!r || r.min <= 0) return 0;
  const v = Math.max(0, Number(rating) || 0);
  if (v >= r.min * 2) return 3;
  if (v >= r.min * 1.5) return 2;
  if (v >= r.min) return 1;
  return 0;
}`,
`/**
 * 某一段的"段内跨度"：下一段门槛 − 本段门槛。
 * 末段（超越）没有下一段，用自身的 1/5 当跨度，保证它的 3★ 同样可达。
 */
export function rankSpanOf(index) {
  const r = RANKS[index];
  if (!r) return 0;
  const nx = RANKS[index + 1];
  return nx ? nx.min - r.min : Math.max(1, Math.round(r.min * 0.2));
}

/**
 * 段位星数（0~3）：进段 1★ / 段内过半 2★ / 段内 85% 3★（青铜恒为 0 星）。
 * ★ 用**当前所在段位的跨度**来算，而不是本段门槛的倍数 —— 倍数口径在 14 段表里
 *   大多数段位根本到不了 3★（1.5× 门槛会先跨进下一段，星数被"吃掉"）。
 *   跨度口径保证每段的 3★ 都拿得到，升段后星数从 1★ 重新起算，"还差一格"始终可见。
 */
export function rankStars(rating) {
  const i = rankIndexOf(rating);
  const r = RANKS[i];
  if (!r || r.min <= 0) return 0;
  const span = rankSpanOf(i);
  const t = (Math.max(0, Number(rating) || 0) - r.min) / span;
  if (t >= 0.85) return 3;
  if (t >= 0.5) return 2;
  return 1;
}`);

  // 3) 升段奖励加"已领取水位"记忆
  s = rep(s,
`/**
 * 升段一次性奖励：from → to 期间**新跨过**的那些段位之和（纯函数，不写状态）。
 * 降段再升回来不会重复发 —— 因为只在"首次跨过"时结算（见 game.js 的 settleRanked）。
 */
export function rankPromoReward(from, to) {
  const a = Math.max(0, Number(from) || 0);
  const b = Math.max(0, Number(to) || 0);
  if (b <= a) return 0;
  let sum = 0;
  for (const r of RANKS) if (r.min > a && r.min <= b) sum += r.reward || 0;
  return sum;
}`,
`/**
 * 升段一次性奖励：from → to 期间**新跨过、且此前从未领取过**的那些段位之和（纯函数，不写状态）。
 *
 * @param {number} from 本局开始前的段位分
 * @param {number} to 本局结束后的段位分
 * @param {number} [claimed] 历史已发到哪一档（progress.promoClaimed，只增不减）
 *
 * ★ 为什么必须带 claimed：只看 from → to 的话，"钻石掉回铂金、再赢回钻石"会二次发钱，
 *   等于奖励可以反复刷。claimed 是一条只涨的水位线，跨过的段位一旦结算就永久作废。
 *   老存档没有这个字段时按 0 处理，等于"之前都没领过"，下一次跨段会一次性补齐。
 */
export function rankPromoReward(from, to, claimed) {
  const a = Math.max(0, Number(from) || 0);
  const b = Math.max(0, Number(to) || 0);
  if (b <= a) return 0;
  const floorV = Math.max(a, Math.max(0, Number(claimed) || 0));
  if (b <= floorV) return 0;
  let sum = 0;
  for (const r of RANKS) if (r.min > floorV && r.min <= b) sum += r.reward || 0;
  return sum;
}`);
  return s;
});

// ---------------- game.js ----------------
edit("src/game/game.js", (s) => {
  s = rep(s,
`  // 升段一次性奖励：让比赛阶段是"在爬 14 段阶梯"，而不是"重复同一场排位"
  const promo = rankPromoReward(before, P.rating);
  if (promo > 0) {
    addGold(promo);
  }`,
`  // 升段一次性奖励：让比赛阶段是"在爬 14 段阶梯"，而不是"重复同一场排位"。
  // promoClaimed 是只涨的水位线 —— 掉段再升回同一段位不会二次领钱（否则奖励可以反复刷）。
  const claimed = P.promoClaimed || 0;
  const promo = rankPromoReward(before, P.rating, claimed);
  if (promo > 0) addGold(promo);
  if (P.rating > claimed) P.promoClaimed = P.rating;`);
  return s;
});