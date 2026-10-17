-- READ ONLY. Run after migration 0023 and compare with the output of 0023_before.sql.

-- The index exists, is valid and is unique, with the expected definition.
select i.relname as index_name, ix.indisunique as is_unique, ix.indisvalid as is_valid, pg_get_indexdef(ix.indexrelid) as definition
from pg_index ix join pg_class i on i.oid = ix.indexrelid join pg_class t on t.oid = ix.indrelid join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'hoops' and t.relname = 'session_logs' and i.relname = 'session_logs_one_per_entry';

-- Same row counts as before.
select count(*) as all_rows, count(workout_drill_id) as rows_with_entry_id from hoops.session_logs;

-- Row security is still on, with the same policies.
select relrowsecurity as row_security_enabled from pg_class where oid = 'hoops.session_logs'::regclass;
select policyname, cmd, permissive, roles, qual, with_check from pg_policies where schemaname = 'hoops' and tablename = 'session_logs' order by policyname;
