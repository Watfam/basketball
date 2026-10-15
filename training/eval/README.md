# Evaluation harness

Purpose: make every future change to ball tracking, shot calling and (later) shot analytics demonstrably better or demonstrably not,
against a baseline recorded before the change. Nothing here changes the app. The harness calls the app's own code (transpiled
copies of `src/lib/vision/*.ts` in `training/work/eval-build`), so the baseline is the code that ships.

## Rules of the road (written before any result existed)

1. **Preserve the baseline.** `reports/baseline-v0.json` is the frozen current performance (ball-6 + V4 + the existing hoop window).
   Compare any change with `node training/eval/compare.mjs reports/baseline-v0.json reports/<new>.json`.
2. **No silent edits.** `datasets.lock.json` holds the sha256 of the registry, thresholds, truth lists, saved detections, annotations
   and the model. The harness refuses to run against a stale lock. Change a threshold only by adding `thresholds-v2.json` and saying so
   in the report; never edit the file the baseline was judged against.
3. **Separate the three tracking questions.** Interpolation (observations on both sides of a gap), prediction (the past only) and
   association (is this detection the same ball) are different problems with different baselines and are never combined into one score.
4. **Errors are distributions.** Every error metric reports n, median with a bootstrap interval, p90, p95, max and the worst five cases
   with their clip and frame. Cells with fewer than 30 samples are `unavailable`, not estimated.
5. **Unavailable is a result.** A metric that cannot be computed reliably is listed under `unavailable` with the reason.
6. **Image-space numbers are image-space numbers.** Pixels in the 416 px hoop window. The gravity-derived and ball-width-derived
   scales (about 92 and 100 px per metre) agree within 9% on IMG_4874; that is an exploratory estimate until the camera geometry is
   validated (camera height, pitch and distance are unknown), not a calibration. No metre, degree or entry-angle is reported anywhere.

## Data roles (see `datasets.json`)

| Role | Clips | Meaning |
|---|---|---|
| dev | IMG_4836, 4839, 4840, 4844, 4851, 4866, 4867 (sessions S3, S4, S4b, S5, S6) | anything may be tuned |
| validation | IMG_4872, 4873 (S7) | choose between variants; score sparingly. Same session as 4874, so **S7 must not be tuned on** |
| diagnostic regression | IMG_4874 (S7), B1689585 kids clip (S2) | inspected repeatedly: catch regressions; NOT clean benchmarks |
| **final test** | **none** | **No untouched footage exists.** Every clip has been seen, scored or inspected. Any "held-out" claim means "not trained on", not "never looked at" |

Ball-6 trained on 8 of the 10 labelled clips (circle-fit-boxed positives), so shot and detection numbers on those are **in-sample for the
detector**. Only IMG_4874 and the kids clip are out-of-sample for it. The rules (V1..V4) were designed on the dev clips and their
exam was S7.

The cheapest way to get a real final test is the next real session: new footage recorded after this harness was locked, never looked at
until its first scoring. Real-phone sets (reviewed make/miss plus the saved `camera_report`) are a second, footage-free source.

## Ground truth

`annotate/` holds a small manually annotated set. **Annotator: a single AI visual annotator (Claude), blind to detector output, the
circle-fit, the clip, the frame number and the stratum**: sheets carry only a blind id and a coordinate grid. One annotator means no
inter-annotator agreement; instead 12 frames are annotated twice under different blind ids and the disagreement is reported as
`annotation_repeatability`. It is the floor under any localization claim. Matt (or anyone) can review disputed frames: records carry
`confidence` and `visibility` and the schema allows a second annotator.

Annotated per frame: ball centre and diameter (window pixels), visibility (clear, partial, occluded_guess), confidence, tags
(in_flight, at_rim, below_net, blurred, ...), and distractors (shirt, head, shadow, net, ...) so false positives have a type.
Events (`release`, `rim_interaction`) are first-class records keyed by clip and frame. Release is mostly outside the 416 px window
(first sighting touches the window edge in 7 of 22 IMG_4874 shots), so release is annotated only where visible and otherwise recorded
as not visible.

Strata are reported separately: `motion_high` / `motion_low` (random, detector-independent), `detector_gap` (targeted at misses) and
`detector_boxed` (random among boxed frames). The pooled `all` row mixes targeted and random frames and must not be read as a rate.

### Events and shot alignment

Matt's make/miss lists have no shot times, so a counted shot is paired with a written one by order, or by an alignment that rewards
V2 agreement when the counts differ. That alignment can pair the wrong shots: on IMG_4874 it skipped a real shot (frame 2170, a make)
as "the extra candidate" when the extra one is a phantom (frame 2835, no ball in any of six frames). `annotate/events.mjs` cuts a
six-frame strip around chosen candidates; the annotation records, per candidate, `rim_interaction` (detail, `outcome_seen`, and the
written index and outcome it corresponds to), `release` (visible or not, with the frame and tolerance where visible) and `no_shot`
(a counted candidate that is not a shot). `no_shot` candidates are removed before pairing, which makes IMG_4874 a clean 1-to-1 and
time-anchored. Only the candidates where a call was wrong or the pairing was ambiguous were annotated (13 events); the other
clips still use order or alignment pairing, and every report says which. Shot headline figures are **right calls out of all written
shots**: a shot the system never counted is a miss, not a skipped row.

### Circle-fit

`lib/circlefit.mjs` is a copy of the fit that built ball-6's training boxes. From the code: it is seeded by ball-5's proposal and keeps a
circle only if it agrees with that proposal, so it cannot see misses, is selected for agreement with the detector, and ball-6 was trained
to follow it on 8 clips. `annotate/independence.mjs` measures its seed-stability, its error against manual truth, and whether ball-6
is closer to it than to the truth on clips ball-6 trained on. See the report section `circle_fit_independence`.

