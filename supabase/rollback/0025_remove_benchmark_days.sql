-- Undo for seed_0025: removes the three benchmark days from the Six-Week Shot Builder.
-- Refuses if any workout session was started on one of them, so no result is ever orphaned.
do $guard$
declare
  used int;
begin
  select count(*) into used from hoops.workout_sessions ws
  join hoops.program_days pd on pd.id = ws.program_day_id
  join hoops.programs p on p.id = pd.program_id
  join hoops.workouts w on w.id = pd.workout_id
  where p.name = $hl$Six-Week Shot Builder$hl$ and pd.day_number = 4 and w.name = $hl$Shot Builder — Benchmark Check (v1)$hl$;
  if used > 0 then
    raise exception $msg$% workout sessions were started on benchmark days. Nothing was removed.$msg$, used;
  end if;
end
$guard$;

delete from hoops.program_days pd
using hoops.programs p, hoops.workouts w
where pd.program_id = p.id and pd.workout_id = w.id
  and p.name = $hl$Six-Week Shot Builder$hl$ and pd.day_number = 4
  and w.name = $hl$Shot Builder — Benchmark Check (v1)$hl$;
