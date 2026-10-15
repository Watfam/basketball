# Experiment 2: expanded flight visibility and full-shot observation

**Verdict: no phone-compatible detection strategy met the registered bar, and nothing was integrated.** The app, ball-6, V4, the hoop
window, the auto-sizer, the review screen, `thresholds.json`, baseline-v0 and the production shot grouping are unchanged
(`git diff` of `src/` and `public/` is empty; app tests 93/93, harness tests 47/47, experiment tests 65/65; `datasets.lock.json` hashes unchanged).

Existing footage only, nothing new recorded. Every number is a **re-test on recordings seen before**: no untouched footage, ball-6 saw all of them in training except
IMG_4874, and 69 sampled shots over 8 clips is a small sample. Image-space measurements only (base-window pixels), never metres, angles or 3D.
Criteria were registered before any expanded detection existed (`criteria.json`, commit 0309ba2); `evaluate.mjs` applies them mechanically; this experiment is not adaptive.
What was added afterwards is labelled **exploratory** or **post hoc** below.

## The main finding

The release and the early flight are **in the footage but outside the processing window**, and the camera does not cut them off.
Where a larger window helps, it helps the **apex and the length of observed flight**, not the release, and the release is not recoverable with a window alone
because the held ball is the weak link for the detector.

## 1. Inventory of the recordings and framings

All clips are 1920x1080, 29.97 or 30 fps, landscape, mostly 2-3 minutes (a few are much longer), one phone on a tripod; 18 recordings exist (IMG_4824-4874, B1689585).
Eight have saved ball-6 detections and a written shot list and are used (shot sample: 69 matched shots, every k-th, at most 10 per clip).

| Clip | Session | Production window (native px) | Window share of frame | Ball in window | Notes |
|---|---|---|---|---|---|
| IMG_4839, 4840 | S4 | 416 at x1.00 | 8.3% | about 24 px | shooter left of the hoop, ball released above and left of the window |
| IMG_4851 | S5 | 516 at x1.24 | 12.8% | about 24 px | side-on to the hoop (oval rim) |
| IMG_4866 | S6 | 790 at x1.90 | 30% | about 24 px (46 native) | camera close to the hoop, wide window |
| IMG_4867 | S6 | 416 at x1.00 | 8.3% | about 24 px | |
| IMG_4872 | S7 | 416 at x1.00 | 8.3% | about 24 px | |
| IMG_4873 | S7 | 672 at x1.62 | 22% | 12-15 px | shooter 600+ px right and far from the camera; the rim phantom clip |
| IMG_4874 | S7 | 416 at x1.00 | 8.3% | about 24 px | diagnostic clip |
| not used | | IMG_4836, 4844 (second camera position, 832 at x2), 4824-4835, B1689585 | | | no detections or no shot list |

Window origin and size are in `datasets.json`; the app receives 1280x720 frames in the field, so window pixels do not transfer, only the ball size in the window (about 24 px) does.

## 2. Visual-coverage assessment of the original full frames

Method: gridded full frames at F-60, F-45, F-30 and F-15 of ten shots (40 frames) were annotated blind (`recall-annotations.json`), plus contact sheets of ten clips with the window drawn on them.

| Question | Answer from the footage |
|---|---|
| Shooter and release visible? | Yes in every clip viewed: the shooter is fully inside the 1920x1080 frame, the ball leaves the hands in view. |
| Full flight visible? | Yes. The ball path from release to rim is inside the frame in every clip. |
| Apex inside the frame? | Yes. The highest observed ball position is native y = 71 px (IMG_4866), most apexes between 130 and 390 px. Of 1,866 chain points, 1 lies within 15 px of the frame edge. |
| Does the ball leave the field of view? | Essentially never during a shot (1 of 1,866 points near an edge: a dribble at the bottom edge). It is a **window limitation, not a field-of-view limitation**. |
| Does the shooter block the ball? | Rarely in flight. Held against the chest or behind the body the ball is partly hidden: 7 of 40 annotated frames show no ball at all (hidden, or not yet in play; cause not separable). |
| Does the window exclude useful observations? | Yes. 22 of the 33 annotated balls lie **outside** the production window, and the production window detected none of them (0/22). 35 of 52 launch events (67%) lie outside it. |
| Ball size through the flight | In window units the ball is 24-26 px at the rim, 26-36 px at the apex, and at launch a median 1.2x the rim size (p10 0.9x, p90 2.1x): it is largest when the shooter is nearer the camera. |
| Do framings need different strategies? | Yes, in degree. IMG_4866 (wide window) already sees apex in 5/10 shots with the production window; the 416 px clips see 1-3 of 8-10; IMG_4873 (far shooter, ball 12-15 px) sees none under any strategy. |

