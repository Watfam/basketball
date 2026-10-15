import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseHistory } from "./consistency.ts";
import { loadHistory, markSessionDeleted, retainSession, usage, type HistoryBackend, type RetainInput } from "./history-core.ts";
import { buildExport, planImport, runImport, sha256Hex, EXPORT_FORMAT } from "./history-transfer.ts";
import type { HistoryMeta, HistorySession, HistoryShot } from "./history-types.ts";
import type { ReviewBox, ReviewRecord } from "./types.ts";

const RIM = { x: 192, y: 190 }, STEP = 1000 / 15;
const arcAt = (f: number) => ({ x: 192 + 2 * f, y: 30 + 0.178 * (f + 30) ** 2 });
const box = (x: number, y: number): ReviewBox => ({ x1: x - 12, y1: y - 12, x2: x + 12, y2: y + 12, score: 0.85, occ: false });
function record(id: string, dx = 0): ReviewRecord { const frames = []; for (let t = -1000; t <= 2000; t += STEP) { const f = (t * 29.97) / 1000, boxes: ReviewBox[] = []; if (f >= -29 && f <= 12) { const p = arcAt(f); boxes.push(box(p.x + dx, p.y)); } frames.push({ t, ran: true, boxes }); } return { v: 1, shotId: id, replayId: id, firstMs: 1000, rim: RIM, scale: 1, frames }; }

function memory(fail: { save?: boolean; list?: boolean } = {}) {
  let meta: unknown = null; const sessions = new Map<string, unknown>(), shots = new Map<string, unknown>();
  const b: HistoryBackend & { sessions: typeof sessions; shots: typeof shots; fail: typeof fail } = {
    sessions, shots, fail,
    async readMeta() { return meta; }, async writeMeta(m: HistoryMeta) { meta = m; },
    async saveSession(s: HistorySession, rows: HistoryShot[]) { if (b.fail.save) throw new Error("IDB unavailable"); sessions.set(s.sessionKey, structuredClone(s)); for (const r of rows) shots.set(r.id, structuredClone(r)); },
    async listSessionsRaw() { if (b.fail.list) throw new Error("IDB unavailable"); return [...sessions.values()]; },
    async listShotsRaw(k?: string) { return [...shots.values()].filter((x) => !k || (x as HistoryShot).sessionKey === k); },
    async deleteSession(k: string) { if (b.fail.save) throw new Error("IDB unavailable"); sessions.delete(k); for (const [id, v] of shots) if ((v as HistoryShot).sessionKey === k) shots.delete(id); },
    async deleteShots(ids: string[]) { for (const id of ids) shots.delete(id); },
    async deleteAll() { meta = null; sessions.clear(); shots.clear(); },
  };
  return b;
}

function input(key: string, n: number, over: Partial<RetainInput> = {}): RetainInput {
  const records = new Map<string, ReviewRecord>(), shots = Array.from({ length: n }, (_, i) => { const id = `${key}-${i}`; records.set(id, record(id, (i % 5) - 2)); return { seq: i + 1, made: i % 2 === 0, detectedMade: i % 2 === 0, flagged: false, tMs: i * 1000, replayId: id }; });
  return { playerId: "p1", sessionKey: `p1:${key}`, sessionId: null, label: key, startedAt: `2026-10-1${key.length}T10:00:00.000Z`, shots, records, framing: { rimX: 0.5, rimY: 0.3, scale: 1, ballWidthPx: 24 }, ...over };
}

const T0 = 1_000_000;
const A = "2026-10-12T10:00:00.000Z", B = "2026-10-13T10:00:00.000Z", C = "2026-10-14T10:00:00.000Z";
const mk = (be: ReturnType<typeof memory>, key: string, n: number, startedAt: string, player = "p1", extra: Partial<RetainInput> = {}) => retainSession(be, input(key, n, { playerId: player, sessionKey: `${player}:${startedAt}`, startedAt, ...extra }), T0);
async function seeded() {
  const be = memory();
  await mk(be, "a", 30, A, "p1", { sessionId: "srv-a", label: "Corner threes" });
  await mk(be, "bb", 12, B, "p1", { sessionId: "srv-b", label: "Free throws" });
  await mk(be, "c", 8, C, "p2");
  return be;
}
const strip = (s: HistoryShot) => { const { savedAt: _a, bytes: _b, id: _i, sessionKey: _k, playerId: _p, ...rest } = s; void _a; void _b; void _i; void _k; void _p; return JSON.parse(JSON.stringify(rest)); /* -0 is stored as 0 in a file */ };

