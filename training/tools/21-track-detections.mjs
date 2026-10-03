// Runs a ball model on EVERY frame of a stretch of a clip, links the detections into tracks, and keeps only
// tracks that move like a thrown ball (a smooth arc, fast enough, long enough). A head or a shirt does not.
// Writes two review sheets, a random sample of detections KEPT by the arc rule and a random sample REJECTED,
// so each can be judged by eye (ball / head / shirt / other).
//
//   MODEL=<onnx> node 21-track-detections.mjs <video> <cropX> <cropY> <start s> <length s> <out dir> [min score=0.25]
import * as ort from "onnxruntime-web";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , VIDEO, CX, CY, START, LEN, OUTDIR, MINARG = "0.25"] = process.argv;
const SIZE = 416, FPS = 30000 / 1001;
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });
fs.mkdirSync(OUTDIR, { recursive: true });

const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", START, "-t", LEN, "-i", VIDEO, "-an", "-vf", `fps=30000/1001,crop=${SIZE}:${SIZE}:${CX}:${CY}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 4 * 1024 * 1024 * 1024 });
const fb = SIZE * SIZE * 3, frames = [];
for (let i = 0; i + fb <= r.stdout.length; i += fb) frames.push(r.stdout.subarray(i, i + fb));
console.log("frames", frames.length);

const dets = [];
for (let f = 0; f < frames.length; f++) {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let p = 0, q = 0; p < fb; p += 3, q += 4) { rgba[q] = frames[f][p]; rgba[q + 1] = frames[f][p + 1]; rgba[q + 2] = frames[f][p + 2]; rgba[q + 3] = 255; }
  const img = { width: SIZE, height: SIZE, data: rgba }, { tensor, letterbox } = preprocess(img, SIZE);
  const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, SIZE, SIZE]) });
  for (const d of decode(o[session.outputNames[0]].data, 1, SIZE, letterbox, img, { scoreThreshold: Number(MINARG), classes: [0] }))
    dets.push({ f, cx: (d.x1 + d.x2) / 2, cy: (d.y1 + d.y2) / 2, w: d.x2 - d.x1, h: d.y2 - d.y1, score: d.score, box: [d.x1, d.y1, d.x2, d.y2], track: -1 });
  if (f % 300 === 299) console.log("done", f + 1, "frames,", dets.length, "detections");
}

// link detections into tracks: nearest neighbour to each open track's constant-velocity guess
const tracks = []; let open = [];
const byFrame = new Map(); for (const d of dets) { if (!byFrame.has(d.f)) byFrame.set(d.f, []); byFrame.get(d.f).push(d); }
for (let f = 0; f < frames.length; f++) {
  open = open.filter(t => f - t.pts[t.pts.length - 1].f <= 5);
  const used = new Set();
  for (const d of byFrame.get(f) || []) {
    let best = null, bd = 1e9;
    for (const t of open) {
      if (used.has(t)) continue;
      const l = t.pts[t.pts.length - 1], p = t.pts.length > 1 ? t.pts[t.pts.length - 2] : null, gap = f - l.f;
      const vx = p ? (l.cx - p.cx) / (l.f - p.f) : 0, vy = p ? (l.cy - p.cy) / (l.f - p.f) : 0;
      const dist = Math.hypot(d.cx - (l.cx + vx * gap), d.cy - (l.cy + vy * gap));
      if (dist < 30 + 8 * gap && dist < bd) { best = t; bd = dist; }
    }
    if (best) { best.pts.push(d); used.add(best); } else { const t = { pts: [d] }; tracks.push(t); open.push(t); used.add(t); }
  }
}

