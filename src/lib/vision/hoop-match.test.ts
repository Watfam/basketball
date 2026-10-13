import { test } from "node:test";
import assert from "node:assert/strict";
import { MATCH_FAIR, MATCH_H, MATCH_STRONG, MATCH_W, findHoop, type HoopRef } from "./hoop-match.ts";

let seed = 7;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

/** A driveway-like picture: texture (trees), a backboard with an inner square, a rim and net, a pole and a wall. */
function scene(hoopX: number, hoopY: number, size = 1, noiseSeed = 1): Uint8Array {
  seed = noiseSeed;
  const g = new Uint8Array(MATCH_W * MATCH_H);
  for (let i = 0; i < g.length; i += 1) g[i] = 120 + Math.round((rand() - 0.5) * 60);
  const rect = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(MATCH_H, Math.round(y1)); y += 1)
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(MATCH_W, Math.round(x1)); x += 1) g[y * MATCH_W + x] = v;
  };
  const s = size;
  rect(hoopX - 26 * s, hoopY - 52 * s, hoopX + 26 * s, hoopY - 8 * s, 240); // backboard
  rect(hoopX - 10 * s, hoopY - 36 * s, hoopX + 10 * s, hoopY - 16 * s, 150); // inner square
  rect(hoopX - 12 * s, hoopY - 3 * s, hoopX + 12 * s, hoopY, 60); // rim
  rect(hoopX - 8 * s, hoopY, hoopX + 8 * s, hoopY + 14 * s, 200); // net
  rect(hoopX - 2 * s, hoopY + 14 * s, hoopX + 2 * s, MATCH_H, 30); // pole
  return g;
}

const ref = (hx: number, hy: number, size = 1): HoopRef => ({ gray: scene(hx, hy, size), rim: { x: hx / MATCH_W, y: hy / MATCH_H }, scale: 1 });

test("the same view finds the rim where it was, with a strong score", async () => {
  const m = await findHoop(ref(160, 80), scene(160, 80, 1, 2));
  assert.ok(m.score >= MATCH_STRONG, `score ${m.score}`);
  assert.ok(Math.hypot((m.rim.x - 0.5) * MATCH_W, (m.rim.y - 80 / MATCH_H) * MATCH_H) <= 2);
});

test("a phone placed a bit differently: the rim is found at its new place, within a few pixels", async () => {
  const m = await findHoop(ref(160, 80), scene(176, 90, 1, 3));
  assert.ok(m.score >= MATCH_STRONG, `score ${m.score}`);
  assert.ok(Math.hypot(m.rim.x * MATCH_W - 176, m.rim.y * MATCH_H - 90) <= 4, `at ${m.rim.x * MATCH_W}, ${m.rim.y * MATCH_H}`);
});

test("the hoop looking a bit bigger (the phone moved closer) is found, and the size ratio says so", async () => {
  const m = await findHoop(ref(160, 80), scene(168, 84, 1.18, 4));
  assert.ok(m.score >= MATCH_FAIR, `score ${m.score}`);
  assert.ok(Math.hypot(m.rim.x * MATCH_W - 168, m.rim.y * MATCH_H - 84) <= 6);
  assert.ok(m.sizeRatio > 1.05 && m.sizeRatio < 1.3, `ratio ${m.sizeRatio}`);
});

test("a different place altogether scores low, so the player is asked to aim by hand", async () => {
  seed = 99;
  const other = new Uint8Array(MATCH_W * MATCH_H);
  for (let i = 0; i < other.length; i += 1) other[i] = 100 + Math.round((rand() - 0.5) * 80);
  const m = await findHoop(ref(160, 80), other);
  assert.ok(m.score < MATCH_FAIR, `score ${m.score}`);
});
