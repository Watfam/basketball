# Phase 7: data integrity, camera framing, and iPhone readiness

**Bottom line.**
(A) Deleting a saved session now removes its tracking history, with an undo window, a retry queue and tests. (D) Tracking history can be exported to and imported from a local file (checksummed, validated, duplicate-safe, no identifiers, no video). (E) There is a registered, reproducible on-phone test with a results screen; **no iPhone has been measured, so there is no iPhone performance claim anywhere**. (B/C) The camera-framing question was answered by measurement, and the answer is mostly "the footage supports less than the idea hoped": a geometric descriptor measured from the rim and backboard (M1) **never accepted a different camera position as comparable (0 of 37 real pairs)**, measures shift, zoom and tilt well enough to call them, and flags large viewing-angle changes in a model, but it **fails the pre-registered criteria to be used to approve a comparison** (too many "cannot tell" answers, cannot see camera height, cannot confirm small angle changes, and its strict repeatability fails on the one side-on clip). So it is shipped only as an optional, advisory lab page that cannot block or change anything; nothing automatically enables or disables a comparison. Production counting, ball-6, V4, the hoop window and the frozen baseline are unchanged (the baseline check is in section 8).

Nothing in this phase used new footage. The dataset is one hoop in one driveway: read section 9 before believing any number.

---

## 1. What is in the app now

