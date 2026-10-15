import type { Trail, TrailPoint } from "./trail.ts";

/**
 * Shot fingerprint, schema shot-fingerprint/1 (training/eval/experiments/shot-intelligence/criteria.json and criteria-v3.json). Observed points only:
 * never a reconstructed or fitted position. A measurement that cannot be taken is { value: null, reason } and stays that way. Lengths are in ball
 * widths of the shot's own observed ball, an image-space scale; angles are image-space; nothing is calibrated, and "image-horizontal" is not the
 * shooter's left or right. The shot's outcome is not an input.
 */
export const FINGERPRINT_SCHEMA = "shot-fingerprint/1" as const;
export type Measure = { value: number | boolean | null; reason?: string; [k: string]: unknown };
export type Fingerprint = {
  schema: typeof FINGERPRINT_SCHEMA;
  ballWidthPx: number;
  ballWidthSource: "shot" | "default";
  measurements: Record<string, Measure>;
  /** Observed x offset (ball widths) at 4, 3, 2, 1 and 0 widths above the rim level; null where no observed point is that close. */
  rimLevelPath: Record<string, number | null>;
  observedPoints: number;
  usableForComparison: boolean;
  evidence: { observedTimesMs: number[]; breakTimesMs: { t: number; reason: string }[] };
};

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const na = (reason: string): Measure => ({ value: null, reason });
const ok = (value: number | boolean, extra: Record<string, unknown> = {}): Measure => ({ value, ...extra });
function lsq(ts: number[], vs: number[], deg: number) {
  const m = deg + 1, A = Array.from({ length: m }, () => Array(m + 1).fill(0));
  for (let i = 0; i < ts.length; i += 1) { const r = Array.from({ length: m }, (_, k) => ts[i] ** k); for (let a = 0; a < m; a += 1) { for (let b = 0; b < m; b += 1) A[a][b] += r[a] * r[b]; A[a][m] += r[a] * vs[i]; } }
  for (let c = 0; c < m; c += 1) { let p = c; for (let r = c + 1; r < m; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-12) return null; for (let r = 0; r < m; r += 1) if (r !== c) { const q = A[r][c] / A[c][c]; for (let k = c; k <= m; k += 1) A[r][k] -= q * A[c][k]; } }
  const co = A.map((row, i) => row[m] / row[i]);
  return { co, res: ts.map((t, i) => vs[i] - co.reduce((s, c, k) => s + c * t ** k, 0)) };
}

