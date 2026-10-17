import test from "node:test";
import assert from "node:assert/strict";
import { buildInsights, nextAction, STALE_DAYS, type LessonLite } from "./insights.ts";
import { buildTrackedMetrics, type BenchmarkBlock, type ShotRow } from "./drill-tracking.ts";
import type { ProgressRow } from "./progress-rows.ts";

const shots = (makes: number, n: number, taps = false): ShotRow[] => Array.from({ length: n }, (_, i) => ({ made: i < makes, source: taps ? "manual" : "camera", detected_made: taps ? null : i < makes, added_by_hand: false }));
let n = 0;
function row(drill: string, variant: string, makes: number, attempts: number, week: number | null, at: string, bm: (Partial<BenchmarkBlock> & { protocol: string }) | null): ProgressRow {
  n += 1;
  return { logId: `l${n}`, workoutSessionId: `w${n}`, at, week, day: week === null ? null : 4, drillName: drill, status: "completed", metrics: buildTrackedMetrics({ drill: { name: drill }, variant, goal: null, shots: shots(makes, attempts), shotSessionId: `s${n}`, benchmark: bm ? { conditions: null, conditions_complete: true, clock_complete: null, redo: 0, ...bm } : undefined }) };
}
const ft = (m: number, w: number, at: string) => row("Free Throw Reset", "Benchmark v1", m, 30, w, at, { protocol: "free_throw@v1" });
const cs = (m: number, w: number, at: string) => row("Catch-and-Shoot off the Pin-Down", "Benchmark v1 · both wings", m, 30, w, at, { protocol: "catch_and_shoot@v1", conditions: { pass_from: "partner" }, conditions_complete: true });
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const find = (list: ReturnType<typeof buildInsights>, id: string) => list.find((x) => x.id === id);

test("a benchmark that clearly improved since the last run says so, with its evidence and where to tap", () => {
  const list = buildInsights([ft(12, 1, ago(40)), ft(26, 3, ago(20))]);
  const i = find(list, "bm-prev-free_throw")!;
  assert.match(i.headline, /free throw benchmark is up since your last one, same test and conditions/i);
  assert.equal(i.evidence, "clear"); assert.match(i.metric, /40% then, 87% now/); assert.deepEqual(i.link, { view: "benchmarks", benchmark: "free_throw" });
  assert.match(i.evidenceNote, /more than luck would usually give/); assert.ok(i.advanced.length >= 2);
  assert.equal(list[0].id, "bm-prev-free_throw", "clear ones come first");
});

test("a 17-point rise on 30 shots is NOT called improvement: not clear yet, and it says what would settle it", () => {
  const i = find(buildInsights([ft(17, 1, ago(40)), ft(22, 3, ago(20))]), "bm-prev-free_throw")!;
  assert.equal(i.evidence, "not_yet"); assert.match(i.headline, /Not a clear change yet/); assert.doesNotMatch(i.headline, /\bup\b|improved/i);
  assert.match(i.evidenceNote, /only a change of about \d+ points or more would stand out/); assert.match(i.evidenceNote, /More full runs/);
});

test("a single benchmark result is a fact with a starting-point note, never a trend", () => {
  const i = find(buildInsights([cs(18, 1, ago(5))]), "bm-one-catch_and_shoot")!;
  assert.equal(i.evidence, "fact"); assert.match(i.headline, /first catch-and-shoot benchmark: 60%/i); assert.match(i.metric, /18 of 30, a partner/i); assert.match(i.evidenceNote, /second full run/);
});

test("the first benchmark compared with the latest is added only when that is clear and the last step was not", () => {
  const list = buildInsights([ft(8, 1, ago(60)), ft(20, 3, ago(40)), ft(24, 6, ago(10))]);
  assert.ok(find(list, "bm-first-free_throw"), "since the first is clear"); assert.equal(find(list, "bm-prev-free_throw")!.evidence, "not_yet");
  const flat = buildInsights([ft(15, 1, ago(60)), ft(16, 3, ago(40)), ft(17, 6, ago(10))]);
  assert.equal(find(flat, "bm-first-free_throw"), undefined);
});

test("consistency is described from four or more runs and never as improvement", () => {
  const list = buildInsights([12, 18, 15, 21].map((m, k) => ft(m, k + 1, ago(80 - k * 15))));
  const i = find(list, "bm-cons-free_throw")!;
  assert.match(i.headline, /ranged 40% to 70%/); assert.equal(i.evidence, "fact"); assert.match(i.evidenceNote, /does not say whether they are getting better/);
});