| Piece | Where | Default |
|---|---|---|
| Session deletion integrity | `src/lib/review/history-core.ts`, `history-ops.ts`, call sites in `shot-session-list.tsx`, `delete-shot-session-button.tsx`, shooting pages, `shooting-hub.tsx` | on (a no-op unless history was ever used) |
| Export / import | `src/lib/review/history-transfer.ts`, buttons in `tracking-history-controls.tsx` | only visible with the `hl:session-review` flag |
| Phone readiness test | `src/lib/review/phonetest.ts`, a section of `/lab/session-review` | off with the lab page |
| Live-loop timers | `use-camera-counter.ts`: `loop.work_ms`, `loop.detect_ms`, `loop.interval_ms` | **off** unless `hl:session-review-debug` is "1" (one boolean per frame otherwise) |
| Camera reference | `src/lib/framing/*`, `/lab/camera-reference` | separate page, never run by the counting loop (the only importer of `lib/framing` is that page's component) |

Everything is local. Nothing is uploaded.

## 2. Workstream A: session deletion integrity (commit b792805)

A saved session's tracking history is linked to the server session by its server id, or by the start time the app sent (a learned link, never fuzzy, never across players). The history call runs **after** the server delete succeeded and its error path has returned. History is **hidden at once** everywhere (lists, usage, comparison inputs, analytics) and **removed for good** after a 2-minute undo window or sooner by `reconcileHistory`. Undo restores it. An unreachable store queues the deletion (deduplicated; an Undo cancels a queued delete). Repeated and unknown deletes are no-ops. Damaged or newer-schema rows are left alone and a read-only (newer) store is never modified. 10 tests (`history-delete.test.ts`), including a static check of the call order at both UI call sites.

Honest limit: the server's own soft delete keeps a row for 10 days; the history is gone after 2 minutes. A file exported before the deletion is a copy outside the app and is not touched (the export screen says so).

## 3. Workstream B: camera-framing validation

### 3.1 Question and design

Given two saved sessions, are their rim-relative ball paths **comparable**, **normalizable** (a shift, a rim-width scale and a rotation repair them) or **not comparable** (a different viewing angle, which no image-space step repairs), or must the app say **unknown**?

Why the existing key is not enough: a horizontal circle (the rim) has the same apparent width at every azimuth, so rim position and rim width cannot see a camera that moved around the hoop. The board's apparent width goes with the cosine of the azimuth and the rim's overhang in front of the board with its sine. M1 measures: rim centre, rim width, board-width-to-rim-width (`az`), the rim's offset from the board's centre in rim widths (`off`), board aspect (`asp`), side-edge tilt (`roll`) and the rim's height/width (`elev`).

Methods: **M0** the shipped `compareFraming`; **M1** rim colour blob + board quad (four white bars found as straight lines, refined by least squares), geometry only, no picture stored; **M2** the shipped `findHoop` (grey-picture edge matching) used as a camera-moved detector; **M3** the rim-only ablation.

### 3.2 What was registered, and when (everything is in git history)

| File | Written | What it does |
|---|---|---|
| `criteria.json` | before any code | classes, F1-F7, tolerances rule, controls, integration rule |
| `criteria-v2.json` | after looking at one contact sheet of crops | roll from vertical edges (side-on clip's top edge is perspective-slanted); adds `off` |
| `criteria-v3.json` | after the five **development** clips were measured, detector frozen; before any validation clip was measured | **post-hoc redesign** of how F2 is used (a per-session self-consistency gate); tolerances derived by the registered rule |
| `criteria-v4.json` | after v1 ran on all clips and its validation **overlays** were looked at (no metric computed) | detector v2 (line refinement) because a drawn perfect hoop showed 2 degrees of wobble; a unit correction (uncertainty of a *difference of means* uses the standard error) |
| `criteria-v5.json` | after v2's spreads for all clips were printed (disclosed) | roll becomes a verified cue (dev numbers 0.25-0.59 degree) |
| `criteria-v6.json` | before any M2 measurement | numeric M2 criteria; records M1 status |

Disclosures that matter: (1) the strict F2 of `criteria.json` **failed** on the development clips before anything was redesigned (section 3.4); the redesign is a different design, tested on clips it had not been tuned on, reported next to the strict failure. (2) A per-clip repeat-spread table including the validation clips was printed before `criteria-v5.json`. (3) I did not eyeball all 100 detector-v2 overlays: I reviewed all v1 overlays for the development and validation clips, and v2 overlays for the whole side-on clip and five other risky stills. (4) The real-pair truth uses a whole-frame background registration (scenery, not the hoop detectors) plus my eye; it is not a blind label and cannot separate a camera that turned from one that moved.

### 3.3 Data and limits

10 clips, 5 days, about 8 camera placements, **one hoop, one driveway, one phone**. For each clip, 10 temporal-median stills (5 at fractions 0.1/0.3/0.5/0.7/0.9 and a second set at 0.2/0.4/0.6/0.8/0.95, each the pixelwise median of 5 frames 0.5 s apart). Roles: development 4839, 4840, 4851, 4866, 4867; validation 4872, 4873, 4844; diagnostic 4874, 4836. **IMG_4844's camera moved during the clip** (first vs last still: shift (-0.052, -0.009) of the frame, scale 0.952, correlation 0.725 against 0.305 unshifted) and its `rim_native` in `datasets.json` is not where the rim is in the stills: it is not a same-camera control; it is a real "camera moved" example. The measurement is seeded at the rim position the app's own aim recorded (an eye seed for 4844 and 4836), because searching a whole yard for an orange ring finds shirts and bricks; the app always knows roughly where the rim is.

### 3.4 Results against the registered criteria (detector v2, criteria v1-v6)

| Criterion | Result | Verdict |
|---|---|---|
| **F1** extraction: wrong-but-confident <= 5% overall and <= 1 of 5 per clip; abstain <= 30% | Rim found in 92 of 100 stills (the 8 misses are IMG_4844, camera moved: correct). Board found in 78 of 100 (22% abstain). **IMG_4851 (side-on): wrong-but-confident quads in at least 4 of its 7 board stills** (oversized, an inner square, a long diagonal onto the wall). No wrong quad seen in the near-frontal clips I reviewed. | **FAIL per still** (side-on clip); the descriptor-level gate abstains on that clip |
| **F2** strict, pooled over all 5 dev clips | size 0.17, az 0.17, off 0.24, asp 0.23, roll 0.48 degree; limits 0.03 / 0.05 / 0.04 / - / 0.5 | **FAIL** (the side-on clip sinks it). Dev clips without it: size 0.035, az 0.036, off 0.017, asp 0.009, roll 0.46 |
| **F2 as redesigned (gate)** | pos, size, az, off, asp, roll pass in **both** stills sets on 4 clips (4839, 4840, 4866, 4867); on 4873, 4874 and 4836 they pass in set A and lose cues in set B; size and roll fail on 4872; nearly everything fails on 4851 and 4844 | quantities usable except elevation (elevation was declared unusable from the dev clips by `criteria-v3.json` and was not re-enabled) |
| **F3** positive controls: not_comparable <= 2%, unknown <= 30%, normalizable <= 10% | 43 pairs (9 same-clip, 4 IMG_4839 vs 4840, 30 within-tolerance synthetic): **comparable 30, unknown 13, not_comparable 0, normalizable 0** | not_comparable 0% pass; **unknown 30.2% vs 30%: FAIL by 0.2 point** (6 of 13 real positive pairs are unknown: 46%, because one side's set-B stills lost cues) |
| **F4** similarity controls: comparable-when-normalizable <= 5%, not_comparable-when-normalizable <= 5% | 48 perturbed descriptors (pan 0.03/0.08, zoom 1.15/1.3/1.5, roll 3/6, a combination; 6 clips): **0 comparable, 0 not_comparable, 29 normalizable, 19 unknown** (all unknown: zoom 1.15 [the band between tolerance and clear change] and roll 6) | **PASS** (but 40% unknown) |
| **F5** model-based view change | azimuth >= 15 degrees (>= 20 from head-on): comparable/normalizable **0%**. Azimuth 5 degrees: comparable only 9% / 15% / 34% (needs 70%). **Elevation 10 degrees: accepted 98%** (needs <= 10%); 15 degrees: 7% | **FAIL**: it cannot confirm small angle changes and cannot see elevation |
| **F6** real cross-setup pairs | **0 of 37 different-camera pairs classed comparable** (30 unknown, 7 normalizable). Same-camera pair (4839 vs 4840): comparable. Seven "unresolved" pairs (background cannot decide): M1 unknown on all; **M0 would accept 3 of them** (4839, 4840 and 4867 vs 4872). | false acceptance **PASS**; the 7 normalizable pairs cannot be adjudicated (background correlation under 0.35 at their best fit), so the "pan/zoom alone" clause is **unverifiable** |
| **F7** overhead | M1: median 356 ms, p95 1,047 ms per 1080p still (desktop Node). Capture in headless desktop Chrome (5 stills, median of 3 frames each): 5.1 s. Not in the counting loop. **Not phone numbers.** | reported |

Integration rule: **M1 fails F2 (strict), F3 (by 0.2 point), F5 and F1 (per still, side-on clip) and is not used to approve anything.**

### 3.5 What M1 can do that is supported

- It never called a different camera position comparable (0/37), and in the model it flagged every azimuth change of 15-20 degrees or more.
- It measures **shift, zoom and tilt**: of 48 perturbed descriptors 29 were called normalizable and **none was called comparable or not comparable** (the 19 unknown are zoom 1.15, tilt 6 degrees and 7 single abstentions); the rim position repeats to under 1.5 px on the steady clips.
- **Board aspect (`asp`) is the most repeatable cue** (within-clip sd 0.2% to 1.4%) and the means separate the side-on clip clearly: asp 1.03 and rim offset +0.46 on IMG_4851 against asp 1.70-1.76 and offset -0.11 to -0.20 on the other eight clips. The signal exists; the detector just cannot extract it steadily on that view. Every clip except the side-on one has nearly the same asp and offset, i.e. the camera was on the same side of the hoop each time, at different distances or zooms.
- M0 (rim position + window scale) accepted three pairs (4839, 4840 and 4867 vs 4872) whose background shows a small shift (0.01-0.04 of the frame) and a 2.5% scale difference; M1 said unknown on all three. Whether those three really differ in viewing angle is not knowable from this footage.

### 3.6 M2 (the shipped hoop-picture matcher) as a camera-moved detector (`criteria-v6.json`, `results/m2*.json`)

False alarm among usable same-camera queries **0 of 101** (all usable). Different-camera queries: only 9 of 65 usable (14%, which is the right behaviour: the README's "a different angle scores about 0.19"), and none of the 9 missed. Localisation vs M1's rim: median 3.1 px of 1920, p95 12.9 px (criteria 9.6 px and 38 px). Synthetic: 0 false alarms in 30 within-tolerance perturbations; of the perturbations that were usable, **15 of 16 shifts/zooms were detected (93.8%, criterion 95%: FAIL, narrowly)** because the matcher's size steps are coarse (a 15% zoom was read as 1.08 on one usable query); 44% of the large pan/zoom perturbations were not usable at all (score under 0.35), which as an answer is itself "cannot find the hoop like the reference". Roll is not seen (as expected). M2 as shipped is unchanged and still used by the aim step. The extension to separate x/y scale and roll (registered in v3) was **not built**; azimuth and elevation sensitivity of M2 on imagery is **untested**.

## 4. Workstream C: the optional camera reference

`/lab/camera-reference` (linked from the camera lab). Open the camera, **tap the rim**, **Measure** (5 stills, each the median of 3 frames), see the rim ring and backboard quad drawn over the preview, **Keep as the reference** (about 600 bytes of numbers in `localStorage` `hl:framing:ref`; no picture; separate from shot history), and later **Check against reference**. Result words: *Looks the same*, *Moved a little*, *Different angle*, *Cannot tell*, *Hoop not found*, each with what was not checked ("camera height cannot be checked; small changes of side-to-side angle are not reliably seen") and "counting is not affected". **Replace** recalibrates; **Delete** clears it. It has no way to block counting (the check result type has no such field and nothing imports it from the counting path) and it never changes how saved sessions are compared.

Verified in headless desktop Chrome with a stand-in camera showing a still of the hoop (`e2e/reference-e2e.mjs`): 5/5 stills found the rim and backboard; the reference was 606 bytes with no picture; the same view came back "looks the same"; a zoomed-and-shifted view came back "moved a little"; a tap nowhere near the rim came back "hoop not found". That is a desktop functional check, not an iPhone result, and it used a still, so it says nothing about hand-held drift.

Deliberate choices, stated: it is a **separate lab page, not wired into the start of a session**, because M1 failed as an approver and nothing should touch the counting flow before phone measurements; it is built from the failing M1 on purpose as an *advisory* display; the app uses a median of 3 frames per still where the evaluation used a median of 5 (not shown equivalent).

## 5. Workstream D: export and import

`hardwood-lab.tracking-history` version 1, JSON, SHA-256 checksum over the content, built from a fixed field list. **Contents:** per session the start time, camera framing and, per shot, the outcome flags, observed rim-relative points, gaps, events, quality and fingerprint. **Never:** video, pictures, player id, account, server session id, and (by default) the free-text label. **Import** treats the file as untrusted: refuses non-JSON, truncated, foreign, newer-version, altered (checksum) and oversized files whole with a plain message; rebuilds every row field by field under this phone's own ids and holds it to the store's own rules (an image-like string or a Blob makes the session "damaged"); skips a damaged, oversized (over the 5,000-shot / 25 MB limits) or repeated session and reports it while the good ones still come in; skips a session already on the phone (same player, same instant) unless "replace" is ticked, and a failed replace puts the original back; ignores any deleted flag or id in the file; **never touches any session not named in the file**. Imported sessions keep their start time, so deleting the saved session later still removes their history (tested). A session deleted in the app is never exported; a file already exported is a copy outside the app. The file never leaves the phone by this code.

14 tests (`history-transfer.test.ts`): round trip identical field by field, no identifiers or label text in the file, per-player and per-session export, duplicates (skip changes nothing at all), unrelated sessions untouched, six refusal classes and nothing written, damaged sessions skipped, injection attempts, limits, read-only store, failed rewrite restored, import twice, delete-after-import, 20 sessions of 250 shots (6.1 MB: export 0.5 s, import 0.8 s on the desktop). Browser check of the real UI (`e2e/transfer-e2e.mjs`, 19 checks): export downloaded, file has no identifiers, delete all, import preview and confirm, history queryable, same file again "already on this phone", changed/non-JSON/foreign files refused, no network request.

## 6. Workstream E: iPhone readiness

**Registered before any phone result** (`training/eval/experiments/iphone-readiness/criteria.json`, kept equal to the code by a test): save of a 250-shot session < 1,000 ms; listing 1,000+ shots < 3,000 ms; analysing 250 shots < 3,000 ms; opening a shot (trail build and draw, p95) < 50 ms; recorder p99 < 500 µs/frame; five load-and-analyse rounds with no failure and at most 2x slowdown; live loop with review on at most 2 ms more work and 1 fps slower than off (two real sets, 100+ frames each); extra battery at most 2 points per 15 minutes (by hand); counted shots equal between a flag-on and a flag-off set of the same drill.

**What a browser on an iPhone cannot see:** battery, thermal state, JavaScript heap, per-process memory (Safari has no such APIs). The screen says "not measured", never a pass. Memory pressure is tested indirectly (the stress rounds and a run marker that notices if the phone reloaded the page mid-test). Eviction (Safari can clear a site's storage after about a week unused unless it is on the Home Screen or persistent) is tracked with a persistence request and a marker whose age is shown.

**Procedure (also on the screen at `/lab/session-review`):** 1) open it on the iPhone; 2) **Run the phone test** (about 15 s on a desktop; the iPhone number is the point) and leave the screen on; 3) turn on Timing diagnostics, count one normal set with Session review **off** and one of the same drill with it **on**; 4) come back and tap Refresh; enter battery % and minutes of two 15-minute sets by hand; 5) **Copy results** and paste them. Each check shows pass / fail / not measured against the registered limit.

