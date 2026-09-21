-- ============================================================================
-- Hardwood Lab — seed 0003: depth for the original content, plus a second
-- program.
--
-- Run in the Supabase SQL Editor after fix_0002. Two jobs:
--
--   1. The five workouts from seed_content.sql were written before blocks,
--      variants, coaching content and per-level prescriptions existed, so
--      they were still the shallow "two drills, three sets" sessions that
--      started this whole thread — while the Shot Builder workouts next to
--      them had real structure. This brings them up to the same standard.
--
--   2. Adds "Six-Week Handle & Attack" so finishing a block leads
--      somewhere other than the block you just finished.
--
-- Re-runnable: the updates are idempotent, and the workout_drills rebuild
-- deletes the old entries for those five workouts before reinserting.
-- Existing session history is untouched (session_logs.workout_drill_id
-- goes null for rebuilt entries, which only affects resume state on old
-- unfinished sessions).
--
-- Handedness follows the rule in fix_0002: dribbling/layups/floaters get
-- both hands, form shooting is shooting-hand only, and "right side / left
-- side" on a shot means floor position.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coaching content for the original drills
-- ----------------------------------------------------------------------------
update hoops.drills set
  setup = 'Two balls, athletic stance, feet shoulder width. Eyes up on a fixed target the whole series.',
  cues = array[
    'Pound both balls hard — they should come back up fast',
    'Fingertips and wrist, not the arm',
    'Stay in your stance as it gets uncomfortable',
    'Eyes up the entire time — never look down to fix a mistake'
  ],
  common_mistakes = array[
    'Standing upright once it gets tiring',
    'Letting the weak hand go soft while the strong hand keeps working',
    'Watching the balls'
  ],
  equipment = array['two balls']
where name = 'Two-Ball Dribbling Series';

update hoops.drills set
  setup = 'Cone at the wing. Attack it at game speed, execute the move AT the cone, then two hard dribbles past it.',
  cues = array[
    'Get close before you move — a move made early fools nobody',
    'Change speed, not just direction',
    'Shoulder past the cone, stay low through the move',
    'Two hard dribbles out of every move'
  ],
  common_mistakes = array[
    'Making the move three feet too early',
    'Popping upright through the move',
    'Same speed in and out, so nothing is sold'
  ],
  equipment = array['ball', 'cone']
where name = 'Cone Crossover Attack';

update hoops.drills set
  setup = 'Shooting hand only to start. Begin directly in front of the rim and work back one step at a time, only after makes.',
  cues = array[
    'Ball on the finger pads, elbow under it',
    'Same arc every rep — the ball should drop in, not line-drive',
    'Hold the follow-through until it hits the net',
    'Only step back once the last spot felt automatic'
  ],
  common_mistakes = array[
    'Stepping back too early and dragging bad mechanics with you',
    'Guide hand pushing the ball',
    'Snapping the wrist down instead of holding it'
  ],
  equipment = array['ball', 'hoop']
where name = 'Form Shooting Progression';

update hoops.drills set
  setup = 'Start at the top. Attack off a combo move, one or two dribbles, then rise into the jumper.',
  cues = array[
    'Push the dribble out ahead to cover ground',
    'Gather on two feet and get square on the way up',
    'Shoot going UP, not at the peak',
    'Land where you took off'
  ],
  common_mistakes = array[
    'Fading instead of rising',
    'Rushing the gather so the feet never set',
    'Only ever working the strong-hand direction'
  ],
  equipment = array['ball', 'hoop']
where name = 'Off-the-Dribble Pull-Up Series';

update hoops.drills set
  setup = 'Start under the rim. Sprint at a coach or cone on the wing, break down into a closeout, then slide.',
  cues = array[
    'Sprint the first two-thirds, break down the last third',
    'Short choppy steps on the close — get the feet under you',
    'High hand on the shot, low hand ready for the drive',
    'Slide, never cross your feet'
  ],
  common_mistakes = array[
    'Flying at the closeout and giving up the drive',
    'Standing straight up in the slide',
    'Reaching instead of moving the feet'
  ],
  equipment = array['cone']
where name = 'Closeout & Slide Defense Drill';

