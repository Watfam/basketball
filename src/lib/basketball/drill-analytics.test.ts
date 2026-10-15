import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_COMPARISON_NOTE, NOT_A_GAME_CLAIM, VOLUME_CAVEAT, categoryStats, compareCategoriesAtSameSpot, describeSeries, drillSeries, wilson, type TrackedRow } from "./drill-analytics.ts";
import { buildTrackedMetrics, type ShotRow } from "./drill-tracking.ts";

const shots = (makes: number, n: number, source: "camera" | "manual" = "camera"): ShotRow[] => Array.from({ length: n }, (_, i) => ({ made: i < makes, source, detected_made: source === "camera" ? i < makes : null, added_by_hand: false }));
let id = 0;
function row(drill: string, variant: string | null, makes: number, n: number, at: string, over: { kind?: "shots" | "time"; target?: number; source?: "camera" | "manual"; session?: string } = {}): TrackedRow {
  id += 1;
  return { logId: `l${id}`, workoutSessionId: over.session ?? `w${id}`, at, drillName: drill, metrics: buildTrackedMetrics({ drill: { name: drill, skill_tags: ["shooting"] }, variant, goal: { kind: over.kind ?? "shots", target: over.target ?? n }, shots: shots(makes, n, over.source), shotSessionId: `s${id}` }) };
}

test("Wilson intervals behave: wider with fewer shots, bounded, and sensible at the edges", () => {
  const a = wilson(6, 10), b = wilson(60, 100); assert.ok(a.hi - a.lo > b.hi - b.lo);
  assert.ok(wilson(0, 10).lo === 0 && wilson(10, 10).hi === 1); assert.deepEqual(wilson(0, 0), { lo: 0, hi: 1 });
});

test("results are kept by kind of shot, with sample size, interval and how they were counted; kinds with no results do not appear", () => {
  const rows = [row("Elbow Pull-Up", "Right side", 12, 30, "2026-10-01"), row("Wing Step-Back", "Right wing", 6, 24, "2026-10-02", { source: "manual" }), row("Catch-and-Shoot off the Pin-Down", "Right wing", 20, 32, "2026-10-03"), row("Free Throw Reset", null, 3, 4, "2026-10-03")];
  const s = categoryStats(rows); assert.deepEqual(s.map((x) => x.category), ["stationary", "catch_and_shoot", "off_the_dribble"]);
  const otd = s.find((x) => x.category === "off_the_dribble")!; assert.deepEqual([otd.attempts, otd.makes, otd.pct, otd.drills], [54, 18, 33, 2]); assert.deepEqual(otd.counted, { camera: 1, taps: 1, mixed: 0 });
  assert.equal(s.find((x) => x.category === "stationary")!.enough, false, "4 free throws are not enough to read anything into");
  assert.ok(!s.some((x) => x.category === "movement" || x.category === "decision" || x.category === "change_of_direction"));
});

test("the same drill and spot over time: a gap is called real only with enough shots and non-overlapping intervals; otherwise it is plainly within variation", () => {
  const same = drillSeries([row("Elbow Pull-Up", "Right side", 15, 30, "2026-10-01"), row("Elbow Pull-Up", "Right side", 17, 30, "2026-10-08"), row("Elbow Pull-Up", "Left side", 9, 30, "2026-10-08")]);
  assert.equal(same.length, 2, "right and left are separate series");
  const right = same.find((s) => s.variant === "Right side")!, st = describeSeries(right); assert.equal(st.kind, "not_distinguishable"); assert.match(st.text, /within normal variation/); assert.ok(!/improv|better|progress/i.test(st.text));
  const big = describeSeries(drillSeries([row("Elbow Pull-Up", "Right side", 10, 60, "2026-10-01"), row("Elbow Pull-Up", "Right side", 40, 60, "2026-10-20")])[0]); assert.equal(big.kind, "supported"); assert.match(big.text, /higher the second time/);
  assert.ok(big.caveats.includes(VOLUME_CAVEAT) && big.caveats.includes(NOT_A_GAME_CLAIM));
  const few = describeSeries(drillSeries([row("Free Throw Reset", null, 1, 4, "2026-10-01"), row("Free Throw Reset", null, 4, 4, "2026-10-08")])[0]); assert.equal(few.kind, "too_few");
  assert.equal(describeSeries(drillSeries([row("Elbow Pull-Up", "Right side", 5, 10, "2026-10-01")])[0]).kind, "single");
});

test("a clock challenge and a fixed number of shots are never compared; very different amounts of work are flagged", () => {
  const mixed = describeSeries(drillSeries([row("Beat the Clock Finisher", "Free throw line", 20, 40, "2026-10-01", { kind: "time", target: 60 }), row("Beat the Clock Finisher", "Free throw line", 20, 40, "2026-10-08", { kind: "shots", target: 40 })])[0]);
  assert.equal(mixed.kind, "not_comparable");
  const load = describeSeries(drillSeries([row("Elbow Pull-Up", "Right side", 12, 30, "2026-10-01", { target: 30 }), row("Elbow Pull-Up", "Right side", 18, 40, "2026-10-15", { target: 40 })])[0]);
  assert.match(load.caveats[0], /amount of work/);
});

test("kinds of shot are compared only from the same spot, with enough shots, and a gap is never called a verdict on a skill", () => {
  const rows = [
    row("Catch-and-Shoot off the Pin-Down", "Right wing", 28, 40, "2026-10-01"), row("Wing Step-Back", "Right wing", 11, 40, "2026-10-02"),
    row("Elbow Pull-Up", "Right side", 20, 40, "2026-10-03"), row("Catch-and-Shoot off the Pin-Down", "Left wing", 5, 10, "2026-10-04"),
  ];
  const cmp = compareCategoriesAtSameSpot(rows, "catch_and_shoot", "off_the_dribble");
  assert.equal(cmp.length, 1, "only the right wing has both kinds with enough shots"); assert.equal(cmp[0].spot, "right wing");
  assert.equal(cmp[0].statement.kind, "supported"); assert.ok(cmp[0].statement.caveats[0].includes("not a verdict on either skill"));
  assert.deepEqual(compareCategoriesAtSameSpot(rows, "stationary", "off_the_dribble"), []);
  assert.deepEqual(compareCategoriesAtSameSpot([row("Elbow Pull-Up", null, 20, 40, "2026-10-01"), row("Catch-and-Shoot off the Pin-Down", null, 20, 40, "2026-10-01")], "catch_and_shoot", "off_the_dribble"), [], "no named spot, no comparison");
  assert.match(CATEGORY_COMPARISON_NOTE, /only when they were shot from the same spot/);
});

test("no statement claims skill transfer to games or equates volume, completion or fatigue with improvement", () => {
  const texts = [NOT_A_GAME_CLAIM, VOLUME_CAVEAT, CATEGORY_COMPARISON_NOTE, ...drillSeries([row("Elbow Pull-Up", "Right side", 10, 60, "2026-10-01"), row("Elbow Pull-Up", "Right side", 40, 60, "2026-10-20")]).flatMap((s) => { const d = describeSeries(s); return [d.text, ...d.caveats]; })];
  for (const t of texts) assert.ok(!/will transfer|carries over to games|game[- ]ready|game speed|got better at|skill improved/i.test(t), t);
  assert.match(NOT_A_GAME_CLAIM, /do not show how the same shots go in a game/);
});
