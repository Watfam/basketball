# Camera shot counting: build plan

Status: plan, 2026-10-05. Design review: https://claude.ai/code/artifact/442385d2-5e7b-40ff-844c-47888d53265c
Evidence behind every number below: `training/README.md` (what was tried, what failed), `training/labels/`.

## 1. What Matt decided

- One front door chooses who is using the app: a player or the coach. Nothing asks again later.
- Players see real basketball numbers (makes, shots, make %, best run, trends). Camera accuracy is detail, one tap down on the summary, and prominent only for the coach.
- Replay clips: yes. Live camera view while counting: yes. Tap the rim at the start of every session: yes, always.
- Coach profile can run test sessions and calibration. Coach test sessions are **kept** (as a history), and never count toward a player's totals.
- Players can delete their own sessions. Past runs done in error or just playing around must be removable.
- Coach home: roster first, camera accuracy second.
- Direction: always player-focused. Quality over build time, $0 running cost (no paid APIs, no server-side video).

## 2. Where we actually are

**Proven offline, on recorded clips of Matt's driveway hoop, one shooter at a time:**

| Test | Result |
|---|---|
| Ball detector finds the ball, kids clip never trained on | about 90-95% of what it boxes is a real ball |
| Ball detector recall (balls it finds) | LOW and unmeasured properly: roughly 1 visible ball in 3 on the kids clip, strongest at and around the rim |
| Make/miss rule v1, unseen clip 4839 | 22 of 28 shots (79%) |
| Make/miss rule v1, unseen clip 4840 | 26 of 32 (81%) |
| Make/miss rule v2, unseen clip 4840 | 28 of 32 (88%); designed from 4836 and 4839, one 32-shot test, so the range is roughly 71-96% |

**Known wrong in a recognisable way:** a ball that bounces off the rim and drops straight down beside the net looks like a make from one camera; a rebounder's hands under the net can hide a real make; a slow roll-in can outlast the waiting window.

**Not yet proven at all, and the plan is built around these:**
1. Whether a phone can run this live for a whole session without slowing down. Measured so far: CPU, live camera, 2 minutes: 23 fps falling to 18 fps (heat), no crash. Never measured with the real ball model, a 6-10 minute session, or multiple threads on the phone.
2. Whether the live pipeline gives the same answers as the offline one (it has never run end to end).
3. How well it does on a hoop, light or shirt it has not seen. All footage is one driveway.

**Parked on purpose:** the GPU path (the page was killed in 12 of 12 phone trials; cause never found), shot location and 2-versus-3 calls, the black ball (almost no training examples), other gyms.

## 3. What the app has today (so we build on it, not around it)

- `src/app/page.tsx`: lists the household's players and the user's teams. This is the existing "pick a person" screen.
- Shooting: `/players/[playerId]/shooting` (manual make/miss counter, local-first, `syncShotSession` upserts on `(session_id, seq)`), `deleteShotSession`, `ShotStrip` tap-to-flip correction. Table `hoops.shot_sessions` and `hoops.shots` already store `detected_made` next to the final `made`, with `source` of manual or camera (migration 0019).
- `src/lib/vision/`: `yolox.ts` (pre/post-processing, tested in Node), `engine.ts` + `detector.worker.ts` + `detector.ts` (ONNX Runtime Web in a worker, CPU path, threads option), `roi.ts` (hoop window and motion gate, tested).
- `/lab/detector`, `/lab/diagnose`, `/lab/survival`: benchmark pages. `use-wake-lock.ts` with the silent-video fallback, `alerts.ts` (make/miss blips), `use-local-draft.ts`.
- Site-wide COOP/COEP headers are on (for threads). Anything cross-origin added later (an embedded video, an external image) will be blocked.
- Teams: `/teams/[teamId]/...` with its own bottom bar. The coach profile keeps that bar and gains a Camera lab entry.

Gaps the design needs:
- `engine.ts` hard-codes 80 classes and COCO ids; the ball model has one class (`NUM_CLASSES` in `engine.ts:40`, class list at `engine.ts:285`). The offline tools already decode with 1 class.
- The lab asks the camera for 1280x720. The model was trained on **native 1080p** windows of 416 px. At 720p the ball shrinks by a third and is a different size from anything it saw. The live camera must ask for 1920x1080 and cut the 416 px window out at full resolution.
- Nothing records replay frames. Nothing remembers the chosen profile. No `is_test`, no soft delete, no calibration table.
- No offline caching: with no signal at the driveway, the model and runtime (about 18 MB) must already be on the phone.

## 4. Data model (migration 0020)

All changes are additive; existing sessions keep working.

