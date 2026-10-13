import { test } from "node:test";
import assert from "node:assert/strict";
import { clockStart, draftGoal, parseDraft, type Draft } from "./shot-draft.ts";
import { addShot, summarize, toggleShot, undoLastShot } from "./shooting.ts";
import { goalState } from "./goals.ts";
import { scoreBug } from "./score-bug.ts";

const base = (over: Partial<Draft> = {}): Draft => ({
  v: 1, sessionId: null, label: "Free throws", startedAt: "2026-10-13T15:00:00.000Z", clockStartedAt: null,
  shots: [], zone: null, goal: null, rev: 1, syncedRev: 0, ...over,
});

test("a stored draft reads back; rubbish and other versions do not", () => {
  const d = base({ goal: { kind: "shots", target: 25 } });
  assert.deepEqual(parseDraft(JSON.stringify(d)), d);
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft("{not json"), null);
  assert.equal(parseDraft(JSON.stringify({ ...d, v: 2 })), null);
  assert.equal(parseDraft(JSON.stringify({ ...d, shots: "none" })), null);
  assert.equal(parseDraft(JSON.stringify({ ...d, startedAt: 5 })), null);
});

test("the clock waits for the first shot, and older drafts use their start time", () => {
  assert.equal(clockStart(base({ clockStartedAt: null })), null);
  assert.equal(clockStart(base({ clockStartedAt: "2026-10-13T15:00:09.000Z" })), Date.parse("2026-10-13T15:00:09.000Z"));
  const old = base();
  delete old.clockStartedAt;
  assert.equal(clockStart(old), Date.parse(old.startedAt));
});

test("goals: the stored goal, the first version's shot count, or none", () => {
  assert.deepEqual(draftGoal(base({ goal: { kind: "time", target: 5 } })), { kind: "time", target: 5 });
  assert.deepEqual(draftGoal(base({ goal: undefined, stopAt: 40 })), { kind: "shots", target: 40 });
  assert.equal(draftGoal(base({ goal: null, stopAt: null })), null);
  assert.equal(draftGoal(base({ goal: { kind: "bogus", target: 3 } as never })), null);
});

test("a set from first shot to goal: count, undo, flip, and the bar agrees", () => {
  let shots = base().shots;
  const log = (made: boolean) => (shots = addShot(shots, made, null, "manual", null));
  [true, true, false, true].forEach(log);
  assert.equal(summarize(shots).makes, 3);
  shots = undoLastShot(shots);
  assert.deepEqual(shots.map((s) => s.made), [true, true, false]);
  shots = toggleShot(shots, 3);
  assert.deepEqual(shots.map((s) => s.made), [true, true, true]);
  const goal = { kind: "streak", target: 3 } as const;
  assert.equal(goalState(goal, shots, 0).reached, true);
  const bug = scoreBug(shots, goal, 42_000);
  assert.deepEqual([bug.makes, bug.attempts, bug.streak.n, bug.best, bug.clock.text], [3, 3, 3, 3, "0:42"]);
});

test("undo past the start leaves an empty set that can start again", () => {
  let shots = addShot([], true, null, "manual", null);
  shots = undoLastShot(shots);
  shots = undoLastShot(shots);
  assert.equal(shots.length, 0);
  shots = addShot(shots, false, null, "manual", null);
  assert.equal(shots[0].seq, 1);
});

test("camera shots carry their call, and a hand-added one is marked", () => {
  let shots = addShot([], true, null, "camera", true, { flagged: true, flagReasons: ["wide_below"], tMs: 1200, replayId: "shot-1" });
  shots = addShot(shots, false, null, "manual", null, { addedByHand: true });
  assert.deepEqual([shots[0].source, shots[0].detectedMade, shots[0].flagged], ["camera", true, true]);
  assert.deepEqual([shots[1].source, shots[1].addedByHand], ["manual", true]);
  shots = toggleShot(shots, 1);
  assert.deepEqual([shots[0].made, shots[0].detectedMade], [false, true]);
});
