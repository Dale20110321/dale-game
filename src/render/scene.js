// 场景绘制总装：背景 → 世界（缩放/震屏）→ HUD
import { ctx } from "../core/canvas.js";
import { store, bike } from "../core/store.js";
import { token } from "../config/ui-tokens.js";
import { clamp } from "../core/utils.js";
import { groundInfo } from "../physics/terrain.js";
import { getQuality } from "./postfx.js";
import { drawBackground } from "./background.js";
import { drawTerrain } from "./terrain.js";
import { drawBoosts, drawCanisters, drawCoins, drawDeco, drawFlag, drawGates, drawHazards, drawJumps } from "./entities.js";
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
  drawBoosts(cam.x, cam.y);
  drawCoins(cam.x, cam.y);
  drawCanisters(cam.x, cam.y);
  drawFlag(cam.x, cam.y, store.finishX);
  drawBikeShadow();
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

/**
 * 高画质：自行车的真实地面投影。
 * 贴地时短粗、高速时朝前拉长、腾空越高越淡（甚至消失）——在世界层（缩放已生效）绘制。
 */
function drawBikeShadow() {
  if (getQuality() !== "high") return;
  const mx = (bike.rear.x + bike.front.x) / 2;
  const g = groundInfo(mx);
  if (!isFinite(g.y)) return;
  const airFade = bike.grounded === 0
    ? clamp(1 - Math.abs(bike.rear.y - g.y) / 90, 0, 1)
    : 1;
  if (airFade <= 0.05) return;
  const cam = store.cam;
  const spdN = clamp(Math.abs(bike.speed) / 320, 0, 1);
  const x = mx - cam.x;
  const y = g.y - cam.y + 4;
  const len = 22 + spdN * 20;
  ctx.fillStyle = token("obj-shadow");
  ctx.globalAlpha = airFade;
  ctx.beginPath();
  ctx.ellipse(x, y, len, 6, 0, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + 1, len * 0.72, 4, 0, 0, 7);
  ctx.fill();
  ctx.globalAlpha = 1;
}
