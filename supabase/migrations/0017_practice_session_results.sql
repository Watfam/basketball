-- ============================================================================
-- Hardwood Lab — migration 0017: practice session results
--
-- practice_plans is a template, forever re-editable, with no record that a
-- practice ever actually happened and no way to log what the team did.
-- This closes that gap with two tables: a log that a practice ran
-- (practice_sessions, carrying post-practice notes) and a numeric result
-- per drill that carries a goal (practice_drill_results) — "Olympic
-- Shooting: goal 96 in 3:00, team got 62" is exactly this shape.
--
-- Results are their own table, not JSONB on the session, on purpose:
-- unlike practice_plans.blocks (only ever read or written as part of one
-- whole plan), a result gets queried on its own across many practices —
-- "every Olympic Shooting score this season" — which wants an index and a
-- WHERE clause, not a full JSONB scan. See practice.ts's own note on
-- blocks for the same reasoning applied the other way.
--
-- Coach-only visibility, confirmed explicitly rather than assumed: mirrors
-- practice_plans_team_all exactly (owner or a coach/assistant_coach team
-- member), with no team_members_self_select equivalent for parents.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table hoops.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references hoops.teams (id) on delete cascade,
  -- Kept even if the plan is later deleted or heavily edited — the
  -- session is a record of what actually happened, not a live view of
  -- the plan as it stands today.
  plan_id uuid references hoops.practice_plans (id) on delete set null,
  plan_title text not null,
  run_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index practice_sessions_team_id_idx on hoops.practice_sessions (team_id);

create table hoops.practice_drill_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references hoops.practice_sessions (id) on delete cascade,
  -- Denormalized from the session for RLS and for querying a drill's
  -- history directly without a join.
  team_id uuid not null references hoops.teams (id) on delete cascade,
  label text not null,
  goal_target numeric,
  goal_unit text,
  actual numeric,
  created_at timestamptz not null default now()
);

create index practice_drill_results_session_id_idx on hoops.practice_drill_results (session_id);
create index practice_drill_results_team_id_label_idx on hoops.practice_drill_results (team_id, label);

alter table hoops.practice_sessions enable row level security;
alter table hoops.practice_drill_results enable row level security;

create policy practice_sessions_team_all on hoops.practice_sessions
  for all using (
    hoops.is_team_owner(practice_sessions.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = practice_sessions.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

create policy practice_drill_results_team_all on hoops.practice_drill_results
  for all using (
    hoops.is_team_owner(practice_drill_results.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = practice_drill_results.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant all on hoops.practice_sessions to anon, authenticated, service_role;
grant all on hoops.practice_drill_results to anon, authenticated, service_role;
