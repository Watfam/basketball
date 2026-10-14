import { test } from "node:test";
import assert from "node:assert/strict";
import { staticBoxes, polyfit, buildRuns, INTERPOLATORS, PREDICTORS, evaluateInterpolation, evaluatePrediction, evaluateAssociation, summarizeCells, coverage } from "./gapeval.mjs";

const box = (f, x, y, score = 0.9) => ({ f, x1: x - 12, y1: y - 12, x2: x + 12, y2: y + 12, score });
// a clean parabola: x moves at 3 px/frame, y has acceleration 1 px/frame^2
const parabola = (n, step = 1) => Array.from({ length: n }, (_, i) => { const f = i * step; return { f, x: 100 + 3 * f, y: 60 + 0.5 * f * f * 1 - 8 * f }; });
const run = (n, step = 1) => parabola(n, step).map((p) => ({ f: p.f, x: p.x, y: p.y }));

test("polyfit recovers an exact quadratic", () => {
  const c = polyfit([0, 1, 2, 3], [5, 6, 9, 14], 2); // 5 + 0 t + 1 t^2
  assert.ok(Math.abs(c[0] - 5) < 1e-9 && Math.abs(c[1]) < 1e-9 && Math.abs(c[2] - 1) < 1e-9);
});

test("on an exact parabola constant acceleration is exact and linear interpolation is not", () => {
  const r = run(12), before = r.slice(2, 4), after = r.slice(6, 8), t = r[4].f;
  const ca = INTERPOLATORS.constant_acceleration(before, after, t), lin = INTERPOLATORS.linear(before, after, t);
  assert.ok(Math.hypot(ca.x - r[4].x, ca.y - r[4].y) < 1e-6);
  assert.ok(Math.hypot(lin.x - r[4].x, lin.y - r[4].y) > 0.5);
});

test("on straight motion every interpolator is exact", () => {
  const r = Array.from({ length: 8 }, (_, i) => ({ f: i, x: 10 + 4 * i, y: 20 - 2 * i }));
  for (const name of Object.keys(INTERPOLATORS)) {
    const p = INTERPOLATORS[name](r.slice(0, 2), r.slice(4, 6), 3);
    assert.ok(Math.hypot(p.x - r[3].x, p.y - r[3].y) < 1e-9, name);
  }
});

test("prediction is causal: changing anything after 'now' changes nothing", () => {
  const r = run(10);
  const past = r.slice(0, 3);
  const a = PREDICTORS.constant_acceleration(past, r[5].f);
  const mutated = r.map((p, i) => (i >= 3 ? { ...p, x: p.x + 999, y: p.y - 999 } : p));
  const b = PREDICTORS.constant_acceleration(mutated.slice(0, 3), mutated[5].f);
  assert.deepEqual(a, b);
  // the evaluator hands the predictor only run.slice(i - 3, i)
  const res = evaluatePrediction({ c: [r] });
  assert.ok(res.free_flight || res.near_rim);
});

test("prediction baselines: constant acceleration beats constant velocity beats last value on a clean parabola", () => {
  const cells = evaluatePrediction({ c: [run(40)] });
  const reg = cells.free_flight ?? cells.near_rim;
  const med = (m) => { const e = [...reg[3][m].errors].sort((a, b) => a - b); return e[e.length >> 1]; };
  assert.ok(med("constant_acceleration") < med("constant_velocity"));
  assert.ok(med("constant_velocity") < med("last_value"));
});

test("interpolation cells are separate per k and per region, and small cells are marked unavailable", () => {
  const cells = evaluateInterpolation({ c: [run(30)] });
  const reg = Object.keys(cells);
  assert.ok(reg.length >= 1);
  const s = summarizeCells(cells, { minN: 1e6 });
  const first = s[reg[0]];
  assert.ok(Object.keys(first).length >= 5, "k = 1..6 reported individually");
  assert.ok(first[1].linear.unavailable);
});

