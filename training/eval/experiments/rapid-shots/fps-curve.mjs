// How does the shipped counter degrade as the analysis rate drops?  thin 1..5 => 30, 15, 10, 7.5, 6 analysed fps on the saved ball-6 detections.
// Frozen scorer (scoreClip) AND the time-based diagnostic (classify). Detections are the offline ones, so this isolates SAMPLING RATE only.
import fs from "node:fs";
import { CLIPS, loadClip } from "./lib.mjs";
import { countClip, scoreClip, pool } from "../../lib/shots.mjs";
import { readJSON } from "../../lib/registry.mjs";
import { classify, withOutcomes } from "../shot-separation/diagnose.mjs";
const ref = readJSON("training/eval/experiments/shot-separation/results/diagnostic-all.json").reference;
const annotations = readJSON("training/eval/annotate/annotations.json"), ph = {};
for (const e of annotations.events ?? []) if (e.type === "no_shot") (ph[e.clip] ??= []).push(e.frame);
const out = { generated: new Date().toISOString(), note: "offline detections thinned to every nth frame; sampling-rate effect only, NOT phone throughput", per_thin: {} };
for (const thin of [1, 2, 3, 4, 5]) {
  const rows = [], tot = { predictions: 0, references: 0, matched: 0, merged_predictions: 0, split_references: 0, missing: 0, extra: 0, outcome_correct: 0, outcome_incorrect: 0 }, per = {};
  for (const id of CLIPS) {
    const c = await loadClip(id, 1), clip = c.clip, d = clip.detections.ball6;
    const sc = scoreClip(c.vision, clip, d, { thin, phantomFrames: ph[id] ?? [] });
    rows.push(sc);
    const truth = readJSON(clip.truth.file).results;
    const base = countClip(c.vision, clip, d, { thin: 1 }).calls.filter((x) => !(ph[id] ?? []).some((f) => Math.abs(x.first - f) <= 3));
    const { refs } = withOutcomes(ref[id].times.map((t) => ({ t })), truth, base);
    const preds = countClip(c.vision, clip, d, { thin }).calls.filter((x) => !(ph[id] ?? []).some((f) => Math.abs(x.first - f) <= 3));
    const r = classify(preds, refs);
    per[id] = { counted: preds.length, written: truth.length, matched: r.matched, merged: r.merged_predictions, split: r.split_references, missing: r.missing, extra: r.extra, outcome_correct: r.outcome_correct, v4_correct_frozen: sc.correct.v4, frozen_matched: sc.matched };
    for (const k of Object.keys(tot)) tot[k] += r[k];
  }
  const p = pool(rows);
  out.per_thin[thin] = { analysed_fps: 30 / thin, frozen: { matched: p.matched, written: p.written, v4_correct: p.correct.v4, v4_of_written: +(p.correct.v4 / p.written).toFixed(4) }, diagnostic: tot, per_clip: per };
  console.log(`thin ${thin} (${(30 / thin).toFixed(1)} fps) frozen v4 ${p.correct.v4}/${p.matched} (of written ${p.written}) | diag matched ${tot.matched}/${tot.references} merged ${tot.merged_predictions} split ${tot.split_references} missing ${tot.missing} extra ${tot.extra} outcome ${tot.outcome_correct}/${tot.matched}`);
}
fs.mkdirSync("results", { recursive: true });
fs.writeFileSync("results/fps-curve.json", JSON.stringify(out, null, 1));
