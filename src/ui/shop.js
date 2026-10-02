// 升级车间
import {
  MAX_LV, maxLvOf, upCostOf, toKmh,
  deriveHandling, deriveSuspension, deriveFriction, crashTiltDeg,
} from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { store } from "../core/store.js";
import { getUp, save } from "../core/storage.js";
import { playCoinSound, initAudio } from "../core/audio.js";
import { applyUpgrades } from "../physics/bike.js";
import { showToast } from "../core/toast.js";
import { showMenu } from "./menu.js";

const shopEl = document.getElementById("shop");

/** 四项升级各自的"名字 → 它到底改变什么"的对照表（车库/商店共用同一份读数） */
const UP_LABEL = {
  engine: "引擎",
  tire: "轮胎",
  frame: "车架",
  susp: "减震",
};

/**
 * 升级预览：把"现在 → 买下一级"的两组**真实派生量**都算出来给玩家看。
 *
 * ★ 为什么要加这个：升级过去只有一句"爬坡力 / 极速 / 油耗"，玩家点下去看不出
 *   任何变化，于是"升级没感觉"。这里直接把 HUD 上用的同一套 derive* 跑一遍，
 *   显示"极速 24.9 → 25.3 km/h"这种具体的差值 —— 数字变没变、变多少一目了然。
 *   显示的量与物理层同源（deriveHandling / deriveSuspension / deriveFriction），
 *   不会出现"商店写着 +20% 实际没有"的情况。
 */
function previewStats(veh, up) {
  const h = deriveHandling(veh, up);
  const s = deriveSuspension(veh, up);
  return {
    极速: Math.round(toKmh(h.topSpeed)),                    // km/h
    扭矩: Math.round(h.torquePeak / 1000),                 // k
    抓地: Math.round(deriveFriction(1, veh, up) * 100) / 100,
    抗摔: Math.round(crashTiltDeg(h.crashMargin)),         // 度
    悬挂: Math.round(s.travel * 10) / 10,                  // px
  };
}

/** 每一项升级会动哪几个读数（其余不动，避免刷屏） */
const UP_TOUCHES = {
  engine: ["极速", "扭矩"],
  tire: ["抓地", "极速"],
  frame: ["抗摔", "悬挂"],
  susp: ["悬挂"],
};

/** 形态的量化效果行（与车库同一份，来自 vehicles.js 由 fx 反推） */
function fxLine(v) {
  return v.ultra && v.ultra.fxText ? " · " + v.ultra.fxText : "";
}

export function openShop() {
  store.shopOpen = true;
  renderShop();
  shopEl.classList.remove("hidden");
}

export function closeShop() {
  store.shopOpen = false;
  shopEl.classList.add("hidden");
  if (store.state === "menu" || store.state === "ended") showMenu();
}

export function toggleShop() {
  if (store.shopOpen) closeShop();
  else openShop();
}