`hoops.shot_sessions` gains:
- `is_test boolean not null default false`: coach test sessions. Kept, listed under Camera lab, excluded from every player total and chart.
- `deleted_at timestamptz`: soft delete. A deleted session disappears from lists and totals at once; Undo clears it. Rows deleted more than 10 days ago are removed for good (Matt, 2026-10-05). Done by `hoops.purge_deleted_shot_sessions()`, which the shooting history page calls; no scheduled job.
- `rule_version text`, `model_version text`: which counting software produced the camera calls (needed to compare accuracy before and after an update).
- `drill text` (spot-up, free throws, game shots) alongside the existing `label`, so progress can be filtered. Keep `label` for free text.
- `rim_x numeric, rim_y numeric`: where the rim was tapped, as fractions of the frame. Diagnostic only.

`hoops.shots` gains: `flagged boolean` (was "worth a look" when counted), `added_by_hand boolean`, `t_ms int` (time into the session; the replay lookup key). `detected_made` and `made` already exist; "corrected" is `made <> detected_made`.

New `hoops.calibration_runs`: `id, created_at, created_by, hoop_label, rule_version, model_version, shots int, agreed int, camera_makes int, true_makes int, per_shot jsonb` (camera call and recorded truth per shot). Spot checks write rows of the same shape with a `kind`.

Row-level security follows the existing household policy. **Be clear about what that means:** the kids share Matt's login, so "Player A can only delete Player A's sessions" is a rule in the app screens, not a security boundary. Anyone using the phone can open any profile. That is fine for a family; it is worth knowing.

## 5. Phases, in order

Sizes are rough: S under a day, M a few days, L a week or more of focused work. Order matters because each phase can fail and change the next.

### Phase A. Prove the live pipeline on the phone (before any screen work)  [M]
Question: can the real thing run live, long enough, and agree with the offline numbers?
- A1. 1-class ball model in `engine.ts` (`NUM_CLASSES`, class ids, reuse the tested decoder). Ship `ball-5.onnx` (3.6 MB, built from Apache-2.0 YOLOX-nano) in `public/models`. Decide where the file lives and whether the repo is private (weights are trained on footage of minors; the weights contain no images, but Matt should approve committing them).
- A2. Live capture at 1920x1080; cut the 416 px hoop window around the tapped rim with `drawImage(video, sx, sy, 416, 416, ...)` so only 416x416 pixels are read per frame. Fall back to 1280x720 and flag the session if 1080p is refused.
- A3. File-replay parity test in the lab: feed the recorded clips 4836, 4839, 4840 through the phone pipeline (the lab already has a "saved clip" source) and require the same detections and the same make/miss calls as the offline Node run, within a few percent. This catches resize, colour and timing differences before any live shooting.
- A4. Soak test on Matt's iPhone: 10 minutes, live camera, real model, 1, 2 and 3 threads, with and without the motion gate (`roi.ts`: skip the model while nothing moves near the hoop). Record fps and temperature behaviour per segment, as the lab already does.
- **Pass:** at least 15 fps sustained for 10 minutes; no page kill; parity within tolerance.
- **If it fails:** the motion gate, a smaller input, or accepting a lower frame rate are the options; below about 10 fps a fast shot is only 2-3 frames at the rim and the rule stops working. In that case the camera mode would be "record now, count afterwards" instead of live counting, and the live screen would change.

### Phase B. The counting engine as tested code  [M]
- B1. Port rules v1 and v2 (`training/tools/40-score-rules.py`) into `src/lib/vision/shotRules.ts` as a **streaming** state machine: it sees detections one frame at a time, opens a shot when a ball enters the rim zone, and decides after the waiting window (40 or 70 frames, so a call arrives 1.3-2.3 seconds after the shot).
- B2. Fixture tests: the saved detections of 4836, 4839, 4840 (`training/work/dets5-*.json`, regenerated by the tools) must reproduce exactly the python scores (23/24, 22/28 and 28/32 for the rule versions). Tests run in Node with no browser.
- B3. Define and measure the "worth a look" flag. Candidate triggers: ball touched the rim zone and then dropped within about 30 px of the net edge; ball not seen at all after the zone; person detected under the net. Acceptance: report how many of the known wrong calls on the three clips the flag would have caught and how many correct calls it would have flagged. Aim: catch most errors while flagging under about 25% of shots, otherwise the "check three shots, not twenty-eight" promise in the design is false.
- B4. Add a minimum-confidence and a "no ball seen" outcome so a missed detection becomes a **gap** (shot not counted, visible in review) and never a silent miss.

### Phase C. Profile front door and navigation  [M]
Independent of A and B; can start in parallel.
- C1. Profile store: the choice persists on the phone (localStorage, plus a cookie so server pages can default to it). `/` becomes the "Who's playing?" screen: household players, plus a Coach entry if the user owns a team.
- C2. A signed-in app shell with the new bottom bar (Home, Train, Shoot, Film, Me) for player profiles. The Coach profile keeps the existing team bar and adds Camera lab. The mockup showed the player bar on the coach screens; that was a shortcut, not a decision.
- C3. A profile switcher (the avatar on Home) that is the only place to change profile. Every screen reads the active profile and never asks again.
- C4. Existing deep links (`/players/[id]/...`) keep working and also set the active profile.
- Open decision, see section 7: how much of the existing player hub moves under the new bar.

