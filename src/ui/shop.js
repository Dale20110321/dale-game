// 升级车间
import { MAX_LV, upCost } from "../config/constants.js";
import { VEHICLES } from "../config/vehicles.js";
import { store } from "../core/store.js";
import { getUp, save } from "../core/storage.js";
import { playCoinSound, initAudio } from "../core/audio.js";
import { applyUpgrades } from "../physics/bike.js";
import { showMenu } from "./menu.js";

const shopEl = document.getElementById("shop");

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
    } else {
      ultraEl.className = "upUltra";
      ultraEl.textContent = "💡 购买并升满「竞速车」或「越野车」，可解锁它们各自的特殊模式";
    }
  }
  for (const k of ["engine", "tire", "frame", "susp"]) {
    const lv = u[k] || 0;
    const lvEl = document.getElementById("lv-" + k);
    if (lvEl) lvEl.textContent = "Lv " + lv;
    const btn = document.querySelector('[data-buy="' + k + '"]');
    if (!btn) continue;
    if (lv >= MAX_LV) {
      btn.textContent = "已满级";
      btn.disabled = true;
      btn.style.opacity = 0.5;
    } else {
      const c = upCost(lv + 1);
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
  const c = upCost(lv + 1);
  const note = document.getElementById("shopNote");
  if (store.gold < c) {
    if (note) note.textContent = "金币不足，去关卡里收集吧！";
    return;
  }
  store.gold -= c;
  u[k] = lv + 1;
  applyUpgrades();
  save();
  renderShop();
  if (note) note.textContent = "升级成功！";
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
