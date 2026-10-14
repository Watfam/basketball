import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFrame, summarizeDetection, repeatability } from "./detect.mjs";

const ball = (cx, cy, diameter = 24) => ({ cx, cy, diameter });
const box = (cx, cy, w = 24, score = 0.9) => ({ x1: cx - w / 2, y1: cy - w / 2, x2: cx + w / 2, y2: cy + w / 2, score });

test("a box on the ball is a hit, with its centre error", () => {
  const m = matchFrame([ball(100, 100)], [box(103, 104)]);
  assert.deepEqual([m.tp, m.fp, m.fn], [1, 0, 0]);
  assert.ok(Math.abs(m.pairs[0].err_px - 5) < 1e-9);
});

test("a box farther than half a ball diameter is a false positive AND leaves the ball missed", () => {
  const m = matchFrame([ball(100, 100)], [box(100, 125)]);
  assert.deepEqual([m.tp, m.fp, m.fn], [0, 1, 1]);
});

test("boxes below the threshold are ignored; two boxes cannot claim one ball", () => {
  const m = matchFrame([ball(100, 100)], [box(100, 100, 24, 0.2), box(101, 101, 24, 0.8), box(99, 99, 24, 0.7)]);
  assert.deepEqual([m.tp, m.fp, m.fn], [1, 1, 0]);
});

test("a frame with no ball and no box is neither a hit nor an error", () => {
  const m = matchFrame([], []);
  assert.deepEqual([m.tp, m.fp, m.fn], [0, 0, 0]);
});

test("strata are summarised separately and the whole is not the only number", () => {
  const frames = [
    { id: "a", stratum: "motion_high", balls: [ball(50, 50)], boxes: [box(50, 50)] },
    { id: "b", stratum: "detector_gap", balls: [ball(60, 60)], boxes: [] },
    { id: "c", stratum: "motion_low", balls: [], boxes: [box(10, 10)] },
  ];
  const s = summarizeDetection(frames);
  assert.equal(s["stratum:detector_gap"].fn, 1);
  assert.equal(s["stratum:motion_low"].fp, 1);
  assert.equal(s.all.tp, 1);
  assert.ok(s["stratum:detector_gap"].centre_error_px.unavailable);
});

test("repeatability is the disagreement between two passes over the same frame", () => {
  const mk = (x, y) => ({ balls: [{ cx: x, cy: y, diameter: 24 }] });
  const pairs = Array.from({ length: 6 }, (_, i) => [mk(100, 100), mk(100 + i, 100)]);
  const r = repeatability(pairs);
  assert.equal(r.frames, 6);
  assert.equal(r.centre_difference_px.n, 6);
  assert.equal(r.centre_difference_px.max, 5);
  assert.equal(repeatability([[{ balls: [] }, { balls: [] }]]).centre_difference_px.unavailable.length > 0, true);
});

test("a box on an ignored low-confidence annotation is not a false positive", () => {
  const ignore = [ball(100, 100, 40)];
  const m = matchFrame([], [box(105, 100)], { ignore });
  assert.deepEqual([m.tp, m.fp, m.fn], [0, 0, 0]);
  const far = matchFrame([], [box(300, 300)], { ignore });
  assert.equal(far.fp, 1);
});
