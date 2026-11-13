-- Undoes migration 0034_team_starred_plays.sql.
-- Drops every team's starred-play list. The static library (src/lib/plays/library.ts) is unaffected.

drop policy if exists team_starred_plays_team_all on hoops.team_starred_plays;
drop table if exists hoops.team_starred_plays;
