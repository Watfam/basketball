import test from "node:test";
import assert from "node:assert/strict";
import { computeContentBounds } from "./bounds.ts";
import type { Frame } from "./types.ts";

const frame = (overrides: Partial<Frame> = {}): Frame => ({
  offense: [{ id: "O1", pos: { x: 25, y: 20 } }],
  defense: [],
  ballHolder: "O1",
  lines: [],
  note: "",
  ...overrides,
});

test("a tight cluster of players gets a small, padded region, not the whole court", () => {
  const f = frame({
    offense: [
      { id: "O1", pos: { x: 20, y: 18 } },
      { id: "O2", pos: { x: 30, y: 22 } },
    ],
  });
  const r = computeContentBounds([f]);
  assert.ok(r.width < 40, `expected a tight width, got ${r.width}`);
  assert.ok(r.x <= 20 && r.x + r.width >= 30, "region must contain both players");
});

test("the region always meets a minimum portrait-ish aspect ratio so it never letterboxes badly", () => {
  const f = frame({
    offense: [
      { id: "O1", pos: { x: 10, y: 20 } },
      { id: "O2", pos: { x: 40, y: 20 } },
    ],
  });
  const r = computeContentBounds([f]);
  assert.ok(r.height / r.width >= 1.3 - 1e-9, `expected height/width >= 1.3, got ${r.height / r.width}`);
});

test("a full-court play (large y-spread) is not artificially shrunk below its own content", () => {
  const f = frame({ offense: [{ id: "O1", pos: { x: 25, y: 5 } }, { id: "O2", pos: { x: 25, y: 75 } }] });
  const r = computeContentBounds([f]);
  assert.ok(r.y <= 5 && r.y + r.height >= 75, "region must still contain the full-court spread");
});

test("lines, arrivals, and the ball arrival path all expand the region, not just player positions", () => {
  const withLine = computeContentBounds([frame({ lines: [{ id: "l1", type: "cut", color: "offense", points: [{ x: 20, y: 20 }, { x: 48, y: 20 }] }] })]);
  assert.ok(withLine.x + withLine.width >= 48, "a line's own points must be in view");

  const withArrival = computeContentBounds([frame({ arrivals: { O1: [{ x: 20, y: 20 }, { x: 2, y: 20 }] } })]);
  assert.ok(withArrival.x <= 2, "an arrival path's points must be in view");

  const withBall = computeContentBounds([frame({ ballArrival: [{ x: 20, y: 20 }, { x: 20, y: 2 }] })]);
  assert.ok(withBall.y <= 2, "a ball arrival path's points must be in view");
});

test("an empty play (no frames) falls back to the whole court, not a crash", () => {
  const r = computeContentBounds([]);
  assert.ok(r.width > 50 && r.height > 80);
});
