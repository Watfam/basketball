// Post-hoc diagnosis (NOT a registered criterion): why do stalled-shot simulations fail in round 2? Classifies each failure by how far the call moved.
//   node diagnose-stall.mjs -> results/diagnose-stall.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { rng } from "../../lib/stats.mjs";
import { createTracker } from "./tracker.mjs";
import { createShotMachine } from "./shotmachine.mjs";
const RES = path.join(EVAL, "experiments/tracker/results");
const crit = readJSON("training/eval/experiments/tracker/criteria.json"), sel = readJSON("training/eval/experiments/tracker/results/selection.json"), r2 = readJSON("training/eval/experiments/tracker/results/shots-round2.json");
const reg = loadRegistry(), V = await loadVision(), R = V.shotRules, DEV = crit.data.development_tuning;
const stallCfg = readJSON("training/eval/experiments/rim-phantom/criteria.json").protocol.stall_simulation;
const rimOf = (clip) => { const [rx, ry] = clip.window.rim_native; return V.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim; };
const load = (clip) => { const d = readJSON(clip.detections.ball6), byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x }); return { frames: d.frames, byF }; };
function run(clip, total, byF, thin, assoc) {
  const rim = rimOf(clip), tr = createTracker({ associator: assoc, model: sel.selected.model, modelParams: sel.selected.params, interpW: sel.selected.interpolation_W, retainFrames: Infinity }), M = createShotMachine({ rim, scene: tr.scene, rules: R, keepAllViews: true }), calls = []; let last = 0;
  for (let f = 0; f < total; f += 1) { if (thin > 1 && f % thin) continue; calls.push(...M.push(tr.push(f, byF.get(f) ?? []))); last = f; }
  calls.push(...M.flush(last)); return calls.filter((c) => c.counted);
}
const out = {};
for (const S of stallCfg.S_frames) for (const [fpsKey, thin] of [["30fps", 1], ["15fps", 2]]) for (const assoc of ["kalman", "nearest_last"]) {
  const cls = { shots: 0, exact: 0, shifted_same_call: 0, shifted_other_call: 0, missing: 0 };
  for (const [ci, id] of DEV.entries()) {
    const clip = reg.clips.find((c) => c.id === id), rim = rimOf(clip), per = r2.clips[id]["30fps"].baseline_legacy.per_shot;
    const matched = per.filter((p) => p.seen && p.v4 === p.truth);
    for (let group = 0; group < 3; group += 1) {
      const chosen = matched.filter((_, i) => i % 3 === group), rnd = rng(stallCfg.seed_base + 100 * ci + 10 * S + group);
      const { frames, byF } = load(clip), insertAt = chosen.map((p) => p.first).sort((a, b) => a - b), shiftOf = (f) => insertAt.filter((x) => x <= f).length * S, shifted = new Map();
      for (const [f, boxes] of byF) shifted.set(f + shiftOf(f), boxes);
      for (const at of insertAt) {
        const anchor = (byF.get(at) ?? []).filter((b) => R.inZone(b, rim)).sort((a, b) => b.score - a.score)[0]; if (!anchor) continue;
        const base = shiftOf(at - 1);
        for (let k = 0; k < S; k += 1) shifted.set(at + base + k, [{ ...anchor, x1: anchor.x1 + (rnd() - 0.5) * 2, x2: anchor.x2 + (rnd() - 0.5) * 2, y1: anchor.y1 + (rnd() - 0.5) * 2, y2: anchor.y2 + (rnd() - 0.5) * 2 }]);
      }
      const counted = run(clip, frames + insertAt.length * S, shifted, thin, assoc);
      for (const p of chosen) {
        const expected = p.first + shiftOf(p.first - 1); cls.shots += 1;
        const near = counted.filter((c) => Math.abs(c.first - expected) <= 15 + S + 5).sort((a, b) => Math.abs(a.first - expected) - Math.abs(b.first - expected))[0];
        if (!near) cls.missing += 1; else if (Math.abs(near.first - expected) <= 15) { if (near.v4 === p.v4) cls.exact += 1; else cls.shifted_other_call += 1; } else if (near.v4 === p.v4) cls.shifted_same_call += 1; else cls.shifted_other_call += 1;
      }
    }
  }
  (out[S] ??= {})[`${fpsKey}|${assoc}`] = cls; console.log(S, fpsKey, assoc, JSON.stringify(cls));
}
fs.writeFileSync(path.join(RES, "diagnose-stall.json"), JSON.stringify(out, null, 1) + "\n");
