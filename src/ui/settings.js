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
  // Esc 关闭
  panel.addEventListener("keydown", (e) => {
    if (e.code === "Escape") closeSettings();
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
  if (panel) panel.classList.remove("hidden");
}

export function closeSettings() {
  const panel = document.getElementById("settings");
  if (panel) panel.classList.add("hidden");
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