// 画布与视口（唯一持有 canvas / ctx / 尺寸的地方）
export const cv = document.getElementById("cv");
export const ctx = cv.getContext("2d");

/** 视口尺寸（CSS px）、设备像素比、渲染倍率 */
export const view = { W: 0, H: 0, DPR: 1, RS: 1, k: 1 };

/**
 * 渲染倍率档（画面锐度）。
 *
 * ★ 为什么它必须**独立于画质档**（render/postfx.js 的 低/中/高）：
 *   画质档控制的是"画多少东西"（阴影、雾、辉光、粒子），这些是 CPU/填充率开销；
 *   渲染倍率控制的是"画在多少像素上"，直接决定清晰度与光栅化开销。
 *   两者是**正交**的旋钮：想要"低画质但依然锐利"或"高画质但跑得动"，
 *   绑在一起就都做不到。0.75x 只有 56% 的像素（低端机保帧率的关键杠杆），
 *   1.25x 有 156% 像素（高分屏 / 4K 上明显更锐利）。
 */
export const RENDER_SCALES = [0.75, 1, 1.25];
export const RENDER_SCALE_LABEL = { 0.75: "省电", 1: "标准", 1.25: "锐利" };

/**
 * 设置渲染倍率并立即重建画布。
 * 只接受 RENDER_SCALES 里的档位（避免手改存档存进 0.37 这种值把画面拉花）。
 */
export function setRenderScale(s) {
  const v = Number(s);
  const hit = RENDER_SCALES.find((x) => Math.abs(x - v) < 0.01);
  view.RS = hit || 1;
  resize();
  return view.RS;
}

/** 适配窗口尺寸 / DPR / 渲染倍率 */
export function resize() {
  view.W = window.innerWidth;
  view.H = window.innerHeight;
  // 高分屏 DPR 上限：canvas 像素数 = W×H×DPR²，窄窗拉到 2 会让光栅化/合成开销翻倍
  // （卡顿的来源之一）；窄屏/矮屏收到 1.6，视觉几乎无差，常规屏仍保持 2。
  view.DPR = Math.min(window.devicePixelRatio || 1, view.W < 700 || view.H < 480 ? 1.6 : 2);
  // 最终光栅化比例 = DPR × 渲染倍率。绘制坐标始终是 CSS px（view.W/H），
  // 只有 backing store 与 setTransform 吃这个系数，**渲染层代码对此无感**。
  const k = view.DPR * view.RS;
  view.k = k;
  cv.width = Math.max(1, Math.round(view.W * k));
  cv.height = Math.max(1, Math.round(view.H * k));
  cv.style.width = view.W + "px";
  cv.style.height = view.H + "px";
  ctx.setTransform(k, 0, 0, k, 0, 0);
}
