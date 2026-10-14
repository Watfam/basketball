# Rim phantom: evaluation and recommendation (2026-10-14)

Frozen inputs: baseline-v0 (ball-6, V4, existing window), thresholds.json, datasets.json, all unchanged. The app (`src/`, `public/`) is
unchanged. Every number below comes from `results/*.json` and is reproduced by `node experiment.mjs && node evaluate.mjs`; the
baseline is re-derived exactly (every clip, both frame rates) at the start of every run.

**Headline.** The pre-registered bar was not met by any candidate in three rounds, so **nothing is recommended for integration yet.**
The closest, H2, removed no genuine ball anywhere and met every criterion at 30 fps; at 15 fps one injected configuration suppressed
89.6% of phantom boxes against the 90% required. The result is a design direction and a concrete next test, not a fix.

## 1. Root cause of the rim phantom

Established (analysis.json, devstats.json, pictures):

| Question | Finding |
|---|---|
| Truly stationary? | Yes. One spot, (179.7, 194.1) in the IMG_4873 sizer window; spread 1.2 x 0.8 px; present in 15 of 15 ten-second bins. |
| Size, score, stability | Width 10.7 px (9.6-13), score 0.51 (0.30-0.63). A real ball in the same file: 27 px, 0.88. It flickers: 87 runs, longest 200 frames (7 s), 42.1% of frames. |
| What is there? | The orange rim and net hardware at close range (crops at 6x, frames with the box on and off). No ball is in the picture when it fires. It switches on and off as the detector's score for that patch crosses the 0.2-0.25 threshold band. |
| iPhone 1x framing specific? | Scene-dependent, but one clip cannot separate "1x lens" from "this hoop at this scale". It appears in ball-5 too (6% in the sizer window, 31% at scale 1) and in ball-6 at scale 1 (49%). No other saved clip has a static spot above 2.5%, and those are real balls. IMG_4872/4874 (same session, 0.5x lens) show none. |
| Elsewhere in the dataset? | Not found: every other file's most repeated spot is 0.5-2.5% of frames, with ball-sized boxes (23 px) and scores 0.7-0.9. |
| Where does merging come from? | An interaction. The detector supplies the phantom; the zone grouping rule (any zone sighting within 40 frames extends the shot, no notion of identity) amplifies it. Phantom removed by position: longest merged "shot" 1,044 -> 85 zone sightings, 11 -> 25 counted. A synthetic phantom injected into a clean clip (IMG_4840) starts costing shots at about 20% duty (32 -> 29 counted) and 60% duty costs 13. |
| Why is ball-6 worse than ball-5 here? | **Hypothesis, untested:** the round-six data had positives from circle-fit-confirmed balls and, by design, no negatives from the new clips (README), so the detector never saw close-range rim hardware as a negative. |

## 2. Candidates (parameters fixed in criteria.json / -v2 / -v3 before each was run)

| | Idea |
|---|---|
| A | Drop a box if its spot held a raw box in at least 10% of the last 20 s of processed frames |
| B | Chain boxes into tracks (constant velocity); pass a box only after its track has moved 30 px |
| C50 / C60 | Drop boxes narrower than 0.5 / 0.6 of the sizer's reference ball width (11.85 / 14.22 px) |
| C50+B | C50 then B |
| H (round 2) | Drop only if the spot is occupied (3% of 40 s) AND the track has not proven it moves |
| H2 (round 3) | H, but proof must be current: revoked when the track's boxes spread under 10 px over 20 frames |
| Hard-negative training | **Not tested.** It changes the detector (frozen here), needs a Colab run, and a new baseline. |

Rounds 2 and 3 were designed after seeing the previous round's failures on the same footage. They are labelled as such; a pass
there is consistency with the registered criteria, not blind generalization. No untouched footage exists.

## 3. Registered criteria (criteria.json, S1-S7) against results

`pass` = met at both 30 and 15 fps. Details per candidate are in `results/verdict.json`.

