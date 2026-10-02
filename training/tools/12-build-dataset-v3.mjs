// Round-two training set built only from things that were checked by eye:
//   ball pictures : the 353 circle-fit boxes inside flights accepted by eye (IMG_4825)
//   no-ball pictures : IMG_4829 (nobody holds a ball, confirmed by Matt) and the first 150 s of
//                      IMG_4826 (red shirt, no shooting)
// merged with the BALL pictures of the round-one set (IMG_4824); its no-ball pictures are dropped. IMG_4825 contributes no "no ball" pictures at all,
// because balls are held, resting or flying in many of its other frames.
// The kids clip (B1689585...) is deliberately left out: it is the final exam.
//
//   node 12-build-dataset-v3.mjs      (needs: npm i --no-save jpeg-js, ffmpeg)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";

const FPS = 30000 / 1001, SIZE = 416, RS = 600;
const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, OLD = `${ROOT}/dataset`, NEW = `${ROOT}/dataset3b`, MERGED = `${ROOT}/dataset4`;
let seed = 424242; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const boxes = JSON.parse(fs.readFileSync(`${REPO}/training/labels/IMG_4825-ball-boxes.json`, "utf8"));
const RIM4825 = boxes.rim;
const NEG = [
  { id: "4829", video: `${ROOT}/IMG_4829.MOV`, rim: [932, 360], frames: 4097, count: 450, split: t => (t < 85 ? "train" : t < 110 ? "val" : "test") },
  { id: "4826", video: `${ROOT}/IMG_4826.MOV`, rim: [956, 388], frames: 4500, count: 420, split: t => (t < 105 ? "train" : t < 125 ? "val" : "test") },
];

function decode(video, rim, start, count) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(start / FPS), "-i", video, "-an", "-vf", `fps=30000/1001,crop=${RS}:${RS}:${rim[0] - 300}:${rim[1] - 300}`, "-frames:v", String(count), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const fb = RS * RS * 3, out = [];
  for (let i = 0; i + fb <= r.stdout.length; i += fb) out.push(r.stdout.subarray(i, i + fb));
  return out;
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

// A "no ball" picture must not hold a round, ball-sized orange object anywhere in the 600 px
// working window (held, dribbled or resting balls were found in about 15% of one clip's frames).
// Shirts are far larger than a ball, or ragged, and pass; rejecting a few extra is harmless.
function hasBallLikeBlob(img) {
  const n = RS, seen = new Uint8Array(n * n), stack = new Int32Array(n * n);
  const orange = (r, g, b) => r > 95 && g < 0.66 * r && b < 0.52 * r && r - g > 30;
  for (let s0 = 0; s0 < n * n; s0++) {
    if (seen[s0]) continue;
    const q0 = s0 * 3; if (!orange(img[q0], img[q0 + 1], img[q0 + 2])) continue;
    let top = 0, area = 0, x0 = n, x1 = 0, y0 = n, y1 = 0; stack[top++] = s0; seen[s0] = 1;
    while (top) {
      const q = stack[--top], x = q % n, y = (q / n) | 0; area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const k = ny * n + nx; if (seen[k]) continue; const c = k * 3;
        if (orange(img[c], img[c + 1], img[c + 2])) { seen[k] = 1; stack[top++] = k; }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (area >= 90 && area <= 3000 && bw / bh < 1.7 && bh / bw < 1.7 && area / (bw * bh) > 0.45) return true;
  }
  return false;
}

// window sizes near what a phone crop gives (about 416 native px); the whole ball stays inside
function pickWindow(box) {
  for (let t = 0; t < 20; t++) {
    const W = Math.round(SIZE * (0.85 + rand() * 0.15)), room = Math.min(70, RS / 2 - W / 2);
    const cx = 300 + (rand() * 2 - 1) * room, cy = 300 + (rand() * 2 - 1) * room;
    if (!box || (box.x1 > cx - W / 2 + 4 && box.x2 < cx + W / 2 - 4 && box.y1 > cy - W / 2 + 4 && box.y2 < cy + W / 2 - 4)) return { W, cx, cy };
  }
  return null;
}

const oldIds = ["train", "val", "test"].map(s => JSON.parse(fs.readFileSync(`${OLD}/${s}.json`, "utf8")));
let nextImg = Math.max(...oldIds.flatMap(j => j.images.map(i => i.id))) + 1, nextAnn = Math.max(0, ...oldIds.flatMap(j => j.annotations.map(a => a.id))) + 1;
for (const d of ["train", "val", "test"]) fs.mkdirSync(`${NEW}/${d}`, { recursive: true });
const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
const tally = {};
function save(src, set, img, frame, W, cx, cy, box) {
  const name = `s${src}_f${String(frame).padStart(6, "0")}_${nextImg}.jpg`, k = SIZE / W;
  fs.writeFileSync(`${NEW}/${set}/${name}`, jpeg.encode({ data: Buffer.from(window(img, W, cx, cy)), width: SIZE, height: SIZE }, 92).data);
  sets[set].images.push({ id: nextImg, file_name: name, width: SIZE, height: SIZE, frame, seconds: +(frame / FPS).toFixed(2), source: src });
  if (box) {
    const x1 = (box.x1 - (cx - W / 2)) * k, y1 = (box.y1 - (cy - W / 2)) * k, x2 = (box.x2 - (cx - W / 2)) * k, y2 = (box.y2 - (cy - W / 2)) * k;
    sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: [+x1.toFixed(1), +y1.toFixed(1), +(x2 - x1).toFixed(1), +(y2 - y1).toFixed(1)], area: +((x2 - x1) * (y2 - y1)).toFixed(1), iscrowd: 0 });
  }
  nextImg++; const key = `${src} ${set} ${box ? "ball" : "no-ball"}`; tally[key] = (tally[key] || 0) + 1;
}

