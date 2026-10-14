# Experiment 1: persistent ball tracking and a track-based shot-state machine

**Verdict: NOT READY FOR INTEGRATION. Nothing was promoted into `src/`. The app, ball-6, V4, the hoop window, the auto-sizer, the
review screen, `thresholds.json` and baseline-v0 are unchanged** (`git diff` of `src/` and `public/` over the whole experiment is empty;
`datasets.lock.json` regenerates byte-identical; app tests 93/93, harness tests 47/47, experiment tests 59/59).

Everything below is on the eight saved clips already used for the baseline. **There is no untouched footage**: development, validation
and diagnostic clips were all seen before, IMG_4874 was inspected repeatedly, and no result here is evidence of generalisation.
Numbers are image-space pixels on this Mac; none is a phone number, a metre or an angle.

## What was built (all in `training/eval/experiments/tracker/`, isolated, nothing imported by the app)

| Piece | File | Notes |
|---|---|---|
| Motion models | `kalman.mjs`, `motion.mjs` | constant velocity, constant acceleration, ballistic (x constant velocity, y free acceleration; image-space, **not** assumed to be gravity), hybrid (innovation-weighted blend). Reference-frame time, so 30 and 15 fps are the same model. |
| Interpolation estimators | `motion.mjs` | least-squares over a window each side; observed points are never overwritten (test). |
| Tracker | `tracker.mjs` | track id, tentative / confirmed / coasting / ended, observed centres and box size, velocity, motion state (moving / stationary / unknown), prediction uncertainty, confidence, frames since observation, occlusion and reacquisition. Observed, predicted and reconstructed points are stored in separate lists. Pluggable association: `kalman`, `nearest_last` (the rule's own chaining), `cv_nearest`. |
| Spot memory | `spotmemory.mjs` | H2's occupied-spot idea as a grid count. |
| Shot machine | `shotmachine.mjs` | reads tracker snapshots only. States held, release, flight, rim approach, rim interaction, complete, aftermath, uncertain; flags for shots that start inside the window, ball first seen in the zone, apex, release, reacquired. Clutter = a motionless observation at a well-visited rim spot, judged at decision time. |
| Decision | `decide.mjs` | the shipped V4 functions; `decide.test.mjs` proves it reproduces the shipped counter exactly. |

Architecture and the H2 reuse table: `ARCHITECTURE.md`. Registered before any result: `criteria.json` (T1-T13), `criteria-addendum-1.json`,
`criteria-v2.json` (round 2), `criteria-v3.json` (round 3, the last). Rounds 2 and 3 are **adaptive** (designed after seeing earlier
results on the same footage) and labelled so. `evaluate.mjs` applies the criteria mechanically; `results/verdict-round3.json` is the verdict.

## Result against the frozen baseline (round 3, the registered final configuration)

Correct calls of all written shots, 30 fps / 15 fps. "H2" is the earlier experimental filter plus the legacy grouping, rebuilt unchanged.

| Clip | baseline-v0 | H2 | tracker r2 | **tracker r3** |
|---|---|---|---|---|
| 4839 | 27 / 26 | 27 / 26 | 27 / 26 | 26 / 26 |
| 4840 | 31 / 31 | 31 / 31 | 31 / 31 | 31 / 31 |
| 4851 | 16 / 16 | 16 / 16 | 16 / 16 | 16 / 16 |
| 4866 | 18 / 18 | 18 / 18 | 18 / 18 | 17 / 18 |
| 4867 | 15 / 15 | 15 / 15 | 15 / 15 | 15 / 15 |
| 4872 | 23 / 23 | 23 / 23 | 22 / 22 | **14** / 21 |
| 4873 (regression case) | 11 / 12 of 22 | 21 / 20 | 20 / 20 | 19 / 19 |
| 4874 (diagnostic) | 18 / 18 | 18 / 18 | 18 / 18 | 17 / 17 |

## Criteria (round 3, mechanical)

Pass: T2 (IMG_4873: 20/22 and 22/22 matched, V4 right 19 and 19, longest merged shot 97 and 36 sightings, baseline 1044 and 525), T5 (continuity,
107/110 and 109/111 shots in one track), T13 (legacy equivalence, 16 of 16 clip-by-rate checks identical).
**Fail: T1 (4872 loses 9 calls at 30 fps), T3 (an injected phantom reaches 19.6% of shot evidence at 30 fps, limit 10%), T4 (stall
survival 90.7% / 94.4%, limit 95%; everything else in T4 passes), T6 (association scenes), T7 (occlusion recovery), T8 and T9 (the
selected model is worse than the plain baselines in every cell), T10 at 30 fps (p99.9 3.8 ms, limit 2). T6b was not run as registered.**

## What improved

- **Rim phantom, persistently.** IMG_4873's phantom is 5.5% / 1.1% of shot evidence (baseline 14.8% / 16.5%),
  genuine boxes treated as clutter 3 of 7682 (30 fps), zero of the 21 annotated balls, 7 of 7 in-hand balls retained. This matches H2 (4.7% / 4.6%);
  it does not beat it.
- **Continuity and identity of whole shots.** About 97% of shots sit in one track (the baseline has no notion of track).
- **Real-footage identity (exploratory, `eval-identity.mjs`, not registered).** On IMG_4873's 270 frames where the ball and the oracle-marked phantom
  are both present, the round-3 tracker never put them in the same track at 30 fps; `nearest_last` and `cv_nearest` did (25 phantom and 10 ball boxes mixed).
- **Association against the rule's own chaining.** On adjacent_blob and near_duplicate scenes it keeps 91.5% and 89.7% of the ball against 72% and 75% (30 fps).
- **Round 2's segmentation** (shots closed by 40 frames of silence, other tracks attached as evidence) matched the baseline within one call on seven clips and
  took IMG_4873 from 11 to 20 correct at both rates. It failed T3 and T4 only at the margins, and T6/T7/T8/T9/T10.

## What failed, and why

1. **The Kalman associator is not better than a plain constant-velocity nearest-neighbour.** `cv_nearest` keeps 98.7 / 95.8 / 91.3% (static blob / adjacent / near-duplicate, 30 fps)
   against 92.1 / 91.5 / 89.7% for the tracker. Round 3's gate widening fixed clean runs (80% to 99%) and a one-frame gap (90% to 99%),
   but not the distractor scenes, and T7 still fails past 4 hidden frames (92% at 6) for the selected model.
2. **Bounces break a tight filter.** Found on dev clips: a bounce or hit changes velocity within one frame (misses of 8-16 px against a 6 px gate), and the filter
   then lags 2-3 frames. Round 2 therefore lost the ball 7-10% of the time after a one-frame gap. Round 3 added a reach of `max(6, 0.5 x ball width, 2 x speed x dt)` and a last-observed-position test.
3. **Round 3 helped association and hurt shots.** IMG_4872 fell from 22 to 14 at 30 fps. One baseline shot (frame 3359) is no longer counted and the shot pairing, which aligns by V2 agreement, then slides by one,
   producing nine alternating make/miss errors. So the registered score overstates the loss; the true loss is probably one or two calls plus pairing noise. I did not re-pair, because that changes the scorer. Injected phantoms reach more evidence under the wider gate (19.6% worst, from 11.1% in round 2).
4. **The selection rule picked the wrong model.** Tuning scored median plus p95; constant velocity won on tails and is worst at the median. It is 1.2-2.3x worse than the best baseline at causal prediction and 2-16x worse at interpolation (the interpolation fit
   inherits the selected model: a registration flaw I stated at the time). Exploratory, not a selection (post hoc): at 30 fps the ballistic and constant-acceleration filters beat the best baseline's median by 20% or more in 10 and 9 of 12 prediction cells but have a p95 up to 1.8x worse; at 15 fps neither wins; interpolation by `fit_ca` is exactly the plain constant-acceleration baseline.
   **No motion model beat a simple baseline in a way the criteria allow me to claim.**
5. **Stall survival** (a ball hangs motionless 15 frames): 91% / 94%, mostly not a lost call. Post hoc (`diagnose-stall.mjs`, round-2 gate): the call survives in 106 of 107 cases, but the stationary first sightings are classified as clutter, so the shot's start moves later than the 15-frame tolerance. A ball first seen motionless at a well-visited rim spot looks exactly like the phantom. This is a real limit of the concept, not a tuning issue.
6. **Overhead.** Median 0.007-0.03 ms per frame, 30 fps p99.9 up to 3.8 ms, worst frame 9-40 ms between runs. **Worst-case investigation** (`diagnose-timing.mjs`): the slow frames are not decision frames, not box-heavy frames (0-1 boxes), and not repeatable between runs; 25-100% overlap a garbage-collection event, the rest are unattributed. H2 has the same kind of outlier (27.7 ms earlier). Consistent with GC plus scheduler noise on a busy desktop; **suspected, not proven**, and it has not been measured on a phone.
7. **Not done:** T6b, the by-eye labelled real identity runs. Multi-box real frames are rare (3-15 per clip, 347 on IMG_4873), so the exploratory oracle check above is all the real-footage identity evidence there is.

## Coaching groundwork (not built, as instructed)

Counted shots carry a timeline and flags. Across 174 counted shots (30 fps): apex observed in 50, release observed in 1, held ball observed in 1, 129 start inside the window, 32 with the ball first seen in the zone.
**The 416 px window almost never sees the release**, so release-point consistency, form and lateral alignment at release cannot come from this footage; that is the Experiment 2 question (a wider window), not a tracker one.
The `uncertain` flag is set on 117 of 174 shots, so it is too sensitive to use as a quality signal yet.

## Recommendation

- **Do not integrate.** The tracker passes the criteria it was built for (phantom, continuity) no better than H2, and fails the ones that decide whether it earns its complexity.
- **Do not adopt the Kalman associator.** If a persistent id is wanted for coaching, a constant-velocity nearest-neighbour associator with the spot memory and the round-2 shot machine is the thing to test next. It needs its own registration, and ideally new footage.
- **Keep** the shot-machine design (silence-closed shots, attached evidence, decision-time clutter, timeline), the spot memory, and `evaluate.mjs`: they are the reusable parts.
- **Experiment 2 (wider window)** is now the better lever for coaching measurements; hard-negative training of rim hardware remains the root-cause fix for the phantom.
- Footage recorded after this harness was locked would turn every number above into a test rather than a re-test.
