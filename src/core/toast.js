// 屏幕文字提示（纯 DOM 工具，无任何游戏逻辑依赖，避免层级倒挂）
const toastEl = document.getElementById("toast");
const comboEl = document.getElementById("comboTag");
let comboTimer = null;

/** 居中大字提示 */
export function showToast(txt, ms) {
  if (!toastEl) return;
  toastEl.textContent = txt;
  toastEl.style.opacity = 1;
  toastEl.style.transition = "none";
  setTimeout(() => {
    toastEl.style.transition = "opacity .4s";
    toastEl.style.opacity = 0;
  }, ms || 900);
}

/** 特技连招提示 */
export function showCombo(txt) {
  if (!comboEl) return;
  comboEl.textContent = txt;
  comboEl.style.opacity = 1;
  comboEl.style.transform = "translate(-50%,-50%) scale(1)";
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => {
    comboEl.style.opacity = 0;
    comboEl.style.transform = "translate(-50%,-50%) scale(1.35)";
  }, 1400);
}
