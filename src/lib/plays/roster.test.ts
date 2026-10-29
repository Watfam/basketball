import test from "node:test";
import assert from "node:assert/strict";
import { addDefense, addOffense, currentDefenseIds, currentOffenseIds, removeDefense, removeOffense } from "./roster.ts";
import type { Frame } from "./types.ts";

function makeFrames(): Frame[] {
  const frame: Frame = {
    offense: [
      { id: "O1", pos: { x: 17, y: 80 } },
      { id: "O2", pos: { x: 35, y: 78 } },
      { id: "O3", pos: { x: 33, y: 95.8 } },
    ],
    defense: [
      { id: "X1", man: "O1", coverage: "softDeny" },
      { id: "X2", man: "O3", coverage: "loose" },
    ],
    ballHolder: "O3",
    lines: [],
    note: "",
  };
  return [frame, { ...frame, note: "second" }];
}

test("removing an offensive player drops him from every frame, reassigns defenders guarding him, and hands off the ball if he held it", () => {
  const next = removeOffense(makeFrames(), "O3");
  for (const f of next) {
    assert.ok(!f.offense.some((o) => o.id === "O3"));
    assert.equal(f.ballHolder, "O1");
    assert.equal(f.defense.find((d) => d.id === "X2")!.man, "O1");
  }
});

test("removing the last offensive player is refused — the ball always needs a holder", () => {
  const oneLeft = makeFrames().map((f) => ({ ...f, offense: [f.offense[0]], ballHolder: f.offense[0].id, defense: [] as Frame["defense"] }));
  const next = removeOffense(oneLeft, "O1");
  assert.deepEqual(next, oneLeft);
});

test("adding an offensive player back puts him in every frame; a no-op if already present or the roster is full", () => {
  const frames = makeFrames();
  const withO4 = addOffense(frames, "O4");
  assert.deepEqual(currentOffenseIds(withO4), ["O1", "O2", "O3", "O4"]);
  for (const f of withO4) assert.ok(f.offense.some((o) => o.id === "O4"));

  const already = addOffense(withO4, "O4");
  assert.deepEqual(already, withO4);

  const full = addOffense(withO4, "O5");
  assert.deepEqual(currentOffenseIds(full), ["O1", "O2", "O3", "O4", "O5"]);
});

test("defense can be removed down to zero and added back guarding the frame's first offensive player", () => {
  const frames = makeFrames();
  const noDefense = removeDefense(removeDefense(frames, "X1"), "X2");
  for (const f of noDefense) assert.deepEqual(f.defense, []);
  assert.deepEqual(currentDefenseIds(noDefense), []);

  const backWithX1 = addDefense(noDefense, "X1");
  for (const f of backWithX1) {
    const x1 = f.defense.find((d) => d.id === "X1")!;
    assert.equal(x1.man, f.offense[0].id);
    assert.equal(x1.coverage, "manual");
  }
});
