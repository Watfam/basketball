import { BENCHMARKS, BENCHMARK_WEEKS, conditionsKey, describeConditions, protocolFromId, protocolId, type BenchmarkProtocol } from "./benchmarks.ts";
import { wilson, type Interval } from "./drill-analytics.ts";
import type { TrackedMetrics } from "./drill-tracking.ts";

/**
 * What repeated benchmark results can and cannot say. Rules, fixed before any real result was looked at:
 *  - only results of the same protocol, the same version and the same stated conditions are ever compared; others are listed apart and never mixed;
 *  - a result that is not a full benchmark (not all its attempts, or the clock did not run out) is shown but left out of comparisons;
 *  - the change is the difference between the first and the latest comparable result in the range, reported WITH its plausible range
 *    (Newcombe's interval for two proportions); "clear" means that range stays on one side of zero, nothing weaker;
 *  - short tests mostly will not be clear, and the screen says how large a change would need to be to stand out;
 *  - the number of shots or workouts is effort, never ability, and is kept in its own panel;
 *  - nothing here says anything about games.
 */

export type BenchmarkRow = {
  logId: string;
  workoutSessionId: string;
  /** When the workout was started. */
  at: string;
  /** Program week and day when the workout was a day of a program, else null. */
  week: number | null;
  day: number | null;
  metrics: TrackedMetrics;
};

export type Flag = { kind: "incomplete" | "clock" | "conditions" | "redo" | "adjusted" | "source" | "corrected"; text: string; /** Leaves the result out of comparisons. */ excludes: boolean };

export type BenchmarkResult = {
  logId: string;
  workoutSessionId: string;
  shotSessionId: string;
  at: string;
  week: number | null;
  day: number | null;
  /** In one of the program's planned benchmark weeks. */
  planned: boolean;
  attempts: number;
  makes: number;
  pct: number | null;
  ci: Interval;
  /** A full benchmark that can be compared. */
  comparable: boolean;
  flags: Flag[];
  source: "camera" | "taps" | "mixed";
};

export type Verdict = "clear_improvement" | "clear_decline" | "no_clear_change" | "too_few";
export type Comparison = {
  baseline: BenchmarkResult;
  latest: BenchmarkResult;
  /** Percentage points, latest minus first. */
  diff: number;
  range: { lo: number; hi: number };
  verdict: Verdict;
  /** Roughly the smallest change in points that would stand out at these sizes. */
  minDetectable: number;
  text: string;
  caveats: string[];
};

export type Group = {
  protocol: BenchmarkProtocol | null;
  protocolId: string;
  /** The version the app currently defines. Older or unknown versions are shown apart and never compared with it. */
  current: boolean;
  conditions: Record<string, string> | null;
  conditionsLabel: string | null;
  results: BenchmarkResult[];
  comparable: BenchmarkResult[];
  comparison: Comparison | null;
  consistency: { status: "not_enough" | "shown"; results: number; low: number | null; high: number | null; text: string };
};

export type BenchmarkReport = { protocol: BenchmarkProtocol; groups: Group[]; resultCount: number };

const MIN_ATTEMPTS = 10;
const MIN_FOR_CONSISTENCY = 4;
const pts = (x: number) => Math.round(x * 100);

/** Newcombe's hybrid-score interval (method 10) for p2 - p1 from the two Wilson intervals. */
export function newcombe(k1: number, n1: number, k2: number, n2: number): { diff: number; lo: number; hi: number } {
  const p1 = n1 ? k1 / n1 : 0, p2 = n2 ? k2 / n2 : 0;
  const a = wilson(k1, n1), b = wilson(k2, n2);
  const d = p2 - p1;
  return { diff: d, lo: d - Math.sqrt((p2 - b.lo) ** 2 + (a.hi - p1) ** 2), hi: d + Math.sqrt((b.hi - p2) ** 2 + (p1 - a.lo) ** 2) };
}

/** Roughly how big a change (in points) has to be before two results of these sizes could tell it from luck. */
export function minDetectable(n1: number, n2: number, pooled: number): number {
  const p = Math.min(0.7, Math.max(0.3, pooled));
  return pts(1.96 * Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)));
}

