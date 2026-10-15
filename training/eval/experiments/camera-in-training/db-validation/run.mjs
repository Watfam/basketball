// Phase 11 / Priority 1: the camera-to-workout saving, run against a real Postgres loaded with this repo's schema, migrations, seeds and RLS.
//   PGTEST_MODULES=<dir>/node_modules node training/eval/experiments/camera-in-training/db-validation/run.mjs [--trials N]
// The app's real store code runs unchanged (supabase-js PostgREST client -> shim.mjs -> SQL as the signed-in user). The live project is never touched.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import { ROOT } from "../../../lib/registry.mjs";
import { boot } from "./db.mjs";
import { clientFor } from "./shim.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TRIALS = Number(process.argv[process.argv.indexOf("--trials") + 1]) || 40;
const OUT = path.join(ROOT, "training/work/p11");

// ---- transpile the app's own libraries (Node 20.9 cannot read TypeScript) ----
fs.rmSync(OUT, { recursive: true, force: true });
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f, acc) : f.endsWith(".ts") && !f.endsWith(".test.ts") && acc.push(f); } return acc; };
for (const f of walk(path.join(ROOT, "src/lib"))) {
  const rel = path.relative(ROOT, f), dest = path.join(OUT, rel.replace(/\.ts$/, ".mjs"));
  const js = ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"').replaceAll("import.meta.dirname", JSON.stringify(path.dirname(f)));
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, js);
}
const lib = (n) => import(path.join(OUT, "src/lib/basketball", n + ".mjs"));
const { supabaseDrillStore } = await lib("drill-store-supabase");
const { saveTrackedDrill, saveDrillLog, adjustTrackedDrill } = await lib("drill-log-store");
const { parseTracked } = await lib("drill-tracking");

