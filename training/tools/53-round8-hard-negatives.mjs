// Round eight, part one: rim-hardware hard negatives. ball-7 still fires on IMG_4873's rim/backboard hardware (the 2026-10-14
// rim-phantom root cause, confirmed unchanged by `53-round8-hard-negatives.mjs find` below) because nothing has ever trained
// against it directly; the five live-rule filters tried on 2026-10-14 all failed, and that experiment's own conclusion was to
// fix it at the source. A detection that sits at nearly the same native pixel across almost the whole clip cannot be the ball
// (a ball is never in one place for minutes) — it is the hardware. This mines exactly those boxes as "no ball" crops.
//
//   node 53-round8-hard-negatives.mjs find <clip id> <dets7-*.json>     which of the model's own boxes are static-recurrent; writes
//                                                                       labels/round8/<id>-phantoms.json + an eye-check sheet
//   node 53-round8-hard-negatives.mjs crops <clip id>                  cuts the 416 px "no ball" training pictures from the kept phantom
//                                                                       locations; writes work/round8/negatives/<id>/*.jpg + manifest
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { loadRegistry, readJSON } from "../eval/lib/registry.mjs";

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, WORK = `${REPO}/training/work/round8`, LABELS = `${REPO}/training/labels/round8`;
const FW = 1920, FH = 1080, FB = FW * FH * 3, SIZE = 416;
fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(LABELS, { recursive: true });

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

function sheet(items, out, cols = 8) {
  const CELL = 180, CROP = 110, W = cols * CELL, H = Math.ceil(items.length / cols) * CELL, buf = Buffer.alloc(W * H * 4, 40);
  items.forEach((it, idx) => {
    const sx = Math.max(0, Math.min(FW - CROP, Math.round(it.cx - CROP / 2))), sy = Math.max(0, Math.min(FH - CROP, Math.round(it.cy - CROP / 2))), sc = CELL / CROP;
    const ox = (idx % cols) * CELL, oy = Math.floor(idx / cols) * CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = ((sy + Math.floor(y / sc)) * FW + sx + Math.floor(x / sc)) * 3, d = ((oy + y) * W + ox + x) * 4; buf[d] = it.img[q]; buf[d + 1] = it.img[q + 1]; buf[d + 2] = it.img[q + 2]; buf[d + 3] = 255; }
    const rect = (x1, y1, x2, y2, col) => { const dot = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = col[0]; buf[d + 1] = col[1]; buf[d + 2] = col[2]; } }; for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); } };
    rect((it.box.x1 - sx) * sc, (it.box.y1 - sy) * sc, (it.box.x2 - sx) * sc, (it.box.y2 - sy) * sc, [255, 60, 60]);
  });
  fs.writeFileSync(out, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
  console.log("wrote", out, items.length, "tiles");
}

const phase = process.argv[2];

