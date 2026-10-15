import { test } from "node:test";
import assert from "node:assert/strict";
import { generateInsights, lint, BANNED, INTERPRETATION } from "./insights.mjs";
import { rng } from "../../lib/stats.mjs";

const mkSet = (shots, over = {}) => ({ name: "T", clips: ["T"], shots, stable: { rim_level_x_bw: true }, clusteringRepeatable: false, ...over });
const shot = (i, outcome, x, over = {}) => ({ id: `T:${i}`, clip: "T", first: i * 100, outcome, x, usable: true, cluster: null, ...over });
const noise = (r) => (r() - 0.5) * 0.6;

test("a clear, large, consistent separation is SUPPORTED with every required field and the observation/interpretation split", () => {
  const r = rng(5), shots = [...Array.from({ length: 16 }, (_, i) => shot(i, "make", 0.1 + noise(r))), ...Array.from({ length: 16 }, (_, i) => shot(100 + i, "miss", 2.0 + noise(r)))];
  const res = generateInsights(mkSet(shots)), s1 = res.statements.find((s) => s.id === "S1");
  assert.equal(s1.status, "supported"); assert.ok(s1.supporting_shot_ids.length === 32); assert.ok(s1.uncertainty.ci95.lo > 0 && s1.uncertainty.holm_adjusted_p < 0.05);
  assert.equal(s1.observation_vs_interpretation.interpretation, INTERPRETATION); assert.ok(s1.n_by_group.make === 16 && s1.n_by_group.miss === 16);
  const s2 = res.statements.find((s) => s.id === "S2"); assert.equal(s2.status, "supported"); assert.match(s2.claim_observation, /image-right/);
});

test("abstains with the right reason: too few shots, low availability, unstable measure, ambiguous camera view, null effect", () => {
  const r = rng(6), same = (n) => Array.from({ length: n }, (_, i) => shot(i, i % 2 ? "make" : "miss", 0.5 + noise(r)));
  assert.equal(generateInsights(mkSet(same(10))).statements.find((s) => s.id === "S1").reason, "insufficient_n");
  const sparse = [...same(30)].map((s, i) => ({ ...s, x: i % 3 ? null : s.x })); assert.equal(generateInsights(mkSet(sparse)).statements.find((s) => s.id === "S1").reason, "low_availability");
  assert.equal(generateInsights(mkSet(same(40), { stable: { rim_level_x_bw: false } })).statements.find((s) => s.id === "S1").reason, "unstable_measure");
  assert.equal(generateInsights(mkSet(same(40), { clips: ["IMG_4851"] })).statements.find((s) => s.id === "S1").reason, "ambiguous_camera_view");
  const nul = generateInsights(mkSet(same(60))).statements.filter((s) => s.id === "S1" || s.id === "S2" || s.id === "S3");
  assert.ok(nul.every((s) => s.status === "abstained"), JSON.stringify(nul.map((s) => [s.id, s.status, s.reason])));
});

test("a statistically real but tiny difference is not reported (below practical size)", () => {
  const r = rng(7), shots = [...Array.from({ length: 200 }, (_, i) => shot(i, "make", 0.30 + noise(r) * 0.4)), ...Array.from({ length: 200 }, (_, i) => shot(500 + i, "miss", 0.40 + noise(r) * 0.4))];
  const s1 = generateInsights(mkSet(shots)).statements.find((s) => s.id === "S1"); assert.equal(s1.status, "abstained"); assert.equal(s1.reason, "below_practical_size");
});

test("the language lint rejects mechanical words and bare left/right, and requires every field on a supported statement", () => {
  for (const w of ["elbow", "wrist", "follow-through", "mechanics", "release point", "because", "you should"]) assert.match(w, BANNED);
  assert.throws(() => lint({ status: "abstained", claim_observation: "your elbow drifts", interpretation_limit: "" }));
  assert.throws(() => lint({ status: "abstained", claim_observation: "the ball went left", interpretation_limit: "" }));
  assert.throws(() => lint({ status: "supported", claim_observation: "the ball was farther toward image-left", interpretation_limit: INTERPRETATION }));
});

test("recent-variability statement does not read outcomes: shuffling outcomes leaves it unchanged", () => {
  const r = rng(8), xs = [...Array.from({ length: 40 }, () => noise(r) * 0.2), -3, 3, -2.5, 2.5, -3, 3, -2, 2];
  const mk = (flip) => xs.map((x, i) => shot(i, (i + flip) % 2 ? "make" : "miss", x));
  const a = generateInsights(mkSet(mk(0))).statements.find((s) => s.id === "S4"), b = generateInsights(mkSet(mk(1))).statements.find((s) => s.id === "S4");
  assert.equal(a.status, "supported"); assert.equal(JSON.stringify(a.uncertainty), JSON.stringify(b.uncertainty));
});

test("determinism: same input, same output", () => {
  const r = rng(9), shots = Array.from({ length: 30 }, (_, i) => shot(i, i % 2 ? "make" : "miss", noise(r)));
  assert.equal(JSON.stringify(generateInsights(mkSet(shots))), JSON.stringify(generateInsights(mkSet(shots))));
});
