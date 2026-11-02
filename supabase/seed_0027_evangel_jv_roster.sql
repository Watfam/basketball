-- ============================================================================
-- Hardwood Lab — seed_0027_evangel_jv_roster.sql
--
-- The real Evangel JV Boys roster, pulled from MaxPreps on Nov 2, 2026
-- (https://www.maxpreps.com/al/alabaster/evangel-christian-lightning/
-- basketball/jv/roster/, "last updated Oct 25, 2026"). MaxPreps lists no
-- position or height for this team, so roster_position is left null for
-- every bare-name row rather than guessed.
--
-- Cam Watford (#2) is Matt's own tracked player "Cameron" — linked by
-- player_id, not a bare name, so his roster card shows his real shooting
-- stats and links to his profile (see team-snapshot/roster-row work).
-- Every other name on MaxPreps has no Hardwood Lab account, so they go in
-- as roster_name/roster_position per migration 0015 — the normal shape
-- for a kid whose family hasn't signed up.
--
-- Safe to re-run: every insert is guarded by a "not exists" check against
-- what's already on the roster (by player_id for Cameron, by roster_name
-- for everyone else), so it only ever adds what's missing.
--
-- Run this in the Supabase SQL editor.
--
-- Dollar quoting ($gm$...$gm$), no apostrophes in comments: see seed_0005.
-- ============================================================================

do $body$
declare
  target_team_id uuid;
  cameron_player_id uuid;
begin
  select id into target_team_id
  from hoops.teams
  where name ilike $gm$Evangel JV Boys$gm$;

  if target_team_id is null then
    raise exception $gm$No team named "Evangel JV Boys" found in hoops.teams - check the exact name and edit this script to match.$gm$;
  end if;

  -- Cameron's real player profile, scoped to a household owned by this
  -- team's own coach (never guess across families' data).
  select p.id into cameron_player_id
  from hoops.players p
  join hoops.households h on h.id = p.household_id
  join hoops.teams t on t.owner_id = h.owner_id
  where t.id = target_team_id
    and p.display_name ilike $gm$Cameron$gm$
  limit 1;

  if cameron_player_id is null then
    raise exception $gm$No player named Cameron found in a household owned by this team coach - check the exact name and edit this script to match.$gm$;
  end if;

  insert into hoops.team_members (team_id, player_id, role, jersey_number)
  select target_team_id, cameron_player_id, $gm$player$gm$, $gm$2$gm$
  where not exists (
    select 1 from hoops.team_members where team_id = target_team_id and player_id = cameron_player_id
  );

  insert into hoops.team_members (team_id, role, jersey_number, roster_name, roster_position)
  select target_team_id, $gm$player$gm$, v.jersey, v.name, null
  from (values
    ($gm$0$gm$, $gm$Paul Rankin$gm$),
    ($gm$1$gm$, $gm$Grady Walters$gm$),
    ($gm$3$gm$, $gm$Levi Sparks$gm$),
    ($gm$4$gm$, $gm$Nathan Haynes$gm$),
    ($gm$5$gm$, $gm$Vincent Aymin$gm$),
    ($gm$12$gm$, $gm$August Susic$gm$),
    ($gm$13$gm$, $gm$Ryan Jones$gm$),
    ($gm$22$gm$, $gm$Riggs Black$gm$),
    ($gm$24$gm$, $gm$Adam Algee$gm$),
    ($gm$33$gm$, $gm$Henry Brothers$gm$),
    ($gm$35$gm$, $gm$Abram Moore$gm$),
    ($gm$40$gm$, $gm$Beau Reynolds$gm$)
  ) as v(jersey, name)
  where not exists (
    select 1 from hoops.team_members
    where team_id = target_team_id and roster_name = v.name
  );
end;
$body$;
