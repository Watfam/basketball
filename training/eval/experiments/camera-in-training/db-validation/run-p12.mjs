// Phase 12: benchmarks, the unique index, the film links and the existing plans, run against a real Postgres loaded with this repo's schema, migrations,
// seeds and Row Level Security. The files that would be run on the live project (seed_0024, seed_0025, fix_0026, migration 0023 and the rollbacks) are
// the very files executed here. The live project is never touched.
//   PGTEST_MODULES=<dir>/node_modules node training/eval/experiments/camera-in-training/db-validation/run-p12.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import { ROOT } from "../../../lib/registry.mjs";
import { boot } from "./db.mjs";
import { clientFor } from "./shim.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, "training/work/p12");
fs.rmSync(OUT, { recursive: true, force: true });
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f, acc) : f.endsWith(".ts") && !f.endsWith(".test.ts") && acc.push(f); } return acc; };
for (const f of walk(path.join(ROOT, "src/lib"))) {
  const dest = path.join(OUT, path.relative(ROOT, f).replace(/\.ts$/, ".mjs"));
  const js = ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"').replaceAll("import.meta.dirname", JSON.stringify(path.dirname(f)));
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, js);
}
const lib = (n) => import(path.join(OUT, "src/lib/basketball", n + ".mjs"));
const { supabaseDrillStore } = await lib("drill-store-supabase");
const { saveTrackedDrill, saveDrillLog, adjustTrackedDrill } = await lib("drill-log-store");
const { toProgressRows } = await lib("progress-rows");
const { analyzeBenchmarks, volumeSummary } = await lib("benchmark-analysis");
const { BENCHMARKS, benchmarkForEntry, protocolId } = await lib("benchmarks");
const { resolvePrescription } = await lib("prescription");
const { lessonsForDrill, studySessionFor } = await lib("drill-film");
const { drillSetLabel } = await lib("drill-context");

