-- ============================================================================
-- Hardwood Lab — seed 0008: real film links, and curated study sessions
--
-- Run after migrations/0007_film_sessions.sql.
--
-- ON THESE LINKS
--
-- Every URL below came back in a web search with its title attached, so
-- the video exists and is about what the row claims. That is a real check
-- but not a perfect one: I have not watched them, and YouTube videos get
-- deleted or made private. If one is dead or is not teaching what the
-- lesson says, delete the link and put a better one in through Add film.
--
-- Channels represented: Thinking Basketball (Ben Taylor) for the IQ and
-- pro-analysis pieces, plus skills channels for the footwork breakdowns.
--
-- Dollar quoting throughout. See seed_0005: doubled-apostrophe escapes do
-- not survive the editor paste path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Attach verified links to existing pro film lessons
-- ----------------------------------------------------------------------------
update hoops.film_resources set
  url = $hl$https://www.youtube.com/watch?v=OokDjXCiYDs$hl$,
  duration_seconds = 600
where title = $hl$Curry: The Two Seconds After the Pass$hl$ and url is null;

update hoops.film_resources set
  url = $hl$https://www.youtube.com/watch?v=40mCR9b_7n0$hl$,
  duration_seconds = 540
where title = $hl$Curry: Feet Ready Before the Ball Arrives$hl$ and url is null;

update hoops.film_resources set
  url = $hl$https://www.youtube.com/watch?v=YJo9JZc4_Eo$hl$,
  duration_seconds = 480
where title = $hl$Brunson: Winning With Footwork, Not Speed$hl$ and url is null;

update hoops.film_resources set
  url = $hl$https://www.youtube.com/watch?v=H4mSY-RPkm4$hl$,
  duration_seconds = 420
where title = $hl$Brunson: Scoring Through Contact in the Paint$hl$ and url is null;

update hoops.film_resources set
  url = $hl$https://www.youtube.com/watch?v=Jg_EHmVPuLU$hl$,
  duration_seconds = 600
where title = $hl$Haliburton: Reading the Big$hl$ and url is null;

update hoops.film_resources set
  url = $hl$https://www.youtube.com/watch?v=KrGCy72wB_c$hl$,
  duration_seconds = 480
where title = $hl$Haliburton: Pace Is a Skill$hl$ and url is null;

update hoops.film_resources set
  url = $hl$https://www.youtube.com/watch?v=uecdp5NsnO0$hl$,
  duration_seconds = 900
where title = $hl$Jokic: Seeing the Floor From the Post$hl$ and url is null;

-- Curry gravity piece doubles as the off-ball IQ lesson, which has no
-- trainer attached and was the weakest row in the library without a link.
update hoops.film_resources set
  url = $hl$https://www.youtube.com/watch?v=NjYX7jc0dOI$hl$,
  duration_seconds = 720
where title = $hl$Playing Without the Ball$hl$ and url is null;

-- ----------------------------------------------------------------------------
-- 2. Study sessions
--
-- Short courses, three or four lessons each, built around one idea a
-- player can actually take onto a court.
-- ----------------------------------------------------------------------------
insert into hoops.film_sessions (name, description, outcome, skill_tags, position_tags, difficulty, sort_order)
values
  (
    $hl$Score Without Being the Biggest$hl$,
    $hl$Jalen Brunson is 6'1" and gets any shot he wants. None of it is speed or hops - it is footwork, deceleration and angles.$hl$,
    $hl$You will know how to create a shot when you cannot simply go past someone.$hl$,
    array[$hl$ball_handling$hl$, $hl$shooting$hl$],
    array[$hl$point_guard$hl$, $hl$combo_guard$hl$, $hl$shooting_guard$hl$],
    $hl$intermediate$hl$, 0
  ),
  (
    $hl$Get Open Without the Ball$hl$,
    $hl$Most of a game is spent without the ball. Curry scores more off movement than off the dribble, and almost all of it is copyable.$hl$,
    $hl$You will stop standing and watching, and start scoring on possessions that never came through your hands.$hl$,
    array[$hl$shooting$hl$],
    array[$hl$shooting_guard$hl$, $hl$small_forward$hl$, $hl$combo_guard$hl$],
    $hl$beginner$hl$, 1
  ),
  (
    $hl$Run the Pick and Roll$hl$,
    $hl$The read happens before the catch. Haliburton is the clearest film there is on making the defence decide, then punishing whatever it chose.$hl$,
    $hl$You will know what the defence is giving you coming off a screen, instead of guessing.$hl$,
    array[$hl$ball_handling$hl$, $hl$shooting$hl$],
    array[$hl$point_guard$hl$, $hl$combo_guard$hl$],
    $hl$advanced$hl$, 2
  ),
  (
    $hl$See the Floor Like a Big$hl$,
    $hl$Jokic is the best passing big ever and almost none of it is athletic. It is catching, looking, and reading where the help came from.$hl$,
    $hl$You will start catching with your eyes up instead of deciding to score before you have seen anything.$hl$,
    array[$hl$athleticism$hl$],
    array[$hl$power_forward$hl$, $hl$center$hl$],
    $hl$intermediate$hl$, 3
  )
