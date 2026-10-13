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
