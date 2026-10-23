# Shot-tracking training

Everything needed to turn driveway footage into a trained ball detector.
The footage itself never goes in git: `Training Video/` and `training/work/`
are both ignored. What is committed here is code, labels (timestamps only),
and the notebook.

## What is here

- `labels/IMG_4824.json` - every shot found in the first clip, labelled
  make / miss / exclude by eye. Not verified by Matt. 22 of 35 are medium or
  low confidence.
- `tools/` - the pipeline, run in order on a new clip:
  1. `1-scan-for-ball.mjs` - decodes the video once and logs moving orange
     blobs near the rim (set the rim position at the top of the file).
  2. `2-group-events.mjs` - groups those into events.
  3. `3-find-shots.mjs` - follows blobs into tracks and lists balls that come
     down through the rim zone, with a first-guess make/miss. The guess is
     often wrong; look at the frames.
  4. `4-build-dataset.mjs` - cuts 416x416 hoop-window images at the camera's
     native resolution and boxes the ball in each (colour found in the real
     picture, not just the tracker point), plus ball-free frames. Split by
     time into train / val / test.
  5. `5-check-labels.mjs` - draws the boxes on random images so the labels can
     be checked by eye. Do this every time: an earlier colour rule put boxes on
     faces and bushes.
  6. `6-shot-strip.sh` - frame strips around one moment, for labelling shots.
  They need `npm i --no-save jpeg-js` and ffmpeg. Paths at the top of each file
  point at this Mac.
- `colab/train_ball_detector.ipynb` - fine-tunes YOLOX-nano (Apache-2.0) on
  the dataset in free Colab, exports ONNX, scores it on the held-out test
  split. Untested until first run.

## Known weaknesses of the first dataset

- One person, one hoop, one afternoon of light. Expect it to overfit; add
  footage of the kids, other times of day, other phones.
- Only moving balls near the rim were labelled. A held or resting ball inside
  a window is unlabelled, so some "ball-free" images may contain one.
- Frames where the ball overlaps the rim were rejected (the ball and the red
  rim merge into one blob), so the hardest, most important frames are
  under-represented.
- Test split is the last ~3 minutes: 4 shots only. Make / miss accuracy needs
  a fresh clip with 50+ shots.

## Results log

### Run 1 - 2026-10-01 - YOLOX-nano, 40 epochs, 3,207 train images from one 16-minute clip
- Val (650-800 s of the clip): best AP 72.6 (IoU 0.5:0.95), AP at IoU 0.75 88.9, AR 76.1.
- Test (last ~3 minutes of the clip, never trained on; 759 images, 534 with a ball):

  | confidence | ball found when there (IoU >= 0.3) | ball-free pictures with a made-up ball |
  |---|---|---|
  | 0.05 | 533/534 = 100% | 44/225 = 20% |
  | 0.25 | 531/534 = 99% | 32/225 = 14% |
  | 0.40 | 528/534 = 99% | 27/225 = 12% |
  | 0.60 | 520/534 = 97% | 18/225 = 8% |

- Untrained generic model on the same kind of footage: ~0% (see git history / memory).
- NOT independent evidence of generalisation: same person, hoop, lighting and afternoon; the
  test positives are frames where a moving orange blob was found near the rim, so held,
  resting and rim-overlapping balls are missing from the "ball" side. The false-alarm side
  may include real but unlabelled balls. Next: look at where the false alarms are, then run on
  a fresh clip (chalk clip, kids).

### Run 1 on a different clip (IMG_4826, chalk clip, 2026-10-01) - FAILED to generalise
Hoop windows (416 px, native 1080p) sampled every 2 s from a clip with a new camera position,
a lowered goal, low backlit sun, and a boy in a red shirt. 26 of 99 windows had a "ball"
detection at confidence 0.25 (scores 0.6-0.87), almost all of them on the **red shirt**, with
nobody shooting. The model learned "red-orange blob". Cause: the training clip had only a
purple-shirted adult, so red clothing never appeared without a ball. Fix is data, not code:
add ball-free windows with red/orange clothing and kids as hard negatives (IMG_4826 0-150 s is
good for that, minus frames where the ball is visible), and add kids shooting in varied clothes,
then retrain once. The tracker should also reject detections that move with a person rather
than along an arc.

### Round two dataset (dataset3, built 2026-10-01 from IMG_4825 + IMG_4826) - NOT USED, failed the eye check
Built with `1c-scan-motion` -> `3b-ballistic-tracks` -> `3c-filter-tracks` -> `8-build-dataset-v2`.
Checked with `5c-check-dataset`. Findings from looking at 60 random pictures:
- "No ball" pictures from IMG_4825 (people shooting): roughly a third visibly contain a ball
  (held, resting, or in flight). Training on these teaches the model that balls are background.
  Cause: the scanners only find a ball that is moving along an arc, so held and resting balls are
  never excluded.
- Ball boxes: most are on real balls, but some are on shirts, hands and heads, and some real
  balls in the same pictures are unboxed.
- "No ball" pictures from IMG_4826 (red shirt, backlit) look clean and are the useful part.
Do not train on dataset3. Next: label positives and negatives with something that does not depend
on motion (a person-aware filter, or reviewing candidates by eye in sheets), and only then retrain.

### Re-boxing the accepted IMG_4825 flights (2026-10-02)
- Round-one ball model as the re-boxer (`10-rebox-flights.mjs`): kept 44 of 744 points (6%). Useless;
  it only fires on balls that look like clip one's.
- Circle edge fit near the tracker point (`11-circle-rebox.mjs`): 580 of 744, but about 1 in 3 circles
  were on nets, leaves or backboard marks. Requiring the circle centre to lie within one ball radius
  of the tracker point (two independent methods agreeing) leaves 353 boxes. On a hand-judged random
  sample of 48 from that set, about 44 were on the ball and tight.
- Known gap: some frames hold a second ball (behind the net, on the backboard) that has no box.
  Positive pictures built from these frames will teach the model that such a ball is background.
  Keep windows small and centred on the boxed ball, and do not reuse these frames as negatives.
- Saved as `labels/IMG_4825-ball-boxes.json` (rim-centred 600 px window coordinates).

### Round-two dataset v3 (dataset4, built 2026-10-02) - NOT YET SENT TO COLAB
`12-build-dataset-v3.mjs`: ball pictures = 353 circle-fit boxes (IMG_4825) + round-one ball pictures
(IMG_4824); no-ball pictures = IMG_4829 (Matt: no ball ever in frame) + IMG_4826 first ~150 s, with a
"ball-sized orange blob in the window" filter (rejected 96 of ~516 chalk-clip frames). Round one's own
no-ball pictures are dropped (a quarter held a ball). IMG_4825 contributes no no-ball pictures. The
kids clip B1689585... is the held-out exam. Train 3477 (2905 ball), val 444 (283), test 771 (634).
Eye check of 42 random chalk-clip no-ball pictures still found about 3 with a ball (the red boy holding
one: the ball merges with his shirt into one oversized blob, so the size filter misses it; one more had
an orange ball cut off at the picture edge). Eye check of 24 IMG_4825 ball pictures: most boxes are on the
ball, but a few boxes sit on the backboard or net while the real ball is elsewhere in the picture
(unboxed), which would teach "ball = background". Next: review the chalk-clip no-ball pictures and the
ball pictures in sheets and drop the bad ones, then retrain once.

### Round-two dataset v2 (dataset6 -> dataset_v2.zip, 2026-10-03) - sent to Matt for the second Colab run
Built by 12 -> 15 -> 16. Train 3368 (2896 ball: IMG_4824 2662 + IMG_4825 234; no-ball: IMG_4829 277 +
IMG_4826 195), val 431, test 756 (626 ball, 130 no-ball). Cleanups after eye checks:
- 15-drop-red-boy: dropped 120 chalk-clip no-ball pictures containing the boy in red (he carries the ball and
  it merges with his shirt; colour cannot separate them). Kept the man alone / empty hoop.
- 16-drop-second-ball: dropped 17 IMG_4825 ball pictures where the motion scan tracked a second ball far
  from the boxed one.
- A hue-based "ball-coloured blob" check (training/work/ballhue.mjs, not committed) found 15 of 420 chalk-clip
  no-ball pictures but MISSED the two balls I had spotted by eye, so it is not a reliable filter.
Known remaining weakness: about 1 in 5 of the 234 IMG_4825 ball pictures (about 45, under 2% of all ball
pictures) still show a second, unboxed ball, mostly dark balls against hazy sky that the scan cannot see.
Not used for training: B1689585-096B-49E7-9423-E3D54EDA834D.MOV (kids clip), the final exam.
Notebook: train_ball_detector_v2.ipynb reads dataset_v2.zip and writes to hardwood-lab/out2.

### Round 2 results (Colab, 40 epochs, dataset_v2) - 2026-10-03
Test = 756 pictures (626 ball: IMG_4824 534 + IMG_4825 92; 130 no-ball: IMG_4826 43 + IMG_4829 87).
| confidence | ball found (IoU>=0.3) | made-up ball in no-ball pictures |
| 0.05 | 603/626 = 96% | 1/130 = 1% |
| 0.25 | 600/626 = 96% | 0/130 = 0% |
| 0.60 | 592/626 = 95% | 0/130 = 0% |
Round one on its own test: 99% found, 14% made-up at 0.25. Not comparable test sets (round two includes the
harder IMG_4825 balls), and the no-ball test pictures come from the same two clips as the training no-ball
pictures, filtered to contain no ball. The real exam is the kids clip, still to run.

### Round 2 on the unseen kids clip (B1689585..., 2026-10-03) - checked by eye
ball-2.onnx, hoop window 416 px at (714,202), one window per second: 944 windows, 134 with a detection, 140
detections at confidence >= 0.25. Every detection cut out at native resolution (`tools/17-review-detections.mjs`)
and judged by eye: about 130 sit on a ball (about 20 of those are dark silhouettes against sky or backboard),
about 7 sit on the green-shirt boy's head or hair (dark, round), none on the red or green shirts. So about 95%
precision, and the one failure type is a dark head. Recall is NOT measured: in the overview sheet some windows
showed a ball with no box, and only windows around the hoop were looked at. Not yet done: label a sample of
windows by eye for recall, make the dark-head case a training negative.

### Round 2 recall check on the kids clip (2026-10-03) - INCOMPLETE
115 random one-second windows (seed 31, `tools/18-recall-sheets.mjs`, window 416 px at (714,202)), model scored on
the exact frame drawn. Windows with at least one box: 18 at confidence 0.25, 32 at 0.03. By eye on the first 48
thumbnails, balls in flight near the hoop with no box outnumbered boxed ones (about 8 unboxed to 5 boxed), so
recall on this clip looks well below the 95%+ seen on the Colab test and is NOT yet quantified: thumbnails at
250 px per 416 px window are too small to count reliably. Lowering the threshold recovers some (14 more windows),
so part of the gap is low confidence rather than blindness. Next: a proper count on larger tiles of the unboxed
windows that contain a ball, then likely add kids-clip-like balls (small, dark, against sky) to training.

### Round 2 on IMG_4831 (three balls, person in a red shirt, 2026-10-03) - checked by eye, NOT in training
ball-2.onnx, hoop window 416 px at (752,172), one window per second: 624 windows, 213 detections at >= 0.25.
Looked at 90 of the 213 by eye (sheets det-01, det-03, det-06 of `training/work/clip6-det`):
- About 40 of 90 (44%) are on the person's red shirt or torso, often a close-up of the shirt. Round two did NOT
  fully fix the red-shirt mistake: it held on the earlier kids clip (shirts there were small and far), but a
  large, close, bright red-orange shirt still fires it. Box size does not separate them (shirt boxes are
  about 40-70 px in the window, balls about 25-55 px).
- The rest are on balls: the orange ball (found well, including against sky and trees), the dark green/black ball
  (found, mostly against backboard or hedge), and a third orange ball. So colour/type of ball is not the problem.
- Unmeasured: how many balls it misses, and the other 123 detections.
This clip is the best source of red-shirt negatives yet, but the person holds or dribbles a ball in many
frames, so negatives must be taken only from windows with no ball in them (check by eye).

### Round 2 on the three shirt clips (2026-10-04) - checked by eye; these clips are for round 3
Clips: IMG_4832 (orange-shirt man walking around the hoop, no ball; 30 fps, phone placed ~18 s in and lifted
~118 s), IMG_4835 (orange shirt rebounding near the hoop while a white-shirt boy shoots), IMG_4836 (orange
shirt shoots/dribbles). Hoop window 416 px at (840,170). ball-2.onnx at >= 0.25:
- 4832 no ball: 79 detections in 136 windows; 77 in the steady middle. All 52 I looked at are the orange
  shirt or torso. 0 balls exist, so every detection is a false alarm: about 1 window in 2 when he is near.
