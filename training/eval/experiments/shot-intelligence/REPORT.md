# Phase 4: flight-path replay, shot fingerprints, evidence-backed insights, one accuracy experiment

**Bottom line.** Three working experimental prototypes were built and demonstrated; the targeted accuracy experiment **failed its registered criteria and is not recommended for integration**.
Nothing is in the app: `src/` and `public/` are unchanged, ball-6, V4, the hoop window, the auto-sizer, the shot counter and the review screen are untouched, `thresholds.json`, baseline-v0 and `datasets.lock.json` (content hashes) are unchanged,
and the frozen baseline reproduced exactly before any work (`run-baseline.mjs` then `compare.mjs`: no change in any area). App tests 93/93, harness tests 47/47, experiment tests 90/90.

Everything is on the eight clips used before. **No untouched footage exists**, ball-6 trained on seven of the eight, and written outcomes are paired to counted shots by the baseline's V2-agreement alignment, which can slide by one shot after a lost shot.
All measurements are image-space (pixels or ball widths); "image-horizontal" is not the shooter's left or right and nothing here is a calibrated physical measurement.
Criteria were registered first (`criteria.json`, commit 9cef272). Three amendments were made after seeing results and are listed with their reasons in `criteria-v2.json` and `criteria-v3.json`; none touched an outcome-based criterion.

## 1. What was implemented

| Workstream | What | Result against its registered criteria |
|---|---|---|
| A. Flight-path replay | cv_nearest association + spot-memory clutter exclusion; trails that break on gaps over 3 frames, failed links, rivals within 1.5 ball widths, and rim clutter; reconstruction only across 1-3 frame gaps, typed and drawn dashed; offline HTML replay with frame stepping, source toggle, make/miss comparison | A2 pass (0 link violations over 7,402 links at 30 fps, 3,668 at 15 fps), A3 pass (unit scenarios), A5 pass (data byte-identical on rebuild, every point typed), A6 pass (demo). **A1 fail**: one extra counted shot on IMG_4873 carries 11 phantom points (1.5% overall, limit 2 per trail). **A4 fail**: reconstruction error median 0.70/0.85/1.01 px, p95 2.85/4.30/6.07 px for 1/2/3 hidden frames against limits 1.0 and 4.0, so only 1-frame gaps meet them; displayed uncertainty was set to the measured values |
| B. Shot fingerprints | schema `shot-fingerprint/1`: rim-relative, observed-points-only measurements with explicit unavailability and reason codes, evidence frame links; outcome never an input (labels in a separate file) | Core measurements STABLE between 30 and 15 fps (Spearman 0.88-0.99): rim-level offset, approach direction, descent speed, closest approach, observed flight length, path smoothness. Approach-observed-frames is not stable (ratio 0.41). Path clusters repeat in only 4 of 8 clips |
| C. Coaching insights | statements S1-S5 with permutation test, bootstrap interval, Holm correction, practical-size floor, abstention reason codes, language lint | Placebo false-claim rate 0-2% per set (limit 10%); 5 statements supported on real data, 40 abstentions |
| D. Accuracy experiment | the round-2 shot machine driven by the cv_nearest tracker (lightweight association plus more reliable shot separation) | **NOT RECOMMENDED**: fails D1, D3, D4 at both frame rates and D6 at 30 fps |

## 2. Files

New, all under `training/eval/experiments/shot-intelligence/`: `criteria.json`, `criteria-v2.json`, `criteria-v3.json`, `pipeline.mjs`, `shots.mjs`, `trail.mjs` (+`trail.test.mjs`), `eval-trails.mjs`, `make-replay.mjs`, `replay/replay.html`, `fingerprint.mjs` (+`.test.mjs`), `build-fingerprints.mjs`, `analyse-fingerprints.mjs`, `stats.mjs`, `insights.mjs` (+`.test.mjs`), `run-insights.mjs`, `eval-accuracy.mjs`, `evaluate-accuracy.mjs`, `perf.mjs`, `results/*.json`. Also `training/README.md` (pointer) and `REPORT.md` here.
The Experiment-1 tracker and machine (`../tracker/`) and the Experiment-2 tile detections (`../visibility/`) are imported, not modified.
**Untouched:** everything under `src/` and `public/`, the model, `thresholds.json`, `reports/baseline-v0.*`, `datasets.json`, `datasets.lock.json`, the training data, the eval library.

## 3. How to open and use the flight-path replay

```bash
node training/eval/experiments/shot-intelligence/make-replay.mjs      # builds data + frames into training/work/replay (git-ignored: it holds video frames)
python3 -m http.server 8765 --directory training/work/replay
```

