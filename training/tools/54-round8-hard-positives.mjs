// Round eight, part two: hard positives — real balls the current detector (ball-7) MISSES on an existing orange clip, found the same
// colour-blind way round seven found the black ball (motion, not the model's own weak proposals, confirmed by the circle-edge fit and a
// genuine self-motion check), but with the orange colour test turned back on (this ball is orange) and an explicit "the model already has
// this one" exclusion, so only real recall gaps are mined. Targets IMG_4873 first: it has both the known rim-hardware phantom (hard
// negatives already mined, 53-round8-hard-negatives.mjs) and the worst outcome accuracy of the eight clips after round seven (10 of 22
// right), at this clip's distance (scale 1.6154, the farthest/most zoomed of the eight) recall is the more likely lever.
//
//   node 54-round8-hard-positives.mjs find <clip id> <dets7-*.json>     motion candidates NOT already in dets7, orange-confirmed, circle-fit
//                                                                       confirmed; writes labels/round8/<id>-misses.json + eye-check sheet
//   node 54-round8-hard-positives.mjs crops <clip id>                   cuts 416 px training windows from the kept misses
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { loadRegistry, readJSON } from "../eval/lib/registry.mjs";

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const ROOT = `${REPO}/Training Video`, WORK = `${REPO}/training/work/round8`, LABELS = `${REPO}/training/labels/round8`;
const FW = 1920, FH = 1080, FB = FW * FH * 3, SIZE = 416;
const WIN = 120, RMIN = 6, RMAX = 30;
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
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
function orangeShare(img, cx, cy, r) {
  let n = 0, hit = 0;
  const R = Math.max(2, Math.round(r * 0.7));
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    if (x * x + y * y > R * R) continue;
    const px = Math.round(cx) + x, py = Math.round(cy) + y; if (px < 0 || py < 0 || px >= FW || py >= FH) continue;
    const q = (py * FW + px) * 3; n++;
    const [h, sat, v] = hsv(img[q], img[q + 1], img[q + 2]); if (h >= 8 && h <= 32 && sat >= 0.45 && v >= 0.25) hit++;
  }
  return n ? hit / n : 0;
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

const phase = process.argv[2];
let seed = 20261023; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

if (phase === "find") {
  const id = process.argv[3], detsPath = process.argv[4];
  const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id), w = clip.window, video = clip.file.replace("Training Video/", "");
  const d = readJSON(detsPath), k = w.cropSize / SIZE;
  const hasDetection = new Map(); // frame -> native boxes already found at score >= 0.2
  for (const x of d.detections) { if (x.score < 0.2) continue; const cx = w.cropX + ((x.x1 + x.x2) / 2) * k, cy = w.cropY + ((x.y1 + x.y2) / 2) * k; (hasDetection.get(x.f) ?? hasDetection.set(x.f, []).get(x.f)).push({ cx, cy }); }
  const ROI = { x0: w.cropX - 40, y0: w.cropY - 40, x1: w.cropX + w.cropSize + 40, y1: w.cropY + w.cropSize + 40 };
  const STEP = 3, CELL = 24, cols = Math.ceil((ROI.x1 - ROI.x0) / CELL), rows = Math.ceil((ROI.y1 - ROI.y0) / CELL);
  let prev = null, kept = [], st = { frames: 0, blobsFound: 0, alreadyFound: 0, circleOk: 0 }, sheetItems = [];
  for await (const { n, img } of frames(video)) {
    st.frames++;
    if (!prev) { prev = img; continue; }
    const lit = new Uint8Array(cols * rows);
    for (let y = ROI.y0; y < ROI.y1; y += STEP) for (let x = ROI.x0; x < ROI.x1; x += STEP) {
      const p = (y * FW + x) * 3, dd = Math.abs(img[p] - prev[p]) + Math.abs(img[p + 1] - prev[p + 1]) + Math.abs(img[p + 2] - prev[p + 2]);
      if (dd > 45) lit[Math.floor((y - ROI.y0) / CELL) * cols + Math.floor((x - ROI.x0) / CELL)] = 1;
    }
    const prevFrame = prev; prev = img;
    const seen = new Uint8Array(cols * rows), blobs = [];
    for (let i = 0; i < lit.length; i++) {
      if (!lit[i] || seen[i]) continue;
      const stack = [i], cells = []; seen[i] = 1;
      while (stack.length) { const kk = stack.pop(); cells.push(kk); const cx0 = kk % cols, cy0 = Math.floor(kk / cols); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx0 + dx, ny = cy0 + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const j = ny * cols + nx; if (lit[j] && !seen[j]) { seen[j] = 1; stack.push(j); } } }
      blobs.push(cells);
    }
    st.blobsFound += blobs.length;
    for (const cells of blobs) {
      if (cells.length < 1 || cells.length > 16) continue;
      let sx = 0, sy = 0; for (const kk of cells) { sx += (kk % cols) + 0.5; sy += Math.floor(kk / cols) + 0.5; }
      const cx = ROI.x0 + (sx / cells.length) * CELL, cy = ROI.y0 + (sy / cells.length) * CELL;
      // already found here by the model? skip, that is not a miss
      if ((hasDetection.get(n) ?? []).some((h) => Math.hypot(h.cx - cx, h.cy - cy) < 25)) { st.alreadyFound++; continue; }
      const ox = Math.max(0, Math.min(FW - WIN, Math.round(cx - WIN / 2))), oy = Math.max(0, Math.min(FH - WIN, Math.round(cy - WIN / 2)));
      const c = findCircle(img, ox, oy, 45);
      if (!c || c.support < 0.65 || c.r < 10 || c.r > 28) continue;
      const fcx = ox + c.cx, fcy = oy + c.cy;
      let selfDiff = 0, selfN = 0;
      for (let dy = -c.r; dy <= c.r; dy += 2) for (let dx = -c.r; dx <= c.r; dx += 2) { if (dx * dx + dy * dy > c.r * c.r) continue; const px = Math.round(fcx + dx), py = Math.round(fcy + dy); if (px < 0 || py < 0 || px >= FW || py >= FH) continue; const q = (py * FW + px) * 3; selfDiff += Math.abs(img[q] - prevFrame[q]) + Math.abs(img[q + 1] - prevFrame[q + 1]) + Math.abs(img[q + 2] - prevFrame[q + 2]); selfN++; }
      const selfMotion = selfN ? selfDiff / selfN : 0;
      if (selfMotion < 20) continue;
      const o = orangeShare(img, fcx, fcy, c.r);
      if (o < 0.5) continue;
      st.circleOk++;
      kept.push({ f: n, cx: +fcx.toFixed(1), cy: +fcy.toFixed(1), r: c.r, support: +c.support.toFixed(2), selfMotion: +selfMotion.toFixed(1), orangeShare: +o.toFixed(2) });
      if (sheetItems.length < 400) sheetItems.push({ img: Buffer.from(img), cx: fcx, cy: fcy, box: { x1: fcx - c.r - 1, y1: fcy - c.r - 1, x2: fcx + c.r + 1, y2: fcy + c.r + 1 } });
    }
    if (n % 1000 === 0) console.log("frame", n, "kept so far", kept.length);
  }
  // dedupe: a real miss can repeat for a few consecutive frames (the ball lingers in the gate), but not scattered one-offs all over the clip
  const GRID = 10, STATIC_MAX = 30;
  const cellCount = {};
  for (const k of kept) { const key = Math.round(k.cx / GRID) + "," + Math.round(k.cy / GRID); cellCount[key] = (cellCount[key] || 0) + 1; }
  const keptFiltered = kept.filter((k) => cellCount[Math.round(k.cx / GRID) + "," + Math.round(k.cy / GRID)] <= STATIC_MAX);
  console.log(id, JSON.stringify(st), "kept", kept.length, "-> after static-recurrence cap", keptFiltered.length);
  fs.writeFileSync(`${LABELS}/${id}-misses.json`, JSON.stringify({ id, detsPath, stats: st, kept: keptFiltered }));
  const pool = [...sheetItems], sample = []; while (sample.length < 240 && pool.length) sample.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  sheet(sample, `${WORK}/sheet-${id}-misses.jpg`);
}

