// 场景绘制总装：背景 → 世界（缩放/震屏）→ HUD
import { ctx, view } from "../core/canvas.js";
import { store } from "../core/store.js";
import { drawBackground } from "./background.js";
import { drawTerrain } from "./terrain.js";
import { drawBoosts, drawCanisters, drawCoins, drawDeco, drawFlag, drawGates, drawHazards, drawJumps, drawObstacles } from "./entities.js";
import { drawParticles } from "./particles.js";
import { drawBike } from "./bike.js";
import { shakeOffset } from "./camera.js";
import { drawBalanceBar, drawDriveIndicator, drawRaceHUD, drawSpeedLines, syncHudDom } from "./hud.js";

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

  if (store.state === "play") {
    drawBalanceBar();
    drawDriveIndicator();
    drawSpeedLines();
    drawRaceHUD();
  }

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("缩放 " + Math.round(cam.zoom * 100) + "%  ·  R重启  ·  +/-缩放  ·  P暂停", view.W - 12, view.H - 12);
  ctx.textAlign = "left";

  syncHudDom();
}
