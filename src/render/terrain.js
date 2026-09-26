// 地形渲染：地表填充 + 阴影 + 数据驱动的地表纹理（THEMES[i].surface）
// 纹理绘制函数只做视觉，不含物理依赖，也不含"按主题下标分支"的硬编码。
import { token } from "../config/ui-tokens.js";
import { ctx, view } from "../core/canvas.js";
import { THEMES } from "../config/themes.js";
import { store } from "../core/store.js";
import { groundY } from "../physics/terrain.js";

/** 遍历可见地表采样点，回调 (screenX, screenGY, worldX) */
function eachGround(cx, cy, step, fn) {
  for (let x = 0; x <= view.W; x += step) {
    const wx = x + cx;
    const gy = groundY(wx);
    if (gy === Infinity) continue;
    fn(x, gy - cy, wx);
  }
}

// ---------------- 地表纹理注册表（12 种） ----------------
const SURFACE_PAINTERS = {
  // 草叶
  grass(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    eachGround(cx, cy, 12, (x, gy, wx) => {
      const h = 4 + Math.abs(Math.sin(wx * 0.37)) * 7;
      ctx.beginPath();
      ctx.moveTo(x, gy - 1);
      ctx.lineTo(x + 2.5, gy - 1 - h);
      ctx.stroke();
    });
  },
  // 雪团
  snowpuff(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 14, (x, gy) => {
      ctx.beginPath();
      ctx.ellipse(x, gy - 4, 9, 3.5, 0, 0, 7);
      ctx.fill();
    });
    if (s.color2) {
      ctx.fillStyle = s.color2;
      eachGround(cx, cy, 24, (x, gy, wx) => {
        const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
        ctx.beginPath();
        ctx.arc(x + 6, gy - 8, r, 0, 7);
        ctx.fill();
      });
    }
  },
  // 沙纹
  sandripple(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    eachGround(cx, cy, 18, (x, gy) => {
      ctx.beginPath();
      ctx.moveTo(x, gy + 8);
      ctx.quadraticCurveTo(x + 9, gy + 4, x + 18, gy + 9);
      ctx.stroke();
    });
  },
  // 月坑
  crater(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 22, (x, gy, wx) => {
      const r = 3 + Math.abs(Math.sin(wx * 0.21)) * 5;
      ctx.beginPath();
      ctx.ellipse(x, gy + 10, r, r * 0.4, 0, 0, 7);
      ctx.fill();
    });
  },
  // 苔藓丛
  moss(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 10, (x, gy, wx) => {
      const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
      ctx.beginPath();
      ctx.arc(x, gy - 2, r, Math.PI, 0);
      ctx.fill();
    });
  },
  // 熔岩缝
  lava(s, cx, cy) {
    ctx.strokeStyle = s.color2 || s.color;
    ctx.lineWidth = 2.5;
    eachGround(cx, cy, 20, (x, gy, wx) => {
      const d = 8 + Math.abs(Math.sin(wx * 0.3)) * 16;
      ctx.beginPath();
      ctx.moveTo(x, gy - 1);
      ctx.lineTo(x + 4, gy + d * 0.5);
      ctx.lineTo(x - 2, gy + d);
      ctx.stroke();
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 34, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.6)) * 3;
      ctx.beginPath();
      ctx.arc(x, gy - 2, r, 0, 7);
      ctx.fill();
    });
  },
  // 霜晶
  frost(s, cx, cy) {
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 12, (x, gy, wx) => {
      if (Math.abs(Math.sin(wx * 0.9)) < 0.5) return;
      ctx.fillRect(x, gy - 3, 5, 3);
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 18, (x, gy, wx) => {
      const r = 1.6 + Math.abs(Math.sin(wx * 0.7)) * 2;
      ctx.beginPath();
      ctx.arc(x + 4, gy - 8, r, 0, 7);
      ctx.fill();
    });
  },
  // 层岩
  strata(s, cx, cy) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    for (let dy = 12; dy <= 48; dy += 12) {
      ctx.beginPath();
      for (let x = 0; x <= view.W; x += 10) {
        const gy = groundY(x + cx);
        if (gy === Infinity) continue;
        ctx.lineTo(x, gy - cy + dy + Math.sin((x + cx) * 0.02 + dy) * 2);
      }
      ctx.stroke();
    }
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 20, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.4)) * 3;
      ctx.beginPath();
      ctx.arc(x, gy - 3, r, 0, 7);
      ctx.fill();
    });
  },
  // 水洼
  puddle(s, cx, cy) {
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 30, (x, gy, wx) => {
      const r = 8 + Math.abs(Math.sin(wx * 0.25)) * 8;
      ctx.beginPath();
      ctx.ellipse(x, gy - 1, r, 2.5, 0, 0, 7);
      ctx.fill();
    });
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 22, (x, gy) => {
      ctx.beginPath();
      ctx.ellipse(x + 4, gy + 12, 6, 2, 0, 0, 7);
      ctx.fill();
    });
  },
  // 碎屑
  debris(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 14, (x, gy, wx) => {
      const w = 3 + Math.abs(Math.sin(wx * 0.6)) * 5;
      ctx.fillRect(x, gy - 4, w, 4);
    });
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 26, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.35)) * 3;
      ctx.beginPath();
      ctx.ellipse(x, gy + 10, r, r * 0.5, 0, 0, 7);
      ctx.fill();
    });
  },
  // 云絮
  cloudtuft(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 16, (x, gy, wx) => {
      const r = 6 + Math.abs(Math.sin(wx * 0.3)) * 7;
      ctx.beginPath();
      ctx.arc(x, gy - 5, r, 0, 7);
      ctx.fill();
    });
    if (s.color2) {
      ctx.fillStyle = s.color2;
      eachGround(cx, cy, 26, (x, gy, wx) => {
        const r = 3 + Math.abs(Math.sin(wx * 0.5)) * 4;
        ctx.beginPath();
        ctx.arc(x + 8, gy - 10, r, 0, 7);
        ctx.fill();
      });
    }
  },
  // 冰辉
  iceglow(s, cx, cy) {
    ctx.fillStyle = s.color;
    eachGround(cx, cy, 16, (x, gy, wx) => {
      const r = 2 + Math.abs(Math.sin(wx * 0.55)) * 3.5;
      ctx.beginPath();
      ctx.arc(x, gy - 3, r, 0, 7);
      ctx.fill();
    });
    ctx.fillStyle = s.color2 || s.color;
    eachGround(cx, cy, 22, (x, gy, wx) => {
      const r = 1.5 + Math.abs(Math.sin(wx * 0.8)) * 2.5;
      ctx.beginPath();
      ctx.arc(x + 6, gy - 9, r, 0, 7);
      ctx.fill();
    });
  },
};

