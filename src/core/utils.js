// 通用小工具（无依赖叶子模块）

/** 数值钳制 */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 线性插值 */
export const lerp = (a, b, t) => a + (b - a) * t;

// ============================================================
//  大整数十进制序列化（金币存档专用）
//
//  ★ 为什么不能用 String()：
//    JS 的 String(1e21) 返回 "1e+21"，String(2.43e22) 返回 "2.426e+22"。
//    存档里出现指数记数法 = 任何把它当十进制数读的路径都会解析错，
//    本项目历史上已经因 parseInt/String 的组合丢过一次档。
//    宇宙级资产合计 2.43e22，**必然**越过这个阈值，所以这里是必需项而非优化。
//
//  ★ 为什么不用 toFixed(0)：
//    toFixed 在 ≥1e21 同样退化为指数记数法（规范规定如此）。
//    BigInt 展开对任意有限整数都给出完整十进制串，是唯一可靠的出口。
// ============================================================

/**
 * 数值 → 完整十进制字符串（永不出现指数记数法）。
 *
 * 非有限值（NaN / Infinity）与负数一律归零 —— 存档侧只应传非负有限整数，
 * 这里兜底是为了"宁可存 0 也不要存下一个读不回来的值"。
 *
 * @param {number} v 非负有限数
 * @returns {string} 十进制数字串，如 "24259999999999998951424"
 */
export function toPlainDecimal(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1) return "0";
  // Math.floor 去掉小数部分（余额本就是整数语义）
  const s = BigInt(Math.floor(n)).toString();
  return s;
}

/**
 * 十进制字符串 → 数值（读回金币）。
 *
 * ★ 精度说明：double 只能精确表示 <2^53（9.007e15）的每个整数。
 *   余额超过该量级后，末尾若干位会丢精度 —— 但金币语义上是"够/不够"，
 *   末位误差对任何游戏判定都无影响，故这里直接返回 Number。
 *   若将来需要精确的加减法，应在 store 层改用 BigInt 持有余额。
 *
 * @param {string|number|null} s 存档原文
 * @returns {number} 解析结果；非法输入返回 0
 */
export function fromPlainDecimal(s) {
  if (typeof s === "number") return Number.isFinite(s) ? s : 0;
  if (typeof s !== "string") return 0;
  const t = s.trim();
  // 只接受纯十进制数字（可选前导负号在这里显式拒绝：余额非负）
  if (!/^\d+$/.test(t)) {
    // 兼容历史：旧版本可能存下指数记数法（如 "1e+21"），这里补一次转换
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

// ============================================================
//  数字缩写（R11.3）
//
//  ★ 为什么需要：宇宙级资产合计 2.43e22，车价 1.5552e17，
//    一项 Lv500 升级费 ~6e15。`toLocaleString()` 会把它们铺成
//    16~23 位整数，卡片宽度根本放不下（升级车间与车库都会溢出）。
//    HUD 的速度表同样：满级无相 771,605 km/h 塞进 100px 的圆里会糊掉。
//
//  ★ 口径：< 1e4 用千分位（¥28,240 好读）；1e4~1e8 用「万/亿」
//    （中文语境下这两个单位最自然）；≥1e8 用科学计数（"3.4e18"）——
//    「万亿」在中文里是 1e12，而玩家要面对的是 1e24，再堆中文单位
//    会变成"24亿亿亿"，反而更读不懂。
// ============================================================

/**
 * 把大数缩写成可读形式。
 * @param {number} n 数值（非有限值原样返回）
 * @param {object} [o]
 * @param {boolean} [o.yuan] 前缀加 ¥
 * @returns {string}
 */
export function abbrevNum(n, o) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  const pre = o && o.yuan ? "¥" : "";
  const fixed = (x, d) => {
    const s = x.toFixed(d);
    // 去掉尾部无意义的 0（3.40 → 3.4）
    return s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s;
  };
  if (a < 1e4) return pre + sign + Math.round(a).toLocaleString("en-US");
  // 万/亿两档：**先选单位，再按该单位取整**，避免四舍五入跨过档位。
  //   99999999 直接 /1e4 得 9999.9999 → 取整成 10000，读起来像整整 1 亿（实际差一档）。
  //   所以 ≥1e7 换用「亿」，≥1e3 用「万」，只在不会跨档时才进位。
  if (a < 1e8) {
    const wan = a / 1e4;
    // wan < 9999.95 时取整仍是 4 位数，不会变成 10000
    return pre + sign + (wan < 10 ? fixed(wan, 2) : wan < 1000 ? fixed(wan, 1) : String(Math.floor(wan))) + "万";
  }
  if (a < 1e12) {
    const yi = a / 1e8;
    return pre + sign + (yi < 10 ? fixed(yi, 2) : yi < 1000 ? fixed(yi, 1) : String(Math.floor(yi))) + "亿";
  }
  // ≥1e12：科学计数，保留 3 位有效数字（3.4e18 而不是 3.42e18 —— 卡片里够读即可）
  let e = Math.floor(Math.log10(a));
  // 精度守卫：log10 在 1e12 附近可能算出 11.999…，导致 e 取小一档
  const mant = a / Math.pow(10, e);
  if (mant >= 9.9995) { e += 1; }
  return pre + sign + fixed(mant, 2) + "e" + e;
}

/**
 * 水平循环包裹：把世界 x 映射到 [0, m)。
 *
 * ★ 单一事实来源：背景层的天空天体（render/background.js）与光源模型
 *   （render/light.js）必须用**同一条**公式，否则"太阳画在左边、光却从右边来"。
 *   之前两处各写一份，light.js 漏掉了相机项，镜头一远两者就分家。
 */
export const wrapX = (v, m) => {
  const w = m || 1;
  return ((v % w) + w) % w;
};

/** 确定性伪随机（地形/金币相位用，保证同一关卡每次一致） */
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 为不支持 roundRect 的老浏览器补一个（Canvas API polyfill） */
export function installRoundRect() {
  if (typeof CanvasRenderingContext2D === "undefined") return;
  const P = CanvasRenderingContext2D.prototype;
  if (!P.roundRect) {
    P.roundRect = function (x, y, w, h, r) {
      r = Math.min(r || 0, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
    };
  }
}

/** 角度归一到 (-π, π] */
export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
