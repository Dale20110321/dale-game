// 粒子特效（渲染层 FX 服务：无游戏逻辑，任何层都可以调用 emitParticles）
import { token } from "../config/ui-tokens.js";
import { world } from "../core/store.js";
import { ctx, view } from "../core/canvas.js";

/** 粒子数量硬上限，防止长时间游玩无限增长 */
const MAX_PARTICLES = 600;

export function emitParticles(x, y, count, cfg) {
  const arr = world.particles;
  // cfg.spd 是唯一的必填项，但它没有默认值：漏传会得到 s * undefined = NaN，
  // 而 NaN 速度会让粒子在 updateParticles 里位置立刻变 NaN 并**永久留在数组里**
  // （NaN !== NaN，life 检查也拦不住），画面上表现为凭空消失的粒子洞。
  // 其余字段本来就有默认值，这里给 spd 也补一个，杜绝这类"静默 NaN"。
  const spd = Number.isFinite(cfg.spd) ? cfg.spd : 1;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * 6.2832;
    const s = 0.5 + Math.random() * 1.5;
    arr.push({
      x,
      y,
      vx: Math.cos(a) * s * spd,
      vy: Math.sin(a) * s * spd - 0.5,
      life: cfg.life || 40,
      maxLife: cfg.life || 40,
      size: cfg.size || 2 + Math.random() * 2,
      color: cfg.color || token("text-hi"),
      decay: cfg.decay || 0.97,
      grav: cfg.grav || 0.04,
    });
  }
  if (arr.length > MAX_PARTICLES) arr.splice(0, arr.length - MAX_PARTICLES);
}

/** 每个固定步推进一次（因此粒子运动与刷新率无关） */
export function updateParticles() {
  const arr = world.particles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.grav;
    p.vx *= p.decay;
    p.vy *= p.decay;
    p.life--;
    if (p.life <= 0) arr.splice(i, 1);
  }
}

export function drawParticles(cx, cy) {
  for (const p of world.particles) {
    const sx = p.x - cx;
    const sy = p.y - cy;
    if (sx < -50 || sx > view.W + 50) continue;
    const a = p.life / p.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.size * a, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
