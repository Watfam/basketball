-- ============================================================================
-- Hardwood Lab - migration 0027: workouts a family builds for itself
--
-- Until now every workout was library content: readable by everyone signed in,
-- written only by seed files. A player can now build a workout (how long, which
-- skills, which drills) and save it. A saved workout is a normal workouts row
-- plus its workout_drills rows, so starting it, logging it and reviewing it all
-- work the way they do for the library. The only new thing is who owns it.
--
-- What this changes:
--   * hoops.workouts gets owner_household_id (null for every library workout,
--     which stays exactly as it is). Deleting a household deletes its own workouts.
--   * Library workouts are still readable by everyone signed in. A workout with
--     an owner is readable, writable and deletable only by that household's owner.
--   * The blanket read policies on workouts and workout_drills are replaced by
--     ones that keep the library public and hide other families' workouts.
--
-- What it does not do: no existing row is read, changed or removed, and no
-- library workout can be changed through the app (writes need an owner).
-- Safe to run twice.
--
-- To undo: supabase/rollback/0027_remove_custom_workouts.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

alter table hoops.workouts
  add column if not exists owner_household_id uuid references hoops.households (id) on delete cascade;

create index if not exists workouts_owner_household_idx
  on hoops.workouts (owner_household_id) where owner_household_id is not null;

-- ---- workouts -------------------------------------------------------------
drop policy if exists workouts_read_all on hoops.workouts;
drop policy if exists workouts_read on hoops.workouts;
create policy workouts_read on hoops.workouts for select using (
  auth.role() = 'authenticated'
  and (
    owner_household_id is null
    or exists (select 1 from hoops.households h where h.id = workouts.owner_household_id and h.owner_id = auth.uid())
  )
);

drop policy if exists workouts_owner_insert on hoops.workouts;
create policy workouts_owner_insert on hoops.workouts for insert with check (
  owner_household_id is not null
  and exists (select 1 from hoops.households h where h.id = owner_household_id and h.owner_id = auth.uid())
);

drop policy if exists workouts_owner_update on hoops.workouts;
create policy workouts_owner_update on hoops.workouts for update
  using (owner_household_id is not null and exists (select 1 from hoops.households h where h.id = workouts.owner_household_id and h.owner_id = auth.uid()))
  with check (owner_household_id is not null and exists (select 1 from hoops.households h where h.id = owner_household_id and h.owner_id = auth.uid()));

drop policy if exists workouts_owner_delete on hoops.workouts;
create policy workouts_owner_delete on hoops.workouts for delete using (
  owner_household_id is not null
  and exists (select 1 from hoops.households h where h.id = workouts.owner_household_id and h.owner_id = auth.uid())
);

-- ---- workout_drills: follow the workout they belong to ---------------------
drop policy if exists workout_drills_read_all on hoops.workout_drills;
drop policy if exists workout_drills_read on hoops.workout_drills;
create policy workout_drills_read on hoops.workout_drills for select using (
  auth.role() = 'authenticated'
  and exists (select 1 from hoops.workouts w where w.id = workout_drills.workout_id)
);

drop policy if exists workout_drills_owner_insert on hoops.workout_drills;
create policy workout_drills_owner_insert on hoops.workout_drills for insert with check (
  exists (
    select 1 from hoops.workouts w join hoops.households h on h.id = w.owner_household_id
    where w.id = workout_id and h.owner_id = auth.uid()
  )
);

drop policy if exists workout_drills_owner_update on hoops.workout_drills;
create policy workout_drills_owner_update on hoops.workout_drills for update
  using (exists (select 1 from hoops.workouts w join hoops.households h on h.id = w.owner_household_id where w.id = workout_drills.workout_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from hoops.workouts w join hoops.households h on h.id = w.owner_household_id where w.id = workout_id and h.owner_id = auth.uid()));

drop policy if exists workout_drills_owner_delete on hoops.workout_drills;
create policy workout_drills_owner_delete on hoops.workout_drills for delete using (
  exists (select 1 from hoops.workouts w join hoops.households h on h.id = w.owner_household_id where w.id = workout_drills.workout_id and h.owner_id = auth.uid())
);
