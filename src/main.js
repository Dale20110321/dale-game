// ============================================================
//  入口：装配全部模块 + 启动固定步长主循环
//  分层（单向依赖，无循环）：
//    config/*  core/*  →  physics/*  →  game/*  →  render/*  →  ui/*  →  main.js
//  共享可变状态全部放在 core/store.js；界面动作通过 initGame(presenter) 注入，
//  因此 game/ 永不 import ui/，彻底避免循环依赖。
// ============================================================
import { installRoundRect } from "./core/utils.js";
import { resize } from "./core/canvas.js";
import { START_X } from "./config/constants.js";
import { initInput } from "./core/input.js";
import { loadAchList, loadSave } from "./core/storage.js";
import { Stepper, startRaf } from "./core/loop.js";
import { initGame, restart, startGame, update } from "./game/game.js";
import { applyUpgrades, resetBike } from "./physics/bike.js";
import { buildLevel } from "./game/world.js";
import { updateCamera } from "./render/camera.js";
import { drawScene } from "./render/scene.js";
import { hideOverlay, showMenu, togglePause } from "./ui/menu.js";
import { initPanels } from "./ui/panels.js";
import { initShop, toggleShop } from "./ui/shop.js";
import { initDonate } from "./ui/donate.js";

installRoundRect();
resize();
window.addEventListener("resize", resize);

// 读档（localStorage 键名与历史版本一致，老存档不丢）
loadSave();
loadAchList();

// 装配：游戏逻辑 ←→ 界面（单向注入）
initGame({ hideOverlay, toMenu: showMenu });
initPanels({ startGame, applyVehicle: applyUpgrades });
initShop();
initDonate();
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
  drawScene();
});

export { stepper, startGame, restart };
