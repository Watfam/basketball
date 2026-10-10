import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIP, createReplayBuffer } from "./replay-buffer.ts";

test("keeps only the last few seconds", () => {
  const buf = createReplayBuffer<number>(6000);
  for (let t = 0; t <= 10_000; t += 100) buf.push(t, t);
  assert.equal(buf.between(0, 3999).length, 0);
  assert.equal(buf.between(4000, 10_000).length, 61);
});

test("a shot's clip runs from a second before the rim to two after", () => {
  const buf = createReplayBuffer<number>(6000);
  for (let t = 0; t <= 8000; t += 66) buf.push(t, t);
  const atRim = 5000;
  const clip = buf.between(atRim - CLIP.beforeMs, atRim + CLIP.afterMs);
  assert.ok(clip[0].t >= 4000 && clip[clip.length - 1].t <= 7000);
  assert.ok(clip.length >= 44);
});
