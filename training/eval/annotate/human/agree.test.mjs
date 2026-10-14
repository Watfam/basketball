import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFrame, summarize } from "./agree.mjs";

const b = (cx, cy, diameter = 24) => ({ cx, cy, diameter });
test("presence disagreement and centre difference", () => {
  assert.equal(compareFrame({ balls: [] }, { balls: [b(1, 1)] }).presence, false);
  const r = compareFrame({ balls: [b(100, 100, 26)] }, { balls: [b(103, 104, 24)] });
  assert.equal(r.presence, true);
  assert.ok(Math.abs(r.centre - 5) < 1e-9);
  assert.equal(r.within, true);
  assert.equal(compareFrame({ balls: [b(100, 100)] }, { balls: [b(140, 100)] }).within, false);
  assert.equal(compareFrame({ balls: [] }, { balls: [] }).presence, true);
});
test("summary reports small samples as unavailable instead of estimating", () => {
  const s = summarize([compareFrame({ balls: [b(1, 1)] }, { balls: [b(2, 2)] }), compareFrame({ balls: [] }, { balls: [] })]);
  assert.equal(s.frames, 2);
  assert.ok(s.centre_difference_px.unavailable);
});
