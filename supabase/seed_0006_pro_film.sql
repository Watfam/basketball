-- ============================================================================
-- Hardwood Lab — seed 0006: Pro film study
--
-- Run after seed_0005_film_room.sql.
--
-- Kids copy pros. That’s not a problem to manage, it’s the most reliable
-- learning channel there is — so this points it at the right things.
-- Every entry names a specific player and a specific thing to steal from
-- them, because "watch Steph Curry" teaches nothing and "watch what he
-- does in the two seconds after he passes" teaches a lot.
--
-- Uses film_resources.pro_player_name, which has been in the schema since
-- the beginning and unused until now.
--
-- Same link rule as seed_0005: url stays NULL. Naming a real player and
-- describing real habits is a claim I can stand behind; asserting that a
-- particular YouTube URL shows it is not. Add links through the app’s
-- "Add film" flow.
--
-- Position tags drive the "players built like you" matching, so a 5’10"
-- guard is pointed at Brunson and Haliburton rather than at Durant.
-- ============================================================================

insert into hoops.film_resources
  (title, url, kind, difficulty, skill_tags, position_tags, watch_for, notes, pro_player_name, sort_order)
select
  v.title, null, 'pro_study', v.difficulty, v.skill_tags, v.position_tags, v.watch_for, v.notes,
  v.pro_player_name, v.sort_order
