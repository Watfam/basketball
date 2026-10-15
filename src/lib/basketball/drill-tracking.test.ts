import test from "node:test";
import assert from "node:assert/strict";
import { adjustTracked, buildTrackedMetrics, describeHow, mergeDrillLog, parseTracked, summarizeShots, type LogRow, type ShotRow } from "./drill-tracking.ts";
import { adjustTrackedDrill, saveDrillLog, saveTrackedDrill, type DrillStore } from "./drill-log-store.ts";
import { hasRealWork, isSkippedLog } from "./session-logs.ts";

const cam = (made: boolean, detected: boolean | null = made, byHand = false): ShotRow => ({ made, source: "camera", detected_made: detected, added_by_hand: byHand });
const tap = (made: boolean): ShotRow => ({ made, source: "manual", detected_made: null, added_by_hand: false });

test("a set is summarised as what the camera called, what the player changed, and what was added", () => {
  const s = summarizeShots([cam(true), cam(true, false), cam(false, true), cam(false), cam(true, null, true)]);
  assert.deepEqual([s.attempts, s.makes, s.camera_attempts, s.camera_makes, s.flipped, s.added_by_hand, s.source], [5, 3, 4, 2, 2, 1, "mixed"]);
  assert.equal(summarizeShots([cam(true), cam(false)]).source, "camera"); assert.equal(summarizeShots([tap(true), tap(false)]).source, "taps");
  assert.deepEqual(summarizeShots([]), { attempts: 0, makes: 0, camera_attempts: 0, camera_makes: 0, flipped: 0, added_by_hand: 0, source: "taps" });
});

test("metrics carry the drill's own category (labelled as from the drill), the target, the pointer to the shot set, and no claim beyond counting", () => {
  const m = buildTrackedMetrics({ drill: { name: "Elbow Pull-Up", skill_tags: ["shooting", "ball_handling"] }, variant: "Right side", goal: { kind: "shots", target: 30 }, shots: [cam(true), cam(false)], shotSessionId: "ss1", ruleVersion: "v4", modelVersion: "ball-6" });
  assert.equal(m.type, "shooting"); assert.equal(m.category, "off_the_dribble"); assert.equal(m.category_basis, "drill_definition");
  assert.deepEqual([m.makes, m.attempts, m.target, m.tracking.shot_session_id], [1, 2, { kind: "shots", value: 30 }, "ss1"]);
  const text = JSON.stringify(m); assert.ok(!/footwork|defender|game.?speed|decision/.test(text), "no unverified measurement is written");
  assert.deepEqual(parseTracked(JSON.parse(JSON.stringify(m))), m);
});

test("anything that is not a well-formed tracked result parses to null, never throws", () => {
  for (const bad of [null, undefined, 5, "x", {}, { type: "reps" }, { type: "shooting" }, { type: "shooting", makes: 3, attempts: 2, tracking: { v: 1, shot_session_id: "a", source: "camera" } }, { type: "shooting", makes: 1, attempts: 2, tracking: { v: 2, shot_session_id: "a", source: "camera" } }, { type: "shooting", makes: 1, attempts: 2, tracking: { v: 1, shot_session_id: "", source: "camera" } }, { type: "shooting", makes: 1.5, attempts: 2, tracking: { v: 1, shot_session_id: "a", source: "camera" } }, { type: "shooting", makes: 1, attempts: 2, tracking: { v: 1, shot_session_id: "a", source: "robot" } }]) assert.equal(parseTracked(bad), null);
  assert.ok(!isSkippedLog(buildTrackedMetrics({ drill: { name: "Elbow Pull-Up" }, variant: null, goal: null, shots: [cam(true)], shotSessionId: "s" })), "a tracked drill counts as work");
  assert.ok(hasRealWork([{ metrics: buildTrackedMetrics({ drill: { name: "Elbow Pull-Up" }, variant: null, goal: null, shots: [cam(true)], shotSessionId: "s" }) }]));
});

