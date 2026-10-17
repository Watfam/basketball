# Phase 12: fixed-difficulty benchmarks, the Progress screen, Film Room links, one result per workout entry

Goal: measure improvement in repeatable shooting tests, not reward more shots. Production detection and counting are unchanged; the frozen baseline reproduces with no change.

## 1. The three benchmarks (protocol version 1)

Each is a clearly labelled variation ("Benchmark v1 ...") of an EXISTING drill, as its own entry in one new workout, "Shot Builder — Benchmark Check (v1)". No existing drill, workout, entry or program is changed. The protocol lives in `src/lib/basketball/benchmarks.ts`; a test pins a fingerprint of each protocol, so changing a number or a word fails the tests until it becomes version 2 (and version 1 results are then kept apart, never compared).

| | Free Throw Benchmark | Catch-and-Shoot Benchmark | Beat the Clock Benchmark |
|---|---|---|---|
| Drill (kept) | Free Throw Reset | Catch-and-Shoot off the Pin-Down | Beat the Clock Finisher |
| Skill category (kept) | Stationary | Catch-and-shoot (after a sprint) | Pressure challenge (a clock) |
| Bounded by | 30 attempts (3 x 10) | 30 attempts (2 x 15: 15 right wing, then 15 left wing) | 90 seconds, from the first shot |
| Spot | the free-throw line | two wing spots, marked with tape or chalk the first time, same marks every time | the right elbow, marked |
| Movement | none (a fixed routine, fresh) | start under the rim, sprint off the chair, catch, shoot | shoot, chase your own rebound, return |
| Condition stated before starting | none | who passes: a partner, or yourself (kept apart in comparisons) | none |
| Compared by | share of shots made | share of shots made | share of shots made (makes and attempts shown too) |
| Level | the same for every level | the same | the same |

How the drill definitions shaped them: Free Throw Reset is two shots between blocks at game fatigue, so the benchmark is 30 fresh and says it is not comparable with the drill. The Pin-Down drill text does not say who passes, so that is asked and kept apart. Beat the Clock says "pick one spot" and its variants use clocks of 60, 90 and 120 seconds that grow 5 seconds a week, so the benchmark fixes one spot and one clock that never grows. Right and left wing are floor positions, not shooting hands, so both are used, as you coach it.

What makes a result a benchmark: the workout entry must match the protocol exactly (drill, variant label, prescription, no level targets); an edited or look-alike entry is an ordinary drill. The benchmark's prescription is never stepped up by the program week or scaled by level (tested for every week and level). A benchmark result may only come from a set that was shot for that benchmark (checked by the set's name), so a catch-and-shoot set cannot become the free-throw result.

What is claimed: the camera counts attempts and makes and calls each make or miss; you check them and can fix them afterwards. The spot, the movement and the way the test is run are set by the protocol and reported by you. Footwork, balance, release and decision-making are not measured, and these are practice results, not game results. This text is shown on the start screen and the progress screens.

## 2. Integration with the Six-Week Shot Builder

- `seed_0024_shooting_benchmarks.sql`: adds the workout and its three entries (additive, safe to run twice, stops without changing anything if a drill name is missing or ambiguous).
- `seed_0025_benchmark_days_in_shot_builder.sql` (optional, separate on purpose): adds a **fourth day** to weeks 1, 3 and 6 only, with the benchmark workout (never stepped up; week 6, the lighter week, marked as such). This does change what the program asks for: those three weeks become four days and a player finishes the program only after doing them. If you would rather offer the benchmark as an extra workout, do not run this file; the benchmarks and the Progress screen work either way.
- Verified in a real Postgres loaded with the repo's schema and seeds: every one of the 18 existing program days asks for exactly the same, at all three levels, before and after; every pre-existing row in workouts, entries, drills, programs and program days is byte-identical; 1 workout, 3 entries and 3 program days were added.
- Week of training comes from the program day the workout was started from. A benchmark run outside the program has no week and is labelled so.

## 3. Progress: one place that connects to what already exists

Audit result: the app already had Me (hero, ratings, training load, milestones), Shoot history (by drill, trend, session list), the single-set page with shots and replay, workout history, and the Film Room. So there is no new tab and no duplicate history. New: a **Progress** route under Me (`/players/[id]/progress`), a three-tile strip on Me, and a link row. Structure:

```
Me ─ Progress strip (workouts, shots tracked, benchmarks) ─┐
Me ─ "Progress and analytics" row ─────────────────────────┤
Progress: range chips (4 weeks, 12 weeks, season, all time) + pick dates
  Overview:   4 tiles, each a link; benchmark cards; workouts per week;
              "What this shows"; how the numbers were counted
  Benchmarks: chips per benchmark -> results (touchable chart, plausible range
              on every result, list), first against latest, data quality
              each result -> its workout (/sessions/[id])
                          -> its shots and replay (/shooting/[id])
Existing screens remain the drill-downs: Shooting history, Workout history, Film Room
```