## 3. Strategies compared (30 fps; 15 fps in `results/verdict.json`)

Pooled over 69 shots, 8 clips; chains are `cv_nearest` tracks over each strategy's own detections. `runs` is inferences per processed frame.
Registered definitions: release needs observed held points directly followed by observed airborne points; apex needs observed points on both sides of an interior minimum (never a fitted parabola).

| Strategy | Runs | Release | Apex | Rim approach | Continuous flight | Reconstruction-eligible | Chains per shot |
|---|---|---|---|---|---|---|---|
| **S0 fixed production window** | 1 | 2.9% | 26.1% | 60.9% | 78.3% | 31.9% | 1.14 |
| A1 window x1.5 | 1 | 4.3% | 49.3% | 60.9% | 76.8% | 55.1% | 1.35 |
| **A2 window x2.0** | 1 | 5.8% | **58.0%** | 60.9% | 73.9% | **62.3%** | 1.60 |
| A3 full frame at 416 (reference) | 1 | 0.0% | 30.4% | 20.3% | 23.2% | 27.5% | 1.69 |
| B second window, best by dev (left) | 2 | 4.3% | 29.0% | 60.9% | 72.5% | 27.5% | 1.60 |
| B up (the "window above the hoop" idea) | 2 | 2.9% | 33.3% | 59.4% | 78.3% | 42.0% | 1.56 |
| C dynamic, follow | 1 | 2.9% | 23.2% | 40.6% | 65.2% | 29.0% | 1.37 |
| C dynamic, scan | 1 | 4.3% | 40.6% | 44.9% | 63.8% | 39.1% | 1.92 |
| D nine tiles at the expected scale | 9 | 7.2% | 52.2% | 60.9% | 71.0% | 50.7% | 2.58 |
| post hoc: production window plus A2 | 2 | 5.8% | 59.4% | 60.9% | 72.5% | 60.9% | 2.32 |

At 15 fps the picture is the same with lower rim approach (S0 39%: three descending points are rarer), apex 22% to 57% for A2, release 3-7% for all.

| Criterion (registered) | A1 | A2 | base + A2 (post hoc) | D (research only) |
|---|---|---|---|---|
| X2 release at least 50% and +25 points | fail | fail | fail | fail |
| X3 apex +20 points | pass | pass | pass | pass |
| X4 rim approach not lost | pass | pass | pass | pass |
| X5 keeps 95% of confident base-window detections | **fail 54%** | **fail 53%** | pass 100% | pass 99.9% |
| X6 recall: outside +15 points, inside not lower | pass | pass | pass | pass |
| X7 precision of extra detections at least 90% | pass 40/40 | pass 37/40 | pass 37/40 | **fail 31/40** |
| X8 continuous flight +20 points | fail | fail | fail | fail |
| X9 reconstruction-eligible at least 70% | fail 55% | fail 62% | fail 61% | fail 51% |
| X10 at most one extra inference | pass | pass | pass | **fail (9 runs)** |

Same pattern at 15 fps. **No strategy is recommended by the registered rule.** B and C fail on apex or retention as well (all in `results/verdict.json`).

Recall on the 33 annotated balls at 30 fps (inside / outside the production window): S0 7/11 and 0/22; A1 10/11 and 9/22; A2 10/11 and 10/22; A3 9/11 and 18/22; D 10/11 and 19/22; B left 10/11 and 7/22; C follow 9/11 and 5/22; C scan 8/11 and 15/22.
Precision review (40 per pool, by eye): A1 40/40 ball, A2 37/40 (a hole in the backboard and an arm), A3 38/40, tiles 31/40 (arms, a leaf, sky, net; 2 unsure), about 0.21 non-ball extras per processed frame for D against 0.03 for A2.
B and C extras are judged by the nine-tile pool as a proxy (their detections are a subset of it).

