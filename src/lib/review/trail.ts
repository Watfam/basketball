import { REFERENCE_FPS } from "../vision/shotRules.ts";
import type { ReviewBox, ReviewRecord } from "./types.ts";

/**
 * The ball's path through one shot, from observed detections only, built to BREAK rather than mislead.
 * Association is the simple one: constant-velocity nearest neighbour, gated at 30 px per reference frame and a 0.5-2x size ratio
 * (Experiments 1 and 3 found it no worse than a Kalman tracker). A trail never joins: another ball within 1.5 ball widths of a point
 * (identity unclear), a box on a long-occupied rim spot with no flight before it (rim hardware), or points across a gap of more than
 * `reconstructMaxGap` missing processed frames (default 1). Interpolated points exist only inside such a gap and are typed "reconstructed".
 */
export const TRAIL = {
  minScore: 0.25,
  capPerRefFrame: 30,
  sizeRatio: [0.5, 2] as const,
  ambiguityWidths: 1.5,
  coastRefFrames: 8,
  observedUncertaintyPx: 1.74,
  /** Measured p95 error of reconstructing hidden observed points (Phase 4, results/trails.json), by hidden reference frames. */
  reconUncertaintyPx: [0, 2.85, 4.3, 6.07] as const,
  restRefFrames: 45,
  movingPxPerRefFrame: 6,
  zone: { halfWidth: 55, above: 50, below: 45 },
};

export type TrailPoint = {
  /** Reference-frame time relative to the shot's first rim sighting. */
  f: number;
  t: number;
  x: number;
  y: number;
  w: number;
  score: number | null;
  type: "observed" | "reconstructed";
  /** Image-space position uncertainty, px (window model pixels). */
  unc: number;
};
export type TrailGap = { fromT: number; toT: number; processedFramesMissing: number; reason: "no_detection" | "model_skipped" | "link_failed" | "ambiguous" | "rim_hardware" };
export type TrailEvent = { t: number; x: number; y: number; reason: "ambiguous" | "rim_hardware" };
export type Trail = {
  segments: TrailPoint[][];
  gaps: TrailGap[];
  events: TrailEvent[];
  /** Boxes dropped as probable rim hardware inside this shot's window. */
  rimHardwareBoxes: number;
  /** Boxes of static, long-occupied rim-hardware tracks present in the record and excluded from the choice of the ball's path. */
  rimHardwareNearby: number;
  rim: { x: number; y: number };
  hasTrail: boolean;
  rimZoneReached: boolean;
};

const cx = (b: ReviewBox) => (b.x1 + b.x2) / 2;
const cy = (b: ReviewBox) => (b.y1 + b.y2) / 2;
const wd = (b: ReviewBox) => b.x2 - b.x1;
export const refFrame = (tMs: number) => (tMs * REFERENCE_FPS) / 1000;

type Pt = { f: number; t: number; x: number; y: number; w: number; score: number; occ: boolean; fi: number; box: ReviewBox };
type Track = { pts: Pt[]; missed: number; id: number };

/** Constant-acceleration (two points each side) or linear fallback; returns the points between before and after at the given reference frames. */
export function interpolate(before: { f: number; x: number; y: number }[], after: { f: number; x: number; y: number }[], fs: number[]) {
  const pts = [...before.slice(-2), ...after.slice(0, 2)], t0 = pts[0].f, ts = pts.map((p) => p.f - t0);
  const fit = (vs: number[], deg: number) => {
    const m = deg + 1, A = Array.from({ length: m }, () => Array(m + 1).fill(0));
    for (let i = 0; i < ts.length; i += 1) { const r = Array.from({ length: m }, (_, k) => ts[i] ** k); for (let a = 0; a < m; a += 1) { for (let b = 0; b < m; b += 1) A[a][b] += r[a] * r[b]; A[a][m] += r[a] * vs[i]; } }
    for (let c = 0; c < m; c += 1) { let p = c; for (let r = c + 1; r < m; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < m; r += 1) if (r !== c) { const q = A[r][c] / A[c][c]; for (let k = c; k <= m; k += 1) A[r][k] -= q * A[c][k]; } }
    const co = A.map((row, i) => row[m] / row[i]);
    return (t: number) => co.reduce((s, c, k) => s + c * t ** k, 0);
  };
  const fx = fit(pts.map((p) => p.x), 1), fy = fit(pts.map((p) => p.y), pts.length >= 4 ? 2 : 1);
  return fs.map((f) => ({ f, x: fx(f - t0), y: fy(f - t0) }));
}

