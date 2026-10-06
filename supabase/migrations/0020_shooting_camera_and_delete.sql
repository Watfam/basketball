-- ============================================================================
-- Hardwood Lab — migration 0020: camera counting, coach test sessions,
-- delete with undo
--
-- Plan: docs/camera-shot-counting-plan.md, section 4. Everything here is
-- additive; sessions saved before it keep working unchanged.
--
--   * deleted_at: a player can delete a session (a set done by mistake,
--     or just messing around). The row is only marked, so the six-second
--     Undo can bring it back, and every list and total skips marked rows
--     at once. The app removes marked rows for good after 10 days (see
--     purge_deleted_shot_sessions below), which leaves room to recover a
--     mistaken delete without keeping junk forever.
--
--   * is_test, owner_id: the coach can run test and calibration sessions
--     with the camera. They are kept, as a history under Camera lab, but
--     belong to no player and so can never reach a player total. A test
--     session has no player_id and is owned by the coach account instead;
--     a real session is the reverse. The check constraint holds that.
--
--   * drill: spot-up, free throws, game shots, so progress can be
--     filtered by what was practised. label stays as free text.
--
--   * rule_version, model_version: which counting software made the
--     camera calls, so accuracy can be compared before and after an update.
--
--   * rim_x, rim_y: where the rim was tapped, as fractions of the frame.
--     For diagnosing a bad session only.
--
--   * shots.flagged: the camera marked the shot as worth a look.
--     shots.added_by_hand: a shot the camera missed, added in review.
--     shots.t_ms: time into the session, the key for finding its replay.
--     Corrected is already derivable: made differs from detected_made.
--
--   * calibration_runs: the coach shoots a set, writes down the true
--     results, and the app stores how often the camera agreed.
--
-- Kids share the parent login, so a player deleting only their own
-- sessions is a rule in the app screens, not a security boundary. The
-- policies below stay household-wide, as before.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- shot_sessions
-- ---------------------------------------------------------------------------

alter table hoops.shot_sessions
  add column deleted_at timestamptz,
  add column is_test boolean not null default false,
  add column owner_id uuid references auth.users (id) on delete cascade,
  add column drill text check (drill is null or drill in ('spot_up', 'free_throws', 'game_shots')),
  add column rule_version text,
  add column model_version text,
  add column rim_x numeric check (rim_x is null or (rim_x >= 0 and rim_x <= 1)),
  add column rim_y numeric check (rim_y is null or (rim_y >= 0 and rim_y <= 1));

alter table hoops.shot_sessions alter column player_id drop not null;

alter table hoops.shot_sessions
  add constraint shot_sessions_player_or_test check (
    (is_test and player_id is null and owner_id is not null)
    or (not is_test and player_id is not null)
  );

-- Lists only ever want live sessions, newest first.
create index shot_sessions_live_idx
  on hoops.shot_sessions (player_id, started_at desc)
  where deleted_at is null;

create index shot_sessions_test_idx
  on hoops.shot_sessions (owner_id, started_at desc)
  where is_test;

-- ---------------------------------------------------------------------------
-- shots
-- ---------------------------------------------------------------------------

alter table hoops.shots
  add column flagged boolean not null default false,
  add column added_by_hand boolean not null default false,
  add column t_ms int check (t_ms is null or t_ms >= 0);

-- A test session has no player, so neither do its shots.
alter table hoops.shots alter column player_id drop not null;

-- ---------------------------------------------------------------------------
-- Policies: the household ones from 0019 still cover player sessions.
-- Test sessions and their shots belong to the account that made them.
-- ---------------------------------------------------------------------------

create policy shot_sessions_test_owner on hoops.shot_sessions
  for all using (is_test and owner_id = auth.uid())
  with check (is_test and owner_id = auth.uid());

create policy shots_test_owner on hoops.shots
  for all using (
    player_id is null and exists (
      select 1 from hoops.shot_sessions s
      where s.id = shots.session_id and s.is_test and s.owner_id = auth.uid()
    )
  )
  with check (
    player_id is null and exists (
      select 1 from hoops.shot_sessions s
      where s.id = shots.session_id and s.is_test and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- calibration_runs
-- ---------------------------------------------------------------------------

create table hoops.calibration_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- calibration: a set shot for the purpose, with written results.
  -- spot_check: real sessions judged afterwards from their replays.
  kind text not null default 'calibration' check (kind in ('calibration', 'spot_check')),
  -- The test session the camera counted, when there is one.
  session_id uuid references hoops.shot_sessions (id) on delete set null,
  hoop_label text,
  rule_version text,
  model_version text,
  shots int not null check (shots >= 0),
  agreed int not null check (agreed >= 0 and agreed <= shots),
  camera_makes int not null check (camera_makes >= 0),
  true_makes int not null check (true_makes >= 0),
  -- One entry per shot: what the camera said and what really happened.
  per_shot jsonb not null default '[]'::jsonb,
  notes text
);

create index calibration_runs_created_by_idx
  on hoops.calibration_runs (created_by, created_at desc);

alter table hoops.calibration_runs enable row level security;

create policy calibration_runs_owner on hoops.calibration_runs
  for all using (created_by = auth.uid())
  with check (created_by = auth.uid());

grant all on hoops.calibration_runs to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Removing deleted sessions for good after 10 days.
--
-- Called by the app when the shooting pages load, rather than by a
-- scheduled job: no extension to enable and nothing to pay for. It runs as
-- the caller, so row-level security limits it to sessions that caller can
-- already see. Shots go with their session (on delete cascade).
-- ---------------------------------------------------------------------------

create or replace function hoops.purge_deleted_shot_sessions()
returns int
language sql
security invoker
set search_path = hoops, public
as $$
  with gone as (
    delete from hoops.shot_sessions
    where deleted_at is not null
      and deleted_at < now() - interval '10 days'
    returning 1
  )
  select count(*)::int from gone;
$$;

grant execute on function hoops.purge_deleted_shot_sessions() to authenticated;
