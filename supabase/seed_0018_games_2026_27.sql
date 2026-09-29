-- ============================================================================
-- Hardwood Lab — seed_0018_games_2026_27.sql
--
-- The real 2026-27 JV schedule for Evangel Christian (Alabaster, AL),
-- pulled from MaxPreps on Sep 28, 2026 — confirmed the right team by the
-- roster page listing "M. Watford" as Assistant Coach. Six rows carry
-- is_tbd = true because MaxPreps itself doesn't have an opponent yet
-- (two regular-season slots, plus the tournament rounds) — never guessed.
--
-- Run this AFTER 0018_games.sql. Targets the team by name, scoped to the
-- caller's own teams — if you have more than one team named this, or the
-- name doesn't match exactly, this fails loudly (null team_id) rather than
-- silently picking the wrong one or inserting nothing.
--
-- Dollar quoting ($gm$...$gm$), no apostrophes in comments: see seed_0005.
-- ============================================================================

insert into hoops.games (team_id, opponent, is_tbd, game_date, game_time, location, tournament_note)
select
  (select id from hoops.teams where owner_id = auth.uid() and name ilike $gm$Evangel JV Boys$gm$ limit 1),
  v.opponent, v.is_tbd, v.game_date::date, v.game_time, v.location, v.tournament_note
from (values
  ($gm$2026-11-17$gm$, $gm$5:00pm$gm$, $gm$home$gm$, $gm$Restoration Academy$gm$, false, null),
  ($gm$2026-11-30$gm$, $gm$5:30pm$gm$, $gm$away$gm$, $gm$Valiant Cross Academy$gm$, false, null),
  ($gm$2026-12-01$gm$, $gm$5:00pm$gm$, $gm$away$gm$, $gm$Restoration Academy$gm$, false, null),
  ($gm$2026-12-03$gm$, $gm$5:00pm$gm$, $gm$away$gm$, $gm$Banks Academy$gm$, false, null),
  ($gm$2026-12-04$gm$, $gm$5:00pm$gm$, $gm$home$gm$, $gm$Rocket City$gm$, false, null),
  ($gm$2026-12-08$gm$, $gm$5:00pm$gm$, $gm$home$gm$, $gm$Valiant Cross Academy$gm$, false, null),
  ($gm$2026-12-10$gm$, $gm$4:30pm$gm$, $gm$home$gm$, $gm$TBA$gm$, true, null),
  ($gm$2026-12-10$gm$, $gm$5:30pm$gm$, $gm$home$gm$, $gm$Sunshine Saints$gm$, false, null),
  ($gm$2026-12-10$gm$, $gm$6:30pm$gm$, $gm$home$gm$, $gm$Sunshine Saints$gm$, false, null),
  ($gm$2026-12-14$gm$, $gm$5:00pm$gm$, $gm$away$gm$, $gm$Rocket City$gm$, false, null),
  ($gm$2026-12-15$gm$, $gm$5:00pm$gm$, $gm$away$gm$, $gm$Tuscaloosa Home Educators$gm$, false, null),
  ($gm$2026-12-17$gm$, $gm$5:00pm$gm$, $gm$home$gm$, $gm$Banks Academy$gm$, false, null),
  ($gm$2027-01-04$gm$, $gm$4:00pm$gm$, $gm$away$gm$, $gm$TBA$gm$, true, null),
  ($gm$2027-01-05$gm$, $gm$TBA$gm$, $gm$home$gm$, $gm$Southern Christian$gm$, false, null),
  ($gm$2027-01-08$gm$, $gm$5:00pm$gm$, $gm$away$gm$, $gm$Ezekiel Academy$gm$, false, null),
  ($gm$2027-01-09$gm$, $gm$TBA$gm$, $gm$away$gm$, $gm$Wiregrass$gm$, false, null),
  ($gm$2027-01-11$gm$, $gm$5:00pm$gm$, $gm$away$gm$, $gm$East Central HomeSchool$gm$, false, null),
  ($gm$2027-01-12$gm$, $gm$5:00pm$gm$, $gm$home$gm$, $gm$Tuscaloosa Home Educators$gm$, false, null),
  ($gm$2027-01-14$gm$, $gm$5:00pm$gm$, $gm$away$gm$, $gm$Mt. Pleasant Christian$gm$, false, null),
  ($gm$2027-01-19$gm$, $gm$TBA$gm$, $gm$away$gm$, $gm$Southern Christian$gm$, false, null),
  ($gm$2027-01-21$gm$, $gm$5:00pm$gm$, $gm$home$gm$, $gm$Mt. Pleasant Christian$gm$, false, null),
  ($gm$2027-01-25$gm$, $gm$5:00pm$gm$, $gm$home$gm$, $gm$East Central HomeSchool$gm$, false, null),
  ($gm$2027-01-28$gm$, $gm$TBA$gm$, $gm$home$gm$, $gm$Wiregrass$gm$, false, null),
  ($gm$2027-01-29$gm$, $gm$5:00pm$gm$, $gm$home$gm$, $gm$Ezekiel Academy$gm$, false, null),
  ($gm$2027-02-13$gm$, $gm$TBA$gm$, $gm$neutral$gm$, $gm$TBA$gm$, true, $gm$ACSC JV Tournament - East Central$gm$),
  ($gm$2027-03-08$gm$, $gm$TBA$gm$, $gm$neutral$gm$, $gm$TBA$gm$, true, $gm$Gatlinburg Homeschool Classic National - 16U$gm$),
  ($gm$2027-03-09$gm$, $gm$TBA$gm$, $gm$neutral$gm$, $gm$TBA$gm$, true, $gm$Gatlinburg Homeschool Classic National - 16U$gm$),
  ($gm$2027-03-10$gm$, $gm$TBA$gm$, $gm$neutral$gm$, $gm$TBA$gm$, true, $gm$Gatlinburg Homeschool Classic National - 16U$gm$),
  ($gm$2027-03-11$gm$, $gm$TBA$gm$, $gm$neutral$gm$, $gm$TBA$gm$, true, $gm$Gatlinburg Homeschool Classic National - 16U$gm$),
  ($gm$2027-03-12$gm$, $gm$TBA$gm$, $gm$neutral$gm$, $gm$TBA$gm$, true, $gm$Gatlinburg Homeschool Classic National - 16U$gm$)
) as v(game_date, game_time, location, opponent, is_tbd, tournament_note);
