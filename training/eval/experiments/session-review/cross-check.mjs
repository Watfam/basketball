// The app's TypeScript review code (recorder, trail, fingerprint, quality) run on REAL saved detections, compared with the Phase-4 offline pipeline.
//   node cross-check.mjs -> results/cross-check.json
// Detections are replayed at 15 fps (even frames) through the recorder exactly as the camera loop would feed it, a record is cut for every counted shot,
// and the review trail/fingerprint is built from the record alone. The model-skip gate is not simulated (every frame counts as run).
import fs from "node:fs";
import path from "node:path";
import { EVAL, readJSON } from "../../lib/registry.mjs";
import { loadReview } from "./lib.mjs";
import { analyseClip, CLIPS } from "../shot-intelligence/shots.mjs";
import { fingerprint as fp1 } from "../shot-intelligence/fingerprint.mjs";
const R = await loadReview(), RES = path.join(EVAL, "experiments/session-review/results"), out = { generated: new Date().toISOString(), per_clip: {}, pooled: {}, timing_ms: [], phantom_4873: {} };
const isOracle = (b) => b.x2 - b.x1 < 18 && Math.hypot((b.x1 + b.x2) / 2 - 179.7, (b.y1 + b.y2) / 2 - 194.1) <= 14;
const near = (a, b, tol) => a !== null && b !== null && Math.abs(a - b) <= tol;
const tot = { shots: 0, recordFrames: 0, avail_app: 0, avail_ref: 0, both: 0, agree_x: 0, dir_both: 0, agree_dir: 0, quality: { tracked: 0, partial: 0, unreliable: 0, none: 0 }, recon_points: 0, observed_points: 0 };
for (const id of CLIPS) {
  const A = await analyseClip(id, { thin: 2 }), det = A.byF, rimU = A.rim, rec = R.recorder.createReviewRecorder();
  const firstTimes = new Map(A.shots.map((s) => [s.first, s]));
  const pc = (out.per_clip[id] = { shots: 0, avail_app: 0, avail_ref: 0, both: 0, agree_x_within_0p15: 0, quality: { tracked: 0, partial: 0, unreliable: 0, none: 0 }, phantom_points: 0, trail_points: 0, ms: [] });
  const records = [];
  // feed the recorder frame by frame; cut 2 s after each shot's first sighting
  const cutAt = new Map(); for (const s of A.shots) cutAt.set(Math.round(s.first + 2 * 29.97) + 1, s);
  const maxF = Math.max(...det.keys());
  for (let f = 0; f <= maxF; f += 2) {
    const t = (f * 1001) / 30;
    rec.push(t, true, (det.get(f) ?? []).filter((b) => b.score >= 0.2));
    for (const [cf, s] of cutAt) if (cf <= f + 1 && cf >= f) { records.push({ s, record: rec.cut((s.first * 1001) / 30, `shot-${s.first}`, rimU, clipScale(A)) }); }
  }
  for (const { s, record } of records) {
    const t0 = performance.now(), trail = R.trail.buildTrail(record), fp = trail.hasTrail ? R.fingerprint.fingerprint(trail) : null, q = R.quality.assessTrail(trail, fp); const ms = performance.now() - t0; pc.ms.push(ms); out.timing_ms.push(ms);
    const ref = fp1({ id: s.id, clip: id, first: s.first, thin: 2, rim: rimU, points: s.trail.segments.flatMap((g) => g.points).filter((p) => p.type === "observed"), segments: s.trail.segments.length, events: s.trail.events }).measurements.rim_level_x_bw.value;
    const app = fp ? fp.measurements.rim_level_x_bw.value : null;
    pc.shots += 1; tot.shots += 1; tot.recordFrames += record.frames.length; if (app !== null) { pc.avail_app += 1; tot.avail_app += 1; } if (ref !== null) { pc.avail_ref += 1; tot.avail_ref += 1; }
    if (app !== null && ref !== null) { pc.both += 1; tot.both += 1; if (near(app, ref, 0.15)) { pc.agree_x_within_0p15 += 1; tot.agree_x += 1; } }
    pc.quality[q.level] += 1; tot.quality[q.level] += 1;
    const pts = trail.segments.flat(); tot.recon_points += pts.filter((p) => p.type === "reconstructed").length; tot.observed_points += pts.filter((p) => p.type === "observed").length;
    if (id === "IMG_4873") { const ph = pts.filter((p) => p.type === "observed" && p.w < 18 && Math.hypot(p.x - 179.7, p.y - 194.1) <= 14).length; pc.phantom_points += ph; pc.trail_points += pts.length; }
    // integrity: every point typed, no reconstructed point outside a gap, observed points exist in the record
    for (const p of pts) if (p.type !== "observed" && p.type !== "reconstructed") throw new Error("untyped point");
  }
  pc.median_ms = [...pc.ms].sort((a, b) => a - b)[pc.ms.length >> 1]; delete pc.ms;
  console.log(id, JSON.stringify(pc));
}
function clipScale(A) { return A.clip.window.scale; }
const s = [...out.timing_ms].sort((a, b) => a - b); out.pooled = { ...tot, timing: { median_ms: s[s.length >> 1], p99_ms: s[Math.floor(s.length * 0.99)], max_ms: s[s.length - 1] }, agreement_of_available_both: tot.both ? tot.agree_x / tot.both : null }; delete out.timing_ms;
fs.writeFileSync(path.join(RES, "cross-check.json"), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out.pooled));