function toResult(row: BenchmarkRow, p: BenchmarkProtocol | null): BenchmarkResult {
  const m = row.metrics, b = m.benchmark!;
  const flags: Flag[] = [];
  const full = p?.attempts ? m.attempts === p.attempts : p?.clockSeconds ? b.clock_complete === true && m.attempts >= 5 : false;
  if (!p) flags.push({ kind: "incomplete", text: "Taken under a protocol this app no longer defines", excludes: true });
  else if (p.attempts && m.attempts !== p.attempts) flags.push({ kind: "incomplete", text: `${m.attempts} of ${p.attempts} attempts: not a full benchmark`, excludes: true });
  else if (p.clockSeconds && b.clock_complete !== true) flags.push({ kind: "clock", text: "The clock did not run its full length", excludes: true });
  else if (p.clockSeconds && m.attempts < 5) flags.push({ kind: "incomplete", text: `Only ${m.attempts} attempts in the clock: too few to read`, excludes: true });
  if (p && p.conditions.length && !b.conditions_complete) flags.push({ kind: "conditions", text: "Test conditions not recorded: only compared with results like it", excludes: false });
  if (b.redo > 0) flags.push({ kind: "redo", text: `Run again ${b.redo} time${b.redo === 1 ? "" : "s"} in the workout; the latest run counts`, excludes: false });
  if (m.tracking.adjusted) flags.push({ kind: "adjusted", text: `Totals changed by you after saving (first saved ${m.tracking.adjusted.original.makes} of ${m.tracking.adjusted.original.attempts})`, excludes: false });
  const t = m.tracking;
  if (t.source === "taps") flags.push({ kind: "source", text: "Counted by your taps, not the camera", excludes: false });
  if (t.flipped + t.added_by_hand > 0 && t.source !== "taps") flags.push({ kind: "corrected", text: `${t.flipped ? `${t.flipped} camera call${t.flipped === 1 ? "" : "s"} you changed` : ""}${t.flipped && t.added_by_hand ? " and " : ""}${t.added_by_hand ? `${t.added_by_hand} shot${t.added_by_hand === 1 ? "" : "s"} you added` : ""}`, excludes: false });
  return {
    logId: row.logId, workoutSessionId: row.workoutSessionId, shotSessionId: t.shot_session_id, at: row.at, week: row.week, day: row.day,
    planned: row.week !== null && (BENCHMARK_WEEKS as readonly number[]).includes(row.week),
    attempts: m.attempts, makes: m.makes, pct: m.attempts > 0 ? (100 * m.makes) / m.attempts : null, ci: wilson(m.makes, m.attempts),
    comparable: full && !flags.some((f) => f.excludes), flags, source: t.source,
  };
}

/** First against latest of a list of comparable results, with the same rules for a benchmark and for an ordinary drill. */
export function compareList(list: BenchmarkResult[], opts: { timed?: boolean } = {}): Comparison | null {
  return compare({ clockSeconds: opts.timed ? 1 : null } as BenchmarkProtocol, list);
}

/** Two specific results (for example the previous run and the latest). */
export function compareTwo(a: BenchmarkResult, b: BenchmarkResult, opts: { timed?: boolean } = {}): Comparison | null {
  return compare({ clockSeconds: opts.timed ? 1 : null } as BenchmarkProtocol, [a, b]);
}

function compare(p: BenchmarkProtocol, list: BenchmarkResult[]): Comparison | null {
  if (list.length < 2) return null;
  const a = list[0], b = list[list.length - 1];
  const n = newcombe(a.makes, a.attempts, b.makes, b.attempts);
  const diff = pts(n.diff), lo = pts(n.lo), hi = pts(n.hi);
  const md = minDetectable(a.attempts, b.attempts, (a.makes + b.makes) / (a.attempts + b.attempts));
  const caveats = [
    "Being more rested, a different ball or hoop, or a different mood can move a result of this size.",
    "A practice result: it does not show how the same shots go in a game.",
  ];
  if (p.clockSeconds) caveats.unshift("Compared by the share of shots that went in. More makes can also come from taking more shots in the time, which is shown but not counted as better shooting.");
  let verdict: Verdict, text: string;
  if (a.attempts < MIN_ATTEMPTS || b.attempts < MIN_ATTEMPTS) {
    verdict = "too_few";
    text = `Too few shots in one of the two tests (${a.attempts} and ${b.attempts}) to say anything about a change.`;
  } else if (n.lo > 0) {
    verdict = "clear_improvement";
    text = `${pts(a.makes / a.attempts)}% to ${pts(b.makes / b.attempts)}%: up ${diff} points. With ${a.attempts} and ${b.attempts} shots the plausible range for the change is ${lo} to ${hi} points and stays above zero, so this is more than shot-to-shot luck would usually give.`;
  } else if (n.hi < 0) {
    verdict = "clear_decline";
    text = `${pts(a.makes / a.attempts)}% to ${pts(b.makes / b.attempts)}%: down ${Math.abs(diff)} points. With ${a.attempts} and ${b.attempts} shots the plausible range for the change is ${lo} to ${hi} points and stays below zero.`;
  } else {
    verdict = "no_clear_change";
    text = `${pts(a.makes / a.attempts)}% to ${pts(b.makes / b.attempts)}% (${diff >= 0 ? "+" : ""}${diff} points). That is not a clear change: with ${a.attempts} and ${b.attempts} shots the plausible range is ${lo} to ${hi} points and includes zero. At these sizes only a change of roughly ${md} points or more would stand out.`;
  }
  return { baseline: a, latest: b, diff, range: { lo, hi }, verdict, minDetectable: md, text, caveats };
}

