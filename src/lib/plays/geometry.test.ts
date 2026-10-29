import test from "node:test";
import assert from "node:assert/strict";
import { trimEnd } from "./geometry.ts";

test("trimEnd shortens a straight 2-point line by exactly the given distance", () => {
  const trimmed = trimEnd([{ x: 0, y: 0 }, { x: 10, y: 0 }], 3);
  assert.deepEqual(trimmed, [{ x: 0, y: 0 }, { x: 7, y: 0 }]);
});

test("trimEnd removes a whole short final segment before eating into the one before it", () => {
  // Last segment is only 1 unit long; trimming 3 must consume it entirely and bite 2 more off the
  // segment before, not just shorten the last segment past its own start.
  const trimmed = trimEnd([{ x: 0, y: 0 }, { x: 0, y: 9 }, { x: 0, y: 10 }], 3);
  assert.deepEqual(trimmed, [{ x: 0, y: 0 }, { x: 0, y: 7 }]);
});

test("trimEnd past the whole path's length collapses to just the starting point", () => {
  const trimmed = trimEnd([{ x: 0, y: 0 }, { x: 5, y: 0 }], 50);
  assert.deepEqual(trimmed, [{ x: 0, y: 0 }]);
});

test("trimEnd with zero or negative distance returns the path unchanged", () => {
  const path = [{ x: 0, y: 0 }, { x: 5, y: 0 }];
  assert.deepEqual(trimEnd(path, 0), path);
  assert.deepEqual(trimEnd(path, -1), path);
});

test("trimEnd on a single point or empty path is a no-op (nothing to shorten)", () => {
  assert.deepEqual(trimEnd([{ x: 1, y: 1 }], 3), [{ x: 1, y: 1 }]);
  assert.deepEqual(trimEnd([], 3), []);
});
