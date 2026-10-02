// Scans a video for ball-sized orange blobs in a window around the hoop, frame by frame.
// Unlike the first scanner this keeps each blob's size and shape, so a shirt (big, uneven)
// can be told apart from a ball (small, round) afterwards.
//
//   node 1-scan-components.mjs <video> <cropX> <cropY> <out.json>
//
// (cropX, cropY) is the top-left of a 360x360 native-pixel window centred on the rim.
import { spawn } from "node:child_process";
import fs from "node:fs";
const [, , VIDEO, CX, CY, OUT] = process.argv;
const W = 180, H = 180, FRAME = W * H * 3;
const ff = spawn("ffmpeg", ["-nostdin", "-loglevel", "error", "-i", VIDEO, "-an",
  "-vf", `crop=360:360:${CX}:${CY},scale=180:180,fps=30000/1001`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });
let buf = Buffer.alloc(0), n = 0;
const comps = [], big = [];
const mask = new Uint8Array(W * H), seen = new Uint8Array(W * H), stack = new Int32Array(W * H);
// red-orange: covers a ball and an orange or red shirt, but not skin or foliage
const orange = (r, g, b) => r > 105 && g < 0.62 * r && b < 0.45 * r && g > b + 2 && r - g > 40;
ff.stdout.on("data", chunk => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= FRAME) {
    const f = buf.subarray(0, FRAME); buf = buf.subarray(FRAME);
    for (let i = 0, p = 0; i < W * H; i++, p += 3) mask[i] = orange(f[p], f[p + 1], f[p + 2]) ? 1 : 0;
    seen.fill(0); let bigMax = 0;
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || seen[s]) continue;
      let top = 0, area = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
      stack[top++] = s; seen[s] = 1;
      while (top) {
        const q = stack[--top], x = q % W, y = (q / W) | 0; area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack[top++] = q - 1; }
        if (x < W - 1 && mask[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack[top++] = q + 1; }
        if (y > 0 && mask[q - W] && !seen[q - W]) { seen[q - W] = 1; stack[top++] = q - W; }
        if (y < H - 1 && mask[q + W] && !seen[q + W]) { seen[q + W] = 1; stack[top++] = q + W; }
      }
      if (area > bigMax) bigMax = area;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = area / (bw * bh);
      if (area >= 14 && area <= 420 && bw <= 26 && bh <= 26 && bw / bh <= 1.8 && bh / bw <= 1.8 && fill >= 0.4)
        comps.push([n, area, +(sx / area).toFixed(1), +(sy / area).toFixed(1), bw, bh, Math.round(fill * 100)]);
    }
    big.push(Math.min(bigMax, 65535));
    n++;
    if (n % 1500 === 0) fs.writeFileSync(OUT + ".progress", String(n));
  }
});
ff.on("close", () => { fs.writeFileSync(OUT, JSON.stringify({ frames: n, cropX: +CX, cropY: +CY, comps, big })); fs.writeFileSync(OUT + ".progress", "done " + n); });
