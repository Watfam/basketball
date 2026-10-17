import test from "node:test";
import assert from "node:assert/strict";
import { COMPARE_CAUTION, MIN_MISSES_FOR_SIDE, observedDifferences, sceneOf, sightingTimes, stateAt, stepTime, summarizePatterns, syncPoint } from "./shot-scene.ts";
import { JARGON } from "./plain.ts";
import type { HistoryPoint, HistoryShot } from "./history-types.ts";

let n = 0;
/** A descending shot: rises to an apex, comes down past the rim's height at offset `cross` (px right of centre). */
function path(cross: number, { dt = 67, from = -800, gapAt = -1, lowAt = -1 }: { dt?: number; from?: number; gapAt?: number; lowAt?: number } = {}): HistoryPoint[] {
  const pts: HistoryPoint[] = [];
  for (let t = from, i = 0; t <= 200; t += dt, i += 1) {
    if (gapAt >= 0 && (i === gapAt || i === gapAt + 1 || i === gapAt + 2)) continue;
    const u = (t - from) / (0 - from);
    const y = 120 * (1 - (2 * u - 1) ** 2) * 1 + (u > 0.5 ? (0.5 - u) * 60 : 0) - (t > 0 ? 40 : 0) + 20 - 25 * u * u - 5 + 25 * (1 - u) * 0 + 10 * Math.sin(u) * 0;
    pts.push([t, -170 * (1 - u) + cross * u, Math.max(-30, y - (t / 10)), 24, i === lowAt ? 30 : 80]);
  }
  return pts;
}
function shot(over: Partial<HistoryShot> & { points?: HistoryPoint[] } = {}): HistoryShot {
  n += 1;
  return { v: 1, id: `s${n}`, sessionKey: "k1", playerId: "p", seq: n, made: true, detectedMade: true, flagged: false, tMs: 0, tracked: true, rim: { x: 192, y: 190 }, scale: 1, ballWidthPx: 24, ballWidthSource: "shot", points: path(0), gaps: [], events: [], rimHardwareBoxes: 0, rimHardwareNearby: 0, quality: { level: "tracked", reasons: [] }, fingerprint: null, savedAt: 0, bytes: 0, ...over } as HistoryShot;
}

test("a clear made shot: sightings, a crossing past the rim's height, nothing invented", () => {
  const s = sceneOf(shot({ points: path(4) }));
  assert.ok(s.usable && s.sightings.length >= 12);
  assert.ok(s.crossing && Math.abs(s.crossing.xBw) < 1, JSON.stringify(s.crossing));
  assert.ok(s.crossing!.t > -200 && s.crossing!.t < 200);
  assert.equal(s.gaps.length, 0); assert.equal(s.callChanged, false);
  assert.ok(s.sightings.every((x) => !x.unsure));
  assert.ok(Math.abs(s.rimW - (0.457 / 0.24) * 24) < 1e-9, "the rim is drawn to scale from the ball");
});

test("a clear miss to the left is seen left of centre", () => {
  const s = sceneOf(shot({ made: false, detectedMade: false, points: path(-60) }));
  assert.ok(s.crossing && s.crossing.xBw < -1.5, String(s.crossing?.xBw));
});

test("an incomplete trajectory: too few sightings is not usable, and no crossing means none is claimed", () => {
  const s = sceneOf(shot({ points: path(0).slice(0, 5) }));
  assert.equal(s.usable, false); assert.equal(s.crossing, null);
  const none = sceneOf(shot({ points: [], tracked: false, quality: { level: "none", reasons: [] } }));
  assert.equal(none.sightings.length, 0); assert.equal(none.highBw, null); assert.equal(none.closest, null); assert.equal(stateAt(none, 0).shown, null);
});

test("a gap is recorded as not seen, the ball is held (never moved) across it, and sightings beside it are marked unsure", () => {
  const s = sceneOf(shot({ points: path(0, { gapAt: 6 }) }));
  assert.equal(s.gaps.length, 1);
  const g = s.gaps[0];
  const before = stateAt(s, g.fromT + 10), mid = stateAt(s, (g.fromT + g.toT) / 2), after = stateAt(s, g.toT);
  assert.equal(before.seenNow, true); assert.equal(mid.inGap, true); assert.equal(mid.seenNow, false);
  assert.deepEqual(mid.shown, before.shown, "held at the last place it was seen");
  assert.equal(after.seenNow, true);
  const unsure = s.sightings.filter((x) => x.unsure).length; assert.ok(unsure >= 2);
});

test("a low detector score marks that sighting as unsure", () => {
  const s = sceneOf(shot({ points: path(0, { lowAt: 4 }) }));
  assert.equal(s.sightings[4].unsure, true); assert.equal(s.sightings[8].unsure, false);
});

test("a changed call is flagged; the original call is kept apart from the player's", () => {
  assert.equal(sceneOf(shot({ made: true, detectedMade: false })).callChanged, true);
  assert.equal(sceneOf(shot({ made: true, detectedMade: null })).callChanged, false);
});

test("playback state: nothing before the first sighting, a growing trail, the last sighting held at the end", () => {
  const s = sceneOf(shot({ points: path(0) }));
  assert.equal(stateAt(s, s.startT - 50).shown, null);
  const a = stateAt(s, -400), b = stateAt(s, 100);
  assert.ok(b.trail.length > a.trail.length && a.trail.length > 0);
  assert.equal(stateAt(s, 99999).shown, s.sightings[s.sightings.length - 1]);
});

