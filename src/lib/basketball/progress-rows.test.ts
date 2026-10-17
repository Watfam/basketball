import test from "node:test";
import assert from "node:assert/strict";
import { toProgressRows } from "./progress-rows.ts";
import { parseRange, rangeParams, seasonStartOf } from "./progress-range.ts";
import { buildTrackedMetrics } from "./drill-tracking.ts";

const m = (makes: number, n: number, bm = false) => buildTrackedMetrics({ drill: { name: "Free Throw Reset" }, variant: "Benchmark v1", goal: null, shots: Array.from({ length: n }, (_, i) => ({ made: i < makes, source: "camera", detected_made: i < makes, added_by_hand: false })), shotSessionId: "s", benchmark: bm ? { protocol: "free_throw@v1", conditions: null, conditions_complete: true, clock_complete: null, redo: 0 } : undefined });

test("rows arrive as the database returns them, as objects or lists, and non-results are dropped", () => {
  const rows = toProgressRows([
    { id: "a", session_id: "w1", metrics: m(20, 30, true), created_at: "2026-10-06T10:00:00Z", drills: { name: "Free Throw Reset" }, workout_sessions: { started_at: "2026-10-05T10:00:00Z", status: "completed", program_days: { week_number: 1, day_number: 4 } } },
    { id: "b", session_id: "w2", metrics: m(18, 30, true), created_at: "2026-10-20T10:00:00Z", drills: [{ name: "Free Throw Reset" }], workout_sessions: [{ started_at: null, status: "in_progress", program_days: [{ week_number: 3, day_number: 4 }] }] },
    { id: "c", session_id: "w3", metrics: { type: "reps", sets: 3 }, created_at: "2026-10-21T10:00:00Z", drills: { name: "X" }, workout_sessions: { started_at: "2026-10-21T10:00:00Z", status: "completed", program_days: null } },
    { id: "d", session_id: "w4", metrics: m(1, 2), created_at: "2026-10-22T10:00:00Z", drills: null, workout_sessions: { started_at: "x", status: null, program_days: null } },
    { id: "e", session_id: "w5", metrics: "rubbish", created_at: "2026-10-22T10:00:00Z", drills: { name: "X" }, workout_sessions: null },
  ]);
  assert.deepEqual(rows.map((r) => [r.logId, r.week, r.day, r.at.slice(0, 10)]), [["a", 1, 4, "2026-10-05"], ["b", 3, 4, "2026-10-20"]]);
  assert.equal(rows[1].status, "in_progress");
});

test("ranges: the presets, a custom range, swapped dates, and rubbish all give a sensible range", () => {
  const now = new Date(2026, 9, 15, 12);
  assert.equal(parseRange({}, now).key, "12w"); assert.equal(parseRange({ range: "wat" }, now).key, "12w");
  const four = parseRange({ range: "4w" }, now); assert.equal(Math.round((now.getTime() - four.from!.getTime()) / 864e5), 28);
  assert.equal(parseRange({ range: "all" }, now).from, null);
  assert.deepEqual(seasonStartOf(new Date(2026, 9, 15)), new Date(2026, 7, 1)); assert.deepEqual(seasonStartOf(new Date(2026, 2, 1)), new Date(2025, 7, 1));
  const c = parseRange({ from: "2026-09-01", to: "2026-09-30" }, now);
  assert.equal(c.key, "custom"); assert.equal(c.to!.getDate(), 30); assert.equal(c.to!.getHours(), 23, "the end day is included");
  const swapped = parseRange({ from: "2026-09-30", to: "2026-09-01" }, now); assert.ok(swapped.from! < swapped.to!);
  assert.equal(parseRange({ from: "2026-02-31" }, now).key, "12w", "an impossible date is ignored");
  assert.equal(parseRange({ from: "yesterday" }, now).key, "12w");
  assert.deepEqual(rangeParams(c), { from: "2026-09-01", to: "2026-09-30" }); assert.deepEqual(rangeParams(four), { range: "4w" });
  assert.equal(parseRange({ from: "2026-09-01" }, now).to, null, "open-ended");
});
