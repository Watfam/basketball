import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, scoreBug } from "./score-bug.ts";

const shots = (pattern: string) => [...pattern].map((c) => ({ made: c === "x" }));

test("clock formats minutes, seconds and hours", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(83_000), "1:23");
  assert.equal(formatClock(3_723_000), "1:02:03");
  assert.equal(formatClock(-5), "0:00");
});

test("no time goal: the clock waits for the first shot, then counts up", () => {
  assert.deepEqual(scoreBug([], null, null).clock, { mode: "waiting", text: "0:00", fraction: null, urgent: false });
  assert.deepEqual(scoreBug(shots("x"), null, 65_400).clock, { mode: "up", text: "1:05", fraction: null, urgent: false });
});

test("a time goal counts down, waits at the full time, and turns urgent in the last ten seconds", () => {
  const goal = { kind: "time", target: 2 } as const;
  assert.equal(scoreBug([], goal, null).clock.text, "2:00");
  assert.equal(scoreBug([], goal, null).clock.urgent, false);
  const mid = scoreBug(shots("xo"), goal, 30_000).clock;
  assert.deepEqual([mid.mode, mid.text, mid.fraction], ["down", "1:30", 0.25]);
  assert.equal(scoreBug(shots("xo"), goal, 111_000).clock.urgent, true);
  const done = scoreBug(shots("xo"), goal, 120_000).clock;
  assert.deepEqual([done.text, done.urgent], ["0:00", false]);
});

test("streak shows makes, or misses after a miss, and lights from three makes", () => {
  assert.deepEqual(scoreBug(shots("oxxx"), null, 0).streak, { kind: "make", n: 3, hot: true });
  assert.deepEqual(scoreBug(shots("xxo"), null, 0).streak, { kind: "miss", n: 1, hot: false });
  assert.deepEqual(scoreBug(shots("xoox"), null, 0).streak, { kind: "make", n: 1, hot: false });
  assert.deepEqual(scoreBug([], null, null).streak, { kind: "none", n: 0, hot: false });
});

test("best run is this set only, makes only", () => {
  assert.equal(scoreBug(shots("xxoxxxoo"), null, 0).best, 3);
  assert.equal(scoreBug(shots("oooo"), null, 0).best, 0);
});

test("makes, attempts and percentage", () => {
  const b = scoreBug(shots("xoxx"), null, 0);
  assert.deepEqual([b.makes, b.attempts, b.pct], [3, 4, "75%"]);
  assert.equal(scoreBug([], null, null).pct, "—");
});

test("a shots, makes or streak goal gets its own cell; a time goal does not", () => {
  assert.deepEqual(scoreBug(shots("xo"), { kind: "shots", target: 5 }, 0).goal, { label: "2 of 5", fraction: 0.4 });
  assert.equal(scoreBug(shots("xo"), { kind: "makes", target: 4 }, 0).goal?.label, "1 of 4 made");
  assert.equal(scoreBug(shots("xx"), { kind: "streak", target: 5 }, 0).goal?.label, "2 in a row · goal 5");
  assert.equal(scoreBug(shots("xo"), { kind: "time", target: 5 }, 0).goal, null);
  assert.equal(scoreBug(shots("xo"), null, 0).goal, null);
});
