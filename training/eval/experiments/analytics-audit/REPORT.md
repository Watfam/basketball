# Phase 14: player-experience validation and release readiness

No new features beyond narrow fixes. Counting (ball-6, V4, the hoop window, shot counting, the frozen baseline) is unchanged: 55 strict files compared byte for byte, 0 changed.

Files: `PREREGISTRATION.md` (criteria written before any simulation), `simulate.mjs` and `results-before.json` / `results.json` (the audit), `p14-e2e.mjs` (browser: phone question, empty states, touch targets, accessibility), `link-audit.mjs` (every in-app link points at a real page), `demo-pages/` (temporary routes, not shipped), `../camera-in-training/db-validation/check-p14.mjs` and `supabase/checks/p14_integrity.sql` (live data check).

## 1. Production database verification

**What I could and could not do.** The deployed app is not the database. Row security hides workouts, drills, logs, indexes and catalogs from the public key, and I never sign in as you, so I cannot read the live index list or any row. I did not apply anything.

| Check | Result |
|---|---|
| Live schema accepts every column and query shape the app uses (read-only, no sign-in, random ids), 20 checks | all pass (`db-validation/probe-live.json`, run today) |
| Film Room lessons readable by the public key | yes, with their drill links (nothing else is readable) |
| Is migration 0023 applied (unique index `session_logs_one_per_entry`)? | **not verifiable from here. You said "All good", but I never saw the confirming row.** One query below settles it |
| Benchmark results, workout records and shot history reference the correct player and drill | **not verifiable from here.** The query below checks it; I tested the query itself |

**The query** is `supabase/checks/p14_integrity.sql` (read only, one result table, 20 rows, each marked ok / LOOK / info). It checks: the 0023 index exists and is valid and partial; no workout entry has two log rows; every log's drill is the drill of its workout entry; every entry belongs to the session's workout; every tracked result points at a shot set that exists, belongs to the same player, is not deleted, and agrees with its numbers unless you corrected them; makes never exceed attempts; every shot row belongs to the same player as its set; set totals match their shots; every benchmark result sits on the right benchmark entry (drill name and variant); the benchmark workout, its three entries and its weeks 1, 3 and 6 exist; and how many benchmark drills have a Film Room lesson linked directly.

**How I know the query is right.** `check-p14.mjs` runs it against a real PostgreSQL 18 loaded with this repo's schema, seeds and the 0023 file: silent on clean data, flags a missing index (row 1), and flags each of 11 kinds of wrong link when I plant them (wrong drill, entry from another workout, missing shot set, another player's set, a result that disagrees with its set, set totals that disagree with their shots, makes above attempts, a shot belonging to another player, a benchmark filed under the wrong entry, a result with no entry id, two rows for one entry). It correctly stays quiet for a deleted set (an info row) and for a result you corrected. 17 of 17 pass.

**Prerequisites if row 1 says LOOK:** run `0023_before.sql` (returns no rows), then `0023_one_log_per_workout_entry.sql`. It stops without changing anything if a duplicate exists. Rollback is `rollback/0023_drop_one_log_per_workout_entry.sql`. I will not run any of it; it needs your approval and your login.

**Found while reading the code, not a database fault:** deleting a shot set (Shooting history) marks it deleted, but a workout result that used that set keeps its numbers and still counts in Progress. Its "Every shot" link then opens a "not found" page. Row 11 counts how many such results exist in your data. Not fixed: it needs a change to a signed-in server page I cannot exercise.

## 2. Analytics correctness audit

Method: read every rule that makes a player-facing statement, then simulate what each says when **nothing has changed**, using the app's own functions (3,000 trials, seeded). Day-to-day variation (SD 0, 3, 5 points) is an assumption I varied; no real data about it exists yet.

### 2.1 Statement by statement

