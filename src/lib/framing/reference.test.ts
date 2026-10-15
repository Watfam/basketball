import test from "node:test";
import assert from "node:assert/strict";
import { checkAgainstReference, captureDescriptor, clearReference, loadReference, medianFrame, parseReference, saveReference, REFERENCE_KEY, type ReferenceRecord } from "./reference.ts";
import { describeFraming } from "./descriptor.ts";
import type { FramingMeasurement, Pixels } from "./measure.ts";

const fake = (q: Partial<NonNullable<FramingMeasurement["q"]>>): FramingMeasurement => ({
  q: { posX: 0.55, posY: 0.42, size: 0.02, elev: 0.45, az: 3.7, off: -0.15, asp: 1.7, roll: 0, ...q }, rim: { cx: 1, cy: 1, w: 1, h: 1, n: 1 }, board: null,
  src: { width: 1920, height: 1080 }, factor: 1, issues: [], candidates: [], ms: 0,
});
const j = (i: number, a: number) => ((i % 5) - 2) * a;
const desc = (q: Partial<NonNullable<FramingMeasurement["q"]>>) => describeFraming(Array.from({ length: 5 }, (_, i) => fake({ ...q, az: (q.az ?? 3.7) + j(i, 0.03), off: (q.off ?? -0.15) + j(i, 0.01), asp: (q.asp ?? 1.7) + j(i, 0.01), size: (q.size ?? 0.02) + j(i, 0.0004), roll: (q.roll ?? 0) + j(i, 0.1) })));
const ref = (q = {}): ReferenceRecord => ({ v: 1, createdAt: "2026-10-15T00:00:00Z", descriptor: desc(q), frame: { width: 1920, height: 1080 } });
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

test("the reference is a few hundred bytes of numbers; it round-trips and survives nothing but a valid record", () => {
  const s = mem(), r = ref();
  assert.ok(saveReference(r, s)); const raw = s.m.get(REFERENCE_KEY)!;
  assert.ok(raw.length < 2000, `${raw.length} bytes`); assert.ok(!/data:|blob:|image/i.test(raw));
  assert.deepEqual(loadReference(s), r);
  for (const bad of [null, "", "{", "[]", JSON.stringify({ v: 2 }), JSON.stringify({ ...r, descriptor: { ...r.descriptor, q: { az: { mean: "x", sd: 1, n: 1 } } } }), JSON.stringify({ ...r, frame: null }), "x".repeat(30_000)]) assert.equal(parseReference(bad), null);
  clearReference(s); assert.equal(loadReference(s), null);
  assert.equal(saveReference(r, { setItem() { throw new Error("quota"); } }), false, "a storage failure is a false, not a throw");
});

test("the check never blocks anything and says what it did not check", () => {
  const r = ref();
  const same = checkAgainstReference(r, desc({}));
  assert.equal(same.status, "same"); assert.ok(same.details.some((d) => /Camera height/.test(d)));
  assert.ok(same.details.some((d) => /Counting is not affected/.test(d)));
  const moved = checkAgainstReference(r, desc({ posX: 0.62, size: 0.03 }));
  assert.equal(moved.status, "shifted");
  const turned = checkAgainstReference(r, desc({ az: 2.9, off: -0.5, asp: 1.3 }));
  assert.equal(turned.status, "different_angle"); assert.ok(turned.details.some((d) => /Do not treat/.test(d)));
  assert.equal(checkAgainstReference(null, desc({})).status, "cant_tell");
  assert.equal(checkAgainstReference(r, null).status, "no_hoop");
  assert.equal(checkAgainstReference(r, describeFraming([fake({}), { ...fake({}), q: null, rim: null }, { ...fake({}), q: null, rim: null }])).status, "no_hoop");
  for (const c of [same, moved, turned]) assert.ok(!("blocksCounting" in c));
});

test("median of frames removes a passing object", () => {
  const mk = (v: number): Pixels => ({ data: new Uint8ClampedArray([v, v, v, 255, v, v, v, 255]), width: 2, height: 1 });
  const out = medianFrame([mk(10), mk(250), mk(12)]);
  assert.deepEqual([...out.data], [12, 12, 12, 255, 12, 12, 12, 255]);
});

test("capture takes the stills it was asked for, stops cleanly when frames are missing, and reports progress", async () => {
  let calls = 0; const prog: number[] = [];
  const img: Pixels = { data: new Uint8ClampedArray(64 * 36 * 4).fill(90), width: 64, height: 36 };
  const r = await captureDescriptor(() => { calls += 1; return img; }, { x: 0.5, y: 0.5 }, { stills: 3, perStill: 2, gapMs: 1, onProgress: (i) => prog.push(i) });
  assert.equal(calls, 6); assert.deepEqual(prog, [1, 2, 3]); assert.equal(r.stills.length, 3);
  assert.equal(r.descriptor.rimFound, 0, "a grey picture has no rim");
  const none = await captureDescriptor(() => null, { x: 0.5, y: 0.5 }, { stills: 2, perStill: 1, gapMs: 1 });
  assert.equal(none.stills.length, 0);
});
