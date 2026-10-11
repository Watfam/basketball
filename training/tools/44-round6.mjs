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
// Which circles are used. A face or a shadow is round with strong edges but not orange inside; a second ball or orange shirt elsewhere in the
// picture means the picture holds an unboxed ball. IMG_4844's balls are dark against the sky, so its colour test waits for an eye check.
const COLOUR_MIN = 0.6, ELSEWHERE_MAX = 0.5, COLOUR_EXEMPT = new Set(["4844a", "4844b"]);
const REPEATS = 2; // renders per kept frame, each with its own zoom and offset

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

// Colour of the circle's inside, to tell a ball from a face or a shadow (both round, with strong edges). All the new clips have an
// orange ball. hue 8-32 degrees, saturation and value as given; features are stored so thresholds can be set offline against the sheets.
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
function insideColour(img, cx, cy, r) {
  let n = 0, o45 = 0, o60 = 0, sS = 0;
  const R = Math.max(2, Math.round(r * 0.7));
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    if (x * x + y * y > R * R) continue;
    const px = Math.round(cx) + x, py = Math.round(cy) + y; if (px < 0 || py < 0 || px >= FW || py >= FH) continue;
    const q = (py * FW + px) * 3, [h, sat, v] = hsv(img[q], img[q + 1], img[q + 2]); n++; sS += sat;
    if (h >= 8 && h <= 32 && v >= 0.25) { if (sat >= 0.45) o45++; if (sat >= 0.6) o60++; }
  }
  return { o45: +(o45 / n).toFixed(2), o60: +(o60 / n).toFixed(2), sat: +(sS / n).toFixed(2) };
}
// Strongly orange pixels elsewhere in the picture, in units of the ball's own area. A second ball, a held one or an orange shirt shows
// here; so does the rim, which is steady on a fixed camera, so compare with the source's median.
function orangeElsewhere(img, cx, cy, r) {
  const reach = 260; let c = 0;
  const x0 = Math.max(0, Math.round(cx - reach)), x1 = Math.min(FW - 1, Math.round(cx + reach)), y0 = Math.max(0, Math.round(cy - reach)), y1 = Math.min(FH - 1, Math.round(cy + reach));
  for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
    if (Math.hypot(x - cx, y - cy) < r * 2.2) continue;
    const q = (y * FW + x) * 3, [h, sat, v] = hsv(img[q], img[q + 1], img[q + 2]);
    if (h >= 10 && h <= 30 && sat >= 0.55 && v >= 0.35) c++;
  }
  return +((c * 4) / (Math.PI * r * r)).toFixed(2);
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

