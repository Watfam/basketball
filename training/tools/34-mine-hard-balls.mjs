// Hard-example mining: weakly detected balls (score 0.10-0.40) in the orange-shirt clips and the three-ball clip, each
// confirmed by the independent circle-edge fit, used as extra training positives. These are the small, far or partly
// hidden balls the round-five model sees only faintly. Different frames than round three (offset 1 in the stride).
//
// (Adapted from 19-build-round3.mjs.)
// Original description:
// Round-three pictures from the orange-shirt clips (and the three-ball clip).
//
//  BALL pictures: the round-two model proposes a box (score >= 0.4); the box is kept only if an
//    independent circle-edge fit on the native-resolution picture finds a ball-sized circle there.
//    A shirt or torso has no round outline, so it fails. The box written is the circle's.
//  SHIRT pictures (no ball): IMG_4832's steady middle, where no ball exists by construction.
//
//  The kids clip B1689585 and anything filmed later stay out: they are the exams.
//
//   MODEL=<ball-2.onnx> node 19-build-round3.mjs        (needs jpeg-js, onnxruntime-web, ffmpeg)
import * as ort from "onnxruntime-web";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { preprocess, decode } from "../work/yolox.mjs";

const SIZE = 416, RS = 600, WIN = 80, RMIN = 6, RMAX = 22, SEG = 20;
const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, BASE = `${ROOT}/dataset13`, NEW = `${ROOT}/dataset14new`, MERGED = `${ROOT}/dataset14raw`;
const LOW = Number(process.env.LOW || 0.1), HIGH = Number(process.env.HIGH || 0.4);
let seed = 777; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });

const CLIPS = [
  { id: "4835m", file: "IMG_4835.MOV", fps: 30000 / 1001, dur: 150, crop: [748, 60], sub: [92, 110], stride: 3, pos: true, split: t => (t < 110 ? "train" : t < 125 ? "val" : "test") },
  { id: "4836m", file: "IMG_4836.MOV", fps: 30000 / 1001, dur: 125, crop: [748, 60], sub: [92, 110], stride: 3, pos: true, split: t => (t < 85 ? "train" : t < 100 ? "val" : "test") },
  { id: "4831m", file: "IMG_4831.MOV", fps: 30000 / 1001, dur: 623, crop: [660, 80], sub: [92, 92], stride: 4, pos: true, split: t => (t < 500 ? "train" : t < 560 ? "val" : "test") },
];

function grab(c, start, secs) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(start), "-t", String(secs), "-i", `${ROOT}/${c.file}`, "-an", "-vf", `select=not(mod(n+1\\,${c.stride})),crop=${RS}:${RS}:${c.crop[0]}:${c.crop[1]}`, "-vsync", "vfr", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const fb = RS * RS * 3, out = [];
  for (let i = 0; i + fb <= r.stdout.length; i += fb) out.push(r.stdout.subarray(i, i + fb));
  return out;
}

// strongest circular edge within `near` px of the window centre
function findCircle(img, ox, oy, near = 20) {
  const n = WIN, g = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const p = ((oy + y) * RS + ox + x) * 3; g[y * n + x] = (img[p] * 77 + img[p + 1] * 150 + img[p + 2] * 29) / 256; }
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

function window(img, W, cx, cy) {
  const out = new Uint8Array(SIZE * SIZE * 4), sx = cx - W / 2, sy = cy - W / 2, k = W / SIZE;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const fx = sx + (x + 0.5) * k - 0.5, fy = sy + (y + 0.5) * k - 0.5;
    const x0 = Math.max(0, Math.min(RS - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(RS - 1, Math.floor(fy))), x1 = Math.min(RS - 1, x0 + 1), y1 = Math.min(RS - 1, y0 + 1);
    const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0)), o = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) { const p = (xx, yy) => img[(yy * RS + xx) * 3 + c]; out[o + c] = p(x0, y0) * (1 - ax) * (1 - ay) + p(x1, y0) * ax * (1 - ay) + p(x0, y1) * (1 - ax) * ay + p(x1, y1) * ax * ay; }
    out[o + 3] = 255;
  }
  return out;
}
function pickWindow(box, around) {
  for (let t = 0; t < 30; t++) {
    const W = Math.round(SIZE * (0.85 + rand() * 0.15)), room = 60;
    const cx = (around ? around[0] : 300) + (rand() * 2 - 1) * room, cy = (around ? around[1] : 300) + (rand() * 2 - 1) * room;
    if (cx - W / 2 < 0 || cy - W / 2 < 0 || cx + W / 2 > RS || cy + W / 2 > RS) continue;
    if (!box || (box.x1 > cx - W / 2 + 4 && box.x2 < cx + W / 2 - 4 && box.y1 > cy - W / 2 + 4 && box.y2 < cy + W / 2 - 4)) return { W, cx, cy };
  }
  return null;
}