test("runs break at a gap, at two boxes in a frame, and at a jump bigger than the same-ball gate", () => {
  const dets = [box(0, 10, 10), box(1, 12, 10), box(2, 14, 10), box(4, 18, 10), box(5, 20, 10), box(5, 200, 200), box(6, 22, 10), box(7, 300, 10), box(8, 302, 10)];
  const runs = buildRuns(dets, { step: 1 });
  assert.deepEqual(runs.map((r) => r.map((p) => p.f)), [[0, 1, 2], [4], [6], [7, 8]]);
});

test("step 2 uses even frames only", () => {
  const dets = Array.from({ length: 10 }, (_, f) => box(f, 10 + 2 * f, 10));
  assert.deepEqual(buildRuns(dets, { step: 2 })[0].map((p) => p.f), [0, 2, 4, 6, 8]);
});

test("association: with no distractor the right ball is always chosen; a close blob can steal it from a nearest-point rule", () => {
  const out = evaluateAssociation({ c: [run(30)] }, { perType: 300, seed: 3 });
  for (const m of Object.keys(out.none)) assert.equal(out.none[m].true_picked, out.none[m].decisions, m);
  const stat = out.static_blob;
  assert.ok(stat.nearest_to_last.wrong_picked + stat.nearest_to_last.true_picked + stat.nearest_to_last.none_picked === stat.nearest_to_last.decisions);
});

test("coverage counts boxes per frame and gaps without calling it recall", () => {
  const dets = [box(0, 1, 1), box(1, 2, 1), box(4, 5, 1), box(5, 6, 1), box(5, 60, 60)];
  const c = coverage(dets, { frames: 10 });
  assert.equal(c.frames_with_a_box, 4);
  assert.equal(c.frames_with_more_than_one_box, 1);
  assert.equal(c.short_gaps_1_to_8_frames.count, 1);
  assert.match(c.note, /not recall/);
});

test("the hard distractors separate association methods: a box beside the last point fools nearest-to-last, not the motion-aware rules", () => {
  const out = evaluateAssociation({ c: [run(30)] }, { perType: 600, seed: 11 });
  const rate = (m) => out.adjacent_blob[m].true_picked / out.adjacent_blob[m].decisions;
  assert.ok(rate("nearest_to_constant_velocity") > rate("nearest_to_last") + 0.2, JSON.stringify([rate("nearest_to_last"), rate("nearest_to_constant_velocity")]));
  assert.ok("near_duplicate" in out);
});

test("a cell with plenty of points but too few independent flights is unavailable", () => {
  const cells = { free_flight: { 3: { linear: { errors: Array.from({ length: 100 }, () => 1), labels: Array.from({ length: 100 }, (_, i) => "p" + i), groups: Array.from({ length: 100 }, (_, i) => "f" + (i % 3)) } } } };
  const s = summarizeCells(cells, { minN: 30, minFlights: 10 });
  assert.match(s.free_flight[3].linear.unavailable, /3 independent flights/);
  const enough = { free_flight: { 3: { linear: { errors: Array.from({ length: 100 }, (_, i) => 1 + (i % 4)), labels: Array.from({ length: 100 }, (_, i) => "p" + i), groups: Array.from({ length: 100 }, (_, i) => "f" + (i % 20)) } } } };
  assert.equal(summarizeCells(enough, { minN: 30, minFlights: 10 }).free_flight[3].linear.n_groups, 20);
});

test("a spot that holds a box in many frames is reported as a static false detection, a moving ball is not", () => {
  const still = Array.from({ length: 100 }, (_, f) => box(f, 180, 192, 0.5));
  const moving = Array.from({ length: 100 }, (_, f) => box(f, 10 + 3 * f, 50 + f));
  assert.equal(staticBoxes(still, { frames: 200 }).top_cell.frames_with_a_box_there, 100);
  assert.equal(staticBoxes(still, { frames: 200 }).top_cell.share_of_clip_frames, 0.5);
  assert.ok(staticBoxes(moving, { frames: 200 }).top_cell.frames_with_a_box_there <= 4);
});
