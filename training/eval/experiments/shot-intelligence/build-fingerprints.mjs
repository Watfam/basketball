// Builds fingerprints for every counted shot of every clip at 30 and 15 fps. Labels are stored in a SEPARATE file and read by no generator code.
//   node build-fingerprints.mjs -> results/fingerprints.json (measurements) and results/labels.json (outcomes, V4 call)
import fs from "node:fs";
import path from "node:path";
import { EVAL } from "../../lib/registry.mjs";
import { analyseClip, CLIPS } from "./shots.mjs";
import { fingerprint } from "./fingerprint.mjs";
const RES = path.join(EVAL, "experiments/shot-intelligence/results");
export async function buildAll({ shuffleLabels = false } = {}) {
  const prints = {}, labels = {}, perf = { ms: [] };
  for (const thin of [1, 2]) {
    const fk = thin === 1 ? "30fps" : "15fps";
    for (const id of CLIPS) {
      const A = await analyseClip(id, { thin });
      for (const s of A.shots) {
        const obs = s.trail.segments.flatMap((g) => g.points).filter((p) => p.type === "observed").sort((a, b) => a.f - b.f);
        const t0 = performance.now(), fp = fingerprint({ id: s.id, clip: id, first: s.first, thin, rim: A.rim, points: obs, segments: s.trail.segments.length, events: s.trail.events }); perf.ms.push(performance.now() - t0);
        ((prints[fk] ??= {})[id] ??= []).push(fp);
        ((labels[fk] ??= {})[id] ??= []).push({ id: s.id, written_outcome: s.label.written_outcome, v4_call: s.call.v4, pairing: s.label.pairing });
      }
    }
  }
  return { prints, labels, perf };
}
if (process.argv[1].endsWith("build-fingerprints.mjs")) {
  const { prints, labels, perf } = await buildAll();
  fs.writeFileSync(path.join(RES, "fingerprints.json"), JSON.stringify({ schema: "shot-fingerprint/1", prints }));
  fs.writeFileSync(path.join(RES, "labels.json"), JSON.stringify(labels));
  const sorted = perf.ms.sort((a, b) => a - b); console.log("shots", sorted.length, "fingerprint ms median", sorted[sorted.length >> 1].toFixed(3), "p99", sorted[Math.floor(sorted.length * 0.99)].toFixed(3));
  for (const fk of Object.keys(prints)) for (const id of Object.keys(prints[fk])) { const l = prints[fk][id], av = (k) => l.filter((p) => p.measurements[k].value !== null).length; console.log(fk, id, "n", l.length, "rim_x", av("rim_level_x_bw"), "dir", av("approach_direction_deg"), "speed", av("descent_speed_bw_per_frame"), "rms", av("path_fit_rms_bw"), "rimint", av("rim_interaction_observed"), "usable", l.filter((p) => p.quality.usable_for_comparison).length); }
}
