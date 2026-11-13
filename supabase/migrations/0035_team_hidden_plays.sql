-- ============================================================================
-- Hardwood Lab - migration 0035: plays a team has hidden from its playbook
--
-- The play library is code, shared by every team, so a coach cannot delete
-- a play from it - and should not have to. What a coach wants is "we are
-- never running this, get it out of my way." One row per (team, library
-- play id) says exactly that: the play stays in the library and keeps any
-- edits the team made, it just stops showing in the playbook, the Share
-- screen and the PDF. Deleting the row brings it back, edits intact.
--
-- Same shape and RLS as hoops.team_starred_plays (migration 0034) and
-- hoops.play_edits (0028): the owning coach, or any team member with role
-- coach or assistant_coach, can read and write.
--
-- Safe to run twice.
--
-- To undo: supabase/rollback/0035_remove_team_hidden_plays.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table if not exists hoops.team_hidden_plays (
  team_id uuid not null references hoops.teams (id) on delete cascade,
  library_play_id text not null,
  created_at timestamptz not null default now(),
  primary key (team_id, library_play_id)
);

alter table hoops.team_hidden_plays enable row level security;

drop policy if exists team_hidden_plays_team_all on hoops.team_hidden_plays;
create policy team_hidden_plays_team_all on hoops.team_hidden_plays
  for all using (
    hoops.is_team_owner(team_hidden_plays.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = team_hidden_plays.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant all on hoops.team_hidden_plays to anon, authenticated, service_role;
