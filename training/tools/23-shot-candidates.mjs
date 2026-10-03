// Finds moments when a detected ball is in the zone around the rim, groups them into candidate shots, and
// writes one strip of zoomed native-resolution frames per candidate (NO boxes drawn, so the result of the shot can
// be judged by eye without the detector's opinion). Candidates are numbered; strips go in sheets of 4.
//
//   node 23-shot-candidates.mjs <dets.json> <video> <rimX> <rimY> (in the 416 window) <out dir> [gap frames=40]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , DETS, VIDEO, RX, RY, OUTDIR, GAPARG = "40"] = process.argv;
const D = JSON.parse(fs.readFileSync(DETS, "utf8")), FPS = D.fps, GAP = Number(GAPARG), rx = Number(RX), ry = Number(RY);
const zone = d => { const cx = (d.x1 + d.x2) / 2, cy = (d.y1 + d.y2) / 2; return Math.abs(cx - rx) <= 55 && cy >= ry - 50 && cy <= ry + 45; };
const hits = D.detections.filter(zone).sort((a, b) => a.f - b.f);
const cands = [];
for (const h of hits) { const c = cands[cands.length - 1]; if (c && h.f - c.end <= GAP) { c.end = h.f; c.n++; } else cands.push({ start: h.f, end: h.f, n: 1 }); }
const keep = cands.filter(c => c.n >= 2);
console.log(`${hits.length} detections in the rim zone -> ${cands.length} groups, ${keep.length} with 2+ detections`);
fs.mkdirSync(OUTDIR, { recursive: true });
const TILE = 160, CROP = 110, COLS = 12, STEP = 2;
const nativeRim = [D.cropX + rx, D.cropY + ry];
const ox0 = Math.max(0, Math.round(nativeRim[0] - CROP / 2)), oy0 = Math.max(0, Math.round(nativeRim[1] - CROP / 2 + 15));
const lines = [];
for (let s = 0; s * 5 < keep.length; s++) {
  const part = keep.slice(s * 5, s * 5 + 5), W = COLS * TILE, H = part.length * TILE, buf = Buffer.alloc(W * H * 4, 30);
  part.forEach((c, r) => {
    const first = Math.max(0, c.start - 6);
    for (let k = 0; k < COLS; k++) {
      const f = Math.round(first + k * STEP), t = f / FPS;
      const res = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(t), "-i", VIDEO, "-an", "-frames:v", "1", "-vf", `crop=${CROP}:${CROP}:${ox0}:${oy0},scale=${TILE}:${TILE}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 24 });
      if (!res.stdout || res.stdout.length < TILE * TILE * 3) continue;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const q = (y * TILE + x) * 3, d = ((r * TILE + y) * W + k * TILE + x) * 4; buf[d] = res.stdout[q]; buf[d + 1] = res.stdout[q + 1]; buf[d + 2] = res.stdout[q + 2]; buf[d + 3] = 255; }
      for (let m = 0; m <= k % 5; m++) for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) { const d = ((r * TILE + 2 + yy) * W + k * TILE + 2 + m * 5 + xx) * 4; buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255; }
    }
    lines.push(`sheet ${s + 1} row ${r + 1} = candidate ${s * 5 + r + 1}: frames ${Math.round(first)}-${Math.round(first + (COLS - 1) * STEP)} (${(first / FPS).toFixed(1)}s), ${c.n} detections in the zone`);
  });
  fs.writeFileSync(`${OUTDIR}/cand-${String(s + 1).padStart(2, "0")}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
}
fs.writeFileSync(`${OUTDIR}/candidates.txt`, lines.join("\n"));
fs.writeFileSync(`${OUTDIR}/candidates.json`, JSON.stringify(keep));
console.log(lines.length, "candidates;", Math.ceil(keep.length / 5), "sheets in", OUTDIR);
