/**
 * Onboarding assessment content + player_type computation.
 *
 * The quiz answers (freeform JSONB in hoops.assessments.answers) drive a
 * computed_player_type snapshot written back to hoops.players.player_type.
 * Deliberately a small, fixed set of signals for the MVP — the JSONB shape
 * on both tables means this can grow (more questions, more signals) without
 * a migration.
 */

export const STYLE_TAGS = [
  { value: "playmaker", label: "Playmaker", blurb: "Sets up the offense, sees the floor" },
  { value: "shooter", label: "Shooter", blurb: "Lights it up from deep" },
  { value: "slasher", label: "Slasher", blurb: "Attacks the rim, finishes through contact" },
  { value: "lockdown_defender", label: "Lockdown Defender", blurb: "Guards the other team's best player" },
  { value: "rebounder", label: "Rebounder", blurb: "Wins the glass on both ends" },
  { value: "rim_protector", label: "Rim Protector", blurb: "Erases shots at the basket" },
  { value: "high_motor", label: "High Motor", blurb: "Outworks everyone, every possession" },
  { value: "floor_general", label: "Floor General", blurb: "Talks, directs, controls the pace" },
] as const;

export type StyleTagValue = (typeof STYLE_TAGS)[number]["value"];

export const ASSESSMENT_GOALS = [
  { value: "make_the_team", label: "Make varsity / my travel team" },
  { value: "primary_ballhandler", label: "Become the primary ballhandler" },
  { value: "improve_shooting", label: "Become a reliable shooter" },
  { value: "get_stronger_faster", label: "Get stronger and faster" },
  { value: "more_confidence", label: "Play with more confidence" },
] as const;

type GoalValue = (typeof ASSESSMENT_GOALS)[number]["value"];

// Which positions a goal is especially relevant to, and which self-rating
// (if any) makes it more relevant the lower it is — a low score reads as
// "room to grow here," not "bad at this." Goals with neither stay neutral
// (make_the_team, more_confidence) rather than being force-ranked.
const GOAL_RELEVANCE: Partial<
  Record<GoalValue, { positions?: string[]; lowRatingCategory?: RatingCategoryValue }>
> = {
  primary_ballhandler: {
    positions: ["point_guard", "combo_guard", "shooting_guard"],
    lowRatingCategory: "ball_handling",
  },
  improve_shooting: { lowRatingCategory: "shooting" },
  get_stronger_faster: {
    positions: ["power_forward", "center"],
    lowRatingCategory: "athleticism",
  },
};

export const RATING_CATEGORIES = [
  { value: "ball_handling", label: "Ball Handling" },
  { value: "shooting", label: "Shooting" },
  { value: "defense", label: "Defense" },
  { value: "athleticism", label: "Athleticism" },
] as const;

export type RatingCategoryValue = (typeof RATING_CATEGORIES)[number]["value"];

// 1-10 scale rather than 1-5 — gives self-ratings (and the Player Card
// stat bars built from them) more room to actually vary between players.
export const RATING_SCALE_MAX = 10;

export type AssessmentAnswers = {
  primary_position: string;
  style_tags: StyleTagValue[];
  ratings: Record<RatingCategoryValue, number>;
  goal: string;
};

// Position label + a style tag → a punchier "poster" archetype name than a
// plain position label. Not exhaustive by design — falls back gracefully.
const ARCHETYPES: Record<string, Partial<Record<StyleTagValue, string>>> = {
  point_guard: {
    playmaker: "Floor-General Point Guard",
    shooter: "Scoring Point Guard",
    slasher: "Downhill Point Guard",
    lockdown_defender: "Pest-on-the-Ball Point Guard",
    high_motor: "Relentless Point Guard",
    floor_general: "Floor-General Point Guard",
  },
  shooting_guard: {
    shooter: "Sharpshooting Guard",
    slasher: "Slashing Shooting Guard",
    lockdown_defender: "3-and-D Shooting Guard",
    high_motor: "High-Motor Shooting Guard",
  },
  combo_guard: {
    shooter: "Sharpshooting Combo Guard",
    slasher: "Slashing Combo Guard",
    playmaker: "Playmaking Combo Guard",
    lockdown_defender: "3-and-D Combo Guard",
  },
  small_forward: {
    shooter: "3-and-D Small Forward",
    slasher: "Slashing Small Forward",
    lockdown_defender: "Lockdown Small Forward",
    high_motor: "High-Motor Small Forward",
  },
  power_forward: {
    rebounder: "Glass-Eating Power Forward",
    rim_protector: "Rim-Protecting Power Forward",
    shooter: "Stretch Power Forward",
    high_motor: "Hustle Power Forward",
  },
  center: {
    rim_protector: "Rim-Protecting Center",
    rebounder: "Glass-Eating Center",
    high_motor: "Bruising Center",
    shooter: "Face-Up Center",
  },
};

