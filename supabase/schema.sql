-- ============================================================================
-- Hardwood Lab — App schema
-- Lives in its own Postgres schema ("hoops") inside the shared Supabase
-- project (same project as Cardlocity). Auth stays shared at the project
-- level (auth.users); everything below is namespaced under hoops.* so it
-- can never collide with Cardlocity's tables.
-- ============================================================================

create schema if not exists hoops;

-- Make the schema visible to PostgREST (Supabase's auto API layer).
-- After running this once, add "hoops" to:
--   Project Settings -> API -> Exposed schemas
-- in the Supabase dashboard, or the API won't serve it.

-- ----------------------------------------------------------------------------
-- households
-- The "Netflix account" container. One login (a parent/guardian) owns a
-- household; players are profiles nested under it. This keeps minors off
-- of independent accounts entirely (COPPA-friendly) while still letting
-- the household expand to teammates later via team membership, not
-- household membership.
-- ----------------------------------------------------------------------------
create table hoops.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- players
-- A player profile nested under a household. No auth.users row of its own
-- for kids managed by a parent; a player can optionally be linked to their
-- own auth.users row later (e.g. once a teammate signs up themselves).
-- ----------------------------------------------------------------------------
create table hoops.players (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references hoops.households (id) on delete cascade,
  -- Set when the player has (or later gets) their own login, e.g. a
  -- teammate who signs up independently rather than being added by a
  -- parent. Null for a child managed entirely by a parent/guardian.
  linked_user_id uuid references auth.users (id) on delete set null,

  display_name text not null,
  birth_year int,
  graduation_year int,

  -- Primary position is a simple filter/label; player_type below is the
  -- richer, multi-signal profile actually used to curate content.
  primary_position text check (
    primary_position in ('point_guard', 'combo_guard', 'wing', 'forward', 'post')
  ),

  -- Freeform, extensible bag of signals that make up "player type":
  -- height, wingspan, ball-handling/shooting/defense self- and
  -- coach-ratings, play style tags, strengths/weaknesses, etc. Kept as
  -- JSONB rather than fixed columns so the model can grow without a
  -- migration every time a new signal matters.
  player_type jsonb not null default '{}'::jsonb,

  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_household_id_idx on hoops.players (household_id);

-- ----------------------------------------------------------------------------
-- teams / team_members
-- A team a player belongs to (their real team, e.g. the user's squad).
-- Coaches are household owners (or any auth.users) granted a coach role
-- on a team, independent of the household model above — this is what
-- lets the app expand to teammates' families later without merging
-- households.
-- ----------------------------------------------------------------------------
create table hoops.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,

  -- Fixed taxonomy with an escape hatch: offense/defense schemes pick
  -- from a known list (seeded below) or fall back to custom freeform
  -- text captured in *_scheme_custom when scheme = 'custom'.
  offensive_scheme text,
  offensive_scheme_custom text,
  defensive_scheme text,
  defensive_scheme_custom text,

  -- Team focus areas for the season/period (e.g. ["transition_defense",
  -- "free_throw_shooting"]) — drives curated practice-plan suggestions.
  focus_areas text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hoops.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references hoops.teams (id) on delete cascade,
  player_id uuid references hoops.players (id) on delete cascade,
  -- A coach entry (role='coach') may not correspond to a player row.
  user_id uuid references auth.users (id) on delete cascade,
  role text not null default 'player' check (role in ('player', 'coach', 'assistant_coach')),
  jersey_number text,
  created_at timestamptz not null default now(),
  unique (team_id, player_id),
  check (
    (role = 'player' and player_id is not null)
    or (role in ('coach', 'assistant_coach') and user_id is not null)
  )
);

create index team_members_team_id_idx on hoops.team_members (team_id);

-- ----------------------------------------------------------------------------
-- assessments
-- Onboarding + periodic re-assessment. Answers are JSONB (freeform
-- question/answer pairs) so the quiz can evolve without migrations;
-- computed_player_type is the derived snapshot written back to
-- players.player_type after each assessment.
-- ----------------------------------------------------------------------------
create table hoops.assessments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references hoops.players (id) on delete cascade,
  kind text not null default 'onboarding' check (kind in ('onboarding', 'checkin', 'annual')),
  answers jsonb not null default '{}'::jsonb,
  computed_player_type jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create index assessments_player_id_idx on hoops.assessments (player_id);

-- ----------------------------------------------------------------------------
-- drills / workouts / workout_drills
-- Drills are the atomic units (a single ball-handling drill, a shooting
-- series, a conditioning circuit). Workouts bundle drills into a curated
-- session. Both carry tag arrays used to match against player_type and
-- focus_areas rather than hardcoding position logic in the app.
-- ----------------------------------------------------------------------------
create table hoops.drills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  skill_tags text[] not null default '{}',       -- e.g. {ball_handling, finishing}
  position_tags text[] not null default '{}',    -- e.g. {point_guard, combo_guard}
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  equipment text[] not null default '{}',
  video_url text,                                -- YouTube link only, never rehosted
  source_trainer text,                            -- e.g. "Micah Lancaster", "Reid Ouse"
  created_at timestamptz not null default now()
);

create table hoops.workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  player_type_tags jsonb not null default '{}'::jsonb, -- matching criteria against player_type
  focus_areas text[] not null default '{}',
  estimated_minutes int,
  created_at timestamptz not null default now()
);

