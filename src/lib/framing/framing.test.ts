import test from "node:test";
import assert from "node:assert/strict";
import { measureFraming } from "./measure.ts";
import type { FramingMeasurement, Pixels } from "./measure.ts";
import { compareFramingDescriptors, describeFraming } from "./descriptor.ts";

/** A clean drawn hoop: grey scenery with a little texture, a white board frame, an orange rim ring. */
function hoop(opts: { cx?: number; cy?: number; bw?: number; bh?: number; rimW?: number; withBoard?: boolean; withRim?: boolean } = {}): Pixels {
  const W = 960, H = 540;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { const v = 70 + ((x * 7 + y * 13) % 23); const i = (y * W + x) * 4; data[i] = v; data[i + 1] = v + 6; data[i + 2] = v; data[i + 3] = 255; }
  const cx = opts.cx ?? 480, cy = opts.cy ?? 300, bw = opts.bw ?? 170, bh = opts.bh ?? 96, rw = opts.rimW ?? 40;
  const set = (x: number, y: number, r: number, g: number, b: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; };
  if (opts.withBoard !== false) {
    const x0 = Math.round(cx - bw / 2), x1 = Math.round(cx + bw / 2), y1 = Math.round(cy + 12), y0 = y1 - bh;
    for (let t = 0; t < 5; t += 1) {
      for (let x = x0; x <= x1; x += 1) { set(x, y0 + t, 235, 235, 235); set(x, y1 - t, 235, 235, 235); }
      for (let y = y0; y <= y1; y += 1) { set(x0 + t, y, 235, 235, 235); set(x1 - t, y, 235, 235, 235); }
    }
  }
  if (opts.withRim !== false) {
    const rh = rw / 4;
    for (let a = 0; a < 720; a += 1) for (let t = 0; t < 3; t += 1) { const ang = (a / 720) * 2 * Math.PI; set(Math.round(cx + (rw / 2 - t * 0.5) * Math.cos(ang)), Math.round(cy + (rh / 2 - t * 0.4) * Math.sin(ang)), 225, 95, 35); }
  }
  return { data, width: W, height: H };
}

test("finds the rim and the board on a clean drawn hoop", () => {
  const m = measureFraming(hoop(), { x: 480 / 960, y: 300 / 540 });
  assert.ok(m.rim && m.board && m.q, m.issues.join("; "));
  assert.ok(Math.abs(m.rim.cx - 480) < 3 && Math.abs(m.rim.cy - 300) < 3);
  assert.ok(Math.abs(m.rim.w - 40) < 5);
  const [tl, tr, br, bl] = m.board.corners;
  assert.ok(Math.abs(tl.x - 395) < 6 && Math.abs(tr.x - 565) < 6, `corners ${JSON.stringify(m.board.corners)}`);
  assert.ok(Math.abs(bl.y - br.y) < 4 && Math.abs(tl.y - tr.y) < 4);
  assert.ok(m.q.az !== null && Math.abs(m.q.az - 170 / 40) < 0.5);
  assert.ok(m.q.off !== null && Math.abs(m.q.off) < 0.2);
  assert.ok(m.q.roll !== null && Math.abs(m.q.roll) < 1.5);
});

test("abstains, saying why, when there is no rim near the seed or no board behind it", () => {
  const none = measureFraming(hoop({ withRim: false }), { x: 0.5, y: 0.55 });
  assert.equal(none.q, null);
  assert.match(none.issues.join(" "), /no orange rim/);
  const noBoard = measureFraming(hoop({ withBoard: false }), { x: 480 / 960, y: 300 / 540 });
  assert.ok(noBoard.rim);
  assert.equal(noBoard.board, null);
  assert.equal(noBoard.q?.az, null);
  assert.equal(noBoard.q?.off, null);
  const far = measureFraming(hoop(), { x: 0.1, y: 0.1 });
  assert.equal(far.q, null);
});

test("a shifted and enlarged hoop measures a different position and size but the same angle cues", () => {
  const a = measureFraming(hoop(), { x: 480 / 960, y: 300 / 540 });
  const b = measureFraming(hoop({ cx: 560, cy: 280, bw: 255, bh: 144, rimW: 60 }), { x: 560 / 960, y: 280 / 540 });
  assert.ok(a.q && b.q && a.q.az !== null && b.q.az !== null && a.q.asp !== null && b.q.asp !== null);
  assert.ok(b.q.size > a.q.size * 1.3);
  assert.ok(Math.abs(b.q.az - a.q.az) / a.q.az < 0.15, `${a.q.az} vs ${b.q.az}`);
  assert.ok(Math.abs(b.q.asp - a.q.asp) / a.q.asp < 0.12);
});

