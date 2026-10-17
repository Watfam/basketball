# Side-view flight path: feasibility study, registered before any result was looked at

Question: from ONE stationary camera behind the shooter, which physical properties of a shot can be recovered well enough to draw a side view that is a measurement and not an illustration?

Method (study.mjs, deterministic): (1) measure on the 144 real tracked shots in the existing replay sample what the camera actually observes (ball box width noise, apparent-size change along a shot, pixel scale). (2) Simulate 400 plausible 3D set shots seen by a pinhole camera set up so the ball is the size it really is at the rim in our footage, with the observation noise measured in (1) and the real frame timing and window (last ~0.9 s of flight, 15 fps). (3) Compute the best accuracy ANY estimator could reach (the Cramer-Rao style bound from the model's Jacobian, with Gaussian priors on what is not known) under two conditions: S1 = camera focal length, tilt, height and distance known exactly (the best case, which needs a calibration the app does not have); S2 = those only roughly known (focal +-10%, tilt +-3 degrees, camera height +-0.3 m, distance to the rim +-1 m: what a player propping a phone up could plausibly say). (4) Show how a fixed 3D shot looks different in the picture from different camera set-ups.

Tolerances for "defensibly recoverable" (a quantity must meet it at the 90th percentile of shots, in S2; S1 alone is not enough because S1 cannot be met in the app):
- apex height above the rim: 0.15 m
- entry angle: 3 degrees
- sideways offset at the rim: 5 cm
- depth (short or long) at the rim: 10 cm (about half a ball)

Decision rule: a side-view reconstruction is shown as a MEASUREMENT only if every quantity it displays meets its tolerance in S2 AND a validation against an independent side-view reference exists. We have no side-view reference and may not request footage, so the second condition cannot be met now regardless of the first. If S2 fails, no per-shot estimated side view is shown at all, even labelled as an estimate. A simplified illustration of what arc means is allowed only if every shot gets the same drawing.
