# baseline-v0: what it says (hand-written; numbers are from baseline-v0.json)

Current system: ball-6, rule V4, existing hoop window, pinned windows (the live auto-sizer is not simulated). Generated 2026-10-14, code
152881a. Two full runs produce identical JSON apart from the timestamp. No untouched final test set exists.

## Shot classification (right calls out of ALL written shots)

| | ball-6 30 fps | ball-6 15 fps | ball-5 30 fps (reference) |
|---|---|---|---|
| 8 clips, 178 shots | **159 (89%, 84-93)** | **159 (89%, 84-93)** | 163 (92%, 87-95) |
| dev (6 clips, 113) | 107 (95%) | 106 (94%) | 106 (94%) |
| validation (4872, 4873; 45) | 34 (76%) | 35 (78%) | 41 (91%) |
| IMG_4874 (20) | 18 (90%) | 18 (90%) | 16 (80%) |

Not scored: IMG_4836 (no saved detections), IMG_4844 (two camera positions need a segment spec). Clip-level bootstrap interval for mean V4
accuracy: 77-96%. Detector is in-sample on every clip except IMG_4874.

**Why ball-6 does not beat ball-5 in the pooled count: one clip.** Without IMG_4873, ball-6 is right on 148 of 156 shots and ball-5 on
143 of 156. On IMG_4873 ball-6 counts only 11 of 22 shots (ball-5: 24 candidates, 20 right). Root cause, found by the harness's static-box
diagnostic: **ball-6 puts a small false box (median width 11 px, score 0.50) on the rim at (180, 192) in 1,815 frames, 41.7% of the
clip**. Every other clip's most repeated box spot is 0.5-1.1% of frames. A phantom on the rim keeps the rim zone occupied, so
consecutive shots merge into one. IMG_4873 is the iPhone 1x lens (larger hoop, about 1.6x the training scale), the most phone-like
framing in the set. Hypothesis, not proven: Matt's real sessions on the 1x lens may hit the same thing (the unexplained 53% ringed rate).
Next experiment candidate: a minimum box size, and rim/net negatives at this scale. Not started.

## Detection on 88 blind-annotated frames (single AI annotator, medium and high confidence)

Clips ball-6 never trained on (56 frames, 24 balls): recall **67% (47-82)**, precision **100% (81-100, 16 boxes)**, centre error median
**0.81 px (0.61-1.18)**, p95 1.7 px, box width 1.02x the ball. The only random strata are `motion_high` (8 balls: recall 75%, 41-93) and
`motion_low` (no balls); `detector_gap` (0 of 6) and `detector_boxed` (10 of 10) are targeted by construction and are not rates.
Annotation repeatability: median 0.5 px on 5 comparable pairs, optimistic (same annotator, same session). Treat sub-pixel claims as
unproven.

## Circle-fit is not independent ground truth

Seeded by the ball-5 proposal and kept only if it agrees with it (from the code). On annotated frames it followed its seed: moving the
seed 8-17 px moved the fit a median of 15.7 px (63% of shifted fits landed more than 6 px from the true-seed fit), and at the true seed
it passed the training criterion on 3 of 18 testable frames (17%, 6-39%). The imitation question (is ball-6 closer to the circle-fit than
to the truth on clips it trained on) is **unavailable**: too few accepted frames.

## Tracking (reference = the detector's own observation, noise about 0.6 px; points are overlapping windows, intervals are by flight)

Interpolation, near the rim, all clips, median px [p95] for k hidden frames (k = 1 / 3 / 6; 638 / 572 / 496 independent flights at 30 fps):

