// Independent oracle for "same camera pose": register whole-frame background edges (scenery, not the hoop detectors) over shift and scale.
// Output per pair: shift (fractions of the frame), scale, normalised correlation at the best fit, and the best correlation at scale 1/shift 0 for contrast.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { STILLS, CLIPS, KS } from "./lib.mjs";
const sharp = createRequire(import.meta.url)("sharp");
const W = 192, H = 108;
async function edgeMap(file) {
  const { data } = await sharp(file).greyscale().blur(1.2).resize(W, H, { kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  const e = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; e[i] = Math.hypot(data[i + 1] - data[i - 1], data[i + W] - data[i - W]); }
  // remove local mean so flat areas do not dominate
  let m = 0; for (const v of e) m += v; m /= e.length; for (let i = 0; i < e.length; i++) e[i] -= m;
  return e;
}
function warp(e, s) { // zoom about the centre by s (s>1 enlarges)
  const o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = (x - W / 2) / s + W / 2, sy = (y - H / 2) / s + H / 2;
    const x0 = Math.floor(sx), y0 = Math.floor(sy); if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) continue;
    const fx = sx - x0, fy = sy - y0, i = y0 * W + x0;
    o[y * W + x] = e[i] * (1 - fx) * (1 - fy) + e[i + 1] * fx * (1 - fy) + e[i + W] * (1 - fx) * fy + e[i + W + 1] * fx * fy;
  }
  return o;
}
function ncc(a, b, dx, dy) {
  let sa = 0, sb = 0, sab = 0, n = 0;
  const x0 = Math.max(0, dx), x1 = Math.min(W, W + dx), y0 = Math.max(0, dy), y1 = Math.min(H, H + dy);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const va = a[y * W + x], vb = b[(y - dy) * W + (x - dx)]; sa += va * va; sb += vb * vb; sab += va * vb; n++; }
  return n < W * H * 0.5 ? -1 : sab / Math.sqrt(sa * sb + 1e-9);
}
export async function register(fileA, fileB) {
  const A = await edgeMap(fileA), B = await edgeMap(fileB);
  let best = { c: -1 };
  const at0 = ncc(A, B, 0, 0);
  for (let si = -14; si <= 14; si++) {
    const s = Math.pow(1.025, si);
    const Bs = warp(B, s);
    for (let dy = -16; dy <= 16; dy++) for (let dx = -28; dx <= 28; dx++) { const c = ncc(A, Bs, dx, dy); if (c > best.c) best = { c, s, dx, dy }; }
  }
  return { shiftX: best.dx / W, shiftY: best.dy / H, scale: best.s, ncc: +best.c.toFixed(3), nccAtIdentity: +at0.toFixed(3) };
}
if (process.argv[1].endsWith("bgreg.mjs")) {
  const res = { within: {}, cross: {} };
  for (const c of CLIPS) { res.within[c] = await register(path.join(STILLS, `${c}-1.png`), path.join(STILLS, `${c}-9.png`)); console.log("within", c, JSON.stringify(res.within[c])); }
  for (let i = 0; i < CLIPS.length; i++) for (let j = i + 1; j < CLIPS.length; j++) { const k = `${CLIPS[i]}|${CLIPS[j]}`; res.cross[k] = await register(path.join(STILLS, `${CLIPS[i]}-5.png`), path.join(STILLS, `${CLIPS[j]}-5.png`)); console.log(k, JSON.stringify(res.cross[k])); }
  fs.mkdirSync(path.join(path.dirname(new URL(import.meta.url).pathname), "results"), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "results/background-registration.json"), JSON.stringify(res, null, 1));
}
