/**
 * Everything a player did, as one list.
 *
 * Workouts, shooting sets, the combine and film study used to be counted
 * separately, and only workouts fed the streak, the session count and the
 * milestones: a kid who shot three sets this week read "0 sessions". Now
 * every kind of work counts the same way.
 */

export type ActivityKind = "workout" | "shooting" | "combine" | "film";

export type Activity = { kind: ActivityKind; at: Date };

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  workout: "Workout",
  shooting: "Shooting",
  combine: "Combine",
  film: "Film",
};

/** Days a week that count as a good week: realistic around school, practice and games. */
export const WEEKLY_DAYS_TARGET = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Monday-anchored, like the training week. */
export function startOfWeek(d: Date): Date {
  const copy = startOfDay(d);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

/** Builds the list from rows of each kind; rows without a date are skipped. */
export function toActivities(sources: Partial<Record<ActivityKind, (string | null | undefined)[]>>): Activity[] {
  const out: Activity[] = [];
  for (const [kind, dates] of Object.entries(sources) as [ActivityKind, (string | null | undefined)[]][]) {
    for (const iso of dates ?? []) {
      if (!iso) continue;
      const at = new Date(iso);
      if (!Number.isNaN(at.getTime())) out.push({ kind, at });
    }
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export type WeekSummary = {
  /** Monday to Sunday of this week: did anything happen that day. */
  days: boolean[];
  /** Days this week with any work. */
  activeDays: number;
  /** Index of today in `days`. */
  today: number;
};

export function thisWeek(activities: Activity[], now: Date = new Date()): WeekSummary {
  const start = startOfWeek(now);
  const days = Array.from({ length: 7 }, () => false);
  for (const a of activities) {
    // Rounded, not floored: a clock change makes one day 23 or 25 hours.
    const idx = Math.round((startOfDay(a.at).getTime() - start.getTime()) / MS_PER_DAY);
    if (idx >= 0 && idx < 7) days[idx] = true;
  }
  return {
    days,
    activeDays: days.filter(Boolean).length,
    today: Math.round((startOfDay(now).getTime() - start.getTime()) / MS_PER_DAY),
  };
}

export function countByKind(activities: Activity[]): Record<ActivityKind, number> {
  const counts: Record<ActivityKind, number> = { workout: 0, shooting: 0, combine: 0, film: 0 };
  for (const a of activities) counts[a.kind] += 1;
  return counts;
}
