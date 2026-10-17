import { startOfWeek, WEEKLY_DAYS_TARGET, type WeekSummary } from "./activity.ts";
import { analyzeBenchmarks, type Comparison } from "./benchmark-analysis.ts";
import type { LessonLite, NextAction } from "./insights.ts";
import type { ProgressRow } from "./progress-rows.ts";
import { formatPercentage, percentage, seasonStart } from "./shooting.ts";

/**
 * What the player's Today screen says, worked out from data the app already has. Pure, so it is tested without a screen.
 *
 * One meaning for each word, everywhere (Today, Shoot, Me): "Shots taken" and "Shots made" are every shot counted in a finished, kept set,
 * whether by camera or by taps, free shooting or a drill; "Shooting percentage" is made divided by taken. More shots is more work, never better
 * shooting. "Am I improving?" is answered only from the benchmarks (the same test, done the same way), with the same rule for "clear" as Progress.
 */

/** One finished, kept shooting set, as the database stores it (its own totals). */
export type ShotSet = { id: string; label: string | null; started_at: string; makes: number; attempts: number; source?: string | null };

/** Fewer shots than this and a percentage is said to be early. */
export const MIN_SHOTS_TO_READ = 10;

const DAY = 24 * 60 * 60 * 1000;

// ---- the date range ---------------------------------------------------------------------------------------------------------------

export type HomeRangeKey = "7d" | "4w" | "season";
export const HOME_RANGES: { key: HomeRangeKey; label: string; phrase: string }[] = [
  { key: "7d", label: "7 days", phrase: "in the last 7 days" },
  { key: "4w", label: "4 weeks", phrase: "in the last 4 weeks" },
  { key: "season", label: "Season", phrase: "this season" },
];

export function homeRange(param: string | null | undefined, now: Date): { key: HomeRangeKey; from: Date; label: string; phrase: string } {
  const key: HomeRangeKey = param === "7d" || param === "season" ? param : "4w";
  const c = HOME_RANGES.find((r) => r.key === key)!;
  const from = key === "7d" ? new Date(now.getTime() - 7 * DAY) : key === "4w" ? new Date(now.getTime() - 28 * DAY) : seasonStart(now);
  return { key, from, label: c.label, phrase: c.phrase };
}

/** How far back the screen reads shooting sets: the season, and at least the eight weeks the chart draws. */
export function shotWindowStart(now: Date): Date {
  const eight = new Date(startOfWeek(now).getTime() - 7 * 7 * DAY);
  const season = seasonStart(now);
  return eight < season ? eight : season;
}

// ---- the three numbers ------------------------------------------------------------------------------------------------------------

export type Totals = { taken: number; made: number; pct: number | null; sets: number; camera: number; taps: number };

export function shotTotals(sets: ShotSet[], from: Date | null, to: Date | null = null): Totals {
  const t: Totals = { taken: 0, made: 0, pct: null, sets: 0, camera: 0, taps: 0 };
  for (const s of sets) {
    const at = new Date(s.started_at);
    if (s.attempts <= 0 || Number.isNaN(at.getTime()) || (from && at < from) || (to && at > to)) continue;
    t.taken += s.attempts;
    t.made += s.makes;
    t.sets += 1;
    if (s.source === "camera") t.camera += s.attempts;
    else if (s.source === "manual") t.taps += s.attempts;
  }
  t.pct = percentage(t.made, t.taken);
  return t;
}

const shotWord = (n: number) => (n === 1 ? "shot" : "shots");

/** "You made 65 out of 100 shots in the last 4 weeks." */
export function plainSentence(t: Totals, phrase: string): string {
  if (t.taken === 0) return `No shots counted ${phrase} yet.`;
  return `You made ${t.made} out of ${t.taken} ${shotWord(t.taken)} ${phrase}.`;
}