- 4835 (223 detections) and 4836 (93): mixed. In the 60 I looked at, roughly half sit on orange shirts or torso,
  the rest on balls (orange, plus dark balls at the backboard) and a few on hats/heads. The model finds balls in
  all of these clips; shirts are what it cannot reject.
Round 2's 0% made-up rate came from a "no ball" test that never showed a large, close, bright orange shirt.
Round 3 plan: use 4832's steady window as shirt negatives (tens of seconds, all ball-free by construction),
4831's ball-free windows, and ball windows from 4835/4836/4831/B1689585 as positives after a by-eye box check;
hold out fresh footage as the exam.

### Round-three dataset (dataset8 -> dataset_v3.zip, 2026-10-04)
Built by `19-build-round3.mjs` then `20-drop-multi-ball.mjs`. Adds to dataset6: shirt negatives from IMG_4832's
steady middle (713 pictures, ball-free by construction), ball pictures from IMG_4831/4835/4836 whose box was
proposed by ball-2.onnx (score >= 0.4) AND confirmed by an independent circle-edge fit (shirts and torsos have
no round outline and fail); then dropped any ball picture where ball-2.onnx found another ball-sized box
at >= 0.15 (28 of 4825, 106 of 4831, 80 of 4835, 74 of 4836). Train 4154 (3194 ball, 960 no-ball), val 602
(342 / 260), test 902 (659 / 243). Held out entirely: B1689585 (kids clip) and a fresh clip to be filmed after
this run. Known weakness: pictures from 4835/4836 can still show a second, dark ball with no box.
Notebook train_ball_detector_v3.ipynb reads dataset_v3.zip and writes to hardwood-lab/out3.

### Round 3 results (ball-3.onnx, 2026-10-04)
Colab test (902 pictures, 659 ball / 243 no-ball): 99% found at 0.25, 0 of 243 made-up. Same-clip test, so not the exam.
Exam 1, kids clip B1689585 (never trained on), window 416 at (714,202), one window per second: 169 detections
(round two: 140). Looked at 90 of 169 by eye: about 72 on balls (including dark silhouettes against the backboard),
about 18 on the kids' dark hair or heads (20%; round two: about 5%), none on the red or green shirts. IMG_4832
(no ball, but TRAINED ON): 0 detections, down from 79 with round two; that only shows it learned that clip.
Recall on the same 115 random windows as round two: windows with a box 22 (round two: 18), at 0.25. Still low.
Reading: shirts are fixed on this clip, but the dark ball class added in round three (dark balls against the
backboard) made dark round heads look like balls. Next: heads as explicit negatives (windows with a head and
no ball), and the tracker/arc rule; exam 2 = a fresh clip, filmed on request.

### Arc rule on ball-3 detections, every frame (kids clip 240-300 s, 2026-10-04) - `tools/21-track-detections.mjs`
1799 frames, 312 detections, linked into 43 tracks; 7 tracks (62 detections) pass "moves like a thrown ball"
(>= 5 points, 5-120 frames, >= 60 px of path at >= 3 px/frame, smooth parabola fit). By eye on 30 random from each pile:
- KEPT (62): 30 of 30 sampled are balls, no heads or shirts.
- REJECTED (250): in 60 sampled, about 52 are real balls (balls that are being carried, resting on the rim, bouncing
  on the backboard, or that appear for fewer than 5 frames), about 8 are heads. So the rule removes the heads but
  also throws away most balls: only about 20% of detections survive and the surviving arcs are the long free-flight
  ones.
Consequence: usable for "was a shot taken" (a flight arc toward the hoop is confirmed by 62 clean detections in
60 s), but it does not measure the whole ball path, and the make/miss decision near the rim, where the rule rejects
most detections, needs its own logic. Per-frame recall is still unmeasured.

### Make/miss labelling attempt on IMG_4836 (2026-10-04) - NOT USABLE YET
`22-dump-detections.mjs` ran ball-3 on every frame (3762 frames, 1560 detections in 1515 frames);
`23-shot-candidates.mjs` found 25 candidate shots near the rim and cut unboxed zoom strips. By eye only ONE
outcome was readable with confidence (candidate 3: orange ball drops through the net = make). Reasons: this clip
has TWO balls in play (an orange one and a dark one) and the dark one drifts past the hoop in most candidates;
the strips stop before the ball reaches the rim in many; stride-2 frames are too coarse at the rim. The clip DOES
have an audio track with 655 windows louder than -38 dB (232 louder than -30 dB), so Matt may have said make/miss
out loud; I cannot transcribe it here. Do not build or score make/miss logic until there is trustworthy ground
truth: ask Matt for a list of outcomes for IMG_4836 (or film a clip with ONE ball and narration).

### Correction: the "dark balls" at the backboard are SHADOWS (Matt, 2026-10-04)
IMG_4836 had only an orange ball; the dark round objects that follow it across the backboard are its shadow (sun
overhead). I had read them as a second, dark ball. Consequences found so far:
- Round-three training positives include shadow boxes. Dark, non-orange ball boxes in dataset8 (mean luma < 85 and
  not red-dominant): 4836 31 of 121 (26%), 4835 5 of 43 (12%), 4831 46 of 254 (18%, unclear: Matt used three balls,
  one may be dark), 4825 124 of 306 (41%, unclear: backlit sky silhouettes of a real ball), 4824 0 of 3471.
- The "second ball" filter (`20-drop-multi-ball`) treated shadows as another ball and dropped 80 of 4835 and 74 of
  4836 ball pictures it should have kept.
- Precision I reported for ball-2/ball-3 on the kids clip counted dark backboard blobs as balls ("dark silhouettes"),
  so it is overstated; the kids' heads and shadows are both false-alarm classes.
- Shadow-near-ball also breaks naive make/miss logic (the shadow reaches the rim zone too).
Fix for round four: drop dark non-orange positives from 4835/4836 (and from 4831 if Matt confirms no dark ball),
add pictures of shadows with the ball elsewhere or absent as negatives, redo the second-ball filter by colour.

### Sorting the 46 dark boxes in IMG_4831 (2026-10-04, Matt: one of the three balls is black)
`tools/24-dark-boxes.mjs` sheets in training/work/dark-4831. By eye, roughly 40 of 46 sit ON the backboard with a
real ball (orange or the black one) visible elsewhere in the picture, so they are shadows; about 4 to 6 are a
real black ball in the air off the backboard (for example the box left of the board in sheet 1, row 4, tile 1,
and sheet 2, tile 24). Shadows exist for the black ball too, so a dark box on the board is not safe either way.
Decision for round four: drop all 46 dark positives from 4831 rather than keep a handful of real black-ball
boxes mixed with ~40 shadows; ask Matt for a short clip of the black ball alone against sky and trees to teach it
properly; add backboard-shadow windows (ball elsewhere or out of frame) as negatives.

### Round-four dataset (dataset12 -> dataset_v4.zip, 2026-10-05)
Built from round three's merged set BEFORE its second-ball filter (dataset7) by:
- `25-clean-round4`: dropped 204 shadow boxes (4831: 86, 4835: 33, 4836: 85) and 12 pictures that hold another ORANGE
  ball (the old filter counted shadows as balls and dropped about 150 good pictures).