Open `http://localhost:8765/replay.html`. Pick a clip and a shot (eight demo shots: a make and a miss from IMG_4839, 4851, 4866, 4872); step with the arrow keys or the buttons, play with space, toggle "whole path".
Legend: filled dots = observed ball centres (colour = detector score); dashed rings = reconstructed across a 1-3 frame gap (low confidence at 2-3 frames); red dotted line and "gap Nf" = no observed ball, path not drawn; red cross = identity uncertain (a rival box nearby), purple cross = rim-hardware clutter left out; white squares = the observed approach to the rim.
The "Detections" menu switches between the production window and production plus the 2x rim-centred window from Experiment 2 (context view, sampled shots only). The right-hand panel overlays rim-relative paths of any selected shots (ball widths).
Verified in the Browser pane: a make (IMG_4839 frame 155) and a miss (frame 990, with its post-rim rebound arc and a one-frame gap marked), stepping shows observed/gap status and score per frame, and the comparison panel overlays all 28 shots.
The original video and detection files are never modified.

## 4. Example shot fingerprints (IMG_4840, 30 fps)

```
IMG_4840:90   written make   rim-level offset +0.44 bw   approach 14.8 deg   descent 0.54 bw/frame   closest approach 0.23 bw
              observed flight 34 frames (apex observed)   approach points 6   path RMS 0.30 bw   rim interaction: not observed   mean score 0.81   evidence frames 15-105
IMG_4840:775  written miss   rim-level offset +1.17 bw   approach 37.0 deg   descent 0.05 bw/frame   closest approach 1.17 bw
              observed flight 49 frames (no apex)   approach points 0   path RMS 0.17 bw   rim interaction: not observed   mean score 0.82   evidence frames 700-790
IMG_4874:396  rim-level offset, direction, speed, smoothness, rim interaction: all UNAVAILABLE (no_observed_descending_crossing); nothing is filled in
```

Availability of the rim-level offset on matched shots at 30 fps: IMG_4840 97%, 4866 94%, 4867 87%, 4873 85%, 4839 79%, 4872 65%, 4851 59%, 4874 53%.
The 30-versus-15 fps agreement is a **sampling-sensitivity test on the same detections, not an independent check**.

## 5. Example evidence-backed insights (supported)

All of these describe where the ball was observed; each carries supporting shot IDs, the measurement, group sizes, quality, uncertainty, a baseline and the line "This describes where the ball was observed in the image; it does not identify a cause."

- **IMG_4840, S1:** at rim level the ball was observed 2.75 ball widths farther from the rim centre (image-horizontal) on misses than on makes (median absolute offset; 12 makes, 18 misses). 95% interval 1.33-3.86, permutation p 0.008, Holm 0.025, measurement available on 94% of matched shots, stable between frame rates, 30 supporting shots.
- **IMG_4839, S1:** 2.17 ball widths farther on misses (12 makes, 8 misses), interval 0.06-3.96, Holm 0.005, availability 71%.
- **S4 session (IMG_4839 + IMG_4840), S1:** 2.26 ball widths (24 makes, 26 misses), interval 1.21-3.65, Holm 0.0008. First-half and second-half signs agree for all three S1 statements (S3 could not be split).
- **IMG_4840 and the S4 session, S3:** the observed rim-level position varied 19.8 and 16.0 times as much on misses as on makes.

**Read these for what they are.** A miss is, nearly by definition, a ball that was not near the rim centre at rim level, and V4 itself uses the rim-crossing offset, so S1 and S3 mainly show that the measurement tracks the outcome (face validity), not a finding about technique. Makes cluster so tightly (median offset 0.13-0.27 bw) that the spread ratio is huge for a trivial reason. They are not coaching advice.

## 6. Where the engine abstained (40 of 45 statements)

| Reason | Count | Example |
|---|---|---|
| insufficient_n | 15 | IMG_4872: 9 makes and 6 misses with the measurement, need 8 of each |
| low_availability | 9 | IMG_4867: measurement on 40% of matched shots, need 60% (ambiguous breaks near the rim) |
| unstable_measure | 6 | path-cluster comparison: clustering does not agree between 30 and 15 fps in 4 of 8 clips |
| interval_includes_zero | 6 | IMG_4839 miss side (S2): effect 0.32 bw, permutation p 0.42; IMG_4839 S4 recent variability: ratio interval spans 1 |
| ambiguous_camera_view | 3 | IMG_4851, a side-on camera, where image-horizontal is mostly depth |
| not_significant_after_correction | 1 | IMG_4839 S3: unadjusted p 0.018, Holm 0.0546, one step over the line |

