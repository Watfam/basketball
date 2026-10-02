// Finds small round moving objects near the hoop on a fixed camera, whatever their colour.
// The ball is dark against a bright sky when the sun is behind the hoop, so colour alone
// misses it. Same output shape as 1-scan-components, so 3b-ballistic-tracks reads it.
//
//   node 1c-scan-motion.mjs <video> <cropX> <cropY> <out.json>
import { spawn } from "node:child_process";
import fs from "node:fs";
const [, , VIDEO, CX, CY, OUT] = process.argv;
const W = 180, H = 180, FRAME = W * H * 3, N = W * H;
const ff = spawn("ffmpeg", ["-nostdin", "-loglevel", "error", "-i", VIDEO, "-an",
  "-vf", `crop=360:360:${CX}:${CY},scale=180:180,fps=30000/1001`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });
let buf = Buffer.alloc(0), n = 0;
const comps = [], big = [];
const bg = new Float32Array(N), gray = new Float32Array(N), mask = new Uint8Array(N), seen = new Uint8Array(N), stack = new Int32Array(N);
const THRESH = 30, ALPHA = 0.04;
ff.stdout.on("data", chunk => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= FRAME) {
    const f = buf.subarray(0, FRAME); buf = buf.subarray(FRAME);
    for (let i = 0, p = 0; i < N; i++, p += 3) gray[i] = (f[p] * 77 + f[p + 1] * 150 + f[p + 2] * 29) / 256;
    if (n === 0) bg.set(gray);
    for (let i = 0; i < N; i++) { mask[i] = Math.abs(gray[i] - bg[i]) > THRESH ? 1 : 0; bg[i] += (gray[i] - bg[i]) * ALPHA; }
    // a speck of noise should not join two blobs: drop isolated pixels
    seen.fill(0); let bigMax = 0;
    for (let s = 0; s < N; s++) {
      if (!mask[s] || seen[s]) continue;
      let top = 0, area = 0, sx = 0, sy = 0, sl = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
      stack[top++] = s; seen[s] = 1;
      while (top) {
        const q = stack[--top], x = q % W, y = (q / W) | 0; area++; sx += x; sy += y; sl += gray[q];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack[top++] = q - 1; }
        if (x < W - 1 && mask[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack[top++] = q + 1; }
        if (y > 0 && mask[q - W] && !seen[q - W]) { seen[q - W] = 1; stack[top++] = q - W; }
        if (y < H - 1 && mask[q + W] && !seen[q + W]) { seen[q + W] = 1; stack[top++] = q + W; }
      }
      if (area > bigMax) bigMax = area;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = area / (bw * bh);
      if (n > 20 && area >= 18 && area <= 420 && bw <= 26 && bh <= 26 && bw / bh <= 1.8 && bh / bw <= 1.8 && fill >= 0.5)
        comps.push([n, area, +(sx / area).toFixed(1), +(sy / area).toFixed(1), bw, bh, Math.round(fill * 100)]);
    }
    big.push(Math.min(bigMax, 65535));
    n++;
    if (n % 1500 === 0) fs.writeFileSync(OUT + ".progress", String(n));
  }
});
ff.on("close", () => { fs.writeFileSync(OUT, JSON.stringify({ frames: n, cropX: +CX, cropY: +CY, comps, big })); fs.writeFileSync(OUT + ".progress", "done " + n); });
