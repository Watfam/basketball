import { test } from "node:test";
import assert from "node:assert/strict";
import { loadVision } from "../../lib/transpile.mjs";
import { loadRegistry, readJSON } from "../../lib/registry.mjs";
import { legacyCounter } from "./decide.mjs";

const key = (c) => JSON.stringify([c.n, c.first, c.last, c.firstMs, c.zoneSightings, c.counted, c.v1, c.v2, c.v3, c.v4, c.cross, c.crossCentre, c.flagged, c.flagReasons, c.belowSightingsV2, c.zoneWidth, c.belowWidth, c.belowMinDx, c.fall]);

test("T13: the decision replica fed legacy zone grouping reproduces the shipped createShotCounter exactly (three clips, both frame rates)", async () => {
  const V = await loadVision(), reg = loadRegistry();
  for (const id of ["IMG_4840", "IMG_4851", "IMG_4872"]) {
    const clip = reg.clips.find((c) => c.id === id), d = readJSON(clip.detections.ball6);
    const [rx, ry] = clip.window.rim_native;
    const rim = V.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim;
    const byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push(x);
    for (const thin of [1, 2]) {
      const shipped = V.shotRules.createShotCounter(rim), replica = legacyCounter(rim, V.shotRules), a = [], b = [];
      for (let f = 0; f < d.frames; f += 1) { if (thin > 1 && f % thin) continue; const t = (f * 1000) / V.shotRules.REFERENCE_FPS; a.push(...shipped.push(t, byF.get(f) ?? [])); b.push(...replica.push(t, byF.get(f) ?? [])); }
      a.push(...shipped.flush()); b.push(...replica.flush());
      assert.equal(b.length, a.length, `${id} x${thin}: ${b.length} vs ${a.length} candidates`);
      assert.deepEqual(b.map(key), a.map(key), `${id} x${thin}`);
    }
  }
});
