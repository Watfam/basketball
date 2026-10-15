# Phase 10: camera tracking inside the existing training plans

The camera is now an optional tool on the drill card of a workout the player is already doing. There is no new training-plan system, no new
results table and no new drill library. Production shot detection (ball-6 model, V4 rule, 416 px hoop window, 15 fps loop) is unchanged.

## 1. Architecture map (what was there, what was reused)

| Area | What exists | How Phase 10 uses it |
|---|---|---|
| Plans | `hoops.programs` → `program_days` (volume_step, deload) → `workouts` → `workout_drills` (block, variant_label, levels, level_targets, targets) → `drills` | Unchanged. A drill's eligibility is read from the drill itself (`src/lib/basketball/drill-shooting.ts`). |
| Doing a workout | `workout_sessions` (status, program_day_id), `SessionPlayer` carousel (sets/reps taps, timer, skip), `logDrillProgress` → `session_logs` (one row per workout entry, `metrics` jsonb, `workout_drill_id`) | A tracked result is stored in the same `session_logs` row for that entry. |
| Camera | `ShootingHub` (draft kept on the phone, idempotent `syncShotSession` upsert on (session, seq)), `CameraStage`, `useCameraCounter`, review screen with flip/add/undo | Launched through the same hub, unchanged. The hub only gains an optional drill context. |
| Shot storage | `hoops.shot_sessions` / `hoops.shots` (source manual\|camera, detected_made, added_by_hand, flagged, soft delete) | Unchanged. The set the camera makes is still a normal shot set; the drill result points to it. |
| Film Room | `film_resources` (`drill_id`, `watch_for`, nullable `url`), `film_links` (household URL), `film_views` | Read only. Lessons are shown on the drill and on the start screen using the existing relationships. |
| Progress | `loadActivity` totals, shooting history by label, drill history from `session_logs` | Linked shot sets are not counted twice; drill results show by kind of shot. |

## 2. Which existing drills can be tracked

Decided by hand for every shooting drill in the seeds (`drill-shooting.ts`; a test parses the real `supabase/seed_*.sql` files and fails if a seeded
shooting drill has no explicit entry). A new drill with no entry is only offered the camera when it is tagged `shooting` and its name is clear; its
basis is then recorded as "keyword" instead of "defined".

| Drill | Kind of shot | Camera offered | Why |
|---|---|---|---|
| Free Throw Reset | Stationary | Yes | Same shot every time; makes and attempts mean something |
| Catch-and-Shoot off the Pin-Down | Catch-and-shoot | Yes | Counted shots after a catch |
| Elbow Pull-Up | Off the dribble | Yes | Pull-up jumper |
| Off-the-Dribble Pull-Up Series | Off the dribble | Yes | Pull-up jumpers |
| Wing Step-Back | Off the dribble | Yes | Step-back jumper |
| Beat the Clock Finisher | Pressure challenge (a clock) | Yes | Makes against a clock; the pressure is the timer, not a defender |
| Form Shooting Progression, One-Hand Form Shooting | Stationary | No | Form work is about mechanics, not the make count |
| Big Man Post-Up Footwork | none | No | Post moves; the camera is set up for jump shots |
| Ball-handling drills (e.g. Pound Dribble Series, Attack Cone Series) | none | No | Not shooting |

No existing drill is a movement, change-of-direction or decision-making shot. Those categories exist in the vocabulary but are empty, and a test
fails when one gets a member, so this report must be updated at that point. Nothing is claimed for them.

## 3. The integration

1. **Workout screen.** On an eligible drill card: "Track with Camera" (optional), a note of the kind of shot and the shot goal. The sets, timer and
   Skip work exactly as before; completing the drill without the camera is unchanged (tested: a plain "done" never replaces a tracked result).
2. **Context travels.** The tap opens `/players/<id>/shooting?workout=<workout session>&entry=<workout entry>`. The page loads the drill start
   screen (`loadDrillStart`: drill, variant, plan label, kind of shot, goal, lesson). Start writes a `DrillContext` into the phone's own draft of the
   set, so after an app restart the set is still attached to its drill. The set is named "Drill · Variant" and runs to the drill's own shot goal.
3. **Existing camera.** `start()` opens the same camera as before (or taps if the camera is turned off in the app). No detector, rule or counting
   code was touched (section 8).
