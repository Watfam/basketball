import test from "node:test";
import assert from "node:assert/strict";
import { trimEnd, simplifyPath } from "./geometry.ts";

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

test("simplifyPath collapses a densely-sampled, basically-straight drag to just its two endpoints", () => {
  const noisyStraight = [
    { x: 0, y: 0 }, { x: 1, y: 0.1 }, { x: 2, y: -0.1 }, { x: 3, y: 0.05 },
    { x: 4, y: -0.05 }, { x: 5, y: 0.1 }, { x: 6, y: 0 }, { x: 10, y: 0 },
  ];
  assert.deepEqual(simplifyPath(noisyStraight, 1), [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
});

test("simplifyPath keeps a real bend but drops the dense sampling on either side of it", () => {
  // An L-shaped drag sampled every ~1 unit along each leg — should reduce to the three points that
  // actually matter (start, the corner, end), not the dozen raw samples.
  const lShape = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
    { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 },
  ];
  const simplified = simplifyPath(lShape, 0.5);
  assert.deepEqual(simplified, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]);
});

test("simplifyPath leaves a short path (fewer than 3 points) untouched — nothing to simplify", () => {
  assert.deepEqual(simplifyPath([{ x: 0, y: 0 }], 1), [{ x: 0, y: 0 }]);
  assert.deepEqual(simplifyPath([{ x: 0, y: 0 }, { x: 5, y: 5 }], 1), [{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  assert.deepEqual(simplifyPath([], 1), []);
});

test("simplifyPath on a real multi-bend curve keeps a small handful of points, not one per sample", () => {
  // A smooth S-curve sampled at 20 points (the kind of density a real 10+ ft drag produces at the
  // play-court sampling interval) should reduce to well under half its original point count.
  const sCurve = Array.from({ length: 20 }, (_, i) => {
    const t = i / 19;
    return { x: t * 20, y: Math.sin(t * Math.PI * 2) * 5 };
  });
  const simplified = simplifyPath(sCurve, 1.2);
  assert.ok(simplified.length < 10, `expected well under 10 points, got ${simplified.length}`);
  assert.ok(simplified.length >= 3, `expected the real curve shape to survive as more than 2 points, got ${simplified.length}`);
});