test("sha256 matches the standard test vectors", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
});

test("round trip: what is exported comes back identical (path points, gaps, events, fingerprint, quality, framing), under the importing phone's own ids", async () => {
  const src = await seeded();
  const ex = await buildExport(src, { playerId: "p1" }, T0);
  assert.equal(ex.sessions, 2); assert.equal(ex.shots, 42);
  const dst = memory();
  const plan = await planImport(ex.text, dst, "p9", { onDuplicate: "skip" }, T0 + 5);
  assert.ok(plan.ok); assert.deepEqual(plan.ok && plan.summary, { new: 2, duplicate: 0, replace: 0, damaged: 0, too_big: 0, duplicate_in_file: 0 });
  const res = await runImport(plan, dst); assert.deepEqual(res, { added: 2, replaced: 0, shots: 42, failed: 0 });
  const before = await loadHistory(src, "p1"), after = await loadHistory(dst, "p9");
  assert.equal(after.sessions.length, 2); assert.equal(after.shots.length, 42);
  assert.deepEqual(after.sessions.map((s) => [s.startedAt, s.shots, s.withTracking, s.framing]), before.sessions.map((s) => [s.startedAt, s.shots, s.withTracking, s.framing]));
  const bs = before.shots.map(strip), as = after.shots.map(strip);
  for (let i = 0; i < bs.length; i += 1) for (const k of Object.keys(bs[i]) as (keyof typeof bs[number])[]) assert.deepEqual(as[i][k], bs[i][k], `shot ${i} field ${String(k)}`);
  assert.deepEqual(as, bs, "every shot field except the phone's own ids and save times is identical");
  assert.ok(after.shots.every((s) => s.playerId === "p9" && s.sessionKey.startsWith("p9:") && s.id === `${s.sessionKey}#${s.seq}`));
  assert.ok(after.sessions.every((s) => s.sessionId === null && !s.deletedAt));
  assert.equal(after.damaged + after.newer, 0);
  const an = analyseHistory(after.sessions, after.shots); assert.ok(an.coverage.length >= 1, "analytics run on imported history");
});

test("the file carries no identifiers, no label text by default, no video or pictures", async () => {
  const src = await seeded();
  const ex = await buildExport(src, { playerId: "p1" }, T0);
  for (const bad of ["p1", "p2", "srv-a", "srv-b", "Corner threes", "Free throws", "sessionId", "playerId", "sessionKey", "data:", "blob:"]) assert.ok(!ex.text.includes(bad), `the export must not contain ${bad}`);
  const withLabels = await buildExport(src, { playerId: "p1", includeLabels: true }, T0);
  assert.ok(withLabels.text.includes("Corner threes")); assert.ok(!withLabels.text.includes("srv-a") && !withLabels.text.includes('"p1'));
  const f = JSON.parse(ex.text); assert.equal(f.format, EXPORT_FORMAT); assert.equal(f.includesLabels, false);
  const dst = memory(); const plan = await planImport(withLabels.text, dst, "p1", { onDuplicate: "skip" }, T0); assert.ok(plan.ok && plan.includesLabels);
  await runImport(plan, dst); assert.deepEqual((await loadHistory(dst, "p1")).sessions.map((s) => s.label), ["Corner threes", "Free throws"]);
});

test("export is per player and per chosen session; deleted (hidden) sessions are never exported", async () => {
  const src = await seeded();
  assert.equal((await buildExport(src, { playerId: "p2" }, T0)).sessions, 1);
  assert.equal((await buildExport(src, { playerId: "p1", sessionKeys: [`p1:${B}`] }, T0)).sessions, 1);
  await markSessionDeleted(src, { playerId: "p1", sessionId: "srv-a" }, T0 + 1);
  const ex = await buildExport(src, { playerId: "p1" }, T0 + 2);
  assert.equal(ex.sessions, 1); assert.ok(!ex.text.includes(A), "a session deleted in the app is not in a new export");
});

