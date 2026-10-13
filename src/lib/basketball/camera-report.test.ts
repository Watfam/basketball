import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCameraReport, formatCameraReport } from "./camera-report.ts";
import { addShot } from "./shooting.ts";

const ctx = { ruleVersion: "v4", modelVersion: "ball-6", build: "abc123", aim: '{"x":0.5,"y":0.4,"scale":1}', phone: "Mozilla/5.0 (iPhone)" };

test("counts the camera's shots, hand-added ones, ringed reasons and calls changed in review", () => {
  let shots = addShot([], true, null, "camera", true, { flagged: true, flagReasons: ["wide_below", "off_centre"] });
  shots = addShot(shots, false, null, "camera", true, {});
  shots = addShot(shots, false, null, "camera", false, { flagged: true, flagReasons: ["wide_below"] });
  shots = addShot(shots, true, null, "manual", null, { addedByHand: true });
  const r = buildCameraReport({ shots, cameraStats: { avgFps: 14.2, minFps: 9.5, slowSeen: false, scale: 1.2, ballWidth: 23.4 } }, ctx);
  assert.deepEqual([r.camShots, r.handAdded, r.ringed, r.changed], [3, 1, 2, 1]);
  assert.deepEqual(r.reasons, { wide_below: 2, off_centre: 1 });
  assert.deepEqual([r.avgFps, r.minFps, r.scale, r.ballWidth], [14.2, 9.5, 1.2, 23.4]);
});

test("a set with no stats says so, and the phone string is capped", () => {
  const r = buildCameraReport({ shots: [], cameraStats: undefined }, { ...ctx, phone: "x".repeat(300) });
  assert.equal(r.avgFps, null);
  assert.equal(r.phone.length, 90);
  const text = formatCameraReport(r, { shots: 0, makes: 0 });
  assert.match(text, /Speed: not recorded/);
  assert.match(text, /Ringed unsure: 0 of 0 \(0%\)/);
});

test("the pasteable text carries every number a review needs", () => {
  const shots = addShot([], true, null, "camera", true, { flagged: true, flagReasons: ["wide_below"] });
  const text = formatCameraReport(buildCameraReport({ shots, cameraStats: { avgFps: 15, minFps: 12, slowSeen: true, scale: null, ballWidth: null } }, ctx), { shots: 1, makes: 1 });
  assert.match(text, /rule v4, model ball-6, build abc123/);
  assert.match(text, /Set: 1 shots, 1 makes \(1 counted by the camera, 0 added by hand\)/);
  assert.match(text, /slow warning yes; size x\? \(ball \? px\)/);
  assert.match(text, /Aim: \{"x":0.5/);
});
