-- ============================================================================
-- Hardwood Lab — "Six-Week Shot Builder" program
--
-- Run after migrations/0001_programs_and_drill_depth.sql. Additive: this
-- adds new drills, three workouts and one program. It does not touch the
-- content from seed_content.sql.
--
-- This is the reference example for how content should be written from
-- here on:
--   * drills carry real coaching content (setup, cues, common mistakes),
--     so a player can learn the drill before running it
--   * a workout has a shape — warmup / main / finisher — not a flat list
--   * the same drill appears more than once with a variant_label, which is
--     how "right side, then left side" gets expressed
--   * prescriptions are per level (level_targets), and some entries only
--     apply to certain levels (levels), so training level both scales the
--     numbers and swaps the variation
--
-- video_url stays NULL throughout — real film links get filled in later.
-- Never rehost video.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Drills
-- ----------------------------------------------------------------------------
insert into hoops.drills (name, description, skill_tags, position_tags, difficulty, equipment, source_trainer, setup, cues, common_mistakes)
values
  (
    'One-Hand Form Shooting',
    'Close-range one-hand shooting with the shooting hand only, to clean up release mechanics.',
    array['shooting'], array[]::text[], 'beginner', array['ball', 'hoop'], 'Reid Ouse',
    'Shooting hand only — never the off hand. Start three feet from the rim, directly in front. Guide hand behind your back or resting on your hip.',
    array[
      'Ball on the pads of your fingers, not the palm',
      'Elbow under the ball, wrist cocked back before you go up',
      'Hold the follow-through until the ball hits the net',
      'Same arc every rep — aim for the ball to drop, not to line-drive in'
    ],
    array[
      'Drifting back before the mechanics are clean',
      'Letting the guide hand sneak in to fix a bad release',
      'Snapping the wrist down instead of holding it'
    ]
  ),
  (
    'Elbow Pull-Up',
    'One-dribble pull-up jumper from the elbow, working both directions off a hard first step.',
    array['shooting', 'ball_handling'], array['point_guard', 'combo_guard', 'shooting_guard', 'small_forward'], 'intermediate', array['ball', 'hoop'], null,
    'Start at the top of the key with the ball. Attack toward the elbow, one hard dribble, rise into the shot.',
    array[
      'Push the first dribble out ahead — cover ground, do not dribble in place',
      'Gather on two feet, square to the rim on the way up',
      'Shoot on the way UP, not at the top of the jump',
      'Land where you took off — no drifting'
    ],
    array[
      'Fading away instead of rising straight up',
      'Rushing the gather so the feet never get set',
      'Only practicing the strong-hand direction'
    ]
  ),
  (
    'Wing Step-Back',
    'Step-back jumper from the wing off a live dribble, creating separation from a closeout.',
    array['shooting', 'ball_handling'], array['combo_guard', 'shooting_guard', 'small_forward'], 'advanced', array['ball', 'hoop'], null,
    'Start at the wing. Attack middle two dribbles, then push off the front foot into the step-back.',
    array[
      'Sell the drive first — the step-back only works if they believe the attack',
      'Push off hard with the front foot, land balanced on two',
      'Keep the shoulders square as you separate',
      'Chin over the ball on the gather so you do not fall away'
    ],
    array[
      'Stepping back before selling the drive',
      'Landing off balance and fading sideways',
      'Travelling on the gather — get the footwork slow first'
    ]
  ),
  (
    'Catch-and-Shoot off the Pin-Down',
    'Sprint off a simulated screen into a catch-and-shoot with feet ready.',
    array['shooting'], array['shooting_guard', 'small_forward', 'combo_guard'], 'intermediate', array['ball', 'hoop', 'chair or cone'], null,
    'Place a chair or cone at the elbow as the screener. Start under the rim, sprint off the chair to the wing, catch and shoot.',
    array[
      'Sprint off the screen — brush the chair shoulder to shoulder',
      'Hands ready and target hand up BEFORE the catch',
      'Feet and hips turned to the rim as you catch, not after',
      'Catch on the hop so you land shot-ready'
    ],
    array[
      'Catching flat-footed and then trying to get set',
      'Drifting away from the screen instead of tight off it',
      'Hands down until the ball arrives'
    ]
  ),
  (
    'Free Throw Reset',
    'Two free throws between blocks — a breather, and reps at game fatigue.',
    array['shooting'], array[]::text[], 'beginner', array['ball', 'hoop'], null,
    'Step to the line between blocks. Same routine every single time.',
    array[
      'Exact same routine every rep — same number of dribbles, same breath',
      'Eyes on the same target on the rim before you start',
      'Shoot it the same whether you are fresh or gassed'
    ],
    array[
      'Changing routine when tired',
      'Rushing them to get back to the "real" drill'
    ]
  ),
  (
    'Beat the Clock Finisher',
    'Competitive closer — make as many as you can from the spot before the clock runs out.',
    array['shooting'], array[]::text[], 'intermediate', array['ball', 'hoop'], null,
    'Pick one spot. Shoot, chase your own rebound, return to the spot, repeat until time.',
    array[
      'Game speed the whole time — rebound and reset like someone is chasing you',
      'Do not sacrifice the shot to get more up',
      'Write the number down and try to beat it next week'
    ],
    array[
      'Chucking to raise the count',
      'Walking after the rebound'
    ]
  ),
  (
    'Pound Dribble Series',
    'Hard stationary pound dribbles to wake up the hands and get the ball on a string.',
    array['ball_handling'], array[]::text[], 'beginner', array['ball'], 'Micah Lancaster',
    'Feet shoulder width, athletic stance. Pound the ball at knee height, eyes up the whole time.',
    array[
      'Pound it hard — the ball should come back up fast',
      'Eyes up, find a target on the wall',
      'Fingertips, not palm',
      'Stay low the whole series'
    ],
    array[
      'Standing up as it gets tiring',
      'Watching the ball',
      'Soft dribbles that die'
    ]
  ),
  (
    'Attack Cone Series',
    'Crossover, between-the-legs and hesitation combos attacking a cone at game speed.',
    array['ball_handling'], array['point_guard', 'combo_guard', 'shooting_guard'], 'intermediate', array['ball', 'cone'], null,
    'Cone at the wing. Attack it, execute the move at the cone, explode past it for two hard dribbles.',
    array[
      'Set the defender up — get close before the move',
      'Change speed, not just direction',
      'Stay low through the move, shoulder past the cone',
      'Two hard dribbles out of it, every time'
    ],
    array[
      'Making the move too far from the cone',
      'Popping upright through the move',
      'Same speed in and out'
    ]
  )
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Workouts — the three days of the program
-- ----------------------------------------------------------------------------
insert into hoops.workouts (name, description, player_type_tags, focus_areas, estimated_minutes)
values
  (
    'Shot Builder — Form & Footwork',
    'Rebuild the base. Close-range mechanics into catch-and-shoot footwork off movement.',
    jsonb_build_object('style_tags', array['shooter'], 'positions', array['point_guard', 'combo_guard', 'shooting_guard', 'small_forward']),
    array['shooting'], 35
  ),
  (
    'Shot Builder — Off the Dribble',
    'Pull-ups both directions, then separation work. The shot you actually get in a game.',
    jsonb_build_object('style_tags', array['shooter', 'slasher'], 'positions', array['point_guard', 'combo_guard', 'shooting_guard', 'small_forward']),
    array['shooting', 'ball_handling'], 40
  ),
  (
    'Shot Builder — Game Speed',
    'Everything at game speed, against the clock, with a number to beat.',
    jsonb_build_object('style_tags', array['shooter']),
    array['shooting'], 30
  )
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Workout composition
--
-- Note the repeated drills with different variant_labels — that is the
-- whole point of the migration. "Elbow Pull-Up / Right side" and
-- "Elbow Pull-Up / Left side" are two entries pointing at one drill.
--
-- levels = '{}' means every level runs it. A non-empty levels array is the
-- swap: beginners get the simpler variation, advanced players get the
-- harder one in the same slot.
-- ----------------------------------------------------------------------------
insert into hoops.workout_drills
  (workout_id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds)
