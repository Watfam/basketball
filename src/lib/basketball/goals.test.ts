import { test } from "node:test";
import assert from "node:assert/strict";
import { STREAK_CAP, describeGoal, goalState, parseGoal } from "./goals.ts";

const shots = (pattern: string) => [...pattern].map((c) => ({ made: c === "x" }));

test("shots goal ends on the last attempt", () => {
  assert.equal(goalState({ kind: "shots", target: 5 }, shots("xoxoo"), 0).reached, true);
  assert.equal(goalState({ kind: "shots", target: 5 }, shots("xoxo"), 0).label, "4 of 5");
});

test("makes goal ends on the tenth make, however many shots it took", () => {
  const s = goalState({ kind: "makes", target: 3 }, shots("ooxoxoox"), 0);
  assert.equal(s.reached, true);
  assert.equal(goalState({ kind: "makes", target: 3 }, shots("ooxox"), 0).label, "2 of 3 made");
});

test("time goal counts down and ends at zero", () => {
  assert.deepEqual(
    [goalState({ kind: "time", target: 5 }, [], 108000).label, goalState({ kind: "time", target: 5 }, [], 108000).reached],
    ["3:12 left", false]
  );
  assert.equal(goalState({ kind: "time", target: 5 }, [], 300000).reached, true);
});

test("streak goal needs the makes in a row, and stops at the safety cap", () => {
  assert.equal(goalState({ kind: "streak", target: 3 }, shots("xxoxx"), 0).reached, false);
  assert.equal(goalState({ kind: "streak", target: 3 }, shots("xxoxxx"), 0).reached, true);
  const cold = goalState({ kind: "streak", target: 3 }, shots("o".repeat(STREAK_CAP)), 0);
  assert.equal(cold.reached, true);
  assert.equal(cold.capped, true);
});

test("stored goals are checked and clamped", () => {
  assert.deepEqual(parseGoal({ kind: "makes", target: 9999 }), { kind: "makes", target: 300 });
  assert.equal(parseGoal({ kind: "dunks", target: 3 }), null);
  assert.equal(parseGoal("50"), null);
  assert.equal(describeGoal({ kind: "streak", target: 5 }), "5 in a row");
});

test("a saved goal reads back for history", async () => {
  const { describeSavedGoal } = await import("./goals.ts");
  assert.equal(describeSavedGoal("makes", 10, true), "Make 10 ✓");
  assert.equal(describeSavedGoal("streak", 3, false), "3 in a row · not reached");
  assert.equal(describeSavedGoal(null, null, null), null);
});
