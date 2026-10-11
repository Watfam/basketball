// Round six: training pictures from the exam clips filmed since round five (different angles, zooms and light), with
// boxes that come from the ball's own circular outline, not from the model.
//
//   node 44-round6.mjs circles <source id|all>   find circles where ball-5 proposes a ball (score >= 0.4); writes
//                                                 training/labels/round6/<id>.json and an eye-check sheet per source
//   node 44-round6.mjs render                    cut the training windows (needs every source's circle file), merge with round five
//
// A box is kept only if an independent circle-edge fit on the NATIVE picture finds a ball-sized circle that agrees with the
// model's proposal (the round-three method). Ball-5's own boxes are not used: on blurry clips they cover only the core of the
// ball (about 70% of its width on IMG_4872), which also fooled the app's auto sizing.
//
// NEVER used: IMG_4874 (held out to score anything retrained) and the kids clip B1689585 (the older exam).
// Needs jpeg-js and ffmpeg. Frames are numbered as in tools/22 (fps=30000/1001), so detection frame numbers match.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, WORK = `${REPO}/training/work/round6`, LABELS = `${REPO}/training/labels/round6`;
const FW = 1920, FH = 1080, FB = FW * FH * 3, SIZE = 416, FPS = 30000 / 1001;
const WIN = 120, RMIN = 6, RMAX = 30;
const TARGET_BALL = 23.7; // width in a 416 px window that the app's sizer aims for, which is also roughly round five's median label
const PER_SOURCE_CAP = 300;

// one entry per camera position; dets are ball-5's per-frame boxes in the window they were run in
const SOURCES = [
  { id: "4839", video: "IMG_4839.MOV", dets: "dets5-4839.json" },
  { id: "4840", video: "IMG_4840.MOV", dets: "dets5-4840.json" },
  { id: "4844a", video: "IMG_4844.MOV", dets: "dets5-4844.json", untilSec: 63.5 },
  { id: "4844b", video: "IMG_4844.MOV", dets: "dets5-4844b.json", fromSec: 64 },
  { id: "4851", video: "IMG_4851.MOV", dets: "dets5-4851.json" },
  { id: "4866", video: "IMG_4866.MOV", dets: "dets5-4866.json" },
  { id: "4867", video: "IMG_4867.MOV", dets: "dets5-4867.json" },
  { id: "4872", video: "IMG_4872.MOV", dets: "dets5-4872.json" },
  { id: "4873", video: "IMG_4873.MOV", dets: "dets5-4873-found.json" },
];

async function* frames(video) {
  const ff = spawn("ffmpeg", ["-nostdin", "-loglevel", "error", "-i", `${ROOT}/${video}`, "-an", "-vf", "fps=30000/1001", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });
  let chunks = [], have = 0, n = 0;
  for await (const c of ff.stdout) {
    chunks.push(c); have += c.length;
    while (have >= FB) {
      const all = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
      yield { n: n++, img: all.subarray(0, FB) };
      const rest = all.subarray(FB);
      chunks = rest.length ? [rest] : []; have = rest.length;
    }
  }
}