create table hoops.workout_drills (
  workout_id uuid not null references hoops.workouts (id) on delete cascade,
  drill_id uuid not null references hoops.drills (id) on delete cascade,
  sort_order int not null default 0,
  target_sets int,
  target_reps int,
  target_duration_seconds int,
  primary key (workout_id, drill_id)
);

-- ----------------------------------------------------------------------------
-- film_resources
-- Curated links only (YouTube etc.) — no hosted video. Tag against skills
-- and player type so film study can be surfaced alongside workouts.
-- ----------------------------------------------------------------------------
create table hoops.film_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  source_trainer text,        -- e.g. "Micah Lancaster", "Reid Ouse"
  pro_player_name text,       -- for professional film study links
  skill_tags text[] not null default '{}',
  position_tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- workout_sessions / session_logs
-- A scheduled/completed instance of a workout for a player, plus
-- per-drill logs. session_logs.metrics is JSONB to stay open-ended —
-- reps, makes/attempts, self-rated effort, sensor-derived data (tap
-- counts, duration), notes, etc. "Never limit what might be helpful to
-- capture" — this is the field that absorbs that requirement.
-- ----------------------------------------------------------------------------
create table hoops.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references hoops.players (id) on delete cascade,
  workout_id uuid references hoops.workouts (id) on delete set null,
  scheduled_for date,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'skipped')),
  created_at timestamptz not null default now()
);

create index workout_sessions_player_id_idx on hoops.workout_sessions (player_id);

create table hoops.session_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references hoops.workout_sessions (id) on delete cascade,
  drill_id uuid references hoops.drills (id) on delete set null,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index session_logs_session_id_idx on hoops.session_logs (session_id);

-- ----------------------------------------------------------------------------
-- practice_plans
-- Coach-curated practice plans for a team. blocks is an ordered JSONB
-- array of {title, duration_minutes, description, drill_ids} so plans
-- can be built from a mix of drills and free text without a rigid schema.
-- ----------------------------------------------------------------------------
create table hoops.practice_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references hoops.teams (id) on delete cascade,
  title text not null,
  practice_date date,
  focus_areas text[] not null default '{}',
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index practice_plans_team_id_idx on hoops.practice_plans (team_id);

-- ----------------------------------------------------------------------------
-- game_plans (Phase 2 placeholder)
-- Table created now so the concept and its relationship to teams/opponents
-- is preserved, but no UI ships against it in Phase 1. content is
-- deliberately wide-open JSONB until the feature is actually designed.
-- ----------------------------------------------------------------------------
create table hoops.game_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references hoops.teams (id) on delete cascade,
  opponent_name text,
  game_date date,
  content jsonb not null default '{}'::jsonb,
  is_placeholder boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- scouting_notes (Phase 2 placeholder, own-team only for now)
-- ----------------------------------------------------------------------------
create table hoops.scouting_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references hoops.teams (id) on delete cascade,
  opponent_name text not null,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table hoops.households enable row level security;
