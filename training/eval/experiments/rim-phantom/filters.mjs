// Candidate filters for the rim phantom, parameters FIXED by criteria.json. Each is causal: push(f, boxes) sees only the present and
// past (f = reference frame number of a processed frame; boxes are window-pixel detections at score >= 0.25) and returns the boxes the
// rule may use. Nothing here is imported by the app. If one is adopted it is rewritten in TypeScript in src/lib/vision/ with these tests.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cx = (b) => (b.x1 + b.x2) / 2, cy = (b) => (b.y1 + b.y2) / 2, wd = (b) => b.x2 - b.x1;
const CRITERIA = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "criteria.json"), "utf8"));
const CRITERIA_V3 = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "criteria-v3.json"), "utf8"));
const CRITERIA_V2 = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "criteria-v2.json"), "utf8"));
export const PARAMS = {
  A: CRITERIA.candidates.A_stationary_suppression.params,
  B: CRITERIA.candidates.B_motion_proof_track_gate.params,
  C50: CRITERIA.candidates.C50_size_gate.params,
  C60: CRITERIA.candidates.C60_size_gate.params,
  H: CRITERIA_V2.candidate.H_spot_memory_and_motion_proof.params,
  H2: CRITERIA_V3.candidate.H2_current_proof.params,
};

/** No filter. */
export function none() {
  return { name: "baseline", push: (f, boxes) => boxes, stats: () => ({}) };
}

/** A: drop a box whose spot has held a raw box in at least `share_threshold` of the trailing window's processed frames. */
export function stationary(p = PARAMS.A) {
  const frames = []; // { f, pts: [[x, y]] } of RAW boxes, oldest first
  let firstF = null;
  let dropped = 0, seen = 0;
  return {
    name: "A_stationary",
    push(f, boxes) {
      if (firstF === null) firstF = f;
      while (frames.length && frames[0].f <= f - p.window_ref_frames) frames.shift();
      const mature = f - firstF >= p.min_history_ref_frames;
      const out = [];
      for (const b of boxes) {
        seen += 1;
        let keep = true;
        if (mature) {
          const x = cx(b), y = cy(b);
          let hits = 0;
          for (const fr of frames) if (fr.pts.some(([px, py]) => Math.hypot(px - x, py - y) <= p.radius_px)) hits += 1;
          // this frame counts too (it is in the present, not the future)
          const share = (hits + 1) / (frames.length + 1);
          if (share >= p.share_threshold) keep = false;
        }
        if (keep) out.push(b); else dropped += 1;
      }
      frames.push({ f, pts: boxes.map((b) => [cx(b), cy(b)]) });
      return out;
    },
    stats: () => ({ seen, dropped }),
  };
}

/**
 * The tracker shared by B and H: chains boxes by constant-velocity prediction and reports, per box, whether its track has moved
 * `proof_distance_px` from where it started ("proven"). This is the seed of a persistent ball track: position, velocity, age and a flag.
 */
export function createTracker(p = PARAMS.B) {
  let tracks = []; // { pts: [{f,x,y}], sx, sy, proven }
  let started = 0, proved = 0, revoked = 0;
  return {
    /** Returns Map(box -> proven) for this frame. Boxes are visited best score first. */
    update(f, boxes) {
      tracks = tracks.filter((t) => f - t.pts[t.pts.length - 1].f <= p.max_gap_ref_frames);
      const used = new Set(), proven = new Map();
      for (const b of [...boxes].sort((a, c) => c.score - a.score)) {
        const x = cx(b), y = cy(b);
        let best = null, bd = Infinity;
        for (const t of tracks) {
          if (used.has(t)) continue;
          const l = t.pts[t.pts.length - 1], dt = f - l.f, q = t.pts.length > 1 ? t.pts[t.pts.length - 2] : null;
          const vx = q ? (l.x - q.x) / (l.f - q.f) : 0, vy = q ? (l.y - q.y) / (l.f - q.f) : 0;
          const d = Math.hypot(x - (l.x + vx * dt), y - (l.y + vy * dt));
          if (Math.hypot(x - l.x, y - l.y) <= p.gate_px_per_ref_frame * dt && d < bd) { bd = d; best = t; }
        }
        let t = best;
        if (t) t.pts.push({ f, x, y });
        else { t = { pts: [{ f, x, y }], sx: x, sy: y, proven: false, startF: f }; tracks.push(t); started += 1; }
        used.add(t);
        if (p.revoke_window_ref_frames) {
          // proof must be current: keep the track's recent points and revoke when they have not spread
          t.recent = (t.recent ?? []).filter((q) => f - q.f < p.revoke_window_ref_frames); t.recent.push({ f, x, y });
          if (t.proven && f - t.startF >= p.revoke_window_ref_frames && t.recent[0].f <= f - p.revoke_window_ref_frames + 2) {
            const xs = t.recent.map((q) => q.x), ys = t.recent.map((q) => q.y);
            if (Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < p.revoke_range_px) { t.proven = false; t.sx = x; t.sy = y; revoked += 1; }
          }
        }
        if (!t.proven && Math.hypot(x - t.sx, y - t.sy) >= p.proof_distance_px) { t.proven = true; proved += 1; }
        proven.set(b, t.proven);
      }
      for (const t of tracks) if (t.pts.length > 8) t.pts.splice(0, t.pts.length - 8);
      return proven;
    },
    stats: () => ({ tracks_started: started, tracks_proven: proved, proofs_revoked: revoked }),
  };
}

