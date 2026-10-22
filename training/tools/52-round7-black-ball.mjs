// Round seven: real positives of a BLACK/dark-grey ball, from IMG_4915 (filmed 2026-10-22 at Matt's request, after the app
// called every shot a miss with this ball). Every prior round's orange-ball proposals and filters are untouched; this source
// is additive and is exempt from the colour test (like IMG_4844's sky balls in round six), since there is no orange to check.
//
// Why a motion proposer, not just the model: ball-6 only fires on this ball about 9% of frames near the hoop (measured,
// training/eval/experiments/black-ball/REPORT.md), so seeding candidates from its own proposals (as round six did for the
// orange clips) would teach it only the handful of cases it already finds. Frame-to-frame motion, which does not care what
// colour the ball is, finds the rest; the circle-edge fit (round three's method, colour-blind) then confirms each one is
// really round, and an eye check (sheets here, by Claude) is the real filter before anything is trained on.
//
// `modeldets`/`merge` below (ball-6's own low-score proposals) were tried and NOT used: confirmed by the same circle fit but with
// no self-motion signal to lean on, most of them sit on the net or backboard structure at this clip's distance, not the ball.
// The pipeline actually used is: motion -> filter (with CR_MIN=10) -> render.
//
//   node 52-round7-black-ball.mjs motion               frame-diff candidates -> circle fit; writes labels/round7/4915-motion.json + sheet
//   CR_MIN=10 APPLY_FILTER=1 node 52-round7-black-ball.mjs filter motion
//                                                       colour + self-motion + static-prop + size filter; writes 4915-keep.json + eye-check sheet
//   node 52-round7-black-ball.mjs render                cut training windows from 4915-keep.json, merge with dataset14 -> dataset_v7
//
//   node 52-round7-black-ball.mjs modeldets             (tried, not used) ball-6's own low-score proposals -> circle fit -> 4915-model.json
//   node 52-round7-black-ball.mjs merge                 (tried, not used) combine motion + model, dedupe, sheet
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, WORK = `${REPO}/training/work/round7`, LABELS = `${REPO}/training/labels/round7`;
const VIDEO = process.env.VIDEO_OVERRIDE || "IMG_4915.MOV", FW = 1920, FH = 1080, FB = FW * FH * 3, SIZE = 416, FPS = 30000 / 1001;
const WIN = 120, RMIN = 6, RMAX = 30;
const TARGET_BALL = 23.7; // same target as round six, so this source renders to the same window scale convention
const PER_SOURCE_CAP = 300, REPEATS = 2;
// The area where the two players and the hoop actually are (frame_010/015/070 of the clip, eyeballed): excludes the house, bins and
// the far background. Motion outside this box (a passing car, leaves) is never looked at.
const ROI = { x0: 520, y0: 20, x1: 1560, y1: 960 };
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

// Mean colour inside the circle, so a skin-toned round thing (a head, a hand) can be rejected by eye from the stored numbers,
// and so the sheet can show them. No "must be dark" or "must be grey" test is applied here: the eye check decides.
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
function insideColour(img, cx, cy, r) {
  let n = 0, sr = 0, sg = 0, sb = 0, skin = 0;
  const R = Math.max(2, Math.round(r * 0.7));
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    if (x * x + y * y > R * R) continue;
    const px = Math.round(cx) + x, py = Math.round(cy) + y; if (px < 0 || py < 0 || px >= FW || py >= FH) continue;
    const q = (py * FW + px) * 3; n++; sr += img[q]; sg += img[q + 1]; sb += img[q + 2];
    const [h, sat, v] = hsv(img[q], img[q + 1], img[q + 2]); if (h >= 5 && h <= 40 && sat >= 0.15 && sat <= 0.55 && v >= 0.35) skin++;
  }
  return { r: Math.round(sr / n), g: Math.round(sg / n), b: Math.round(sb / n), luma: Math.round((sr * 77 + sg * 150 + sb * 29) / n / 256), skinShare: +(skin / n).toFixed(2) };
}