update hoops.drills set
  setup = 'Live 1-on-1 shell with no ball. Attacker moves, defender mirrors hips and shoulders.',
  cues = array[
    'Watch the hips — shoulders and the ball lie, hips do not',
    'Stay in your stance the whole rep',
    'Beat them to the spot instead of reacting late',
    'Hands active but feet first'
  ],
  common_mistakes = array[
    'Ball-watching instead of reading the hips',
    'Standing up between moves',
    'Reaching to recover when beaten'
  ],
  equipment = array[]::text[]
where name = '1-on-1 Defensive Mirror Drill';

update hoops.drills set
  setup = 'Clear space. Land softly on every rep — quality over count, stop the set when the landings get sloppy.',
  cues = array[
    'Land quiet — noise means you are absorbing badly',
    'Knees track over the toes, never inward',
    'Full reset between reps; this is power work, not conditioning',
    'Stop the set the moment the jumps get slow'
  ],
  common_mistakes = array[
    'Turning it into conditioning by rushing reps',
    'Knees caving in on landing',
    'Chasing the rep count as the jumps get worse'
  ],
  equipment = array['box (optional)']
where name = 'Vertical Jump & Explosiveness Circuit';

update hoops.drills set
  setup = 'Ladder flat on the floor with space to sprint out the end. Pick a pattern, finish every rep with a sprint or cut on a called cue.',
  cues = array[
    'Feet fast and light, on the balls of the feet',
    'Eyes up — you would be reading the floor in a game',
    'Finish through the end of the ladder, do not slow into it',
    'React to the cue, do not pre-plan the direction'
  ],
  common_mistakes = array[
    'Looking down at the feet',
    'Slowing down before the sprint out',
    'Guessing the cue before it is called'
  ],
  equipment = array['agility ladder']
where name = 'Agility Ladder + Reaction Drill';

update hoops.drills set
  setup = 'Start on the block with your back to the rim. Catch, chin the ball, then work the footwork both directions.',
  cues = array[
    'Chin the ball on the catch — elbows out, no strips',
    'Sit into the catch, do not stand up',
    'Drop-step through the defender, not around them',
    'Finish high off two feet'
  ],
  common_mistakes = array[
    'Catching high and getting stripped',
    'Rushing the move before the feet are set',
    'Only working the dominant shoulder'
  ],
  equipment = array['ball', 'hoop']
where name = 'Big Man Post-Up Footwork';

-- ----------------------------------------------------------------------------
-- 2. Rebuild the original five workouts with real structure
--
-- Cleared first so this can be re-run, and because the old flat entries
-- have no block or level targets to update into.
-- ----------------------------------------------------------------------------
delete from hoops.workout_drills wd
using hoops.workouts w
where wd.workout_id = w.id
  and w.name in (
    'Guard Ball-Handling Foundations',
    'Shooter''s Workshop',
    'Lockdown Defender Circuit',
    'Athletic Development Block',
    'Post Player Package'
  );

insert into hoops.workout_drills
  (workout_id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds)
