// Cuts hoop-window training images from the footage and labels the ball in each.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";

const FPS = 30000 / 1001, SIZE = 416;
const ROOT = "/Users/WatfordFamily/Desktop/basketball-app/Training Video";
const VIDEO = ROOT + "/IMG_4824.MOV", OUT = ROOT + "/dataset";
const V = "/Users/WatfordFamily/Desktop/basketball-app/training/work";
// Decoded region: 600x600 native pixels centred on the rim (975, 460) of the 1920x1080 frame.
const RX = 675, RY = 160, RS = 600, RIM = [300, 300];
let seed = 12345; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const { rows } = JSON.parse(fs.readFileSync(V + "/orange.json", "utf8"));
const rowByFrame = new Map(); for (const r of rows) if (r[1] >= 12 && r[1] <= 400) rowByFrame.set(r[0], r);
const frames = [...rowByFrame.keys()].sort((a, b) => a - b);
const segs = []; for (const f of frames) { const s = segs[segs.length - 1]; if (s && f - s.end <= 8) s.end = f; else segs.push({ start: f, end: f }); }

function decode(startFrame, count) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(startFrame / FPS), "-i", VIDEO, "-an", "-vf", `fps=30000/1001,crop=${RS}:${RS}:${RX}:${RY}`, "-frames:v", String(count), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const fb = RS * RS * 3, out = []; for (let i = 0; i + fb <= r.stdout.length; i += fb) out.push(r.stdout.subarray(i, i + fb)); return out;
}
const isOrange = (r, g, b) => r > 105 && g < 0.58 * r && b < 0.42 * r && g > b + 4 && r - g > 45;

// Box around the orange blob nearest (gx, gy), found in the real picture.
function refine(img, gx, gy) {
  const R = 44, x0 = Math.max(0, Math.round(gx) - R), y0 = Math.max(0, Math.round(gy) - R), x1 = Math.min(RS, Math.round(gx) + R), y1 = Math.min(RS, Math.round(gy) + R);
  const w = x1 - x0, h = y1 - y0, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = ((y0 + y) * RS + x0 + x) * 3; mask[y * w + x] = isOrange(img[p], img[p + 1], img[p + 2]) ? 1 : 0; }
  let best = null, bd = 1e9;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { const d = Math.hypot(x + x0 - gx, y + y0 - gy); if (d < bd) { bd = d; best = [x, y]; } }
  if (!best || bd > 18) return null;
  const seen = new Uint8Array(w * h), stack = [best]; seen[best[1] * w + best[0]] = 1;
  let minx = best[0], maxx = best[0], miny = best[1], maxy = best[1], n = 0;
  while (stack.length) { const [x, y] = stack.pop(); n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx] && !seen[ny * w + nx]) { seen[ny * w + nx] = 1; stack.push([nx, ny]); } } }
  const bw = maxx - minx + 1, bh = maxy - miny + 1;
  if (bw < 9 || bh < 9 || bw > 46 || bh > 46 || bw / bh > 1.9 || bh / bw > 1.9 || n < 0.35 * bw * bh) return null; // too small, merged with the rim, or not round
  return { x1: x0 + minx - 1, y1: y0 + miny - 1, x2: x0 + maxx + 2, y2: y0 + maxy + 2 };
}

