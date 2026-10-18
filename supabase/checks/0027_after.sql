-- Read only. After running migration 0027: the column exists, the policies are in place, and the library is untouched.
select 'owner column' as what, count(*)::text as value from information_schema.columns where table_schema = 'hoops' and table_name = 'workouts' and column_name = 'owner_household_id'
union all select 'library workouts (no owner)', count(*)::text from hoops.workouts where owner_household_id is null
union all select 'family-built workouts', count(*)::text from hoops.workouts where owner_household_id is not null
union all select 'policy: ' || tablename || '.' || policyname, cmd from pg_policies where schemaname = 'hoops' and tablename in ('workouts', 'workout_drills') order by 1;
