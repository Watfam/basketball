import test from "node:test";
import assert from "node:assert/strict";
import { countedBy, firstName, greeting, homeRange, improvementAnswer, lookBack, pickFocus, plainSentence, recentItems, shotTotals, shotWindowStart, standings, weeklyShots, whenLabel, MIN_SHOTS_TO_READ, type ShotSet } from "./home.ts";
import { thisWeek, toActivities } from "./activity.ts";
import { buildTrackedMetrics, type BenchmarkBlock, type ShotRow } from "./drill-tracking.ts";
import type { ProgressRow } from "./progress-rows.ts";

const NOW = new Date(2026, 9, 21, 15, 0); // Wed 21 Oct 2026, 3 pm
const ago = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString();
let n = 0;
const set = (makes: number, attempts: number, daysAgo: number, o: Partial<ShotSet> = {}): ShotSet => ({ id: `s${++n}`, label: "Free throws", started_at: ago(daysAgo), makes, attempts, source: "camera", ...o });

test("the three numbers come from makes and attempts: 65 of 100 is 65%, and the sentence says so", () => {
  const sets = [set(30, 50, 2), set(35, 50, 5)];
  const t = shotTotals(sets, new Date(NOW.getTime() - 28 * 864e5));
  assert.deepEqual([t.taken, t.made, t.pct, t.sets], [100, 65, 65, 2]);
  assert.equal(plainSentence(t, "in the last 4 weeks"), "You made 65 out of 100 shots in the last 4 weeks.");
  assert.equal(plainSentence(shotTotals([set(1, 1, 1)], null), "this season"), "You made 1 out of 1 shot this season.");
  assert.equal(plainSentence(shotTotals([], null), "in the last 7 days"), "No shots counted in the last 7 days yet.");
  assert.equal(shotTotals([set(2, 3, 1)], null).pct, 66.7, "same rounding as the Shoot tab");
});

test("only the range counts, and a set with no shots is ignored", () => {
  const sets = [set(5, 10, 3), set(7, 10, 20), set(0, 0, 1), set(8, 10, 40)];
  assert.equal(shotTotals(sets, new Date(NOW.getTime() - 7 * 864e5)).taken, 10);
  assert.equal(shotTotals(sets, new Date(NOW.getTime() - 28 * 864e5)).taken, 20);
  assert.equal(shotTotals(sets, null).taken, 30);
  assert.equal(shotTotals(sets, new Date(NOW.getTime() - 28 * 864e5)).sets, 2, "empty sets are not sets");
});

test("how the shots were counted is said plainly, and never mixed up", () => {
  const t = shotTotals([set(5, 10, 1, { source: "camera" }), set(3, 5, 2, { source: "manual" }), set(2, 4, 3, { source: null })], null);
  assert.deepEqual([t.camera, t.taps], [10, 5]);
  assert.match(countedBy(t), /the camera counted 10/); assert.match(countedBy(t), /you counted 5 by tapping/); assert.match(countedBy(t), /4 came from older sets/);
  assert.equal(countedBy(shotTotals([], null)), "");
});

test("range choices: 4 weeks by default, a bad value falls back to it, the season starts on 1 August", () => {
  assert.equal(homeRange(null, NOW).key, "4w"); assert.equal(homeRange("nonsense", NOW).key, "4w"); assert.equal(homeRange("7d", NOW).label, "7 days");
  assert.equal(homeRange("season", NOW).from.getMonth(), 7); assert.equal(homeRange("season", NOW).phrase, "this season");
  assert.ok(shotWindowStart(NOW) <= homeRange("season", NOW).from && shotWindowStart(NOW) <= new Date(NOW.getTime() - 49 * 864e5), "reads back far enough for every range and the chart");
  const early = new Date(2026, 8, 3);
  assert.ok(shotWindowStart(early) < homeRange("season", early).from, "early in the season, the chart still reaches back eight weeks");
});

test("eight weeks of bars, oldest first, Monday to Sunday, the current week last; a thin week is not read", () => {
  const sets = [set(7, 10, 0), set(12, 20, 3), set(1, 2, 10), set(9, 12, 60)];
  const w = weeklyShots(sets, NOW);
  assert.equal(w.length, 8); assert.equal(w[7].isCurrent, true); assert.equal(w[0].isCurrent, false);
  assert.equal(w[7].start.getDay(), 1, "weeks start on Monday");
  assert.equal(w[7].taken, 10, "this week (Mon 19 to Wed 21) holds the set from today only");
  assert.equal(w[6].taken, 20, "last week holds the set from 3 days ago");
  assert.equal(w[6].readable, true); assert.equal(w[5].taken, 2); assert.equal(w[5].readable, false, "2 shots is too few to read a percentage");
  assert.equal(w.reduce((a, x) => a + x.taken, 0), 32, "the set from 60 days ago is outside the eight weeks");
});

