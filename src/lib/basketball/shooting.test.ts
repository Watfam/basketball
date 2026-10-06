import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonStart, shotsPerMinute, summarize, totalSessions, type Shot } from "./shooting.ts";

test("the season starts on August 1, across the new year", () => {
  assert.deepEqual(seasonStart(new Date(2026, 9, 6)), new Date(2026, 7, 1));
  assert.deepEqual(seasonStart(new Date(2027, 1, 10)), new Date(2026, 7, 1));
  assert.deepEqual(seasonStart(new Date(2026, 7, 1)), new Date(2026, 7, 1));
  assert.deepEqual(seasonStart(new Date(2026, 6, 31)), new Date(2025, 7, 1));
});

test("season totals add session rows, and a best session needs 10 shots", () => {
  const t = totalSessions([
    { label: "Free throws", started_at: "a", makes: 3, attempts: 3 },
    { label: "Spot-up", started_at: "b", makes: 18, attempts: 28 },
    { label: "Spot-up", started_at: "c", makes: 32, attempts: 50 },
    { label: null, started_at: "d", makes: 0, attempts: 0 },
  ]);
  assert.equal(t.makes, 53);
  assert.equal(t.attempts, 81);
  assert.equal(t.pct, 65.4);
  assert.equal(t.sessions, 3);
  assert.equal(t.best?.started_at, "b"); // 64.3% beats 64.0%; the 3/3 is too short to count
});

test("shots a minute, and nothing for a session too short to say", () => {
  assert.equal(shotsPerMinute(28, "2026-10-06T10:00:00Z", "2026-10-06T10:06:00Z"), 4.7);
  assert.equal(shotsPerMinute(5, "2026-10-06T10:00:00Z", "2026-10-06T10:00:10Z"), null);
  assert.equal(shotsPerMinute(5, null, "2026-10-06T10:00:10Z"), null);
});

test("longest miss streak is counted", () => {
  const shots = [true, false, false, false, true, true].map((made, i) => ({ seq: i + 1, made, zone: null, source: "manual", detectedMade: null }) as Shot);
  const s = summarize(shots);
  assert.equal(s.longestMissStreak, 3);
  assert.equal(s.longestMakeStreak, 2);
});
