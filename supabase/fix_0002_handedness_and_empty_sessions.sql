-- ============================================================================
-- Hardwood Lab — fix 0002
--
-- Two corrections to data already in the database. Run in the Supabase
-- SQL Editor after seed_program_shot_builder.sql.
--
-- READ THE SECOND SECTION BEFORE RUNNING: it deletes workout sessions.
-- It only deletes sessions with zero logged drills (no recorded work), but
-- it is still a delete — run the SELECT above it first if you want to see
-- exactly what will go.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Form shooting is a shooting-hand-only drill
--
-- The original seed prescribed it for both hands, which teaches a release
-- the player will never use in a game. Handedness variants belong on
-- dribbling, layups and floaters — not on form shooting.
--
-- Note this does NOT touch the pull-up "Right side / Left side" entries:
-- those are floor position, not shooting hand, and should stay.
-- ----------------------------------------------------------------------------
delete from hoops.workout_drills wd
using hoops.drills d
where wd.drill_id = d.id
  and d.name = 'One-Hand Form Shooting'
  and wd.variant_label = 'Left hand';

update hoops.workout_drills wd
set variant_label = 'Shooting hand'
from hoops.drills d
where wd.drill_id = d.id
  and d.name = 'One-Hand Form Shooting'
  and wd.variant_label = 'Right hand';

update hoops.drills
set description = 'Close-range one-hand shooting with the shooting hand only, to clean up release mechanics.',
    setup = 'Shooting hand only — never the off hand. Start three feet from the rim, directly in front. Guide hand behind your back or resting on your hip.'
where name = 'One-Hand Form Shooting';

-- ----------------------------------------------------------------------------
-- 2. Remove sessions that recorded no work
--
-- "Finish workout now" marked a session completed even with nothing
-- logged, and backing out of a workout left an empty in-progress session
-- behind. Both inflate the streak, the session count, the milestones and
-- the training-load charts with sessions where no work happened.
--
-- The app no longer creates these (an empty session is discarded rather
-- than saved or completed), but existing ones need clearing out.
--
-- Preview exactly what this removes before running the delete:
--
--   select ws.id, w.name, ws.status, ws.started_at
--   from hoops.workout_sessions ws
--   left join hoops.workouts w on w.id = ws.workout_id
--   where not exists (
--     select 1 from hoops.session_logs sl where sl.session_id = ws.id
--   )
--   order by ws.started_at desc;
--
-- ----------------------------------------------------------------------------
delete from hoops.workout_sessions ws
where not exists (
  select 1 from hoops.session_logs sl where sl.session_id = ws.id
);