// does a track move like a thrown ball?
function solve(A, b) { const m = A.length; for (let i = 0; i < m; i++) { let piv = i; for (let r2 = i + 1; r2 < m; r2++) if (Math.abs(A[r2][i]) > Math.abs(A[piv][i])) piv = r2; [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]]; for (let r2 = i + 1; r2 < m; r2++) { const k = A[r2][i] / (A[i][i] || 1e-9); for (let c = i; c < m; c++) A[r2][c] -= k * A[i][c]; b[r2] -= k * b[i]; } } const x = Array(m).fill(0); for (let i = m - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < m; c++) s -= A[i][c] * x[c]; x[i] = s / (A[i][i] || 1e-9); } return x; }
function arc(pts) {
  const t0 = pts[0].f, T = pts.map(p => p.f - t0), n = pts.length, S = k => T.reduce((a, t) => a + t ** k, 0);
  const [a, b, c] = solve([[S(4), S(3), S(2)], [S(3), S(2), S(1)], [S(2), S(1), n]], [0, 1, 2].map(k => T.reduce((s, t, i) => s + t ** (2 - k) * pts[i].cy, 0)));
  const [d, e] = solve([[S(2), S(1)], [S(1), n]], [T.reduce((s, t, i) => s + t * pts[i].cx, 0), pts.reduce((s, p) => s + p.cx, 0)]);
  const ry = Math.sqrt(T.reduce((s, t, i) => s + (a * t * t + b * t + c - pts[i].cy) ** 2, 0) / n), rx = Math.sqrt(T.reduce((s, t, i) => s + (d * t + e - pts[i].cx) ** 2, 0) / n);
  return { a, ry, rx };
}
let kept = 0;
tracks.forEach((t, id) => {
  const p = t.pts, span = p[p.length - 1].f - p[0].f;
  let path = 0; for (let i = 1; i < p.length; i++) path += Math.hypot(p[i].cx - p[i - 1].cx, p[i].cy - p[i - 1].cy);
  t.ok = false;
  if (p.length >= 5 && span >= 5 && span <= 120 && path >= 60 && path / span >= 3) {
    const { a, ry, rx } = arc(p);
    t.fit = { a: +a.toFixed(3), ry: +ry.toFixed(1), rx: +rx.toFixed(1) };
    t.ok = a > 0.005 && a < 3 && ry < 7 && rx < 9;
  }
  for (const d of p) d.track = t.ok ? id : -1;
  if (t.ok) kept += p.length;
});
const keptDets = dets.filter(d => d.track >= 0), rejDets = dets.filter(d => d.track < 0);
console.log(`detections ${dets.length} | in arcs (kept) ${keptDets.length} | rejected ${rejDets.length} | tracks ${tracks.length}, arcs ${tracks.filter(t => t.ok).length}`);

let seed = 5; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function sheet(list, name, n) {
  const pick = [], pool = [...list]; while (pick.length < n && pool.length) pick.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const COLS = 6, TILE = 200, CROP = 100, rows = Math.ceil(pick.length / COLS), W = COLS * TILE, H = Math.max(1, rows) * TILE, buf = Buffer.alloc(W * H * 4, 40);
  pick.forEach((d, k) => {
    const sx = Math.max(0, Math.min(SIZE - CROP, Math.round(d.cx - CROP / 2))), sy = Math.max(0, Math.min(SIZE - CROP, Math.round(d.cy - CROP / 2))), sc = TILE / CROP, ox = (k % COLS) * TILE, oy = Math.floor(k / COLS) * TILE, px = frames[d.f];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const q = ((sy + Math.floor(y / sc)) * SIZE + sx + Math.floor(x / sc)) * 3, o2 = ((oy + y) * W + ox + x) * 4; buf[o2] = px[q]; buf[o2 + 1] = px[q + 1]; buf[o2 + 2] = px[q + 2]; buf[o2 + 3] = 255; }
    const x1 = (d.box[0] - sx) * sc, y1 = (d.box[1] - sy) * sc, x2 = (d.box[2] - sx) * sc, y2 = (d.box[3] - sy) * sc;
    const dot = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < TILE && y >= 0 && y < TILE) { const o2 = ((oy + y) * W + ox + x) * 4; buf[o2] = 0; buf[o2 + 1] = 255; buf[o2 + 2] = 0; } };
    for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); }
    for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const o2 = ((oy + 2 + yy) * W + ox + 2 + m * 7 + xx) * 4; buf[o2] = 255; buf[o2 + 1] = 255; buf[o2 + 2] = 255; }
  });
  fs.writeFileSync(`${OUTDIR}/${name}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 88).data);
}
sheet(keptDets, "kept-1", 30); sheet(keptDets, "kept-2", 30); sheet(rejDets, "rejected-1", 30); sheet(rejDets, "rejected-2", 30);
fs.writeFileSync(`${OUTDIR}/summary.json`, JSON.stringify({ frames: frames.length, detections: dets.length, kept: keptDets.length, rejected: rejDets.length, arcs: tracks.filter(t => t.ok).length }));
console.log("DONE");
