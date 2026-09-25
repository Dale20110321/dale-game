// 主菜单 / 暂停 / 面板容器
import { store } from "../core/store.js";
import { initAudio } from "../core/audio.js";
import { startGame } from "../game/game.js";

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

export function setMenuChrome() {
  ovTitle.textContent = "🚲 越野自行车";
  ovSub.textContent = "物理引擎越野：闯关 · 比赛 · 特技 · 燃料 · 多主题";
  ovKeys.textContent =
    "→/D 加速(空中顺时针转)  ←/A 刹车(空中逆时针转)  P/Esc 暂停  R 重开  M 静音";
  menuBtns.style.display = "flex";
  resumeBtn.style.display = "none";
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

/** 自由模式入口 */
const btnFree = document.getElementById("btnFree");
if (btnFree) {
  btnFree.addEventListener("click", () => {
    initAudio();
    startGame("free");
  });
}
