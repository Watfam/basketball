-- ============================================================================
-- Hardwood Lab — migration 0016: fix infinite recursion on hoops.teams
--
-- Run in the Supabase SQL Editor after 0015. This is a correctness fix,
-- not new content — Matt hit "infinite recursion detected in policy for
-- relation teams" the first time he tried Create Team, and every part of
-- Coach & Team Tools (roster, practice plans, scouting notes) is broken
-- by the same bug, not just team creation.
--
-- THE BUG, and it has been in schema.sql since the very first migration:
--
--   hoops.teams has a SELECT policy (teams_member_select) that checks
--   hoops.team_members to see if the caller is on the roster.
--
--   hoops.team_members has an ALL policy (team_members_owner_all) that
--   checks hoops.teams to see if the caller owns the team.
--
-- Reading teams evaluates the team_members policy, which evaluates the
-- teams policy again, which evaluates the team_members policy again,
-- forever. It never surfaced before this session because nothing ever
-- read or wrote hoops.teams until the coach-tools work — the table
-- existed, seeded with nothing, queried by nobody.
--
-- practice_plans, game_plans and scouting_notes all carry the identical
-- "exists (select 1 from hoops.teams ...)" pattern in their own
-- policies, so they hit the exact same cycle the moment anyone tries to
-- read or write a practice plan or scouting note, not just on team
-- creation.
--
-- THE FIX: a SECURITY DEFINER function to check team ownership instead
-- of an inline subquery against hoops.teams. A function owned by the
-- role that owns the tables (the role running this migration, same as
-- every other migration in this project) is not itself subject to RLS
-- on the tables it queries, by default in Postgres, unless the table
-- has FORCE ROW LEVEL SECURITY set — which none of these do. Its
-- internal query never re-enters teams_member_select, so the cycle
-- cannot start. search_path is pinned as standard hardening for
-- SECURITY DEFINER functions, on top of the fully-qualified table names
-- already used throughout this schema.
--
-- No apostrophes in comments, dollar quoting for any literal: see
-- seed_0005.
-- ============================================================================

create or replace function hoops.is_team_owner(check_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = hoops, pg_catalog
as $body$
  select exists (
    select 1 from hoops.teams t
    where t.id = check_team_id and t.owner_id = auth.uid()
  );
$body$;

-- Only ever called from within a policy — nothing else needs it, and
-- narrowing who can call it is one less thing to reason about later.
revoke all on function hoops.is_team_owner(uuid) from public;
grant execute on function hoops.is_team_owner(uuid) to anon, authenticated, service_role;

drop policy if exists team_members_owner_all on hoops.team_members;
create policy team_members_owner_all on hoops.team_members
  for all using (
    hoops.is_team_owner(team_members.team_id)
  )
  with check (
    hoops.is_team_owner(team_members.team_id)
  );

drop policy if exists practice_plans_team_all on hoops.practice_plans;
create policy practice_plans_team_all on hoops.practice_plans
  for all using (
    hoops.is_team_owner(practice_plans.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = practice_plans.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

drop policy if exists game_plans_team_all on hoops.game_plans;
create policy game_plans_team_all on hoops.game_plans
  for all using (
    hoops.is_team_owner(game_plans.team_id)
  );

drop policy if exists scouting_notes_team_all on hoops.scouting_notes;
create policy scouting_notes_team_all on hoops.scouting_notes
  for all using (
    hoops.is_team_owner(scouting_notes.team_id)
  );