| | S1 no harm (7 other clips) | S2 phantom suppressed (4873 + injected) | S2b recovery | S3 separation on 4873 | S4 genuine boxes (<=0.5%, 0 annotated) | S5 stall 15 frames (>=95%) | S6 overhead | all |
|---|---|---|---|---|---|---|---|---|
| A | pass | **fail** (90% / 76-95%) | **fail** (101.3 of 107) | pass | pass (0) | pass 107/107 | pass | no |
| B | pass (net -2) | **fail** (99% / 79-95%) | **fail** | pass | **fail** (8.7% dropped, 4 of 21 annotated) | **fail** 81/107 | pass | no |
| C50 | pass | **fail** (74% on 4873) | pass | pass | pass (0.40%) | pass | pass | no |
| C60 | pass | pass (98%) | pass | pass | **fail** (0.69%, 0 annotated) | pass 106/107 | pass | no |
| C50+B | pass | pass | pass | pass | **fail** (9.0%, 4 annotated) | **fail** 81/107 | pass | no |
| H | pass | **fail** (94% / 77-92%) | **fail** (99.3 of 107) | pass | pass (0) | pass | pass | no |
| **H2** | **pass** | 30 fps pass; **15 fps: one injected cell 89.6%** | pass (105.8 / 104.3) | pass | **pass (0 of 7,682; 0 of 21 annotated)** | **pass 107/107** | pass | **no (one cell)** |

Caveat on C: the injected phantom is 11 px wide, so a size gate removes it by construction (100% for C50/C60). That is not
evidence; the real 4873 phantom has a width spread, and there C50 removes 74%.

## 4. Per-clip results (V4 right / written shots; counted in brackets)

30 fps:

| Clip | baseline | A | B | C60 | H2 |
|---|---|---|---|---|---|
| IMG_4839 | 27/28 | 27/28 | 26/28 (29) | 27/28 | 27/28 |
| IMG_4840 | 31/32 | 31/32 | 31/32 | 31/32 | 31/32 |
| IMG_4851 | 16/18 (17) | same | same | same | same |
| IMG_4866 | 18/19 | same | same | same | same |
| IMG_4867 | 15/16 | same | same | same | same |
| IMG_4872 | 23/23 (24) | 23 | 22 (23) | 23 | 23 |
| **IMG_4873** (regression case) | **11/22 (11 counted)** | 20 (23) | 20 (22) | 21 (25) | **21 (23)** |
| IMG_4874 | 18/20 | 18 | 18 | 18 | 18 |

15 fps: identical pattern (IMG_4873: baseline 12, A 19, B 20, C60 20, H2 20; every other clip equal to baseline except B on 4839 and 4872).
IMG_4873 is a known regression case, not a generalization test. The registered oracle (phantom removed by position at score >= 0.25) scores
17/22; the same removal at all scores scores 20/22: H2's 21/22 is in that range. Longest merged shot on 4873 (zone sightings): baseline
1,044, A 155, B 49, C60 50, H2 89. On the seven other clips H2 changes **no shot** (30 fps).

## 5. False positives and false negatives

| | Phantom boxes passed on 4873 (of 1,815) | Genuine dev boxes dropped (30 / 15 fps) | Annotated genuine balls lost | Stalled-shot survival 15 / 30 frames |
|---|---|---|---|---|
| baseline | 1,815 | 0 | 0 | 107 / 103 of 107 |
| A | 187 | 0 / 0 | 0 of 21 | 107 / 103 |
| B | 17 | 665 of 7,682 (8.7%) / 376 | **4 of 21** | 81 / 80 |
| C50 | 479 | 31 / 16 (0.40%) | 0 | 107 / 103 |
| C60 | 29 | 53 / 29 (0.69%) | 0 | 106 / 103 |
| H2 | 106 | **0 / 0** | **0 of 21** | 107 / 103 |

