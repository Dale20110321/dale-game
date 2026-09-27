// 画布与视口（唯一持有 canvas / ctx / 尺寸的地方）
export const cv = document.getElementById("cv");
export const ctx = cv.getContext("2d");

/** 视口尺寸（CSS px）与设备像素比 */
export const view = { W: 0, H: 0, DPR: 1 };

/** 适配窗口尺寸与 DPR（最多 2x，避免高分屏浪费性能） */
export function resize() {
  view.W = window.innerWidth;
  view.H = window.innerHeight;
  // 高分屏 DPR 上限：canvas 像素数 = W×H×DPR²，窄窗拉到 2 会让光栅化/合成开销翻倍
  // （卡顿的来源之一）；窄屏/矮屏收到 1.6，视觉几乎无差，常规屏仍保持 2。
  view.DPR = Math.min(window.devicePixelRatio || 1, view.W < 700 || view.H < 480 ? 1.6 : 2);
  cv.width = view.W * view.DPR;
  cv.height = view.H * view.DPR;
  cv.style.width = view.W + "px";
  cv.style.height = view.H + "px";
  ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
}
