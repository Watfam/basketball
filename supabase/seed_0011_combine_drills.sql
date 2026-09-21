-- ============================================================================
-- Hardwood Lab — seed 0011: combine tests and benchmarks
--
-- Run after migrations/0010_measured_combine.sql.
--
-- ON THE BENCHMARK NUMBERS — READ THIS
--
-- The tests are standard and the protocols are real. The thresholds are
-- my estimates, calibrated for roughly a 14 to 16 year old, and they are
-- the part of this file most likely to be wrong. You coach this age group
-- and can see immediately whether a 10 is genuinely exceptional or
-- whether half a team clears it.
--
-- Two known limits:
--   1. One set of numbers for every age. A 12 year old will rate low
--      against these and a varsity senior will top out. Benchmarks are
--      JSONB keyed by band so age banding can be added without a
--      migration - u13 and u17 keys would just work.
--   2. Calibrated for boys. Adjust if that matters for your players.
--
-- Each benchmarks array is ten ascending thresholds, one per rating
-- point: clear the first to earn a 1, clear the tenth to earn a 10. For
-- timed tests lower_is_better is true and the array descends.
--
-- Dollar quoting throughout: see seed_0005.
-- ============================================================================

insert into hoops.assessment_drills
  (key, name, category, metric, attempts, lower_is_better, setup, cues, equipment, benchmarks, sort_order)
