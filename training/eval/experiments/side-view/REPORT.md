# Side-view flight path from one rear camera: what can be recovered

Registered first in `PREREGISTRATION.md` (tolerances and the decision rule were written before any result). Run with `node study.mjs`; numbers are in `results.json`. Uses only the existing replay sample (142 real tracked shots from existing recordings, numbers only) and simulation. No footage was requested.

## 1. What the camera really observes (real shots)

- Ball position in the picture: good. The measured localisation error is about 0.8 px median (1.7 px at the 95th percentile) against our own annotation. The ball is about 24 px wide at the rim, so one pixel is about one centimetre at the rim's distance.
- Time: 15 camera looks a second (67 ms apart), over roughly the last 0.7 to 1.9 seconds before the ball reaches the rim, because the camera watches a window around the hoop, not the whole flight.
- Apparent ball size: noisy and almost flat. Frame to frame it varies by about 4.4% (robust). Along a real shot, the first third of the observed path against the last third has a median size ratio of 1.03 (10th to 90th percentile 0.84 to 1.34). That is a signal-to-noise ratio of about 1.5, which is too weak to say how far the ball moved toward or away from the camera. It means these shots were filmed from far enough back that the ball does not visibly change size over the last second.
- Missing stretches: the camera sometimes does not see the ball. The app already draws nothing across those, and keeps them marked.

## 2. How accurately could a side view be rebuilt?

Best accuracy any method could reach (Cramer-Rao style bound from the model, with the real noise, real timing and real window), 400 simulated shots, p90 of the error across shots:

| Quantity | Tolerance | S1: camera known exactly (needs a calibration we do not have) | S2: camera roughly known (phone propped by a person) |
|---|---|---|---|
| Sideways at the rim | 5 cm | 0.6 cm: yes | 3.7 cm: yes |
| Entry angle | 3 degrees | 1.9 degrees: yes | 4.7 degrees: **no** |
| Apex height above the rim | 0.15 m | 0.14 m: yes | 0.30 m: **no** |
| Depth, short or long, at the rim | 10 cm | 19 cm: **no** | 174 cm: **no** (worse than the rim is wide, 46 cm) |

S1 with the apparent-size cue added passes everything, but the simulation's size change (median 1.54) is much larger than the real footage's (1.03), so that column flatters the cue; with the real, flat size change it would not pass. S2 is what an app can honestly assume: it fails on depth, apex height and entry angle, with or without the size cue.

Why: a single camera sees a ball's direction from itself, not its distance. Gravity does give a metric scale through the shape of the arc, but only if the camera's focal length, tilt, height and distance are known to about 1%. A person propping up a phone does not know them to that accuracy, and the app has no calibration for them.

The same 3D shot, seen from nine plausible camera set-ups (three tilts, camera 1, 3 or 6 m behind the shooter), reaches between **115 and 299 px above the rim** in the picture. That is a 2.6 times difference from where the phone stands, not from the shot. So an arc drawn from the picture's path is not the shot's physical arc, and two shots filmed from different spots must not be compared by how high they look.

## 3. The decision (by the registered rule)

1. **Measured, reliably:** where the ball was in the picture at each sighting; its position relative to the rim; where it was seen going down past the rim's height, sideways, in the picture, in ball widths; the time between sightings; when the ball was not seen.
2. **Estimable only under assumptions we cannot check:** nothing we are willing to show per shot. Sideways offset in metres is just ball widths times 0.24 m and is as good as the ball-width reading.
3. **Not recoverable from this camera and set-up:** how short or long the ball was at the rim; apex height; entry angle. They fail the tolerances without calibration, and the best case needs a calibration we do not have.
4. **Validation that would be needed:** an independent side-view reference of the same shots (a second synchronised camera, or a tracked shot of known geometry) plus a measured camera calibration (focal length, tilt, height, distance, and the rim's apparent ellipse). We have none of it, and we may not request footage, so a reconstruction cannot be validated now whatever the model says.
5. **What to show:** Option 1, the camera's own view, as the authoritative picture: the observed ball over the rim, with the real apparent ball size, uncertainty marked, and the rim and backboard drawn for context. **No per-shot estimated side view is shown** (Option 2 is rejected: the rule requires S2 to pass and a validation). Option 3 is allowed only as one fixed explanatory drawing, identical for everyone and labelled as an illustration; it is shown inside a collapsed "What does arc mean?" help, never as someone's shot.

## 4. What stays experimental

Nothing from this study is in the app except the decision. `study.mjs` is isolated under `training/eval/experiments/side-view/` and nothing imports it. A future reconstruction would need the validation in section 3 first.

## 5. Limits of this study

The bounds are best-case (no estimator can beat them, and real fits can be worse). The camera set-ups are simulated; the real ones are unknown, which is itself part of the finding. The real sample comes from eight sets from existing recordings and is not independent evidence about other hoops.
