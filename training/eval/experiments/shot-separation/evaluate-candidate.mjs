// Applies criteria.json P1-P4 (and the D1 part of P5) mechanically to results/diagnostic-all.json. P5's D2/D5/D7 and P6 are not computed: the decision rule is conjunctive and P1 already fails.
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { align } from "../../lib/shots.mjs";
import { run } from "./run-pipelines.mjs";
const RES = path.join(EVAL, "experiments/shot-separation/results"), D = readJSON("training/eval/experiments/shot-separation/results/diagnostic-all.json"), reg = loadRegistry();
const CLIPS = Object.keys(D.per_clip), FPS = ["30fps", "15fps"], rows = [];
const add = (fps, id, pass, detail) => rows.push({ fps, id, status: pass ? "pass" : "FAIL", detail });
const sum = (fk, name, key) => CLIPS.reduce((a, id) => a + D.per_clip[id][fk][name][key], 0);
const annotations = readJSON("training/eval/annotate/annotations.json"), ph = {}; for (const e of annotations.events ?? []) if (e.type === "no_shot") (ph[e.clip] ??= []).push(e.frame);
for (const fk of FPS) {
  const thin = fk === "30fps" ? 1 : 2;
  add(fk, "P1", D.per_clip.IMG_4872[fk].candidate_arrival.merged_predictions === 0 && sum(fk, "candidate_arrival", "merged_predictions") < sum(fk, "tracks", "merged_predictions"), `IMG_4872 merged predictions ${D.per_clip.IMG_4872[fk].candidate_arrival.merged_predictions}; total ${sum(fk, "candidate_arrival", "merged_predictions")} against control ${sum(fk, "tracks", "merged_predictions")}`);
  add(fk, "P2", sum(fk, "candidate_arrival", "split_references") <= sum(fk, "tracks", "split_references"), `splits ${sum(fk, "candidate_arrival", "split_references")} against ${sum(fk, "tracks", "split_references")}`);
  add(fk, "P3", sum(fk, "candidate_arrival", "extra") <= sum(fk, "tracks", "extra"), `extras ${sum(fk, "candidate_arrival", "extra")} against ${sum(fk, "tracks", "extra")}`);
  const unamb = CLIPS.filter((id) => !D.reference[id].ambiguous), pooled = (n) => unamb.reduce((a, id) => a + D.per_clip[id][fk][n].outcome_correct, 0);
  const others = CLIPS.filter((id) => id !== "IMG_4873"), loss = others.filter((id) => D.per_clip[id][fk].candidate_arrival.outcome_correct - D.per_clip[id][fk].baseline_legacy.outcome_correct <= -2 && !D.reference[id].ambiguous);
  add(fk, "P4", pooled("candidate_arrival") >= pooled("tracks") && loss.length === 0, `pooled outcome-correct ${pooled("candidate_arrival")} against control ${pooled("tracks")}; clips losing 2+ vs baseline: ${loss.join(", ") || "none"}`);
  // P5 D1 (historical scorer)
  let pt = 0, pb = 0; const lose = [];
  for (const id of others) { const truth = readJSON(reg.clips.find((c) => c.id === id).truth.file).results, sc = async (name) => { const r = await run(id, thin, name), kept = r.counted.filter((x) => !(ph[id] ?? []).some((f) => Math.abs(x.first - f) <= 3)), a = align(kept.map((k) => ({ ...k, v2: k.v2 })), truth); return a.pairs.filter((p) => p.s.v4 === p.t).length; }; const c = await sc("candidate_arrival"), b = await sc("baseline_legacy"); pt += c; pb += b; if (c - b <= -2) lose.push(`${id} ${c - b}`); }
  add(fk, "P5_D1", lose.length === 0 && pt - pb > -3, `frozen scorer, seven clips: pooled ${pt - pb >= 0 ? "+" : ""}${pt - pb}; at -2 or worse: ${lose.join(", ") || "none"}`);
}
const failed = rows.filter((r) => r.status === "FAIL");
const out = { generated: new Date().toISOString(), rows, not_computed: "P5 D2/D5/D7 and P6: the decision rule is conjunctive and P1 already fails", verdict: failed.length ? "NOT RECOMMENDED" : "all computed criteria hold (P5 D2/D5/D7 and P6 still to run)", failed: failed.map((r) => `${r.id}@${r.fps}`) };
fs.writeFileSync(path.join(RES, "verdict-candidate.json"), JSON.stringify(out, null, 1));
for (const r of rows) console.log(`${r.fps} ${r.id.padEnd(5)} ${r.status.padEnd(4)} ${r.detail}`); console.log("VERDICT:", out.verdict, "| failed:", out.failed.join(" "));
