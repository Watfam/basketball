# Regression report: baseline-v0

Generated 2026-10-14T07:24:23.269Z. Code 152881ad8c.
App under test: rule v4 (src/lib/vision/shotRules.ts LIVE_RULE), model ball-6, model sha256 4d19f88b8290.
Evaluation set: datasets sha256 dac29868c249, thresholds sha256 0b838dd822c0, lock problems: none.

## Limitations (read first)
- Final test set: NONE. No untouched footage exists. Every clip has been seen, scored or inspected. Stated in every report.
- IMG_4874 and the kids clip were inspected repeatedly: they catch regressions, they are not clean benchmarks.
- Ball-6 trained on 8 of the 10 labelled clips: its shot and detection numbers on those are in-sample.
- Windows are pinned to the ones the ball-5 fixtures used; the live app picks its own with its auto-sizer.
- The annotation sample was hash-locked only AFTER annotation (the lock tool did not exist yet); it is seed-deterministic and regenerating it from the seed gave a byte-identical manifest, so it was not edited in between.
- Ground truth for ball position is a single AI annotator working blind to detector output; repeatability is measured and reported.
- Gravity-derived and ball-width-derived scales are exploratory estimates, not a validated camera calibration.
- Desktop and headless-browser timings are not phone timings.

## 1. Shot classification

Alignment caveat: Matt's lists have no shot times, so shots are paired by order, or by an alignment that rewards V2 agreement when counts differ. That flatters the rule and can move one shot either way (IMG_4874 V4: 18 of 20 here, 17 of 20 in the README, which paired by time against ball-5). Time-anchored shot truth exists only where annotated (see events).

### ball-6, 30 fps (every frame), window: pinned (registry window), not the live auto-sizer

| Clip | Role | Detector in-sample | Written | Counted | Matched | V1 | V2 | V3 | V4 (live) | V4 of all written (95% interval) | Pairing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| IMG_4839 | dev | yes | 28 | 28 | 28 | 21 | 27 | 28 | **27** | 96% (82-99, n=28) | 1-to-1 |
| IMG_4840 | dev | yes | 32 | 32 | 32 | 28 | 27 | 32 | **31** | 97% (84-99, n=32) | 1-to-1 |
| IMG_4851 | dev | yes | 18 | 17 | 17 | 15 | 15 | 15 | **16** | 89% (67-97, n=18) | alignment by V2 agreement (flatters the rule) |
| IMG_4866 | dev | yes | 19 | 19 | 19 | 17 | 17 | 16 | **18** | 95% (75-99, n=19) | 1-to-1 |
| IMG_4867 | dev | yes | 16 | 16 | 16 | 13 | 14 | 15 | **15** | 94% (72-99, n=16) | 1-to-1 |
| IMG_4872 | validation | yes | 23 | 24 | 23 | 20 | 20 | 20 | **23** | 100% (86-100, n=23) | alignment by V2 agreement (flatters the rule) |
| IMG_4873 | validation | yes | 22 | 11 | 11 | 11 | 11 | 11 | **11** | 50% (31-69, n=22) | alignment by V2 agreement (flatters the rule) |
| IMG_4874 | diagnostic_regression | NO | 20 | 20 | 20 | 16 | 16 | 16 | **18** | 90% (70-97, n=20) | 1-to-1 after removing 1 annotated phantom candidate(s) |
| IMG_4836 | | | | | | | | | | | not scored: no saved detections for either model in the fixtures |
| IMG_4844 | | | | | | | | | | | not scored: two camera positions: needs the --segments scorer spec, not set up in v0 |