select w.id, d.id, v.sort_order, v.block, v.variant_label, v.levels, v.level_targets, v.sets, v.reps, v.secs
from (values
  -- Day 1 — Form & Footwork
  ('Shot Builder — Form & Footwork', 'Pound Dribble Series',             0, 'warmup',   'Both hands',        '{}'::text[], '{}'::jsonb, null::int, null::int, 60::int),
  -- Shooting hand only. Form shooting is about grooving ONE release; a
  -- "left hand" version would be teaching a shot the player will never
  -- take. Handedness variants belong on dribbling, layups and floaters,
  -- not here. (Right side / left side on the pull-ups below is floor
  -- position, not shooting hand — that one is worth drilling both ways.)
  ('Shot Builder — Form & Footwork', 'One-Hand Form Shooting',           1, 'warmup',   'Shooting hand',     '{}'::text[], '{"beginner":{"sets":3,"reps":10},"intermediate":{"sets":3,"reps":12},"advanced":{"sets":3,"reps":15}}'::jsonb, 3, 12, null),
  ('Shot Builder — Form & Footwork', 'Catch-and-Shoot off the Pin-Down', 3, 'main',     'Right wing',        '{}'::text[], '{"beginner":{"sets":3,"reps":8},"intermediate":{"sets":4,"reps":10},"advanced":{"sets":4,"reps":12}}'::jsonb, 4, 10, null),
  ('Shot Builder — Form & Footwork', 'Catch-and-Shoot off the Pin-Down', 4, 'main',     'Left wing',         '{}'::text[], '{"beginner":{"sets":3,"reps":8},"intermediate":{"sets":4,"reps":10},"advanced":{"sets":4,"reps":12}}'::jsonb, 4, 10, null),
  ('Shot Builder — Form & Footwork', 'Free Throw Reset',                 5, 'main',     null,                '{}'::text[], '{}'::jsonb, 2, 2, null),
  ('Shot Builder — Form & Footwork', 'Beat the Clock Finisher',          6, 'finisher', 'Free throw line',   '{}'::text[], '{}'::jsonb, null, null, 60),

  -- Day 2 — Off the Dribble
  ('Shot Builder — Off the Dribble', 'Pound Dribble Series',             0, 'warmup',   'Both hands',        '{}'::text[], '{}'::jsonb, null, null, 60),
  ('Shot Builder — Off the Dribble', 'Attack Cone Series',               1, 'warmup',   'Crossover',         '{}'::text[], '{"beginner":{"sets":2,"reps":6},"intermediate":{"sets":3,"reps":8},"advanced":{"sets":3,"reps":10}}'::jsonb, 3, 8, null),
  ('Shot Builder — Off the Dribble', 'Elbow Pull-Up',                    2, 'main',     'Right side',        '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":3,"reps":10},"advanced":{"sets":4,"reps":12}}'::jsonb, 3, 10, null),
  ('Shot Builder — Off the Dribble', 'Elbow Pull-Up',                    3, 'main',     'Left side',         '{}'::text[], '{"beginner":{"sets":3,"reps":6},"intermediate":{"sets":3,"reps":10},"advanced":{"sets":4,"reps":12}}'::jsonb, 3, 10, null),
  ('Shot Builder — Off the Dribble', 'Free Throw Reset',                 4, 'main',     null,                '{}'::text[], '{}'::jsonb, 2, 2, null),
  -- The level swap: beginners and intermediates repeat the pull-up from
  -- the wing; advanced players take the same slot as a step-back.
  ('Shot Builder — Off the Dribble', 'Elbow Pull-Up',                    5, 'main',     'Wing, off 2 dribbles', array['beginner','intermediate']::text[], '{"beginner":{"sets":2,"reps":6},"intermediate":{"sets":3,"reps":8}}'::jsonb, 3, 8, null),
  ('Shot Builder — Off the Dribble', 'Wing Step-Back',                   6, 'main',     'Right wing',        array['advanced']::text[], '{"advanced":{"sets":3,"reps":8}}'::jsonb, 3, 8, null),
  ('Shot Builder — Off the Dribble', 'Wing Step-Back',                   7, 'main',     'Left wing',         array['advanced']::text[], '{"advanced":{"sets":3,"reps":8}}'::jsonb, 3, 8, null),
  ('Shot Builder — Off the Dribble', 'Beat the Clock Finisher',          8, 'finisher', 'Elbow, either side','{}'::text[], '{}'::jsonb, null, null, 90),

  -- Day 3 — Game Speed
  ('Shot Builder — Game Speed',      'Pound Dribble Series',             0, 'warmup',   'Both hands',        '{}'::text[], '{}'::jsonb, null, null, 45),
  ('Shot Builder — Game Speed',      'Catch-and-Shoot off the Pin-Down', 1, 'main',     'Right wing',        '{}'::text[], '{"beginner":{"sets":2,"reps":8},"intermediate":{"sets":3,"reps":10},"advanced":{"sets":3,"reps":12}}'::jsonb, 3, 10, null),
  ('Shot Builder — Game Speed',      'Elbow Pull-Up',                    2, 'main',     'Right side',        '{}'::text[], '{"beginner":{"sets":2,"reps":6},"intermediate":{"sets":3,"reps":8},"advanced":{"sets":3,"reps":10}}'::jsonb, 3, 8, null),
  ('Shot Builder — Game Speed',      'Elbow Pull-Up',                    3, 'main',     'Left side',         '{}'::text[], '{"beginner":{"sets":2,"reps":6},"intermediate":{"sets":3,"reps":8},"advanced":{"sets":3,"reps":10}}'::jsonb, 3, 8, null),
  ('Shot Builder — Game Speed',      'Free Throw Reset',                 4, 'main',     null,                '{}'::text[], '{}'::jsonb, 2, 2, null),
  ('Shot Builder — Game Speed',      'Beat the Clock Finisher',          5, 'finisher', 'Three-point line',  '{}'::text[], '{}'::jsonb, null, null, 120)
) as v(workout_name, drill_name, sort_order, block, variant_label, levels, level_targets, sets, reps, secs)
join hoops.workouts w on w.name = v.workout_name
join hoops.drills d on d.name = v.drill_name;

