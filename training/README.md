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
