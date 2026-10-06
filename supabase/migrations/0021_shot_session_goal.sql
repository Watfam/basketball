-- ============================================================================
-- Hardwood Lab — migration 0021: the goal a shooting set was shot to
--
-- A set can end itself at a goal chosen before it starts (shots taken,
-- makes, minutes, or makes in a row; src/lib/basketball/goals.ts). Storing
-- it lets history say "Make 10 in 13 shots" rather than only 10/13, and
-- whether the goal was reached or the set was ended early.
--
-- All three are null for a set shot with no goal, and for every set saved
-- before this migration.
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

alter table hoops.shot_sessions
  add column goal_kind text check (goal_kind is null or goal_kind in ('shots', 'makes', 'time', 'streak')),
  add column goal_target int check (goal_target is null or goal_target > 0),
  add column goal_reached boolean,
  add constraint shot_sessions_goal_complete check ((goal_kind is null) = (goal_target is null));
