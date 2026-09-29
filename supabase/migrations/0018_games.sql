-- ============================================================================
-- Hardwood Lab — migration 0018: games
--
-- hoops.game_plans already exists but is for pregame strategy (matchups,
-- lineups) — a deliberately untouched Phase 2 placeholder, still deferred.
-- This is a different concern: the schedule itself, the result, and the
-- post-game notes a coach wants to reference or have summarized later.
-- Same split as practice: practice_plans is the template, practice_sessions
-- is the log of what actually happened. games is that same "log" half, for
-- the game side, with no practice_plans-style template needed since a
-- schedule slot only ever needs an opponent and a date.
--
-- Scores are the TEAM's only — Matt was explicit that per-player stats
-- live in MaxPreps and a paper scorebook, not here. team_score/
-- opponent_score are for a plain final score, not a box score.
--
-- is_tbd covers the real shape of a real high school schedule: several
-- rows import with no opponent yet (a schedule slot marked "JV Opponent"
-- pending an update, or a tournament round before brackets are set).
-- Never fabricate a name for these — is_tbd is exactly the flag that says
-- "the source doesn't know yet either."
--
-- Coach-only visibility, matching the confirmed decision for practice
-- results: mirrors practice_sessions_team_all exactly.
-- ============================================================================

create table hoops.games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references hoops.teams (id) on delete cascade,
  opponent text not null,
  is_tbd boolean not null default false,
  game_date date not null,
  game_time text,
  location text check (location in ('home', 'away', 'neutral')),
  tournament_note text,
  team_score int,
  opponent_score int,
  notes text,
  created_at timestamptz not null default now()
);

create index games_team_id_idx on hoops.games (team_id);
create index games_team_id_date_idx on hoops.games (team_id, game_date);

alter table hoops.games enable row level security;

create policy games_team_all on hoops.games
  for all using (
    hoops.is_team_owner(games.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = games.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant all on hoops.games to anon, authenticated, service_role;
