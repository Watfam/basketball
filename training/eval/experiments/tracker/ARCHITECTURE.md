# Experiment 1: persistent ball tracking and a track-based shot-state machine

Status: EXPERIMENTAL, isolated. Nothing here is imported by the app. `src/`, `public/`, ball-6, V4, the hoop window, the auto-sizer,
the review screen, `baseline-v0` and `thresholds.json` are untouched. "Feature flag" here means the experiment's configuration:
`segmenter: "legacy" | "tracks"` and `associator: "nearest_last" | "kalman"` select behaviour in the harness; the app has no flag
and gets none until integration is approved.

No new footage is used or needed: everything runs on the saved ball-6 detections of the eight scored clips (and the 88 annotated frames).
Limits of that: every clip has been seen and scored before, ball-6 trained on all but IMG_4874 (so detections on those are cleaner than a
new clip's), and real frames in which boxes compete are rare (3-15 per clip, 347 on IMG_4873, which is the phantom). Nothing here can
establish independent generalization, and nothing will be claimed as such.

## Two components, one narrow interface

```
detections (window px, score) --> TRACKER --> track snapshots --> SHOT MACHINE --> shot records (+ V4 calls)
                                     |                                  |
                                spot memory (static scene)        decision replica (the V4 rule, unchanged)
```

Neither component knows how the other works. The tracker never sees make/miss; the shot machine never sees a raw box except through a
track's observations.

### Tracker (`tracker.mjs`)

Input per processed frame: `push(f, boxes)` where `f` is the reference frame number (30 fps units, so 15 fps just has gaps).
Output: `Snapshot { f, tracks: TrackView[], events: TrackEvent[] }`.

`TrackView` (a read-only copy; the tracker owns the state):

| Field | Meaning |
|---|---|
| `id` | persistent integer, never reused |
| `state` | lifecycle: `tentative` (fewer than 3 hits, not yet moving), `confirmed`, `coasting` (not seen this frame, within the coast limit), `ended` |
| `motion` | `moving` (the track's recent observations spread at least 10 px over 20 reference frames, H2's "current proof"), `stationary` (they have not), `unknown` (too young to say) |
| `clutter` | static scene feature: stationary AND on a spot that held a box in at least 3% of the last 40 s (H2's spot memory). Clutter tracks are kept and reported, never discarded; the shot machine ignores them |
| `obs` | OBSERVED points only: `{f, x, y, w, h, score}`. Immutable once written |
| `est` | filter estimate at the last update: `{f, x, y, vx, vy, ax, ay}` and `sigma` (1-sigma position uncertainty, px) |
| `predicted` | PREDICTED points for the frames since the last observation: `{f, x, y, sigma, predicted: true}`. Kept apart from `obs` and never written back into it |
| `framesSinceObs` | reference frames since the last observation (0 when observed this frame) |
| `occlusion` | `{status: none \| occluded \| reacquired, since, gaps}`; `reacquired` is set for the frame an occluded track is matched again |
| `stats` | `{hits, misses, age, meanScore, medianWidth, startF, startedInZone}` |

Association (per frame): each live track predicts its position with its motion model; a box may join a track if it is inside the gate
(Mahalanobis, chi-square 99%, floored at 6 px and capped at the rule's 30 px per reference frame); assignment is greedy by cost
(squared Mahalanobis distance plus a size-change term plus a confidence term), best first, one box per track. Boxes left over start
tentative tracks. `associator: "nearest_last"` replaces the prediction by the last observed position (the existing behaviour of the rule
and of the harness's baseline chaining), so the baselines are the same tracker with the association strategy swapped.

Motion models (all in reference-frame time, so 15 fps needs no special case; image-space acceleration is a fitted parameter, NOT a claim
about gravity):

| Model | x axis | y axis |
|---|---|---|
| `cv` | constant velocity | constant velocity |
| `ca` | constant acceleration | constant acceleration |
| `bal` ("ballistic", image space) | constant velocity (no sideways acceleration) | constant acceleration, free parameter |
| `hyb` | `cv` and `bal` run in parallel; prediction is the average weighted by their recent innovation likelihood | |

Lifecycle: `tentative -> confirmed` after 3 hits or proof of motion; `confirmed -> coasting` when a frame has no matching box;
`coasting -> confirmed` with `occlusion.status = reacquired` when matched again within 8 reference frames (the rule's own gap, FALL.maxGapFrames);
`-> ended` after the coast limit, or immediately for a tentative track that missed once. Held balls and balls resting on the rim are
`stationary` but live: stationary is a motion state, not a reason to drop a track.

### Reuse of H2

| H2 component | Where it lives now |
|---|---|
| spot-occupancy memory (3% of 40 s, radius 8) | `spotmemory.mjs`, now a grid count (constant time, removing the per-box scan that is the suspect for the slow frames) |
| motion proof must be current (10 px over 20 frames) | the track's `motion` state |
| the tracker (position, velocity, start frame, proven flag) | `tracker.mjs`, extended with filters, uncertainty, lifecycle and prediction |
| "drop box iff occupied spot AND not moving" | track-level `clutter`, decided at shot-decision time (below) |

H2 itself stays an experimental candidate and is not modified.

Decision-time evidence: the app already waits about 70 reference frames after a shot reaches the rim before calling it. The shot
machine uses that wait: clutter status is read when the call is made, using everything seen up to that moment (never later), so the
3-second warm-up leak that limited H2 is reduced for shots that happen early in a session.

### Shot-state machine (`shotmachine.mjs`)

Consumes `Snapshot`s. Per candidate shot it records a timeline of states:

`held` (a non-clutter track stationary or slow in the lower window) -> `release` (it starts to move up; release point = last held
position, flagged `visible` only if observed) -> `flight` (moving track) -> `approach` (flight track within the approach band above the
rim) -> `rim` (observed in the rim zone) -> `complete` (call issued) -> `aftermath` (the track continues: rebound, roll) ; and `uncertain`
whenever the owner track is coasting.

A shot may start in any state: a valid shot needs only two observed zone sightings by a non-clutter track. A ball first seen at the rim,
a ball already resting there, or a shot beginning inside the window all qualify. Flight history is recorded when present and never
required. A shot is owned by a track; successor tracks that begin within 12 frames and 40 px of the owner's coasting prediction are linked
(reacquisition after occlusion). A different track entering the zone while the first owner is gone starts a new shot even inside the
legacy 40-frame merge gap.

Make/miss: the existing V4 decision (`callShot`, `rimCrossing`, `flagReasons`, `median`, imported from `src/lib/vision/shotRules.ts` as
shipped) applied to the shot's evidence: the observed boxes of the shot's tracks. `decide.mjs` replicates only the assembly (the learned
session centre and the counted number); it is proven identical to baseline-v0 by feeding it legacy zone grouping (criterion T13).

### Output designed for later coaching (not built)

A shot record carries: track ids, `obs` (observed) and `predicted` points separately, per-point `sigma`, state timeline with frames,
release point and whether it was observed, apex (observed, else null), flight frames, rim-zone entry point and speed, below-net
sightings, the V4 call and its evidence, and flags (`startedInWindow`, `ballFirstSeenInZone`, `uncertain`, `reacquired`). Shot
fingerprints, release-point consistency, trajectory comparison and lateral alignment are computed from these records later; all
positions are image-space window pixels and are not physical measurements until the camera geometry is validated.

## Files

New (all under `training/eval/experiments/tracker/`): `ARCHITECTURE.md`, `criteria.json`, `kalman.mjs`, `motion.mjs`, `spotmemory.mjs`,
`tracker.mjs`, `decide.mjs`, `shotmachine.mjs`, `*.test.mjs`, `eval-motion.mjs`, `eval-shots.mjs`, `evaluate.mjs`, `REPORT.md`.
Modified: `training/README.md` (pointer). Nothing else.

If approved for integration (NOT part of this experiment), the changes would be: new `src/lib/vision/tracking/{kalman,motion,spotmemory,tracker}.ts`
and `shot-machine.ts` with these tests ported; `counting.ts` gains an optional `segmenter` option defaulting to the current behaviour;
`use-camera-counter.ts` reads one local-storage flag (`hl:tracker=experimental`) to select it; `shotRules.ts` unchanged. The window
rescale path (auto-sizer) must reset tracker state, as it already resets the counter.
