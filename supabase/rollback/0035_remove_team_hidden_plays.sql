-- Undoes migration 0035_team_hidden_plays.sql.
-- Every team's hidden plays come back into its playbook. The static library (src/lib/plays/library.ts) is unaffected.

drop policy if exists team_hidden_plays_team_all on hoops.team_hidden_plays;
drop table if exists hoops.team_hidden_plays;
