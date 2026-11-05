-- Undoes migration 0032_team_play_order.sql.
-- Drops every team's saved play order. Plays fall back to their natural library.ts order.

drop policy if exists team_play_order_team_all on hoops.team_play_order;
drop table if exists hoops.team_play_order;
