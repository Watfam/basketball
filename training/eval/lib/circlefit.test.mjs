import { test } from "node:test";
import assert from "node:assert/strict";
import { fitAround } from "./circlefit.mjs";

// A synthetic orange disc on a grey ground: the fit must find its centre and radius when the seed is nearby, and report nothing
// useful when the seed is far from any disc. (Synthetic: it says the code runs, not that it is accurate on real footage.)
function disc(W, H, cx, cy, r) {
  const img = new Uint8Array(W * H * 3).fill(110);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const p = (y * W + x) * 3; img[p] = 235; img[p + 1] = 110; img[p + 2] = 30; }
  return img;
}

test("finds a disc's centre to about a pixel when the seed is close", () => {
  const W = 300, H = 300, img = disc(W, H, 150, 140, 14);
  const c = fitAround(img, W, H, 154, 144, 20);
  assert.ok(c, "no circle");
  assert.ok(Math.hypot(c.cx - 150, c.cy - 140) <= 2, JSON.stringify(c));
  assert.ok(Math.abs(c.r - 14) <= 2);
  assert.ok(c.support >= 0.7);
});

test("a seed outside the search radius cannot pull the fit onto the disc", () => {
  const W = 300, H = 300, img = disc(W, H, 150, 140, 14);
  const c = fitAround(img, W, H, 220, 220, 10);
  assert.ok(!c || Math.hypot(c.cx - 150, c.cy - 140) > 20 || c.support < 0.7);
});
