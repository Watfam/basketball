/**
 * Turning a workout entry into the numbers a player actually sees.
 *
 * Three things feed into one prescription:
 *   level   — the player's training level, which both SWAPS which entries
 *             apply (an advanced player gets step-backs where a beginner
 *             repeats a pull-up) and SCALES the sets/reps
 *   volume  — the program's week-over-week step, so week 4 of a block is
 *             heavier than week 1 without authoring a near-identical
 *             workout for every week
 *   fallback— the flat target_* columns, so content written before any of
 *             this existed still resolves
 */

import type { SkillLevel } from "./assessment";

export type LevelTarget = {
  sets?: number;
  reps?: number;
  duration_seconds?: number;
};

export type DrillEntry = {
  id: string;
  drill_id: string;
  sort_order: number;
  block: string | null;
  variant_label: string | null;
  levels: string[] | null;
  level_targets: Record<string, LevelTarget> | null;
  target_sets: number | null;
  target_reps: number | null;
  target_duration_seconds: number | null;
};

export type Prescription = {
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
};

// One extra rep per program week, or five extra seconds on a timed drill.
// Deliberately small: the point is that week 5 is visibly heavier than
// week 1, not that it doubles.
const REPS_PER_STEP = 1;
const SECONDS_PER_STEP = 5;

const MIN_REPS = 1;
const MIN_SECONDS = 10;

/**
 * Entries whose `levels` is empty apply to everyone; a non-empty `levels`
 * restricts that entry to the listed levels. This is what lets one workout
 * hold both the beginner and the advanced version of the same slot.
 */
export function entriesForLevel<T extends DrillEntry>(entries: T[], level: SkillLevel): T[] {
  return entries
    .filter((e) => !e.levels || e.levels.length === 0 || e.levels.includes(level))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function resolvePrescription(
  entry: DrillEntry,
  level: SkillLevel,
  volumeStep = 0
): Prescription {
  const levelTarget = entry.level_targets?.[level];

  const sets = levelTarget?.sets ?? entry.target_sets ?? null;
  const baseReps = levelTarget?.reps ?? entry.target_reps ?? null;
  const baseSeconds = levelTarget?.duration_seconds ?? entry.target_duration_seconds ?? null;

  return {
    sets,
    reps: baseReps === null ? null : Math.max(MIN_REPS, baseReps + volumeStep * REPS_PER_STEP),
    durationSeconds:
      baseSeconds === null
        ? null
        : Math.max(MIN_SECONDS, baseSeconds + volumeStep * SECONDS_PER_STEP),
  };
}

/** "3 × 12" / "60s" — the compact target label used across the UI. */
export function prescriptionLabel(p: Prescription): string | null {
  if (p.sets && p.reps) return `${p.sets} × ${p.reps}`;
  if (p.durationSeconds) return `${p.durationSeconds}s`;
  if (p.reps) return `${p.reps} reps`;
  return null;
}

export const BLOCK_LABELS: Record<string, string> = {
  warmup: "Warm-Up",
  main: "Main Work",
  finisher: "Finisher",
};

const BLOCK_ORDER = ["warmup", "main", "finisher"];

/** Groups entries into warmup/main/finisher, preserving sort_order within each. */
export function groupByBlock<T extends DrillEntry>(entries: T[]): { block: string; entries: T[] }[] {
  const groups = new Map<string, T[]>();
  entries.forEach((e) => {
    // Content written before blocks existed lands in "main" rather than
    // disappearing into an unlabeled group.
    const block = e.block ?? "main";
    const list = groups.get(block) ?? [];
    list.push(e);
    groups.set(block, list);
  });

  return [...groups.entries()]
    .sort((a, b) => {
      const ai = BLOCK_ORDER.indexOf(a[0]);
      const bi = BLOCK_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([block, list]) => ({ block, entries: list.sort((x, y) => x.sort_order - y.sort_order) }));
}
