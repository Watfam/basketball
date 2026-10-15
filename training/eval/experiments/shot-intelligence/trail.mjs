// Flight-path trails from the cv_nearest tracker's tracks: observed points, short reconstructed gaps, explicit breaks. Pure functions + one builder.
export const TRAIL = {
  maxGap: 3,            // processed frames: longest gap that may be bridged (and reconstructed)
  capPerRefFrame: 30,   // px per reference frame, the rule's own jump limit
  sizeRatio: [0.5, 2],
  ambiguityWidths: 1.5, // a competing box within this many ball widths makes the identity uncertain
  minCompetingScore: 0.25,
  observedUncertaintyPx: 1.74,
  reconUncertaintyPx: { free_flight: { 1: 2.85, 2: 4.30, 3: 6.07 }, near_rim: { 1: 2.85, 2: 4.30, 3: 6.07 } },   // amended in criteria-v2.json: the p95 error measured on these trails (eval-trails.mjs, masked observed points); the registered Experiment-1 values understated it
};

/** Least-squares polynomial (degree 1 or 2) through points {t, v}; returns a function of t. */
function polyFit(ts, vs, deg) {
  const n = ts.length, m = deg + 1, A = Array.from({ length: m }, () => Array(m + 1).fill(0));
  for (let i = 0; i < n; i += 1) { const row = Array.from({ length: m }, (_, k) => ts[i] ** k); for (let a = 0; a < m; a += 1) { for (let b = 0; b < m; b += 1) A[a][b] += row[a] * row[b]; A[a][m] += row[a] * vs[i]; } }
  for (let c = 0; c < m; c += 1) { let p = c; for (let r = c + 1; r < m; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < m; r += 1) if (r !== c) { const q = A[r][c] / A[c][c]; for (let k = c; k <= m; k += 1) A[r][k] -= q * A[c][k]; } }
  const co = A.map((row, i) => row[m] / row[i]); return (t) => co.reduce((s, c, k) => s + c * t ** k, 0);
}
/** Reconstruct the missing processed frames between observed points `before` and `after` (arrays of {f,x,y}, nearest last/first). Constant acceleration from two points each side when four exist, else linear. */
export function reconstruct(before, after, frames) {
  const pts = [...before.slice(-2), ...after.slice(0, 2)], t0 = pts[0].f, ts = pts.map((p) => p.f - t0), deg = pts.length >= 4 ? 2 : 1;
  const fx = polyFit(ts, pts.map((p) => p.x), deg === 2 ? 1 : 1), fy = polyFit(ts, pts.map((p) => p.y), deg);
  return frames.map((f) => ({ f, x: fx(f - t0), y: fy(f - t0) }));
}

/**
 * Build the trail of one shot from the tracker's tracks. `tracks`: track objects (with .obs {f,x,y,w,score}) belonging to the shot; `isClutter(id,f)`; `boxesAt(f)` returns the boxes of that frame;
 * `rim`; window [f0,f1] in reference frames; `thin` processed-frame spacing.
 */
