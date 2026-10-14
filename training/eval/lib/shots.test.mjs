import { test } from "node:test";
import assert from "node:assert/strict";
import { align, pool } from "./shots.mjs";

const shot = (v2) => ({ v1: v2, v2, v3: v2, v4: v2 });

test("equal counts pair one to one in order", () => {
  const a = align([shot("make"), shot("miss")], ["make", "make"]);
  assert.equal(a.how, "1-to-1");
  assert.deepEqual(a.pairs.map((p) => p.t), ["make", "make"]);
  assert.equal(a.extra + a.unseen, 0);
});

test("an extra candidate is skipped where V2 disagrees with the list", () => {
  const a = align([shot("make"), shot("miss"), shot("make")], ["make", "make"]);
  assert.match(a.how, /alignment/);
  assert.equal(a.pairs.length, 2);
  assert.equal(a.extra, 1);
});

test("a written shot never seen is counted as unseen, not as a wrong call", () => {
  const a = align([shot("make")], ["make", "miss"]);
  assert.equal(a.pairs.length, 1);
  assert.equal(a.unseen, 1);
});

test("pooling sums matched shots and keeps an interval", () => {
  const row = (c, n) => ({ matched: n, written: n + 1, correct: { v1: c, v2: c, v3: c, v4: c } });
  const p = pool([row(8, 10), row(15, 20)]);
  assert.equal(p.matched, 30);
  assert.equal(p.correct.v4, 23);
  assert.equal(p.written, 32);
  assert.ok(p.accuracy_of_written.v4.p < p.accuracy.v4.p, "a shot never counted must lower the end-to-end figure");
  assert.ok(p.accuracy.v4.lo < 23 / 30 && p.accuracy.v4.hi > 23 / 30);
});
