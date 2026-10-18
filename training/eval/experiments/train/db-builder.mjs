// The workout builder's saving code (src/lib/basketball/custom-workouts-store.ts, the very file the app runs) against a real Postgres with this repo's
// schema, migrations (including 0027), seeds and Row Level Security, through the same PostgREST client the app uses. The live project is never touched.
//   PGTEST_MODULES=<dir>/node_modules node training/eval/experiments/train/db-builder.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import { ROOT } from "../../lib/registry.mjs";
import { boot } from "../camera-in-training/db-validation/db.mjs";
import { clientFor } from "../camera-in-training/db-validation/shim.mjs";

const OUT = path.join(ROOT, "training/work/train");
fs.rmSync(OUT, { recursive: true, force: true });
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f, acc) : f.endsWith(".ts") && !f.endsWith(".test.ts") && acc.push(f); } return acc; };
for (const f of walk(path.join(ROOT, "src/lib"))) {
  const dest = path.join(OUT, path.relative(ROOT, f).replace(/\.ts$/, ".mjs"));
  const js = ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"').replace(/from "(\.[^".]*)"/g, 'from "$1.mjs"').replaceAll("import.meta.dirname", JSON.stringify(path.dirname(f)));
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, js);
}
const { saveWorkout, deleteWorkout, NOT_READY } = await import(path.join(OUT, "src/lib/basketball/custom-workouts-store.mjs"));

