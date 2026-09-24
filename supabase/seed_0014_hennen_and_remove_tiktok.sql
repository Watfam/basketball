-- ============================================================================
-- Hardwood Lab — seed 0014: add Hennen Workouts, remove TikTok everywhere
--
-- Run after seed_0013_combine_bands.sql.
--
-- ON THIS TRAINER
--
-- Shane Hennen — Hennen Workouts, Des Moines. Verified live:
--   youtube.com/@Hennen_Workouts  (HTTP 200, checked 2026-09-23)
--   hennenworkouts.com            (HTTP 200, checked 2026-09-23)
-- No Instagram or TikTok handle was confirmed, so both stay null rather
-- than guessed.
--
-- His stated methodology (from his own podcast appearances and site, not
-- invented) is a four-step cycle repeated per skill: break the move down
-- in isolation, add an accountability rep with a real standard to hit,
-- add a reaction element so the move responds to a live cue, then run it
-- live. The three lessons below are built directly around that cycle
-- rather than being generic — each one is a specific step in it.
--
-- ON TIKTOK
--
-- Matt asked for every TikTok link removed and none added going forward.
-- Existing rows (Peter Danyliv, Ryan Jones) get tiktok_url nulled here.
-- The app no longer renders a TikTok link even if one were present — see
-- the code changes alongside this seed — so nulling the column is belt
-- and suspenders rather than the only guard.
--
-- Dollar quoting throughout, no apostrophes in comments: see seed_0005.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Remove TikTok links from every existing trainer
-- ----------------------------------------------------------------------------
update hoops.trainers set tiktok_url = null where tiktok_url is not null;

-- ----------------------------------------------------------------------------
-- 2. Add Shane Hennen
-- ----------------------------------------------------------------------------
insert into hoops.trainers (name, handle, youtube_url, instagram_url, tiktok_url, website_url, bio, specialty, sort_order)
values (
  $hl$Shane Hennen$hl$,
  $hl$@Hennen_Workouts$hl$,
  $hl$https://www.youtube.com/@Hennen_Workouts$hl$,
  null,
  null,
  $hl$https://hennenworkouts.com$hl$,
  $hl$Pro basketball skills trainer based in Des Moines, has worked with G-League and overseas pro players and helped more than fifty players earn college scholarships. Known for a game-based development system: break the move down, add an accountability standard, add a reaction element, then run it live.$hl$,
  array[$hl$ball_handling$hl$, $hl$shooting$hl$],
  4
)
on conflict (name) do update set
  handle = excluded.handle,
  youtube_url = excluded.youtube_url,
  instagram_url = excluded.instagram_url,
  tiktok_url = excluded.tiktok_url,
  website_url = excluded.website_url,
  bio = excluded.bio,
  specialty = excluded.specialty,
  sort_order = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 3. Three lessons, one per step of his cycle that a player can actually
--    apply alone (the fourth step, live 5-on-5, is not something a
--    library lesson can simulate).
-- ----------------------------------------------------------------------------
insert into hoops.film_resources
  (title, url, kind, difficulty, skill_tags, position_tags, watch_for, notes, trainer_id, drill_id, sort_order)
select
  v.title, null, v.kind, v.difficulty, v.skill_tags, v.position_tags, v.watch_for, v.notes,
  t.id, d.id, v.sort_order
from (values
  (
    $hl$Hennen: Break the Move Down Before You Speed It Up$hl$,
    $hl$technique$hl$, $hl$beginner$hl$, array[$hl$ball_handling$hl$], array[]::text[],
    array[
      $hl$The move done slow enough that every part of it is correct$hl$,
      $hl$Hand position and the exact angle the ball is pushed at$hl$,
      $hl$Speed only added once the slow version has no flaws left$hl$,
      $hl$No defender and no cone pressure yet - just the mechanics$hl$
    ],
    $hl$Step one of the cycle. Most players skip straight to game speed and never fix what is actually wrong with the move - this is the step that gets skipped and shouldn't be.$hl$,
    $hl$Cone Crossover Attack$hl$, 32
  ),
  (
    $hl$Hennen: The Accountability Rep$hl$,
    $hl$technique$hl$, $hl$intermediate$hl$, array[$hl$ball_handling$hl$], array[]::text[],
    array[
      $hl$A real standard for the set - a number to hit, not just reps to finish$hl$,
      $hl$What happens to the standard when the count is missed$hl$,
      $hl$Quality holding up as the set goes on, not just the first few reps$hl$,
      $hl$Eyes up throughout - the standard includes not watching the ball$hl$
    ],
    $hl$Step two. A rep with no standard is just movement. Set your own number before the set starts, and hold yourself to it the same way.$hl$,
    $hl$Two-Ball Dribbling Series$hl$, 33
  ),
  (
    $hl$Hennen: Make the Move React to Something$hl$,
    $hl$iq$hl$, $hl$advanced$hl$, array[$hl$ball_handling$hl$, $hl$shooting$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$],
    array[
      $hl$A cue - a cone knocked over, a called colour, a partner's step - that decides which move happens$hl$,
      $hl$The gap between the cue and the reaction shrinking with reps$hl$,
      $hl$The move only starting after the read, never before it$hl$,
      $hl$Live speed once the reaction is reliable$hl$
    ],
    $hl$Step three, the one that actually transfers to a game: nothing in a real possession is scripted, so a move you can only run unopposed is not finished yet.$hl$,
    $hl$Off-the-Dribble Pull-Up Series$hl$, 34
  )
) as v(title, kind, difficulty, skill_tags, position_tags, watch_for, notes, drill_name, sort_order)
join hoops.trainers t on t.name = $hl$Shane Hennen$hl$
left join hoops.drills d on d.name = v.drill_name
where not exists (
  select 1 from hoops.film_resources fr where fr.title = v.title
);
