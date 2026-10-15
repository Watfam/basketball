# Known issue: shot separation (not fixed; cases preserved)

**Status: open. Nothing here changes shot counting.** Decided in Phase 8 not to start another tracker or detector redesign. The cases below are
preserved as a guard test (`known-issue.test.mjs`, part of the experiment test run) so they cannot drift or be forgotten.

## The problem, in one paragraph

Counting decides *how many* shots happened by grouping ball sightings near the rim into shots. Two things can go wrong: **two real shots are
counted as one** (merged), or **a non-shot is counted** (extra) or **a real shot is lost** (missing). The make/miss call on a merged pair is
not scored, so a merge costs two shots, not one. This is separate from misreading a make as a miss, and separate from the scorer pairing the
wrong written shot with a counted one (the frozen scorer pairs by order and can slide by one; the diagnostic matches by time instead).

## The preserved cases (all from existing recordings; `results/diagnostic-all.json`)

| Case | What it shows | Where it bites |
|---|---|---|
| **1. IMG_4872, shots at frames 3301 and 3359** (58 frames apart, both real) | The shipped grouping keeps them apart. The experimental tracked family (cv_nearest) keeps **one track** through both balls and merges them; the Phase-5 "second-shot arrival" candidate did not fix it (still 1 merged prediction covering 2 shots at 30 and 15 fps). The Kalman version separates them. It is an *association* failure (the second ball is attached to the first ball's track), so a rule about when a shot ends cannot repair it. | the experimental tracker path, not the shipped counter |
| **2. IMG_4873 (far shooter, rim hardware read as a ball)** | The **shipped** grouping merges **17 real shots into 4 predictions** at 30 fps (16 into 4 at 15 fps) and matches only 5 of 22 by time; the Kalman round-2 pipeline matches all 22. The rim's net and hardware keep the rim zone "occupied" so consecutive shots never separate. | the **shipped** counter, in this regime (far shooter / 1x lens) |
| **3. IMG_4851 (side-on)** | One written shot no pipeline finds, so that clip's outcomes are flagged ambiguous and excluded from outcome scoring. | evaluation honesty |
| **Pooled** | Over the eight clips the shipped grouping merges 17 references into 4 predictions and loses none (177 references, 167 predictions). | |

The frozen baseline (`baseline-v0`) is unchanged and still scores these clips as before; it reproduces exactly (see the Phase 8 report).

## Why it is not fixed here

- The experiments that separate case 2 (Kalman tracker, spot memory, track-based shot machine) failed other registered criteria in Experiment 1 and were not integrated.
- The one targeted candidate (Phase 5) failed its criteria; the diagnostic found the cause (case 1).
- Anything that changes how shots are grouped is a change to production counting, which this phase does not touch.

## How to re-run

```bash
node --test training/eval/experiments/shot-separation/*.test.mjs        # includes the preserved cases
node training/eval/experiments/shot-separation/run-diagnostic.mjs all   # regenerates results (do not overwrite diagnostic-all.json without saying why)
```

A separate, small, non-counting proposal that touches this regime is in `../product-readiness/PROPOSALS.md` (not integrated).
