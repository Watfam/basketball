import { test } from "node:test";
import assert from "node:assert/strict";
import { compareReports } from "./compare.mjs";

const shotClip = (clip, v4) => ({ clip, matched: v4.length, written: v4.length, correct: { v4: v4.filter((x) => x).length }, per_shot: v4.map((ok, i) => ({ ti: i, seen: true, truth: i % 2 ? "miss" : "make", v4: ok ? (i % 2 ? "miss" : "make") : (i % 2 ? "make" : "miss") })) });
const report = (clips, extra = {}) => ({ id: "r", reproducibility: { datasets_sha256: "d", thresholds_sha256: "t" }, sections: { shot_classification: { current_ball6_30fps: { clips }, current_ball6_15fps: { clips } }, tracking: {}, performance: {}, detection_and_localization: {}, ...extra } });
const thr = {};

test("identical reports show no change", () => {
  const r = report([shotClip("A", [1, 1, 0, 1, 1, 1, 0, 1])]);
  const c = compareReports(r, r, thr);
  assert.ok(c.valid);
  assert.ok(c.findings.filter((f) => f.area.startsWith("shots/")).every((f) => f.verdict === "no change"));
});

test("losing two calls on one clip is a regression even if the pool is flat", () => {
  const a = report([shotClip("A", [1, 1, 1, 1, 0, 0]), shotClip("B", [0, 0, 1, 1, 1, 1])]);
  const b = report([shotClip("A", [0, 0, 1, 1, 0, 0]), shotClip("B", [1, 1, 1, 1, 1, 1])]);
  const f = compareReports(a, b, thr).findings.find((x) => x.area === "shots/current_ball6_30fps");
  assert.equal(f.verdict, "REGRESSION");
});

test("five net shots gained with no clip losing two is an improvement", () => {
  const a = report([shotClip("A", [0, 0, 0, 0, 0, 1, 1, 1])]);
  const b = report([shotClip("A", [1, 1, 1, 1, 1, 1, 1, 1])]);
  assert.equal(compareReports(a, b, thr).findings.find((x) => x.area === "shots/current_ball6_30fps").verdict, "improvement");
});

test("a changed evaluation set or threshold file voids the comparison", () => {
  const a = report([]); const b = report([]); b.reproducibility.thresholds_sha256 = "other";
  const c = compareReports(a, b, thr);
  assert.equal(c.valid, false);
  assert.match(c.warnings[0], /thresholds/);
});

test("tracking: a candidate must beat the best baseline by 20% in the median without a worse tail", () => {
  const cell = (cands) => ({ interpolation: { "30fps": { all: { free_flight: { 3: { linear: { median: 2, p95: 6 }, constant_velocity: { median: 3, p95: 8 }, constant_acceleration: { median: 1.5, p95: 5 }, ...cands } } } } } });
  const base = report([], { tracking: cell({}) });
  const good = report([], { tracking: cell({ kalman: { median: 1.0, p95: 5.2 } }) });
  const tail = report([], { tracking: cell({ kalman: { median: 1.0, p95: 9 } }) });
  assert.match(compareReports(base, good, thr).findings.find((f) => f.area === "tracking/interpolation").verdict, /improvement/);
  assert.doesNotMatch(compareReports(base, tail, thr).findings.find((f) => f.area === "tracking/interpolation").verdict, /improvement/);
  assert.equal(compareReports(base, base, thr).findings.find((f) => f.area === "tracking/interpolation").verdict, "no candidate");
});

test("slower inference by more than 10 percent is a regression", () => {
  const mk = (ms) => report([], { performance: { offline_inference_desktop: { ms_median: ms } } });
  assert.equal(compareReports(mk(40), mk(46), thr).findings.find((f) => f.area === "performance/inference").verdict, "REGRESSION");
  assert.equal(compareReports(mk(40), mk(42), thr).findings.find((f) => f.area === "performance/inference").verdict, "no change");
});

test("a shot the candidate stops counting is a loss even though it is no wrong call", () => {
  const a = report([shotClip("A", [1, 1, 1, 1, 1, 1])]);
  const b = report([shotClip("A", [1, 1, 1, 1, 1, 1])]);
  b.sections.shot_classification.current_ball6_30fps.clips[0].per_shot[2] = { ti: 2, truth: "make", seen: false };
  b.sections.shot_classification.current_ball6_30fps.clips[0].correct.v4 = 5;
  const f = compareReports(a, b, thr).findings.find((x) => x.area === "shots/current_ball6_30fps");
  assert.match(f.text, /1 lost/);
});
