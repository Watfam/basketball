-- ============================================================================
-- Hardwood Lab - migration 0029: editing the master copy of a library play
--
-- Migration 0028 gave a team its own private edit of a library play,
-- layered on top of the hardcoded entry in src/lib/plays/library.ts. Matt
-- wants more than that: the ability to actually correct the shared
-- baseline itself, so every team starts from the fixed version, not just
-- his own team's local workaround.
--
-- hoops.play_library_overrides is that shared baseline change: one row
-- per library play id, no team_id, because it is not anyone's private
-- copy - it is a replacement for the hardcoded entry, for everyone. The
-- real priority order a play is resolved in, read-side, is:
--   1. the hardcoded entry in library.ts (the code default)
--   2. this table, if a row exists for that play id (the corrected default)
--   3. hoops.play_edits for the viewing team, if a row exists (their own
--      local tweak, which still wins even over a corrected default - a
--      team that deliberately deviated is not silently reset by someone
--      else fixing the baseline)
--
-- Read access matches the thing it overrides: library.ts itself ships to
-- every signed-in user's browser as ordinary app code, so a correction to
-- it is exactly as public. Write access is any coach on any team (owner,
-- or team_members role coach/assistant_coach) - there is no natural
-- team_id to scope a global table by, so the check is "are you a coach
-- anywhere," matching who can already write hoops.play_edits for their
-- own team.
--
-- Safe to run twice.
--
-- To undo: supabase/rollback/0029_remove_play_library_overrides.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table if not exists hoops.play_library_overrides (
  id uuid primary key default gen_random_uuid(),
  library_play_id text not null unique,
  name text not null,
  vs text not null,
  about text not null,
  keys jsonb not null default '[]'::jsonb,
  frames jsonb not null,
  created_at timestamptz not null default now()
);

alter table hoops.play_library_overrides enable row level security;

drop policy if exists play_library_overrides_read on hoops.play_library_overrides;
create policy play_library_overrides_read on hoops.play_library_overrides
  for select using (auth.role() = 'authenticated');

drop policy if exists play_library_overrides_coach_write on hoops.play_library_overrides;
create policy play_library_overrides_coach_write on hoops.play_library_overrides
  for all using (
    exists (select 1 from hoops.teams t where t.owner_id = auth.uid())
    or exists (
      select 1 from hoops.team_members tm
      where tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant all on hoops.play_library_overrides to anon, authenticated, service_role;
