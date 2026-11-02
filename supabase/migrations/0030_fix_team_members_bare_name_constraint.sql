-- ============================================================================
-- Hardwood Lab — migration 0030: fix the bare-roster-name check constraint
--
-- Run in the Supabase SQL Editor.
--
-- Root cause: migration 0015 tried to find and drop the ORIGINAL unnamed
-- check constraint on hoops.team_members (the one requiring player_id for
-- every role = 'player' row) before adding the new, looser
-- team_members_role_shape_check that also accepts a bare roster_name. Its
-- lookup used a case-sensitive LIKE against "player_id is not null", but
-- Postgres actually stores and renders constraint definitions as
-- "player_id IS NOT NULL" (and with a ::text cast on the string literal) —
-- the pattern never matched, the drop silently found nothing, and the
-- original restrictive constraint (auto-named "team_members_check") has
-- been sitting there ever since, alongside the new one. Both constraints
-- must hold for a row to be valid, so the old one has been quietly
-- blocking every bare-name (no player_id) insert since 0015 shipped — it
-- just never got exercised until now.
--
-- This finds that same constraint again with a case-insensitive match,
-- drops it, and makes sure the correct permissive constraint is actually
-- in place (it likely already is, from 0015's own "add constraint" line,
-- which never depended on the broken drop above it — this just avoids
-- assuming that and erroring if it's somehow missing too).
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

do $body$
declare
  bad_constraint text;
begin
  for bad_constraint in
    select conname
    from pg_constraint
    where conrelid = $gm$hoops.team_members$gm$::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike $gm$%role = 'player'%player_id is not null%$gm$
      and pg_get_constraintdef(oid) not ilike $gm$%roster_name%$gm$
  loop
    execute format('alter table hoops.team_members drop constraint %I', bad_constraint);
  end loop;
end;
$body$;

do $body$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = $gm$hoops.team_members$gm$::regclass
      and conname = $gm$team_members_role_shape_check$gm$
  ) then
    alter table hoops.team_members add constraint team_members_role_shape_check check (
      (role = 'player' and (player_id is not null or roster_name is not null))
      or (role in ('coach', 'assistant_coach') and user_id is not null)
    );
  end if;
end;
$body$;