function findCircle(img, ox, oy, near) {
  const n = WIN, g = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const p = ((oy + y) * FW + ox + x) * 3; g[y * n + x] = (img[p] * 77 + img[p + 1] * 150 + img[p + 2] * 29) / 256; }
  const b = new Float32Array(n * n);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[(y + dy) * n + x + dx] * (dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1); b[y * n + x] = s / 16; }
  const gx = new Float32Array(n * n), gy = new Float32Array(n * n), mag = new Float32Array(n * n), all = [];
  for (let y = 2; y < n - 2; y++) for (let x = 2; x < n - 2; x++) {
    const i = y * n + x, sx = (b[i - n + 1] + 2 * b[i + 1] + b[i + n + 1]) - (b[i - n - 1] + 2 * b[i - 1] + b[i + n - 1]), sy = (b[i + n - 1] + 2 * b[i + n] + b[i + n + 1]) - (b[i - n - 1] + 2 * b[i - n] + b[i - n + 1]);
    gx[i] = sx; gy[i] = sy; mag[i] = Math.hypot(sx, sy); all.push(mag[i]);
  }
  all.sort((p, q) => p - q);
  const thr = Math.max(40, all[Math.floor(all.length * 0.85)]), strong = all[Math.floor(all.length * 0.95)] || 1, nr = RMAX - RMIN + 1, acc = new Float32Array(nr * n * n);
  for (let y = 2; y < n - 2; y++) for (let x = 2; x < n - 2; x++) {
    const i = y * n + x, m = mag[i]; if (m < thr) continue;
    const dx = gx[i] / m, dy = gy[i] / m;
    for (let r = RMIN; r <= RMAX; r++) for (const s of [1, -1]) { const cx = Math.round(x + s * r * dx), cy = Math.round(y + s * r * dy); if (cx >= 0 && cx < n && cy >= 0 && cy < n) acc[(r - RMIN) * n * n + cy * n + cx] += m; }
  }
  let best = null; const mid = n / 2;
  for (let r = RMIN; r <= RMAX; r++) for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    if (Math.hypot(cx - mid, cy - mid) > near) continue;
    const v = acc[(r - RMIN) * n * n + cy * n + cx] / r; if (!best || v > best.v) best = { v, r, cx, cy };
  }
  if (!best) return null;
  let hit = 0; const A = 32;
  for (let k = 0; k < A; k++) {
    const a = (k / A) * Math.PI * 2, px = best.cx + Math.cos(a) * best.r, py = best.cy + Math.sin(a) * best.r; let ok = false;
    for (let d = -1; d <= 1 && !ok; d++) {
      const qx = Math.round(px + Math.cos(a) * d), qy = Math.round(py + Math.sin(a) * d); if (qx < 2 || qy < 2 || qx >= n - 2 || qy >= n - 2) continue;
      const i = qy * n + qx; if (mag[i] > strong * 0.3 && Math.abs((gx[i] * Math.cos(a) + gy[i] * Math.sin(a)) / (mag[i] || 1)) > 0.6) ok = true;
    }
    if (ok) hit++;
  }
  return { cx: best.cx, cy: best.cy, r: best.r, support: hit / A };
}

const loadDets = (s) => {
  const d = JSON.parse(fs.readFileSync(`${REPO}/training/fixtures/${s.dets}`, "utf8")), k = (d.cropSize ?? 416) / SIZE;
  return { d, k, native: d.detections.map((q) => ({ f: q.f, score: q.score, cx: d.cropX + ((q.x1 + q.x2) / 2) * k, cy: d.cropY + ((q.y1 + q.y2) / 2) * k, w: (q.x2 - q.x1) * k })) };
};
let seed = 20261011; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

function sheet(items, out) {
  // items: [{img (full frame), cx, cy, box:{x1,y1,x2,y2}, det:{cx,cy,w}}]; 8 per row, 90 native px per tile at 2x
  const COLS = 8, CELL = 180, CROP = 90, W = COLS * CELL, H = Math.ceil(items.length / COLS) * CELL, buf = Buffer.alloc(W * H * 4, 40);
  items.forEach((it, idx) => {
    const sx = Math.max(0, Math.min(FW - CROP, Math.round(it.cx - CROP / 2))), sy = Math.max(0, Math.min(FH - CROP, Math.round(it.cy - CROP / 2))), sc = CELL / CROP;
    const ox = (idx % COLS) * CELL, oy = Math.floor(idx / COLS) * CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = ((sy + Math.floor(y / sc)) * FW + sx + Math.floor(x / sc)) * 3, d = ((oy + y) * W + ox + x) * 4; buf[d] = it.img[q]; buf[d + 1] = it.img[q + 1]; buf[d + 2] = it.img[q + 2]; buf[d + 3] = 255; }
    const rect = (x1, y1, x2, y2, col) => { const dot = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = col[0]; buf[d + 1] = col[1]; buf[d + 2] = col[2]; } }; for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); } };
    rect((it.box.x1 - sx) * sc, (it.box.y1 - sy) * sc, (it.box.x2 - sx) * sc, (it.box.y2 - sy) * sc, [0, 255, 0]);
    if (it.det) rect((it.det.cx - it.det.w / 2 - sx) * sc, (it.det.cy - it.det.w / 2 - sy) * sc, (it.det.cx + it.det.w / 2 - sx) * sc, (it.det.cy + it.det.w / 2 - sy) * sc, [150, 150, 150]);
  });
  fs.writeFileSync(out, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
}

