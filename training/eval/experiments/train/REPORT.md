# Train: libraries, filters and the workout builder

What was built (all of it passes the checks below; none of it has been tried on a phone yet):

* **Train home** (`src/components/train/train-home-view.tsx`): Next up first, then two doors with counts (Workouts, Film room), Build your own, the program, and the family's saved workouts. One line for the suggested lesson.
* **Workout library** (`/players/[id]/workouts/library`): skill, time and level filters as the same swipe-to-close sheets as Shoot setup. Each option shows how many workouts it would show, given the other filters; "Showing N of M"; Clear. A row opens in place to the full workout and its Start button.
* **Film Room library**: search plus Skill, Kind and Who (one pro or trainer) filters; with nothing chosen it is the old browse view, with a filter it is one list in the player's order. Study sessions stays a tab. The door from Train opens the Library tab.
* **Workout builder** (`/players/[id]/workouts/build`): length (15 to 60) and skills draft a session that fits (drills nearest the player's level, in turn across the skills; more sets if the library is short); change sets, reps or seconds, swap, remove, move, add from a searchable list; save, save and start, edit, delete. Times are estimates (3 s a rep, 20 s rest a set, 30 s to set up).

## Run it without saving, keep it afterwards

New workouts have two buttons: **Save** and **Start now**. Start now runs the workout without putting it under Your workouts. Underneath it is a real workout row marked temporary (a session needs one), hidden from the lists and from Today. When the workout is finished, the finished screen asks "Worth keeping?" with **Save this workout**; the same card shows when the session is opened again from history, as long as it has not been kept. If the session is thrown away with nothing done, the temporary workout goes with it. A workout that was never kept stays hidden after a finished session. Editing a saved workout still has Save changes and Save and start. Tested in `db-builder.mjs` (temporary, keep, other family refused, cleanup only when unused) and `keep-e2e.mjs`.

Start now needs migration 0027 too (the workout row is owned by the family), so before it is applied both buttons say so plainly.

## Needs one thing from you: migration 0027

Saving a workout needs `supabase/migrations/0027_custom_workouts.sql` applied in the Supabase SQL editor. It adds `workouts.owner_household_id` and replaces the two blanket read policies with ones that keep the library public and make a family's own workouts private to it. It changes no existing row. After running it, `supabase/checks/0027_after.sql` (read only) shows the column and the policies. Undo: `supabase/rollback/0027_remove_custom_workouts.sql` (refuses while any family-built workout exists).

Until it is applied, everything else works and Save says "Saving your own workouts needs a database update (migration 0027)..." without losing the workout on screen. I never applied it.

## Checks

* `db-0027.mjs` (real Postgres, this repo's schema, migrations, seeds and RLS): the owner saves and starts a workout; another family sees none of it and cannot edit, delete or add to it; nothing is writable on a library workout; signed out sees nothing; the migration is safe to run twice; the rollback refuses while a family-built workout exists and works after; deleting keeps past sessions.
* `db-builder.mjs` (the app's own saving code through the same PostgREST client): save, edit (kept drills keep their rows so past results stay linked), same drill twice, other family refused, library untouched, validation, no half-saved workout, and the not-yet-migrated message.
* Unit tests: `train-library`, `workout-builder`, `film-filter` (16 tests plus the draft cases).
* `train-e2e.mjs` at 390 and 320 px: every screen has no axe A/AA violations, every tap target is 40 px or more, nothing scrolls sideways, filters and counts behave, the builder drafts, edits, swaps, removes, moves, adds, and reports a plain error when it cannot save.
* The camera counting code is unchanged (`verify-production-unchanged.mjs`).

## Known limits

* A family that starts someone else's workout id for its own player is not blocked by the database (the id is a random UUID and the workout stays invisible to it); the same was true of every workout before.
* Editing a saved workout removes entries you dropped; results already logged against a dropped entry lose that link (they keep their numbers).
* The full unit-test run on this machine (Node 20.9) has 15 failing files that use `import.meta.dirname`, which Node 20.11 added; they are not touched by this work.