Pooled over 8 clips (178 written shots, 166 matched): V4 right on **159 of 178** written shots 89% (84-93, n=178); on matched shots only 96% (92-98, n=166); V2 of all written 83% (76-87, n=178). pooled over shots; clips are the real unit of variation, see clip_level_mean_accuracy_v4_ci95.
Clip-level mean V4 accuracy, bootstrap 95% interval: 77-96%.
- dev: V4 107 of 113 written (95% (89-98, n=113)); 112 matched
- validation: V4 34 of 45 written (76% (61-86, n=45)); 34 matched
- diagnostic_regression: V4 18 of 20 written (90% (70-97, n=20)); 20 matched

### ball-6, 15 fps (every 2nd frame, as the live loop), window: pinned (registry window), not the live auto-sizer

| Clip | Role | Detector in-sample | Written | Counted | Matched | V1 | V2 | V3 | V4 (live) | V4 of all written (95% interval) | Pairing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| IMG_4839 | dev | yes | 28 | 29 | 28 | 22 | 26 | 26 | **26** | 93% (77-98, n=28) | alignment by V2 agreement (flatters the rule) |
| IMG_4840 | dev | yes | 32 | 32 | 32 | 28 | 27 | 32 | **31** | 97% (84-99, n=32) | 1-to-1 |
| IMG_4851 | dev | yes | 18 | 17 | 17 | 15 | 15 | 15 | **16** | 89% (67-97, n=18) | alignment by V2 agreement (flatters the rule) |
| IMG_4866 | dev | yes | 19 | 19 | 19 | 17 | 17 | 16 | **18** | 95% (75-99, n=19) | 1-to-1 |
| IMG_4867 | dev | yes | 16 | 16 | 16 | 14 | 14 | 14 | **15** | 94% (72-99, n=16) | 1-to-1 |
| IMG_4872 | validation | yes | 23 | 23 | 23 | 20 | 20 | 20 | **23** | 100% (86-100, n=23) | 1-to-1 |
| IMG_4873 | validation | yes | 22 | 12 | 12 | 12 | 12 | 12 | **12** | 55% (35-73, n=22) | alignment by V2 agreement (flatters the rule) |
| IMG_4874 | diagnostic_regression | NO | 20 | 19 | 19 | 17 | 17 | 16 | **18** | 90% (70-97, n=20) | alignment by V2 agreement (flatters the rule) after removing 1 annotated phantom candidate(s) |
| IMG_4836 | | | | | | | | | | | not scored: no saved detections for either model in the fixtures |
| IMG_4844 | | | | | | | | | | | not scored: two camera positions: needs the --segments scorer spec, not set up in v0 |

Pooled over 8 clips (178 written shots, 166 matched): V4 right on **159 of 178** written shots 89% (84-93, n=178); on matched shots only 96% (92-98, n=166); V2 of all written 83% (77-88, n=178). pooled over shots; clips are the real unit of variation, see clip_level_mean_accuracy_v4_ci95.
Clip-level mean V4 accuracy, bootstrap 95% interval: 78-96%.
- dev: V4 106 of 113 written (94% (88-97, n=113)); 112 matched
- validation: V4 35 of 45 written (78% (64-87, n=45)); 35 matched
- diagnostic_regression: V4 18 of 20 written (90% (70-97, n=20)); 19 matched

### ball-5, 30 fps (every frame), window: pinned (registry window), not the live auto-sizer

