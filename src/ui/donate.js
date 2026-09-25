// 打赏面板（二维码固定读同目录下的 assets/qr.png：有图就显示图，没有就显示提示文字）
import { store } from "../core/store.js";
import { initAudio } from "../core/audio.js";

const donateEl = document.getElementById("donate");
const qrImg = document.getElementById("qrImg");
const qrBox = document.getElementById("qrBox");

function checkQr() {
  if (qrImg && qrBox && qrImg.complete && qrImg.naturalWidth > 0) qrBox.classList.add("filled");
}

export function openDonate() {
  store.donateOpen = true;
  donateEl.classList.remove("hidden");
}

export function closeDonate() {
  store.donateOpen = false;
  donateEl.classList.add("hidden");
}

export function initDonate() {
  const btn = document.getElementById("btnDonate");
  if (btn) {
    btn.addEventListener("click", () => {
      initAudio();
      openDonate();
    });
  }
  const closeBtn = document.getElementById("closeDonate");
  if (closeBtn) closeBtn.addEventListener("click", closeDonate);
  if (qrImg) {
    qrImg.addEventListener("load", checkQr);
    qrImg.addEventListener("error", () => {});
  }
  checkQr();
}
