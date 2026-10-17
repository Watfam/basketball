import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBenchmarks, compareTwo, minDetectable, newcombe, volumeSummary, weekLabel, whatThisShows, type BenchmarkResult, type BenchmarkRow } from "./benchmark-analysis.ts";
import { buildTrackedMetrics, type BenchmarkBlock, type ShotRow } from "./drill-tracking.ts";

const shots = (makes: number, attempts: number, o: { taps?: boolean; flip?: number; hand?: number } = {}): ShotRow[] =>
  Array.from({ length: attempts }, (_, i) => (o.taps ? { made: i < makes, source: "manual", detected_made: null, added_by_hand: false } : { made: i < makes, source: "camera", detected_made: o.flip && i < o.flip ? !(i < makes) : i < makes, added_by_hand: !!o.hand && i >= attempts - o.hand }));
let n = 0;
function row(drill: string, label: string, makes: number, attempts: number, week: number | null, at: string, bm: Partial<BenchmarkBlock> & { protocol: string }, o: { taps?: boolean; flip?: number; hand?: number } = {}): BenchmarkRow {
  n += 1;
  const metrics = buildTrackedMetrics({ drill: { name: drill }, variant: label, goal: null, shots: shots(makes, attempts, o), shotSessionId: `ss${n}`, benchmark: { conditions: null, conditions_complete: true, clock_complete: null, redo: 0, ...bm } });
  return { logId: `l${n}`, workoutSessionId: `w${n}`, at, week, day: week === null ? null : 4, metrics };
}
const ft = (makes: number, attempts: number, week: number | null, at: string, o: Partial<BenchmarkBlock> = {}, shot: { taps?: boolean; flip?: number; hand?: number } = {}) => row("Free Throw Reset", "Benchmark v1", makes, attempts, week, at, { protocol: "free_throw@v1", ...o }, shot);
const cs = (makes: number, week: number | null, at: string, pass: "partner" | "self" | null) => row("Catch-and-Shoot off the Pin-Down", "Benchmark v1 · both wings", makes, 30, week, at, { protocol: "catch_and_shoot@v1", conditions: pass ? { pass_from: pass } : null, conditions_complete: pass !== null });
const clock = (makes: number, attempts: number, week: number | null, at: string, complete = true) => row("Beat the Clock Finisher", "Benchmark v1 · right elbow", makes, attempts, week, at, { protocol: "beat_the_clock@v1", clock_complete: complete });
const find = (rep: ReturnType<typeof analyzeBenchmarks>, key: string) => rep.find((r) => r.protocol.key === key)!;

test("the interval for a difference of two shooting percentages matches a worked example", () => {
  const d = newcombe(15, 30, 21, 30);
  assert.ok(Math.abs(d.diff - 0.2) < 1e-9 && Math.abs(d.lo - -0.045) < 0.005 && Math.abs(d.hi - 0.414) < 0.005, JSON.stringify(d));
  const same = newcombe(15, 30, 15, 30); assert.ok(same.lo < 0 && same.hi > 0 && Math.abs(same.diff) < 1e-9);
  assert.ok(minDetectable(30, 30, 0.6) >= 24 && minDetectable(30, 30, 0.6) <= 27, "about 25 points at 30 shots each");
  assert.ok(minDetectable(60, 60, 0.6) < minDetectable(30, 30, 0.6));
});

test("weeks 1, 3 and 6 of the same benchmark: all three are listed, and a 20-point rise on 30 shots is NOT called a clear change", () => {
  const rep = analyzeBenchmarks([ft(15, 30, 1, "2026-10-05"), ft(18, 30, 3, "2026-10-19"), ft(21, 30, 6, "2026-11-09")]);
  const g = find(rep, "free_throw").groups[0];
  assert.equal(g.results.length, 3); assert.deepEqual(g.results.map((r) => r.week), [1, 3, 6]); assert.ok(g.results.every((r) => r.planned && r.comparable));
  assert.equal(g.comparison!.baseline.week, 1); assert.equal(g.comparison!.latest.week, 6);
  assert.equal(g.comparison!.diff, 20); assert.equal(g.comparison!.verdict, "no_clear_change");
  assert.match(g.comparison!.text, /not a clear change/); assert.match(g.comparison!.text, /roughly 2\d points or more/);
  assert.ok(g.comparison!.range.lo < 0 && g.comparison!.range.hi > 0);
  assert.equal(g.consistency.status, "not_enough");
});

