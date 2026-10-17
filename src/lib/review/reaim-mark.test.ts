import { test } from "node:test";
import assert from "node:assert/strict";
import { nextReaim, parseReaim, reaimedSince } from "./reaim-mark.ts";

test("a re-aim during a set marks that set, and only that set", () => {
  const start = Date.parse("2026-10-20T10:00:00Z");
  const raw = nextReaim(null, start, start + 600_000);
  assert.deepEqual(parseReaim(raw), { n: 1, at: start + 600_000 });
  assert.equal(reaimedSince(raw, "2026-10-20T10:00:00Z"), true);
  assert.equal(reaimedSince(raw, "2026-10-20T11:00:00Z"), false, "a later set is not marked by an earlier set's re-aim");
  assert.equal(parseReaim(nextReaim(raw, start, start + 900_000))!.n, 2, "a second re-aim in the same set counts");
  assert.equal(parseReaim(nextReaim(raw, start + 700_000, start + 900_000))!.n, 1, "a note from an earlier set starts again at one");
});

test("anything unreadable means no re-aim", () => {
  for (const raw of [null, undefined, "", "nope", "{}", '{"n":0,"at":1}', '{"n":"x","at":1}']) assert.equal(parseReaim(raw as string), null);
  assert.equal(reaimedSince(null, "2026-10-20T10:00:00Z"), false);
  assert.equal(reaimedSince(nextReaim(null, null, 5), "not a date"), false);
});
