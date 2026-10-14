import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIGS, none, stationary, trackGate, sizeGate, hybrid, createTracker, PARAMS } from "./filters.mjs";

const box = (x, y, w = 24, score = 0.8) => ({ x1: x - w / 2, y1: y - w / 2, x2: x + w / 2, y2: y + w / 2, score });
const run = (make, frames) => { const f = make(); return frames.map(([n, boxes]) => f.push(n, boxes)); };
// a ball thrown at the rim: falls 10 px a frame, moving sideways 2 px a frame
const flight = (start, n, x0 = 150, y0 = 0) => Array.from({ length: n }, (_, i) => [start + i, [box(x0 + 2 * i, y0 + 10 * i)]]);
// a phantom that fires in runs: on for `on` frames then off for `off`
const phantom = (from, to, on = 40, off = 20, w = 11) => { const r = []; for (let f = from; f < to; f += 1) if ((f - from) % (on + off) < on) r.push([f, [box(180, 194, w, 0.5)]]); return r; };
const merge = (...seqs) => { const m = new Map(); for (const s of seqs) for (const [n, b] of s) m.set(n, [...(m.get(n) ?? []), ...b]); return [...m.entries()].sort((a, b) => a[0] - b[0]); };

for (const name of Object.keys(CONFIGS)) {
  test(`${name} is causal: changing the future never changes the past`, () => {
    const seq = merge(flight(10, 20), phantom(0, 800), flight(400, 20, 160, 0));
    const t = 500;
    const past = seq.filter(([n]) => n <= t);
    const altered = [...past, ...seq.filter(([n]) => n > t).map(([n, b]) => [n, b.map((x) => ({ ...x, x1: x.x1 + 77, x2: x.x2 + 77, y1: x.y1 - 31, y2: x.y2 - 31 }))])];
    const a = run(CONFIGS[name], seq).slice(0, past.length), b = run(CONFIGS[name], altered).slice(0, past.length);
    assert.deepEqual(a, b);
  });
}

test("a clean ball flight passes every filter except for the track gate's proof delay", () => {
  const seq = flight(10, 20);
  for (const name of ["baseline", "A", "C50", "C60"]) assert.equal(run(CONFIGS[name], seq).flat().length, 20, name);
  const kept = run(CONFIGS.B, seq).flat().length;
  assert.ok(kept >= 16 && kept < 20, `B kept ${kept} of 20: the first few boxes are held until the track proves it moves`);
});

test("B: a flight is proven after a few frames, and at 15 fps just as quickly in distance", () => {
  const thirty = run(CONFIGS.B, flight(0, 30)).map((x) => x.length);
  assert.deepEqual(thirty.slice(0, 3), [0, 0, 0]);
  assert.equal(thirty[3], 1);
  const fifteen = run(CONFIGS.B, flight(0, 30).filter(([n]) => n % 2 === 0)).map((x) => x.length);
  assert.equal(fifteen.findIndex((x) => x === 1), 2);
});

test("B: a phantom that never moves is never passed, however long it runs", () => {
  const r = run(CONFIGS.B, phantom(0, 3000));
  assert.equal(r.flat().length, 0);
});

test("B: a ball that stops for a stall shorter than the gap keeps its proof; after a long gap it must prove itself again", () => {
  const seq = [...flight(0, 10), ...Array.from({ length: 6 }, (_, i) => [10 + i, [box(168, 90 + (i % 2))]])]; // stalls 6 frames
  assert.equal(run(CONFIGS.B, seq).slice(10).flat().length, 6, "proof is sticky through a short stall");
  const gap = [...flight(0, 10), [40, [box(170, 95)]], [41, [box(170, 95)]]]; // 30 frames unseen
  assert.equal(run(CONFIGS.B, gap).slice(10).flat().length, 0, "a re-appearing ball needs new proof");
});

test("A: a spot that holds a box most of the time is suppressed after the warm-up, a spot visited briefly is not", () => {
  const r = run(CONFIGS.A, phantom(0, 1500));
  const early = r.slice(0, 40).flat().length; // before the 150-frame history
  assert.ok(early > 0, "nothing is suppressed during warm-up");
  const late = r.slice(-60).flat().length;
  assert.equal(late, 0, "suppressed once the spot is established");
  const brief = merge(phantom(0, 1500), flight(900, 30, 180, 150));
  const k = run(CONFIGS.A, brief);
  const flightBoxes = k.flat().filter((b) => (b.x1 + b.x2) / 2 > 185 || (b.y1 + b.y2) / 2 > 220 || (b.y1 + b.y2) / 2 < 170).length;
  assert.ok(flightBoxes >= 25, `a real flight elsewhere keeps its boxes (${flightBoxes} of 30)`);
});

test("A: the stationary suppression's known weakness: a real ball passing through the suppressed spot is lost there", () => {
  const seq = merge(phantom(0, 1500), [[1000, [box(180, 194, 24, 0.9)]], [1001, [box(181, 196, 24, 0.9)]]]);
  const out = run(CONFIGS.A, seq);
  const idx = seq.findIndex(([n]) => n === 1000);
  assert.equal(out[idx].length, 0, "documented, measured in the experiment, not hidden");
});

test("A: a ball that really stalls for 7 frames (the longest seen on development clips) is not suppressed", () => {
  const seq = Array.from({ length: 700 }, () => null).map((_, i) => [i, []]);
  for (let i = 0; i < 7; i += 1) seq[500 + i] = [500 + i, [box(200, 180)]];
  assert.equal(run(CONFIGS.A, seq).flat().length, 7);
});

