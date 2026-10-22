# Why a black ball reads as every shot missed, and what round seven does about it

2026-10-22. Matt filmed `Training Video/IMG_4915.MOV` (not committed; footage of his kids) with a dark grey/black ball after the app called every
shot a miss with it. This is the root-cause measurement; the fix is `training/tools/52-round7-black-ball.mjs` and the "Round seven" entry in
`training/README.md`, registered before any new model exists.

## The measurement

Ball-6 run over the clip's hoop window (scale 1, same distance convention as IMG_4839/4840/4867): detected at score >= 0.2 in 9.3% of frames in a
60-second sample, against 34-46% for the orange ball on the eight existing clips at the same scale (`dets6-4839/4840/4867.json`). On the held-out
last 15% of the whole clip by time (frames 10917-12843 of 12844), the rate is 8.4% (162 of 1927 frames) — consistent, not a fluke of the sample.

## The end-to-end mechanism

Running the shipped counting core (`src/lib/vision/counting.ts`, `shotRules.ts`, unmodified, via the eval harness's `transpile.mjs`) over real
ball-6 detections from the first minute of the clip: one call, `first=170 last=173 v4=miss zoneSightings=3`. The ball is seen approaching the rim
three times (frames 170, 171, 173) and never below it; V1/V2's "a ball at least 18 px wide, at least 30 px below the rim" test has nothing to see,
so it defaults to miss regardless of whether the shot went in. This is the production rule working exactly as designed on footage its detector
cannot see; nothing in `shotRules.ts` or `counting.ts` is at fault, and neither was touched.

## Why this was already known, and not fixed

Round four's notes (`training/tools/26-orange-only.mjs`; `training/README.md`, "Round-four dataset," 2026-10-05) found a black ball's few real
training boxes in older footage and dropped them, because the colour filter that tells a ball from a backboard shadow cannot tell one from a real
black ball either; the note ends "the black ball loses its few real boxes; it needs its own clip." Round five logged "not done: more black-ball
positives" and no round after it returned to this. IMG_4915 is that clip, filmed three weeks later at Matt's own initiative after he hit the
exact failure this gap predicted.

## What round seven does

Builds real black-ball training positives from IMG_4915 without relying on ball-6's own (sparse) proposals, which would only teach it the cases it
already finds: a frame-to-frame motion proposer, confirmed by the same colour-blind circle-edge fit used since round three, filtered for a
grey/black (not blue, not green, not skin) colour band, genuine self-motion (so a shadow sweeping past a static prop doesn't get mistaken for the
ball), one excluded static prop, a cap on how often the same exact spot can recur, and a minimum size (a "circle" found at the size floor in
cluttered leaf texture is cheap to produce by chance out of tens of thousands of tries). 325 of 49,750 raw candidates survive; eye-checked in
stages, about 85-90% a real ball on the final sample. Full plan, dataset numbers and the exam registered before training: `training/README.md`,
"Round seven."

## Limits

One clip, one ball, one driveway, one lighting. No written make/miss list exists for this clip, so the exam is detection recall on held-out
frames, not a make/miss score; end-to-end accuracy on this ball is not claimed until Matt shoots a session with it against ball-7 and the counts
can be checked.