Shown for each result: attempts, makes, percentage, date, week of training (planned benchmark week or an extra run), the plausible range, how it was counted (camera, taps, calls you changed, shots you added, totals changed afterwards, redone), and whether it is a full benchmark. Same-difficulty comparison only: same protocol, same version, same stated conditions; other versions or conditions sit in their own group and are never compared.

Four things kept apart, always on screen: more practice (effort, never improvement), better benchmark results, consistency (described only from four or more full results, never as improvement), and game transfer ("Not measured").

Pre-registered rules for what is called a change (written before looking at any result): the change is first against latest comparable result in the range; the interval is Newcombe's for two proportions; "clear" only if the 95% range stays on one side of zero; under 10 shots in either test: no verdict; a run that is not full (not all attempts, or the clock did not run out) is shown but left out. Consequence, stated on screen: with 30 shots each, only a change of roughly 24 points or more stands out. A 17-point rise, for example 57% to 73%, is reported as "not a clear change". That is the point of the safeguard, and it means most six-week comparisons will say so until there are more shots or more tests.

## 4. Film Room

`fix_0026_film_links_for_shooting.sql` fills `drill_id` for: Playing Without the Ball and Curry: Feet Ready Before the Ball Arrives → Catch-and-Shoot off the Pin-Down; Creating Separation Off the Bounce → Wing Step-Back. Identifiers are looked up by exact title and drill name inside the file, never typed in; each must match exactly one row or it stops and changes nothing; a lesson that already points at another drill is left alone; no web address is read or written (tested: every url byte-identical). The study session Get Open Without the Ball is not linked to a drill (there is no such relationship); the drill card shows it because it contains the drill's linked lessons. On the drill card: the primary lesson, up to two more linked lessons, and the study session. Tested against real rows: before, Catch-and-Shoot had no lesson and Wing Step-Back only a "related" one; after, two linked lessons plus the study session (3 lessons), and Wing Step-Back linked.

Execution-check architecture (nothing scored yet): the tracked result can carry an `execution` block (lesson id, who answered, cues with yes/mostly/no) that is validated, kept through every save and correction, and ignored by everything else. Tested. The cues come from the lesson's existing "watch for" list, which the benchmark start screen and workout card already show.

## 5. Database uniqueness: migration 0023 — prepared, NOT applied

Status: **not applied to your live project.** I cannot sign in as you, and the read-only duplicate check needs your login (row security hides rows from anyone else), so the prerequisite check could not be run against production. Everything below was run against a real Postgres loaded with the repo's schema, seeds and policies.

- Identity: one log row per (workout session, workout entry), only where the entry id exists. The entry already separates "Right wing" from "Left wing" when a drill appears twice. Rows with no entry id (old logs) are outside the index and untouched.
- Effects: one partial unique index; no row is read, changed or deleted; row security untouched; writes to `session_logs` pause for a moment while it builds. The migration never deletes or merges: if any entry has two rows it stops with a message and changes nothing.
- Verified locally: with a duplicate present the guard stopped it, the duplicate stayed, no index was created; on clean data the index exists, is valid and unique with the intended definition; every existing row identical, policies identical, row security still on; running it twice changes nothing; a second row for the same entry is refused (23505) while other entries and entry-less rows are fine; another household and anonymous callers are still refused; the app's saves still work, and four simultaneous saves of one benchmark end as one row; the rollback drops only the index.

Exact safe steps (Supabase dashboard, SQL editor; each file is pasted whole):
1. `supabase/checks/0023_before.sql`. The first result must be **no rows**. If it lists anything, stop and tell me; do not continue.
2. `supabase/migrations/0023_one_log_per_workout_entry.sql` (it stops itself if duplicates exist).
3. `supabase/checks/0023_after.sql`: the index is listed as unique and valid, the row counts match step 1, and the policy list is the same as in step 1.
4. Undo if ever needed: `supabase/rollback/0023_drop_one_log_per_workout_entry.sql`.
Then, in order: `checks/film_links_check.sql`, `fix_0026_film_links_for_shooting.sql`, `checks/film_links_check.sql` again; `seed_0024_shooting_benchmarks.sql`; optionally `seed_0025_benchmark_days_in_shot_builder.sql`. Rollbacks for each are in `supabase/rollback/` and refuse to run if a result would be orphaned.

The app code that is now live works with or without any of these: with none applied, nothing visible changes except the Progress screen (empty states) and the drill-card layout.

## 6. A defect from Phase 10, found and fixed here

Timed drills (Beat the Clock) in the shooting screen were handed a goal in the wrong unit: the screen's time goal is whole minutes (1 to 60), while a drill's clock is in seconds, so a 90-second drill would have run as a 60-minute set. My Phase 10 browser checks used a shot-count drill and missed it. Fixed: a drill clock is now kept in seconds on the set itself, apart from the minutes goal (so saved goals and history are unaffected), it counts down in seconds, ends the set when it runs out, and whether it ran its full length is recorded. Checked in the browser (a 10-second clock ends by itself and reports complete; ending early reports not complete). Any 60-, 90- or 120-second drill tracked with Phase 10 code on your phone would have misbehaved; the fix is live.