### Phase D. Shoot flow and the live screen  [L]
Depends on A and B for the live count; the setup and tap-counter paths can ship earlier.
- D1. `/shoot`: profile shown (not asked), camera or tap counter, drill, stop-at. The tap counter is the existing manual counter, unchanged.
- D2. Aim: landscape, steady and light checks, **rim tap every session**, 10-second start. Steady check uses `devicemotion` where available; light check uses mean brightness and contrast of the hoop window.
- D3. Live screen: score and dots large (readable from the three-point line), eye toggle for the tracking overlay, re-aim, pause. Blips for make and miss reuse `alerts.ts`. Wake lock with the silent-video fallback (already proven on the phone). A visible state when the hoop is lost, the ball model is slow, or the phone is hot.
- D4. Replay recording, see Phase E.
- D5. Local-first saving through the existing `syncShotSession` path, extended with the new columns. A session that dies mid-way is recoverable from the phone on the next visit (the survival-test breadcrumb pattern).

### Phase E. Replays  [M]
- E1. Keep a rolling buffer of the hoop window (not the full frame): about 15 frames per second, 320 px, JPEG at quality 0.6, roughly 10 KB each, so about 0.5 MB for the 3-second clip around each shot. A 100-shot session is about 50 MB in IndexedDB, not in memory.
- E2. Replays exist **on the phone only**. They are deleted when the session is saved or discarded. Nothing is uploaded, ever. This also covers the point that these are children.
- E3. Review screen: scrub, quarter and half speed, Make / Miss / Not a shot, Add a shot (no clip), Next to check (flagged shots).
- Risk: Safari can clear IndexedDB for sites that have not been opened for a week unless installed as a home-screen app. Matt uses the home-screen app, so it applies less, but unsaved replays could be lost; the review screen should say so.

### Phase F. Stats, delete, summary  [M]
- F1. Stats page from saved sessions per player: make %, makes, shots, sessions, best day, best run, shots per minute, chart by session, filter by drill. Test sessions excluded.
- F2. Delete: Manage mode, confirm, soft delete with a six-second Undo; deleted sessions leave every total at once. Players delete their own; the coach can delete any.
- F3. Summary after a session: makes out of shots and make % lead; best run, longest miss streak, shots a minute; today against that player's own average for the drill; camera details behind one tap.
- F4. Home card with season make % and makes out of shots.

### Phase G. Coach profile and Camera lab  [M]
- G1. Coach home: roster first (season make % per player), camera accuracy second, as Matt chose.
- G2. Run a test session: same Shoot flow, `is_test = true`, kept in a history under Camera lab, excluded from player totals.
- G3. Calibration: shoot a set with the camera counting, enter the true results in order, see agreement and any over-counted makes, save to `calibration_runs` with rule and model versions. The matching is the one-to-one comparison already written for the clips (`training/tools/38-align-score.py`); a session whose shots do not line up with the written list gets the same dynamic-programming alignment, labelled as flattering.
- G4. Spot check: draw a random sample of recent real sessions and judge each from its replay. Only works while replays still exist, which is until the session is saved; for saved sessions use the camera's own record only. This limit should be shown, not hidden.

### Phase H. Fresh-clip exam and live trial  [S, but it decides the release]
- H1. A third fresh clip, new shirts, narrated and written down, scored offline with rule v2 exactly as the exam procedure in `training/README.md` describes. Nothing is tuned afterwards.
- H2. A live trial on the phone: Matt shoots about 50 shots with the camera counting live, writes his own record, and the Calibration screen scores it.
- **Release bar (proposed, Matt to confirm):** at least 85% of shots right on both, and no more than 10 percentage points between the offline and live numbers. Below that, ship the tap counter only and keep the camera in the coach's lab.

## 6. What could stop this

1. **Phone speed or heat (Phase A).** The biggest unknown. A 20% slowdown over two minutes was measured; ten minutes was not.
2. **Recall.** The detector misses many balls that are not near the rim. The rule only needs the ball near the rim and below the net, which is where it is strongest, but a shot whose ball is never seen is a gap. How often that happens live is unmeasured.
3. **The rim-bounce error is built in.** With one camera, 80-90% per shot is the expectation, not 99%. The screen is designed for that (flags, replays, one-tap fixes). If the flag in B3 cannot catch most errors, the fix-up cost is too high and the design needs rethinking.
4. **Generalisation.** One driveway, one afternoon of light at a time, a handful of shirts. A different time of day, an overcast day, an older player's arc, or a bumped stand can change results. The calibration lab exists so this is noticed rather than assumed.
5. **Safari on a phone is a harsh runtime.** The page was killed 12 of 12 times on the GPU path for reasons never found. The CPU path has been stable in every phone test so far; anything new on the phone (threads, recording) needs its own soak test.
6. **Replays and children.** Everything stays on the phone and is deleted on save. If that rule ever changes, it needs Matt's explicit decision.

