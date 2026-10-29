import test from "node:test";
import assert from "node:assert/strict";
import { advanceClock, clockToFraction, fractionToClock, interpolateFrame, HOLD_MS, TRANSITION_MS } from "./playback.ts";
import type { Frame } from "./types.ts";

test("a hold runs out and moves into a transition, at 1x speed", () => {
  const afterHold = advanceClock({ frameIndex: 0, phase: "hold", t: 0 }, HOLD_MS, 1, 3);
  assert.deepEqual(afterHold, { frameIndex: 0, phase: "transition", t: 0, done: false });
});

test("a transition runs out and moves to the next frame's hold", () => {
  const afterTransition = advanceClock({ frameIndex: 0, phase: "transition", t: 0 }, TRANSITION_MS, 1, 3);
  assert.deepEqual(afterTransition, { frameIndex: 1, phase: "hold", t: 0, done: false });
});

test("the hold on the last frame finishing is the end of playback", () => {
  const done = advanceClock({ frameIndex: 2, phase: "hold", t: 0 }, HOLD_MS, 1, 3);
  assert.equal(done.done, true);
});

test("speed scales how much wall-clock time a phase takes, not the nominal clock itself", () => {
  const at2x = advanceClock({ frameIndex: 0, phase: "hold", t: 0 }, HOLD_MS / 2, 2, 3);
  assert.deepEqual(at2x, { frameIndex: 0, phase: "transition", t: 0, done: false });
  const halfway = advanceClock({ frameIndex: 0, phase: "hold", t: 0 }, HOLD_MS / 2, 1, 3);
  assert.ok(Math.abs(halfway.t - 0.5) < 1e-9);
});

test("clockToFraction and fractionToClock round-trip through a few points on a 3-frame timeline", () => {
  const frameCount = 3;
  for (const clock of [
    { frameIndex: 0, phase: "hold" as const, t: 0 },
    { frameIndex: 0, phase: "hold" as const, t: 0.5 },
    { frameIndex: 0, phase: "transition" as const, t: 0.5 },
    { frameIndex: 2, phase: "hold" as const, t: 0.9 },
  ]) {
    const f = clockToFraction(clock, frameCount);
    const back = fractionToClock(f, frameCount);
    assert.equal(back.frameIndex, clock.frameIndex);
    assert.equal(back.phase, clock.phase);
    assert.ok(Math.abs(back.t - clock.t) < 1e-6, `${JSON.stringify(back)} vs ${JSON.stringify(clock)}`);
  }
});

test("fractionToClock never points a transition past the second-to-last frame", () => {
  const atEnd = fractionToClock(1, 3);
  assert.ok(atEnd.frameIndex <= 1 || atEnd.phase === "hold");
});

test("fractionToClock at the very end of the scrubber rests on the LAST frame, not frame 0 (regression: used to wrap back to the start)", () => {
  for (const frameCount of [1, 2, 3, 6]) {
    assert.deepEqual(fractionToClock(1, frameCount), { frameIndex: frameCount - 1, phase: "hold", t: 1 }, `frameCount=${frameCount}`);
  }
});

const from: Frame = {
  offense: [{ id: "O1", pos: { x: 0, y: 0 } }],
  defense: [{ id: "X1", man: "O1", coverage: "onBall" }],
  ballHolder: "O1",
  lines: [],
  note: "",
};

test("a player with an arrival path glides along it, not a straight line", () => {
  const to: Frame = { ...from, offense: [{ id: "O1", pos: { x: 10, y: 0 } }], arrivals: { O1: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }] } };
  const { frame } = interpolateFrame(from, to, 0.5);
  const o1 = frame.offense[0].pos;
  // Halfway along a bowed 3-point Catmull-Rom path is not the midpoint of the straight chord (5, 0).
  assert.notEqual(o1.y, 0);
});

test("a player with no arrival path is linearly interpolated between from and to", () => {
  const to: Frame = { ...from, offense: [{ id: "O1", pos: { x: 10, y: 0 } }] };
  const { frame } = interpolateFrame(from, to, 0.5);
  assert.deepEqual(frame.offense[0].pos, { x: 5, y: 0 });
});

test("a formula-driven defender with no arrival path keeps the CURRENT frame's coverage for the whole glide, switching only at arrival", () => {
  const to: Frame = { ...from, offense: [{ id: "O1", pos: { x: 10, y: 0 } }], defense: [{ id: "X1", man: "O1", coverage: "fullDeny" }] };
  const { frame } = interpolateFrame(from, to, 0.5);
  assert.deepEqual(frame.defense[0], from.defense[0]);
  assert.notDeepEqual(frame.defense[0], to.defense[0]);
});

test("a pass in flight keeps the OLD ball holder for coverage purposes until arrival", () => {
  const to: Frame = { ...from, ballHolder: "O1", offense: [{ id: "O1", pos: { x: 10, y: 0 } }, { id: "O2", pos: { x: 20, y: 0 } }] };
  const fromTwo: Frame = { ...from, ballHolder: "O2", offense: [{ id: "O1", pos: { x: 0, y: 0 } }, { id: "O2", pos: { x: 0, y: 5 } }] };
  const { frame } = interpolateFrame(fromTwo, to, 0.5);
  assert.equal(frame.ballHolder, "O2");
});

test("a pass sets a ball override that travels the pass line, separate from the eventual holder's position", () => {
  const to: Frame = { ...from, ballArrival: [{ x: 0, y: 0 }, { x: 20, y: 0 }] };
  const { ballOverride } = interpolateFrame(from, to, 0.5);
  assert.deepEqual(ballOverride, { x: 10, y: 0 });
});

test("a cut and a pass in the SAME transition are staggered, not simultaneous: the cutter is most of the way there while the ball has not left the passer's hand yet", () => {
  const to: Frame = { ...from, offense: [{ id: "O1", pos: { x: 10, y: 0 } }], ballArrival: [{ x: 0, y: 0 }, { x: 20, y: 0 }] };
  const { frame, ballOverride } = interpolateFrame(from, to, 0.5);
  // Move window is [0, 0.65] of the transition — at raw 0.5 the cutter is well past the plain-lerp
  // midpoint (5), not sitting exactly on it the way an unstaggered 0.5 would.
  assert.ok(frame.offense[0].pos.x > 6, `expected the cutter well past halfway, got x=${frame.offense[0].pos.x}`);
  // Ball window is [0.5, 1] — at raw 0.5 it has not started moving off the passer's spot yet.
  assert.deepEqual(ballOverride, { x: 0, y: 0 });
});

test("a transition with ONLY a pass (nobody else moving) is not staggered — the ball still eases over the whole window", () => {
  const to: Frame = { ...from, ballArrival: [{ x: 0, y: 0 }, { x: 20, y: 0 }] };
  const { ballOverride } = interpolateFrame(from, to, 0.25);
  // ease(0.25) = 4 * 0.25^3 = 0.0625 -> x = 0.0625 * 20 = 1.25
  assert.ok(Math.abs((ballOverride?.x ?? -1) - 1.25) < 1e-9, `expected the unstaggered ease(0.25) point, got ${JSON.stringify(ballOverride)}`);
});
