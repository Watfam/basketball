// Round-two training pictures: ball pictures from the ballistic tracks of the newer clips,
// plus many "no ball" pictures, with extra weight on windows where a red or orange shirt is
// near the hoop (the mistake round one made). Merged with the round-one pictures.
//
//   node 8-build-dataset-v2.mjs        (needs: npm i --no-save jpeg-js, ffmpeg)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";

const FPS = 30000 / 1001, SIZE = 416, RS = 600;
const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, WORK = `${REPO}/training/work`, OUT = `${ROOT}/dataset2`, OLD = `${ROOT}/dataset`, MERGED = `${ROOT}/dataset3`;
let seed = 987654; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// split: where each moment of a clip goes. 4825 keeps its last ~5 minutes, which include a new
// person and cloudier light, as a test the model has never seen anything like.
const SOURCES = [
  { id: "4825", video: `${ROOT}/IMG_4825.MOV`, posTracks: [`${WORK}/ftracks-4825.json`, `${WORK}/tracks-4825.json`],
    safeTracks: [`${WORK}/mtracks-4825.json`, `${WORK}/tracks-4825.json`], bigFrom: `${WORK}/tracks-4825.json`, rim: [985, 370],
    split: t => (t < 780 ? "train" : t < 870 ? "val" : "test"), positives: true, plainNeg: 450, hardNeg: 450 },
  { id: "4826", video: `${ROOT}/IMG_4826.MOV`, posTracks: [], safeTracks: [`${WORK}/mtracks-4826.json`, `${WORK}/tracks-4826.json`],
    bigFrom: `${WORK}/tracks-4826.json`, rim: [956, 388],
    split: () => "train", positives: false, plainNeg: 450, hardNeg: 0, maxSeconds: 150 },
];

function decode(video, rim, startFrame, count) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(startFrame / FPS), "-i", video, "-an", "-vf", `fps=30000/1001,crop=${RS}:${RS}:${rim[0] - 300}:${rim[1] - 300}`, "-frames:v", String(count), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const fb = RS * RS * 3, out = []; for (let i = 0; i + fb <= r.stdout.length; i += fb) out.push(r.stdout.subarray(i, i + fb)); return out;
}
function window(img, W, cx, cy) {
  const out = new Uint8Array(SIZE * SIZE * 4), sx = cx - W / 2, sy = cy - W / 2, k = W / SIZE;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const fx = sx + (x + 0.5) * k - 0.5, fy = sy + (y + 0.5) * k - 0.5;
    const x0 = Math.max(0, Math.min(RS - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(RS - 1, Math.floor(fy))), x1 = Math.min(RS - 1, x0 + 1), y1 = Math.min(RS - 1, y0 + 1);
    const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0)), o = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) { const p = (xx, yy) => img[(yy * RS + xx) * 3 + c]; out[o + c] = p(x0,y0)*(1-ax)*(1-ay) + p(x1,y0)*ax*(1-ay) + p(x0,y1)*(1-ax)*ay + p(x1,y1)*ax*ay; }
    out[o + 3] = 255;
  }
  return out;
}
// A window that keeps the whole ball inside it. Sizes stay close to 416 native pixels because
// that is what the phone will cut from a 1080p feed.
function pickWindow(box) {
  for (let t = 0; t < 14; t++) {
    const W = Math.round(SIZE * (0.85 + rand() * 0.15)), room = Math.min(60, RS / 2 - W / 2);
    const cx = 300 + (rand() * 2 - 1) * room, cy = 300 + (rand() * 2 - 1) * room;
    if (!box || (box.x1 > cx - W / 2 + 3 && box.x2 < cx + W / 2 - 3 && box.y1 > cy - W / 2 + 3 && box.y2 < cy + W / 2 - 3)) return { W, cx, cy };
  }
  return null;
}

const oldMax = ["train", "val", "test"].reduce((m, s) => { const j = JSON.parse(fs.readFileSync(`${OLD}/${s}.json`, "utf8")); return { img: Math.max(m.img, ...j.images.map(i => i.id)), ann: Math.max(m.ann, 0, ...j.annotations.map(a => a.id)) }; }, { img: 0, ann: 0 });
let nextImg = oldMax.img + 1, nextAnn = oldMax.ann + 1;
for (const d of ["train", "val", "test"]) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });
const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
const tally = {};
const bump = (src, split, kind) => { const k = `${src} ${split} ${kind}`; tally[k] = (tally[k] || 0) + 1; };

function save(src, img, frame, W, cx, cy, box, kind) {
  const set = src.split(frame / FPS), name = `s${src.id}_f${String(frame).padStart(6, "0")}_${nextImg}.jpg`, k = SIZE / W;
  fs.writeFileSync(`${OUT}/${set}/${name}`, jpeg.encode({ data: Buffer.from(window(img, W, cx, cy)), width: SIZE, height: SIZE }, 92).data);
  sets[set].images.push({ id: nextImg, file_name: name, width: SIZE, height: SIZE, frame, seconds: +(frame / FPS).toFixed(2), source: src.id });
  if (box) { const x1 = (box.x1 - (cx - W / 2)) * k, y1 = (box.y1 - (cy - W / 2)) * k, x2 = (box.x2 - (cx - W / 2)) * k, y2 = (box.y2 - (cy - W / 2)) * k;
    sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: [+x1.toFixed(1), +y1.toFixed(1), +(x2 - x1).toFixed(1), +(y2 - y1).toFixed(1)], area: +((x2 - x1) * (y2 - y1)).toFixed(1), iscrowd: 0 }); }
  nextImg++; bump(src.id, set, kind);
}

