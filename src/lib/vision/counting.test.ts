import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createCountingCore } from "./counting.ts";
import { REFERENCE_FPS, createShotCounter, type Box, type ShotCall } from "./shotRules.ts";
import { TRAINED_RIM } from "./roi.ts";

type Det = Box & { f: number };
const root = path.resolve(import.meta.dirname, "../../..");
const load = (name: string) => JSON.parse(fs.readFileSync(path.join(root, "training/fixtures", name), "utf8"));

// The exam clips: a 1920x1080 frame, window at (866, 260), rim at (192, 190) inside it.
const EXAM = { frameW: 1920, frameH: 1080, rim: { x: (866 + TRAINED_RIM.x) / 1920, y: (260 + TRAINED_RIM.y) / 1080 } };

function byFrame(dets: Det[]) {
  const m = new Map<number, Box[]>();
  for (const d of dets) m.set(d.f, [...(m.get(d.f) ?? []), d]);
  return m;
}

test("on the training clips the core counts exactly what the rule counts", () => {
  for (const clip of ["4839", "4840"]) {
    const d = load(`dets5-${clip}.json`) as { frames: number; detections: Det[] };
    const frames = byFrame(d.detections);
    const core = createCountingCore({ ...EXAM, scale: 1, autoSize: true });
    assert.deepEqual(core.window.rim, { x: TRAINED_RIM.x, y: TRAINED_RIM.y });
    const reference = createShotCounter(TRAINED_RIM);
    const got: ShotCall[] = [];
    const want: ShotCall[] = [];
    let changed = false;
    for (let f = 0; f < d.frames; f += 1) {
      const t = (f * 1000) / REFERENCE_FPS;
      const r = core.push(t, frames.get(f) ?? []);
      got.push(...r.calls);
      changed ||= r.windowChanged;
      want.push(...reference.push(t, frames.get(f) ?? []));
    }
    got.push(...core.flush());
    want.push(...reference.flush());
    assert.equal(changed, false, `${clip}: the size changed`);
    assert.equal(core.sizing.kind, "set", `${clip}: ${JSON.stringify(core.sizing)}`);
    assert.deepEqual(
      got.filter((c) => c.counted).map((c) => c.v2),
      want.filter((c) => c.counted).map((c) => c.v2),
      clip
    );
  }
});

test("a side-on hoop at the wrong size gets a bigger window between shots", () => {
  const d = load("dets5-4851-x1.json") as { clips: { frames: number; detections: Det[] }[] };
  const core = createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: 950 / 1920, y: 413 / 1080 }, scale: 1, autoSize: true });
  let t = 0;
  let changedAt: number | null = null;
  for (const c of d.clips) {
    const frames = byFrame(c.detections);
    for (let f = 0; f < c.frames && changedAt === null; f += 1) {
      if (core.push(t, frames.get(f) ?? []).windowChanged) changedAt = t;
      t += 1000 / REFERENCE_FPS;
    }
    t += 200;
  }
  assert.ok(changedAt !== null, "the window never changed");
  assert.ok(core.scale > 1.15 && core.scale < 1.4, `scale ${core.scale}`);
  // The window grew, so it is cut bigger from the camera picture.
  assert.ok(core.window.crop.sw > 416 * 1.15);
});

test("the exam setting keeps the size fixed", () => {
  const core = createCountingCore({ ...EXAM, scale: 1, autoSize: false });
  assert.deepEqual(core.sizing, { kind: "fixed", scale: 1 });
});
