-- ============================================================================
-- Hardwood Lab - migration 0032: a team's own play order
--
-- Matt wants to rearrange plays within a category (all BLOB plays together,
-- in whatever order he wants them) on the real Playbook screen itself, not
-- just as a one-off step before generating a download link - and have it
-- remembered. One row per team, holding the WHOLE team's preferred play
-- order as a plain JSONB array of library play ids, in order. A play not
-- present in the array simply keeps its natural (library.ts) position,
-- appended after every explicitly-ordered play - so adding a new play to
-- the library never requires touching every team's saved order first.
--
-- A single array rather than one row per (team, play): the coach always
-- rewrites the whole order at once when dragging/moving something, so
-- there is no per-row state to reconcile, and reading "this team's order"
-- is one row, not N.
--
-- RLS follows hoops.play_edits exactly (migration 0028): the owning coach,
-- or any team member with role coach or assistant_coach, can read and
-- write. A parent gets nothing from this table.
--
-- Safe to run twice.
--
-- To undo: supabase/rollback/0032_remove_team_play_order.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table if not exists hoops.team_play_order (
  team_id uuid primary key references hoops.teams (id) on delete cascade,
  play_order jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table hoops.team_play_order enable row level security;

drop policy if exists team_play_order_team_all on hoops.team_play_order;
create policy team_play_order_team_all on hoops.team_play_order
  for all using (
    hoops.is_team_owner(team_play_order.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = team_play_order.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant all on hoops.team_play_order to anon, authenticated, service_role;