function window(img, W, cx, cy) { // bilinear resize of a WxW window to 416x416
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
function pickWindow(box) { // a window size and position that keeps the whole ball inside
  for (let t = 0; t < 12; t++) {
    const W = Math.round(SIZE * (0.85 + rand() * 0.35)), room = Math.min(110, RS / 2 - W / 2);
    const cx = RIM[0] + (rand() * 2 - 1) * room, cy = RIM[1] + (rand() * 2 - 1) * room;
    if (!box || (box.x1 > cx - W / 2 + 3 && box.x2 < cx + W / 2 - 3 && box.y1 > cy - W / 2 + 3 && box.y2 < cy + W / 2 - 3)) return { W, cx, cy };
  }
  return null;
}

for (const d of ["train", "val", "test"]) fs.mkdirSync(`${OUT}/${d}`, { recursive: true });
const sets = { train: { images: [], annotations: [] }, val: { images: [], annotations: [] }, test: { images: [], annotations: [] } };
let nextImg = 1, nextAnn = 1; const stats = { positives: 0, rejected: 0, negatives: 0 };
const splitOf = sec => sec < 650 ? "train" : sec < 800 ? "val" : "test";

function save(img, W, cx, cy, frame, box) {
  const set = splitOf(frame / FPS), name = `f${String(frame).padStart(6, "0")}_${nextImg}.jpg`, k = SIZE / W;
  const rgba = window(img, W, cx, cy);
  fs.writeFileSync(`${OUT}/${set}/${name}`, jpeg.encode({ data: Buffer.from(rgba), width: SIZE, height: SIZE }, 92).data);
  sets[set].images.push({ id: nextImg, file_name: name, width: SIZE, height: SIZE, frame, seconds: +(frame / FPS).toFixed(2) });
  if (box) { const x1 = (box.x1 - (cx - W / 2)) * k, y1 = (box.y1 - (cy - W / 2)) * k, x2 = (box.x2 - (cx - W / 2)) * k, y2 = (box.y2 - (cy - W / 2)) * k;
    sets[set].annotations.push({ id: nextAnn++, image_id: nextImg, category_id: 1, bbox: [+x1.toFixed(1), +y1.toFixed(1), +(x2 - x1).toFixed(1), +(y2 - y1).toFixed(1)], area: +((x2 - x1) * (y2 - y1)).toFixed(1), iscrowd: 0 }); }
  nextImg++;
}

let done = 0;
for (const s of segs) {
  const start = Math.max(0, s.start - 4), count = s.end - start + 5, imgs = decode(start, count);
  for (let i = 0; i < imgs.length; i++) {
    const f = start + i, row = rowByFrame.get(f);
    if (row) {
      const box = refine(imgs[i], 120 + 2 * row[2], 120 + 2 * row[3]);
      if (!box) { stats.rejected++; continue; }
      const w = pickWindow(box); if (!w) { stats.rejected++; continue; }
      save(imgs[i], w.W, w.cx, w.cy, f, box); stats.positives++;
    } else {
      const near = [-4,-3,-2,-1,1,2,3,4].some(d => rowByFrame.has(f + d));
      if (!near && rand() < 0.5) { const w = pickWindow(null); save(imgs[i], w.W, w.cx, w.cy, f, null); stats.negatives++; }
    }
  }
  if (++done % 40 === 0) console.log(`segments ${done}/${segs.length}  positives ${stats.positives}  rejected ${stats.rejected}  negatives ${stats.negatives}`);
}
// extra ball-free frames from stretches the tracker never fired in (five per decode)
const have = new Set(frames); let extra = 0, tries = 0;
while (extra < 1000 && tries < 1500) { tries++;
  const f = Math.floor(rand() * 28800) + 100;
  if ([-60,-30,0,30,60,90].some(d => have.has(f + d))) continue;
  const imgs = decode(f, 50); 
  for (const i of [0, 12, 24, 36, 48]) { if (!imgs[i]) continue; const w = pickWindow(null); save(imgs[i], w.W, w.cx, w.cy, f + i, null); stats.negatives++; extra++; }
}
for (const d of Object.keys(sets)) fs.writeFileSync(`${OUT}/${d}.json`, JSON.stringify({ images: sets[d].images, annotations: sets[d].annotations, categories: [{ id: 1, name: "ball" }] }));
const summary = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, { images: v.images.length, withBall: v.annotations.length }]));
fs.writeFileSync(V + "/dataset-summary.json", JSON.stringify({ stats, summary }, null, 1));
console.log("DONE", JSON.stringify({ stats, summary }));
