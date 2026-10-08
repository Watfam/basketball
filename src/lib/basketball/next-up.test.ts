import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNextUp } from "./next-up.ts";

const base = {
  unfinished: [] as { id: string; name: string }[],
  combine: { due: false, snoozed: false, everDone: true },
  programDayReady: false,
  hasWorkout: true,
};

test("finishing what you started comes first", () => {
  const n = pickNextUp({ ...base, unfinished: [{ id: "s1", name: "Handles" }], combine: { due: true, snoozed: false, everDone: false } });
  assert.deepEqual(n, { kind: "resume", sessionId: "s1", name: "Handles" });
});

test("the first combine beats the program; a retest doesn't", () => {
  assert.equal(pickNextUp({ ...base, programDayReady: true, combine: { due: true, snoozed: false, everDone: false } }).kind, "combine");
  assert.equal(pickNextUp({ ...base, programDayReady: true, combine: { due: true, snoozed: false, everDone: true } }).kind, "program");
  assert.deepEqual(pickNextUp({ ...base, combine: { due: true, snoozed: false, everDone: true } }), { kind: "combine", everDone: true });
});

test("a snoozed combine steps aside", () => {
  assert.equal(pickNextUp({ ...base, combine: { due: true, snoozed: true, everDone: false } }).kind, "workout");
});

test("with nothing else, go shoot", () => {
  assert.equal(pickNextUp({ ...base, hasWorkout: false }).kind, "shoot");
});
