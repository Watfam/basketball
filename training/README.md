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
