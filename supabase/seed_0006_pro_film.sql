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
  v.title, null, $hl$pro_study$hl$, v.difficulty, v.skill_tags, v.position_tags, v.watch_for, v.notes,
  v.pro_player_name, v.sort_order
from (values
  -- ---- Stephen Curry ----
  (
    $hl$Curry: The Two Seconds After the Pass$hl$,
    $hl$intermediate$hl$, array[$hl$shooting$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$],
    array[
      $hl$What he does immediately after giving the ball up — he never stands and watches$hl$,
      $hl$Relocating to a new window rather than staying where the defender left him$hl$,
      $hl$Sprinting to space, not jogging, even when the ball is nowhere near him$hl$,
      $hl$How much of his scoring comes from movement rather than dribbling$hl$
    ],
    $hl$The most copyable thing he does, and the least copied. Most of what makes him hard to guard happens when he does not have the ball.$hl$,
    $hl$Stephen Curry$hl$, 20
  ),
  (
    $hl$Curry: Feet Ready Before the Ball Arrives$hl$,
    $hl$beginner$hl$, array[$hl$shooting$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$, $hl$small_forward$hl$],
    array[
      $hl$His feet and hips are already turned to the rim before the catch$hl$,
      $hl$Hands up as a target the whole time, not raised once the pass is thrown$hl$,
      $hl$How little time passes between catch and release$hl$,
      $hl$The dip being the same every single time$hl$
    ],
    $hl$The release looks fast because the preparation happened early. Nothing about it is a trick.$hl$,
    $hl$Stephen Curry$hl$, 21
  ),

  -- ---- Kevin Durant ----
  (
    $hl$Durant: Shooting Over Everybody$hl$,
    $hl$advanced$hl$, array[$hl$shooting$hl$], array[$hl$small_forward$hl$, $hl$power_forward$hl$, $hl$shooting_guard$hl$],
    array[
      $hl$The release point — high and straight up, no fade needed$hl$,
      $hl$Simple one-two footwork into the shot rather than anything fancy$hl$,
      $hl$Balance through the contest: nothing leans, nothing drifts$hl$,
      $hl$How often he takes the shot the defence gives instead of forcing a better one$hl$
    ],
    $hl$A masterclass in doing simple things perfectly. There is almost nothing decorative in his game.$hl$,
    $hl$Kevin Durant$hl$, 22
  ),

  -- ---- Tyrese Haliburton ----
  (
    $hl$Haliburton: Pace Is a Skill$hl$,
    $hl$intermediate$hl$, array[$hl$ball_handling$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$],
    array[
      $hl$How rarely he plays at full speed — and how much faster he looks because of it$hl$,
      $hl$Slowing down to make the defence commit, then going$hl$,
      $hl$Head and eyes up the whole time, reading rather than dribbling$hl$,
      $hl$Getting the team into offence early without rushing it$hl$
    ],
    $hl$Most young guards only have one gear. Watch someone whose main weapon is the gear change.$hl$,
    $hl$Tyrese Haliburton$hl$, 23
  ),
  (
    $hl$Haliburton: Reading the Big$hl$,
    $hl$advanced$hl$, array[$hl$ball_handling$hl$, $hl$shooting$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$],
    array[
      $hl$Where the defending big is sitting as he comes off the screen$hl$,
      $hl$Big drops deep, he takes the pull-up — the coverage decided that, not him$hl$,
      $hl$Big steps up, the roller is open behind him$hl$,
      $hl$The decision being made before the catch rather than after$hl$
    ],
    $hl$The pull-up you practise exists because of what the defence gives you. This is what reading it looks like.$hl$,
    $hl$Tyrese Haliburton$hl$, 24
  ),

  -- ---- Jalen Brunson ----
  (
    $hl$Brunson: Winning With Footwork, Not Speed$hl$,
    $hl$advanced$hl$, array[$hl$ball_handling$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$],
    array[
      $hl$Stopping as the weapon — deceleration creates more space than acceleration$hl$,
      $hl$How low he stays, and how that lets him change direction without gathering$hl$,
      $hl$Pivots and step-throughs to get to a shot without needing separation$hl$,
      $hl$Using his shoulder and hip to shield the ball instead of protecting it with his hands$hl$
    ],
    $hl$The best film in the league for a smaller guard. He is not beating anyone with speed or hops.$hl$,
    $hl$Jalen Brunson$hl$, 25
  ),
  (
    $hl$Brunson: Scoring Through Contact in the Paint$hl$,
    $hl$advanced$hl$, array[$hl$ball_handling$hl$, $hl$athleticism$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$],
    array[
      $hl$Absorbing contact and still finishing on balance$hl$,
      $hl$Getting to the same handful of angles over and over$hl$,
      $hl$Changing the finish based on where the help came from$hl$,
      $hl$Never leaving his feet without knowing what he is doing$hl$
    ],
    $hl$A guard who lives in the paint without being big or explosive. Angles and balance do the work.$hl$,
    $hl$Jalen Brunson$hl$, 26
  ),

  -- ---- Nikola Jokic ----
  (
    $hl$Jokic: Seeing the Floor From the Post$hl$,
    $hl$advanced$hl$, array[$hl$athleticism$hl$], array[$hl$power_forward$hl$, $hl$center$hl$],
    array[
      $hl$Catching and immediately looking, before deciding to score$hl$,
      $hl$How the threat of his passing creates his own scoring chances$hl$,
      $hl$Footwork that is slow and deliberate rather than quick$hl$,
      $hl$Reading where help comes from, then punishing where it left$hl$
    ],
    $hl$Best film there is for a big who wants to be more than a finisher. Almost nothing about it is athletic.$hl$,
    $hl$Nikola Jokic$hl$, 27
  ),

  -- ---- Anthony Edwards ----
  (
    $hl$Edwards: Getting Downhill$hl$,
    $hl$intermediate$hl$, array[$hl$athleticism$hl$, $hl$ball_handling$hl$], array[$hl$shooting_guard$hl$, $hl$small_forward$hl$],
    array[
      $hl$The first step being a genuine attack, not a probe$hl$,
      $hl$Straight-line drives rather than dancing with the ball$hl$,
      $hl$Playing off two feet near the rim so he has options$hl$,
      $hl$How he uses the threat of the drive to get his jumper$hl$
    ],
    $hl$For a player whose game is built on pressure and force. Watch how direct it is.$hl$,
    $hl$Anthony Edwards$hl$, 28
  ),

  -- ---- Jrue Holiday ----
  (
    $hl$Holiday: Guarding the Best Player on the Floor$hl$,
    $hl$advanced$hl$, array[$hl$defense$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$],
    array[
      $hl$Feet and chest doing the work, hands mostly quiet$hl$,
      $hl$Beating the ballhandler to the spot instead of reacting to the move$hl$,
      $hl$Taking away the strong hand and living with the other one$hl$,
      $hl$Staying down on shot fakes — he almost never leaves his feet first$hl$
    ],
    $hl$The best on-ball defensive film in the league. Almost none of it is about stealing the ball.$hl$,
    $hl$Jrue Holiday$hl$, 29
  ),

  -- ---- Sabrina Ionescu ----
  (
    $hl$Ionescu: Pull-Up Range and Balance$hl$,
    $hl$advanced$hl$, array[$hl$shooting$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$],
    array[
      $hl$Footwork into deep pull-ups — set before she rises, every time$hl$,
      $hl$Same mechanics at thirty feet as at fifteen$hl$,
      $hl$Creating just enough space rather than as much as possible$hl$,
      $hl$Shot selection: range used as a weapon, not as a highlight$hl$
    ],
    $hl$As clean a pull-up as exists at any level. The footwork is what to steal.$hl$,
    $hl$Sabrina Ionescu$hl$, 30
  ),

  -- ---- Caitlin Clark ----
  (
    $hl$Clark: Passing Off the Dribble$hl$,
    $hl$advanced$hl$, array[$hl$ball_handling$hl$], array[$hl$point_guard$hl$, $hl$combo_guard$hl$],
    array[
      $hl$Throwing passes off the live dribble without gathering first$hl$,
      $hl$Eyes manipulating the defence before the ball moves$hl$,
      $hl$Hitting shooters in rhythm, so they can shoot without resetting$hl$,
      $hl$How the deep-range threat opens everything else up$hl$
    ],
    $hl$Study the passing before the shooting. The range is what people talk about; the vision is what makes the team better.$hl$,
    $hl$Caitlin Clark$hl$, 31
  )
) as v(title, difficulty, skill_tags, position_tags, watch_for, notes, pro_player_name, sort_order)
where not exists (
  select 1 from hoops.film_resources fr where fr.title = v.title
);
