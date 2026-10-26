import test from "node:test";
import assert from "node:assert/strict";
import { nextFrame } from "./frames.ts";
import type { Frame } from "./types.ts";

const base: Frame = {
  offense: [
    { id: "O1", pos: { x: 17, y: 80 } },
    { id: "O2", pos: { x: 35, y: 78 } },
    { id: "O3", pos: { x: 33, y: 95.8 } },
    { id: "O4", pos: { x: 8, y: 58 } },
    { id: "O5", pos: { x: 36, y: 30 } },
  ],
  defense: [
    { id: "X1", man: "O1", coverage: "softDeny" },
    { id: "X2", man: "O2", coverage: "softDeny" },
    { id: "X3", man: "O3", coverage: "manual", manualPos: { x: 25, y: 72 } },
    { id: "X4", man: "O4", coverage: "softDeny" },
    { id: "X5", man: "O5", coverage: "loose" },
  ],
  ballHolder: "O3",
  lines: [
    { id: "l1", type: "cut", color: "offense", points: [{ x: 17, y: 80 }, { x: 6, y: 86 }] },
    { id: "l2", type: "pass", color: "offense", points: [{ x: 33, y: 95.8 }, { x: 6, y: 86 }] },
  ],
  note: "soft deny the inbound",
};

test("a cut line moves the player who starts near it, and records the path he followed", () => {
  const next = nextFrame(base);
  const o1 = next.offense.find((o) => o.id === "O1")!;
  assert.deepEqual(o1.pos, { x: 6, y: 86 });
  assert.deepEqual(next.arrivals?.O1, base.lines[0].points);
});

test("a player with no line nearby keeps his spot", () => {
  const next = nextFrame(base);
  assert.deepEqual(next.offense.find((o) => o.id === "O5")!.pos, { x: 36, y: 30 });
  assert.equal(next.arrivals?.O5, undefined);
});

test("a pass line from the ball handler gives the ball to whoever ends up nearest its end", () => {
  const next = nextFrame(base);
  assert.equal(next.ballHolder, "O1");
  assert.deepEqual(next.ballArrival, base.lines[1].points);
});

test("a manual defender near a line is moved and stays manual; a formula-driven defender near a line is moved and switched to manual", () => {
  const withDefenderLines: Frame = {
    ...base,
    lines: [
      ...base.lines,
      // X3 is manual at (25, 72)
      { id: "l3", type: "cut", color: "defense", points: [{ x: 25, y: 72 }, { x: 25, y: 60 }] },
      // X5 is "loose" off O5 (36,30) with O3 holding the ball — resolves to ~(35.37, 32.10),
      // verified numerically before writing this test; (35, 31) is ~1.16 ft from that.
      { id: "l4", type: "cut", color: "defense", points: [{ x: 35, y: 31 }, { x: 20, y: 20 }] },
    ],
  };
  const next = nextFrame(withDefenderLines);
  const x3 = next.defense.find((d) => d.id === "X3")!;
  assert.equal(x3.coverage, "manual");
  assert.deepEqual(x3.manualPos, { x: 25, y: 60 });
  const x5 = next.defense.find((d) => d.id === "X5")!;
  assert.equal(x5.coverage, "manual");
  assert.deepEqual(x5.manualPos, { x: 20, y: 20 });
});

test("the new frame starts with no lines and an empty note, and a frame with no movement lines is unchanged except ball/arrivals bookkeeping", () => {
  const next = nextFrame(base);
  assert.deepEqual(next.lines, []);
  assert.equal(next.note, "");
  const noLines: Frame = { ...base, lines: [] };
  const n2 = nextFrame(noLines);
  assert.deepEqual(n2.offense, base.offense);
  assert.equal(n2.ballHolder, base.ballHolder);
  assert.equal(n2.arrivals, undefined);
  assert.equal(n2.ballArrival, undefined);
});
