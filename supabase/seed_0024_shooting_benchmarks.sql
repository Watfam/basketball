-- ============================================================================
-- Hardwood Lab — shooting benchmarks, version 1: the workout and its three entries
--
-- Additive. Adds ONE new workout holding three entries. Each entry is a clearly
-- labelled variation ("Benchmark v1 ...") of an EXISTING drill. No existing
-- drill, workout, entry or program is changed, and nothing is scheduled by this
-- file: it is the test itself. Putting it into the Six-Week Shot Builder on weeks
-- 1, 3 and 6 is a separate, optional step: seed_0025_benchmark_days_in_shot_builder.sql.
--
-- The numbers here are the protocol (src/lib/basketball/benchmarks.ts) and a test
-- checks that they agree. Changing any of them is a new benchmark version, not an edit.
--   Free Throw Reset                  Benchmark v1                 3 x 10  = 30 attempts
--   Catch-and-Shoot off the Pin-Down  Benchmark v1 · both wings    2 x 15  = 30 attempts
--   Beat the Clock Finisher           Benchmark v1 · right elbow   90 seconds
-- No levels and no per-level targets: the same test for every player.
--
-- Safe to run twice (it adds nothing the second time). It stops with a message,
-- changing nothing, if a drill name is missing or ambiguous.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

do $guard$
declare
  n int;
begin
  select count(*) into n from hoops.drills
  where name in ($hl$Free Throw Reset$hl$, $hl$Catch-and-Shoot off the Pin-Down$hl$, $hl$Beat the Clock Finisher$hl$);
  if n <> 3 then
    raise exception $msg$Expected exactly one drill each named Free Throw Reset, Catch-and-Shoot off the Pin-Down and Beat the Clock Finisher; found % rows. Nothing was changed.$msg$, n;
  end if;
end
$guard$;

insert into hoops.workouts (name, description, player_type_tags, focus_areas, estimated_minutes)
select
  $hl$Shot Builder — Benchmark Check (v1)$hl$,
  $hl$The same three shooting tests every time, so results can be compared. Free throws, catch-and-shoot off a sprint, and a 90-second clock. Do it on a day you feel fresh.$hl$,
  '{}'::jsonb, array['shooting'], 25
where not exists (select 1 from hoops.workouts where name = $hl$Shot Builder — Benchmark Check (v1)$hl$);

insert into hoops.workout_drills
  (workout_id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds)
select w.id, d.id, v.sort_order, v.block, v.variant_label, '{}'::text[], '{}'::jsonb, v.sets, v.reps, v.secs
from (values
  ($hl$Free Throw Reset$hl$,                  1, $hl$main$hl$,     $hl$Benchmark v1$hl$,                3, 10, null::int),
  ($hl$Catch-and-Shoot off the Pin-Down$hl$,  2, $hl$main$hl$,     $hl$Benchmark v1 · both wings$hl$,   2, 15, null::int),
  ($hl$Beat the Clock Finisher$hl$,           3, $hl$finisher$hl$, $hl$Benchmark v1 · right elbow$hl$,  null::int, null::int, 90)
) as v(drill_name, sort_order, block, variant_label, sets, reps, secs)
join hoops.workouts w on w.name = $hl$Shot Builder — Benchmark Check (v1)$hl$
join hoops.drills d on d.name = v.drill_name
where not exists (
  select 1 from hoops.workout_drills x
  where x.workout_id = w.id and x.drill_id = d.id and x.variant_label = v.variant_label
);