**Instrumentation added:** `loop.work_ms`, `loop.detect_ms` and `loop.interval_ms` in the counting loop (diagnostics only), persisted separately for review off and on. A desktop headless-Chrome run of the screen is a functional check only (all desktop numbers: save of 250 shots 195 ms, analyse 1,271 ms, 1,000-shot list 64 ms, trail p95 0.2 ms); **none of it is an iPhone number**.

## 7. Per-clip calibration findings (M1, detector v2; set A gate = 5 stills)

| Clip | Role / note | Rim | Board | Usable cues (set A) | Mean asp / off / roll / rim width | Finding |
|---|---|---|---|---|---|---|
| IMG_4839 | dev, S4 | 10/10 | 8/10 | pos size az off asp roll | 1.74 / -0.14 / -1.3° / 1.9% | good; identical placement to 4840 |
| IMG_4840 | dev, S4 | 10/10 | 10/10 | all but elev | 1.74 / -0.12 / -1.0° / 2.0% | good; the same-camera pair with 4839 is "comparable" |
| IMG_4851 | dev, S5 side-on | 10/10 | 7/10 | pos, roll only | 1.03 / +0.46 / -5.3° / 2.2% | the only strongly different view (the means separate it) but the board quad is wrong on most stills: **abstains by itself** |
| IMG_4866 | dev, S6 close | 10/10 | 10/10 | all but elev | 1.73 / -0.19 / -5.0° / 3.6% | good; closest zoom; same angle cues as the far clips: "normalizable" against them |
| IMG_4867 | dev, S6 | 10/10 | 10/10 | all but elev | 1.72 / -0.20 / -4.6° / 1.8% | good |
| IMG_4872 | validation, S7 | 10/10 | 9/10 | pos az off asp (size and roll fail) | 1.70 / -0.20 / -1.2° / 1.4% | rim width is the noisy input here (sd 0.105) |
| IMG_4873 | validation, S7 far shooter | 10/10 | 10/10 | all but elev | 1.73 / -0.17 / -0.7° / 3.5% | good |
| IMG_4844 | validation; **camera moved during the clip** | 2/10 | 0/10 | none | n/a | the rim is not where it was aimed for 8 of 10 stills: a real "camera moved" detection (the app would say "hoop not found") |
| IMG_4874 | diagnostic, S7 | 10/10 | 6/10 | all but elev in set A only | 1.72 / -0.19 / -1.3° / 1.6% | board abstains in 4 stills (coverage 2-46%) |
| IMG_4836 | diagnostic, no window | 10/10 | 8/10 | pos size az asp roll (set A) | 1.76 / -0.11 / -1.6° / 1.7% | eye seed; fine |

