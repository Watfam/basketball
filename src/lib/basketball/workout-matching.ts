import { WEAKNESS_THRESHOLD, type RatingCategoryValue } from "./assessment";

/**
 * Matching against a player's computed player_type — the same shape
 * computePlayerType() in assessment.ts writes to hoops.players.player_type.
 * Kept loose/partial since older or hand-edited rows may be missing fields.
 */
export type PlayerType = {
  primary_position?: string | null;
  style_tags?: string[];
  ratings?: Partial<Record<RatingCategoryValue, number>>;
};

// The matching criteria stored in hoops.workouts.player_type_tags — an
// intentionally small, freeform JSONB shape (see schema.sql) rather than
// fixed columns, so new signals can be added without a migration.
export type WorkoutPlayerTypeTags = {
  positions?: string[];
  style_tags?: string[];
};

export type WorkoutForMatching = {
  player_type_tags: WorkoutPlayerTypeTags | null;
  focus_areas: string[] | null;
};

/**
 * Reorders (never filters) workouts toward what's most relevant to a
 * player: a real position match outweighs a shared style tag, and a focus
 * area tied to a genuine weakness (same WEAKNESS_THRESHOLD bar as the
 * assessment's goal ranking, not just "not a perfect 10") gets a boost. A
 * workout with no position_tags at all is treated as universal and gets a
 * small baseline so it's not buried behind position-specific ones it
 * can't compete with.
 */
export function rankWorkouts<T extends WorkoutForMatching>(playerType: PlayerType, workouts: T[]): T[] {
  const position = playerType.primary_position ?? null;
  const styleTags = new Set(playerType.style_tags ?? []);
  const ratings = playerType.ratings ?? {};
  const weakSkills = new Set(
    (Object.keys(ratings) as RatingCategoryValue[]).filter((cat) => {
      const value = ratings[cat];
      return value !== undefined && value < WEAKNESS_THRESHOLD;
    })
  );

  const scored = workouts.map((workout, index) => {
    const tags = workout.player_type_tags ?? {};
    let score = 0;

    if (tags.positions && tags.positions.length > 0) {
      if (position && tags.positions.includes(position)) score += 3;
    } else {
      score += 1; // universal workout, no position restriction
    }

    for (const tag of tags.style_tags ?? []) {
      if (styleTags.has(tag)) score += 1;
    }

    for (const area of workout.focus_areas ?? []) {
      if (weakSkills.has(area as RatingCategoryValue)) score += 2;
    }

    return { workout, index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.workout);
}
