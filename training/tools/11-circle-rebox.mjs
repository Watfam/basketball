// Tight boxes by finding the ball's circular edge near where the motion tracker pointed.
// No trained model involved, so it cannot be fooled by shirts the way the detector was:
// it only looks inside a small window around a flight that was already accepted by eye.
//
//   node 11-circle-rebox.mjs <flights.json> <tracks.json> <video> <out.json> <check.jpg> [seed]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , FLIGHTS, TRACKS, VIDEO, OUT, CHECK, SEED = "3"] = process.argv;
const FPS = 30000 / 1001, RS = 600, RIM = [985, 370], WIN = 80, RMIN = 7, RMAX = 17, NEAR = 22;
const T = JSON.parse(fs.readFileSync(TRACKS, "utf8"));
const accepted = new Set(JSON.parse(fs.readFileSync(FLIGHTS, "utf8")).accepted);

function decodeRun(start, count) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(start / FPS), "-i", VIDEO, "-an", "-vf", `fps=30000/1001,crop=${RS}:${RS}:${RIM[0] - 300}:${RIM[1] - 300}`, "-frames:v", String(count), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const fb = RS * RS * 3, out = [];
  for (let i = 0; i + fb <= r.stdout.length; i += fb) out.push(r.stdout.subarray(i, i + fb));
  return out;
}

// Finds the most circular edge within NEAR pixels of the window centre. Returns null if none is convincing.
function findCircle(img, ox, oy) {
  const n = WIN, g = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const p = ((oy + y) * RS + ox + x) * 3; g[y * n + x] = (img[p] * 77 + img[p + 1] * 150 + img[p + 2] * 29) / 256; }
  const b = new Float32Array(n * n);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[(y + dy) * n + x + dx] * (dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1); b[y * n + x] = s / 16; }
  const gx = new Float32Array(n * n), gy = new Float32Array(n * n), mag = new Float32Array(n * n);
  const all = [];
  for (let y = 2; y < n - 2; y++) for (let x = 2; x < n - 2; x++) {
    const i = y * n + x, sx = (b[i - n + 1] + 2 * b[i + 1] + b[i + n + 1]) - (b[i - n - 1] + 2 * b[i - 1] + b[i + n - 1]), sy = (b[i + n - 1] + 2 * b[i + n] + b[i + n + 1]) - (b[i - n - 1] + 2 * b[i - n] + b[i - n + 1]);
    gx[i] = sx; gy[i] = sy; mag[i] = Math.hypot(sx, sy); all.push(mag[i]);
  }
  all.sort((p, q) => p - q);
  const thr = Math.max(40, all[Math.floor(all.length * 0.85)]), strong = all[Math.floor(all.length * 0.95)] || 1;
  const nr = RMAX - RMIN + 1, acc = new Float32Array(nr * n * n);
  for (let y = 2; y < n - 2; y++) for (let x = 2; x < n - 2; x++) {
    const i = y * n + x, m = mag[i]; if (m < thr) continue;
    const dx = gx[i] / m, dy = gy[i] / m;
    for (let r = RMIN; r <= RMAX; r++) for (const s of [1, -1]) {
      const cx = Math.round(x + s * r * dx), cy = Math.round(y + s * r * dy);
      if (cx >= 0 && cx < n && cy >= 0 && cy < n) acc[(r - RMIN) * n * n + cy * n + cx] += m;
    }
  }
  let best = null;
  const mid = n / 2;
  for (let r = RMIN; r <= RMAX; r++) for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    if (Math.hypot(cx - mid, cy - mid) > NEAR) continue;
    const v = acc[(r - RMIN) * n * n + cy * n + cx] / r;
    if (!best || v > best.v) best = { v, r, cx, cy };
  }
  if (!best) return null;
  // how much of the circle's outline really is an edge, and is that edge facing the right way?
  let hit = 0;
  const A = 32;
  for (let k = 0; k < A; k++) {
    const a = (k / A) * Math.PI * 2, px = best.cx + Math.cos(a) * best.r, py = best.cy + Math.sin(a) * best.r;
    let ok = false;
    for (let d = -1; d <= 1 && !ok; d++) {
      const qx = Math.round(px + Math.cos(a) * d), qy = Math.round(py + Math.sin(a) * d);
      if (qx < 2 || qy < 2 || qx >= n - 2 || qy >= n - 2) continue;
      const i = qy * n + qx;
      if (mag[i] > strong * 0.3 && Math.abs((gx[i] * Math.cos(a) + gy[i] * Math.sin(a)) / (mag[i] || 1)) > 0.6) ok = true;
    }
    if (ok) hit++;
  }
  return { cx: best.cx, cy: best.cy, r: best.r, support: hit / A };
}

