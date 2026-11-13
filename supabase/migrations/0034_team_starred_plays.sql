-- ============================================================================
-- Hardwood Lab - migration 0034: a team's starred plays
--
-- Starred plays ("pull it up fast on game night") lived only in the
-- phone's localStorage until now - per device, invisible to an assistant
-- coach, and gone on a new phone. They also seed the Share screen's
-- default selection, so losing them quietly changes what gets exported.
-- One row per (team, library play id), same shape as play_edits and
-- team_play_order: the static library is untouched, this is purely the
-- team's own annotation on top of it.
--
-- Team-scoped rather than per coach on purpose: a shared game-night list
-- is what an assistant coach wants to see too, and it matches every other
-- playbook table here.
--
-- RLS follows hoops.play_edits exactly (migration 0028): the owning coach,
-- or any team member with role coach or assistant_coach, can read and
-- write. A parent who can only see the roster gets nothing from this
-- table.
--
-- Safe to run twice.
--
-- To undo: supabase/rollback/0034_remove_team_starred_plays.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table if not exists hoops.team_starred_plays (
  team_id uuid not null references hoops.teams (id) on delete cascade,
  library_play_id text not null,
  created_at timestamptz not null default now(),
  primary key (team_id, library_play_id)
);

alter table hoops.team_starred_plays enable row level security;

drop policy if exists team_starred_plays_team_all on hoops.team_starred_plays;
create policy team_starred_plays_team_all on hoops.team_starred_plays
  for all using (
    hoops.is_team_owner(team_starred_plays.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = team_starred_plays.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant all on hoops.team_starred_plays to anon, authenticated, service_role;
