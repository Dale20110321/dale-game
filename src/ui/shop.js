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