function consistency(list: BenchmarkResult[]): Group["consistency"] {
  if (list.length < MIN_FOR_CONSISTENCY) return { status: "not_enough", results: list.length, low: null, high: null, text: `Consistency is only described from ${MIN_FOR_CONSISTENCY} or more comparable results; there ${list.length === 1 ? "is" : "are"} ${list.length}.` };
  const v = list.map((r) => r.pct!);
  const low = Math.round(Math.min(...v)), high = Math.round(Math.max(...v));
  return { status: "shown", results: list.length, low, high, text: `Across ${list.length} results the share ranged from ${low}% to ${high}%. This describes how much results moved around; it does not say whether they are getting better.` };
}

export type Range = { from?: Date | null; to?: Date | null };
const inRange = (iso: string, r: Range) => (!r.from || new Date(iso) >= r.from) && (!r.to || new Date(iso) <= r.to);

/** One report per defined benchmark (empty ones included, so the screen can say what to do), results grouped by protocol version and stated conditions. */
export function analyzeBenchmarks(rows: BenchmarkRow[], range: Range = {}): BenchmarkReport[] {
  const mine = rows.filter((r) => r.metrics.benchmark && inRange(r.at, range));
  return BENCHMARKS.map((protocol) => {
    const own = mine.filter((r) => r.metrics.benchmark!.protocol.split("@")[0] === protocol.key).sort((a, b) => a.at.localeCompare(b.at));
    const buckets = new Map<string, BenchmarkRow[]>();
    for (const r of own) {
      const k = `${r.metrics.benchmark!.protocol}|${conditionsKey(r.metrics.benchmark!.conditions)}`;
      (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(r);
    }
    const groups: Group[] = [...buckets.entries()].map(([k, list]) => {
      const pid = k.split("|")[0], p = protocolFromId(pid);
      const results = list.map((r) => toResult(r, p));
      const comparable = results.filter((r) => r.comparable);
      const conditions = list[0].metrics.benchmark!.conditions;
      return {
        protocol: p, protocolId: pid, current: pid === protocolId(protocol), conditions, conditionsLabel: p ? describeConditions(p, conditions) : null,
        results, comparable, comparison: p && pid === protocolId(protocol) ? compare(p, comparable) : null, consistency: consistency(comparable),
      };
    }).sort((a, b) => Number(b.current) - Number(a.current) || b.results.length - a.results.length);
    return { protocol, groups, resultCount: own.length };
  });
}

/** Practice volume in the range: only what was tracked, and never presented as progress. */
export function volumeSummary(rows: { at: string; metrics: TrackedMetrics }[], range: Range = {}) {
  const mine = rows.filter((r) => inRange(r.at, range));
  const bench = mine.filter((r) => r.metrics.benchmark);
  return {
    trackedDrills: mine.length,
    attempts: mine.reduce((a, r) => a + r.metrics.attempts, 0),
    makes: mine.reduce((a, r) => a + r.metrics.makes, 0),
    benchmarkAttempts: bench.reduce((a, r) => a + r.metrics.attempts, 0),
    cameraCounted: mine.filter((r) => r.metrics.tracking.source === "camera").length,
    corrected: mine.filter((r) => (r.metrics.tracking.source !== "taps" && r.metrics.tracking.flipped + r.metrics.tracking.added_by_hand > 0) || r.metrics.tracking.adjusted).length,
  };
}

/** The four things that are easy to confuse, kept apart, with where each currently stands. */
export function whatThisShows(report: BenchmarkReport[], volume: ReturnType<typeof volumeSummary>) {
  const cmp = report.flatMap((r) => r.groups.filter((g) => g.current).map((g) => g.comparison)).filter((c): c is Comparison => !!c);
  const clear = cmp.filter((c) => c.verdict === "clear_improvement").length;
  const declines = cmp.filter((c) => c.verdict === "clear_decline").length;
  const cons = report.flatMap((r) => r.groups.filter((g) => g.current && g.consistency.status === "shown"));
  return [
    { key: "volume", title: "More practice", status: volume.attempts > 0 ? "measured" : "none", text: volume.attempts > 0 ? `${volume.attempts} shots tracked in ${volume.trackedDrills} drill${volume.trackedDrills === 1 ? "" : "s"} in this range. This is effort. It is not a sign of better shooting.` : "No tracked drills in this range. Only tracked drills are counted here, so this is not all the shooting you did." },
    { key: "performance", title: "Better benchmark results", status: cmp.length === 0 ? "none" : clear > 0 ? "clear" : declines > 0 ? "decline" : "unclear", text: cmp.length === 0 ? "Needs two full benchmarks of the same kind, run the same way." : clear > 0 ? `${clear} of ${cmp.length} benchmark${cmp.length === 1 ? "" : "s"} show a clear improvement at the same difficulty. Small differences are never called improvement.` : declines > 0 ? `${declines} benchmark${declines === 1 ? "" : "s"} show a clear decline; look at the data-quality notes before reading much into it.` : "No benchmark shows a clear change yet. With 30 shots a test, only large changes stand out." },
    { key: "consistency", title: "Consistency", status: cons.length ? "shown" : "none", text: cons.length ? cons.map((g) => `${g.protocol?.title}: ${g.consistency.text}`).join(" ") : `Not enough results yet: it is only described from ${MIN_FOR_CONSISTENCY} or more full results of one benchmark.` },
    { key: "transfer", title: "Game transfer", status: "not_measured", text: "Not measured. These tests are done in practice, alone or with a partner. Nothing here shows how the same shots go in a game." },
  ] as const;
}

/** Where a result sits in the plan, in words. */
export function weekLabel(week: number | null, planned: boolean): string {
  if (week === null) return "Outside the program";
  return planned ? `Week ${week} · planned benchmark week` : `Week ${week} · extra run`;
}

/**
 * Results of an ordinary tracked drill (not a benchmark) in the same shape the benchmark screens use, so the same chart, the same rules and the
 * same data-quality notes apply. A run of fewer than 5 attempts is too small to read and is left out of comparisons. Different runs of an ordinary
 * drill can be different amounts of work, which is shown, not hidden.
 */
export function drillResults(rows: BenchmarkRow[]): BenchmarkResult[] {
  return [...rows].sort((a, b) => a.at.localeCompare(b.at)).map((row) => {
    const m = row.metrics, t = m.tracking;
    const flags: Flag[] = [];
    if (m.attempts < 5) flags.push({ kind: "incomplete", text: `Only ${m.attempts} attempts: too few to read`, excludes: true });
    if (m.tracking.adjusted) flags.push({ kind: "adjusted", text: `Totals changed by you after saving (first saved ${t.adjusted!.original.makes} of ${t.adjusted!.original.attempts})`, excludes: false });
    if (t.source === "taps") flags.push({ kind: "source", text: "Counted by your taps, not the camera", excludes: false });
    if (t.flipped + t.added_by_hand > 0 && t.source !== "taps") flags.push({ kind: "corrected", text: `${t.flipped ? `${t.flipped} camera call${t.flipped === 1 ? "" : "s"} you changed` : ""}${t.flipped && t.added_by_hand ? " and " : ""}${t.added_by_hand ? `${t.added_by_hand} shot${t.added_by_hand === 1 ? "" : "s"} you added` : ""}`, excludes: false });
    return {
      logId: row.logId, workoutSessionId: row.workoutSessionId, shotSessionId: t.shot_session_id, at: row.at, week: row.week, day: row.day, planned: false,
      attempts: m.attempts, makes: m.makes, pct: m.attempts > 0 ? (100 * m.makes) / m.attempts : null, ci: wilson(m.makes, m.attempts),
      comparable: m.attempts >= 5, flags, source: t.source,
    };
  });
}
