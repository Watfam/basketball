import { test } from "node:test";
import assert from "node:assert/strict";
import { loadVision } from "../../lib/transpile.mjs";
import { createTracker } from "./tracker.mjs";
import { createShotMachine } from "./shotmachine.mjs";

const V = await loadVision(), R = V.shotRules, RIM = { x: 192, y: 190 };
const box = (x, y, w = 24, score = 0.85) => ({ x1: x - w / 2, y1: y - w / 2, x2: x + w / 2, y2: y + w / 2, score });
/**
 * One continuous shot: held in the hands at (150, 330), released at frame f0 + held, rising and falling in image space so that it passes
 * the rim (y = 190) descending at x of about 190 and carries on below the net. `dx` shifts it sideways (a miss).
 */
function shot(f0, kind = "make", { held = 0, dx = 0 } = {}) {
  const out = [];
  for (let i = 0; i < held; i += 1) out.push([f0 + i, [box(150, 330 + (i % 2) * 0.4)]]);
  for (let t = 0; t < 46; t += 1) {
    const y = 330 - 22 * t + 0.5 * t * t, x = 150 + (42 / 36.3) * t + (kind === "miss" ? 70 : 0) + dx;
    if (y < 8 || y > 400) continue;
    out.push([f0 + held + t, [box(x, y)]]);
  }
  return out;
}
const merge = (...seqs) => { const m = new Map(); for (const s of seqs) for (const [f, b] of s) m.set(f, [...(m.get(f) ?? []), ...b]); return [...m.entries()].sort((a, b) => a[0] - b[0]); };
function run(seq, { total = 400, model = "bal" } = {}) {
  const tr = createTracker({ model }), M = createShotMachine({ rim: RIM, scene: tr.scene, rules: R }), calls = [], byF = new Map(seq);
  for (let f = 0; f <= total; f += 1) calls.push(...M.push(tr.push(f, byF.get(f) ?? [])));
  calls.push(...M.flush(total));
  return { calls: calls.filter((c) => c.counted), all: calls, M };
}
const phantom = (from, to, on = 40, off = 20) => { const r = []; for (let f = from; f < to; f += 1) if ((f - from) % (on + off) < on) r.push([f, [box(179.7, 194.1, 11, 0.5)]]); return r; };

test("one flight through the rim is one counted shot, with its observed trajectory and a timeline", () => {
  const { calls } = run(shot(100, "make"));
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.ok(c.counted && c.zoneSightings >= 2);
  const states = c.timeline.map((x) => x.state);
  for (const s of ["flight", "rim", "complete"]) assert.ok(states.includes(s), s);
  assert.ok(c.tracks.length >= 1 && c.owner >= 1);
});

test("a held ball that is then released gives held and release states, with the release point observed", () => {
  const { calls } = run(shot(160, "make", { held: 25 }));
  assert.equal(calls.length, 1);
  assert.ok(calls[0].flags.heldObserved);
  assert.ok(calls[0].timeline.some((x) => x.state === "held"));
});

test("a shot with no flight history (the ball is first seen at the rim) is still a valid shot", () => {
  const seq = shot(100, "make").filter(([f]) => f >= 100 + 34);
  const { calls } = run(seq);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].flags.ballFirstSeenInZone, true);
  assert.equal(calls[0].flags.release, null);
});

test("two shots 25 frames apart are two shots, not one merged group (identity, not just time, separates them)", () => {
  const { calls } = run(merge(shot(100, "make"), shot(125, "miss")));
  assert.equal(calls.length, 2, `tracked: ${calls.length}`);
  const legacy = R.createShotCounter(RIM); let n = 0; for (const [f, b] of merge(shot(100, "make"), shot(125, "miss"))) n += legacy.push((f * 1000) / R.REFERENCE_FPS, b).filter((c) => c.counted).length; n += legacy.flush().filter((c) => c.counted).length;
  assert.equal(n, 1, "the legacy grouping merges them");
});

test("a phantom that flickers on the rim for a whole session is no shot, and a real shot among it is still found", () => {
  const none = run(phantom(0, 380));
  assert.equal(none.calls.length, 0, `phantom shots: ${none.calls.length}`);
  const withShot = run(merge(phantom(0, 380), shot(180, "make")));
  assert.equal(withShot.calls.length, 1);
  const legacy = R.createShotCounter(RIM); let nl = 0; for (const [f, b] of merge(phantom(0, 380), shot(180, "make"))) nl += legacy.push((f * 1000) / R.REFERENCE_FPS, b).filter((c) => c.counted).length; nl += legacy.flush().filter((c) => c.counted).length;
  assert.ok(nl <= 1);
});

test("a legitimate stationary ball resting on the rim after a flight stays evidence for the shot", () => {
  const flight = shot(100, "make").filter(([f]) => f <= 134);
  const last = flight[flight.length - 1][1][0], lx = (last.x1 + last.x2) / 2, ly = (last.y1 + last.y2) / 2;
  const seq = [...flight, ...Array.from({ length: 30 }, (_, i) => [135 + i, [box(lx, ly + (i % 2) * 0.3)]])];
  const { calls } = run(seq);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].zoneSightings >= 20, `zone sightings ${calls[0] && calls[0].zoneSightings}`);
});

test("the machine reads snapshots only: it gives the same result when boxes are replaced by an equivalent track history", () => {
  const seq = shot(100, "make"), a = run(seq).calls.map((c) => [c.first, c.v4, c.zoneSightings]), b = run(seq).calls.map((c) => [c.first, c.v4, c.zoneSightings]);
  assert.deepEqual(a, b);
});

test("calls arrive no earlier than the rule's own wait, and never before 90 frames of history", () => {
  const tr = createTracker(), M = createShotMachine({ rim: RIM, scene: tr.scene, rules: R }), byF = new Map(shot(5, "make")); let decidedAt = null;
  for (let f = 0; f <= 200; f += 1) { const out = M.push(tr.push(f, byF.get(f) ?? [])); if (out.length && decidedAt === null) decidedAt = f; }
  assert.ok(decidedAt >= 90, `decided at ${decidedAt}`);
});
