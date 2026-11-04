-- Undoes migration 0031_playbook_exports.sql.
-- Drops every saved playbook export link. Generating a new one is unaffected; only already-shared links stop resolving.

drop policy if exists playbook_exports_select_public on hoops.playbook_exports;
drop policy if exists playbook_exports_insert_coach on hoops.playbook_exports;
drop table if exists hoops.playbook_exports;
