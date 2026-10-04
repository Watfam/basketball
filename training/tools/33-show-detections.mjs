// Contact sheet of chosen detections from a detections.json (17-review-detections), at native resolution and large,
// so a small box can be judged as ball / net / rim / other. Choose by width range.
//
//   node 33-show-detections.mjs <detections.json> <video> <cropX> <cropY> <min width> <max width> <how many> <seed> <out.jpg>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , DETS, VIDEO, CX, CY, MINW, MAXW, N, SEED, OUT] = process.argv, SIZE = 416, CROP = 80, TILE = 200, COLS = 6;
const all = JSON.parse(fs.readFileSync(DETS, "utf8")).filter(d => d.box[2] - d.box[0] >= Number(MINW) && d.box[2] - d.box[0] <= Number(MAXW));
let seed = Number(SEED); const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = [], pool = [...all]; while (pick.length < Number(N) && pool.length) pick.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
const rows = Math.ceil(pick.length / COLS), W = COLS * TILE, H = rows * TILE, buf = Buffer.alloc(W * H * 4, 40);
pick.forEach((d, k) => {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(d.t), "-i", VIDEO, "-an", "-frames:v", "1", "-vf", `crop=${SIZE}:${SIZE}:${CX}:${CY}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  if (!r.stdout || r.stdout.length < SIZE * SIZE * 3) return;
  const cx = (d.box[0] + d.box[2]) / 2, cy = (d.box[1] + d.box[3]) / 2, sx = Math.max(0, Math.min(SIZE - CROP, Math.round(cx - CROP / 2))), sy = Math.max(0, Math.min(SIZE - CROP, Math.round(cy - CROP / 2))), sc = TILE / CROP, ox = (k % COLS) * TILE, oy = Math.floor(k / COLS) * TILE;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const q = ((sy + Math.floor(y / sc)) * SIZE + sx + Math.floor(x / sc)) * 3, o = ((oy + y) * W + ox + x) * 4; buf[o] = r.stdout[q]; buf[o + 1] = r.stdout[q + 1]; buf[o + 2] = r.stdout[q + 2]; buf[o + 3] = 255; }
  const x1 = (d.box[0] - sx) * sc, y1 = (d.box[1] - sy) * sc, x2 = (d.box[2] - sx) * sc, y2 = (d.box[3] - sy) * sc;
  const dot = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < TILE && y >= 0 && y < TILE) { const o = ((oy + y) * W + ox + x) * 4; buf[o] = 0; buf[o + 1] = 255; buf[o + 2] = 0; } };
  for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); }
  for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const o = ((oy + 2 + yy) * W + ox + 2 + m * 7 + xx) * 4; buf[o] = 255; buf[o + 1] = 255; buf[o + 2] = 255; }
});
fs.writeFileSync(OUT, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
console.log(all.length, "detections in range;", pick.length, "shown ->", OUT);
