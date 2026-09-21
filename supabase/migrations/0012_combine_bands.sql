-- ============================================================================
-- Hardwood Lab — migration 0012: benchmark bands need a gender field
--
-- Run in the Supabase SQL Editor after seed_0011.
--
-- The combine shipped with one set of thresholds for every player. A
-- twelve year old girl and a seventeen year old boy were being scored
-- against identical numbers, which makes the resulting rating close to
-- meaningless for anyone who is not a mid-teens boy.
--
-- Age was already solvable - birth_year is collected at signup and was
-- simply never used. Gender was not stored at all, so it is added here.
--
-- Deliberately nullable and deliberately narrow in purpose: it exists to
-- pick which benchmark table a score is measured against, and nothing
-- else in the app reads it. A player who leaves it unset is scored
-- against the male table with that stated plainly in the UI, rather than
-- being guessed at silently.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

alter table hoops.players add column if not exists gender text
  check (gender in ('male', 'female'));

comment on column hoops.players.gender is
  'Selects the combine benchmark table only. Nullable; nothing else reads it.';