export function drawTerrain(cx, cy) {
  const W = view.W;
  const H = view.H;
  const T = THEMES[store.phys.theme] || THEMES[0];
  const pal = T.pal;

  // 主体
  ctx.fillStyle = pal[0];
  ctx.beginPath();
  ctx.moveTo(0, cy);
  let lastG = cy;
  for (let x = 0; x <= W; x += 6) {
    const wx = x + cx;
    const gy = groundY(wx);
    if (gy === Infinity) ctx.lineTo(x, lastG);
    else {
      lastG = gy - cy;
      ctx.lineTo(x, gy - cy);
    }
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // 表层线
  ctx.fillStyle = pal[1];
  ctx.strokeStyle = pal[1];
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 6) {
    const gy = groundY(x + cx);
    if (gy === Infinity) continue;
    ctx.lineTo(x, gy - cy - 8);
  }
  ctx.stroke();

  // 地表下方阴影
  ctx.fillStyle = token("fx-shadow-faint");
  ctx.beginPath();
  ctx.moveTo(0, cy);
  for (let x = 0; x <= W; x += 6) {
    const gy = groundY(x + cx);
    if (gy === Infinity) ctx.lineTo(x, lastG);
    else ctx.lineTo(x, Math.min(gy + 40, cy + H) - cy);
  }
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // 数据驱动的地表纹理
  const sp = T.surface && SURFACE_PAINTERS[T.surface.type];
  if (sp) sp(T.surface, cx, cy);
}