# Phase 11, Priority 1: does camera-to-workout saving hold up against the real architecture?

## What was tested, and how

Nothing was written to your live project. There is no way for me to sign in as you (and I would not), so the live database could not be used for writes, and
I did not want to create test players in it. Instead:

| Layer | How it was checked | What it proves | What it cannot |
|---|---|---|---|
| Database rules | A real PostgreSQL 18.4 (the engine Supabase runs) loaded with **this repo's own** `schema.sql`, all 14 migrations and 9 seed files, including every Row Level Security policy and the real seeded workouts ("Shot Builder: Game Speed" and others) | Ownership, constraints, concurrency, real READ COMMITTED behaviour | Only stubs: `auth.users`, `auth.uid()` and the three API roles, which live outside the repo |
| The app's save code | The **real** `drill-store-supabase.ts` and `drill-log-store.ts`, unchanged, using supabase-js's own query client. `shim.mjs` answers each HTTP request it builds by running the equivalent SQL as the signed-in user, in its own transaction, like PostgREST does; it refuses any query shape it does not know | The code does what it should against real tables and policies | PostgREST's own request parsing |
| Live API acceptance | `probe-live.mjs`: the same read queries sent to your real project with the public anon key and random ids (read only, signed out, nothing returned or written) | Every column, the `drills(name, skill_tags)` embed, `workout_sessions!inner(...)` and the `metrics->>type` filter exist and parse on the live schema | Anything about writes or real rows |
| Browser | Headless Chrome at iPhone size against temporary demo routes, server calls answered by the test (`../e2e/`) | The screens and the retry behaviour | Anything on a real phone |

45 of 45 checks pass (`results.json`); the 7 live-schema checks pass (`probe-live.json`); 36 + 3 unit tests; browser: tap flow, result and fix screens, offline resume (10 checks).

## 1. Authenticated player ownership: holds

- Another household, whether it sends its own player id or forges yours, cannot attach a result. The save code is refused with "no workout", because row security hides the workout from them. Signed-out calls are refused the same way. Nothing was written by any refusal.
- At the SQL level, another household cannot insert into, read, change or delete this workout's logs (`42501` and zero rows), and an anonymous caller cannot insert.
- Same household, wrong player in the request: refused. A sibling's shot set, or another household's, cannot be attached to this player's drill.
- Existing behaviour, not caused by this feature: a player's **separate linked login** cannot reach workouts at all, because the workout policy joins through `households`, which only the owner can read. It is the same for every workout feature, and it does not affect you (one parent account). It matters only if you ever give a kid their own login: the workout policies need a fix first.

## 2. Duplicate saves, resume, repeated attempts: hold

- The same shot set saved three times: one row. Resumed after more shots synced, then saved again: the one row updates (9 of 12 in the test).
- A set with no shots, a deleted set, a drill from another workout, a form drill: all refused with a plain reason, nothing written.
- Tracking the same drill again replaces the result with the new set (one row). The earlier set and all its shots stay in shooting history, untouched.
- A plain "done" tap or a skip after a tracked result keeps the tracked result. A skip then a tracked save ends as one tracked result. A double-tapped "done" with no camera is one row.
- Camera-free workouts: saved exactly as before (one plain row, no tracking block). Legacy rows (no entry id) and other entries' plain rows are left byte-for-byte as they were. The tracked-result reader ignores every legacy shape.

## 3. Manual corrections: hold

Fixing the numbers keeps the first saved numbers; saving the same set again does not undo your correction; putting the original numbers back clears the "changed" note; makes above attempts and fractions are refused; another household cannot correct it; a drill with no tracked result is refused. A correction after the workout is finished is allowed (so you can review later); a late *save* is not (below).

## 4. Is the missing unique constraint a practical race? Yes, briefly. Never for the final data.

Six mixes, 40 trials each, real parallel connections, with a reader polling the workout's rows every millisecond:

| Mix (no constraint, current code) | Rows after | Lost tracked result | Failed saves | A reader saw duplicates | Longest |
|---|---|---|---|---|---|
| Same set saved twice (finish + retry) | always 1 | 0 | 0 | 40 of 40 | about 110 ms |
| Same set saved three times | always 1 | 0 | 0 | 40 of 40 | about 130 ms |
| Tracked save + plain "done" at once | always 1 | 0 | 0 | 0 of 40 | none |
| Double-tapped "done" (no camera) | always 1 | 0 | 0 | 40 of 40 | about 130 ms |
| Two different sets, same drill, at once | always 1 | 0 | 0 | 40 of 40 | about 120 ms |
| Tracked save + skip at once | always 1 | 0 | 0 | 0 of 40 | none |

