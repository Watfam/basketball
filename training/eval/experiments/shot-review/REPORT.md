# Phase 13: shot review, side-view feasibility, and coaching insights

The detection and counting pipeline is unchanged (ball-6, V4, the hoop window, shot counting, the frozen baseline). Everything here reads saved results and saved ball sightings. No footage was requested.

## 1. Audit: what each existing piece becomes

| Existing piece | Problem | Decision |
|---|---|---|
| "Makes vs misses" overlay (up to 120 paths on one chart) | Unreadable, and it answered no player question | Moved into Advanced, capped at the newest 12 paths (a button shows up to 120) |
| "Patterns across sets" statements | Some restate what a miss is (misses were farther from the centre) | Moved into Advanced under "Statistics across sets", labelled as such; the first view never leads with them |
| One-shot viewer (a grid with the rim in the middle) | Not the camera's view; no obvious rim or ball size; no stepping | Replaced by "Watch a shot"; the old viewer stays in Advanced with the measurements |
| "Compare shots" (pick up to 6, a table of measurements) | Technical table, no lining up | Replaced by "Compare two" lined up on the rim; the old table stays in Advanced |
| Shot history modal, set list with Delete | Delete and set management were the first thing | Kept, moved into Advanced; the first view is the three ways to look |
| Pre-save review with the video clip | Works, and it is the only place video exists | Left as it is; nothing in this phase touches it |
| `analyseHistory`, fingerprints, measurement tables | Valuable but technical | Kept, in Advanced, unchanged |
| Progress screen (Phase 12) | Benchmarks only | Gains "What your results say", a Next step, and a Shooting section that goes kind of shot, drill, results, shots |

What data exists: a saved shot keeps only the ball sightings the camera really made (position relative to the rim, apparent ball size, time, confidence) and its call. **There is no video after a set is saved**; it exists only before saving. So "Watch my shot over the original video" can only be true in the pre-save review, which already shows the clip. After saving, the honest picture is the camera's view built from the sightings, and it says so on screen.

## 2. The redesign: every card answers one question

| Card | Player question | Why it matters | Data behind it | Tap |
|---|---|---|---|---|
| Watch a shot (picture + play, pause, step, scrub, shot chips) | What did the camera see on this shot? | Seeing the shot again is the quickest way to trust or fix a call | The shot's sightings; rim and backboard drawn to scale from the ball's own size | A chip, next or previous shot, scrub or step |
| Hollow dots, dashed stretches, "not seen" | Where was the camera unsure? | Prevents reading a guess as a fact | Detector confidence and gaps between sightings | Named in a line under the picture |
| Compare two | How is this make different from this miss? | The coach's classic comparison, without invented causes | Both shots' sightings, lined up on the moment each was seen coming down past the rim's height (else closest approach, else start) | Pick A and B, swap, overlay or side by side |
| Where they went | Where do my shots come down, and do my misses lean to a side? | A left or right lean is a real, actionable pattern | One dot (or a bar when there are many) per shot at the rim's height; the side summary needs at least 8 misses and a clear majority | A dot or bar opens that shot; typical make and miss open Watch or Compare |
| What your results say | Am I getting better? | The main thing | Benchmarks and drills compared with themselves, same version, same conditions | See the sessions |
| Next | What should I do now? | Removes the "now what" | The benchmark never run, then the one not run for three weeks, then the one with the fewest runs; the Film Room lesson linked to its drill | Open the lesson, find it in Train |
| Shooting (kind of shot, drill, results) | How am I doing at each kind of shooting, drill by drill? | Connects the numbers to the practice that made them | Tracked drill results; kinds of shot side by side, never ranked | Down a level; each result leads to its workout and to its shots and replay |