function sheet(items, out, cols = 8) {
  const CELL = 180, CROP = 90, W = cols * CELL, H = Math.ceil(items.length / cols) * CELL, buf = Buffer.alloc(W * H * 4, 40);
  items.forEach((it, idx) => {
    const sx = Math.max(0, Math.min(FW - CROP, Math.round(it.cx - CROP / 2))), sy = Math.max(0, Math.min(FH - CROP, Math.round(it.cy - CROP / 2))), sc = CELL / CROP;
    const ox = (idx % cols) * CELL, oy = Math.floor(idx / cols) * CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = ((sy + Math.floor(y / sc)) * FW + sx + Math.floor(x / sc)) * 3, d = ((oy + y) * W + ox + x) * 4; buf[d] = it.img[q]; buf[d + 1] = it.img[q + 1]; buf[d + 2] = it.img[q + 2]; buf[d + 3] = 255; }
    const rect = (x1, y1, x2, y2, col) => { const dot = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = col[0]; buf[d + 1] = col[1]; buf[d + 2] = col[2]; } }; for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); } };
    rect((it.box.x1 - sx) * sc, (it.box.y1 - sy) * sc, (it.box.x2 - sx) * sc, (it.box.y2 - sy) * sc, [50, 255, 50]);
  });
  fs.writeFileSync(out, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
  console.log("wrote", out, items.length, "tiles");
}

let seed = 20261022; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const inRoi = (x, y) => x >= ROI.x0 && x < ROI.x1 && y >= ROI.y0 && y < ROI.y1;

const phase = process.argv[2];

