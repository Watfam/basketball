-- Undo for migration 0023. Removes only the index; no data is touched.
drop index if exists hoops.session_logs_one_per_entry;
