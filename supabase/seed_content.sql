-- ============================================================================
-- Hardwood Lab — Starter content library
--
-- hoops.drills / hoops.workouts / hoops.workout_drills are readable by any
-- signed-in user but writable only via the service role (see the
-- "Content libraries" RLS policies in schema.sql) — curated content is
-- something you seed, not something the app writes. Run this once in the
-- Supabase SQL Editor after schema.sql.
--
-- video_url is left NULL throughout — fill in real YouTube links (Micah
-- Lancaster, Reid Ouse, or pro film) once you have them. Never rehost
-- video, per the project brief.
--
-- skill_tags / focus_areas deliberately reuse the same four categories as
-- the onboarding assessment’s ratings (ball_handling, shooting, defense,
-- athleticism) so a player’s self-rated weak spots can drive curation
-- directly — see src/lib/basketball/workout-matching.ts.
-- ============================================================================

with
d_two_ball as (
  insert into hoops.drills (name, description, skill_tags, position_tags, difficulty, source_trainer)
  values (
    'Two-Ball Dribbling Series',
    'Simultaneous two-ball dribbling combos to build hand speed, control, and ambidexterity.',
    array['ball_handling'], array['point_guard', 'combo_guard', 'shooting_guard'], 'intermediate', 'Micah Lancaster'
  )
  returning id
),
d_cone_crossover as (
  insert into hoops.drills (name, description, skill_tags, difficulty)
  values (
    'Cone Crossover Attack',
    'Attack a line of cones with crossover and hesitation combos at game speed.',
    array['ball_handling'], 'beginner'
  )
  returning id
),
d_form_shooting as (
  insert into hoops.drills (name, description, skill_tags, difficulty, source_trainer)
  values (
    'Form Shooting Progression',
    'Close-range form shooting up through the arc, rebuilding mechanics one step at a time.',
    array['shooting'], 'beginner', 'Reid Ouse'
  )
  returning id
),
d_pullup_series as (
  insert into hoops.drills (name, description, skill_tags, position_tags, difficulty)
  values (
    'Off-the-Dribble Pull-Up Series',
    'Live-dribble pull-up jumpers off combo moves, game-speed footwork and balance.',
    array['shooting'], array['point_guard', 'combo_guard', 'shooting_guard', 'small_forward'], 'intermediate'
  )
  returning id
),
d_closeout as (
  insert into hoops.drills (name, description, skill_tags, difficulty)
  values (
    'Closeout & Slide Defense Drill',
    'Sprint closeouts into a defensive slide, staying in front without fouling.',
    array['defense'], 'beginner'
  )
  returning id
),
d_1on1_mirror as (
  insert into hoops.drills (name, description, skill_tags, difficulty)
  values (
    '1-on-1 Defensive Mirror Drill',
    $hl$Mirror an attacker's hips and shoulders in a live 1-on-1 shell, no ball.$hl$,
    array['defense'], 'intermediate'
  )
  returning id
),
d_vertical as (
  insert into hoops.drills (name, description, skill_tags, equipment, difficulty)
  values (
    'Vertical Jump & Explosiveness Circuit',
    'Depth jumps, broad jumps, and box jumps to build lower-body explosiveness.',
    array['athleticism'], array['box or sturdy step'], 'intermediate'
  )
  returning id
),
d_agility_ladder as (
  insert into hoops.drills (name, description, skill_tags, equipment, difficulty)
  values (
    'Agility Ladder + Reaction Drill',
    'Ladder footwork patterns finishing with a reactive sprint or cut on a called cue.',
    array['athleticism'], array['agility ladder'], 'beginner'
  )
  returning id
),
d_post_footwork as (
  insert into hoops.drills (name, description, skill_tags, position_tags, difficulty)
  values (
    'Big Man Post-Up Footwork',
    'Drop-step, up-and-under, and jump-hook footwork off a catch on the block.',
    array['athleticism', 'shooting'], array['power_forward', 'center'], 'intermediate'
  )
  returning id
),

w_guard_handles as (
  insert into hoops.workouts (name, description, player_type_tags, focus_areas, estimated_minutes)
  values (
    'Guard Ball-Handling Foundations',
    'Two drills to sharpen the handle for guards who create off the dribble.',
    jsonb_build_object('positions', array['point_guard', 'combo_guard', 'shooting_guard'], 'style_tags', array['playmaker', 'slasher']),
    array['ball_handling'], 30
  )
  returning id
),
w_shooters_workshop as (
  insert into hoops.workouts (name, description, player_type_tags, focus_areas, estimated_minutes)
  values (
    $hl$Shooter's Workshop$hl$,
    'Form shooting into live-dribble pull-ups — build a repeatable, game-speed shot.',
    jsonb_build_object('style_tags', array['shooter']),
    array['shooting'], 35
  )
  returning id
),
w_lockdown as (
  insert into hoops.workouts (name, description, player_type_tags, focus_areas, estimated_minutes)
  values (
    'Lockdown Defender Circuit',
    'Closeouts into live mirror work — the two reps every on-ball defender needs.',
    jsonb_build_object('style_tags', array['lockdown_defender']),
    array['defense'], 25
  )
  returning id
),
w_athletic_dev as (
  insert into hoops.workouts (name, description, player_type_tags, focus_areas, estimated_minutes)
  values (
    'Athletic Development Block',
    'General explosiveness and reactive agility work — useful for every player type.',
    '{}'::jsonb,
    array['athleticism'], 20
  )
  returning id
),
w_post_package as (
  insert into hoops.workouts (name, description, player_type_tags, focus_areas, estimated_minutes)
  values (
    'Post Player Package',
    'Footwork on the block paired with explosiveness work for bigs.',
    jsonb_build_object('positions', array['power_forward', 'center']),
    array['athleticism', 'shooting'], 30
  )
  returning id
)

insert into hoops.workout_drills (workout_id, drill_id, sort_order, target_sets, target_reps)
select w_guard_handles.id, d_two_ball.id, 0, 3, 30 from w_guard_handles, d_two_ball
union all
select w_guard_handles.id, d_cone_crossover.id, 1, 3, 20 from w_guard_handles, d_cone_crossover
union all
select w_shooters_workshop.id, d_form_shooting.id, 0, 4, 15 from w_shooters_workshop, d_form_shooting
union all
select w_shooters_workshop.id, d_pullup_series.id, 1, 4, 10 from w_shooters_workshop, d_pullup_series
union all
select w_lockdown.id, d_closeout.id, 0, 4, 8 from w_lockdown, d_closeout
union all
select w_lockdown.id, d_1on1_mirror.id, 1, 3, 60 from w_lockdown, d_1on1_mirror
union all
select w_athletic_dev.id, d_vertical.id, 0, 4, 8 from w_athletic_dev, d_vertical
union all
select w_athletic_dev.id, d_agility_ladder.id, 1, 3, 30 from w_athletic_dev, d_agility_ladder
union all
select w_post_package.id, d_post_footwork.id, 0, 4, 10 from w_post_package, d_post_footwork
union all
select w_post_package.id, d_vertical.id, 1, 4, 8 from w_post_package, d_vertical;
