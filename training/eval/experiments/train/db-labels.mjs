// Taking a drill name off the list (src/lib/basketball/shot-label-store.ts, the file the app runs) against a real Postgres with this repo's schema and RLS. The live project is never touched.
//   PGTEST_MODULES=<dir>/node_modules node training/eval/experiments/train/db-labels.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import { ROOT } from "../../lib/registry.mjs";
import { boot } from "../camera-in-training/db-validation/db.mjs";
import { clientFor } from "../camera-in-training/db-validation/shim.mjs";
const OUT = path.join(ROOT, "training/work/train-labels");
fs.rmSync(OUT, { recursive: true, force: true });
for (const f of ["src/lib/basketball/shot-label-store.ts", "src/lib/basketball/custom-workouts-store.ts"]) {
  const dest = path.join(OUT, f.replace(/\.ts$/, ".mjs"));
  const js = ts.transpileModule(fs.readFileSync(path.join(ROOT, f), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"');
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, js);
}
const { clearLabel } = await import(path.join(OUT, "src/lib/basketball/shot-label-store.mjs"));
let fails = 0; const ok = (c, m, d = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${m}${d ? "  [" + d + "]" : ""}`); if (!c) fails++; };
const uuid = () => crypto.randomUUID();
const db = await boot({ port: 54334, log: () => {} });
const ua = uuid(), ub = uuid(), ha = uuid(), hb = uuid(), pa1 = uuid(), pa2 = uuid(), pb = uuid();
await db.admin.query("insert into auth.users(id,email) values ($1,'a@x'),($2,'b@x')", [ua, ub]);
await db.admin.query("insert into hoops.households(id,owner_id,name) values ($1,$2,'A'),($3,$4,'B')", [ha, ua, hb, ub]);
await db.admin.query("insert into hoops.players(id,household_id,display_name) values ($1,$2,'P1'),($3,$2,'P2'),($4,$5,'PB')", [pa1, ha, pa2, pb, hb]);
const mk = async (player, label, makes = 3) => (await db.admin.query("insert into hoops.shot_sessions(player_id,label,started_at,ended_at,makes,attempts) values ($1,$2,now(),now(),$3,5) returning id", [player, label, makes])).rows[0].id;
const r1 = await mk(pa1, "Random"), r2 = await mk(pa1, " Random "), f1 = await mk(pa1, "Free throws"), n1 = await mk(pa1, null), r3 = await mk(pa2, "Random"), rb = await mk(pb, "Random");
const labelOf = async (id) => (await db.admin.query("select label from hoops.shot_sessions where id=$1", [id])).rows[0].label;
const A = clientFor(db, ua), B = clientFor(db, ub);
const res = await clearLabel(A, pa1, "Random");
ok(!res.error && res.changed === 2, "the player's sets with that name lose it (trimmed match)", `${res.changed}`);
ok((await labelOf(r1)) === null && (await labelOf(r2)) === null, "they become sets with no name");
ok((await labelOf(f1)) === "Free throws" && (await labelOf(n1)) === null, "other names are untouched");
ok((await labelOf(r3)) === "Random", "another player in the family keeps their own");
ok((await db.admin.query("select count(*)::int n, sum(makes)::int m from hoops.shot_sessions where player_id=$1", [pa1])).rows[0].n === 4, "no set is deleted");
ok((await labelOf(f1)) === "Free throws", "another family cannot rename this player's sets");
ok((await labelOf(rb)) === "Random", "and its own are separate");
ok((await clearLabel(A, pa1, "  ")).error !== null, "an empty name is refused");
await db.stop();
console.log(fails ? `FAILED ${fails}` : "ALL PASSED"); process.exit(fails ? 1 : 0);