const phase = process.argv[2];
fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(LABELS, { recursive: true });

if (phase === "circles") {
  const which = process.argv[3] || "all";
  for (const s of SOURCES.filter((x) => which === "all" || x.id === which)) {
    const { native } = loadDets(s);
    const lo = Math.round((s.fromSec ?? 0) * FPS), hi = Math.round((s.untilSec ?? 1e9) * FPS);
    const byFrame = new Map();
    for (const q of native) if (q.score >= 0.4 && q.f >= lo && q.f <= hi && q.f % 2 === 0) { if (!byFrame.has(q.f)) byFrame.set(q.f, []); byFrame.get(q.f).push(q); }
    const allByFrame = new Map(); for (const q of native) if (q.score >= 0.3) { if (!allByFrame.has(q.f)) allByFrame.set(q.f, []); allByFrame.get(q.f).push(q); }
    const last = Math.max(...byFrame.keys()), kept = [], st = { proposed: 0, weak: 0, disagree: 0, secondBall: 0, kept: 0 }, sheetItems = [];
    for await (const { n, img } of frames(s.video)) {
      if (n > last) break;
      const cands = byFrame.get(n); if (!cands) continue;
      for (const q of cands) {
        st.proposed++;
        // another proposal far from this one: a second ball may be in the picture, unboxed, which would teach "ball = background"
        if ((allByFrame.get(n) || []).some((o) => Math.hypot(o.cx - q.cx, o.cy - q.cy) > 40)) { st.secondBall++; continue; }
        const ox = Math.max(0, Math.min(FW - WIN, Math.round(q.cx - WIN / 2))), oy = Math.max(0, Math.min(FH - WIN, Math.round(q.cy - WIN / 2)));
        const c = findCircle(img, ox, oy, Math.max(8, q.w * 0.6));
        if (!c || c.support < 0.7) { st.weak++; continue; }
        const cx = ox + c.cx, cy = oy + c.cy;
        if (Math.hypot(cx - q.cx, cy - q.cy) > c.r + 2 || c.r * 2 < 0.6 * q.w || c.r * 2 > 1.9 * q.w) { st.disagree++; continue; }
        st.kept++; kept.push({ f: n, t: +(n / FPS).toFixed(2), cx: +cx.toFixed(1), cy: +cy.toFixed(1), r: c.r, support: +c.support.toFixed(2), score: +q.score.toFixed(2), detW: +q.w.toFixed(1) });
        if (sheetItems.length < 48 && rand() < 0.12) sheetItems.push({ img: Buffer.from(img), cx, cy, box: { x1: cx - c.r - 1, y1: cy - c.r - 1, x2: cx + c.r + 1, y2: cy + c.r + 1 }, det: q });
      }
    }
    const widths = kept.map((k) => 2 * k.r + 2).sort((a, b) => a - b), med = widths[Math.floor(widths.length / 2)] || 0;
    const out = { id: s.id, video: s.video, stats: st, medianBallWidthNative: med, scale: +(med / TARGET_BALL).toFixed(3), kept };
    fs.writeFileSync(`${LABELS}/${s.id}.json`, JSON.stringify(out));
    sheet(sheetItems, `${WORK}/sheet-${s.id}.jpg`);
    console.log(s.id, JSON.stringify(st), "median ball width", med, "-> window scale", out.scale);
  }
  console.log("DONE");
}
