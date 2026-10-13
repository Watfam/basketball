// Re-finding the hoop from the last time: match a picture of the hoop saved at the last aim against today's picture (same hoop, phone
// placed a little differently). Design-time test on clips where the rim's place is known in both.
//   node 50-hoop-register.mjs
// Method: pictures at 1/6 size, edge strength (so lighting doesn't matter), the saved patch (backboard, rim, net) slid over today's picture at
// several sizes, best normalised correlation wins. The rim moves with the patch.
import { spawnSync } from "node:child_process";
import path from "node:path";
const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const W = 320, H = 180, K = 6;
const CLIPS = {
  "4839": { video: "IMG_4839.MOV", rim: [1058, 450], scale: 1 },
  "4840": { video: "IMG_4840.MOV", rim: [1058, 450], scale: 1 },
  "4867": { video: "IMG_4867.MOV", rim: [1018, 474], scale: 1 },
  "4872": { video: "IMG_4872.MOV", rim: [1038, 462], scale: 1.18 },
  "4874": { video: "IMG_4874.MOV", rim: [1008, 520], scale: 1 },
  "4851": { video: "IMG_4851.MOV", rim: [950, 413], scale: 1.27 },
  "4866": { video: "IMG_4866.MOV", rim: [801, 413], scale: 1.86 },
  "4873": { video: "IMG_4873.MOV", rim: [1040, 508], scale: 1.94 },
};
function edges(id, t) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(t), "-i", `${REPO}/Training Video/${CLIPS[id].video}`, "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 24 });
  const g = new Float32Array(W * H); for (let i = 0; i < W * H; i++) g[i] = r.stdout[i];
  const e = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const gx = g[i + 1] - g[i - 1], gy = g[i + W] - g[i - W]; e[i] = Math.hypot(gx, gy); }
  return e;
}
function patchOf(e, cx, cy, hw, up, down) {
  const x0 = Math.max(0, Math.round(cx - hw)), x1 = Math.min(W, Math.round(cx + hw)), y0 = Math.max(0, Math.round(cy - up)), y1 = Math.min(H, Math.round(cy + down));
  const w = x1 - x0, h = y1 - y0, p = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = e[(y0 + y) * W + x0 + x];
  return { p, w, h, x0, y0 };
}
function resample(t, k) {
  const w = Math.max(8, Math.round(t.w * k)), h = Math.max(8, Math.round(t.h * k)), p = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(t.w - 1, x / k), sy = Math.min(t.h - 1, y / k), x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(t.w - 1, x0 + 1), y1 = Math.min(t.h - 1, y0 + 1), ax = sx - x0, ay = sy - y0; p[y * w + x] = t.p[y0 * t.w + x0] * (1 - ax) * (1 - ay) + t.p[y0 * t.w + x1] * ax * (1 - ay) + t.p[y1 * t.w + x0] * (1 - ax) * ay + t.p[y1 * t.w + x1] * ax * ay; }
  let m = 0; for (const v of p) m += v; m /= p.length; let n = 0; for (let i = 0; i < p.length; i++) { p[i] -= m; n += p[i] * p[i]; }
  return { p, w, h, norm: Math.sqrt(n) || 1 };
}
function search(e, tpl) {
  let best = { score: -2, x: 0, y: 0 };
  for (let y = 0; y + tpl.h <= H; y++) for (let x = 0; x + tpl.w <= W; x++) {
    let sum = 0, sq = 0; for (let yy = 0; yy < tpl.h; yy++) { const row = (y + yy) * W + x; for (let xx = 0; xx < tpl.w; xx++) { const v = e[row + xx]; sum += v; sq += v * v; } }
    const n = tpl.w * tpl.h, mean = sum / n, varr = Math.max(1e-6, sq - n * mean * mean);
    let dot = 0; for (let yy = 0; yy < tpl.h; yy++) { const row = (y + yy) * W + x, trow = yy * tpl.w; for (let xx = 0; xx < tpl.w; xx++) dot += tpl.p[trow + xx] * e[row + xx]; }
    const score = dot / (tpl.norm * Math.sqrt(varr)); if (score > best.score) best = { score, x, y };
  }
  return best;
}
const PAIRS = [["4839", "4840"], ["4839", "4867"], ["4839", "4872"], ["4839", "4874"], ["4867", "4874"], ["4867", "4872"], ["4874", "4872"], ["4839", "4851"], ["4839", "4866"], ["4839", "4873"]];
const REF_T = 25, NEW_T = 70;
const cache = {};
const get = (id, t) => (cache[id + t] ??= edges(id, t));
for (const [a, b] of PAIRS) {
  const A = CLIPS[a], B = CLIPS[b], eA = get(a, REF_T), eB = get(b, NEW_T);
  const ax = A.rim[0] / K, ay = A.rim[1] / K;
  // the patch: the backboard above the rim, the rim, the net below; sized in the reference clip's own scale
  const base = patchOf(eA, ax, ay, 55 * A.scale, 70 * A.scale, 22 * A.scale);
  let best = { score: -2 };
  for (const k of [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2.0]) {
    const tpl = resample(base, k); if (tpl.w >= W || tpl.h >= H) continue;
    const r = search(eB, tpl); if (r.score > best.score) best = { ...r, k, tpl };
  }
  const gx = (best.x + best.k * (ax - base.x0)) * K, gy = (best.y + best.k * (ay - base.y0)) * K;
  const err = Math.hypot(gx - B.rim[0], gy - B.rim[1]) / B.scale;
  console.log(`${a} -> ${b}: found at (${Math.round(gx)}, ${Math.round(gy)}) truth (${B.rim[0]}, ${B.rim[1]})  error ${err.toFixed(0)} window px ${err <= 20 ? "OK " : "OFF"}  match ${best.score.toFixed(2)}  size x${best.k} (true x${(B.scale / A.scale).toFixed(2)})`);
}