What the table says plainly:
- **A larger window is not automatically better.** At x1.5 and x2.0 the detector keeps only about half of the confident ball detections it makes inside the production window (the ball shrinks to 16 and 12 px), while gaining the ones outside. Production window plus A2 keeps both.
- **A second window stacked above the hoop does not fix release visibility**: B up reaches 2.9% release, 33% apex. The release is mostly **beside and below** the production window (shooter standing left or right of the hoop), so "up" is the wrong direction for most clips, and B left, the best by development counts, gains little (4.3%, 29%).
- **The full frame at 416 is the wrong scale** (ball 5-10 px): precise enough to find a large ball (18/22 annotated outside balls) but it loses the ball near the rim (rim approach 20% against 61%) and breaks chains.
- **Dynamic windows only help if the policy knows where to look.** Follow cannot find the ball it has not seen yet; scan finds it half the time and costs rim approach (45% against 61%).
- X8 (continuity) is a **registered metric that penalises longer chains**: a window that starts the chain 15 frames earlier has more room for gaps. It fails everywhere for that reason as much as for any loss. Gap counts rise with chain length (S0 21 gaps, mean 2.3 frames, max 8; A2 45 gaps, mean 2.0, max 7). I did not change it after seeing it.

## 4. Release detection: is it feasible from this footage?

Under the registered definition the release is observed in 3-7% of shots for every strategy, because it needs the **held ball** (three or more observed slow points) to be detected and tracked into the launch. The detector rarely sees a ball pressed against a shooter.
Exploratory, same chains, looser definition (**not registered, not a criterion**; `release-explore.json`): a launch is a fast point (at least 10 px per reference frame) preceded by a slow one and followed by upward motion.

| | S0 | A1 | A2 | D | B left |
|---|---|---|---|---|---|
| shots with a launch event (of 69) | 26 | 45 | 52 | 41 | 26 |
| chain begins this many frames before the first rim sighting (median) | 12 | 27 | 30 | 29 | 12 |

So a 2x window finds a launch-like event in about three quarters of shots (52 of 69) and observes the flight about 2.5 times longer (30 against 12 frames).
Plausibility by eye of 10 randomly drawn A2 launch events (contact strips, one annotator, **not ground truth**): 6 coincide with the ball leaving the hands within about 3 frames, 3 fire after the ball is already airborne, and 1 is a dribble. That suggests roughly 45% of shots (6 in 10 of the 75%), not 75%, have a usable release event; from n=10, so an indication only.
Registered release-time estimators (speed crossing and a backward arc fit) agree within 2 frames on every release-observed shot (4-5 shots for A2), but both read the same airborne points, so that agreement is not independent evidence of accuracy.
At 30 fps one frame is 33 ms; I make no claim finer than that, and no claim about release angle, height or position in metres. In base-window pixels, release **location** is available only for the minority of shots with a real release event.

Feasibility conclusion: **release timing and location are feasible for a minority of shots with a larger window, not yet reliably repeatable, and not supportable by the current detector alone**. The shooting arm and hands are visible in the full frames, but nothing here detects them.

## 5. Trajectory completeness (30 fps)

Observed positions only, nothing interpolated or fitted. Production window against the 2x window against the nine-tile bound:

| | S0 | A2 | D |
|---|---|---|---|
| release observed (registered) | 2.9% | 5.8% | 7.2% |
| apex observed | 26.1% | 58.0% | 52.2% |
| rim approach observed | 60.9% | 60.9% | 60.9% |
| continuous flight (gaps of at most 2 frames) | 78.3% | 73.9% | 71.0% |
| no gap at all | 48/69 | 45/69 | 38/69 |
| reconstruction-eligible (8+ observed flight points, rising and falling sides, gaps of at most 3) | 31.9% | 62.3% | 50.7% |
| gaps (count, mean, max in frames) | 21, 2.3, 8 | 45, 2.0, 7 | 34, 2.5, 8 |

Per clip (apex S0 / A2 / D out of the shots; the big gains are on the 416 px clips): 4839 3/5/5 of 10; 4840 1/8/8 of 8; 4851 2/5/6 of 9; 4866 5/7/7 of 10; 4867 2/4/2 of 8; 4872 4/4/4 of 8; **4873 0/0/0 of 6**; 4874 1/7/4 of 10. IMG_4873 does not benefit because its ball is 12-15 px; IMG_4872 gains nothing.

## 6. What expanded visibility does for tracking (Experiment 1 reused)

The simple constant-velocity nearest-neighbour associator (`cv_nearest`) was the reference; the Kalman and ballistic tracker was **not** re-run (Experiment 1 gave it no measurable edge, and no criterion here needed it).
- More observations do **not** reduce fragmentation: chains per shot rise from 1.14 (S0) to 1.60 (A2) and 2.58 (D), because the larger views see the shooter's earlier dribbles, rebounds and other people's balls, which become extra tracks. The chain that reaches the rim is not shorter or worse for it; it starts about 18 frames earlier.
- Tracks now cross the production window boundary, so a tracker or shot machine fed these detections needs the base-window coordinate mapping used here (native to window units).
- A longer, earlier chain is what makes apex and trajectory reconstruction possible; fragmentation matters less than that.

