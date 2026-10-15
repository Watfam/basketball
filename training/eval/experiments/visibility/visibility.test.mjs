import { test } from "node:test";
import assert from "node:assert/strict";
import { tileSpecs, geometry, FRAME, ranges } from "./common.mjs";
import { nms } from "./strategies.mjs";
import { observe } from "./metrics.mjs";

const clip = { window: { cropX: 866, cropY: 260, cropSize: 416, scale: 1, rim_native: [1058, 450] } };
const o = (f, x, y, speed, w = 24) => ({ f, x, y, w, h: w, score: 0.9, speed });

test("tiles: the base tile is the production window, every tile stays inside the frame, and aliases are marked", () => {
  const { specs } = tileSpecs(clip);
  assert.deepEqual([specs.base.ox, specs.base.oy, specs.base.side], [866, 260, 416]);
  for (const s of Object.values(specs).filter((x) => x.kind !== "full")) assert.ok(s.ox >= 0 && s.oy >= 0 && s.ox + s.side <= FRAME.w && s.oy + s.side <= FRAME.h, JSON.stringify(s));
  assert.equal(specs.up.oy, 260 - 312 < 0 ? 0 : 260 - 312);
  assert.equal(specs.A3.side, FRAME.w);
  assert.ok(specs.A2.side <= FRAME.h);
});

test("geometry: native <-> base-window units round-trip, and a 790 px window maps 24 u to about 46 native px", () => {
  const g = geometry({ window: { cropX: 436, cropY: 52, cropSize: 790, scale: 1.899, rim_native: [801, 413] } });
  const p = g.toU(801, 413), q = g.fromU(p.x, p.y);
  assert.ok(Math.abs(q.x - 801) < 1e-9 && Math.abs(q.y - 413) < 1e-9);
  assert.ok(Math.abs(24 * g.scale - 45.6) < 0.1);
});

test("ranges merge touching segments", () => {
  assert.deepEqual(ranges([{ F: 100 }, { F: 150 }, { F: 400 }]), [[25, 165], [325, 415]]);
});

test("nms keeps the best of overlapping boxes and both of separate ones", () => {
  const a = { x1: 0, y1: 0, x2: 20, y2: 20, score: 0.9 }, b = { x1: 2, y1: 2, x2: 22, y2: 22, score: 0.6 }, c = { x1: 100, y1: 100, x2: 120, y2: 120, score: 0.5 };
  assert.deepEqual(nms([b, c, a]).map((x) => x.score), [0.9, 0.5]);
});

test("release is claimed only when held points (slow) are observed and directly followed by airborne points; nothing is fitted or interpolated", () => {
  const held = [0, 1, 2, 3].map((i) => o(100 + i, 50, 300, 1)), air = [o(104, 52, 292, 8.5), o(105, 56, 276, 16), o(106, 60, 255, 21), o(107, 64, 228, 27)];
  const chain = { obs: [...held, ...air, ...[8, 9, 10, 11, 12, 13].map((k, j) => o(100 + k, 70 + j * 5, 200 - j * 10, 28))] };
  const r = observe(chain, { F: 140 }, 1, { x: 200, y: 190 });
  assert.equal(r.release, true);
  assert.ok(Math.abs(r.E1 - 103) <= 1);
  const noHeld = { obs: [...air, ...[8, 9, 10, 11, 12].map((k, j) => o(100 + k, 70 + j * 5, 200 - j * 10, 28))] };
  assert.equal(observe(noHeld, { F: 140 }, 1, { x: 200, y: 190 }).release, false, "an airborne-only chain is not a release");
});

test("an apex needs observed points on both sides of the minimum; a rising-only chain whose parabola would peak later is not an apex", () => {
  const rising = { obs: Array.from({ length: 12 }, (_, i) => o(100 + i, 50 + i * 6, 300 - i * 14 + i * i * 0.4, 20)) };
  assert.equal(observe(rising, { F: 150 }, 1, { x: 400, y: 300 }).apex, false);
  const arc = { obs: Array.from({ length: 21 }, (_, i) => o(100 + i, 50 + i * 6, 300 - 20 * i + i * i, 14)) };
  assert.equal(observe(arc, { F: 150 }, 1, { x: 400, y: 300 }).apex, true);
});