-- ----------------------------------------------------------------------------
-- The program itself
-- ----------------------------------------------------------------------------
insert into hoops.programs (name, description, focus_areas, player_type_tags, level, week_count, days_per_week)
values (
  'Six-Week Shot Builder',
  'Five weeks of building volume on a repeatable jumper, then a lighter week to let it settle. Three days a week.',
  array['shooting'],
  jsonb_build_object('style_tags', array['shooter', 'slasher']),
  'intermediate',
  6, 3
)
on conflict do nothing;

-- Weeks 1-5 build volume; week 6 is a deliberate deload so the chart dip
-- reads as planned rather than as a missed week.
insert into hoops.program_days (program_id, week_number, day_number, workout_id, volume_step, is_deload, note)
select p.id, v.week_number, v.day_number, w.id, v.volume_step, v.is_deload, v.note
from (values
  (1, 1, 'Shot Builder — Form & Footwork', 0, false, 'Baseline week. Log honest numbers — everything else is measured against these.'),
  (1, 2, 'Shot Builder — Off the Dribble', 0, false, null),
  (1, 3, 'Shot Builder — Game Speed',      0, false, null),
  (2, 1, 'Shot Builder — Form & Footwork', 1, false, null),
  (2, 2, 'Shot Builder — Off the Dribble', 1, false, null),
  (2, 3, 'Shot Builder — Game Speed',      1, false, null),
  (3, 1, 'Shot Builder — Form & Footwork', 2, false, 'Volume is up. Mechanics hold up when you are tired or they are not fixed yet.'),
  (3, 2, 'Shot Builder — Off the Dribble', 2, false, null),
  (3, 3, 'Shot Builder — Game Speed',      2, false, null),
  (4, 1, 'Shot Builder — Form & Footwork', 3, false, null),
  (4, 2, 'Shot Builder — Off the Dribble', 3, false, null),
  (4, 3, 'Shot Builder — Game Speed',      3, false, null),
  (5, 1, 'Shot Builder — Form & Footwork', 4, false, 'Heaviest week of the block.'),
  (5, 2, 'Shot Builder — Off the Dribble', 4, false, null),
  (5, 3, 'Shot Builder — Game Speed',      4, false, null),
  (6, 1, 'Shot Builder — Form & Footwork', -1, true, 'Deload. Lighter on purpose — this is when the work catches up to you.'),
  (6, 2, 'Shot Builder — Game Speed',      -1, true, null),
  (6, 3, 'Shot Builder — Off the Dribble', -1, true, 'Last day of the block. Compare these numbers to week 1.')
) as v(week_number, day_number, workout_name, volume_step, is_deload, note)
cross join (select id from hoops.programs where name = 'Six-Week Shot Builder') p
join hoops.workouts w on w.name = v.workout_name
on conflict (program_id, week_number, day_number) do nothing;