if (phase === "find") {
  const id = process.argv[3], detsPath = process.argv[4];
  const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id), w = clip.window, k = w.cropSize / SIZE;
  const d = readJSON(detsPath);
  const native = d.detections.filter((x) => x.score >= 0.2).map((x) => ({ f: x.f, score: x.score, cx: w.cropX + ((x.x1 + x.x2) / 2) * k, cy: w.cropY + ((x.y1 + x.y2) / 2) * k, w: (x.x2 - x.x1) * k }));
  // cluster by a 15 px native grid; a cell the ball could never sit in for minutes is a CANDIDATE for the hardware, not the ball. But a real ball
  // also returns to the same rim-adjacent pixels on every one of a clip's many shots, which can look identical to that signature by span and count
  // alone (caught by eye on the first pass here) — so a cluster is kept as a phantom only if MOST of its detections fire when no shot is happening
  // at all (checked against this clip's own reference shot times from the shot-separation diagnostic): hardware is there between shots; a ball
  // is not.
  const GRID = 15, STATIC_SPAN_FRAMES = 1500, STATIC_MIN_COUNT = 15, NEAR_SHOT_FRAMES = 45, PHANTOM_MAX_NEAR_SHOT = 0.3;
  const diag = readJSON("training/eval/experiments/shot-separation/results/diagnostic-all.json");
  const refTimes = diag.reference[id]?.times ?? [];
  const cells = new Map();
  for (const n of native) { const key = Math.round(n.cx / GRID) + "," + Math.round(n.cy / GRID); (cells.get(key) ?? cells.set(key, []).get(key)).push(n); }
  const phantomCells = [];
  for (const [key, list] of cells) {
    const fs_ = list.map((x) => x.f), span = Math.max(...fs_) - Math.min(...fs_);
    const nearShot = list.filter((x) => refTimes.some((t) => Math.abs(t - x.f) <= NEAR_SHOT_FRAMES)).length;
    const nearShotFraction = list.length ? nearShot / list.length : 1;
    if (list.length >= STATIC_MIN_COUNT && span >= STATIC_SPAN_FRAMES && nearShotFraction <= PHANTOM_MAX_NEAR_SHOT) {
      phantomCells.push({ key, n: list.length, span, nearShotFraction: +nearShotFraction.toFixed(2), cx: list.reduce((s, x) => s + x.cx, 0) / list.length, cy: list.reduce((s, x) => s + x.cy, 0) / list.length, w: list.reduce((s, x) => s + x.w, 0) / list.length, frames: list.map((x) => x.f) });
    } else if (list.length >= STATIC_MIN_COUNT && span >= STATIC_SPAN_FRAMES) {
      console.log(`  (rejected, looks like a real ball returning to the rim) key=${key} n=${list.length} span=${span} near_shot=${(100 * nearShotFraction).toFixed(0)}%`);
    }
  }
  console.log(id, "static-recurrent cells:", phantomCells.length, "covering", phantomCells.reduce((s, c) => s + c.n, 0), "of", native.length, "detections");
  for (const c of phantomCells) console.log(`  (${c.cx.toFixed(0)}, ${c.cy.toFixed(0)}) n=${c.n} span=${c.span} frames ${Math.min(...c.frames)}-${Math.max(...c.frames)}`);
  fs.writeFileSync(`${LABELS}/${id}-phantoms.json`, JSON.stringify({ id, detsPath, grid: GRID, cells: phantomCells }, null, 1));

  // eye-check sheet: SHEET_PER_CELL sampled frames per phantom cell
  let seed = 20261023; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const wantPerCell = Number(process.env.SHEET_PER_CELL ?? 1);
  const picks2 = [];
  for (const c of phantomCells) { const pool = [...c.frames]; for (let i = 0; i < wantPerCell && pool.length; i++) { const f = pool.splice(Math.floor(rand() * pool.length), 1)[0]; const rec = native.find((x) => x.f === f && Math.abs(x.cx - c.cx) < GRID && Math.abs(x.cy - c.cy) < GRID); if (rec) picks2.push({ f, cx: rec.cx, cy: rec.cy, w: rec.w }); } }
  const byF = new Map(picks2.map((p) => [p.f, p])), last = picks2.length ? Math.max(...picks2.map((p) => p.f)) : -1, items = [];
  for await (const { n, img } of frames(clip.file.replace("Training Video/", ""))) {
    if (n > last) break;
    const p = byF.get(n); if (!p) continue;
    items.push({ img: Buffer.from(img), cx: p.cx, cy: p.cy, box: { x1: p.cx - p.w / 2, y1: p.cy - p.w / 2, x2: p.cx + p.w / 2, y2: p.cy + p.w / 2 } });
  }
  sheet(items, `${WORK}/sheet-${id}-phantoms.jpg`, 6);
}

if (phase === "crops") {
  const id = process.argv[3];
  const lab = JSON.parse(fs.readFileSync(`${LABELS}/${id}-phantoms.json`, "utf8"));
  const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id);
  const OUT = `${WORK}/negatives/${id}`; fs.mkdirSync(OUT, { recursive: true });
  let seed = 20261023; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  // up to 40 crops per phantom cell, spread across its frame span, each a 416 px window CENTRED on the phantom (so training sees
  // the hardware the way the live window would: mid-frame, not a tight crop on just the false box).
  const manifest = [];
  for (const cell of lab.cells) {
    const chosen = [...cell.frames].sort(() => rand() - 0.5).slice(0, 150);
    const byF = new Set(chosen), last = Math.max(...chosen);
    let made = 0;
    for await (const { n, img } of frames(clip.file.replace("Training Video/", ""))) {
      if (n > last) break;
      if (!byF.has(n)) continue;
      const half = SIZE / 2;
      const sx = Math.max(0, Math.min(FW - SIZE, Math.round(cell.cx - half + (rand() * 2 - 1) * 20)));
      const sy = Math.max(0, Math.min(FH - SIZE, Math.round(cell.cy - half + (rand() * 2 - 1) * 20)));
      const out = new Uint8Array(SIZE * SIZE * 4);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const p = ((sy + y) * FW + sx + x) * 3, o = (y * SIZE + x) * 4; out[o] = img[p]; out[o + 1] = img[p + 1]; out[o + 2] = img[p + 2]; out[o + 3] = 255; }
      const name = `${id}_phantom_${cell.key.replace(",", "_")}_f${String(n).padStart(5, "0")}.jpg`;
      fs.writeFileSync(`${OUT}/${name}`, jpeg.encode({ data: Buffer.from(out), width: SIZE, height: SIZE }, 92).data);
      manifest.push({ file: name, source: id, frame: n, cell: cell.key, sx, sy });
      made++;
    }
    console.log(id, cell.key, "made", made, "no-ball crops");
  }
  fs.writeFileSync(`${WORK}/negatives/${id}-manifest.json`, JSON.stringify(manifest, null, 1));
  console.log("TOTAL", manifest.length, "no-ball crops for", id);
}
