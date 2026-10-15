import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, buildReference } from "./diagnose.mjs";

const refs = [{ t: 100, outcome: "make" }, { t: 200, outcome: "miss" }, { t: 300, outcome: "make" }];
const P = (first, last, v4) => ({ first, last, v4 });

test("a perfect prediction: all matched, all boundaries right, all outcomes right, nothing else", () => {
  const r = classify([P(98, 125, "make"), P(199, 225, "miss"), P(301, 330, "make")], refs);
  assert.deepEqual([r.matched, r.boundary_correct, r.outcome_correct, r.outcome_incorrect, r.merged_predictions, r.split_references, r.missing, r.extra], [3, 3, 3, 0, 0, 0, 0, 0]);
});

test("a merged prediction (one call covering two references) is counted once, scores no outcome, and does not cascade into the shots after it", () => {
  const r = classify([P(98, 230, "make"), P(301, 330, "make")], refs);
  assert.equal(r.merged_predictions, 1); assert.equal(r.merged_references, 2); assert.equal(r.matched, 1); assert.equal(r.outcome_correct, 1); assert.equal(r.outcome_incorrect, 0); assert.equal(r.merged_not_scored, 2);
  assert.equal(r.missing, 0);
});

test("a lost shot is ONE missing shot; the others keep their own outcomes (no slide)", () => {
  const r = classify([P(98, 125, "make"), P(301, 330, "make")], refs);
  assert.equal(r.missing, 1); assert.equal(r.matched, 2); assert.equal(r.outcome_correct, 2); assert.equal(r.outcome_incorrect, 0);
});

test("a split reference (two predictions inside one reference's cover) and an extra prediction are reported separately", () => {
  const r = classify([P(98, 105, "make"), P(112, 130, "miss"), P(199, 225, "miss"), P(301, 330, "make"), P(480, 500, "miss")], refs);
  assert.equal(r.split_references, 1); assert.equal(r.extra, 1); assert.equal(r.matched, 2);
});

test("boundary tolerance: a match 20 frames late is matched but not boundary-correct; a wrong call on a matched shot is an outcome error", () => {
  const r = classify([P(120, 140, "miss"), P(199, 225, "miss"), P(301, 330, "make")], refs);
  assert.equal(r.matched, 3); assert.equal(r.boundary_correct, 2); assert.equal(r.outcome_incorrect, 1);
});

test("reference building: clusters need two pipelines, phantoms adjudicated away", () => {
  const ref = buildReference({ B: [1, 100, 500], K: [1, 102, 900], C: [99, 301] }, [1]);
  assert.deepEqual(ref.map((r) => r.t), [100]);
});