test("a large rise is called clear only because its range stays above zero", () => {
  const g = find(analyzeBenchmarks([ft(12, 30, 1, "2026-10-05"), ft(26, 30, 6, "2026-11-09")]), "free_throw").groups[0];
  assert.equal(g.comparison!.verdict, "clear_improvement"); assert.ok(g.comparison!.range.lo > 0); assert.match(g.comparison!.text, /stays above zero/);
  const d = find(analyzeBenchmarks([ft(26, 30, 1, "2026-10-05"), ft(12, 30, 6, "2026-11-09")]), "free_throw").groups[0];
  assert.equal(d.comparison!.verdict, "clear_decline");
});

test("a short test is shown but never compared; a full one before and after is", () => {
  const g = find(analyzeBenchmarks([ft(15, 30, 1, "2026-10-05"), ft(20, 22, 3, "2026-10-19"), ft(22, 30, 6, "2026-11-09")]), "free_throw").groups[0];
  assert.equal(g.results.length, 3); assert.equal(g.comparable.length, 2);
  const short = g.results[1]; assert.equal(short.comparable, false); assert.ok(short.flags.some((f) => f.kind === "incomplete" && /22 of 30/.test(f.text)));
  assert.equal(g.comparison!.latest.week, 6); assert.equal(g.comparison!.baseline.week, 1);
});

test("results of another version, or an unknown protocol, are never compared with the current one", () => {
  const rep = analyzeBenchmarks([ft(15, 30, 1, "2026-10-05", { protocol: "free_throw@v2" } as never), ft(24, 30, 3, "2026-10-19"), ft(25, 30, 6, "2026-11-09")]);
  const groups = find(rep, "free_throw").groups;
  assert.equal(groups.length, 2);
  const cur = groups.find((g) => g.current)!, old = groups.find((g) => !g.current)!;
  assert.equal(cur.results.length, 2); assert.equal(old.protocolId, "free_throw@v2"); assert.equal(old.comparison, null, "the other version has no comparison");
  assert.equal(old.protocol, null); assert.ok(old.results[0].flags.some((f) => f.excludes && /no longer defines/.test(f.text)));
  assert.equal(cur.comparison!.baseline.week, 3, "week 1 was another version, so the comparison starts at week 3");
});

test("catch-and-shoot results with a partner and results passing to yourself are kept apart; unrecorded conditions are their own group", () => {
  const rep = analyzeBenchmarks([cs(15, 1, "2026-10-05", "partner"), cs(16, 3, "2026-10-19", "self"), cs(17, 6, "2026-11-09", "partner"), cs(14, 6, "2026-11-09T12:00:00Z", null)]);
  const groups = find(rep, "catch_and_shoot").groups;
  assert.equal(groups.length, 3);
  const partner = groups.find((g) => g.conditions?.pass_from === "partner")!;
  assert.equal(partner.results.length, 2); assert.equal(partner.comparison!.baseline.week, 1); assert.equal(partner.comparison!.latest.week, 6);
  assert.equal(groups.find((g) => g.conditions?.pass_from === "self")!.comparison, null);
  const unknown = groups.find((g) => g.conditions === null)!; assert.equal(unknown.comparison, null); assert.equal(unknown.conditionsLabel, "conditions not recorded");
  assert.ok(unknown.results[0].flags.some((f) => f.kind === "conditions"));
});

