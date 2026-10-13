// Can the rim be found without being tapped? Design-time test on the clips where the rim's place is known.
//   node 49-rim-finder.mjs            runs all setups and prints how far each guess is from the known rim (in the 416 px window units at that clip's scale)
// Idea: the rim is a thin, saturated red-orange arc that never moves (a ball and people do), with the white net just under it.
// Sample frames across the clip at half resolution, keep the red-orange pixels that are red-orange in most frames, cut them into blobs,
// score each blob (wide and thin, steady, white net under it), take the best.
import { spawnSync } from "node:child_process";
import jpeg from "jpeg-js";
import fs from "node:fs";
import path from "node:path";
const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const W = 1920, H = 1080, N = 14;
const SETUPS = [
  { id: "4839", video: "IMG_4839.MOV", rim: [1058, 450], scale: 1 },
  { id: "4840", video: "IMG_4840.MOV", rim: [1058, 450], scale: 1 },
  { id: "4844a", video: "IMG_4844.MOV", rim: [845, 100], scale: 2.11, until: 60 },
  { id: "4844b", video: "IMG_4844.MOV", rim: [952, 100], scale: 2.11, from: 66 },
  { id: "4851", video: "IMG_4851.MOV", rim: [950, 413], scale: 1.27 },
  { id: "4866", video: "IMG_4866.MOV", rim: [801, 413], scale: 1.86 },
  { id: "4867", video: "IMG_4867.MOV", rim: [1018, 474], scale: 1 },
  { id: "4872", video: "IMG_4872.MOV", rim: [1038, 462], scale: 1.18 },
  { id: "4873", video: "IMG_4873.MOV", rim: [1040, 508], scale: 1.94 },
  { id: "4874", video: "IMG_4874.MOV", rim: [1008, 520], scale: 1 },
];
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
const only = process.argv[2];
for (const s of SETUPS.filter((x) => !only || x.id === only)) {
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${REPO}/Training Video/${s.video}`]).stdout.toString());
  const from = s.from ?? 3, to = Math.min(s.until ?? dur - 3, dur - 3);
  const count = new Uint8Array(W * H); let used = 0; const frames = [];
  for (let i = 0; i < N; i++) {
    const t = from + ((to - from) * i) / (N - 1);
    const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(t), "-i", `${REPO}/Training Video/${s.video}`, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
    if (r.stdout.length < W * H * 3) continue;
    used++; const px = r.stdout; frames.push(px);
    for (let p = 0, q = 0; p < W * H; p++, q += 3) { const [h, sa, v] = hsv(px[q], px[q + 1], px[q + 2]); if ((h <= 30 || h >= 340) && sa >= 0.4 && v >= 0.28) count[p]++; }
  }
  // steady: red-orange in at least 70% of the frames
  const steady = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) steady[p] = count[p] >= used * 0.65 ? 1 : 0;
  // blobs
  const seen = new Uint8Array(W * H), blobs = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!steady[p0] || seen[p0]) continue;
    const stack = [p0]; seen[p0] = 1; let x0 = W, x1 = 0, y0 = H, y1 = 0, area = 0, sx = 0, sy = 0;
    while (stack.length) { const p = stack.pop(), x = p % W, y = (p / W) | 0; area++; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const q = ny * W + nx; if (steady[q] && !seen[q]) { seen[q] = 1; stack.push(q); } } }
    blobs.push({ x0, x1, y0, y1, area, cx: sx / area, cy: sy / area });
  }
  // score: wide and thin, and white-ish (the net) below it
  const last = frames[frames.length - 1];
  const scored = blobs.filter((b) => b.area >= 25).map((b) => {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1; let white = 0, tot = 0;
    for (let y = b.y1 + 2; y < Math.min(H, b.y1 + 2 + w); y++) for (let x = b.x0; x <= b.x1; x++) { const q = (y * W + x) * 3; tot++; if (last[q] > 170 && last[q + 1] > 170 && last[q + 2] > 170) white++; }
    const aspect = w / h, net = tot ? white / tot : 0;
    return { ...b, w, h, aspect, net, score: (aspect >= 1.8 && aspect <= 12 ? 1 : 0) * (0.3 + net) * Math.min(b.area, 600) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
    if (!best || best.score === 0) { console.log(s.id.padEnd(6), "no rim found; blobs:", blobs.length); continue; }
  const gx = (best.x0 + best.x1) / 2, gy = (best.y0 + best.y1) / 2;
  const errNative = Math.hypot(gx - s.rim[0], gy - s.rim[1]), errWin = errNative / s.scale;
  console.log(s.id.padEnd(6), `guess native (${Math.round(gx)}, ${Math.round(gy)}) truth (${s.rim[0]}, ${s.rim[1]})  error ${Math.round(errNative)} px = ${errWin.toFixed(0)} window px  ${errWin <= 20 ? "OK" : "OFF"}  [blob ${best.w}x${best.h}, net ${best.net.toFixed(2)}, ${blobs.length} blobs]`);
}
