import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadRegistry, sha256, ROOT } from "./registry.mjs";

test("the registry names every clip once, with a role and a session", () => {
  const reg = loadRegistry();
  const ids = reg.clips.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of reg.clips) {
    assert.ok(["dev", "validation", "diagnostic_regression"].includes(c.role), c.id);
    assert.ok(reg.sessions[c.session], `${c.id}: unknown session ${c.session}`);
  }
});

test("no session is shared between development and the clips used to judge it", () => {
  const reg = loadRegistry();
  const sessionsOf = (role) => new Set(reg.clips.filter((c) => c.role === role).map((c) => c.session));
  const dev = sessionsOf("dev");
  for (const role of ["validation", "diagnostic_regression"]) for (const s of sessionsOf(role)) assert.ok(!dev.has(s), `${role} shares session ${s} with dev`);
});

test("there is no final test set, and the registry says so", () => {
  const reg = loadRegistry();
  assert.match(reg.roles.final_test, /NONE/);
  assert.ok(!reg.clips.some((c) => c.role === "final_test"));
});

test("the held-out clip is recorded as never trained on, every other labelled clip as trained", () => {
  const reg = loadRegistry();
  assert.equal(reg.clips.find((c) => c.id === "IMG_4874").ball6_training.used, false);
  for (const c of reg.clips.filter((c) => c.truth && c.id !== "IMG_4874")) assert.equal(c.ball6_training.used, true, c.id);
});

test("registered truth counts match the truth files and the hashes are stable", () => {
  const reg = loadRegistry();
  for (const c of reg.clips.filter((c) => c.truth)) {
    const t = JSON.parse(fs.readFileSync(path.join(ROOT, c.truth.file), "utf8")).results;
    assert.equal(t.length, c.truth.shots, c.id);
  }
  const f = path.join(os.tmpdir(), "eval-hash-test.txt");
  fs.writeFileSync(f, "abc");
  assert.equal(sha256(f), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