let fails = 0; const ok = (c, m, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${d ? "  [" + d + "]" : ""}`); if (!c) fails++; };
const uuid = () => crypto.randomUUID();

async function world(opts = {}) {
  const db = await boot({ port: opts.port, log: () => {}, skipMigrations: opts.skip ?? [] });
  const ua = uuid(), ub = uuid(), ha = uuid(), hb = uuid(), pa = uuid();
  await db.admin.query("insert into auth.users(id,email) values ($1,'a@x'),($2,'b@x')", [ua, ub]);
  await db.admin.query("insert into hoops.households(id,owner_id,name) values ($1,$2,'A'),($3,$4,'B')", [ha, ua, hb, ub]);
  await db.admin.query("insert into hoops.players(id,household_id,display_name) values ($1,$2,'Pa')", [pa, ha]);
  const drills = (await db.admin.query("select id from hoops.drills order by name limit 6")).rows.map((r) => r.id);
  return { db, ua, ub, ha, hb, pa, drills };
}
const e = (drillId, sets = 3, reps = 10, seconds = null, id = null) => ({ id, drillId, sets, reps, seconds, block: "main" });

const w = await world({ port: 54332 });
const A = clientFor(w.db, w.ua), B = clientFor(w.db, w.ub);
const rows = async (id) => (await w.db.admin.query("select id, drill_id, sort_order, block, target_sets, target_reps, target_duration_seconds from hoops.workout_drills where workout_id=$1 order by sort_order", [id])).rows;

let r = await saveWorkout(A, w.ua, { name: "  My 30  ", skills: ["shooting", "bogus"], entries: [e(w.drills[0]), e(w.drills[1], 3, null, 30), e(w.drills[2], 2, 12)] });
ok(!r.error && r.workoutId, "a family can save a new workout", r.error ?? "");
const wid = r.workoutId;
const wk = (await w.db.admin.query("select * from hoops.workouts where id=$1", [wid])).rows[0];
ok(wk.name === "My 30" && wk.owner_household_id === w.ha && wk.player_type_tags.custom === true && JSON.stringify(wk.focus_areas) === '["shooting"]' && wk.estimated_minutes > 0, "owned by the family, marked custom, name trimmed, unknown skills dropped, minutes estimated", `${wk.estimated_minutes} min`);
let es = await rows(wid);
ok(es.length === 3 && es.map((x) => x.block).join() === "warmup,main,finisher" && es.map((x) => x.sort_order).join() === "0,1,2", "three entries in order with a warm-up first and a finisher last");
ok(es[1].target_duration_seconds === 30 && es[1].target_reps === null && es[2].target_sets === 2 && es[2].target_reps === 12, "each keeps its own sets, reps or seconds");

// what the workout player reads
const wRow = await A.from("workouts").select("id, name").eq("id", wid).maybeSingle();
const eRows = await A.from("workout_drills").select("id, drill_id, sort_order, block, target_sets, target_reps, target_duration_seconds, drills(id, name, difficulty)").eq("workout_id", wid);
ok(wRow.data?.name === "My 30" && eRows.data?.length === 3 && eRows.data.every((x) => x.drills?.name), "the owner reads it back the way the workout player does (the workout, then its entries with their drills)");
const started = await A.from("workout_sessions").insert({ player_id: w.pa, workout_id: wid, status: "in_progress" }).select("id").single();
ok(!started.error, "and starts it for their player", started.error?.message ?? "");

// edit: keep two (one changed), drop one, add one, rename
const keepA = es[0].id, keepC = es[2].id, dropB = es[1].id;
r = await saveWorkout(A, w.ua, { id: wid, name: "Renamed", skills: ["shooting", "ball_handling"], entries: [e(w.drills[0], 4, 8, null, keepA), e(w.drills[3]), e(w.drills[2], 2, 15, null, keepC)] });
ok(!r.error, "an edit saves", r.error ?? "");
es = await rows(wid);
ok(es.length === 3 && es.some((x) => x.id === keepA && x.target_sets === 4 && x.target_reps === 8) && es.some((x) => x.id === keepC && x.target_reps === 15) && !es.some((x) => x.id === dropB), "kept drills keep their rows (so past results stay linked), the dropped one is gone, the new one is added");
ok((await w.db.admin.query("select name from hoops.workouts where id=$1", [wid])).rows[0].name === "Renamed", "and the name changed");
ok(es[1].block === "main" && es[0].block === "warmup" && es[2].block === "finisher", "blocks follow the new order");
// the same drill twice is fine
r = await saveWorkout(A, w.ua, { name: "Twice", skills: [], entries: [e(w.drills[0], 3, 10), e(w.drills[0], 2, 5)] });
ok(!r.error, "the same drill can appear twice (right side, left side)", r.error ?? "");

// another family
r = await saveWorkout(B, w.ub, { id: wid, name: "Mine now", skills: [], entries: [e(w.drills[0])] });
ok(!!r.error && /not one of yours/.test(r.error), "another family cannot edit it", r.error ?? "");
ok((await deleteWorkout(B, wid)).error !== null, "or delete it");
ok((await B.from("workouts").select("id").eq("id", wid)).data.length === 0, "and does not see it");
// the library is safe
const libId = (await w.db.admin.query("select id from hoops.workouts where owner_household_id is null limit 1")).rows[0].id;
ok(/not one of yours/.test((await deleteWorkout(A, libId)).error ?? ""), "a library workout cannot be deleted through the builder");
r = await saveWorkout(A, w.ua, { id: libId, name: "Hacked", skills: [], entries: [e(w.drills[0])] });
ok(!!r.error, "or edited", r.error ?? "");
ok((await w.db.admin.query("select name from hoops.workouts where id=$1", [libId])).rows[0].name !== "Hacked", "the library workout is unchanged");

// checks
ok(!!(await saveWorkout(A, w.ua, { name: "", skills: [], entries: [e(w.drills[0])] })).error, "a name is required");
ok(!!(await saveWorkout(A, w.ua, { name: "x", skills: [], entries: [] })).error, "at least one drill is required");
ok(/no longer in the library/.test((await saveWorkout(A, w.ua, { name: "x", skills: [], entries: [e(uuid())] })).error ?? ""), "a drill that is not in the library is refused, and nothing is left behind");
ok((await w.db.admin.query("select count(*)::int n from hoops.workouts where name='x'")).rows[0].n === 0, "no half-saved workout remains");

// delete
const del = await deleteWorkout(A, wid);
ok(!del.error, "the owner can delete it", del.error ?? "");
ok((await rows(wid)).length === 0, "its drills go with it");
ok((await w.db.admin.query("select workout_id from hoops.workout_sessions where id=$1", [started.data.id])).rows[0].workout_id === null, "the session done with it is kept, without the link");
await w.db.stop();

// before the migration is applied
const old = await world({ port: 54333, skip: [/^0027_/] });
const O = clientFor(old.db, old.ua);
const nr = await saveWorkout(O, old.ua, { name: "Early", skills: [], entries: [e(old.drills[0])] });
ok(nr.error === NOT_READY, "before migration 0027 is applied, saving says so plainly and changes nothing", nr.error ?? "");
ok((await old.db.admin.query("select count(*)::int n from hoops.workouts where name='Early'")).rows[0].n === 0, "nothing was saved");
await old.db.stop();
console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
process.exit(fails ? 1 : 0);
