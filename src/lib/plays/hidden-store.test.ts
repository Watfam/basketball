import test from "node:test";
import assert from "node:assert/strict";
import { getTeamHidden, hidePlays, restorePlays, NOT_READY } from "./hidden-store.ts";

type Call = { table: string; op: string; args: unknown[] };

function fakeDb(opts: { rows?: string[]; error?: string } = {}) {
  const calls: Call[] = [];
  const result = { error: opts.error ? { message: opts.error } : null };
  const db = {
    from: (table: string) => ({
      select: () => ({ eq: () => Promise.resolve({ data: (opts.rows ?? []).map((library_play_id) => ({ library_play_id })) }) }),
      upsert: (...args: unknown[]) => {
        calls.push({ table, op: "upsert", args });
        return Promise.resolve(result);
      },
      delete: () => ({
        eq: () => ({
          in: (...args: unknown[]) => {
            calls.push({ table, op: "delete", args });
            return Promise.resolve(result);
          },
        }),
      }),
    }),
  };
  return { db, calls };
}

test("getTeamHidden returns the library ids", async () => {
  const { db } = fakeDb({ rows: ["a", "b"] });
  assert.deepEqual(await getTeamHidden(db, "t1"), ["a", "b"]);
});

test("hidePlays upserts one row per unique id", async () => {
  const { db, calls } = fakeDb();
  const res = await hidePlays(db, "t1", ["a", "b", "a", ""]);
  assert.equal(res.error, null);
  assert.deepEqual(calls[0].args[0], [
    { team_id: "t1", library_play_id: "a" },
    { team_id: "t1", library_play_id: "b" },
  ]);
});

test("hide and restore refuse an empty selection without touching the database", async () => {
  const { db, calls } = fakeDb();
  assert.ok((await hidePlays(db, "t1", [])).error);
  assert.ok((await restorePlays(db, "t1", [""])).error);
  assert.equal(calls.length, 0);
});

test("restorePlays deletes only the chosen ids", async () => {
  const { db, calls } = fakeDb();
  await restorePlays(db, "t1", ["a", "b"]);
  assert.deepEqual(calls[0].args, ["library_play_id", ["a", "b"]]);
});

test("a missing table or blocked write becomes the friendly migration message", async () => {
  const missing = fakeDb({ error: 'relation "hoops.team_hidden_plays" does not exist' });
  assert.equal((await hidePlays(missing.db, "t1", ["a"])).error, NOT_READY);
  const blocked = fakeDb({ error: "new row violates row-level security policy" });
  assert.equal((await restorePlays(blocked.db, "t1", ["a"])).error, NOT_READY);
});
