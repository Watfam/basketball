import { analyzeBenchmarks, compareTwo, drillResults, volumeSummary, type BenchmarkReport, type Comparison, type Range } from "./benchmark-analysis.ts";
import { compareCategoriesAtSameSpot, MIN_SHOTS_FOR_A_DIFFERENCE, type TrackedRow } from "./drill-analytics.ts";
import { CATEGORY_LABELS, type ShootingCategory } from "./drill-shooting.ts";
import type { ProgressRow } from "./progress-rows.ts";

/**
 * What a player's results say, in a few plain sentences, each with its evidence and where to tap to see the sessions behind it. Rules:
 *  - only conclusions the data supports; "Clear" only when the 95% range of the change stays on one side of zero (the same rule everywhere);
 *  - a result is compared only with results of the same benchmark version and conditions, or the same drill and variant;
 *  - nothing about volume is ever worded as skill, and nothing says anything about games;
 *  - when the evidence is not enough, the insight says what more comparable practice would settle it.
 */
export type Evidence = "clear" | "not_yet" | "fact";
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
const rank: Record<Evidence, number> = { clear: 0, not_yet: 1, fact: 2 };

function fromComparison(id: string, title: string, c: Comparison, label: string, link: InsightLink, kind: Insight["kind"]): Insight {
  const a = c.baseline, b = c.latest;
  const metric = `${pct(a.pct)} then, ${pct(b.pct)} now (${c.diff >= 0 ? "+" : ""}${c.diff} points, ${a.attempts} and ${b.attempts} shots)`;
  const adv = [c.text, ...c.caveats];
  if (c.verdict === "clear_improvement") return { id, kind, headline: `${title} is up ${label}`, metric, evidence: "clear", evidenceNote: "The range of normal shot-to-shot variation stays above zero, so this is more than luck would usually give. It is a practice result, not a game result.", link, advanced: adv };
  if (c.verdict === "clear_decline") return { id, kind, headline: `${title} is down ${label}`, metric, evidence: "clear", evidenceNote: "The range stays below zero. Check the notes on each result (rested? same spot? who passed?) before reading much into it.", link, advanced: adv };
  if (c.verdict === "too_few") return { id, kind, headline: `${title}: too few shots to compare ${label}`, metric, evidence: "not_yet", evidenceNote: "At least 10 shots in each result are needed to say anything.", link, advanced: adv };
  return { id, kind, headline: `${title}: ${pct(a.pct)} then, ${pct(b.pct)} now. Not a clear change yet`, metric, evidence: "not_yet", evidenceNote: `With ${a.attempts} and ${b.attempts} shots, only a change of about ${c.minDetectable} points or more would stand out. More full runs, run the same way, settle it.`, link, advanced: adv };
}

/** Insights from benchmarks, drills, same-spot comparisons and practice, strongest first. */
export function buildInsights(rows: ProgressRow[], range: Range = {}): Insight[] {
  const out: Insight[] = [];
  const reports: BenchmarkReport[] = analyzeBenchmarks(rows, range);

  for (const r of reports) {
    const g = r.groups.find((x) => x.current && x.comparable.length > 0);
    if (!g) continue;
    const link: InsightLink = { view: "benchmarks", benchmark: r.protocol.key };
    const list = g.comparable;
    const cond = g.conditionsLabel ? `, ${g.conditionsLabel}` : "";
    if (list.length >= 2) {
      const prev = compareTwo(list[list.length - 2], list[list.length - 1], { timed: !!r.protocol.clockSeconds });
      if (prev) out.push(fromComparison(`bm-prev-${r.protocol.key}`, `Your ${r.protocol.title.toLowerCase()}`, prev, "since your last one, same test and conditions" + cond, link, "benchmark"));
      if (list.length >= 3 && g.comparison && g.comparison.verdict === "clear_improvement" && prev?.verdict !== "clear_improvement") {
        out.push(fromComparison(`bm-first-${r.protocol.key}`, `Your ${r.protocol.title.toLowerCase()}`, g.comparison, "since your first one", link, "benchmark"));
      }
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
    if (prev) out.push(fromComparison(`drill-${d.key}`, `${name}${variant ? ` (${variant})` : ""}`, prev, "since last time", { view: "shooting", category: d.list[0].metrics.category ?? undefined, drill: encodeURIComponent(d.key) }, "drill"));
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

  return out.sort((x, y) => rank[x.evidence] - rank[y.evidence]);
}

export type NextInput = { rows: ProgressRow[]; now: Date; benchmarkWorkoutHref: string | null; lessonFor: (drillName: string) => LessonLite | null };
export const STALE_DAYS = 21;

/**
 * The one thing to do next, from what exists: a benchmark never run, then the one not run for three weeks, then (for the one with the fewest
 * runs) another full run. The lesson for that benchmark's drill, from the Film Room, comes with it. It never prescribes a mechanical fix.
 */
export function nextAction({ rows, now, benchmarkWorkoutHref, lessonFor }: NextInput): NextAction | null {
  if (!benchmarkWorkoutHref) return null;
  const reports = analyzeBenchmarks(rows);
  const status = reports.map((r) => {
    const g = r.groups.find((x) => x.current && x.comparable.length > 0);
    const last = g ? g.comparable[g.comparable.length - 1] : null;
    return { r, runs: g?.comparable.length ?? 0, daysAgo: last ? Math.floor((now.getTime() - new Date(last.at).getTime()) / 86_400_000) : null };
  });
  const never = status.find((s) => s.runs === 0);
  const stale = [...status].filter((s) => s.daysAgo !== null && s.daysAgo >= STALE_DAYS).sort((a, b) => (b.daysAgo ?? 0) - (a.daysAgo ?? 0))[0];
  const fewest = [...status].sort((a, b) => a.runs - b.runs)[0];
  const pick = never ?? stale ?? fewest;
  if (!pick) return null;
  const t = pick.r.protocol.title;
  const why = pick.runs === 0 ? `You have not run your ${t.toLowerCase()} yet. It is the starting point everything else is compared with.` : pick.daysAgo !== null && pick.daysAgo >= STALE_DAYS ? `It has been ${pick.daysAgo} days since your ${t.toLowerCase()}.` : `Another full run of your ${t.toLowerCase()}, the same way, is what shows whether it moved (${pick.runs} so far).`;
  return { label: `Run the ${t}`, why, href: benchmarkWorkoutHref, lesson: lessonFor(pick.r.protocol.drillName) };
}
