import { WEAKNESS_THRESHOLD, type RatingCategoryValue, type SkillLevel } from "./assessment";

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
  id: string;
  player_type_tags: WorkoutPlayerTypeTags | null;
  focus_areas: string[] | null;
  workout_drills: { drills: { difficulty: string | null } | null }[];
};

const DIFFICULTY_WEIGHT: Record<SkillLevel, number> = { beginner: 1, intermediate: 2, advanced: 3 };
const WEIGHT_TO_DIFFICULTY: Record<number, SkillLevel> = { 1: "beginner", 2: "intermediate", 3: "advanced" };

/**
 * A workout's difficulty is derived from its drills rather than stored as
 * its own field — hoops.drills.difficulty already exists and a workout is
 * only as easy as its hardest drill, so the workout's hardest drill (not
 * an average, which would undersell a workout with one genuinely tough
 * drill mixed into easier ones) sets the workout's overall difficulty.
 * Returns null if none of its drills have a difficulty set.
 */
export function computeWorkoutDifficulty(
  drillDifficulties: (string | null | undefined)[]
): SkillLevel | null {
  const weights = drillDifficulties
    .filter((d): d is SkillLevel => d === "beginner" || d === "intermediate" || d === "advanced")
    .map((d) => DIFFICULTY_WEIGHT[d]);
  if (weights.length === 0) return null;
  return WEIGHT_TO_DIFFICULTY[Math.max(...weights)];
}

type RankOptions = {
  // The player's current level (their override, or the assessment's
  // suggestion) — workouts at this level rank higher.
  playerLevel?: SkillLevel | null;
  // workout_id -> ISO date string of the most recent completed session for
  // that workout, so something just done sinks down instead of camping at
  // the top of "Up Next" forever with zero memory of having happened.
  lastCompletedByWorkoutId?: Record<string, string>;
};

const RECENT_COMPLETION_WINDOW_DAYS = 3;

/**
 * Reorders (never filters) workouts toward what's most relevant to a
 * player: a real position match outweighs a shared style tag, and a focus
 * area tied to a genuine weakness (same WEAKNESS_THRESHOLD bar as the
 * assessment's goal ranking, not just "not a perfect 10") gets a boost. A
 * workout with no position_tags at all is treated as universal and gets a
 * small baseline so it's not buried behind position-specific ones it
 * can't compete with. A level match adds a further boost, and a workout
 * finished in the last few days gets a penalty (not removed — still
 * reachable, just not hogging the top slot right after you did it).
 */
export function rankWorkouts<T extends WorkoutForMatching>(
  playerType: PlayerType,
  workouts: T[],
  options: RankOptions = {}
): T[] {
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

    if (options.playerLevel) {
      const difficulty = computeWorkoutDifficulty(workout.workout_drills.map((wd) => wd.drills?.difficulty));
      if (difficulty === options.playerLevel) score += 2;
    }

    const lastCompletedIso = options.lastCompletedByWorkoutId?.[workout.id];
    if (lastCompletedIso) {
      const daysSince = (Date.now() - new Date(lastCompletedIso).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSince < RECENT_COMPLETION_WINDOW_DAYS) score -= 3;
    }

    return { workout, index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.workout);
}
