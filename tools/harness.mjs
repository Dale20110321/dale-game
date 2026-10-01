// ============================================================
//  无头测试公共装置：浏览器环境打桩 + 极简断言框架
//  （被 tools/autotest.mjs 与 tools/audit.mjs 共用，避免两份打桩漂移）
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const noop = () => {};

/** Canvas 2D 上下文桩：任何方法都是空操作，渐变返回带 addColorStop 的对象 */
function makeCtx() {
  const target = {
    canvas: { width: 0, height: 0 },
    globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1,
    lineCap: "", lineJoin: "", font: "", textAlign: "", textBaseline: "",
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") {
          return { addColorStop: noop };
        }
        if (k === "measureText") return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

function makeEl(id) {
  // 真事件监听表：面板里的按钮点击/键盘可以通过 dispatchEvent 真实回放
  const listeners = new Map();
  return {
    id,
    style: {},
    dataset: {},
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    complete: true,
    naturalWidth: 1,
    children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) {
        if (on === undefined) this._s.has(c) ? this._s.delete(c) : this._s.add(c);
        else if (on) this._s.add(c);
        else this._s.delete(c);
      },
      contains(c) { return this._s.has(c); },
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const a = listeners.get(type) || [];
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    dispatchEvent(ev) {
      for (const fn of listeners.get(ev && ev.type) || []) fn(ev);
      return true;
    },
    _listeners: listeners,
    setAttribute(k, v) { this.attrs = this.attrs || {}; this.attrs[k] = String(v); },
    getAttribute(k) { return (this.attrs || {})[k] === undefined ? null : (this.attrs || {})[k]; },
    hasAttribute(k) { return (this.attrs || {})[k] !== undefined; },
    removeAttribute(k) { if (this.attrs) delete this.attrs[k]; },
    insertBefore: noop,
    appendChild: noop,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => makeCtx(),
  };
}

const elCache = new Map();
const getEl = (id) => {
  if (!elCache.has(id)) elCache.set(id, makeEl(id));
  return elCache.get(id);
};

export const winListeners = new Map();
globalThis.document = {
  getElementById: getEl,
  querySelector: (sel) => getEl("__sel" + sel),
  querySelectorAll: () => [],
  createElement: (tag) => makeEl("__new_" + tag),
  addEventListener: noop,
  documentElement: makeEl("__html"),
  body: makeEl("__body"),
  fullscreenElement: null,
  exitFullscreen: noop,
};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener: (type, fn) => {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  },
  removeEventListener: noop,
};

const defineGlobal = (name, value) => {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch (e) {
    globalThis[name] = value;
  }
};

defineGlobal("navigator", { maxTouchPoints: 0 });
defineGlobal("CanvasRenderingContext2D", class {});
defineGlobal("requestAnimationFrame", noop);
// 屏蔽所有定时器，避免测试被异步结算打断
defineGlobal("setTimeout", () => 0);
defineGlobal("clearTimeout", noop);

const memStore = new Map();
// 必须实现 length / key(i)，否则 storage.js 的 listSaveKeys() 与手工快照
// （for i < localStorage.length）会静默拿到 0 个键，导致导出/导入用例"空跑通过"。
defineGlobal("localStorage", {
  get length() { return memStore.size; },
  key: (i) => Array.from(memStore.keys())[i] ?? null,
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
  clear: () => memStore.clear(),
});
/** 供测试直接读写内存存档（不经 globalThis 代理） */
export const mem = memStore;

export const dispatchWin = (type, ev) => {
  for (const fn of winListeners.get(type) || []) fn(ev);
};

// ------------------------------------------------------------
//  极简断言框架
// ------------------------------------------------------------
export const results = [];
export let failures = 0;
export function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures++;
  results.push(`${ok ? "  ✅" : "  ❌"} ${name}${detail ? "  → " + detail : ""}`);
  return ok;
}
export function section(t) {
  results.push(`\n──────── ${t} ────────`);
}
export const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** 统一的收尾输出 + 退出码（两个套件共用，保证输出一致） */
export function finish() {
  const n = results.filter((r) => r.startsWith("  ")).length;
  console.log(results.join("\n"));
  console.log(`\n${failures ? "❌" : "✅"} 共 ${n} 项检查，失败 ${failures} 项`);
  process.exitCode = failures ? 1 : 0;
  return failures;
}

/** 按 src/ 相对路径动态导入（两个套件的模块加载都走这里） */
export const imp = (rel) => import(new URL("../src/" + rel, import.meta.url).href);
/** 读取项目内文件 */
export const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");