## 7. Cost and compatibility

| Strategy | Inferences per processed frame | Desktop latency (this Mac, WASM, one thread) | Documented phone figure (ball-5, same architecture) |
|---|---|---|---|
| S0, A1, A2, A3, C | 1 | about 120 ms | 39-68 ms, rising with heat |
| B, base + A2 | 2 | about 240 ms | 78-136 ms: below 15 fps in a 66 ms loop |
| D | 9 | about 1.1 s | not feasible |

The motion gate opens on 83-100% of frames on these clips, so a second inference cannot be skipped on a still scene. Desktop numbers are not phone numbers.

Reading `src/lib/vision/{roi,counting,autoSize,shotRules}.ts` and the engine: any square window is cheap to cut (`cropAround`), but
(1) the auto-sizer sets the window so the ball measures 23.7 px, so it would shrink an x2 window back unless the experimental window is a separate, fixed multiple of the sized window;
(2) the counting core and V4 hold **one** window and constants in its pixels, so a second window needs its boxes mapped into base-window units (done here, `u = (native - origin) / scale`) before reaching the unchanged rule;
(3) the engine takes one 416 input per call and a second call doubles the model time;
(4) nothing about replay buffer or the review screen needs to change for an experimental, flag-gated second window.
A flag-gated side pipeline that never feeds the shot rule is compatible with the app as it stands.

## 8. Recommended detection architecture

1. **Keep the production fixed window exactly as it is** for counting and V4 (no change; it retains every confident detection by definition).
2. **If more of the shot is wanted, add one experimental context window**: a second inference on a rim-centred window at 2x the sized window, run only for flight recording, never feeding V4. Post hoc evidence (production window plus A2): apex 59% against 26%, reconstruction-eligible 61% against 32%, precision 37/40, rim approach unchanged, all production detections kept. It costs a second inference, so run it every other frame or only while the motion gate is open and a ball has been seen, and measure the phone first.
3. **Do not build** a stacked window above the hoop, a scanning window, nine tiles or a full-frame pass: none earned its cost here.
4. **Release is a different problem**: its region is the shooter, not the rim. It needs either a window anchored to the shooter (found from the ball or a person detection) or a detector that sees held balls, and probably both.

## 9. Remaining limitations

- 69 shots, 8 clips, one annotator, ball-6 trained on 7 of the 8 clips; no untouched footage; so every figure is a re-test.
- Detections exist only for frames F-75 to F+15 of each sampled shot; a release earlier than that on a long arc would be missed by every strategy equally.
- The registered release and continuity definitions are strict (release) or length-biased (continuity); the exploratory launch counts use looser definitions and are not criteria.
- IMG_4873 (far shooter, phantom at the rim) is a different regime and gains nothing from any window.
- Recall is on 33 annotated balls in 40 frames; X6 passes on a small sample. A re-check of 12 annotations on circled crops found centres within about 20 px of the ball, loose for partly hidden held balls (R26, R34, R35), so a few matches at the 18 px radius may be missed or lucky.
- Tile positions are relative to the production window, which the real auto-sizer chooses itself; 1920x1080 footage against 1280x720 live frames; desktop timings.
- Coaching measures stay image-space: no calibration, so no angles or distances. Flight-path consistency, apex and rim-approach position are the measurements this footage supports now; release consistency, form and lateral alignment at release are **not** yet supported.

## 10. Recommendation: what to implement next

**Implement a flag-gated, non-production context window (production window plus one 2x rim-centred window, flight recording only), measure it on a phone for latency and heat, and record real sessions with it before deciding anything about the shot rule.**
Do not claim release metrics yet. The next experiment on release should anchor a window to the shooter and test held-ball detection (the training set has few held balls), using the clips here only as a development set.
That order matches the goal: first let the system see the apex and the first half of the flight, then ask it to reason about the shot.

Files: `criteria.json`, `ARCHITECTURE.md`, `gen-tiles.mjs`, `strategies.mjs`, `metrics.mjs`, `run.mjs`, `evaluate.mjs`, `release-explore.mjs`, `launch-check.mjs`, `launch-stats.mjs`, `visibility.test.mjs`; results in `results/` (`verdict.json` has every per-clip table at both frame rates). Raw tile detections, frames and review crops stay local in `training/work/exp2/` (footage of Matt's kids is never committed).
