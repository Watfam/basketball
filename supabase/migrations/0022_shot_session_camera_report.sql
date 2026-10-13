-- ============================================================================
-- Hardwood Lab — migration 0022: how a camera set went, kept with the set
--
-- NOT YET APPLIED. Safe to run at any time: the app saves sets without this
-- column until it exists (src/app/actions/shooting.ts drops it and retries,
-- as it did for the goal columns before 0021), and fills it in on every set
-- saved after.
--
-- camera_report is a small JSON object built on the phone when the set is
-- saved (src/lib/basketball/camera-report.ts): how many shots the camera
-- counted and how many were added by hand, how many it ringed as unsure and
-- why, how many calls were changed in review, the speed the phone ran at,
-- the size the camera settled on, the aim and the phone. It makes real use
-- measurable without anyone remembering to paste a report.
--
-- Null for every set saved before this migration, and for sets counted by
-- tapping.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

alter table hoops.shot_sessions
  add column camera_report jsonb
    check (camera_report is null or (jsonb_typeof(camera_report) = 'object' and length(camera_report::text) <= 4000));