const results = []; let failures = 0;
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`); };
const md5 = (x) => crypto.createHash("md5").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex").slice(0, 12);
const uuid = () => crypto.randomUUID();

const db = await boot({ log: console.log, skipMigrations: [/^0023_/] });
const A = db.admin;
const notices = []; A.on("notice", (n) => notices.push(n.message));
const sql = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const q = async (text, args) => (await A.query(text, args)).rows;
const scalar = async (text, args) => Object.values((await q(text, args))[0] ?? {})[0];
// Run text in a transaction that is always rolled back; returns { error } or { ok }.
async function trial(setup, text) {
  await A.query("begin");
  try { if (setup) await A.query(setup); await A.query("savepoint s"); try { await A.query(text); return { ok: true, error: null }; } catch (e) { await A.query("rollback to savepoint s"); return { ok: false, error: e.message }; } }
  finally { await A.query("rollback"); }
}

const CONTENT = ["drills", "workouts", "workout_drills", "program_days", "programs", "film_resources", "film_sessions", "film_session_items"];
const snapshot = async (tables = CONTENT) => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, md5(await q(`select to_jsonb(x) j from hoops.${t} x order by x.id`))])));
const rowsById = async (t) => new Map((await q(`select id, to_jsonb(x) j from hoops.${t} x`)).map((r) => [r.id, md5(r.j)]));

console.log(`\nSchema applied: ${db.applied.length} files (without migration 0023), all clean: ${!db.applied.some((x) => /FAILED/.test(x))}`);
const BM_WORKOUT = "Shot Builder — Benchmark Check (v1)";

// ================= 1. existing plans are preserved =================
console.log("\n== 1. Existing training plans and workouts are preserved ==");
const programDaysBefore = await q("select pd.id, pd.week_number, pd.day_number, pd.workout_id, pd.volume_step from hoops.program_days pd join hoops.programs p on p.id = pd.program_id where p.name = 'Six-Week Shot Builder' order by 2, 3");
const entriesBefore = await q("select * from hoops.workout_drills");
const prescribe = async (days) => {
  const entries = await q("select wd.*, d.name as dname from hoops.workout_drills wd join hoops.drills d on d.id = wd.drill_id");
  return days.map((d) => ({ w: d.week_number, d: d.day_number, rx: ["beginner", "intermediate", "advanced"].map((lv) => entries.filter((e) => e.workout_id === d.workout_id && (!e.levels.length || e.levels.includes(lv))).sort((a, b) => a.sort_order - b.sort_order).map((e) => [e.id, resolvePrescription(e, lv, d.volume_step)])) }));
};
const rxBefore = await prescribe(programDaysBefore);
const tablesBefore = { workouts: await rowsById("workouts"), workout_drills: await rowsById("workout_drills"), drills: await rowsById("drills"), program_days: await rowsById("program_days"), programs: await rowsById("programs") };
check("no existing workout entry is mistaken for a benchmark", (await Promise.all(entriesBefore.map(async (e) => benchmarkForEntry({ drillName: (await q("select name from hoops.drills where id=$1", [e.drill_id]))[0].name, variantLabel: e.variant_label, sets: e.target_sets, reps: e.target_reps, seconds: e.target_duration_seconds, levels: e.levels, levelTargets: e.level_targets })))).every((x) => x === null), `${entriesBefore.length} entries`);

await db.run("supabase/seed_0024_shooting_benchmarks.sql");
const wk = await q("select id from hoops.workouts where name = $1", [BM_WORKOUT]);
check("seed_0024 adds exactly one workout", wk.length === 1);
const bmEntries = await q("select wd.*, d.name as dname from hoops.workout_drills wd join hoops.drills d on d.id = wd.drill_id where wd.workout_id = $1 order by wd.sort_order", [wk[0].id]);
check("the workout has the three benchmark entries, and each is exactly its protocol", bmEntries.length === 3 && bmEntries.every((e) => benchmarkForEntry({ drillName: e.dname, variantLabel: e.variant_label, sets: e.target_sets, reps: e.target_reps, seconds: e.target_duration_seconds, levels: e.levels, levelTargets: e.level_targets })?.drillName === e.dname), bmEntries.map((e) => `${e.dname} / ${e.variant_label}`).join("; "));
check("each benchmark entry points at the EXISTING drill (no new drill was created)", (await scalar("select count(*) from hoops.drills")) == tablesBefore.drills.size && bmEntries.every((e) => tablesBefore.drills.has(e.drill_id)));
await db.run("supabase/seed_0024_shooting_benchmarks.sql");
check("seed_0024 run again adds nothing", (await scalar("select count(*) from hoops.workouts where name=$1", [BM_WORKOUT])) == 1 && (await scalar("select count(*) from hoops.workout_drills where workout_id=$1", [wk[0].id])) == 3);

await db.run("supabase/seed_0025_benchmark_days_in_shot_builder.sql");
const bmDays = await q("select pd.week_number, pd.day_number, pd.volume_step, pd.is_deload, pd.note from hoops.program_days pd where pd.workout_id = $1 order by 1", [wk[0].id]);
check("the benchmark day is added to weeks 1, 3 and 6 only, as day 4", JSON.stringify(bmDays.map((d) => [d.week_number, d.day_number])) === "[[1,4],[3,4],[6,4]]", JSON.stringify(bmDays.map((d) => [d.week_number, d.day_number])));
check("it is never stepped up, and only week 6 (the lighter week) is marked as such", bmDays.every((d) => d.volume_step === 0) && JSON.stringify(bmDays.map((d) => d.is_deload)) === "[false,false,true]");
await db.run("supabase/seed_0025_benchmark_days_in_shot_builder.sql");
check("seed_0025 run again adds nothing", (await scalar("select count(*) from hoops.program_days where workout_id=$1", [wk[0].id])) == 3);

const after = { workouts: await rowsById("workouts"), workout_drills: await rowsById("workout_drills"), drills: await rowsById("drills"), program_days: await rowsById("program_days"), programs: await rowsById("programs") };
const unchanged = (t) => [...tablesBefore[t]].every(([id, h]) => after[t].get(id) === h);
check("every pre-existing row in workouts, entries, drills, programs and program days is byte-identical afterwards", Object.keys(tablesBefore).every(unchanged), Object.keys(tablesBefore).map((t) => `${t}:${unchanged(t)}`).join(" "));
check("rows added: 1 workout, 3 entries, 3 program days, nothing else", after.workouts.size - tablesBefore.workouts.size === 1 && after.workout_drills.size - tablesBefore.workout_drills.size === 3 && after.program_days.size - tablesBefore.program_days.size === 3 && after.drills.size === tablesBefore.drills.size && after.programs.size === tablesBefore.programs.size);
const rxAfter = await prescribe(programDaysBefore);
check("what every one of the 18 existing program days asks for, at all three levels, is exactly the same as before", JSON.stringify(rxBefore) === JSON.stringify(rxAfter), `${rxBefore.length} days x 3 levels`);
const allDaysNow = await q("select pd.id, pd.week_number, pd.day_number, pd.workout_id, pd.volume_step from hoops.program_days pd join hoops.programs p on p.id = pd.program_id where p.name = 'Six-Week Shot Builder' and pd.workout_id = $1 order by 2", [wk[0].id]);
const rxBm = await prescribe(allDaysNow);
const flat = (rx) => rx.flatMap((d) => d.rx.flat()).map(([, p]) => JSON.stringify(p));
check("the benchmark entries ask for the same thing in week 1, 3 and 6 and at every level (30 shots, 30 shots, 90 s)", new Set(flat(rxBm)).size === 3 && flat(rxBm).every((p) => ['{"sets":3,"reps":10,"durationSeconds":null}', '{"sets":2,"reps":15,"durationSeconds":null}', '{"sets":null,"reps":null,"durationSeconds":90}'].includes(p)), [...new Set(flat(rxBm))].join(" "));
check("while a normal entry still grows with the week (Elbow Pull-Up right side, intermediate: week 1 vs week 5)", await (async () => { const e = (await q("select wd.* from hoops.workout_drills wd join hoops.drills d on d.id=wd.drill_id join hoops.workouts w on w.id=wd.workout_id where d.name='Elbow Pull-Up' and wd.variant_label='Right side' and w.name='Shot Builder — Off the Dribble'"))[0]; return resolvePrescription(e, "intermediate", 4).reps - resolvePrescription(e, "intermediate", 0).reps === 4; })());

// guards
console.log("\n== 1b. The seeds stop, changing nothing, when the data is not what they expect ==");
let r = await trial("insert into hoops.drills (name, skill_tags) values ('Free Throw Reset', array['shooting'])", sql("supabase/seed_0024_shooting_benchmarks.sql").replace(/where not exists \(select 1 from hoops\.workouts[^;]*;/, "where false;"));
check("seed_0024 refuses when a drill name is ambiguous", !r.ok && /Expected exactly one drill/.test(r.error), r.error?.slice(0, 80));
r = await trial("delete from hoops.drills where name = 'Beat the Clock Finisher'", sql("supabase/seed_0024_shooting_benchmarks.sql"));
check("seed_0024 refuses when a drill is missing", !r.ok && /Expected exactly one drill/.test(r.error));
r = await trial("insert into hoops.programs (name, level, week_count, days_per_week) values ('Six-Week Shot Builder', 'intermediate', 6, 3)", sql("supabase/seed_0025_benchmark_days_in_shot_builder.sql"));
check("seed_0025 refuses when the program name is ambiguous", !r.ok && /Expected exactly one program/.test(r.error));
r = await trial("delete from hoops.workouts where name = 'Shot Builder — Benchmark Check (v1)'", sql("supabase/seed_0025_benchmark_days_in_shot_builder.sql"));
check("seed_0025 refuses when the benchmark workout is missing", !r.ok && /Run seed_0024 first/.test(r.error));

// rollbacks
console.log("\n== 1c. The rollbacks undo exactly what they say, and refuse to orphan a result ==");
const P_ = uuid(); const U1 = uuid(), U2 = uuid(), U3 = uuid();
for (const [id, e] of [[U1, "o1@t"], [U2, "o2@t"], [U3, "kid@t"]]) await A.query("insert into auth.users (id, email) values ($1,$2)", [id, e]);
const H1 = (await q("insert into hoops.households (owner_id, name) values ($1,'H1') returning id", [U1]))[0].id;
const H2 = (await q("insert into hoops.households (owner_id, name) values ($1,'H2') returning id", [U2]))[0].id;
const PL = (await q("insert into hoops.players (household_id, display_name) values ($1,'P1') returning id", [H1]))[0].id;
const PL3 = (await q("insert into hoops.players (household_id, display_name) values ($1,'P3') returning id", [H2]))[0].id;
const dayRow = async (week) => (await q("select id from hoops.program_days where workout_id=$1 and week_number=$2", [wk[0].id, week]))[0].id;
r = await trial(null, sql("supabase/rollback/0025_remove_benchmark_days.sql") + "; select 1");
check("rollback 0025 removes the three days and nothing else", await (async () => { await A.query("begin"); await A.query(sql("supabase/rollback/0025_remove_benchmark_days.sql")); const n = await scalar("select count(*) from hoops.program_days where workout_id=$1", [wk[0].id]); const total = await scalar("select count(*) from hoops.program_days"); await A.query("rollback"); return n == 0 && total == tablesBefore.program_days.size; })());
await A.query("begin"); await A.query("insert into hoops.workout_sessions (player_id, workout_id, program_day_id, status) values ($1,$2,$3,'in_progress')", [PL, wk[0].id, await dayRow(1)]);
r = await (async () => { try { await A.query("savepoint s"); await A.query(sql("supabase/rollback/0025_remove_benchmark_days.sql")); return { ok: true }; } catch (e) { await A.query("rollback to savepoint s"); return { ok: false, error: e.message }; } })();
check("rollback 0025 refuses once a workout was started on a benchmark day", !r.ok && /Nothing was removed/.test(r.error)); 
r = await (async () => { try { await A.query("savepoint s"); await A.query(sql("supabase/rollback/0024_remove_shooting_benchmarks.sql")); return { ok: true }; } catch (e) { await A.query("rollback to savepoint s"); return { ok: false, error: e.message }; } })();
check("rollback 0024 refuses while the workout is scheduled or used", !r.ok && /in use/.test(r.error)); await A.query("rollback");

// ================= 2. Film Room =================
console.log("\n== 2. Film Room linkage ==");
const filmRows = async () => q("select fr.id, fr.title, fr.drill_id, d.name as drill, fr.url from hoops.film_resources fr left join hoops.drills d on d.id = fr.drill_id order by fr.title");
const filmBefore = await filmRows(); const byTitle = (rows, t) => rows.find((x) => x.title === t);
const T = { pwb: "Playing Without the Ball", curry: "Curry: Feet Ready Before the Ball Arrives", sep: "Creating Separation Off the Bounce" };
check("before the fix: Catch-and-Shoot has no linked lesson and Creating Separation is not linked to Wing Step-Back (the seed order problem, reproduced)", byTitle(filmBefore, T.pwb).drill_id === null && byTitle(filmBefore, T.curry).drill_id === null && byTitle(filmBefore, T.sep).drill_id === null);
check("every identifier the fix needs resolves to exactly one row (looked up by title and name, not typed in)", (await Promise.all(Object.values(T).map((t) => scalar("select count(*) from hoops.film_resources where title=$1", [t])))).every((n) => n == 1) && (await scalar("select count(*) from hoops.drills where name in ('Catch-and-Shoot off the Pin-Down','Wing Step-Back')")) == 2);
const lessonsFor = async () => (await q("select id, title, url, watch_for, skill_tags, drill_id, sort_order from hoops.film_resources where skill_tags && array['shooting']"));
const sessionsFor = async () => { const rows = await q("select s.id, s.name, i.film_resource_id from hoops.film_sessions s join hoops.film_session_items i on i.film_session_id = s.id"); const m = new Map(); for (const x of rows) (m.get(x.id) ?? m.set(x.id, { id: x.id, name: x.name, lessonIds: [] }).get(x.id)).lessonIds.push(x.film_resource_id); return [...m.values()]; };
const csDrill = (await q("select id, name from hoops.drills where name='Catch-and-Shoot off the Pin-Down'"))[0], wsb = (await q("select id, name from hoops.drills where name='Wing Step-Back'"))[0];
const preC = lessonsForDrill(csDrill, await lessonsFor()), preW = lessonsForDrill(wsb, await lessonsFor());
check("before: the drill card finds no lesson for Catch-and-Shoot, and Wing Step-Back only a 'related' one", preC === null && preW?.basis === "related");

const noticeStart = notices.length;
await db.run("supabase/fix_0026_film_links_for_shooting.sql");
const filmAfter = await filmRows();
check("after: exactly the three lessons were linked, to the right drills", ["pwb", "curry"].every((k) => byTitle(filmAfter, T[k]).drill === "Catch-and-Shoot off the Pin-Down") && byTitle(filmAfter, T.sep).drill === "Wing Step-Back" && filmAfter.filter((x) => x.drill_id !== filmBefore.find((b) => b.id === x.id).drill_id).length === 3, notices.slice(noticeStart).join(" | "));
check("no web address was read, changed or created: every url is byte-identical", md5(filmBefore.map((x) => [x.id, x.url])) === md5(filmAfter.map((x) => [x.id, x.url])));
check("no lesson was added or removed, and the study session is intact", filmAfter.length === filmBefore.length && (await scalar("select count(*) from hoops.film_sessions where name='Get Open Without the Ball'")) == 1);
const postC = lessonsForDrill(csDrill, await lessonsFor());
const studyC = studySessionFor([postC.primary, ...postC.more].map((l) => l.id), await sessionsFor());
check("the drill card now shows two linked lessons for Catch-and-Shoot and its existing study session (3 lessons)", postC.basis === "linked" && 1 + postC.more.length === 2 && studyC?.name === "Get Open Without the Ball" && studyC.lessonCount === 3, `${postC.primary.title} + ${postC.more.map((m) => m.title)} -> ${studyC?.name}`);
check("Wing Step-Back now shows its own lesson as linked, not just related", lessonsForDrill(wsb, await lessonsFor())?.basis === "linked" && lessonsForDrill(wsb, await lessonsFor()).primary.title === T.sep);
const n0 = notices.length; await db.run("supabase/fix_0026_film_links_for_shooting.sql");
check("run again: reports 'already linked' and changes nothing", md5(await filmRows()) === md5(filmAfter) && notices.slice(n0).filter((m) => /already linked/.test(m)).length === 3);
r = await trial("update hoops.film_resources set drill_id = null where title = 'Playing Without the Ball'; update hoops.film_resources set drill_id = (select id from hoops.drills where name = 'Elbow Pull-Up') where title = 'Curry: Feet Ready Before the Ball Arrives'", sql("supabase/fix_0026_film_links_for_shooting.sql"));
check("a lesson that already points at a different drill is left alone", r.ok);
await A.query("begin"); await A.query("update hoops.film_resources set drill_id = (select id from hoops.drills where name = 'Elbow Pull-Up') where title = 'Curry: Feet Ready Before the Ball Arrives'"); await A.query(sql("supabase/fix_0026_film_links_for_shooting.sql"));
check("...and it stays pointing there afterwards", (await scalar("select d.name from hoops.film_resources fr join hoops.drills d on d.id=fr.drill_id where fr.title='Curry: Feet Ready Before the Ball Arrives'")) === "Elbow Pull-Up"); await A.query("rollback");
r = await trial("insert into hoops.film_resources (title, url) values ('Playing Without the Ball', null)", sql("supabase/fix_0026_film_links_for_shooting.sql"));
check("a duplicated lesson title stops the fix with a clear message", !r.ok && /matched 2 rows/.test(r.error), r.error?.slice(0, 90));
r = await trial("delete from hoops.drills where name = 'Wing Step-Back'", sql("supabase/fix_0026_film_links_for_shooting.sql"));
check("a missing drill stops the fix", !r.ok && /matched 0 rows/.test(r.error));
r = await trial("update hoops.film_resources set drill_id = null where title in ('Playing Without the Ball','Curry: Feet Ready Before the Ball Arrives','Creating Separation Off the Bounce')", sql("supabase/rollback/0026_unlink_film_for_shooting.sql"));
check("the rollback is accepted and touches only these lessons", r.ok);

// ================= 3. benchmarks through the real save code, real RLS =================
console.log("\n== 3. Benchmarks end to end: week assignment, correct attachment, corrections, repeats, versions, compatibility ==");
const entryOf = async (key) => (await q("select wd.id, wd.drill_id from hoops.workout_drills wd join hoops.drills d on d.id=wd.drill_id where wd.workout_id=$1 and d.name=$2", [wk[0].id, BENCHMARKS.find((b) => b.key === key).drillName]))[0];
const E = { free_throw: await entryOf("free_throw"), catch_and_shoot: await entryOf("catch_and_shoot"), beat_the_clock: await entryOf("beat_the_clock") };
const store = (u) => supabaseDrillStore(clientFor(db, u));
async function shotSet(player, label, attempts, makes, o = {}) {
  const id = (await q("insert into hoops.shot_sessions (player_id, label, source, started_at, ended_at, makes, attempts, rule_version, model_version) values ($1,$2,'camera',$3,now(),$4,$5,'v4','ball6') returning id", [player, label, o.at ?? new Date().toISOString(), makes, attempts]))[0].id;
  for (let i = 1; i <= attempts; i++) { const hand = o.hand && i > attempts - o.hand, made = i <= makes; await A.query("insert into hoops.shots (session_id, player_id, seq, made, source, detected_made, added_by_hand) values ($1,$2,$3,$4,$5,$6,$7)", [id, player, i, made, hand ? "manual" : "camera", hand ? null : (o.flip && i === 1 ? !made : made), !!hand]); }
  return id;
}
const labelFor = (key) => { const b = BENCHMARKS.find((x) => x.key === key); return drillSetLabel({ drillName: b.drillName, variant: b.variantLabel }); };
const session = async (week, status = "in_progress", at = null) => (await q("insert into hoops.workout_sessions (player_id, workout_id, program_day_id, status, started_at) values ($1,$2,$3,$4,coalesce($5::timestamptz, now())) returning id", [PL, wk[0].id, week === null ? null : await dayRow(week), status, at]))[0].id;
const saveBm = (u, ws, key, ss, extra = {}) => saveTrackedDrill(store(u), { playerId: PL, workoutSessionId: ws, workoutDrillId: E[key].id, shotSessionId: ss, ...extra });
const logRows = async (ws) => q("select l.id, l.workout_drill_id, l.metrics from hoops.session_logs l where l.session_id=$1", [ws]);
const WEEKS = [[1, "2026-10-05T16:00:00Z", 17, 18, 12], [3, "2026-10-19T16:00:00Z", 19, 19, 13], [6, "2026-11-09T16:00:00Z", 22, 21, 14]];
const wsByWeek = {};
for (const [week, at, ftMakes, csMakes, clockAttempts] of WEEKS) {
  const ws = await session(week, "in_progress", at); wsByWeek[week] = ws;
  const a = await saveBm(U1, ws, "free_throw", await shotSet(PL, labelFor("free_throw"), 30, ftMakes, { at }));
  const b = await saveBm(U1, ws, "catch_and_shoot", await shotSet(PL, labelFor("catch_and_shoot"), 30, csMakes, { at, flip: true }), { conditions: { pass_from: "partner" } });
  const c = await saveBm(U1, ws, "beat_the_clock", await shotSet(PL, labelFor("beat_the_clock"), clockAttempts, Math.round(clockAttempts * 0.5), { at }), { clockComplete: true });
  if (!(a.ok && b.ok && c.ok)) console.log("save failed", a, b, c);
  await A.query("update hoops.workout_sessions set status='completed', completed_at=$2 where id=$1", [ws, at]);
}
const loaderRows = async () => toProgressRows(await q(`select l.id, l.session_id, l.metrics, l.created_at, to_jsonb(d) as drills, jsonb_build_object('started_at', ws.started_at, 'status', ws.status, 'program_days', case when pd.id is null then null else jsonb_build_object('week_number', pd.week_number, 'day_number', pd.day_number) end) as workout_sessions
  from hoops.session_logs l join hoops.workout_sessions ws on ws.id = l.session_id left join hoops.program_days pd on pd.id = ws.program_day_id left join hoops.drills d on d.id = l.drill_id where ws.player_id = $1 and l.metrics->>'type' = 'shooting'`, [PL]));
const rows1 = await loaderRows();
const rep1 = analyzeBenchmarks(rows1);
const grp = (rep, key, pred = (g) => g.current) => rep.find((x) => x.protocol.key === key).groups.find(pred);
check("each result attached to ITS OWN benchmark, one row per entry, three weeks", WEEKS.every(([w]) => true) && (await Promise.all(Object.values(wsByWeek).map(logRows))).every((rs) => rs.length === 3 && rs.every((x) => protocolId(BENCHMARKS.find((b) => b.drillName === (rows1.find((r) => r.logId === x.id)?.drillName))) === x.metrics.benchmark?.protocol)));
check("weeks 1, 3 and 6 are assigned from the program day, for all three benchmarks", ["free_throw", "catch_and_shoot", "beat_the_clock"].every((k) => JSON.stringify(grp(rep1, k).results.map((x) => x.week)) === "[1,3,6]" && grp(rep1, k).results.every((x) => x.planned)));
const ftg = grp(rep1, "free_throw");
check("free throws: 17, 19, 22 of 30 compared week 1 to week 6, a 17-point rise that is correctly NOT called clear", ftg.comparison.baseline.week === 1 && ftg.comparison.latest.week === 6 && ftg.comparison.diff === 17 && ftg.comparison.verdict === "no_clear_change", ftg.comparison.text.slice(0, 120));
check("catch-and-shoot keeps who passed (partner), and its 15 flips/hand additions are shown as data-quality notes", grp(rep1, "catch_and_shoot").conditions.pass_from === "partner" && grp(rep1, "catch_and_shoot").results.every((x) => x.flags.some((f) => f.kind === "corrected")));
check("the clock benchmark is complete and compared by share, with its caveat", grp(rep1, "beat_the_clock").comparable.length === 3 && grp(rep1, "beat_the_clock").comparison.caveats[0].includes("taking more shots"));
check("results read back from the real database carry the camera counts (not taps)", ftg.results.every((x) => x.source === "camera"));

// wrong attachment
const wsX = await session(null);
const wrongSet = await shotSet(PL, labelFor("catch_and_shoot"), 30, 20);
let w = await saveBm(U1, wsX, "free_throw", wrongSet);
check("a catch-and-shoot set cannot become the free-throw benchmark result", !w.ok && w.code === "wrong_set" && (await logRows(wsX)).length === 0, w.code);
w = await saveBm(U1, wsX, "free_throw", await shotSet(PL, "Free throws", 30, 20));
check("nor can a free-shooting set with some other name", !w.ok && w.code === "wrong_set");
w = await saveBm(U2, wsX, "free_throw", await shotSet(PL, labelFor("free_throw"), 30, 20));
check("another household cannot attach a benchmark to this player's workout (row security)", !w.ok && w.code === "no_workout");
w = await saveBm(U1, wsX, "free_throw", await shotSet(PL3, labelFor("free_throw"), 30, 20));
check("another household's set cannot be used as a benchmark result", !w.ok && w.code === "no_shots");

// duplicate saves, resume, corrections, redo
const ws3 = wsByWeek[3];
await A.query("update hoops.workout_sessions set status='in_progress' where id=$1", [ws3]);
const ftSet3 = (await logRows(ws3)).find((x) => x.workout_drill_id === E.free_throw.id).metrics.tracking.shot_session_id;
for (let i = 0; i < 3; i++) await saveBm(U1, ws3, "free_throw", ftSet3);
check("the same benchmark saved three more times is still one row and not a redo", (await logRows(ws3)).filter((x) => x.workout_drill_id === E.free_throw.id).length === 1 && (await logRows(ws3)).find((x) => x.workout_drill_id === E.free_throw.id).metrics.benchmark.redo === 0);
const adj = await adjustTrackedDrill(store(U1), { playerId: PL, workoutSessionId: ws3, workoutDrillId: E.free_throw.id, makes: 18, attempts: 30 });
await saveBm(U1, ws3, "free_throw", ftSet3);
const m3 = (await logRows(ws3)).find((x) => x.workout_drill_id === E.free_throw.id).metrics;
check("a manual correction (19 to 18) is kept, keeps the first saved numbers, and survives a re-save", adj.ok && m3.makes === 18 && m3.tracking.adjusted.original.makes === 19 && m3.benchmark.protocol === "free_throw@v1");
const redoSet = await shotSet(PL, labelFor("free_throw"), 30, 24);
await saveBm(U1, ws3, "free_throw", redoSet);
const m3b = (await logRows(ws3)).find((x) => x.workout_drill_id === E.free_throw.id).metrics;
check("running the benchmark again replaces it, counts one redo, and the first run stays in shooting history", m3b.benchmark.redo === 1 && m3b.makes === 24 && (await scalar("select count(*) from hoops.shots where session_id=$1", [ftSet3])) == 30);
await A.query("update hoops.workout_sessions set status='completed' where id=$1", [ws3]);

// incompatible version / incomplete / camera-free
const wsV = await session(null, "completed", "2026-11-12T16:00:00Z");
const v2set = await shotSet(PL, "x", 30, 29);
await A.query("insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,$3,$4)", [wsV, E.free_throw.drill_id, E.free_throw.id, JSON.stringify({ type: "shooting", variant: "Benchmark v2", category: "stationary", category_basis: "drill_definition", makes: 29, attempts: 30, target: { kind: "shots", value: 30 }, tracking: { v: 1, source: "camera", shot_session_id: v2set, camera_attempts: 30, camera_makes: 29, flipped: 0, added_by_hand: 0, rule_version: "v4", model_version: "ball6", adjusted: null }, benchmark: { protocol: "free_throw@v2", conditions: null, conditions_complete: true, clock_complete: null, redo: 0 } })]);
const wsShort = await session(null, "in_progress", "2026-11-13T16:00:00Z");
const shortRes = await saveBm(U1, wsShort, "free_throw", await shotSet(PL, labelFor("free_throw"), 22, 20));
await A.query("update hoops.workout_sessions set status='completed' where id=$1", [wsShort]);
const rep2 = analyzeBenchmarks(await loaderRows());
const ft2 = rep2.find((x) => x.protocol.key === "free_throw");
const cur = ft2.groups.find((g) => g.current), v2 = ft2.groups.find((g) => !g.current);
check("a result from another benchmark version is kept apart and never compared with the current one", v2.protocolId === "free_throw@v2" && v2.comparison === null && cur.results.every((x) => x.makes !== 29) && cur.comparison.latest.week === 6);
check("a 22-shot run is listed but left out of comparisons", shortRes.ok && cur.results.some((x) => !x.comparable && x.attempts === 22) && cur.comparison.latest.week === 6, JSON.stringify([shortRes.ok, shortRes.code, cur.results.map((x) => [x.attempts, x.comparable, x.week])]));
check("the comparison still starts at week 1, so the interrupted run could not distort it", cur.comparison.baseline.week === 1);
const wsPlain = await session(null, "in_progress");
const plain = await saveDrillLog(store(U1), { sessionId: wsPlain, drillId: E.free_throw.drill_id, workoutDrillId: E.free_throw.id, metrics: { type: "reps", sets_completed: 3, reps: 10 } });
await A.query("update hoops.workout_sessions set status='completed' where id=$1", [wsPlain]);
check("a benchmark workout done without the camera completes as a plain log and simply is not a benchmark result", plain.action === "insert" && !analyzeBenchmarks(await loaderRows()).find((x) => x.protocol.key === "free_throw").groups.flatMap((g) => g.results).some((x) => x.workoutSessionId === wsPlain));

// existing workout compatibility
const gsWorkout = (await q("select id from hoops.workouts where name='Shot Builder — Game Speed'"))[0].id;
const gsEntry = (await q("select wd.id, wd.drill_id from hoops.workout_drills wd join hoops.drills d on d.id=wd.drill_id where wd.workout_id=$1 and d.name='Elbow Pull-Up' and wd.variant_label='Right side'", [gsWorkout]))[0];
const gsWs = (await q("insert into hoops.workout_sessions (player_id, workout_id, status, started_at) values ($1,$2,'in_progress','2026-11-01T16:00:00Z') returning id", [PL, gsWorkout]))[0].id;
const gs = await saveTrackedDrill(store(U1), { playerId: PL, workoutSessionId: gsWs, workoutDrillId: gsEntry.id, shotSessionId: await shotSet(PL, "Elbow Pull-Up · Right side", 24, 14), goal: { kind: "shots", target: 24 } });
const rep3 = analyzeBenchmarks(await loaderRows());
check("an ordinary tracked drill in an ordinary workout is saved as before and is NOT a benchmark", gs.ok && gs.action === "insert" && rep3.reduce((a, r) => a + r.resultCount, 0) === rep2.reduce((a, r) => a + r.resultCount, 0));
check("it still counts as practice volume, separately", volumeSummary(await loaderRows()).attempts > volumeSummary(await loaderRows()).benchmarkAttempts);

// ================= 4. the unique-index migration =================
console.log("\n== 4. Migration 0023 (one result per workout entry) ==");
const idxName = "session_logs_one_per_entry";
const policies = async () => md5(await q("select policyname, cmd, permissive, roles::text, qual, with_check from pg_policies where schemaname='hoops' and tablename='session_logs' order by policyname"));
const logHash = async () => md5(await q("select to_jsonb(l) j from hoops.session_logs l order by id"));
const idxExists = async () => (await q("select i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid) def from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname = $1", [idxName]))[0];
const hash0 = await logHash(), pol0 = await policies(), count0 = await scalar("select count(*) from hoops.session_logs");
check("before: no such index, and the read-only duplicate check finds nothing in this data", !(await idxExists()) && (await q(sql("supabase/checks/0023_before.sql").split(";")[0])).length === 0);
// duplicates present: the guard stops it, nothing is removed
await A.query("begin");
const dupWs = await session(null, "in_progress");
for (let i = 0; i < 2; i++) await A.query("insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,$3,'{\"type\":\"reps\"}')", [dupWs, E.free_throw.drill_id, E.free_throw.id]);
const dupHash = await logHash(); const dupCheck = await q(sql("supabase/checks/0023_before.sql").split(";")[0]);
r = await (async () => { try { await A.query("savepoint s"); await A.query(sql("supabase/migrations/0023_one_log_per_workout_entry.sql")); return { ok: true }; } catch (e) { await A.query("rollback to savepoint s"); return { ok: false, error: e.message }; } })();
check("with a duplicate present the read-only check lists it, and the migration stops with a plain message", dupCheck.length === 1 && Number(dupCheck[0].rows_for_the_entry) === 2 && !r.ok && /more than one row/.test(r.error) && /0023_before/.test(r.error), r.error?.slice(0, 70));
check("...and it neither deleted nor merged anything, and created no index", (await logHash()) === dupHash && !(await idxExists()) && (await scalar("select count(*) from hoops.session_logs where session_id=$1", [dupWs])) == 2);
await A.query("rollback");
// clean data: apply
await db.run("supabase/migrations/0023_one_log_per_workout_entry.sql");
const ix = await idxExists();
check("applied on clean data: the index exists, is valid and is unique, with the intended definition", ix?.indisunique && ix.indisvalid && /\(session_id, workout_drill_id\) WHERE \(workout_drill_id IS NOT NULL\)/.test(ix.def), ix?.def);
check("every existing row is untouched (same rows, same hash), and the policies are exactly the same", (await logHash()) === hash0 && (await policies()) === pol0 && (await scalar("select count(*) from hoops.session_logs")) == count0 && (await scalar("select relrowsecurity from pg_class where oid='hoops.session_logs'::regclass")) === true);
await db.run("supabase/migrations/0023_one_log_per_workout_entry.sql");
check("running it again changes nothing", (await logHash()) === hash0 && (await idxExists()).indisvalid);
const raw = async (u, text, args = []) => { const c = await db.connect(); try { await c.query("begin"); await c.query(`set local role ${u ? "authenticated" : "anon"}`); await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(u ? { sub: u, role: "authenticated" } : { role: "anon" })]); const x = await c.query(text, args); await c.query("commit"); return { n: x.rowCount }; } catch (e) { await c.query("rollback").catch(() => {}); return { err: e.code }; } finally { await c.end(); } };
const uniq = await session(null, "in_progress");
const ins = (u, entry) => raw(u, "insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,$3,'{}')", [uniq, E.free_throw.drill_id, entry]);
check("a second row for the same workout entry is refused (23505); a different entry, and rows with no entry id, are fine", (await ins(U1, E.free_throw.id)).n === 1 && (await ins(U1, E.free_throw.id)).err === "23505" && (await ins(U1, E.catch_and_shoot.id)).n === 1 && (await ins(U1, null)).n === 1 && (await ins(U1, null)).n === 1);
check("row security still holds under the index: another household and anonymous callers are refused", (await ins(U2, E.beat_the_clock.id)).err === "42501" && (await ins(null, E.beat_the_clock.id)).err === "42501");
const save2 = await Promise.all([0, 1, 2].map(async () => saveBm(U1, await session(null, "in_progress"), "free_throw", await shotSet(PL, labelFor("free_throw"), 30, 20))));
check("the app's own save, with the index in place, still works for benchmark saves", save2.every((x) => x.ok));
const sameSession = await session(null, "in_progress"); const sameSet = await shotSet(PL, labelFor("free_throw"), 30, 21);
const race = await Promise.all([0, 1, 2, 3].map(() => saveBm(U1, sameSession, "free_throw", sameSet)));
check("four simultaneous saves of one benchmark: all succeed, one row, never a redo", race.every((x) => x.ok) && (await logRows(sameSession)).length === 1 && (await logRows(sameSession))[0].metrics.benchmark.redo === 0);
await db.run("supabase/rollback/0023_drop_one_log_per_workout_entry.sql");
check("rollback drops only the index: rows and policies unchanged by it, and double entries are possible again", !(await idxExists()) && (await policies()) === pol0 && (await ins(U1, E.free_throw.id)).n === 1);
await db.run("supabase/migrations/0023_one_log_per_workout_entry.sql").catch(() => {});

console.log(`\n${results.filter((x) => x.ok).length}/${results.length} checks passed${failures ? `, ${failures} FAILED` : ""}`);
fs.writeFileSync(path.join(HERE, "results-p12.json"), JSON.stringify({ at: new Date().toISOString(), engine: (await q("select version()"))[0].version, results }, null, 1));
await db.stop();
process.exit(failures ? 1 : 0);