/** How the shots were counted, for the "how is this counted" note. */
export function countedBy(t: Totals): string {
  const parts: string[] = [];
  if (t.camera > 0) parts.push(`the camera counted ${t.camera}`);
  if (t.taps > 0) parts.push(`you counted ${t.taps} by tapping`);
  const other = t.taken - t.camera - t.taps;
  if (other > 0) parts.push(`${other} came from older sets with no record of how they were counted`);
  return parts.length ? `Of these ${t.taken} shots, ${parts.join(", ")}. If you changed a call after saving, the saved total includes your change.` : "";
}

// ---- the last eight weeks -----------------------------------------------------------------------------------------------------------

export type WeekBar = { start: Date; end: Date; taken: number; made: number; pct: number | null; readable: boolean; isCurrent: boolean };

/** Shots per week, oldest first, ending with this week (Monday to Sunday). */
export function weeklyShots(sets: ShotSet[], now: Date, weeks = 8): WeekBar[] {
  const thisMonday = startOfWeek(now);
  const out: WeekBar[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7 * i);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const t = shotTotals(sets, start, new Date(end.getTime() - 1));
    out.push({ start, end, taken: t.taken, made: t.made, pct: t.pct, readable: t.taken >= MIN_SHOTS_TO_READ, isCurrent: i === 0 });
  }
  return out;
}

export type LookBack = { recent: Totals; before: Totals; /** One short line for the screen. */ short: string; /** The whole account, with why it is not a verdict. */ text: string };

/**
 * The last four weeks beside the four before, in plain words. A look back at what happened, never a verdict: shooting different drills moves a
 * percentage by itself, so it is not called improvement. Null when either side has too few shots.
 */
export function lookBack(sets: ShotSet[], now: Date): LookBack | null {
  const recent = shotTotals(sets, new Date(now.getTime() - 28 * DAY));
  const before = shotTotals(sets, new Date(now.getTime() - 56 * DAY), new Date(now.getTime() - 28 * DAY));
  if (recent.taken < MIN_SHOTS_TO_READ || before.taken < MIN_SHOTS_TO_READ || recent.pct === null || before.pct === null) return null;
  const diff = Math.round(recent.pct - before.pct);
  const how = Math.abs(diff) < 3 ? "about the same" : diff > 0 ? `${diff} points higher` : `${-diff} points lower`;
  return {
    recent, before,
    short: `The 4 weeks before: ${formatPercentage(before.pct)}. The last 4 weeks: ${formatPercentage(recent.pct)}. That is ${how} (you may have shot different drills).`,
    text: `Last 4 weeks: ${formatPercentage(recent.pct)} (${recent.made} of ${recent.taken}). The 4 weeks before: ${formatPercentage(before.pct)} (${before.made} of ${before.taken}). That is ${how}. You may have shot different drills, so this is a look back, not proof you got better or worse.`,
  };
}

// ---- "Am I improving?" ----------------------------------------------------------------------------------------------------------------

export type Standing = { key: string; title: string; drillName: string; started: number; runs: number; cmp: Comparison | null };

/** Where each benchmark stands (the same rule for "clear" as the Progress screen: the strict range, first run against latest). */
export function standings(rows: ProgressRow[]): Standing[] {
  return analyzeBenchmarks(rows).map((r) => {
    const g = r.groups.find((x) => x.current && x.comparable.length > 0);
    return { key: r.protocol.key, title: r.protocol.title, drillName: r.protocol.drillName, started: r.resultCount, runs: g?.comparable.length ?? 0, cmp: g?.comparison ?? null };
  });
}

export type Answer = { tone: "yes" | "maybe" | "dip" | "none" | "wait" | "new"; headline: string; detail: string; benchmark: string | null };
const pc = (r: { pct: number | null }) => (r.pct === null ? "?" : `${Math.round(r.pct)}%`);