test("how a result was counted is said plainly: camera, taps, changes, additions, later adjustment", () => {
  const base = buildTrackedMetrics({ drill: { name: "Elbow Pull-Up" }, variant: null, goal: null, shots: [cam(true), cam(false, true), cam(true, null, true)], shotSessionId: "s" });
  assert.equal(describeHow(base.tracking), "Counted by the camera and your taps; 1 call you changed and 1 shot you added.");
  assert.equal(describeHow(buildTrackedMetrics({ drill: { name: "Free Throw Reset" }, variant: null, goal: null, shots: [tap(true)], shotSessionId: "s" }).tracking), "Counted by your taps.");
  const adj = adjustTracked(base, 1, 3); assert.ok(!("error" in adj)); assert.match(describeHow((adj as typeof base).tracking), /totals changed by you afterwards \(first saved 2 of 3\)/);
  assert.doesNotMatch(describeHow(base.tracking), /verified|confirmed by the camera|detected your/i);
});

const row = (id: string, metrics: unknown, at = "2026-10-16T10:00:00Z"): LogRow => ({ id, metrics, created_at: at });
const T = (ss: string, makes = 6, attempts = 10) => buildTrackedMetrics({ drill: { name: "Elbow Pull-Up" }, variant: "Right side", goal: null, shots: Array.from({ length: attempts }, (_, i) => cam(i < makes)), shotSessionId: ss }) as unknown as Record<string, unknown>;
const PLAIN = { type: "reps", variant: "Right side", actual_sets: 3 }, SKIP = { skipped: true, variant: "Right side" };

test("merge rules: one row per entry; a plain done never overwrites a tracked result; a skip never overwrites work; a tracked result replaces a skip", () => {
  assert.equal(mergeDrillLog([], { kind: "tracked", metrics: T("a") }).action, "insert");
  const t = mergeDrillLog([row("1", PLAIN)], { kind: "tracked", metrics: T("a") }); assert.deepEqual([t.action, (t as { targetId: string }).targetId], ["update", "1"]);
  assert.equal(mergeDrillLog([row("1", SKIP)], { kind: "tracked", metrics: T("a") }).action, "update");
  const keep = mergeDrillLog([row("1", T("a"))], { kind: "plain", metrics: PLAIN }); assert.equal(keep.action, "keep"); assert.equal((keep as { reason: string }).reason, "has_tracked_result");
  assert.equal(mergeDrillLog([row("1", PLAIN)], { kind: "skip", metrics: SKIP }).action, "keep");
  assert.equal(mergeDrillLog([row("1", T("a"))], { kind: "skip", metrics: SKIP }).action, "keep");
  assert.equal(mergeDrillLog([row("1", SKIP)], { kind: "plain", metrics: PLAIN }).action, "update", "doing a skipped drill replaces the skip");
  const dups = mergeDrillLog([row("1", PLAIN, "2026-10-16T10:00:00Z"), row("2", PLAIN, "2026-10-16T10:05:00Z"), row("3", T("a"), "2026-10-16T10:01:00Z")], { kind: "plain", metrics: PLAIN });
  assert.deepEqual([dups.action, (dups as { targetId: string }).targetId, [...dups.deleteIds].sort()], ["keep", "3", ["1", "2"]], "older duplicates are cleaned up and the tracked row is the anchor");
});

test("saving the same shot set again changes nothing, and a later adjustment by the player survives it", () => {
  const first = T("a"); const adj = adjustTracked(parseTracked(first)!, 8, 10) as ReturnType<typeof parseTracked> & object;
  const plan = mergeDrillLog([row("1", adj)], { kind: "tracked", metrics: T("a") });
  assert.equal(plan.action, "update"); const m = parseTracked((plan as { metrics: unknown }).metrics)!; assert.deepEqual([m.makes, m.attempts], [8, 10]); assert.deepEqual(m.tracking.adjusted, { original: { makes: 6, attempts: 10 } });
  const retrack = mergeDrillLog([row("1", adj)], { kind: "tracked", metrics: T("b", 4, 10) }); const r = parseTracked((retrack as { metrics: unknown }).metrics)!;
  assert.deepEqual([r.makes, r.tracking.shot_session_id, r.tracking.adjusted], [4, "b", null], "a NEW shot set is a new result");
});

