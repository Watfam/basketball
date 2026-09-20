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