## Reading the numbers: three traps found while building this

1. **Shot pairing can flatter or mislead** (above). Look at the Pairing column.
2. **Targeted strata are not rates.** `detector_gap` is built from frames the detector missed, so its recall is 0 by construction;
   `detector_boxed` from frames it boxed, so its recall is near 100 by construction. Only the `motion_*` strata are random, and they are
   small (single digits of balls per stratum in v0).
3. **Agreement is not accuracy.** A blind eye-annotation agreeing with the model's box centre to under a pixel is better than a grid
   reading should manage; the repeatability pairs were made by the same annotator in the same session and are optimistic. Treat
   sub-pixel claims, and any "improvement" smaller than a pixel, as unproven until a second annotator or a different measurement
   method exists.

## Reproduce

```bash
node training/tools/22-dump-detections.mjs ...        # only to regenerate dets6-* (see run notes in the report)
node training/eval/annotate/scan.mjs <clip>...         # motion-gate simulation per clip
node training/eval/annotate/sample.mjs                 # seeded manifest (lock it before annotating)
node training/eval/annotate/extract.mjs                # frames (git-ignored: footage of the kids is never committed)
node training/eval/annotate/sheets.mjs                 # gridded blind sheets
node training/eval/annotate/events.mjs <clip> <frame>...   # strips for event annotation
node training/eval/annotate/merge.mjs                  # assemble annotations.json from parts/*.json and validate
node training/eval/annotate/validate.mjs               # annotations vs manifest
node training/eval/annotate/score-annotated.mjs        # run the models on the annotated frames
node training/eval/annotate/independence.mjs           # circle-fit independence
node training/eval/perf.mjs                            # performance (on an idle machine)
node training/eval/lock.mjs                            # after review
node training/eval/run-baseline.mjs --id <name>        # the regression report
node --test training/eval/lib training/eval/annotate   # unit tests
```

Seeds are in `thresholds.json` (master 20261013, frame sample 20261014, bootstrap 20261015, synthetic distractors 20261016).

## What each section can and cannot say

| Section | Can say | Cannot say |
|---|---|---|
| shot_classification | calls right per clip with Wilson intervals, paired shot by shot | accuracy on unseen sessions; sizer-as-run results (windows are pinned) |
| detection_and_localization | recall, precision, centre error vs a blind annotation, by stratum | recall over whole clips (frames were sampled, strata are not weights) |
| circle_fit_independence | whether the fit follows its seed, how far it is from truth, imitation signal | that ball-6 is "right" where it agrees with the fit |
| tracking.coverage | where boxes exist, gap lengths | recall (a ball never boxed is invisible) |
| tracking.interpolation / prediction | error against the detector's own observation at a hidden frame (about 0.6 px noise) | error against the true ball position; behaviour where the ball was never detected |
| tracking.association | behaviour against SYNTHETIC distractors | real-world identity accuracy (no identity labels) |
| performance | desktop inference time, model and runtime sizes, gate share, app loop in desktop Chromium | phone speed, heat or memory (only the phone can say) |

## Phase 7 (data integrity, camera framing, iPhone readiness)

`experiments/camera-framing/REPORT.md` (criteria registered in `criteria*.json` before each evaluation, including the post-hoc amendments), `experiments/iphone-readiness/criteria.json` (registered before any phone result; no iPhone has been measured). Summary: deletion now removes tracking history; history can be exported/imported locally; the rim-and-backboard framing descriptor never accepted a different camera as comparable but failed the registered criteria to approve comparisons, so it is only an advisory lab page (`/lab/camera-reference`).

## Phase 8 (product readiness and usability)

`experiments/product-readiness/REPORT.md`: feature-readiness inventory for Phases 4-7, plain-language shot review and history, one-card privacy and retention controls, the replay-based phone test (`iphone-readiness/criteria-replay.json`, registered first) and the list of checks only the live camera can answer. `product-readiness/PROPOSALS.md` holds a small proposal that is NOT integrated; `shot-separation/KNOWN-ISSUE.md` documents the open shot-separation problem and its guarded cases.

## Phase 9 (iPhone validation and P-1)

`experiments/product-readiness/IPHONE-TEST.md`: exact steps to put the replay sample on the iPhone, run the camera-free tests and send back one report; the sample imports into its own area without altering existing history (tested). `experiments/rim-warning/`: P-1, the experimental display-only rim-reading warning (flag `hl:rim-warning`, off): criteria registered first, thresholds frozen from development clips, evaluation, report. It failed one registered criterion (C3) and is not independent validation.

## Designed for later work

Records are keyed `{clip, frame}` with optional `track_id` and `shot_id`, so trajectory features, shot fingerprints (per-shot release,
apex, entry features) and per-player consistency can attach to the same frame and event records without changing the measurement
layer. A future tracker emits observed/interpolated/predicted flags per point; the interpolation and prediction evaluators take any
method with the same signature as the baselines.

## Phase 10 (camera inside the training plans)

`experiments/camera-in-training/REPORT.md`: architecture map, which existing drills can be tracked and why, how a camera result is saved into the existing workout log (no new tables; one row per workout entry, idempotent), the way back to the workout step, Film Room linkage, manual correction, what is compared and what is not, and what is camera-counted vs player-reported. `verify-production-unchanged.mjs` shows no detection or counting file changed; the frozen baseline reproduces with no change. `e2e/` holds the browser checks and the temporary demo route they need.
