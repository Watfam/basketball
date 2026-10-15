# Phase 5: session review and shot-separation reliability

**Bottom line.** A flag-gated, off-by-default **session-review screen** is built into the app and works on real recordings: browse a finished set, replay a shot with its observed ball path, step frame by frame, compare shots, read the camera's measurements and why some are missing, hide unreliable paths.
**No shot-separation candidate was good enough to integrate**: the one registered candidate failed its criteria, and the diagnostic found why (the IMG_4872 merge is an *association* failure, not a segmentation choice).
The production counter, V4, ball-6, the hoop window, the auto-sizer, `thresholds.json`, baseline-v0 and `datasets.lock.json` are untouched; with the flag off the app behaves as before. All clips were seen in earlier phases, so nothing here shows independent generalisation.

## 1. The session-review feature and how to open it

It opens from the existing end-of-set review screen (unchanged otherwise), as a small "Session review (beta)" link under "Copy camera report", **only when the flag is on**.

```js
localStorage.setItem("hl:session-review", "1")   // on  (Safari: Develop > Show Web Inspector > Console on the phone's page)
localStorage.removeItem("hl:session-review")     // off (the default)
```

While the flag is on and the camera counts, the camera loop also notes the ball boxes the model *already* returns (no extra model run) and keeps a small record per decided shot on the phone.
On the review screen the link then opens: a shot strip (outcome per shot), the shot's video frames from the replay store with the ball's path drawn on them, Play / Frame-by-frame / slider, "whole path", "filled-in points", "uncertainty", "fill longer gaps (low confidence)" and "show unreliable paths" switches, a plain-words line for the current frame, the measurements panel, and a rim-relative **compare** panel where any shots can be ticked.

## 2. The feature flag and its default

`src/lib/review/flag.ts`: key `hl:session-review`, default **off**; anything other than the exact string "1" (or storage that throws) is off.
Off means: the recorder is never created in `use-camera-counter.ts`, nothing is written to the new `hl-review` database, the entry link renders nothing, and the review component is not even fetched (`next/dynamic`).
Tested in a browser: flag absent, entry buttons 0; flag on, 1; flag removed again, 0 (`results/render-perf.json`).

## 3. Demonstration on existing recordings (six cases)

Built by `training/eval/experiments/session-review/make-demo.mjs` from existing recordings: review records cut by the app's own recorder from the saved detections (15 fps), replay frames cut from the footage, seeded into the **real** IndexedDB stores of a temporary route, then the real components opened. 35 shots in four sets.

| Case | Where | What the screen showed |
|---|---|---|
| Clearly tracked make | Set A (IMG_4839) shot 1 | "Path found"; 16 sightings; rim-level position 0.46 ball widths, direction 76°, speed 0.45 bw/frame; top of the arc seen; bounce after the rim "not available" with the reason in words |
| Clearly tracked miss | Set A shot 6 | "Path found"; rim-level 0.26 bw; ball seen bouncing back: no |
| Short detection gap | Set A shot 2 | "Partial path": 1 point filled in across a one-frame gap (dashed, ±6.07 px, not measured) and the path in 2 pieces; speed "not available: too few consecutive sightings" |
| Incomplete trajectory | Set A shot 3 | "No path", banner "Tracking is incomplete for this shot", path hidden, video shown as recorded |
| Phantom (rim hardware) | Set B (IMG_4873) shot 4 | "Partial path"; 7 detections on rim hardware kept out of the path (not drawn) and the path split in two; shot 7 of the set is "Path unreliable", hidden until "show unreliable paths" is ticked |
| No video / no data | Set C (tracking kept, no video): path drawn on a plain grid with "The video of this shot is not kept on this phone"; Set D (a saved set, outcomes only): the eight shots list with their outcomes, "No path", "No video or tracking data was kept", no playback controls |

## 4. Data-storage changes (additive, versioned)

