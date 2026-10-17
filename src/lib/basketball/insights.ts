import { analyzeBenchmarks, compareTwo, drillResults, volumeSummary, type BenchmarkReport, type Comparison, type Range } from "./benchmark-analysis.ts";
import { compareCategoriesAtSameSpot, MIN_SHOTS_FOR_A_DIFFERENCE, type TrackedRow } from "./drill-analytics.ts";
import { CATEGORY_LABELS, type ShootingCategory } from "./drill-shooting.ts";
import type { ProgressRow } from "./progress-rows.ts";

/**
 * What a player's results say, in a few plain sentences, each with its evidence and where to tap to see the sessions behind it. Rules:
 *  - only conclusions the data supports; "Clear" only when the strict 98% range of the change stays on one side of zero (CLEAR_Z in benchmark-analysis.ts); "Possible" when only the usual 95% range does; an ordinary drill is never "Clear";
 *  - a result is compared only with results of the same benchmark version and conditions, or the same drill and variant;
 *  - nothing about volume is ever worded as skill, and nothing says anything about games;
 *  - when the evidence is not enough, the insight says what more comparable practice would settle it.
 */
export type Evidence = "clear" | "possible" | "not_yet" | "fact";
export type InsightLink = { view: "benchmarks"; benchmark: string } | { view: "shooting"; category?: ShootingCategory; drill?: string } | null;
export type LessonLite = { title: string; watched: boolean; url: string | null; href: string };
export type NextAction = { label: string; why: string; href: string; lesson: LessonLite | null };
export type Insight = {
  id: string;
  kind: "benchmark" | "drill" | "comparison" | "consistency" | "practice";
  headline: string;
  /** The supporting numbers, short. */
  metric: string;
  evidence: Evidence;
  /** What the evidence badge means for this one, and what would settle it. */
  evidenceNote: string;
  link: InsightLink;
  /** A fuller account, behind "How sure is this?". */
  advanced: string[];
};

const pct = (n: number | null) => (n === null ? "?" : `${Math.round(n)}%`);
const rank: Record<Evidence, number> = { clear: 0, possible: 1, not_yet: 2, fact: 3 };

function fromComparison(id: string, title: string, c: Comparison, label: string, link: InsightLink, kind: Insight["kind"]): Insight {
  const a = c.baseline, b = c.latest;
  const metric = `${pct(a.pct)} then, ${pct(b.pct)} now (${c.diff >= 0 ? "+" : ""}${c.diff} points, ${a.attempts} and ${b.attempts} shots)`;
  const adv = [c.text, ...c.caveats];
  if (c.verdict === "no_clear_change") adv.push(`A change of about ${c.minDetectable} points would be called clear only about half the time at these sizes; a bigger change more often. Not clear yet does not mean nothing changed.`);
  if (c.verdict === "clear_improvement") return { id, kind, headline: `${title} is up ${label}`, metric, evidence: "clear", evidenceNote: "The range of normal shot-to-shot variation stays above zero, so this is more than luck would usually give. It is a practice result, not a game result. Even a clear result can be a fluke: a few in 100 comparisons with no real change still look like this.", link, advanced: adv };
  if (c.verdict === "clear_decline") return { id, kind, headline: `${title} is down ${label}`, metric, evidence: "clear", evidenceNote: "The range stays below zero. Check the notes on each result (rested? same spot? who passed?) before reading much into it.", link, advanced: adv };
  if (c.verdict === "too_few") return { id, kind, headline: `${title}: too few shots to compare ${label}`, metric, evidence: "not_yet", evidenceNote: "At least 10 shots in each result are needed to say anything.", link, advanced: adv };
  if (c.leans) return { id, kind, headline: `${title} looks ${c.leans === "up" ? "higher" : "lower"} ${label}, but it is not certain`, metric, evidence: "possible", evidenceNote: `The gap is bigger than luck would give about 19 times in 20, but not by enough to be called clear: several things are compared at once, and a few of them will look like this by chance. Run it again the same way to check. Practice result, not a game result.`, link, advanced: adv };
  return { id, kind, headline: `${title}: ${pct(a.pct)} then, ${pct(b.pct)} now`, metric: `${c.diff >= 0 ? "+" : ""}${c.diff} points, ${a.attempts} and ${b.attempts} shots`, evidence: "not_yet", evidenceNote: `With ${a.attempts} and ${b.attempts} shots, only a change of about ${c.minDetectable} points or more would stand out. More full runs, run the same way, make a real change easier to see.`, link, advanced: adv };
}