test("adjusting totals: whole numbers, makes within attempts, the first saved numbers kept, undone when put back", () => {
  const t = parseTracked(T("a", 6, 10))!;
  assert.ok("error" in adjustTracked(t, 11, 10)); assert.ok("error" in adjustTracked(t, -1, 10)); assert.ok("error" in adjustTracked(t, 1.5, 10)); assert.ok("error" in adjustTracked(t, 1, 5000));
  const a = adjustTracked(t, 7, 10) as typeof t; const b = adjustTracked(a, 5, 9) as typeof t;
  assert.deepEqual(b.tracking.adjusted, { original: { makes: 6, attempts: 10 } }, "the original stays the first saved numbers");
  assert.equal((adjustTracked(b, 6, 10) as typeof t).tracking.adjusted, null, "putting the numbers back clears the flag");
});

// ---- the store, in memory, with async gaps so interleavings are real ----------------------------------------------------------------------
function memory(over: { ws?: Partial<{ player_id: string; status: string; workout_id: string | null }>; shots?: ShotRow[]; shotOwner?: string | null; deleted?: string | null; drill?: string; skill?: string[] } = {}) {
  let n = 0; const rows = new Map<string, LogRow & { session_id: string; entry: string | null }>();
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const store: DrillStore & { rows: typeof rows } = {
    rows,
    async workoutSession(id) { await tick(); return id === "w1" ? { id, player_id: "p1", workout_id: "wk", status: "in_progress", ...over.ws } : null; },
    async entry(id) { await tick(); return id === "e1" ? { id, workout_id: "wk", drill_id: "d1", variant_label: "Right side", drill: { name: over.drill ?? "Elbow Pull-Up", skill_tags: over.skill ?? ["shooting", "ball_handling"] } } : null; },
    async shotSession(id) { await tick(); return id.startsWith("ss") ? { id, player_id: over.shotOwner === undefined ? "p1" : over.shotOwner, ended_at: "x", deleted_at: over.deleted ?? null, rule_version: "v4", model_version: "ball-6" } : null; },
    async shots() { await tick(); return over.shots ?? Array.from({ length: 10 }, (_, i) => cam(i < 6)); },
    async logs(s, e) { await tick(); return [...rows.values()].filter((r) => r.session_id === s && r.entry === e).map((r) => ({ id: r.id, metrics: r.metrics, created_at: r.created_at })); },
    async insertLog(r) { await tick(); const id = `L${++n}`; rows.set(id, { id, metrics: r.metrics, created_at: `2026-10-16T10:00:0${n}Z`, session_id: r.session_id, entry: r.workout_drill_id }); return id; },
    async updateLog(id, m) { await tick(); const r = rows.get(id); if (r) r.metrics = m; },
    async deleteLogs(ids) { await tick(); for (const i of ids) rows.delete(i); },
  };
  return store;
}
const input = { playerId: "p1", workoutSessionId: "w1", workoutDrillId: "e1", shotSessionId: "ss1", goal: { kind: "shots" as const, target: 30 } };

test("saving a tracked drill writes ONE log row with the shot set pointer; saving again, or resuming and saving, never adds a second", async () => {
  const s = memory(); const a = await saveTrackedDrill(s, input); assert.ok(a.ok && a.action === "insert");
  for (let i = 0; i < 3; i += 1) { const r = await saveTrackedDrill(s, input); assert.ok(r.ok && r.action === "update"); }
  assert.equal(s.rows.size, 1); const m = parseTracked([...s.rows.values()][0].metrics)!; assert.deepEqual([m.makes, m.attempts, m.tracking.shot_session_id, m.category], [6, 10, "ss1", "off_the_dribble"]);
});

