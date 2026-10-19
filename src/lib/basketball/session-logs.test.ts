import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRealWork, isSkippedLog } from "./session-logs.ts";

test("only skip logs are not work", () => {
  assert.equal(hasRealWork([]), false);
  assert.equal(hasRealWork([{ metrics: { skipped: true } }, { metrics: { skipped: true, variant: "x" } }]), false);
});

test("one real log is work, however many were skipped", () => {
  assert.equal(hasRealWork([{ metrics: { skipped: true } }, { metrics: { type: "timed" } }]), true);
  assert.equal(hasRealWork([{ metrics: {} }]), true);
});

test("odd metrics are read as done, not skipped", () => {
  assert.equal(isSkippedLog(null), false);
  assert.equal(isSkippedLog("skipped"), false);
  assert.equal(isSkippedLog({ skipped: "true" }), false);
  assert.equal(isSkippedLog({ skipped: false }), false);
});

test("older logs that only name the drill are matched to that drill's entries, so a finished older session does not read as 0 of N", async () => {
  const { entryIdsForLogs } = await import("./session-logs.ts");
  const entries = [{ id: "e1", drill_id: "d1" }, { id: "e2", drill_id: "d2" }, { id: "e3", drill_id: "d1" }];
  const r = entryIdsForLogs([
    { workout_drill_id: null, drill_id: "d1", metrics: {} },
    { workout_drill_id: null, drill_id: "d1", metrics: { skipped: true } },
    { workout_drill_id: "e2", metrics: {} },
    { workout_drill_id: null, drill_id: "gone", metrics: {} },
  ], entries);
  assert.deepEqual(r.logged, ["e1", "e3", "e2"], "two d1 logs take both d1 entries, in order; a drill no longer in the workout is left out");
  assert.deepEqual(r.skipped, ["e3"]);
  const exact = entryIdsForLogs([{ workout_drill_id: "e1", drill_id: "d1", metrics: {} }, { workout_drill_id: null, drill_id: "d1", metrics: {} }], entries);
  assert.deepEqual(exact.logged, ["e1", "e3"], "an entry a log names itself is not given to another log");
});