const out = [], stats = { flights: 0, points: 0, kept: 0, weak: 0, disagree: 0 };
for (let f = 0; f < T.tracks.length; f++) {
  const id = f + 1; if (!accepted.has(id)) continue;
  stats.flights++;
  const pts = T.tracks[f].pts, first = pts[0][0], last = pts[pts.length - 1][0], imgs = decodeRun(first, last - first + 1), kept = [];
  for (const p of pts) {
    stats.points++;
    const img = imgs[p[0] - first]; if (!img) continue;
    const gx0 = T.cropX + 2 * p[2] - (RIM[0] - 300), gy0 = T.cropY + 2 * p[3] - (RIM[1] - 300);
    const ox = Math.max(0, Math.min(RS - WIN, Math.round(gx0 - WIN / 2))), oy = Math.max(0, Math.min(RS - WIN, Math.round(gy0 - WIN / 2)));
    const c = findCircle(img, ox, oy);
    if (!c || c.support < 0.6) { stats.weak++; continue; }
    const cx = ox + c.cx, cy = oy + c.cy;
    // Two independent methods must agree: the circle's centre has to lie within one ball radius
    // of the motion tracker's point. On a hand-checked sample this kept 29 of 30 good boxes and
    // dropped 16 of 18 bad ones; the bad ones are circles found on nets, leaves and backboard marks.
    if (Math.hypot(cx - gx0, cy - gy0) > c.r + 1) { stats.disagree++; continue; }
    kept.push({ frame: p[0], box: { x1: +(cx - c.r - 1).toFixed(1), y1: +(cy - c.r - 1).toFixed(1), x2: +(cx + c.r + 1).toFixed(1), y2: +(cy + c.r + 1).toFixed(1) }, r: c.r, support: +c.support.toFixed(2), tracker: [+gx0.toFixed(1), +gy0.toFixed(1), p[4] * 2 + 3, p[5] * 2 + 3] });
    stats.kept++;
  }
  out.push({ flight: id, firstFrame: first, lastFrame: last, points: pts.length, kept });
  if (stats.flights % 10 === 0) console.log(`flights ${stats.flights}, points ${stats.points}, kept ${stats.kept}`);
}
fs.writeFileSync(OUT, JSON.stringify({ rim: RIM, workWindow: RS, stats, flights: out }));
console.log("DONE", JSON.stringify(stats));

// check sheet: 48 random kept points, new box green, old tracker box grey
let seed = Number(SEED); const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pool = []; for (const fl of out) for (const k of fl.kept) pool.push({ fl, k });
const picks = []; while (picks.length < 48 && pool.length) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
const COLS = 8, CELL = 180, CROP = 90, W = COLS * CELL, H = Math.ceil(picks.length / COLS) * CELL, buf = Buffer.alloc(W * H * 4, 40);
const cache = new Map();
picks.forEach(({ fl, k }, idx) => {
  let imgs = cache.get(fl.flight); if (!imgs) { imgs = decodeRun(fl.firstFrame, fl.lastFrame - fl.firstFrame + 1); cache.clear(); cache.set(fl.flight, imgs); }
  const img = imgs[k.frame - fl.firstFrame]; if (!img) return;
  const mx = (k.box.x1 + k.box.x2) / 2, my = (k.box.y1 + k.box.y2) / 2;
  const sx = Math.max(0, Math.min(RS - CROP, Math.round(mx - CROP / 2))), sy = Math.max(0, Math.min(RS - CROP, Math.round(my - CROP / 2))), sc = CELL / CROP;
  const ox = (idx % COLS) * CELL, oy = Math.floor(idx / COLS) * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = ((sy + Math.floor(y / sc)) * RS + sx + Math.floor(x / sc)) * 3, d = ((oy + y) * W + ox + x) * 4; buf[d] = img[q]; buf[d+1] = img[q+1]; buf[d+2] = img[q+2]; buf[d+3] = 255; }
  const rect = (x1, y1, x2, y2, col) => { const dot = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = col[0]; buf[d+1] = col[1]; buf[d+2] = col[2]; } }; for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); } };
  const tx = k.tracker[0], ty = k.tracker[1], th = k.tracker[2] / 2, tv = k.tracker[3] / 2;
  rect((tx - th - sx) * sc, (ty - tv - sy) * sc, (tx + th - sx) * sc, (ty + tv - sy) * sc, [150, 150, 150]);
  rect((k.box.x1 - sx) * sc, (k.box.y1 - sy) * sc, (k.box.x2 - sx) * sc, (k.box.y2 - sy) * sc, [0, 255, 0]);
});
fs.writeFileSync(CHECK, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
console.log("check sheet:", CHECK);
