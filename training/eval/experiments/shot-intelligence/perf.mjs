// Performance and memory of the experimental pipeline on this desktop (not a phone).   node --expose-gc perf.mjs -> results/perf.json
import fs from "node:fs";
import path from "node:path";
import { EVAL } from "../../lib/registry.mjs";
import { vision, loadDetections, rimOf } from "./pipeline.mjs";
import { createTracker } from "../tracker/tracker.mjs";
import { createShotMachine } from "../tracker/shotmachine.mjs";
import { clipInfo, analyseClip } from "./shots.mjs";
import { generateInsights } from "./insights.mjs";
const V = await vision(), R = V.shotRules, out = { note: "desktop Mac (i5, 8 GB), one Node process; not phone numbers", memory: {}, per_shot_ms: {}, per_frame_ms: {} };
global.gc();
for (const id of ["IMG_4840", "IMG_4873"]) {
  const clip = clipInfo(id), det = loadDetections(clip), rim = rimOf(clip, V);
  global.gc(); const h0 = process.memoryUsage().heapUsed;
  const tr = createTracker({ associator: "cv_nearest" }), M = createShotMachine({ rim, scene: tr.scene, rules: R }); let peak = 0; const times = [];
  for (let f = 0; f < det.frames; f += 1) { const t0 = performance.now(); M.push(tr.push(f, det.byF.get(f) ?? [])); times.push(performance.now() - t0); if (f % 500 === 0) peak = Math.max(peak, process.memoryUsage().heapUsed - h0); }
  global.gc(); const h1 = process.memoryUsage().heapUsed - h0, s = times.sort((a, b) => a - b);
  out.memory[id] = { frames: det.frames, heap_growth_after_gc_MB: +(h1 / 1e6).toFixed(2), heap_peak_sampled_MB: +(peak / 1e6).toFixed(2), tracks_alive: tr.all().length, mode: "production-style: retainFrames 1500, views pruned" };
  out.per_frame_ms[id] = { median: +s[s.length >> 1].toFixed(4), p99: +s[Math.floor(s.length * 0.99)].toFixed(4), p999: +s[Math.floor(s.length * 0.999)].toFixed(3), max: +s[s.length - 1].toFixed(2) };
}
const t0 = performance.now(); const A = await analyseClip("IMG_4840"); const total = performance.now() - t0; out.per_shot_ms.pipeline_plus_trails_whole_clip = { ms: +total.toFixed(0), shots: A.shots.length, ms_per_shot: +(total / A.shots.length).toFixed(1) };
fs.writeFileSync(path.join(EVAL, "experiments/shot-intelligence/results/perf.json"), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