function associate(frames: { fi: number; f: number; t: number; boxes: ReviewBox[] }[]): Track[] {
  const tracks: Track[] = [];
  let nextId = 1, active: Track[] = [];
  for (const fr of frames) {
    const pairs: [number, number, number][] = [];
    active.forEach((tr, ti) => {
      const last = tr.pts[tr.pts.length - 1], prev = tr.pts[tr.pts.length - 2], dt = fr.f - last.f;
      const px = prev && last.f !== prev.f ? last.x + ((last.x - prev.x) / (last.f - prev.f)) * dt : last.x, py = prev && last.f !== prev.f ? last.y + ((last.y - prev.y) / (last.f - prev.f)) * dt : last.y;
      fr.boxes.forEach((b, bi) => {
        if (Math.hypot(cx(b) - last.x, cy(b) - last.y) > TRAIL.capPerRefFrame * Math.max(dt, 1)) return;
        const r = wd(b) / last.w; if (r < TRAIL.sizeRatio[0] || r > TRAIL.sizeRatio[1]) return;
        pairs.push([Math.hypot(cx(b) - px, cy(b) - py) + Math.abs(Math.log(r)) * 10 + (1 - b.score) * 4, ti, bi]);
      });
    });
    pairs.sort((a, b) => a[0] - b[0]);
    const usedT = new Set<number>(), usedB = new Set<number>();
    for (const [, ti, bi] of pairs) { if (usedT.has(ti) || usedB.has(bi)) continue; usedT.add(ti); usedB.add(bi); const b = fr.boxes[bi]; active[ti].pts.push({ f: fr.f, t: fr.t, x: cx(b), y: cy(b), w: wd(b), score: b.score, occ: !!b.occ, fi: fr.fi, box: b }); active[ti].missed = 0; }
    active.forEach((tr, ti) => { if (!usedT.has(ti)) tr.missed += fr.f - tr.pts[tr.pts.length - 1].f; });
    active = active.filter((tr) => fr.f - tr.pts[tr.pts.length - 1].f <= TRAIL.coastRefFrames);
    fr.boxes.forEach((b, bi) => { if (usedB.has(bi)) return; const tr: Track = { id: nextId++, missed: 0, pts: [{ f: fr.f, t: fr.t, x: cx(b), y: cy(b), w: wd(b), score: b.score, occ: !!b.occ, fi: fr.fi, box: b }] }; tracks.push(tr); active.push(tr); });
  }
  return tracks;
}

const inZone = (p: { x: number; y: number }, rim: { x: number; y: number }) =>
  Math.abs(p.x - rim.x) <= TRAIL.zone.halfWidth && p.y >= rim.y - TRAIL.zone.above && p.y <= rim.y + TRAIL.zone.below;

