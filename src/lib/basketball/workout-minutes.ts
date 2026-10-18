/** About how long a workout takes: its own estimate when it has one, else its drills at this level, counted the way the builder counts. */
import { entriesForLevel, resolvePrescription, type DrillEntry } from "./prescription.ts";
import { entrySeconds } from "./workout-builder.ts";
import type { SkillLevel } from "./assessment";

export function workoutMinutes(w: { estimated_minutes: number | null; workout_drills: DrillEntry[] }, level: SkillLevel): number | null {
  if (w.estimated_minutes) return w.estimated_minutes;
  const entries = entriesForLevel(w.workout_drills, level);
  if (entries.length === 0) return null;
  const seconds = entries.reduce((s, e) => {
    const p = resolvePrescription(e, level);
    return s + entrySeconds({ sets: p.sets, reps: p.reps, seconds: p.durationSeconds });
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

/** A workout a family built for itself carries this mark in its tags (its owner is also set, which is what keeps it private). */
export const isCustomWorkout = (w: { player_type_tags: unknown }) => Boolean((w.player_type_tags as { custom?: boolean } | null)?.custom);

/** A built workout run without saving, and not kept (yet): it is not listed under Your workouts. */
export const isTemporaryWorkout = (w: { player_type_tags: unknown }) => Boolean((w.player_type_tags as { temporary?: boolean } | null)?.temporary);