function usable(lab) {
  const med = lab.kept.length ? [...lab.kept].map((k) => k.elsewhere).sort((a, b) => a - b)[Math.floor(lab.kept.length / 2)] : 0;
  return lab.kept.filter((k) => (COLOUR_EXEMPT.has(lab.id) || k.o45 >= COLOUR_MIN) && k.elsewhere - med < ELSEWHERE_MAX);
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
        st.kept++; kept.push({ f: n, t: +(n / FPS).toFixed(2), cx: +cx.toFixed(1), cy: +cy.toFixed(1), r: c.r, support: +c.support.toFixed(2), score: +q.score.toFixed(2), detW: +q.w.toFixed(1), ...insideColour(img, cx, cy, c.r), elsewhere: orangeElsewhere(img, cx, cy, c.r) });
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

if (phase === "sheet") {
  // 48 random kept circles of one source (or all of them if fewer), for the eye check; reads the labels file, not the model
  for (const s of SOURCES.filter((x) => (process.argv[3] || "all") === "all" || x.id === process.argv[3])) {
    const lab = JSON.parse(fs.readFileSync(`${LABELS}/${s.id}.json`, "utf8")), pool = usable(lab), chosen = [];
    while (chosen.length < 48 && pool.length) chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const byFrame = new Map(chosen.map((k) => [k.f, k])), last = Math.max(...byFrame.keys()), items = [];
    for await (const { n, img } of frames(s.video)) {
      if (n > last) break;
      const k = byFrame.get(n); if (!k) continue;
      items.push({ f: n, img: Buffer.from(img), cx: k.cx, cy: k.cy, box: { x1: k.cx - k.r - 1, y1: k.cy - k.r - 1, x2: k.cx + k.r + 1, y2: k.cy + k.r + 1 } });
    }
    sheet(items, `${WORK}/sheet-${s.id}.jpg`);
    console.log(s.id, "sheet of", items.length);
  }
}

if (phase === "render") {
  const BASE = `${ROOT}/dataset13`, NEW = `${ROOT}/dataset14new`, MERGED = `${ROOT}/dataset14`;
  const oldJ = ["train", "val", "test"].map((s) => JSON.parse(fs.readFileSync(`${BASE}/${s}.json`, "utf8")));
  let nextImg = Math.max(...oldJ.flatMap((j) => j.images.map((i) => i.id))) + 1, nextAnn = Math.max(0, ...oldJ.flatMap((j) => j.annotations.map((a) => a.id))) + 1;
  for (const d of ["train", "val", "test"]) fs.mkdirSync(`${NEW}/${d}`, { recursive: true });
  const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
  const tally = {}, previews = [];

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

  for (const s of SOURCES) {
    const lab = JSON.parse(fs.readFileSync(`${LABELS}/${s.id}.json`, "utf8"));
    const pool = usable(lab); const chosen = [];
    while (chosen.length < PER_SOURCE_CAP && pool.length) chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const t0 = Math.min(...lab.kept.map((k) => k.t)), t1 = Math.max(...lab.kept.map((k) => k.t));
    console.log(s.id, "usable circles:", usable(lab).length, "of", lab.kept.length);
    const setOf = (t) => { const u = (t - t0) / Math.max(1, t1 - t0); return u < 0.7 ? "train" : u < 0.85 ? "val" : "test"; };
    const byFrame = new Map(chosen.map((k) => [k.f, k]));
    const last = Math.max(...byFrame.keys());
    let made = 0;
    for await (const { n, img } of frames(s.video)) {
      if (n > last) break;
      const k = byFrame.get(n); if (!k) continue;
      const box = { x1: k.cx - k.r - 1, y1: k.cy - k.r - 1, x2: k.cx + k.r + 1, y2: k.cy + k.r + 1 };
      for (let rep = 0; rep < REPEATS; rep++) {
      let placed = null;
      for (let tries = 0; tries < 30 && !placed; tries++) {
        const W = Math.round(SIZE * lab.scale * Math.exp(Math.log(0.8) + rand() * (Math.log(1.25) - Math.log(0.8))));
        if (W >= FH) continue;
        let sx = k.cx - W / 2 + (rand() * 2 - 1) * 0.15 * W, sy = k.cy - W / 2 + (rand() * 2 - 1) * 0.15 * W;
        sx = Math.max(0, Math.min(FW - W, sx)); sy = Math.max(0, Math.min(FH - W, sy));
        if (box.x1 > sx + 4 && box.x2 < sx + W - 4 && box.y1 > sy + 4 && box.y2 < sy + W - 4) placed = { W, sx, sy };
      }
      if (!placed) continue;
      const set = setOf(k.t), name = `r6_${s.id}_f${String(n).padStart(5, "0")}_${nextImg}.jpg`, kk = SIZE / placed.W;
      const px = cut(img, placed.W, placed.sx, placed.sy);
      fs.writeFileSync(`${NEW}/${set}/${name}`, jpeg.encode({ data: Buffer.from(px), width: SIZE, height: SIZE }, 92).data);
      sets[set].images.push({ id: nextImg, file_name: name, width: SIZE, height: SIZE, seconds: k.t, source: s.id });
      const b = [(box.x1 - placed.sx) * kk, (box.y1 - placed.sy) * kk, (box.x2 - box.x1) * kk, (box.y2 - box.y1) * kk];
      sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: b.map((v) => +v.toFixed(1)), area: +(b[2] * b[3]).toFixed(1), iscrowd: 0 });
      if (rand() < 0.1 && previews.length < 48) previews.push({ px, b });
      nextImg++; made++; const key = `${s.id} ${set}`; tally[key] = (tally[key] || 0) + 1;
      }
    }
    console.log(s.id, "rendered", made, "of", chosen.length, "scale", lab.scale);
  }

  // merge with round five
  for (const d of ["train", "val", "test"]) fs.mkdirSync(`${MERGED}/${d}`, { recursive: true });
  const merged = {};
  ["train", "val", "test"].forEach((s, si) => {
    for (const im of oldJ[si].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${BASE}/${s}/${im.file_name}`, dst); }
    for (const im of sets[s].images) { const dst = `${MERGED}/${s}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${NEW}/${s}/${im.file_name}`, dst); }
    merged[s] = { images: [...oldJ[si].images, ...sets[s].images], annotations: [...oldJ[si].annotations, ...sets[s].annotations], categories: [{ id: 1, name: "ball" }] };
    fs.writeFileSync(`${MERGED}/${s}.json`, JSON.stringify(merged[s]));
    fs.writeFileSync(`${NEW}/${s}.json`, JSON.stringify({ ...sets[s], categories: [{ id: 1, name: "ball" }] }));
  });
  // preview sheet of rendered pictures with their boxes
  const COLS = 8, CELL = 208, W = COLS * CELL, H = Math.ceil(previews.length / COLS) * CELL, buf = Buffer.alloc(W * H * 4, 40);
  previews.forEach(({ px, b }, idx) => {
    const ox = (idx % COLS) * CELL, oy = Math.floor(idx / COLS) * CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = (Math.floor(y * 2) * SIZE + Math.floor(x * 2)) * 4, d = ((oy + y) * W + ox + x) * 4; buf[d] = px[q]; buf[d + 1] = px[q + 1]; buf[d + 2] = px[q + 2]; buf[d + 3] = 255; }
    const dot = (x, y) => { x = Math.round(x / 2); y = Math.round(y / 2); if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = 0; buf[d + 1] = 255; buf[d + 2] = 0; } };
    for (let x = b[0]; x <= b[0] + b[2]; x++) { dot(x, b[1]); dot(x, b[1] + b[3]); } for (let y = b[1]; y <= b[1] + b[3]; y++) { dot(b[0], y); dot(b[0] + b[2], y); }
  });
  fs.writeFileSync(`${WORK}/render-preview.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
  for (const k of Object.keys(tally).sort()) console.log("  ", k.padEnd(14), tally[k]);
  for (const s of ["train", "val", "test"]) console.log(`MERGED ${s}: ${merged[s].images.length} pictures, ${merged[s].annotations.length} with a ball`);
  console.log("DONE");
}
