import { test } from "node:test";
import assert from "node:assert/strict";
import { rng, shuffled, sample, wilson, quantile, bootstrapCI, clusterBootstrapCI, describe, mcnemarExact } from "./stats.mjs";

test("the same seed gives the same stream, a different seed does not", () => {
  const a = rng(7), b = rng(7), c = rng(8);
  const xs = [a(), a(), a()], ys = [b(), b(), b()], zs = [c(), c(), c()];
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  assert.ok(xs.every((v) => v >= 0 && v < 1));
});

test("shuffle and sample are reproducible and keep every item once", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(shuffled(items, 3), shuffled(items, 3));
  assert.deepEqual([...shuffled(items, 3)].sort((a, b) => a - b), items);
  assert.equal(sample(items, 5, 3).length, 5);
  assert.equal(sample(items, 50, 3).length, 20);
});

test("Wilson interval matches known values", () => {
  const w = wilson(18, 20);
  assert.ok(Math.abs(w.lo - 0.699) < 0.005 && Math.abs(w.hi - 0.972) < 0.005, JSON.stringify(w));
  const zero = wilson(0, 10);
  assert.equal(zero.lo, 0);
  assert.ok(zero.hi > 0.25 && zero.hi < 0.31);
  assert.equal(wilson(0, 0), null);
});

test("quantiles interpolate and handle single values", () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0), 1);
  assert.equal(quantile([1, 2, 3, 4], 1), 4);
  assert.equal(quantile([5], 0.9), 5);
  assert.equal(quantile([], 0.5), null);
});

test("bootstrap interval is reproducible and brackets the median of a tight sample", () => {
  const v = [1, 1.1, 0.9, 1.05, 0.95, 1, 1.02, 0.98, 1.01, 0.99];
  const a = bootstrapCI(v, (s) => quantile(s, 0.5), { seed: 4 });
  const b = bootstrapCI(v, (s) => quantile(s, 0.5), { seed: 4 });
  assert.deepEqual(a, b);
  assert.ok(a.lo <= 1 && a.hi >= 1 && a.hi - a.lo < 0.2);
  assert.equal(bootstrapCI([1], (s) => s[0]), null);
});

test("describe reports the tail with labels, not only the middle", () => {
  const d = describe([1, 2, 3, 100], { labels: ["a", "b", "c", "d"] });
  assert.equal(d.n, 4);
  assert.equal(d.max, 100);
  assert.deepEqual(d.worst[0], { value: 100, at: "d" });
  assert.ok(d.p95 > 70);
  assert.deepEqual(describe([]), { n: 0 });
});

test("McNemar exact p-values", () => {
  assert.equal(mcnemarExact(0, 0), 1);
  assert.ok(Math.abs(mcnemarExact(5, 0) - 0.0625) < 1e-9);
  assert.ok(Math.abs(mcnemarExact(3, 3) - 1) < 1e-9);
  assert.ok(mcnemarExact(10, 2) < 0.04);
});

test("cluster bootstrap is wider than the plain one when points inside a group are copies of each other", () => {
  // 10 groups, each 50 identical values: only 10 independent facts
  const values = [], groups = [];
  for (let g = 0; g < 10; g += 1) for (let i = 0; i < 50; i += 1) { values.push(g + 1); groups.push("g" + g); }
  const plain = bootstrapCI(values, (s) => quantile(s, 0.5), { seed: 2 });
  const cluster = clusterBootstrapCI(values, groups, (s) => quantile(s, 0.5), { seed: 2 });
  assert.ok(cluster.hi - cluster.lo > plain.hi - plain.lo, JSON.stringify([plain, cluster]));
  assert.equal(cluster.groups, 10);
  assert.equal(clusterBootstrapCI([1, 2], ["a", "b"], (s) => s[0]), null, "fewer than 5 groups cannot give an interval");
});

test("describe with groups says how many independent groups there were and which method it used", () => {
  const values = Array.from({ length: 60 }, (_, i) => (i % 6) + 1), groups = Array.from({ length: 60 }, (_, i) => "g" + (i % 12));
  const d = describe(values, { groups });
  assert.equal(d.n_groups, 12);
  assert.match(d.ci_method, /cluster/);
  assert.match(describe(values).ci_method, /plain/);
});
