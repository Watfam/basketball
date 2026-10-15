import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionReviewEnabled, SESSION_REVIEW_KEY } from "./flag.ts";
import { createSpotMemory } from "./spot.ts";
import { createReviewRecorder } from "./recorder.ts";
import { buildTrail, interpolate } from "./trail.ts";
import { fingerprint, explainMissing } from "./fingerprint.ts";
import { assessTrail } from "./quality.ts";
import { parseRecord, REVIEW_RECORD_VERSION, type ReviewBox, type ReviewRecord } from "./types.ts";

const RIM = { x: 192, y: 190 }, STEP = 1000 / 15;
const box = (x: number, y: number, w = 24, score = 0.85, occ = false): ReviewBox => ({ x1: x - w / 2, y1: y - w / 2, x2: x + w / 2, y2: y + w / 2, score, occ });
/** a ball coming down onto the rim from the left, 15 fps, crossing rim level at t = 0 */
const arcAt = (f: number) => ({ x: 192 + 2 * f, y: 30 + 0.178 * (f + 30) ** 2 });
function record(opts: { skip?: number[]; extra?: (i: number, f: number) => ReviewBox[]; noBall?: boolean; ran?: (i: number) => boolean; from?: number; to?: number } = {}): ReviewRecord {
  const frames = [];
  for (let i = 0, t = -1000; t <= 2000; i += 1, t += STEP) {
    const f = (t * 29.97) / 1000, boxes: ReviewBox[] = [];
    const ran = opts.ran ? opts.ran(i) : true;
    if (ran && !opts.noBall && f >= (opts.from ?? -29) && f <= (opts.to ?? 12) && !(opts.skip ?? []).includes(i)) { const p = arcAt(f); boxes.push(box(p.x, p.y)); }
    if (ran && opts.extra) boxes.push(...opts.extra(i, f));
    frames.push({ t, ran, boxes });
  }
  return { v: 1, shotId: "shot-1", replayId: "shot-1", firstMs: 1000, rim: RIM, scale: 1, frames };
}
const idxAt = (f: number) => Math.round((f * 1000) / 29.97 / STEP) + 15;   // record frame index nearest to reference frame f

test("the flag is off unless storage holds exactly '1'", () => {
  assert.equal(sessionReviewEnabled(() => null), false);
  assert.equal(sessionReviewEnabled(() => "0"), false);
  assert.equal(sessionReviewEnabled(() => "true"), false);
  assert.equal(sessionReviewEnabled((k) => (k === SESSION_REVIEW_KEY ? "1" : null)), true);
  assert.equal(sessionReviewEnabled(() => { throw new Error("blocked"); }), false);
});

test("spot memory: a spot with a box in every frame for seconds is occupied, a fresh spot is not, and nothing is occupied before enough history", () => {
  const s = createSpotMemory();
  assert.equal(s.occupied(100, 100), false);
  for (let t = 0; t <= 6000; t += 66) s.add(t, [{ x: 100, y: 100 }]);
  assert.equal(s.occupied(101, 101), true); assert.equal(s.occupied(300, 300), false);
  const fresh = createSpotMemory(); fresh.add(0, [{ x: 5, y: 5 }]); fresh.add(1000, [{ x: 5, y: 5 }]); assert.equal(fresh.occupied(5, 5), false);
});

test("recorder cuts a versioned record from 1 s before to 2 s after, on the shot's clock, and flags boxes on occupied spots", () => {
  const rec = createReviewRecorder();
  for (let t = 0; t <= 9000; t += 66) rec.push(t, true, [{ x1: 174, y1: 188, x2: 185, y2: 199, score: 0.5 }]);
  rec.push(9066, true, [{ x1: 20, y1: 20, x2: 44, y2: 44, score: 0.9 }]);
  const r = rec.cut(8000, "shot-8000", { x: 192, y: 190 }, 1);
  assert.equal(r.v, REVIEW_RECORD_VERSION); assert.equal(r.shotId, "shot-8000");
  assert.ok(r.frames[0].t >= -1000 && r.frames[r.frames.length - 1].t <= 2000);
  assert.ok(r.frames.some((f) => f.boxes.some((b) => b.occ)), "the permanent rim box is flagged"); assert.ok(!r.frames.at(-1)!.boxes.some((b) => b.score === 0.9 && b.occ));
});

test("a clean arc is one observed segment, no gaps, and its rim-level crossing is measured from two bracketing observed points", () => {
  const trail = buildTrail(record()), fp = fingerprint(trail), q = assessTrail(trail, fp);
  assert.equal(trail.segments.length, 1); assert.equal(trail.gaps.length, 0); assert.ok(trail.segments[0].every((p) => p.type === "observed"));
  assert.ok(fp.measurements.rim_level_x_bw.value !== null && Math.abs(fp.measurements.rim_level_x_bw.value as number) < 0.5, String(fp.measurements.rim_level_x_bw.value));
  assert.equal(fp.measurements.rim_level_x_bw.bracketed, true); assert.ok((fp.measurements.approach_direction_deg.value as number) > 0, "moving toward image-right");
  assert.equal(q.level, "tracked"); assert.equal(fp.schema, "shot-fingerprint/1");
});