First view is plain: no engineering words (a test checks the visible text against the app's jargon list). Make and miss differ by shape and word (a check or a cross, "Make" or "Miss"), not only by colour. Every control is at least 40 px tall.

## 3. Side-view reconstruction: decision

Full study in `../side-view/REPORT.md` (tolerances and the decision rule were registered before the results). Summary:
- **Measured:** where the ball was in the picture, its position relative to the rim, where it was seen coming down past the rim's height (sideways), timing, and the gaps.
- **Not recoverable from one rear camera without calibration the app does not have:** how short or long the ball was at the rim (about 1.7 m of uncertainty), apex height (0.3 m) and entry angle (about 4.7 degrees), each beyond its tolerance. Even with perfect calibration, depth missed its tolerance without the apparent-size cue, and the real footage's apparent size barely changes (ratio 1.03), so that cue is too weak.
- The same 3D shot looks 2.6 times higher in the picture from one camera set-up than another (115 to 299 pixels above the rim), so an arc drawn from the picture is not the shot's physical arc.
- **Validation would need** an independent side-view of the same shots plus a measured camera calibration. We have neither and may not request footage.
- **Shown:** Option 1, the camera's own view (the default, "Watch a shot"). **Not shown:** any per-shot estimated side view (Option 2 is rejected by the registered rule). **Allowed:** one fixed illustration of what "arc" means, the same for everyone, labelled as an illustration (Option 3), inside a collapsed "What does arc mean?".

## 4. Insights (`src/lib/basketball/insights.ts`)

Each has a headline, the numbers, a badge (Clear, Not clear yet, or Just a fact), what would settle it, a tap through to the sessions, and a "How sure is this?" with the range. Examples produced from test data:
- "Elbow Pull-Up (Right side) is up since last time. 42% then, 88% now (+46 points, 24 and 24 shots). Clear."
- "Your free throw benchmark: 63% then, 73% now. Not a clear change yet. With 30 and 30 shots, only a change of about 24 points or more would stand out."
- "Your first catch-and-shoot benchmark: 60%. A second full run, done the same way, shows whether it moved. Just a fact."
- "Movement and time pressure: not enough to compare yet. You need at least 30 tracked shots of each from the same spot."
- Next: "Run the Catch-and-Shoot Benchmark. Lesson for it: Playing Without the Ball (Open in the Film Room)."

Rules: only same-version, same-condition benchmark runs, or the same drill and variant, are compared; "Clear" only when the 95% range of the change stays on one side of zero; volume is a fact about effort and is worded so; nothing says anything about games; the Next step never prescribes a mechanical fix (tested).

## 5. How it connects

Me → Progress (Overview: insights, next, KPIs, benchmarks) → Shooting (kinds of shot) → a kind → its drills → a drill's results over time with its Film Room lesson → a result → its workout, or its shots and replay (`/shooting/[id]`, which opens the three-way shot view on this phone). Every step is a link; Back goes up one step and keeps the dates. A result carries `?from=` so the shot page's Back returns to the exact place; only a path inside the player's own area is ever followed (tested: other players, full addresses, scheme tricks and control characters are refused). Insight → lesson → Train (find the workout) → track with the camera → the result appears in Progress.

## 6. Tests and measurements

| Check | Result |
|---|---|
| App tests | 297 pass (270 before; 27 new, covering the shot scene logic, the insights and the return path) |
| Harness / experiment tests | 47 / 101 pass |
| Lint, types, production build | clean; `/players/[id]/progress` builds |
| Browser, iPhone size (`shot-review-e2e.mjs`) | all pass: the three ways to look, play, pause, scrub, step, next shot, camera setups kept apart, compare lined up (overlay and side by side), summary of where shots went, awkward cases (clear make and miss, incomplete path, unsure tracking, no path, corrected call, sparse), insights, Next with lesson, the way down and back, the real app history with the real sample |
| Scenarios | clear make, clear miss, incomplete path, unsure tracking, session without a path, different camera setups (3 in the real sample), sparse and 820-shot histories, a corrected call, multiple benchmark results |
| Rendering, 820 shots and 3 camera setups, CPU slowed 4x | 322 elements; switching between watch, compare and patterns takes 216 to 279 ms (page load 4.7 s with the CPU slowed 4x); the first version (every shot built and drawn up front) had 3,434 elements and one switch took 1.8 s |
| Production counting files | 55 compared byte for byte against Phase 9: 0 changed |
| Frozen baseline | reproduced, no change in any area |

Defects found and fixed by the browser checks: a screen-reader-only label inside the horizontal chip list made the whole page scroll sideways by about 1,200 px on a phone (the label was absolutely positioned outside the scroller); the end of a shot was drawn as "not seen" instead of held at where it was last seen; the make and miss pile of 82 dots was a column 30 dots tall (a bar summary is used above 24 shots).

## 7. What remains experimental or unverified

- Saved shot paths still require the existing flag and opt-in (`hl:session-review`, "Keep shot paths"); both remain off by default. I did not turn them on for everyone.
- No iPhone validation. Everything above is a desktop browser at iPhone size with the real existing sample, plus unit tests.
- The sample is eight sets from existing recordings, in-sample; it is not independent evidence about other hoops.
- Any estimated side view, arc, entry angle or depth: not built, and not buildable defensibly from this camera.
- The signed-in Progress pages and the Me strip were built and typechecked but not opened with live data; the same view component was exercised with test data.
- Left and right are as the camera picture shows them; a camera not directly behind the shooter changes what "left of the rim" means, which is why setups are kept apart.

## 8. Recommended next improvement

Put the camera set-up check to work: ask for the camera position once per set (a rear camera, behind the shooter, roughly centred) and keep it with the set. That makes "left of the rim" comparable across sets without guessing, makes the left/right miss lean much more trustworthy, and is a prerequisite for ever validating anything about depth. After one real benchmark week on phones, use those real sets to see how often the lean summary says something.
