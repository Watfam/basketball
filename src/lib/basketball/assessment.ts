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

export function computeArchetype(position: string, styleTags: StyleTagValue[]): string {
  const positionLabel = POSITION_LABELS[position] ?? "Baller";
  for (const tag of styleTags) {
    const label = ARCHETYPES[position]?.[tag];
    if (label) return label;
  }
  const topTagLabel = STYLE_TAGS.find((t) => t.value === styleTags[0])?.label;
  return topTagLabel ? `${topTagLabel} ${positionLabel}` : `Rising ${positionLabel}`;
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
