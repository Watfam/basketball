// Phase 14: proves supabase/checks/p14_integrity.sql does what it says, on a real Postgres loaded with this repo's schema and seeds.
// It must (a) be silent on clean data, (b) flag a missing 0023 index, and (c) flag each kind of wrong link it claims to find. The live project is never touched.
//   PGTEST_MODULES=<dir>/node_modules node training/eval/experiments/camera-in-training/db-validation/check-p14.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../../lib/registry.mjs";
import { boot } from "./db.mjs";

const sqlText = fs.readFileSync(path.join(ROOT, "supabase/checks/p14_integrity.sql"), "utf8");
const db = await boot({ log: console.log, skipMigrations: [/^0023_/], extraFiles: ["supabase/seed_0024_shooting_benchmarks.sql", "supabase/seed_0025_benchmark_days_in_shot_builder.sql", "supabase/fix_0026_film_links_for_shooting.sql"] });
const A = db.admin;
const q = async (t, a) => (await A.query(t, a)).rows;
const run = async () => Object.fromEntries((await q(sqlText)).map((r) => [r.n, r]));
let fails = 0;
const check = (name, ok, detail = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`); };
const looks = (r) => Object.values(r).filter((x) => x.status === "LOOK").map((x) => Number(x.n));

const U = (await q("insert into auth.users (email) values ('a@t') returning id"))[0].id;
const H = (await q("insert into hoops.households (owner_id, name) values ($1,'H') returning id", [U]))[0].id;
const P1 = (await q("insert into hoops.players (household_id, display_name) values ($1,'P1') returning id", [H]))[0].id;
const P2 = (await q("insert into hoops.players (household_id, display_name) values ($1,'P2') returning id", [H]))[0].id;
const wk = (await q("select id from hoops.workouts where name like 'Shot Builder%Benchmark Check (v1)'"))[0].id;
const entries = await q("select wd.id, d.name, wd.variant_label from hoops.workout_drills wd join hoops.drills d on d.id = wd.drill_id where wd.workout_id = $1 order by wd.sort_order", [wk]);
const ft = entries.find((e) => e.name === "Free Throw Reset");
const ws = (await q("insert into hoops.workout_sessions (player_id, workout_id, status, started_at) values ($1,$2,'in_progress',now()) returning id", [P1, wk]))[0].id;
const shotSet = async (player, makes, attempts) => {
  const id = (await q("insert into hoops.shot_sessions (player_id, label, source, makes, attempts) values ($1,'t','camera',$2,$3) returning id", [player, makes, attempts]))[0].id;
  for (let i = 1; i <= attempts; i++) await A.query("insert into hoops.shots (session_id, player_id, seq, made, source) values ($1,$2,$3,$4,'camera')", [id, player, i, i <= makes]);
  return id;
};
const metrics = (setId, makes, attempts, extra = {}) => ({ type: "shooting", variant: ft.variant_label, makes, attempts, tracking: { v: 1, source: "camera", shot_session_id: setId, adjusted: null }, benchmark: { protocol: "free_throw@v1", conditions: null, conditions_complete: true, clock_complete: null, redo: 0 }, ...extra });
const log = async (sessionId, entryId, drillId, m) => (await q("insert into hoops.session_logs (session_id, drill_id, workout_drill_id, metrics) values ($1,$2,$3,$4) returning id", [sessionId, drillId, entryId, JSON.stringify(m)]))[0].id;
const drillOf = async (entryId) => (await q("select drill_id from hoops.workout_drills where id=$1", [entryId]))[0].drill_id;

console.log("\n== clean data, migration 0023 NOT applied ==");
const goodSet = await shotSet(P1, 22, 30);
await log(ws, ft.id, await drillOf(ft.id), metrics(goodSet, 22, 30));
let r = await run();
check("with no index, only the index check is flagged", JSON.stringify(looks(r)) === "[1]", JSON.stringify(looks(r)));
check("seed checks pass (workout, 3 entries, weeks 1/3/6; found/expected and directly linked lessons shown)", [17, 18, 19].every((n) => r[n].status === "ok"), [17, 18, 19, 20].map((n) => r[n].found).join("/"));
check("info rows count the data", r[3].found == 1 && r[4].found == 1 && r[5].found == 1, `${r[3].found}/${r[4].found}/${r[5].found}`);

console.log("\n== apply 0023 itself, then clean data is fully silent ==");
await A.query(fs.readFileSync(path.join(ROOT, "supabase/migrations/0023_one_log_per_workout_entry.sql"), "utf8"));
r = await run();
check("nothing flagged after 0023", looks(r).length === 0, JSON.stringify(looks(r)));

console.log("\n== each kind of wrong link is caught (each case rolled back) ==");
const other = entries.find((e) => e.name !== ft.name);
async function caught(name, expectNumbers, setup) {
  await A.query("begin");
  try { await setup(); const got = looks(await run()); check(name, JSON.stringify(got) === JSON.stringify(expectNumbers), `flagged ${JSON.stringify(got)}, wanted ${JSON.stringify(expectNumbers)}`); }
  finally { await A.query("rollback"); }
}
await caught("log whose drill is not its entry's drill", [7], async () => { await A.query("update hoops.session_logs set drill_id = $1", [await drillOf(other.id)]); });
await caught("log pointing at an entry of another workout", [8, 16], async () => {
  const w2 = (await q("insert into hoops.workouts (name) values ('Other') returning id"))[0].id;
  const d = await drillOf(ft.id);
  const e2 = (await q("insert into hoops.workout_drills (workout_id, drill_id) values ($1,$2) returning id", [w2, d]))[0].id;
  await A.query("update hoops.session_logs set workout_drill_id = $1", [e2]);
});
await caught("tracked result whose shot set does not exist", [9], async () => { await A.query("update hoops.session_logs set metrics = jsonb_set(metrics, '{tracking,shot_session_id}', '\"00000000-0000-0000-0000-000000000001\"')"); });
await caught("tracked result pointing at another player's shot set", [10], async () => { const s = await shotSet(P2, 22, 30); await A.query("update hoops.session_logs set metrics = jsonb_set(metrics, '{tracking,shot_session_id}', to_jsonb($1::text))", [s]); });
await caught("tracked result whose shot set was deleted", [], async () => { await A.query("update hoops.shot_sessions set deleted_at = now() where id = $1", [goodSet]); });
await caught("uncorrected result that disagrees with its shot set", [12], async () => { await A.query("update hoops.session_logs set metrics = jsonb_set(jsonb_set(metrics, '{makes}', '25'), '{attempts}', '30')"); });
await caught("makes greater than attempts", [12, 13], async () => { await A.query("update hoops.session_logs set metrics = jsonb_set(jsonb_set(metrics, '{makes}', '31'), '{attempts}', '30')"); });
await caught("a shot row that belongs to another player", [14], async () => { await A.query("update hoops.shots set player_id = $1 where session_id = $2 and seq = 1", [P2, goodSet]); });
await caught("shot set totals that disagree with its shot rows", [12, 15], async () => { await A.query("update hoops.shot_sessions set makes = 20 where id = $1", [goodSet]); });
await caught("benchmark result filed under the wrong benchmark entry", [16], async () => { await A.query("update hoops.session_logs set metrics = jsonb_set(metrics, '{benchmark,protocol}', '\"beat_the_clock@v1\"')"); });
await caught("tracked result with no workout entry id", [6, 16], async () => { await A.query("update hoops.session_logs set workout_drill_id = null"); });
await caught("two rows for one entry (index removed to allow it)", [1, 2], async () => {
  await A.query("drop index hoops.session_logs_one_per_entry");
  await log(ws, ft.id, await drillOf(ft.id), metrics(goodSet, 22, 30));
});
await caught("a result for a corrected set keeps the first numbers (adjusted) without a flag", [], async () => {
  await A.query("update hoops.session_logs set metrics = jsonb_set(jsonb_set(jsonb_set(metrics, '{makes}', '25'), '{tracking,adjusted}', '{\"original\":{\"makes\":22,\"attempts\":30}}'), '{attempts}', '30')");
});
await db.stop();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