test("a timed benchmark counts only if the clock ran out, is compared by the share of shots, and says so", () => {
  const rep = find(analyzeBenchmarks([clock(6, 12, 1, "2026-10-05"), clock(5, 9, 3, "2026-10-19", false), clock(7, 13, 6, "2026-11-09")]), "beat_the_clock");
  const g = rep.groups[0];
  assert.equal(g.comparable.length, 2); assert.ok(g.results[1].flags.some((f) => f.kind === "clock"));
  assert.ok(g.comparison!.caveats[0].includes("taking more shots"));
  assert.equal(g.comparison!.verdict, "no_clear_change");
  const few = find(analyzeBenchmarks([clock(2, 4, 1, "2026-10-05"), clock(3, 4, 6, "2026-11-09")]), "beat_the_clock").groups[0];
  assert.equal(few.comparable.length, 0, "under 5 attempts in the clock is too few to read");
  const tooFew = find(analyzeBenchmarks([clock(4, 8, 1, "2026-10-05"), clock(5, 9, 6, "2026-11-09")]), "beat_the_clock").groups[0];
  assert.equal(tooFew.comparison!.verdict, "too_few");
});

test("how the shots were counted and corrected is flagged on every result, without excluding it", () => {
  const g = find(analyzeBenchmarks([
    ft(20, 30, 1, "2026-10-05", {}, { taps: true }),
    ft(21, 30, 3, "2026-10-19", { redo: 1 }, { flip: 2, hand: 1 }),
  ]), "free_throw").groups[0];
  const [a, b] = g.results;
  assert.ok(a.flags.some((f) => f.kind === "source") && a.comparable);
  assert.ok(b.flags.some((f) => f.kind === "corrected" && /2 camera calls you changed and 1 shot you added/.test(f.text)));
  assert.ok(b.flags.some((f) => f.kind === "redo")); assert.ok(b.comparable);
  assert.equal(g.comparable.length, 2);
});

test("a result whose totals the player changed afterwards is flagged and uses the changed totals", () => {
  const r = ft(21, 30, 1, "2026-10-05"); r.metrics = { ...r.metrics, makes: 19, tracking: { ...r.metrics.tracking, adjusted: { original: { makes: 21, attempts: 30 } } } };
  const res = find(analyzeBenchmarks([r]), "free_throw").groups[0].results[0];
  assert.equal(res.makes, 19); assert.ok(res.flags.some((f) => f.kind === "adjusted" && /first saved 21 of 30/.test(f.text)));
});

test("a date range keeps only the results in it, and the comparison starts at the first one in the range", () => {
  const rows = [ft(15, 30, 1, "2026-10-05"), ft(18, 30, 3, "2026-10-19"), ft(24, 30, 6, "2026-11-09")];
  const g = find(analyzeBenchmarks(rows, { from: new Date("2026-10-10") }), "free_throw").groups[0];
  assert.equal(g.results.length, 2); assert.equal(g.comparison!.baseline.week, 3);
  assert.equal(find(analyzeBenchmarks(rows, { from: new Date("2026-12-01") }), "free_throw").resultCount, 0);
});

test("sparse and empty histories: every benchmark is still listed, with no comparison and nothing invented", () => {
  const none = analyzeBenchmarks([]); assert.equal(none.length, 3); assert.ok(none.every((r) => r.groups.length === 0 && r.resultCount === 0));
  const one = analyzeBenchmarks([ft(15, 30, 1, "2026-10-05")]); assert.equal(find(one, "free_throw").groups[0].comparison, null);
  const notBench = analyzeBenchmarks([{ logId: "x", workoutSessionId: "y", at: "2026-10-05", week: 1, day: 1, metrics: buildTrackedMetrics({ drill: { name: "Elbow Pull-Up" }, variant: "Right side", goal: null, shots: shots(5, 10), shotSessionId: "z" }) }]);
  assert.ok(notBench.every((r) => r.resultCount === 0), "an ordinary drill is not a benchmark");
});

