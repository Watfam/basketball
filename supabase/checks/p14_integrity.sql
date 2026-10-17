-- READ ONLY. Phase 14. Paste the whole query into the Supabase SQL editor and run it once. It changes nothing.
-- It returns ONE table (the editor shows only the last result), one row per check. "found" should equal "expected".
-- Rows marked info have no pass or fail; they tell me how much data there is.
select n, check_name, found, expected, case when expected = 'info' then 'info' when found::text = expected then 'ok' else 'LOOK' end as status
from (
  select 1 as n, 'migration 0023: unique partial index session_logs_one_per_entry exists and is valid' as check_name,
    (select count(*) from pg_index ix join pg_class i on i.oid = ix.indexrelid join pg_class t on t.oid = ix.indrelid join pg_namespace s on s.oid = t.relnamespace
      where s.nspname = 'hoops' and t.relname = 'session_logs' and i.relname = 'session_logs_one_per_entry' and ix.indisunique and ix.indisvalid and ix.indpred is not null) as found, '1' as expected
  union all select 2, 'workout entries with more than one log row',
    (select count(*) from (select 1 from hoops.session_logs where workout_drill_id is not null group by session_id, workout_drill_id having count(*) > 1) d), '0'
  union all select 3, 'log rows: total',
    (select count(*) from hoops.session_logs), 'info'
  union all select 4, 'log rows: tracked shooting results',
    (select count(*) from hoops.session_logs where metrics->>'type' = 'shooting' and metrics->'tracking'->>'shot_session_id' is not null), 'info'
  union all select 5, 'log rows: benchmark results',
    (select count(*) from hoops.session_logs where metrics->'benchmark' is not null), 'info'
  union all select 6, 'tracked results with no workout entry id (cannot be tied to one entry)',
    (select count(*) from hoops.session_logs where metrics->>'type' = 'shooting' and metrics->'tracking'->>'shot_session_id' is not null and workout_drill_id is null), '0'
  union all select 7, 'log whose drill differs from the drill of its workout entry',
    (select count(*) from hoops.session_logs l join hoops.workout_drills wd on wd.id = l.workout_drill_id where l.drill_id is distinct from wd.drill_id), '0'
  union all select 8, 'log whose workout entry belongs to a different workout than its session',
    (select count(*) from hoops.session_logs l join hoops.workout_drills wd on wd.id = l.workout_drill_id join hoops.workout_sessions ws on ws.id = l.session_id
      where ws.workout_id is not null and wd.workout_id <> ws.workout_id), '0'
  union all select 9, 'tracked result pointing to a shot set that does not exist',
    (select count(*) from hoops.session_logs l where l.metrics->>'type' = 'shooting' and l.metrics->'tracking'->>'shot_session_id' is not null
      and not exists (select 1 from hoops.shot_sessions ss where ss.id::text = l.metrics->'tracking'->>'shot_session_id')), '0'
  union all select 10, 'tracked result whose shot set belongs to a different player than the workout',
    (select count(*) from hoops.session_logs l join hoops.workout_sessions ws on ws.id = l.session_id join hoops.shot_sessions ss on ss.id::text = l.metrics->'tracking'->>'shot_session_id'
      where l.metrics->>'type' = 'shooting' and ss.player_id <> ws.player_id), '0'
  union all select 11, 'tracked result whose shot set was deleted by the player',
    (select count(*) from hoops.session_logs l join hoops.shot_sessions ss on ss.id::text = l.metrics->'tracking'->>'shot_session_id'
      where l.metrics->>'type' = 'shooting' and ss.deleted_at is not null), 'info'
  union all select 12, 'uncorrected tracked result whose makes or attempts differ from its shot set',
    (select count(*) from hoops.session_logs l join hoops.shot_sessions ss on ss.id::text = l.metrics->'tracking'->>'shot_session_id'
      where l.metrics->>'type' = 'shooting' and (l.metrics->'tracking'->'adjusted') = 'null'::jsonb and (l.metrics->>'makes' is distinct from ss.makes::text or l.metrics->>'attempts' is distinct from ss.attempts::text)), '0'
  union all select 13, 'tracked result with makes greater than attempts',
    (select count(*) from hoops.session_logs l where l.metrics->>'type' = 'shooting'
      and case when l.metrics->>'makes' ~ '^[0-9]+$' and l.metrics->>'attempts' ~ '^[0-9]+$' then (l.metrics->>'makes')::int > (l.metrics->>'attempts')::int else false end), '0'
  union all select 14, 'shot rows whose player differs from their shot set',
    (select count(*) from hoops.shots s join hoops.shot_sessions ss on ss.id = s.session_id where s.player_id <> ss.player_id), '0'
  union all select 15, 'shot sets whose stored totals differ from their shot rows',
    (select count(*) from hoops.shot_sessions ss where ss.makes <> (select count(*) from hoops.shots s where s.session_id = ss.id and s.made)
      or ss.attempts <> (select count(*) from hoops.shots s where s.session_id = ss.id)), '0'
  union all select 16, 'benchmark results whose protocol does not match their workout entry (drill name and variant label)',
    (select count(*) from hoops.session_logs l where l.metrics->'benchmark' is not null
      and not exists (
        select 1 from hoops.workout_drills wd join hoops.drills d on d.id = wd.drill_id
        join (values
          ('free_throw@v1', 'Free Throw Reset', 'Benchmark v1'),
          ('catch_and_shoot@v1', 'Catch-and-Shoot off the Pin-Down', 'Benchmark v1 ' || chr(183) || ' both wings'),
          ('beat_the_clock@v1', 'Beat the Clock Finisher', 'Benchmark v1 ' || chr(183) || ' right elbow')
        ) as want(protocol, drill_name, variant) on want.protocol = l.metrics->'benchmark'->>'protocol'
        where wd.id = l.workout_drill_id and d.name = want.drill_name and wd.variant_label = want.variant)), '0'
  union all select 17, 'benchmark workout exists (one workout named Benchmark Check v1)',
    (select count(*) from hoops.workouts where name like 'Shot Builder%Benchmark Check (v1)'), '1'
  union all select 18, 'benchmark workout has its three entries',
    (select count(*) from hoops.workout_drills wd join hoops.workouts w on w.id = wd.workout_id where w.name like 'Shot Builder%Benchmark Check (v1)'), '3'
  union all select 19, 'Six-Week Shot Builder schedules it in weeks 1, 3 and 6',
    (select count(distinct pd.week_number) from hoops.program_days pd join hoops.programs p on p.id = pd.program_id join hoops.workouts w on w.id = pd.workout_id
      where p.name = 'Six-Week Shot Builder' and w.name like 'Shot Builder%Benchmark Check (v1)' and pd.week_number in (1, 3, 6)), '3'
  union all select 20, 'benchmark drills with a Film Room lesson linked directly (of 3; the others show a related lesson or none)',
    (select count(distinct d.id) from hoops.workout_drills wd join hoops.workouts w on w.id = wd.workout_id join hoops.drills d on d.id = wd.drill_id
      where w.name like 'Shot Builder%Benchmark Check (v1)' and exists (select 1 from hoops.film_resources f where f.drill_id = d.id)), 'info'
) q
order by n;
