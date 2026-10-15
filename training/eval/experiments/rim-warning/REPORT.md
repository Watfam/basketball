# P-1: the rim-reading warning (experimental, display only, off by default)

**Bottom line.** The warning is built, isolated and behind a disabled flag (`hl:rim-warning`, which also needs shot review on). It never changes a shot
count, a make/miss call, a detection or a tracking record, and with the flag off none of its code runs. On the clips we have it raised **no false warning**
(0 of 7 clean clips, 0 of 156 clean shots), **did warn on the one clip that has the rim phantom** (IMG_4873) but only just, and **it failed one of the
criteria registered beforehand** (shot-level recall: 2 of 3 truly affected shots flagged against 80% required). On synthetic injected phantom it warned in 26 of
28 sets at the heavy duty cycles and in 0 of 14 sets at the lightest. **None of this is independent validation**: every clip was seen before, the
phantom is known to be in exactly one of them, and the numbers rest on that one clip. It is a reasonable experiment for you to try; it is not a proven safeguard.

All numbers: `results.json` (reproduce with `node evaluate.mjs`), criteria `criteria.json` (registered and committed **before any statistic existed**), thresholds
`thresholds.json` (derived from the five development clips only and committed **before** the other clips or any injection were evaluated).

## What the warning does

At the end of a camera set, with shot review **and** `hl:rim-warning` on, the app reads the review records it already keeps and checks, for each counted
shot, what share of the camera's looked-at frames carried a ball-like box on a **long-occupied spot near the rim** (the recorder already flags these). If at
least **2** shots show 25% or more, and those shots are at least 20% of the set, it shows:

> **The camera may be reading part of the rim as a ball in this set.** When that happens, shots that follow each other can be counted as one, so the shot count could be low. Nothing has been changed. Watch the marked shots before you save, and add any missed shot by hand.
> *4 shots are marked: 3, 4, 7, 9.* **[Review the marked shots]**

The button opens **Review your shots** with the marked shots flagged (⚠), explained, and filtered to (with a switch to show all). It claims no verified cause
and says nothing was changed. A shot that was lost or merged has no record of its own, so it cannot be listed; the text says to add missed shots by hand.

Isolation (all tested): the module is a pure function (inputs deep-frozen in a test); no file in `src/lib/vision` or the camera loop imports it; the review entry
returns before reading any record when the flag is off (a static test, plus a browser test that the review store is not even opened); the module has no write
path; the banner only displays; the review records are byte-identical after the warning and the review.

## Method (registered first)

Each clip's saved ball-6 detections are replayed frame by frame (15 fps, the app's rate; 30 fps as sensitivity) through the **app's own review recorder and the
production counting core, unchanged**, cutting a record at every counted call exactly as the camera loop does. The development clips (IMG_4839, 4840, 4851, 4866, 4867,
all clean) set the thresholds by the registered rule: T_SHOT = clamp(2 x p99 of the shot statistic, 0.25, 0.60), T_FRAC = clamp(2 x worst clip share, 0.20, 0.50). **All
development shots measured exactly 0**, so both thresholds sat at their registered floors (0.25 and 0.20): the thresholds are not tuned to anything, they are the floors.
Truth: IMG_4873 is the phantom set (rim-phantom study); a counted shot there is "truly affected" if its record holds at least 5 frames with a raw box within 4 px of
the study's phantom centre (read from that study's `analysis.json`, not recomputed).

## Results against the registered criteria (15 fps)

| Criterion | Result | Verdict |
|---|---|---|
| **C1** false warnings on the 7 clean clips: at most 1 | **0 of 7** (Wilson 95%: 0 to 35%). By 10-shot windows (not scored): 0 of 16 (0 to 19%) | **pass** |
| **C2** warns on IMG_4873 | **warns** (2 affected of the 6 shots that had a readable record: exactly the minimum of 2). At **30 fps it does not warn** (1 affected) | **pass** at the app's rate; fragile |
| **C3** shot level: at least 80% of truly affected shots flagged AND at most 5% of clean shots flagged | phantom clip **2 of 3 (67%, 21% to 94%)** flagged; clean clips **0 of 156 (0 to 2.4%)** flagged | **FAIL** (recall below 80% by one shot) |
| **C4** injection: warn on at least 90% of sets at duty 0.42 and 0.60, at most 10% at 0.05 | **26 of 28 (93%, 77% to 98%)**; **0 of 14 (0 to 22%)** at 0.05 | **pass** (synthetic) |
| **C5** no side effects | tests above; production files byte-identical to the Phase 8 commit (`production-unchanged.json`: 90 files compared, 0 changed); frozen baseline reproduces unchanged | **pass** |
| **C6** honesty | this report | **pass** |

