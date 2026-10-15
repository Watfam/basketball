import fs from "node:fs";
import path from "node:path";
import { EVAL, ROOT, loadRegistry, readJSON } from "../../lib/registry.mjs";
export { EVAL, ROOT, loadRegistry, readJSON };
export const DIR = path.join(EVAL, "experiments/visibility"), RES = path.join(DIR, "results"), WORK = path.join(ROOT, "training/work/exp2");
export const FRAME = { w: 1920, h: 1080 };
export const crit = () => readJSON("training/eval/experiments/visibility/criteria.json");

/** The sampled shots of a clip, as registered: baseline-v0 counted and matched shots, every k-th, k = ceil(n/10). */
export function sampledShots(clipId) {
  const S = readJSON("training/eval/experiments/tracker/results/shots-round3.json");
  const per = S.clips[clipId]["30fps"].baseline_legacy.per_shot.filter((p) => p.seen).sort((a, b) => a.first - b.first);
  const k = Math.max(1, Math.ceil(per.length / 10)), out = [];
  for (let i = 0; i < per.length && out.length < 10; i += k) out.push({ F: per[i].first, truth: per[i].truth, v4: per[i].v4, ti: per[i].ti });
  return out;
}
export const SEG = { before: 75, after: 15 };

/** Window geometry in native pixels and the base-window unit. */
export function geometry(clip) {
  const w = clip.window, side = w.cropSize;
  return { cropX: w.cropX, cropY: w.cropY, side, scale: side / 416, rim: w.rim_native,
    toU: (x, y) => ({ x: ((x - w.cropX) * 416) / side, y: ((y - w.cropY) * 416) / side }),
    fromU: (x, y) => ({ x: w.cropX + (x * side) / 416, y: w.cropY + (y * side) / 416 }) };
}
const clampv = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** The tile set for a clip: nine base-scale tiles (named by offset), two larger rim-centred windows, the full frame. */
export function tileSpecs(clip) {
  const g = geometry(clip), s = g.side, specs = {}, seen = new Map();
  const names = { "0,0": "base", "0,-1": "up", "-1,-1": "upleft", "-1,0": "left", "-1,1": "downleft", "0,1": "down", "1,1": "downright", "1,0": "right", "1,-1": "upright" };
  for (const [key, name] of Object.entries(names)) {
    const [dx, dy] = key.split(",").map(Number);
    const ox = clampv(Math.round(g.cropX + dx * 0.75 * s), 0, FRAME.w - s), oy = clampv(Math.round(g.cropY + dy * 0.75 * s), 0, FRAME.h - s);
    const id = `${ox},${oy}`;
    if (seen.has(id)) { specs[name] = { ...specs[seen.get(id)], alias_of: seen.get(id) }; continue; }
    seen.set(id, name); specs[name] = { kind: "tile", ox, oy, side: s };
  }
  const cxm = g.cropX + s / 2, cym = g.cropY + s / 2;
  for (const [name, f] of [["A1", 1.5], ["A2", 2]]) { const side = Math.min(Math.round(s * f), FRAME.h); specs[name] = { kind: "window", ox: clampv(Math.round(cxm - side / 2), 0, FRAME.w - side), oy: clampv(Math.round(cym - side / 2), 0, FRAME.h - side), side }; }
  specs.A3 = { kind: "full", ox: 0, oy: 0, side: FRAME.w };
  return { geometry: g, specs };
}
export function videoFile(id) { return path.join(ROOT, "Training Video", fs.readdirSync(path.join(ROOT, "Training Video")).find((f) => f.startsWith(id))); }
/** Frame ranges (union of the segments, merged when they touch). */
export function ranges(shots) {
  const r = shots.map((s) => [Math.max(0, s.F - SEG.before), s.F + SEG.after]).sort((a, b) => a[0] - b[0]), out = [];
  for (const x of r) { const l = out[out.length - 1]; if (l && x[0] <= l[1] + 1) l[1] = Math.max(l[1], x[1]); else out.push([...x]); }
  return out;
}