## 7. Evaluation: before and after

| Check | Before | After |
|---|---|---|
| App tests | 233 | 270 pass (37 new: protocols, seeds, migration text, pinned versions, analysis, ranges, rows, save rules) |
| Harness / experiment tests | 47 / 101 | 47 / 101 |
| Real-Postgres, persistence and races (`run.mjs`) | 45 of 45 | 45 of 45, now using the real migration file |
| Real-Postgres, Phase 12 (`run-p12.mjs`) | n/a | 64 of 64 |
| Live query shapes accepted by the real project, read only (`probe-live.mjs`) | 13 | 20 checks (the schema columns are checked in one check per table), including the Progress query and the study-session query |
| Browser, iPhone size (`benchmarks-e2e.mjs`) | n/a | all pass |
| Frozen baseline | reproduced | reproduced, no change in any area; thresholds, baseline and dataset lock untouched |
| Production counting files | identical | 55 files byte-identical to the end of Phase 9; none of the hub's removed lines touch counting |
| Lint, types, production build | clean | clean; `/players/[id]/progress` builds |

The ten evaluation items: protocol consistency (pinned fingerprints, seed vs protocol, fixed prescription at every week and level); weeks 1, 3, 6 (seed adds exactly those; results read back as weeks 1, 3, 6); camera result attaches to the right benchmark (one row per entry, wrong-set refused, other household refused); manual corrections (kept, original kept, survive a re-save); repeated saves and recovery (three duplicate saves, four simultaneous saves, redo counted once, offline retry from the earlier phase); same-benchmark comparisons (first against latest, ranges, sparse, large); incompatible versions rejected (version 2, unknown protocol, different conditions, short run, unfinished clock); Film Room linkage (before and after, idempotent, ambiguity stops it); migration safety (above); existing workout compatibility (18 days identical, ordinary tracked drills not benchmarks, a benchmark workout done without the camera completes).

Rendering at iPhone size with the CPU slowed 4x: a history of 600 benchmark results and 1,000 more tracked drills draws the newest 40 (the rest one tap away, or by narrowing the dates), 607 elements, a tap shows its detail in 66 to 89 ms after the first. The first version drew all 600 and took 2.4 to 5.4 seconds per tap, which is why it was changed. Page load there was 1.9 s on the development server.

## 8. Safeguards for data quality and uncertainty

Every result carries its sample size and plausible range; counting method and corrections are shown on each result; incomplete, other-version, other-condition and redone results are flagged or separated; volume and workouts are labelled effort; a verdict needs the range to clear zero; consistency is described only from four results; game transfer is "not measured".

## 9. Remaining limitations

- **No iPhone validation of any of this.** Simulated and desktop-browser tests only. Live camera counting during a benchmark, the 90-second clock on a real phone, and a full benchmark day need a real run.
- The migration, the seeds and the film fix are **not applied** to the live project; the live duplicate check has not been run. Whether your Film Room has other edits is unknown to me.
- Persistence was tested through the app's real save code against a real Postgres with row security, with PostgREST's request parsing replaced by a small translator; the live project's query shapes were only checked read-only and signed out.
- The Me strip and the live Progress page were type-checked and built, and the same view component was exercised in the browser with test data, but the signed-in pages were not opened (they need your login).
- Thirty shots a test will rarely show a six-week change; the screen says so.
- A benchmark taken with a partner and one taken alone are kept apart, so a player who switches loses the comparison.
- Adding the program days changes the program's required days from 18 to 21; the program card's "sessions" figure (weeks x days a week) still reads 18.
- Shot replay appears only where tracking history was kept on that phone.

## 10. Try one benchmark in the app

1. Run the files in section 5 (at least 0024). The new workout "Shot Builder — Benchmark Check (v1)" appears under Train; with 0025 it is Day 4 of weeks 1, 3 and 6.
2. Open it. The first card is the free-throw benchmark, labelled Benchmark v1 with 3 sets of 10. Tap **Track benchmark with Camera**.
3. Read the steps, tap Start, prop the phone up, shoot 30, review the calls, save. Tap **Back to your workout**: it shows your result and whether it is a full benchmark.
4. Open Me, then Progress, then Benchmarks: your result is the first point. It becomes a comparison once you have run it twice the same way.

## 11. Recommendation for the next phase

Run the first benchmark week on real phones before building more. Specifically: check the camera on the 90-second clock with rebound chasing, the wing-to-wing change in the catch-and-shoot test, and how long the whole check takes a kid. Then decide (1) whether 30 shots is enough or the free-throw and catch-and-shoot tests should be 40 to 50 given how rarely 30 can show a change, (2) whether to schedule it with 0025, and (3) only after real results exist, add the Shooting and Training segments to Progress on the same shell, then the player-reported execution check from the lesson cues.