test("duplicates: a session already on the phone is skipped by default and replaced only when asked; nothing else changes", async () => {
  const src = await seeded(); const file = (await buildExport(src, { playerId: "p1" }, T0)).text;
  const dst = await seeded();
  const snapshot = JSON.stringify([...dst.sessions.values(), ...dst.shots.values()]);
  const skip = await planImport(file, dst, "p1", { onDuplicate: "skip" }, T0 + 9);
  assert.ok(skip.ok && skip.summary.duplicate === 2 && skip.shotsToAdd === 0);
  assert.deepEqual(await runImport(skip, dst), { added: 0, replaced: 0, shots: 0, failed: 0 });
  assert.equal(JSON.stringify([...dst.sessions.values(), ...dst.shots.values()]), snapshot, "skipping duplicates changes nothing at all");
  const rep = await planImport(file, dst, "p1", { onDuplicate: "replace" }, T0 + 9);
  assert.ok(rep.ok && rep.summary.replace === 2);
  assert.deepEqual(await runImport(rep, dst), { added: 0, replaced: 2, shots: 42, failed: 0 });
  const h = await loadHistory(dst, "p1"); assert.equal(h.sessions.length, 2); assert.equal(h.shots.length, 42, "no shot of the old copy is left behind");
  assert.equal((await loadHistory(dst, "p2")).sessions.length, 1, "the other player's session is untouched");
});

test("importing leaves every unrelated saved session exactly as it was", async () => {
  const src = await seeded(); const file = (await buildExport(src, { playerId: "p1", sessionKeys: [`p1:${A}`] }, T0)).text;
  const dst = memory(); await mk(dst, "bb", 12, B, "p1", { label: "Mine" }); await mk(dst, "c", 8, C, "p2");
  const before = JSON.stringify([...dst.sessions.values(), ...dst.shots.values()]);
  const plan = await planImport(file, dst, "p1", { onDuplicate: "skip" }, T0 + 3); assert.ok(plan.ok); await runImport(plan, dst);
  const keep = (o: unknown) => JSON.stringify(o);
  const sessionsAfter = [...dst.sessions.values()].filter((s) => (s as HistorySession).startedAt !== A), shotsAfter = [...dst.shots.values()].filter((s) => (s as HistoryShot).sessionKey !== `p1:${A}`);
  assert.equal(keep([...sessionsAfter, ...shotsAfter]), before);
  assert.equal((await loadHistory(dst, "p1")).sessions.length, 2);
});