from (values
  -- ---- Stephen Curry ----
  (
    'Curry: The Two Seconds After the Pass',
    'intermediate', array['shooting'], array['point_guard', 'combo_guard', 'shooting_guard'],
    array[
      'What he does immediately after giving the ball up — he never stands and watches',
      'Relocating to a new window rather than staying where the defender left him',
      'Sprinting to space, not jogging, even when the ball is nowhere near him',
      'How much of his scoring comes from movement rather than dribbling'
    ],
    'The most copyable thing he does, and the least copied. Most of what makes him hard to guard happens when he does not have the ball.',
    'Stephen Curry', 20
  ),
  (
    'Curry: Feet Ready Before the Ball Arrives',
    'beginner', array['shooting'], array['point_guard', 'combo_guard', 'shooting_guard', 'small_forward'],
    array[
      'His feet and hips are already turned to the rim before the catch',
      'Hands up as a target the whole time, not raised once the pass is thrown',
      'How little time passes between catch and release',
      'The dip being the same every single time'
    ],
    'The release looks fast because the preparation happened early. Nothing about it is a trick.',
    'Stephen Curry', 21
  ),

  -- ---- Kevin Durant ----
  (
    'Durant: Shooting Over Everybody',
    'advanced', array['shooting'], array['small_forward', 'power_forward', 'shooting_guard'],
    array[
      'The release point — high and straight up, no fade needed',
      'Simple one-two footwork into the shot rather than anything fancy',
      'Balance through the contest: nothing leans, nothing drifts',
      'How often he takes the shot the defence gives instead of forcing a better one'
    ],
    'A masterclass in doing simple things perfectly. There is almost nothing decorative in his game.',
    'Kevin Durant', 22
  ),

  -- ---- Tyrese Haliburton ----
  (
    'Haliburton: Pace Is a Skill',
    'intermediate', array['ball_handling'], array['point_guard', 'combo_guard'],
    array[
      'How rarely he plays at full speed — and how much faster he looks because of it',
      'Slowing down to make the defence commit, then going',
      'Head and eyes up the whole time, reading rather than dribbling',
      'Getting the team into offence early without rushing it'
    ],
    'Most young guards only have one gear. Watch someone whose main weapon is the gear change.',
    'Tyrese Haliburton', 23
  ),
  (
    'Haliburton: Reading the Big',
    'advanced', array['ball_handling', 'shooting'], array['point_guard', 'combo_guard'],
    array[
      'Where the defending big is sitting as he comes off the screen',
      'Big drops deep, he takes the pull-up — the coverage decided that, not him',
      'Big steps up, the roller is open behind him',
      'The decision being made before the catch rather than after'
    ],
    'The pull-up you practise exists because of what the defence gives you. This is what reading it looks like.',
    'Tyrese Haliburton', 24
  ),

  -- ---- Jalen Brunson ----
  (
    'Brunson: Winning With Footwork, Not Speed',
    'advanced', array['ball_handling'], array['point_guard', 'combo_guard', 'shooting_guard'],
    array[
      'Stopping as the weapon — deceleration creates more space than acceleration',
      'How low he stays, and how that lets him change direction without gathering',
      'Pivots and step-throughs to get to a shot without needing separation',
      'Using his shoulder and hip to shield the ball instead of protecting it with his hands'
    ],
    'The best film in the league for a smaller guard. He is not beating anyone with speed or hops.',
    'Jalen Brunson', 25
  ),
  (
    'Brunson: Scoring Through Contact in the Paint',
    'advanced', array['ball_handling', 'athleticism'], array['point_guard', 'combo_guard'],
    array[
      'Absorbing contact and still finishing on balance',
      'Getting to the same handful of angles over and over',
      'Changing the finish based on where the help came from',
      'Never leaving his feet without knowing what he is doing'
    ],
    'A guard who lives in the paint without being big or explosive. Angles and balance do the work.',
    'Jalen Brunson', 26
  ),

  -- ---- Nikola Jokic ----
  (
    'Jokic: Seeing the Floor From the Post',
    'advanced', array['athleticism'], array['power_forward', 'center'],
    array[
      'Catching and immediately looking, before deciding to score',
      'How the threat of his passing creates his own scoring chances',
      'Footwork that is slow and deliberate rather than quick',
      'Reading where help comes from, then punishing where it left'
    ],
    'Best film there is for a big who wants to be more than a finisher. Almost nothing about it is athletic.',
    'Nikola Jokic', 27
  ),

  -- ---- Anthony Edwards ----
  (
    'Edwards: Getting Downhill',
    'intermediate', array['athleticism', 'ball_handling'], array['shooting_guard', 'small_forward'],
    array[
      'The first step being a genuine attack, not a probe',
      'Straight-line drives rather than dancing with the ball',
      'Playing off two feet near the rim so he has options',
      'How he uses the threat of the drive to get his jumper'
    ],
    'For a player whose game is built on pressure and force. Watch how direct it is.',
    'Anthony Edwards', 28
  ),

  -- ---- Jrue Holiday ----
  (
    'Holiday: Guarding the Best Player on the Floor',
    'advanced', array['defense'], array['point_guard', 'combo_guard', 'shooting_guard'],
    array[
      'Feet and chest doing the work, hands mostly quiet',
      'Beating the ballhandler to the spot instead of reacting to the move',
      'Taking away the strong hand and living with the other one',
      'Staying down on shot fakes — he almost never leaves his feet first'
    ],
    'The best on-ball defensive film in the league. Almost none of it is about stealing the ball.',
    'Jrue Holiday', 29
  ),

  -- ---- Sabrina Ionescu ----
  (
    'Ionescu: Pull-Up Range and Balance',
    'advanced', array['shooting'], array['point_guard', 'combo_guard', 'shooting_guard'],
    array[
      'Footwork into deep pull-ups — set before she rises, every time',
      'Same mechanics at thirty feet as at fifteen',
      'Creating just enough space rather than as much as possible',
      'Shot selection: range used as a weapon, not as a highlight'
    ],
    'As clean a pull-up as exists at any level. The footwork is what to steal.',
    'Sabrina Ionescu', 30
  ),

  -- ---- Caitlin Clark ----
  (
    'Clark: Passing Off the Dribble',
    'advanced', array['ball_handling'], array['point_guard', 'combo_guard'],
    array[
      'Throwing passes off the live dribble without gathering first',
      'Eyes manipulating the defence before the ball moves',
      'Hitting shooters in rhythm, so they can shoot without resetting',
      'How the deep-range threat opens everything else up'
    ],
    'Study the passing before the shooting. The range is what people talk about; the vision is what makes the team better.',
    'Caitlin Clark', 31
  )
) as v(title, difficulty, skill_tags, position_tags, watch_for, notes, pro_player_name, sort_order)
where not exists (
  select 1 from hoops.film_resources fr where fr.title = v.title
);