test("the look back compares four weeks with the four before, and never calls it improvement", () => {
  const sets = [set(31, 50, 5), set(31, 50, 20), set(25, 50, 40), set(25, 50, 50)];
  const lb = lookBack(sets, NOW)!;
  assert.match(lb.text, /Last 4 weeks: 62% \(62 of 100\)\. The 4 weeks before: 50% \(50 of 100\)\. That is 12 points higher/);
  assert.equal(lb.short, "The 4 weeks before: 50%. The last 4 weeks: 62%. That is 12 points higher (you may have shot different drills)."); assert.match(lb.text, /not proof you got better or worse/); assert.doesNotMatch(lb.text, /improv/i);
  assert.match(lookBack([set(31, 50, 5), set(30, 50, 40)], NOW)!.text, /about the same/);
  assert.equal(lookBack([set(31, 50, 5), set(2, 5, 40)], NOW), null, "too few before");
  assert.equal(lookBack([set(31, 50, 5)], NOW), null);
});

// ---- benchmarks: Am I improving? and the one thing to focus on ----
const shots = (makes: number, a: number): ShotRow[] => Array.from({ length: a }, (_, i) => ({ made: i < makes, source: "camera", detected_made: i < makes, added_by_hand: false }));
function bm(drill: string, variant: string, makes: number, attempts: number, week: number, daysAgo: number, block: Partial<BenchmarkBlock> & { protocol: string }): ProgressRow {
  n += 1;
  return { logId: `l${n}`, workoutSessionId: `w${n}`, at: ago(daysAgo), week, day: 4, drillName: drill, status: "completed", metrics: buildTrackedMetrics({ drill: { name: drill }, variant, goal: null, shots: shots(makes, attempts), shotSessionId: `ss${n}`, benchmark: { conditions: null, conditions_complete: true, clock_complete: null, redo: 0, ...block } }) };
}
const ft = (m: number, w: number, d: number) => bm("Free Throw Reset", "Benchmark v1", m, 30, w, d, { protocol: "free_throw@v1" });
const lessonFor = (name: string) => (name === "Free Throw Reset" ? { title: "Free Throw Routine", watched: false, url: null, href: "/players/p/film?lesson=l1" } : null);

test("Am I improving? Yes only when a test clearly moved; otherwise it says what it can and cannot tell", () => {
  assert.equal(improvementAnswer(standings([])).tone, "new");
  const first = improvementAnswer(standings([ft(18, 1, 5)]));
  assert.equal(first.tone, "wait"); assert.match(first.detail, /again in about two weeks/);
  assert.equal(improvementAnswer(standings([ft(18, 1, 40), ft(19, 3, 20)])).tone, "none");
  const yes = improvementAnswer(standings([ft(9, 1, 40), ft(26, 3, 20)]));
  assert.equal(yes.tone, "yes"); assert.match(yes.headline, /Yes, on your free throw benchmark/); assert.match(yes.detail, /30% to 87%/); assert.match(yes.detail, /practice, not a game/); assert.equal(yes.benchmark, "free_throw");
  const maybe = improvementAnswer(standings([ft(15, 1, 40), ft(23, 3, 20)]));
  assert.equal(maybe.tone, "maybe"); assert.match(maybe.headline, /Maybe/); assert.match(maybe.detail, /not certain/); assert.doesNotMatch(maybe.detail, /real change/);
  const dip = improvementAnswer(standings([ft(26, 1, 40), ft(10, 3, 20)]));
  assert.equal(dip.tone, "dip"); assert.match(dip.detail, /87% to 33%/);
});

test("more shots never counts as improving: shooting volume does not feed the answer", () => {
  const rows = [ft(18, 1, 40)];
  const many = improvementAnswer(standings(rows));
  assert.equal(many.tone, "wait");
  for (const k of ["yes", "maybe"]) assert.notEqual(many.tone, k);
});

test("one focus, from what exists: a clear dip first (with its lesson), else the next benchmark, else the next lesson, else nothing", () => {
  const dipList = standings([ft(26, 1, 40), ft(10, 3, 20)]);
  const f = pickFocus({ list: dipList, next: null, nextFilm: { id: "f1", title: "Some lesson" }, playerId: "p", lessonFor })!;
  assert.equal(f.kind, "dip"); assert.equal(f.lesson?.title, "Free Throw Routine"); assert.match(f.body, /87% to 33%/); assert.equal(f.evidenceHref, "/players/p/progress?view=benchmarks&benchmark=free_throw&range=all");
  const next = { label: "Run the Catch-and-Shoot Benchmark", why: "You have not run it yet.", href: "/players/p/workouts", lesson: { title: "Playing Without the Ball", watched: false, url: null, href: "/x" } };
  const b = pickFocus({ list: standings([ft(18, 1, 5)]), next, nextFilm: null, playerId: "p", lessonFor })!;
  assert.equal(b.kind, "benchmark"); assert.equal(b.title, "Catch-and-Shoot Benchmark"); assert.equal(b.lesson?.title, "Playing Without the Ball");
  const keep = { label: "Keep going with your plan", why: "Up to date.", href: "/w", lesson: null };
  const film = pickFocus({ list: [], next: keep, nextFilm: { id: "f1", title: "Some lesson" }, playerId: "p", lessonFor })!;
  assert.equal(film.kind, "film"); assert.equal(film.href, "/players/p/film?lesson=f1");
  assert.equal(pickFocus({ list: [], next: keep, nextFilm: null, playerId: "p", lessonFor }), null, "nothing to say means no card, not an invented one");
  for (const x of [f, b, film]) assert.doesNotMatch(`${x.title} ${x.body}`, /elbow|wrist|follow-through|fix your|change your/i, "never a mechanical fix");
});