export function improvementAnswer(list: Standing[]): Answer {
  const ran = list.filter((s) => s.runs > 0);
  const clearUp = list.find((s) => s.cmp?.verdict === "clear_improvement");
  if (clearUp) return { tone: "yes", benchmark: clearUp.key, headline: `Yes, on your ${clearUp.title.toLowerCase()}`, detail: `${pc(clearUp.cmp!.baseline)} to ${pc(clearUp.cmp!.latest)} on the same test, done the same way. That is a real change, not just luck. It is practice, not a game.` };
  const maybe = list.find((s) => s.cmp?.verdict === "no_clear_change" && s.cmp.leans === "up");
  if (maybe) return { tone: "maybe", benchmark: maybe.key, headline: `Maybe: your ${maybe.title.toLowerCase()} looks higher`, detail: `${pc(maybe.cmp!.baseline)} to ${pc(maybe.cmp!.latest)}, but it is not certain yet. Do it again the same way to check.` };
  const down = list.find((s) => s.cmp?.verdict === "clear_decline");
  if (down) return { tone: "dip", benchmark: down.key, headline: `Your ${down.title.toLowerCase()} went down`, detail: `${pc(down.cmp!.baseline)} to ${pc(down.cmp!.latest)} on the same test. One day can be a bad day: do it again the same way.` };
  if (ran.some((s) => s.cmp)) return { tone: "none", benchmark: ran.find((s) => s.cmp)!.key, headline: "No clear change yet", detail: "Your tests look about the same so far. It takes a few weeks of the same tests to see a change." };
  if (ran.length > 0) return { tone: "wait", benchmark: ran[0].key, headline: "You have a starting point", detail: `Do your ${ran[0].title.toLowerCase()} again in about two weeks, the same way, to see if it moved.` };
  return { tone: "new", benchmark: null, headline: "Not enough to tell yet", detail: "Do the three benchmark tests. They are short and always the same, so you can see if you get better." };
}

// ---- one thing to focus on --------------------------------------------------------------------------------------------------------------

export type Focus = {
  kind: "benchmark" | "dip" | "film";
  eyebrow: string;
  title: string;
  body: string;
  /** Where the main button goes. */
  href: string;
  cta: string;
  lesson: LessonLite | null;
  /** Where "see why" goes (the benchmark's history), or null. */
  evidenceHref: string | null;
};

/**
 * One thing, from what exists: a benchmark that clearly went down (worth another look, with its lesson), else the next benchmark that is due, else
 * the next Film Room lesson the app already picks for the player. Nothing is made up: no drill or lesson appears that is not in the app, and a
 * skill is only named when a test of it clearly moved.
 */
export function pickFocus(input: { list: Standing[]; next: NextAction | null; nextFilm: { id: string; title: string } | null; playerId: string; lessonFor: (drillName: string) => LessonLite | null }): Focus | null {
  const { list, next, nextFilm, playerId, lessonFor } = input;
  const down = list.find((s) => s.cmp?.verdict === "clear_decline");
  const benchHref = (key: string) => `/players/${playerId}/progress?view=benchmarks&benchmark=${key}&range=all`;
  if (down) {
    return { kind: "dip", eyebrow: "Worth another look", title: down.title, body: `${pc(down.cmp!.baseline)} to ${pc(down.cmp!.latest)} on the same test. Watch the lesson, then run it again the same way.`, href: `/players/${playerId}/workouts`, cta: "Find it in Train", lesson: lessonFor(down.drillName), evidenceHref: benchHref(down.key) };
  }
  if (next && /^Run the /.test(next.label)) {
    const s = list.find((x) => next.label === `Run the ${x.title}`);
    return { kind: "benchmark", eyebrow: "Next benchmark", title: next.label.replace(/^Run the /, ""), body: next.why, href: next.href, cta: "Find it in Train", lesson: next.lesson, evidenceHref: s && s.started > 0 ? benchHref(s.key) : null };
  }
  if (nextFilm) return { kind: "film", eyebrow: "Film Room", title: nextFilm.title, body: "The next lesson picked for you.", href: `/players/${playerId}/film?lesson=${nextFilm.id}`, cta: "Watch it", lesson: null, evidenceHref: null };
  return null;
}