| Clip | Role | Detector in-sample | Written | Counted | Matched | V1 | V2 | V3 | V4 (live) | V4 of all written (95% interval) | Pairing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| IMG_4839 | dev | yes | 28 | 28 | 28 | 22 | 26 | 27 | **26** | 93% (77-98, n=28) | 1-to-1 |
| IMG_4840 | dev | yes | 32 | 32 | 32 | 26 | 28 | 32 | **31** | 97% (84-99, n=32) | 1-to-1 |
| IMG_4851 | dev | yes | 18 | 17 | 17 | 15 | 15 | 15 | **16** | 89% (67-97, n=18) | alignment by V2 agreement (flatters the rule) |
| IMG_4866 | dev | yes | 19 | 19 | 19 | 18 | 17 | 17 | **18** | 95% (75-99, n=19) | 1-to-1 |
| IMG_4867 | dev | yes | 16 | 16 | 16 | 13 | 15 | 13 | **15** | 94% (72-99, n=16) | 1-to-1 |
| IMG_4872 | validation | yes | 23 | 23 | 23 | 18 | 19 | 18 | **21** | 91% (73-98, n=23) | 1-to-1 |
| IMG_4873 | validation | yes | 22 | 24 | 21 | 20 | 20 | 20 | **20** | 91% (72-97, n=22) | alignment by V2 agreement (flatters the rule) |
| IMG_4874 | diagnostic_regression | NO | 20 | 20 | 20 | 14 | 15 | 16 | **16** | 80% (58-92, n=20) | 1-to-1 |
| IMG_4836 | | | | | | | | | | | not scored: no saved detections for either model in the fixtures |
| IMG_4844 | | | | | | | | | | | not scored: two camera positions: needs the --segments scorer spec, not set up in v0 |

Pooled over 8 clips (178 written shots, 176 matched): V4 right on **163 of 178** written shots 92% (87-95, n=178); on matched shots only 93% (88-96, n=176); V2 of all written 87% (81-91, n=178). pooled over shots; clips are the real unit of variation, see clip_level_mean_accuracy_v4_ci95.
Clip-level mean V4 accuracy, bootstrap 95% interval: 87-94%.
- dev: V4 106 of 113 written (94% (88-97, n=113)); 112 matched
- validation: V4 41 of 45 written (91% (79-96, n=45)); 44 matched
- diagnostic_regression: V4 16 of 20 written (80% (58-92, n=20)); 20 matched

## 2. Detection and localization on annotated frames

Annotator: claude-visual-1 (single AI visual annotator (no human second opinion yet)). 88 frame records. in-sample = the clip's frames were in ball-6's training set; only out-of-sample numbers speak to unseen footage.

**Annotation repeatability** (12 frames annotated twice): ball count agreement 100% (76-100, n=12); centre difference n=5, median 0.50 [0.00-2.24], p90 1.7, p95 2.0, max 2.2 px. Localization differences below this are not claims.

### ball-6, clips ball-6 never trained on (56 frames)

| Stratum | Frames | Annotated balls | Recall | Precision | Centre error (px) | Box width / ball |
|---|---|---|---|---|---|---|
| all | 56 | 24 | 67% (47-82, n=24) | 100% (81-100, n=16) | n=16, median 0.81 [0.61-1.18], p90 1.5, p95 1.7, max 2.2 | 1.02 |
| stratum:motion_low | 14 | 0 | n/a | n/a | unavailable (fewer than 5 matched balls) | n/a |
| stratum:detector_boxed | 10 | 10 | 100% (72-100, n=10) | 100% (72-100, n=10) | n=10, median 0.98 [0.58-1.26], p90 1.4, p95 1.5, max 1.6 | 1.02 |
| stratum:motion_high | 22 | 8 | 75% (41-93, n=8) | 100% (61-100, n=6) | n=6, median 0.72 [0.58-1.65], p90 1.6, p95 1.9, max 2.2 | 1.03 |
| stratum:detector_gap | 10 | 6 | 0% (0-39, n=6) | n/a | unavailable (fewer than 5 matched balls) | n/a |

### ball-6, clips ball-6 trained on (in-sample) (20 frames)

| Stratum | Frames | Annotated balls | Recall | Precision | Centre error (px) | Box width / ball |
|---|---|---|---|---|---|---|
| all | 20 | 8 | 100% (68-100, n=8) | 89% (56-98, n=9) | n=8, median 0.92 [0.53-1.46], p90 1.6, p95 1.8, max 2.0 | 1.03 |
| stratum:motion_high | 15 | 8 | 100% (68-100, n=8) | 100% (68-100, n=8) | n=8, median 0.92 [0.53-1.46], p90 1.6, p95 1.8, max 2.0 | 1.03 |
| stratum:motion_low | 5 | 0 | n/a | 0% (0-79, n=1) | unavailable (fewer than 5 matched balls) | n/a |