values
  -- ---- Shooting ----
  (
    $hl$spot_shooting$hl$, $hl$Five-Spot Shooting$hl$, $hl$shooting$hl$, $hl$makes_of$hl$, 50, false,
    $hl$Five spots: both corners, both wings, top of the key. Ten shots at each, in order. Shoot from the distance you actually shoot from in games - pick it once and use the same distance every time you retest.$hl$,
    array[
      $hl$Same distance every retest, or the number means nothing$hl$,
      $hl$Game speed - catch and shoot, do not walk into them$hl$,
      $hl$Count only clean makes$hl$
    ],
    array[$hl$ball$hl$, $hl$hoop$hl$],
    $hl${"default": [10, 14, 18, 21, 24, 27, 30, 34, 38, 42]}$hl$::jsonb, 0
  ),
  (
    $hl$free_throws$hl$, $hl$Free Throws$hl$, $hl$shooting$hl$, $hl$makes_of$hl$, 10, false,
    $hl$Ten free throws. Full routine on every one, exactly as you would in a game.$hl$,
    array[
      $hl$Same routine every single rep$hl$,
      $hl$Do not rush them to get it over with$hl$
    ],
    array[$hl$ball$hl$, $hl$hoop$hl$],
    $hl${"default": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}$hl$::jsonb, 1
  ),

  -- ---- Ball handling ----
  (
    $hl$two_ball_30$hl$, $hl$Two-Ball Pound, 30 Seconds$hl$, $hl$ball_handling$hl$, $hl$count$hl$, null, false,
    $hl$Two balls, athletic stance, pound both at the same time for thirty seconds. Count one for each time both balls hit the floor together. Eyes up the whole time.$hl$,
    array[
      $hl$Both balls together counts as one$hl$,
      $hl$Eyes up - looking down voids the rep$hl$,
      $hl$Stay in your stance as it burns$hl$
    ],
    array[$hl$two balls$hl$, $hl$timer$hl$],
    $hl${"default": [30, 38, 45, 52, 58, 64, 70, 76, 82, 90]}$hl$::jsonb, 2
  ),
  (
    $hl$cone_slalom$hl$, $hl$Cone Slalom$hl$, $hl$ball_handling$hl$, $hl$seconds$hl$, null, true,
    $hl$Five cones in a line, three big steps apart. Dribble through them down and back, changing hands at every cone. Time the whole run.$hl$,
    array[
      $hl$Change hands at every cone, no skipping$hl$,
      $hl$Stay low - popping upright is slower$hl$,
      $hl$Lost ball means restart the run$hl$
    ],
    array[$hl$ball$hl$, $hl$5 cones$hl$, $hl$timer$hl$],
    $hl${"default": [19.0, 17.5, 16.5, 15.6, 14.8, 14.0, 13.2, 12.5, 11.8, 11.0]}$hl$::jsonb, 3
  ),
  (
    $hl$layups_60$hl$, $hl$Layups, 60 Seconds$hl$, $hl$ball_handling$hl$, $hl$count$hl$, null, false,
    $hl$One minute. Alternate hands every make - right hand, left hand, right hand. Chase your own rebound. Count makes only.$hl$,
    array[
      $hl$Alternate hands, no favouring the strong side$hl$,
      $hl$Off the correct foot every time$hl$,
      $hl$Misses do not count, so do not sacrifice the finish for speed$hl$
    ],
    array[$hl$ball$hl$, $hl$hoop$hl$, $hl$timer$hl$],
    $hl${"default": [12, 15, 18, 21, 24, 27, 30, 33, 36, 40]}$hl$::jsonb, 4
  ),

  -- ---- Athleticism ----
  (
    $hl$vertical_jump$hl$, $hl$Max Vertical$hl$, $hl$athleticism$hl$, $hl$inches$hl$, null, false,
    $hl$Stand flat against a wall and mark your highest reach. Then jump and mark the highest point you touch. The difference is your vertical. Best of three.$hl$,
    array[
      $hl$Measure the standing reach honestly - flat feet$hl$,
      $hl$Best of three attempts, full rest between$hl$,
      $hl$Two-foot jump$hl$
    ],
    array[$hl$wall$hl$, $hl$chalk or tape$hl$, $hl$tape measure$hl$],
    $hl${"default": [10, 12, 14, 16, 18, 20, 23, 26, 29, 32]}$hl$::jsonb, 5
  ),
  (
    $hl$sprint_34$hl$, $hl$Three-Quarter Court Sprint$hl$, $hl$athleticism$hl$, $hl$seconds$hl$, null, true,
    $hl$From the baseline, sprint to the far free-throw line. Standing start, no run-up. Best of two.$hl$,
    array[
      $hl$Standing start - no rocking into it$hl$,
      $hl$Run through the line, do not slow into it$hl$,
      $hl$Full rest between the two attempts$hl$
    ],
    array[$hl$court$hl$, $hl$timer$hl$],
    $hl${"default": [4.7, 4.4, 4.2, 4.0, 3.85, 3.7, 3.55, 3.4, 3.25, 3.1]}$hl$::jsonb, 6
  ),

  -- ---- Defense ----
  (
    $hl$defensive_slides_30$hl$, $hl$Defensive Slides, 30 Seconds$hl$, $hl$defense$hl$, $hl$count$hl$, null, false,
    $hl$Start on one lane line. Slide across the key and touch the far line, then back. Thirty seconds. Count every line touch.$hl$,
    array[
      $hl$Slide - never cross your feet$hl$,
      $hl$Stay down the whole time$hl$,
      $hl$Touch the line with your hand, no cheating the distance$hl$
    ],
    array[$hl$court$hl$, $hl$timer$hl$],
    $hl${"default": [12, 14, 16, 18, 20, 22, 24, 26, 28, 31]}$hl$::jsonb, 7
  ),
  (
    $hl$lane_agility$hl$, $hl$Lane Agility$hl$, $hl$defense$hl$, $hl$seconds$hl$, null, true,
    $hl$Run the rectangle of the key: sprint up the side, slide across the top, backpedal down the other side, slide across the baseline. One full lap, timed.$hl$,
    array[
      $hl$Slide the widths, sprint and backpedal the lengths$hl$,
      $hl$Feet never cross on the slides$hl$,
      $hl$Stay low through the corners - that is where the time goes$hl$
    ],
    array[$hl$court$hl$, $hl$timer$hl$],
    $hl${"default": [17.0, 15.8, 15.0, 14.2, 13.6, 13.0, 12.5, 12.0, 11.5, 11.0]}$hl$::jsonb, 8
  )
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  metric = excluded.metric,
  attempts = excluded.attempts,
  lower_is_better = excluded.lower_is_better,
  setup = excluded.setup,
  cues = excluded.cues,
  equipment = excluded.equipment,
  benchmarks = excluded.benchmarks,
  sort_order = excluded.sort_order;