test("two saves racing each other still end with one row", async () => {
  const s = memory(); await Promise.all([saveTrackedDrill(s, input), saveTrackedDrill(s, input), saveTrackedDrill(s, input)]);
  assert.equal(s.rows.size, 1, `rows: ${s.rows.size}`);
});

test("the workout player's own saves are one row per entry, never overwrite a tracked result, and skip-then-do replaces the skip", async () => {
  const s = memory();
  await saveDrillLog(s, { sessionId: "w1", drillId: "d1", workoutDrillId: "e1", metrics: SKIP }); assert.equal(s.rows.size, 1);
  const done = await saveDrillLog(s, { sessionId: "w1", drillId: "d1", workoutDrillId: "e1", metrics: PLAIN }); assert.equal(done.action, "update"); assert.equal(s.rows.size, 1); assert.ok(!isSkippedLog([...s.rows.values()][0].metrics));
  await saveDrillLog(s, { sessionId: "w1", drillId: "d1", workoutDrillId: "e1", metrics: PLAIN }); assert.equal(s.rows.size, 1, "tapping done twice is one row");
  await saveTrackedDrill(s, input); assert.ok(parseTracked([...s.rows.values()][0].metrics), "a tracked result replaces the plain one");
  const after = await saveDrillLog(s, { sessionId: "w1", drillId: "d1", workoutDrillId: "e1", metrics: PLAIN }); assert.deepEqual([after.action, after.reason], ["keep", "has_tracked_result"]);
  assert.ok(parseTracked([...s.rows.values()][0].metrics), "still the tracked result");
  await saveDrillLog(s, { sessionId: "w1", drillId: "d1", workoutDrillId: "e1", metrics: SKIP }); assert.ok(parseTracked([...s.rows.values()][0].metrics), "a skip never erases work");
  const legacy = memory(); await saveDrillLog(legacy, { sessionId: "w1", drillId: "d1", metrics: PLAIN }); await saveDrillLog(legacy, { sessionId: "w1", drillId: "d1", metrics: PLAIN }); assert.equal(legacy.rows.size, 2, "an entry-less (legacy) log is written as before");
});

test("re-tracking the drill with a new shot set replaces the result; older stacked duplicates are cleaned up", async () => {
  const s = memory(); s.rows.set("dupA", { id: "dupA", metrics: PLAIN, created_at: "2026-10-16T09:00:00Z", session_id: "w1", entry: "e1" }); s.rows.set("dupB", { id: "dupB", metrics: PLAIN, created_at: "2026-10-16T09:01:00Z", session_id: "w1", entry: "e1" });
  await saveTrackedDrill(s, input); assert.equal(s.rows.size, 1);
  await saveTrackedDrill(s, { ...input, shotSessionId: "ss2" }); assert.equal(s.rows.size, 1); assert.equal(parseTracked([...s.rows.values()][0].metrics)!.tracking.shot_session_id, "ss2");
});

test("it refuses, with a plain reason and no write, when it should", async () => {
  const cases: [string, ReturnType<typeof memory>, Partial<typeof input>, string][] = [
    ["another player's workout", memory({ ws: { player_id: "p2" } }), {}, "no_workout"], ["a missing workout", memory(), { workoutSessionId: "gone" }, "no_workout"],
    ["a finished workout", memory({ ws: { status: "completed" } }), {}, "closed"], ["an entry from another workout", memory(), { workoutDrillId: "other" }, "no_entry"],
    ["a drill that is not about makes", memory({ drill: "One-Hand Form Shooting", skill: ["shooting"] }), {}, "not_trackable"], ["a ball-handling drill", memory({ drill: "Pound Dribble Series", skill: ["ball_handling"] }), {}, "not_trackable"],
    ["another player's shot set", memory({ shotOwner: "p2" }), {}, "no_shots"], ["a deleted shot set", memory({ deleted: "2026-10-16" }), {}, "no_shots"], ["a set with no shots", memory({ shots: [] }), {}, "no_shots"],
    ["a missing shot set", memory(), { shotSessionId: "nope" }, "no_shots"], ["missing ids", memory(), { workoutDrillId: "" }, "bad_input"],
  ];
  for (const [name, s, over, code] of cases) { const r = await saveTrackedDrill(s, { ...input, ...over }); assert.ok(!r.ok && r.code === code, `${name}: ${JSON.stringify(r)}`); assert.equal(s.rows.size, 0, `${name}: nothing written`); if (!r.ok) assert.ok(r.message.length > 15); }
});