## 3. Is the circle-fit independent?

Independence test of the circle-fit (copied from tools/44-round6.mjs) against manual annotation. Seeds come from the ANNOTATION here, which the training code could not do (it seeded from ball-5's proposal and kept a circle only if it agreed with that proposal).

From the code:
- seeded by the ball-5 detector's proposal (window centred on it, search radius max(8, 0.6 x the proposal's width))
- kept only if support >= 0.7 AND the circle's centre is within r + 2 px of the proposal AND its size is 0.6 to 1.9 times the proposal's: selected for agreement with the detector
- cannot find a ball the detector did not propose, so it says nothing about missed balls or false positives
- ball-6 was trained on boxes drawn from these circles on 8 clips

- Seed stability: 18 frames could be tested (11 excluded: ball too near the crop edge for a fair test); 18 gave a circle at the true seed; when the seed moves 8-17 px the fit moves n=139, median 15.65 [10.30-19.10], p90 34.8, p95 37.0, max 49.4 px; share landing >6 px away: 63% (55-71, n=139).
- Against manual truth: accepted by the training criterion 17% (6-39, n=18); centre error unavailable (too few) px.
- Imitation check, clips_ball6_never_saw (2 frames): model vs truth unavailable (fewer than 5 frames); circle vs truth unavailable (fewer than 5 frames); model vs circle unavailable (fewer than 5 frames).
- Imitation check, clips_ball6_trained_on (1 frames): model vs truth unavailable (fewer than 5 frames); circle vs truth unavailable (fewer than 5 frames); model vs circle unavailable (fewer than 5 frames).

if model_vs_circle is much smaller than model_vs_truth and circle_vs_truth on the clips ball-6 trained on, but not on clips it never saw, the agreement is imitation, not independent confirmation

## 4. Tracking (three separate evaluations)

Source: ball-6 detections (score >= 0.25), pinned windows. Clips: IMG_4839, IMG_4840, IMG_4851, IMG_4866, IMG_4867, IMG_4872, IMG_4873, IMG_4874.

### Coverage and gaps (descriptive; not recall)

| Clip | Role | Frames | Share with a box | Frames with 2+ boxes | Runs >=6 | Run length median / p90 | Short gaps median / p90 | Most repeated box spot (a static false box if large) |
|---|---|---|---|---|---|---|---|---|
| IMG_4839 | dev | 5284 | 45% | 5 | 95 | 18 / 50 | 3 / 8 | (180, 168): 39 frames (0.7%), median width 24, score 0.84 |
| IMG_4840 | dev | 5200 | 44% | 8 | 83 | 22 / 45 | 3 / 7 | (192, 168): 32 frames (0.6%), median width 23, score 0.73 |
| IMG_4851 | dev | 3881 | 35% | 3 | 65 | 17 / 32 | 3 / 7 | (192, 180): 44 frames (1.1%), median width 19, score 0.74 |
| IMG_4866 | dev | 4417 | 40% | 10 | 70 | 20 / 41 | 4 / 6 | (192, 168): 25 frames (0.6%), median width 23, score 0.90 |
| IMG_4867 | dev | 3858 | 33% | 14 | 57 | 16 / 35 | 2 / 6 | (192, 168): 20 frames (0.5%), median width 23, score 0.82 |
| IMG_4872 | validation | 4383 | 39% | 14 | 86 | 15 / 35 | 2 / 7 | (192, 168): 20 frames (0.5%), median width 23, score 0.75 |
| IMG_4873 | validation | 4352 | 72% | 294 | 91 | 19 / 58 | 2 / 5 | (180, 192): 1815 frames (41.7%), median width 11, score 0.50 |
| IMG_4874 | diagnostic_regression | 4738 | 30% | 5 | 73 | 14 / 29 | 1 / 7 | (192, 168): 30 frames (0.6%), median width 24, score 0.82 |

