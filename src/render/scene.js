// 场景绘制总装：背景 → 世界（缩放/震屏）→ HUD
import { ctx } from "../core/canvas.js";
import { store } from "../core/store.js";
import { drawBackground } from "./background.js";
import { drawTerrain } from "./terrain.js";
import { drawBoosts, drawCanisters, drawCoins, drawDeco, drawFlag, drawGates, drawHazards, drawJumps, drawObstacles } from "./entities.js";
import { drawParticles } from "./particles.js";
import { drawBike } from "./bike.js";
import { shakeOffset } from "./camera.js";
import { drawHud } from "./hud.js";
import { applyPostFx } from "./postfx.js";

export function drawScene() {
  const cam = store.cam;
  drawBackground(cam.x, cam.y);

  const off = shakeOffset();
  const bcx = cam.x;
  const bcy = cam.y;
  cam.x += off.x;
  cam.y += off.y;

  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  drawParticles(cam.x, cam.y);
  drawDeco(cam.x, cam.y);
  drawTerrain(cam.x, cam.y);
  drawHazards(cam.x, cam.y);
  drawJumps(cam.x, cam.y);
  drawGates(cam.x, cam.y);
  drawObstacles(cam.x, cam.y);
  drawBoosts(cam.x, cam.y);
  drawCoins(cam.x, cam.y);
  drawCanisters(cam.x, cam.y);
  drawFlag(cam.x, cam.y, store.finishX);
  if (store.state === "play" || store.state === "ended" || store.state === "pause") drawBike();
  ctx.restore();

  cam.x = bcx;
  cam.y = bcy;

  // 后处理（渐晕 / 色彩分级 / 拖影 / 远景淡化 / 天气）
  // 放在 HUD 之前：HUD 是界面层叠加，不应被色彩分级与渐晕干扰（也保证机制警告不被遮挡）
  applyPostFx(store.time);

  if (store.state === "play" || store.state === "pause" || store.state === "ended") {
    drawHud();
  }
}