alter table hoops.players enable row level security;
alter table hoops.teams enable row level security;
alter table hoops.team_members enable row level security;
alter table hoops.assessments enable row level security;
alter table hoops.workouts enable row level security;
alter table hoops.drills enable row level security;
alter table hoops.workout_drills enable row level security;
alter table hoops.film_resources enable row level security;
alter table hoops.workout_sessions enable row level security;
alter table hoops.session_logs enable row level security;
alter table hoops.practice_plans enable row level security;
alter table hoops.game_plans enable row level security;
alter table hoops.scouting_notes enable row level security;

-- Households: only the owning parent/guardian can see/manage their household.
create policy household_owner_all on hoops.households
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Players: visible/editable by the owning household, or by the player
-- themself if they have their own linked login.
create policy players_household_owner_all on hoops.players
  for all using (
    linked_user_id = auth.uid()
    or exists (
      select 1 from hoops.households h
      where h.id = players.household_id and h.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from hoops.households h
      where h.id = players.household_id and h.owner_id = auth.uid()
    )
  );

-- Teams: visible to the owner (coach) and to any member (player's
-- household, or a coach/assistant coach user) of the team.
create policy teams_owner_all on hoops.teams
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy teams_member_select on hoops.teams
  for select using (
    exists (
      select 1 from hoops.team_members tm
      left join hoops.players p on p.id = tm.player_id
      left join hoops.households h on h.id = p.household_id
      where tm.team_id = teams.id
        and (tm.user_id = auth.uid() or h.owner_id = auth.uid())
    )
  );

-- Team members: manageable by the team owner; visible to any member.
create policy team_members_owner_all on hoops.team_members
  for all using (
    exists (select 1 from hoops.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from hoops.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  );

create policy team_members_self_select on hoops.team_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = team_members.player_id and h.owner_id = auth.uid()
    )
  );

-- Assessments / workout_sessions / session_logs: scoped through the
-- owning player's household (same rule shape as players).
create policy assessments_household_all on hoops.assessments
  for all using (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = assessments.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = assessments.player_id and h.owner_id = auth.uid()
    )
  );

create policy workout_sessions_household_all on hoops.workout_sessions
  for all using (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = workout_sessions.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = workout_sessions.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  );

create policy session_logs_household_all on hoops.session_logs
  for all using (
    exists (
      select 1 from hoops.workout_sessions ws
      join hoops.players p on p.id = ws.player_id
      join hoops.households h on h.id = p.household_id
      where ws.id = session_logs.session_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.workout_sessions ws
      join hoops.players p on p.id = ws.player_id
      join hoops.households h on h.id = p.household_id
      where ws.id = session_logs.session_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  );

-- Practice plans / game plans / scouting notes: team owner + coaches only.
create policy practice_plans_team_all on hoops.practice_plans
  for all using (
    exists (
      select 1 from hoops.teams t where t.id = practice_plans.team_id and t.owner_id = auth.uid()
    )
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = practice_plans.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

create policy game_plans_team_all on hoops.game_plans
  for all using (
    exists (select 1 from hoops.teams t where t.id = game_plans.team_id and t.owner_id = auth.uid())
  );

create policy scouting_notes_team_all on hoops.scouting_notes
  for all using (
    exists (select 1 from hoops.teams t where t.id = scouting_notes.team_id and t.owner_id = auth.uid())
  );

-- Content libraries (drills, workouts, workout_drills, film_resources) are
-- app-wide curated content, not per-household data: readable by any
-- signed-in user, writable only via the service role (i.e. by you,
-- seeding content — not through the client app).
create policy drills_read_all on hoops.drills for select using (auth.role() = 'authenticated');
create policy workouts_read_all on hoops.workouts for select using (auth.role() = 'authenticated');
create policy workout_drills_read_all on hoops.workout_drills for select using (auth.role() = 'authenticated');
create policy film_resources_read_all on hoops.film_resources for select using (auth.role() = 'authenticated');

-- ============================================================================
-- Seed data: scheme taxonomy is enforced app-side (a simple constant list
-- in the app, with 'custom' as the escape hatch), not a DB check
-- constraint — this keeps adding a new named scheme a one-line app change
-- rather than a migration. Run and Jump should be one of the app's
-- defensive_scheme options out of the box.
-- ============================================================================