### Interpolation: hide k frames, reconstruct from before AND after (reference = the detector's own observation)

**30fps, all clips pooled** (per-role cells are in the JSON; k and region are never pooled). Median error px [p95, max] per method. Points inside a flight overlap, so intervals in the JSON are cluster bootstraps by flight and the honest sample size is the flight count:

| Region | k | n points (independent flights) | linear | constant_velocity | constant_acceleration |
|---|---|---|---|---|---|
| near_rim | 1 | 9764 (638 flights) | 0.69 [2.1, 14] | 1.25 [3.5, 17] | 0.53 [1.9, 9] |
| near_rim | 2 | 18614 (601 flights) | 1.16 [3.2, 20] | 1.91 [4.9, 24] | 0.62 [2.6, 13] |
| near_rim | 3 | 26631 (572 flights) | 1.80 [4.8, 30] | 2.67 [6.9, 35] | 0.74 [3.5, 18] |
| near_rim | 4 | 33892 (548 flights) | 2.60 [6.9, 37] | 3.53 [9.3, 43] | 0.87 [4.6, 23] |
| near_rim | 5 | 40410 (525 flights) | 3.55 [9.3, 47] | 4.47 [11.8, 51] | 1.00 [5.9, 28] |
| near_rim | 6 | 46206 (496 flights) | 4.67 [12.1, 54] | 5.51 [14.6, 58] | 1.16 [7.3, 33] |
| free_flight | 1 | 1687 (183 flights) | 0.81 [2.0, 6] | 1.44 [3.4, 7] | 0.71 [1.8, 4] |
| free_flight | 2 | 2960 (169 flights) | 1.23 [2.8, 8] | 2.13 [4.9, 9] | 0.78 [2.0, 6] |
| free_flight | 3 | 3870 (163 flights) | 1.85 [4.0, 12] | 2.96 [6.6, 14] | 0.88 [2.3, 6] |
| free_flight | 4 | 4428 (150 flights) | 2.67 [5.5, 12] | 4.03 [8.6, 19] | 0.97 [2.7, 6] |
| free_flight | 5 | 4710 (138 flights) | 3.78 [7.3, 16] | 5.40 [11.3, 22] | 1.09 [3.2, 9] |
| free_flight | 6 | 4746 (122 flights) | 5.15 [9.3, 20] | 6.88 [13.8, 25] | 1.17 [3.7, 9] |

**15fps, all clips pooled** (per-role cells are in the JSON; k and region are never pooled). Median error px [p95, max] per method. Points inside a flight overlap, so intervals in the JSON are cluster bootstraps by flight and the honest sample size is the flight count:

| Region | k | n points (independent flights) | linear | constant_velocity | constant_acceleration |
|---|---|---|---|---|---|
| near_rim | 1 | 4287 (500 flights) | 2.18 [5.9, 31] | 4.18 [9.7, 36] | 0.71 [4.6, 29] |
| near_rim | 2 | 7848 (455 flights) | 4.22 [10.6, 41] | 6.70 [14.8, 46] | 0.98 [7.7, 28] |
| near_rim | 3 | 10716 (415 flights) | 6.63 [16.3, 60] | 9.34 [20.5, 61] | 1.30 [11.7, 36] |
| near_rim | 4 | 12912 (376 flights) | 9.29 [23.3, 74] | 11.94 [26.1, 69] | 1.75 [15.8, 44] |
| near_rim | 5 | 14510 (331 flights) | 12.12 [30.2, 92] | 14.18 [32.3, 76] | 2.40 [19.7, 52] |
| near_rim | 6 | 15660 (294 flights) | 14.79 [37.3, 106] | 16.42 [39.5, 92] | 3.34 [24.2, 60] |
| free_flight | 1 | 500 (137 flights) | 2.18 [4.1, 7] | 4.48 [8.1, 16] | 0.81 [2.0, 4] |
| free_flight | 2 | 704 (102 flights) | 4.37 [7.1, 12] | 7.60 [12.2, 16] | 0.90 [2.7, 6] |
| free_flight | 3 | 732 (70 flights) | 7.20 [11.3, 18] | 11.22 [18.0, 27] | 1.08 [3.6, 8] |
| free_flight | 4 | 680 (48 flights) | 11.48 [17.4, 25] | 16.04 [26.3, 36] | 1.23 [4.4, 11] |
| free_flight | 5 | 600 (38 flights) | 16.64 [24.8, 33] | 21.71 [36.5, 51] | 1.64 [5.7, 16] |
| free_flight | 6 | 486 (28 flights) | 22.66 [33.8, 42] | 28.95 [47.7, 60] | 2.00 [7.1, 17] |

