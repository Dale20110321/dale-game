// 光照模型：把"场景里唯一的光源"推导成一个对象，供地形受光、背景地平线辉光、
// 后处理暖浸染共用。
//
// ★ 为什么必须集中在一处：以前这三处各写各的坐标 ——
//   地形硬编码"太阳从左上洒下"，背景把地平线辉光钉在 W*0.55，
//   后处理把暖浸染钉在 W*0.85。而 12 个场景里只有 冰川(0.16)、沼泽(0.20)、
//   月面(0.12) 的天体在左，其余 9 个都在右。于是同一个画面里
//   "地面的光从左边来、太阳却在右边" —— 这是画面"看着假"的头号来源。
//   玩家说不出哪里不对，只觉得不像照片。
//
// 数据源：bg.celestial 的 x/y 就是天体在天空中的位置（x 为 0~1 归一化，y 为屏幕 px），
// 天空其余图层与地面共用它。**不新增任何数据字段**，12 个场景零改动。
import { THEMES } from "../config/themes.js";
import { store } from "../core/store.js";
import { view } from "../core/canvas.js";
import { wrapX } from "../core/utils.js";

/** 没有 celestial 的场景兜底（与 THEMES 里多数场景的天体位置一致） */
const DEFAULT_CELESTIAL = { x: 0.85, y: 90 };

/**
 * 当前场景的光源状态。
 *
 * @returns {{x:number, y:number, side:number, color:string, isNight:boolean}}
 *   x  天体在**屏幕上的横坐标（px）**，与 background.js 画它的公式逐位相同：
 *      `wrapX(view.W * c.x - store.cam.x * c.parallax, view.W)`。
 *      ★ 早先这里直接返回归一化的 c.x、漏掉相机项，于是 5 个 parallax>0 的场景
 *        （月面 .06 / 火山 .04 / 冰川 .05 / 沼泽 .05 / 极夜星空 .05）镜头一远，
 *        "太阳画在左边、辉光和地面受光却按右边算" —— 正是本文件要消灭的那种
 *        自相矛盾，只是又换了个形式出现。最终任务里实测偏差可达 990px。
 *      所以消费方直接用这个屏幕坐标，**不要再乘 view.W**。
 *   y  天体的屏幕高度（px），本就是屏幕量纲
 *   side 光来自哪一侧：+1 = 自右向左照，-1 = 自左向右照
 *         ★ 取自**场景级** c.x 而非屏幕位置：背景的天体是会 wrap 的（它是
 *           可循环的远景图层），镜头走远它会周期性从一侧跳到另一侧。若 side
 *           跟着跳，坡面明暗会在关卡中途整个翻面 —— 那是比"光的方向偏了一点"
 *           更糟的观感。所以方向按场景固定，位置按画面跟随。
 *   color 天体主色（THEMES[i].sun），暖浸染与分级共用
 *   isNight 太阳落到画面中线以下 —— 日出/日落，暖光要拉长、压低
 *            （注意：12 个场景的 celestial.y 最大只有 110，所以目前恒为 false）
 */
export function getLight() {
  const T = THEMES[store.phys.theme] || THEMES[0];
  const c = (T.bg && T.bg.celestial) || DEFAULT_CELESTIAL;
  const nx = typeof c.x === "number" ? c.x : DEFAULT_CELESTIAL.x;
  const y = typeof c.y === "number" ? c.y : DEFAULT_CELESTIAL.y;
  const px = c.parallax || 0;
  return {
    x: wrapX(view.W * nx - store.cam.x * px, view.W),
    y,
    side: nx >= 0.5 ? 1 : -1,
    color: T.sun,
    isNight: y > 120,
  };
}

/**
 * 光源的屏幕坐标 —— 直接就是 `getLight()` 的 x/y（本来就是屏幕量纲）。
 * 保留这个别名是因为它明确表达了"这是屏幕坐标"，比调用方自己记着"x 已经是 px
 * 但 y 也是 px、别再乘 W"更不容易用错。
 */
export function lightScreenPos() {
  const L = getLight();
  return { x: L.x, y: L.y };
}
