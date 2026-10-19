import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptsIn, arrivals, ATTEMPT, type Sighting } from "./attempts.ts";

/** A ball dropping onto the rim from `top` px above it, one sighting per `step` frames, under gravity g (px per frame squared). */
function drop(f0: number, top: number, step = 1, g = 0.9, dx = 5): Sighting[] {
  const out: Sighting[] = [];
  for (let k = 0; ; k += step) {
    const dy = -top + 0.5 * g * k * k;
    if (dy > 0) break;
    out.push({ f: f0 + k, dx, dy });
  }
  return out;
}
/** A bounce: up from the rim with speed v then down again (one parabola). */
function bounce(f0: number, v: number, step = 1, g = 0.9, dx = 5): Sighting[] {
  const out: Sighting[] = [];
  const total = (2 * v) / g;
  for (let k = step; k <= total; k += step) out.push({ f: f0 + k, dx, dy: -v * k + 0.5 * g * k * k });
  return out;
}

test("one clean drop is one attempt", () => {
  const r = attemptsIn(drop(100, 90));
  assert.equal(r.attempts.length, 1);
  assert.equal(r.possiblyTwo, false);
});

test("a rim bounce (one flight up and back down) is still one attempt, at 30 and 15 fps", () => {
  for (const step of [1, 2]) {
    const first = drop(100, 90, step);
    const last = first[first.length - 1];
    const s = [...first, ...bounce(last.f, 17, step)];
    const r = attemptsIn(s);
    assert.equal(r.attempts.length, 1, `step ${step}: ${JSON.stringify(r.links)}`);
    assert.equal(r.possiblyTwo, false);
  }
});

test("a second descent after the ball was not followed is a second attempt, 20 frames later or more", () => {
  for (const step of [1, 2]) {
    const first = drop(100, 90, step);
    const lastA = first[first.length - 1].f;
    const second = drop(lastA + 20, 90, step);
    const r = attemptsIn([...first, ...second]);
    assert.equal(r.attempts.length, 2, `step ${step}`);
    assert.equal(r.possiblyTwo, true);
  }
});

test("a descent that follows straight on from a flight that does not fit one parabola is a second attempt", () => {
  const first = drop(100, 90);
  const lastA = first[first.length - 1];
  // Ball seen for a while after the rim moving sideways at a constant height (carried, not flying), then a new descent.
  const carried: Sighting[] = Array.from({ length: 14 }, (_, k) => ({ f: lastA.f + 1 + k, dx: 5 + k * 3, dy: -30 }));
  const second = drop(lastA.f + 16, 90, 1, 0.9, 50);
  const r = attemptsIn([...first, ...carried, ...second]);
  assert.equal(r.possiblyTwo, true);
});

test("two descents closer than a catch and shot could take are a bounce whatever the fit says", () => {
  const first = drop(100, 90);
  const lastA = first[first.length - 1].f;
  const second = drop(lastA + ATTEMPT.minGapFrames - 4, 60);
  const r = attemptsIn([...first, ...second]);
  assert.equal(r.possiblyTwo, false);
});

test("a ball resting near the rim is not an arrival", () => {
  const rest: Sighting[] = Array.from({ length: 30 }, (_, k) => ({ f: k, dx: 2, dy: -20 }));
  assert.equal(arrivals(rest).length, 0);
});

test("empty and single-sighting input are safe", () => {
  assert.equal(attemptsIn([]).possiblyTwo, false);
  assert.equal(attemptsIn([{ f: 1, dx: 0, dy: -50 }]).attempts.length, 0);
});
