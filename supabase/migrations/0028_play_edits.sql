-- ============================================================================
-- Hardwood Lab - migration 0028: a team's own edits to a library play
--
-- The playbook (src/lib/plays/library.ts) is static code, the same for
-- every team, with no table behind it until now. Matt asked for an edit
-- button on a play's view screen - the name, the description, the coaching
-- points, and the frame-by-frame positions all need to be changeable and
-- stay changed. A team's edit of a library play is one row per (team,
-- library play id): the whole edited shape (name, vs, about, keys, frames)
-- lives in one JSONB column each where it is not a single scalar, since the
-- app already has a complete TypeScript shape for a play and there is
-- nothing to gain from exploding frames into their own table only to
-- reassemble them on every read.
--
-- Only ever an override: the static library entry is untouched and stays
-- the fallback for every team that has not edited this specific play.
-- Deleting a team deletes its own edits with it. One edit row per (team,
-- play) - saving again updates the same row rather than piling up history.
--
-- RLS follows hoops.games exactly (migration 0018): the owning coach, or
-- any team member with role coach or assistant_coach, can read and write.
-- A parent who can only see the roster gets nothing from this table.
--
-- Safe to run twice.
--
-- To undo: supabase/rollback/0028_remove_play_edits.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table if not exists hoops.play_edits (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references hoops.teams (id) on delete cascade,
  library_play_id text not null,
  name text not null,
  vs text not null,
  about text not null,
  keys jsonb not null default '[]'::jsonb,
  frames jsonb not null,
  created_at timestamptz not null default now(),
  unique (team_id, library_play_id)
);

create index if not exists play_edits_team_id_idx on hoops.play_edits (team_id);

alter table hoops.play_edits enable row level security;

drop policy if exists play_edits_team_all on hoops.play_edits;
create policy play_edits_team_all on hoops.play_edits
  for all using (
    hoops.is_team_owner(play_edits.team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = play_edits.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant all on hoops.play_edits to anon, authenticated, service_role;
