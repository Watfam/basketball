-- READ ONLY. Run this in the Supabase SQL editor before migration 0023. It changes nothing.

-- 1. Workout entries that have more than one log row (must return no rows for 0023 to be safe).
select session_id, workout_drill_id, count(*) as rows_for_the_entry, array_agg(id order by created_at) as log_ids
from hoops.session_logs
where workout_drill_id is not null
group by session_id, workout_drill_id
having count(*) > 1
order by rows_for_the_entry desc;

-- 2. Context: how many rows, how many have an entry id, and any index that already exists on the table.
select count(*) as all_rows, count(workout_drill_id) as rows_with_entry_id from hoops.session_logs;
select indexname, indexdef from pg_indexes where schemaname = 'hoops' and tablename = 'session_logs' order by indexname;

-- 3. The row security policies on the table, for comparing after (they must not change).
select policyname, cmd, permissive, roles, qual, with_check from pg_policies where schemaname = 'hoops' and tablename = 'session_logs' order by policyname;
