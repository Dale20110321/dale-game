// 本地调试：纯 Node PNG 解码 + 颜色分析（不属于交付物）
// 用 node:zlib 解压 IDAT，实现 PNG filter 还原，统计指定区域平均色
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function chunkAt(buf, off) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString("ascii", off + 4, off + 8);
  return { type, data: buf.subarray(off + 8, off + 8 + len), next: off + 12 + len };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

async function main() {
  const file = process.argv[2];
  const buf = await readFile(file);
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error("not a png");

  let ihdr = null, idat = [];
  let off = 8;
  while (off < buf.length) {
    const c = chunkAt(buf, off);
    if (c.type === "IHDR") ihdr = c.data;
    else if (c.type === "IDAT") idat.push(c.data);
    else if (c.type === "IEND") break;
    off = c.next;
  }
  const W = ihdr.readUInt32BE(0);
  const H = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const ctype = ihdr[9];
  console.log(`size ${W}x${H} bitdepth=${depth} colortype=${ctype}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype] * (depth / 8);
  const stride = W * bpp;
  const img = Buffer.alloc(H * stride);

  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = img.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = y > 0 ? img[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? img[(y - 1) * stride + x - bpp] : 0;
      let v;
      switch (f) {
        case 0: v = line[x]; break;
        case 1: v = line[x] + a; break;
        case 2: v = line[x] + b; break;
        case 3: v = line[x] + ((a + b) >> 1); break;
        case 4: v = line[x] + paeth(a, b, c); break;
        default: throw new Error("unknown filter " + f);
      }
      out[x] = v & 0xff;
    }
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const get = (x, y) => {
    const i = (y * W + x) * channels;
    const r = channels >= 1 ? img[i] : 0;
    const g = channels >= 3 ? img[i + 1] : r;
    const b = channels >= 3 ? img[i + 2] : r;
    const a = channels === 4 ? img[i + 3] : 255;
    return [r, g, b, a];
  };
  const avg = (x0, y0, x1, y1) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y += 3) {
      for (let x = x0; x < x1; x += 3) {
        const [pr, pg, pb] = get(x, y);
        r += pr; g += pg; b += pb; n++;
      }
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  };

  console.log("TL quadrant avg:", avg(0, 0, W >> 1, H >> 1));
  console.log("TR quadrant avg:", avg(W >> 1, 0, W, H >> 1));
  console.log("BL quadrant avg:", avg(0, H >> 1, W >> 1, H));
  console.log("BR quadrant avg:", avg(W >> 1, H >> 1, W, H));
  console.log("center avg:", avg(Math.round(W * 0.4), Math.round(H * 0.4), Math.round(W * 0.6), Math.round(H * 0.6)));

  const points = [
    ["(8,8) HUD corner", 8, 8],
    ["(100,40)", 100, 40],
    ["(200,40)", 200, 40],
    ["(W*0.13,H*0.095) ellipse center", Math.round(W * 0.13), Math.round(H * 0.095)],
    ["(W*0.3,H*0.15) inside ellipse", Math.round(W * 0.30), Math.round(H * 0.15)],
    ["(W*0.4,H*0.3) near ellipse edge", Math.round(W * 0.40), Math.round(H * 0.30)],
    ["(W*0.5,H*0.4) outside ellipse", Math.round(W * 0.50), Math.round(H * 0.40)],
    ["(W*0.5,H*0.5) center", Math.round(W * 0.5), Math.round(H * 0.5)],
  ];
  for (const [name, x, y] of points) console.log(`px ${name} (${x},${y})`, get(x, y));
}

main().catch((e) => { console.error(e); process.exit(1); });
