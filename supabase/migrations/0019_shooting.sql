-- ============================================================================
-- Hardwood Lab — migration 0019: shooting sessions and shots
--
-- A shooting session is one sitting of "just shoot and see how you did":
-- a player, a label (free throws, spot-up), and an ordered list of shots,
-- each made or missed. This is the storage under both the manual
-- make/miss counter and the on-device camera tracker planned to follow.
--
-- Two decisions are made here for the camera work, not just the counter:
--
--   * made is the FINAL, human-confirmed answer. detected_made is what the
--     camera said before any correction, and stays null for a tapped
--     shot. Keeping both is what lets accuracy be measured from real use
--     later (how often did the detector agree with the player?) instead
--     of guessed at.
--
--   * shots carries player_id even though the session already has it. It
--     lets the row-level policy check ownership directly, in one hop,
--     instead of joining through shot_sessions for every row of a
--     several-hundred-shot session.
--
-- makes and attempts are stored on the session as well as derivable from
-- its shots. The history views list many sessions at once, and the API
-- returns at most 1000 rows per request, so summing shots on the client
-- would silently truncate and show wrong percentages once there are
-- enough of them. Totals on the session row keep every list query small
-- and exact. They are written by the same sync that writes the shots.
--
-- (session_id, seq) is unique so a session can be re-synced from the
-- phone any number of times without creating duplicates: the client
-- keeps the session on the device and pushes snapshots, and an upsert on
-- that key makes every push idempotent. A dropped connection or a
-- refresh can therefore never double-count or lose shots.
--
-- Same household-scoped policy shape as workout_sessions.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table hoops.shot_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references hoops.players (id) on delete cascade,
  label text,
  -- How the shots in this session were captured. A session is one or the
  -- other; a camera session can still contain corrected shots.
  source text not null default 'manual' check (source in ('manual', 'camera')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  makes int not null default 0 check (makes >= 0),
  attempts int not null default 0 check (attempts >= 0),
  notes text,
  created_at timestamptz not null default now(),
  check (makes <= attempts)
);

create index shot_sessions_player_id_started_idx
  on hoops.shot_sessions (player_id, started_at desc);

create table hoops.shots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references hoops.shot_sessions (id) on delete cascade,
  player_id uuid not null references hoops.players (id) on delete cascade,
  seq int not null check (seq >= 1),
  made boolean not null,
  zone text check (
    zone is null or zone in (
      'free_throw', 'paint', 'left_corner', 'left_wing', 'top',
      'right_wing', 'right_corner'
    )
  ),
  source text not null default 'manual' check (source in ('manual', 'camera')),
  detected_made boolean,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index shots_player_id_idx on hoops.shots (player_id);

alter table hoops.shot_sessions enable row level security;
alter table hoops.shots enable row level security;

create policy shot_sessions_household_all on hoops.shot_sessions
  for all using (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = shot_sessions.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = shot_sessions.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  );

create policy shots_household_all on hoops.shots
  for all using (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = shots.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = shots.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  );

grant all on hoops.shot_sessions to anon, authenticated, service_role;
grant all on hoops.shots to anon, authenticated, service_role;
