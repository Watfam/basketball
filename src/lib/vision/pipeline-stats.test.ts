import { test } from "node:test";
import assert from "node:assert/strict";
import { createPipelineStats, dist, formatReport } from "./pipeline-stats.ts";

/** Drives the collector with a fake clock: each pass does draw 3, readback 4, motion 2, detect `detect`, rules 1, then waits `idle`. */
function run(passes: number, detect: number, idle: number, opts: { stallAt?: number; stall?: number; ball?: (i: number) => boolean } = {}) {
  let clock = 1000;
  const s = createPipelineStats(() => clock);
  let nextPresented = 0;
  for (let i = 0; i < passes; i += 1) {
    s.begin(clock);
    s.presentedFrame(clock - 5, (nextPresented += 3));
    s.drawn(clock);
    clock += 3; s.mark("draw");
    clock += 4; s.mark("readback");
    clock += 2; s.mark("motion");
    const d = detect + (i === opts.stallAt ? (opts.stall ?? 0) : 0);
    clock += d; s.mark("detect");
    s.worker(5, d - 10, 5);
    clock += 1; s.mark("rules");
    s.end(true, opts.ball?.(i) ?? false);
    clock += idle;
  }
  return s;
}

test("dist handles empty and ordinary input", () => {
  assert.equal(dist([]).n, 0);
  const d = dist([5, 1, 3, 2, 4, 100]);
  assert.equal(d.max, 100);
  assert.equal(d.median, 4);
});

test("analysed rate is passes over time, and camera frames never looked at are counted", () => {
  // 40 ms of model + 10 of other work + 17 idle = about 67 ms per pass, 15 fps; the camera presents 3 frames per pass reading (45 fps stand-in).
  const r = run(60, 40, 17).report();
  assert.ok(r);
  assert.ok(Math.abs(r.analysedFps - 15) < 0.6, `analysed ${r.analysedFps}`);
  assert.ok(r.cameraFps && r.cameraFps > r.analysedFps);
  assert.ok(r.skippedPercent !== null && r.skippedPercent > 50);
  assert.equal(r.stalls.count, 0);
  assert.ok(Math.abs(r.stages.detect.median - 40) < 0.5);
  assert.ok(r.unaccountedMedian < 1);
});

test("a long pass is a stall and names the stage that took the time", () => {
  const r = run(40, 40, 10, { stallAt: 20, stall: 400 }).report();
  assert.ok(r);
  assert.equal(r.stalls.count, 1);
  assert.equal(r.stalls.worst[0].stage, "detect");
});

test("passes with a ball near the rim are reported on their own, and the window carries 20 passes on", () => {
  const r = run(100, 40, 10, { ball: (i) => i >= 30 && i < 40 }).report();
  assert.ok(r?.nearRim);
  assert.equal(r.nearRim.passes, 30);
});

test("too few passes gives no report, and the text report names every figure asked for", () => {
  assert.equal(run(2, 40, 10).report(), null);
  const text = formatReport(run(50, 40, 10).report()!);
  for (const word of ["Analysed", "camera", "95th", "idle", "inference", "Picture age", "Stalls", "Main-thread lag", "Warm-up", "near the rim"]) assert.ok(text.includes(word), word);
});

import { skipFrameWait, freshPaceEnabled } from "./pipeline-stats.ts";

test("pacing: the extra wait is skipped only with the flag on, when late, and when the camera has a newer picture", () => {
  assert.equal(skipFrameWait(false, 200, 100, 2, 1), false, "flag off: never");
  assert.equal(skipFrameWait(true, 90, 100, 2, 1), false, "on time (inside the 6 ms allowance of the budget): wait as before");
  assert.equal(skipFrameWait(true, 94, 100, 2, 1), true, "late by the loop's own rule");
  assert.equal(skipFrameWait(true, 200, 100, 1, 1), false, "late but the picture has not changed: wait for a new one");
  assert.equal(skipFrameWait(true, 200, 100, 1.033, 1), true);
});

test("the pacing flag is off unless it says fresh or 1", () => {
  assert.equal(freshPaceEnabled(() => null), false);
  assert.equal(freshPaceEnabled(() => "0"), false);
  assert.equal(freshPaceEnabled(() => "1"), true);
  assert.equal(freshPaceEnabled(() => "fresh"), true);
  assert.equal(freshPaceEnabled(() => { throw new Error("no storage"); }), false);
});
