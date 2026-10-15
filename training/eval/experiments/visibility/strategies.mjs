// Composes the registered strategies from the per-tile detections of gen-tiles.mjs. Boxes come out in base-window units (u).
import fs from "node:fs";
import path from "node:path";
import { WORK, FRAME, readJSON, loadRegistry } from "./common.mjs";

export const TILE_ORDER = ["base", "up", "upleft", "left", "downleft", "down", "downright", "right", "upright"];
const iou = (a, b) => { const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1); if (w <= 0 || h <= 0) return 0; const i = w * h; return i / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - i); };
export function nms(boxes, thr = 0.4) { const s = [...boxes].sort((a, b) => b.score - a.score), out = []; for (const b of s) if (!out.some((o) => iou(o, b) > thr)) out.push(b); return out; }

export function loadClip(id) {
  const d = readJSON(`training/work/exp2/dets/${id}.json`), reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id);
  const g = d.geometry, k = 416 / g.side;
  const toU = (b) => ({ x1: (b.x1 - g.cropX) * k, y1: (b.y1 - g.cropY) * k, x2: (b.x2 - g.cropX) * k, y2: (b.y2 - g.cropY) * k, score: b.score });
  const resolve = (name) => { const s = d.specs[name]; return s.alias_of ?? name; };
  const tileDets = (name, f) => (d.dets[resolve(name)]?.[f] ?? []).map(toU);
  // S0: the saved production detections (window units already)
  const saved = readJSON(clip.detections.ball6), s0 = new Map();
  for (const x of saved.detections) (s0.get(x.f) ?? s0.set(x.f, []).get(x.f)).push({ x1: x.x1, y1: x.y1, x2: x.x2, y2: x.y2, score: x.score });
  const frames = []; for (const [a, b] of d.ranges) for (let f = a; f <= b; f += 1) frames.push(f);
  return { id, clip, d, g, k, frames, s0, tileDets, toU, resolve, rimU: { x: (g.rim[0] - g.cropX) * k, y: (g.rim[1] - g.cropY) * k } };
}

/** Per-frame detections (u units) and the number of inference runs per processed frame, for every strategy. thin: 1 = 30 fps, 2 = 15 fps. */
export function buildStrategies(C, thin = 1) {
  const frames = C.frames.filter((f) => f % thin === 0), out = {};
  const mk = (name, runs) => (out[name] = { name, runs, byF: new Map() });
  const S0 = mk("S0_fixed", 1), A1 = mk("A1", 1), A2 = mk("A2", 1), A3 = mk("A3_full_frame_reference", 1), D = mk("D_all_tiles", 9);
  const Bs = Object.fromEntries(["up", "left", "right", "upleft", "upright"].map((n) => [n, mk(`B_${n}`, 2)]));
  const Cf = mk("C_follow", 1), Cs = mk("C_scan", 1);
  // POST HOC (not registered): the production window plus a larger rim-centred window, two inferences
  const P1 = mk("POSTHOC_base+A1", 2), P2 = mk("POSTHOC_base+A2", 2);
  for (const f of frames) {
    const base = C.s0.get(f) ?? [];
    S0.byF.set(f, base);
    A1.byF.set(f, C.tileDets("A1", f)); A2.byF.set(f, C.tileDets("A2", f)); A3.byF.set(f, C.tileDets("A3", f));
    P1.byF.set(f, nms([...base, ...C.tileDets("A1", f)])); P2.byF.set(f, nms([...base, ...C.tileDets("A2", f)]));
    D.byF.set(f, nms([...base, ...TILE_ORDER.slice(1).flatMap((n) => C.tileDets(n, f))]));
    for (const [n, st] of Object.entries(Bs)) st.byF.set(f, nms([...base, ...C.tileDets(n, f)]));
  }
  // C: one tile per frame, chosen from past detections only
  const specs = C.d.specs, centre = (name) => { const s = specs[name]; return { x: s.ox + s.side / 2, y: s.oy + s.side / 2 }; };
  for (const [st, scan] of [[Cf, false], [Cs, true]]) {
    let track = null, lastSeen = -99, hist = [], scanIdx = 0, prevRange = null;
    for (const f of frames) {
      const rng = C.d.ranges.findIndex(([a, b]) => f >= a && f <= b); if (rng !== prevRange) { track = null; hist = []; lastSeen = -99; scanIdx = 0; prevRange = rng; }
      let tile;
      const tracking = f - lastSeen <= 4 * thin && hist.length > 0;
      if (tracking) {
        const a = hist[hist.length - 1], b = hist[hist.length - 2]; let px = a.x, py = a.y;
        if (b && a.f !== b.f) { const dt = (f - a.f) / (a.f - b.f); px = a.x + (a.x - b.x) * dt; py = a.y + (a.y - b.y) * dt; }
        tile = TILE_ORDER.map((n) => [n, Math.hypot(centre(n).x - px, centre(n).y - py)]).sort((p, q) => p[1] - q[1])[0][0];
      } else tile = scan ? TILE_ORDER[scanIdx++ % TILE_ORDER.length] : "base";
      const boxes = tile === "base" ? (C.s0.get(f) ?? []) : C.tileDets(tile, f);
      st.byF.set(f, boxes);
      const best = boxes.filter((b) => b.score >= 0.4).sort((p, q) => q.score - p.score)[0];
      if (best) { const n = C.g.side / 416; hist.push({ f, x: C.g.cropX + ((best.x1 + best.x2) / 2) * n, y: C.g.cropY + ((best.y1 + best.y2) / 2) * n }); if (hist.length > 3) hist.shift(); lastSeen = f; }
      st.chosen = (st.chosen ?? 0) + 1; (st.tiles ??= {})[tile] = (st.tiles[tile] ?? 0) + 1;
    }
  }
  return out;
}
