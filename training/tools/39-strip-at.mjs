// Zoomed frame strips for chosen shots, each starting at a given frame and stepping a given number of frames, so the
// whole shot (rim contact and what the ball does after) can be seen. One row per shot, 14 tiles per row, no boxes drawn.
//
//   node 39-strip-at.mjs <video> <cropX> <cropY> <rimX> <rimY> <step> <out.jpg> <label:startFrame> [label:startFrame ...]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , VIDEO, CX, CY, RX, RY, STEP, OUT, ...items] = process.argv;
const FPS = 30000 / 1001, TILE = 160, CROP = Number(process.env.CROP ?? 150), COLS = 14, step = Number(STEP);
const nativeX = Number(CX) + Number(RX), nativeY = Number(CY) + Number(RY);
const ox0 = Math.max(0, Math.round(nativeX - CROP / 2)), oy0 = Math.max(0, Math.round(nativeY - CROP / 2 + 35));
const W = COLS * TILE, H = items.length * TILE, buf = Buffer.alloc(W * H * 4, 30);
items.forEach((item, r) => {
  const start = Number(item.split(":")[1]);
  for (let k = 0; k < COLS; k++) {
    const t = (start + k * step) / FPS;
    const res = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(t), "-i", VIDEO, "-an", "-frames:v", "1", "-vf", `crop=${CROP}:${CROP}:${ox0}:${oy0},scale=${TILE}:${TILE}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 24 });
    if (!res.stdout || res.stdout.length < TILE * TILE * 3) continue;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const q = (y * TILE + x) * 3, d = ((r * TILE + y) * W + k * TILE + x) * 4; buf[d] = res.stdout[q]; buf[d + 1] = res.stdout[q + 1]; buf[d + 2] = res.stdout[q + 2]; buf[d + 3] = 255; }
    for (let m = 0; m <= k % 5; m++) for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) { const d = ((r * TILE + 2 + yy) * W + k * TILE + 2 + m * 5 + xx) * 4; buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255; }
  }
});
fs.writeFileSync(OUT, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
console.log(items.map((it, r) => `row ${r + 1} = ${it.split(":")[0]} from frame ${it.split(":")[1]}`).join("\n"));
