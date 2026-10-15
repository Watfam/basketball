import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, SCHEMA } from "./fingerprint.mjs";

const rim = { x: 200, y: 190 };
const pt = (f, x, y, w = 24, score = 0.9) => ({ f, x, y, w, score });
// a ball falling toward the rim from above and slightly right, 20 frames
const fall = (dxPerFrame = -1, f0 = 100) => Array.from({ length: 22 }, (_, i) => pt(f0 + i, 200 + 30 + dxPerFrame * i, 190 - 160 + i * 8));
const mk = (points, extra = {}) => fingerprint({ id: "t:1", clip: "T", first: 118, thin: 1, rim, points, segments: 1, events: [], ...extra });

test("schema, units and an evidence link are always present, and no outcome field exists", () => {
  const f = mk(fall());
  assert.equal(f.schema, SCHEMA); assert.ok(f.units.note.includes("not")); assert.deepEqual(f.evidence.video_frame_range, [43, 133]);
  assert.ok(!("outcome" in f) && !("label" in f) && !("labels" in f));
});

test("rim-level offset, approach direction and descent speed are measured from observed points in ball widths", () => {
  const f = mk(fall(-1)), m = f.measurements;
  assert.ok(m.rim_level_x_bw.value !== null);
  assert.ok(Math.abs(m.rim_level_x_bw.value - ((230 - 1 * 20) - 200) / 24) < 0.5, String(m.rim_level_x_bw.value)); assert.equal(m.rim_level_x_bw.bracketed, true);
  assert.ok(m.approach_direction_deg.value < 0, "moving toward image-left is negative");
  assert.ok(Math.abs(m.descent_speed_bw_per_frame.value - 8 / 24) < 0.02);
});

test("missing evidence stays unavailable with a reason: a path that never reaches the rim level has no rim-level offset", () => {
  const f = mk(fall().filter((p) => p.y < 190 - 70), {});
  assert.equal(f.measurements.rim_level_x_bw.value, null); assert.match(f.measurements.rim_level_x_bw.reason, /no_observed/);
  assert.equal(f.measurements.rim_interaction_observed.value, null);
});

test("with fewer than 3 descending points in the band the direction is unavailable, not guessed", () => {
  const sparse = [pt(110, 230, 70), pt(118, 215, 180), pt(119, 214, 188)];
  const f = mk(sparse);
  assert.equal(f.measurements.approach_direction_deg.value, null);
});

test("a gap is counted from observed points only and reconstructed points are never an input (the generator takes observed points)", () => {
  const f = mk(fall().filter((p) => p.f !== 108 && p.f !== 109));
  assert.equal(f.measurements.gap_count.value, 1); assert.equal(f.measurements.max_gap_frames.value, 2);
});

test("an observed point rising above the rim after the closest approach is a rim interaction; a clean drop with 4 points after it is not", () => {
  const bounce = [...fall(-1).filter((p) => p.f <= 118), pt(119, 208, 190), pt(120, 210, 170), pt(121, 212, 140), pt(122, 213, 120)];
  assert.equal(mk(bounce).measurements.rim_interaction_observed.value, true);
  const through = [...fall(-1).filter((p) => p.f <= 118), pt(119, 208, 200), pt(120, 208, 215), pt(121, 208, 230), pt(122, 208, 245), pt(123, 208, 260)];
  assert.equal(mk(through).measurements.rim_interaction_observed.value, false);
});

test("outcome firewall: the generator output is bit-identical whatever labels exist elsewhere", () => {
  const a = JSON.stringify(mk(fall())), labels = { "t:1": "make" }; labels["t:1"] = "miss";
  assert.equal(a, JSON.stringify(mk(fall())));
});

test("an ambiguous break near the first zone sighting marks the shot unusable for comparison", () => {
  const f = mk(fall(), { events: [{ f: 112, reason: "ambiguous" }] });
  assert.equal(f.measurements.ambiguous_break.value, true); assert.equal(f.quality.usable_for_comparison, false);
});

test("criteria-v3 anchor: a crossing that happens 30 frames after the first zone sighting is found (the fixed +3 window of the first draft would miss it)", () => {
  const slow = Array.from({ length: 50 }, (_, i) => pt(100 + i, 205, 190 - 120 + i * 3.2));
  const f = fingerprint({ id: "t:2", clip: "T", first: 100, thin: 1, rim, points: slow, segments: 1, events: [] });
  assert.ok(f.measurements.rim_crossing_frame.value > 130, String(f.measurements.rim_crossing_frame.value));
  assert.ok(f.measurements.rim_level_x_bw.value !== null);
});