if (phase === "crops") {
  const id = process.argv[3];
  const lab = JSON.parse(fs.readFileSync(`${LABELS}/${id}-misses.json`, "utf8"));
  const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id), video = clip.file.replace("Training Video/", "");
  const OUT = `${WORK}/positives/${id}`; fs.mkdirSync(OUT, { recursive: true });
  const w = clip.window;
  const chosen = [...lab.kept].sort(() => rand() - 0.5).slice(0, 200);
  const byF = new Map(chosen.map((k) => [k.f, k])), last = chosen.length ? Math.max(...chosen.map((k) => k.f)) : -1;
  const manifest = [];
  for await (const { n, img } of frames(video)) {
    if (n > last) break;
    const k = byF.get(n); if (!k) continue;
    const box = { x1: k.cx - k.r - 1, y1: k.cy - k.r - 1, x2: k.cx + k.r + 1, y2: k.cy + k.r + 1 };
    for (let rep = 0; rep < 2; rep++) {
      const Wsz = Math.round(SIZE * (w.scale ?? 1) * Math.exp(Math.log(0.8) + rand() * (Math.log(1.25) - Math.log(0.8))));
      let sx = k.cx - Wsz / 2 + (rand() * 2 - 1) * 0.15 * Wsz, sy = k.cy - Wsz / 2 + (rand() * 2 - 1) * 0.15 * Wsz;
      sx = Math.max(0, Math.min(FW - Wsz, sx)); sy = Math.max(0, Math.min(FH - Wsz, sy));
      if (!(box.x1 > sx + 4 && box.x2 < sx + Wsz - 4 && box.y1 > sy + 4 && box.y2 < sy + Wsz - 4)) continue;
      const kk = SIZE / Wsz, out = new Uint8Array(SIZE * SIZE * 4);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const fx = sx + (x + 0.5) / kk - 0.5, fy = sy + (y + 0.5) / kk - 0.5;
        const x0 = Math.max(0, Math.min(FW - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(FH - 1, Math.floor(fy))), x1 = Math.min(FW - 1, x0 + 1), y1 = Math.min(FH - 1, y0 + 1);
        const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0)), o = (y * SIZE + x) * 4;
        for (let c = 0; c < 3; c++) { const p = (xx, yy) => img[(yy * FW + xx) * 3 + c]; out[o + c] = p(x0, y0) * (1 - ax) * (1 - ay) + p(x1, y0) * ax * (1 - ay) + p(x0, y1) * (1 - ax) * ay + p(x1, y1) * ax * ay; }
        out[o + 3] = 255;
      }
      const name = `${id}_miss_f${String(n).padStart(5, "0")}_${rep}.jpg`;
      fs.writeFileSync(`${OUT}/${name}`, jpeg.encode({ data: Buffer.from(out), width: SIZE, height: SIZE }, 92).data);
      const b = [(box.x1 - sx) * kk, (box.y1 - sy) * kk, (box.x2 - box.x1) * kk, (box.y2 - box.y1) * kk];
      manifest.push({ file: name, bbox: b.map((v) => +v.toFixed(1)) });
    }
  }
  fs.writeFileSync(`${WORK}/positives/${id}-manifest.json`, JSON.stringify(manifest, null, 1));
  console.log("TOTAL", manifest.length, "hard-positive pictures for", id);
}
