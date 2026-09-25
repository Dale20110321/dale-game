// 固定步长主循环
// 关键点：物理/燃料/计时/AI 全部由"固定 1/60 秒步"驱动，与显示器刷新率无关。
// （旧实现每渲染一帧就跑一次物理，120/144Hz 屏幕上游戏速度会翻倍）
import { DT } from "../config/constants.js";

/** 时间累加器：把任意帧间隔切成整数个固定步 */
export class Stepper {
  constructor(step, fixed = DT, maxSteps = 3) {
    this.step = step;
    this.fixed = fixed;
    this.maxSteps = maxSteps;
    this.acc = 0;
    /** 统计：本帧实际补跑的步数（测试用） */
    this.lastSteps = 0;
  }

  /** 推进 dt 秒；返回本次执行的固定步数 */
  advance(dtSeconds) {
    if (!(dtSeconds > 0)) {
      this.lastSteps = 0;
      return 0;
    }
    // 单帧最多累积 0.25s，防止切标签页回来后一次性补跑过久
    this.acc += Math.min(dtSeconds, 0.25);
    let n = 0;
    while (this.acc >= this.fixed && n < this.maxSteps) {
      this.step(this.fixed);
      this.acc -= this.fixed;
      n++;
    }
    if (n >= this.maxSteps) this.acc = 0; // 丢弃积压，避免"死亡螺旋"
    this.lastSteps = n;
    return n;
  }

  reset() {
    this.acc = 0;
    this.lastSteps = 0;
  }
}

/** 用 requestAnimationFrame 驱动 frame(dtSeconds) */
export function startRaf(frame) {
  let last = 0;
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (!last) {
      last = t;
      frame(0); // 首帧只渲染，不推进物理
      return;
    }
    const dt = (t - last) / 1000;
    last = t;
    frame(dt);
  };
  requestAnimationFrame(tick);
}
