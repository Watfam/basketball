import test from "node:test";
import assert from "node:assert/strict";
import { computeContentBounds } from "./bounds.ts";
import { COURT_WIDTH } from "./types.ts";
import type { Frame } from "./types.ts";

const frame = (overrides: Partial<Frame> = {}): Frame => ({
  offense: [{ id: "O1", pos: { x: 25, y: 20 } }],
  defense: [],
  ballHolder: "O1",
  lines: [],
  note: "",
  ...overrides,
});

test("the x-axis is never cropped to content — both sidelines always stay in view", () => {
  const f = frame({
    offense: [
      { id: "O1", pos: { x: 20, y: 18 } },
      { id: "O2", pos: { x: 30, y: 22 } },
    ],
  });
  const r = computeContentBounds([f]);
  assert.ok(r.x <= 0 && r.x + r.width >= COURT_WIDTH, "both sidelines must stay in view regardless of how narrow the content is");
});

test("the region meets a minimum portrait-ish aspect ratio relative to the CONTENT's own width, not the full court width it's widened to afterward", () => {
  // Content spans x 10-40 (padded to 5-45, a 40 ft content width) — the aspect floor should target
  // height = 40 * 1.3 = 52, not FULL_WIDTH (60) * 1.3 = 78: the final x-axis widen-to-full-court must
  // not feed back into how tall the region gets forced.
  const f = frame({
    offense: [
      { id: "O1", pos: { x: 10, y: 20 } },
      { id: "O2", pos: { x: 40, y: 20 } },
    ],
  });
  const r = computeContentBounds([f]);
  assert.ok(Math.abs(r.height - 52) < 1e-9, `expected height ~52 (40 ft content width * 1.3), got ${r.height}`);
});

test("a play whose action sits in a small corner of the floor isn't forced to show nearly the whole court length just to satisfy the aspect ratio — the real bug Matt caught on Box BLOB", () => {
  // Content spans x 4-33 (a ~39 ft content width after padding) and y -1.4 to 19 (a tight, one-baseline
  // action) — same shape as blob-box. The old bug multiplied MIN_ASPECT by the full 60 ft width,
  // forcing height to 78 (almost the entire 84 ft court) for action that only needed ~29 ft.
  const f = frame({
    offense: [
      { id: "O1", pos: { x: 30.5, y: 19 } },
      { id: "O2", pos: { x: 4, y: 4.5 } },
      { id: "O3", pos: { x: 33, y: -1.4 } },
    ],
  });
  const r = computeContentBounds([f]);
  assert.ok(r.height < 60, `expected a tight play's forced height to stay well under the full-court-driven 78 ft, got ${r.height}`);
});

test("a full-court play (large y-spread) is not artificially shrunk below its own content", () => {
  const f = frame({ offense: [{ id: "O1", pos: { x: 25, y: 5 } }, { id: "O2", pos: { x: 25, y: 75 } }] });
  const r = computeContentBounds([f]);
  assert.ok(r.y <= 5 && r.y + r.height >= 75, "region must still contain the full-court spread");
});

test("lines, arrivals, and the ball arrival path all expand the y-extent, not just player positions", () => {
  const withLine = computeContentBounds([frame({ lines: [{ id: "l1", type: "cut", color: "offense", points: [{ x: 20, y: 20 }, { x: 48, y: 70 }] }] })]);
  assert.ok(withLine.y + withLine.height >= 70, "a line's own points must be in view");

  const withArrival = computeContentBounds([frame({ arrivals: { O1: [{ x: 20, y: 20 }, { x: 2, y: 65 }] } })]);
  assert.ok(withArrival.y + withArrival.height >= 65, "an arrival path's points must be in view");

  const withBall = computeContentBounds([frame({ ballArrival: [{ x: 20, y: 20 }, { x: 20, y: 2 }] })]);
  assert.ok(withBall.y <= 2, "a ball arrival path's points must be in view");
});

test("an empty play (no frames) falls back to the whole court, not a crash", () => {
  const r = computeContentBounds([]);
  assert.ok(r.width > 50 && r.height > 80);
});
