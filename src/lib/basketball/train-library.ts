/**
 * The workout library's filters: which skill, how long, what level. Pure, so the page and the tests read the same rules.
 * A workout's length is its own estimate when it has one, else worked out from its drills (workout-builder.ts), and
 * its level is the hardest of its drills (workout-matching.ts).
 */
import { computeWorkoutDifficulty } from "./workout-matching.ts";
import type { SkillLevel } from "./assessment";

export { WORKOUT_SKILLS } from "./workout-skills.ts";
import { WORKOUT_SKILLS } from "./workout-skills.ts";

export const TIME_BANDS = [
  { value: "short", label: "Under 20 min", test: (m: number) => m < 20 },
  { value: "mid", label: "20 to 30 min", test: (m: number) => m >= 20 && m <= 30 },
  { value: "long", label: "Over 30 min", test: (m: number) => m > 30 },
] as const;

export const LEVEL_OPTIONS: { value: SkillLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export type WorkoutFilters = { skill: string | null; time: string | null; level: string | null };
export const NO_FILTERS: WorkoutFilters = { skill: null, time: null, level: null };

type FilterableWorkout = {
  focus_areas: string[] | null;
  estimated_minutes: number | null;
  workout_drills: { drills: { difficulty: string | null } | null }[];
};

/** Reads ?skill=&time=&level= and drops anything that is not one of the options. */
export function parseWorkoutFilters(sp: { skill?: string; time?: string; level?: string }): WorkoutFilters {
  return {
    skill: WORKOUT_SKILLS.some((s) => s.value === sp.skill) ? (sp.skill as string) : null,
    time: TIME_BANDS.some((t) => t.value === sp.time) ? (sp.time as string) : null,
    level: LEVEL_OPTIONS.some((l) => l.value === sp.level) ? (sp.level as string) : null,
  };
}

export const hasFilters = (f: WorkoutFilters) => Boolean(f.skill || f.time || f.level);

export function workoutLevel(w: FilterableWorkout): SkillLevel | null {
  return computeWorkoutDifficulty(w.workout_drills.map((d) => d.drills?.difficulty));
}

export function matches<T extends FilterableWorkout>(w: T, f: WorkoutFilters, minutesOf: (w: T) => number | null): boolean {
  if (f.skill && !(w.focus_areas ?? []).includes(f.skill)) return false;
  if (f.level && workoutLevel(w) !== f.level) return false;
  if (f.time) {
    const m = minutesOf(w);
    const band = TIME_BANDS.find((t) => t.value === f.time);
    if (m === null || !band || !band.test(m)) return false;
  }
  return true;
}

export function filterWorkouts<T extends FilterableWorkout>(list: T[], f: WorkoutFilters, minutesOf: (w: T) => number | null): T[] {
  return list.filter((w) => matches(w, f, minutesOf));
}

/** How many workouts each option would show, given the other two filters: so a sheet never offers a choice that leads to nothing. */
export function optionCounts<T extends FilterableWorkout>(list: T[], f: WorkoutFilters, dim: keyof WorkoutFilters, options: readonly string[], minutesOf: (w: T) => number | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of options) out[o] = list.filter((w) => matches(w, { ...f, [dim]: o }, minutesOf)).length;
  return out;
}

export function describeFilters(f: WorkoutFilters): string {
  const parts: string[] = [];
  if (f.skill) parts.push(WORKOUT_SKILLS.find((s) => s.value === f.skill)?.label ?? f.skill);
  if (f.time) parts.push(TIME_BANDS.find((t) => t.value === f.time)?.label ?? f.time);
  if (f.level) parts.push(LEVEL_OPTIONS.find((l) => l.value === f.level)?.label ?? f.level);
  return parts.join(", ");
}

export function filterHref(base: string, f: WorkoutFilters, change: Partial<WorkoutFilters>): string {
  const next = { ...f, ...change };
  const q = new URLSearchParams();
  if (next.skill) q.set("skill", next.skill);
  if (next.time) q.set("time", next.time);
  if (next.level) q.set("level", next.level);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
