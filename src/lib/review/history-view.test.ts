import test from "node:test";
import assert from "node:assert/strict";
import { BREAK_MS, outcomeLines, pathPieces, rowOf, setupGroups } from "./history-view.ts";
import type { HistoryShot } from "./history-types.ts";

const shot = (over: Partial<HistoryShot> = {}): HistoryShot => ({
  v: 1, id: "k#1", sessionKey: "k", playerId: "p", seq: 1, made: true, detectedMade: true, flagged: false, tMs: 0, tracked: true, rim: { x: 192, y: 190 }, scale: 1, ballWidthPx: 20, ballWidthSource: "shot",
  points: [[-600, 40, 100, 20, 80], [-533, 36, 80, 20, 80], [-467, 30, 60, 20, 80], [-400, 24, 40, 20, 80]], gaps: [], events: [], rimHardwareBoxes: 0, rimHardwareNearby: 0,
  quality: { level: "tracked", reasons: [] }, fingerprint: null, savedAt: 1, bytes: 1, ...over,
});

test("a stored path is in ball widths from the rim, right and up, and keeps its observed points only", () => {
  const p = pathPieces(shot());
  assert.equal(p.length, 1); assert.deepEqual(p[0][0], [2, 5]); assert.deepEqual(p[0][3], [1.2, 2]);
  assert.deepEqual(pathPieces(shot({ ballWidthPx: null }))[0][0], [40 / 24, 100 / 24], "a default ball width is used when none was measured");
});

test("a missing stretch breaks the line; nothing is drawn across it", () => {
  const s = shot({ points: [[-600, 40, 100, 20, 80], [-533, 36, 80, 20, 80], [-333, 20, 30, 20, 80], [-266, 16, 20, 20, 80]] });
  const p = pathPieces(s);
  assert.equal(p.length, 2); assert.equal(p[0].length, 2); assert.equal(p[1].length, 2);
  assert.ok(-333 - -533 > BREAK_MS);
});

test("stepping through: only points up to the chosen one, and points outside the window are ignored unless asked for", () => {
  assert.equal(pathPieces(shot(), { upTo: 2 })[0].length, 2);
  const far = shot({ points: [[-3000, 90, 300, 20, 80], ...shot().points, [900, 0, -50, 20, 80]] });
  assert.equal(pathPieces(far).flat().length, 4);
  assert.equal(pathPieces(far, { window: false }).flat().length, 6);
});

test("outcome lines use only trustworthy paths, most recent first-capped, and keep make/miss", () => {
  const a = shot({ id: "a", made: true }), b = shot({ id: "b", made: false }), bad = shot({ id: "c", quality: { level: "unreliable", reasons: [] } }), none = shot({ id: "d", points: [], quality: { level: "none", reasons: [] } });
  const l = outcomeLines([a, b, bad, none]);
  assert.deepEqual(l.map((x) => x.made), [true, false]);
  const many = Array.from({ length: 200 }, (_, i) => shot({ id: String(i), made: i % 2 === 0 }));
  assert.equal(outcomeLines(many).length, 120); assert.equal(outcomeLines(many, 10).length, 10);
});

test("rows for makes-versus-misses carry the crossing position only when it was measured; groups keep their shots together", () => {
  assert.equal(rowOf(shot()).x, null);
  assert.equal(rowOf(shot({ fingerprint: { schema: "shot-fingerprint/1", m: { rim_level_x_bw: -0.4 }, why: {}, path: {}, usable: true } })).x, -0.4);
  const g = setupGroups([[{ sessionKey: "k" }], [{ sessionKey: "z" }]], [shot(), shot({ id: "q", sessionKey: "z" })]);
  assert.deepEqual(g.map((x) => x.shots.length), [1, 1]);
});
