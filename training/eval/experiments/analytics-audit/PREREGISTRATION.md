# Phase 14: analytics audit, pre-registered before any simulation was run

Question: when nothing about a player has changed, how often do the player-facing statements still say "Clear improvement" or "you miss to one side", and under what conditions does that rise above what the wording promises?

All simulations use the app's own functions (transpiled, not re-implemented): `analyzeBenchmarks`, `buildInsights`, `nextAction`, `newcombe`, `summarizePatterns`. Seeded random numbers. Assumptions that are not measured (day-to-day variation, camera offsets) are stated as assumptions and varied, never presented as facts about any player.

## Scenarios

- S1 benchmark, one comparison: true make rate p in {0.4, 0.5, 0.6, 0.7}, no true change, 30 shots a run, two runs. Day-to-day variation of the true rate: SD 0, 3, 5 points (assumption; no real data on this exists yet).
- S2 benchmark, as the screen is built: three benchmarks, runs in weeks 1, 3 and 6, the app's own insight rules (last against previous, and first against latest when clear). The timed benchmark takes 20 to 45 attempts.
- S3 ordinary drills, as the screen is built: three drills, six runs each of 8 to 16 attempts (up to three drills are shown).
- S4 whole screen: S2 and S3 together; the rate at which at least one "Clear" insight appears when nothing has changed.
- S5 side lean: misses with no true lean, 8 to 40 misses; then the same with a camera not behind the shooter (0, 15 and 30 degrees) and misses that are mostly short (depth), because from an angled camera a short or long miss is seen as a side miss. The geometry is a flat model (lateral and depth error mixed by the camera angle), an assumption.

## Criteria (what counts as a problem)

- C1 Calibration: with no day-to-day variation, one comparison should say "Clear" in each direction no more than 3.0% of the time (nominal 2.5%).
- C2 With day-to-day SD of 5 points, one comparison should say "Clear" (either direction) no more than 10% of the time.
- C3 Screen level (S4), SD 5 points: at least one false "Clear" on a screen should be no more than 15%. If more, the rule that adds the most false clears is tightened (smallest change first), and the sentence shown to the player says what the badge does not mean.
- C4 Side lean with a camera behind the shooter: a "strong lean" with no true lean no more than 7%. With an angled camera, if it exceeds 10% at 15 degrees, the lean sentence must carry the camera-position caveat and may not be shown as a fact about the shooter.
- C5 Design review (no simulation): any rule that reports only one direction of a comparison, or that suggests a re-test sooner than the program's own spacing, or that counts an incomplete run as "not run", is a defect.

Anything changed because of these results is changed narrowly, with a test, and the numbers before and after are reported.
