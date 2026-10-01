// ============================================================
//  深度体检的共享上下文：加载全部模块 + 暴露断言入口
//  每个 audit-<域>.mjs 只需 `export default async function (ctx) {...}`
// ============================================================
import { check, section } from "./harness.mjs";
import { imp } from "./harness.mjs";

const { store, bike, world } = await imp("core/store.js");
const { key } = await imp("core/input.js");
const levelsM = await imp("config/levels.js");
const themesM = await imp("config/themes.js");
const vehiclesM = await imp("config/vehicles.js");
const constM = await imp("config/constants.js");
const tokensM = await imp("config/ui-tokens.js");
const utilsM = await imp("core/utils.js");
const canvasM = await imp("core/canvas.js");
const loopM = await imp("core/loop.js");
const inputM = await imp("core/input.js");
const storageM = await imp("core/storage.js");
const toastM = await imp("core/toast.js");
const audioM = await imp("core/audio.js");
const terrainM = await imp("physics/terrain.js");
const bikeM = await imp("physics/bike.js");
const fuelM = await imp("physics/fuel.js");
const eventsM = await imp("physics/events.js");
const gameM = await imp("game/game.js");
const worldM = await imp("game/world.js");
const raceM = await imp("game/race.js");
const statsM = await imp("game/stats.js");
const progressM = await imp("game/progress.js");
const render = {
  scene: await imp("render/scene.js"),
  hud: await imp("render/hud.js"),
  terrain: await imp("render/terrain.js"),
  background: await imp("render/background.js"),
  entities: await imp("render/entities.js"),
  bike: await imp("render/bike.js"),
  camera: await imp("render/camera.js"),
  particles: await imp("render/particles.js"),
  postfx: await imp("render/postfx.js"),
};
const ui = {
  menu: await imp("ui/menu.js"),
  panels: await imp("ui/panels.js"),
  shop: await imp("ui/shop.js"),
  donate: await imp("ui/donate.js"),
  settings: await imp("ui/settings.js"),
  components: await imp("ui/components.js"),
};

// 画布桩默认 0×0，先给一个真实视口（渲染类检查依赖它）
canvasM.view.W = 1280;
canvasM.view.H = 720;

export const ctx = {
  check, section, imp,
  store, bike, world, key, view: canvasM.view,
  levels: levelsM, themes: themesM, vehicles: vehiclesM, consts: constM,
  tokens: tokensM, utils: utilsM, canvas: canvasM, loop: loopM, input: inputM,
  storage: storageM, toast: toastM, audio: audioM,
  terrain: terrainM, bikeM, fuel: fuelM, events: eventsM,
  game: gameM, worldM, race: raceM, stats: statsM, progress: progressM,
  render, ui,
  // 常用快捷方式
  LEVELS: levelsM.LEVELS, THEMES: themesM.THEMES, VEHICLES: vehiclesM.VEHICLES,
  FINALE: levelsM.FINALE, TOKENS: tokensM.TOKENS, DT: constM.DT, SUB: constM.SUB,
  REF_SPEED: constM.REF_SPEED, VEH: vehiclesM.VEHICLES,
  groundY: terrainM.groundY, groundInfo: terrainM.groundInfo,
  levelHillY: levelsM.levelHillY, levelGroundInfo: levelsM.levelGroundInfo,
  startGame: gameM.startGame, update: gameM.update, buildLevel: worldM.buildLevel,
  stepPhysics: bikeM.stepPhysics, resetBike: bikeM.resetBike, applyUpgrades: bikeM.applyUpgrades,
  drawScene: render.scene.drawScene,
};
