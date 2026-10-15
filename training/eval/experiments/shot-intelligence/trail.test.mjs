import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrail, verifyTrail, reconstruct, TRAIL } from "./trail.mjs";

const rim = { x: 200, y: 190 };
const obs = (f, x, y, w = 24, score = 0.9) => ({ f, x, y, w, h: w, score });
const track = (id, pts) => ({ id, obs: pts });
const box = (o) => ({ x1: o.x - o.w / 2, y1: o.y - o.w / 2, x2: o.x + o.w / 2, y2: o.y + o.w / 2, score: o.score });
const build = (tracks, { clutter = () => false, extra = () => [], thin = 1 } = {}) => buildTrail({ tracks, isClutter: clutter, boxesAt: (f) => [...tracks.flatMap((t) => t.obs.filter((o) => o.f === f).map(box)), ...extra(f)], rim, f0: 0, f1: 400, thin });
const arc = (f0, n, id = 1, skip = []) => track(id, Array.from({ length: n }, (_, i) => obs(f0 + i, 40 + i * 6, 300 - 18 * i + 0.5 * i * i)).filter((o) => !skip.includes(o.f)));

test("a clean flight is one segment with no gaps and every point typed observed", () => {
  const t = build([arc(100, 20)]);
  assert.equal(t.segments.length, 1); assert.equal(t.gaps.length, 0);
  assert.ok(t.segments[0].points.every((p) => p.type === "observed"));
  assert.equal(verifyTrail(t).length, 0);
});

test("a 2-frame gap is bridged by reconstructed points that sit exactly in the gap, are typed, and carry the larger uncertainty", () => {
  const t = build([arc(100, 20, 1, [108, 109])]);
  assert.equal(t.segments.length, 1);
  const rec = t.segments[0].points.filter((p) => p.type === "reconstructed");
  assert.deepEqual(rec.map((p) => p.f), [108, 109]);
  const truth = arc(100, 20).obs.filter((o) => o.f === 108 || o.f === 109);
  rec.forEach((p, i) => assert.ok(Math.hypot(p.x - truth[i].x, p.y - truth[i].y) < 1.5));
  assert.ok(rec.every((p) => p.unc > TRAIL.observedUncertaintyPx && p.score === null));
  assert.equal(verifyTrail(t).length, 0);
});

test("a gap of 4 frames breaks the trail: no reconstruction, a recorded gap", () => {
  const t = build([arc(100, 20, 1, [108, 109, 110, 111])]);
  assert.equal(t.segments.length, 2);
  assert.ok(t.segments.every((s) => s.points.every((p) => p.type === "observed")));
  assert.ok(t.gaps.some((g) => g.reason === "gap_too_long" && g.frames === 4));
});

test("a rebound ball that appears later and far away is not joined to the shot's flight", () => {
  const shot = arc(100, 15), rebound = track(2, Array.from({ length: 10 }, (_, i) => obs(130 + i, 350 - 3 * i, 400 - 12 * i)));
  const t = build([shot, rebound]);
  assert.ok(t.segments.length >= 2);
  const last = t.segments[0].points.at(-1).f, first2 = t.segments[1].points[0].f;
  assert.ok(first2 - last > TRAIL.maxGap);
});

test("a second ball within 1.5 ball widths makes the identity uncertain: the point is excluded and the trail breaks", () => {
  const shot = arc(100, 20), rival = (f) => (f === 110 ? [box(obs(110, shot.obs[10].x + 20, shot.obs[10].y, 24, 0.6))] : []);
  const t = build([shot], { extra: rival });
  assert.ok(t.events.some((e) => e.f === 110 && e.reason === "ambiguous"));
  assert.ok(!t.segments.flatMap((s) => s.points).some((p) => p.f === 110 && p.type === "observed"));
  assert.ok(t.segments.length >= 2);
});

test("rim clutter observations are dropped and recorded, never drawn as part of the flight", () => {
  const shot = arc(100, 20), t = build([shot], { clutter: (id, f) => f >= 112 });
  assert.ok(t.events.some((e) => e.reason === "clutter"));
  assert.ok(t.segments.flatMap((s) => s.points).every((p) => p.f < 112));
});

test("a dribble-sized jump (over 30 px per reference frame) is never linked", () => {
  const dr = track(1, [obs(100, 100, 300), obs(101, 104, 310), obs(102, 160, 330), obs(103, 164, 340)]);
  const t = build([dr]);
  assert.equal(t.segments.length, 2);
  assert.ok(t.gaps.some((g) => g.reason === "link_failed"));
});

test("building twice gives identical data, and the verifier flags a hand-made bad link", () => {
  assert.equal(JSON.stringify(build([arc(100, 20, 1, [108])])), JSON.stringify(build([arc(100, 20, 1, [108])])));
  const bad = { thin: 1, segments: [{ points: [{ f: 1, x: 0, y: 0, w: 24, type: "observed" }, { f: 2, x: 90, y: 0, w: 24, type: "observed" }] }], gaps: [], events: [] };
  assert.equal(verifyTrail(bad).length, 1);
});

test("15 fps: a one-processed-frame gap (2 reference frames) is bridged and typed", () => {
  const pts = [100, 102, 106, 108, 110, 112].map((f, i) => obs(f, 40 + (f - 100) * 6, 300 - 18 * (f - 100) + 0.5 * (f - 100) ** 2));
  const t = build([track(1, pts)], { thin: 2 });
  assert.equal(t.segments.length, 1);
  assert.deepEqual(t.segments[0].points.filter((p) => p.type === "reconstructed").map((p) => p.f), [104]);
});

test("reconstruct: a straight line is recovered exactly from linear fallback", () => {
  const r = reconstruct([{ f: 0, x: 0, y: 0 }], [{ f: 3, x: 30, y: 60 }], [1, 2]);
  assert.ok(Math.abs(r[0].x - 10) < 1e-6 && Math.abs(r[1].y - 40) < 1e-6);
});