### Prediction: predict h frames ahead from the past only

**30fps, all clips pooled** (per-role cells are in the JSON; k and region are never pooled). Median error px [p95, max] per method. Points inside a flight overlap, so intervals in the JSON are cluster bootstraps by flight and the honest sample size is the flight count:

| Region | h | n points (independent flights) | last_value | constant_velocity | constant_acceleration |
|---|---|---|---|---|---|
| near_rim | 1 | 10244 (672 flights) | 6.93 [19.3, 30] | 1.41 [4.5, 35] | 1.75 [6.7, 34] |
| near_rim | 2 | 9764 (638 flights) | 13.55 [38.1, 58] | 3.48 [9.6, 60] | 4.20 [17.0, 82] |
| near_rim | 3 | 9307 (601 flights) | 19.65 [55.8, 84] | 6.61 [17.3, 92] | 7.77 [32.4, 164] |
| near_rim | 4 | 8877 (572 flights) | 25.62 [72.8, 108] | 10.78 [26.5, 124] | 12.38 [52.3, 278] |
| near_rim | 5 | 8466 (548 flights) | 31.07 [89.1, 133] | 15.98 [37.9, 157] | 18.32 [77.0, 419] |
| near_rim | 6 | 8064 (525 flights) | 36.38 [104.6, 156] | 22.11 [50.4, 189] | 25.37 [105.5, 588] |
| free_flight | 1 | 1913 (197 flights) | 11.83 [18.6, 27] | 1.60 [3.9, 12] | 2.33 [6.0, 14] |
| free_flight | 2 | 1687 (183 flights) | 23.30 [36.5, 45] | 3.65 [8.6, 25] | 5.47 [14.5, 40] |
| free_flight | 3 | 1480 (169 flights) | 34.26 [53.7, 63] | 6.75 [15.7, 37] | 10.07 [27.2, 70] |
| free_flight | 4 | 1290 (163 flights) | 44.69 [70.3, 83] | 11.00 [24.2, 52] | 15.89 [45.0, 107] |
| free_flight | 5 | 1114 (150 flights) | 54.04 [85.3, 104] | 16.46 [34.7, 102] | 22.67 [70.9, 151] |
| free_flight | 6 | 960 (138 flights) | 62.99 [100.6, 124] | 23.34 [50.8, 133] | 31.60 [103.9, 199] |

**15fps, all clips pooled** (per-role cells are in the JSON; k and region are never pooled). Median error px [p95, max] per method. Points inside a flight overlap, so intervals in the JSON are cluster bootstraps by flight and the honest sample size is the flight count:

| Region | h | n points (independent flights) | last_value | constant_velocity | constant_acceleration |
|---|---|---|---|---|---|
| near_rim | 1 | 4661 (541 flights) | 13.31 [38.1, 60] | 4.41 [12.0, 62] | 2.37 [16.4, 89] |
| near_rim | 2 | 4287 (500 flights) | 25.51 [72.7, 111] | 12.76 [31.6, 123] | 6.13 [47.7, 235] |
| near_rim | 3 | 3915 (455 flights) | 36.11 [104.0, 153] | 24.93 [56.2, 187] | 12.27 [94.1, 438] |
| near_rim | 4 | 3543 (415 flights) | 44.86 [131.2, 191] | 40.79 [85.9, 252] | 21.71 [151.3, 700] |
| near_rim | 5 | 3172 (376 flights) | 53.35 [152.6, 222] | 59.56 [118.3, 317] | 34.46 [219.5, 1019] |
| near_rim | 6 | 2826 (331 flights) | 60.19 [172.6, 248] | 80.16 [153.2, 373] | 50.34 [308.3, 1400] |
| free_flight | 1 | 682 (160 flights) | 22.70 [35.4, 42] | 4.16 [8.8, 20] | 2.69 [7.9, 21] |
| free_flight | 2 | 500 (137 flights) | 42.84 [68.5, 83] | 12.48 [22.6, 38] | 6.64 [25.2, 52] |
| free_flight | 3 | 361 (102 flights) | 58.47 [92.4, 123] | 25.66 [43.9, 111] | 13.18 [60.3, 134] |
| free_flight | 4 | 273 (77 flights) | 70.17 [110.9, 138] | 44.07 [118.0, 162] | 22.66 [143.5, 197] |
| free_flight | 5 | 226 (65 flights) | 73.22 [128.3, 142] | 70.23 [164.1, 212] | 38.33 [202.4, 261] |
| free_flight | 6 | 196 (57 flights) | 75.12 [132.8, 166] | 102.37 [203.5, 268] | 80.69 [287.1, 344] |

### Association (SYNTHETIC distractors; real-data association is unavailable)

**30fps**: SYNTHETIC distractors (static blob, second ball, slow mover) added to real runs; seeded

| Distractor | Method | Right ball | Wrong ball (identity switch) | No pick |
|---|---|---|---|---|
| none | last | 100.0% | 0.0% | 0.0% |
| none | constant_velocity | 100.0% | 0.0% | 0.0% |
| none | constant_acceleration | 100.0% | 0.0% | 0.0% |
| static_blob | last | 97.6% | 2.4% | 0.0% |
| static_blob | constant_velocity | 100.0% | 0.1% | 0.0% |
| static_blob | constant_acceleration | 99.9% | 0.1% | 0.0% |
| second_ball | last | 97.8% | 2.3% | 0.0% |
| second_ball | constant_velocity | 100.0% | 0.0% | 0.0% |
| second_ball | constant_acceleration | 99.9% | 0.1% | 0.0% |
| slow_mover | last | 97.8% | 2.2% | 0.0% |
| slow_mover | constant_velocity | 99.9% | 0.1% | 0.0% |
| slow_mover | constant_acceleration | 100.0% | 0.1% | 0.0% |
| adjacent_blob | last | 51.5% | 48.5% | 0.0% |
| adjacent_blob | constant_velocity | 97.6% | 2.4% | 0.0% |
| adjacent_blob | constant_acceleration | 96.4% | 3.6% | 0.0% |
| near_duplicate | last | 77.7% | 22.3% | 0.0% |
| near_duplicate | constant_velocity | 99.0% | 1.0% | 0.0% |
| near_duplicate | constant_acceleration | 97.5% | 2.5% | 0.0% |

**15fps**: SYNTHETIC distractors (static blob, second ball, slow mover) added to real runs; seeded

