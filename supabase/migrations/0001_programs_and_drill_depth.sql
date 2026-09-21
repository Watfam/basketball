-- ============================================================================
-- Hardwood Lab — migration 0001: program model + real drill depth
--
-- Run this once in the Supabase SQL Editor, after schema.sql. It is
-- additive except for one deliberate change: workout_drills’ primary key
-- moves from (workout_id, drill_id) to a surrogate id, so the same drill
-- can appear in a workout more than once. That composite key made
-- "3x10 right side, 3x10 left side" literally unrepresentable — the single
-- biggest reason workouts read as "two things, three sets."
--
-- Safe to run against existing data: every existing workout_drills row
-- keeps its workout_id/drill_id and picks up a generated id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- drills: room to actually teach the drill
--
-- description stays the one-line summary shown in lists. These are what a
-- player reads on the "learn this drill" screen before starting.
-- ----------------------------------------------------------------------------
alter table hoops.drills add column if not exists setup text;
alter table hoops.drills add column if not exists cues text[] not null default '{}';
alter table hoops.drills add column if not exists common_mistakes text[] not null default '{}';

-- ----------------------------------------------------------------------------
-- workout_drills: repeats, variations, and level-aware prescriptions
-- ----------------------------------------------------------------------------
alter table hoops.workout_drills add column if not exists id uuid not null default gen_random_uuid();

alter table hoops.workout_drills drop constraint if exists workout_drills_pkey;
alter table hoops.workout_drills add primary key (id);

-- "Right side" / "Left side" / "Off one dribble" — the same drill,
-- prescribed differently. Null means the drill stands on its own.
alter table hoops.workout_drills add column if not exists variant_label text;

-- Gives a workout a shape instead of a flat list. Ordering within a
-- workout is still sort_order; block is what the UI groups on.
alter table hoops.workout_drills add column if not exists block text
  check (block in ('warmup', 'main', 'finisher'));

-- Which skill levels this entry applies to. Empty = every level (the
-- common case). This is the "swap" half of training level: a beginner and
-- an advanced player working the same workout can get different
-- variations of the same movement.
alter table hoops.workout_drills add column if not exists levels text[] not null default '{}';

-- The "scale" half: per-level sets/reps/duration, e.g.
--   {"beginner":{"sets":3,"reps":8},"advanced":{"sets":4,"reps":15}}
-- Falls back to the flat target_sets/target_reps/target_duration_seconds
-- columns when a level isn’t listed, so existing rows keep working.
alter table hoops.workout_drills add column if not exists level_targets jsonb not null default '{}'::jsonb;

create index if not exists workout_drills_workout_id_idx on hoops.workout_drills (workout_id);

-- Now that a drill can appear twice in one workout, a log that only knows
-- its drill_id can’t say WHICH entry it satisfied — logging the right-side
-- pull-up would mark the left side done too. Logs point at the specific
-- workout_drills entry instead. Nullable so existing logs stay valid.
alter table hoops.session_logs
  add column if not exists workout_drill_id uuid references hoops.workout_drills (id) on delete set null;

create index if not exists session_logs_workout_drill_idx
  on hoops.session_logs (workout_drill_id);

-- ----------------------------------------------------------------------------
-- programs: the multi-week plan a player is actually on
--
-- This is the structural shift from "menu of workouts" to "week 2, day 3."
-- A program is curated content like drills and workouts — seeded, never
-- written through the app.
-- ----------------------------------------------------------------------------
create table if not exists hoops.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  focus_areas text[] not null default '{}',
  player_type_tags jsonb not null default '{}'::jsonb,
  -- The level this program is written for. A player can still run a
  -- program above or below their level; this only drives ranking.
  level text check (level in ('beginner', 'intermediate', 'advanced')),
  week_count int not null,
  days_per_week int not null,
  created_at timestamptz not null default now()
);

-- One scheduled session: "week 3, day 2 of this program is this workout."
create table if not exists hoops.program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references hoops.programs (id) on delete cascade,
  week_number int not null,
  day_number int not null,
  workout_id uuid not null references hoops.workouts (id) on delete cascade,
  -- Progressive overload without authoring a near-identical workout for
  -- every week: the same workout, stepped up. Applied to reps (and to
  -- duration for timed drills) on top of the level-resolved target.
  volume_step int not null default 0,
  -- Planned lighter week. Shown as such rather than looking like a dip in
  -- effort on the training-load chart.
  is_deload boolean not null default false,
  note text,
  unique (program_id, week_number, day_number)
);

create index if not exists program_days_program_id_idx on hoops.program_days (program_id);

-- A player’s enrollment. Only one program should be active at a time per
-- player; enforced by a partial unique index rather than app logic.
create table if not exists hoops.player_programs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references hoops.players (id) on delete cascade,
  program_id uuid not null references hoops.programs (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists player_programs_player_id_idx on hoops.player_programs (player_id);

create unique index if not exists player_programs_one_active_idx
  on hoops.player_programs (player_id)
  where status = 'active';

-- Ties a logged session back to the scheduled day it satisfied, so
-- "which days of week 3 are done" is a query rather than a guess.
alter table hoops.workout_sessions
  add column if not exists program_day_id uuid references hoops.program_days (id) on delete set null;

create index if not exists workout_sessions_program_day_idx
  on hoops.workout_sessions (program_day_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- programs/program_days are curated content: readable by any signed-in
-- user, writable only via the service role. player_programs is per-player
-- data and follows the same household scoping as workout_sessions.
-- ----------------------------------------------------------------------------
alter table hoops.programs enable row level security;
alter table hoops.program_days enable row level security;
alter table hoops.player_programs enable row level security;

drop policy if exists programs_read_all on hoops.programs;
create policy programs_read_all on hoops.programs
  for select using (auth.role() = 'authenticated');

drop policy if exists program_days_read_all on hoops.program_days;
create policy program_days_read_all on hoops.program_days
  for select using (auth.role() = 'authenticated');

drop policy if exists player_programs_household_all on hoops.player_programs;
create policy player_programs_household_all on hoops.player_programs
  for all using (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = player_programs.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = player_programs.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  );

-- schema.sql sets default privileges for the hoops schema, so these new
-- tables inherit the grants PostgREST needs automatically. Re-granted here
-- anyway so this migration is safe to run on a database where those
-- defaults were never applied.
grant all on all tables in schema hoops to anon, authenticated, service_role;
grant all on all sequences in schema hoops to anon, authenticated, service_role;
