/**
 * Turning measured scores into the same 1-10 ratings a self-rating
 * produces, so a combine and a self-scout are directly comparable and
 * flow through the identical charts, rankings and history.
 */

import { RATING_CATEGORIES, type RatingCategoryValue } from "./assessment";
import type { Ratings } from "./rating";

export type CombineDrill = {
  id: string;
  key: string;
  name: string;
  category: RatingCategoryValue;
  setup: string | null;
  cues: string[] | null;
  equipment: string[] | null;
  metric: "makes_of" | "count" | "seconds" | "inches";
  attempts: number | null;
  lower_is_better: boolean;
  // Ten ascending thresholds, one per rating point. Keyed by band so age
  // bands can be added later; "default" is the only one seeded today.
  benchmarks: Record<string, number[]> | null;
  sort_order: number;
};

/**
 * Converts a raw score to 1-10 against the drill's thresholds.
 *
 * Always returns a rating, never null — a score below the first threshold
 * is a 1 rather than an error. Nobody gets told their effort didn't
 * register.
 */
export function scoreToRating(drill: CombineDrill, rawScore: number, band = "default"): number {
  const thresholds = drill.benchmarks?.[band] ?? drill.benchmarks?.default;
  if (!thresholds || thresholds.length === 0) return 1;

  let rating = 1;
  thresholds.forEach((threshold, i) => {
    // Timed tests descend: a smaller number is a better score, so the
    // comparison flips.
    const cleared = drill.lower_is_better ? rawScore <= threshold : rawScore >= threshold;
    if (cleared) rating = i + 1;
  });

  return Math.max(1, Math.min(10, rating));
}

/** "42 / 50" or "13.2s" — how a recorded score reads back. */
export function formatScore(drill: CombineDrill, rawScore: number): string {
  if (drill.metric === "makes_of" && drill.attempts) return `${rawScore} / ${drill.attempts}`;
  if (drill.metric === "seconds") return `${rawScore}s`;
  if (drill.metric === "inches") return `${rawScore}"`;
  return String(rawScore);
}

export function scoreUnit(drill: CombineDrill): string {
  if (drill.metric === "makes_of") return `makes out of ${drill.attempts ?? "?"}`;
  if (drill.metric === "seconds") return "seconds";
  if (drill.metric === "inches") return "inches";
  return "count";
}

/**
 * Averages each category's drill ratings into the four player-card
 * ratings. Categories with no recorded score fall back to whatever the
 * player last had, so a partially completed combine never wipes out a
 * rating it didn't measure.
 */
export function ratingsFromResults(
  drills: CombineDrill[],
  scoresByDrillId: Record<string, number>,
  fallback: Ratings,
  band = "default"
): { ratings: Ratings; perDrill: Record<string, number> } {
  const perDrill: Record<string, number> = {};
  const byCategory = new Map<RatingCategoryValue, number[]>();

  drills.forEach((drill) => {
    const raw = scoresByDrillId[drill.id];
    if (raw === undefined || raw === null || Number.isNaN(raw)) return;
    const rating = scoreToRating(drill, raw, band);
    perDrill[drill.id] = rating;
    const list = byCategory.get(drill.category) ?? [];
    list.push(rating);
    byCategory.set(drill.category, list);
  });

  const ratings = { ...fallback };
  RATING_CATEGORIES.forEach((cat) => {
    const list = byCategory.get(cat.value);
    if (!list || list.length === 0) return;
    ratings[cat.value] = Math.round(list.reduce((sum, v) => sum + v, 0) / list.length);
  });

  return { ratings, perDrill };
}

/** Parses what a player typed, rejecting anything that isn't a sane score. */
export function parseScore(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}
