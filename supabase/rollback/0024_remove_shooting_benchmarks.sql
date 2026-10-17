-- Undo for seed_0024: removes the benchmark workout and its entries. Run 0025 rollback first if 0025 was applied.
-- Refuses if the workout is scheduled in a program or any workout session used it, so no result loses its entry.
do $guard$
declare
  used int;
begin
  select (select count(*) from hoops.workout_sessions ws join hoops.workouts w on w.id = ws.workout_id where w.name = $hl$Shot Builder — Benchmark Check (v1)$hl$)
       + (select count(*) from hoops.program_days pd join hoops.workouts w on w.id = pd.workout_id where w.name = $hl$Shot Builder — Benchmark Check (v1)$hl$)
  into used;
  if used > 0 then
    raise exception $msg$The benchmark workout is in use (% sessions or scheduled days). Nothing was removed.$msg$, used;
  end if;
end
$guard$;

delete from hoops.workouts where name = $hl$Shot Builder — Benchmark Check (v1)$hl$;
