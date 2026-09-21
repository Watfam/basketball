-- ============================================================================
-- Hardwood Lab — migration 0010: the measured combine
--
-- Run in the Supabase SQL Editor after 0009.
--
-- Until now the entire assessment was four sliders. A player declared
-- themselves a 7 at shooting and every recommendation in the app keyed
-- off that. This adds the measured alternative: real tests with real
-- numbers, converted to the same 1-10 ratings through published
-- benchmarks, so a rating is derived rather than declared.
--
-- The self-rating path stays. It is the fast way in and the way to work
-- when there is no gym. The combine is the real one, and the app keeps
-- asking for it until it is done.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

-- A combine is an assessment, so it lands in the same table and flows
-- through the same history, charts and rankings as a self-rating.
alter table hoops.assessments drop constraint if exists assessments_kind_check;
alter table hoops.assessments add constraint assessments_kind_check
  check (kind in ('onboarding', 'checkin', 'annual', 'combine'));

-- ----------------------------------------------------------------------------
-- The tests themselves. Curated content, seeded not app-written.
-- ----------------------------------------------------------------------------
create table if not exists hoops.assessment_drills (
  id uuid primary key default gen_random_uuid(),
  -- Stable slug, so results survive a drill being renamed.
  key text not null unique,
  name text not null,
  -- Which of the four player-card ratings this test feeds.
  category text not null check (category in ('ball_handling', 'shooting', 'defense', 'athleticism')),
  setup text,
  cues text[] not null default '{}',
  equipment text[] not null default '{}',
  -- makes_of: made shots out of a fixed number of attempts
  -- count:    how many in a fixed time
  -- seconds:  time to complete, faster is better
  -- inches:   a measured height
  metric text not null check (metric in ('makes_of', 'count', 'seconds', 'inches')),
  attempts int,
  -- True for timed tests, where a smaller number is a better score.
  lower_is_better boolean not null default false,
  -- Ten ascending score thresholds, one per rating point. Stored as JSONB
  -- rather than columns so age bands can be added later without a
  -- migration - see the note in the seed about calibration.
  benchmarks jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- One recorded score. Tied to the assessment it was taken in, so a
-- combine six weeks later is directly comparable test by test.
-- ----------------------------------------------------------------------------
create table if not exists hoops.assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references hoops.assessments (id) on delete cascade,
  assessment_drill_id uuid not null references hoops.assessment_drills (id) on delete cascade,
  raw_score numeric not null,
  -- The 1-10 the raw score converted to, stored rather than recomputed so
  -- history stays honest if the benchmarks are ever recalibrated.
  derived_rating int not null check (derived_rating between 1 and 10),
  created_at timestamptz not null default now(),
  unique (assessment_id, assessment_drill_id)
);

create index if not exists assessment_results_assessment_idx
  on hoops.assessment_results (assessment_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table hoops.assessment_drills enable row level security;
alter table hoops.assessment_results enable row level security;

drop policy if exists assessment_drills_read_all on hoops.assessment_drills;
create policy assessment_drills_read_all on hoops.assessment_drills
  for select using (auth.role() = 'authenticated');

-- Results inherit the access rules of the assessment they belong to,
-- which in turn belongs to a player in the caller household.
drop policy if exists assessment_results_household_all on hoops.assessment_results;
create policy assessment_results_household_all on hoops.assessment_results
  for all using (
    exists (
      select 1 from hoops.assessments a
      join hoops.players p on p.id = a.player_id
      join hoops.households h on h.id = p.household_id
      where a.id = assessment_results.assessment_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.assessments a
      join hoops.players p on p.id = a.player_id
      join hoops.households h on h.id = p.household_id
      where a.id = assessment_results.assessment_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  );

grant all on all tables in schema hoops to anon, authenticated, service_role;
grant all on all sequences in schema hoops to anon, authenticated, service_role;
