import test from "node:test";
import assert from "node:assert/strict";
import { buildEntryExtras } from "./drill-session-view.ts";

const entry = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, drill_id: `d-${name}`, sort_order: 0, block: "main", variant_label: null, levels: [], level_targets: {}, target_sets: null, target_reps: null, target_duration_seconds: null, drills: { id: `d-${name}`, name, skill_tags: name.includes("Pound") ? ["ball_handling"] : ["shooting"] }, ...over });
const lessons = [{ id: "L1", title: "Footwork Into the Pull-Up", url: null, watch_for: ["The gather", "Landing in the same spot"], skill_tags: ["shooting"], drill_id: "d-Off-the-Dribble Pull-Up Series", sort_order: 1 }];
const level = "intermediate" as const;

test("a Shot Builder day: each shooting drill gets its category, whether the camera is offered, the goal from its own prescription, and its lesson", () => {
  const entries = [
    entry("e1", "Pound Dribble Series", { target_duration_seconds: 60 }),
    entry("e2", "One-Hand Form Shooting", { level_targets: { intermediate: { sets: 3, reps: 12 } } }),
    entry("e3", "Elbow Pull-Up", { variant_label: "Right side", level_targets: { intermediate: { sets: 3, reps: 10 } } }),
    entry("e4", "Free Throw Reset", { target_sets: 2, target_reps: 2 }),
    entry("e5", "Beat the Clock Finisher", { variant_label: "Free throw line", target_duration_seconds: 60 }),
  ];
  const x = buildEntryExtras({ entries, level, volumeStep: 0, lessons, householdLinks: new Map(), watched: new Set() });
  assert.equal(x.e1, undefined, "a ball-handling drill is left exactly as it was");
  assert.deepEqual([x.e2.tracking.trackable, x.e2.tracking.category, x.e2.tracking.goal], [false, "stationary", null]); assert.match(x.e2.tracking.why, /mechanics/);
  assert.deepEqual([x.e3.tracking.trackable, x.e3.tracking.categoryLabel, x.e3.tracking.goal], [true, "Off-the-dribble shooting", { kind: "shots", target: 30 }]);
  assert.equal(x.e3.lesson?.title, "Footwork Into the Pull-Up"); assert.equal(x.e3.lesson?.basis, "related"); assert.equal(x.e3.lesson?.url, null, "no address is invented");
  assert.deepEqual(x.e4.tracking.goal, { kind: "shots", target: 4 });
  assert.deepEqual([x.e5.tracking.category, x.e5.tracking.goal], ["pressure_challenge", { kind: "time", target: 60 }]);
});

test("the goal follows the program week's volume, the household's video link wins, and watched lessons are marked", () => {
  const e = [entry("e3", "Elbow Pull-Up", { level_targets: { intermediate: { sets: 3, reps: 10 } } })];
  const w3 = buildEntryExtras({ entries: e, level, volumeStep: 2, lessons, householdLinks: new Map([["L1", "https://youtu.be/abc123"]]), watched: new Set(["L1"]) });
  assert.deepEqual(w3.e3.tracking.goal, { kind: "shots", target: 36 }, "3 sets x (10 + 2 reps)");
  assert.equal(w3.e3.lesson?.url, "https://youtu.be/abc123"); assert.equal(w3.e3.lesson?.watched, true);
  assert.deepEqual(w3.e3.lesson?.watchFor, ["The gather", "Landing in the same spot"]);
});

test("entries with no drill, and a drill with no lesson, are handled", () => {
  const x = buildEntryExtras({ entries: [{ ...entry("e9", "x"), drills: null }, entry("e6", "Catch-and-Shoot off the Pin-Down", { variant_label: "Right wing", level_targets: { intermediate: { sets: 4, reps: 10 } } })], level, volumeStep: 0, lessons, householdLinks: new Map(), watched: new Set() });
  assert.equal(x.e9, undefined); assert.equal(x.e6.lesson, null); assert.deepEqual(x.e6.tracking.goal, { kind: "shots", target: 40 });
});
