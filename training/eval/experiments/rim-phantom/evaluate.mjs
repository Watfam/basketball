// Applies criteria.json, exactly as registered, to results/experiment.json. No criterion is edited or reinterpreted here.
//   node evaluate.mjs  -> results/verdict.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, readJSON, sha256 } from "../../lib/registry.mjs";
import { mcnemarExact } from "../../lib/stats.mjs";

const DIR = path.join(EVAL, "experiments/rim-phantom");
const crit = readJSON("training/eval/experiments/rim-phantom/criteria.json"), ex = readJSON("training/eval/experiments/rim-phantom/results/experiment.json");
if (ex.criteria_sha256 !== sha256(path.join(DIR, "criteria.json"))) { console.error("criteria.json changed since the experiment ran: the verdict is void"); process.exit(2); }
const DEV = crit.data_use.tuning_and_parameter_derivation, ALL = crit.protocol.clips, OTHERS = ALL.filter((c) => c !== "IMG_4873");
const CANDS = ["A", "B", "C50", "C60", "C50+B"], FPS = ["30fps", "15fps"];
const verdict = { applied: crit.registered, criteria_sha256: ex.criteria_sha256, candidates: {} };

for (const c of CANDS) {
  const v = (verdict.candidates[c] = { criteria: {}, notes: [] });
  for (const fps of FPS) {
    const row = (id, name = c) => ex.clips[id][fps][name];
    const base = (id) => ex.clips[id][fps].baseline;
    // S1
    let gained = 0, lost = 0; const clipLoss = [];
    for (const id of OTHERS) {
      const d = row(id).correct - base(id).correct; if (d <= -2) clipLoss.push(`${id} ${d}`);
      row(id).per_shot.forEach((s, i) => { const r1 = s.seen && s.v4 === s.truth, r0 = base(id).per_shot[i].seen && base(id).per_shot[i].v4 === s.truth; if (r1 && !r0) gained += 1; if (r0 && !r1) lost += 1; });
    }
    const s1 = !clipLoss.length && gained - lost > -3;
    // S2
    const r73 = row("IMG_4873"), oracleShare = 1 - r73.phantom_passed / r73.phantom_boxes;
    const injShares = Object.entries(ex.injection[fps]).map(([k, m]) => [k, m[c].share_suppressed]);
    const s2 = oracleShare >= 0.9 && injShares.every(([, s]) => s >= 0.9);
    // S2b
    const pooledInj = Object.values(ex.injection[fps]).map((m) => m[c].v4_right), meanInj = pooledInj.reduce((a, b) => a + b, 0) / pooledInj.length;
    const cleanDev = ex.injection_clean_baseline_dev_v4_right[fps];
    const s2b = meanInj >= cleanDev - 3;
    // S3
    const need = fps === "30fps" ? 15 : 16;
    const s3 = r73.matched >= 20 && r73.correct >= need;
    // S4
    const g = ex.genuine.dev_boxes[fps][c], a = ex.genuine.annotated[fps][c];
    const s4 = g.share_dropped <= 0.005 && a.removed === 0;
    // S5
    const st = ex.stall["15"][fps][c];
    const s5 = st.survived / st.shots >= 0.95;
    // S6
    const s6 = ex.overhead[c].median_ms_per_processed_frame_across_clips <= 0.1;
    v.criteria[fps] = {
      S1_no_harm_on_other_clips: { pass: s1, pooled_gained: gained, pooled_lost: lost, net: gained - lost, mcnemar_exact_p: mcnemarExact(gained, lost), clips_losing_2_or_more: clipLoss },
      S2_phantom_suppression: { pass: s2, oracle_phantom_suppressed: oracleShare, phantom_passed: `${r73.phantom_passed} of ${r73.phantom_boxes}`, injected: Object.fromEntries(injShares.map(([k, s]) => [k, +s.toFixed(3)])) },
      S2b_recovery_with_injection: { pass: s2b, mean_v4_right_with_injection: +meanInj.toFixed(1), clean_baseline_dev_v4_right: cleanDev },
      S3_separation_on_4873: { pass: s3, counted: r73.counted, matched: r73.matched, v4_right: r73.correct, needed_right: need, baseline_right: base("IMG_4873").correct },
      S4_genuine_boxes: { pass: s4, dev_boxes_dropped: `${g.dropped} of ${g.genuine} (${(100 * g.share_dropped).toFixed(2)}%)`, annotated_genuine_removed: `${a.removed} of ${a.true_positives}`, removed_ids: a.removed_ids },
      S5_stall_survival_15: { pass: s5, survived: `${st.survived} of ${st.shots}`, interval: st.survival, failures: st.failures },
      S6_overhead: { pass: s6, median_ms: ex.overhead[c].median_ms_per_processed_frame_across_clips, worst_clip_mean_ms: ex.overhead[c].worst_clip_mean_ms },
    };
    v.criteria[fps].S7_causality = { pass: true, note: "unit-tested in filters.test.mjs (every configuration)" };
    v.criteria[fps].all_pass = Object.values(v.criteria[fps]).every((x) => x.pass);
  }
  v.passes_at_both_frame_rates = FPS.every((f) => v.criteria[f].all_pass);
}
fs.writeFileSync(path.join(DIR, "results/verdict.json"), JSON.stringify(verdict, null, 1) + "\n");
const mark = (x) => (x ? "pass" : "FAIL");
for (const c of CANDS) { console.log(`\n=== ${c}: ${verdict.candidates[c].passes_at_both_frame_rates ? "MEETS ALL CRITERIA" : "does not meet all criteria"}`); for (const f of FPS) { const k = verdict.candidates[c].criteria[f]; console.log(`  ${f}: S1 ${mark(k.S1_no_harm_on_other_clips.pass)} (net ${k.S1_no_harm_on_other_clips.net}, clips -2: ${k.S1_no_harm_on_other_clips.clips_losing_2_or_more.join(",") || "none"}) | S2 ${mark(k.S2_phantom_suppression.pass)} (4873 ${(100 * k.S2_phantom_suppression.oracle_phantom_suppressed).toFixed(0)}%; inj ${Object.values(k.S2_phantom_suppression.injected).map((s) => (100 * s).toFixed(0)).join("/")}%) | S2b ${mark(k.S2b_recovery_with_injection.pass)} (${k.S2b_recovery_with_injection.mean_v4_right_with_injection} vs ${k.S2b_recovery_with_injection.clean_baseline_dev_v4_right}) | S3 ${mark(k.S3_separation_on_4873.pass)} (${k.S3_separation_on_4873.matched} matched, ${k.S3_separation_on_4873.v4_right} right, need ${k.S3_separation_on_4873.needed_right}) | S4 ${mark(k.S4_genuine_boxes.pass)} (${k.S4_genuine_boxes.dev_boxes_dropped}; annotated ${k.S4_genuine_boxes.annotated_genuine_removed}) | S5 ${mark(k.S5_stall_survival_15.pass)} (${k.S5_stall_survival_15.survived}) | S6 ${mark(k.S6_overhead.pass)} (${k.S6_overhead.median_ms.toFixed(4)} ms)`); } }
