-- Undoes migration 0028_play_edits.sql.
-- Drops every team's saved play edits. The static library (src/lib/plays/library.ts) is unaffected.

drop policy if exists play_edits_team_all on hoops.play_edits;
drop table if exists hoops.play_edits;