test("a corrupted, truncated, altered or foreign file is refused whole, with a plain reason, and nothing is written", async () => {
  const src = await seeded(); const text = (await buildExport(src, { playerId: "p1" }, T0)).text;
  const dst = memory(); const empty = JSON.stringify([...dst.sessions.values(), ...dst.shots.values()]);
  const cases: [string, string, string][] = [
    ["not json", "{this is not json", "not_json"],
    ["truncated", text.slice(0, text.length - 40), "not_json"],
    ["foreign json", JSON.stringify({ hello: "world" }), "wrong_format"],
    ["array", "[1,2,3]", "wrong_format"],
    ["tampered shot", text.replace('"made":true', '"made":false'), "altered"],
    ["tampered checksum", text.replace(/"checksum":"[0-9a-f]{8}/, '"checksum":"00000000'), "altered"],
    ["no sessions", JSON.stringify({ ...JSON.parse(text), sessions: [], counts: { sessions: 0, shots: 0 } }), "altered"],
  ];
  for (const [name, t, reason] of cases) { const p = await planImport(t, dst, "p1", { onDuplicate: "skip" }, T0); assert.ok(!p.ok, name); if (!p.ok) { assert.equal(p.reason, reason, name); assert.ok(p.message.length > 10); } assert.deepEqual(await runImport(p, dst), { added: 0, replaced: 0, shots: 0, failed: 0 }); }
  assert.equal(JSON.stringify([...dst.sessions.values(), ...dst.shots.values()]), empty, "nothing was written by any refused file");
  const newer = JSON.stringify({ ...JSON.parse(text), version: 2 }); const pn = await planImport(newer, dst, "p1", { onDuplicate: "skip" }, T0); assert.ok(!pn.ok && pn.reason === "newer_version");
  const huge = "x".repeat(30_000_001); const ph = await planImport(huge, dst, "p1", { onDuplicate: "skip" }, T0); assert.ok(!ph.ok && ph.reason === "too_big");
});

test("a session whose own record is damaged is skipped and reported; the good sessions in the same file still come in", async () => {
  const src = await seeded();
  const f = JSON.parse((await buildExport(src, { playerId: "p1" }, T0)).text);
  f.sessions[0].shots[3].points = [[1, 2, 3]];                         // wrong point shape
  f.sessions[1].framing = { rimX: 5, rimY: 0.2, scale: 1, ballWidthPx: null }; // impossible framing
  f.sessions.push({ startedAt: "not a date", framing: null, shots: [] });
  const sess = f.sessions as unknown[]; f.sessions = [sess[0], sess[1], sess[2]];
  f.counts = { sessions: 3, shots: 0 }; f.checksum = sha256Hex(JSON.stringify({ sessions: f.sessions, counts: f.counts })); // a valid checksum over bad content: damaged by its maker, not in transit
  const dst = memory(); const plan = await planImport(JSON.stringify(f), dst, "p1", { onDuplicate: "skip" }, T0);
  assert.ok(plan.ok && plan.summary.damaged === 3 && plan.summary.new === 0);
  const g = JSON.parse((await buildExport(src, { playerId: "p1" }, T0)).text); g.sessions[0].shots[0].points = "nope"; g.checksum = sha256Hex(JSON.stringify({ sessions: g.sessions, counts: g.counts }));
  const plan2 = await planImport(JSON.stringify(g), dst, "p1", { onDuplicate: "skip" }, T0);
  assert.ok(plan2.ok && plan2.summary.damaged === 1 && plan2.summary.new === 1);
  assert.deepEqual(await runImport(plan2, dst), { added: 1, replaced: 0, shots: 12, failed: 0 });
  assert.deepEqual((await loadHistory(dst, "p1")).sessions.map((s) => s.startedAt), [B]);
});

test("a file cannot bring in a deleted flag, a server id, another player, extra fields or an image-like value", async () => {
  const src = await seeded(); const f = JSON.parse((await buildExport(src, { playerId: "p1", sessionKeys: [`p1:${B}`] }, T0)).text);
  f.sessions[0].deletedAt = 1; f.sessions[0].sessionId = "srv-evil"; f.sessions[0].playerId = "victim"; f.sessions[0].shots[0].playerId = "victim"; f.sessions[0].shots[0].image = "data:image/png;base64,AAAA";
  f.checksum = sha256Hex(JSON.stringify({ sessions: f.sessions, counts: f.counts }));
  const dst = memory(); const plan = await planImport(JSON.stringify(f), dst, "p1", { onDuplicate: "skip" }, T0); assert.ok(plan.ok); await runImport(plan, dst);
  const h = await loadHistory(dst, "p1"); assert.equal(h.sessions.length, 1, "deletedAt in the file is ignored");
  const raw = JSON.stringify([...dst.sessions.values(), ...dst.shots.values()]);
  assert.ok(!raw.includes("srv-evil") && !raw.includes("victim") && !raw.includes("data:image"));
  const withBlob = JSON.parse(JSON.stringify(f)); withBlob.sessions[0].shots[1].quality.reasons = ["data:image/png;base64,AAAA"]; withBlob.checksum = sha256Hex(JSON.stringify({ sessions: withBlob.sessions, counts: withBlob.counts }));
  const p2 = await planImport(JSON.stringify(withBlob), memory(), "p1", { onDuplicate: "skip" }, T0); assert.ok(p2.ok && p2.summary.damaged === 1, "an image-like string in a shot makes the session damaged");
});

test("limits: a session that would not fit is skipped and reported, never half-imported", async () => {
  const src = memory(); await mk(src, "a", 300, A);
  const text = (await buildExport(src, { playerId: "p1" }, T0)).text;
  const dst = memory(); for (let i = 0; i < 24; i += 1) await mk(dst, `x${i}`, 200, `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`);
  assert.ok((await usage(dst)).shots >= 4800);
  const plan = await planImport(text, dst, "p1", { onDuplicate: "skip" }, T0); assert.ok(plan.ok && plan.summary.too_big === 1);
  const before = (await usage(dst)).shots; await runImport(plan, dst); assert.equal((await usage(dst)).shots, before);
});

test("a read-only store (written by a newer app) refuses import and is not modified; an unreachable store fails cleanly and restores a replaced session", async () => {
  const src = await seeded(); const text = (await buildExport(src, { playerId: "p1" }, T0)).text;
  const newer = memory(); await newer.writeMeta({ schema: 2, createdAt: 1, app: "hardwood-lab" } as HistoryMeta);
  const p = await planImport(text, newer, "p1", { onDuplicate: "skip" }, T0); assert.ok(!p.ok && p.reason === "read_only"); assert.equal(newer.sessions.size, 0);
  const dst = await seeded(); const plan = await planImport(text, dst, "p1", { onDuplicate: "replace" }, T0 + 1); assert.ok(plan.ok);
  const was = JSON.stringify([...dst.sessions.values(), ...dst.shots.values()]);
  const realSave = dst.saveSession.bind(dst); let n = 0;
  dst.saveSession = async (s, rows) => { n += 1; if (n === 1) throw new Error("disk full"); return realSave(s, rows); };   // the first rewrite fails, the second works
  const res = await runImport(plan, dst); assert.equal(res.failed, 1);
  const after = await loadHistory(dst, "p1"); assert.equal(after.sessions.length, 2, "the session whose rewrite failed is back as it was");
  assert.ok(JSON.parse(was).length > 0);
});

test("importing the same file twice is safe; deleting an imported session later still removes its history (matched by start time)", async () => {
  const src = await seeded(); const text = (await buildExport(src, { playerId: "p1" }, T0)).text; const dst = memory();
  for (let i = 0; i < 2; i += 1) { const plan = await planImport(text, dst, "p1", { onDuplicate: "skip" }, T0 + i); assert.ok(plan.ok); await runImport(plan, dst); }
  assert.equal((await loadHistory(dst, "p1")).sessions.length, 2); assert.equal((await loadHistory(dst, "p1")).shots.length, 42);
  const r = await markSessionDeleted(dst, { playerId: "p1", sessionId: "srv-whatever", startedAt: "2026-10-12T10:00:00+00:00" }, T0 + 10); assert.equal(r.matched, 1);
  const h = await loadHistory(dst, "p1"); assert.deepEqual(h.sessions.map((s) => s.startedAt), [B]); assert.ok(h.shots.every((s) => s.sessionKey === `p1:${B}`));
});

test("a session deleted in the app and still inside the undo window can be imported again as a fresh copy without leftovers", async () => {
  const src = await seeded(); const text = (await buildExport(src, { playerId: "p1", sessionKeys: [`p1:${A}`] }, T0)).text;
  await markSessionDeleted(src, { playerId: "p1", sessionId: "srv-a" }, T0 + 1);
  const plan = await planImport(text, src, "p1", { onDuplicate: "skip" }, T0 + 2); assert.ok(plan.ok && plan.summary.new === 1 && plan.summary.duplicate === 0);
  await runImport(plan, src); const h = await loadHistory(src, "p1"); assert.equal(h.sessions.filter((s) => s.startedAt === A).length, 1); assert.equal(h.shots.filter((s) => s.sessionKey === `p1:${A}`).length, 30);
});

test("size and speed at the app's largest realistic history: 250 shots per session across 20 sessions", async () => {
  const src = memory(); for (let i = 0; i < 20; i += 1) await mk(src, `s${i}`, 250, `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`);
  const t0 = Date.now(); const ex = await buildExport(src, { playerId: "p1" }, T0); const tExport = Date.now() - t0;
  const dst = memory(); const t1 = Date.now(); const plan = await planImport(ex.text, dst, "p1", { onDuplicate: "skip" }, T0); assert.ok(plan.ok); const res = await runImport(plan, dst); const tImport = Date.now() - t1;
  assert.equal(res.shots, 5000); assert.ok(ex.bytes < 25_000_000);
  console.log(`export 5000 shots: ${ex.bytes} bytes, ${tExport} ms; import ${tImport} ms`);
});
