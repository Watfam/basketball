import { test } from "node:test";
import assert from "node:assert/strict";
import { hoopWindow } from "./roi.ts";

const EXAM_RIM = { x: (866 + 192) / 1920, y: (260 + 190) / 1080 };

test("the zoomed-out exam setup is exactly what it always was", () => {
  // The exam clips: window 416 px at (866, 260) of 1920x1080, rim at (192, 190) in it.
  const w = hoopWindow(1920, 1080, EXAM_RIM);
  assert.deepEqual(w.crop, { sx: 866, sy: 260, sw: 416, sh: 416 });
  assert.ok(Math.abs(w.rim.x - 192) < 1e-9 && Math.abs(w.rim.y - 190) < 1e-9);
});

test("a zoomed-in setup gets a bigger window, shrunk so the rim lands where training put it", () => {
  const rim = { x: 0.5, y: 0.5 };
  const w = hoopWindow(1920, 1080, rim, 2);
  assert.equal(w.crop.sw, 832);
  assert.ok(Math.abs(w.rim.x - 192) < 1 && Math.abs(w.rim.y - 190) < 1);
});

test("near the top edge the window is pushed down and the rim is reported where it really is", () => {
  const w = hoopWindow(1920, 1080, { x: 0.3, y: 50 / 1080 }, 1);
  assert.equal(w.crop.sy, 0);
  assert.ok(Math.abs(w.rim.y - 50) < 1e-9);
  assert.ok(w.roomAbove < 190);
});

test("a window bigger than the frame is shrunk to fit, and the rim still maps correctly", () => {
  const w = hoopWindow(1920, 1080, { x: 0.5, y: 0.5 }, 4);
  assert.equal(w.crop.sw, 1080);
  const k = 416 / 1080;
  assert.ok(Math.abs(w.rim.y - (540 - w.crop.sy) * k) < 1e-9);
});

test("block motion sees a small ball move and ignores even noise", async () => {
  const { blockMotion } = await import("./roi.ts");
  const w = 416, h = 416;
  const still = new Uint8Array(w * h).fill(120);
  const noisy = still.map((v, i) => v + ((i * 7919) % 5) - 2);
  assert.ok(blockMotion(still, Uint8Array.from(noisy), w, h) < 3);
  const ball = Uint8Array.from(still);
  for (let y = 100; y < 122; y += 1) for (let x = 180; x < 202; x += 1) ball[y * w + x] = 200;
  assert.ok(blockMotion(still, ball, w, h) > 10);
});

test("two taps on the rim's edges give its width and the scale that makes it the trained size", async () => {
  const { rimScaleFromTaps } = await import("./roi.ts");
  // At scale 1 the window is 416 camera px: a rim tapped 45 px wide is the trained size.
  assert.deepEqual(rimScaleFromTaps(170, 215, 416, 45), { rimCameraPx: 45, scale: 1 });
  // Matt's far setup: window cut at 678 px (x1.63), rim tapped 18 model px wide -> about 29 camera px -> x0.65.
  const far = rimScaleFromTaps(183, 201, 678, 45);
  assert.ok(Math.abs(far.scale - 0.65) < 0.01);
});
