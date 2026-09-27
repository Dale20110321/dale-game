// 本地调试：分析截图的左上角区域颜色（不属于交付物）
import { readFile } from "node:fs/promises";
import { PNG } from "./_png.mjs";

async function main() {
  const file = process.argv[2];
  const buf = await readFile(file);
  const png = new PNG(buf);
  const { width: W, height: H, data } = png;
  console.log("size", W, H);
  const get = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  // 左上角四分之一平均色
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < H / 2; y += 4) {
    for (let x = 0; x < W / 2; x += 4) {
      const [pr, pg, pb] = get(x, y);
      r += pr; g += pg; b += pb; n++;
    }
  }
  console.log("TL quadrant avg:", [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  // 中心四分之一（对比）
  r = 0; g = 0; b = 0; n = 0;
  for (let y = Math.round(H * 0.4); y < Math.round(H * 0.6); y += 4) {
    for (let x = Math.round(W * 0.4); x < Math.round(W * 0.6); x += 4) {
      const [pr, pg, pb] = get(x, y);
      r += pr; g += pg; b += pb; n++;
    }
  }
  console.log("center avg:", [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  // 采样线：左上角横穿
  for (const [x, y] of [[20, 40], [100, 40], [200, 40], [320, 40], [640, 360], [W * 0.13 | 0, H * 0.095 | 0]]) {
    console.log(`px(${x},${y})`, get(x, y));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
