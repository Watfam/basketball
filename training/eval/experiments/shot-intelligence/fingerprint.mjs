// Shot fingerprint generator, schema shot-fingerprint/1. Uses OBSERVED trail points only (never reconstructed), reads no outcome label.
// Every measurement is a number or { value: null, reason }. Lengths are in ball widths (bw) of the shot's own observed ball: an image-space scale, not metres.
export const SCHEMA = "shot-fingerprint/1";
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const na = (reason) => ({ value: null, reason });
const ok = (value, extra = {}) => ({ value, ...extra });

function lsq(ts, vs, deg) { // returns coefficients c0..cdeg and residuals
  const n = ts.length, m = deg + 1, A = Array.from({ length: m }, () => Array(m + 1).fill(0));
  for (let i = 0; i < n; i += 1) { const r = Array.from({ length: m }, (_, k) => ts[i] ** k); for (let a = 0; a < m; a += 1) { for (let b = 0; b < m; b += 1) A[a][b] += r[a] * r[b]; A[a][m] += r[a] * vs[i]; } }
  for (let c = 0; c < m; c += 1) { let p = c; for (let r = c + 1; r < m; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-12) return null; for (let r = 0; r < m; r += 1) if (r !== c) { const q = A[r][c] / A[c][c]; for (let k = c; k <= m; k += 1) A[r][k] -= q * A[c][k]; } }
  const co = A.map((row, i) => row[m] / row[i]); return { co, res: ts.map((t, i) => vs[i] - co.reduce((s, c, k) => s + c * t ** k, 0)) };
}

/**
 * input: { id, clip, first (first zone sighting, reference frame), thin, rim {x,y}, points: observed points of the shot's trail [{f,x,y,w,score}] (in order),
 *          segments (number of trail segments), events (trail events), clipBallWidth }.
 * returns the fingerprint WITHOUT any outcome field.
 */