export function renderShop() {
  // ★ 当前车的升级上限：宇宙级车 500，其余 100。
  //   下面所有"是否满级"的判断都读它，不要直接用全局 MAX_LV。
  const ML = maxLvOf(VEHICLES[store.currentVehicle]);
  const goldEl = document.getElementById("shopGold");
  if (goldEl) goldEl.textContent = store.gold.toLocaleString();
  const vehNow = VEHICLES[store.currentVehicle];
  const st = document.getElementById("shopTitle");
  if (st) st.textContent = "🛠 升级 " + VEHICLES[store.currentVehicle].icon + " " + VEHICLES[store.currentVehicle].name;
  const u = getUp();
  // 特殊模式解锁提醒：全部升级满级后可解锁（当前车有 ultra 定义时展示）
  const ultraEl = document.getElementById("shopUltra");
  if (ultraEl) {
    const v = VEHICLES[store.currentVehicle];
    if (v.ultra) {
      // builtin 形态（究极终局车）：免解锁、已永久生效，不走"解锁/满级才能开"那套文案
      if (v.ultra.builtin === true) {
        ultraEl.className = "upUltra got";
        ultraEl.textContent = v.ultra.icon + " 「" + v.ultra.name + "」已内置生效 · " + v.ultra.desc + fxLine(v);
      } else {
        const got = store.ultra[v.id] === true;
        const full4 = ["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= ML);
        ultraEl.className = "upUltra" + (got ? " got" : full4 ? " canBuy" : "");
        if (got) {
          ultraEl.textContent = v.ultra.icon + " 特殊模式「" + v.ultra.name + "」已开启 · " + v.ultra.desc + fxLine(v);
        } else if (full4) {
          ultraEl.textContent = "⭐ 已全部升满！到车库花 " + v.ultra.cost.toLocaleString() + " 🪙 解锁「" + v.ultra.name + "」" + fxLine(v);
        } else {
          ultraEl.textContent = "🔒 全部升级升到 Lv" + ML + " 后可解锁特殊模式「" + v.ultra.name + "」：" + v.ultra.desc + fxLine(v);
        }
      }
    } else {
      ultraEl.className = "upUltra";
      ultraEl.textContent = "💡 除山地车外，每辆车都有专属特殊模式：四项升级全部升满后，到车库花金币解锁";
    }
  }
  for (const k of ["engine", "tire", "frame", "susp"]) {
    const lv = u[k] || 0;
    const lvEl = document.getElementById("lv-" + k);
    if (lvEl) lvEl.textContent = "Lv " + lv;
    const btn = document.querySelector('[data-buy="' + k + '"]');
    if (!btn) continue;
    // 升级预览："极速 24.9 → 25.3 km/h"，满级时改为展示该车当前的真实读数
    const dg = document.getElementById("dg-" + k);
    const now = previewStats(VEHICLES[store.currentVehicle], u);
    if (dg) {
      if (lv >= ML) {
        dg.textContent = UP_TOUCHES[k]
          .map((n) => n + " " + now[n])
          .join(" · ") + " · 已满级";
        dg.className = "upDelta max";
      } else {
        const next = previewStats(VEHICLES[store.currentVehicle], { ...u, [k]: lv + 1 });
        const changed = UP_TOUCHES[k].filter((n) => next[n] !== now[n]);
        dg.textContent = changed.length
          ? changed.map((n) => n + " " + now[n] + " → " + next[n]).join(" · ")
          : "下一级已达该指标上限";
        dg.className = "upDelta";
      }
    }
    if (lv >= ML) {
      btn.textContent = "已满级";
      btn.disabled = true;
      btn.style.opacity = 0.5;
    } else {
      const c = upCostOf(VEHICLES[store.currentVehicle], lv + 1);
      btn.textContent = "升级 " + c.toLocaleString() + " 🪙";
      btn.disabled = store.gold < c;
      btn.style.opacity = 1;
    }
  }
  // 批量升级按钮：全满 → 禁用；否则按"最便宜的那一级"判断是否点得动
  const allBtn = document.getElementById("btnUpAll");
  if (allBtn) {
    const full = ["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= ML);
    if (full) {
      allBtn.textContent = "✅ 四项已满级";
      allBtn.disabled = true;
      allBtn.classList.add("done");
    } else {
      // 升满还需要多少钱 = 各项剩余级次的总价
      let need = 0;
      for (const k of ["engine", "tire", "frame", "susp"]) {
        const lv = u[k] || 0;
        for (let i = lv + 1; i <= ML; i++) need += upCostOf(vehNow, i);
      }
      allBtn.textContent = "⚡ 一键升满（还需 " + need.toLocaleString() + " 🪙）";
      allBtn.disabled = store.gold < need;
      allBtn.classList.remove("done");
    }
  }
}

/**
 * 升级一项的**核心动作**（不弹提示、不播音效）：扣钱 → 加级 → 落盘 → 重算派生量。
 *
 * ★ 抽出来是为了让"单级升级"与"批量升级"共用同一条路径 ——
 *   两份实现迟早会漂移（批量少算一次 applyUpgrades，或少扣一次钱），
 *   而那种 bug 只在玩家点了批量之后才出现，极难复现。
 * @returns {boolean} 是否真的买了这一级（金币不足 / 已满级返回 false）
 */
function applyUpgradeStep(k) {
  const u = getUp();
  const lv = u[k] || 0;
  if (lv >= maxLvOf(VEHICLES[store.currentVehicle])) return false;
  const c = upCostOf(VEHICLES[store.currentVehicle], lv + 1);
  if (store.gold < c) return false;
  store.gold -= c;
  u[k] = lv + 1;
  return true;
}

function buyUpgrade(k) {
  const u = getUp();
  const lv = u[k] || 0;
  const note = document.getElementById("shopNote");
  if (lv >= maxLvOf(VEHICLES[store.currentVehicle])) {
    if (note) note.textContent = "已经满级了";
    return;
  }
  if (!applyUpgradeStep(k)) {
    if (note) note.textContent = "金币不足，去关卡里收集吧！";
    showToast("🪙 金币不足：" + UP_LABEL[k] + " Lv" + lv + " 升不到 Lv" + (lv + 1), 1200, "danger");
    return;
  }
  // 先记下旧读数，升级后播报"变了多少"——把变化说出口，玩家才知道自己买了什么
  const before = previewStats(VEHICLES[store.currentVehicle], u);
  applyUpgrades();
  save();
  renderShop();
  const after = previewStats(VEHICLES[store.currentVehicle], u);
  const moved = Object.keys(after).filter((n) => after[n] !== before[n]);
  const msg = UP_LABEL[k] + " Lv" + lv + " → Lv" + (lv + 1) +
    (moved.length ? "：" + moved.map((n) => n + " +" + Math.round((after[n] - before[n]) * 100) / 100).join(" · ") : "");
  if (note) note.textContent = "升级成功！";
  showToast("🔧 " + msg, 1600);
  playCoinSound();
}

/**
 * 「⚡ 一键升满」：把当前车辆四项在**金币允许的范围内**一次升满。
 *
 * ★ 为什么要它（两个原因，一个是体验、一个是修 bug）：
 *   1. 四项升满是一万两千次点击的事（神话档单项 7060 级次 × 40 倍价），
 *      逐级点既累又容易在中途分神。
 *   2. **连点 20 次会排 20 条 toast**（这就是"批量升级后消息太多"的由来）：
 *      每条内容几乎相同，玩家要等 30 秒才看得到最后一条。
 *      批量入口把 N 次购买收敛成**一条**汇总提示，从根上消掉这个问题。
 *
 * 只在金币买得起的范围内升（可能升不满），并如实播报"升了多少级 / 还差多少"。
 */
function buyUpgradeAll() {
  const veh = VEHICLES[store.currentVehicle];
  const u = getUp();
  const before = previewStats(veh, u);
  const beforeLv = { engine: u.engine, tire: u.tire, frame: u.frame, susp: u.susp };
  let spent = 0;
  let bought = 0;
  // 逐项循环购买：每次都重新读当前等级与下一级价格（价格随等级递增，
  // 所以必须边买边算，不能一次性算总和 —— 那会算错）
  const ML = maxLvOf(veh);
  let progress = true;
  while (progress) {
    progress = false;
    for (const k of ["engine", "tire", "frame", "susp"]) {
      const lv = u[k] || 0;
      if (lv >= ML) continue;
      const c = upCostOf(veh, lv + 1);
      if (store.gold < c) continue; // 这项买不起，试下一项
      store.gold -= c;
      u[k] = lv + 1;
      spent += c;
      bought++;
      progress = true;
    }
    // 四项都已满级，或金币连最便宜的一级都买不起 → 退出
    if (["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= ML)) break;
  }
  const note = document.getElementById("shopNote");
  if (!bought) {
    if (note) note.textContent = "金币不足，暂时升不了";
    showToast("🪙 金币不足，无法升级", 1200, "danger");
    return;
  }
  applyUpgrades();
  save();
  renderShop();
  const after = previewStats(veh, u);
  const moved = Object.keys(after).filter((n) => after[n] !== before[n]);
  const gotFull = ["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= ML);
  const parts = ["买 " + bought + " 级 · 🪙-" + spent.toLocaleString()];
  for (const k of ["engine", "tire", "frame", "susp"]) {
    if (u[k] !== beforeLv[k]) parts.push(UP_LABEL[k] + " Lv" + beforeLv[k] + "→Lv" + u[k]);
  }
  if (moved.length) {
    parts.push(moved.map((n) => n + " +" + Math.round((after[n] - before[n]) * 100) / 100).join(" · "));
  }
  if (note) note.textContent = gotFull ? "四项全部满级 🎉" : "已升 " + bought + " 级";
  // ★ 一条汇总提示，而不是每级一条
  showToast((gotFull ? "⚡ 四项满级" : "⚡ 批量升级") + " · " + parts.join(" · "), 2600, "success");
  playCoinSound();
}

export function initShop() {
  const btnShop = document.getElementById("btnShop");
  if (btnShop) {
    btnShop.addEventListener("click", () => {
      initAudio();
      if (store.state === "menu") openShop();
    });
  }
  const closeBtn = document.getElementById("closeShop");
  if (closeBtn) closeBtn.addEventListener("click", closeShop);
  const allBtn = document.getElementById("btnUpAll");
  if (allBtn) allBtn.addEventListener("click", buyUpgradeAll);
  for (const k of ["engine", "tire", "frame", "susp"]) {
    const btn = document.querySelector('[data-buy="' + k + '"]');
    if (btn) btn.addEventListener("click", () => buyUpgrade(k));
  }
}