| Statement | Source | Sample size | Comparable conditions | Method | Missing data | Uncertainty shown | Wording problem found |
|---|---|---|---|---|---|---|---|
| "Clear" improvement or decline (benchmark) | tracked result in the workout log (camera or taps, with your corrections) | 30 and 30 (timed: 20 to 45); at least 10 each | same protocol and version, same stated conditions, full runs only (all attempts, or the clock ran out); redo and corrections flagged | Newcombe interval for a difference of two proportions | under 10 shots: "too few"; no conditions recorded: grouped apart; 0 attempts: no percentage | range, and the size of change that would stand out | **Before: at least one false "Clear" on 27% of screens (41% with 5-point day-to-day variation).** See 2.2 |
| "Not a clear change yet" | same | same | same | same | same | "only a change of about N points would stand out" | "More full runs settle it" over-promised. Now: "make a real change easier to see", plus: a change of that size is called clear only about half the time; not clear does not mean nothing changed |
| Ordinary drill "is up since last time" with a Clear badge | drill log, same drill and variant | often 8 to 16 | **not controlled**: rest, volume step, spot and level differ between days | same | under 5 attempts left out | same | **Overstated.** A drill is not a controlled test. Now always "Just a fact", with the gap, and "not proof you improved" |
| "Misses lean to the left/right" | saved shot paths, where each ball was seen coming down past the rim's height | at least 8 misses that went to a side | only sets filmed the same way (rim position, zoom, ball size) are pooled | share on one side must be clearly above half (Wilson range) | shots not seen coming down are not counted; coverage line shown | counts shown | **Camera angle turns short or long misses into "side" misses.** See 2.3 |
| "Run the X benchmark" (next) | benchmark runs and dates | not statistical | n/a | never run, then unfinished, then 21 days stale, then fewest full runs | an unfinished run was counted as "never run" | says why | **Three defects:** suggested a re-test the day after a run; called an unfinished run "not run"; judged "days since" from one condition group only. Fixed |
| "From the elbow: catch-and-shoot 70% against standing still 52%" | tracked drills of two kinds from the same named spot | at least 30 each | same spot only; pooled over the whole range | gap shown only when the two 95% ranges do not overlap (about the 99.4% level for equal sizes, by calculation, not simulated) | spots with too few shots skipped | counts and caveats | acceptable; the "Clear" badge can read as "improved", so the note says it is a comparison of two shots, not a ranking |
| "Results ranged 40% to 70% across 4 runs" | comparable benchmark runs | 4 or more | same | min and max | fewer than 4: not shown | none needed | acceptable: described as a fact, never as progress |
| "N of 3 benchmarks clearly higher", "clearly higher" on benchmark cards | the comparisons above | | | | | | inherits the strict rule |
| Practice volume | tracked drills | | | sum | untracked drills not counted (said so) | | acceptable: always "effort, not skill" |
| Game improvement | | | | | | | never claimed anywhere; "Game transfer: not measured" is stated |

### 2.2 How often "Clear" appears when nothing changed (false clear), before and after

| | before | after |
|---|---|---|
| one comparison, no variation, per direction (limit 3.0%) | 2.4% / 2.8% | 1.4% / 1.5% |
| one comparison, 5-point day variation, either direction (limit 10%) | 8.8% | 5.2% |
| whole screen, any false Clear (limit 15% at 5-point variation) | **27.1% / 33.0% / 40.9%** (variation 0 / 3 / 5) | **6.4% / 9.7% / 14.1%** |
| of which from ordinary drills | 9.1 / 10.7 / 12.2% | 0 (never Clear) |
| whole screen, a false "down" | 11.6 / 13.8 / 17.9% | 3.2 / 4.5 / 7.5% |

Cause: a screen shows up to three benchmarks plus three drills, and the old rule made two comparisons per benchmark and reported "since your first" only when positive (hiding a decline). Each test was fine alone; together they were not. Changes (all narrow, all tested): one planned comparison per benchmark (first against latest, the previous run is context only); the same comparison is reported whichever way it points; "Clear" now needs the 98% range (z 2.33, the smallest level I tried that met the limit; 2.24 gave 16.9%); a middle label "Possible" for a gap that clears the usual 95% range but not the strict one ("looks higher, but it is not certain, run it again"); ordinary drills are facts.

**The cost, stated plainly.** Being stricter means fewer real improvements are called Clear. With 30 shots each and no day variation, a true move from 50% to 65% is called Clear 13.7% of the time (21.1% under the old level); 50% to 70%, 25.9% (33.0%); 50% to 80%, 57.3%. 30 shots is a short test; many real improvements will read "Not clear yet" or "Possible". That is what 30 shots can support, and the screen says how large a change would be needed (about 29 points).

### 2.3 Directional summary

With a camera behind the shooter the lean statement is calibrated (4.9% false at 20 misses, 1.2 to 1.4% at 8; limit 7%). From an angled phone it is not: with misses that are mostly short (0.15 m, an assumption) a 15 degree angle gives a false lean 9.7% of the time at 20 misses (21.8% if misses average 0.3 m short), 30 degrees 18.1% (52.9%), always toward the same side. A short or long ball is seen at an angle as a miss to one side; the app cannot tell. The geometry is a flat model, so these are indications, not measurements of real hoops.

Changes: the sentence always carries that reason unless the player said the phone was straight behind them; if they said it was off to one side, no lean is stated at all (the counts remain); declared "behind" with a real error of about 5 degrees shows a false lean 6.0% of the time (limit 7%).

### 2.4 Next step

