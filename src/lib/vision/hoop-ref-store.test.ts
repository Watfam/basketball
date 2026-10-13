import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRef, encodeRef } from "./hoop-ref-store.ts";
import { MATCH_H, MATCH_W } from "./hoop-match.ts";

const sample = () => {
  const gray = new Uint8Array(MATCH_W * MATCH_H);
  for (let i = 0; i < gray.length; i += 1) gray[i] = (i * 7) % 256;
  return { gray, rim: { x: 0.52, y: 0.31 }, scale: 1.4 };
};

test("a saved hoop picture comes back exactly", () => {
  const ref = sample();
  const back = decodeRef(encodeRef(ref));
  assert.ok(back);
  assert.deepEqual([...back.gray], [...ref.gray]);
  assert.deepEqual(back.rim, ref.rim);
  assert.equal(back.scale, 1.4);
});

test("nothing, rubbish or a picture of the wrong size is not a reference", () => {
  assert.equal(decodeRef(null), null);
  assert.equal(decodeRef("not json"), null);
  assert.equal(decodeRef(JSON.stringify({ v: 1, g: btoa("abc"), rim: { x: 0.5, y: 0.3 }, scale: 1 })), null);
  const ok = JSON.parse(encodeRef(sample()));
  assert.equal(decodeRef(JSON.stringify({ ...ok, v: 2 })), null);
  assert.equal(decodeRef(JSON.stringify({ ...ok, rim: { x: 1.5, y: 0.3 } })), null);
  assert.equal(decodeRef(JSON.stringify({ ...ok, scale: 0 })), null);
});
