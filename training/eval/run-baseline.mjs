// The regression report: everything the evaluation can measure, with what cannot be measured marked UNAVAILABLE.
//   node training/eval/run-baseline.mjs [--id <name>] [--allow-stale-lock]
// Writes training/eval/reports/<id>.json and <id>.md. Refuses to run if the datasets, thresholds, truth lists, detections,
// annotations or model differ from datasets.lock.json (run lock.mjs deliberately after reviewing a change).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { ROOT, EVAL, loadRegistry, readJSON, sha256, verifyLock } from "./lib/registry.mjs";
import { loadVision } from "./lib/transpile.mjs";
import { scoreClip, pool, RULES } from "./lib/shots.mjs";
import { buildRuns, evaluateInterpolation, evaluatePrediction, evaluateAssociation, summarizeCells, coverage } from "./lib/gapeval.mjs";
import { summarizeDetection, repeatability } from "./lib/detect.mjs";
import { describe, bootstrapCI, wilson } from "./lib/stats.mjs";
import { renderReport } from "./lib/render.mjs";

const args = process.argv.slice(2);
const argv = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const reg = loadRegistry();
const thr = readJSON("training/eval/thresholds.json");
const id = argv("--id", "baseline-v0");
const unavailable = [];
const na = (metric, reason) => { unavailable.push({ metric, reason }); return { unavailable: reason }; };

const problems = verifyLock(reg);
if (problems.length && !args.includes("--allow-stale-lock")) {
  console.error("The evaluation set differs from the lock:\n" + problems.join("\n") + "\nReview, then run: node training/eval/lock.mjs");
  process.exit(2);
}