export function buildTrail({ tracks, isClutter, boxesAt, rim, f0, f1, thin }) {
  const cand = new Map(), events = [];
  for (const t of tracks) for (const o of t.obs) { if (o.f < f0 || o.f > f1) continue; if (isClutter(t.id, o.f)) { events.push({ f: o.f, x: o.x, y: o.y, reason: "clutter", detail: "motionless at an occupied rim spot" }); continue; } (cand.get(o.f) ?? cand.set(o.f, []).get(o.f)).push({ ...o, id: t.id }); }
  const frames = [...cand.keys()].sort((a, b) => a - b), segments = [], gaps = [];
  let seg = null, prev = null;
  const close = () => { if (seg && seg.points.length) segments.push(seg); seg = null; };
  for (const f of frames) {
    const cs = cand.get(f);
    if (cs.length > 1) { events.push({ f, x: cs[0].x, y: cs[0].y, reason: "ambiguous", detail: `${cs.length} tracked balls in the shot's tracks at one frame` }); close(); prev = null; continue; }
    const c = cs[0], rivals = boxesAt(f).filter((b) => b.score >= TRAIL.minCompetingScore && Math.hypot((b.x1 + b.x2) / 2 - c.x, (b.y1 + b.y2) / 2 - c.y) > 1e-6 && Math.hypot((b.x1 + b.x2) / 2 - c.x, (b.y1 + b.y2) / 2 - c.y) <= TRAIL.ambiguityWidths * c.w);
    if (rivals.length) { events.push({ f, x: c.x, y: c.y, reason: "ambiguous", detail: "a competing box within 1.5 ball widths" }); close(); prev = null; continue; }
    if (prev) {
      const dt = f - prev.f, dist = Math.hypot(c.x - prev.x, c.y - prev.y), ratio = c.w / prev.w;
      const ok = dt <= TRAIL.maxGap * thin && dist <= TRAIL.capPerRefFrame * dt && ratio >= TRAIL.sizeRatio[0] && ratio <= TRAIL.sizeRatio[1];
      if (!ok) { gaps.push({ from: prev.f + thin, to: f - thin, frames: dt / thin - 1, reason: dt > TRAIL.maxGap * thin ? "gap_too_long" : "link_failed" }); close(); }
    }
    if (!seg) seg = { points: [] };
    seg.points.push({ f, x: c.x, y: c.y, w: c.w, score: c.score, id: c.id, type: "observed", unc: TRAIL.observedUncertaintyPx });
    prev = { f, x: c.x, y: c.y, w: c.w, id: c.id };
  }
  close();
  // reconstruction pass: inside each segment, fill 1-3 frame gaps between consecutive observed points
  for (const s of segments) {
    const out = [], obs = s.points;
    for (let i = 0; i < obs.length; i += 1) {
      out.push(obs[i]);
      const nxt = obs[i + 1]; if (!nxt) continue;
      const dt = nxt.f - obs[i].f; if (dt <= thin) continue;
      const missing = []; for (let g = obs[i].f + thin; g < nxt.f; g += thin) missing.push(g);
      const rec = reconstruct(obs.slice(Math.max(0, i - 1), i + 1), obs.slice(i + 1, i + 3), missing), region = obs[i].y < rim.y - 80 ? "free_flight" : "near_rim", k = missing.length;
      for (const r of rec) out.push({ f: r.f, x: r.x, y: r.y, w: obs[i].w, score: null, id: obs[i].id, type: "reconstructed", unc: TRAIL.reconUncertaintyPx[region][k] ?? TRAIL.reconUncertaintyPx[region][3] });
    }
    s.points = out;
  }
  for (let i = 1; i < segments.length; i += 1) { const a = segments[i - 1].points, b = segments[i].points, g = { from: a[a.length - 1].f + thin, to: b[0].f - thin, frames: (b[0].f - a[a.length - 1].f) / thin - 1 }; const why = events.find((e) => e.f > a[a.length - 1].f && e.f < b[0].f); if (!gaps.some((x) => x.from === g.from)) gaps.push({ ...g, reason: why ? why.reason : "break" }); }
  gaps.sort((a, b) => a.from - b.from);
  return { segments, gaps, events, thin };
}

/** Independent verifier of the link rule over a finished trail (written separately from the builder). Returns violations. */
export function verifyTrail(trail) {
  const bad = [];
  for (const s of trail.segments) {
    const o = s.points.filter((p) => p.type === "observed");
    for (let i = 1; i < o.length; i += 1) {
      const dt = o[i].f - o[i - 1].f, d = Math.hypot(o[i].x - o[i - 1].x, o[i].y - o[i - 1].y), r = o[i].w / o[i - 1].w;
      if (dt > TRAIL.maxGap * trail.thin) bad.push({ f: o[i].f, why: "gap too long inside a segment" });
      if (d > TRAIL.capPerRefFrame * dt) bad.push({ f: o[i].f, why: "jump over the cap" });
      if (r < TRAIL.sizeRatio[0] || r > TRAIL.sizeRatio[1]) bad.push({ f: o[i].f, why: "size ratio" });
    }
    for (const p of s.points) { if (p.type !== "observed" && p.type !== "reconstructed") bad.push({ f: p.f, why: "untyped point" }); }
    s.points.forEach((p, i) => { if (p.type === "reconstructed") { const a = s.points.slice(0, i).reverse().find((q) => q.type === "observed"), b = s.points.slice(i + 1).find((q) => q.type === "observed"); if (!a || !b || (b.f - a.f) / trail.thin - 1 > TRAIL.maxGap) bad.push({ f: p.f, why: "reconstructed outside a 1-3 frame gap" }); } });
  }
  return bad;
}
