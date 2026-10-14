// Is the circle-fit an independent measurement of the ball's centre? Three questions, answered with numbers, no verdict hard-coded:
//  A. Seed stability: seed it on the annotated centre, then move the seed 8 to 17 px. An independent measurement lands in the same
//     place; a seed-dependent one follows the seed.
//  B. Truth: how far is the fit from the manual annotation, and how often does it even produce a circle the training code accepted?
//  C. Imitation: on clips ball-6 TRAINED on (its boxes were drawn from these circles), is ball-6 closer to the circle-fit than either
//     is to the manual truth? On clips it never saw, that closeness should vanish if it was imitation.
//   node training/eval/annotate/independence.mjs   -> training/eval/reports/circlefit-independence.json
import fs from "node:fs";
import path from "node:path";
import { ROOT, EVAL, loadRegistry, readJSON } from "../lib/registry.mjs";
import { fitAround } from "../lib/circlefit.mjs";
import { describe, wilson } from "../lib/stats.mjs";

const reg = loadRegistry();
const manifest = readJSON("training/eval/annotate/manifest.json");
const ann = readJSON("training/eval/annotate/annotations.json");
const work = path.join(ROOT, "training/work/eval");
const dets = JSON.parse(fs.readFileSync(path.join(work, "annotated-detections.json"), "utf8"));
const SUPPORT_OK = 0.7; // the training code kept circles with support >= 0.7
const OFFSETS = [[8, 0], [-8, 0], [0, 8], [0, -8], [12, 12], [-12, -12], [12, -12], [-12, 12]];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const rows = [];
for (const f of ann.frames.filter((x) => x.id.startsWith("F"))) {
  const m = manifest.frames.find((x) => x.id === f.id), clip = reg.clips.find((c) => c.id === m.clip);
  const ball = f.balls.find((b) => b.visibility === "clear" && b.confidence !== "low");
  const nativeFile = path.join(work, "native", f.id + ".rgb");
  if (!ball || !fs.existsSync(nativeFile)) continue;
  const s = clip.window.cropSize / 416, W = clip.window.cropSize, img = fs.readFileSync(nativeFile);
  const truth = { x: ball.cx, y: ball.cy };
  const near = Math.max(8, 0.6 * ball.diameter * s);
  // The training code ran on the full 1920x1080 frame; here only the window crop exists, so a seed near the crop's edge gets its search
  // region pushed off-centre. Those fits look somewhere else and are excluded (counted), not scored.
  const fit = (sx, sy) => { const c = fitAround(img, W, W, sx * s, sy * s, near); return c && { x: c.cx / s, y: c.cy / s, diameter: (2 * c.r + 2) / s, support: c.support, ok: c.support >= SUPPORT_OK, clamped: c.seedOffsetFromRegionCentre > 3 }; };
  const a = fit(truth.x, truth.y);
  const shifted = OFFSETS.map(([dx, dy]) => fit(truth.x + dx / s * 1, truth.y + dy / s * 1));
  const box = (dets.ball6[f.id] ?? []).filter((b) => b.score >= 0.25).map((b) => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2, score: b.score })).sort((p, q) => dist(p, truth) - dist(q, truth))[0];
  const boxOk = box && dist(box, truth) <= 0.5 * ball.diameter;
  const fromBox = boxOk ? fit(box.x, box.y) : null;
  rows.push({ id: f.id, clip: m.clip, in_sample: clip.ball6_training.used, diameter: ball.diameter, a, shifted, model: boxOk ? box : null, fromBox, truth });
}