test("an ordinary drill is compared with itself over time, with the same rule", () => {
  const rows = [row("Elbow Pull-Up", "Right side", 10, 24, 2, ago(30), null), row("Elbow Pull-Up", "Right side", 20, 24, 4, ago(10), null), row("Elbow Pull-Up", "Left side", 12, 24, 4, ago(10), null)];
  const list = buildInsights(rows);
  const i = list.find((x) => x.kind === "drill")!;
  assert.match(i.headline, /Elbow Pull-Up \(Right side\) is up since last time/); assert.equal(i.evidence, "clear");
  assert.deepEqual(i.link, { view: "shooting", category: "off_the_dribble", drill: encodeURIComponent("Elbow Pull-Up|Right side") });
  assert.equal(list.filter((x) => x.kind === "drill").length, 1, "the left side has one result, so nothing is claimed for it");
});

test("movement and time pressure: with no two kinds of shot from the same spot, it says what is needed instead of guessing", () => {
  const i = find(buildInsights([ft(17, 1, ago(10))]), "cmp-none")!;
  assert.equal(i.evidence, "not_yet"); assert.match(i.evidenceNote, /at least 30 tracked shots of each from the same spot/);
  assert.equal(find(buildInsights([]), "cmp-none")?.kind, "comparison");
});

test("practice volume is a fact about effort and never an improvement claim", () => {
  const i = find(buildInsights([ft(17, 1, ago(10)), ft(18, 3, ago(5))]), "practice")!;
  assert.equal(i.evidence, "fact"); assert.match(i.evidenceNote, /not a measure of how well you shoot/);
  assert.equal(find(buildInsights([]), "practice"), undefined);
});

test("other benchmark versions and other conditions are never mixed into a headline", () => {
  const old = row("Free Throw Reset", "Benchmark v1", 29, 30, null, ago(50), { protocol: "free_throw@v2" });
  const list = buildInsights([old, ft(15, 1, ago(40)), ft(16, 3, ago(20))]);
  const i = find(list, "bm-prev-free_throw")!;
  assert.match(i.metric, /50% then, 53% now/);
});

test("nothing anywhere claims a game result or equates volume with skill", () => {
  const list = buildInsights([ft(12, 1, ago(60)), ft(26, 3, ago(20)), cs(18, 1, ago(60)), cs(24, 3, ago(20))]);
  for (const i of list) for (const t of [i.headline, i.metric, i.evidenceNote, ...i.advanced]) assert.doesNotMatch(t, /in games?\b.*(will|better|improv)|transfer(s|red)? to|better shooter|more shots (means|is)/i, t);
});

const lesson: LessonLite = { title: "Playing Without the Ball", watched: false, url: "https://example.org/x", href: "/players/p/film?lesson=l1" };
const lessonFor = (name: string) => (name === "Catch-and-Shoot off the Pin-Down" ? lesson : null);
test("next: a benchmark never run comes first, with its lesson from the Film Room", () => {
  const a = nextAction({ rows: [ft(17, 1, ago(5))], now: new Date(), benchmarkWorkoutHref: "/players/p/workouts", lessonFor })!;
  assert.match(a.label, /Run the Catch-and-Shoot Benchmark|Run the Beat the Clock Benchmark/); assert.match(a.why, /not run your .* yet/);
  assert.equal(a.href, "/players/p/workouts");
  const cs0 = nextAction({ rows: [ft(17, 1, ago(5)), row("Beat the Clock Finisher", "Benchmark v1 · right elbow", 6, 12, 1, ago(5), { protocol: "beat_the_clock@v1", clock_complete: true })], now: new Date(), benchmarkWorkoutHref: "/w", lessonFor })!;
  assert.match(cs0.label, /Catch-and-Shoot/); assert.equal(cs0.lesson?.title, "Playing Without the Ball");
});

test("next: after all three have been run, the one not run for three weeks, then the one with fewest runs", () => {
  const all = (d: number) => [ft(17, 1, ago(d)), cs(18, 1, ago(d)), row("Beat the Clock Finisher", "Benchmark v1 · right elbow", 6, 12, 1, ago(d), { protocol: "beat_the_clock@v1", clock_complete: true })];
  const stale = nextAction({ rows: all(STALE_DAYS + 9), now: new Date(), benchmarkWorkoutHref: "/w", lessonFor })!; assert.match(stale.why, /It has been \d+ days/);
  const fresh = nextAction({ rows: [...all(5), ft(18, 3, ago(2))], now: new Date(), benchmarkWorkoutHref: "/w", lessonFor })!; assert.match(fresh.why, /Another full run/);
  assert.equal(nextAction({ rows: all(5), now: new Date(), benchmarkWorkoutHref: null, lessonFor }), null, "no benchmark workout in the library, nothing to point to");
});

test("next never prescribes a mechanical fix", () => {
  const a = nextAction({ rows: [], now: new Date(), benchmarkWorkoutHref: "/w", lessonFor })!;
  assert.doesNotMatch(`${a.label} ${a.why}`, /elbow|wrist|follow-through|footwork|fix your|change your/i);
});
