-- PROPOSAL, not applied to the live project and deliberately NOT in supabase/migrations.
-- One workout log row per workout entry within a workout session: makes the rule the app already follows a database guarantee.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
--
-- Safe to run only on data without duplicates. The guard below stops with a clear message instead of changing or deleting anything.
-- Check first (read only):
--   select session_id, workout_drill_id, count(*) from hoops.session_logs
--   where workout_drill_id is not null group by 1, 2 having count(*) > 1;

do $guard$
begin
  if exists (
    select 1 from hoops.session_logs
    where workout_drill_id is not null
    group by session_id, workout_drill_id
    having count(*) > 1
  ) then
    raise exception $msg$session_logs already has more than one row for some workout entry; resolve those first$msg$;
  end if;
end
$guard$;

create unique index if not exists session_logs_one_per_entry
  on hoops.session_logs (session_id, workout_drill_id)
  where workout_drill_id is not null;
