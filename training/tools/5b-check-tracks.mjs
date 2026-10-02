// Draws a green box on a random sample of detected ball tracks, so they can be checked by eye.
//   node 5b-check-tracks.mjs <tracks.json> <video> <how many> <seed> <out.jpg>
import { spawnSync } from "node:child_process";
import fs from "node:fs"; import jpeg from "jpeg-js";
const [, , TRACKS, VIDEO, N, SEED, OUT] = process.argv;
const FPS = 30000 / 1001, T = JSON.parse(fs.readFileSync(TRACKS, "utf8"));
let seed = Number(SEED); const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const picks = []; const pool = [...T.tracks];
while (picks.length < Number(N) && pool.length) { const tr = pool.splice(Math.floor(rand() * pool.length), 1)[0]; picks.push(tr.pts[Math.floor(tr.pts.length / 2)]); }
const COLS = 6, CELL = 240, ROWS = Math.ceil(picks.length / COLS), W = COLS * CELL, H = ROWS * CELL, sheet = Buffer.alloc(W * H * 4, 0);
picks.forEach((p, k) => {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(p[0] / FPS), "-i", VIDEO, "-an", "-vf", `fps=30000/1001,crop=360:360:${T.cropX}:${T.cropY},scale=${CELL}:${CELL}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  const ox = (k % COLS) * CELL, oy = Math.floor(k / COLS) * CELL, s = CELL / 180;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = (y * CELL + x) * 3, d = ((oy + y) * W + ox + x) * 4; sheet[d] = r.stdout[q]; sheet[d+1] = r.stdout[q+1]; sheet[d+2] = r.stdout[q+2]; sheet[d+3] = 255; }
  const x1 = Math.round((p[2] - p[4] / 2) * s) - 2, x2 = Math.round((p[2] + p[4] / 2) * s) + 2, y1 = Math.round((p[3] - p[5] / 2) * s) - 2, y2 = Math.round((p[3] + p[5] / 2) * s) + 2;
  const dot = (x, y) => { if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; sheet[d] = 0; sheet[d+1] = 255; sheet[d+2] = 0; } };
  for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); }
});
fs.writeFileSync(OUT, jpeg.encode({ data: sheet, width: W, height: H }, 88).data); console.log("wrote", OUT, picks.length, "samples");
