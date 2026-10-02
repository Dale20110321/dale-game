// 输入：键盘 / 触摸 / 全屏 / 缩放 / 静音
// 只负责"读输入"，游戏动作（重开、暂停、车间）通过 initInput(handlers) 注入，避免循环依赖。
import { store, bike } from "./store.js";
import { clamp } from "./utils.js";
import { initAudio } from "./audio.js";
import { showToast } from "./toast.js";
import { save } from "./storage.js";

/** 左右键状态（加速 / 刹车；空中为转体）+ 倒挡 */
export const key = { left: false, right: false, rev: false };

/** 用户是否希望显示触摸方向键（🎮 手动开关的持久状态，与设备无关） */
let touchWanted = false;

/**
 * 是否有模态面板正开着 —— 它才是 Esc 的归属方。
 * 设置 / 车间 / 打赏都是叠在画面上的浮层，各自已经绑了 Esc 关闭。
 *
 * ★ 为什么必须让位：这些面板的 Esc 处理只调了 preventDefault()，没有阻断冒泡，
 *   而下面的暂停分支也会看到同一个 keydown。玩家在**暂停中**点开设置（.menuFoot
 *   在 pause 下仍可见可点）后按一次 Esc，实测会同时关掉面板**并把游戏恢复成 play** ——
 *   人还在看设置，车已经在跑了。
 */
export function modalOpen() {
  return ["settings", "shop", "donate"].some((id) => {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains("hidden");
  });
}

/**
 * 捕获阶段标记"这次 Esc 归模态面板"。
 *
 * ★ 必须在捕获阶段取样：面板自己的处理器跑在冒泡阶段并且**第一件事就是把它 hidden 掉**，
 *   等冒泡到下面那个暂停分支时 modalOpen() 已经是 false 了 —— 直接在暂停分支里查会漏。
 *   捕获阶段先于所有冒泡处理器，此时面板还开着，取样才准。
 */
let escForModal = false;
window.addEventListener(
  "keydown",
  (e) => {
    if (e.code === "Escape" && modalOpen()) escForModal = true;
  },
  true
);

/**
 * 触摸方向键当前是否生效（触摸设备 且 在游戏中）。
 * 以活绑定导出：HUD 布局（render/hud.js）据此把速度表从右下角让开，
 * 否则会被油门键整个盖住。改这里不用动 hud.js。
 */
export let touchActive = false;

/**
 * 触摸方向键的可见性 = 用户开关 × 是否在游戏中。
 * 菜单 / 结算 / 面板里不该出现操作键：既无意义，又会在主页面挡住底部图标栏。
 * 由 menu.js 在 hideOverlay / showMenu 时调用。
 */
export function syncTouchVisibility() {
  const el = document.getElementById("touch");
  if (!el) return;
  const playing = store.state === "play" || store.state === "pause";
  touchActive = !!(touchWanted && playing);
  el.classList.toggle("hidden", !touchActive);
}

function bind(e, down) {
  const k = (e.key || "").toLowerCase();
  let c = null;
  if (e.code === "ArrowRight" || e.key === "ArrowRight" || k === "d") c = "right";
  else if (e.code === "ArrowLeft" || e.key === "ArrowLeft" || k === "a") c = "left";
  else if (e.code === "ArrowDown" || e.key === "ArrowDown" || k === "s") c = "rev";
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
      // ★ 改的是 zoomBase（用户基准），不是 zoom。
      //   zoom 每帧都会被速度自适应覆盖（render/camera.js 的 camZoomOf），
      //   直接写它的话按键会被立刻抹掉，看起来就是"+/- 没反应"。
      const z = clamp(store.cam.zoomBase + (e.code === "Equal" ? 0.15 : -0.15), 0.6, 2.5);
      if (z !== store.cam.zoomBase) {
        store.cam.zoomBase = z;
        showToast("缩放基准 " + Math.round(z * 100) + "%", 600);
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

    // 这次 Esc 已被模态面板认领：它会自己关面板，这里既不暂停也不恢复。
    // 标记在捕获阶段置位、在本处理器开头消费（同一个事件只会走到这里一次）。
    if (escForModal) {
      escForModal = false;
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
    key.rev = false;
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