4. **Save.** When the set is saved (after the usual review of the camera's calls), the hub calls `saveDrillTracking`, which merges the result into
   the workout's `session_logs` row for that entry. A marker (`hl:drill-pending:<player>`) is kept on the phone until the server answers for good,
   and retried when the app reopens or the signal returns.
5. **Back to the right step.** "Back to your workout" goes to `/players/<id>/sessions/<workout session>?tracked=<entry>`. The path is built from
   the ids, never taken from the address bar, so it cannot be pointed elsewhere. The workout opens on that drill showing its result, with
   "Next drill" or "Finish workout".
6. **Interrupted or mismatched.** A set already open for a different drill is never mixed in: the player chooses "Resume the set in progress" or
   "Discard it and track <drill>". Reloading mid-set resumes the same drill's set. A drill that cannot be tracked, or a finished workout, shows a
   plain message and the ordinary shooting screen.

## 4. How a result is stored

No migration. In the existing `session_logs.metrics` of the workout entry:

```
{ type: "shooting", variant, category, category_basis: "drill_definition"|"keyword",
  makes, attempts, target: {kind: "shots"|"time", value} | null,
  tracking: { v: 1, source: "camera"|"taps"|"mixed", shot_session_id,
              camera_attempts, camera_makes, flipped, added_by_hand,
              rule_version, model_version, adjusted: { original: {makes, attempts} } | null } }
```

The shot-by-shot detail stays in `shot_sessions`/`shots`; `shot_session_id` points to it. Old (camera-free) logs have the existing metrics shape and
are untouched; `parseTracked` returns nothing for them.

**One row per workout entry** (`mergeDrillLog`, `saveTrackedDrill`, `saveDrillLog`, tested against an in-memory store with interleaved async calls):

| Situation | Result |
|---|---|
| Camera set saved twice, or saved again after resuming | Same shot set → updates the one row (`keep`/`update`), never a second row |
| Plain "done" tap after a tracked result | Kept; the tracked result is not overwritten |
| Track again (a new shot set) | Replaces the drill's result; the first is not kept in the log, the older shot set remains in shooting history |
| Two saves racing | The second sees two rows after inserting and converges to one |
| Skip after tracking / skipped then tracked | Tracked result wins; a skip row is replaced |
| Workout finished or not this player's | Refused with a plain message, nothing written |
| Shots deleted before attaching | `no_shots`, refused |
| Legacy path | If the new write path errors, `logDrillProgress` falls back to the original insert, so workout logging cannot be lost |

Shot sets linked to a drill are excluded from the separate "shooting" activity totals (`activity-server.ts`), so a tracked drill is counted once.

## 5. Manual correction

- **During the set:** unchanged. Tap Make/Miss for a shot the camera missed, tap a shot to flip it, Undo; all of it is reviewed before saving.
- **After saving (new):** on the workout screen, "Fix the numbers" changes makes and attempts (`adjustDrillResult`). The first saved numbers are kept in
  `tracking.adjusted.original`, and the card says the totals were changed by the player.
- Camera calls the player reversed and shots added by hand are counted (`flipped`, `added_by_hand`) and shown ("1 call you changed, 1 shot you added").

## 6. Film Room

Existing relationships only (`drill-film.ts`). Seeds link: Building a Repeatable Release → Form Shooting Progression; Footwork Into the Pull-Up →
Off-the-Dribble Pull-Up Series; Creating Separation Off the Bounce → Wing Step-Back. Elbow Pull-Up gets Footwork Into the Pull-Up as a **related**
lesson (labelled so). Catch-and-Shoot, Free Throw Reset and Beat the Clock have no lesson in the library, and none is invented: the card shows
nothing rather than a guess.

- Trainer lessons carry no URL in the seeds; a lesson shows "Watch the lesson" only when a watchable URL exists, and says "No video is linked to
  this lesson yet" otherwise. The household's own link (`film_links`) wins when present. (The old drill card ignored household links; the new
  lesson path honours them.)
- Flow: watch the lesson (opens in a new tab, the workout stays put) → start the drill → track → review → continue the workout. The lesson also
  appears on the drill start screen.

## 7. Analytics: what is compared and what is not

`drill-analytics.ts`, shown as "By kind of shot" on the shooting page:

- Per kind of shot: makes of attempts, number of tracked drills, a likely range (Wilson 95%), and how the shots were counted. Under 20 shots it shows
  no percentage, only "too few to read".
- **The same drill and variant against itself over time.** A change is called supported only when both results have at least 30 shots and their
  intervals do not overlap. Clock challenges and shot-count challenges are never compared. A very different amount of work adds a caveat.
- **Two kinds of shot (catch-and-shoot vs off the dribble, stationary vs movement) are compared only when they were shot from the same spot** (wing,
  elbow, free-throw line, three-point line, read from the variant label). Otherwise they sit side by side with sample sizes and no verdict.
- Always attached: more or fewer shots, a different prescription, or tiredness can move a make rate without any change in skill; and these are
  practice-drill results that do not show how the same shots go in a game. Completion and volume are never presented as improvement; no driveway-to-game
  transfer is claimed.

## 8. Verified vs player-reported (game-shooting measurements)

| Measurement | Source | Status |
|---|---|---|
| Shots, makes and misses | Camera ball detection and make/miss rule, then looked over and corrected by the player; or the player's taps | Counted by the camera, checked by the player. Frozen baseline (in-sample, one hoop): V4 right on 159 of 166 matched shots at 30 fps; 12 of 178 written shots never seen. Not independent validation on other hoops. |
| Corrections | The player | Player-reported, kept as such |
| Kind of shot (stationary, catch-and-shoot, off the dribble) | The drill's definition and the player starting it | **Player/drill-reported. The camera did not see how the shot was taken.** |
| Clock in a timed challenge | The app's timer | Not evidence of game speed |
| Footwork, balance, form | not measured | The camera follows the ball, not the body |
| Game speed, defender pressure, decision quality | not measured | A timed challenge has a clock, not a defender |
| Exact spot and distance | not measured | The spot is what the drill says |
| Who took the shot | not measured | Whoever is shooting at the camera |