export function buildTrail(record: ReviewRecord, options: { reconstructMaxGap?: number } = {}): Trail {
  const maxGap = options.reconstructMaxGap ?? 1, rim = record.rim;
  const frames = record.frames.map((fr, fi) => ({ fi, f: refFrame(fr.t), t: fr.t, ran: fr.ran, boxes: fr.boxes.filter((b) => b.score >= TRAIL.minScore) }));
  const ran = frames.filter((x) => x.ran);
  const empty: Trail = { segments: [], gaps: [], events: [], rimHardwareBoxes: 0, rimHardwareNearby: 0, rim, hasTrail: false, rimZoneReached: false };
  if (ran.length < 3) return empty;
  const all = associate(ran);
  // a track that sits still on a long-occupied spot is rim hardware, not a candidate for the ball's path
  const extent = (tr: Track) => Math.max(Math.max(...tr.pts.map((p) => p.x)) - Math.min(...tr.pts.map((p) => p.x)), Math.max(...tr.pts.map((p) => p.y)) - Math.min(...tr.pts.map((p) => p.y)));
  const isHardware = (tr: Track) => tr.pts.length >= 3 && tr.pts.filter((p) => p.occ).length / tr.pts.length >= 0.6 && extent(tr) < 12;
  const tracks = all.filter((tr) => !isHardware(tr)), nearbyHardware = all.filter(isHardware).reduce((a, tr) => a + tr.pts.length, 0);
  // the shot's chain: the track with a sighting in the rim zone nearest the first sighting
  let best: { tr: Track; d: number } | null = null;
  for (const tr of tracks) for (const p of tr.pts) if (inZone(p, rim)) { const d = Math.abs(p.f); if (d <= 12 && (!best || d < best.d || (d === best.d && tr.pts.length > best.tr.pts.length))) best = { tr, d }; }
  if (!best) return { ...empty, rimHardwareNearby: nearbyHardware };
  const chain = best.tr.pts;
  // rim hardware: an occupied-spot box that did not arrive by flight is dropped
  const kept: Pt[] = []; let hardware = 0; const events: TrailEvent[] = [];
  chain.forEach((p, i) => {
    if (p.occ) {
      const sp = i > 0 ? Math.hypot(p.x - chain[i - 1].x, p.y - chain[i - 1].y) / Math.max(1, p.f - chain[i - 1].f) : 0;
      const flew = chain.slice(0, i).some((q, k) => k > 0 && p.f - q.f <= TRAIL.restRefFrames && Math.hypot(q.x - chain[k - 1].x, q.y - chain[k - 1].y) / Math.max(1, q.f - chain[k - 1].f) >= TRAIL.movingPxPerRefFrame);
      if (sp < 3 && !flew) { hardware += 1; events.push({ t: p.t, x: p.x, y: p.y, reason: "rim_hardware" }); return; }
    }
    kept.push(p);
  });
  // identity: another ball-like box within 1.5 widths at the same frame breaks the trail there
  const clean: Pt[] = [];
  for (const p of kept) {
    const rivals = frames[p.fi].boxes.filter((b) => b !== p.box && !b.occ && Math.hypot(cx(b) - p.x, cy(b) - p.y) <= TRAIL.ambiguityWidths * p.w);
    if (rivals.length) { events.push({ t: p.t, x: p.x, y: p.y, reason: "ambiguous" }); clean.push({ ...p, score: -1 }); } else clean.push(p);
  }
  const segments: TrailPoint[][] = [], gaps: TrailGap[] = [];
  let seg: TrailPoint[] | null = null, prev: Pt | null = null;
  const skippedBetween = (a: number, b: number) => frames.slice(a + 1, b).filter((x) => !x.ran).length;
  for (const p of clean) {
    if (p.score === -1) { if (seg) segments.push(seg); seg = null; if (prev) gaps.push({ fromT: prev.t, toT: p.t, processedFramesMissing: 0, reason: "ambiguous" }); prev = null; continue; }
    const pt: TrailPoint = { f: p.f, t: p.t, x: p.x, y: p.y, w: p.w, score: p.score, type: "observed", unc: TRAIL.observedUncertaintyPx };
    if (prev) {
      const gapFrames = p.fi - prev.fi - 1, skipped = skippedBetween(prev.fi, p.fi);
      if (gapFrames > 0 && gapFrames <= maxGap && skipped === 0 && seg) {
        const hiddenRef = Math.max(1, Math.round(p.f - prev.f) - 1), recs = interpolate(seg.filter((s) => s.type === "observed").slice(-2), [pt, ...clean.filter((c) => c.score !== -1 && c.f > p.f).slice(0, 1).map((c) => ({ f: c.f, x: c.x, y: c.y }))], frames.slice(prev.fi + 1, p.fi).map((x) => x.f));
        for (const r of recs) seg.push({ f: r.f, t: (r.f * 1000) / REFERENCE_FPS, x: r.x, y: r.y, w: prev.w, score: null, type: "reconstructed", unc: TRAIL.reconUncertaintyPx[Math.min(3, hiddenRef)] });
      } else if (gapFrames > 0) {
        gaps.push({ fromT: prev.t, toT: p.t, processedFramesMissing: gapFrames - skipped, reason: skipped > 0 ? "model_skipped" : "no_detection" }); if (seg) segments.push(seg); seg = null;
      }
    }
    if (!seg) seg = [];
    seg.push(pt); prev = p;
  }
  if (seg && seg.length) segments.push(seg);
  const out = segments.filter((s) => s.length);
  return { segments: out, gaps, events, rimHardwareBoxes: hardware, rimHardwareNearby: nearbyHardware, rim, hasTrail: out.some((s) => s.filter((p) => p.type === "observed").length >= 3), rimZoneReached: chain.some((p) => inZone(p, rim)) };
}