Not supported anywhere: which side misses fall on, recent variability, and path-pattern differences between makes and misses. The honest statement for those is "insufficient reliable data".
Validity: with outcome labels shuffled 400 times per set, a statement was supported in 0-2% of shuffles (IMG_4839 1.0%, S4 session 2.0%; limit 10%). Unit tests cover abstention for each reason, a tiny-but-real effect (not reported), the language lint (no form, release, grip, left/right without "image-") and determinism.

## 7. Targeted accuracy experiment (Workstream D)

Candidates were assessed in `criteria.json` before running: hard-negative training and held-ball examples need retraining and annotation (one rim, 17 in-hand frames; not feasible here); multi-scale training is later work; the lightweight constant-velocity layer exists and Experiment 1 found it no worse than Kalman.
Selected: the round-2 shot machine (silence-closed shots, other tracks attached, decision-time clutter) driven by **cv_nearest**, evaluated unchanged on the Experiment-1 harness.

Correct calls of all written shots, 30 fps / 15 fps (baseline-v0, then the experiment, then the Kalman round-2 version for reference):

| Clip | baseline-v0 | cv_nearest + machine | Kalman + machine (round 2) |
|---|---|---|---|
| IMG_4839 | 27 / 26 | 27 / 26 | 27 / 26 |
| IMG_4840 | 31 / 31 | 31 / 31 | 31 / 31 |
| IMG_4851 | 16 / 16 | 16 / 16 | 16 / 16 |
| IMG_4866 | 18 / 18 | 17 / 17 | 18 / 18 |
| IMG_4867 | 15 / 15 | 15 / 15 | 15 / 15 |
| IMG_4872 | 23 / 23 | **14** / 21 | 22 / 22 |
| IMG_4873 (regression case) | 11 / 12 | 19 / 19 | 20 / 20 |
| IMG_4874 (diagnostic) | 18 / 18 | 17 / 17 | 18 / 18 |

Criteria: **pass** D2 (IMG_4873: 20 of 22 matched, V4 right 19, longest merged shot 97 against baseline 1044; 15 fps 24 against 525), D5 (continuity 98-99%), D7 (legacy equivalence). **Fail**: D1 (IMG_4872 loses 9 calls at 30 fps and 2 at 15 fps, pooled -11 and -4), D3 (an injected phantom reaches 13.9% of evidence at 30 fps, limit 10%; at 15 fps the maximum is 9.4% but the pooled injected V4 is 3.2 calls below the clean baseline at both rates, limit 3), D4 (30 fps: zone boxes kept 95.3% passes, stall survival 90.7% fails; 15 fps: 94.0% kept and 92.5% survival both miss 95%), D6 at 30 fps (p99.9 32 ms, from IMG_4839, the first clip run in the process, so a cold-start effect is suspected but not shown; the other clips are 0.2-2.4 ms).
Diagnosis (`results/accuracy.json`): the IMG_4872 loss is **one shot** (frame 3359) whose ball enters the zone 58 frames after an earlier ball's first sighting, so the 40-frame silence rule keeps that earlier shot open and merges them, and the V2-agreement pairing then slides by one shot, producing alternating make/miss mismatches; the true loss is about one call plus a scoring artifact, but the criterion is the criterion.
**Recommendation: do not integrate.** The tracker is not the problem; the rule that decides where a shot ends is. The phantom is suppressed (14.8% to 5.5% of evidence on IMG_4873), which a later experiment can keep, but a new rule that separates two shots less than 40 frames apart when a second ball arrives is needed before this can match baseline-v0 on the clips that work today.

## 8. Before-and-after metrics, performance, memory

Production pipeline (frozen baseline): unchanged, 159 of 178 right (89%) of all written shots at 30 fps, as reproduced.
Experimental pipeline on this Mac (desktop, not a phone): tracker plus machine median 0.008-0.02 ms per frame, p99 0.26-0.29 ms, p99.9 4.2-4.9 ms, worst frame 12-21 ms (same GC/scheduler-noise pattern as Experiment 1; suspected, not proven); trail building plus pipeline 4.4 ms per shot over a whole clip; fingerprint median 0.04-0.09 ms per shot; heap growth after a full 4,300-5,200-frame clip 0.1-1.3 MB with pruning on (peak sampled 15-17 MB). No model runs added. The replay context view needs the 2x-window detections, which cost a second inference per frame (Experiment 2) and are not part of the cheap path.

## 9. Remaining technical limitations