Roll is a steady about -1 to -5 degrees of **board-edge tilt** (not a horizon): it is the same across sessions of a day and differs between days, so it is useful for "was the phone tilted differently", not as an absolute angle. Elevation (rim height/width, a ring only 3-11 px tall at 1080p) is too small to measure steadily: the dev clips fail its gate (sd 0.08-0.19 relative); on the far-shooter clips 4873 and 4874 its spread is smaller (0.03-0.04) but the registered decision (unusable) was not reopened.

## 8. Regression and compatibility

- App tests: **166 / 166** pass (126 before Phase 7; +10 deletion, +7 framing, +4 reference, +14 transfer, +5 phone test).
- Harness tests 47 / 47, experiment tests 97 / 97.
- `next build` succeeds; ESLint is clean on `src/`.
- **Frozen baseline reproduced and compared with `compare.mjs` against `baseline-v0`: no change in any area** (shots at 30 and 15 fps: 0 gained, 0 lost; detection recall 66.7% and precision 100.0% unchanged; localisation median 0.81 px unchanged; desktop inference median 119.3 ms unchanged). The temporary report files were deleted. `thresholds.json`, `baseline-v0` and `datasets.lock.json` are unchanged (the lock re-stamp was reverted).
- Feature flags: the framing code is only imported by the lab page; the counting loop adds three timers behind `hl:session-review-debug` and otherwise one `const diag = debugEnabled()` per set; export/import UI is behind `hl:session-review`; deletion wiring is a no-op unless history was ever used.
- DB compatibility: no schema change (`HISTORY_SCHEMA` stays 1, `deletedAt` is optional and ignored by older rows); imports go through the same `saveSession` and `parseShot` as live saves; a newer-schema store refuses import.