const clampedFrames = rows.filter((r) => r.a?.clamped).length;
const usable = rows.filter((r) => r.a && !r.a.clamped);
const stab = [], pulled = [], shiftedPass = [];
for (const r of usable) for (const [i, sft] of r.shifted.entries()) {
  if (sft?.clamped) continue;
  if (!sft) { shiftedPass.push(0); continue; }
  shiftedPass.push(sft.ok ? 1 : 0);
  stab.push(dist(sft, r.a)); pulled.push(dist(sft, r.a) > 6 ? 1 : 0);
}
const seedStability = {
  frames_with_a_clear_annotated_ball: rows.length, excluded_because_the_search_region_was_clamped_at_the_crop_edge: clampedFrames, frames_with_a_circle_at_the_true_seed: usable.length, frames_tried: rows.length - clampedFrames,
  shifted_seed_fits: shiftedPass.length, produced_a_circle: shiftedPass.filter(Boolean).length,
  movement_of_fit_when_seed_moves_px: stab.length >= 5 ? describe(stab) : { n: stab.length, unavailable: "too few" },
  share_of_shifted_fits_landing_more_than_6px_from_the_true_seed_fit: stab.length ? wilson(pulled.reduce((x, y) => x + y, 0), pulled.length) : null,
  reading: "small movement means the fit finds the same edge from different seeds (seed-independent in its estimate); a large share pulled away means it follows the seed or fails",
};

const truthErr = usable.filter((r) => r.a.ok).map((r) => dist(r.a, r.truth));
const acceptedShare = usable.length ? wilson(usable.filter((r) => r.a.ok).length, usable.length) : null;
const byGroup = {};
for (const r of usable.filter((x) => x.a.ok && x.model)) {
  const g = r.in_sample ? "clips_ball6_trained_on" : "clips_ball6_never_saw";
  (byGroup[g] ??= { model_vs_truth: [], circle_vs_truth: [], model_vs_circle: [], ids: [] });
  byGroup[g].model_vs_truth.push(dist(r.model, r.truth)); byGroup[g].circle_vs_truth.push(dist(r.a, r.truth)); byGroup[g].model_vs_circle.push(dist(r.model, r.a)); byGroup[g].ids.push(r.id);
}
const three = Object.fromEntries(Object.entries(byGroup).map(([g, v]) => [g, { frames: v.ids.length, model_vs_truth_px: v.ids.length >= 5 ? describe(v.model_vs_truth) : { n: v.ids.length, unavailable: "fewer than 5 frames" }, circle_vs_truth_px: v.ids.length >= 5 ? describe(v.circle_vs_truth) : { n: v.ids.length, unavailable: "fewer than 5 frames" }, model_vs_circle_px: v.ids.length >= 5 ? describe(v.model_vs_circle) : { n: v.ids.length, unavailable: "fewer than 5 frames" } }]));

const out = {
  what: "Independence test of the circle-fit (copied from tools/44-round6.mjs) against manual annotation. Seeds come from the ANNOTATION here, which the training code could not do (it seeded from ball-5's proposal and kept a circle only if it agreed with that proposal).",
  from_the_code: [
    "seeded by the ball-5 detector's proposal (window centred on it, search radius max(8, 0.6 x the proposal's width))",
    "kept only if support >= 0.7 AND the circle's centre is within r + 2 px of the proposal AND its size is 0.6 to 1.9 times the proposal's: selected for agreement with the detector",
    "cannot find a ball the detector did not propose, so it says nothing about missed balls or false positives",
    "ball-6 was trained on boxes drawn from these circles on 8 clips",
  ],
  seed_stability: seedStability,
  against_manual_truth: { accepted_by_training_criterion: acceptedShare, centre_error_px: truthErr.length >= 5 ? describe(truthErr) : { n: truthErr.length, unavailable: "too few" }, note: "errors are limited by the annotation's own repeatability" },
  imitation_check: three,
  imitation_reading: "if model_vs_circle is much smaller than model_vs_truth and circle_vs_truth on the clips ball-6 trained on, but not on clips it never saw, the agreement is imitation, not independent confirmation",
  frames: rows.map((r) => ({ id: r.id, clip: r.clip, in_sample: r.in_sample, fit_ok_at_truth_seed: r.a?.ok ?? null, fit_error_px: r.a ? dist(r.a, r.truth) : null, model_error_px: r.model ? dist(r.model, r.truth) : null })),
};
fs.writeFileSync(path.join(EVAL, "reports/circlefit-independence.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`usable frames ${usable.length} of ${rows.length} (${clampedFrames} clamped, excluded); accepted at true seed ${acceptedShare ? (100 * acceptedShare.p).toFixed(0) + "%" : "n/a"}`);
console.log("stability:", JSON.stringify(seedStability.movement_of_fit_when_seed_moves_px.median), "median px;", "imitation groups:", Object.keys(three).join(", "));