So the race is real: simultaneous inserts both succeed and a reader can see two rows for about a tenth of a second. The code's clean-up always settles it on one row (the newest row is never deleted by anyone, so one always survives), and the page already reads logs by entry so a momentary duplicate changes nothing you would see. These mixes force simultaneous starts, which is much rarer than real use; the likeliest real cause (finish and the app-open retry firing together) is now also collapsed into one request inside the phone.

What a constraint would still add: if the server process dies between the insert and the clean-up, a duplicate can stay until that drill is saved again. Duplicates would also be double-counted in "By kind of shot" until then. I could not make this happen by waiting; I know it is possible from reading the code.

With the index (now `supabase/migrations/0023_one_log_per_workout_entry.sql`, prepared in Phase 12 and **not applied to the live project**; see ../BENCHMARKS.md for the steps) the same 240 trials: always 1 row, no reader ever saw a duplicate, no save failed. The code now treats a unique violation as "someone else got there first" and merges with their row instead of failing (tested in memory and in real Postgres). The migration refuses to run, changing nothing, if any entry already has two rows.

**Recommendation:** apply it, after this read-only check in the Supabase SQL editor (it only reads):

```sql
select session_id, workout_drill_id, count(*) from hoops.session_logs
where workout_drill_id is not null group by 1, 2 having count(*) > 1;
```

No rows: apply the migration. Rows: tell me, they are old double-taps and need a decision before any index. Until then, nothing is at risk.

The same pattern exists in the older `startWorkoutSession` (select then insert, no constraint: a double-tap on "Start workout" can create two in-progress sessions). I read this but did not test or change it.

## 5. Offline synchronization: one real gap found and fixed

The earlier version retried a result that could not be saved only on the **shooting** page. After "Back to your workout" that page is gone, so the retry never ran, and finishing the workout first would have made the late result refused as "workout already finished", losing it from the workout (the shots would still be in shooting history). Fixed:

- The workout screen now retries when it opens, when the signal returns, and when the app comes back to the foreground; the result appears on the drill without leaving the workout.
- "Finish workout" waits for a result that is still saving and refuses, with a plain reason, if there is still no signal. "Cancel" no longer throws the workout away while a result is waiting.
- "Back to your workout" waits a moment ("Saving to your workout…") so the workout screen opens already showing the result.
- Finish and the app-open retry share one request for the same set.

Verified in the browser (`e2e/offline-resume-e2e.mjs`, 10 checks), and the database side of "attach after the signal returns" is the duplicate-save case above (safe to repeat).

## 6. Production behaviour preserved

Tracked results are stored in the existing workout log with no migration; camera-free logging is unchanged and has a fallback to the original insert (which now also accepts a unique violation as success). Production counting files are byte-identical to the end of Phase 9 (`verify-production-unchanged.mjs`: 55 files, 0 changed; none of the removed lines in `shooting-hub.tsx` touch counting). 233 app tests, 47 harness tests and 101 experiment tests pass; lint, type check and build are clean.

## 7. Still needs a real iPhone (not validated)

- A full workout on the phone against the live project: Track with Camera, camera counting, save, Back to your workout, Fix the numbers, finishing the workout. Everything above is a faithful stand-in for the database and server, not your live project.
- Real signal loss: airplane mode during the save, then reopening. The browser test simulates the failure, not a phone losing signal.
- Camera behaviour during a drill (speed, framing, battery) is the same pipeline as free shooting and has had no iPhone validation.
- That the deployed project has the policies this repo says it has (the probe confirms columns and query shapes, not policies). The duplicate check query above also needs your login.

## Rerun

```
cd <a temp folder> && npm i embedded-postgres pg
PGTEST_MODULES=<that folder>/node_modules node training/eval/experiments/camera-in-training/db-validation/run.mjs --trials 40
node training/eval/experiments/camera-in-training/db-validation/probe-live.mjs      # read only, needs .env.local
```