Now: never started, then started-but-unfinished, then 21 days stale, then the benchmark with the fewest full runs once 14 days have passed (the program's own spacing); otherwise "Keep going with your plan", with the reason. Before: ran yesterday, was told to run it again; ran 20 of 30 shots, was told it had not been run.

## 3. Mobile interaction test results (iPhone-size Chrome, not an iPhone)

What was tested and how: 58 browser checks in `p14-e2e.mjs`, plus the earlier suites rerun against the final code (shot review and progress, tap flow, result fix, offline resume, benchmarks: all pass). Screens come from temporary demo routes that render the real components with test data, because a signed-in session cannot be created here. **The full chain Today, Training Plan, Film Room, Shooting Drill, Camera Tracking, Save Results, Player Progress, Shot Review was not run end to end on real screens.** What stands in for it:

| Step | Covered by | Gap |
|---|---|---|
| Every in-app link points at a real page (30 distinct links, 43 routes) | `link-audit.mjs` | link correctness only |
| Today, Training Plan, Film Room | links verified; screens unchanged except contrast and a larger "Switch" tap target | not opened signed in |
| Shooting Drill, Track with Camera, Save, Fix the numbers, interrupted session | earlier real-Postgres validation (45 checks) and browser suites (tap flow, result fix, offline resume), rerun and passing | no camera, no real signal loss |
| Player Progress (overview, shooting, kind, drill, benchmarks, one benchmark, mixed data-quality notes) | browser, light and dark | live data never shown; query shapes accepted by the live API |
| Shot Review (watch, compare, where they went), saved on the phone | browser, real IndexedDB | no iPhone; saved shots have no video |
| Reverse navigation | Back goes up one level and keeps the dates; return links only accept paths inside the player's own pages (tested) | |

| Check | Result |
|---|---|
| Touch targets (40 px minimum) | all journey screens pass. **Found and fixed:** "Switch" in the header, the shot-history header and controls (32 to 36 px), set rows, filter buttons, summaries |
| Accessibility (axe-core, WCAG 2 A and AA) on 15 screen states, light and dark | **Found and fixed:** 1 contrast failure on every accent chip (3.9:1 on a tinted background, now darker text), the Play button (see below), histogram bars whose name did not contain their visible count. Now no violations |
| **Play button** | in dark theme the button was dark text on a dark background (1.41:1): two background utilities on one element, whichever the stylesheet lists last wins. It was in the Phase 13 build and screenshots. Fixed (own class) |
| Sideways scrolling | none on any screen, including with Advanced open |
| Empty and missing data | empty history, empty progress, one result, no saved path: plain words, no NaN or undefined. **Found and fixed:** a brand-new player's first card said "Movement and time pressure: not enough to compare yet, Not clear yet"; it now says nothing until there is data, and that footnote always sorts last |
| Long histories | 820 shots, 3 camera setups, 4x slower CPU: switching view 143 to 236 ms. 600 benchmark results and 1,000 drill results: tap to detail 76 to 89 ms after the first, page 3.7 s on a development server with the CPU slowed 4x |
| Manually corrected results | flagged in the result list and left out of nothing silently; shown as "Counted by the camera, corrected by you" |

Needs a real iPhone: section 9.

## 4. Camera setup metadata: recommendation and what was built

**Recommendation.** Two optional questions about the phone, answered by the player, kept on the phone with the saved set, never required, never used for counting, never described as geometry:

1. Where was the phone? Straight behind me / Off to one side / Not sure.
2. Did it move or get bumped? No / Yes / Not sure.

The app already measures framing (where the hoop sat in the picture, zoom, ball size) and keeps sets with different framing apart. It cannot measure the angle to the shooter, which is the one thing that makes short or long misses look like side misses. A person can answer that in a second. Hoop position and zoom are not asked: they are measured, and a person's answer would only be worse.

**What changed because of it** (the only place the answer is used): sets are compared and grouped only when the answer allows (a stated move or a stated difference separates them; no answer never blocks anything, so existing history behaves exactly as before); the side-of-miss sentence follows 2.3. Asked once per saved set or group, in "Where they went", where it matters. Stored in the existing local history record as one optional field; no database change, no new table. A damaged answer is dropped and never loses a set. Tests: 5 new (grouping, comparison, storage, refusal of invalid values, shot rows untouched).

**Not claimed:** that an answer establishes the camera's 3D position, or that "straight behind" means exactly behind (simulated at 5 degrees of error). Sets answered "moved" stand alone, so one bumped set splits its group.

## 5. Player usability findings

| Question | Before | Now |
|---|---|---|
| How did I shoot today? | not on Home; Shooting history, then a set (3 taps) | "Your latest" card first on Progress: the numbers, the same drill last time, counted by camera or taps, links to the drill and the shots (2 taps). Not on Home (see 8) |
| Am I improving on the same drill? | Progress, Shooting, kind, drill (4 taps) | latest card, "This drill over time" (3 taps). Benchmarks say Clear / Possible / Not clear yet; ordinary drills give the gap as a fact |
| What is my strongest shooting skill? | kinds listed side by side, "not ranked" | unchanged on purpose: free throws, catch-and-shoot and timed shots are different difficulty, so a ranking would mislead. **A decision for you:** keep, or show "highest so far" with that caveat |
| What should I work on next? | Next card, plus a KPI tile "Next up: Week N" | Next card no longer re-tests too soon. **Still two signals**: the tile follows planned weeks (1, 3, 6), the card follows what has been run, and they can disagree. Not changed |
| Where can I watch a previous shot? | Progress, result, "Every shot and replay" | same, plus the latest card. The three-way viewer needs the experimental flag and opt-in; for most players saved shots are not available |
| Film Room lesson for my current drill | drill results page and Next card | unchanged; links verified |

Confusing wording changed: "Not a clear change yet" repeated three times on one card (headline, badge, numbers); now the badge says it once. "Possible" is new and needs a plain-words check by a young reader. **I cannot run the 10-second test**: it needs a child with the app, which is for you.

## 6. Fixes made (all with tests; nothing outside the audit)

1. Evidence rules: strict "Clear", one comparison per benchmark, symmetric reporting, "Possible", drills as facts, softer "settle it".
2. Next step: no early re-test, unfinished run, latest run across conditions.
3. First-card noise for a new player.
4. "Your latest" card.
5. Directional summary and the optional phone question.
6. Play button, contrast on accent chips (applied in the Progress, Film Room, drill and navigation screens I could verify, not across the whole app), "Switch" and shot-history touch targets, histogram labels.

## 7. Regression

| | Result |
|---|---|
| App tests | 309 pass (297 before this phase) |
| Harness / experiment tests | 47 / 101 pass |
| Lint, types | clean |
| Production build | compiles; `/players/[id]/progress` present |
| Counting | 55 strict files compared with the end of Phase 9: 0 changed; no counting line removed from the hub |
| Frozen baseline | reproduced, no change: V4 0 gained and 0 lost at 30 and 15 fps, detection recall 66.7% to 66.7%, localization 0.81 px, inference 119.3 ms (desktop) |
| Browser | shot review and progress, phone question and accessibility (58), tap flow, result fix, offline resume, benchmarks: all pass |
| Live database | 20 of 20 schema checks pass (read only) |

## 8. Release readiness

**Ready for normal use** (in production, unchanged, or covered with no phone dependence): counting and the hoop window; workouts and plans; the benchmark workout and its seeds in the database; Film Room links.

**Ready for limited beta (you and your kids, with the checks below)**: Progress (latest card, insights, Shooting drill-down, Benchmarks) and its evidence labels; Track with Camera inside a workout drill, save, fix the numbers, offline resume; the next-step card. Conditions: run the integrity query (row 1 and the LOOK rows) and iPhone tests 1 to 4.

**Still experimental, flags stay off:** saved shot paths and the three-way shot review (flag `hl:session-review` plus retention opt-in; no video after saving); the phone-placement question; cross-session comparison; coaching patterns; calibration; rim warning; history export and import. Release criteria: iPhone tests 5 and 6 pass and the phone question is used on real sets for a week.

**Blocked by missing device validation:** camera speed and framing on the phone, a full signed-in workout, signal loss, haptics, Safari storage persistence (saved paths could be evicted by iOS), VoiceOver, real touch feel, sunlight contrast.

**Data integrity risks:** (1) 0023 unconfirmed, so a double save can briefly leave two rows and "By kind of shot" can double count until the next save; (2) a workout result whose shot set was deleted keeps counting and its shot link dead-ends; (3) results are dated by when the workout started, not finished; (4) a result's numbers can differ from its shot set after a correction (by design, flagged); (5) saved shot paths live only on one phone.

**Performance risks:** none found in the browser at 4x CPU slowdown; the 3.7 s to 4.7 s first load is a development server under throttle, not production; a real phone may differ.

**Known accuracy limits:** a 30-shot benchmark detects only a change of about 29 points as Clear; Possible is not evidence; practice results are not game results; camera counts are corrected by the player when wrong; the side of a miss depends on the phone's position; paths are what the camera saw, not physical flight.

## 9. Remaining iPhone tests (needs you)

See `IPHONE-TESTS.md` in this folder.

## 10. Not done, and why

The Home page does not show the latest-result card (a signed-in server page I cannot exercise); the two "next" signals are not merged; the deleted-set dead end is not fixed; the whole-app contrast sweep is limited to screens I verified; "strongest skill" is a decision for you.
