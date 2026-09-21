-- ============================================================================
-- Hardwood Lab — migration 0007: film study sessions
--
-- Run in the Supabase SQL Editor after seed_0006_pro_film.sql.
--
-- A film session is a short, ordered course: three or four lessons built
-- around one idea, worked through in sequence. It exists so studying the
-- game is its own activity rather than something bolted onto a workout.
-- Film attached to a drill stays exactly as it is - that is the cue you
-- read before a rep. This is the opposite case: sitting down to learn how
-- the game is played.
--
-- Note this file uses dollar quoting for every literal and no apostrophes
-- in comments. See migration 0005: doubled-apostrophe escapes do not
-- survive the editor paste path reliably.
-- ============================================================================

create table if not exists hoops.film_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  -- What a player walks away able to do. Shown as the promise of the
  -- session, and worth writing carefully.
  outcome text,
  skill_tags text[] not null default '{}',
  position_tags text[] not null default '{}',
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hoops.film_session_items (
  id uuid primary key default gen_random_uuid(),
  film_session_id uuid not null references hoops.film_sessions (id) on delete cascade,
  film_resource_id uuid not null references hoops.film_resources (id) on delete cascade,
  sort_order int not null default 0,
  -- A question to hold in mind for this specific lesson within this
  -- specific session. The same clip can teach different things depending
  -- on what the session is about.
  prompt text,
  unique (film_session_id, film_resource_id)
);

create index if not exists film_session_items_session_idx
  on hoops.film_session_items (film_session_id);

-- Progress through a study session, so it can be resumed and so the Film
-- Room can show what is finished.
create table if not exists hoops.film_session_progress (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references hoops.players (id) on delete cascade,
  film_session_id uuid not null references hoops.film_sessions (id) on delete cascade,
  completed_at timestamptz,
  takeaway text,
  started_at timestamptz not null default now(),
  unique (player_id, film_session_id)
);

create index if not exists film_session_progress_player_idx
  on hoops.film_session_progress (player_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table hoops.film_sessions enable row level security;
alter table hoops.film_session_items enable row level security;
alter table hoops.film_session_progress enable row level security;

drop policy if exists film_sessions_read_all on hoops.film_sessions;
create policy film_sessions_read_all on hoops.film_sessions
  for select using (auth.role() = 'authenticated');

drop policy if exists film_session_items_read_all on hoops.film_session_items;
create policy film_session_items_read_all on hoops.film_session_items
  for select using (auth.role() = 'authenticated');

drop policy if exists film_session_progress_household_all on hoops.film_session_progress;
create policy film_session_progress_household_all on hoops.film_session_progress
  for all using (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = film_session_progress.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = film_session_progress.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  );

grant all on all tables in schema hoops to anon, authenticated, service_role;
grant all on all sequences in schema hoops to anon, authenticated, service_role;
