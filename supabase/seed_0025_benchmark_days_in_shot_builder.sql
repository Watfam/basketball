-- ============================================================================
-- Hardwood Lab — put the benchmark check into the Six-Week Shot Builder
--
-- OPTIONAL and separate from seed_0024 on purpose. This ADDS a fourth day to
-- weeks 1, 3 and 6 of the program. No existing day, workout or entry is changed.
-- But it does change what the program asks for: those three weeks have four days
-- instead of three, and a player finishes the program only after doing them. If
-- you would rather offer the benchmark check as an extra workout without
-- requiring it, do not run this file; the benchmark check works either way.
--
-- Run after seed_0024. Safe to run twice. It stops with a message, changing
-- nothing, if the program or the workout is missing or ambiguous.
--
-- Week 6 is the planned lighter week; the benchmark day is marked as part of it.
-- The benchmark entries are never stepped up by the weekly volume step.
--
-- To undo: supabase/rollback/0025_remove_benchmark_days.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

do $guard$
declare
  p int;
  w int;
begin
  select count(*) into p from hoops.programs where name = $hl$Six-Week Shot Builder$hl$;
  select count(*) into w from hoops.workouts where name = $hl$Shot Builder — Benchmark Check (v1)$hl$;
  if p <> 1 or w <> 1 then
    raise exception $msg$Expected exactly one program named Six-Week Shot Builder (found %) and one workout named Shot Builder — Benchmark Check (v1) (found %). Run seed_0024 first. Nothing was changed.$msg$, p, w;
  end if;
end
$guard$;

insert into hoops.program_days (program_id, week_number, day_number, workout_id, volume_step, is_deload, note)
select p.id, v.week_number, 4, w.id, 0, v.week_number = 6, v.note
from (values
  (1, $hl$Benchmark week 1. Same three tests, run the same way every time. Today is the starting point for weeks 3 and 6.$hl$),
  (3, $hl$Benchmark week 3. Same tests, same way as week 1. Do not change anything to chase a better number.$hl$),
  (6, $hl$Final benchmark. Same tests, same way. Compare with weeks 1 and 3: a clear change is shown only when it is bigger than normal shot-to-shot variation.$hl$)
) as v(week_number, note)
join hoops.programs p on p.name = $hl$Six-Week Shot Builder$hl$
join hoops.workouts w on w.name = $hl$Shot Builder — Benchmark Check (v1)$hl$
where not exists (
  select 1 from hoops.program_days pd
  where pd.program_id = p.id and pd.week_number = v.week_number and pd.day_number = 4
);
