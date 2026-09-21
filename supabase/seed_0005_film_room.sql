-- ============================================================================
-- Hardwood Lab — seed 0005: Film Room curriculum
--
-- Run after migrations/0004_film_room.sql.
--
-- ON LINKS — read this before adding content of your own:
--
-- Every trainer URL below was verified against a real, live channel.
-- Where a channel could not be confirmed, the column is left NULL rather
-- than filled with a plausible guess. Ryan Jones is the case in point:
-- his Instagram and TikTok are confirmed, his YouTube channel is not, so
-- youtube_url is null.
--
-- The film entries themselves deliberately ship with url = NULL. Picking
-- specific videos means asserting that an exact URL exists and teaches
-- what the row claims — and a dead or wrong link inside a coaching app
-- costs a kid their trust in everything else in it. What ships instead is
-- the part that carries the actual teaching: the topic, the skill it
-- belongs to, the drill it maps to, and what to watch for. Attach links
-- through the app’s "Add film" flow as you find the ones you rate.
--
-- The watch_for arrays are the lesson. They are worth reading even with
-- no video attached, and they are what turns watching into studying.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trainers
-- ----------------------------------------------------------------------------
insert into hoops.trainers (name, handle, youtube_url, instagram_url, tiktok_url, website_url, bio, specialty, sort_order)
values
  (
    'Peter Danyliv',
    '@PETERDANYLIV',
    'https://www.youtube.com/@PETERDANYLIV',
    'https://www.instagram.com/peterdanyliv',
    'https://www.tiktok.com/@peterdanyliv',
    null,
    'NBA skills trainer and co-founder of 90/10 Training. Has worked with well over a hundred Division 1 players and a long list of NBA and EuroLeague pros. Posts free daily skill content.',
    array['shooting', 'ball_handling'],
    0
  ),
  (
    'Ryan Jones',
    '@ry_mikejones',
    -- Intentionally null: his Instagram and TikTok are confirmed, a
    -- YouTube channel under this name is not. Fill it in if you find it.
    null,
    'https://www.instagram.com/ry_mikejones',
    'https://www.tiktok.com/@ry_mikejones',
    null,
    'Known as Mr. Shifty, behind ShiftyU. Built around shiftiness — changing speed and direction to create separation, and the single-leg strength that makes it hold up.',
    array['ball_handling', 'athleticism'],
    1
  ),
  (
    'Micah Lancaster',
    '@ImPossibleTraining',
    'https://www.youtube.com/@ImPossibleTraining',
    'https://www.instagram.com/micahlancaster',
    null,
    'https://possibletraining.com',
    'Founder of I''m Possible Training and an NBA skills coach. A trainer of trainers — known for inventing skill-development methods and tools rather than just teaching moves.',
    array['ball_handling', 'shooting'],
    2
  ),
  (
    'Reid Ouse',
    '@basketballcatalyst',
    'https://www.youtube.com/@basketballcatalyst',
    'https://www.instagram.com/reidouse',
    null,
    'https://www.basketballcatalyst.com',
    'NBA skills coach and founder of Catalyst Training. Seven years as a college coach before going pro-side; has worked with Andrew Wiggins and Paige Bueckers among many others.',
    array['shooting', 'defense'],
    3
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
-- Film lessons
--
-- kind:
--   technique  — how to execute a movement
--   pro_study  — watching someone good do it in a real game
--   iq         — reading the game, decisions rather than moves
--   mentality  — the part between the ears
--
-- drill_name maps the lesson onto a drill, which is what puts it in front
-- of the player inside the session rather than only in the Film Room.
-- ----------------------------------------------------------------------------
insert into hoops.film_resources
  (title, url, kind, difficulty, skill_tags, position_tags, watch_for, notes, trainer_id, drill_id, sort_order)
select
  v.title, null, v.kind, v.difficulty, v.skill_tags, v.position_tags, v.watch_for, v.notes,
  t.id, d.id, v.sort_order
from (values
  -- ---- Shooting: technique ----
  (
    'Building a Repeatable Release',
    'technique', 'beginner', array['shooting'], array[]::text[],
    array[
      'Where the ball sits on the hand at the set point — pads, not palm',
      'Whether the elbow stays under the ball or flares out as they tire',
      'The follow-through held until the ball lands',
      'Same arc on every rep, not just the makes'
    ],
    'The base everything else sits on. Worth rewatching whenever the shot starts feeling off rather than shooting through it.',
    'Reid Ouse', 'Form Shooting Progression', 0
  ),
  (
    'Footwork Into the Pull-Up',
    'technique', 'intermediate', array['shooting', 'ball_handling'], array['point_guard', 'combo_guard', 'shooting_guard'],
    array[
      'How far the first dribble pushes out — covering ground, not dribbling in place',
      'The gather: two feet, squared to the rim before rising',
      'Shooting on the way up rather than at the peak',
      'Landing in the same spot they took off from'
    ],
    'The shot you actually get in a game. The footwork before the shot decides whether the shot is good, not the hands.',
    'Peter Danyliv', 'Off-the-Dribble Pull-Up Series', 1
  ),
  (
    'Creating Separation Off the Bounce',
    'technique', 'advanced', array['shooting', 'ball_handling'], array['combo_guard', 'shooting_guard', 'small_forward'],
    array[
      'How the drive is sold before the step-back — the defender has to believe it',
      'The push off the front foot, and landing balanced on two',
      'Shoulders staying square while the feet create the space',
      'The chin staying over the ball so the shot doesn''t fade'
    ],
    'Separation is footwork and timing, not athleticism. Watch the feet, not the ball.',
    'Ryan Jones', 'Wing Step-Back', 2
  ),

  -- ---- Ball handling: technique ----
  (
    'The Handle as a Weapon, Not a Skill',
    'technique', 'intermediate', array['ball_handling'], array['point_guard', 'combo_guard'],
    array[
      'Change of pace doing the work, not the size of the move',
      'How close they let the defender get before moving',
      'The ball staying low and quick through contact',
      'Two hard dribbles out of every move — no drifting'
    ],
    'Most young players make the move too early and too far away. Watch how late good handlers commit.',
    'Micah Lancaster', 'Cone Crossover Attack', 3
  ),
  (
    'Shifty: Changing Speed to Beat Anyone',
    'technique', 'advanced', array['ball_handling', 'athleticism'], array['point_guard', 'combo_guard', 'shooting_guard'],
    array[
      'Deceleration — stopping is what creates the advantage, not accelerating',
      'How low the hips stay through the change of direction',
      'Single-leg control on the plant foot',
      'Eyes and shoulders selling one direction while the hips go the other'
    ],
    'Shiftiness is a braking skill before it is a speed skill. Most players can only go fast in one gear.',
    'Ryan Jones', 'Attack Cone Series', 4
  ),
  (
    'Two-Ball Work and Why It Transfers',
    'technique', 'beginner', array['ball_handling'], array[]::text[],
    array[
      'Eyes up the entire series — never dropping to fix a mistake',
      'Both hands working equally hard, not the strong hand carrying it',
      'Staying in a stance as it gets uncomfortable',
      'Hard pounds so the ball comes back fast'
    ],
    'Boring on purpose. This is the drill that makes the handle automatic so your eyes can be on the floor.',
    'Micah Lancaster', 'Two-Ball Dribbling Series', 5
  ),

  -- ---- Defence ----
  (
    'Closing Out Without Getting Beat',
    'technique', 'intermediate', array['defense'], array[]::text[],
    array[
      'Sprinting two-thirds of the distance and breaking down the last third',
      'Short choppy steps on the close — feet underneath, not reaching',
      'High hand on the shot, low hand ready for the drive',
      'Staying in a stance after the close instead of standing up'
    ],
    'A bad closeout gives up either the shot or the drive. Watch which one they are choosing to take away.',
    'Reid Ouse', 'Closeout & Slide Defense Drill', 6
  ),
  (
    'Guarding the Ball: Hips, Not Hands',
    'iq', 'intermediate', array['defense'], array[]::text[],
    array[
      'Watching the attacker''s hips, not the ball or the shoulders',
      'Beating them to the spot rather than reacting after the move',
      'Hands active but late — feet solving the problem first',
      'What they do after getting beaten once'
    ],
    'The ball lies, the shoulders lie, the hips do not. Almost every young defender watches the wrong thing.',
    'Reid Ouse', '1-on-1 Defensive Mirror Drill', 7
  ),

  -- ---- Game IQ ----
  (
    'Reading a Drop Coverage',
    'iq', 'advanced', array['shooting', 'ball_handling'], array['point_guard', 'combo_guard'],
    array[
      'Where the big is sitting when the guard comes off the screen',
      'The pull-up being available because of the coverage, not because it feels open',
      'How the guard uses the screen — shoulder to shoulder, not wide',
      'The read happening before the catch, not after'
    ],
    'Pro film rather than a drill. The pull-up you practice exists because of what the defence gives you.',
    null, null, 8
  ),
  (
    'Playing Without the Ball',
    'iq', 'intermediate', array['shooting'], array['shooting_guard', 'small_forward'],
    array[
      'Sprinting off screens instead of jogging',
      'Hands and target ready before the catch',
      'Feet and hips already turned to the rim on the catch',
      'Relocating after a pass rather than standing and watching'
    ],
    'Most of a game is spent without the ball. This is the part that separates scorers from shooters.',
    null, 'Catch-and-Shoot off the Pin-Down', 9
  ),

  -- ---- Mentality ----
  (
    'The Next Play Mentality',
    'mentality', 'beginner', array[]::text[], array[]::text[],
    array[
      'What they do in the five seconds after a mistake',
      'Body language walking back on defence',
      'Whether the next shot goes up with the same confidence',
      'How they talk to teammates after a bad stretch'
    ],
    'The skill nobody drills. Worth watching before a game more than before a workout.',
    null, null, 10
  ),
  (
    'What Elite Work Actually Looks Like',
    'mentality', 'beginner', array[]::text[], array[]::text[],
    array[
      'Pace between reps — no wasted time, no walking',
      'Reps being repeated when they are sloppy, not just counted',
      'How boring the fundamentals look at the highest level',
      'Focus holding in the last ten minutes of a session'
    ],
    'Watch a full workout, not highlights. The gap between good and great is mostly what happens between the reps.',
    'Peter Danyliv', null, 11
  )
) as v(title, kind, difficulty, skill_tags, position_tags, watch_for, notes, trainer_name, drill_name, sort_order)
left join hoops.trainers t on t.name = v.trainer_name
left join hoops.drills d on d.name = v.drill_name
where not exists (
  select 1 from hoops.film_resources fr where fr.title = v.title
);

-- ----------------------------------------------------------------------------
-- Attach film to program days
--
-- One study piece per week, on day 1, so the block teaches as well as
-- trains. Deliberately sparse: film every day becomes homework nobody
-- does.
-- ----------------------------------------------------------------------------
update hoops.program_days pd
set film_resource_id = fr.id
from hoops.programs p, hoops.film_resources fr
where pd.program_id = p.id
  and p.name = 'Six-Week Shot Builder'
  and pd.day_number = 1
  and fr.title = case pd.week_number
    when 1 then 'Building a Repeatable Release'
    when 2 then 'Footwork Into the Pull-Up'
    when 3 then 'Playing Without the Ball'
    when 4 then 'Creating Separation Off the Bounce'
    when 5 then 'Reading a Drop Coverage'
    when 6 then 'What Elite Work Actually Looks Like'
  end;

update hoops.program_days pd
set film_resource_id = fr.id
from hoops.programs p, hoops.film_resources fr
where pd.program_id = p.id
  and p.name = 'Six-Week Handle & Attack'
  and pd.day_number = 1
  and fr.title = case pd.week_number
    when 1 then 'Two-Ball Work and Why It Transfers'
    when 2 then 'The Handle as a Weapon, Not a Skill'
    when 3 then 'Shifty: Changing Speed to Beat Anyone'
    when 4 then 'The Handle as a Weapon, Not a Skill'
    when 5 then 'Shifty: Changing Speed to Beat Anyone'
    when 6 then 'The Next Play Mentality'
  end;
