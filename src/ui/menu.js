// 主菜单 / 暂停 / 面板容器
import { store } from "../core/store.js";
import { LEVELS } from "../config/levels.js";
import { rankName } from "../config/constants.js";
import { isStorageAvailable } from "../core/storage.js";

const overlay = document.getElementById("overlay");
const ovTitle = document.getElementById("ovTitle");
const ovSub = document.getElementById("ovSub");
const ovKeys = document.getElementById("ovKeys");
const menuBtns = document.querySelector(".menuBtns");
const modePanel = document.getElementById("modePanel");

// "继续"按钮（暂停时显示）
const resumeBtn = document.createElement("button");
resumeBtn.className = "btn";
resumeBtn.id = "btnResume";
resumeBtn.textContent = "▶ 继续";
resumeBtn.style.display = "none";
if (overlay && menuBtns) overlay.insertBefore(resumeBtn, menuBtns);
resumeBtn.addEventListener("click", () => {
  if (store.state === "pause") togglePause();
});

/** 已通关关卡数（星级 ≥ 1）——阶梯入口的显示依据 */
function clearedCount() {
  let n = 0;
  for (let i = 0; i < LEVELS.length; i++) if ((store.stars[i] || 0) >= 1) n++;
  return n;
}

/**
 * 按存档状态刷新主菜单按钮（锁定状态直接写在按钮文案上，不需要进面板才知道）。
 * 由 initPanels（首次装配）与存档导入 / 重置后调用。
 */
export function refreshMenuButtons() {
  const total = LEVELS.length;
  const done = clearedCount();
  const P = store.progress || {};

  const btnFinale = document.getElementById("btnFinale");
  if (btnFinale) {
    const unlocked = done >= total;
    btnFinale.textContent = unlocked
      ? (P.finaleDone ? "🎯 最终任务 ✅" : "🎯 最终任务")
      : "🎯 最终任务 · 未解锁";
    btnFinale.classList.toggle("lockedBtn", !unlocked);
  }

  const btnRanked = document.getElementById("btnRanked");
  if (btnRanked) {
    const rating = P.rating || 0;
    btnRanked.textContent = P.invited === true
      ? "🏆 排位赛 · " + rankName(rating) + " " + rating
      : "🏆 排位赛 · 未解锁";
    btnRanked.classList.toggle("lockedBtn", P.invited !== true);
  }

  const btnFree = document.getElementById("btnFree");
  if (btnFree) {
    btnFree.textContent = P.peak === true ? "♾️ 无限模式 · 可选图" : "♾️ 无限模式";
  }

  const btnSave = document.getElementById("btnSave");
  if (btnSave) {
    btnSave.textContent = isStorageAvailable() ? "💾 存档" : "💾 存档（不可用）";
  }
}

export function setMenuChrome() {
  ovTitle.textContent = "🚲 越野自行车";
  ovSub.textContent = "物理引擎越野：支线任务 · 最终任务 · 排位赛 · 无限模式";
  ovKeys.textContent =
    "→/D 加速(空中顺时针转)  ←/A 刹车(空中逆时针转)  P/Esc 暂停  R 重开  M 静音";
  menuBtns.style.display = "flex";
  resumeBtn.style.display = "none";
  refreshMenuButtons();
}

export function hideOverlay() {
  overlay.classList.add("hidden");
}

export function showPanel(html) {
  modePanel.innerHTML = html;
  modePanel.classList.remove("hidden");
}

export function hidePanel() {
  modePanel.classList.add("hidden");
  modePanel.innerHTML = "";
}

/** 回到主菜单（结算 / 无限模式结束 / 面板返回） */
export function showMenu() {
  store.state = "menu";
  store.raceAI = null;
  hidePanel();
  setMenuChrome();
  overlay.classList.remove("hidden");
}

export function togglePause() {
  if (store.state === "play") {
    store.state = "pause";
    ovTitle.textContent = "⏸ 已暂停";
    ovSub.textContent = "休息一下，随时继续（R 重开 / P 继续）";
    ovKeys.textContent = "";
    menuBtns.style.display = "none";
    resumeBtn.style.display = "block";
    overlay.classList.remove("hidden");
  } else if (store.state === "pause") {
    store.state = "play";
    overlay.classList.add("hidden");
  }
}