What the app kept before: a shot's call and, on this phone until the set is saved, its replay frames (`hl-replays`). The detections behind the call were dropped, so a trail could not be built. The review needs them, so:
- **`ReviewRecord` v1** (`src/lib/review/types.ts`): shot id (same as the replay id), first-sighting time, rim position and window size in model pixels, and 1 s before to 2 s after of frames, each with `ran` (false when the motion gate skipped the model, so "no ball" is never confused with "not looked at") and the ball boxes with score and an `occ` flag (box on a long-occupied rim spot). Coordinates only, no pixels.
- **A new IndexedDB database `hl-review`** (`review-store.ts`); the existing replay store and Supabase schema are untouched. Local to the phone, never synced, records older than a day pruned. Unknown versions are ignored, never guessed.
- **Backward compatible:** a shot without a record (every set recorded before this, every saved set, flag off) still lists with its outcome and shows "no tracking data was kept".
- **Important limit:** the replay store is cleared when a set is saved, so frames and, as built, records only live until then. Browsing an old **saved** session with paths needs a retention decision (below); for now a saved session shows outcomes only (Set D).
- Training-video paths are never assumed to exist on a phone: the demo runs only through the two IndexedDB stores.

## 5. Replay quality safeguards

Association is constant-velocity nearest-neighbour (gate 30 px per reference frame, 0.5-2x size ratio): not the Kalman tracker. A path is broken, never bridged, when:
- another ball-like box lies within 1.5 ball widths of a point (identity unclear; the point is left out and marked);
- a box sits on a long-occupied rim spot with no flight before it, or a whole track does (rim hardware: excluded from choosing the ball's path, counted, reported); a record containing only hardware has no path and says so;
- there is a gap of more than one missing processed frame (default; the longer-gap switch allows up to three, drawn as low-confidence);
- the model did not run (reason "model_skipped", never interpolated).
Reconstruction exists only inside a 1-frame gap, is typed `reconstructed`, drawn dashed, labelled "filled in, not seen", carries the measured p95 error (2.85/4.30/6.07 px by hidden frames) and is **never** used by a measurement. Trails are graded Path found / Partial / Unreliable / No path with reasons; unreliable and none are hidden by default but the video is always shown. All positions are image-space; image-horizontal is not the shooter's left or right.
Verified on the real data: of 169 shots (all eight clips, both cut by the recorder at 15 fps) **60 tracked, 70 partial, 22 unreliable, 17 no path**; the IMG_4873 phantom put 0 points into any trail.

## 6. The new shot-separation diagnostic (separate view)

`training/eval/experiments/shot-separation/` (`diagnose.mjs`, `run-diagnostic.mjs`, criteria registered first in `criteria.json`). It keeps three problems apart (detection/association, segmentation, pairing) and matches **by time**, not by order:
a prediction covers a reference shot if `first - 25 <= t <= last + 15`; classes are matched, boundary-correct (within 15 frames), merged (one prediction covering two or more), split, missing, extra, and outcome correct/incorrect for matched shots only. A merged prediction scores no outcome and **does not cascade**. The frozen scorer (`training/eval/lib/shots.mjs`, baseline-v0) is unchanged.
The reference is built from the first sightings of three existing pipelines (clusters supported by at least two) with six frames adjudicated by eye (IMG_4872 frame 1, IMG_4873 frames 892 and 4021: empty hoop); it is a **segmentation reference, not ground truth**, and is biased toward shots those pipelines see. IMG_4851 has one written shot no pipeline finds, so its outcomes are flagged ambiguous. The diagnostic's value is already visible: for the cv_nearest machine on IMG_4872 the frozen scorer reports 14 of 23 (-9 against baseline); the diagnostic reports 1 merged prediction (two shots, unscored), 1 outcome wrong and 20 of 21 matched right: three shots affected, not nine.

## 7. The one targeted shot-separation experiment

Candidate "second-shot arrival" (criteria registered before it existed): open a new shot, instead of attaching, when a non-successor track born at least 60 px above the rim arrives at least 25 frames after the open shot began and the open shot has been quiet at the rim for 8 frames. It reproduces round 2 exactly when off (test).
**Result: NOT RECOMMENDED.** P1 (no merge on IMG_4872 and fewer merges overall) fails at both rates, P3 (no new extras) fails (3 against 1 at 30 fps), P4 (matched outcomes) fails, and the historical scorer's D1 fails (IMG_4872 -9 at 30 fps, IMG_4874 -4).
**Why, found by looking:** on IMG_4872 the cv_nearest tracker keeps **one track** (94 observations, frames 3285-3385) through both balls, shots 3301 and 3359, 58 frames apart. A segmentation rule cannot split a track that is one object. This is an association problem (the second ball is attached to the first ball's track within the gate). The Kalman version separated them, the cv_nearest version does not; the fix belongs in association (do not extend a track that has already left the rim zone downward, or has been quiet, when a new ball appears from above) and needs its own registration.

Per-clip, 30 fps (merged predictions / missing / extra / matched outcome correct); `*` outcome assignment ambiguous:

| Clip | references | baseline (shipped) | Kalman round 2 | cv_nearest control | candidate |
|---|---|---|---|---|---|
| IMG_4839 | 28 | 0/0/0, 27/28 | 0/0/0, 27/28 | 0/0/0, 27/28 | 0/1/1, 26/27 |
| IMG_4840 | 32 | 0/0/0, 31/32 | 0/0/0, 31/32 | 0/0/0, 31/32 | 0/0/0, 31/32 |
| IMG_4851* | 17 | 0/0/0, 16/17 | 0/0/0, 16/17 | 0/0/0, 16/17 | 0/0/0, 16/17 |
| IMG_4866 | 19 | 0/0/0, 18/19 | 0/0/0, 18/19 | 0/2/0, 16/17 | 0/2/0, 16/17 |
| IMG_4867 | 16 | 0/0/0, 15/16 | 0/0/0, 15/16 | 1/0/0, 14/14 | 1/0/0, 14/14 |
| IMG_4872 | 23 | 0/0/1, 23/23 | 0/0/1, 22/23 | 1/0/1, 20/21 | 1/0/1, 20/21 |
| IMG_4873 | 22 | **4 merged (17 shots)**/0/2, 4/5 | 0/0/1, 17/22 | 0/1/0, 16/21 | 0/1/0, 16/21 |
| IMG_4874 | 20 | 0/0/0, 18/20 | 0/0/0, 18/20 | 0/1/0, 17/19 | 0/1/1, 17/19 |

(15 fps in `shot-separation/results/diagnostic-all.json`.) Reading it: the **shipped grouping merges 17 real shots into 4 predictions on IMG_4873**, which the tracked pipelines fix; the Kalman round-2 version is the best of the experimental pipelines on this diagnostic (no merges, no misses) but failed other criteria in Experiment 1 and was not revived. The cv_nearest family loses shots (misses on IMG_4866/4873/4874, merges on 4867/4872).

## 8. Test results and performance

- Tests: app 106/106 (93 existing + 13 new in `src/lib/review/review.test.ts`), harness 47/47, experiments 97/97. `eslint` clean on every new or changed file; `next build` compiles.
- Cross-check of the **app's own TypeScript** against the Phase-4 offline pipeline on all eight clips at 15 fps through the recorder: rim-level offset agrees within 0.15 ball widths on 128 of 129 shots where both exist (99.2%); availability 131 of 169 shots in the app code against 149 offline: the app code sees only the 3-second record around each shot, the offline pipeline the whole clip's tracks, so it finds the rim crossing slightly more often. 
- UI agreement: 35 shots across four sessions, 27 with records: displayed shot number, outcome, trail grade, rim-level value and the evidence line (record id = replay id, frame count) all equal the underlying records. **0 mismatches** (`results/ui-agreement.json`).
- Rendering (desktop headless Chrome, not a phone): screen opens in 381 ms; a frame step reaches its second paint in a median 33 ms (p95 49); a first look at another shot median 36 ms (p95 121); heap about 6 MB while open. Library cost to build one shot's trail and fingerprint: median 0.39 ms (p99 12 ms). Recording in the camera loop adds a box copy and a grid count per processed frame: not measured on a phone.
- **Needs a real device:** smoothness on an iPhone, memory with 40+ shots, the recorder's cost in the live 15 fps loop, heat and battery, and that the flag truly leaves the live counter's behaviour unchanged on a phone (it changes no counting code; the diff to existing files is 15 lines, all behind the flag).

## 9. Files

New: `src/lib/review/{types,flag,spot,recorder,trail,fingerprint,quality,review-store}.ts` and `review.test.ts`; `src/components/session-review.tsx`, `session-review-entry.tsx`; `training/eval/experiments/session-review/` (demo builder, cross-check, e2e scripts, results) and `training/eval/experiments/shot-separation/` (criteria, diagnostic, separator, evaluation, results).
Changed in existing files (flag-gated): `src/components/shot-review.tsx` (+2 lines: the entry), `src/lib/vision/use-camera-counter.ts` (+11/-2: recorder created only if the flag is on, fed the boxes the loop already has, a record saved beside each replay).
**Untouched:** ball-6, V4 and every rule in `shotRules.ts`, `counting.ts`, `roi.ts`, `autoSize.ts`, the replay store, the hoop window, the existing review UI, `thresholds.json`, baseline-v0, the datasets and lock. The temporary validation route and the demo frames (children's video) were removed before the commit and never committed.

## 10. Remaining limitations

- Records live only until a set is saved; saved sessions show outcomes only. Retaining detection coordinates (not pixels) per saved session is a small, additive change but a privacy and storage decision for Matt.
- Reconstruction is reliable only over one frame; coaching claims need the measurements, and only the rim-level position was ever shown to separate makes from misses (Phase 4: mostly face validity).
- The occupied-spot flag needs about 3 s of history, so the first seconds of a set cannot flag rim hardware.
- Paths exist only for the window the model sees (rim approach and early rim interaction); release and most of the apex are outside it.
- IMG_4851 (side-on) paths are drawn but image-horizontal there is mostly depth.
- Shot separation: the IMG_4872 merge persists in the cv_nearest family; the reference times are partly derived from the pipelines under study.

## 11. Recommendation on integration

- **Session review screen: ready for an on-phone trial behind the flag, not for general release.** Evidence: trail integrity verified on 8 clips, UI agrees with records on 35 shots, safeguards tested. Missing: a real-device pass (memory, loop cost) and the retention decision. It makes no coaching claims.
- **Shot-separation candidate: not ready; do not integrate.** The diagnostic view is ready to keep as an evaluation tool.
- **Nothing else changed in the counting path.**

## 12. Highest-value next milestone toward personalized coaching

Run the review screen on Matt's phone for a few real sets with the flag on, and decide whether to **retain detection records for saved sessions**. That yields, from real use, many more shots per camera position (the current limit on every coaching statistic: only two clips ever had enough data to test anything). In parallel, one registered **association** experiment for the second-ball merge (the diagnostic now isolates it). Coaching statements stay off until a camera position has a few hundred observed shots.

## Reproduce

```bash
node --test training/eval/experiments/shot-separation/*.test.mjs                 # diagnostic and separator tests
node training/eval/experiments/shot-separation/run-diagnostic.mjs all             # per-clip diagnostic
node training/eval/experiments/shot-separation/evaluate-candidate.mjs             # P1-P5 verdict
node training/tools/43-run-tests.mjs review                                       # app review library tests (13)
node training/eval/experiments/session-review/cross-check.mjs                     # app TypeScript vs offline pipeline
node training/eval/experiments/session-review/make-demo.mjs                       # builds the temporary demo data
# then: copy session-review/demo-route/page.tsx to src/app/lab/review-demo/page.tsx, allow /lab/review-demo and /_review-demo in
# src/lib/supabase/middleware.ts, npm run dev -- -p 3101, open /lab/review-demo, "Seed", "Flag ON", open a set;
# e2e/review-agree.mjs and e2e/review-perf.mjs drive it with puppeteer-core. Remove the route and public/_review-demo afterwards.
```