test("the four things that get confused are kept apart, and volume is never worded as improvement", () => {
  const rows = [ft(15, 30, 1, "2026-10-05"), ft(16, 30, 6, "2026-11-09")];
  const rep = analyzeBenchmarks(rows);
  const vol = volumeSummary(rows);
  const [volume, performance, consistency, transfer] = whatThisShows(rep, vol);
  assert.deepEqual([volume.key, performance.key, consistency.key, transfer.key], ["volume", "performance", "consistency", "transfer"]);
  assert.match(volume.text, /effort.*not a sign of better shooting/); assert.doesNotMatch(volume.text, /improv/i);
  assert.equal(performance.status, "unclear"); assert.equal(consistency.status, "none"); assert.equal(transfer.status, "not_measured"); assert.match(transfer.text, /Not measured/);
  const more = whatThisShows(analyzeBenchmarks([]), volumeSummary([]));
  assert.equal(more[1].status, "none"); assert.match(more[0].text, /not all the shooting you did/);
  assert.equal(whatThisShows(analyzeBenchmarks([ft(10, 30, 1, "2026-10-05"), ft(27, 30, 6, "2026-11-09")]), vol)[1].status, "clear");
});

test("consistency is described only from four or more full results, and never as improvement", () => {
  const rows = [12, 18, 15, 21].map((m, i) => ft(m, 30, i + 1, `2026-10-0${i + 1}`));
  const g = find(analyzeBenchmarks(rows), "free_throw").groups[0];
  assert.equal(g.consistency.status, "shown"); assert.deepEqual([g.consistency.low, g.consistency.high], [40, 70]); assert.match(g.consistency.text, /does not say whether they are getting better/);
});

test("volume counts only tracked drills in the range and separates benchmark shots", () => {
  const rows = [ft(15, 30, 1, "2026-10-05"), { logId: "o", workoutSessionId: "o", at: "2026-10-06", week: 1, day: 1, metrics: buildTrackedMetrics({ drill: { name: "Elbow Pull-Up" }, variant: "Right side", goal: null, shots: shots(5, 10, { taps: true }), shotSessionId: "zz" }) }];
  assert.deepEqual(volumeSummary(rows), { trackedDrills: 2, attempts: 40, makes: 20, benchmarkAttempts: 30, cameraCounted: 1, corrected: 0 });
  assert.equal(volumeSummary(rows, { from: new Date("2026-10-06") }).attempts, 10);
});

test("week labels say where a result sits in the plan", () => {
  assert.equal(weekLabel(3, true), "Week 3 · planned benchmark week"); assert.equal(weekLabel(4, false), "Week 4 · extra run"); assert.equal(weekLabel(null, false), "Outside the program");
});

test("a large history (3000 results) is analysed quickly and correctly", () => {
  const rows: BenchmarkRow[] = [];
  for (let i = 0; i < 1000; i += 1) { const d = new Date(Date.UTC(2024, 0, 1 + i)).toISOString(); rows.push(ft(15 + (i % 10), 30, (i % 6) + 1, d), cs(16 + (i % 8), (i % 6) + 1, d, i % 2 ? "partner" : "self"), clock(5 + (i % 6), 12 + (i % 5), (i % 6) + 1, d)); }
  const t0 = performance.now(); const rep = analyzeBenchmarks(rows); const ms = performance.now() - t0;
  assert.equal(rep.reduce((a, r) => a + r.resultCount, 0), 3000);
  assert.ok(find(rep, "catch_and_shoot").groups.every((g) => g.results.length === 500));
  assert.ok(ms < 500, `${ms} ms`);
});

test("'clear' is held to the strict level: 15 of 30 then 23 of 30 only leans up, 8 of 30 then 20 of 30 is clear", () => {
  const r = (makes: number, attempts: number) => ({ makes, attempts, pct: (100 * makes) / attempts }) as unknown as BenchmarkResult;
  const lean = compareTwo(r(15, 30), r(23, 30))!;
  assert.equal(lean.verdict, "no_clear_change"); assert.equal(lean.leans, "up"); assert.match(lean.text, /includes zero/);
  const clear = compareTwo(r(8, 30), r(20, 30))!;
  assert.equal(clear.verdict, "clear_improvement"); assert.equal(clear.leans, null); assert.match(clear.text, /strict 98% range/);
  assert.equal(compareTwo(r(15, 30), r(16, 30))!.leans, null);
  assert.ok(clear.minDetectable >= 28 && clear.minDetectable <= 34, `about 31 points at 30 shots each, got ${clear.minDetectable}`);
});
