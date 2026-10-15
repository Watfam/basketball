// Registered observation metrics. Chains come from the Experiment-1 tracker with the cv_nearest associator, fed only the strategy's detections (score >= 0.25).
// Implementation notes (not changes to the criteria): the release is the LAST held-to-airborne transition of the chain before F; nothing is interpolated.
import { createTracker } from "../tracker/tracker.mjs";

const step = (thin) => thin; // processed frames are `thin` reference frames apart
export function chainFor(strategy, shot, thin, rimU, inZone) {
  const f0 = shot.F - 75, f1 = shot.F + 15, tr = createTracker({ associator: "cv_nearest", retainFrames: Infinity });
  for (let f = f0; f <= f1; f += 1) { if (f % thin) continue; tr.push(f, (strategy.byF.get(f) ?? []).filter((b) => b.score >= 0.25)); }
  const tracks = tr.all(), box = (o) => ({ x1: o.x - o.w / 2, y1: o.y - o.h / 2, x2: o.x + o.w / 2, y2: o.y + o.h / 2 });
  const cand = tracks.filter((t) => t.obs.some((o) => Math.abs(o.f - shot.F) <= 8 && inZone(box(o), rimU)));
  const moving = tracks.filter((t) => t.obs.filter((o) => o.f <= shot.F).length >= 3 && t.obs.filter((o) => o.speed >= 3).length >= 3);
  const chain = cand.sort((a, b) => b.obs.length - a.obs.length)[0] ?? null;
  return { chain, fragments: moving.length, tracks };
}

export function observe(chain, shot, thin, rimU) {
  const none = { chain: false, release: false, apex: false, approach: false, continuous: false, continuous_strict: false, eligible: false, gaps: [], flightPoints: 0, firstFlightF: null };
  if (!chain) return none;
  const obs = chain.obs.filter((o) => o.f <= shot.F), r = { ...none, chain: true };
  if (obs.length < 3) return r;
  // flight points: first obs from which the speed over 3 obs is >= 3 px/ref frame
  let first = -1; for (let i = 2; i < obs.length; i += 1) { const v = Math.hypot(obs[i].x - obs[i - 2].x, obs[i].y - obs[i - 2].y) / (obs[i].f - obs[i - 2].f); if (v >= 3) { first = i - 2; break; } }
  const fl = first >= 0 ? obs.slice(first) : []; r.flightPoints = fl.length; r.firstFlightF = fl.length ? fl[0].f : null;
  // gaps and continuity from the first flight point to F
  const gaps = []; for (let i = 1; i < fl.length; i += 1) { const d = (fl[i].f - fl[i - 1].f) / thin; if (d > 1) gaps.push({ at: fl[i - 1].f, frames: d - 1 }); }
  r.gaps = gaps; r.continuous_strict = fl.length >= 2 && gaps.length === 0; r.continuous = fl.length >= 2 && gaps.every((g) => g.frames <= 2);
  // release: the last run of >= 3 held obs (speed < 4) immediately followed (gap <= 2 processed frames) by >= 3 airborne obs whose speed rises through 8
  let rel = null;
  for (let i = obs.length - 4; i >= 2; i -= 1) {
    const held = [obs[i - 2], obs[i - 1], obs[i]]; if (!held.every((o) => o.speed < 4)) continue;
    const air = obs.slice(i + 1, i + 4); if (air.length < 3) continue;
    const ok = air.every((o, j) => (o.f - (j ? air[j - 1].f : obs[i].f)) / thin <= 3) && Math.max(...air.map((o) => o.speed)) >= 8 && air[0].speed >= 4;
    if (ok) { rel = { heldIdx: i, heldFrom: held[0].f, heldTo: obs[i].f, airFirstF: air[0].f }; break; }
  }
  if (rel) {
    r.release = true; r.releaseInfo = rel;
    const airborne = obs.slice(rel.heldIdx + 1), held = obs.slice(rel.heldIdx - 2, rel.heldIdx + 1);
    const e1 = airborne.find((o) => o.speed > 8); r.E1 = e1 ? e1.f - thin : null;
    const pts = airborne.slice(0, 8); if (pts.length >= 5) {
      // x linear, y quadratic in t (reference frames); least squares by normal equations
      const t0 = pts[0].f, T = pts.map((p) => p.f - t0);
      const fit = (cols, ys) => { const n = cols[0].length, m = cols.length, A = Array.from({ length: m }, () => Array(m + 1).fill(0)); for (let i = 0; i < n; i += 1) for (let a = 0; a < m; a += 1) { for (let b = 0; b < m; b += 1) A[a][b] += cols[a][i] * cols[b][i]; A[a][m] += cols[a][i] * ys[i]; } for (let c = 0; c < m; c += 1) { let p = c; for (let rr = c + 1; rr < m; rr += 1) if (Math.abs(A[rr][c]) > Math.abs(A[p][c])) p = rr; [A[c], A[p]] = [A[p], A[c]]; for (let rr = 0; rr < m; rr += 1) if (rr !== c) { const q = A[rr][c] / A[c][c]; for (let k = c; k <= m; k += 1) A[rr][k] -= q * A[c][k]; } } return A.map((row, i) => row[m] / row[i]); };
      const bx = fit([T.map(() => 1), T], pts.map((p) => p.x)), by = fit([T.map(() => 1), T, T.map((t) => t * t)], pts.map((p) => p.y));
      const cxh = held.reduce((a, o) => a + o.x, 0) / held.length, cyh = held.reduce((a, o) => a + o.y, 0) / held.length, wid = pts[0].w;
      let e2 = null; for (let t = 0; t >= -40; t -= 0.25) { const x = bx[0] + bx[1] * t, y = by[0] + by[1] * t + by[2] * t * t; if (Math.hypot(x - cxh, y - cyh) <= wid) { e2 = t0 + t; break; } }
      r.E2 = e2;
    }
    r.releasePoint = { x: held[held.length - 1].x, y: held[held.length - 1].y };
  }
  // apex: interior minimum-y with >= 3 observed points each side, >= 12 px above the first and last observed point, gaps near it <= 2 frames
  if (obs.length >= 7) {
    let mi = 0; obs.forEach((o, i) => { if (o.y < obs[mi].y) mi = i; });
    if (mi >= 3 && mi <= obs.length - 4 && obs[mi].y <= obs[0].y - 12 && obs[mi].y <= obs[obs.length - 1].y - 12) {
      const near = obs.filter((o) => Math.abs(o.f - obs[mi].f) <= 3 * thin); let okg = true; for (let i = 1; i < near.length; i += 1) if ((near[i].f - near[i - 1].f) / thin > 2) okg = false;
      r.apex = okg;
    }
  }
  // rim approach: >= 3 observed descending points in the band 50-120 px above the rim in the 20 frames before F
  const band = obs.filter((o) => o.f >= shot.F - 20 && o.y >= rimU.y - 120 && o.y <= rimU.y - 50); let desc = 0; for (let i = 1; i < band.length; i += 1) if (band[i].y > band[i - 1].y) desc += 1;
  r.approach = band.length >= 3 && desc >= 2;
  // reconstruction eligibility
  if (fl.length >= 8 && gaps.every((g) => g.frames <= 3)) { let mi = 0; fl.forEach((o, i) => { if (o.y < fl[mi].y) mi = i; }); r.eligible = mi >= 2 && fl.length - 1 - mi >= 2; }
  return r;
}