- Outcome labels are good but not perfect (pairing slide). Coaching claims are only as good as them.
- One camera angle per clip; image-horizontal offset is not lateral error. The side-on clip is excluded from lateral statements.
- The production window sees the rim approach, not the release or the early flight, so release, form and whole-flight statements are not supported. Apex is observed in only about a quarter of shots with the production window.
- Per-clip sets are small (15-32 shots); only IMG_4839, IMG_4840 and their pooled session reached enough data for any statement. Statements cannot be pooled across cameras.
- Reconstruction over 2-3 frame gaps is not accurate enough to measure from; fingerprints use observed points only.
- IMG_4873's phantom still leaks into one extra counted shot's trail.
- Ball-width normalisation depends on perspective and the detector's box convention.
- All timings are desktop timings; memory is Node heap, not the phone.

## 10. Final engineering questions

**Are we extracting the maximum useful information from the detections we have, or discarding temporal and spatial information?** We are still discarding a lot. (1) Production keeps only a per-frame list of zone sightings and a V4 call; it throws away identity, so a bounce, a rebound or the rim phantom cannot be told from the ball (the cv_nearest tracker plus spot memory recovers that at about 0.01 ms per frame). (2) It does not keep the observed approach geometry (rim-level offset, direction, speed) that this phase shows is stable between 30 and 15 fps. (3) It never records confidence or gaps per shot. (4) The 416 px window discards the release and most of the apex (Experiment 2). Items 1-3 are nearly free; item 4 costs an inference.

**Which measurements are trustworthy enough for coaching?** Rim-level image-horizontal offset, approach direction, descent speed, closest approach and observed flight length: stable between frame rates and available on 53-97% of matched shots across the eight clips (seven of eight above 59%). Only the rim-level offset has been used in a statement, and only the "misses are farther from the rim centre" kind survived testing. **Too uncertain to report:** miss side, recent variability, path-pattern differences, anything about release, form or the early flight, anything on the side-on clip, anything from reconstructed points.

**Can we build useful shot comparisons without full-flight tracking?** Yes, as comparisons of the observed rim approach (the replay's overlay and the fingerprints); about three quarters of matched shots (134 of 171) have an observed rim-level offset. They support "where did this shot arrive at the rim compared with my others", not "why".

**Simplest architecture that supports future improvements:** keep production as is; add beside it one small module that turns the zone detections into tracks (cv_nearest plus spot-memory clutter), emits a per-shot observation record (the fingerprint, with its evidence frames) and nothing else; make the shot-separation rule its own replaceable part; keep any wider-window detections as an optional second input that never feeds V4.

**Which accuracy limitation next:** shot separation. Both the Kalman and the cv_nearest versions of the machine can lose a shot the same way (a second ball arriving while an earlier shot is still open), so a rule that separates a new shot when a second ball arrives while the first is already decided, tested on the 4872 case, is the next experiment. Hard-negative training for rim hardware is the root-cause fix for the phantom but needs retraining and more than one rim.

**What would most improve the app for someone practising in a driveway:** a post-session view that replays each shot with its observed path and says "no clear ball here" where the ball was not found, plus an honest per-session summary of where shots arrived at the rim compared with makes. That is what this phase builds the pieces for. Coaching language beyond that needs the release to be seen first.

## 11. Next milestone

1. A flag-gated, non-production "session review" screen that uses the replay data for the shots the app already records, with the trail drawn on the saved replay frames (the app keeps a 6 s replay buffer). No coaching text.
2. In parallel, one shot-separation experiment (registered first) aimed at the IMG_4872 merge.
3. Only then, with more sessions of data per camera position, enable the fingerprint comparison and the two supported statement types on a per-session basis.

## 12. Reproduce

```bash
node training/eval/run-baseline.mjs --id check && node training/eval/compare.mjs training/eval/reports/baseline-v0.json training/eval/reports/check.json   # then delete check.*
node --test training/eval/experiments/shot-intelligence/*.test.mjs                  # 25 tests
node training/eval/experiments/shot-intelligence/eval-trails.mjs                    # Workstream A criteria
node training/eval/experiments/shot-intelligence/build-fingerprints.mjs && node training/eval/experiments/shot-intelligence/analyse-fingerprints.mjs
node training/eval/experiments/shot-intelligence/run-insights.mjs                   # statements, abstentions, placebo
node training/eval/experiments/shot-intelligence/eval-accuracy.mjs && node training/eval/experiments/shot-intelligence/evaluate-accuracy.mjs
node --expose-gc training/eval/experiments/shot-intelligence/perf.mjs
node training/tools/43-run-tests.mjs                                                # the app's 93 tests
```
