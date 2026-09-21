/**
 * Program progress — turning "which scheduled days have been completed"
 * into "you are on week 2, day 3."
 *
 * The structural shift this supports: a player following a program is on
 * a plan that moves, not picking from a menu that doesn't. The next
 * session is decided by the schedule, not by a ranking.
 */

export type ProgramDay = {
  id: string;
  week_number: number;
  day_number: number;
  workout_id: string;
  volume_step: number;
  is_deload: boolean;
  note: string | null;
};

export type ProgramProgress = {
  /** The next unfinished day, or null once every day is done. */
  nextDay: ProgramDay | null;
  completedDayIds: Set<string>;
  completedCount: number;
  totalCount: number;
  /** 0-1, for the progress ring on the program card. */
  ratio: number;
  isComplete: boolean;
  /** Days grouped by week, ascending — drives the week-by-week view. */
  weeks: { weekNumber: number; days: ProgramDay[] }[];
};

export function computeProgramProgress(
  days: ProgramDay[],
  completedDayIds: Iterable<string>
): ProgramProgress {
  const completed = new Set(completedDayIds);

  const ordered = [...days].sort(
    (a, b) => a.week_number - b.week_number || a.day_number - b.day_number
  );

  // The first day not yet done, in schedule order — so skipping ahead one
  // day doesn't strand the ones behind it.
  const nextDay = ordered.find((d) => !completed.has(d.id)) ?? null;

  const weekMap = new Map<number, ProgramDay[]>();
  ordered.forEach((d) => {
    const list = weekMap.get(d.week_number) ?? [];
    list.push(d);
    weekMap.set(d.week_number, list);
  });

  const weeks = [...weekMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, list]) => ({ weekNumber, days: list }));

  const completedCount = ordered.filter((d) => completed.has(d.id)).length;

  return {
    nextDay,
    completedDayIds: completed,
    completedCount,
    totalCount: ordered.length,
    ratio: ordered.length === 0 ? 0 : completedCount / ordered.length,
    isComplete: ordered.length > 0 && completedCount === ordered.length,
    weeks,
  };
}
