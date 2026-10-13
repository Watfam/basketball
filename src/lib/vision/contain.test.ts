import { test } from "node:test";
import assert from "node:assert/strict";
import { containedRect, pictureFraction } from "./contain.ts";

test("a 16:9 picture in a wider box has bars left and right", () => {
  const r = containedRect(844, 390, 1920, 1080);
  assert.ok(Math.abs(r.h - 390) < 1e-9);
  assert.ok(Math.abs(r.w - 693.33) < 0.01);
  assert.ok(Math.abs(r.x - 75.33) < 0.01);
  assert.equal(r.y, 0);
});

test("in a taller box it has bars above and below", () => {
  const r = containedRect(390, 700, 1920, 1080);
  assert.equal(r.x, 0);
  assert.ok(Math.abs(r.w - 390) < 1e-9);
  assert.ok(Math.abs(r.h - 219.375) < 1e-9);
  assert.ok(Math.abs(r.y - 240.3125) < 1e-9);
});

test("a tap maps to fractions of the picture, not of the box, and the bars give nothing", () => {
  const box = { w: 844, h: 390 };
  const video = { w: 1920, h: 1080 };
  const mid = pictureFraction(422, 195, box, video);
  assert.ok(mid && Math.abs(mid.x - 0.5) < 1e-9 && Math.abs(mid.y - 0.5) < 1e-9);
  const topLeft = pictureFraction(75.34, 0, box, video);
  assert.ok(topLeft && topLeft.x < 0.001 && topLeft.y === 0);
  assert.equal(pictureFraction(40, 100, box, video), null);
  assert.equal(pictureFraction(800, 100, box, video), null);
});