const git = (c) => { try { return execSync(c, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; } };
const hookSrc = fs.readFileSync(path.join(ROOT, "src/lib/vision/lab-calls.ts"), "utf8");
const vision = await loadVision();
const clips = reg.clips;

// ---------------------------------------------------------------- 1. shot classification
// Candidates the annotation identified as not being shots are removed before pairing with Matt's lists.
const annPath = path.join(EVAL, "annotate/annotations.json");
const phantomsByClip = {};
if (fs.existsSync(annPath)) for (const e of JSON.parse(fs.readFileSync(annPath, "utf8")).events ?? []) if (e.type === "no_shot") (phantomsByClip[e.clip] ??= []).push(e.frame);
function shotSection(model, fileKey, thin) {
  const rows = [];
  const skipped = [];
  for (const c of clips.filter((x) => x.truth)) {
    const f = c.detections?.[fileKey];
    if (!c.scorable.ok || !f || !fs.existsSync(path.join(ROOT, f))) { skipped.push({ clip: c.id, reason: !c.scorable.ok ? c.scorable.reason : `no ${fileKey} detections file` }); continue; }
    rows.push(scoreClip(vision, c, f, { thin, phantomFrames: phantomsByClip[c.id] ?? [] }));
  }
  const byRole = {};
  for (const role of ["dev", "validation", "diagnostic_regression"]) { const r = rows.filter((x) => x.role === role); if (r.length) byRole[role] = pool(r); }
  const clipBoot = rows.length >= 3 ? Object.fromEntries(["v4"].map((r) => [r, bootstrapCI(rows.map((x) => x.correct[r] / x.written), (s) => s.reduce((a, b) => a + b, 0) / s.length, { seed: thr.seeds.bootstrap })])) : null;
  return { model, fps_mode: thin === 1 ? "30 fps (every frame)" : "15 fps (every 2nd frame, as the live loop)", window: "pinned (registry window), not the live auto-sizer", clips: rows, skipped, by_role: byRole, pooled_all: rows.length ? pool(rows) : null, pooled_note: "pooled over shots; clips are the real unit of variation, see clip_level_mean_accuracy_v4_ci95", clip_level_mean_accuracy_v4_ci95: clipBoot?.v4 ?? null };
}
const shot = {
  current_ball6_30fps: shotSection("ball-6", "ball6", 1),
  current_ball6_15fps: shotSection("ball-6", "ball6", 2),
  previous_ball5_30fps_reference: shotSection("ball-5", "ball5", 1),
  alignment_caveat: "Matt's lists have no shot times, so shots are paired by order, or by an alignment that rewards V2 agreement when counts differ. That flatters the rule and can move one shot either way (IMG_4874 V4: 18 of 20 here, 17 of 20 in the README, which paired by time against ball-5). Time-anchored shot truth exists only where annotated (see events).",
};

// ---------------------------------------------------------------- 2. tracking: coverage, interpolation, prediction, association
const dets6 = Object.fromEntries(clips.filter((c) => c.detections?.ball6 && fs.existsSync(path.join(ROOT, c.detections.ball6))).map((c) => [c.id, readJSON(c.detections.ball6)]));
const roleOf = Object.fromEntries(clips.map((c) => [c.id, c.role]));
const tracking = { source: "ball-6 detections (score >= 0.25), pinned windows", clips_used: Object.keys(dets6), coverage: {}, interpolation: {}, prediction: {}, association: {} };
if (Object.keys(dets6).length) {
  for (const [cid, d] of Object.entries(dets6)) tracking.coverage[cid] = { role: roleOf[cid], detector_in_sample: clips.find((c) => c.id === cid).ball6_training.used, ...coverage(d.detections, { frames: d.frames }) };
  for (const step of [1, 2]) {
    const key = step === 1 ? "30fps" : "15fps";
    const groups = { all: Object.keys(dets6) };
    for (const role of ["dev", "validation", "diagnostic_regression"]) groups[role] = Object.keys(dets6).filter((c) => roleOf[c] === role);
    tracking.interpolation[key] = {}; tracking.prediction[key] = {};
    for (const [g, ids] of Object.entries(groups)) {
      if (!ids.length) continue;
      const runsByClip = Object.fromEntries(ids.map((c) => [c, buildRuns(dets6[c].detections, { step })]));
      tracking.interpolation[key][g] = summarizeCells(evaluateInterpolation(runsByClip, { step }), { minN: thr.min_samples_per_cell, minFlights: thr.min_independent_flights_per_cell, seed: thr.seeds.bootstrap });
      tracking.prediction[key][g] = summarizeCells(evaluatePrediction(runsByClip), { minN: thr.min_samples_per_cell, minFlights: thr.min_independent_flights_per_cell, seed: thr.seeds.bootstrap });
    }
    const allRuns = Object.fromEntries(Object.keys(dets6).map((c) => [c, buildRuns(dets6[c].detections, { step })]));
    tracking.association[key] = { kind: "SYNTHETIC distractors (static blob, second ball, slow mover) added to real runs; seeded", seed: thr.seeds.synthetic_distractors, results: evaluateAssociation(allRuns, { step, seed: thr.seeds.synthetic_distractors }) };
  }
  tracking.association.real_data = na("association accuracy on real footage", "no identity annotations exist; the synthetic distractor results above are NOT a measure of real-world association");
} else {
  tracking.note = na("tracking evaluations", "no ball-6 detection files yet");
}
tracking.full_trajectory_reconstruction = na("full-trajectory fit error", "there is no tracker yet (Experiment 1); interpolation above is the reconstruction measure available today");

// ---------------------------------------------------------------- 3. annotated frames
let annotated = {};
const annFile = path.join(EVAL, "annotate/annotations.json"), detFile = path.join(ROOT, "training/work/eval/annotated-detections.json");
if (fs.existsSync(annFile) && fs.existsSync(detFile)) {
  const ann = JSON.parse(fs.readFileSync(annFile, "utf8"));
  const manifest = readJSON("training/eval/annotate/manifest.json");
  const dets = JSON.parse(fs.readFileSync(detFile, "utf8"));
  const stratum = Object.fromEntries(manifest.frames.map((f) => [f.id, f]));
  // Headline numbers use medium and high confidence annotations; low-confidence ones are ignored (not a miss if skipped, not a false positive if boxed)
  const frames = (model) => ann.frames.filter((f) => !f.id.startsWith("R")).map((f) => ({ id: f.id, stratum: stratum[f.id].stratum, clip: stratum[f.id].clip, balls: f.balls.filter((b) => b.confidence !== "low"), ignore: f.balls.filter((b) => b.confidence === "low"), boxes: dets[model]?.[f.id] ?? [] }));
  const split = (model) => {
    const fr = frames(model);
    const oos = fr.filter((f) => !clips.find((c) => c.id === f.clip).ball6_training.used);
    const ins = fr.filter((f) => clips.find((c) => c.id === f.clip).ball6_training.used);
    return { out_of_sample_clips: summarizeDetection(oos), in_sample_clips: summarizeDetection(ins), n: { out_of_sample: oos.length, in_sample: ins.length } };
  };
  annotated = {
    annotator: ann.annotator,
    frames_annotated: ann.frames.length,
    ball6: split("ball6"),
    ball5_reference: dets.ball5 ? split("ball5") : na("ball-5 on annotated frames", "not run"),
    annotation_repeatability: repeatability(ann.frames.filter((f) => f.id.startsWith("R")).map((r) => [ann.frames.find((x) => x.id === stratum[r.id].duplicate_of), r])),
    low_confidence_annotations_ignored: ann.frames.filter((f) => !f.id.startsWith("R")).reduce((a, f) => a + f.balls.filter((b) => b.confidence === "low").length, 0),
    note: "in-sample = the clip's frames were in ball-6's training set; only out-of-sample numbers speak to unseen footage",
  };
} else {
  for (const m of ["detection precision and recall on annotated frames", "ball-centre localization error", "release events", "rim interaction events"]) annotated[m] = na(m, "annotation set not built or not scored yet");
}

// ---------------------------------------------------------------- 4. circle-fit independence (produced by annotate/independence.mjs)
const indFile = path.join(EVAL, "reports/circlefit-independence.json");
const independence = fs.existsSync(indFile) ? JSON.parse(fs.readFileSync(indFile, "utf8")) : na("circle-fit independence test", "annotate/independence.mjs has not been run");

// ---------------------------------------------------------------- 5. performance
const perfFile = path.join(EVAL, "reports/performance.json");
const performance = fs.existsSync(perfFile) ? JSON.parse(fs.readFileSync(perfFile, "utf8")) : na("performance and deployment measurements", "perf.mjs has not been run");

const report = {
  report_version: "v0",
  id,
  generated: new Date().toISOString(),
  code: { git_commit: git("git rev-parse HEAD"), working_tree_dirty: Boolean(git("git status --porcelain src")) , note: "dirty is checked on src/ only: the app code under test" },
  app_under_test: {
    live_rule: reg.live_rule,
    model_version: /MODEL_VERSION = "([^"]+)"/.exec(hookSrc)?.[1] ?? null,
    rule_version: /RULE_VERSION = "([^"]+)"/.exec(hookSrc)?.[1] ?? null,
    model_sha256: sha256(path.join(ROOT, "public/models/ball-6.onnx")),
    shot_rules_sha256: sha256(path.join(ROOT, "src/lib/vision/shotRules.ts")),
    counting_sha256: sha256(path.join(ROOT, "src/lib/vision/counting.ts")),
  },
  reproducibility: {
    thresholds_file: "training/eval/thresholds.json", thresholds_sha256: sha256(path.join(EVAL, "thresholds.json")),
    datasets_sha256: sha256(path.join(EVAL, "datasets.json")),
    lock_problems: problems,
    seeds: thr.seeds,
    node: process.version,
  },
  limitations: [
    "Final test set: " + reg.roles.final_test,
    "IMG_4874 and the kids clip were inspected repeatedly: they catch regressions, they are not clean benchmarks.",
    "Ball-6 trained on 8 of the 10 labelled clips: its shot and detection numbers on those are in-sample.",
    "Windows are pinned to the ones the ball-5 fixtures used; the live app picks its own with its auto-sizer.",
    "The annotation sample was hash-locked only AFTER annotation (the lock tool did not exist yet); it is seed-deterministic and regenerating it from the seed gave a byte-identical manifest, so it was not edited in between.",
    "Ground truth for ball position is a single AI annotator working blind to detector output; repeatability is measured and reported.",
    "Gravity-derived and ball-width-derived scales are exploratory estimates, not a validated camera calibration.",
    "Desktop and headless-browser timings are not phone timings.",
  ],
  sections: { shot_classification: shot, detection_and_localization: annotated, circle_fit_independence: independence, tracking, performance },
  unavailable,
};
fs.mkdirSync(path.join(EVAL, "reports"), { recursive: true });
fs.writeFileSync(path.join(EVAL, "reports", id + ".json"), JSON.stringify(report, null, 1) + "\n");
fs.writeFileSync(path.join(EVAL, "reports", id + ".md"), renderReport(report));
console.log(`wrote training/eval/reports/${id}.json (${unavailable.length} metrics marked unavailable)`);
