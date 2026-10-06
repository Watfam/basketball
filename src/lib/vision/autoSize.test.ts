import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createAutoSizer, type Box, type SizerState } from "./autoSize.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const FPS = 30000 / 1001;
const RIM = { x: 192, y: 190 };
type Det = Box & { f: number };

/** Frames to the sizer until it decides; `step` 2 is the lab's quick first pass over a clip. */
function firstDecision(dets: Det[], frames: number, step = 1): SizerState | null {
  const by = new Map<number, Box[]>();
  for (const d of dets) by.set(d.f, [...(by.get(d.f) ?? []), d]);
  const sizer = createAutoSizer();
  for (let f = 0; f < frames; f += step) {
    const s = sizer.push((f * 1000) / FPS, by.get(f) ?? [], RIM);
    if (s.kind !== "collecting") return s;
  }
  return null;
}

test("on the training clips the sizer leaves the size alone", () => {
  for (const clip of ["4839", "4840"]) {
    const d = JSON.parse(fs.readFileSync(path.join(root, `training/fixtures/dets5-${clip}.json`), "utf8")) as {
      frames: number;
      detections: Det[];
    };
    for (const step of [1, 2]) {
      const s = firstDecision(d.detections, d.frames, step);
      assert.ok(s, `${clip}: never settled`);
      assert.equal(s.kind, "done", `${clip} step ${step}: asked to rescale (${JSON.stringify(s)})`);
    }
  }
});

test("Matt's side-on angle at x1.0 asks for about x1.2-1.3 within its twelve shots", () => {
  const d = JSON.parse(fs.readFileSync(path.join(root, "training/fixtures/dets5-4851-x1.json"), "utf8")) as {
    clips: { frames: number; detections: Det[] }[];
  };
  // The five clips back to back, as one session.
  const dets: Det[] = [];
  let offset = 0;
  for (const c of d.clips) {
    for (const b of c.detections) dets.push({ ...b, f: b.f + offset });
    offset += c.frames + 5;
  }
  for (const step of [1, 2]) {
    const s = firstDecision(dets, offset, step);
    assert.ok(s && s.kind === "rescale", `step ${step}: ${JSON.stringify(s)}`);
    assert.ok(s.factor > 1.15 && s.factor < 1.4, `step ${step}: factor ${s.factor}`);
  }
});

/** A ball flying across the window: `n` frames, moving 15 px a frame. */
const flight = (w: number, n = 6): Box[] =>
  Array.from({ length: n }, (_, i) => {
    const cx = 120 + i * 15;
    const cy = 90;
    return { x1: cx - w / 2, x2: cx + w / 2, y1: cy - w / 2, y2: cy + w / 2 };
  });

function fly(sizer: ReturnType<typeof createAutoSizer>, t0: number, w: number): { s: SizerState; t: number } {
  let s: SizerState = { kind: "collecting", have: 0, need: 0 };
  let t = t0;
  for (const b of flight(w)) {
    s = sizer.push(t, [b], RIM);
    t += 33;
  }
  // A quiet second between shots.
  s = sizer.push(t + 1000, [], RIM);
  return { s, t: t + 1000 };
}

test("a ball too big asks for a bigger window, and settles once it is right", () => {
  const sizer = createAutoSizer();
  let t = 0;
  let s: SizerState = { kind: "collecting", have: 0, need: 0 };
  for (let i = 0; i < 5; i += 1) ({ s, t } = fly(sizer, t, 28));
  assert.equal(s.kind, "rescale");
  assert.ok(s.kind === "rescale" && Math.abs(s.factor - 28 / 23.7) < 1e-9);
  for (let i = 0; i < 5; i += 1) ({ s, t } = fly(sizer, t, 23.5));
  assert.equal(s.kind, "done");
});

test("a still mark, a cut-off ball, and balls far from the rim are not used", () => {
  const sizer = createAutoSizer();
  let s: SizerState = { kind: "collecting", have: 0, need: 0 };
  for (let i = 0; i < 300; i += 1) {
    s = sizer.push(
      i * 33,
      [
        // A still mark on the wall above the rim.
        { x1: 350, x2: 366, y1: 140, y2: 156 },
        // A ball cut off by the window's top edge.
        { x1: 180, x2: 210, y1: 0, y2: 12 + (i % 5) },
        // Below the net, moving.
        { x1: 180 + (i % 10) * 5, x2: 210 + (i % 10) * 5, y1: 260, y2: 290 },
      ],
      RIM
    );
  }
  assert.deepEqual(s, { kind: "collecting", have: 0, need: 5 });
});
