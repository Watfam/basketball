-- ============================================================================
-- Hardwood Lab — migration 0009: household link overrides for curated film
--
-- Run in the Supabase SQL Editor after seed_0008.
--
-- The curated lessons ship without video URLs on purpose, and the Add
-- film flow only ever created a brand new row. So there was no way to put
-- a link on an existing lesson: a player who found the perfect clip for
-- "Creating Separation Off the Bounce" could only create a second,
-- separate entry beside it. The sheet even told them to do that, which
-- was wrong.
--
-- Curated rows cannot be edited directly - they are service-role only, and
-- they should stay shared rather than being mutated by whoever happens to
-- paste a link first. So a household attaches its own URL alongside the
-- curated lesson, and the app prefers that override when showing it.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

create table if not exists hoops.film_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references hoops.households (id) on delete cascade,
  film_resource_id uuid not null references hoops.film_resources (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now(),
  unique (household_id, film_resource_id)
);

create index if not exists film_links_household_idx on hoops.film_links (household_id);

alter table hoops.film_links enable row level security;

drop policy if exists film_links_household_all on hoops.film_links;
create policy film_links_household_all on hoops.film_links
  for all using (
    exists (
      select 1 from hoops.households h
      where h.id = film_links.household_id and h.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from hoops.households h
      where h.id = film_links.household_id and h.owner_id = auth.uid()
    )
  );

grant all on all tables in schema hoops to anon, authenticated, service_role;
grant all on all sequences in schema hoops to anon, authenticated, service_role;
