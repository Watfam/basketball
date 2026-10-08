import { test } from "node:test";
import assert from "node:assert/strict";
import { countByKind, thisWeek, toActivities } from "./activity.ts";
import { computeStreakWeeks } from "./progress.ts";

// Thursday 8 October 2026, mid-afternoon.
const now = new Date(2026, 9, 8, 15, 0);

test("shooting, film and the combine count, not just workouts", () => {
  const acts = toActivities({
    workout: [],
    shooting: [new Date(2026, 9, 6, 17).toISOString(), new Date(2026, 9, 7, 18).toISOString()],
    film: [new Date(2026, 9, 8, 9).toISOString()],
    combine: [null],
  });
  assert.equal(acts.length, 3);
  assert.deepEqual(countByKind(acts), { workout: 0, shooting: 2, combine: 0, film: 1 });
  // Newest first.
  assert.equal(acts[0].kind, "film");
  assert.equal(computeStreakWeeks(acts.map((a) => a.at), now), 1);
});

test("the week strip runs Monday to Sunday and counts days, not sessions", () => {
  const acts = toActivities({
    shooting: [new Date(2026, 9, 5, 7).toISOString(), new Date(2026, 9, 5, 19).toISOString()],
    workout: [new Date(2026, 9, 7, 16).toISOString()],
    // Last Sunday: not this week.
    film: [new Date(2026, 9, 4, 20).toISOString()],
  });
  const w = thisWeek(acts, now);
  assert.deepEqual(w.days, [true, false, true, false, false, false, false]);
  assert.equal(w.activeDays, 2);
  assert.equal(w.today, 3);
});

test("unreadable dates are skipped", () => {
  assert.equal(toActivities({ shooting: ["not a date", undefined] }).length, 0);
});
