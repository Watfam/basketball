-- Undoes migration 0033_team_philosophy.sql.
-- Drops every team's saved Team Philosophy edit. The hardcoded defaults (src/lib/plays/philosophy.ts) are unaffected.

drop policy if exists team_philosophy_team_all on hoops.team_philosophy;
drop table if exists hoops.team_philosophy;