const POSITION_LABELS: Record<string, string> = {
  point_guard: "Point Guard",
  shooting_guard: "Shooting Guard",
  combo_guard: "Combo Guard",
  small_forward: "Small Forward",
  power_forward: "Power Forward",
  center: "Center",
};

/**
 * Reorders (never filters) the goal list so the goals most relevant to
 * this player's position and weakest self-ratings surface first, while
 * every option stays available — a center who dreams of running the
 * offense shouldn't be blocked from picking that goal, just not have it
 * shoved in front of him by default.
 */
// Below this, a rating counts as genuine "room to grow." Purely relative
// ranking (just picking whichever of the three is lowest) would flag an
// 8/10 as a "weakness" for a player who rated 9/8/9/9 — nothing about
// that player is actually weak, so a well-rounded strong player should
// fall back to the neutral goal order instead of an invented weak spot.
export const WEAKNESS_THRESHOLD = Math.floor(RATING_SCALE_MAX * 0.6);

export function rankAssessmentGoals(
  position: string,
  ratings: Record<RatingCategoryValue, number>
): typeof ASSESSMENT_GOALS[number][] {
  // Of the ratings that actually clear the "room to grow" bar, the
  // weakest and second-weakest count (weighted higher for the weakest)
  // — so two goals can move instead of always just one, but only when
  // there's a real weakness to point at.
  const skillCategories: RatingCategoryValue[] = ["ball_handling", "shooting", "athleticism"];
  const [weakestCategory, secondWeakestCategory] = skillCategories
    .filter((cat) => ratings[cat] < WEAKNESS_THRESHOLD)
    .sort((a, b) => ratings[a] - ratings[b]);

  const scored = ASSESSMENT_GOALS.map((goal, index) => {
    const rule = GOAL_RELEVANCE[goal.value];
    let score = 0;
    if (rule?.positions?.includes(position)) score += 3;
    // Guard against both sides being `undefined` (no genuine weakness AND
    // a neutral goal with no lowRatingCategory) accidentally "matching."
    if (weakestCategory && rule?.lowRatingCategory === weakestCategory) score += 2;
    else if (secondWeakestCategory && rule?.lowRatingCategory === secondWeakestCategory) score += 1;
    return { goal, index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.goal);
}

export function computeArchetype(position: string, styleTags: StyleTagValue[]): string {
  const positionLabel = POSITION_LABELS[position] ?? "Baller";
  for (const tag of styleTags) {
    const label = ARCHETYPES[position]?.[tag];
    if (label) return label;
  }
  const topTagLabel = STYLE_TAGS.find((t) => t.value === styleTags[0])?.label;
  return topTagLabel ? `${topTagLabel} ${positionLabel}` : `Rising ${positionLabel}`;
}

export const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export type SkillLevel = (typeof SKILL_LEVELS)[number]["value"];

/**
 * A starting point, not a verdict — the assessment's own ratings suggest
 * a level so a player isn't handed a blank "pick one" with no context,
 * but this is always meant to be overridden (see the hub's level picker).
 * Auto-only (no override) would be a black box with no fallback if it
 * guesses wrong; manual-only would throw away the personalization the
 * assessment already captured. This is the middle ground.
 */
export function suggestSkillLevel(ratings: Record<RatingCategoryValue, number>): SkillLevel {
  const values = Object.values(ratings);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (average < RATING_SCALE_MAX * 0.4) return "beginner";
  if (average < RATING_SCALE_MAX * 0.7) return "intermediate";
  return "advanced";
}

export function computePlayerType(answers: AssessmentAnswers) {
  return {
    primary_position: answers.primary_position,
    style_tags: answers.style_tags,
    ratings: answers.ratings,
    goal: answers.goal,
    archetype: computeArchetype(answers.primary_position, answers.style_tags),
  };
}

export type ComputedPlayerType = ReturnType<typeof computePlayerType>;
