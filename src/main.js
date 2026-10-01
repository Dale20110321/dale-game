// ============================================================
//  入口：装配全部模块 + 启动固定步长主循环
//  分层（单向依赖，无循环）：
//    config/*  core/*  →  physics/*  →  game/*  →  render/*  →  ui/*  →  main.js
//  共享可变状态全部放在 core/store.js；界面动作通过 initGame(presenter) 注入，
//  因此 game/ 永不 import ui/，彻底避免循环依赖。
// ============================================================

/**
 * 启动标志：**必须**是本模块的第一条语句。
 *
 * index.html 同时挂了两个入口：dist/game.bundle.js（普通 script，发布用，也是
 * file:// 双击唯一能跑的那个）与本模块（仅作兜底）。本模块既可能被 bundle 内联执行、
 * 也可能被 index.html 直接 import，两条路都执行 = 整个游戏初始化两遍（两套 store、
 * 两条主循环，却共用同一个 DOM 与同一份 localStorage），所有交互都会触发两次。
 * index.html 的兜底逻辑据此判断：标志已置 → 打包入口已经启动，跳过。
 */
if (typeof window !== "undefined") window.__daleBooted = true;

import { installRoundRect } from "./core/utils.js";
import { resize } from "./core/canvas.js";
import { START_X } from "./config/constants.js";
import { initInput } from "./core/input.js";
import { initAutoSave, isStorageAvailable, loadAchList, loadProgress, loadSave } from "./core/storage.js";
import { showToast } from "./core/toast.js";
import { Stepper, startRaf } from "./core/loop.js";
import { initGame, restart, startGame, update } from "./game/game.js";
import { applyUpgrades, resetBike } from "./physics/bike.js";
import { buildLevel } from "./game/world.js";
import { updateCamera } from "./render/camera.js";
import { drawScene } from "./render/scene.js";
import { initPostFx } from "./render/postfx.js";
import { hideOverlay, showMenu, togglePause, showResultCard } from "./ui/menu.js";
import { initPanels } from "./ui/panels.js";
import { initShop, toggleShop } from "./ui/shop.js";
import { initDonate } from "./ui/donate.js";
import { initSettings } from "./ui/settings.js";

installRoundRect();
resize();
window.addEventListener("resize", resize);

// 读档（localStorage 键名与历史版本一致，老存档不丢）
loadSave();
loadAchList();
loadProgress();
// 自动保存接线：探测存储可用性 + 每 30s 兜底写盘 + 切后台写盘（Task 9.6）
initAutoSave();
// 后处理接线（Task 7）：读持久化画质档位（缺省时按设备给默认档）
initPostFx();
// 降级提示（非阻塞，只提示一次）：localStorage 被禁用 / 配额满时告知无法保存
if (!isStorageAvailable()) showToast("⚠️ 本次无法保存进度（浏览器存储不可用）", 2400);

// 装配：游戏逻辑 ←→ 界面（单向注入）
initGame({ hideOverlay, toMenu: showMenu, presentResult: showResultCard });
initPanels({ startGame, applyVehicle: applyUpgrades });
initShop();
initDonate();
initSettings();
initInput({ restart, togglePause, toggleShop });

// 首屏：构建第 1 关地形作为菜单背景
buildLevel(0);
applyUpgrades();
resetBike(START_X);

// 固定 1/60 秒步长：物理 / 燃料 / 计时 / AI 全部与刷新率无关
const stepper = new Stepper((dt) => {
  update(dt);
  updateCamera(dt);
});
startRaf((dt) => {
  stepper.advance(dt);
  drawScene(dt); // dt 必须传下去：渲染层的逐帧累加量（天气、踏频）依赖它
});

export { stepper, startGame, restart };