- `26-orange-only`: kept boxes in 4831/4835/4836 only if the middle of the box is clearly orange (dropped 58 more,
  which removes the black ball's few real boxes as well; it needs its own clip). Eye check of 36 random 4831 boxes:
  all on an orange ball.
- Shadow negatives: 160 backboard-shadow crops (150 px window around each wrongly boxed shadow, scaled to 416 px, no
  orange pixels, no other ball found) -> `31-filter-shadow-crops` keeps only crops with exactly one round dark blob:
  61 left. Eye check of 60 of them: 59 clean, 1 with a ball at the board edge (removed by name). Cost: 99 crops lost to
  a strict filter; the first loose version let real black balls into the "no ball" set (found by looking at all 160).
Final: train 4210 (3208 ball, 1002 no-ball), val 609 (338 / 271), test 913 (663 / 250). Held out: B1689585, plus a
fresh clip to be filmed. Notebook train_ball_detector_v4.ipynb reads dataset_v4.zip, writes to hardwood-lab/out4.

### Round 4 results (ball-4.onnx, 2026-10-04)
Colab test (913 pictures, 663 ball / 250 no-ball): 96% found at 0.25, 0 of 250 made-up. Same-clip test, not the exam.
Exam, kids clip B1689585 (never trained on), window 416 at (714,202), one window per second: 173 detections
(round three: 169, round two: 140); 67 of the 173 are tiny boxes (<= 22 px wide). By eye on 90 of the 173
(sheets det-01, det-03, det-05 in training/work/k4-det): about 57 on balls, about 10 on backboard shadows (dark
circles on the board, mostly in the third sheet), about 4 on the kids' heads (round three: about 20%), about 15 tiny
boxes on the net or rim edge, and a few doubtful. So roughly 60-65% of detections are balls on this sample.
Reading: heads are mostly fixed, shadows are reduced but NOT fixed (the ~60 shadow crops were too few, 99 were lost to
the strict filter), and a new failure class, tiny boxes on the net and rim, is visible; it may have always been there.
Recall still unmeasured. Next: more shadow negatives, net/rim negatives, minimum box size, then the arc rule.

### Round 5 preparation (2026-10-04)
- Shadow-only crops: reviewed all 99 that the strict filter dropped (rescued 87, dropped 12 with a real ball) and
  all 148 combined; 7 more with a ball at the board edge removed. Final `Training Video/shadowneg4`: 141 crops
  (train 92, val 26, test 23), up from 61. Tools 30-show-files, 28-check-negatives.
- Tiny boxes on the net/rim in the ball-4 exam: 67 of 173 detections are <= 22 px wide, median score 0.56 (balls
  0.77). 36 random ones viewed: the great majority are net strands, rim edge, backboard speckle, the dark stand
  base or a tree trunk; a few sit beside a real ball. A minimum-size rule at inference (e.g. >= 22 px) would drop
  73 of 173 detections including most of this noise, at the cost of any ball that is genuinely that small. The
  ball is 25-60 px wide in the kids setup, so a rule of about 22 px looks safe there; it may not be for a phone
  that is farther away. Decide with the app's pipeline, not now.
- Empty-hoop pictures (tool 32): CORRECTION. I first wrote that IMG_4829/4832 were filmed from far away and did not
  match the kids clip. That was wrong: I had compared zoomed review tiles with full pictures. Side-by-side stills of all
  nine clips (same phone spot) show the backboard is about 140-150 px wide in the 1080p frame in the kids, three-ball,
  no-ball, red-shirt, rebound and shooting clips (about 100 px in the first video). The empty-hoop pictures from 4829
  and 4832 are therefore the right size and are used (180 per clip, 85-100% of a 416 px window, same time splits).

### Round-five dataset (dataset13 -> dataset_v5.zip, 2026-10-04)
Round four's set (dataset10: shadow boxes out, orange-only boxes in 4831/4835/4836) plus: 141 verified shadow-only
crops (train 92, val 26, test 23; was 61), and 360 empty-hoop pictures from IMG_4829 and IMG_4832 (train 228, val 68,
test 64; eye-checked: 60 of 60 clean, orange/red shirts visible in many, no ball). Train 4488 (3208 ball, 1280
no-ball), val 692 (338 / 354), test 993 (663 / 330). Held out: B1689585 (kids clip) and a fresh clip to be filmed.
Notebook train_ball_detector_v5.ipynb reads dataset_v5.zip, writes to hardwood-lab/out5.
Not done in this round: the minimum-box-size rule (an app setting), more black-ball positives, recall measurement.

### Round 5 results (ball-5.onnx, 2026-10-04)
Colab test (993 pictures, 663 ball / 330 no-ball): 95% found at 0.25, 0 of 330 made-up. Same-clip test, not the exam.
Exam, kids clip B1689585 (never trained on), window 416 at (714,202), one window per second, confidence >= 0.25:
105 detections (round four 173, round three 169, round two 140), 26 of them <= 22 px wide. Viewed all 105
(sheets det-01..04 in training/work/k5-det): about 95 on a real ball (including the pale ball against cloud and the
ball in a hand), 4 to 5 on a dark shadow on the backboard (round four: about 10), 1 on a kid's head, about 3 doubtful
(a dark round thing at the rim, the net), and no clear net/rim boxes. So roughly 90-95% precision on this sample, up
from 60-65%. Also seen: boxes that cover only part of a ball when it is in front of the rim, and in several windows a
shadow beside a ball that was NOT boxed (good).
Not yet measured: recall (balls with no box); the sheet at 0.25 and a recall comparison against rounds 2-4 follow.

### Round 5 recall check on the kids clip (2026-10-04) - rough, by eye
Same 115 random windows as rounds 2-4 (seed 31), model scored on the exact frame drawn. Windows with a box at >= 0.25:
round two 18, round three 22, round five 15. Looked at the first 48 windows at 250 px tiles: about 25 contain a
visible ball somewhere in the 416 px window (in flight, held, or at the rim) but only about 7 are boxed, so roughly
1 in 4 to 1 in 3 visible balls is found. The unboxed balls are mostly SMALL (about 15-25 px wide in the window), in
the upper or outer part of the window, or held in a hand; balls at and around the rim are the ones found. Counting
dots in thumbnails is unreliable, so treat this as a rough figure: recall is LOW, and it has not improved since
round two while precision went from about 60% to about 95%. The model has become conservative, not better at seeing.
Next: a recall-focused round (more small/far ball positives, labelled by the circle-fit on the kids' footage is not
possible without using the exam clip), the minimum-size rule would make it worse for small balls, the arc rule on the
ball-5 detections, and a fresh clip as the next exam.

### Hard-example mining attempt (2026-10-04) - REJECTED, `tools/34-mine-hard-balls.mjs`
Idea: use ball-5 at confidence 0.10-0.40 on 4831/4835/4836, confirm each box with the circle-edge fit, add as positives
to recover the small/far/faint balls the model misses. Result: 86 candidate pictures. Eye check of 63 of them: the great
majority are boxes on backboard SHADOWS, a kid's FACE or hat, and the red shirt's flag; the real, bright orange ball in
the air in the same picture has no box. The circle fit passes shadows and faces because they are round with an edge.
Lesson: a faint model score plus a round edge is not a ball detector, and "boxes the model weakly proposes" are exactly
where its mistakes live. Do not mine positives this way.
Size finding while checking: 68% of the 4,209 labelled training balls are under 25 px wide, 89% under 30 px; ball-5's
detections on the kids clip have median width 24 px, so most training and most found balls are small already. The
balls the model misses on the kids clip are therefore NOT simply "too small" for it. They may be missed because of
position (upper window), motion blur, or because the model rejects them after being punished for shadows and heads.
A proper answer needs labelled misses from a clip that is not the exam clip.

### First make/miss test (ball-5 detections, IMG_4836, 2026-10-05) - `tools/35-score-rim-rule.py`
Per-frame ball-5 detections on the shooting clip (3762 frames, 1692 detections). 25 candidate shots near the rim
(tools 22, 23). Outcomes read BY EYE by me from unboxed strips (`labels/IMG_4836-outcomes.json`): 13 makes, 9 misses,
3 not shots (a person's arm, a held ball, empty hoop). 10 makes are high confidence; every miss is medium or low
because a ball skimming the rim and leaving is a judgement from strips 2 frames apart. Rule, run ONCE with thresholds
chosen before looking at any score (below the rim by >= 30 px, within 45 px in x, within 40 frames of the ball first
being seen in the rim zone, box >= 18 px wide): a ball seen under the net = make, else miss.
Result: agrees with my reading on 20 of 22 shots (91%); wrong on shots 12 and 21 (I read misses, the rule says make:
the ball may have dropped past the net outside the 45 px band, or my reading is wrong).
CAVEATS, read before quoting any number: (1) the labels are mine, not Matt's; (2) ball-5 was TRAINED on this clip
(frames before 85 s are in its training set, 85-100 s validation), so this is not an unseen test; only shots 22-25
(after 103 s) are in the held-out part, all four correct; (3) 22 shots is a small sample; (4) one ball only here, so a
clip with two balls in view, or a ball bouncing under the net, may behave differently.
What it does show: the detector's rim-zone coverage is good enough that a ball dropping through the net is seen below the
net in every high-confidence make, so a simple rule can work. The real test is a fresh clip with narrated outcomes.

### Can the spoken "make"/"miss" be used as an answer key? (2026-10-05) - not from the old clips
Built whisper.cpp (open source, MIT) in the git-ignored training/work/whisper with the base.en model and ran it on the
audio of 4836, 4835, 4831, the kids clip and 4825 (90 s to full length). It produced only invented text: "(drumming)"
for ball sounds, and on quiet stretches strings like "Make. [Pause]" repeated every second for the whole clip (a known
loop), "Thank you very much", "Squares. Squares.", "So, we're going to do this one here" repeated. With the loop
settings (-mc 0 -nf -nth 0.5) the output was still hallucinated. Reading: the phone's microphone, 30+ feet from whoever
speaks, records the voice far too quietly for this model; the earlier "loud audio windows" were mostly ball and net
sounds. No narrated outcomes could be recovered from any existing clip. For the next clip: speak loudly, and test a 15 s
sample first.

### Correction: the 2:05 clip (IMG_4836) DOES have spoken outcomes, they just need boosting (2026-10-05)
Matt confirmed IMG_4836 (orange shirt shooting, white shirt rebounding, 2:05) has make/miss said aloud and that he has
the true counts. My first transcription of it (plain audio) found nothing. After `highpass 120 Hz, lowpass 4 kHz,
dynaudnorm` and whisper.cpp base.en with `-mc 0 -nf -nth 0.5 -sns`, it hears 18 non-music segments
(`tools/36-speech-vs-shots.py`). Timestamps are coarse (multiples of 1-2 s), and the words are mishearings, so the
alignment is only suggestive: "Miss!" at 100 s and 104 s match my two misses at 100.0 s and 104.0 s (shots 21, 22);
"Faith!", "Oh!", "Faith!" at 108, 116, 120 s match my makes at 109.3, 114.7, 120.1 s (shots 23-25), so "Faith" is
probably "Make"; "OK." at 70, 75, 80, 86, 97 s sits on my makes at 68.8, 79.4, 85.7, 95.6 s. But 12 of 25 shots have no word at
all, and early on ("Right.", "No.", "This.") the match is unclear. NOT usable as ground truth yet. Needs Matt's real
list (or at least his makes/attempts counts) and a better pass (larger model on 4-second snippets around each shot).

### Make/miss against Matt's written record (IMG_4836, 2026-10-05) - `labels/IMG_4836-truth.json`
Matt's own list for the 2:05 clip: 24 shots, 16 makes, 8 misses. The candidate finder produced 25 candidates; one is not a
shot (candidate 15, a player with a held ball), so 24 line up with Matt's list in order. Candidates 4 (a person's arm
in the way) and 17 (empty hoop in the strips) are real shots I could not read by eye; Matt's list says both are makes.
Alignment check: with exactly one candidate skipped, five choices (candidates 14-18, an unbroken run of "make" calls)
give the same best score, so the skip placement does not change the result; my eye says candidate 15.
Results (rule from tools/35, thresholds fixed BEFORE Matt's list was seen, run on ball-5's detections):
- The rim rule agrees with Matt on 23 of 24 shots (96%). Its calls: 17 makes and 7 misses (Matt: 16 and 8).
- The one wrong call is candidate 21 (100.0 s, Matt's shot 20, a miss): the rule saw 3 detections below the net and said
  make. Not tuned for; do not tune on this clip.
- My own by-eye readings: right on 21 of 22 shots I called (wrong on candidate 12, a make I read as a miss), and could
  not read 2 real shots. The rule read those two correctly.
- The speech recognizer's words (tools/36) fit Matt's list where they exist: "Miss!" at ~100 s and ~104 s = shots 20
  and 21 (both misses); "Faith!/Oh!/Faith!" at ~108-120 s = shots 22-24 (makes). Many shots had no word.
CAVEATS: the detector was trained on the first 85 s of this clip, validated on 85-100 s, so only candidates 22-25
(after 103 s; 4 shots, all right) plus 21 (wrong, at the 100 s boundary) are really unseen: 4 of 5. The result is
offline (all frames used, in hindsight), one ball, one shooter. It says the approach works in principle; it does not yet
show a live phone can do it. The fresh clip is the real test.

### Fresh-clip exam procedure (written 2026-10-05, BEFORE the clip exists, so nothing is tuned afterward)
Model: ball-5.onnx. Rule: tools/35 / 38 exactly as committed (below the rim >= 30 px, within 45 px in x, 40 frames, box >= 18 px).
1. Look at one frame to place the 416 px hoop window (cropX, cropY) and find the rim inside it.
2. `MODEL=ball-5.onnx node tools/22-dump-detections.mjs <video> <cropX> <cropY> dets.json 0.2`
3. `node tools/23-shot-candidates.mjs dets.json <video> <rimX> <rimY> <out dir> 40 4`
4. Write Matt's list into a truth json (results in order), `python3 tools/38-align-score.py dets.json <out dir>/candidates.json <rimX> <rimY> truth.json`
5. Report: agreement on matched shots, shots the detector never saw, the rule's make/miss totals against Matt's, and every wrong call looked at by eye.
`38-align-score.py` was checked on IMG_4836 and reproduces 23 of 24. Also run the speech check (tools 36) with the boosted audio (highpass 120 Hz,
lowpass 4 kHz, dynaudnorm) as a second opinion. The fresh clip must NOT be used to change the model or the rule before the report.

### Fresh exam clips arrived (2026-10-05): IMG_4839 and IMG_4840
IMG_4839.MOV (2:56, black shirt shoots, white shirt rebounds) and IMG_4840.MOV (2:53, shirts swapped), 1080p30 HEVC, same spot
as every earlier clip. Hoop window for BOTH: crop 416 px at (866, 260) of the 1920x1080 frame; rim at about (192, 190) inside it.
Neither is in any training set, and neither may be used to change the model or the rule before its exam is reported
(procedure above). ball-5.onnx detections go to training/work/dets5-4839.json and dets5-4840.json.

### FRESH EXAM 1: IMG_4839 (black shirt shoots, white shirt rebounds), ball-5 + rim rule as committed, 2026-10-05
Neither the model nor the rule had seen this clip, and nothing was changed after seeing the result.
Matt's written list: 28 shots (17 makes, 11 misses), all said aloud. The finder produced 28 candidates, one per written shot, so
the in-order match has no skips and no unseen shots.
RESULT: the rule agrees with Matt on 22 of 28 shots (79%). Its totals are 17 makes and 11 misses, exactly Matt's totals, but
only because 3 false makes and 3 false misses cancel; shot by shot it is wrong 6 times.
Wrong calls, read from strips (tools/39) and the detections below the net; confidence medium:
- False makes (rule: make, Matt: miss), shots 6, 21, 27: the ball touches the rim and drops straight down just beside or in
  line with the net (detections 5-30 px from the rim centre, so inside the 45 px band). From one camera a ball dropping just
  in front of or behind the net looks like a make. Shot 27 falls about 25 px left of the net.
- False misses (rule: miss, Matt: make), shots 3, 16, 28: shot 3 and 28, the rebounder's hands and body are under the net and
  hide the ball (no detections below it); shot 16, the ball rolls around the rim for roughly 30 frames and drops after the
  40-frame window has closed.
Reading: the first-pass rule works (79% on an unseen clip, 96% on the clip it was written on, which the model had partly
trained on), and its failures have understandable causes: ball falling beside the net, ball hidden by a person, slow roll-ins.
Do NOT change the rule and then score 4839 again: the next test of any change must be on 4840, whose original-rule score is
taken at the same time so the two can be compared.

### Rule V2 registered BEFORE scoring IMG_4840 (2026-10-05)
V2 is defined in the header of `tools/40-score-rules.py`: window 70 frames instead of 40, and a ball seen below the net does not
count as a make if it looks >= 26 px wide AND >= 1.2x as wide as at the rim (a ball falling in front of the hoop is nearer the
camera). Motivated by the 6 errors on IMG_4839 and 34 shots with a ball seen below the net across 4836 and 4839 (4 of them misses).
On those two DESIGN clips: 4836 V1 23/24, V2 23/24; 4839 V1 22/28, V2 26/28 (the longer window fixes shots 3, 16, 28 because the
ball showed up below the net after the rebounder moved; the width cue fixes shot 6). Those numbers are in-sample for V2 and prove
nothing. IMG_4840 (32 written shots: 14 makes, 18 misses; ball-5 detections already computed, no candidate or score looked at) is
the test of V2, scored with both rules in one run.

### FRESH EXAM 2: IMG_4840 (white shirt shoots, black shirt rebounds), 2026-10-05 - the test of rule V2
Matt's list: 32 shots (14 makes, 18 misses; saved labels/IMG_4840-truth.json). The finder produced exactly 32 candidates, so the
match to Matt's list is 1 to 1 in order and independent of the rules. Neither the model nor either rule had seen this clip; V2 was
committed (d3c3c70) before its candidates were created or scored. ball-5.onnx, `tools/40-score-rules.py`:
- V1 (original rule): agrees on 26 of 32 (81%); calls 16 makes / 16 misses against Matt's 14 / 18.
- V2 (longer window, bigger-than-at-rim cue): agrees on 28 of 32 (88%); calls 18 makes / 14 misses.
- V2 fixes V1's shots 18, 26 and 24 but breaks shot 6 (a miss, now called make); both are wrong on shots 11, 19 and 20.
Both rules wrong on 11, 19, 20 (all Matt: miss): from the strips, shots 19 and 20 the ball hits the rim and bounces down in line
with the net, 11 the same; ie. the same fault as on 4839: a ball bouncing off the rim and dropping straight down near the net is
indistinguishable from a make with one camera and these cues. V2 breaks 6.
Both clips, V1: 4839 22/28, 4840 26/32 = 48 of 60 (80%); V2: 4839 26/28 (design clip, in-sample), 4840 28/32 (88%, out of sample).
The single V2 test is 32 shots: 88% has a wide uncertainty (roughly 71% to 96% at 95%), and V2 and V1 differ on only 4 shots, so
this does not prove V2 is better than V1; it shows the V2 changes did no harm and probably helped. Shot totals matter separately:
V2's session totals were 18/14 against 14/18 (V1 16/16): both over-count makes, V2 by 4. 
Honest summary for tomorrow's UI discussion: counting makes automatically is accurate to roughly 80-90% per shot on unseen clips
of the same hoop, and wrong in a recognizable way (rim bounces near the net). With one-tap correction, the tool would be right most
of the time and cheap to fix.

### The app's rule on the exam clips, and how slow the phone may be (2026-10-06)
`src/lib/vision/shotRules.ts` (the app's streaming rule) reproduces the offline scores exactly on the exam detections, now kept
in `training/fixtures/dets5-4839.json` and `dets5-4840.json` (box positions only; `npm test` checks them): 4839 V1 22/28, V2 26/28;
4840 V1 26/32, V2 28/32.
Frame rate, simulated by feeding the rule every 2nd, 3rd or 4th frame of those same detections (two different starting frames):
- 15 fps: 4839 V2 27/28 (one start found a 29th shot); 4840 V2 27-29/32. Holds.
- 10 fps: 4839 V2 24-26/28; 4840 V2 28-29/32. Mostly holds, more spread.
- 7.5 fps: shots start going missing (23-25 of 28, 29-31 of 32 found).
Caveat: this thins out detections from a full-rate run; a phone running slower also sees different frames and may detect
differently. Phase A pass line stays at 15 fps sustained; 10 fps is the floor below which live counting should not ship.

### "Worth a look" flag registered BEFORE the third fresh clip (2026-10-06)
Defined as `FLAG` / `flagReasons` in `src/lib/vision/shotRules.ts`: a V2 make is flagged if the ball below the net is >= 25 px
wide (median of its first 8 sightings), OR it never comes within 15 px of the net's centre line, OR it had >= 20 sightings in the
rim zone. All six V2 errors on 4839 + 4840 were misses called makes (rim bounce dropping by the net), so only makes are flagged.
On those two clips (IN-SAMPLE: thresholds picked after looking): catches 5 of 6 wrong calls (missed: 4840 #11, a clean-looking
drop 1 px from the centre line), flags 11 of 60 shots (18%). Kept by `npm test`.
Exam for the third clip, all decided now: score V2 against Matt's written list, then report how many wrong calls the flag catches
and what share of all shots it flags. Target: most errors caught with under 25% of shots flagged. Nothing is tuned before the report.

### Phone parity check passed: IMG_4840 on Matt's iPhone (2026-10-06)
Camera lab, ball-5, CPU, saved clip, "Every frame (exact)", window from the "Exam clips" rim. Calibrate against Matt's written
list: 32 shots counted, 18 camera makes, right on 28 of 32 (87.5%), 6 flagged catching 3 of the 4 wrong calls. Identical to
the offline numbers (tools/40 and the app's rule on training/fixtures/dets5-4840.json), so the phone pipeline (HEVC decode,
1080p window, preprocessing, ONNX Runtime on the phone, the streaming rule) reproduces the offline exam. Still unmeasured:
live speed and heat over a whole session (the 10-minute soak), and live accuracy on new footage.

### How exactly must the rim be tapped? (2026-10-06)
Both exam clips re-run with the rim moved up to 20 px (in the 416 px window) each way, scored with the calibration line-up:
51-58 of 60 right everywhere in that range, against 54 at the centre; moving it up or down usually adds one extra counted
"shot" per session. So 20 window px is close enough. On a phone the 1080p picture is shown at screen width, where 20 px is
about 4 points, smaller than a fingertip, which is why aiming felt fiddly: the lab now aims in two steps, a rough tap on the
picture and a fine tap in a full-width close-up of the window (20 px there is about 20 points), with a ring for the allowance.

### Zoomed-in or farther-away setups: rim size (2026-10-06)
Matt's older zoomed-in clip showed the rim about 2.2x the training size, and the rim at the very top of the picture.
- Size sensitivity, measured by scaling the exam detections about the rim (as if zoomed by that factor), V2, both clips, 60
  shots: x0.8 52, x0.9 53, x1.0 54, x1.1 53, x1.2 48, x1.4 51 (+2 extra, 1 missed), x0.7 46. Within about 10% is fine;
  2x unmatched is not.
- The ball near the rim on the exam clips measures 22 px (median of 832 detections), so the rim is about 45 px across there.
- The lab now cuts a window of 416 x scale camera px and shrinks it to 416, with scale set on the aim screen by matching a
  45 px bar to the rim (5% steps). Scale 1 is the training setup, unchanged: "Exam clips" sets the exam rim and scale 1,
  and src/lib/vision/roi.test.ts checks the window is exactly (866, 260, 416) with the rim at (192, 190).
- When the window meets the frame edge, the rule and the cross now use the rim's real place in the window (before, the
  rule kept assuming (192, 190), which was wrong in exactly that case). Under 120 px of room above the rim the aim screen
  warns to tilt down or step back.
- The lab report gives the median ball width near the rim, to compare with training's 22 px.

### Rule V3 (trial) registered BEFORE the third fresh clip (2026-10-06)
All six V2 errors on 4839 + 4840 are misses called makes. Following the ball (nearest detection frame to frame from its first
rim-zone sighting, at most 30 px per frame, giving up after 8 unseen frames), its fall from rim level to 60 px below differs:
makes fall at most 9.5 px/frame (the net catches and slows the ball), the five measurable errors 11.1-17.5 (dropping freely
beside or in front of the net; 4839 #27 could not be followed). V3 = V2, except a V2 make falling faster than 10.5 px/frame
past the rim is a miss. Defined as FALL / fallSpeed in src/lib/vision/shotRules.ts; V3 can only turn makes into misses.
IN-SAMPLE (the limit was read off these two clips): V2 54/60, V3 59/60; any limit from 10 to 11 gives 59; at 15 fps 58-59.
Locked by npm test. Exam for the third clip, decided now: score V2 and V3 in the same run against Matt's written list (the
Calibrate screen has a V2 / V3 switch), report both and every shot where they differ. The worth-a-look flag stays as
registered (on V2 makes). Nothing is tuned before the report; the app keeps counting with V2 until then.
Known limit of V3 (Matt, 2026-10-06): V3 judges speed only, after V2's position check. A ball that rolls on the rim and drops
through the middle is slowed by the net and stays a make (4839 #16: rolled about a second, fell 8.2 px/frame, kept). But a
slow roll that falls off the rim right beside the net starts from almost no speed, so speed can't tell it from a make; only
the path through the middle of the net can. A tighter "through the middle" check is the next idea, held back for now
because a few real makes' tracks briefly jump to another object. Long rolls are flagged worth a look either way.

### First 10-minute live soak on Matt's iPhone (2026-10-06, afternoon, outdoors)
ball-5, CPU 1 thread, 30 fps cap, live 1920x1080. No crash, screen kept awake. Speed fell steadily with heat: 20.5 fps in
minute 1, 15.3 in minute 5, 12.1 in minute 10 (model time per frame 39 -> 68 ms). Average 15.4; below the 15 fps target from
minute 6. Shots counted 58 against Matt's count of 56. Makes counted 3: wrong, because the rim size was set to x1.63 when the
phone was FARTHER than in training (ball near the rim 9 px at that setting; the right setting was about x0.65). With the ball
a third of its size, V2's "ball at least 18 px wide below the net" almost never held.
Changes for the next run: the rim size is now measured by tapping the rim's two edges (no - / + to get backwards); a red
warning appears 2-3 shots in, stays after the run and is in the copied report when the ball near the rim is outside 80-125%
of 22 px; the default frame limit is 15 fps; still frames are skipped (the model runs only while something moves near the
hoop, and for 1.5 s after; a block of the window must change by 6 or more out of 255).

### A different angle: IMG_4851, five trimmed clips (2026-10-06)
Matt's phone behind the shooter on the wide lens, hoop far and seen side-on; 96 s in five clips (footage not kept). Answer
key read frame by frame here: 12 shots, 8 makes, 4 misses (three of the misses roll on the rim and fall off; two makes roll
in). The rim-edge sizing failed on this angle: seen side-on the rim is a long flat oval (about 57 px wide), so sizing from it
said x1.27 the wrong way round, while the ball (a sphere looks the same size from every angle) said about x1.2.
- ball-5 found the ball cleanly at the rim; the only steady false detection is a dark mark on the brick wall, far from the rim.
- Shots found: 12 of 12 at every size tried (no extras).
- Calls right (V2, V3 the same here): x1.0 9/12; x1.2, x1.3, x1.4 11/12 each. At x1.0 two makes became misses through V2's
  "bigger below" cue (the net hides part of the ball at the rim, and its 26 px cut is absolute, so a ball bigger than in
  training trips it), and one miss became a make through a stray sighting by the ground under the hoop 1.6 s later. At the
  right size the one error left is a roll off the side called a make, flagged worth a look.
- Ball size reference for automatic sizing: in the air above the rim (within 80 px sideways, 60-170 px above), training
  23.5 / 23.9 px (4839 / 4840, ~280 sightings each); this video about 28 px at x1.0, so x1.18.
Decision: size from the ball, automatically, over the first warm-up shots; the rim is tapped once for position only.
- Auto sizing as built (src/lib/vision/autoSize.ts): the narrow area above the rim saw only ~2 sightings a shot on this
  angle (the ball comes in across the window from the side), and the first 20-30 sightings, all from one or two flights,
  read 20-30% high even on training (the ball nearer the camera on its way in looks bigger). So: any moving, round,
  uncut ball within 140 px sideways and 25-180 px above the rim; the median of each flight, then the median of five
  flights. Five-flight estimates: training x1.03-1.04 (kept, tolerance 15%); IMG_4851 at x1.0 x1.22-1.30. In the lab
  (browser, clip read frame by frame) it went x1.00 -> x1.24 after five shots, then confirmed x1.24 on the next five. Counting the 12 shots at x1.24 in the lab: 12 of 12 found,
  10 of 12 calls right with V2 (the roll-off make, flagged; and clip 3's second make called a miss, not flagged), V3 9 of 12.
  Offline at x1.2 and x1.3 it was 11 of 12; the lab's clip was a re-encode, so a borderline shot can tip.
Next rule idea, not done: count a "below the net" sighting only on the ball's own followed path (V3's tracker), which would
also have stopped the ground-bounce make at x1.0.

### Four new clips and Matt's written lists (2026-10-10)
IMG_4844, IMG_4851, IMG_4866, IMG_4867 (1080p HEVC with audio, 2-3 min each) were added to Training Video/. Matt's handwritten lists
(photo, transcribed here; saved as labels/IMG_48xx-truth.json, in shot order): 4844 14 shots (7 makes, 7 misses); 4851 18 (9, 9);
4866 19 (11, 8); 4867 16 (9, 7). The transcription from the photo is mine and still needs Matt's confirmation, particularly the
five misses in a row in 4851 and the overwritten last mark in 4866.
- 4867 is the usual spot and zoom: it is the true third fresh clip for the exam registered on 2026-10-06 (V2 and V3 scored in
  the same run, flag catch rate and share flagged, nothing tuned before the report).
- 4844 (very zoomed, rim near the top edge), 4866 (zoomed, usual spot) and 4851 (side-on wide, a full-length version of the five
  trimmed clips used earlier, 12 of whose shots are probably in it) test other angles and scales with the app's auto sizing.
- None of the four may be used to change the model or any rule before its score is reported.
Matt confirmed the transcription is accurate for all four lists (2026-10-10).

### FRESH EXAM 3: IMG_4867 (usual spot and zoom), 2026-10-10 - V2 vs V3 vs the flag, as registered on 2026-10-06
Matt's list: 16 shots (9 makes, 7 misses). Hoop window (826, 284), rim at native (1018, 474) = (192, 190) in the window, backboard
about 145 px wide (training 140-150), so scale 1; auto sizing agrees (ball 24.7 px, scale stays 1). ball-5 detections on every frame
(`tools/22`), then the app's own counting core (`tools/41-run.mjs`, which runs `src/lib/vision/counting.ts`). The core found exactly
16 shots, so the match to Matt's list is 1 to 1 in order. The window and rim were placed before looking at any call. Nothing was
changed after seeing the result. Pinned at scale 1 and with auto sizing the output is identical.
- V1: 13 of 16 (81%). V2: **15 of 16 (94%)**. V3: **13 of 16 (81%)**. V2's totals 10 makes / 6 misses against 9 / 7; V3's 6 / 10.
- Worth-a-look flag: 3 of 16 shots flagged (19%), catching the 1 wrong V2 call (target: most errors caught with under 25% flagged: met,
  on one error).
- V2's one error: shot 3, a miss called a make, the same kind as before, flagged.
- **V3 FAILED this exam.** It turned three real makes into misses (shots 2, 4, 7), and fixed one V2 error (shot 3). The tracked fall
  speeds past the rim: makes 2, 4, 7 fell 11.4-11.7 px/frame, make 8 7.7, make 9 10.3, makes 12, 14, 16 7.5-8.1; the one miss V3 caught fell
  11.7. On 4839 + 4840 the line between makes (up to 9.5) and rim-bounce misses (11.1 and up) looked clean; on this clip makes fall as
  fast as the miss, so fall speed alone does not separate them. The in-sample 59 of 60 does not carry over: V3 stays a trial and must
  not count live. V2 stays the app's rule.
- Unseen-clip tally for V2: 4840 28 of 32, 4867 15 of 16 = 43 of 48 (90%); the 4867 sample alone is small (95% interval roughly
  72% to 99%).
- Not yet checked on the other three new clips (4844, 4851, 4866); they test other scales and angles.

### Exams 4-6 on the other three new clips (2026-10-10): IMG_4866, IMG_4851, IMG_4844 - ball-5, the app's counting core, V2 / V3 / flag
Method as for exam 3: hoop window placed from one full-resolution frame before scoring (size from the backboard width against
training's 145 px, rim by eye), ball-5 on every frame (`tools/22`, `SCALE`, `START`), the app's own counting core (`tools/41-run.mjs`)
with auto sizing on (it confirmed each size), matched to Matt's list. Nothing about the rules was changed. Caveat for all three: the
window scale was set from the backboard first and the sizer then confirmed it, rather than starting at 1.0 and finding it, and
the window is cut with ffmpeg (bicubic) rather than the browser's canvas, so a borderline shot could tip.
- **IMG_4866** (usual spot, zoomed; scale 1.9, ball 24.7 px): 19 shots found, 19 written, 1 to 1. V1 18 of 19 (95%), V2 17 of 19 (89%),
  V3 17 of 19. Both V2 errors are misses called makes (shots 1 and 4, falls 10.4), both flagged. Flag: 5 of 19 shots (26%), catches 2 of 2.
  V1 beat V2 by one shot (V2's longer window turned shot 1 into a make).
- **IMG_4851** (side-on wide; scale 1.24, ball 24.2 px): 17 found, 18 written, so matched by alignment, which flatters the rule: V1,
  V2 and V3 each 15 of 17 aligned; one written shot (#12) was never seen as a candidate, so 15 of 18 against the whole list. Errors:
  shot 2 a miss called a make (flagged); shot 12 a miss called a make (not flagged).
  Flag: 5 of 17 (29%), catches 1 of 2. Partly NOT fresh: Matt's earlier trimmed pieces of this same recording (12 shots) were used to
  build auto sizing, so it is not a clean exam.
- **IMG_4844** (very zoomed, rim 100 px from the top edge, steep angle; scale 2.0): the camera MOVED between 63 and 64 s. The rim sat
  at about (845, 100) before and (952, 100) after (checked at full resolution at 56-66, 100 and 150 s), and the first scoring, with one fixed rim
  (840, 115), got 6 of 13. Redone as two windows (rim (840,100) up to 63.5 s, (952,100) after; a shot at 63.2 s that straddles the
  move is dropped): 15 candidates, 14 written, aligned: V1 6 of 14 (43%), V2 8 of 14 (57%), V3 8 of 14 (57%); flag 6 of 14 (43%) catching
  4 of 6 wrong calls. Only 774 ball detections in 3 minutes, against about 1000 on the other clips, and the strips show the ball
  mostly hidden behind the board or in front of the net at this angle. Not usable as it stands, and the rule has no cue for it.
- A phone that is bumped mid-session silently breaks counting (the rim is where it was tapped). Worth a "the hoop moved, re-aim"
  check: the camera lab/Shoot could compare the live hoop window with the one taken at aiming.
- **V3 across the new clips:** 4867 13/16 (V2 15), 4866 17/19 (V2 17), 4851 15/17 (V2 15), 4844 8/14 (V2 8). V3 was never better than V2 and
  was worse on the clean clip, so it stays a trial and V2 stays live.
- **V2 on the four new clips, whole list as the denominator:** 4867 15/16, 4866 17/19, 4851 15/18, 4844 8/14: 55 of 67 (82%); without
  4844 47 of 53 (89%). Same-angle unseen clips so far (4840, 4867, 4866): 60 of 67 (90%).

### Rule V4 (trial) registered BEFORE the next fresh clip (2026-10-10) - where the ball crosses the rim line
Of the 82 shots V2 called a make across IMG_4836-4867 (six clips), 16 were really misses, and 16 of V2's 17 errors on the new clips
are misses called makes; so the lever is telling real makes from false ones. Features tried on those 82 (tools/42-features.py, from
the detections only): sightings above the rim (no separation: makes 0-21, misses 0-27), ball size at the rim (weak: misses median
1.01x the clip's size above the rim, makes 0.9x, with outliers both ways), the climb back up after reaching the rim (too noisy:
it picks up rebounds), fall speed (V3: failed on 4867), and where the ball crosses the rim line (separates).
- **Crossing**: no real make of 55 measurable crossed more than 12 px from the rim's x; 9 of the 15 measurable false makes crossed 23 to
  58 px out, a ball dropping beside the net, or hitting it from outside. The rest crossed inside the ring (a rim bounce straight down)
  or could not be measured, and this cue does not help with them.
- **Aim error** would shift every crossing, and a fixed 20 px limit breaks real makes when the rim is tapped 20 px off. So the centre is
  the median crossing of the session's V2 makes (needs 5), and until then the tapped rim with the limit widened to 30 (20 plus the
  tap's own 10 px). Checked by shifting the rim: V4 is at least as good as V2 on every clip at a shift of -20, -10, +10 and +20 px.
- **V4 = V2, except a make crossing more than 20 px from the centre (30 before 5 crossings are known) is a miss.** It can only turn
  makes into misses. Limits set from the rim's geometry (about 45 px across, so half is 22) and the tap's accuracy, once, before
  scoring the rolling version; the 15 px and 25 px alternatives were looked at in the first (offline) pass and not used.
- **In-sample** (all six clips are design clips now; this is not a test): V2 109 of 126, V4 116 of 126 (92%): 4839 26 to 26, 4840 28 to 31,
  4867 15 to 15, 4866 17 to 18, 4851 15 to 16, 4844 8 to 10. No make broken. V3 on the same clips: 112 (tuned on two of them).
- Left over: rim bounces that drop straight through the ring's x, and a person hiding the ball. About 7 false makes remain across the
  six clips, 4 of them on 4844.
- Exam: the next fresh clip at the usual or zoomed angle with Matt's written list. Score V2, V3 and V4 in one run and report all
  three, plus the flag. Nothing is changed before the report. V2 stays the live rule until then; the Calibrate screen has a V4 (trial)
  switch next to V3, and the lab now saves V4's calls.
- Tooling: `tools/41-run.mjs` scores a clip with the app's counting core (`--segments` for a clip whose camera moved, `PAIRS_OUT` to
  export every shot's evidence), `tools/43-run-tests.mjs` runs the vision tests on Node 20 (which cannot run `npm test`), `tools/22`
  takes `SCALE` and `START`.

### Exam clips IMG_4872, IMG_4873, IMG_4874: procedure registered 2026-10-11, BEFORE any detection or call has been looked at
Matt filmed three clips (1080p HEVC with audio, 2.4-2.6 min each). His written lists are coming; nothing is scored until they
exist, and nothing in any rule, the model or the sizer is changed before the report.
- **IMG_4872**: usual wide shot, backboard about 138 px (training 145), so scale 1. **IMG_4874**: usual wide shot, backboard about 136 px, scale 1.
  Matt's note: 4874 is kept as a held-out clip for scoring anything retrained, so it must NOT be used to tune or train anything.
- **IMG_4873**: iPhone 1x lens instead of 0.5x, backboard about 257 px, so about 1.77x the training size. This is the test of the app finding
  its own zoom. It starts at scale 1 (the remembered size) and the sizer must find the right one from the ball, unaided. The honest
  report says what size it found, how many shots it needed, whether it found any size at all at x1 (the model has only seen balls of about
  22 px, and this ball would be about 40), and how the calls score afterwards. I place the hoop on the picture by eye (as the player
  would tap it), but do not set the scale from the backboard for this clip, unlike 4866 and 4844.
- Rims placed at full resolution from one frame each, before any detection: 4872 (1038, 462), 4873 (1040, 508), 4874 (1008, 520) in the
  1920x1080 frame; scale-1 windows at (846, 272), (848, 318), (816, 330).
- Scoring: ball-5, every frame (`tools/22`), the app's counting core (`tools/41-run.mjs`, auto sizing on), V1/V2/V3/V4 and the flag in one
  run, matched to Matt's list 1 to 1 where the counts agree (alignment, said so, if not). V2 is the registered rule and V4 the trial being
  tested (registered 2026-10-10); report all four and every shot where they differ. Pass line for promoting V4: not worse than V2 on any of
  the three clips and better in total on 4872 + 4874 (the unzoomed ones), with the flag catching most errors on under 25% of shots.

### EXAMS 7-9 on IMG_4872, IMG_4873, IMG_4874 (2026-10-11), as registered above
Matt's lists (each row came with his own totals, which my transcription matches): 4872 23 shots (13 makes, 10 misses); 4873 22 (10, 12);
4874 20 (12, 8). Windows placed before any detection; ball-5 on every frame; the app's counting core (`tools/41-run.mjs`).
Two ways of scoring, because the sizer changed the answer: **pinned** = window at scale 1 all clip long (one window, valid, and it found
every written shot on 4872 and 4874, so it lines up 1 to 1 with Matt's list), and **sizer** = the app's own behaviour: let auto sizing find
the size from a first pass (saved-clip style), then count from frame 0 in that window (detections re-run there). Where counts differ from
Matt's, the shots are matched to the pinned run's 1-to-1 timeline by time (within 1.5 s) so the score is not flattered by self-alignment.
- **Auto sizing from scale 1, IMG_4873 (iPhone 1x, the dynamic-resize test): it worked.** From a start at x1 it settled on **x1.62**
  after 27 s (ball 37.5 px against training's 23.7), unaided. The backboard says about x1.77 (257 px against 145), so the ball says
  9% less than the backboard. Counted in that window: 24 candidates for 22 written shots (3 extras, 1 written shot never seen); aligned,
  V1/V2/V3/V4 all 20 of 21 aligned (20 of 22 against the whole list). At x1 the same clip found only 18 of 22 shots (ball 38 px, the model
  has not seen balls that big), so the resize clearly helped, but the 3 extra candidates are shots that were not there (not yet looked at).
- **Auto sizing on the two wide clips, 4872 and 4874: it misled.** The ball measured 16.5 px (4872) and 17.2 px (4874) in the scale-1 window,
  against 22.8-24.5 on earlier clips, so the sizer moved the window to x0.72 and x0.73. But the backboards are 138 and 136 px (training 145) and
  the ball in the frame looks about 22 px wide, so the model's boxes are tight on this ball for a reason I have not found (not a different
  ball, as far as the picture shows). Shrinking the window cost shots: at x1 every written shot was found (23 of 23, 20 of 20), in the sizer
  window 21 of 23 (4872) and 17 of 20 plus 1 extra (4874). Whether the model copes better with small balls than large ones is suggested by this
  (17 px balls: everything found at x1; 38 px: 4 of 22 lost), but it is two clips, and 4874 is held out, so the sizer's tolerance has NOT
  been changed. It needs a decision, see below.
- **Rule scores against the whole written list** (unfound shots count as wrong):
  | clip | window | V1 | V2 | V3 | V4 |
  |---|---|---|---|---|---|
  | 4872 | pinned x1 | 18/23 | 19/23 (83%) | 18/23 | **21/23 (91%)** |
  | 4872 | sizer x0.72 | 20/23 | 20/23 (87%) | 18/23 | 20/23 (87%) |
  | 4874 | pinned x1 | 14/20 | 15/20 (75%) | 16/20 | 16/20 (80%) |
  | 4874 | sizer x0.73 | 12/20 | 14/20 (70%) | 13/20 | 15/20 (75%) |
  | 4873 | sizer x1.62 | 20 of 21 aligned for every rule (flatters; 24 candidates, 22 written) |
  Pooled over 4872 + 4874 + 4873: V2 54 of 65 (83%) and V4 55 of 65 (85%) in the sizer windows; pinned (4872 + 4874 only) V2 34 of 43, V4 37 of 43.
- **V4 (registered 2026-10-10) against its pass line:** (1) not worse than V2 on any clip: met, in both windows. It differs from V2 on 3 shots
  in the pinned run (4872 #2 crossing 40 and #15 crossing -32, 4874 #17 crossing 35, all real misses, all fixed) and 1 in the sizer
  windows (4874 #5, a real miss called a make, crossing -36, fixed), and it broke no real make anywhere (the scorer's self-aligned table
  showed one "V4 wrong" on 4874 that was a mis-lineup; by time the shot is a miss). (2) better in total on 4872 + 4874: met, +3 pinned,
  +1 in the sizer windows. (3) the flag catching most errors on under 25% of shots: NOT clearly met: 22% flagged and 3 of 4 errors
  caught on 4872 pinned, 25% and 2 of 5 on 4874 pinned, 14-29% and 0-1 caught in the sizer windows. V4 has therefore NOT been
  promoted: it is better, but only by 1 to 3 shots in 43 to 65, and the third condition is mixed.
- **V3** was the worst rule on the unzoomed clips again (4872: 18 of 23 at both windows, below V2; 4874 pinned 16, sizer 13).
  It has now failed to beat V2 on 5 of the 6 clips it was not tuned on.
- **What still goes wrong**, from the pinned run, 4874: written #2 and #13 (makes the camera called misses: shot #2 not seen at the rim, #13 the ball
  hidden), #5 (a miss called make, crossing -26, under V4's early 30 px limit), #12 (miss called make crossing -1: a rim bounce straight down).
  4872: #1 (miss called make, crossing -9), #5 (a make called a miss).
- Fixtures: `training/fixtures/dets5-4872(-found).json`, `dets5-4873-s1.json` (scale 1) and `dets5-4873-found.json` (x1.616), `dets5-4874(-found).json`
  (ball boxes only). 4874 stays held out from any training or tuning.

### V4 promoted to the live rule (Matt's decision, 2026-10-11)
After the IMG_4872/4873/4874 exams (above) Matt chose to make V4 the rule the app counts with. `LIVE_RULE = "v4"` and `liveCall()` in
`src/lib/vision/shotRules.ts` are now the one place that says which rule counts; the Shoot screen, the camera lab and the saved
`rule_version` follow it, and Calibrate opens on the live rule (V2 and V3 stay selectable to compare). The worth-a-look flag is
unchanged (defined on V2 makes); a shot V4 turns into a miss can still carry the ring. Not yet measured on a phone: the first live
V4 session, and the earlier note still stands that V4's centre is learned from a session's first 5 crossings.

### Round six: plan and exam, registered 2026-10-11 BEFORE any round-six model exists
Matt: promote V4 (done) and train on the older clips, holding out IMG_4874. Why a retrain is worth trying: ball-5's boxes on the
blurry wide clips (IMG_4872, 4874) cover only the core of the ball (about 70% of its width; seen on 18 exact-frame crops of 4872), which
made the app's auto sizing read the ball as small and shrink the window, losing 2 to 4 shots per clip. Training on boxes that follow the ball's
whole outline, from clips at other angles, zooms and light, may fix the boxes at their source.
- **Data** (tools/44-round6.mjs): round five's set (dataset13) plus, from IMG_4839, 4840, 4844 (two camera positions), 4851, 4866, 4867, 4872
  and 4873, every ball-5 proposal (score >= 0.4, every 2nd frame) that an independent circle-edge fit on the native picture confirms (support
  >= 0.7, centre inside the proposal's neighbourhood, size 0.6-1.9x the proposal), boxed by the circle, not by the model; frames where a second
  ball may be present are dropped; up to 300 per source; windows cut at 0.8-1.25x of each source's own measured ball scale, so the same
  ball appears 19-30 px wide. Random 48-box eye-check sheet per source before anything is trained on it.
  Left out and NEVER touched: **IMG_4874** and the kids clip B1689585. No negatives from the new clips (a shooter holds a ball in too many
  frames, the round-two lesson); round five's negatives stay.
- **Known limits**: positives only where ball-5 already proposes a ball, so this teaches box size, zoom and angle, not recall; the motion-based
  "hard positives" (balls ball-5 misses) are a possible round 6b if the exam says recall is the problem.
- **Exam** (ball-6 against ball-5, same tools, same windows, V4 as the live rule), all on 4874 and the kids clip:
  1. 4874 shot calls, pinned at x1 and in the sizer's own window: shots found out of 20 and calls right out of 20 for each model.
  2. The scale the sizer picks on 4874 with each model (the backboard says about 0.94; ball-5 said 0.73). Not tuned, only reported.
  3. How the model's box width at the rim compares with the ball's circle-fit width on 4874 (a measurement, no training on it).
  4. Kids clip, round-five protocol (every box looked at): precision and any new kind of false box.
  Promote ball-6 only if: no fewer shots found and no fewer calls right than ball-5 in either window on 4874 (20 shots, so one or two
  shots is noise and is reported as such), the sizer's pick on 4874 lies within 0.85-1.15, and the kids-clip precision is not clearly lower.
  Otherwise ball-5 stays.

### Round-six dataset built (dataset14 -> dataset_v6.zip, 2026-10-11)
`tools/44-round6.mjs`: circles, then render. Round five's set (dataset13) plus, from nine sources (IMG_4839, 4840, 4844 at its two camera
positions, 4851, 4866, 4867, 4872, 4873), every ball-5 proposal (score >= 0.4, every 2nd frame) that an independent circle-edge fit on the
native picture confirmed, boxed by the circle. 693 circles passed the first test (support >= 0.7, centre and size agree with the proposal);
a first eye check of 144 tiles still showed about 15-20% bad (4 faces, about 6 backboard shadows, about 5 small boxes beside a real ball whose
ball had no box), so two more tests were added and the numbers stored with each circle (`o45`: share of the circle's inside that is saturated
orange; `elsewhere`: strongly orange pixels elsewhere in the picture, in ball areas, minus the source's median): o45 >= 0.6 and
elsewhere-median < 0.5 (IMG_4844 exempt from the colour test, its balls are dark against the sky). 548 circles left (4839 109, 4840 94,
4844a 10, 4844b 39, 4851 73, 4866 90, 4867 81, 4872 25, 4873 27). Eye check of the filtered set, 48 random per source (all of the small
ones), nine sheets, about 400 tiles: boxes on real balls and tight everywhere, no face, no shadow, no unboxed second ball seen; 4844's
balls are all dribbles on the pavement at the start of the clip (real balls, not shots).
- Measured ball width from the circles (native px, the window then cut at width/23.7 of 416): 4839 24, 4840 26, 4844 50, 4851 30, 4866 44,
  4867 24, 4872 28, 4873 46. Ball-5's own box width near the rim on 4872 was 16.5, so its boxes are about 59% of the ball there; the circle width
  can read somewhat high on a blurred ball (halo), which is accepted.
- Each kept frame is rendered twice (REPEATS) as a 416 px window at 0.8-1.25x of its source's own scale, ball placed within 15% of centre, so
  the same ball is 19-30 px wide; boxes follow exactly. New pictures: train 904, val 54, test 138 (1096 in all, 904 train + val + test split by
  time within each source). Merged: train 5392 pictures (4112 with a ball), val 746 (392), test 1131 (801). No negatives added from the new clips.
- Held out, verified in the file lists: no IMG_4874 and no kids-clip picture (two old file names contain "4874" by coincidence).
- `Training Video/dataset_v6.zip` (573 MB, top folder `dataset`), notebook `colab/train_ball_detector.ipynb` now reads it and writes to
  `hardwood-lab/out6`. Matt runs it in Colab, then the round-six exam above is run with the new `ball-6.onnx`.

### ROUND SIX EXAM: ball-6 against ball-5 (2026-10-11), as registered above. Colab test: 95% found at 0.25, 0 of 330 made up (round five: 95%, 0).
Same-clip test, not the exam. The exam is on IMG_4874 and the kids clip, neither ever trained on.
1. **IMG_4874 shot calls (20 written), V4 live rule, matched by shot time to the 1-to-1 ball-5 timeline.** ball-6 at x1: 19 of the 20 written shots
   found plus 1 extra candidate (94.6 s), written #11 never found; ball-5 at x1: 20 of 20, no extras. Calls right out of 20 (whole list): ball-6 V4 17,
   ball-5 V4 16 (V1: 15 against 14, V2: 15 against 15, V3: 15 against 16). In each model's OWN sizer window, the way the app really runs: ball-6 stays at x1
   (so found 19, right 17) and ball-5 shrinks to x0.73 (found 17, right 15, from the earlier exam). 20 shots, so one or two shots is noise.
2. **The size the sizer picks on 4874:** ball-6 **x1.00** (ball measured 24.7 px); ball-5 x0.73 (17.2 px). The backboard says about 0.94. Pass.
3. **Box width against the ball:** in exact-frame crops of 18 balls both models box, ball-5's box covers the core of the ball (about 17 px on a ball of about
   21) and ball-6's box encloses the whole ball with a 1-2 px margin (about 24-25), the training convention. The automatic circle-fit measure on 4874 is NOT
   reliable (only 14-19 of 100-150 balls pass the fit, median 16 px, which does not match what the crops show) and is reported as such, not used. Some of the
   crops have the ball offset from both boxes, because frame numbers drift slightly in long clips; the box sizes are read where the two line up.
4. **Kids clip B1689585, round-five protocol (1 window a second, score >= 0.25), all 263 detections looked at:** ball-6 263 detections (ball-5: 105), about 231
   on a ball (88%; ball-5 about 95 of 105, about 90%), so about 2.4 times as many real balls. 32 false boxes: **15 on the man's red shirt** (torso boxes, 3 at
   score 0.31-0.43 but 5 at 0.61-0.85, so confident), **15 on dark round shadows on the backboard** (ball-5: about 5), 2 on heads. The red-shirt boxes are
   the same size as the balls in that setup (box widths 24-44 px for nearly all detections), so a size cap cannot remove them.
   Recall is clearly better; precision a little lower, with a worse kind of mistake (confident boxes on a red shirt).
5. **Phantom shots in two clips with a red shirt near the hoop** (4851, 4872; their ball positives were in training but red torsos were never labelled, so
   this is fair for phantoms): ball-6 found the same shots as ball-5 (23 and 17) with one extra candidate at 0.0 s on 4872, none on 4851; matched to Matt's lists
   V4 got 23 of 23 and 16 of 17 right (in-sample for those two clips, not an exam).
- **Decision: promote ball-6**, because it meets the line registered before training (sizer 1.00; no fewer calls right on 4874, one fewer shot found at x1
  which was declared noise; kids-clip precision not clearly lower). `public/models/ball-6.onnx` replaces ball-5 (kept in git history, so a rollback is
  one commit), `MODEL_VERSION` is "ball-6". Camera counting is still a per-phone trial switch, so the exposure is Matt's own phone.
- **What to watch**: phantom shots when someone in a red shirt stands near the hoop, and extra boxes on the ball's shadow on the backboard. Round 7, if
  they show up in a live session: hard negatives of red-shirt torsos and backboard shadows from clips that are not 4874 or the kids clip, each checked by eye
  (round four's shadow set is the model for it).

### Extra make/miss cues from the same single side view: all tested leave-one-clip-out, none helps as a verdict (2026-10-11)
Matt ruled out a second or overhead angle (too much setup for the kids), so only cues from the one side-view footage were tried. Base: V4 with ball-5 over
the 8 labelled clips (IMG_4839, 4840, 4844, 4851, 4866, 4867, 4872, 4874; 169 matched shots of 170 written): 153 right (91%, mostly in-sample for V4; on the
two clips it was not designed on, 4872 and 4874, 37 of 43 = 86%, and with ball-6 on 4874 38 of 43 = 88%). The 16 wrong calls: 12 misses called makes (the ball
fell near the ring line: a rim bounce straight down, or no measurable crossing), 4 makes called misses (no ball seen below the net). Makes are over-counted:
100 called against 92 written (+9%). Each cue is used to demote a V4 "make" to a miss; thresholds were chosen on seven clips and scored on the eighth,
rotating through all eight (`tools/45-kink.py`, `46-audio.py`, `47-net.mjs`; their per-shot tables are in training/work, not committed).
- **Rim-contact kink** (biggest velocity change of one followed ball near the rim): false makes median 15.8, real makes 6.1, but real makes also show big changes
  (the net catching the ball, a track hopping to another object): best in-sample threshold fixes 7 and breaks 7; held out, net +2 shots.
- **Impact sound** (peak level in a 0.6 s window around the rim contact, above 3 kHz): false makes median 16 against 8.6 for real makes, large overlap, sharpness no
  different; held out, net -5. Kink and sound together: net 0. (Caveat: voices and the ball on concrete add noise; the narrated clips could leak the answer
  through speech, so a good score here would have needed more scepticism, and there is none to need.)
- **Net movement** (brightness change in the net's patch after the ball leaves, relative to the clip's median): this separates the groups (false makes median 1.8,
  real makes 4.1 times the clip's median), but only 12 of 100 "make" calls are wrong, so even this cue, used as a verdict, breaks more real makes than it fixes
  (held out: net -4 shots for the late net, -12 for the pass-through).
- **Why no single cue works as a verdict:** the wrong calls are about 1 in 8 of the makes, so a cue has to be very sharp (roughly 95% separation) to net a gain.
  These are 70-80%.
- **As a prompt, not a verdict**, quiet net after a "make" added to the worth-a-look ring: ring 24% of shots now catches 9 of 16 wrong calls (95.9% right if
  every ringed shot is re-checked); with t = 2.0 the ring is 30% and catches 11 of 16 (97.0%); beyond t = 2.5 it plateaus at 12 of 16 (97.6%) for 36% or more. About
  +1 point for 6% more checking, in-sample, with a clip-relative baseline a live session would have to learn. Not built; reported so the choice is Matt's.
- **Conclusion:** from one side view the automatic ceiling looks like about 88-91% per shot (12 of the 16 remaining mistakes are rim bounces that look like makes),
  and about 96% when the player confirms the ringed shots. A different view (overhead, as in NOAH) or a rim sensor would change the ceiling; neither fits Matt's
  setup. The remaining lever inside this constraint is the check step, not the detector.

### First live session on Matt's phone, and what it showed (2026-10-12)
Matt shot a camera set on the phone (stand, ball-6, V4): 77 shots, 41 makes (53.2%), 7 minutes, about 45 of the 77 shots ringed "unsure". He tapped End
session expecting a review afterwards and never got to one: the review was a panel at the bottom of the counter (a long list above a Save set button
in the same place as End session), its state was only in memory (lost if the phone restarted when it was unhooked from the stand), and it listed every ringed
shot, so a set like this had a 45-row review. The set saved, which deletes the replays, so that set cannot be reviewed any more. Fixed (shot-review.tsx, the
Shoot screen): End session opens a screen of its own; the review state is stored in the set so a restart comes back to it; Save set is locked for the first
1.2 s and shows the live total; the unsure list shows the 12 most unsure first with "Show more"; Keep shooting returns to the counter; "Copy camera report"
gives the ring reasons, speed and size of a set (the reasons are kept per shot on the phone, never synced).
- **Why 58% rung is unexplained.** Offline the ring is 18-20% at phone frame rates with ball-6 (30 fps 32%, 15 fps 18%, 10 fps 20%); a phone running very
  slowly does not raise it (7.5 fps 24%, 5 fps 17%) but loses shots (37, 30 and 27 of 43 found); a rim tapped 10-20 px off raises it to 22-35%
  (`tools/48-aim-shift.mjs`). None reaches 58%, so the next session's camera report is how it will be found.
- **Ring at phone speed (ball-5, 7 clips, V4).** 30 fps: ring 22%, catches 7 of 12 wrong calls, 96.8% right if the ringed are re-checked; 15 fps: 19%, 4 of 11, 95.4%;
  10 fps: 19%, 5 of 11, 95.8%. The "long at the rim" reason counts detections (20 at 30 fps) so it fires once at 15 fps instead of 20 times. As a time
  span it can be made frame-rate independent (>= 30 reference frames: ring 26% at 30, 15 and 10 fps, catches 6 of 12 / 5 of 11 / 5 of 11, about 96.0% re-checked) but gains
  only about half a point for about 7 points more ringing, so it has NOT been changed. The earlier "about 96% if the player confirms the ringed shots" holds at
  30 fps; at the phone's 15 fps it is about 95.4%.
- Reasons, 8 clips at 30 fps (ball-5): wide_below rings 6 shots, catches 3 wrong calls, none only it catches; off_centre 26 / 6 / 1; long_at_rim 21 / 6 / 2.

### Aiming without two taps (2026-10-12): what works and what doesn't
Matt finds the two-step tap to aim clumsy, especially from a landscape stand. Two ways of finding the rim without being tapped were tested on the setups where its place is known (`tools/49-rim-finder.mjs`, `tools/50-hoop-register.mjs`):
- **Finding a red-orange steady arc: does not work.** Bricks, trees and shirts give 100 to 1000 look-alike blobs per clip; the best guess was hundreds of pixels off in 7 of 10 setups and nothing at all in the rest.
- **Re-finding the hoop from the last aim, by matching a saved edge picture of it (backboard, rim, net) against today's picture at several sizes: works when the phone is placed similarly.**
  Same place 0 px error (match 0.72); slightly different 4-7 px (0.46-0.55); more different 19-22 px (0.26-0.28); a different lens or a side angle (4851, 4866, 4873) wrong
  with a low match (0.19). Error is in 416 px window units (20 is the allowance). So: match >= 0.4 can aim by itself, 0.25-0.4 shows the guess to confirm, below that
  the player aims by hand (press, hold and slide with a magnifier). 10 pairs only, three clips of the same hoop and phone, so the thresholds are a starting point.

### The app's hoop-matching module on the same ten pairs (2026-10-13), `src/lib/vision/hoop-match.ts`, `tools/51-hoop-match-check.mjs`
Coarse-to-fine port of tools/50 (half size at seven sizes, then full size near the best). Score >= 0.40 starts by itself, 0.25-0.40 asks, below that aim by hand:
same place 0.72, error 0 px; 4839 to 4872 / 4874 and 4874 to 4872 0.46-0.55, error 4-7 px; 4839 to 4867, 4867 to 4874 / 4872 0.29-0.30, error 20-28 px (asked, not started);
4839 to 4851 / 4866 / 4873 (side angle, other lens) 0.16-0.20, wrong by 183-414 px (aim by hand). No wrongly auto-started case in the ten. About 0.75 s per match on this laptop.

## Evaluation harness (2026-10-14)

`training/eval/` measures the current system (ball-6, rule V4, the existing hoop window) against a frozen baseline so that every later
change, a tracker, new rules, analytics, is compared with numbers and not impressions. It leaves the detector, the rules, the window and the
auto-sizer untouched and calls the app's own code. Start at `training/eval/README.md`: data roles (there is **no untouched final test
set**), the blind manual annotation set and its limits, the circle-fit independence test (the circle-fit that built ball-6's targets is
seeded by the detector and follows its seed, so it is not independent ground truth), the three separate tracking evaluations
(interpolation, prediction, association), and `reports/baseline-v0.md` with `reports/baseline-v0-notes.md` (the findings). Compare any change with
`node training/eval/compare.mjs training/eval/reports/baseline-v0.json <new report>`.

### Rim phantom experiment (2026-10-14), `training/eval/experiments/rim-phantom/`
Root cause of the static false box ball-6 puts on the rim of IMG_4873 (42% of frames, 11 px, orange rim hardware at close range), five
candidate filters tested under criteria registered before each round, three rounds. **No candidate met the bar; nothing was integrated.**
Closest: H2 (spot memory AND current motion proof), zero genuine boxes lost, one 15 fps injected cell at 89.6% against 90%. Read
`REPORT.md` there; the blind human annotation package is `training/work/eval/human-annotation-package.zip` (local only).

### Experiment 1: persistent tracking and shot-state machine (2026-10-15), `training/eval/experiments/tracker/`
Kalman tracker (cv / ca / ballistic / hybrid), spot memory, track-based shot machine, all isolated; criteria T1-T13 registered before any
code, rounds 2 and 3 registered adaptive. **NOT READY; nothing integrated, `src/` untouched.** Phantom suppression and shot continuity
work (about as well as H2); the Kalman associator is no better than a plain constant-velocity nearest-neighbour, no motion model beat a
simple baseline, and the wider gate that fixed bounces cost shots on IMG_4872. The 416 px window almost never sees the release (1 of 174
shots). Read `REPORT.md` there; `node evaluate.mjs shots-round3.json assoc-m2-f0.5.json` reapplies the criteria.

### Experiment 2: expanded flight visibility (2026-10-16), `training/eval/experiments/visibility/`
Existing footage only. The release and early flight are in the 1920x1080 frame but outside the 416 px production window (22 of 33 annotated balls
outside it, none detected); the camera does not cut them off. A 2x rim-centred window lifts apex visibility from 26% to 58% and reconstruction-eligible
shots from 32% to 62%, but keeps only about half the confident production-window detections on its own (production window plus 2x window keeps all, two inferences).
Release is observed in 3-7% of shots under every strategy (the held ball is the weak link), a stacked window above the hoop does not help, the full frame
at 416 and nine tiles fail on scale or cost. **No phone-compatible strategy met the registered bar; nothing integrated, `src/` untouched.** Read `REPORT.md` there.

### Phase 4: shot intelligence (2026-10-17), `training/eval/experiments/shot-intelligence/`
Flight-path replay (offline HTML, `make-replay.mjs`), shot fingerprints (`shot-fingerprint/1`, observed points only, explicit unavailability),
an evidence-backed insight engine that abstains when evidence is thin, and one accuracy experiment (cv_nearest with the round-2 shot machine). Criteria registered first,
three labelled amendments. Replay and fingerprints work; the engine supports only "misses were farther from the rim centre" (mostly face validity) on two clips and
abstains on 40 of 45 statements (placebo false-claim rate 0-2%); the accuracy experiment is NOT RECOMMENDED (one merged shot slides the pairing on IMG_4872). Nothing integrated, `src/` untouched. Read `REPORT.md` there.

### Phase 5: session review and shot-separation reliability (2026-10-18), `training/eval/experiments/session-review/`, `.../shot-separation/`
Flag-gated session review in the app (`hl:session-review`, default off): shot browser, replay with observed path, frame stepping, rim-relative compare, measurements with missing-data reasons,
unreliable paths hidden; additive `ReviewRecord` v1 in its own IndexedDB. Verified on 35 shots of existing recordings, 0 mismatches against the records; needs a real-device pass.
Shot-separation: a time-based diagnostic view (frozen scorer untouched) and one registered candidate that FAILED (the IMG_4872 merge is one tracker track spanning two balls: an association problem).
Nothing integrated into counting. Read `session-review/REPORT.md`.

### Phase 6: persistent shot history and on-device readiness (2026-10-19), `training/eval/experiments/persistent-history/`
Opt-in, local-only retention of compact per-shot tracking records for saved sessions (`hl-history` IndexedDB: observed rim-relative points, fingerprint, quality, framing; no video),
behind the `hl:session-review` flag (off by default) plus a per-phone opt-in; cross-session shot comparison with explicit comparability rules; bounded consistency analytics with abstention.
Real-IndexedDB checks 25/25, 126 app tests, baseline unchanged. ~1.5 KB/shot; recorder ~5 us/frame on a desktop. NOT validated on an iPhone: see the REPORT's on-device procedure and the in-app storage test (Camera lab > Session review).

### Round seven: a real black-ball clip (IMG_4915), plan and exam registered BEFORE ball-7 exists (2026-10-22)
Matt filmed a new ball at his kids' hoop (dark grey/black, not orange) because the app called every shot a miss. Measured on ball-6: it detects this ball
in only 9.3% of frames near the rim at this clip's distance (score >= 0.2, scale 1), against 34-46% for the orange ball at the same distance on the eight
existing clips. Run through the shipped counting core on real detections from the first minute: the only call in that span is a miss, the ball is seen
approaching the rim three times and never below it, so V1/V2's "a ball below the net" test defaults to miss regardless of the real outcome. This is the
exact failure Matt described, and it is not new: round four's notes (`26-orange-only.mjs`, this file, 2026-10-05) already found a black ball's few real
training boxes and dropped them because the colour filter cannot tell one from a shadow, ending "it needs its own clip"; round five logged "not done:
more black-ball positives" and no later round returned to it. IMG_4915 is that clip, three weeks later.
- **Why a motion proposer, not the model's own proposals.** Round six seeded its new positives from ball-5's own proposals, confirmed by an independent
  circle-edge fit. That would not work here: ball-6 only proposes this ball 9% of the time, so its proposals would teach only the handful of cases
  already found. Instead, `tools/52-round7-black-ball.mjs` finds candidates from frame-to-frame motion in the play area (a coarse grid diff, grouped into
  blobs, no colour test), confirms each with the SAME colour-blind circle-edge fit round three and six used, and keeps a circle only if: it is not the
  skin-tone band, it sits in a low-saturation ("grey/black," not blue sky or green leaf) band at a sane brightness, the circle's OWN pixels (not just
  something nearby) genuinely changed from the previous frame (a ball passing through is never the same object twice; this is what rejects the hoop
  stand's cone, which a nearby shadow kept dragging the motion grid onto), it is not within one hand-identified static-prop rectangle (that same stand),
  it does not recur at nearly the same spot more than twice across the whole clip (a bolt or a leaf gap flickering with the light), and it is at least
  10 px in radius (a "circle" found at the radius floor in cluttered leaf texture is cheap to produce by chance out of tens of thousands of tries; every
  real sighting of this ball measured 10 px or more). Exempt from the orange test, like IMG_4844's sky balls in round six.
  Candidates: 49,750 raw motion-confirmed circles over the 7:08 clip, 325 pass every filter above. Eye-checked by Claude in stages as each filter was
  added (sheets in `training/work/round7/`, not committed): the last full-clip sample is about 85-90% a real ball, tightly boxed, across pavement, sky,
  tree canopy, the net and backboard, near a hand; the rest is mostly small boxes in dense leaf clutter that slipped past the size floor at its edges.
  ball-6's own low-score proposals (score >= 0.05) were tried as a second source and rejected: confirmed by the same circle fit without the self-motion
  test (this source has no frame-to-frame signal to require), the great majority sit on the net or backboard structure at this clip's distance, not the
  ball; not used.
- **Dataset** (`52-round7-black-ball.mjs render`): round six's merged set (dataset14) plus the 325 kept circles, rendered the same way (two 416 px windows
  per kept frame at 0.8-1.25x the source's own measured scale, ball placed within 15% of centre, capped at 300 source frames, split by time within the
  source 70/15/15): 594 new pictures. `Training Video/dataset_v7.zip` (dataset15, top folder `dataset`), notebook `colab/train_ball_detector.ipynb` now
  reads it and writes to `hardwood-lab/out7`. Merged: train 5786 (4506 with a ball), val 838 (484), test 1239 (909).
- **Exam, registered now, before Matt runs Colab:**
  1. The eight labelled clips, frozen scorer, exactly as `training/eval/README.md` runs it: ball-7 must not score below ball-6's recorded numbers
     (V4 159 of 166 matched shots, 159 of 178 written). A drop here means the new data cost the orange ball something; ball-6 stays.
  2. IMG_4915's own held-out test split (the last 15% of the clip by time, never in train or val: frames 10917-12843 of 12844, 1927 frames). Baseline,
     measured now so it cannot move: ball-6 detects the ball in 162 of 1927 of those frames (8.4%, score >= 0.2, same window). Ball-7 must detect it in
     clearly more of the same 1927 frames, with the far side of the gain approaching (not necessarily matching) the orange-ball rate of 34-46% measured
     the same way. Run with `MODEL=<ball-7.onnx> node tools/22-dump-detections.mjs "Training Video/IMG_4915.MOV" 712 240 <out.json> 0.05`, same window
     as this report, then count frames >= 0.2 at or past 10917.
  3. Not scored, no written make/miss list exists for this clip: whether more of those frames give the shipped rule a below-the-net sighting to call
     from. Reported for the record only.
  4. Promote ball-7 to production only if 1 and 2 both pass, exactly as every prior round's promotion rule. Otherwise ball-6 stays and the gap is
     reported, not patched around.
- **Limits stated up front:** one clip, one lighting, one ball, filmed on one driveway; a second black ball (or the same ball under floodlights) is
  untested. The false-positive residue in the training data (an estimated 10-15% of the 325, mostly small boxes in leaf clutter) was not hand-removed
  frame by frame, only filtered by rule and spot-checked by sheet; round four's and round six's own eye checks accepted a similar or higher residue
  before use. No real make/miss ground truth exists for IMG_4915, so criterion 2 is the whole exam; end-to-end accuracy on this ball is not claimed
  until Matt shoots a session with it and the counts can be checked against what he saw.

### ROUND SEVEN EXAM (2026-10-23), ball-7 trained by Matt in Colab against the plan above, as registered
Matt also sent a handwritten make/miss list for IMG_4915 while this ran (`training/labels/IMG_4915-truth.json`, 50 shots, transcribed by Claude, agrees
with his own totals 26-24). That list did not exist when criterion 2 was registered, so it is additional evidence, not a substitute for it; both are
reported. All detections re-dumped fresh for both models for this exam (`dets7-*`, `dets6b-4915`/`dets7b-IMG_4915`), nothing reused from before training.

1. **The eight frozen clips, frozen scorer, minScore 0.2** (the registered bar: must not score below ball-6's 159 of 166 matched, 159 of 178 written).
   Ball-7: **157 of 177 matched, 157 of 178 written (88.2%, against ball-6's 89.3%). FAILS the registered bar by 2 correct calls.**
   Per-clip, ball-7 introduces two new wrong calls on clips it had no reason to touch: IMG_4839 shot 27 (written miss, ball-6 right, ball-7 calls make)
   and IMG_4872 shot 1 (written miss, ball-6 right, ball-7 calls make). It also fixes one ball-6 had wrong: IMG_4874 shot 5 (written miss, ball-6 called
   make, ball-7 gets it right). The striking change is IMG_4873 (the known rim-hardware-phantom clip): ball-6 never even counts 11 of its 22 written
   shots (they vanish into merges, `written_never_seen`); ball-7 counts and matches all 22, at a lower hit rate on those newly-visible ones (10 of 22
   right). Net: a real fix to a long-standing problem (a shot that silently never appears at all) bought with a few wrong outcomes elsewhere, and the
   net correct count is lower than ball-6's by the registered measure.
2. **IMG_4915's held-out test split (last 15% by time), re-measured at the corrected window** (cropX 730, cropY 207, matching the app's own
   `hoopWindow` placement for this rim, not the approximate one `inspect`-level work used earlier): ball-6 9.6% (185 of 1927), ball-7 10.1% (194 of
   1927). Technically "more," not "clearly more," and nowhere near the orange-ball range: **this registered criterion is at best a weak pass**, and
   on the whole clip ball-7 actually fires less often than ball-6 (7.0% vs 10.7%) — raw firing rate turns out not to track what matters here.
3. **Real make/miss accuracy against Matt's list, informational when registered, now measurable (not part of the registered gate, but the clearest
   signal of the three):** ball-6 gets **28 of 50 right (56.0%)** — close to what calling almost every shot a miss would score, since 24 of 50 really
   are misses, and ball-6's calls are "miss" on all but 4 of the 50 (matching the original bug report exactly). Ball-7 gets **37 of 50 right (74.0%)**,
   9 more correct, including makes it now calls correctly throughout the clip instead of defaulting to miss. This is the number closest to what Matt
   actually experiences, and it is a clear, large improvement — far clearer than criterion 2's frequency measure, which undersold it: firing less
   often but more accurately at the moments that decide the call matters more than firing often.
- **Verdict against the rule as written:** criterion 1 fails, so by "promote only if 1 and 2 both pass, otherwise ball-6 stays," **ball-7 is NOT
  promoted.** This is reported, not patched around, exactly as planned — but it leaves a real tension the plan did not anticipate: the registered
  gate (built to protect the orange ball) is failed by 2 shots out of 178, while the thing this round was actually for improved by 9 shots out of 50
  on real ground truth that did not exist when the gate was written. Put to Matt rather than decided here.

### Promote ball-7 anyway (Matt's decision, 2026-10-23), and what has to happen next
Matt: move forward with ball-7 despite the failed criterion 1 — a real app should not be missing attempts outright (IMG_4873's 11 never-counted
shots) or defaulting a ball it cannot see to "miss" (the original bug), and 9 more correct calls out of 50 on the ball actually in use outweighs 2
wrong calls out of 178 on one it is not. This is a deliberate override of the registered no-regression rule, not a pass; the two known new mistakes
(IMG_4839 shot 27, IMG_4872 shot 1, both false makes) are accepted, not fixed, by this promotion. `public/models/ball-6.onnx` removed,
`public/models/ball-7.onnx` added (sha256 in `NOTICE.txt`); `src/lib/vision/engine.ts` and `lab-calls.ts`'s `MODEL_VERSION` point at it.

Matt also asked for two follow-ups, which are round eight's job, not done in this commit: (1) stop losing attempts outright — IMG_4873's
rim-hardware false "ball" is a known cause (the 2026-10-14 rim-phantom experiment tried five filters and none met its bar; its own conclusion was
hard-negative training on the rim hardware, never done); ball-7 improved this a lot by accident (11 of 22 silently-uncounted shots on 4873 down to
0) without ever being trained on it, so there is reason to think a round aimed at it directly would do better still. (2) "Expand the tracking so no
ball in the shot is lost" — read as: widen how much of the ball's path the camera and detector actually see and hold onto, not as a promise that
every frame gets a box. Two prior experiments already measured the ceiling here under the current one-camera, 416 px-window, single-frame-at-a-time
constraints: Experiment 2 (2026-10-16) found the release and early flight are outside the window 22 of 33 times and a 2x window helps but costs
detections elsewhere; Experiment 1 (2026-10-15) found a persistent tracker does not beat plain per-frame detection at association. Round eight
should treat "expand tracking" as the open question those left unresolved, not retry either unchanged.

### Round eight, part one: rim-hardware hard negatives, plan registered BEFORE mining (2026-10-23)
Checked first: does ball-7 still fire on IMG_4873's rim hardware (the 2026-10-14 rim-phantom root cause)? Yes, unchanged — 409 of 1842 detections
at score >= 0.2 sit within 20 px of the rim in the 416 px window, spanning frames 141 to 4192 of 4352 (almost the entire clip). This is the same
phantom, since round seven never trained on it.
- **Why a hard negative, not a filter.** The 2026-10-14 experiment tried five live-rule filters against this and none met its bar; its own
  conclusion was to fix it at the source, in training, which was never done. A detection that recurs at nearly the same native pixel across almost
  the whole clip cannot be the ball (a ball is never in one spot for minutes); it is the backboard/rim assembly itself.
- **Plan:** identify ball-7's detections that cluster tightly in position (within ~15 px) and recur across a wide span of the clip (the same
  static-recurrence signature `tools/52-round7-black-ball.mjs` used, in reverse: there it dropped a recurring circle as noise, here the recurrence
  itself IS the thing to teach against), crop 416 px hoop-window-style "no ball" pictures centred on exactly those false boxes, eye-check a sample,
  and add them as explicit negatives to the next training round, the same way rounds four and five added backboard-shadow negatives.
- **Criteria, registered now:** (1) the false-positive class is confirmed by position (static, spans most of the clip) before any crop is taken, not
  guessed from a single frame; (2) a random eye-check sample of the mined crops is genuinely free of the real ball (checked by Claude before they
  are used); (3) the next model is re-examined on the SAME IMG_4873 metric used in the round-seven exam (shots counted and matched, 11 of 22 before
  round seven, 22 of 22 after; outcome correct 10 of 22 after) plus the full round-seven exam's three checks, so a fix for 4873 is not allowed to
  quietly cost the black ball or the other seven clips without it being reported. No promotion without a registered result, exactly as every round.
- **Not yet decided:** whether this round also carries "expand tracking so a ball in the shot is never lost" (the second ask), or whether that is
  its own round, since it needs a design choice between the two previously-explored directions (a wider/second window, or revisiting
  tracking-based association) rather than more data for the existing detector. Reported separately once scoped.

### Round eight, part one, mined (2026-10-23): `tools/53-round8-hard-negatives.mjs`
`find` clustered ball-7's own IMG_4873 detections by a 15 px native grid; five of six static-recurrent clusters turned out to be the real ball
returning to the rim on many different shots across the clip (caught by eye on the first pass, then confirmed numerically: 58-100% of each
cluster's frames fall within 45 frames of a real reference shot). Only one cluster is independent of shot timing (11% near a shot) — the rim and
net at native (1019, 515), present whether or not a shot is happening, exactly the 2026-10-14 phantom. 24 random frames of it, eye-checked: no
ball in any of them. `crops` cut 150 416 px "no ball" training pictures centred on it (jittered 20 px, spread across frames 141-4192), 4 more
spot-checked after the fact: clean. Written to `training/work/round8/negatives/IMG_4873/` (git-ignored, like all training pictures) plus a
manifest; `training/labels/round8/IMG_4873-phantoms.json` records the cluster itself. Not yet merged into a dataset or sent anywhere — that is
the next step, plus deciding whether other clips need the same treatment (none of the other seven showed this never-counted pattern in the round
seven exam, so none have been checked) and scoping the "expand tracking" half of the ask.
