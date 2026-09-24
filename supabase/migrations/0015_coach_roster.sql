-- ============================================================================
-- Hardwood Lab — migration 0015: coach & team tools, part 1 (roster)
--
-- Run in the Supabase SQL Editor after seed_0014.
--
-- teams / team_members / practice_plans / game_plans / scouting_notes have
-- existed in the schema since the very first migration, with RLS already
-- written for all five. None of them ever got an app layer. This is the
-- start of building it — the block deferred five separate times because
-- every session had player-side work that felt more urgent.
--
-- The one real gap in the existing design: team_members.player_id is a
-- foreign key into hoops.players, and hoops.players.household_id is NOT
-- NULL - every player row requires a household. A real roster has ten to
-- fifteen kids, and most of their families will never sign up for this
-- app. Forcing a shell household per unlinked kid would be fake data and
-- would also break the "one user, one household" assumption the
-- dashboard already makes elsewhere.
--
-- So a roster entry can now stand on its own: a name and a position with
-- no player_id at all. If that family later joins Hardwood Lab, the
-- coach links the two rows together and the roster entry starts pulling
-- from the real profile - see roster_linked_player_id below.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

alter table hoops.team_members add column if not exists roster_name text;
alter table hoops.team_members add column if not exists roster_position text
  check (roster_position in (
    'point_guard', 'shooting_guard', 'combo_guard',
    'small_forward', 'power_forward', 'center'
  ));

-- The upgrade path once a roster-only kid's family signs up: their real
-- player row gets linked here rather than the roster entry being deleted
-- and recreated, so jersey number and any history on this row survive.
alter table hoops.team_members add column if not exists roster_linked_player_id uuid
  references hoops.players (id) on delete set null;

-- The original constraint required a player role to carry player_id.
-- Loosened to accept a roster-only name instead - one or the other, not
-- neither. The unnamed table-level check from the original create table
-- got an auto-generated name, so this finds it by definition instead of
-- guessing what Postgres called it.
do $body$
declare
  found_name text;
begin
  select conname into found_name
  from pg_constraint
  where conrelid = 'hoops.team_members'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%role = ''player''%player_id is not null%';

  if found_name is not null then
    execute format('alter table hoops.team_members drop constraint %I', found_name);
  end if;
end;
$body$;

alter table hoops.team_members add constraint team_members_role_shape_check check (
  (role = 'player' and (player_id is not null or roster_name is not null))
  or (role in ('coach', 'assistant_coach') and user_id is not null)
);

grant all on all tables in schema hoops to anon, authenticated, service_role;