// ---- tiny runner ----
const results = []; let failures = 0;
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`); };
const uuid = () => crypto.randomUUID();

const db = await boot({ log: console.log });
const A = db.admin;
const [U1, U2, U3] = [uuid(), uuid(), uuid()];
for (const [id, e] of [[U1, "owner1@test"], [U2, "owner2@test"], [U3, "kid-login@test"]]) await A.query("insert into auth.users (id, email) values ($1,$2)", [id, e]);
const H1 = (await A.query("insert into hoops.households (owner_id, name) values ($1,'H1') returning id", [U1])).rows[0].id;
const H2 = (await A.query("insert into hoops.households (owner_id, name) values ($1,'H2') returning id", [U2])).rows[0].id;
const P1 = (await A.query("insert into hoops.players (household_id, linked_user_id, display_name) values ($1,$2,'P1') returning id", [H1, U3])).rows[0].id;
const P2 = (await A.query("insert into hoops.players (household_id, display_name) values ($1,'P2') returning id", [H1])).rows[0].id;
const P3 = (await A.query("insert into hoops.players (household_id, display_name) values ($1,'P3') returning id", [H2])).rows[0].id;

const entry = async (workout, drill, variant) => (await A.query(`select wd.id from hoops.workout_drills wd join hoops.workouts w on w.id=wd.workout_id join hoops.drills d on d.id=wd.drill_id where w.name=$1 and d.name=$2 and wd.variant_label is not distinct from $3`, [workout, drill, variant])).rows[0].id;
const GS = "Shot Builder — Game Speed", FF = "Shot Builder — Form & Footwork";
const E = { cs: await entry(GS, "Catch-and-Shoot off the Pin-Down", "Right wing"), elR: await entry(GS, "Elbow Pull-Up", "Right side"), elL: await entry(GS, "Elbow Pull-Up", "Left side"), ft: await entry(GS, "Free Throw Reset", null), clock: await entry(GS, "Beat the Clock Finisher", "Three-point line"), form: await entry(FF, "One-Hand Form Shooting", "Shooting hand"), otherWorkout: await entry(FF, "Free Throw Reset", null) };
const wid = (await A.query("select id from hoops.workouts where name=$1", [GS])).rows[0].id;

const wid2 = (await A.query("select id from hoops.workouts where name=$1", [FF])).rows[0].id;
const newWorkout = async (player = P1, status = "in_progress", workout = wid) => (await A.query("insert into hoops.workout_sessions (player_id, workout_id, status, started_at) values ($1,$2,$3,now()) returning id", [player, workout, status])).rows[0].id;
// A shot set the way the hub syncs it: n shots, `flip` camera calls reversed by the player, `byHand` added by hand.
async function shotSet({ player = P1, n = 10, makes = 7, flip = 1, byHand = 1, label = "Drill" } = {}) {
  const id = (await A.query("insert into hoops.shot_sessions (player_id, label, source, started_at, ended_at, makes, attempts, rule_version, model_version) values ($1,$2,'camera',now(),now(),$3,$4,'v4','ball6') returning id", [player, label, makes, n])).rows[0].id;
  for (let i = 1; i <= n; i++) {
    const hand = i > n - byHand, made = i <= makes, detected = hand ? null : (i === 1 && flip ? !made : made);
    await A.query("insert into hoops.shots (session_id, player_id, seq, made, source, detected_made, added_by_hand) values ($1,$2,$3,$4,$5,$6,$7)", [id, player, i, made, hand ? "manual" : "camera", detected, hand]);
  }
  return id;
}
const rows = async (ws, en) => (await A.query("select id, metrics, created_at from hoops.session_logs where session_id=$1 and workout_drill_id=$2 order by created_at", [ws, en])).rows;
const storeFor = (u) => supabaseDrillStore(clientFor(db, u));
const track = (u, p, ws, en, ss, goal = null) => saveTrackedDrill(storeFor(u), { playerId: p, workoutSessionId: ws, workoutDrillId: en, shotSessionId: ss, goal });
const plain = (u, ws, en, metrics = { type: "reps", sets: 2, reps: 2 }) => saveDrillLog(storeFor(u), { sessionId: ws, drillId: DRILL.get(en), workoutDrillId: en, metrics });
const DRILL = new Map((await A.query("select id, drill_id from hoops.workout_drills")).rows.map((r) => [r.id, r.drill_id]));
const logsTotal = async () => Number((await A.query("select count(*) from hoops.session_logs")).rows[0].count);

console.log(`\nSchema applied: ${db.applied.length} files, all clean: ${!db.applied.some((x) => /FAILED/.test(x))}`);
check("repo schema, 14 migrations and 9 seeds load into real Postgres", db.applied.length === 24 && !db.applied.some((x) => /FAILED/.test(x)), `${db.applied.length} files`);
check("the seeded workout the tests use has the real drills", !!(E.cs && E.elR && E.ft && E.clock && E.form));

// ================= 1. ownership (Row Level Security + the code's own checks) =================
console.log("\n== 1. Authenticated player ownership ==");
{
  const ws = await newWorkout(P1), ss = await shotSet({ player: P1 });
  const before = await logsTotal();
  let r = await track(U2, P3, ws, E.cs, ss);
  check("another household (own player id) cannot attach to this workout", !r.ok && r.code === "no_workout", r.code);
  r = await track(U2, P1, ws, E.cs, ss);
  check("another household forging the player id sees nothing (RLS) and is refused", !r.ok && r.code === "no_workout", r.code);
  r = await track(null, P1, ws, E.cs, ss);
  check("an unauthenticated caller is refused", !r.ok && r.code === "no_workout", r.code);
  r = await track(U1, P2, ws, E.cs, ss);
  check("same household but the wrong player in the request is refused", !r.ok && r.code === "no_workout", r.code);
  const ssOther = await shotSet({ player: P2 });
  r = await track(U1, P1, ws, E.cs, ssOther);
  check("a sibling's shot set cannot be attached to this player's drill", !r.ok && r.code === "no_shots", r.code);
  const ssOtherHouse = await shotSet({ player: P3 });
  r = await track(U1, P1, ws, E.cs, ssOtherHouse);
  check("another household's shot set cannot be attached (invisible to RLS)", !r.ok && r.code === "no_shots", r.code);
  check("none of the refusals wrote anything", (await logsTotal()) === before);
  // raw SQL: the policies themselves, independent of the code's checks
  const raw = async (u, sql, args = []) => { try { const c = await db.connect(); try { await c.query("begin"); await c.query(`set local role ${u ? "authenticated" : "anon"}`); await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(u ? { sub: u, role: "authenticated" } : { role: "anon" })]); const x = await c.query(sql, args); await c.query("commit"); return { n: x.rowCount, rows: x.rows }; } catch (e) { await c.query("rollback").catch(() => {}); return { err: e.code, msg: e.message }; } finally { await c.end(); } } catch (e) { return { err: "conn", msg: e.message }; } };
  const ins = await raw(U2, "insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,$3,'{}')", [ws, DRILL.get(E.cs), E.cs]);
  check("RLS: another household cannot insert a log into this workout", ins.err === "42501", ins.err);
  const anonIns = await raw(null, "insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,$3,'{}')", [ws, DRILL.get(E.cs), E.cs]);
  check("RLS: anonymous cannot insert a log", anonIns.err === "42501" || anonIns.err === "42501" || /permission denied/.test(anonIns.msg ?? ""), anonIns.err ?? "");
  await A.query("insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,$3,'{\"type\":\"reps\"}')", [ws, DRILL.get(E.cs), E.cs]);
  const upd = await raw(U2, "update hoops.session_logs set metrics='{}' where session_id=$1", [ws]);
  const del = await raw(U2, "delete from hoops.session_logs where session_id=$1", [ws]);
  const sel = await raw(U2, "select * from hoops.session_logs where session_id=$1", [ws]);
  check("RLS: another household cannot read, change or delete this workout's logs", upd.n === 0 && del.n === 0 && sel.n === 0, `${sel.n}/${upd.n}/${del.n} rows`);
  await A.query("delete from hoops.session_logs where session_id=$1", [ws]);
  r = await track(U1, P1, ws, E.cs, ss);
  check("the owner saves to their own player's workout", r.ok, r.ok ? r.action : r.code);
  check("saved result has the right shape and counts", (() => { const m = parseTracked(r.metrics); return m && m.makes === 7 && m.attempts === 10 && m.tracking.flipped === 1 && m.tracking.added_by_hand === 1 && m.category === "catch_and_shoot"; })());
  // Existing behaviour, not caused by this feature: a player's own linked login cannot read the household row the policies join through.
  const linkedRead = await raw(U3, "select id from hoops.workout_sessions where id=$1", [ws]);
  check("a player's separate linked login cannot reach the workout at all (existing RLS: households is owner-only), so cannot save to it either", linkedRead.n === 0 && (await track(U3, P1, ws, E.cs, ss)).code === "no_workout", `${linkedRead.n} rows`);
}

// ================= 2. duplicate saves / resume =================
console.log("\n== 2. Duplicate saves and resume ==");
{
  const ws = await newWorkout(), ss = await shotSet({ n: 10, makes: 7 });
  const r1 = await track(U1, P1, ws, E.elR, ss), r2 = await track(U1, P1, ws, E.elR, ss), r3 = await track(U1, P1, ws, E.elR, ss);
  const rs = await rows(ws, E.elR);
  check("the same set saved three times leaves exactly one row", rs.length === 1 && r1.ok && r2.ok && r3.ok, `${rs.length} row(s); actions ${r1.action}/${r2.action}/${r3.action}`);
  // the hub resumes after a restart and the set grows before it is saved again
  await A.query("update hoops.shot_sessions set attempts=12, makes=9 where id=$1", [ss]);
  for (const [seq, made] of [[11, true], [12, true]]) await A.query("insert into hoops.shots (session_id, player_id, seq, made, source, detected_made, added_by_hand) values ($1,$2,$3,$4,'camera',$4,false)", [ss, P1, seq, made]);
  const r4 = await track(U1, P1, ws, E.elR, ss);
  const m4 = parseTracked((await rows(ws, E.elR))[0].metrics);
  check("resume then save again updates the one row to the new totals", (await rows(ws, E.elR)).length === 1 && m4.attempts === 12 && m4.makes === 9, `${m4.makes}/${m4.attempts}`);
  const ws2 = await newWorkout(); const empty = (await A.query("insert into hoops.shot_sessions (player_id, label, source, started_at, ended_at) values ($1,'x','camera',now(),now()) returning id", [P1])).rows[0].id;
  const r5 = await track(U1, P1, ws2, E.elR, empty);
  check("a set with no shots is refused and writes nothing", !r5.ok && r5.code === "no_shots" && (await rows(ws2, E.elR)).length === 0);
  await A.query("update hoops.shot_sessions set deleted_at=now() where id=$1", [ss]);
  const ws3 = await newWorkout(); const r6 = await track(U1, P1, ws3, E.elR, ss);
  check("a set deleted before it attached is refused", !r6.ok && r6.code === "no_shots");
  const wsDone = await newWorkout(P1, "completed"); const ss2 = await shotSet();
  const r7 = await track(U1, P1, wsDone, E.cs, ss2);
  check("a finished workout is not changed by a late save", !r7.ok && r7.code === "closed" && (await rows(wsDone, E.cs)).length === 0);
  const r8 = await track(U1, P1, await newWorkout(), E.otherWorkout, ss2);
  check("a drill from a different workout is refused", !r8.ok && r8.code === "no_entry", r8.code);
  const r9 = await track(U1, P1, await newWorkout(P1, "in_progress", wid2), E.form, ss2);
  check("a form drill (not trackable) is refused", !r9.ok && r9.code === "not_trackable", r9.code);
}

// ================= 3. manual corrections =================
console.log("\n== 3. Manual corrections ==");
{
  const ws = await newWorkout(), ss = await shotSet({ n: 10, makes: 7 });
  await track(U1, P1, ws, E.cs, ss);
  const adj = (u, p, mk, at) => adjustTrackedDrill(storeFor(u), { playerId: p, workoutSessionId: ws, workoutDrillId: E.cs, makes: mk, attempts: at });
  let r = await adj(U1, P1, 8, 10);
  let m = parseTracked((await rows(ws, E.cs))[0].metrics);
  check("fixing the numbers changes the result and keeps the first saved numbers", r.ok && m.makes === 8 && m.tracking.adjusted?.original.makes === 7 && m.tracking.adjusted?.original.attempts === 10);
  await track(U1, P1, ws, E.cs, ss);
  m = parseTracked((await rows(ws, E.cs))[0].metrics);
  check("saving the same set again does not undo the player's correction", m.makes === 8 && !!m.tracking.adjusted);
  r = await adj(U1, P1, 7, 10);
  m = parseTracked((await rows(ws, E.cs))[0].metrics);
  check("putting the original numbers back clears the 'changed' note", m.makes === 7 && m.tracking.adjusted === null);
  check("makes above attempts is refused", !(await adj(U1, P1, 11, 10)).ok);
  check("a fraction is refused", !(await adj(U1, P1, 7.5, 10)).ok);
  check("another household cannot correct it", (await adj(U2, P3, 1, 10)).code === "no_workout" && parseTracked((await rows(ws, E.cs))[0].metrics).makes === 7);
  check("correcting a drill with no tracked result is refused", (await adjustTrackedDrill(storeFor(U1), { playerId: P1, workoutSessionId: ws, workoutDrillId: E.elL, makes: 1, attempts: 2 })).code === "no_result");
  await A.query("update hoops.workout_sessions set status='completed' where id=$1", [ws]);
  r = await adj(U1, P1, 6, 10);
  check("a correction after the workout is finished is allowed (review later)", r.ok && parseTracked((await rows(ws, E.cs))[0].metrics).makes === 6);
}

// ================= 4. repeated attempts, plain taps, skips =================
console.log("\n== 4. Repeated attempts and the workout player's own taps ==");
{
  const ws = await newWorkout(), s1 = await shotSet({ n: 10, makes: 5 }), s2 = await shotSet({ n: 8, makes: 7 });
  await track(U1, P1, ws, E.ft, s1);
  await track(U1, P1, ws, E.ft, s2);
  const rs = await rows(ws, E.ft), m = parseTracked(rs[0].metrics);
  check("tracking the same drill again replaces the result with the new set (one row)", rs.length === 1 && m.tracking.shot_session_id === s2 && m.attempts === 8);
  const stillThere = Number((await A.query("select count(*) from hoops.shots where session_id=$1", [s1])).rows[0].count);
  check("the earlier shot set and its shots are untouched in shooting history", stillThere === 10);
  const p = await plain(U1, ws, E.ft);
  check("a plain 'done' tap afterwards keeps the tracked result", p.action === "keep" && (await rows(ws, E.ft)).length === 1 && !!parseTracked((await rows(ws, E.ft))[0].metrics));
  const sk = await plain(U1, ws, E.ft, { skipped: true });
  check("a skip afterwards does not erase the tracked work", sk.action === "keep" && !!parseTracked((await rows(ws, E.ft))[0].metrics));
  // skipped first, then tracked
  const ws2 = await newWorkout(); await plain(U1, ws2, E.elL, { skipped: true });
  await track(U1, P1, ws2, E.elL, await shotSet());
  const r2 = await rows(ws2, E.elL);
  check("a drill skipped then tracked ends as one tracked result", r2.length === 1 && !!parseTracked(r2[0].metrics));
  // double-tap on 'done' with no camera
  const ws3 = await newWorkout(); await plain(U1, ws3, E.elR); await plain(U1, ws3, E.elR);
  check("a double-tapped 'done' (no camera) is one row", (await rows(ws3, E.elR)).length === 1);
}

// ================= 5. camera-free workouts and old data are untouched =================
console.log("\n== 5. Compatibility with workouts done without the camera ==");
{
  const ws = await newWorkout();
  await A.query("insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,null,'{\"type\":\"reps\",\"sets\":4}')", [ws, DRILL.get(E.cs)]);
  await A.query("insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,$3,'{\"type\":\"reps\",\"sets\":4,\"reps\":10}')", [ws, DRILL.get(E.elR), E.elR]);
  const before = (await A.query("select id, metrics from hoops.session_logs where session_id=$1 order by id", [ws])).rows;
  await track(U1, P1, ws, E.cs, await shotSet());
  const after = (await A.query("select id, metrics from hoops.session_logs where session_id=$1 and workout_drill_id is distinct from $2 order by id", [ws, E.cs])).rows;
  check("a legacy log with no entry id and another entry's plain log are left exactly as they were", JSON.stringify(before.filter((x) => !x.metrics.reps || x.metrics.reps === 10)) === JSON.stringify(after) || before.every((b) => after.some((a) => JSON.stringify(a) === JSON.stringify(b))));
  await plain(U1, ws, E.elL);
  check("an ordinary camera-free workout saves exactly as before (one plain row, no tracking block)", (await rows(ws, E.elL)).length === 1 && !(await rows(ws, E.elL))[0].metrics.tracking);
  check("parseTracked ignores every legacy shape", before.every((b) => parseTracked(b.metrics) === null));
}

fs.writeFileSync(path.join(HERE, "results-part1.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));

// ================= 6. races =================
console.log(`\n== 6. Concurrent saves, no unique constraint (${TRIALS} trials per mix, real parallel connections) ==`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function race(name, mk, { withIndex = false } = {}) {
  let multiAfter = 0, zeroAfter = 0, threw = 0, wrongKind = 0, dupSeen = 0, maxRows = 0;
  const detail = [];
  for (let i = 0; i < TRIALS; i++) {
    const ws = await newWorkout(); const en = [E.cs, E.elR, E.elL, E.ft][i % 4];
    const jobs = await mk(ws, en, i);
    // watcher: how many rows could a reader of the workout page see, and for how long
    let stop = false, seenMax = 0, dupMs = 0, last = Date.now();
    const watcher = (async () => { while (!stop) { const n = (await rows(ws, en)).length; const now = Date.now(); if (n > 1) dupMs += now - last; seenMax = Math.max(seenMax, n); last = now; await sleep(1); } })();
    const out = await Promise.allSettled(jobs.map(async (j, k) => { await sleep(j.delay ?? (k * (i % 6))); return j.run(); }));
    stop = true; await watcher;
    threw += out.filter((o) => o.status === "rejected" || (o.value && o.value.error)).length;
    const rs = await rows(ws, en);
    if (rs.length > 1) multiAfter++; if (rs.length === 0) zeroAfter++;
    if (jobs.some((j) => j.kind === "tracked") && rs.length === 1 && !parseTracked(rs[0].metrics)) wrongKind++;
    if (seenMax > 1) { dupSeen++; detail.push(dupMs); }
    maxRows = Math.max(maxRows, seenMax);
  }
  const line = { name, trials: TRIALS, rowsAfterIsNot1: multiAfter + zeroAfter, zeroRows: zeroAfter, multiRowsAfter: multiAfter, trackedLost: wrongKind, calls_that_errored: threw, trialsWhereAReaderSawDuplicates: dupSeen, maxRowsSeen: maxRows, longestDuplicateWindowMs: Math.max(0, ...detail) };
  console.log(JSON.stringify(line));
  return line;
}
const race1 = [];
const sets = async (n = 2) => Promise.all(Array.from({ length: n }, () => shotSet({ n: 6, makes: 4, flip: 0, byHand: 0 })));
const mixes = {
  "same set saved twice (hub finish + retry)": async (ws, en) => { const [s] = await sets(1); return [0, 1].map(() => ({ kind: "tracked", run: () => track(U1, P1, ws, en, s) })); },
  "same set saved three times": async (ws, en) => { const [s] = await sets(1); return [0, 1, 2].map(() => ({ kind: "tracked", run: () => track(U1, P1, ws, en, s) })); },
  "tracked save + plain 'done' tap at once": async (ws, en) => { const [s] = await sets(1); return [{ kind: "tracked", run: () => track(U1, P1, ws, en, s) }, { kind: "plain", run: () => plain(U1, ws, en) }]; },
  "double-tapped 'done' (no camera)": async (ws, en) => [0, 1].map(() => ({ kind: "plain", run: () => plain(U1, ws, en) })),
  "two different sets for the same drill at once": async (ws, en) => { const [a, b] = await sets(2); return [{ kind: "tracked", run: () => track(U1, P1, ws, en, a) }, { kind: "tracked", run: () => track(U1, P1, ws, en, b) }]; },
  "tracked save + skip at once": async (ws, en) => { const [s] = await sets(1); return [{ kind: "tracked", run: () => track(U1, P1, ws, en, s) }, { kind: "skip", run: () => plain(U1, ws, en, { skipped: true }) }]; },
};
for (const [name, mk] of Object.entries(mixes)) race1.push(await race(name, mk));
fs.writeFileSync(path.join(HERE, "results-race-no-index.json"), JSON.stringify({ at: new Date().toISOString(), trials: TRIALS, race: race1 }, null, 1));
const noIdx = race1;
check("after concurrent saves every entry has exactly one row (no unique constraint)", noIdx.every((x) => x.rowsAfterIsNot1 === 0), noIdx.map((x) => x.rowsAfterIsNot1).join(","));
check("a tracked result is never lost to a racing plain tap or skip", noIdx.every((x) => x.trackedLost === 0));
check("no racing save fails with an error", noIdx.every((x) => x.calls_that_errored === 0), noIdx.map((x) => x.calls_that_errored).join(","));

// ================= 7. the same races WITH the proposed unique index =================
console.log("\n== 7. The same races with the proposed unique index ==");
const idxSql = fs.readFileSync(path.join(HERE, "proposed-0023-one-log-per-workout-entry.sql"), "utf8");
await A.query(idxSql);
const withIdx = [];
for (const [name, mk] of Object.entries(mixes)) withIdx.push(await race(name, mk, { withIndex: true }));
fs.writeFileSync(path.join(HERE, "results-race-with-index.json"), JSON.stringify({ at: new Date().toISOString(), trials: TRIALS, race: withIdx }, null, 1));
check("with the index, every entry still ends with exactly one row", withIdx.every((x) => x.rowsAfterIsNot1 === 0));
check("with the index, readers never see a duplicate", withIdx.every((x) => x.trialsWhereAReaderSawDuplicates === 0));
check("with the index, racing saves do not fail for the player (the code retries a lost insert as an update)", withIdx.every((x) => x.calls_that_errored === 0), withIdx.map((x) => x.calls_that_errored).join(","));

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed${failures ? `, ${failures} FAILED` : ""}`);
fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify({ at: new Date().toISOString(), engine: (await A.query("select version()")).rows[0].version, files: db.applied.length, results, noIndex: noIdx, withIndex: withIdx }, null, 1));
await db.stop();
process.exit(failures ? 1 : 0);