/**
 * An ordinary drill against its own last session. Never "Clear": a drill is not a controlled test (the sets, the rest, the spot and the volume step
 * differ from day to day), so a gap is reported as a fact about two sessions and never as proof of improvement. Only a benchmark can be clear.
 */
function fromDrill(id: string, title: string, c: Comparison, link: InsightLink): Insight {
  const a = c.baseline, b = c.latest;
  const metric = `${c.diff >= 0 ? "+" : ""}${c.diff} points (${a.attempts} and ${b.attempts} shots)`;
  const note = c.verdict === "too_few" ? "At least 10 shots in each session are needed to say anything."
    : c.verdict === "no_clear_change" ? "That is within the normal ups and downs of shooting."
    : "That gap is bigger than shot-to-shot luck usually gives. A drill is not a controlled test, though: rest, volume and the spot can differ from day to day. So it is a fact about these two sessions, not proof you improved. A benchmark is the controlled test.";
  return { id, kind: "drill", headline: `${title}: ${pct(b.pct)} this time, ${pct(a.pct)} last time`, metric, evidence: "fact", evidenceNote: note, link, advanced: [c.text, ...c.caveats] };
}

/** Insights from benchmarks, drills, same-spot comparisons and practice, strongest first. */
export function buildInsights(rows: ProgressRow[], range: Range = {}): Insight[] {
  // Nothing tracked in the range: say nothing, so the screen can tell a new player what to do instead of opening with a statement about missing comparisons.
  if (!rows.some((x) => (!range.from || new Date(x.at) >= range.from) && (!range.to || new Date(x.at) <= range.to))) return [];
  const out: Insight[] = [];
  const reports: BenchmarkReport[] = analyzeBenchmarks(rows, range);

  for (const r of reports) {
    const g = r.groups.find((x) => x.current && x.comparable.length > 0);
    if (!g) continue;
    const link: InsightLink = { view: "benchmarks", benchmark: r.protocol.key };
    const list = g.comparable;
    const cond = g.conditionsLabel ? `, ${g.conditionsLabel}` : "";
    if (list.length >= 2 && g.comparison) {
      // One planned comparison per benchmark (first against latest). Judging every step as well would multiply the chances of a false "clear".
      const ins = fromComparison(`bm-change-${r.protocol.key}`, `Your ${r.protocol.title.toLowerCase()}`, g.comparison, "since your first one, same test and conditions" + cond, link, "benchmark");
      if (list.length >= 3) {
        const prev = compareTwo(list[list.length - 2], list[list.length - 1], { timed: !!r.protocol.clockSeconds });
        if (prev) ins.advanced.push(`Your run before this one was ${pct(prev.baseline.pct)}, this one ${pct(prev.latest.pct)}. That step is not judged on its own: one comparison is made for each benchmark, so that luck does not produce a "clear" result from looking again and again.`);
      }
      out.push(ins);
    } else {
      const only = list[0];
      out.push({ id: `bm-one-${r.protocol.key}`, kind: "benchmark", headline: `Your first ${r.protocol.title.toLowerCase()}: ${pct(only.pct)}`, metric: `${only.makes} of ${only.attempts}${cond}`, evidence: "fact", evidenceNote: "One result is a starting point. A second full run, done the same way, shows whether it moved.", link, advanced: [`Plausible range for this single result: ${Math.round(only.ci.lo * 100)}% to ${Math.round(only.ci.hi * 100)}% (95%).`] });
    }
    if (g.consistency.status === "shown") out.push({ id: `bm-cons-${r.protocol.key}`, kind: "consistency", headline: `Your ${r.protocol.title.toLowerCase()} results ranged ${g.consistency.low}% to ${g.consistency.high}%`, metric: `across ${g.consistency.results} full runs`, evidence: "fact", evidenceNote: "This describes how much results moved around. It does not say whether they are getting better.", link, advanced: [g.consistency.text] });
  }

  // ordinary drills: the same drill and variant against itself
  const bench = new Set(rows.filter((x) => x.metrics.benchmark).map((x) => x.logId));
  const byDrill = new Map<string, ProgressRow[]>();
  for (const row of rows.filter((x) => !bench.has(x.logId) && (!range.from || new Date(x.at) >= range.from) && (!range.to || new Date(x.at) <= range.to))) {
    const key = `${row.drillName}|${row.metrics.variant ?? ""}`;
    (byDrill.get(key) ?? byDrill.set(key, []).get(key)!).push(row);
  }
  const drills = [...byDrill.entries()].map(([key, list]) => ({ key, list, results: drillResults(list).filter((x) => x.comparable) })).filter((d) => d.results.length >= 2).sort((a, b) => b.results.length - a.results.length).slice(0, 3);
  for (const d of drills) {
    const [name, variant] = d.key.split("|");
    const prev = compareTwo(d.results[d.results.length - 2], d.results[d.results.length - 1]);
    if (prev) out.push(fromDrill(`drill-${d.key}`, `${name}${variant ? ` (${variant})` : ""}`, prev, { view: "shooting", category: d.list[0].metrics.category ?? undefined, drill: encodeURIComponent(d.key) }));
  }

  // movement, timed shooting: only where two kinds of shot were taken from the same spot with enough shots
  const tracked: TrackedRow[] = rows.filter((x) => (!range.from || new Date(x.at) >= range.from) && (!range.to || new Date(x.at) <= range.to)).map((x) => ({ logId: x.logId, workoutSessionId: x.workoutSessionId, at: x.at, drillName: x.drillName, metrics: x.metrics }));
  let found = 0;
  for (const [a, b] of [["catch_and_shoot", "stationary"], ["off_the_dribble", "stationary"], ["pressure_challenge", "stationary"], ["catch_and_shoot", "off_the_dribble"]] as [ShootingCategory, ShootingCategory][]) {
    for (const c of compareCategoriesAtSameSpot(tracked, a, b)) {
      found += 1;
      out.push({ id: `cmp-${a}-${b}-${c.spot}`, kind: "comparison", headline: `${CATEGORY_LABELS[a]} against ${CATEGORY_LABELS[b].toLowerCase()}, from the ${c.spot}`, metric: c.statement.text, evidence: c.statement.kind === "supported" ? "clear" : "not_yet", evidenceNote: c.statement.kind === "supported" ? "Both had enough shots and their ranges do not overlap. Different kinds of shot are different shots, so this is a comparison of the two, not a ranking." : `A difference is only called when each has at least ${MIN_SHOTS_FOR_A_DIFFERENCE} shots from the same spot.`, link: { view: "shooting", category: a }, advanced: c.statement.caveats });
    }
  }
  if (found === 0) out.push({ id: "cmp-none", kind: "comparison", headline: "Movement and time pressure: not enough to compare yet", metric: "No two kinds of shot have enough shots from the same spot", evidence: "not_yet", evidenceNote: `To compare after-movement or timed shooting with standing still, you need at least ${MIN_SHOTS_FOR_A_DIFFERENCE} tracked shots of each from the same spot. The benchmarks are the cleanest way to get them.`, link: { view: "shooting" }, advanced: [] });

  // effort, never skill
  const v = volumeSummary(rows, range);
  if (v.attempts > 0) out.push({ id: "practice", kind: "practice", headline: `${v.attempts} shots tracked in ${v.trackedDrills} drill${v.trackedDrills === 1 ? "" : "s"}`, metric: `${v.makes} made`, evidence: "fact", evidenceNote: "This is practice done. It is not a measure of how well you shoot, and untracked drills are not counted.", link: { view: "shooting" }, advanced: [] });

  // "Nothing to compare yet" is a footnote, not the headline: it always goes last.
  const last = (i: Insight) => (i.id === "cmp-none" ? 1 : 0);
  return out.sort((x, y) => last(x) - last(y) || rank[x.evidence] - rank[y.evidence]);
}

