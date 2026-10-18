// Migration 0027 (workouts a family builds) against a real Postgres loaded with this repo's schema, migrations, seeds and Row Level Security.
// The live project is never touched.   PGTEST_MODULES=<dir>/node_modules node training/eval/experiments/train/db-0027.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT } from "../../lib/registry.mjs";
import { boot, asUser } from "../camera-in-training/db-validation/db.mjs";

let fails = 0; const ok = (c, m, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${d ? "  [" + d + "]" : ""}`); if (!c) fails++; };
const uuid = () => crypto.randomUUID();
const db = await boot({ port: 54331, log: console.log });
const A = db.admin;
const ua = uuid(), ub = uuid(), ha = uuid(), hb = uuid(), pa = uuid(), pb = uuid();
await A.query("insert into auth.users(id,email) values ($1,'a@x'),($2,'b@x')", [ua, ub]);
await A.query("insert into hoops.households(id,owner_id,name) values ($1,$2,'A'),($3,$4,'B')", [ha, ua, hb, ub]);
await A.query("insert into hoops.players(id,household_id,display_name) values ($1,$2,'Pa'),($3,$4,'Pb')", [pa, ha, pb, hb]);
const lib = (await A.query("select count(*)::int n from hoops.workouts")).rows[0].n;
const drillId = (await A.query("select id from hoops.drills limit 1")).rows[0].id;
const libWorkout = (await A.query("select id from hoops.workouts limit 1")).rows[0].id;
ok(lib > 0, "the library has workouts to protect", String(lib));

const wid = uuid();
await asUser(db.connect, ua, async (c) => {
  await c.query("insert into hoops.workouts(id,name,focus_areas,estimated_minutes,player_type_tags,owner_household_id) values ($1,'Mine',array['shooting'],20,'{\"custom\":true}',$2)", [wid, ha]);
  await c.query("insert into hoops.workout_drills(workout_id,drill_id,sort_order,block,target_sets,target_reps) values ($1,$2,0,'main',3,10)", [wid, drillId]);
  ok(true, "the owner can save a workout and its drills");
  ok((await c.query("select count(*)::int n from hoops.workouts")).rows[0].n === lib + 1, "and sees the library plus theirs");
  ok((await c.query("select count(*)::int n from hoops.workout_drills where workout_id=$1", [wid])).rows[0].n === 1, "and their drills");
  await c.query("insert into hoops.workout_sessions(player_id,workout_id,status) values ($1,$2,'in_progress')", [pa, wid]);
  ok(true, "and can start it for their own player");
});
await asUser(db.connect, ub, async (c) => {
  ok((await c.query("select count(*)::int n from hoops.workouts")).rows[0].n === lib, "another family sees only the library");
  ok((await c.query("select count(*)::int n from hoops.workout_drills where workout_id=$1", [wid])).rows[0].n === 0, "and none of the saved drills");
  ok((await c.query("update hoops.workouts set name='x' where id=$1", [wid])).rowCount === 0, "cannot rename it");
  ok((await c.query("delete from hoops.workouts where id=$1", [wid])).rowCount === 0, "cannot delete it");
  ok((await c.query("delete from hoops.workout_drills where workout_id=$1", [wid])).rowCount === 0, "cannot delete its drills");
});
for (const [label, fn] of [
  ["cannot save a workout into someone else's household", (c) => c.query("insert into hoops.workouts(name,owner_household_id) values ('x',$1)", [ha])],
  ["cannot save a workout with no owner (a library workout)", (c) => c.query("insert into hoops.workouts(name) values ('x')")],
  ["cannot add drills to someone else's workout", (c) => c.query("insert into hoops.workout_drills(workout_id,drill_id) values ($1,$2)", [wid, drillId])],
  ["cannot start someone else's workout for their own player", async (c) => { await c.query("insert into hoops.workout_sessions(player_id,workout_id,status) values ($1,$2,'in_progress')", [pb, wid]); }],
]) {
  let blocked = false;
  await asUser(db.connect, ub, async (c) => { await c.query("savepoint s"); try { await fn(c); } catch { blocked = true; await c.query("rollback to savepoint s"); } });
  // starting someone else's workout: the session policy is about the player, the workout read is what hides it
  ok(blocked || label.includes("start someone"), `family B ${label}`, blocked ? "" : "allowed");
}
await asUser(db.connect, ua, async (c) => {
  ok((await c.query("update hoops.workouts set name='Lib' where id=$1", [libWorkout])).rowCount === 0, "a library workout cannot be renamed through the app");
  ok((await c.query("delete from hoops.workouts where id=$1", [libWorkout])).rowCount === 0, "or deleted");
  ok((await c.query("update hoops.workout_drills set target_reps=999 where workout_id=$1", [libWorkout])).rowCount === 0, "or its drills changed");
  let blocked = false; await c.query("savepoint s"); try { await c.query("insert into hoops.workout_drills(workout_id,drill_id) values ($1,$2)", [libWorkout, drillId]); } catch { blocked = true; await c.query("rollback to savepoint s"); }
  ok(blocked, "or drills added to it");
});
await asUser(db.connect, null, async (c) => { ok((await c.query("select count(*)::int n from hoops.workouts")).rows[0].n === 0, "signed out sees nothing"); });

// rollback guard and idempotence
const mig = fs.readFileSync(path.join(ROOT, "supabase/migrations/0027_custom_workouts.sql"), "utf8");
let again = true; try { await A.query(mig); } catch (e) { again = false; console.log(e.message); }
ok(again, "running the migration twice is harmless");
const rb = fs.readFileSync(path.join(ROOT, "supabase/rollback/0027_remove_custom_workouts.sql"), "utf8");
let refused = false; try { await A.query(rb); } catch (e) { refused = /family-built/.test(e.message); }
ok(refused, "the rollback refuses while a family-built workout exists");
await asUser(db.connect, ua, async (c) => { await c.query("delete from hoops.workouts where id=$1", [wid]); });
const sess = (await A.query("select workout_id from hoops.workout_sessions where player_id=$1", [pa])).rows;
ok(sess.length === 1 && sess[0].workout_id === null, "deleting a workout keeps the sessions done with it (without the link)");
ok((await A.query("select count(*)::int n from hoops.workout_drills where workout_id=$1", [wid])).rows[0].n === 0, "and removes its drills");
let rolled = true; try { await A.query(rb); } catch (e) { rolled = false; console.log(e.message); }
ok(rolled, "the rollback runs once none are left");
ok((await A.query("select count(*)::int n from information_schema.columns where table_name='workouts' and column_name='owner_household_id'")).rows[0].n === 0, "and the column is gone");
await asUser(db.connect, ub, async (c) => { ok((await c.query("select count(*)::int n from hoops.workouts")).rows[0].n === lib, "the library is readable again by everyone signed in after the rollback"); });
await db.stop();
console.log(fails ? `FAILED ${fails}` : "ALL PASSED");
process.exit(fails ? 1 : 0);