(The 30-frame stall failures, IMG_4839 shots #3 and #16, fail identically in the baseline: the stall itself changes V4's call, not the filter.)
"0 of n" with n = 21 annotated balls bounds the loss rate at roughly 15% (95% upper), and 0 of about 7,700 boxes at roughly 0.05% if boxes were
independent (they are not: consecutive frames of one ball are correlated). That is why the stall simulation matters.

**Where the 106 leaked phantom boxes come from (4873):** classified for H, which leaks the same 106 boxes as H2 on this clip: 89 are the
3 s warm-up before any spot history exists, 17 ride a proven track (four episodes, longest 15 frames). In the injected clips most of H's
leaks (3,392 of 4,258) were a static box capturing a real ball's track and keeping it alive. H2's "current proof" was designed against
that and its injected suppression rose from 77-92% (H) to 89.6-97%, consistent with the fix; I did not re-classify H2's remaining
injected leaks.

## 6. Newly introduced failures (examples)

- **B, IMG_4839 shot #27:** the ball re-appears at the rim after a gap; its first 25 frames of zone sightings are withheld until the new
  track proves it moves. The rule's width test then sees the wrong frames and the call flips from miss to make.
- **B, IMG_4872 shot #1:** the ball is already in the zone in frame 1 of the clip; there is no track yet; the shot is not counted.
- **B drops held and resting balls** (annotated F011, F012, F039, F013: 28-30 px, score 0.82-0.86, in the shooter's hands or on the
  ground). That is harmless to today's rule and **harmful for release detection later**; a tracker must keep unproven tracks as state and
  only withhold them from the rule.
- **15% of shots (17 of 112)** have no ball box outside the zone in the 12 frames before it: any scheme that needs flight history to
  trust a box cannot rule on those, which is the structural limit of B.
- **C60** removes 0.69% of genuine boxes. Narrow boxes (under 14.2 px, score 0.25 or more) on the development clips are concentrated in
  IMG_4851 (45 of 93); I did not inspect what they are. On ball-5's box convention the same gate would
  remove 3.5-5.3% of confident real balls on 4872 and 4874: it is tied to the detector's box convention and must be re-derived at every
  retrain.
- **A's known weakness** (a real ball passing through a suppressed spot is lost there) is unit-tested but **not exercised by the data**:
  no development clip has a suppressed spot.
- **H2:** none observed on real clips. Untested: a real ball that rests more than 20 frames on the rim (the longest genuine still stretch
  seen is 7).

## 7. Performance

All filters are plain JavaScript on boxes: no extra model runs. Median 0.0005 ms per processed frame for H2 (A 0.0007, B 0.0003, C 0.0001)
against about 119 ms of inference on this Mac. H2's worst clip is IMG_4873 (mean 0.069 ms, p95 0.13 ms), and it had one 27.7 ms frame
(9.1 ms on IMG_4839; not diagnosed, possibly garbage collection). The spot test scans up to 1,200 frames per box; a grid count would
make it constant time. Phone timings are **unavailable**; desktop JavaScript is several times faster than an iPhone's, which still leaves
the filter far below the inference cost, but a multi-millisecond stall on a phone could drop a frame.

## 8. Recommendation

1. **Do not integrate any candidate now.** The registered bar was not met, and rounds 2 and 3 used the same footage.
2. **Carry H2's design forward; do not carry the rest.** It combines what the evidence supports: remember where the scene is static,
   and trust only what has recently moved like a ball. It removed no genuine ball in any test, and the 15 fps miss (89.6% against 90%)
   is warm-up latency plus a few track captures. The 15-frame revoke window (H2_r15) passed every criterion, but it was registered as
   sensitivity-only and may not be chosen because it scored better. Choose between 15 and 20 on **new** footage.
3. **The test that would settle it:** one fresh session recorded after this commit, never looked at before its first scoring: iPhone 1x
   framing at this hoop (the phantom case) plus a clean control hoop. Pre-register S1-S7 plus a pass line for the revoke window.
   Matt's own real sets with the saved `camera_report` are a second, footage-free source.
4. **Fix the cause, too.** Hard-negative training (rim and net hardware at close range, 1x framing) addresses the detector directly and
   would also help shot calling. It needs a Colab round and a new baseline, and should be measured against this one. Filters are the
   safety net, not the cure.
5. **Reduce warm-up leakage** in integration by keeping the learned static spots for the session (and per hoop, using the saved hoop
   reference), instead of relearning for 3 s at each start. Not tested here.
6. **Do not choose a size gate** as the long-term answer: leaky for this phantom (C50), marginal on harm (C60) and tied to box convention.

## 9. How this fits Experiment 1 (persistent ballistic tracking)

H2's tracker is the first slice of it, not a separate filter. It already holds the state a ball track needs: position, velocity,
start frame, and a "currently moving like a ball" flag, and it associates by constant velocity, the method the harness found best
(98% right ball with a nearby distractor, against 51% for nearest-point). Experiment 1 extends it with: constant-acceleration prediction
(the interpolation baseline's best, 0.5-1.2 px median at 30 fps for 1-6 hidden frames near the rim); occlusion bridging with observed versus
predicted flags; a plausibility score in place of the binary proof; and unproven tracks kept as state (held balls, release). The
zone grouping rule should then consume **tracks, not boxes**: a shot is a track, which removes the merging at its root instead of
screening what feeds it. The static-spot memory becomes the scene model. The capture failure found here (a static box feeding a
real ball's track) is exactly the association failure the synthetic "adjacent blob" test predicted, so that test belongs in Experiment 1's
acceptance set.

## Limits to hold me to

No untouched final test set. Three adaptive rounds on the same footage (rounds 2 and 3 labelled). Synthetic injection stands in for
phantoms the development footage does not have. IMG_4873 is a regression case. Ball-6 trained on most clips, so genuine-box figures
are cleaner than a new clip's would be. The annotation ground truth is a single AI annotator. Phone speed and memory are unavailable.