for (const src of SOURCES) {
  const load = f => JSON.parse(fs.readFileSync(f, "utf8"));
  const bigT = load(src.bigFrom), limit = src.maxSeconds ? src.maxSeconds * FPS : Infinity;
  const T = { frames: bigT.frames, cropX: bigT.cropX, cropY: bigT.cropY, big: bigT.big };
  // A moment counts as "might have a ball" if a ball-like arc passes within about a second of it.
  const ballLike = new Set();
  for (const f of src.safeTracks) for (const t of load(f).tracks) for (const p of t.pts) for (let d = -25; d <= 25; d++) ballLike.add(p[0] + d);
  // Ball pictures: every point of every kept arc; where two scans found the same frame, the first listed wins.
  const pts = new Map();
  for (const f of src.posTracks) { const j = load(f); for (const t of j.tracks) for (const p of t.pts) if (!pts.has(p[0])) pts.set(p[0], { p, cropX: j.cropX, cropY: j.cropY }); }
  console.log(`source ${src.id}: ${pts.size} ball points, ${T.frames} frames`);

  if (src.positives) {
    const frames = [...pts.keys()].sort((a, b) => a - b), runs = [];
    for (const f of frames) { const r = runs[runs.length - 1]; if (r && f - r.end <= 8) r.end = f; else runs.push({ start: f, end: f }); }
    let done = 0;
    for (const r of runs) {
      const imgs = decode(src.video, src.rim, r.start, r.end - r.start + 1);
      for (let i = 0; i < imgs.length; i++) {
        const e = pts.get(r.start + i); if (!e) continue;
        const p = e.p, gx = e.cropX + 2 * p[2] - (src.rim[0] - 300), gy = e.cropY + 2 * p[3] - (src.rim[1] - 300), bw = p[4] * 2 + 3, bh = p[5] * 2 + 3;
        const box = { x1: gx - bw / 2, y1: gy - bh / 2, x2: gx + bw / 2, y2: gy + bh / 2 };
        const w = pickWindow(box); if (!w) continue;
        save(src, imgs[i], r.start + i, w.W, w.cx, w.cy, box, "ball");
      }
      if (++done % 20 === 0) console.log(`  ${src.id} ball runs ${done}/${runs.length}`);
    }
  }

  // "no ball" pictures: nowhere near a ball-sized blob. Hard ones have a big orange region (a shirt) in the window.
  const safe = f => f > 30 && f < Math.min(T.frames - 60, limit) && !ballLike.has(f);
  const hardPool = [], plainPool = [];
  for (let f = 31; f < Math.min(T.frames - 60, limit); f++) if (safe(f)) (T.big[f] >= 200 ? hardPool : plainPool).push(f);
  console.log(`  ${src.id}: ${hardPool.length} safe frames with a big orange region (shirt), ${plainPool.length} plain safe frames`);
  const pick = (pool, n) => { const out = []; for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]); return out; };
  for (const [pool, n, kind] of [[hardPool, src.hardNeg, "hardNeg"], [plainPool, src.plainNeg, "plainNeg"]]) {
    const wanted = pick(pool, n); let done = 0;
    for (const f of wanted) {
      const img = decode(src.video, src.rim, f, 1)[0]; if (!img) continue;
      const w = pickWindow(null); save(src, img, f, w.W, w.cx, w.cy, null, kind);
      if (++done % 100 === 0) console.log(`  ${src.id} ${kind} ${done}/${wanted.length}`);
    }
  }
}

// Merge with round one by hard-linking its pictures (no second copy on disk).
for (const d of ["train", "val", "test"]) fs.mkdirSync(`${MERGED}/${d}`, { recursive: true });
const merged = {};
for (const s of ["train", "val", "test"]) {
  const old = JSON.parse(fs.readFileSync(`${OLD}/${s}.json`, "utf8"));
  for (const im of old.images) { im.source = im.source || "4824"; const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${OLD}/${s}/${im.file_name}`, dst); }
  for (const im of sets[s].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${OUT}/${s}/${im.file_name}`, dst); }
  merged[s] = { images: [...old.images, ...sets[s].images], annotations: [...old.annotations, ...sets[s].annotations], categories: [{ id: 1, name: "ball" }] };
  fs.writeFileSync(`${MERGED}/${s}.json`, JSON.stringify(merged[s]));
  fs.writeFileSync(`${OUT}/${s}.json`, JSON.stringify({ ...sets[s], categories: [{ id: 1, name: "ball" }] }));
}
console.log("\nnew pictures by source / split / kind:"); for (const k of Object.keys(tally).sort()) console.log("  ", k.padEnd(28), tally[k]);
for (const s of ["train", "val", "test"]) console.log(`MERGED ${s}: ${merged[s].images.length} pictures, ${merged[s].annotations.length} with a ball`);
console.log("DONE");