export function fingerprint(trail: Trail, defaultBallWidth = 24): Fingerprint {
  const rim = trail.rim;
  const obs: TrailPoint[] = trail.segments.flat().filter((p) => p.type === "observed").sort((a, b) => a.f - b.f);
  const spacing = (() => { const d: number[] = []; for (let i = 1; i < obs.length; i += 1) d.push(obs[i].f - obs[i - 1].f); return Math.max(1, median(d.filter((x) => x > 0 && x < 8)) ?? 2); })();
  const near = obs.filter((p) => p.y >= rim.y - 120 && p.y <= rim.y + 10 && p.f <= 45).map((p) => p.w);
  const bwSource = near.length >= 3 ? "shot" : "default", bw = near.length >= 3 ? (median(near) as number) : defaultBallWidth;
  const R = obs.map((p) => ({ ...p, dx: (p.x - rim.x) / bw, up: (rim.y - p.y) / bw }));
  const m: Record<string, Measure> = {};
  let tc: number | null = null;
  for (let i = 1; i < R.length; i += 1) { if (R[i].f < -10 || R[i].f > 45) continue; if (R[i].up <= 0 && R[i - 1].up > 0 && R[i].f - R[i - 1].f <= 3 * spacing) { tc = R[i].f; break; } }
  m.rim_crossing_t_ms = tc === null ? na("no_observed_descending_crossing") : ok(Math.round((tc * 1001) / 30));
  if (tc === null) for (const k of ["rim_level_x_bw", "approach_direction_deg", "descent_speed_bw_per_frame", "path_fit_rms_bw", "rim_interaction_observed", "closest_approach_bw"]) m[k] = na("no_observed_descending_crossing");
  else {
    const j = R.findIndex((p) => p.f === tc), a = R[j - 1], b = R[j], span = a.up - b.up;
    m.rim_level_x_bw = span > 3 ? na("bracket_too_wide") : ok(+(a.dx + (a.up / span) * (b.dx - a.dx)).toFixed(3), { bracketed: true, bracket_dx_bw: +Math.abs(b.dx - a.dx).toFixed(2) });
    const band = R.filter((p) => p.f <= tc! && p.f >= tc! - 30 && p.up >= 1 && p.up <= 4).filter((p, i, arr) => i === 0 || p.up < arr[i - 1].up + 0.2);
    if (band.length >= 3 && band[band.length - 1].up < band[0].up) {
      const t0 = band[0].f, fx = lsq(band.map((p) => p.f - t0), band.map((p) => p.dx), 1), fu = lsq(band.map((p) => p.f - t0), band.map((p) => p.up), 1);
      m.approach_direction_deg = fx && fu && Math.abs(fu.co[1]) > 1e-6 ? ok(+((Math.atan2(fx.co[1], -fu.co[1]) * 180) / Math.PI).toFixed(1), { n_points: band.length }) : na("flat_vertical_fit");
    } else m.approach_direction_deg = na(band.length < 3 ? "fewer_than_3_descending_points_in_band" : "band_not_descending");
    const steps: number[] = [];
    for (let i = 1; i < band.length; i += 1) { const dt = band[i].f - band[i - 1].f, d = band[i - 1].up - band[i].up; if (dt > 0 && dt <= 3 * spacing && d > 0) steps.push(d / dt); }
    m.descent_speed_bw_per_frame = steps.length >= 2 ? ok(+(median(steps) as number).toFixed(4), { n_steps: steps.length }) : na("fewer_than_2_descending_steps");
    const last = R.filter((p) => p.f >= tc! - 20 && p.f <= tc!);
    if (last.length >= 6) { const t0 = last[0].f, fx = lsq(last.map((p) => p.f - t0), last.map((p) => p.dx), 1), fy = lsq(last.map((p) => p.f - t0), last.map((p) => p.up), 2); m.path_fit_rms_bw = fx && fy ? ok(+Math.sqrt((fx.res.reduce((s, r) => s + r * r, 0) + fy.res.reduce((s, r) => s + r * r, 0)) / last.length).toFixed(4), { n_points: last.length }) : na("degenerate_fit"); } else m.path_fit_rms_bw = na("fewer_than_6_points_before_rim_level");
    const win = R.filter((p) => p.f >= tc! - 10 && p.f <= tc! + 15);
    if (win.length) { const c = win.reduce((q, p) => (Math.hypot(p.dx, p.up) < Math.hypot(q.dx, q.up) ? p : q)); m.closest_approach_bw = ok(+Math.hypot(c.dx, c.up).toFixed(3)); const after = R.filter((p) => p.f > c.f && p.f <= tc! + 25); m.rim_interaction_observed = after.some((p) => p.up >= 1) ? ok(true, { n_after: after.length }) : after.length >= 4 ? ok(false, { n_after: after.length }) : na("fewer_than_4_observed_points_after_closest_approach"); }
    else { m.closest_approach_bw = na("no_observed_point_near_rim"); m.rim_interaction_observed = na("no_closest_approach"); }
  }
  const preT = R.filter((p) => p.f <= (tc ?? 0));
  m.observed_flight_ms = preT.length >= 2 ? ok(Math.round(((preT[preT.length - 1].f - preT[0].f) * 1001) / 30), { observed_points: preT.length, first_observed_t_ms: Math.round(preT[0].t) }) : na("fewer_than_2_observed_points");
  m.approach_observed_points = ok(R.filter((p) => p.f >= (tc ?? 0) - 20 && p.f <= (tc ?? 0) && p.up * bw >= 50 && p.up * bw <= 120).length);
  const apexI = preT.length >= 7 ? preT.reduce((q, p, i) => (p.y < preT[q].y ? i : q), 0) : -1;
  m.apex_observed = ok(apexI >= 3 && apexI <= preT.length - 4 && preT[apexI].y <= preT[0].y - 12 && preT[apexI].y <= preT[preT.length - 1].y - 12);
  m.break_count = ok(trail.gaps.length + trail.events.filter((e) => e.reason === "ambiguous").length);
  m.mean_score = obs.length ? ok(+(obs.reduce((s, p) => s + (p.score ?? 0), 0) / obs.length).toFixed(3)) : na("no_points");
  const ambiguousNear = trail.events.some((e) => e.reason === "ambiguous" && tc !== null && e.t >= ((tc - 30) * 1001) / 30 && e.t <= ((tc + 3) * 1001) / 30);
  m.ambiguous_break_near_rim = ok(ambiguousNear);
  const path: Record<string, number | null> = {};
  for (const L of [4, 3, 2, 1, 0]) { const c = tc === null ? undefined : R.filter((p) => Math.abs(p.up - L) <= 0.4 && p.f <= tc + 1 && p.f >= tc - 40).sort((p, q) => Math.abs(p.up - L) - Math.abs(q.up - L))[0]; path[String(L)] = c ? +c.dx.toFixed(3) : null; }
  return { schema: FINGERPRINT_SCHEMA, ballWidthPx: +bw.toFixed(2), ballWidthSource: bwSource, measurements: m, rimLevelPath: path, observedPoints: obs.length, usableForComparison: m.rim_level_x_bw.value !== null && !ambiguousNear, evidence: { observedTimesMs: obs.map((p) => Math.round(p.t)), breakTimesMs: [...trail.gaps.map((g) => ({ t: g.fromT, reason: g.reason })), ...trail.events.map((e) => ({ t: e.t, reason: e.reason }))] } };
}

/** Why a measurement is missing, in words a player can read. */
export function explainMissing(reason: string): string {
  const table: Record<string, string> = {
    no_observed_descending_crossing: "The camera never saw the ball come down through the height of the rim, so no rim-level measurement is possible.",
    bracket_too_wide: "The ball was seen far above and far below the rim level but not between, so the rim-level position would be a guess.",
    fewer_than_3_descending_points_in_band: "Too few sightings of the ball on its way down to the rim to measure its direction.",
    band_not_descending: "The sightings before the rim did not show the ball coming down.",
    fewer_than_2_descending_steps: "Too few consecutive sightings on the way down to measure its speed.",
    fewer_than_6_points_before_rim_level: "Too few sightings before the rim to judge how smooth the path was.",
    fewer_than_4_observed_points_after_closest_approach: "The ball was not seen for long enough after the rim to tell whether it bounced.",
    no_observed_point_near_rim: "No sighting near the rim.",
    no_closest_approach: "No sighting near the rim.",
    fewer_than_2_observed_points: "Fewer than two sightings of the ball.",
    flat_vertical_fit: "The sightings did not show a clear downward direction.",
    degenerate_fit: "The sightings were too close together to fit a path.",
    no_points: "No sightings.",
  };
  return table[reason] ?? reason.replace(/_/g, " ");
}