const oldJ = ["train", "val", "test"].map(s => JSON.parse(fs.readFileSync(`${BASE}/${s}.json`, "utf8")));
let nextImg = Math.max(...oldJ.flatMap(j => j.images.map(i => i.id))) + 1, nextAnn = Math.max(0, ...oldJ.flatMap(j => j.annotations.map(a => a.id))) + 1;
for (const d of ["train", "val", "test"]) fs.mkdirSync(`${NEW}/${d}`, { recursive: true });
const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
const tally = {};
function save(src, set, img, t, W, cx, cy, box) {
  const name = `s${src}_t${String(Math.round(t * 100)).padStart(6, "0")}_${nextImg}.jpg`, k = SIZE / W;
  fs.writeFileSync(`${NEW}/${set}/${name}`, jpeg.encode({ data: Buffer.from(window(img, W, cx, cy)), width: SIZE, height: SIZE }, 92).data);
  sets[set].images.push({ id: nextImg, file_name: name, width: SIZE, height: SIZE, seconds: +t.toFixed(2), source: src });
  if (box) {
    const x1 = (box.x1 - (cx - W / 2)) * k, y1 = (box.y1 - (cy - W / 2)) * k, x2 = (box.x2 - (cx - W / 2)) * k, y2 = (box.y2 - (cy - W / 2)) * k;
    sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: [+x1.toFixed(1), +y1.toFixed(1), +(x2 - x1).toFixed(1), +(y2 - y1).toFixed(1)], area: +((x2 - x1) * (y2 - y1)).toFixed(1), iscrowd: 0 });
  }
  nextImg++; const key = `${src} ${set} ${box ? "ball" : "no-ball"}`; tally[key] = (tally[key] || 0) + 1;
}

const stats = {};
for (const c of CLIPS) {
  const st = (stats[c.id] = { frames: 0, proposed: 0, round: 0, shirtLike: 0 });
  const from = c.from || 0;
  for (let s = from; s < c.dur; s += SEG) {
    const frames = grab(c, s, Math.min(SEG, c.dur - s));
    for (let i = 0; i < frames.length; i++) {
      const img = frames[i], t = s + (i * c.stride) / c.fps, set = c.split(t); st.frames++;
      if (c.neg) { const w = pickWindow(null); if (w) save(c.id, set, img, t, w.W, w.cx, w.cy, null); continue; }
      const sub = new Uint8ClampedArray(SIZE * SIZE * 4);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const p = ((c.sub[1] + y) * RS + c.sub[0] + x) * 3, d = (y * SIZE + x) * 4; sub[d] = img[p]; sub[d + 1] = img[p + 1]; sub[d + 2] = img[p + 2]; sub[d + 3] = 255; }
      const frame = { width: SIZE, height: SIZE, data: sub }, { tensor, letterbox } = preprocess(frame, SIZE);
      const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, SIZE, SIZE]) });
      const dets = decode(o[session.outputNames[0]].data, 1, SIZE, letterbox, frame, { scoreThreshold: LOW, classes: [0] });
      for (const d of dets) {
        if (d.score >= HIGH) continue;
        st.proposed++;
        const dx = c.sub[0] + (d.x1 + d.x2) / 2, dy = c.sub[1] + (d.y1 + d.y2) / 2, dw = d.x2 - d.x1;
        const ox = Math.max(0, Math.min(RS - WIN, Math.round(dx - WIN / 2))), oy = Math.max(0, Math.min(RS - WIN, Math.round(dy - WIN / 2)));
        const cir = findCircle(img, ox, oy, 22);
        const cx = cir ? ox + cir.cx : 0, cy = cir ? oy + cir.cy : 0;
        const good = cir && cir.support >= 0.7 && Math.hypot(cx - dx, cy - dy) <= cir.r + 2 && cir.r * 2 >= 0.55 * dw && cir.r * 2 <= 1.5 * dw;
        if (!good) { st.shirtLike++; continue; }
        const box = { x1: cx - cir.r - 1, y1: cy - cir.r - 1, x2: cx + cir.r + 1, y2: cy + cir.r + 1 }, w = pickWindow(box, [cx, cy]);
        if (!w) continue; st.round++; save(c.id, set, img, t, w.W, w.cx, w.cy, box);
      }
    }
    console.log(`${c.id} ${Math.min(s + SEG, c.dur)}/${c.dur}s  ${JSON.stringify(st)}`);
  }
}

for (const d of ["train", "val", "test"]) fs.mkdirSync(`${MERGED}/${d}`, { recursive: true });
const merged = {};
["train", "val", "test"].forEach((s, si) => {
  for (const im of oldJ[si].images) { im.source = im.source || "4824"; const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${BASE}/${s}/${im.file_name}`, dst); }
  for (const im of sets[s].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${NEW}/${s}/${im.file_name}`, dst); }
  merged[s] = { images: [...oldJ[si].images, ...sets[s].images], annotations: [...oldJ[si].annotations, ...sets[s].annotations], categories: [{ id: 1, name: "ball" }] };
  fs.writeFileSync(`${MERGED}/${s}.json`, JSON.stringify(merged[s]));
  fs.writeFileSync(`${NEW}/${s}.json`, JSON.stringify({ ...sets[s], categories: [{ id: 1, name: "ball" }] }));
});
console.log("stats", JSON.stringify(stats));
console.log("new pictures:"); for (const k of Object.keys(tally).sort()) console.log("  ", k.padEnd(24), tally[k]);
for (const s of ["train", "val", "test"]) console.log(`MERGED ${s}: ${merged[s].images.length} pictures, ${merged[s].annotations.length} with a ball`);
console.log("DONE");
