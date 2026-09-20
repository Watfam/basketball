/**
 * Player overall rating — the single number a player chases.
 *
 * Deliberately modeled on the 2K-style 0-99 overall rather than showing a
 * raw 1-10 average: the target audience (middle/high school) already reads
 * that scale fluently, and a 2-point move on a 99-scale feels like progress
 * in a way "6.2 -> 6.4" never does. Nothing about this is a real evaluation
 * of a player — it's a self-assessment made legible.
 */

import {
  RATING_CATEGORIES,
  RATING_SCALE_MAX,
  type RatingCategoryValue,
} from "./assessment";

export type Ratings = Record<RatingCategoryValue, number>;

// Floor of 40, not 0. A kid who rates himself honestly low should not be
// handed a "12 OVR" — the floor keeps the scale motivating while still
// leaving the full usable range (40-99) to move through.
const OVR_FLOOR = 40;
const OVR_CEILING = 99;

export function computeOverall(ratings: Ratings): number {
  const values = RATING_CATEGORIES.map((c) => ratings[c.value] ?? 0);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  const scaled = OVR_FLOOR + (average / RATING_SCALE_MAX) * (OVR_CEILING - OVR_FLOOR);
  return Math.round(scaled);
}

export const OVR_TIERS = [
  { min: 0, label: "Developing", blurb: "Building the base" },
  { min: 55, label: "Contributor", blurb: "Earning minutes" },
  { min: 68, label: "Starter", blurb: "Trusted on the floor" },
  { min: 80, label: "Standout", blurb: "Changes the game" },
  { min: 90, label: "Elite", blurb: "Best on the floor" },
] as const;

export function ovrTier(overall: number) {
  return [...OVR_TIERS].reverse().find((t) => overall >= t.min) ?? OVR_TIERS[0];
}

/** Per-attribute tier, used for the color/label on each attribute readout. */
export function attributeTier(value: number): "low" | "mid" | "high" | "elite" {
  const pct = value / RATING_SCALE_MAX;
  if (pct >= 0.85) return "elite";
  if (pct >= 0.7) return "high";
  if (pct >= 0.5) return "mid";
  return "low";
}

export function strongestCategory(ratings: Ratings) {
  return [...RATING_CATEGORIES].sort(
    (a, b) => (ratings[b.value] ?? 0) - (ratings[a.value] ?? 0)
  )[0];
}

export function weakestCategory(ratings: Ratings) {
  return [...RATING_CATEGORIES].sort(
    (a, b) => (ratings[a.value] ?? 0) - (ratings[b.value] ?? 0)
  )[0];
}
