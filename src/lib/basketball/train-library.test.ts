import test from "node:test";
import assert from "node:assert/strict";
import { filterWorkouts, optionCounts, parseWorkoutFilters, describeFilters, filterHref, NO_FILTERS, hasFilters } from "./train-library.ts";

const w = (focus: string[], minutes: number | null, diffs: (string | null)[]) => ({ focus_areas: focus, estimated_minutes: minutes, workout_drills: diffs.map((d) => ({ drills: { difficulty: d } })) });
const list = [
  w(["shooting"], 15, ["beginner"]),
  w(["shooting"], 25, ["beginner", "intermediate"]),
  w(["ball_handling"], 35, ["advanced"]),
  w(["shooting", "ball_handling"], 20, ["intermediate"]),
  w(["defense"], null, [null]),
];
const mins = (x: (typeof list)[number]) => x.estimated_minutes;

test("filters read from the address, and anything unknown is dropped", () => {
  assert.deepEqual(parseWorkoutFilters({ skill: "shooting", time: "mid", level: "advanced" }), { skill: "shooting", time: "mid", level: "advanced" });
  assert.deepEqual(parseWorkoutFilters({ skill: "nonsense", time: "x" }), NO_FILTERS);
  assert.equal(hasFilters(NO_FILTERS), false);
});

test("skill, time and level combine, and a workout with no length never matches a time band", () => {
  assert.equal(filterWorkouts(list, { skill: "shooting", time: null, level: null }, mins).length, 3);
  assert.equal(filterWorkouts(list, { skill: "shooting", time: "short", level: null }, mins).length, 1);
  assert.equal(filterWorkouts(list, { skill: null, time: "mid", level: null }, mins).length, 2, "20 and 25 are 20 to 30");
  assert.equal(filterWorkouts(list, { skill: null, time: "long", level: "advanced" }, mins).length, 1);
  assert.equal(filterWorkouts(list, { skill: "defense", time: "short", level: null }, mins).length, 0);
  assert.equal(filterWorkouts(list, NO_FILTERS, mins).length, 5, "no filters shows everything");
});

test("a workout's level is its hardest drill", () => {
  assert.equal(filterWorkouts(list, { skill: null, time: null, level: "intermediate" }, mins).length, 2);
});

test("option counts take the other filters into account", () => {
  const c = optionCounts(list, { skill: "shooting", time: null, level: null }, "time", ["short", "mid", "long"], mins);
  assert.deepEqual(c, { short: 1, mid: 2, long: 0 });
});

test("describing and linking filters", () => {
  assert.equal(describeFilters({ skill: "ball_handling", time: "mid", level: null }), "Ball handling, 20 to 30 min");
  assert.equal(filterHref("/x", NO_FILTERS, {}), "/x");
  assert.equal(filterHref("/x", { skill: "shooting", time: null, level: null }, { time: "mid" }), "/x?skill=shooting&time=mid");
  assert.equal(filterHref("/x", { skill: "shooting", time: "mid", level: null }, { skill: null }), "/x?time=mid");
});
