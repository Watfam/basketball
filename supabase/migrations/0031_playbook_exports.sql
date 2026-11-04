-- ============================================================================
-- Hardwood Lab - migration 0031: shareable playbook export links
--
-- The in-app "Open playbook" export (src/lib/plays/export/) builds a fully
-- self-contained HTML page per coach request. That worked as a live tab, but
-- a downloaded copy of it hits a hard iOS wall: Quick Look (what opens any
-- local HTML file, however it got onto the device) disables JavaScript for
-- anything it previews, so a saved or shared *file* never actually animates
-- on an iPhone, no matter the save path. A real https link has no such
-- problem - tapping one just opens a normal, live webpage on any device.
--
-- So a generated export is now also saved here, once, as a row keyed by a
-- random id, and served back publicly (no login) at that id - the whole
-- point is a link a coach can text to a player who has no account at all.
-- The HTML itself is frozen at generation time (a teaching snapshot, not a
-- live-updating document) - editing a play later never silently changes a
-- link someone already has.
--
-- RLS is intentionally asymmetric: anyone can SELECT a specific row (the id
-- itself, an unguessable uuid, is the only thing gating access - the same
-- trust model as any other "link to view" share), but only a coach or the
-- team owner can INSERT a new one, same role check as hoops.play_edits
-- (migration 0028).
--
-- Safe to run twice.
--
-- To undo: supabase/rollback/0031_remove_playbook_exports.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table if not exists hoops.playbook_exports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references hoops.teams (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  html text not null,
  created_at timestamptz not null default now()
);

create index if not exists playbook_exports_team_id_idx on hoops.playbook_exports (team_id);

alter table hoops.playbook_exports enable row level security;

-- Anyone holding the link can view that one export - no team membership or
-- login required, since this exists specifically for people with no app
-- access at all (players, parents).
drop policy if exists playbook_exports_select_public on hoops.playbook_exports;
create policy playbook_exports_select_public on hoops.playbook_exports
  for select using (true);

-- Only a coach on the team (or its owner) can create one.
drop policy if exists playbook_exports_insert_coach on hoops.playbook_exports;
create policy playbook_exports_insert_coach on hoops.playbook_exports
  for insert with check (
    hoops.is_team_owner(team_id)
    or exists (
      select 1 from hoops.team_members tm
      where tm.team_id = playbook_exports.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('coach', 'assistant_coach')
    )
  );

grant select, insert on hoops.playbook_exports to anon, authenticated, service_role;