if (phase === "motion") {
  // Frame-to-frame luma diff inside the ROI, subsampled 3x for speed; a simple grid-cell clustering (not full flood fill) groups
  // moved pixels into blobs, cheap enough to run on every frame of a 7-minute clip. Blob size is filtered loosely (ball-sized at
  // this distance, about 15-70 px across); the circle fit afterwards is the real size and shape test.
  const STEP = 3, CELL = 24, cols = Math.ceil((ROI.x1 - ROI.x0) / CELL), rows = Math.ceil((ROI.y1 - ROI.y0) / CELL);
  let prev = null, kept = [], st = { frames: 0, cellsLit: 0, blobsFound: 0, circleOk: 0 }, sheetItems = [];
  const EVERY = 1; // every analysed frame (no thinning: a fast arc only shows a moving ball for a few frames)
  for await (const { n, img } of frames(VIDEO)) {
    st.frames++;
    if (n % EVERY !== 0) { prev = img; continue; }
    if (!prev) { prev = img; continue; }
    const lit = new Uint8Array(cols * rows);
    for (let y = ROI.y0; y < ROI.y1; y += STEP) for (let x = ROI.x0; x < ROI.x1; x += STEP) {
      const p = (y * FW + x) * 3, d = Math.abs(img[p] - prev[p]) + Math.abs(img[p + 1] - prev[p + 1]) + Math.abs(img[p + 2] - prev[p + 2]);
      if (d > 45) lit[Math.floor((y - ROI.y0) / CELL) * cols + Math.floor((x - ROI.x0) / CELL)] = 1;
    }
    const prevFrame = prev;
    prev = img;
    // connected cells (4-neighbour) -> blobs; a blob's size in cells times CELL gives a rough px size
    const seen = new Uint8Array(cols * rows), blobs = [];
    for (let i = 0; i < lit.length; i++) {
      if (!lit[i] || seen[i]) continue;
      const stack = [i], cells = []; seen[i] = 1;
      while (stack.length) {
        const k = stack.pop(); cells.push(k);
        const cx = k % cols, cy = Math.floor(k / cols);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx; if (lit[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      blobs.push(cells);
    }
    st.blobsFound += blobs.length;
    for (const cells of blobs) {
      if (cells.length < 1 || cells.length > 16) continue; // a ball at this distance is roughly 1-6 cells; people are much bigger
      let sx = 0, sy = 0; for (const k of cells) { sx += (k % cols) + 0.5; sy += Math.floor(k / cols) + 0.5; }
      const cx = ROI.x0 + (sx / cells.length) * CELL, cy = ROI.y0 + (sy / cells.length) * CELL;
      const ox = Math.max(0, Math.min(FW - WIN, Math.round(cx - WIN / 2))), oy = Math.max(0, Math.min(FH - WIN, Math.round(cy - WIN / 2)));
      const c = findCircle(img, ox, oy, 45);
      if (!c || c.support < 0.65 || c.r < 7 || c.r > 28) continue;
      const fcx = ox + c.cx, fcy = oy + c.cy;
      // Is the found circle itself moving, frame to frame, or did it just sit still while something else moved nearby (the rim, the
      // stand) and drag the coarse motion grid along with it? A real ball passing through is never the same here twice.
      let selfDiff = 0, selfN = 0;
      for (let dy = -c.r; dy <= c.r; dy += 2) for (let dx = -c.r; dx <= c.r; dx += 2) {
        if (dx * dx + dy * dy > c.r * c.r) continue;
        const px = Math.round(fcx + dx), py = Math.round(fcy + dy); if (px < 0 || py < 0 || px >= FW || py >= FH) continue;
        const q = (py * FW + px) * 3; selfDiff += Math.abs(img[q] - prevFrame[q]) + Math.abs(img[q + 1] - prevFrame[q + 1]) + Math.abs(img[q + 2] - prevFrame[q + 2]); selfN++;
      }
      const selfMotion = selfN ? +(selfDiff / selfN).toFixed(1) : 0;
      st.circleOk++;
      const info = insideColour(img, fcx, fcy, c.r);
      kept.push({ f: n, t: +(n / FPS).toFixed(2), cx: +fcx.toFixed(1), cy: +fcy.toFixed(1), cr: c.r, support: +c.support.toFixed(2), blobCells: cells.length, selfMotion, ...info, src: "motion" });
      if (rand() < 0.35 && sheetItems.length < 600) sheetItems.push({ img: Buffer.from(img), cx: fcx, cy: fcy, box: { x1: fcx - c.r - 1, y1: fcy - c.r - 1, x2: fcx + c.r + 1, y2: fcy + c.r + 1 } });
    }
    if (n % 1500 === 0) console.log("frame", n, "kept so far", kept.length);
  }
  fs.writeFileSync(`${LABELS}/4915-motion.json`, JSON.stringify({ id: "4915", video: VIDEO, stats: st, kept }));
  console.log("motion phase:", JSON.stringify(st), "kept", kept.length);
  const sample = []; const pool = [...sheetItems]; while (sample.length < 240 && pool.length) sample.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  sheet(sample, `${WORK}/sheet-motion.jpg`);
}

if (phase === "modeldets") {
  const d = JSON.parse(fs.readFileSync(`${REPO}/training/fixtures/dets6-4915.json`, "utf8")), k = (d.cropSize ?? 416) / SIZE;
  const native = d.detections.map((q) => ({ f: q.f, score: q.score, cx: d.cropX + ((q.x1 + q.x2) / 2) * k, cy: d.cropY + ((q.y1 + q.y2) / 2) * k, w: (q.x2 - q.x1) * k }));
  const byFrame = new Map(); for (const q of native) if (q.score >= 0.05) { if (!byFrame.has(q.f)) byFrame.set(q.f, []); byFrame.get(q.f).push(q); }
  const last = Math.max(...byFrame.keys()), kept = [], st = { proposed: 0, weak: 0, kept: 0 }, sheetItems = [];
  for await (const { n, img } of frames(VIDEO)) {
    if (n > last) break;
    const cands = byFrame.get(n); if (!cands) continue;
    for (const q of cands) {
      st.proposed++;
      if (!inRoi(q.cx, q.cy)) continue;
      const ox = Math.max(0, Math.min(FW - WIN, Math.round(q.cx - WIN / 2))), oy = Math.max(0, Math.min(FH - WIN, Math.round(q.cy - WIN / 2)));
      const c = findCircle(img, ox, oy, Math.max(10, q.w * 0.7));
      if (!c || c.support < 0.6) { st.weak++; continue; }
      const cx = ox + c.cx, cy = oy + c.cy;
      st.kept++; kept.push({ f: n, t: +(n / FPS).toFixed(2), cx: +cx.toFixed(1), cy: +cy.toFixed(1), cr: c.r, support: +c.support.toFixed(2), score: q.score, ...insideColour(img, cx, cy, c.r), src: "model" });
      sheetItems.push({ img: Buffer.from(img), cx, cy, box: { x1: cx - c.r - 1, y1: cy - c.r - 1, x2: cx + c.r + 1, y2: cy + c.r + 1 } });
    }
  }
  fs.writeFileSync(`${LABELS}/4915-model.json`, JSON.stringify({ id: "4915", video: VIDEO, stats: st, kept }));
  console.log("modeldets phase:", JSON.stringify(st));
  sheet(sheetItems, `${WORK}/sheet-model.jpg`);
}

if (phase === "merge") {
  const a = JSON.parse(fs.readFileSync(`${LABELS}/4915-motion.json`, "utf8")).kept;
  const b = JSON.parse(fs.readFileSync(`${LABELS}/4915-model.json`, "utf8")).kept;
  const all = [...a, ...b].sort((x, y) => x.f - y.f || x.cx - y.cx);
  // one per frame: if motion and model both found the same ball (close centres), keep the model one (it also has a score) marked "agreed"
  const byFrame = new Map();
  for (const k of all) { if (!byFrame.has(k.f)) byFrame.set(k.f, []); byFrame.get(k.f).push(k); }
  const merged = [];
  for (const [, list] of byFrame) {
    const used = new Set();
    for (let i = 0; i < list.length; i++) {
      if (used.has(i)) continue;
      let agree = false;
      for (let j = i + 1; j < list.length; j++) { if (used.has(j)) continue; if (Math.hypot(list[i].cx - list[j].cx, list[i].cy - list[j].cy) < 10) { used.add(j); agree = true; } }
      used.add(i);
      merged.push({ ...list[i], agreed: agree });
    }
  }
  merged.sort((x, y) => x.f - y.f);
  fs.writeFileSync(`${LABELS}/4915.json`, JSON.stringify({ id: "4915", video: VIDEO, merged }));
  console.log("merged:", merged.length, "(agreed by both methods:", merged.filter((m) => m.agreed).length, ", motion-only:", merged.filter((m) => m.src === "motion").length, ", model-only:", merged.filter((m) => m.src === "model").length, ")");
  const pool = [...merged], sample = []; while (sample.length < 400 && pool.length) sample.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  sample.sort((x, y) => x.f - y.f);
  const byF = new Map(sample.map((k) => [k.f, k])), last = Math.max(...byF.keys()), items = [];
  for await (const { n, img } of frames(VIDEO)) {
    if (n > last) break;
    const k = byF.get(n); if (!k) continue;
    items.push({ img: Buffer.from(img), cx: k.cx, cy: k.cy, box: { x1: k.cx - k.cr - 1, y1: k.cy - k.cr - 1, x2: k.cx + k.cr + 1, y2: k.cy + k.cr + 1 } });
  }
  sheet(items, `${WORK}/sheet-merged.jpg`);
}

// How neutral (grey/black, not blue sky, not green leaf, not skin) a stored colour sample is.
function satOf(k) { const mx = Math.max(k.r, k.g, k.b), mn = Math.min(k.r, k.g, k.b); return mx ? (mx - mn) / mx : 0; }
function hueOf(k) {
  const mx = Math.max(k.r, k.g, k.b), mn = Math.min(k.r, k.g, k.b), d = mx - mn; if (d === 0) return 0;
  let h; if (mx === k.r) h = ((k.g - k.b) / d) % 6; else if (mx === k.g) h = (k.b - k.r) / d + 2; else h = (k.r - k.g) / d + 4; h *= 60; return h < 0 ? h + 360 : h;
}
/** Ball-like by colour alone: low saturation (grey/black), not the skin-tone band the capture pass flagged, within a sane luma band
 * (a pure black shadow or a blown-out highlight has no information). Env overrides: SAT_MAX, LUMA_MIN, LUMA_MAX, SKIN_MAX, SUPPORT_MIN. */
// The hoop stand's plastic base cone (native px, eyeballed from the false hits it kept producing): a fixed dark round shape that a
// nearby shadow or leg repeatedly dragged the motion grid onto. Excluded outright rather than tuned around.
const EXCLUDE_RECTS = [{ x0: 875, y0: 395, x1: 940, y1: 715 }];
function excluded(k) { return EXCLUDE_RECTS.some((r) => k.cx >= r.x0 && k.cx <= r.x1 && k.cy >= r.y0 && k.cy <= r.y1); }
function ballLike(k) {
  const sat = satOf(k), satMax = Number(process.env.SAT_MAX ?? 0.28), lumaMin = Number(process.env.LUMA_MIN ?? 15), lumaMax = Number(process.env.LUMA_MAX ?? 170), skinMax = Number(process.env.SKIN_MAX ?? 0.15), supportMin = Number(process.env.SUPPORT_MIN ?? 0), selfMotionMin = Number(process.env.SELF_MOTION_MIN ?? 0), crMin = Number(process.env.CR_MIN ?? 0);
  // A small "circle" (near the radius floor) found in cluttered leaf texture is cheap to produce by chance out of thousands of tries;
  // every real sighting of this ball at this filming distance measured 10 px radius or more, so below that is treated as noise.
  return !excluded(k) && sat <= satMax && k.luma >= lumaMin && k.luma <= lumaMax && (k.skinShare ?? 0) <= skinMax && (k.support ?? 1) >= supportMin && (k.selfMotion ?? 999) >= selfMotionMin && (k.cr ?? 99) >= crMin;
}

if (phase === "sheet" || phase === "filter") {
  const which = process.argv[3] ?? "keep"; // "keep" reads labels/round7/4915-keep.json; "motion"/"model"/"merged" read the raw capture; "4915" reads the merged candidate pool
  const file = which === "keep" ? `${LABELS}/4915-keep.json` : which === "motion" ? `${LABELS}/4915-motion.json` : which === "model" ? `${LABELS}/4915-model.json` : `${LABELS}/4915.json`;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  let items0 = Array.isArray(raw) ? raw : raw.merged ?? raw.kept;
  const applyFilter = phase === "filter" || process.env.APPLY_FILTER === "1";
  const before = items0.length;
  if (applyFilter) {
    items0 = items0.filter(ballLike);
    // A real ball crosses the screen; it does not sit on the same few pixels more than once or twice across a seven-minute clip.
    // Anything that recurs at nearly the same spot more than STATIC_MAX times is a fixed part of the scene (a bolt, a stand edge,
    // a leaf gap that flickers with the light) that slipped past the colour and self-motion tests, not the ball.
    const STATIC_MAX = Number(process.env.STATIC_MAX ?? 2), GRID = Number(process.env.STATIC_GRID ?? 6);
    const cellCount = {};
    for (const k of items0) { const key = Math.round(k.cx / GRID) + "," + Math.round(k.cy / GRID); cellCount[key] = (cellCount[key] || 0) + 1; }
    const afterColour = items0.length;
    items0 = items0.filter((k) => cellCount[Math.round(k.cx / GRID) + "," + Math.round(k.cy / GRID)] <= STATIC_MAX);
    console.log(which, "items", before, `-> ${afterColour} after the colour filter -> ${items0.length} after dropping recurring-position junk`);
  } else {
    console.log(which, "items", before, "(unfiltered)");
  }
  if (phase === "filter") { fs.writeFileSync(`${LABELS}/4915-keep.json`, JSON.stringify(items0)); console.log("wrote", `${LABELS}/4915-keep.json`); }
  const pool = [...items0], sample = []; const want = Number(process.argv[4] ?? 400);
  while (sample.length < want && pool.length) sample.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  sample.sort((a, b) => a.f - b.f);
  const byF = new Map(), order = [];
  for (const k of sample) { if (!byF.has(k.f)) byF.set(k.f, []); byF.get(k.f).push(k); }
  const last = sample.length ? Math.max(...sample.map((k) => k.f)) : -1, items = [];
  for await (const { n, img } of frames(VIDEO)) {
    if (n > last) break;
    const list = byF.get(n); if (!list) continue;
    for (const k of list) { items.push({ img: Buffer.from(img), cx: k.cx, cy: k.cy, box: { x1: k.cx - k.cr - 1, y1: k.cy - k.cr - 1, x2: k.cx + k.cr + 1, y2: k.cy + k.cr + 1 } }); order.push(k); }
  }
  fs.writeFileSync(`${WORK}/sheet-${which}-manifest.json`, JSON.stringify(order.map((k, i) => ({ i, f: k.f, cx: k.cx, cy: k.cy, cr: k.cr, luma: k.luma, sat: +satOf(k).toFixed(2), hue: Math.round(hueOf(k)), skinShare: k.skinShare })), null, 1));
  sheet(items, `${WORK}/sheet-${which}${applyFilter ? "-filtered" : ""}.jpg`, Number(process.argv[5] ?? 8));
}

if (phase === "render") {
  const BASE = `${ROOT}/dataset14`, NEW = `${ROOT}/dataset15new`, MERGED = `${ROOT}/dataset15`;
  const oldJ = ["train", "val", "test"].map((s) => JSON.parse(fs.readFileSync(`${BASE}/${s}.json`, "utf8")));
  let nextImg = Math.max(...oldJ.flatMap((j) => j.images.map((i) => i.id))) + 1, nextAnn = Math.max(0, ...oldJ.flatMap((j) => j.annotations.map((a) => a.id))) + 1;
  for (const d of ["train", "val", "test"]) fs.mkdirSync(`${NEW}/${d}`, { recursive: true });
  const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
  const tally = {};

  const cut = (img, W, sx, sy) => {
    const out = new Uint8Array(SIZE * SIZE * 4), k = W / SIZE;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const fx = sx + (x + 0.5) * k - 0.5, fy = sy + (y + 0.5) * k - 0.5;
      const x0 = Math.max(0, Math.min(FW - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(FH - 1, Math.floor(fy))), x1 = Math.min(FW - 1, x0 + 1), y1 = Math.min(FH - 1, y0 + 1);
      const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0)), o = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) { const p = (xx, yy) => img[(yy * FW + xx) * 3 + c]; out[o + c] = p(x0, y0) * (1 - ax) * (1 - ay) + p(x1, y0) * ax * (1 - ay) + p(x0, y1) * (1 - ax) * ay + p(x1, y1) * ax * ay; }
      out[o + 3] = 255;
    }
    return out;
  };

  const keep = JSON.parse(fs.readFileSync(`${LABELS}/4915-keep.json`, "utf8"));
  const widths = keep.map((k) => 2 * k.cr + 2).sort((a, b) => a - b), med = widths[Math.floor(widths.length / 2)] || TARGET_BALL;
  const scale = +(med / TARGET_BALL).toFixed(3);
  const t0 = Math.min(...keep.map((k) => k.t)), t1 = Math.max(...keep.map((k) => k.t));
  const setOf = (t) => { const u = (t - t0) / Math.max(1, t1 - t0); return u < 0.7 ? "train" : u < 0.85 ? "val" : "test"; };
  const pool = [...keep], chosen = []; while (chosen.length < PER_SOURCE_CAP && pool.length) chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const byFrame = new Map(chosen.map((k) => [k.f, k])), last = Math.max(...byFrame.keys());
  let made = 0;
  for await (const { n, img } of frames(VIDEO)) {
    if (n > last) break;
    const k = byFrame.get(n); if (!k) continue;
    const box = { x1: k.cx - k.cr - 1, y1: k.cy - k.cr - 1, x2: k.cx + k.cr + 1, y2: k.cy + k.cr + 1 };
    for (let rep = 0; rep < REPEATS; rep++) {
      let placed = null;
      for (let tries = 0; tries < 30 && !placed; tries++) {
        const W = Math.round(SIZE * scale * Math.exp(Math.log(0.8) + rand() * (Math.log(1.25) - Math.log(0.8))));
        if (W >= FH) continue;
        let sx = k.cx - W / 2 + (rand() * 2 - 1) * 0.15 * W, sy = k.cy - W / 2 + (rand() * 2 - 1) * 0.15 * W;
        sx = Math.max(0, Math.min(FW - W, sx)); sy = Math.max(0, Math.min(FH - W, sy));
        if (box.x1 > sx + 4 && box.x2 < sx + W - 4 && box.y1 > sy + 4 && box.y2 < sy + W - 4) placed = { W, sx, sy };
      }
      if (!placed) continue;
      const set = setOf(k.t), name = `r7_4915_f${String(n).padStart(5, "0")}_${nextImg}.jpg`, kk = SIZE / placed.W;
      const px = cut(img, placed.W, placed.sx, placed.sy);
      fs.writeFileSync(`${NEW}/${set}/${name}`, jpeg.encode({ data: Buffer.from(px), width: SIZE, height: SIZE }, 92).data);
      sets[set].images.push({ id: nextImg, file_name: name, width: SIZE, height: SIZE, seconds: k.t, source: "4915" });
      const b = [(box.x1 - placed.sx) * kk, (box.y1 - placed.sy) * kk, (box.x2 - box.x1) * kk, (box.y2 - box.y1) * kk];
      sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: b.map((v) => +v.toFixed(1)), area: +(b[2] * b[3]).toFixed(1), iscrowd: 0 });
      nextImg++; made++; const key = `4915 ${set}`; tally[key] = (tally[key] || 0) + 1;
    }
  }
  console.log("4915 rendered", made, "of", chosen.length, "window scale", scale);

  for (const d of ["train", "val", "test"]) fs.mkdirSync(`${MERGED}/${d}`, { recursive: true });
  const merged = {};
  ["train", "val", "test"].forEach((s, si) => {
    for (const im of oldJ[si].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${BASE}/${s}/${im.file_name}`, dst); }
    for (const im of sets[s].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${NEW}/${s}/${im.file_name}`, dst); }
    merged[s] = { images: [...oldJ[si].images, ...sets[s].images], annotations: [...oldJ[si].annotations, ...sets[s].annotations], categories: [{ id: 1, name: "ball" }] };
    fs.writeFileSync(`${MERGED}/${s}.json`, JSON.stringify(merged[s]));
  });
  for (const k of Object.keys(tally).sort()) console.log("  ", k.padEnd(14), tally[k]);
  for (const s of ["train", "val", "test"]) console.log(`MERGED ${s}: ${merged[s].images.length} pictures, ${merged[s].annotations.length} with a ball`);
  console.log("DONE");
}