// ---- recent activity --------------------------------------------------------------------------------------------------------------------

export type RecentItem = { id: string; kind: "workout" | "shooting"; title: string; at: Date; when: string; detail: string; how: string | null; href: string };

export function whenLabel(at: Date, now: Date): string {
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The newest workouts and free shooting sets together. A set shot for a workout drill belongs to that workout and is not listed twice. */
export function recentItems(input: {
  playerId: string; now: Date; fromHref: string; limit?: number;
  workouts: { id: string; workout_id: string | null; completed_at: string | null }[];
  workoutNames: Map<string, string>;
  sets: ShotSet[];
  linkedSetIds: Set<string>;
  tracked: ProgressRow[];
}): RecentItem[] {
  const { playerId, now, fromHref, workouts, workoutNames, sets, linkedSetIds, tracked } = input;
  const byWorkout = new Map<string, { made: number; attempts: number }>();
  for (const r of tracked) {
    const t = byWorkout.get(r.workoutSessionId) ?? { made: 0, attempts: 0 };
    t.made += r.metrics.makes; t.attempts += r.metrics.attempts;
    byWorkout.set(r.workoutSessionId, t);
  }
  const items: RecentItem[] = [];
  for (const w of workouts) {
    if (!w.completed_at) continue;
    const at = new Date(w.completed_at);
    if (Number.isNaN(at.getTime())) continue;
    const t = byWorkout.get(w.id);
    items.push({ id: `w-${w.id}`, kind: "workout", title: (w.workout_id && workoutNames.get(w.workout_id)) || "Workout", at, when: whenLabel(at, now), detail: t && t.attempts > 0 ? `${t.made} of ${t.attempts} ${shotWord(t.attempts)} counted in its drills` : "Workout finished", how: null, href: `/players/${playerId}/sessions/${w.id}` });
  }
  for (const s of sets) {
    if (s.attempts <= 0 || linkedSetIds.has(s.id)) continue;
    const at = new Date(s.started_at);
    if (Number.isNaN(at.getTime())) continue;
    items.push({ id: `s-${s.id}`, kind: "shooting", title: s.label?.trim() || "Shooting", at, when: whenLabel(at, now), detail: `${s.makes} of ${s.attempts} · ${formatPercentage(percentage(s.makes, s.attempts))}`, how: s.source === "camera" ? "Camera" : s.source === "manual" ? "Counted by taps" : null, href: `/players/${playerId}/shooting/${s.id}?from=${encodeURIComponent(fromHref)}` });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, input.limit ?? 5);
}

// ---- the welcome ------------------------------------------------------------------------------------------------------------------------

export function firstName(display: string): string {
  const w = display.trim().split(/\s+/)[0];
  return w || "there";
}

export function greeting(input: { name: string; now: Date; week: WeekSummary; streakWeeks: number; everActive: boolean }): { title: string; line: string } {
  const { name, now, week, streakWeeks, everActive } = input;
  const h = now.getHours();
  const hello = h < 5 ? "Hey" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const title = `${hello}, ${firstName(name)}`;
  const today = week.days[week.today] === true;
  let line: string;
  if (!everActive) line = "Welcome. Let's get your first workout in.";
  else if (week.activeDays >= WEEKLY_DAYS_TARGET) line = "You hit your weekly target. Anything more is a bonus.";
  else if (today) line = `Nice work today. ${week.activeDays} of ${WEEKLY_DAYS_TARGET} days done this week.`;
  else if (week.activeDays > 0) line = `${week.activeDays} of ${WEEKLY_DAYS_TARGET} days done this week. Today makes ${week.activeDays + 1}.`;
  else if (streakWeeks > 0) line = `You are on a ${streakWeeks}-week streak. Keep it going today.`;
  else line = "Ready when you are.";
  return { title, line };
}

