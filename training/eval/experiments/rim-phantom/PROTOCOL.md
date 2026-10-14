# Rim phantom experiment: protocol (registered before any candidate was run)

Rules from Matt: keep the detector, V4, hoop window, auto-sizer and the app unchanged; keep baseline-v0 and thresholds.json unchanged;
record new criteria separately before looking at results; do not optimise for IMG_4873; IMG_4873 is a known regression case, not a
generalization test; no permanent integration until the evidence supports it.

Everything experimental lives in `training/eval/experiments/rim-phantom/` (nothing in `src/`). Candidates are plain causal functions
selected by a configuration name; the app never sees them. The criteria are in `criteria.json` (sha256 stored in every result file).

## Root cause (analysis.json, devstats.json, and the pictures)

See the evaluation report for the full write-up. In short, established before registration:

- **The phantom is stationary and static.** ball-6 on IMG_4873: one spot, (179.7, 194.1) in the sizer window, spread about 1 px, in 42%
  of frames, in 15 of 15 ten-second bins, in 87 runs (longest 200 frames = 7 s). Width 10.7 px (9.6-13), score 0.51 (0.30-0.63). A real
  ball in the same file: 27 px, score 0.88.
- **Pictures:** at that spot is the orange rim and net hardware seen at close range; frames with the box on and off differ only in which
  side of the threshold the detector's score for that patch falls. No ball is there when it fires.
- **Not specific to ball-6 or to one window,** but strongly scene-dependent: the same spot fires in ball-5 (6% in the sizer window, 31% at
  scale 1) and in ball-6 at scale 1 (49%). No other saved clip has a static spot above 2.5% (and those are genuine balls at the rim).
- **Shot merging is an interaction.** Detection layer supplies the phantom; the zone grouping rule (any zone sighting within 40 frames
  extends the shot, with no notion of identity) amplifies it. Phantom removed by position: longest merged "shot" 1044 -> 85 zone
  sightings, 11 -> 25 counted. A synthetic phantom injected into a clean clip starts costing shots at about 20% duty.

## Designs (see criteria.json for parameters and reasons)

A stationary suppression (a spot occupied too often is not a ball); B motion-proof track gate (a box only counts once its track has
proven it moves like a ball); C1/C2 size gate (a box under half / 0.6 of the reference ball width is not a ball); B after C50. The
detector-level alternative, hard-negative training, changes the detector and cannot be run inside this experiment; it is discussed in
the recommendation.

## Integration idea (Assignment 3)

B is the only candidate whose state is a ball track: position, velocity, age, a "proven to move" flag. Persistent ballistic tracking
(Experiment 1) is the same object with a motion model and confidence. If B is recommended it is the first slice of that tracker, not a
separate filter to be replaced. A and C are stateless-ish screens on single boxes.

## Order of work

1. Commit this file, criteria.json and the analysis (this commit) BEFORE the candidates exist.
2. Write the filters and their unit tests (causality, behaviour at the boundaries).
3. Check that "no filter" reproduces baseline-v0 exactly.
4. Run everything once; write results; evaluate against criteria.json without changing it.
