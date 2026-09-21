-- ============================================================================
-- Hardwood Lab — migration 0004: Film Room
--
-- Run in the Supabase SQL Editor after seed_0003.
--
-- The design premise: passively watching clips teaches very little. What
-- teaches is (a) knowing what to look for before you press play, (b)
-- seeing the film at the moment you’re about to do the drill, and (c)
-- writing down what you’re taking into the session. The schema is built
-- around those three, not around storing links.
--
-- Notably `url` becomes nullable. A curated lesson is worth having before
-- a verified video link exists for it — and inventing a plausible-looking
-- YouTube URL is worse than having none, because a dead link that looks
-- real costs a kid their trust in everything else here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- trainers
--
-- First-class rather than the free-text source_trainer string, so channel
-- links live in one place and "show me everything from this trainer" is a
-- query. Curated content only — seeded, not written through the app.
-- ----------------------------------------------------------------------------
create table if not exists hoops.trainers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  handle text,
  -- Every link here must be a verified, real channel. If a trainer’s
  -- channel can’t be confirmed, the column stays null and the UI simply
  -- doesn’t offer a link.
  youtube_url text,
  instagram_url text,
  tiktok_url text,
  website_url text,
  bio text,
  specialty text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- film_resources upgrades
-- ----------------------------------------------------------------------------
alter table hoops.film_resources alter column url drop not null;

alter table hoops.film_resources add column if not exists trainer_id uuid references hoops.trainers (id) on delete set null;

-- The drill this film teaches. Set, and the film surfaces inside the
-- session on that drill — film at the moment of doing, which is the
-- single highest-value placement it has.
alter table hoops.film_resources add column if not exists drill_id uuid references hoops.drills (id) on delete set null;

alter table hoops.film_resources add column if not exists kind text
  check (kind in ('technique', 'pro_study', 'iq', 'mentality'));

alter table hoops.film_resources add column if not exists difficulty text
  check (difficulty in ('beginner', 'intermediate', 'advanced'));

alter table hoops.film_resources add column if not exists duration_seconds int;

-- The lesson itself: what to actually look for. This is what separates
-- study from scrolling, and it’s useful even before a link exists.
alter table hoops.film_resources add column if not exists watch_for text[] not null default '{}';

alter table hoops.film_resources add column if not exists sort_order int not null default 0;

-- Null = curated library content, visible to everyone. Set = added by
-- that household and visible only to them. Lets a parent add their own
-- film without it leaking into anyone else’s library, and without giving
-- the app write access to the curated set.
alter table hoops.film_resources add column if not exists added_by_household_id uuid
  references hoops.households (id) on delete cascade;

create index if not exists film_resources_drill_idx on hoops.film_resources (drill_id);
create index if not exists film_resources_household_idx on hoops.film_resources (added_by_household_id);

-- ----------------------------------------------------------------------------
-- film_views
--
-- Watch state plus the takeaway. The takeaway is the point: "what am I
-- taking into my next session" is the step that turns watching into
-- learning, and it gives the player something to re-read later.
-- ----------------------------------------------------------------------------
create table if not exists hoops.film_views (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references hoops.players (id) on delete cascade,
  film_resource_id uuid not null references hoops.film_resources (id) on delete cascade,
  watched_at timestamptz not null default now(),
  takeaway text,
  unique (player_id, film_resource_id)
);

create index if not exists film_views_player_idx on hoops.film_views (player_id);

-- Film attached to a scheduled day — "watch this before today’s
-- session." Ties study to the training plan instead of leaving it as a
-- separate thing a kid has to remember to go and do.
alter table hoops.program_days add column if not exists film_resource_id uuid
  references hoops.film_resources (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table hoops.trainers enable row level security;
alter table hoops.film_views enable row level security;

drop policy if exists trainers_read_all on hoops.trainers;
create policy trainers_read_all on hoops.trainers
  for select using (auth.role() = 'authenticated');

-- Replaces the old blanket read-all: curated rows stay visible to
-- everyone, household-added rows only to that household.
drop policy if exists film_resources_read_all on hoops.film_resources;
create policy film_resources_read_curated_or_own on hoops.film_resources
  for select using (
    added_by_household_id is null
    or exists (
      select 1 from hoops.households h
      where h.id = film_resources.added_by_household_id and h.owner_id = auth.uid()
    )
  );

-- A household can manage only the film it added. Curated rows
-- (added_by_household_id is null) stay service-role only.
drop policy if exists film_resources_own_write on hoops.film_resources;
create policy film_resources_own_write on hoops.film_resources
  for all using (
    added_by_household_id is not null
    and exists (
      select 1 from hoops.households h
      where h.id = film_resources.added_by_household_id and h.owner_id = auth.uid()
    )
  )
  with check (
    added_by_household_id is not null
    and exists (
      select 1 from hoops.households h
      where h.id = film_resources.added_by_household_id and h.owner_id = auth.uid()
    )
  );

drop policy if exists film_views_household_all on hoops.film_views;
create policy film_views_household_all on hoops.film_views
  for all using (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = film_views.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from hoops.players p
      join hoops.households h on h.id = p.household_id
      where p.id = film_views.player_id
        and (h.owner_id = auth.uid() or p.linked_user_id = auth.uid())
    )
  );

grant all on all tables in schema hoops to anon, authenticated, service_role;
grant all on all sequences in schema hoops to anon, authenticated, service_role;
