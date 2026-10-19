# Rapid consecutive shots: accuracy, speed and what the camera can and cannot tell apart

Date 2026-10-19. Production (ball-6, V4, the grouping rule, the hoop window, the auto-sizer, the motion gate, the review screen) is unchanged in what it counts. Frozen files untouched. Criteria were written to `criteria.json` before the experiments ran.

## The short version

1. **Why a miss followed by a quick putback is one shot.** The counter groups every rim-zone sighting less than about 40 frames (1.3 s) apart into one shot. There is no ball identity, no cooldown and no notion of an attempt in it; it is one timer. Two attempts closer than 1.3 s are one shot, and the result is decided from a window that starts at the first attempt. On 150 real pairs spliced 25 frames apart, 139 merged into one call, and that call carried the first attempt's outcome 83% of the time and the second's 60%. The second attempt's make is lost about half the time.
2. **The footage cannot prove a fix.** Across the eight labelled clips (169 gaps between real shots) the closest two shots are 58 frames apart. None is under 40. No real putback exists in anything we have. Everything about rapid pairs below is synthetic (two real attempts joined) and is labelled so. It tests the state machine, not putback recognition.
3. **Timing alone cannot separate a putback from a rim bounce.** In the same footage 27 single real shots contain two descents to the rim: 26 of them 8 to 37 frames apart (median 17), the ball bouncing off the rim and coming back, and one 125 frames apart (a long rim roll). Three of the 26 sit at 25, 29 and 37 frames. A real catch-and-shoot takes about 25 to 40 frames (an estimate; no real one was measured). The two overlap.
4. **Flight continuity helps but did not meet its registered bar.** A one-parabola test separates a bounce from a broken flight. In two rounds it flagged 78 to 84% of synthetic pairs and falsely flagged 3 to 5 of 160 real single shots. Registered bar: 90%/85% recall and at most 2/3 false flags. **Not integrated.**
5. **The analysed rate is unknown on a phone and matters a lot.** The loop was built for 15 frames per second. On the saved detections, 15 fps scores the same as 30 (159 of 166 right calls both), 10 fps loses 7, 6 fps loses 25. A new diagnostic now measures the real rate on the iPhone. A flag-gated pacing change (default off) recovers about 8% of rate on desktop; it stays off until an iPhone report asks for it.

## 1. Root cause: separated by layer

| Layer | What happens | Evidence |
|---|---|---|
| Ball detection | Fine for rapid events when the ball is visible. 158 of 160 real single shots show a clean descent to the rim line. The detector reads rim hardware as a ball on IMG_4873 (far shooter), a known and separate problem. | `arrival-recall.mjs` |
| Identity | Not used by production. The tracker variants fail through association (IMG_4872 frames 3301 and 3359), not through grouping. | earlier experiments |
| Shot event / segmentation | One shot = rim-zone sightings with gaps under 40 frames (`RULE.gapFrames`). Needs 2 sightings. This is where two attempts become one. | `shotRules.ts`, spliced pairs: 139 of 150 merge at gaps 10 to 30 (30 fps), 136 to 139 of 150 (15 fps) |
| Rim interaction | A rim bounce produces a second descent 8 to 37 frames after the first. Segmentation by "second descent" alone would split every one of these. | inventory: 27 calls, all single real shots |
| Outcome | One 70-frame window from the first sighting, so the merged call is judged mostly on attempt one. | `merge-outcomes.json`: first+second to merged V4: make+miss gives make 33 of 35, miss+make gives make only 16 of 34 |
| Scheduling | The live loop does one picture at a time and waits for the model. Analysed rate = 1 / (model time + draw + wait). Unmeasured on a phone until now. | section 4 |
| Evaluation | The frozen scorer pairs shots by sliding alignment, which hides merges. The time-based diagnostic does not. | `shot-separation/` |

Not the cause: a cooldown (there is none), the 15 fps sampling (15 and 30 give identical merges), a hoop-window miss.

## 2. Footage inventory

`inventory.mjs` to `results/inventory.json`. 8 clips, 169 gaps between reference shots.

* Shortest gaps between real shots: 58, 63, 77, 79, 83 frames. Under 40 frames: **0**. Under 60: 1. Under 90: 7.
* Calls with two or more descents: 31. Four are the IMG_4873 hardware cases; the other 27 are each one real shot. Gaps between their descents: 8 to 37 frames for 26 of them (median 17), 125 for one.
* IMG_4851 (recorded 10/6): 17 reference shots against 18 written. The written shot nobody finds is a different problem. It holds no rapid pair under the 40-frame rule.
* **Matt's saved 10/6 test-user set** (the missed shot then layup) lives in his database and phone. It is not reachable from here, so this report cannot say what the camera saw there. Test 20 below captures it.