test("recent: workouts and free sets together, newest first; a drill's own set is not listed twice; where it was counted is said", () => {
  const sets = [set(7, 10, 0, { id: "free1", label: "Free throws", source: "manual" }), set(20, 30, 1, { id: "linked", label: "Free Throw Reset" }), set(6, 12, 4, { id: "free2", label: null })];
  const tracked = [ft(22, 1, 1)];
  tracked[0].workoutSessionId = "wk1";
  const items = recentItems({
    playerId: "p", now: NOW, fromHref: "/players/p?range=4w",
    workouts: [{ id: "wk1", workout_id: "wid", completed_at: ago(1) }, { id: "wk2", workout_id: "other", completed_at: ago(9) }, { id: "wk3", workout_id: null, completed_at: null }],
    workoutNames: new Map([["wid", "Shot Builder"]]), sets, linkedSetIds: new Set(["linked"]), tracked,
  });
  assert.deepEqual(items.map((i) => i.id), ["s-free1", "w-wk1", "s-free2", "w-wk2"]);
  assert.equal(items[0].how, "Counted by taps"); assert.equal(items[0].detail, "7 of 10 · 70%"); assert.equal(items[0].when, "Today");
  assert.equal(items[1].title, "Shot Builder"); assert.equal(items[1].detail, "22 of 30 shots counted in its drills"); assert.equal(items[1].href, "/players/p/sessions/wk1");
  assert.equal(items[2].title, "Shooting"); assert.equal(items[2].how, "Camera"); assert.match(items[2].href, /^\/players\/p\/shooting\/free2\?from=/);
  assert.match(items[0].href, /^\/players\/p\/shooting\/free1\?from=%2Fplayers%2Fp%3Frange%3D4w$/);
  assert.equal(items[3].title, "Workout"); assert.equal(items[3].detail, "Workout finished");
  assert.equal(recentItems({ playerId: "p", now: NOW, fromHref: "/players/p", workouts: [], workoutNames: new Map(), sets: [], linkedSetIds: new Set(), tracked: [] }).length, 0);
});

test("when: today, yesterday, days, then a date", () => {
  assert.equal(whenLabel(new Date(2026, 9, 21, 8), NOW), "Today"); assert.equal(whenLabel(new Date(2026, 9, 20, 23), NOW), "Yesterday");
  assert.equal(whenLabel(new Date(2026, 9, 16), NOW), "5 days ago"); assert.match(whenLabel(new Date(2026, 8, 1), NOW), /Sep/);
});

test("the welcome speaks to the player, says where the week stands, and never nags a new player", () => {
  const act = (...d: number[]) => thisWeek(toActivities({ workout: d.map((x) => ago(x)) }), NOW);
  assert.equal(firstName("Jake Smith"), "Jake"); assert.equal(firstName("  "), "there");
  const fresh = greeting({ name: "Jake W.", now: NOW, week: act(), streakWeeks: 0, everActive: false });
  assert.equal(fresh.title, "Good afternoon, Jake"); assert.match(fresh.line, /first workout/);
  assert.match(greeting({ name: "Jake", now: NOW, week: act(), streakWeeks: 3, everActive: true }).line, /3-week streak/);
  assert.match(greeting({ name: "Jake", now: NOW, week: act(1), streakWeeks: 1, everActive: true }).line, /1 of 3 days done this week\. Today makes 2/);
  assert.match(greeting({ name: "Jake", now: NOW, week: act(0), streakWeeks: 1, everActive: true }).line, /Nice work today/);
  assert.match(greeting({ name: "Jake", now: NOW, week: act(0, 1, 2), streakWeeks: 1, everActive: true }).line, /weekly target/);
  assert.equal(greeting({ name: "Jake", now: new Date(2026, 9, 21, 8), week: act(), streakWeeks: 0, everActive: true }).title, "Good morning, Jake");
  assert.equal(greeting({ name: "Jake", now: new Date(2026, 9, 21, 20), week: act(), streakWeeks: 0, everActive: true }).line, "Ready when you are.");
});

test("a thin range is flagged by the same threshold everywhere", () => {
  assert.equal(MIN_SHOTS_TO_READ, 10);
});