| | linear | constant velocity | constant acceleration |
|---|---|---|---|
| 30 fps, k=1 | 0.69 [2.1] | 1.25 [3.5] | **0.53 [1.9]** |
| 30 fps, k=3 | 1.80 [4.8] | 2.67 [6.9] | **0.74 [3.5]** |
| 30 fps, k=6 | 4.67 [12.1] | 5.51 [14.6] | **1.16 [7.3]** |
| 15 fps (live), k=1 | 2.18 [5.9] | 4.18 [9.7] | **0.71 [4.6]** |
| 15 fps (live), k=3 | 6.63 [16.3] | 9.34 [20.5] | **1.30 [11.7]** |
| 15 fps (live), k=6 | 14.79 [37.3] | 16.42 [39.5] | **3.34 [24.2]** |

Constant acceleration wins every cell, and the gap grows with k, as free fall curves. Its tail is the weak point: at 15 fps k=6 the p95 is
still 24 px, about a ball diameter. In free flight (k=6, 30 fps, 122 flights) it is 1.17 px [3.7] against 5.15 for linear. Nine
cells in the per-role groups are unavailable (too few independent flights, mostly free flight at 15 fps and the single diagnostic clip).

Prediction (past only), near the rim, median px [p95]:

| | last value | constant velocity | constant acceleration |
|---|---|---|---|
| 30 fps, h=1 | 6.93 [19.3] | **1.41 [4.5]** | 1.75 [6.7] |
| 30 fps, h=3 | 19.65 [55.8] | **6.61 [17.3]** | 7.77 [32.4] |
| 30 fps, h=6 | 36.38 [104.6] | **22.11 [50.4]** | 25.37 [105.5] |
| 15 fps (live), h=1 | 13.31 [38.1] | 4.41 [**12.0**] | **2.37** [16.4] |
| 15 fps (live), h=3 | 36.11 [104.0] | 24.93 [**56.2**] | **12.27** [94.1] |

At 30 fps constant velocity is best (acceleration amplifies noise). At the live 15 fps constant acceleration has the better median at short
horizons but a worse tail. No single baseline wins both: a tracker has to beat each on both median and p95. At h = 6 frames (0.2 s) the
medians are 22-36 px against a ball about 24 px wide, so extrapolating the observed path with these simple models does not locate the ball
accurately enough to predict where it will cross the rim; a better model has to beat this, and this baseline says nothing about whether one can.

Association (SYNTHETIC distractors only): with a box beside the track's last point, "nearest to last" picks the right ball 51% of the
time; constant velocity 98%, constant acceleration 96%. This is the weakest part of today's chaining (the rule follows the nearest
point within 30 px per frame). Real-footage association: **unavailable** (no identity labels).

## Candidate shots on IMG_4874: what the frames showed

The scorer's alignment skipped a real make (frame 2170) and kept a phantom (frame 2835, no ball in six frames); with the phantom removed
the 20 candidates pair with the 20 written shots in order. V4 is 18 of 20 either way, but the two wrong shots are #5 and #12, not #5 and
#13. Both are misses where the ball bounced out on the rim (frames 1082, 2512) that V4 called makes. Release is visible in one of six
annotated shots (frame about 1158); in the other five the ball is already in flight when it enters the window.

## Performance (desktop; NOT phone numbers)

Model 3.65 MB, runtime wasm 14.2 and 26.8 MB. Offline inference median **119 ms** (p95 126) on this Mac, one WASM thread. App loop in
headless Chromium with a fake camera: **5.8 model passes a second**, JS heap 16 MB at start, 25 MB after 40 s (peak 34 MB), browser RSS
about 0.9-1.2 GB across all Chrome processes. The app's motion gate lets the model run on 83-100% of 15 fps frames on these clips: plan for
near-continuous inference. Documented on Matt's iPhone with ball-5 (2026-10-06): 20.5 fps in minute 1 down to 12.1 in minute 10, 39 to 68 ms
per frame, falling with heat. Ball-6 on a phone, phone memory and field speed: **unavailable**.

## What this baseline does not let us claim

Accuracy on unseen sessions (no final test set; the detector trained on 8 of 10 clips); sizer-as-run results; any physical (metre, degree)
measurement; association accuracy on real footage; a full-trajectory reconstruction error (there is no tracker yet).