## 7. Matt's answers (2026-10-05)

1. Commit the trained ball model to the repository: yes. (It lives on Matt's Mac; it goes in `public/models/ball-5.onnx`.)
2. How much of the player hub moves under the new bottom bar: as much as makes a clean, helpful UI.
3. Deleted sessions are removed for good after 10 days.
4. Coach test sessions use a plain Test profile, never a player's name.
5. Third fresh clip: no earlier than 2026-10-06. Older film exists from a different, more zoomed-in angle with no spoken make/miss; it is not a fair exam for this setup.

## Progress (branch `camera-counting`)

- A1 done: `public/models/ball-5.onnx` committed (Matt, 2026-10-05); loads in the app engine, output [1, 3549, 6].
- A2 done in the lab: 1080p request, 416 px window at full resolution with the rim at (192, 190) as in training, tap to re-aim, flagged when the camera refuses 1080p.
- B1/B2 done: `src/lib/vision/shotRules.ts`, `npm test`. Matches `40-score-rules.py` call for call on 150 generated sessions, and reproduces the exam scores exactly on the real 4839/4840 detections (`training/fixtures/`). Holds at 15 fps, mostly at 10, loses shots below (training/README.md).
- 0020 written, checked on Postgres 16, and run on Supabase by Matt (2026-10-05).
- F2 done: delete with Undo and Manage mode.
- F3/F4 done, F1 partly: summary adds longest miss streak, shots a minute and today against the player's own average for that label; Shoot page has a season block (since Aug 1: make %, makes of shots, sessions, best session of 10+ shots); home card adds the season line. Drill filter not yet: labels still group the history.
- F1 done: Drill filter on the Shoot page (All, then the player's own set names, most used first): season block, best session, trend line (one drill only), By drill breakdown (All) and recent sessions all follow it. History shows the goal ("Make 10 ✓"). Migration 0021 stores goal kind, target and reached. The structured drill column (0020) is left unused: set names already are the drills.
- D1 partly: goals (Matt, 2026-10-06): None, Shots (25/50/100), Makes (10/25/50), Time (3/5/10 min, countdown), In a row (3/5/10, stops at 100 shots), each adjustable; the set saves itself when reached; last 4 setups (name + goal) are one-tap starts; "Shooting as … Switch". Camera choice waits for the phone test.
- C1, C3, C4 done; C2 started: front door "Who's playing?" with Continue as, profile cookie, player bottom bar (Home, Train, Shoot, Film), opening a player or team page sets the profile.
- B3 done (in-sample): worth-a-look flag in `shotRules.ts`, 5 of 6 errors caught, 18% of shots flagged; registered for the third clip.
- G (part): Camera lab at /lab for the coach (accuracy per rule and model version, calibration history), /lab/calibrate scores the last lab run against a written list with the exam matching (tools/38, parity-tested). Detector lab: every-frame mode for saved clips with an aim step, calls kept for calibration. Coach test sessions not yet: they wait for live counting.
- A3 PASSED (2026-10-06): IMG_4840 on Matt's iPhone, every frame, scored 28 of 32 with 18 camera makes and 6 flagged, identical to offline.
- Rule V3 (trial, 2026-10-06): V2 plus "a make that falls past the rim faster than 10.5 px/frame is a miss" (the net slows a real make). In-sample 59/60 against V2's 54/60; registered for the third clip, scored beside V2 in Calibrate. The app still counts with V2.
- A4 first run (2026-10-06): no crash; 20.5 -> 12.1 fps over 10 minutes (heat); 58 shots counted vs 56 real; makes wrong from a backwards rim-size setting. Fixed: two-tap rim measuring, live size warning, 15 fps default, skip still frames. Needs a second soak.

## 8. Suggested order of work

A first (it can end the project cheaply), then B and C in parallel, then F and G (mostly independent of the camera), then D and E, then H. The tap counter and the stats screens deliver value on their own even if the camera never clears the bar.
- Design polish (2026-10-06): front door with avatar profile cards (Overall, season shooting %) and a Coach card, Manage family folded below; coach home at /coach (players with season % and sessions this week, latest calibration with Calibrate / Detector / History, teams), and the coach looking at a player no longer switches the phone's profile; player Home has the avatar switcher, the big Shoot card first and a Me tab in the bottom bar; Shoot setup shows the last-six make % and How to count (Tap counter, Camera soon); Calibrate lets a dot be tapped to flip it.