select w.id, d.id, v.sort_order, v.block, v.variant_label, v.levels, v.level_targets, v.sets, v.reps, v.secs
from (values
  -- Guard Ball-Handling Foundations
  ('Guard Ball-Handling Foundations', 'Two-Ball Dribbling Series',   0, 'warmup',   'Both hands, pound',   '{}'::text[], '{}'::jsonb, null::int, null::int, 60::int),
  ('Guard Ball-Handling Foundations', 'Two-Ball Dribbling Series',   1, 'main',     'Alternating',         '{}'::text[], '{"beginner":{"duration_seconds":45},"intermediate":{"duration_seconds":60},"advanced":{"duration_seconds":90}}'::jsonb, null, null, 60),
  ('Guard Ball-Handling Foundations', 'Cone Crossover Attack',       2, 'main',     'Right hand attack',   '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":3,"reps":8},"advanced":{"sets":4,"reps":10}}'::jsonb, 3, 8, null),
  ('Guard Ball-Handling Foundations', 'Cone Crossover Attack',       3, 'main',     'Left hand attack',    '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":3,"reps":8},"advanced":{"sets":4,"reps":10}}'::jsonb, 3, 8, null),
  ('Guard Ball-Handling Foundations', 'Cone Crossover Attack',       4, 'main',     'Between the legs, both hands', array['intermediate','advanced']::text[], '{"intermediate":{"sets":3,"reps":6},"advanced":{"sets":3,"reps":8}}'::jsonb, 3, 6, null),
  ('Guard Ball-Handling Foundations', 'Agility Ladder + Reaction Drill', 5, 'finisher', 'Reaction sprint', '{}'::text[], '{}'::jsonb, null, null, 60),

  -- Shooter’s Workshop
  ('Shooter''s Workshop', 'Form Shooting Progression',      0, 'warmup',   'Shooting hand',     '{}'::text[], '{"beginner":{"sets":4,"reps":10},"intermediate":{"sets":4,"reps":12},"advanced":{"sets":4,"reps":15}}'::jsonb, 4, 12, null),
  ('Shooter''s Workshop', 'Off-the-Dribble Pull-Up Series',  1, 'main',     'Right side',        '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":4,"reps":10},"advanced":{"sets":4,"reps":12}}'::jsonb, 4, 10, null),
  ('Shooter''s Workshop', 'Off-the-Dribble Pull-Up Series',  2, 'main',     'Left side',         '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":4,"reps":10},"advanced":{"sets":4,"reps":12}}'::jsonb, 4, 10, null),
  ('Shooter''s Workshop', 'Off-the-Dribble Pull-Up Series',  3, 'main',     'Top of the key, off 2 dribbles', array['intermediate','advanced']::text[], '{"intermediate":{"sets":3,"reps":8},"advanced":{"sets":4,"reps":10}}'::jsonb, 3, 8, null),
  ('Shooter''s Workshop', 'Form Shooting Progression',       4, 'finisher', 'Free throws',       '{}'::text[], '{}'::jsonb, 2, 5, null),

  -- Lockdown Defender Circuit
  ('Lockdown Defender Circuit', 'Agility Ladder + Reaction Drill', 0, 'warmup',   'Quick feet',      '{}'::text[], '{}'::jsonb, null, null, 45),
  ('Lockdown Defender Circuit', 'Closeout & Slide Defense Drill',  1, 'main',     'Closing right',   '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":4,"reps":8},"advanced":{"sets":4,"reps":10}}'::jsonb, 4, 8, null),
  ('Lockdown Defender Circuit', 'Closeout & Slide Defense Drill',  2, 'main',     'Closing left',    '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":4,"reps":8},"advanced":{"sets":4,"reps":10}}'::jsonb, 4, 8, null),
  ('Lockdown Defender Circuit', '1-on-1 Defensive Mirror Drill',   3, 'main',     null,              '{}'::text[], '{"beginner":{"duration_seconds":45},"intermediate":{"duration_seconds":60},"advanced":{"duration_seconds":90}}'::jsonb, null, null, 60),
  ('Lockdown Defender Circuit', '1-on-1 Defensive Mirror Drill',   4, 'finisher', 'Live, no rest',   array['advanced']::text[], '{"advanced":{"duration_seconds":90}}'::jsonb, null, null, 90),

  -- Athletic Development Block
  ('Athletic Development Block', 'Agility Ladder + Reaction Drill',        0, 'warmup',   'Feet only',       '{}'::text[], '{}'::jsonb, null, null, 60),
  ('Athletic Development Block', 'Vertical Jump & Explosiveness Circuit',  1, 'main',     'Broad jumps',     '{}'::text[], '{"beginner":{"sets":3,"reps":5},"intermediate":{"sets":4,"reps":6},"advanced":{"sets":4,"reps":8}}'::jsonb, 4, 6, null),
  ('Athletic Development Block', 'Vertical Jump & Explosiveness Circuit',  2, 'main',     'Depth jumps',     array['intermediate','advanced']::text[], '{"intermediate":{"sets":3,"reps":5},"advanced":{"sets":4,"reps":6}}'::jsonb, 3, 5, null),
  ('Athletic Development Block', 'Agility Ladder + Reaction Drill',        3, 'finisher', 'Reaction sprint', '{}'::text[], '{}'::jsonb, null, null, 90),

  -- Post Player Package
  ('Post Player Package', 'Two-Ball Dribbling Series',             0, 'warmup',   'Both hands',        '{}'::text[], '{}'::jsonb, null, null, 45),
  ('Post Player Package', 'Big Man Post-Up Footwork',              1, 'main',     'Right block',       '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":4,"reps":8},"advanced":{"sets":4,"reps":10}}'::jsonb, 4, 8, null),
  ('Post Player Package', 'Big Man Post-Up Footwork',              2, 'main',     'Left block',        '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":4,"reps":8},"advanced":{"sets":4,"reps":10}}'::jsonb, 4, 8, null),
  ('Post Player Package', 'Vertical Jump & Explosiveness Circuit', 3, 'main',     'Box jumps',         '{}'::text[], '{"beginner":{"sets":3,"reps":5},"intermediate":{"sets":4,"reps":6},"advanced":{"sets":4,"reps":8}}'::jsonb, 4, 6, null),
  ('Post Player Package', 'Big Man Post-Up Footwork',              4, 'finisher', 'Jump hook, both shoulders', '{}'::text[], '{}'::jsonb, 2, 10, null)
) as v(workout_name, drill_name, sort_order, block, variant_label, levels, level_targets, sets, reps, secs)
join hoops.workouts w on w.name = v.workout_name
join hoops.drills d on d.name = v.drill_name;