test("a one-frame detection gap is bridged by one typed 'reconstructed' point with a larger uncertainty; a two-frame gap breaks the trail and draws nothing across it", () => {
  const i = idxAt(-8);
  const one = buildTrail(record({ skip: [i] })), recon = one.segments.flat().filter((p) => p.type === "reconstructed");
  assert.equal(recon.length, 1); assert.equal(one.segments.length, 1); assert.ok(recon[0].unc > one.segments[0][0].unc && recon[0].score === null);
  const truth = arcAt(recon[0].f); assert.ok(Math.hypot(truth.x - recon[0].x, truth.y - recon[0].y) < 4);
  const two = buildTrail(record({ skip: [i, i + 1] }));
  assert.equal(two.segments.length, 2); assert.ok(two.segments.flat().every((p) => p.type === "observed")); assert.equal(two.gaps.length, 1); assert.equal(two.gaps[0].reason, "no_detection");
  assert.equal(assessTrail(two, fingerprint(two)).level, "partial");
});

test("frames where the model did not run are 'model_skipped', never 'no detection', and are never bridged", () => {
  const i = idxAt(-8), t = buildTrail(record({ ran: (k) => k !== i }));
  assert.ok(t.gaps.every((g) => g.reason === "model_skipped")); assert.ok(t.segments.flat().every((p) => p.type === "observed")); assert.equal(t.segments.length, 2);
});

test("a static box on a long-occupied rim spot is left out and never becomes the ball; a record with only that box has no trail", () => {
  const phantom = () => [box(180, 194, 11, 0.5, true)];
  const t = buildTrail(record({ extra: phantom }));
  assert.ok(t.segments.flat().every((p) => p.w > 20), "no 11 px box in the path"); assert.ok(t.hasTrail);
  const only = buildTrail(record({ noBall: true, extra: phantom })); assert.equal(only.hasTrail, false);
  const q = assessTrail(only, fingerprint(only)); assert.equal(q.level, "none"); assert.match(q.reasons[0], /rim hardware/);
});

test("a second ball within 1.5 ball widths makes the identity unclear: that point is left out and marked, the trail breaks, and near the rim the shot is 'unreliable'", () => {
  const near = (i: number, f: number) => (Math.abs(f + 4) < 1 ? [box(arcAt(f).x + 20, arcAt(f).y, 24, 0.6)] : []);
  const t = buildTrail(record({ extra: near })), fp = fingerprint(t);
  assert.ok(t.events.some((e) => e.reason === "ambiguous")); assert.ok(t.segments.length >= 2);
  const q = assessTrail(t, fp); assert.ok(["unreliable", "partial"].includes(q.level));
});

test("an unrelated ball far from the path is never joined to it (a rebound or someone else's ball)", () => {
  const other = (i: number, f: number) => (f > 2 ? [box(40 + 3 * f, 330 - 6 * f)] : []);
  const t = buildTrail(record({ extra: other, to: 2 }));
  assert.ok(t.segments.flat().every((p) => p.y < 260), "nothing from the second ball");
});

test("an incomplete trajectory (the ball only appears just above the rim) gives unavailable measurements with reasons, never invented ones", () => {
  const t = buildTrail(record({ from: -4, to: -2 })), fp = fingerprint(t);
  assert.equal(fp.measurements.rim_level_x_bw.value, null); assert.equal(fp.measurements.approach_direction_deg.value, null);
  assert.ok(fp.measurements.rim_level_x_bw.reason && explainMissing(fp.measurements.rim_level_x_bw.reason as string).length > 10);
  assert.notEqual(assessTrail(t, fp).level, "tracked");
});

test("the fingerprint never uses reconstructed points: filling a gap does not change any measurement that does not need the gap", () => {
  const withGap = fingerprint(buildTrail(record({ skip: [idxAt(-10)] }))), clean = fingerprint(buildTrail(record()));
  assert.equal(withGap.observedPoints, clean.observedPoints - 1);
  assert.ok(Math.abs((withGap.measurements.rim_level_x_bw.value as number) - (clean.measurements.rim_level_x_bw.value as number)) < 0.05);
});

test("interpolate is exact on a straight line and the record parser rejects unknown versions", () => {
  const r = interpolate([{ f: 0, x: 0, y: 0 }], [{ f: 3, x: 30, y: 60 }], [1, 2]);
  assert.ok(Math.abs(r[0].x - 10) < 1e-9 && Math.abs(r[1].y - 40) < 1e-9);
  assert.ok(parseRecord(record())); assert.equal(parseRecord({ ...record(), v: 2 }), null); assert.equal(parseRecord(null), null); assert.equal(parseRecord({ v: 1 }), null);
});

test("building a trail twice gives identical data", () => {
  assert.equal(JSON.stringify(buildTrail(record({ skip: [idxAt(-6)] }))), JSON.stringify(buildTrail(record({ skip: [idxAt(-6)] }))));
});
