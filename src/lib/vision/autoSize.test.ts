import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createAutoSizer, type Box } from "./autoSize.ts";

const root = path.resolve(import.meta.dirname, "../../..");

test("on the training clips the sizer leaves the size alone", () => {
  for (const clip of ["4839", "4840"]) {
    const dets = (JSON.parse(fs.readFileSync(path.join(root, `training/fixtures/dets5-${clip}.json`), "utf8")) as {
      detections: (Box & { f: number })[];
    }).detections;
    const by = new Map<number, Box[]>();
    for (const d of dets) by.set(d.f, [...(by.get(d.f) ?? []), d]);
    const sizer = createAutoSizer();
    let result = null;
    for (let f = 0; f < 6000 && !result; f += 1) {
      const s = sizer.push(by.get(f) ?? [], { x: 192, y: 190 });
      if (s.kind !== "collecting") result = s;
    }
    assert.ok(result, `${clip}: never settled`);
    assert.equal(result.kind, "done", `${clip}: asked to rescale (${JSON.stringify(result)})`);
  }
});

test("a ball too big asks for a bigger window, and settles once it is right", () => {
  const sizer = createAutoSizer();
  const ball = (w: number): Box => ({ x1: 192 - w / 2, x2: 192 + w / 2, y1: 70 - w / 2, y2: 70 + w / 2 });
  let s = sizer.push([], { x: 192, y: 190 });
  for (let i = 0; i < 30; i += 1) s = sizer.push([ball(28)], { x: 192, y: 190 });
  assert.equal(s.kind, "rescale");
  assert.ok(s.kind === "rescale" && Math.abs(s.factor - 28 / 23.7) < 1e-9);
  for (let i = 0; i < 30; i += 1) s = sizer.push([ball(23.5)], { x: 192, y: 190 });
  assert.equal(s.kind, "done");
});

test("balls away from the air above the rim are not used", () => {
  const sizer = createAutoSizer();
  let s = sizer.push([], { x: 192, y: 190 });
  for (let i = 0; i < 30; i += 1) {
    // At the rim (partly hidden), below the net, and far to the side.
    s = sizer.push(
      [
        { x1: 180, x2: 200, y1: 180, y2: 200 },
        { x1: 180, x2: 210, y1: 260, y2: 290 },
        { x1: 20, x2: 50, y1: 60, y2: 90 },
      ],
      { x: 192, y: 190 }
    );
  }
  assert.equal(s.kind, "collecting");
});
