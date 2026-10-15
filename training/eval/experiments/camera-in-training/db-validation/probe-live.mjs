// Read-only check that the app's database queries are accepted by the REAL project's API (PostgREST), without signing in and without writing.
// It uses the public anon key from .env.local (never printed) and random ids, so Row Level Security returns nothing; what it proves is that every
// column, embed and filter the drill code uses exists and parses on the live schema. Needs the libraries transpiled by run.mjs (training/work/p11).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import { ROOT } from "../../../lib/registry.mjs";
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("no Supabase settings in .env.local");
const req = createRequire(path.join(ROOT, "node_modules") + "/");
const { PostgrestClient } = req("@supabase/postgrest-js");
const { supabaseDrillStore } = await import(path.join(ROOT, "training/work/p11/src/lib/basketball/drill-store-supabase.mjs"));
// The same query client supabase-js uses for data; the realtime/auth parts of supabase-js need a newer Node than this Mac has and are not involved here.
const sb = new PostgrestClient(`${url}/rest/v1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, schema: "hoops" });
const id = () => crypto.randomUUID();
const out = [];
const t = async (name, fn) => { try { const r = await fn(); out.push({ name, ok: true, result: r }); console.log(`PASS  ${name}  [${JSON.stringify(r)}]`); } catch (e) { out.push({ name, ok: false, error: e.message }); console.log(`FAIL  ${name}  [${e.message}]`); } };
const store = supabaseDrillStore(sb);
await t("workout_sessions: id, player_id, workout_id, status", async () => await store.workoutSession(id()));
await t("workout_drills with the drills(name, skill_tags) embed", async () => await store.entry(id()));
await t("shot_sessions: ended_at, deleted_at, rule_version, model_version", async () => await store.shotSession(id()));
await t("shots: made, source, detected_made, added_by_hand", async () => (await store.shots(id())).length);
await t("session_logs: id, metrics, created_at filtered by session and workout_drill_id", async () => (await store.logs(id(), id())).length);
const hoops = sb.schema("hoops");
await t("shooting page query: session_logs + inner embed of workout_sessions + metrics->>type filter", async () => {
  const r = await hoops.from("session_logs").select("id, session_id, metrics, drills(name), workout_sessions!inner(player_id, started_at)").eq("workout_sessions.player_id", id()).eq("metrics->>type", "shooting").limit(1000);
  if (r.error) throw new Error(r.error.message); return r.data.length;
});
await t("activity query: session_logs + workout_sessions!inner(player_id)", async () => {
  const r = await hoops.from("session_logs").select("metrics, workout_sessions!inner(player_id)").eq("workout_sessions.player_id", id()).eq("metrics->>type", "shooting");
  if (r.error) throw new Error(r.error.message); return r.data.length;
});
// The writes were NOT executed. To check the columns they use exist (insert: session_id, drill_id, workout_drill_id, metrics; update: metrics), ask for
// each column on its own: the API rejects an unknown column even when row security returns no rows.
const want = { session_logs: ["id", "session_id", "drill_id", "workout_drill_id", "metrics", "created_at"], workout_sessions: ["id", "player_id", "workout_id", "status", "started_at", "completed_at"], shot_sessions: ["id", "player_id", "ended_at", "deleted_at", "rule_version", "model_version", "label", "started_at"], shots: ["session_id", "made", "source", "detected_made", "added_by_hand"], workout_drills: ["id", "workout_id", "drill_id", "variant_label"], drills: ["id", "name", "skill_tags"] };
for (const [tbl, list] of Object.entries(want)) await t(`live schema has the columns ${tbl}(${list.join(", ")})`, async () => { for (const c of list) { const r = await hoops.from(tbl).select(c).limit(1); if (r.error) throw new Error(`${c}: ${r.error.message}`); } return list.length + " columns"; });
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "probe-live.json"), JSON.stringify({ at: new Date().toISOString(), note: "read only, no sign-in, random ids, nothing written", out }, null, 1));
process.exit(out.every((x) => x.ok) ? 0 : 1);
