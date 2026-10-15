import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { judge, judgeBattery, judgeLoop, PHONE_CRITERIA, type PhoneReport } from "./phonetest.ts";
import type { DiagSummary } from "./diagnostics.ts";

const criteria = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../../../training/eval/experiments/iphone-readiness/criteria.json"), "utf8")).criteria;

test("the criteria in the code equal the criteria registered before any phone result", () => {
  for (const [k, v] of Object.entries(PHONE_CRITERIA)) assert.equal(criteria[k].limit, v, k);
  for (const k of Object.keys(criteria)) assert.ok(k in PHONE_CRITERIA || k === "countedShotsEqual", `registered criterion ${k} has no counterpart`);
});

const good: PhoneReport = {
  v: 1, at: "x", userAgent: "t", capabilities: { persistApi: true, heapApi: false, batteryApi: false, standalone: true, deviceMemoryGB: null, cores: 6 },
  persistence: { persistedBefore: false, persistGranted: true, marker: { createdAt: 1, ageHours: 5 } }, storage: { usage: 1, quota: 2 },
  sizes: [{ shots: 40, save_ms: 30, load_ms: 20, analyse_ms: 40, delete_ms: 5, kb: 70 }, { shots: 250, save_ms: 400, load_ms: 100, analyse_ms: 900, delete_ms: 30, kb: 420 }],
  list1000: { shots: 1000, load_ms: 700 }, render: { shots: 100, per_shot_ms_median: 4, per_shot_ms_p95: 9, compare_draw_ms: 3 }, recorder: { frames: 3000, median_us: 8, p99_us: 60 },
  stress: { rounds_ms: [900, 880, 950, 940, 960], slowdown: 1.07, failed: null }, heapMB: { start: null, end: null }, battery: { start: null, end: null, charging: null }, pageReloadedDuringRun: false, totalMs: 9000,
};
const byId = (r: PhoneReport) => Object.fromEntries(judge(r).map((c) => [c.id, c.verdict]));

test("a good report passes what it can measure and says 'not measured' for what a browser cannot see; never a pass by default", () => {
  const v = byId(good);
  for (const id of ["save250", "analyse250", "list1000", "render", "recorder", "stress", "reload", "persist"]) assert.equal(v[id], "pass", id);
  assert.equal(v.heap, "not_measured"); assert.equal(v.battery, "not_measured");
});

test("each limit fails when exceeded, and missing evidence is not a pass", () => {
  assert.equal(byId({ ...good, sizes: [{ ...good.sizes[1], save_ms: 1500 }] }).save250, "fail");
  assert.equal(byId({ ...good, list1000: { shots: 1000, load_ms: 4000 } }).list1000, "fail");
  assert.equal(byId({ ...good, list1000: { shots: 600, load_ms: 100 } }).list1000, "not_measured", "a history under 1,000 shots does not answer the 1,000-shot question");
  assert.equal(byId({ ...good, render: { ...good.render!, per_shot_ms_p95: 80 } }).render, "fail");
  assert.equal(byId({ ...good, render: null }).render, "not_measured");
  assert.equal(byId({ ...good, recorder: { frames: 1, median_us: 1, p99_us: 900 } }).recorder, "fail");
  assert.equal(byId({ ...good, stress: { rounds_ms: [100, 400], slowdown: 4, failed: null } }).stress, "fail");
  assert.equal(byId({ ...good, stress: { rounds_ms: [], slowdown: NaN, failed: "QuotaExceededError" } }).stress, "fail");
  assert.equal(byId({ ...good, pageReloadedDuringRun: true }).reload, "fail");
  assert.equal(byId({ ...good, persistence: { persistedBefore: null, persistGranted: null, marker: null } }).persist, "not_measured");
  assert.equal(byId({ ...good, persistence: { persistedBefore: false, persistGranted: false, marker: null } }).persist, "fail");
  assert.equal(byId({ ...good, sizes: [] }).save250, "not_measured");
});

const d = (work: number, interval: number, n = 300): DiagSummary[] => [{ name: "loop.work_ms", n, medianMs: work, p95Ms: work * 1.5, maxMs: work * 3 }, { name: "loop.interval_ms", n, medianMs: interval, p95Ms: interval * 1.2, maxMs: interval * 2 }];

test("live loop comparison: review on versus off, from two real sets, with enough frames", () => {
  const ok = judgeLoop(d(40, 67), d(41, 67.5));
  assert.deepEqual(ok.checks.map((c) => c.verdict), ["pass", "pass"]);
  const slow = judgeLoop(d(40, 67), d(46, 75));
  assert.deepEqual(slow.checks.map((c) => c.verdict), ["fail", "fail"]);
  assert.deepEqual(judgeLoop(undefined, d(40, 67)).checks.map((c) => c.verdict), ["not_measured", "not_measured"]);
  assert.deepEqual(judgeLoop(d(40, 67, 20), d(40, 67, 20)).checks.map((c) => c.verdict), ["not_measured", "not_measured"], "fewer than 100 frames is not evidence");
});

test("battery by hand: extra drain per 15 minutes; short or nonsense entries are not evidence", () => {
  assert.equal(judgeBattery({ start: 90, end: 84, minutes: 15 }, { start: 88, end: 81, minutes: 15 }).verdict, "pass");
  assert.equal(judgeBattery({ start: 90, end: 84, minutes: 15 }, { start: 88, end: 78, minutes: 15 }).verdict, "fail");
  assert.equal(judgeBattery({ start: 90, end: 84, minutes: 5 }, { start: 88, end: 81, minutes: 15 }).verdict, "not_measured");
  assert.equal(judgeBattery({ start: 80, end: 85, minutes: 15 }, { start: 88, end: 81, minutes: 15 }).verdict, "not_measured", "a battery that went up (charging) is not a drain");
  assert.equal(judgeBattery(null, null).verdict, "not_measured");
});