const fake = (q: Partial<NonNullable<FramingMeasurement["q"]>>): FramingMeasurement => ({
  q: { posX: 0.55, posY: 0.42, size: 0.02, elev: 0.45, az: 3.7, off: -0.15, asp: 1.7, roll: -3, ...q }, rim: { cx: 1, cy: 1, w: 1, h: 1, n: 1 }, board: null,
  src: { width: 1920, height: 1080 }, factor: 1, issues: [], candidates: [], ms: 0,
});
const wobble = (n: number, f: (i: number) => Partial<NonNullable<FramingMeasurement["q"]>>) => Array.from({ length: n }, (_, i) => fake(f(i)));
const jitter = (i: number, a: number) => ((i % 5) - 2) * a;

test("a descriptor keeps only the quantities that repeated, and never the ones that did not", () => {
  const d = describeFraming(wobble(5, (i) => ({ az: 3.7 + jitter(i, 0.05), elev: 0.45 + jitter(i, 0.12), roll: -3 + jitter(i, 2) })));
  assert.ok(d.usable.includes("az") && d.usable.includes("size"));
  assert.ok(!d.usable.includes("elev"), "elevation spread is far above its gate");
  assert.ok(!d.usable.includes("roll"), "a roll that swings by two degrees between stills is not believed");
  const few = describeFraming(wobble(5, (i) => (i < 3 ? { az: null, off: null, asp: null } : {})));
  assert.ok(!few.usable.includes("az"), "valid in fewer than 4 of 5 stills");
  const wild = describeFraming(wobble(5, (i) => ({ az: 3.7 + jitter(i, 0.6) })));
  assert.ok(!wild.usable.includes("az"));
});

test("comparison: comparable, normalizable, not comparable and unknown", () => {
  const base = describeFraming(wobble(5, (i) => ({ az: 3.7 + jitter(i, 0.03), off: -0.15 + jitter(i, 0.01), asp: 1.7 + jitter(i, 0.01), size: 0.02 + jitter(i, 0.0004) })));
  const same = describeFraming(wobble(5, (i) => ({ az: 3.72 + jitter(i, 0.03), off: -0.15 + jitter(i, 0.01), asp: 1.7 + jitter(i, 0.01), size: 0.02 + jitter(i, 0.0004) })));
  assert.equal(compareFramingDescriptors(base, same).class, "comparable");
  const moved = describeFraming(wobble(5, (i) => ({ posX: 0.62, size: 0.03 + jitter(i, 0.0004), az: 3.7 + jitter(i, 0.03), off: -0.15 + jitter(i, 0.01), asp: 1.7 + jitter(i, 0.01) })));
  assert.equal(compareFramingDescriptors(base, moved).class, "normalizable");
  const turned = describeFraming(wobble(5, (i) => ({ az: 2.9 + jitter(i, 0.03), off: -0.5 + jitter(i, 0.01), asp: 1.3 + jitter(i, 0.01), size: 0.02 + jitter(i, 0.0004) })));
  assert.equal(compareFramingDescriptors(base, turned).class, "not_comparable");
  assert.equal(compareFramingDescriptors(base, null).class, "unknown");
  const noisy = describeFraming(wobble(5, (i) => ({ az: 3.7 + jitter(i, 0.7), off: -0.15 + jitter(i, 0.3), asp: 1.7 + jitter(i, 0.5) })));
  const r = compareFramingDescriptors(base, noisy);
  assert.equal(r.class, "unknown");
  assert.ok(r.reasons.length > 0);
  assert.deepEqual(r.unverified, ["elevation"], "roll repeated exactly in these fakes, so it is verified; elevation never is");
});

test("one angle cue beyond the limit is not enough to call the views different", () => {
  const base = describeFraming(wobble(5, (i) => ({ az: 3.7 + jitter(i, 0.03), off: -0.15 + jitter(i, 0.01), asp: 1.7 + jitter(i, 0.01) })));
  const oneOff = describeFraming(wobble(5, (i) => ({ az: 3.7 + jitter(i, 0.03), off: -0.45 + jitter(i, 0.01), asp: 1.7 + jitter(i, 0.01) })));
  const r = compareFramingDescriptors(base, oneOff);
  assert.equal(r.class, "unknown");
});

test("roll: verified when it repeats, a real tilt difference makes paths normalizable, an unreliable roll is reported unverified", () => {
  const mk = (roll: number, rj: number) => describeFraming(wobble(5, (i) => ({ roll: roll + jitter(i, rj), az: 3.7 + jitter(i, 0.03), off: -0.15 + jitter(i, 0.01), asp: 1.7 + jitter(i, 0.01), size: 0.02 + jitter(i, 0.0004) })));
  const flat = mk(-0.3, 0.1);
  const same = compareFramingDescriptors(flat, mk(-0.2, 0.1));
  assert.equal(same.class, "comparable");
  assert.ok(!same.unverified.includes("roll") && same.unverified.includes("elevation"));
  const tilted = compareFramingDescriptors(flat, mk(4, 0.1));
  assert.equal(tilted.class, "normalizable");
  const unsure = compareFramingDescriptors(flat, mk(-0.2, 2));
  assert.equal(unsure.class, "comparable");
  assert.ok(unsure.unverified.includes("roll"));
});
