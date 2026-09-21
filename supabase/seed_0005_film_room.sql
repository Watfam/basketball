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
    $hl$Peter Danyliv$hl$,
    $hl$@PETERDANYLIV$hl$,
    $hl$https://www.youtube.com/@PETERDANYLIV$hl$,
    $hl$https://www.instagram.com/peterdanyliv$hl$,
    $hl$https://www.tiktok.com/@peterdanyliv$hl$,
    null,
    $hl$NBA skills trainer and co-founder of 90/10 Training. Has worked with well over a hundred Division 1 players and a long list of NBA and EuroLeague pros. Posts free daily skill content.$hl$,
    array[$hl$shooting$hl$, $hl$ball_handling$hl$],
    0
  ),
  (
    $hl$Ryan Jones$hl$,
    $hl$@ry_mikejones$hl$,
    -- Intentionally null: his Instagram and TikTok are confirmed, a
    -- YouTube channel under this name is not. Fill it in if you find it.
    null,
    $hl$https://www.instagram.com/ry_mikejones$hl$,
    $hl$https://www.tiktok.com/@ry_mikejones$hl$,
    null,
    $hl$Known as Mr. Shifty, behind ShiftyU. Built around shiftiness — changing speed and direction to create separation, and the single-leg strength that makes it hold up.$hl$,
    array[$hl$ball_handling$hl$, $hl$athleticism$hl$],
    1
  ),
  (
    $hl$Micah Lancaster$hl$,
    $hl$@ImPossibleTraining$hl$,
    $hl$https://www.youtube.com/@ImPossibleTraining$hl$,
    $hl$https://www.instagram.com/micahlancaster$hl$,
    null,
    $hl$https://possibletraining.com$hl$,
    $hl$Founder of I'm Possible Training and an NBA skills coach. A trainer of trainers — known for inventing skill-development methods and tools rather than just teaching moves.$hl$,
    array[$hl$ball_handling$hl$, $hl$shooting$hl$],
    2
  ),
  (
    $hl$Reid Ouse$hl$,
    $hl$@basketballcatalyst$hl$,
    $hl$https://www.youtube.com/@basketballcatalyst$hl$,
    $hl$https://www.instagram.com/reidouse$hl$,
    null,
    $hl$https://www.basketballcatalyst.com$hl$,
    $hl$NBA skills coach and founder of Catalyst Training. Seven years as a college coach before going pro-side; has worked with Andrew Wiggins and Paige Bueckers among many others.$hl$,
    array[$hl$shooting$hl$, $hl$defense$hl$],
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
    $hl$Building a Repeatable Release$hl$,
    $hl$technique$hl$, $hl$beginner$hl$, array[$hl$shooting$hl$], array[]::text[],
    array[
      $hl$Where the ball sits on the hand at the set point — pads, not palm$hl$,
      $hl$Whether the elbow stays under the ball or flares out as they tire$hl$,
      $hl$The follow-through held until the ball lands$hl$,
      $hl$Same arc on every rep, not just the makes$hl$
    ],
    $hl$The base everything else sits on. Worth rewatching whenever the shot starts feeling off rather than shooting through it.$hl$,
    $hl$Reid Ouse$hl$, $hl$Form Shooting Progression$hl$, 0
  ),
  (
    $hl$Footwork Into the Pull-Up$hl$,
    $hl$technique$hl$, $hl$intermediate$hl$, array[$hl$shooting$hl$, $hl$ball_handling$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$],
    array[
      $hl$How far the first dribble pushes out — covering ground, not dribbling in place$hl$,
      $hl$The gather: two feet, squared to the rim before rising$hl$,
      $hl$Shooting on the way up rather than at the peak$hl$,
      $hl$Landing in the same spot they took off from$hl$
    ],
    $hl$The shot you actually get in a game. The footwork before the shot decides whether the shot is good, not the hands.$hl$,
    $hl$Peter Danyliv$hl$, $hl$Off-the-Dribble Pull-Up Series$hl$, 1
  ),
  (
    $hl$Creating Separation Off the Bounce$hl$,
    $hl$technique$hl$, $hl$advanced$hl$, array[$hl$shooting$hl$, $hl$ball_handling$hl$], array[$hl$combo_guard$hl$, $hl$shooting_guard$hl$, $hl$small_forward$hl$],
    array[
      $hl$How the drive is sold before the step-back — the defender has to believe it$hl$,
      $hl$The push off the front foot, and landing balanced on two$hl$,
      $hl$Shoulders staying square while the feet create the space$hl$,
      $hl$The chin staying over the ball so the shot doesn't fade$hl$
    ],
    $hl$Separation is footwork and timing, not athleticism. Watch the feet, not the ball.$hl$,
    $hl$Ryan Jones$hl$, $hl$Wing Step-Back$hl$, 2
  ),

  -- ---- Ball handling: technique ----
  (
    $hl$The Handle as a Weapon, Not a Skill$hl$,
    $hl$technique$hl$, $hl$intermediate$hl$, array[$hl$ball_handling$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$],
    array[
      $hl$Change of pace doing the work, not the size of the move$hl$,
      $hl$How close they let the defender get before moving$hl$,
      $hl$The ball staying low and quick through contact$hl$,
      $hl$Two hard dribbles out of every move — no drifting$hl$
    ],
    $hl$Most young players make the move too early and too far away. Watch how late good handlers commit.$hl$,
    $hl$Micah Lancaster$hl$, $hl$Cone Crossover Attack$hl$, 3
  ),
  (
    $hl$Shifty: Changing Speed to Beat Anyone$hl$,
    $hl$technique$hl$, $hl$advanced$hl$, array[$hl$ball_handling$hl$, $hl$athleticism$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$],
    array[
      $hl$Deceleration — stopping is what creates the advantage, not accelerating$hl$,
      $hl$How low the hips stay through the change of direction$hl$,
      $hl$Single-leg control on the plant foot$hl$,
      $hl$Eyes and shoulders selling one direction while the hips go the other$hl$
    ],
    $hl$Shiftiness is a braking skill before it is a speed skill. Most players can only go fast in one gear.$hl$,
    $hl$Ryan Jones$hl$, $hl$Attack Cone Series$hl$, 4
  ),
  (
    $hl$Two-Ball Work and Why It Transfers$hl$,
    $hl$technique$hl$, $hl$beginner$hl$, array[$hl$ball_handling$hl$], array[]::text[],
    array[
      $hl$Eyes up the entire series — never dropping to fix a mistake$hl$,
      $hl$Both hands working equally hard, not the strong hand carrying it$hl$,
      $hl$Staying in a stance as it gets uncomfortable$hl$,
      $hl$Hard pounds so the ball comes back fast$hl$
    ],
    $hl$Boring on purpose. This is the drill that makes the handle automatic so your eyes can be on the floor.$hl$,
    $hl$Micah Lancaster$hl$, $hl$Two-Ball Dribbling Series$hl$, 5
  ),

  -- ---- Defence ----
  (
    $hl$Closing Out Without Getting Beat$hl$,
    $hl$technique$hl$, $hl$intermediate$hl$, array[$hl$defense$hl$], array[]::text[],
    array[
      $hl$Sprinting two-thirds of the distance and breaking down the last third$hl$,
      $hl$Short choppy steps on the close — feet underneath, not reaching$hl$,
      $hl$High hand on the shot, low hand ready for the drive$hl$,
      $hl$Staying in a stance after the close instead of standing up$hl$
    ],
    $hl$A bad closeout gives up either the shot or the drive. Watch which one they are choosing to take away.$hl$,
    $hl$Reid Ouse$hl$, $hl$Closeout & Slide Defense Drill$hl$, 6
  ),
  (
    $hl$Guarding the Ball: Hips, Not Hands$hl$,
    $hl$iq$hl$, $hl$intermediate$hl$, array[$hl$defense$hl$], array[]::text[],
    array[
      $hl$Watching the attacker's hips, not the ball or the shoulders$hl$,
      $hl$Beating them to the spot rather than reacting after the move$hl$,
      $hl$Hands active but late — feet solving the problem first$hl$,
      $hl$What they do after getting beaten once$hl$
    ],
    $hl$The ball lies, the shoulders lie, the hips do not. Almost every young defender watches the wrong thing.$hl$,
    $hl$Reid Ouse$hl$, $hl$1-on-1 Defensive Mirror Drill$hl$, 7
  ),

  -- ---- Game IQ ----
  (
    $hl$Reading a Drop Coverage$hl$,
    $hl$iq$hl$, $hl$advanced$hl$, array[$hl$shooting$hl$, $hl$ball_handling$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$],
    array[
      $hl$Where the big is sitting when the guard comes off the screen$hl$,
      $hl$The pull-up being available because of the coverage, not because it feels open$hl$,
      $hl$How the guard uses the screen — shoulder to shoulder, not wide$hl$,
      $hl$The read happening before the catch, not after$hl$
    ],
    $hl$Pro film rather than a drill. The pull-up you practice exists because of what the defence gives you.$hl$,
    null, null, 8
  ),
  (
    $hl$Playing Without the Ball$hl$,
    $hl$iq$hl$, $hl$intermediate$hl$, array[$hl$shooting$hl$], array[$hl$shooting_guard$hl$, $hl$small_forward$hl$],
    array[
      $hl$Sprinting off screens instead of jogging$hl$,
      $hl$Hands and target ready before the catch$hl$,
      $hl$Feet and hips already turned to the rim on the catch$hl$,
      $hl$Relocating after a pass rather than standing and watching$hl$
    ],
    $hl$Most of a game is spent without the ball. This is the part that separates scorers from shooters.$hl$,
    null, $hl$Catch-and-Shoot off the Pin-Down$hl$, 9
  ),

  -- ---- Mentality ----
  (
    $hl$The Next Play Mentality$hl$,
    $hl$mentality$hl$, $hl$beginner$hl$, array[]::text[], array[]::text[],
    array[
      $hl$What they do in the five seconds after a mistake$hl$,
      $hl$Body language walking back on defence$hl$,
      $hl$Whether the next shot goes up with the same confidence$hl$,
      $hl$How they talk to teammates after a bad stretch$hl$
    ],
    $hl$The skill nobody drills. Worth watching before a game more than before a workout.$hl$,
    null, null, 10
  ),
  (
    $hl$What Elite Work Actually Looks Like$hl$,
    $hl$mentality$hl$, $hl$beginner$hl$, array[]::text[], array[]::text[],
    array[
      $hl$Pace between reps — no wasted time, no walking$hl$,
      $hl$Reps being repeated when they are sloppy, not just counted$hl$,
      $hl$How boring the fundamentals look at the highest level$hl$,
      $hl$Focus holding in the last ten minutes of a session$hl$
    ],
    $hl$Watch a full workout, not highlights. The gap between good and great is mostly what happens between the reps.$hl$,
    $hl$Peter Danyliv$hl$, null, 11
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
  and p.name = $hl$Six-Week Shot Builder$hl$
  and pd.day_number = 1
  and fr.title = case pd.week_number
    when 1 then $hl$Building a Repeatable Release$hl$
    when 2 then $hl$Footwork Into the Pull-Up$hl$
    when 3 then $hl$Playing Without the Ball$hl$
    when 4 then $hl$Creating Separation Off the Bounce$hl$
    when 5 then $hl$Reading a Drop Coverage$hl$
    when 6 then $hl$What Elite Work Actually Looks Like$hl$
  end;

update hoops.program_days pd
set film_resource_id = fr.id
from hoops.programs p, hoops.film_resources fr
where pd.program_id = p.id
  and p.name = $hl$Six-Week Handle & Attack$hl$
  and pd.day_number = 1
  and fr.title = case pd.week_number
    when 1 then $hl$Two-Ball Work and Why It Transfers$hl$
    when 2 then $hl$The Handle as a Weapon, Not a Skill$hl$
    when 3 then $hl$Shifty: Changing Speed to Beat Anyone$hl$
    when 4 then $hl$The Handle as a Weapon, Not a Skill$hl$
    when 5 then $hl$Shifty: Changing Speed to Beat Anyone$hl$
    when 6 then $hl$The Next Play Mentality$hl$
  end;
