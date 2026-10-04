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
import { drawRacers } from "./racers.js";
import { drawTrail } from "./trail.js";
import { shakeOffset } from "./camera.js";
import { drawHud } from "./hud.js";
import { applyPostFx } from "./postfx.js";

/**
 * @param {number} [dt] 本渲染帧的真实时长（秒）。**渲染层里凡是"逐帧累加"的量
 *   （天气粒子的下落、骑手踏频）都必须用它，而不是写死 1/60** —— 写死的话在
 *   144Hz 屏上会快 2.4 倍、30Hz 上慢一半，与 core/loop.js 声明的"与显示器刷新率
 *   无关"直接矛盾。缺省 1/60 只是为了兼容不传 dt 的调用方（体检脚本等）。
 */
export function drawScene(dt = 1 / 60) {
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
  // 对手画在玩家**之前**：这样玩家超过去时车身自然压住对手，遮挡关系才对
  drawRacers(cam.x, cam.y);
  drawBikeShadow();
  if (store.state === "play" || store.state === "ended" || store.state === "pause") {
    // 拖尾在车**之前**画：能量属于车尾，画在车之后会盖住骑手与车架。
    // （宇宙级车才有 trail，其余车这一句直接返回，见 render/trail.js）
    drawTrail(dt);
    drawBike(dt);
  }
  ctx.restore();

  cam.x = bcx;
  cam.y = bcy;

  // 后处理（渐晕 / 色彩分级 / 拖影 / 远景淡化 / 天气）
  // 放在 HUD 之前：HUD 是界面层叠加，不应被色彩分级与渐晕干扰（也保证机制警告不被遮挡）
  applyPostFx(store.time, dt);

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
  // 影子是**世界**坐标下的椭圆：宽度不随缩放额外放大，
  // 否则高速拉远视野时影子会变成一条盖住半个屏幕的黑带。
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
