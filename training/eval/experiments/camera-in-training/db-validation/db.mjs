// A real Postgres (embedded-postgres, same engine Supabase runs) loaded with this repo's own schema, migrations, seeds and Row Level Security policies.
// Only the Supabase pieces that live outside this repo are stubbed: the auth schema (auth.users, auth.uid(), auth.role()) and the three API roles.
// Nothing here talks to the live project. Install once: `cd <any temp dir> && npm i embedded-postgres pg`, then set PGTEST_MODULES to that node_modules path.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../../lib/registry.mjs";

const modules = process.env.PGTEST_MODULES ?? path.join(ROOT, "node_modules");
const req = createRequire(modules + "/");
const EmbeddedPostgres = (await import(pathToFileURL(req.resolve("embedded-postgres")).href)).default;
const pgLib = req("pg");

const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')) $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
`;

export const files = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".sql")).sort();

export async function boot({ port = 54330, dataDir, seeds = true, log = () => {} } = {}) {
  const dir = dataDir ?? fs.mkdtempSync("/private/tmp/hl-pg-");
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase("hl");
  const connect = async () => { const c = new pgLib.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "hl" }); await c.connect(); return c; };
  const admin = await connect();
  await admin.query(AUTH_STUB);
  const applied = [];
  const run = async (rel) => { await admin.query(fs.readFileSync(path.join(ROOT, rel), "utf8")); applied.push(rel); };
  await run("supabase/schema.sql");
  for (const f of files("supabase/migrations")) await run(`supabase/migrations/${f}`);
  if (seeds) for (const f of ["seed_content.sql", "seed_0003_depth_and_handle_program.sql", "seed_0005_film_room.sql", "seed_0006_pro_film.sql", "seed_0008_film_links_and_sessions.sql", "seed_0011_combine_drills.sql", "seed_0013_combine_bands.sql", "seed_0014_hennen_and_remove_tiktok.sql", "seed_program_shot_builder.sql"]) { try { await run(`supabase/${f}`); } catch (e) { log(`seed ${f} failed: ${e.message}`); applied.push(`${f} FAILED: ${e.message}`); } }
  return { pg, connect, admin, applied, port, stop: async () => { await admin.end(); await pg.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** Run fn in one transaction as the signed-in user (a Supabase JWT in effect: role authenticated, sub = user id), or as anon when userId is null. */
export async function asUser(connect, userId, fn) {
  const c = await connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" })]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { await c.end(); }
}
