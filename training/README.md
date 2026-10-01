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