## 9. Remaining limitations (what this does not show)

- **One hoop, one driveway, one phone, about 8 camera placements.** Nothing here generalises to other courts, hoops, phones or light. Several placements are nearly identical in view angle, so real-image sensitivity to angle is barely tested; the only strongly different view (IMG_4851) is the one M1 cannot extract.
- **No real azimuth/elevation ground truth.** F5 is a model (orthographic hoop, board 72x42 in, rim 18 in, 15 in out from the board, measured noise): it tests the decision rule, not detection on imagery.
- **Camera height cannot be seen** (elevation fails its gate) and small angle changes cannot be confirmed: "comparable" always carries "camera height not checked".
- Rim width comes from a colour mask that is a few pixels thick at 1080p and varies with light; it is the main noise source in `az` and `size`.
- The real-pair truth is partly my eye; the background registration cannot tell a turned camera from a moved one.
- Detector v2 was developed after v1's validation overlays were seen (not their metrics); thresholds and tolerances were not changed after results, but the registered F2 was **replaced** by a gate design after it failed.
- No iPhone has run any of this: not the phone test, not the camera reference, not the export/import, not the live-loop timers.

## 10. Recommended next milestone

1. **Run the phone test and two real sets (review off, then on) on Matt's iPhone**, paste the results, and judge them against the registered limits. Until that passes, the history feature stays off by default.
2. Re-check framing with a **controlled view change**: one filmed pass with the phone deliberately moved around the hoop in known 5/10/20 degree steps and a height change, using the reference page to record each stop. That is the one measurement that would turn the model-based F5 into a real-image result. (This is a request for new footage that this phase did not make; it is the next phase's decision.)
3. Only if (2) passes: wire the reference check into the start of a session as a **warning**, and let history comparisons consult it as a *veto* (never an approval), with the criteria registered first.

## Reproduce

```bash
node training/tools/43-run-tests.mjs                                   # 166 app tests
node --test training/eval/lib/*.test.mjs && node --test training/eval/experiments/*/*.test.mjs
# framing evaluation (needs stills: see training/eval/experiments/camera-framing/lib.mjs for the layout under training/work/framing/stills, git-ignored)
node training/eval/experiments/camera-framing/bgreg.mjs               # background registration (real-pair truth)
node training/eval/experiments/camera-framing/extract.mjs             # M1 over all stills
node training/eval/experiments/camera-framing/synth.mjs               # synthetic similarity controls (slow: about 1 hour)
node training/eval/experiments/camera-framing/m2.mjs                  # M2 as shipped
node training/eval/experiments/camera-framing/evaluate.mjs            # writes results/evaluation.json
# browser checks need temporary routes (never committed): /lab/transfer-demo, /lab/phone-demo, /lab/ref-demo (see the e2e scripts)
```

Frames and videos of the children stay in `training/work/` (git-ignored) and were never committed or uploaded.