// ball pictures: runs of consecutive boxed frames
const byFrame = new Map(boxes.frames.map(f => [f.f, f.box]));
const frames = [...byFrame.keys()].sort((a, b) => a - b), runs = [];
for (const f of frames) { const r = runs[runs.length - 1]; if (r && f - r.end <= 6) r.end = f; else runs.push({ start: f, end: f }); }
for (const r of runs) {
  const imgs = decode(`${ROOT}/IMG_4825.MOV`, RIM4825, r.start, r.end - r.start + 1);
  for (let i = 0; i < imgs.length; i++) {
    const b = byFrame.get(r.start + i); if (!b) continue;
    const box = { x1: b[0], y1: b[1], x2: b[2], y2: b[3] }, w = pickWindow(box); if (!w) continue;
    const t = (r.start + i) / FPS;
    save("4825", t < 780 ? "train" : t < 870 ? "val" : "test", imgs[i], r.start + i, w.W, w.cx, w.cy, box);
  }
}
// no-ball pictures
const rejected = {};
for (const src of NEG) {
  // random order, not sorted: stopping at the target count must not favour the start of the clip
  const picks = Array.from({ length: src.count * 2 }, () => 20 + Math.floor(rand() * (src.frames - 60)));
  let n = 0;
  for (const f of picks) {
    if (n >= src.count) break;
    const img = decode(src.video, src.rim, f, 1)[0]; if (!img) continue;
    if (hasBallLikeBlob(img)) { rejected[src.id] = (rejected[src.id] || 0) + 1; continue; }
    const w = pickWindow(null); save(src.id, src.split(f / FPS), img, f, w.W, w.cx, w.cy, null);
    if (++n % 100 === 0) console.log(`  ${src.id} no-ball ${n}/${src.count}`);
  }
}
console.log("rejected for a ball-like orange blob:", JSON.stringify(rejected));

for (const d of ["train", "val", "test"]) fs.mkdirSync(`${MERGED}/${d}`, { recursive: true });
const merged = {};
["train", "val", "test"].forEach((s, si) => {
  const old = oldIds[si];
  // From round one keep ONLY pictures that have a ball. Its "no ball" pictures were chosen by "no
  // moving orange blob", so a quarter of them show a held or resting ball (checked by eye).
  const haveBall = new Set(old.annotations.map(a => a.image_id));
  const oldKept = old.images.filter(im => haveBall.has(im.id));
  for (const im of oldKept) { im.source = im.source || "4824"; const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${OLD}/${s}/${im.file_name}`, dst); }
  for (const im of sets[s].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${NEW}/${s}/${im.file_name}`, dst); }
  merged[s] = { images: [...oldKept, ...sets[s].images], annotations: [...old.annotations, ...sets[s].annotations], categories: [{ id: 1, name: "ball" }] };
  fs.writeFileSync(`${MERGED}/${s}.json`, JSON.stringify(merged[s]));
  fs.writeFileSync(`${NEW}/${s}.json`, JSON.stringify({ ...sets[s], categories: [{ id: 1, name: "ball" }] }));
});
console.log("new pictures:"); for (const k of Object.keys(tally).sort()) console.log("  ", k.padEnd(24), tally[k]);
for (const s of ["train", "val", "test"]) console.log(`MERGED ${s}: ${merged[s].images.length} pictures, ${merged[s].annotations.length} with a ball`);
console.log("DONE");
