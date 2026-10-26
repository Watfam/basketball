import test from "node:test";
import assert from "node:assert/strict";
import { mirrorFrame, mirrorFrames } from "./mirror.ts";
import { COURT_WIDTH, type Frame } from "./types.ts";

const frame = (overrides: Partial<Frame> = {}): Frame => ({
  offense: [{ id: "O1", pos: { x: 10, y: 20 } }],
  defense: [],
  ballHolder: "O1",
  lines: [],
  note: "",
  ...overrides,
});

test("mirroring reflects offense positions across the court centerline, leaving y untouched", () => {
  const m = mirrorFrame(frame({ offense: [{ id: "O1", pos: { x: 10, y: 20 } }] }));
  assert.deepEqual(m.offense[0].pos, { x: COURT_WIDTH - 10, y: 20 });
});

test("a player standing exactly on the centerline does not move", () => {
  const m = mirrorFrame(frame({ offense: [{ id: "O1", pos: { x: COURT_WIDTH / 2, y: 30 } }] }));
  assert.equal(m.offense[0].pos.x, COURT_WIDTH / 2);
});

test("a defender's manual position mirrors too, but one with no manual position is left alone", () => {
  const m = mirrorFrame(
    frame({
      defense: [
        { id: "X1", man: "O1", coverage: "manual", manualPos: { x: 15, y: 40 } },
        { id: "X2", man: "O1", coverage: "loose" },
      ],
    })
  );
  assert.deepEqual(m.defense[0].manualPos, { x: COURT_WIDTH - 15, y: 40 });
  assert.equal(m.defense[1].manualPos, undefined);
});

test("every point of a drawn line is mirrored, not just its endpoints", () => {
  const m = mirrorFrame(
    frame({ lines: [{ id: "l1", type: "cut", color: "offense", points: [{ x: 5, y: 5 }, { x: 20, y: 10 }, { x: 35, y: 15 }] }] })
  );
  assert.deepEqual(m.lines[0].points, [{ x: 45, y: 5 }, { x: 30, y: 10 }, { x: 15, y: 15 }]);
});

test("arrivals and the ball arrival path are both mirrored", () => {
  const m = mirrorFrame(
    frame({
      arrivals: { O1: [{ x: 10, y: 10 }, { x: 20, y: 10 }] },
      ballArrival: [{ x: 5, y: 5 }, { x: 15, y: 5 }],
    })
  );
  assert.deepEqual(m.arrivals?.O1, [{ x: 40, y: 10 }, { x: 30, y: 10 }]);
  assert.deepEqual(m.ballArrival, [{ x: 45, y: 5 }, { x: 35, y: 5 }]);
});

test("mirroring twice returns to the original positions", () => {
  const f = frame({ offense: [{ id: "O1", pos: { x: 12, y: 44 } }] });
  const twice = mirrorFrame(mirrorFrame(f));
  assert.deepEqual(twice.offense[0].pos, f.offense[0].pos);
});

test("mirrorFrames maps every frame in the play, preserving order and count", () => {
  const frames = [frame({ offense: [{ id: "O1", pos: { x: 1, y: 1 } }] }), frame({ offense: [{ id: "O1", pos: { x: 2, y: 2 } }] })];
  const mirrored = mirrorFrames(frames);
  assert.equal(mirrored.length, 2);
  assert.equal(mirrored[0].offense[0].pos.x, COURT_WIDTH - 1);
  assert.equal(mirrored[1].offense[0].pos.x, COURT_WIDTH - 2);
});
