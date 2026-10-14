// Three SEPARATE tracking evaluations. Never combined into one score.
//
//  1. INTERPOLATION: hide k consecutive observations (k = 1..6); reconstruct them from the observations before AND after.
//  2. PREDICTION: predict the position h frames ahead (h = 1..6) from observations up to now only. Causality is by construction:
//     the function that predicts is handed the past and nothing else (a test proves changing the future changes nothing).
//  3. ASSOCIATION: given a track and several candidate detections in the next frame, does the method pick the true ball?
//
// Reference for 1 and 2 is the detector's own observation at the hidden frame: its noise is about 0.6 px (exploratory, Phase 1),
// and it says nothing about frames where the ball was never detected. Association has no identity truth in the real footage,
// so it is run on SYNTHETIC distractors and labelled as such; real-data association is reported unavailable.
import { describe, quantile, rng } from "./stats.mjs";

export const GATE_PX_PER_FRAME = 30; // the rule's own gate for following one ball (FALL.maxJumpPerFrame in shotRules.ts)
export const FREE_FLIGHT_Y = 150;    // above this, in window pixels (rim at y=190), a point is in free flight
export const MAX_K = 6;

/** Least-squares polynomial fit of degree <= 2 through (t, v) points. Returns coefficients c0 + c1 t + c2 t^2. */
export function polyfit(ts, vs, deg) {
  const n = deg + 1;
  const S = Array(2 * n - 1).fill(0), T = Array(n).fill(0);
  ts.forEach((t, i) => { let p = 1; for (let j = 0; j < 2 * n - 1; j += 1) { S[j] += p; if (j < n) T[j] += p * vs[i]; p *= t; } });
  const M = Array.from({ length: n }, (_, r) => [...Array.from({ length: n }, (_, c) => S[r + c]), T[r]]);
  for (let i = 0; i < n; i += 1) {
    let m = i;
    for (let r = i + 1; r < n; r += 1) if (Math.abs(M[r][i]) > Math.abs(M[m][i])) m = r;
    [M[i], M[m]] = [M[m], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) return null;
    for (let r = i + 1; r < n; r += 1) { const k = M[r][i] / M[i][i]; for (let c = i; c <= n; c += 1) M[r][c] -= k * M[i][c]; }
  }
  const co = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) { let v = M[i][n]; for (let c = i + 1; c < n; c += 1) v -= M[i][c] * co[c]; co[i] = v / M[i][i]; }
  return co;
}
const evalPoly = (co, t) => co.reduce((a, c, i) => a + c * t ** i, 0);

/**
 * Runs of consecutive processed frames (spacing `step` reference frames), each with exactly ONE detection, successive centres
 * within the same-ball gate. `dets`: [{ f, x1, y1, x2, y2, score }]. step = 2 stands for the live 15 fps loop (even frames).
 */
