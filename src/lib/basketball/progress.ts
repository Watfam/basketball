/**
 * Player progress stats shown on the hub — total volume + a streak, the
 * "am I actually developing" signal the hub was missing.
 */

// Weekly, not daily — realistic training cadence for a kid isn't every
// single day, and a daily-streak model would punish a normal training
// schedule the way it wouldn't for a language app.
export function computeStreakWeeks(completedDates: Date[], now: Date = new Date()): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksAgo = (d: Date) => Math.floor((now.getTime() - d.getTime()) / msPerWeek);
  const weeksWithActivity = new Set(completedDates.map(weeksAgo));

  // Grace period: if this week (0) has nothing logged yet, anchor on last
  // week (1) instead of zeroing the streak out before the week is even
  // over — matches how most streak features avoid punishing "haven't
  // gotten to it yet today/this week."
  let anchor = -1;
  if (weeksWithActivity.has(0)) anchor = 0;
  else if (weeksWithActivity.has(1)) anchor = 1;
  if (anchor === -1) return 0;

  let streak = 0;
  let w = anchor;
  while (weeksWithActivity.has(w)) {
    streak++;
    w++;
  }
  return streak;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Monday-anchored week start, so weeks line up with a training week. */
function startOfWeek(d: Date): Date {
  const copy = startOfDay(d);
  const weekday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - weekday);
  return copy;
}

/**
 * Sessions bucketed by week, oldest first, including weeks with nothing
 * logged — the gaps are the signal, so they can't be omitted.
 */
export function weeklyVolume(
  completedDates: Date[],
  weekCount: number,
  now: Date = new Date()
): { label: string; count: number; isCurrent: boolean }[] {
  const currentWeekStart = startOfWeek(now);
  const buckets: { label: string; count: number; isCurrent: boolean }[] = [];

  for (let i = weekCount - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart.getTime() - i * 7 * MS_PER_DAY);
    const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
    const count = completedDates.filter((d) => d >= weekStart && d < weekEnd).length;
    buckets.push({
      label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
      count,
      isCurrent: i === 0,
    });
  }

  return buckets;
}

/**
 * One entry per day for the consistency grid, oldest first. Aligned so the
 * grid's rows are consistent weekdays (columns start on Monday).
 */
export function dailyActivity(
  completedDates: Date[],
  weekCount: number,
  now: Date = new Date()
): { date: string; count: number }[] {
  const end = startOfWeek(now);
  end.setDate(end.getDate() + 7);
  const start = new Date(end.getTime() - weekCount * 7 * MS_PER_DAY);

  const counts = new Map<string, number>();
  completedDates.forEach((d) => {
    const key = startOfDay(d).toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const days: { date: string; count: number }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += MS_PER_DAY) {
    const day = new Date(t);
    days.push({
      date: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: counts.get(day.toDateString()) ?? 0,
    });
  }

  return days;
}
