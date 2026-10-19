// Shared helpers for the rapid-shot experiments: loading a clip's saved detections as window-relative sightings, finding approaches, fitting a flight.
import { loadVision } from "../../lib/transpile.mjs";
import { loadRegistry, readJSON } from "../../lib/registry.mjs";

export const CLIPS = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867", "IMG_4872", "IMG_4873", "IMG_4874"];
export const ROLE = (id) => loadRegistry().clips.find((c) => c.id === id).role;

export async function loadClip(id, thin = 1) {
  const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id), vision = await loadVision();
  const w = clip.window, [rx, ry] = w.rim_native;
  const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: w.scale, autoSize: false });
  const rim = core.window.rim;
  const d = readJSON(clip.detections.ball6);
  const frames = new Map();
  for (const x of d.detections) (frames.get(x.f) ?? frames.set(x.f, []).get(x.f)).push({ x1: x.x1, y1: x.y1, x2: x.x2, y2: x.y2, score: x.score });
  const kept = [];
  for (let f = 0; f < d.frames; f += 1) if (!(thin > 1 && f % thin)) kept.push(f);
  return { id, clip, vision, rim, frames, kept, total: d.frames };
}

/** Sightings as { f, dx, dy, w } relative to the rim, at the kept frames. */
export function sightings(c) {
  const out = [];
  for (const f of c.kept) for (const b of c.frames.get(f) ?? []) out.push({ f, dx: (b.x1 + b.x2) / 2 - c.rim.x, dy: (b.y1 + b.y2) / 2 - c.rim.y, w: b.x2 - b.x1, s: b.score });
  return out;
}

/**
 * Arrivals: a ball coming down toward the rim from at least 35 px above, reaching within 12 px of the rim line (dy >= -12), seen on a chain of
 * sightings that never rise by more than 2 px and never jump more than 45 px per frame (plus 12). Returns [{ f0, f1 }] with near-duplicate chains merged.
 */
export function arrivals(pts, thin = 1) {
  const found = [], used = new Set();
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    if (used.has(i) || p.dy > -35 || p.dy < -140 || Math.abs(p.dx) > 90) continue;
    let last = p; const chain = [i];
    for (let j = i + 1; j < pts.length; j += 1) {
      const q = pts[j];
      if (q.f - last.f > 6 * thin) break;
      if (q.f === last.f) continue;
      if (Math.hypot(q.dx - last.dx, q.dy - last.dy) > (45 * (q.f - last.f)) / thin + 12) continue;
      if (q.dy < last.dy - 2) continue;
      chain.push(j); last = q;
      if (q.dy >= -12) { found.push({ f0: p.f, f1: q.f }); for (const k of chain) used.add(k); break; }
    }
  }
  const merged = [];
  for (const a of found.sort((x, y) => x.f1 - y.f1)) {
    const m = merged[merged.length - 1];
    if (m && a.f1 - m.f1 <= 4 * thin) m.f0 = Math.min(m.f0, a.f0); else merged.push({ ...a });
  }
  return merged;
}

/** Least-squares quadratic y(f) and line x(f) through a chain; returns residual RMS (px) over both, the vertical acceleration (px per frame squared) and the point count. */
export function fitFlight(chain) {
  const n = chain.length;
  if (n < 5) return null;
  const t0 = chain[0].f;
  const fit = (ys, deg) => {
    const A = chain.map((p) => Array.from({ length: deg + 1 }, (_, k) => (p.f - t0) ** k));
    const AtA = Array.from({ length: deg + 1 }, (_, i) => Array.from({ length: deg + 1 }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
    const Atb = Array.from({ length: deg + 1 }, (_, i) => A.reduce((s, r, k) => s + r[i] * ys[k], 0));
    for (let i = 0; i <= deg; i += 1) {
      let piv = i; for (let r = i + 1; r <= deg; r += 1) if (Math.abs(AtA[r][i]) > Math.abs(AtA[piv][i])) piv = r;
      [AtA[i], AtA[piv]] = [AtA[piv], AtA[i]]; [Atb[i], Atb[piv]] = [Atb[piv], Atb[i]];
      for (let r = i + 1; r <= deg; r += 1) { const m = AtA[r][i] / AtA[i][i]; for (let c = i; c <= deg; c += 1) AtA[r][c] -= m * AtA[i][c]; Atb[r] -= m * Atb[i]; }
    }
    const co = Array(deg + 1).fill(0);
    for (let i = deg; i >= 0; i -= 1) { co[i] = (Atb[i] - co[i + 1 > deg ? 0 : i + 1] * 0 - AtA[i].slice(i + 1).reduce((s, v, k) => s + v * co[i + 1 + k], 0)) / AtA[i][i]; }
    const res = chain.map((p, k) => ys[k] - co.reduce((s, c, d) => s + c * (p.f - t0) ** d, 0));
    return { co, rms: Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n) };
  };
  const fy = fit(chain.map((p) => p.dy), 2), fx = fit(chain.map((p) => p.dx), 1);
  return { rms: Math.sqrt((fy.rms ** 2 + fx.rms ** 2) / 2), rmsY: fy.rms, rmsX: fx.rms, accel: 2 * fy.co[2], n };
}

/** Follows one ball from a start sighting: each frame, the nearest sighting within a jump limit, stopping after a gap of `maxGap` frames. */
export function follow(pts, startIdx, endF, { maxGap = 6, jump = 45, thin = 1 } = {}) {
  const chain = [pts[startIdx]];
  for (let j = startIdx + 1; j < pts.length; j += 1) {
    const q = pts[j], last = chain[chain.length - 1];
    if (q.f > endF) break;
    if (q.f === last.f) continue;
    if (q.f - last.f > maxGap * thin) break;
    if (Math.hypot(q.dx - last.dx, q.dy - last.dy) > (jump * (q.f - last.f)) / thin + 12) continue;
    chain.push(q);
  }
  return chain;
}

/** Runs the shipped counter over an arbitrary frame map (frame -> detections in window coordinates). Used for the spliced pairs. */
export function countFrames(c, frames, nFrames, thin = 1) {
  const w = c.clip.window, [rx, ry] = w.rim_native;
  const core = c.vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: w.scale, autoSize: false });
  const calls = [];
  for (let f = 0; f < nFrames; f += 1) {
    if (thin > 1 && f % thin) continue;
    calls.push(...core.push((f * 1000) / c.vision.shotRules.REFERENCE_FPS, frames.get(f) ?? []).calls);
  }
  calls.push(...core.flush());
  return calls.filter((x) => x.counted);
}

/** Sightings relative to the rim for frames in [a, b] of a frame map, only the kept (thinned) frames. */
export function sightingsOf(c, frames, a, b, thin = 1) {
  const out = [];
  for (let f = Math.max(0, a); f <= b; f += 1) {
    if (thin > 1 && f % thin) continue;
    for (const d of frames.get(f) ?? []) out.push({ f, dx: (d.x1 + d.x2) / 2 - c.rim.x, dy: (d.y1 + d.y2) / 2 - c.rim.y });
  }
  return out;
}
