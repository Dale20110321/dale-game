// 输入：键盘 / 触摸 / 全屏 / 缩放 / 静音
// 只负责"读输入"，游戏动作（重开、暂停、车间）通过 initInput(handlers) 注入，避免循环依赖。
import { store, bike } from "./store.js";
import { clamp } from "./utils.js";
import { initAudio } from "./audio.js";
import { showToast } from "./toast.js";
import { save } from "./storage.js";

/** 左右键状态（加速 / 刹车；空中为转体） */
export const key = { left: false, right: false };

/** 用户是否希望显示触摸方向键（🎮 手动开关的持久状态，与设备无关） */
let touchWanted = false;

/**
 * 触摸方向键的可见性 = 用户开关 × 是否在游戏中。
 * 菜单 / 结算 / 面板里不该出现操作键：既无意义，又会在主页面挡住底部图标栏。
 * 由 menu.js 在 hideOverlay / showMenu 时调用。
 */
export function syncTouchVisibility() {
  const el = document.getElementById("touch");
  if (!el) return;
  const playing = store.state === "play" || store.state === "pause";
  el.classList.toggle("hidden", !(touchWanted && playing));
}

function bind(e, down) {
  const k = (e.key || "").toLowerCase();
  let c = null;
  if (e.code === "ArrowRight" || e.key === "ArrowRight" || k === "d") c = "right";
  else if (e.code === "ArrowLeft" || e.key === "ArrowLeft" || k === "a") c = "left";
  if (c) key[c] = down;
}

/** 绑定全部输入。handlers = { restart, togglePause, toggleShop } */
export function initInput(handlers = {}) {
  const H = handlers;

  window.addEventListener("keydown", (e) => {
    initAudio();
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") e.preventDefault();

    const st = store.state;

    if (e.code === "Minus" || e.code === "Equal") {
      e.preventDefault();
      const z = clamp(store.cam.zoom + (e.code === "Equal" ? 0.15 : -0.15), 0.6, 2.5);
      if (z !== store.cam.zoom) {
        store.cam.zoom = z;
        showToast("缩放 " + Math.round(store.cam.zoom * 100) + "%", 600);
      }
      return;
    }

    if (e.code === "KeyR" && (st === "play" || st === "pause" || st === "ended")) {
      e.preventDefault();
      if (H.restart) H.restart();
      showToast("🔄 重新开始", 500);
      return;
    }

    if (e.code === "KeyU") {
      e.preventDefault();
      if (H.toggleShop) H.toggleShop();
      return;
    }

    if (e.code === "KeyM") {
      e.preventDefault();
      store.muted = !store.muted;
      save();
      showToast(store.muted ? "🔇 已静音" : "🔊 声音开启", 600);
      return;
    }

    if ((e.code === "Escape" || e.code === "KeyP") && (st === "play" || st === "pause")) {
      e.preventDefault();
      if (H.togglePause) H.togglePause();
      return;
    }

    bind(e, true);
  });

  window.addEventListener("keyup", (e) => bind(e, false));
  window.addEventListener("blur", () => {
    key.left = false;
    key.right = false;
    bike.angVel = 0;
  });

  // ---------------- 触摸控制 ----------------
  const touchEl = document.getElementById("touch");
  const touchBtn = document.getElementById("touchBtn");
  // 判定用 (pointer: coarse) 而不是 "ontouchstart" in window —— 触屏笔记本两者都成立，
  // 会让桌面端凭空冒出左右方向键。pointer: coarse 才代表"主输入就是手指"。
  let isTouch = false;
  try {
    isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
      || ("ontouchstart" in window && (navigator.maxTouchPoints || 0) > 1);
  } catch (e) {
    isTouch = "ontouchstart" in window;
  }
  // 用户手动开关（🎮）与"是否在游戏中"共同决定可见性：菜单/面板里出现操作键
  // 既无意义又挡住视线，此前只看 isTouch，导致桌面端和菜单界面全程常驻。
  touchWanted = isTouch;
  syncTouchVisibility();
  if (touchBtn) {
    touchBtn.classList.toggle("on", touchWanted);
    touchBtn.addEventListener("click", () => {
      touchWanted = !touchWanted;
      touchBtn.classList.toggle("on", touchWanted);
      syncTouchVisibility();
    });
  }

  document.querySelectorAll(".tbtn[data-k]").forEach((b) => {
    const k = b.dataset.k;
    const on = (ev) => {
      ev.preventDefault();
      key[k] = true;
    };
    const off = (ev) => {
      ev.preventDefault();
      key[k] = false;
    };
    b.addEventListener("touchstart", on, { passive: false });
    b.addEventListener("touchend", off, { passive: false });
    b.addEventListener("touchcancel", off, { passive: false });
    b.addEventListener("mousedown", on);
    b.addEventListener("mouseup", off);
    b.addEventListener("mouseleave", off);
  });

  // ---------------- 全屏 ----------------
  const fullBtn = document.getElementById("fullBtn");
  if (fullBtn) {
    fullBtn.addEventListener("click", () => {
      const d = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (d.requestFullscreen) {
        d.requestFullscreen();
      } else if (d.webkitRequestFullscreen) {
        d.webkitRequestFullscreen();
      }
    });
  }
}
