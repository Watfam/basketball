import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SAMPLE_PLAYER, importSample, previewSample, removeSample, sampleCounts } from "./sample-replay.ts";
import { analyseHistory } from "./consistency.ts";
import { loadHistory, markSessionDeleted, reconcileHistory, retainSession, usage, type HistoryBackend } from "./history-core.ts";
import { buildExport } from "./history-transfer.ts";
import { memoryBackend } from "./history-memory.ts";
import { syntheticSession } from "./selftest.ts";

const T = 8_000_000;
const snapshot = (b: ReturnType<typeof memoryBackend>) => JSON.stringify([[...b.sessions.entries()].sort(), [...b.shots.entries()].sort()]);
const rows = (b: ReturnType<typeof memoryBackend>, keep: (player: string) => boolean) => JSON.stringify([[...b.sessions.entries()].filter(([, v]) => keep((v as { playerId: string }).playerId)).sort(), [...b.shots.entries()].filter(([, v]) => keep((v as { playerId: string }).playerId)).sort()]);

/** A phone with a real player's history, and a sample file whose sets start at THE SAME INSTANTS as that player's saved sets (the worst case). */
async function world() {
  const phone = memoryBackend();
  const a = syntheticSession(40, "a", 1), b = syntheticSession(25, "b", 2);
  await retainSession(phone, { ...a, playerId: "kid1", sessionKey: `kid1:${a.startedAt}`, sessionId: "srv-a", label: "Mine" }, T);
  await retainSession(phone, { ...b, playerId: "kid1", sessionKey: `kid1:${b.startedAt}`, sessionId: "srv-b" }, T);
  await retainSession(phone, { ...syntheticSession(10, "z", 9), playerId: "kid2", sessionKey: "kid2:z" }, T);
  const mac = memoryBackend();
  for (const [s, k] of [[a, 1], [b, 2], [syntheticSession(30, "c", 3), 3]] as const) await retainSession(mac, { ...s, playerId: "x", sessionKey: `x:${s.startedAt}`, label: `clip ${k}` }, T);
  const file = (await buildExport(mac, { playerId: "x" }, T)).text;
  return { phone, file };
}

test("importing the sample leaves every existing row byte-identical, puts the sample under its own player, and is a no-op the second time", async () => {
  const { phone, file } = await world();
  const before = snapshot(phone), realBefore = rows(phone, (p) => p !== SAMPLE_PLAYER);
  const prev = await previewSample(file, phone, T + 1); assert.ok(prev.ok && prev.summary.new === 3 && prev.summary.duplicate === 0, "the sample's sets are new even though two start at the same instants as the player's");
  assert.equal(snapshot(phone), before, "previewing writes nothing");
  const r = await importSample(file, phone, T + 2); assert.deepEqual(r, { ok: true, added: 3, shots: 95, skipped: 0 });
  assert.equal(rows(phone, (p) => p !== SAMPLE_PLAYER), realBefore, "every row that existed before is byte-identical after");
  assert.deepEqual(await sampleCounts(phone), { sessions: 3, shots: 95 });
  assert.equal((await loadHistory(phone, "kid1")).sessions.length, 2); assert.equal((await loadHistory(phone, "kid1")).shots.length, 65);
  const afterFirst = snapshot(phone);
  const again = await importSample(file, phone, T + 3); assert.deepEqual(again, { ok: true, added: 0, shots: 0, skipped: 3 });
  assert.equal(snapshot(phone), afterFirst, "importing it again changes nothing");
});

test("the sample never reaches a real player's lists, patterns or exports, and a real deletion cannot touch it", async () => {
  const { phone, file } = await world(); await importSample(file, phone, T + 1);
  const mine = await loadHistory(phone, "kid1");
  assert.ok(mine.sessions.every((s) => s.playerId === "kid1") && mine.shots.every((s) => s.playerId === "kid1"));
  const an = analyseHistory(mine.sessions, mine.shots); assert.ok(an.coverage.every((c) => mine.sessions.some((s) => s.sessionKey === c.sessionKey)), "patterns only see the player's own sets");
  const ex = JSON.parse((await buildExport(phone, { playerId: "kid1" }, T + 2)).text); assert.equal(ex.counts.sessions, 2);
  const startOfSample = (await loadHistory(phone, SAMPLE_PLAYER)).sessions[2].startedAt;
  await markSessionDeleted(phone, { playerId: "kid1", sessionId: "srv-nothing", startedAt: startOfSample }, T + 3);
  await reconcileHistory(phone, T + 3 + 10 * 60_000);
  assert.deepEqual(await sampleCounts(phone), { sessions: 3, shots: 95 }, "deleting a real session by time never matches the sample");
});

test("removing the sample deletes only the sample: the store is then identical to how it was before the import", async () => {
  const { phone, file } = await world(); const before = snapshot(phone), u0 = await usage(phone);
  await importSample(file, phone, T + 1);
  assert.equal(await removeSample(phone), 3);
  assert.equal(snapshot(phone).replace(/"meta":.*/, ""), before.replace(/"meta":.*/, ""), "same sessions and shots, byte for byte");
  assert.deepEqual(await usage(phone), u0); assert.equal(await removeSample(phone), 0, "removing twice is safe");
});

test("a bad or newer file is refused with a plain message and nothing is written", async () => {
  const { phone, file } = await world(); const before = snapshot(phone);
  for (const bad of ["{x", JSON.stringify({ a: 1 }), file.replace('"made":true', '"made":false')]) { const r = await importSample(bad, phone, T); assert.equal(r.ok, false); assert.ok(!r.ok && r.message.length > 10); }
  assert.equal(snapshot(phone), before);
});

test("the REAL sample file made from existing recordings imports the same way (skipped if the file is not on this machine)", async (t) => {
  const f = path.join(import.meta.dirname, "../../../training/work/phone-replay/hardwood-lab-replay-sample.json");
  if (!fs.existsSync(f)) return t.skip("the sample file is git-ignored and is not on this machine");
  const text = fs.readFileSync(f, "utf8"), phone = memoryBackend() as ReturnType<typeof memoryBackend> & HistoryBackend;
  const real = syntheticSession(30, "mine", 4); await retainSession(phone, { ...real, playerId: "kid1", sessionKey: `kid1:${real.startedAt}` }, T);
  const before = snapshot(phone);
  const r = await importSample(text, phone, T + 1); assert.ok(r.ok && r.added === 8 && r.shots === 168, JSON.stringify(r));
  assert.equal(rows(phone, (p) => p !== SAMPLE_PLAYER), JSON.stringify([[...phone.sessions.entries()].filter(([, v]) => (v as { playerId: string }).playerId === "kid1").sort(), [...phone.shots.entries()].filter(([, v]) => (v as { playerId: string }).playerId === "kid1").sort()]));
  assert.equal(await removeSample(phone), 8); assert.equal(snapshot(phone), before);
  assert.ok(!/kid1|IMG_|data:|blob:/.test(text.replace(/"sessionKey"[^,]*,/g, "")), "the file carries no player ids, clip names or images");
});