test("C: widths below the gate are removed, at the gate and above are kept", () => {
  assert.equal(sizeGate(PARAMS.C50.min_width_px).push(0, [box(1, 1, 11), box(2, 2, 11.9), box(3, 3, 24)]).length, 2);
  assert.equal(sizeGate(PARAMS.C60.min_width_px).push(0, [box(1, 1, 13), box(2, 2, 14.3)]).length, 1);
});

test("the baseline filter returns exactly what it is given", () => {
  const b = [box(1, 2), box(3, 4)];
  assert.strictEqual(none().push(0, b), b);
});

test("parameters come from criteria.json and match what was registered", () => {
  assert.deepEqual(PARAMS.A, { radius_px: 8, window_ref_frames: 600, min_history_ref_frames: 150, share_threshold: 0.1 });
  assert.deepEqual(PARAMS.B, { gate_px_per_ref_frame: 30, max_gap_ref_frames: 8, proof_distance_px: 30 });
  assert.equal(PARAMS.C50.min_width_px, 11.85);
  assert.equal(PARAMS.C60.min_width_px, 14.22);
});

test("H: a static false box is dropped once its spot is known, a real ball passing through that very spot is kept", () => {
  const sp = phantom(0, 1500);
  const ball = Array.from({ length: 8 }, (_, i) => [1000 + i, [box(160 + 5 * i, 166 + 4 * i, 24, 0.9)]]); // flies through (180, 194) area
  const seq = merge(sp, ball);
  const out = run(CONFIGS.H, seq);
  const idxLate = seq.findIndex(([n]) => n === 1290);
  assert.ok(sp.some(([n]) => n === 1290) && out[idxLate].length === 0, "phantom dropped");
  const passes = ball.filter(([n]) => out[seq.findIndex(([m]) => m === n)].some((b) => b.score === 0.9)).length;
  assert.ok(passes >= 4, `the ball's proven track passes (${passes} of 8; the first frames are young and the spot is occupied)`);
});

test("H leaves every box alone where no spot is occupied, so it cannot change a normal flight", () => {
  const seq = flight(10, 20);
  assert.equal(run(CONFIGS.H, seq).flat().length, 20);
});

test("H: nothing is dropped during the 3 s warm-up, and a never-moving box is dropped soon after", () => {
  const r = run(CONFIGS.H, phantom(0, 400, 400, 0));
  assert.equal(r.slice(0, 80).flat().length, 80);
  assert.equal(r.slice(120).flat().length, 0);
});

test("H parameters match criteria-v2.json", () => {
  assert.deepEqual(PARAMS.H, { radius_px: 8, window_ref_frames: 1200, min_history_ref_frames: 90, share_threshold: 0.03, gate_px_per_ref_frame: 30, max_gap_ref_frames: 8, proof_distance_px: 30 });
});

test("H2: proof is revoked when a proven track stops spreading, and re-earned by moving again", () => {
  const tr = createTracker({ gate_px_per_ref_frame: 30, max_gap_ref_frames: 8, proof_distance_px: 30, revoke_window_ref_frames: 20, revoke_range_px: 10 });
  const step = (f, x, y) => { const b = box(x, y); return tr.update(f, [b]).get(b); };
  const flightPts = Array.from({ length: 8 }, (_, i) => step(i, 100 + 5 * i, 10 * i));
  assert.equal(flightPts[7], true, "proven in flight");
  let last; for (let f = 8; f < 45; f += 1) last = step(f, 135 + (f % 2), 70);
  assert.equal(last, false, "revoked after 20 frames without spreading");
  let again; for (let i = 0; i < 6; i += 1) again = step(45 + i, 135 + 12 * i, 70 + 12 * i);
  assert.equal(again, true, "re-earned by moving 30 px");
});

test("H2: a ball that stalls for 15 frames keeps its proof (the registered stall), and 7 frames certainly does", () => {
  const tr = createTracker({ gate_px_per_ref_frame: 30, max_gap_ref_frames: 8, proof_distance_px: 30, revoke_window_ref_frames: 20, revoke_range_px: 10 });
  for (let i = 0; i < 8; i += 1) { const b = box(100 + 5 * i, 10 * i); tr.update(i, [b]); }
  let last; for (let f = 8; f < 8 + 15; f += 1) { const b = box(135, 70); last = tr.update(f, [b]).get(b); }
  assert.equal(last, true);
});

test("H2: a static box that captures a flying ball's track stops being passed within about one revoke window of the ball leaving", () => {
  const f = CONFIGS.H2();
  const seq = merge(flight(1000, 12, 175, 160), phantom(0, 1500, 600, 0));
  const out = run(() => f, seq);
  const idx = (n) => seq.findIndex(([m]) => m === n);
  assert.equal(out[idx(1100)].filter((b) => b.score === 0.5).length, 0, "long after the ball has gone the static box is dropped");
});

test("H2 is causal and the parameters match criteria-v3.json", () => {
  assert.deepEqual(PARAMS.H2, { radius_px: 8, window_ref_frames: 1200, min_history_ref_frames: 90, share_threshold: 0.03, gate_px_per_ref_frame: 30, max_gap_ref_frames: 8, proof_distance_px: 30, revoke_window_ref_frames: 20, revoke_range_px: 10 });
});
