// WebAudio 音效（无音频资源文件，全部用振荡器合成）
import { store } from "./store.js";

let audioCtx = null;
let audioInit = false;

/** 首次用户交互时初始化；若已被浏览器挂起则恢复播放（切标签页/锁屏后回到游戏无声的修复） */
export function initAudio() {
  if (audioInit) {
    if (audioCtx && audioCtx.state === "suspended" && audioCtx.resume) {
      try {
        audioCtx.resume();
      } catch (e) {
        /* 忽略：某些浏览器在无用户手势时会拒绝 */
      }
    }
    return;
  }
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
    audioInit = true;
  } catch (e) {
    audioInit = false;
  }
}

function playTone(freq, dur, type, gain) {
  if (!audioCtx || store.muted) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    g.gain.setValueAtTime(gain || 0.08, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) {
    /* 忽略音频异常 */
  }
}

export function playCoinSound() {
  playTone(880, 0.12, "sine", 0.1);
  setTimeout(() => playTone(1320, 0.15, "sine", 0.08), 80);
}
export function playCrashSound() {
  playTone(120, 0.3, "sawtooth", 0.12);
  playTone(80, 0.4, "square", 0.08);
}
export function playLandSound() {
  playTone(200, 0.1, "sine", 0.06);
}
export function playFlipSound() {
  playTone(660, 0.1, "triangle", 0.09);
  setTimeout(() => playTone(990, 0.14, "triangle", 0.07), 70);
}
export function playFuelSound() {
  playTone(320, 0.1, "sine", 0.08);
  setTimeout(() => playTone(480, 0.12, "sine", 0.07), 60);
}
export function playBoostSound() {
  playTone(520, 0.09, "sawtooth", 0.07);
  setTimeout(() => playTone(900, 0.16, "sine", 0.08), 60);
}
export function playAchSound() {
  playTone(784, 0.12, "triangle", 0.09);
  setTimeout(() => playTone(1046, 0.12, "triangle", 0.08), 110);
  setTimeout(() => playTone(1318, 0.2, "triangle", 0.07), 220);
}
