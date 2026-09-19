/**
 * Fixed taxonomy for coach-selectable schemes and team focus areas, with a
 * "custom" escape hatch stored in teams.offensive_scheme_custom /
 * defensive_scheme_custom when the coach picks something not on the list.
 *
 * Add to these lists any time — it's a one-line change here, not a
 * migration, since the DB stores the value as plain text.
 */

export const DEFENSIVE_SCHEMES = [
  { value: "man_to_man", label: "Man-to-Man" },
  { value: "run_and_jump", label: "Run and Jump" },
  { value: "zone_2_3", label: "2-3 Zone" },
  { value: "zone_3_2", label: "3-2 Zone" },
  { value: "zone_1_3_1", label: "1-3-1 Zone" },
  { value: "full_court_press", label: "Full-Court Press" },
  { value: "half_court_trap", label: "Half-Court Trap" },
  { value: "custom", label: "Custom / Other" },
] as const;

export const OFFENSIVE_SCHEMES = [
  { value: "motion", label: "Motion Offense" },
  { value: "princeton", label: "Princeton Offense" },
  { value: "flex", label: "Flex Offense" },
  { value: "pick_and_roll_heavy", label: "Pick-and-Roll Heavy" },
  { value: "five_out", label: "Five-Out" },
  { value: "horns", label: "Horns" },
  { value: "custom", label: "Custom / Other" },
] as const;

export const TEAM_FOCUS_AREAS = [
  { value: "transition_defense", label: "Transition Defense" },
  { value: "half_court_defense", label: "Half-Court Defense" },
  { value: "ball_handling", label: "Ball Handling / Press Break" },
  { value: "free_throw_shooting", label: "Free Throw Shooting" },
  { value: "three_point_shooting", label: "Three-Point Shooting" },
  { value: "rebounding", label: "Rebounding" },
  { value: "help_defense_rotations", label: "Help Defense / Rotations" },
  { value: "late_game_execution", label: "Late-Game Execution" },
  { value: "conditioning", label: "Conditioning" },
] as const;

export const PRIMARY_POSITIONS = [
  { value: "point_guard", label: "Point Guard" },
  { value: "shooting_guard", label: "Shooting Guard" },
  { value: "combo_guard", label: "Combo Guard" },
  { value: "small_forward", label: "Small Forward" },
  { value: "power_forward", label: "Power Forward" },
  { value: "center", label: "Center" },
] as const;