Injection detail (SYNTHETIC; the rim-phantom study's generator; 7 clean clips x 2 spots; `by_duty` in `results.json`):

| duty (share of frames with the false box) | sets warned | shots the production counter lost (all 14 sets) | sets losing 2 or more shots |
|---|---|---|---|
| 0.05 | 0 / 14 | 3 (it gained some too) | 0 |
| 0.10 | 3 / 14 (21%) | 2 | 0 |
| 0.20 | 11 / 14 (79%) | 5 | 2 |
| 0.42 | 14 / 14 | 42 | 7 |
| 0.60 | 12 / 14 (86%) | 107 | 14 |

Read against harm: it stays quiet where the phantom costs nothing (0.05), and warns in most sets where it starts to cost shots (0.20), but it **missed 2 of 14 sets at 0.60, the heaviest duty**
(IMG_4851 and IMG_4874, spot 1: the counter halved the shots, 17 to 8 and 20 to 10, yet only 1 shot per set was flagged). Heavy phantom makes fewer, longer "shots" with fewer usable records.

## What the numbers do and do not show

- **False warnings:** on 7 clean clips (156 shots) none. A real tendency to false-alarm below about 1 in 3 clips is not excluded (the interval reaches 35%).
- **Missed warnings:** exactly one phantom clip exists. Its warning rests on 2 flagged shots out of 6 readable records; at 30 fps it is missed. The detection rate on real phantom sets cannot be estimated from n = 1.
- **A finding that is NOT used (post-hoc, not adopted):** on IMG_4873, **6 of 12** counted shots have an **empty** record (the shot lasted longer than the recorder's memory when the call was made, which is what merging looks like), against **0 of 156** on the clean clips at 15 fps (and 0 of 7 clips at 30 fps). That is a much clearer signal than the share statistic. I did not add it: it was found by looking at the results, after the thresholds and rule were frozen, and it fits the one phantom clip. It is a **candidate for a registered v2** (`criteria-v2.json`) that needs a phantom-regime set it was not found in, which we do not have without new recordings.
- **Truth for C3 is three shots.** A criterion that depends on three shots is a weak criterion; the failure is reported as a failure.
- Synthetic injection tests the rule against a phantom model the earlier study built from IMG_4873; it is not evidence about phantoms that look different.

## Status and recommendation

- **Ships disabled.** The switch is under "Separate switches" in the lab page, labelled experimental; defaults unchanged; the lab also has **Preview the rim warning (made-up set)** so you can see it on your phone without a camera (it is labelled invented data).
- It is fine to turn on for your own sets to see whether it fires when it should and stays quiet when it should not. I would not rely on it to catch every phantom set (it missed 2 of 14 heavy injected sets and the real phantom clip at 30 fps), and I would not show it to other players.
- Judging it properly needs live sets in the phantom regime (far shooter, 1x lens, close rim). Those are not requested now; if you do shoot such a set, note whether the warning appeared and whether the count was low.

## Regression

- App tests **194 / 194** (181 before; +5 sample import, +8 rim warning), harness **47 / 47**, experiments **101 / 101**; ESLint and `next build` clean.
- **Frozen baseline reproduced and compared with `baseline-v0`: no change in any area** (shots at 30 and 15 fps: 0 gained, 0 lost; detection 66.7% recall, 100% precision; localisation median 0.81 px; desktop inference median 119.3 ms). Temporary reports deleted; thresholds, baseline-v0 and datasets.lock unchanged.
- **Production counting unchanged:** `verify-production-unchanged.mjs` compares 90 files (all of `src/lib/vision`, `src/lib/basketball`, `public/` assets, the camera stage and shooting hub components, the frozen evaluation inputs) with the Phase 8 commit: **0 changed** (`production-unchanged.json`).

## Reproduce

```bash
node training/eval/experiments/rim-warning/dev-stats.mjs      # step 3: thresholds from the development clips only (already committed)
node training/eval/experiments/rim-warning/evaluate.mjs        # the registered evaluation, real clips (15 and 30 fps) and synthetic injection
node training/eval/experiments/rim-warning/verify-production-unchanged.mjs   # production files byte-identical to the Phase 8 commit
node training/tools/43-run-tests.mjs rim-warning               # unit and static tests
```
