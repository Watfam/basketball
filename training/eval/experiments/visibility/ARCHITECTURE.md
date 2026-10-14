# Experiment 2: expanded flight visibility (plan)

Question: how much of the shot (release, apex, rim approach, continuous flight) is available in the existing recordings, and which
detection strategy can see it at a cost a phone can pay. Existing footage only; production untouched.

## Separate the causes (the report keeps them apart)
1. **Camera field of view**: is the shooter / ball outside the 1920x1080 frame? (contact sheets, highest ball y, first-appearance position)
2. **Processing window**: is it inside the frame but outside the 416 px window? (tile detections against the S0 window)
3. **Detector recall**: is it inside a window but not detected (ball in hand, small ball, blur)? (annotated frames)
4. **Definition**: does the release/apex test, not the footage, fail? (Experiment 1's machine linked tracks only from the rim zone)

## Method
- `gen-tiles.mjs CLIP` runs ball-6 (the harness runner, WASM, one thread) on nine base-scale tiles, two larger rim-centred windows and the full frame,
  only on frames F-75..F+15 of the sampled shots; writes `work/exp2/dets/CLIP.json` (git-ignored) and a compact copy in `results/`.
- `strategies.mjs` composes strategies S0, A1, A2, A3, B (five candidates), C (follow, scan), D from those detections, so one set of inferences scores all
  strategies. A dynamic policy can only see the tile it chose (policy uses past detections only).
- `metrics.mjs` links detections with the Experiment-1 `cv_nearest` tracker, then computes the registered observation metrics; `evaluate.mjs` applies `criteria.json`.
- Release feasibility: two independent estimators (speed crossing, backward arc fit), agreement in frames at 30 and 15 fps.

## Not built
No biomechanics, no coaching engine, no integration. If a strategy passes, the next step is a separate integration experiment behind a flag.