test("stepping moves one sighting at a time and stops at the ends", () => {
  const s = sceneOf(shot({ points: path(0) })), times = sightingTimes(s);
  assert.equal(stepTime(times, times[3], 1), times[4]); assert.equal(stepTime(times, times[3], -1), times[2]);
  assert.equal(stepTime(times, times[0], -1), times[0]); assert.equal(stepTime(times, times[times.length - 1], 1), times[times.length - 1]);
  assert.equal(stepTime([], 5, 1), 5);
});

test("two shots are lined up on the rim's height when both were seen there, else on closest approach, else at the start", () => {
  const a = sceneOf(shot({ points: path(5) })), b = sceneOf(shot({ made: false, points: path(-50, { from: -600 }) }));
  const s1 = syncPoint(a, b); assert.equal(s1.mode, "rim_height"); assert.equal(s1.aT, a.crossing!.t); assert.equal(s1.bT, b.crossing!.t);
  const noCross = sceneOf(shot({ points: path(0).filter((p) => p[2] > 5) }));
  const s2 = syncPoint(a, noCross); assert.ok(s2.mode === "closest" || s2.mode === "start"); assert.match(s2.note, /closest|first sighting/);
  const empty = sceneOf(shot({ points: [] , quality: { level: "none", reasons: [] } }));
  assert.equal(syncPoint(a, empty).mode, "start");
});

test("the observed differences list only what was seen, in the picture's terms, and the caution is always available", () => {
  const a = sceneOf(shot({ points: path(4) })), b = sceneOf(shot({ made: false, points: path(-60) }));
  const d = observedDifferences(a, b);
  assert.deepEqual(d.map((x) => x.label), ["Where it came down past the rim's height", "Highest point in the picture", "How long the camera followed it", "Stretches where it was not seen"]);
  assert.match(d[0].b, /left of centre/); assert.match(d[0].a, /centre/);
  const none = observedDifferences(a, sceneOf(shot({ points: [], quality: { level: "none", reasons: [] } })));
  assert.equal(none[0].b, "not seen coming down"); assert.equal(none[1].b, "not seen");
  assert.match(COMPARE_CAUTION, /does not say which/);
  for (const x of d) for (const t of [x.label, x.a, x.b]) assert.doesNotMatch(t, JARGON, t);
});

test("patterns: one dot per shot, typical examples, and a side only from enough misses and only when clearly leaning", () => {
  const mk = (cross: number, made: boolean) => shot({ made, detectedMade: made, points: path(cross) });
  const shots = [...[0, 3, -4, 6, 2, -2].map((c) => mk(c, true)), ...[-60, -50, -70, -45, -55, -62, -48, 20, -58, 8].map((c) => mk(c, false))];
  const p = summarizePatterns(shots);
  assert.equal(p.arrivals.length, 16); assert.equal(p.makes, 6); assert.equal(p.misses, 10);
  assert.ok(p.typicalMake && p.typicalMiss && p.typicalMake.made && !p.typicalMiss.made);
  assert.equal(p.side?.lean, "left"); assert.equal(p.side?.strong, true); assert.match(p.side!.text, /to the left of the rim's centre/);
  const balanced = summarizePatterns([...[-50, 50, -40, 45, -55, 60, -42, 48, -47, 52].map((c) => mk(c, false))]);
  assert.equal(balanced.side?.lean, "none"); assert.match(balanced.side!.text, /no clear side/);
  const few = summarizePatterns([-50, -40, -60].map((c) => mk(c, false))); assert.equal(few.side, null, `needs ${MIN_MISSES_FOR_SIDE} misses`);
  assert.equal(summarizePatterns([]).usable, 0);
  assert.equal(p.side!.text.includes("farther"), false, "never the 'misses were farther from the rim' restatement");
});

test("a shot with no usable path is counted as a shot but not as an arrival", () => {
  const p = summarizePatterns([shot({ points: path(0) }), shot({ points: path(0).slice(0, 3) }), shot({ points: [], tracked: false, quality: { level: "none", reasons: [] } })]);
  assert.deepEqual([p.coverage.shots, p.coverage.withPath, p.coverage.seenComingDown], [3, 2, 1]);
});

test("after the last sighting the ball is held and marked 'ended' (the camera stopped following it), not 'in a gap'", () => {
  const s = sceneOf(shot({ points: path(0) }));
  const end = stateAt(s, s.endT), after = stateAt(s, s.endT + 400);
  assert.equal(end.seenNow, true); assert.equal(end.ended, false);
  assert.equal(after.ended, true); assert.equal(after.inGap, false); assert.equal(after.seenNow, false);
  assert.deepEqual(after.shown, end.shown);
});

test("a side is never stated as a fact about the shooter unless the phone was said to be straight behind", () => {
  const mk = (cross: number, made: boolean) => shot({ made, detectedMade: made, points: path(cross) });
  const shots = [...[0, 3, -4, 6, 2, -2].map((c) => mk(c, true)), ...[-60, -50, -70, -45, -55, -62, -48, 20, -58, 8].map((c) => mk(c, false))];
  const unsure = summarizePatterns(shots).side!;
  assert.equal(unsure.strong, true); assert.match(unsure.text, /in the picture/); assert.match(unsure.caveat!, /not straight behind you/); assert.match(unsure.caveat!, /short or long/);
  const behind = summarizePatterns(shots, "behind").side!;
  assert.equal(behind.strong, true); assert.match(behind.caveat!, /little off-centre/);
  const side = summarizePatterns(shots, "side").side!;
  assert.equal(side.strong, false); assert.equal(side.lean, "none"); assert.match(side.text, /cannot be read as a lean in your shooting/); assert.equal(side.left > side.right, true, "the counts are still shown");
  const balanced = summarizePatterns([-50, 50, -40, 45, -55, 60, -42, 48, -47, 52].map((c) => mk(c, false)), "unsure").side!;
  assert.equal(balanced.caveat, null, "nothing to caveat when no side is claimed");
});