These statements are on the drill start screen, on the "By kind of shot" card and in `WHAT_IS_MEASURED`, and a test pins which are "not measured".

## 9. Tests and checks

| Check | Result |
|---|---|
| App tests (`node training/tools/43-run-tests.mjs`) | 230 pass (194 before Phase 10; +36 new: drill-shooting 7, drill-tracking 13, drill-film 3, drill-analytics 6, drill-context 4, drill-session-view 3) |
| Harness tests | 47 pass |
| Experiment tests | 101 pass |
| TypeScript, ESLint | clean |
| Browser (headless Chrome, iPhone-size, automated checks in `e2e/`, all passing) | workout card shows the button only on the one eligible drill (not on form or ball-handling), lesson shown, start screen content, back link built from ids, tap flow end to end (drill-named counter, drill goal, not added to one-tap starts, auto-saves at goal, result "4 of 5" added exactly once, pending marker cleared, navigates to the workout step), offline (marker kept), closed workout (plain message, marker dropped, no endless retry), mismatched open set (chooser, nothing touched until chosen), reload resumes the same drill, untrackable drill message, post-save "Fix the numbers" UI, By-kind-of-shot card |
| Production counting unchanged (`verify-production-unchanged.mjs`, base 8db1515) | 55 files compared byte for byte (src/lib/vision, public, frozen evaluation inputs, camera-stage, shooting.ts, goals.ts): 0 changed. `shooting-hub.tsx` changed only in how a set starts and what the saved screen shows: none of its 13 removed lines touch counting. |
| Frozen baseline reproduction | see section 11 |

Tested library cases: duplicate saves, resume then save again, saving the same set twice, racing saves, plain tap after a tracked result, skip vs
tracked, closed workout, other player's workout, deleted shots, goal clamping, manual adjustment keeping the original, household link override,
and every real seeded shooting drill having an explicit entry.

## 10. Limits (said plainly)

- **The Supabase adapter was not exercised against a live database.** The rules are tested through an in-memory store with interleaved async
  calls; in the browser the server actions were answered by the test. Please run one workout end to end on the phone (below).
- One-row-per-entry is enforced by the code, not by a database constraint. An optional unique index on (session_id, workout_drill_id) would make
  it hard-enforced; it is only recommended, not applied, because it needs a clean-up of any existing duplicates first and touches production data.
- Re-tracking replaces the drill's result; the older shot set stays in shooting history under the drill's name. A drill's label will show up in
  free-shooting label suggestions.
- Camera calls that the player undid or reversed before saving are counted (`flipped`) but individual removed false detections are not recorded separately.
- No iPhone validation has been done for any of this (desktop browser at iPhone size only). Live camera counting during a drill is the same
  pipeline as free shooting and has the same limits.
- Not claimed: anything about footwork, game speed, defenders, decisions, or transfer to games.

## 11. Frozen baseline and regression

Reproduced with `run-baseline.mjs --id phase10-check` and compared against the frozen `baseline-v0.json` with `compare.mjs`: no change in any area (V4 paired on the 30 fps and 15 fps shot sets: 0 gained, 0 lost; out-of-sample detection recall 66.7% to 66.7% and precision 100% to 100%; localization median 0.81 px both; inference 119.3 ms both). As expected, since no counting file changed (section 9). The temporary report files were deleted; thresholds, baseline-v0 and datasets.lock are byte-identical.

## 12. Recommendation for expanding

1. **Try this one workflow first (Free Throw Reset or Elbow Pull-Up inside a real plan day) on the phone for a week.** Look at how often the
   count needed fixing ("Fix the numbers", "you changed" counts on the card): that is the real accuracy signal for drills, not the baseline.
2. Then all six eligible drills are already live; no more drills need code. New shooting drills get an explicit entry in `drill-shooting.ts`.
3. Add Film Room lessons (and your own video links) for Elbow Pull-Up, Catch-and-Shoot, Free Throw Reset and Beat the Clock in the Film Room; the
   drill cards pick them up with no code change.
4. Movement, change-of-direction and decision drills only if you add drills that are really those; then fill in their categories. Even then the
   camera counts shots; it does not see the movement or the decision.
5. Add the unique-index migration once the first weeks of real data show no duplicates to clean.
6. Keep the cross-session patterns and calibration experimental as decided.

## How to try it on the phone

1. Open your normal workout for a day that has a shooting drill (for example one with Free Throw Reset). The drill card shows **Track with Camera**.
2. Tap it, then **Start the camera**, prop the phone up, shoot, review, save.
3. Tap **Back to your workout**: the drill shows your result, with **Fix the numbers** if the count is off.
4. Check the workout's history afterwards shows one result for that drill, and that finishing the drill without the camera still works.
