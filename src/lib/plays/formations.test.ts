import test from "node:test";
import assert from "node:assert/strict";
import { FORMATIONS, formationFrame } from "./formations.ts";
import type { Frame } from "./types.ts";

const base: Frame = {
  offense: [
    { id: "O1", pos: { x: 1, y: 1 } },
    { id: "O2", pos: { x: 2, y: 2 } },
    { id: "O3", pos: { x: 3, y: 3 } },
  ],
  defense: [
    { id: "X1", man: "O1", coverage: "softDeny" },
    { id: "X2", man: "O2", coverage: "manual", manualPos: { x: 9, y: 9 } },
  ],
  ballHolder: "O2",
  lines: [{ id: "l1", type: "cut", color: "offense", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }],
  note: "before",
};

test("every formation has exactly five offense slots, and five defense slots when it's a defensive shell", () => {
  for (const f of FORMATIONS) {
    assert.equal(f.offense.length, 5, f.id);
    if (f.category === "defense") assert.equal(f.defense?.length, 5, f.id);
  }
});

test("applying an offense formation only repositions players actually on the court, and leaves defense untouched", () => {
  const horns = FORMATIONS.find((f) => f.id === "horns")!;
  const next = formationFrame(horns, base);
  assert.equal(next.offense.length, 3);
  assert.deepEqual(next.offense.find((o) => o.id === "O1")!.pos, horns.offense.find((o) => o.id === "O1")!.pos);
  assert.deepEqual(next.defense, base.defense);
  assert.deepEqual(next.lines, []);
  assert.equal(next.note, horns.description);
  assert.equal(next.arrivals, undefined);
});

test("applying a defensive shell repositions the shell's defenders and marks them manual", () => {
  const zone = FORMATIONS.find((f) => f.id === "2-3-zone")!;
  const next = formationFrame(zone, base);
  const x1 = next.defense.find((d) => d.id === "X1")!;
  assert.equal(x1.coverage, "manual");
  assert.deepEqual(x1.manualPos, zone.defense!.find((d) => d.id === "X1")!.pos);
});

test("the ball holder carries over when still present on the court", () => {
  const next = formationFrame(FORMATIONS[0], base);
  assert.equal(next.ballHolder, "O2");
});