-- Estimated minutes were written for two-drill sessions.
update hoops.workouts set estimated_minutes = 35 where name = 'Guard Ball-Handling Foundations';
update hoops.workouts set estimated_minutes = 40 where name = 'Shooter''s Workshop';
update hoops.workouts set estimated_minutes = 30 where name = 'Lockdown Defender Circuit';
update hoops.workouts set estimated_minutes = 30 where name = 'Athletic Development Block';
update hoops.workouts set estimated_minutes = 35 where name = 'Post Player Package';

-- ----------------------------------------------------------------------------
-- 3. A second program
--
-- Ball-handling focused, so a guard finishing Shot Builder has somewhere
-- to go that isn’t the block they just finished. Same shape: five weeks
-- building, one deload.
-- ----------------------------------------------------------------------------
insert into hoops.programs (name, description, focus_areas, player_type_tags, level, week_count, days_per_week)
values (
  'Six-Week Handle & Attack',
  'Tighten the handle under pressure and learn to get downhill. Five weeks of building, then a lighter week.',
  array['ball_handling'],
  jsonb_build_object('style_tags', array['playmaker', 'slasher'], 'positions', array['point_guard', 'combo_guard', 'shooting_guard']),
  'intermediate',
  6, 3
)
on conflict do nothing;

insert into hoops.program_days (program_id, week_number, day_number, workout_id, volume_step, is_deload, note)
select p.id, v.week_number, v.day_number, w.id, v.volume_step, v.is_deload, v.note
from (values
  (1, 1, 'Guard Ball-Handling Foundations', 0, false, 'Baseline week. Log it honestly — everything after is measured against this.'),
  (1, 2, 'Athletic Development Block',      0, false, null),
  (1, 3, 'Guard Ball-Handling Foundations', 0, false, null),
  (2, 1, 'Guard Ball-Handling Foundations', 1, false, null),
  (2, 2, 'Athletic Development Block',      1, false, null),
  (2, 3, 'Guard Ball-Handling Foundations', 1, false, null),
  (3, 1, 'Guard Ball-Handling Foundations', 2, false, 'Handle should feel automatic by now. If you are still watching the ball, slow down and fix it.'),
  (3, 2, 'Athletic Development Block',      2, false, null),
  (3, 3, 'Guard Ball-Handling Foundations', 2, false, null),
  (4, 1, 'Guard Ball-Handling Foundations', 3, false, null),
  (4, 2, 'Athletic Development Block',      3, false, null),
  (4, 3, 'Guard Ball-Handling Foundations', 3, false, null),
  (5, 1, 'Guard Ball-Handling Foundations', 4, false, 'Heaviest week of the block.'),
  (5, 2, 'Athletic Development Block',      4, false, null),
  (5, 3, 'Guard Ball-Handling Foundations', 4, false, null),
  (6, 1, 'Guard Ball-Handling Foundations', -1, true, 'Deload. Lighter on purpose.'),
  (6, 2, 'Athletic Development Block',      -1, true, null),
  (6, 3, 'Guard Ball-Handling Foundations', -1, true, 'Last day. Compare these numbers to week 1.')
) as v(week_number, day_number, workout_name, volume_step, is_deload, note)
cross join (select id from hoops.programs where name = 'Six-Week Handle & Attack') p
join hoops.workouts w on w.name = v.workout_name
on conflict (program_id, week_number, day_number) do nothing;