on conflict (name) do update set
  description = excluded.description,
  outcome = excluded.outcome,
  skill_tags = excluded.skill_tags,
  position_tags = excluded.position_tags,
  difficulty = excluded.difficulty,
  sort_order = excluded.sort_order;

insert into hoops.film_session_items (film_session_id, film_resource_id, sort_order, prompt)
select s.id, fr.id, v.sort_order, v.prompt
from (values
  ($hl$Score Without Being the Biggest$hl$, $hl$Brunson: Winning With Footwork, Not Speed$hl$, 0,
   $hl$Count how many times he beats someone by stopping rather than by accelerating.$hl$),
  ($hl$Score Without Being the Biggest$hl$, $hl$Brunson: Scoring Through Contact in the Paint$hl$, 1,
   $hl$Notice he gets to the same few angles over and over. Pick one you could add this week.$hl$),
  ($hl$Score Without Being the Biggest$hl$, $hl$Creating Separation Off the Bounce$hl$, 2,
   $hl$Now watch the step-back with footwork in mind rather than the shot.$hl$),

  ($hl$Get Open Without the Ball$hl$, $hl$Curry: The Two Seconds After the Pass$hl$, 0,
   $hl$Watch only what he does after giving the ball up. Ignore the shots entirely.$hl$),
  ($hl$Get Open Without the Ball$hl$, $hl$Curry: Feet Ready Before the Ball Arrives$hl$, 1,
   $hl$Watch his feet and hands before the catch, not the release.$hl$),
  ($hl$Get Open Without the Ball$hl$, $hl$Playing Without the Ball$hl$, 2,
   $hl$Ask what your own team would look like if one player moved like this.$hl$),

  ($hl$Run the Pick and Roll$hl$, $hl$Haliburton: Pace Is a Skill$hl$, 0,
   $hl$Count the gear changes. Notice how rarely he is at full speed.$hl$),
  ($hl$Run the Pick and Roll$hl$, $hl$Haliburton: Reading the Big$hl$, 1,
   $hl$Pause before each decision and call out what you would do. Then see what he did.$hl$),
  ($hl$Run the Pick and Roll$hl$, $hl$Reading a Drop Coverage$hl$, 2,
   $hl$Tie it back to your own pull-up: which coverage makes that shot the right one?$hl$),

  ($hl$See the Floor Like a Big$hl$, $hl$Jokic: Seeing the Floor From the Post$hl$, 0,
   $hl$Watch where his eyes go on the catch, before he has decided anything.$hl$),
  ($hl$See the Floor Like a Big$hl$, $hl$Guarding the Ball: Hips, Not Hands$hl$, 1,
   $hl$Flip it round: how would you defend him, and what would he do to you next?$hl$)
) as v(session_name, film_title, sort_order, prompt)
join hoops.film_sessions s on s.name = v.session_name
join hoops.film_resources fr on fr.title = v.film_title
on conflict (film_session_id, film_resource_id) do update set
  sort_order = excluded.sort_order,
  prompt = excluded.prompt;
