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

export const DEFAULT_BAND = "u16_m";

/**
 * Picks which benchmark table a score is measured against.
 *
 * A 12-year-old and a 17-year-old scored against the same thresholds
 * produces a number that means almost nothing for either of them, so age
 * comes from birth_year and the table is chosen from it. Where either
 * input is missing this falls back to u16_m — the middle of the range —
 * and the UI says so rather than letting the player assume the number was
 * calibrated for them.
 */
export function benchmarkBand(
  birthYear: number | null | undefined,
  gender: string | null | undefined,
  now: Date = new Date()
): string {
  const g = gender === "female" ? "f" : "m";
  if (!birthYear || !Number.isFinite(birthYear)) return `u16_${g}`;

  const age = now.getFullYear() - birthYear;
  // Wide guard: a birth_year that produces a nonsense age is a typo, and
  // guessing off it would be worse than using the middle band.
  if (age < 5 || age > 25) return `u16_${g}`;

  if (age <= 12) return `u13_${g}`;
  if (age <= 15) return `u16_${g}`;
  return `u19_${g}`;
}

export const BAND_LABELS: Record<string, string> = {
  u13_m: "Under 13 · Boys",
  u16_m: "Under 16 · Boys",
  u19_m: "16 and over · Boys",
  u13_f: "Under 13 · Girls",
  u16_f: "Under 16 · Girls",
  u19_f: "16 and over · Girls",
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
