// 设置面板：画质三档（低 / 中 / 高）切换 + 声音开关
//  · 画质档位来自 render/postfx.js（QUALITY / setQuality），持久化到 dale_quality（非存档键）
//  · 打开时按当前档位刷新选项卡高亮；改动即时生效并 Toast 提示
import { store } from "../core/store.js";
import { getQuality, setQuality, QUALITY, QUALITY_LABEL } from "../render/postfx.js";
import { showToast } from "../core/toast.js";
import { save } from "../core/storage.js";

/** 各档位的用途说明（展示在面板里） */
const DESC = {
  low: "性能最优：干净画面，任何设备都能流畅跑",
  medium: "增强：装饰投影 · 天气粒子 · 轻色调",
  high: "光影真实：坡面明暗 · 自行车投影 · 大气雾 · 太阳浸染 · 速度拖影",
};

export function initSettings() {
  const panel = document.getElementById("settings");
  const btn = document.getElementById("btnSettings");
  if (btn) btn.addEventListener("click", openSettings);
  if (!panel) return;

  const close = document.getElementById("closeSettings");
  if (close) close.addEventListener("click", closeSettings);
  // Esc 关闭：绑在 window 上。原实现绑在 panel 子树，keydown 只有焦点落在面板内
  // 才会冒泡到这里 —— 鼠标点开设置后焦点仍留在触发按钮上，按 Esc 完全没反应。
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Escape" || panel.classList.contains("hidden")) return;
    e.preventDefault();
    closeSettings();
  });

  const tabs = document.getElementById("qualityTabs");
  if (tabs) {
    tabs.addEventListener("click", (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-q]") : null;
      if (!el) return;
      applyQuality(el.dataset.q);
    });
  }
  const mute = document.getElementById("btnMute");
  if (mute) mute.addEventListener("click", toggleMute);
}

export function openSettings() {
  renderQuality();
  renderMute();
  const panel = document.getElementById("settings");
  if (!panel) return;
  panel.classList.remove("hidden");
  focusIn(panel.querySelector("button:not([disabled])"));
}

export function closeSettings() {
  const panel = document.getElementById("settings");
  if (!panel) return;
  panel.classList.add("hidden");
  // 焦点交还给触发按钮，否则会掉到 body，方向键导航要从第 0 项重新开始
  focusIn(document.getElementById("btnSettings"));
}

/** 安全聚焦（部分环境不支持 preventScroll 选项） */
function focusIn(el) {
  if (!el || typeof el.focus !== "function") return;
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
}

function applyQuality(q) {
  if (!QUALITY.includes(q)) return;
  setQuality(q);
  renderQuality();
  showToast("🎚 画质已切到「" + QUALITY_LABEL[q] + "」", 800);
}

function renderQuality() {
  const q = getQuality();
  document.querySelectorAll("#qualityTabs .tab").forEach((b) => {
    const on = b.dataset.q === q;
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  const d = document.getElementById("qDesc");
  if (d) d.textContent = DESC[q] || "";
}

function toggleMute() {
  store.muted = !store.muted;
  try { save(); } catch (e) { /* 存储不可用时静默 */ }
  renderMute();
  showToast(store.muted ? "🔇 已静音" : "🔊 声音已开启", 700);
}

function renderMute() {
  const m = document.getElementById("btnMute");
  if (m) m.textContent = store.muted ? "🔇 已静音" : "🔊 声音开启";
}