export type NextInput = { rows: ProgressRow[]; now: Date; benchmarkWorkoutHref: string | null; lessonFor: (drillName: string) => LessonLite | null };
export const STALE_DAYS = 21;
/** The program spaces its benchmark weeks at least two weeks apart; testing again sooner only measures how the last one went. */
export const MIN_RERUN_DAYS = 14;

/**
 * The one thing to do next, from what exists: a benchmark never started, then one that was started but never finished, then the one not run for three
 * weeks, then (for the one with the fewest full runs) another full run once the program's spacing has passed. When nothing is due it says to carry on
 * with the plan instead of suggesting a re-test. The lesson for that benchmark's drill, from the Film Room, comes with it. It never prescribes a mechanical fix.
 */
export function nextAction({ rows, now, benchmarkWorkoutHref, lessonFor }: NextInput): NextAction | null {
  if (!benchmarkWorkoutHref) return null;
  const day = 86_400_000;
  const status = analyzeBenchmarks(rows).map((r) => {
    const current = r.groups.filter((x) => x.current);
    const started = current.flatMap((x) => x.results);
    const full = Math.max(0, ...current.map((x) => x.comparable.length));
    const last = started.length ? Math.max(...started.map((x) => new Date(x.at).getTime())) : null;
    return { r, started: started.length, full, daysAgo: last === null ? null : Math.max(0, Math.floor((now.getTime() - last) / day)) };
  });
  const never = status.find((s) => s.started === 0);
  const unfinished = status.find((s) => s.started > 0 && s.full === 0);
  const stale = [...status].filter((s) => s.daysAgo !== null && s.daysAgo >= STALE_DAYS).sort((a, b) => (b.daysAgo ?? 0) - (a.daysAgo ?? 0))[0];
  const due = [...status].filter((s) => s.daysAgo !== null && s.daysAgo >= MIN_RERUN_DAYS).sort((a, b) => a.full - b.full)[0];
  const pick = never ?? unfinished ?? stale ?? due;
  const lowerTitle = (s: (typeof status)[number]) => s.r.protocol.title.toLowerCase();
  if (!pick) {
    const recent = [...status].sort((a, b) => (a.daysAgo ?? 0) - (b.daysAgo ?? 0))[0];
    return { label: "Keep going with your plan", why: `Your benchmarks are up to date. A new one is most useful about two weeks after the last${recent?.daysAgo !== null && recent ? ` (your ${lowerTitle(recent)} was ${recent.daysAgo === 0 ? "today" : `${recent.daysAgo} day${recent.daysAgo === 1 ? "" : "s"} ago`})` : ""}, so a re-test now would mostly measure that day.`, href: benchmarkWorkoutHref, lesson: null };
  }
  const t = pick.r.protocol.title;
  const why = pick.started === 0 ? `You have not run your ${t.toLowerCase()} yet. It is the starting point everything else is compared with.`
    : pick.full === 0 ? `You started your ${t.toLowerCase()} but did not finish all of it. A full run, the same way every time, is the starting point.`
    : pick.daysAgo !== null && pick.daysAgo >= STALE_DAYS ? `It has been ${pick.daysAgo} days since your ${t.toLowerCase()}.`
    : `Another full run of your ${t.toLowerCase()}, the same way, makes a real change easier to see (${pick.full} so far).`;
  return { label: `Run the ${t}`, why, href: benchmarkWorkoutHref, lesson: lessonFor(pick.r.protocol.drillName) };
}

export type Latest = { row: ProgressRow; previous: ProgressRow | null; daysAgo: number };

/**
 * The most recent tracked result in the range and, when there is one, the same drill and variant before it. A plain fact for "how did I shoot
 * last time?": it says nothing about improvement, which is for the comparisons that follow the rules above.
 */
export function latestResult(rows: ProgressRow[], now: Date, range: Range = {}): Latest | null {
  const mine = rows.filter((x) => (!range.from || new Date(x.at) >= range.from) && (!range.to || new Date(x.at) <= range.to) && x.metrics.attempts > 0).sort((a, b) => a.at.localeCompare(b.at));
  const row = mine[mine.length - 1];
  if (!row) return null;
  const same = mine.slice(0, -1).filter((x) => x.drillName === row.drillName && (x.metrics.variant ?? "") === (row.metrics.variant ?? "") && !!x.metrics.benchmark === !!row.metrics.benchmark);
  return { row, previous: same[same.length - 1] ?? null, daysAgo: Math.max(0, Math.floor((now.getTime() - new Date(row.at).getTime()) / 86_400_000)) };
}
