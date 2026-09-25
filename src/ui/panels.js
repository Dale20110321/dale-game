// 面板：关卡选择 / 比赛 / 车库 / 成就
import { ACHS, toM } from "../config/constants.js";
import { THEMES } from "../config/themes.js";
import { LEVELS } from "../config/levels.js";
import { VEHICLES } from "../config/vehicles.js";
import { store } from "../core/store.js";
import { save } from "../core/storage.js";
import { showToast } from "../core/toast.js";
import { initAudio } from "../core/audio.js";
import { hasAch } from "../game/progress.js";
import { showPanel, showMenu } from "./menu.js";

let api = {};

export function initPanels(a) {
  api = a || {};
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => {
      initAudio();
      if (store.state === "menu") fn();
    });
  };
  bind("btnLevels", renderLevelsPanel);
  bind("btnRace", renderRacePanel);
  bind("btnGarage", renderGaragePanel);
  bind("btnAch", renderAchPanel);

  // 事件委托：面板内的返回按钮
  const panel = document.getElementById("modePanel");
  if (panel) {
    panel.addEventListener("click", (e) => {
      const back = e.target.closest(".backBtn");
      if (back) showMenu();
    });
  }
}

function levelCell(i, L, opts) {
  const locked = i > store.unlocked;
  const st = store.stars[i] || 0;
  const theme = THEMES[L.theme].name;
  const tail = locked
    ? "通关解锁"
    : Math.round(toM(L.len)) + "m";
  const starsHtml = opts.race ? "🏆" : locked ? "🔒" : st > 0 ? "★".repeat(st) + "☆".repeat(3 - st) : "☆☆☆";
  return `<div class="lvCell ${locked ? "locked" : st > 0 ? "done" : ""}" data-lv="${i}"
      style="border-color:${VEHICLES[store.currentVehicle].color}44;${locked ? "opacity:.45;cursor:not-allowed" : ""}">
    <div>第${i + 1}关</div>
    <div style="font-size:10px;opacity:.7">${L.name}</div>
    <div class="thm">${theme} · 坡度${Math.round(L.maxSlope)}°</div>
    <div class="stars">${starsHtml}</div>
    <div style="font-size:10px">${tail}</div>
  </div>`;
}

export function renderLevelsPanel() {
  showPanel(`<div class="modeTitle">🏁 闯关模式 · 选择关卡</div>
  <div class="lvGrid" id="lvGrid">${LEVELS.map((L, i) => levelCell(i, L, {})).join("")}</div>
  <div class="panelNote">星级：通关1★ · 金币70%以上2★ · 快速通关3★</div>
  <button class="btn backBtn">返回</button>`);
  document.getElementById("lvGrid").addEventListener("click", (e) => {
    const cell = e.target.closest(".lvCell");
    if (!cell) return;
    const lv = +cell.dataset.lv;
    if (lv > store.unlocked) {
      showToast("🔒 先通关第" + (store.unlocked + 1) + "关解锁", 800);
      return;
    }
    api.startGame("level", lv);
  });
}

export function renderRacePanel() {
  showPanel(`<div class="modeTitle">🏆 比赛模式 · 与AI竞速</div>
  <div class="lvGrid" id="lvGridRace">${LEVELS.map((L, i) => levelCell(i, L, { race: true })).join("")}</div>
  <div class="panelNote">先到终点赢 300 🪙</div>
  <button class="btn backBtn">返回</button>`);
  document.getElementById("lvGridRace").addEventListener("click", (e) => {
    const cell = e.target.closest(".lvCell");
    if (!cell) return;
    const lv = +cell.dataset.lv;
    if (lv > store.unlocked) {
      showToast("🔒 先通关第" + (store.unlocked + 1) + "关解锁", 800);
      return;
    }
    api.startGame("race", lv);
  });
}

export function renderGaragePanel() {
  showPanel(`<div class="modeTitle">🏍️ 车库</div>
  ${VEHICLES.map((v, i) => {
    const own = store.ownedVehicles.includes(i);
    const sel = i === store.currentVehicle;
    return `<div class="vehCard ${sel ? "selected" : ""}" data-veh="${i}">
      <div style="font-size:26px">${v.icon}</div>
      <div style="flex:1">
        <div class="vname">${v.name}</div>
        <div class="vdesc">${v.desc}</div>
        <div class="vstat">速度${Math.round(v.spd * 100)}% · 驱动${Math.round(v.drv * 100)}% · 抓地${Math.round(v.grp * 100)}% · 旋转${Math.round(v.air * 100)}% · 油箱${Math.round(v.tank * 100)}%</div>
      </div>
      <div>${sel ? "✅ 使用中" : own ? "已拥有" : "🪙 " + v.price}</div>
    </div>`;
  }).join("")}
  <div class="panelNote" id="pnNote"></div>
  <button class="btn backBtn">返回</button>`);

  document.querySelectorAll("#modePanel .vehCard").forEach((el) => {
    el.addEventListener("click", () => buyOrSelectVeh(+el.dataset.veh));
  });
}

export function buyOrSelectVeh(i) {
  const note = () => document.getElementById("pnNote");
  if (store.ownedVehicles.includes(i)) {
    store.currentVehicle = i;
    // 车辆专属升级数据按车 id 存储，切换后重新应用
    save();
    renderGaragePanel();
    const n = note();
    if (n) n.textContent = "已切换到 " + VEHICLES[i].name;
    api.applyVehicle();
  } else {
    const v = VEHICLES[i];
    if (store.gold >= v.price) {
      store.gold -= v.price;
      store.ownedVehicles.push(i);
      store.currentVehicle = i;
      save();
      renderGaragePanel();
      const n = note();
      if (n) n.textContent = "🎉 购买并切换到 " + v.name;
      api.applyVehicle();
    } else {
      const n = note();
      if (n) n.textContent = "金币不足，需要 " + v.price + " 🪙";
    }
  }
}

export function renderAchPanel() {
  showPanel(`<div class="modeTitle">🏅 成就 · 已达成 ${store.achGot.length}/${ACHS.length}</div>
  <div class="achList">${ACHS.map((a) => {
    const got = hasAch(a.id);
    return `<div class="achItm ${got ? "got" : ""}">
      <div class="achIcon">${got ? a.icon : "🔒"}</div>
      <div><div class="achName">${got ? a.name : "？？？"}</div><div class="achDesc">${a.desc}</div></div>
    </div>`;
  }).join("")}</div>
  <button class="btn backBtn">返回</button>`);
}
