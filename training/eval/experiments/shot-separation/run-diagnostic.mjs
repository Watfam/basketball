// Runs the diagnostic for the controls (and the candidate if asked) at both frame rates.   node run-diagnostic.mjs controls|all  -> results/diagnostic-<which>.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { buildReference, classify, withOutcomes, PHANTOM_ADJUDICATED } from "./diagnose.mjs";
import { run } from "./run-pipelines.mjs";
const which = process.argv[2] ?? "controls", RES = path.join(EVAL, "experiments/shot-separation/results"), reg = loadRegistry();
const CLIPS = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867", "IMG_4872", "IMG_4873", "IMG_4874"];
const ACC = readJSON("training/eval/experiments/shot-intelligence/results/accuracy.json");
const names = which === "controls" ? ["baseline_legacy", "tracks_kalman_round2", "tracks"] : ["baseline_legacy", "tracks_kalman_round2", "tracks", "candidate_arrival"];
const out = { generated: new Date().toISOString(), reference: {}, per_clip: {}, pooled: {}, ambiguous_clips: [] };
const annotations = readJSON("training/eval/annotate/annotations.json"), ph = {}; for (const e of annotations.events ?? []) if (e.type === "no_shot") (ph[e.clip] ??= []).push(e.frame);
for (const id of CLIPS) {
  const c30 = ACC.clips[id]["30fps"], sources = { B: c30.baseline_legacy.firsts, K: c30.tracks_kalman_round2.firsts, C: c30.tracks.firsts }, truth = readJSON(reg.clips.find((c) => c.id === id).truth.file).results;
  const refRaw = buildReference(sources, PHANTOM_ADJUDICATED[id] ?? []);
  const b = await run(id, 1, "baseline_legacy"), bKept = b.counted.filter((x) => !(ph[id] ?? []).some((f) => Math.abs(x.first - f) <= 3)).map((x) => ({ ...x, v2: x.v2 }));
  const { refs, ambiguous } = withOutcomes(refRaw, truth, bKept);
  out.reference[id] = { count: refs.length, written: truth.length, ambiguous, times: refs.map((r) => r.t) }; if (ambiguous) out.ambiguous_clips.push(id);
  for (const name of names) for (const thin of [1, 2]) {
    const r = await run(id, thin, name), preds = r.counted.filter((x) => !(ph[id] ?? []).some((f) => Math.abs(x.first - f) <= 3)), res = classify(preds, refs), fk = thin === 1 ? "30fps" : "15fps";
    ((out.per_clip[id] ??= {})[fk] ??= {})[name] = res;
  }
  console.log(id, "reference", refs.length, "written", truth.length, ambiguous ? "AMBIGUOUS" : "", names.map((n) => `${n}: m${out.per_clip[id]["30fps"][n].merged_predictions} s${out.per_clip[id]["30fps"][n].split_references} miss${out.per_clip[id]["30fps"][n].missing} x${out.per_clip[id]["30fps"][n].extra} ok${out.per_clip[id]["30fps"][n].outcome_correct}/${out.per_clip[id]["30fps"][n].matched}`).join(" | "));
}
for (const fk of ["30fps", "15fps"]) for (const name of names) { const tot = { predictions: 0, references: 0, matched: 0, boundary_correct: 0, merged_predictions: 0, merged_references: 0, split_references: 0, missing: 0, extra: 0, outcome_correct: 0, outcome_incorrect: 0, outcome_correct_unambiguous: 0, matched_unambiguous: 0 }; for (const id of CLIPS) { const r = out.per_clip[id][fk][name]; for (const k of Object.keys(tot)) if (k in r) tot[k] += r[k]; if (!out.reference[id].ambiguous) { tot.outcome_correct_unambiguous += r.outcome_correct; tot.matched_unambiguous += r.matched; } } (out.pooled[fk] ??= {})[name] = tot; }
fs.writeFileSync(path.join(RES, `diagnostic-${which}.json`), JSON.stringify(out, null, 1));
for (const fk of ["30fps", "15fps"]) for (const name of names) console.log(fk, name.padEnd(22), JSON.stringify(out.pooled[fk][name]));