test("manual corrections after saving: totals change, the first saved numbers stay visible, bad input and other players are refused", async () => {
  const s = memory(); await saveTrackedDrill(s, input);
  const ok = await adjustTrackedDrill(s, { playerId: "p1", workoutSessionId: "w1", workoutDrillId: "e1", makes: 8, attempts: 10 }); assert.ok(ok.ok);
  const t = parseTracked([...s.rows.values()][0].metrics)!; assert.deepEqual([t.makes, t.attempts, t.tracking.adjusted?.original], [8, 10, { makes: 6, attempts: 10 }]);
  const again = await saveTrackedDrill(s, input); assert.ok(again.ok); assert.equal(parseTracked([...s.rows.values()][0].metrics)!.makes, 8, "saving the same set again keeps the player's change");
  assert.ok(!(await adjustTrackedDrill(s, { playerId: "p1", workoutSessionId: "w1", workoutDrillId: "e1", makes: 11, attempts: 10 })).ok);
  assert.ok(!(await adjustTrackedDrill(s, { playerId: "p9", workoutSessionId: "w1", workoutDrillId: "e1", makes: 1, attempts: 2 })).ok);
  const none = memory(); const r = await adjustTrackedDrill(none, { playerId: "p1", workoutSessionId: "w1", workoutDrillId: "e1", makes: 1, attempts: 2 }); assert.ok(!r.ok && r.code === "no_result");
});

// ---- when the database also enforces one row per entry (the proposed unique index) -------------------------------------------------------
function uniqueEntries(s: ReturnType<typeof memory>) {
  const insert = s.insertLog;
  s.insertLog = async (r) => {
    if ([...s.rows.values()].some((x) => x.session_id === r.session_id && x.entry === r.workout_drill_id && r.workout_drill_id)) { await new Promise((q) => setTimeout(q, 0)); throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }); }
    return insert(r);
  };
  return s;
}

test("with a unique index, a lost insert race is not an error: the save merges with the row that got there first", async () => {
  const s = uniqueEntries(memory());
  const out = await Promise.all([saveTrackedDrill(s, input), saveTrackedDrill(s, input), saveTrackedDrill(s, { ...input, shotSessionId: "ss2" })]);
  assert.ok(out.every((r) => r.ok), "no save fails");
  assert.equal(s.rows.size, 1);
  assert.ok(parseTracked([...s.rows.values()][0].metrics), "the survivor is the tracked result");
});

test("with a unique index, a plain tap that loses the race to a tracked save keeps the tracked result and reports it", async () => {
  const s = uniqueEntries(memory());
  const [t, p] = await Promise.all([saveTrackedDrill(s, input), saveDrillLog(s, { sessionId: "w1", drillId: "d1", workoutDrillId: "e1", metrics: PLAIN })]);
  assert.ok(t.ok); assert.equal(s.rows.size, 1); assert.ok(parseTracked([...s.rows.values()][0].metrics));
  assert.ok(["insert", "keep"].includes(p.action));
});

test("any other insert failure still fails (only a unique violation is treated as a lost race)", async () => {
  const s = memory(); s.insertLog = async () => { throw Object.assign(new Error("permission denied"), { code: "42501" }); };
  await assert.rejects(saveTrackedDrill(s, input), /permission denied/);
});