export function fingerprint(input) {
  const { id, clip, first, thin, rim, clipBallWidth = 24 } = input, pts = input.points.filter((p) => p.f <= first + 50).sort((a, b) => a.f - b.f);
  const near = pts.filter((p) => p.y >= rim.y - 120 && p.y <= rim.y + 10 && p.f <= first + 45).map((p) => p.w);
  const bwSrc = near.length >= 3 ? "shot" : "clip", bw = near.length >= 3 ? median(near) : clipBallWidth;
  const rel = (p) => ({ f: p.f, dx: (p.x - rim.x) / bw, up: (rim.y - p.y) / bw, ...p });
  const R = pts.map(rel), m = {};
  // anchor (criteria-v3): the rim-level crossing frame tc: first observed point at or below rim level preceded within 3 processed frames by an observed point above it
  let tc = null;
  for (let i = 1; i < R.length; i += 1) { if (R[i].f < first - 10 || R[i].f > first + 45) continue; if (R[i].up <= 0 && R[i - 1].up > 0 && R[i].f - R[i - 1].f <= 3 * thin) { tc = R[i].f; break; } }
  m.rim_crossing_frame = tc === null ? na("no_observed_descending_crossing") : ok(tc);
  if (tc === null) {
    for (const k of ["rim_level_x_bw", "approach_direction_deg", "descent_speed_bw_per_frame", "path_fit_rms_bw", "rim_interaction_observed"]) m[k] = na("no_observed_descending_crossing");
  } else {
    const j = R.findIndex((p) => p.f === tc), a = R[j - 1], b = R[j], span = a.up - b.up;
    if (span > 3) m.rim_level_x_bw = na("bracket_too_wide");
    else { const k = a.up / span; m.rim_level_x_bw = ok(+(a.dx + k * (b.dx - a.dx)).toFixed(3), { bracketed: true, frames: [a.f, b.f], vertical_span_bw: +span.toFixed(2), bracket_dx_bw: +Math.abs(b.dx - a.dx).toFixed(2) }); }
    const band = R.filter((p) => p.f <= tc && p.f >= tc - 30 && p.up >= 1 && p.up <= 4).filter((p, i, a) => i === 0 || p.up < a[i - 1].up + 0.2);
    if (band.length >= 3 && band[band.length - 1].up < band[0].up) {
      const t0 = band[0].f, fx = lsq(band.map((p) => p.f - t0), band.map((p) => p.dx), 1), fu = lsq(band.map((p) => p.f - t0), band.map((p) => p.up), 1);
      m.approach_direction_deg = fx && fu && Math.abs(fu.co[1]) > 1e-6 ? ok(+((Math.atan2(fx.co[1], -fu.co[1]) * 180) / Math.PI).toFixed(1), { n_points: band.length }) : na("flat_vertical_fit");
    } else m.approach_direction_deg = na(band.length < 3 ? "fewer_than_3_descending_points_in_band" : "band_not_descending");
    const steps = []; for (let i = 1; i < band.length; i += 1) { const dt = band[i].f - band[i - 1].f, d = band[i - 1].up - band[i].up; if (dt > 0 && dt <= 3 * thin && d > 0) steps.push(d / dt); }
    m.descent_speed_bw_per_frame = steps.length >= 2 ? ok(+median(steps).toFixed(4), { n_steps: steps.length }) : na("fewer_than_2_descending_steps");
    const last = R.filter((p) => p.f >= tc - 20 && p.f <= tc);
    if (last.length >= 6) { const t0 = last[0].f, fx = lsq(last.map((p) => p.f - t0), last.map((p) => p.dx), 1), fy = lsq(last.map((p) => p.f - t0), last.map((p) => p.up), 2); m.path_fit_rms_bw = fx && fy ? ok(+Math.sqrt((fx.res.reduce((s, r) => s + r * r, 0) + fy.res.reduce((s, r) => s + r * r, 0)) / last.length).toFixed(4), { n_points: last.length }) : na("degenerate_fit"); } else m.path_fit_rms_bw = na("fewer_than_6_points_before_rim_level");
  }
  const win = tc === null ? [] : R.filter((p) => p.f >= tc - 10 && p.f <= tc + 15);
  if (win.length) { const c = win.reduce((a, p) => (Math.hypot(p.dx, p.up) < Math.hypot(a.dx, a.up) ? p : a)); m.closest_approach_bw = ok(+Math.hypot(c.dx, c.up).toFixed(3), { at_frame: c.f }); } else m.closest_approach_bw = na(tc === null ? "no_observed_descending_crossing" : "no_observed_point_near_rim");
  if (tc !== null && m.closest_approach_bw.value !== null) {
    const after = R.filter((p) => p.f > m.closest_approach_bw.at_frame && p.f <= tc + 25);
    m.rim_interaction_observed = after.some((p) => p.up >= 1) ? ok(true, { n_after: after.length }) : after.length >= 4 ? ok(false, { n_after: after.length }) : na("fewer_than_4_observed_points_after_closest_approach");
  }
  const preT = R.filter((p) => p.f <= (tc ?? first));
  m.observed_flight_frames = preT.length >= 2 ? ok(preT[preT.length - 1].f - preT[0].f + 1, { first_observed_frame: preT[0].f, observed_points: preT.length }) : na("fewer_than_2_observed_points");
  const appr = R.filter((p) => p.f >= (tc ?? first) - 20 && p.f <= (tc ?? first) && p.up * bw >= 50 && p.up * bw <= 120);
  m.approach_observed_frames = ok(appr.length);
  const preFirst = preT;
  // reported, not core
  const apexCand = preFirst.length >= 7 ? preFirst.reduce((a, p) => (p.y < a.y ? p : a)) : null; const ai = apexCand ? preFirst.indexOf(apexCand) : -1;
  m.apex_observed = ok(!!apexCand && ai >= 3 && ai <= preFirst.length - 4 && apexCand.y <= preFirst[0].y - 12 && apexCand.y <= preFirst[preFirst.length - 1].y - 12);
  m.apex_height_above_rim_bw = m.apex_observed.value ? ok(+apexCand.up.toFixed(3)) : na("apex_not_observed");
  m.first_observed_frames_before_first_zone = preFirst.length ? ok(first - preFirst[0].f) : na("no_observed_points");
  const gaps = []; for (let i = 1; i < preFirst.length; i += 1) { const d = (preFirst[i].f - preFirst[i - 1].f) / thin - 1; if (d > 0) gaps.push(d); }
  m.gap_count = ok(gaps.length); m.max_gap_frames = ok(gaps.length ? Math.max(...gaps) : 0);
  m.mean_score = pts.length ? ok(+(pts.reduce((a, p) => a + p.score, 0) / pts.length).toFixed(3)) : na("no_points");
  const ambiguousBreak = input.events.some((e) => e.reason === "ambiguous" && e.f >= (tc ?? first) - 30 && e.f <= (tc ?? first) + 3);
  m.ambiguous_break = ok(ambiguousBreak);
  // rim-level path: observed x offset at levels 4,3,2,1,0 bw above the rim (point within +-0.4 bw of the level)
  const path = {}; for (const L of [4, 3, 2, 1, 0]) { const c = R.filter((p) => tc !== null && Math.abs(p.up - L) <= 0.4 && p.f <= tc + 1 && p.f >= tc - 40).sort((a, b) => Math.abs(a.up - L) - Math.abs(b.up - L))[0]; path[L] = c ? +c.dx.toFixed(3) : null; }
  const quality = { observed_points: pts.length, observed_share_of_window: null, usable_for_comparison: m.rim_level_x_bw.value !== null && !ambiguousBreak };
  return { schema: SCHEMA, id, clip, thin, units: { length: "ball widths (image-space, shot's own observed ball)", angle: "degrees from straight down in the image, + toward image-right", time: "frames at 30 fps", note: "image-horizontal is not the shooter's left or right; nothing here is calibrated" },
    first_zone_frame: first, ball_width_u: +bw.toFixed(2), ball_width_source: bwSrc, measurements: m, rim_level_path_bw: path, quality,
    evidence: { frames_observed: pts.map((p) => p.f), trail_segments: input.segments, break_events: input.events.map((e) => ({ f: e.f, reason: e.reason })), video_frame_range: [first - 75, first + 15] } };
}