Limits: no overhead or second view, no real putback, no clip where the same player rebounds and shoots. Per the standing rule, no new footage was requested. The synthetic pairs are built from real attempts (two shots from one clip, the second placed g frames after the first's last rim sighting) so they carry real ball motion, real detection gaps and real rim hardware noise, but the join itself is artificial: the first ball vanishes cleanly, which is the easiest possible case.

## 3. Proposed architecture (what a rapid-shot-aware counter needs)

Layers, each with its own uncertainty, none replacing the detector:

1. **Sightings buffer** (exists in effect): ball boxes with rim-relative position per analysed frame.
2. **Flights**: chains of sightings that one ball could explain (speed limit, no long gap), each with a fit quality: one parabola (ballistic), a rim roll (near-zero acceleration at the rim line), or neither.
3. **Descents to the rim**: a flight that comes down to the rim line. Many per attempt (bounces).
4. **Attempt hypotheses**: descents joined into one attempt when one flight explains the sightings between them (bounce), separate when that flight is broken. Each hypothesis carries a confidence, not a yes/no.
5. **Outcome per attempt**: the 70-frame window for attempt one ends where attempt two's descent begins. Each attempt gets its own V4 call.
6. **Presentation**: confident splits count as two shots. Uncertain ones count as the shipped result and carry a "possibly two attempts" flag with the existing "Camera missed one? Add it" make/miss buttons. No fixed cooldowns anywhere.

**Minimum observable evidence for a putback** (versus a rebound or rim bounce), strongest first:
* The first attempt's ball is seen leaving the rim area **and** not coming back as one continuous flight (gap or non-ballistic path). A bounce is always continuous.
* A new descent from above the rim starts at least about 12 frames later and arrives at the rim line.
* A detected ball that is held (carried, not flying) between the two is the case this camera cannot see: a held ball is often not detected and a rim roll also looks non-ballistic. **That is the reason this cannot be fully automatic from one side-on, low camera.**
Timing alone (bounce 13 to 24, putback about 25 to 40 frames) is weak evidence that overlaps.

Experiment A (below) implemented layers 3 and 4 only, as a flag, and did not meet its bar. Layers 2, 5 and 6 have not been built.

## 4. Throughput: what is measured and what is not

### Production frame path (one pass of the loop in `use-camera-counter.ts`)

1. `drawImage(video, crop)` into a 416 px canvas.
2. `getImageData` (a 692 KB copy) plus a replay JPEG encode on the main thread, one at a time.
3. `luma` plus `blockMotion` (the motion gate): the model is skipped while the picture is still.
4. `detector.detect`: another copy into a transferable buffer, to the worker, preprocess, ONNX inference, postprocess, back. 8 s timeout. The worker is replaced about every 900 runs.
5. `core.push` (rules), status every 500 ms.
6. Pace: wait for camera frames until 1/15 s has passed since the pass began; always at least one wait, even when the model already took longer than 66.7 ms.

One picture is analysed at a time. A picture arriving while the model runs is never looked at (not queued).

### New diagnostic (default off)

`src/lib/vision/pipeline-stats.ts`, turned on by the existing switch `hl:session-review-debug`. Added lines only in the loop; with the switch off, nothing runs. It records, per pass: idle (pacing wait), draw, readback, motion and replay encode, the model round trip with the worker's prep, inference and post, rules, camera frames presented (from `requestVideoFrameCallback`), picture age when the answer is back, a 50 ms main-thread lag probe, stalls over 250 ms with the stage that took the time, warm-up against steady state, and the same figures only for passes with a ball near the rim. The report is on the lab page ("Camera throughput", with Copy). Seven unit tests cover it.

### What the diagnostic showed on desktop (headless Chrome, software WASM, fake camera; **not a phone**)

70 s runs of the real app loop. The app's own speed check judged this machine slow (about 4 fps).

| | pacing as shipped | `hl:loop-pace = fresh` |
|---|---|---|
| passes analysed | 421 (5.0 fps) | 451 (5.4 fps) |
| camera frames presented | 29.5 fps | 29.4 fps |
| camera frames never looked at | 83% | 82% |
| time between passes, median / p95 / p99 | 200 / 261 / 334 ms | 173 / 261 / 361 ms |
| idle wait, median / p95 | 14 / 32 ms | 0 / 0.2 ms |
| draw, median | 23 ms | 21 ms |
| model round trip, median | 145 ms | 147 ms |
| worker inference, median / p95 | 140 / 199 ms | 141 / 220 ms |
| picture age when the answer is back, median | 176 ms | 194 ms |
| passes over 250 ms | 25 | 28 |
| main-thread lag, p95 | 14 ms | 19 ms |
| time not in a named stage | 0.005 ms | 0.005 ms |

What this means: on a machine where the model is the slow stage, the model is 70% of each pass, drawing 12%, the pacing wait 7%, everything else under 2%. There is no hidden stall: unaccounted time is zero. The one removable item is the pacing wait. Nothing else in the per-frame path is worth touching until a phone report shows a different split. The phone's GPU or Neural Engine and its camera pipeline will not look like this; it can be dominated by readback or encoding instead.

### Experiment C result against its registered criteria

* C1 default off, nothing removed that touches counting: **pass** (`verify-production-unchanged`: no removed lines touching counting).
* C2 predicted gain at least 5% when over budget, 0 when not: measured **+8%** analysed rate (interval 200 to 173 ms, equal to the measured idle wait); the unit tests pin the on-time case to no change. **Pass.**
* C3 picture-age cost at most 17 ms mean: measured **+18 ms median**. **Marginal miss** (desktop noise is larger than the margin). Counting accuracy does not fall at a higher rate (fps curve is monotone). **Not met as written.**
* C4 phone gain: **not measured.**
Verdict: ships as a **flag, default off**, to be tried on the phone. Not default on.

### Sampling against missed shots (saved detections, shipped counter; `fps-curve.mjs`)

| analysed fps | V4 right of matched (frozen scorer) | diagnostic: matched / missing / extra | outcome right |
|---|---|---|---|
| 30 | 159 / 166 | 160 / 0 / 3 | 152 / 160 |
| 15 | 159 / 166 | 158 / 3 / 5 | 148 / 158 |
| 10 | 152 / 161 | 149 / 12 / 8 | 139 / 149 |
| 7.5 | 146 / 156 | 146 / 16 / 7 | 136 / 146 |
| 6 | 134 / 143 | 131 / 29 / 8 | 123 / 131 |

(Written shots: 178; reference shots: 177. Offline detections thinned to every nth frame, so this is sampling only.) The shipped design holds up to 15 fps and starts losing shots below 10. If the phone is under about 10 fps in the throughput report, speed is the largest single accuracy lever and it is larger than the rapid-shot logic. A quick pair is 18 to 30 frames at 30 fps, so at 6 fps a second attempt arrives in 3 to 5 samples.

## 5. Experiment A: flight continuity as a "possibly two attempts" flag

Hypothesis and criteria are in `criteria.json`. Code: `attempts.ts` (pure, 7 tests; kept next to the experiment, not in `src/`).

Rule: find descents that reach the rim line; between two descents at least 12 frames apart, follow one ball (no gap over 10 frames, plausible speed) and ask whether one parabola fits (residual 5 px or less, acceleration 0.3 to 1.6 px per frame squared). If not, that is a second attempt.

| | round 1 (descent starts 35 px above rim) | round 2 (18 px, after seeing round 1 fail) | bar |
|---|---|---|---|
| false flags on 160 real single-shot calls, 30 fps | 3 | **5** | at most 2 |
| same, 15 fps (158 calls) | 1 | 3 | at most 3 |
| pairs flagged (merged by the shipped counter, gaps 20 to 30), 30 fps | 72 to 73% | **83 to 84%** | 90% |
| same, 15 fps | 67 to 68% | 78 to 79% | 85% |
| shipped counter returns one call for the pair (gap 10 to 30) | 139 of 150 (93%) | same | all |

Round 2 changed one constant after round 1 failed (many shots peak 20 to 35 px over the rim, so a 35 px descent missed them). It is chosen on the same clips it is scored on, so round 2 is optimistic and still fails. It was not tuned further.

What the failures were:
* Rim rolls flagged falsely: IMG_4851 2454, IMG_4866 4130, both with acceleration near 0.1 (the ball rolls on the rim; that looks exactly like a ball being held).
* IMG_4872 371: a 37-frame gap with a non-parabolic flight, one real shot.
* Missed pairs: the first attempt's descent is cut off by the splice before it reaches the rim line (a ball skimming at 14 px above the rim).
* On the four merged IMG_4873 calls (17 reference shots; rim hardware read as a ball) the module finds 5, 6, 3 and 3 attempts against 4, 7, 3 and 3 reference shots. Counts agree roughly, not which is which. Informational.

Verdict: **A is rejected under its registered criteria.** The idea is sound as a signal (the 8 real bounce re-approaches in the first probe, gaps 13 to 24 frames, all fit one parabola with residuals of 1 to 4 px and acceleration 0.5 to 1.2) but it cannot be the sole decider, and no real putback was available to test the case it exists for. The S2 overlay variant (first ball left in view while the second arrives, not graded, not physically realistic) is flagged 88 to 98% of the time at gaps 15 to 40 frames: a second ball in view is easy; the hard and realistic case is the first ball disappearing.

## 6. Before and after

Counts and outcomes of the shipped counter are unchanged, so the scores are the same by construction.

| | frozen scorer (pooled, 8 clips) | time-based diagnostic |
|---|---|---|
| shipped, 30 fps | V4 159 of 166 matched, 159 of 178 written (89.3%) | matched 160 of 177, merged calls 4 (17 reference shots), split 0, missing 0, extra 3, boundary within 15 frames 157 of 160, outcome 152 of 160 |
| shipped, 15 fps (live rate) | 159 of 166 | matched 158, merged 4 (16), missing 3, extra 5, boundary 153, outcome 148 of 158 |
| with experiment A flag | no change | flags 5 real single shots at 30 fps (3 at 15 fps) and 83% of synthetic pairs; counts unchanged |

Rapid-shot recall of the shipped counter on real data: not measurable (no real rapid pair). On synthetic pairs under 40 frames, it counts one shot for 93%.
False second-shot detections on real clips: 0 (the shipped counter never splits). Experiment A's flag would have shown 5 false "possibly two" messages in 160 shots at 30 fps.
Timing error: boundary within 15 frames for 157 of 160 at 30 fps. Detection latency is the 70-frame rule window (about 1.3 to 2.3 s after the rim) by design.

## 7. Recommendation

* **Integrate now:** the throughput diagnostic (already in, off by default) and the flagged pacing option (default off). Neither can change a count.
* **Do not integrate:** experiment A. It misses its registered bar and cannot be validated on a real putback.
* **Best next step for game-speed drills** (in order): (1) run the throughput report on the phone (Test 19); (2) if analysed fps is under about 12, fix speed first, because that costs more shots than any rapid-pair logic (section 4); (3) capture one real miss-then-putback with the diagnostic on (Test 20) and look at its sightings; (4) make "possibly two attempts" appear only when the shipped call is long (the long-span, many-descent calls), with the existing make/miss correction buttons, once there is a real putback to grade it on; (5) train with rim-hardware hard negatives (IMG_4873 is the one clip where grouping genuinely fails today).

## 8. Answers to the five questions

1. **Why do two close shots merge?** One timer: sightings in the rim zone less than about 40 frames apart are one shot, and the outcome window starts at the first. Not a cooldown, not identity, not frame rate.
2. **Simplest reliable putback recognition?** There is none from timing alone (bounces and putbacks overlap). The weakest sufficient evidence is a broken flight (the ball leaves and is not followed back as one parabola) plus a fresh descent at least 12 frames later; that reached 83% on best-case synthetic pairs with 3% false flags and missed its bar. Use it as a flag, not a counter.
3. **Actual analysed fps, and can it improve?** On the phone: unknown until Test 19. On desktop 5.0 fps, where the model is 70% of each pass and the pacing wait is 7%; the flag recovers about 8%. The camera presents 30 fps, so most frames are never analysed by design.
4. **Can accuracy and responsiveness improve without replacing the detector?** Responsiveness yes, a little (pacing); accuracy for rapid pairs not yet; both are bounded by the analysed rate and by a camera that cannot see a held ball.
5. **Best next improvement for game-speed drills?** Measure the phone, fix the rate if below about 12 fps, then validate a flag on one real putback.

## 9. Tests added

* `src/lib/vision/pipeline-stats.test.ts` (7): rates, camera frames skipped, stalls and the stage that took the time, near-rim windows, report text, pacing decision, pacing flag default off.
* `training/eval/experiments/rapid-shots/attempts.test.ts` (7, run with `npx tsx --test`): one drop is one attempt; a bounce at 30 and 15 fps is one attempt; a descent after an unfollowed gap is two; a carried ball then a descent is two; two descents closer than a catch could take are a bounce; a resting ball is not an arrival; empty input.
* Existing tests: the three that fail (`autoSize`, `counting`, `shotRules`) fail identically with my changes stashed. They use `import.meta.dirname`, which this machine's Node 20.9 lacks; unrelated.

## 10. Files

`criteria.json` (registered first), `inventory.mjs`, `fps-curve.mjs`, `ballistic-probe.mjs`, `arrival-recall.mjs`, `debug-pairs.mjs`, `merge-outcomes.mjs`, `experiment-a.mjs`, `attempts.ts` and its test, `perf-throughput.mjs`, `results/` (all numbers above), `lib.mjs`, `inspect-clip.mjs`, `timeline.mjs`, `approaches.mjs`.

Production change in `src/`: `pipeline-stats.ts` (new), added lines in `use-camera-counter.ts` (19 added, none removed), a card in `session-review-lab.tsx`.
