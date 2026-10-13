import { test } from "node:test";
import assert from "node:assert/strict";
import { speedVerdict } from "./speed-check.ts";

test("a quick phone is ok and capped at the 15 fps the loop runs", () => {
  const v = speedVerdict([300, 40, 42, 41, 39, 43]);
  assert.equal(v.kind, "ok");
  assert.equal(v.fps, 15);
});

test("the warm-up frame does not count against the phone", () => {
  assert.equal(speedVerdict([900, 70, 72, 68, 71, 70]).kind, "ok");
});

test("a phone that needs over 100 ms a frame is slow", () => {
  const v = speedVerdict([500, 130, 140, 125, 135, 150]);
  assert.equal(v.kind, "slow");
  assert.ok(v.fps < 10 && v.fps > 6);
});

test("one hiccup does not decide it, the middle value does", () => {
  assert.equal(speedVerdict([300, 60, 900, 62, 61, 63]).kind, "ok");
});

test("nothing to time passes rather than blocks", () => {
  assert.equal(speedVerdict([]).kind, "ok");
  assert.equal(speedVerdict([200]).kind, "ok");
});