/** B: a box passes only once its track has moved `proof_distance_px` from its start. */
export function trackGate(p = PARAMS.B) {
  const tracker = createTracker(p);
  let seen = 0, dropped = 0;
  return {
    name: "B_track_gate",
    push(f, boxes) {
      const proven = tracker.update(f, boxes);
      return boxes.filter((b) => { seen += 1; if (proven.get(b)) return true; dropped += 1; return false; });
    },
    stats: () => ({ seen, dropped, ...tracker.stats() }),
  };
}

/**
 * H (round 2, criteria-v2.json): drop a box only if its spot is occupied (A's test) AND its track has not proven it moves (B's test).
 */
export function hybrid(p = PARAMS.H, name = "H_spot_memory_and_motion_proof") {
  const tracker = createTracker({ gate_px_per_ref_frame: p.gate_px_per_ref_frame, max_gap_ref_frames: p.max_gap_ref_frames, proof_distance_px: p.proof_distance_px, revoke_window_ref_frames: p.revoke_window_ref_frames, revoke_range_px: p.revoke_range_px });
  const frames = [];
  let firstF = null, seen = 0, dropped = 0, droppedAtOccupied = 0;
  return {
    name,
    push(f, boxes) {
      if (firstF === null) firstF = f;
      while (frames.length && frames[0].f <= f - p.window_ref_frames) frames.shift();
      const mature = f - firstF >= p.min_history_ref_frames;
      const proven = tracker.update(f, boxes);
      const out = [];
      for (const b of boxes) {
        seen += 1;
        let keep = true;
        if (mature && !proven.get(b)) {
          const x = cx(b), y = cy(b);
          let hits = 0;
          for (const fr of frames) if (fr.pts.some(([px, py]) => Math.hypot(px - x, py - y) <= p.radius_px)) hits += 1;
          if ((hits + 1) / (frames.length + 1) >= p.share_threshold) keep = false;
        }
        if (keep) out.push(b); else { dropped += 1; droppedAtOccupied += 1; }
      }
      frames.push({ f, pts: boxes.map((b) => [cx(b), cy(b)]) });
      return out;
    },
    stats: () => ({ seen, dropped, ...tracker.stats() }),
  };
}

/** C: drop boxes narrower than `min_width_px`. */
export function sizeGate(minWidth) {
  let seen = 0, dropped = 0;
  return {
    name: `C_size_gate_${minWidth}`,
    push(f, boxes) { return boxes.filter((b) => { seen += 1; const keep = wd(b) >= minWidth; if (!keep) dropped += 1; return keep; }); },
    stats: () => ({ seen, dropped }),
  };
}

/** Filters applied in order. */
export function chain(...filters) {
  return {
    name: filters.map((f) => f.name).join("+"),
    push: (f, boxes) => filters.reduce((b, fl) => fl.push(f, b), boxes),
    stats: () => Object.fromEntries(filters.map((f) => [f.name, f.stats()])),
  };
}

export const CONFIGS = {
  baseline: () => none(),
  A: () => stationary(),
  B: () => trackGate(),
  C50: () => sizeGate(PARAMS.C50.min_width_px),
  C60: () => sizeGate(PARAMS.C60.min_width_px),
  "C50+B": () => chain(sizeGate(PARAMS.C50.min_width_px), trackGate()),
  H: () => hybrid(),
  // sensitivity only (criteria-v2.json): the one threshold varied, not eligible for recommendation
  H2: () => hybrid(PARAMS.H2, "H2_current_proof"),
  H2_r15: () => hybrid({ ...PARAMS.H2, revoke_window_ref_frames: 15 }, "H2_r15"),
  H2_r30: () => hybrid({ ...PARAMS.H2, revoke_window_ref_frames: 30 }, "H2_r30"),
  H_share05: () => hybrid({ ...PARAMS.H, share_threshold: 0.05 }, "H_share05"),
  H_share02: () => hybrid({ ...PARAMS.H, share_threshold: 0.02 }, "H_share02"),
};
