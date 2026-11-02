-- ============================================================================
-- Hardwood Lab — seed_0026_games_schedule_correction.sql
--
-- Corrects hoops.games for "Evangel JV Boys" against the Evangel Christian
-- Lightning's own printed 2026-27 schedule PDF (supersedes the MaxPreps pull
-- in seed_0018_games_2026_27.sql, which had a few slots still wrong or
-- placeholder at the time it was run).
--
-- Run this AFTER seed_0018_games_2026_27.sql has already been applied, in
-- the Supabase SQL editor. Every statement below is scoped to this one
-- team and guarded to never touch a game that already has a logged result
-- (team_score/opponent_score set) — none of these dates had been played
-- yet as of this correction, but the guard costs nothing and the original
-- seed's own home/away for some of these was simply wrong, not placeholder,
-- so a blind date-only match could otherwise have silently flipped a real
-- result's row.
--
-- Dollar quoting ($gm$...$gm$), no apostrophes in comments: see seed_0005.
-- ============================================================================

do $body$
declare
  target_team_id uuid;
begin
  select id into target_team_id
  from hoops.teams
  where name ilike $gm$Evangel JV Boys$gm$;

  if target_team_id is null then
    raise exception $gm$No team named "Evangel JV Boys" found in hoops.teams - check the exact name and edit this script to match.$gm$;
  end if;

  -- Dec 4: the seed had this as a home game; the printed schedule has
  -- Evangel traveling to Huntsville, AL.
  update hoops.games
  set location = $gm$away$gm$
  where team_id = target_team_id
    and game_date = $gm$2026-12-04$gm$
    and opponent = $gm$Rocket City$gm$
    and team_score is null and opponent_score is null;

  -- Dec 7: a home JV & Varsity Boys-only game against Glen Iris Baptist
  -- that was not in the original MaxPreps pull at all.
  insert into hoops.games (team_id, opponent, is_tbd, game_date, game_time, location, tournament_note)
  select target_team_id, $gm$Glen Iris Baptist$gm$, false, $gm$2026-12-07$gm$::date, $gm$6:00pm$gm$, $gm$home$gm$, $gm$JV and Varsity Boys only$gm$
  where not exists (
    select 1 from hoops.games
    where team_id = target_team_id and game_date = $gm$2026-12-07$gm$ and opponent = $gm$Glen Iris Baptist$gm$
  );

  -- Dec 10: the seed had three guesses for this slot (an unnamed-opponent
  -- placeholder at 4:30pm, and "Sunshine Saints" at both 5:30pm and
  -- 6:30pm). The printed schedule names it a single ACSC conference game,
  -- JV Boys only, at 6:30pm against Central Alabama. Drop the two wrong
  -- guesses and correct the one that already had the right time.
  delete from hoops.games
  where team_id = target_team_id
    and game_date = $gm$2026-12-10$gm$
    and game_time in ($gm$4:30pm$gm$, $gm$5:30pm$gm$)
    and team_score is null and opponent_score is null;

  update hoops.games
  set opponent = $gm$Central Alabama$gm$, tournament_note = $gm$ACSC conference game - JV Boys only$gm$
  where team_id = target_team_id
    and game_date = $gm$2026-12-10$gm$
    and game_time = $gm$6:30pm$gm$
    and team_score is null and opponent_score is null;

  -- Dec 14: the seed had this as away; the printed schedule has it home.
  update hoops.games
  set location = $gm$home$gm$
  where team_id = target_team_id
    and game_date = $gm$2026-12-14$gm$
    and opponent = $gm$Rocket City$gm$
    and team_score is null and opponent_score is null;

  -- Jan 4: opponent is now named (was an unnamed is_tbd placeholder).
  update hoops.games
  set opponent = $gm$Central Alabama$gm$, is_tbd = false
  where team_id = target_team_id
    and game_date = $gm$2027-01-04$gm$
    and opponent = $gm$TBA$gm$
    and team_score is null and opponent_score is null;

  -- Jan 5: tip time is now set.
  update hoops.games
  set game_time = $gm$5:30pm$gm$
  where team_id = target_team_id
    and game_date = $gm$2027-01-05$gm$
    and opponent = $gm$Southern Christian$gm$
    and location = $gm$home$gm$
    and team_score is null and opponent_score is null;

  -- Jan 9: this one is explicitly flagged on the printed schedule as
  -- being rescheduled to a new, not-yet-known date - leave the row where
  -- it is (still the only record of this game existing at all) but note
  -- it clearly instead of implying Jan 9 is still correct.
  update hoops.games
  set tournament_note = $gm$To be rescheduled - new date TBD (originally away at Dothan, AL)$gm$
  where team_id = target_team_id
    and game_date = $gm$2027-01-09$gm$
    and opponent = $gm$Wiregrass$gm$
    and team_score is null and opponent_score is null;

  -- Jan 19: tip time is now set.
  update hoops.games
  set game_time = $gm$5:30pm$gm$
  where team_id = target_team_id
    and game_date = $gm$2027-01-19$gm$
    and opponent = $gm$Southern Christian$gm$
    and location = $gm$away$gm$
    and team_score is null and opponent_score is null;

  -- Jan 26: an away JV & Varsity Boys-only game against Glen Iris Baptist
  -- that was not in the original MaxPreps pull at all.
  insert into hoops.games (team_id, opponent, is_tbd, game_date, game_time, location, tournament_note)
  select target_team_id, $gm$Glen Iris Baptist$gm$, false, $gm$2027-01-26$gm$::date, $gm$6:00pm$gm$, $gm$away$gm$, $gm$JV and Varsity Boys only$gm$
  where not exists (
    select 1 from hoops.games
    where team_id = target_team_id and game_date = $gm$2027-01-26$gm$ and opponent = $gm$Glen Iris Baptist$gm$
  );

  -- Jan 28: tip time is now set.
  update hoops.games
  set game_time = $gm$5:00pm$gm$
  where team_id = target_team_id
    and game_date = $gm$2027-01-28$gm$
    and opponent = $gm$Wiregrass$gm$
    and team_score is null and opponent_score is null;

  -- Mar 8-12: the postseason tournament was renamed on the printed
  -- schedule (Rocky Top Tournament, Rocky Top Sports World, Gatlinburg TN)
  -- from the earlier placeholder name.
  update hoops.games
  set tournament_note = $gm$Rocky Top Tournament - Rocky Top Sports World, Gatlinburg, TN$gm$
  where team_id = target_team_id
    and game_date between $gm$2027-03-08$gm$ and $gm$2027-03-12$gm$
    and tournament_note = $gm$Gatlinburg Homeschool Classic National - 16U$gm$
    and team_score is null and opponent_score is null;
end;
$body$;
