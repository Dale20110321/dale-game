// 冒烟测试：用最小 DOM/Canvas 桩加载全部模块，验证模块图与关键不变量。
// 目的是在没有浏览器的环境里抓到 ReferenceError / 循环依赖 / 顶层求值错误。
const noop = () => {};
function makeCtx() {
  const c = {
    canvas: { width: 1280, height: 720 },
    globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", font: "",
    textAlign: "", textBaseline: "", globalCompositeOperation: "", filter: "", lineJoin: "",
    shadowBlur: 0, shadowColor: "", miterLimit: 10,
  };
  for (const m of ["save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "arc", "ellipse",
    "rect", "fill", "stroke", "fillRect", "strokeRect", "clearRect", "fillText", "strokeText",
    "translate", "rotate", "scale", "setTransform", "resetTransform", "setLineDash", "createLinearGradient",
    "createRadialGradient", "roundRect", "clip", "drawImage", "putImageData", "measureText",
    "quadraticCurveTo", "bezierCurveTo", "arcTo", "createPattern"]) c[m] = m === "measureText" ? () => ({ width: 10 }) : noop;
  const g = { addColorStop: noop };
  c.createLinearGradient = () => g; c.createRadialGradient = () => g;
  return c;
}
const el = () => new Proxy({
  style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  children: [], textContent: "", innerHTML: "", value: "",
  appendChild: noop, removeChild: noop, addEventListener: noop, removeEventListener: noop,
  setAttribute: noop, removeAttribute: noop, getAttribute: () => null, querySelector: () => el(), querySelectorAll: () => [],
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }),
  focus: noop, click: noop, getContext: () => makeCtx(), width: 1280, height: 720,
}, { get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });

globalThis.document = {
  getElementById: () => el(), createElement: () => el(), body: el(),
  addEventListener: noop, querySelectorAll: () => [],
  documentElement: { style: { setProperty: noop } },
};
const ls = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
globalThis.localStorage = ls;
globalThis.window = {
  addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  localStorage: ls, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop, getComputedStyle: () => ({}),
  setTimeout, clearTimeout, setInterval, clearInterval,
};
globalThis.navigator = { userAgent: "node", vibrate: noop };
globalThis.devicePixelRatio = 1;
globalThis.AudioContext = function () { return { createOscillator: () => ({ connect: noop, start: noop, stop: noop, frequency: { value: 0 }, type: "" }), createGain: () => ({ connect: noop, gain: { value: 0 } }), destination: {}, currentTime: 0 }; };
globalThis.performance = performance;

const mods = [
  "./src/core/utils.js", "./src/config/ui-tokens.js", "./src/config/constants.js",
  "./src/config/themes.js", "./src/config/vehicles.js", "./src/config/levels.js",
  "./src/core/store.js", "./src/core/storage.js", "./src/core/canvas.js", "./src/core/input.js",
  "./src/core/toast.js", "./src/core/audio.js", "./src/core/loop.js",
  "./src/physics/terrain.js", "./src/physics/fuel.js", "./src/physics/events.js", "./src/physics/bike.js",
  "./src/render/particles.js", "./src/render/light.js", "./src/render/background.js",
  "./src/render/camera.js", "./src/render/terrain.js", "./src/render/entities.js",
  "./src/render/bike.js", "./src/render/postfx.js", "./src/render/hud.js", "./src/render/scene.js",
  "./src/game/progress.js", "./src/game/stats.js", "./src/game/race.js", "./src/game/world.js",
  "./src/game/game.js", "./src/ui/components.js", "./src/ui/settings.js", "./src/ui/donate.js",
  "./src/ui/shop.js", "./src/ui/menu.js", "./src/ui/panels.js",
];
let ok = 0;
for (const m of mods) {
  try { await import(m); ok++; console.log("OK  ", m); }
  catch (e) { console.log("FAIL", m, "→", e.message); }
}
console.log(`\n${ok}/${mods.length} 模块加载成功`);