// 升级车间
import {
  MAX_LV, upCostOf, toKmh,
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
  const goldEl = document.getElementById("shopGold");
  if (goldEl) goldEl.textContent = store.gold;
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
        ultraEl.textContent = v.ultra.icon + " 「" + v.ultra.name + "」已内置生效 · " + v.ultra.desc;
      } else {
        const got = store.ultra[v.id] === true;
        const full4 = ["engine", "tire", "frame", "susp"].every((k) => (u[k] || 0) >= MAX_LV);
        ultraEl.className = "upUltra" + (got ? " got" : full4 ? " canBuy" : "");
        if (got) {
          ultraEl.textContent = v.ultra.icon + " 特殊模式「" + v.ultra.name + "」已开启 · " + v.ultra.desc;
        } else if (full4) {
          ultraEl.textContent = "⭐ 已全部升满！到车库花 " + v.ultra.cost.toLocaleString() + " 🪙 解锁「" + v.ultra.name + "」";
        } else {
          ultraEl.textContent = "🔒 全部升级升到 Lv" + MAX_LV + " 后可解锁特殊模式「" + v.ultra.name + "」：" + v.ultra.desc;
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
      if (lv >= MAX_LV) {
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
    if (lv >= MAX_LV) {
      btn.textContent = "已满级";
      btn.disabled = true;
      btn.style.opacity = 0.5;
    } else {
      const c = upCostOf(VEHICLES[store.currentVehicle], lv + 1);
      btn.textContent = "升级 " + c + " 🪙";
      btn.disabled = store.gold < c;
      btn.style.opacity = 1;
    }
  }
}

function buyUpgrade(k) {
  const u = getUp();
  const lv = u[k] || 0;
  if (lv >= MAX_LV) return;
  const c = upCostOf(VEHICLES[store.currentVehicle], lv + 1);
  const note = document.getElementById("shopNote");
  if (store.gold < c) {
    if (note) note.textContent = "金币不足，去关卡里收集吧！";
    return;
  }
  // 先记下旧读数，升级后逐项播报"变了多少"——把变化说出口，玩家才知道自己买了什么
  const before = previewStats(VEHICLES[store.currentVehicle], u);
  store.gold -= c;
  u[k] = lv + 1;
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
  for (const k of ["engine", "tire", "frame", "susp"]) {
    const btn = document.querySelector('[data-buy="' + k + '"]');
    if (btn) btn.addEventListener("click", () => buyUpgrade(k));
  }
}
