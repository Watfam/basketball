-- ============================================================================
-- Hardwood Lab - migration 0033: a team's own edit of its printed Team
-- Philosophy page
--
-- The Team Philosophy front-matter page (src/lib/plays/philosophy.ts) is
-- static code, the same as every library play was before migration 0028 -
-- Matt asked for a place in the app to add or edit it. Unlike a play,
-- philosophy has no frames or diagram, so the whole thing (every pillar,
-- each with a title and its bullet points) lives in one JSONB column, one
-- row per team. No row yet means "use the hardcoded defaults" - this table
-- only ever holds a team's override, same relationship play_edits has to
-- the static library.
--
-- RLS follows hoops.play_edits exactly (migration 0028): the owning coach,
-- or any team member with role coach or assistant_coach, can read and
-- write. A parent who can only see the roster gets nothing from this
-- table.
--
-- Safe to run twice.
--
-- To undo: supabase/rollback/0033_remove_team_philosophy.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table if not exists hoops.team_philosophy (
  team_id uuid primary key references hoops.teams (id) on delete cascade,
  pillars jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table hoops.team_philosophy enable row level security;

drop policy if exists team_philosophy_team_all on hoops.team_philosophy;
create policy team_philosophy_team_all on hoops.team_philosophy
  for all using (
    hoops.is_team_owner(team_philosophy.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = team_philosophy.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant all on hoops.team_philosophy to anon, authenticated, service_role;
