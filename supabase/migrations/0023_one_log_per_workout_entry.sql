-- ============================================================================
-- Hardwood Lab — migration 0023: one result per workout entry
--
-- A workout session holds at most ONE log row for each workout entry (the
-- workout_drills row, which already tells "Right wing" apart from "Left wing"
-- when one drill appears twice). The app has always written it that way;
-- this makes the database enforce it, so two saves that race can never leave
-- two rows behind.
--
-- Before running: run supabase/checks/0023_before.sql (read only). If it shows
-- any workout entry with more than one log row, do NOT run this file: the guard
-- below stops with a message and changes nothing, and nothing here ever deletes
-- or merges rows. Duplicates are old double-taps and need a decision from you.
--
-- Effects: one partial unique index. Rows with no workout_drill_id (logs from
-- before entries existed) are outside it and stay exactly as they are. No row
-- is read, changed or removed. Row Level Security is untouched.
-- Briefly blocks writes to session_logs while the index builds (a small table).
--
-- To undo: supabase/rollback/0023_drop_one_log_per_workout_entry.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

do $guard$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select 1 from hoops.session_logs
    where workout_drill_id is not null
    group by session_id, workout_drill_id
    having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception $msg$session_logs has % workout entries with more than one row. Nothing was changed. Run supabase/checks/0023_before.sql to list them.$msg$, dupes;
  end if;
end
$guard$;

create unique index if not exists session_logs_one_per_entry
  on hoops.session_logs (session_id, workout_drill_id)
  where workout_drill_id is not null;