export function buildRuns(dets, { step = 1, minScore = 0.25 } = {}) {
  const byF = new Map();
  for (const d of dets) if (d.score >= minScore) (byF.get(d.f) ?? byF.set(d.f, []).get(d.f)).push(d);
  const pt = (f) => { const l = byF.get(f); if (!l || l.length !== 1) return null; const d = l[0]; return { f, x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 }; };
  const frames = [...byF.keys()].filter((f) => f % step === 0).sort((a, b) => a - b);
  const runs = [];
  let cur = [];
  for (const f of frames) {
    const p = pt(f);
    const last = cur[cur.length - 1];
    if (p && last && f - last.f === step && Math.hypot(p.x - last.x, p.y - last.y) <= GATE_PX_PER_FRAME * step) cur.push(p);
    else { if (cur.length) runs.push(cur); cur = p ? [p] : []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

// ---- interpolation methods: before = observed points before the gap (oldest first), after = observed points after it, t = hidden frame
export const INTERPOLATORS = {
  linear: (before, after, t) => {
    const a = before[before.length - 1], b = after[0], u = (t - a.f) / (b.f - a.f);
    return { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y) };
  },
  constant_velocity: (before, after, t) => {
    // forward from the two points before, backward from the two points after, blended by distance to each side
    const [a0, a1] = before.slice(-2), [b0, b1] = after.slice(0, 2);
    const fx = a1.x + ((a1.x - a0.x) / (a1.f - a0.f)) * (t - a1.f), fy = a1.y + ((a1.y - a0.y) / (a1.f - a0.f)) * (t - a1.f);
    const bx = b0.x + ((b1.x - b0.x) / (b1.f - b0.f)) * (t - b0.f), by = b0.y + ((b1.y - b0.y) / (b1.f - b0.f)) * (t - b0.f);
    const u = (t - a1.f) / (b0.f - a1.f);
    return { x: (1 - u) * fx + u * bx, y: (1 - u) * fy + u * by };
  },
  constant_acceleration: (before, after, t) => {
    // one quadratic per axis, least squares through the two points before and the two after (acceleration is fitted, not assumed)
    const pts = [...before.slice(-2), ...after.slice(0, 2)], t0 = pts[0].f, ts = pts.map((p) => p.f - t0);
    const cx = polyfit(ts, pts.map((p) => p.x), 2), cy = polyfit(ts, pts.map((p) => p.y), 2);
    return cx && cy ? { x: evalPoly(cx, t - t0), y: evalPoly(cy, t - t0) } : null;
  },
};

// ---- prediction methods: past = the last observed points (oldest first). NOTHING after them is ever passed in.
export const PREDICTORS = {
  last_value: (past, t) => ({ x: past[past.length - 1].x, y: past[past.length - 1].y }),
  constant_velocity: (past, t) => {
    const [a, b] = past.slice(-2);
    return { x: b.x + ((b.x - a.x) / (b.f - a.f)) * (t - b.f), y: b.y + ((b.y - a.y) / (b.f - a.f)) * (t - b.f) };
  },
  constant_acceleration: (past, t) => {
    const pts = past.slice(-3), t0 = pts[0].f, ts = pts.map((p) => p.f - t0);
    const cx = polyfit(ts, pts.map((p) => p.x), 2), cy = polyfit(ts, pts.map((p) => p.y), 2);
    return cx && cy ? { x: evalPoly(cx, t - t0), y: evalPoly(cy, t - t0) } : null;
  },
};

const region = (pts) => (pts.every((p) => p.y < FREE_FLIGHT_Y) ? "free_flight" : "near_rim");

/**
 * Interpolation errors. `methods` default to the three baselines; a candidate method has the same signature.
 * Returns { [region]: { [k]: { [method]: { errors, labels } } } } for the caller to summarise.
 */
export function evaluateInterpolation(runsByClip, { step = 1, methods = INTERPOLATORS } = {}) {
  const out = {};
  for (const [clip, runs] of Object.entries(runsByClip)) {
    for (const [ri, run] of runs.entries()) {
      for (let k = 1; k <= MAX_K; k += 1) {
        for (let i = 2; i + k + 1 < run.length; i += 1) { // 2 observed before, k hidden at i..i+k-1, 2 observed after
          const before = run.slice(i - 2, i), hidden = run.slice(i, i + k), after = run.slice(i + k, i + k + 2);
          const reg = region([...before, ...hidden, ...after]);
          for (const name of Object.keys(methods)) {
            for (const h of hidden) {
              const p = methods[name](before, after, h.f);
              if (!p) continue;
              const cell = (((out[reg] ??= {})[k] ??= {})[name] ??= { errors: [], labels: [], groups: [] });
              cell.errors.push(Math.hypot(p.x - h.x, p.y - h.y));
              cell.labels.push(`${clip} f${h.f}`);
              cell.groups.push(`${clip}#${ri}`);
            }
          }
        }
      }
    }
  }
  return out;
}

/** Prediction errors: from the last three observed points, h frames ahead (h = 1..6). */
export function evaluatePrediction(runsByClip, { methods = PREDICTORS } = {}) {
  const out = {};
  for (const [clip, runs] of Object.entries(runsByClip)) {
    for (const [ri, run] of runs.entries()) {
      for (let i = 3; i < run.length; i += 1) {
        const past = run.slice(i - 3, i); // observations up to now
        for (let h = 1; h <= MAX_K && i - 1 + h < run.length; h += 1) {
          const truth = run[i - 1 + h];
          const reg = region([...past, truth]);
          for (const name of Object.keys(methods)) {
            const p = methods[name](past, truth.f);
            if (!p) continue;
            const cell = (((out[reg] ??= {})[h] ??= {})[name] ??= { errors: [], labels: [], groups: [] });
            cell.errors.push(Math.hypot(p.x - truth.x, p.y - truth.y));
            cell.labels.push(`${clip} f${truth.f}`);
            cell.groups.push(`${clip}#${ri}`);
          }
        }
      }
    }
  }
  return out;
}

/** Summarise a cell map into distributions; cells under `minN` are marked unavailable, never estimated. */
export function summarizeCells(cells, { minN = 30, minFlights = 10, seed = 1 } = {}) {
  const out = {};
  for (const [reg, byK] of Object.entries(cells)) {
    for (const [k, byMethod] of Object.entries(byK)) {
      for (const [m, c] of Object.entries(byMethod)) {
        const flights = new Set(c.groups).size;
        ((out[reg] ??= {})[k] ??= {})[m] = c.errors.length < minN ? { n: c.errors.length, flights, unavailable: `fewer than ${minN} samples` } : flights < minFlights ? { n: c.errors.length, flights, unavailable: `only ${flights} independent flights (need ${minFlights}); the points overlap` } : describe(c.errors, { labels: c.labels, groups: c.groups, seed });
      }
    }
  }
  return out;
}

// ---- association
export const ASSOCIATORS = {
  nearest_to_last: (track, cands, t) => pick(cands, track[track.length - 1], t - track[track.length - 1].f),
  nearest_to_constant_velocity: (track, cands, t) => pick(cands, PREDICTORS.constant_velocity(track, t), t - track[track.length - 1].f, track[track.length - 1]),
  nearest_to_constant_acceleration: (track, cands, t) => pick(cands, PREDICTORS.constant_acceleration(track, t) ?? track[track.length - 1], t - track[track.length - 1].f, track[track.length - 1]),
};
// gate: a candidate is eligible if within GATE px per frame of the track's last observed point; among eligible, nearest to the method's guess
function pick(cands, guess, dt, anchor = guess) {
  let best = -1, bd = Infinity;
  cands.forEach((c, i) => {
    if (Math.hypot(c.x - anchor.x, c.y - anchor.y) > GATE_PX_PER_FRAME * dt) return;
    const d = Math.hypot(c.x - guess.x, c.y - guess.y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export const DISTRACTORS = ["none", "static_blob", "second_ball", "slow_mover", "adjacent_blob", "near_duplicate"];

/** Builds the candidate list for one decision: the true next detection plus, for synthetic types, one distractor of that type. */
function candidatesFor(type, track, truth, run, otherRuns, r) {
  const cands = [{ x: truth.x, y: truth.y, true: true }];
  const ang = r() * 2 * Math.PI, dist = 12 + r() * 68;
  if (type === "static_blob") cands.push({ x: truth.x + Math.cos(ang) * dist, y: truth.y + Math.sin(ang) * dist, true: false });
  if (type === "slow_mover") { const sp = 3 + r() * 3; cands.push({ x: truth.x + Math.cos(ang) * dist + sp * Math.cos(ang + 1), y: truth.y + Math.sin(ang) * dist + sp * Math.sin(ang + 1), true: false }); }
  // hard cases: a box right beside the track's last point (a shadow or hand the ball just left), and a second box on top of the ball itself
  if (type === "adjacent_blob") { const l = track[track.length - 1], d = 4 + r() * 8; cands.push({ x: l.x + Math.cos(ang) * d, y: l.y + Math.sin(ang) * d, true: false }); }
  if (type === "near_duplicate") { const d = 6 + r() * 8; cands.push({ x: truth.x + Math.cos(ang) * d, y: truth.y + Math.sin(ang) * d, true: false }); }
  if (type === "second_ball" && otherRuns.length) {
    // another real flight from the same clip, shifted so it passes near this one at this frame
    const o = otherRuns[Math.floor(r() * otherRuns.length)], q = o[Math.floor(r() * o.length)];
    const dx = truth.x + Math.cos(ang) * dist - q.x, dy = truth.y + Math.sin(ang) * dist - q.y;
    cands.push({ x: q.x + dx, y: q.y + dy, true: false });
  }
  return cands;
}

/** Association: for each distractor type, how often the true ball is chosen, a wrong one is chosen, or nothing is. */
export function evaluateAssociation(runsByClip, { step = 1, methods = ASSOCIATORS, seed = 1, perType = 4000 } = {}) {
  const r = rng(seed);
  const samples = [];
  for (const [clip, runs] of Object.entries(runsByClip)) runs.forEach((run, ri) => { for (let i = 4; i < run.length; i += 1) samples.push({ clip, run, ri, i }); });
  const out = {};
  for (const type of DISTRACTORS) {
    const rows = Object.fromEntries(Object.keys(methods).map((m) => [m, { decisions: 0, true_picked: 0, wrong_picked: 0, none_picked: 0 }]));
    for (let n = 0; n < Math.min(perType, samples.length); n += 1) {
      const s = samples[Math.floor(r() * samples.length)];
      const track = s.run.slice(s.i - 4, s.i), truth = s.run[s.i];
      const others = Object.values(runsByClip[s.clip]).filter((_, j) => j !== s.ri).filter((o) => o.length >= 4);
      const cands = candidatesFor(type, track, truth, s.run, others, r);
      for (const m of Object.keys(methods)) {
        const pickedIdx = methods[m](track, cands, truth.f);
        const row = rows[m];
        row.decisions += 1;
        if (pickedIdx < 0) row.none_picked += 1;
        else if (cands[pickedIdx].true) row.true_picked += 1;
        else row.wrong_picked += 1;
      }
    }
    out[type] = rows;
  }
  return out;
}

/**
 * The most repeated box location: a ball moves, so a spot that holds a box in a large share of frames is a static false detection
 * (a rim, a shadow, a bright patch). Boxes are binned in 12 px cells of the hoop window.
 */
export function staticBoxes(dets, { frames, minScore = 0.25 } = {}) {
  const cells = new Map();
  for (const d of dets) {
    if (d.score < minScore) continue;
    const k = `${Math.round((d.x1 + d.x2) / 24)},${Math.round((d.y1 + d.y2) / 24)}`;
    const c = cells.get(k) ?? cells.set(k, { frames: new Set(), scores: [], widths: [] }).get(k);
    c.frames.add(d.f); c.scores.push(d.score); c.widths.push(d.x2 - d.x1);
  }
  const top = [...cells.entries()].sort((a, b) => b[1].frames.size - a[1].frames.size)[0];
  if (!top) return { top_cell: null };
  const [kx, ky] = top[0].split(",").map((v) => Number(v) * 12);
  return { top_cell: { x: kx, y: ky, frames_with_a_box_there: top[1].frames.size, share_of_clip_frames: frames ? top[1].frames.size / frames : null, median_score: quantile(top[1].scores, 0.5), median_width: quantile(top[1].widths, 0.5) } };
}

/** Descriptive coverage and gaps of the detections: how often a ball box exists and how long the holes are. No ground truth involved. */
export function coverage(dets, { frames, minScore = 0.25, step = 1 } = {}) {
  const byF = new Map();
  for (const d of dets) if (d.score >= minScore) (byF.get(d.f) ?? byF.set(d.f, []).get(d.f)).push(d);
  const fs = [...byF.keys()].sort((a, b) => a - b);
  const runs = buildRuns(dets, { step, minScore });
  const longRuns = runs.filter((x) => x.length >= 6);
  const gaps = [];
  for (let i = 1; i < fs.length; i += 1) { const g = (fs[i] - fs[i - 1]) / step - 1; if (g >= 1 && g <= 8) gaps.push(g); }
  return {
    frames,
    most_repeated_box_location: staticBoxes(dets, { frames, minScore }).top_cell,
    frames_with_a_box: fs.length,
    share_of_frames_with_a_box: frames ? fs.length / frames : null,
    frames_with_more_than_one_box: fs.filter((f) => byF.get(f).length > 1).length,
    runs_of_consecutive_single_boxes: { total: runs.length, at_least_6: longRuns.length, length_median: longRuns.length ? quantile(longRuns.map((x) => x.length), 0.5) : null, length_p90: longRuns.length ? quantile(longRuns.map((x) => x.length), 0.9) : null },
    short_gaps_1_to_8_frames: { count: gaps.length, median: gaps.length ? quantile(gaps, 0.5) : null, p90: gaps.length ? quantile(gaps, 0.9) : null },
    note: "a descriptive summary of where boxes exist; it is not recall (frames where the ball was never boxed are invisible here)",
  };
}