| Distractor | Method | Right ball | Wrong ball (identity switch) | No pick |
|---|---|---|---|---|
| none | last | 100.0% | 0.0% | 0.0% |
| none | constant_velocity | 100.0% | 0.0% | 0.0% |
| none | constant_acceleration | 100.0% | 0.0% | 0.0% |
| static_blob | last | 91.7% | 8.3% | 0.0% |
| static_blob | constant_velocity | 99.5% | 0.5% | 0.0% |
| static_blob | constant_acceleration | 99.2% | 0.8% | 0.0% |
| second_ball | last | 91.3% | 8.7% | 0.0% |
| second_ball | constant_velocity | 99.6% | 0.4% | 0.0% |
| second_ball | constant_acceleration | 99.0% | 1.1% | 0.0% |
| slow_mover | last | 92.1% | 7.9% | 0.0% |
| slow_mover | constant_velocity | 99.5% | 0.5% | 0.0% |
| slow_mover | constant_acceleration | 99.5% | 0.5% | 0.0% |
| adjacent_blob | last | 29.7% | 70.3% | 0.0% |
| adjacent_blob | constant_velocity | 92.6% | 7.4% | 0.0% |
| adjacent_blob | constant_acceleration | 94.8% | 5.2% | 0.0% |
| near_duplicate | last | 68.8% | 31.2% | 0.0% |
| near_duplicate | constant_velocity | 90.6% | 9.4% | 0.0% |
| near_duplicate | constant_acceleration | 93.7% | 6.3% | 0.0% |

## 5. Performance and deployment

Measured on: Intel(R) Core(TM) i5-4278U CPU @ 2.60GHz, 4 cores, 8 GB (DESKTOP, not a phone).
- App constants (from source): {"loop_fps_target":15,"slow_fps_floor":null,"no_ball_warning_ms":60000,"replay_frame_px":288,"replay_jpeg_quality":0.6,"motion_threshold":6,"still_hold_ms":1500}
- Model 3.65 MB; runtime wasm ort-wasm-simd-threaded.asyncify.wasm 26.8 MB, ort-wasm-simd-threaded.wasm 14.2 MB.
- Offline inference (desktop, 1 WASM thread): median 119.3 ms, p95 126.1 ms over 112 frames. a desktop CPU is far faster than an iPhone; use only as a relative baseline for 'did a change make inference slower'
- Motion gate (model runs per 15 fps frame): 0.83 to 1.00. the model is sent most frames on these clips: plan for near-continuous inference, not for a mostly idle model
- Replay buffer: DERIVED from source constants, not measured: frames kept for the 6 s replay about 1.4 MB.
- Phone (documented, not reproduced): ball-5 (same architecture and size as ball-6): 20.5 fps in minute 1, 15.3 in minute 5, 12.1 in minute 10; model time per frame 39 ms rising to 68 ms; average 15.4 fps; speed fell steadily with heat. Source: training/README.md, 'First 10-minute live soak on Matt's iPhone (2026-10-06)'.
- Phone ball-6 soak: **unavailable** (no 10-minute soak with ball-6 and the current app has been run on a phone). Phone memory: **unavailable** (iOS Safari exposes no per-page memory; desktop Chromium numbers below are not phone numbers). Field speed: **unavailable** (camera_report (migration 0022, live) now records average and slowest fps per saved set; no sets saved since, so there is nothing to read yet).
- App in desktop Chromium: {"measured_on":"desktop Chromium (headless, software WASM), fake camera playing a saved clip","seconds_observed":40,"model_runs":243,"model_runs_per_second":5.820468720169035,"ms_between_model_runs":{"median":167.95749974250793,"p95":199.10350034236907,"max":280.1150002479553},"js_heap_bytes":{"before_counting":16032071,"end":24816199,"max":34165785},"chrome_total_rss_bytes":{"before_counting":898985984,"end":1205936128,"max":1205936128},"caution":"desktop browser; RSS covers every Chrome process on the machine at the time. Phone memory and speed are unavailable."}

## Unavailable metrics

- **association accuracy on real footage**: no identity annotations exist; the synthetic distractor results above are NOT a measure of real-world association
- **full-trajectory fit error**: there is no tracker yet (Experiment 1); interpolation above is the reconstruction measure available today
